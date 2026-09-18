"""
Der Einspieler prüft die Datei, bevor er schreibt.

Getestet wird die Prüfung, nicht Django: ein unbekannter Status oder eine
fehlende Adresse muss **vor** dem ersten Schreibvorgang auffallen — sonst steht
die halbe Datei in der Datenbank, wenn die Meldung kommt.
"""

import json
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from socos import berechtigung
from socos.models import (
    Arbeitspaket,
    Nutzer,
    Pensum,
    Projekt,
    Projektphase,
    Zeitbuchung,
)


@pytest.fixture(autouse=True)
def rollen(db):
    for name in berechtigung.ALLE_ROLLEN:
        Group.objects.get_or_create(name=name)


GUELTIG = {
    "team": [
        {
            "name": "Test Person",
            "initialen": "TP",
            "farbe": "#BFD9CE",
            "email": "person@example.invalid",
            "rolle": "bearbeiter",
        }
    ],
    "projekte": [
        {
            "titel": "Ein Projekt",
            "untertitel": "Untertitel",
            "farbe": "#14595F",
            "gebucht": "34:20",
            "phasen": [
                {
                    "titel": "Entwicklung",
                    "art": "dev",
                    "pakete": [
                        {"titel": "Erstes Paket", "status": "laeuft", "beschreibung": "Ein Absatz"},
                        {"titel": "Zweites Paket", "status": "offen", "beschreibung": ""},
                    ],
                }
            ],
        }
    ],
    "sonstiges": {"standort": [{"punkt": "Graz", "stand": "offen"}]},
}


def _datei(tmp_path, daten):
    pfad = tmp_path / "daten.json"
    pfad.write_text(json.dumps(daten), encoding="utf-8")
    return str(pfad)


def test_spielt_team_und_projekte_ein(tmp_path):
    call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG))

    nutzer = Nutzer.objects.get(email="person@example.invalid")
    assert nutzer.initialen == "TP"
    assert berechtigung.rolle(nutzer) == berechtigung.BEARBEITER
    # Ohne Passwort angelegt: das Konto ist Anzeigedatum, noch kein Zugang.
    assert not nutzer.has_usable_password()

    projekt = Projekt.objects.get(titel="Ein Projekt")
    assert projekt.untertitel == "Untertitel"
    phase = Projektphase.objects.get(projekt=projekt)
    # Die Stufen kommen aus der Vorlage der Phasenart, nicht aus der Datei —
    # und sie hängen am Paket, nicht am Projektphase.
    assert all(p.stufen for p in Arbeitspaket.objects.filter(phase=phase))
    assert list(
        Arbeitspaket.objects.filter(phase=phase).values_list("titel", "status")
    ) == [("Erstes Paket", "laeuft"), ("Zweites Paket", "offen")]


def test_unbekannter_status_schreibt_nichts(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    daten["projekte"][0]["phasen"][0]["pakete"][1]["status"] = "pausiert"

    with pytest.raises(CommandError, match="pausiert"):
        call_command("daten_einspielen", datei=_datei(tmp_path, daten))

    assert not Projekt.alle_objekte.exists()
    assert not Nutzer.objects.filter(email="person@example.invalid").exists()


def test_fehlende_adresse_schreibt_nichts(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    del daten["team"][0]["email"]

    with pytest.raises(CommandError, match="E-Mail"):
        call_command("daten_einspielen", datei=_datei(tmp_path, daten))

    assert not Projekt.alle_objekte.exists()


def test_vermischt_keinen_bestand(tmp_path):
    Projekt.objects.create(titel="Schon da")

    with pytest.raises(CommandError, match="schon Projekte"):
        call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG))

    assert Projekt.alle_objekte.count() == 1


def test_bestehendes_konto_bleibt_unveraendert(tmp_path):
    vorher = Nutzer.objects.create_user(
        email="person@example.invalid", name="Anders Geschrieben", farbe="#000000"
    )

    call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG))

    vorher.refresh_from_db()
    assert vorher.name == "Anders Geschrieben"
    assert vorher.farbe == "#000000"


# --- Abgleichen -------------------------------------------------------------
#
# Der zweite Betriebsfall: Die Struktur steht schon, samt gebuchter Zeit, und
# die Datei ist weitergezogen. Hier darf nichts verschwinden, was jemand nicht
# ausdrücklich weggenommen hat — und was verschwindet, muss gesagt werden.


def _mit_pensen(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    phase = daten["projekte"][0]["phasen"][0]
    phase["von"] = "2026-10-01"
    phase["bis"] = "2027-02-28"
    phase["pakete"][0]["pensen"] = {"TP": "270.50"}
    return daten


@pytest.mark.django_db
def test_ohne_abgleichen_wird_ein_bestand_nicht_angefasst(tmp_path):
    Projekt.objects.create(titel="Steht schon da")
    with pytest.raises(CommandError, match="schon Projekte"):
        call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG), verbosity=0)
    assert Projekt.objects.count() == 1


@pytest.mark.django_db
def test_abgleichen_zieht_laufzeit_beschreibung_und_pensen_nach(tmp_path):
    call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG), verbosity=0)

    call_command(
        "daten_einspielen", datei=_datei(tmp_path, _mit_pensen(tmp_path)),
        abgleichen=True, verbosity=0,
    )

    phase = Projektphase.objects.get(titel="Entwicklung")
    assert phase.von == date(2026, 10, 1)
    assert phase.bis == date(2027, 2, 28)
    # Und **kein** zweites Projekt daneben: wiedererkannt wird am Titel.
    assert Projekt.objects.count() == 1
    assert Projektphase.objects.count() == 1

    pensum = Pensum.objects.get(paket__titel="Erstes Paket")
    assert pensum.stunden == Decimal("270.50")
    assert pensum.person.initialen == "TP"


@pytest.mark.django_db
def test_abgleichen_nimmt_ein_pensum_wieder_weg(tmp_path):
    """Was aus der Datei verschwindet, verschwindet aus der Datenbank. Sonst
    stünde bei jemandem eine Stundenzahl, die im Arbeitsplan nicht mehr
    vorkommt — und niemand käme auf die Idee, danach zu suchen."""
    call_command(
        "daten_einspielen", datei=_datei(tmp_path, _mit_pensen(tmp_path)), verbosity=0
    )
    assert Pensum.objects.count() == 1

    call_command(
        "daten_einspielen", datei=_datei(tmp_path, GUELTIG), abgleichen=True, verbosity=0
    )
    assert Pensum.objects.count() == 0


@pytest.mark.django_db
def test_abgleichen_entfernt_ein_paket_das_nicht_mehr_in_der_datei_steht(tmp_path):
    call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG), verbosity=0)

    ohne = json.loads(json.dumps(GUELTIG))
    ohne["projekte"][0]["phasen"][0]["pakete"].pop()
    call_command("daten_einspielen", datei=_datei(tmp_path, ohne), abgleichen=True, verbosity=0)

    assert Arbeitspaket.objects.filter(titel="Zweites Paket").count() == 0
    assert Arbeitspaket.alle_objekte.get(titel="Zweites Paket").ist_geloescht


@pytest.mark.django_db
def test_ein_paket_mit_gebuchter_zeit_wird_verworfen_statt_geloescht(tmp_path):
    """
    Der Fall, an dem ein naiver Abgleich Zeit vernichtet.

    `on_delete=PROTECT` steht zwischen Buchung und Paket. Das Paket zu löschen
    machte die Buchungen zu Waisen — in keiner Liste mehr sichtbar, aber weiter
    im Zeitnachweis. Also bleibt es stehen, nimmt aber keine neue Zeit mehr an.
    """
    call_command("daten_einspielen", datei=_datei(tmp_path, GUELTIG), verbosity=0)
    paket = Arbeitspaket.objects.get(titel="Zweites Paket")
    person = Nutzer.objects.get(initialen="TP")
    Zeitbuchung.objects.create(
        person=person,
        paket=paket,
        start=timezone.now() - timedelta(hours=2),
        ende=timezone.now() - timedelta(hours=1),
    )

    ohne = json.loads(json.dumps(GUELTIG))
    ohne["projekte"][0]["phasen"][0]["pakete"].pop()
    call_command("daten_einspielen", datei=_datei(tmp_path, ohne), abgleichen=True, verbosity=0)

    paket.refresh_from_db()
    assert not paket.ist_geloescht
    assert paket.status == "verworfen"
    assert paket.grund_gegen_buchung() is not None
    assert Zeitbuchung.objects.filter(paket=paket).count() == 1


@pytest.mark.django_db
def test_eine_abgeschlossene_phase_kommt_aus_der_datei(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    daten["projekte"][0]["phasen"][0]["abgeschlossen"] = True
    call_command("daten_einspielen", datei=_datei(tmp_path, daten), verbosity=0)

    assert Projektphase.objects.get(titel="Entwicklung").abgeschlossen
    # Und damit nimmt kein Paket darin mehr Zeit an.
    paket = Arbeitspaket.objects.get(titel="Erstes Paket")
    assert "abgeschlossen" in paket.grund_gegen_buchung()


@pytest.mark.django_db
def test_unbekannte_initialen_fallen_vor_dem_schreiben_auf(tmp_path):
    """Ein Tippfehler in den Initialen legte sonst kein Pensum an — und das
    Paket stünde auf null Stunden, ohne dass irgendwo etwas fehlt."""
    daten = _mit_pensen(tmp_path)
    daten["projekte"][0]["phasen"][0]["pakete"][0]["pensen"] = {"XY": "40"}
    with pytest.raises(CommandError, match="XY"):
        call_command("daten_einspielen", datei=_datei(tmp_path, daten), verbosity=0)
    assert Projekt.objects.count() == 0


@pytest.mark.django_db
def test_stunden_unter_null_werden_abgewiesen(tmp_path):
    daten = _mit_pensen(tmp_path)
    daten["projekte"][0]["phasen"][0]["pakete"][0]["pensen"] = {"TP": "-5"}
    with pytest.raises(CommandError, match="stunden"):
        call_command("daten_einspielen", datei=_datei(tmp_path, daten), verbosity=0)


@pytest.mark.django_db
def test_ein_krummes_datum_faellt_vor_dem_schreiben_auf(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    daten["projekte"][0]["phasen"][0]["von"] = "01.10.2026"
    with pytest.raises(CommandError, match="JJJJ-MM-TT"):
        call_command("daten_einspielen", datei=_datei(tmp_path, daten), verbosity=0)
    assert Projekt.objects.count() == 0
