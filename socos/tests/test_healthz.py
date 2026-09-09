"""Der Healthcheck. Zwei Aufrufer teilen ihn sich — Container und deploy.sh."""

import pytest


@pytest.mark.django_db
def test_healthz_antwortet_ohne_anmeldung(client):
    """Der Container fragt ohne Sitzung. Eine 302 zur Anmeldung wäre tödlich."""
    antwort = client.get("/healthz/")
    assert antwort.status_code == 200
    assert antwort.json()["status"] == "gesund"


def test_healthz_ist_vom_https_redirect_ausgenommen(settings):
    """
    Sonst bekäme der Healthcheck eine 301 und der Dienst gälte dauerhaft als
    krank. Geprüft wird der Regex, weil die Einstellung nur bei DEBUG=0 gesetzt
    wird und in Tests deshalb nicht aktiv ist.
    """
    import re

    from konfiguration import settings as modul

    quelle = open(modul.__file__).read()
    assert 'SECURE_REDIRECT_EXEMPT = [r"^healthz/$"]' in quelle
    assert re.match(r"^healthz/$", "healthz/")


@pytest.mark.django_db
def test_api_ohne_anmeldung_ist_verwehrt(client):
    antwort = client.get("/api/ich/")
    assert antwort.status_code in (401, 403)
    assert antwort.json()["code"] == "not_authenticated"


@pytest.mark.django_db
def test_api_ich_liefert_rolle_und_rechte(client, bearbeiter):
    client.force_login(bearbeiter)
    daten = client.get("/api/ich/").json()
    assert daten["rolle"] == "bearbeiter"
    assert daten["darf"] == {
        "bearbeiten": True,
        "loeschen": False,
        "finanzen_eintragen": False,
        "nutzer_verwalten": False,
        "sichern": False,
    }
    assert daten["initialen"] == "BP"
