"""
Der Einspieler prüft die Datei, bevor er schreibt.

Getestet wird die Prüfung, nicht Django: ein unbekannter Status oder eine
fehlende Adresse muss **vor** dem ersten Schreibvorgang auffallen — sonst steht
die halbe Datei in der Datenbank, wenn die Meldung kommt.
"""

import json

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError

from socos import berechtigung
from socos.models import Arbeitspaket, Bereich, Nutzer, Projekt


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
            "bereiche": [
                {
                    "titel": "Entwicklung",
                    "art": "dev",
                    "pakete": [
                        {"titel": "Erstes Paket", "status": "laeuft", "notiz": "Notiz"},
                        {"titel": "Zweites Paket", "status": "offen", "notiz": ""},
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
    bereich = Bereich.objects.get(projekt=projekt)
    # Die Stufen kommen aus der Vorlage der Bereichsart, nicht aus der Datei —
    # und sie hängen am Paket, nicht am Bereich.
    assert all(p.stufen for p in Arbeitspaket.objects.filter(bereich=bereich))
    assert list(
        Arbeitspaket.objects.filter(bereich=bereich).values_list("titel", "status")
    ) == [("Erstes Paket", "laeuft"), ("Zweites Paket", "offen")]


def test_unbekannter_status_schreibt_nichts(tmp_path):
    daten = json.loads(json.dumps(GUELTIG))
    daten["projekte"][0]["bereiche"][0]["pakete"][1]["status"] = "pausiert"

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
