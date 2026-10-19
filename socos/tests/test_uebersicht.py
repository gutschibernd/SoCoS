"""
Die Übersicht: der Vorschlag aus der eigenen Nutzung, und was gespeichert
werden darf.
"""

import json
from datetime import timedelta

import pytest
from django.utils import timezone

from socos.models import Protokolleintrag
from socos.services import uebersicht


def _geschrieben(nutzer, modell, anzahl, vor_tagen=1):
    zeitpunkt = timezone.now() - timedelta(days=vor_tagen)
    for i in range(anzahl):
        Protokolleintrag.objects.create(
            nutzer=nutzer, modell=modell, objekt_id=str(i), aktion="geaendert", zeitpunkt=zeitpunkt
        )


def _schluessel(liste):
    return [e["baustein"] for e in liste]


# --- Der Vorschlag ----------------------------------------------------------


@pytest.mark.django_db
def test_ohne_nutzung_der_vorschlag_fuer_alle(bearbeiter):
    assert _schluessel(uebersicht.vorschlag(bearbeiter)) == uebersicht.OHNE_NUTZUNG


@pytest.mark.django_db
def test_vorschlag_folgt_der_eigenen_nutzung(bearbeiter):
    """So wie Florian arbeitet: Kontakte vor allem, dann Termine."""
    _geschrieben(bearbeiter, "socos.Kontakt", 40)
    _geschrieben(bearbeiter, "socos.Verlaufseintrag", 13)
    _geschrieben(bearbeiter, "socos.Aufgabe", 21)
    _geschrieben(bearbeiter, "socos.Eventziel", 9)

    assert _schluessel(uebersicht.vorschlag(bearbeiter)) == ["aufgaben", "ball", "termine", "aktivitaet"]


@pytest.mark.django_db
def test_hoechstens_vier_aus_der_nutzung(bearbeiter):
    for modell, n in [
        ("socos.Lageschritt", 60),
        ("socos.Foerderpaket", 50),
        ("socos.Meetingabschnitt", 40),
        ("socos.Kontakt", 30),
        ("socos.Projektphase", 20),
    ]:
        _geschrieben(bearbeiter, modell, n)

    vorschlag = uebersicht.vorschlag(bearbeiter)
    assert _schluessel(vorschlag) == ["aufgaben", "thoughts", "foerderungen", "termine", "ball", "aktivitaet"]
    # Der Gantt ist herausgefallen — und mit ihm der einzige breite Baustein.
    assert not any(e["breit"] for e in vorschlag)


@pytest.mark.django_db
def test_einzelnes_nachschlagen_bringt_keinen_baustein(bearbeiter):
    _geschrieben(bearbeiter, "socos.Aufgabe", 10)
    _geschrieben(bearbeiter, "socos.Zeitbuchung", uebersicht.SCHWELLE - 1)

    assert "zeit" not in _schluessel(uebersicht.vorschlag(bearbeiter))


@pytest.mark.django_db
def test_nur_die_letzten_dreissig_tage_und_nur_die_eigenen(bearbeiter, admin_nutzer):
    _geschrieben(bearbeiter, "socos.Aufgabe", 10)
    _geschrieben(bearbeiter, "socos.Lageschritt", 50, vor_tagen=uebersicht.TAGE + 1)
    _geschrieben(admin_nutzer, "socos.Foerderantrag", 50)

    assert _schluessel(uebersicht.vorschlag(bearbeiter)) == ["aufgaben", "aktivitaet"]


# --- Was gespeichert werden darf --------------------------------------------


def test_bereinigt_laesst_unbekanntes_und_doppeltes_weg():
    roh = [
        {"baustein": "ball", "breit": "ja"},
        {"baustein": "gibtsnicht"},
        {"baustein": "ball", "breit": True},
        "aufgaben",
        {"baustein": "projekte", "breit": True},
    ]
    assert uebersicht.bereinigt(roh) == [
        {"baustein": "ball", "breit": False},
        {"baustein": "projekte", "breit": True},
    ]


def test_bereinigt_will_eine_liste():
    with pytest.raises(ValueError):
        uebersicht.bereinigt({"baustein": "ball"})


# --- Über die API -----------------------------------------------------------


def _speichern(client, bausteine):
    return client.put(
        "/api/ich/uebersicht/", data=json.dumps({"bausteine": bausteine}), content_type="application/json"
    )


@pytest.mark.django_db
def test_ich_liefert_den_vorschlag_solange_nichts_gespeichert_ist(client, bearbeiter):
    client.force_login(bearbeiter)
    antwort = client.get("/api/ich/").json()["uebersicht"]
    assert antwort["eigen"] is False
    assert _schluessel(antwort["bausteine"]) == uebersicht.OHNE_NUTZUNG


@pytest.mark.django_db
def test_speichern_und_zuruecksetzen(client, bearbeiter):
    client.force_login(bearbeiter)
    eigen = [{"baustein": "geld", "breit": True}, {"baustein": "aufgaben", "breit": False}]

    antwort = _speichern(client, eigen)
    assert antwort.status_code == 200
    assert antwort.json() == {"bausteine": eigen, "eigen": True}
    assert client.get("/api/ich/").json()["uebersicht"]["bausteine"] == eigen

    # Leer heißt: zurück zum Vorschlag.
    assert _speichern(client, []).json()["eigen"] is False
    bearbeiter.refresh_from_db()
    assert bearbeiter.uebersicht == []


@pytest.mark.django_db
def test_auch_ein_leser_richtet_seine_uebersicht_ein(client, leser):
    """Sie ändert nichts, was ein anderer sieht."""
    client.force_login(leser)
    assert _speichern(client, [{"baustein": "termine"}]).status_code == 200


@pytest.mark.django_db
def test_keine_liste_ist_ein_fehler(client, bearbeiter):
    client.force_login(bearbeiter)
    assert _speichern(client, {"baustein": "ball"}).status_code == 400


@pytest.mark.django_db
def test_ohne_anmeldung_kein_speichern(client):
    assert _speichern(client, [{"baustein": "ball"}]).status_code == 403


@pytest.mark.django_db
def test_verschieben_steht_nicht_im_protokoll(client, bearbeiter):
    """Eine Vorliebe ist kein Fachbestand — jedes Verschieben wäre sonst eine Zeile."""
    client.force_login(bearbeiter)
    vorher = Protokolleintrag.objects.count()
    _speichern(client, [{"baustein": "ball"}, {"baustein": "aufgaben"}])
    assert Protokolleintrag.objects.count() == vorher
