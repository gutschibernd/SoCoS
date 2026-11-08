"""
Die Seite hinter dem Diamanten: Ohne den richtigen PIN kommt kein Betrag über
die Leitung. Die Beträge hier sind erfunden — die echten stehen nicht im
Repository, sondern in daten/bisher.json (socos/bisher.py).
"""

import io
import json
from decimal import Decimal

import pytest
from django.core.management import CommandError, call_command

from socos import bisher
from socos.models import Eingang, Protokolleintrag


def _datei(tmp_path, posten):
    pfad = tmp_path / "bisher.json"
    pfad.write_text(json.dumps({"posten": posten}), encoding="utf-8")
    return str(pfad)


@pytest.fixture
def eingespielt(tmp_path):
    call_command(
        "bisher_einspielen",
        datei=_datei(tmp_path, [{"von": "Geber A", "wofuer": "Gehälter", "betrag": "0.10"}, {"von": "Geber B", "betrag": "0.20"}]),
        stdout=io.StringIO(),
    )


def _post(client, pin):
    return client.post("/api/bisher/", {"pin": pin}, content_type="application/json")


# --- Die Schnittstelle -------------------------------------------------------


def test_ohne_anmeldung_nichts(client, eingespielt):
    assert _post(client, bisher.PIN).status_code == 403


def test_falscher_pin_ist_eine_400_ohne_betraege(client, admin_nutzer, eingespielt):
    client.force_login(admin_nutzer)
    for falsch in ("", "0000", bisher.PIN + "0", None):
        antwort = _post(client, falsch)
        assert antwort.status_code == 400
        assert "posten" not in antwort.json()


def test_richtiger_pin_gibt_die_aufstellung_als_zeichenketten(client, admin_nutzer, eingespielt):
    client.force_login(admin_nutzer)
    antwort = _post(client, f" {bisher.PIN} ")
    assert antwort.status_code == 200
    daten = antwort.json()
    assert [p["betrag"] for p in daten["posten"]] == ["0.10", "0.20"]
    assert daten["posten"][1]["wofuer"] == ""
    # Decimal, nicht Gleitkomma: 0.1 + 0.2 ist hier 0.3.
    assert daten["summe"] == "0.30"


def test_get_geht_nicht(client, admin_nutzer, eingespielt):
    # Ein PIN in der Adresse stünde im Zugriffsprotokoll.
    client.force_login(admin_nutzer)
    assert client.get(f"/api/bisher/?pin={bisher.PIN}").status_code == 405


def test_die_protokollseite_zeigt_die_eingaenge_nicht(client, admin_nutzer, eingespielt):
    # Geschrieben wird das Protokoll trotzdem — gezeigt nicht.
    assert Protokolleintrag.objects.filter(modell="socos.Eingang").exists()
    client.force_login(admin_nutzer)
    eintraege = client.get("/api/protokoll/").json()
    eintraege = eintraege.get("results", eintraege) if isinstance(eintraege, dict) else eintraege
    assert not [e for e in eintraege if e["modell"] == "socos.Eingang"]


# --- Das Einspielen ----------------------------------------------------------


def test_zweimal_einspielen_aendert_nichts(tmp_path, eingespielt):
    vorher = Protokolleintrag.objects.count()
    call_command(
        "bisher_einspielen",
        datei=_datei(tmp_path, [{"von": "Geber A", "wofuer": "Gehälter", "betrag": "0.10"}, {"von": "Geber B", "betrag": "0.20"}]),
        stdout=io.StringIO(),
    )
    assert Eingang.objects.count() == 2
    assert Protokolleintrag.objects.count() == vorher


def test_geaendert_neu_und_weggefallen(tmp_path, eingespielt):
    """Zwei Zeilen werden eine — wie die zwei Zahlungen des Patent.Schecks."""
    call_command(
        "bisher_einspielen",
        datei=_datei(tmp_path, [{"von": "Geber A", "wofuer": "zusammen", "betrag": "0.30"}]),
        stdout=io.StringIO(),
    )
    assert [(e.von, e.betrag) for e in Eingang.objects.all()] == [("Geber A", Decimal("0.30"))]
    # Weich entfernt, nicht hart: Die zweite Zeile ist noch da.
    assert Eingang.alle_objekte.count() == 2
    geaendert = Protokolleintrag.objects.filter(modell="socos.Eingang", aktion="geaendert").first()
    assert geaendert is not None


@pytest.mark.parametrize(
    "posten, grund",
    [
        ([], "kein einziger Posten"),
        ([{"von": "", "betrag": "1.00"}], "„von“ fehlt"),
        ([{"von": "A", "betrag": 1.0}], "Zeichenkette"),
        ([{"von": "A", "betrag": "eins"}], "kein Betrag"),
    ],
)
def test_eine_schlechte_datei_schreibt_nichts(tmp_path, eingespielt, posten, grund):
    with pytest.raises(CommandError, match=grund):
        call_command("bisher_einspielen", datei=_datei(tmp_path, posten), stdout=io.StringIO())
    assert Eingang.objects.count() == 2


def test_von_stdin(monkeypatch):
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({"posten": [{"von": "A", "betrag": "5"}]})))
    call_command("bisher_einspielen", datei="-", stdout=io.StringIO())
    assert Eingang.objects.get().betrag == Decimal("5.00")

