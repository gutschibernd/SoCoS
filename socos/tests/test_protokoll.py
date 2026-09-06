"""
Das Änderungsprotokoll. Geprüft wird am Nutzermodell, weil es das einzige ist,
das es zu diesem Zeitpunkt gibt — die Mechanik ist für alle Modelle dieselbe.
"""

import pytest

from socos import aktueller_nutzer
from socos.models import Nutzer, Protokolleintrag


@pytest.fixture(autouse=True)
def sauber(db):
    Protokolleintrag.objects.all().delete()


def test_anlegen_wird_protokolliert(db):
    n = Nutzer.objects.create_user(email="neu@example.invalid", name="Neue Person")
    eintrag = Protokolleintrag.objects.get(objekt_id=str(n.pk))
    assert eintrag.aktion == Protokolleintrag.Aktion.ANGELEGT
    assert eintrag.modell == "socos.Nutzer"
    assert eintrag.objekt_text == "Neue Person"


def test_aenderung_haelt_alt_und_neu_fest(db):
    n = Nutzer.objects.create_user(email="a@example.invalid", name="Alt")
    n.name = "Neu"
    n.save()

    eintrag = Protokolleintrag.objects.filter(
        objekt_id=str(n.pk), aktion=Protokolleintrag.Aktion.GEAENDERT
    ).first()
    assert eintrag is not None
    assert eintrag.aenderungen["name"] == {"alt": "Alt", "neu": "Neu"}


def test_speichern_ohne_aenderung_schreibt_nichts(db):
    n = Nutzer.objects.create_user(email="b@example.invalid", name="Gleich")
    vorher = Protokolleintrag.objects.count()
    n.save()
    assert Protokolleintrag.objects.count() == vorher


def test_passwort_steht_nie_im_protokoll(db):
    n = Nutzer.objects.create_user(email="c@example.invalid", name="Person")
    n.set_password("ein-langes-passwort-fuer-den-test")
    n.save()

    for eintrag in Protokolleintrag.objects.filter(objekt_id=str(n.pk)):
        assert "password" not in eintrag.aenderungen


def test_handelnder_nutzer_wird_festgehalten(db, admin_nutzer):
    token = aktueller_nutzer.setzen(admin_nutzer)
    try:
        n = Nutzer.objects.create_user(email="d@example.invalid", name="Von Admin")
    finally:
        aktueller_nutzer.zuruecksetzen(token)

    eintrag = Protokolleintrag.objects.get(objekt_id=str(n.pk))
    assert eintrag.nutzer == admin_nutzer
    assert eintrag.nutzer_text == "Admin Person"


def test_ohne_anfrage_bleibt_der_nutzer_leer(db):
    """Befehle und Tests handeln ohne angemeldeten Nutzer. Das ist kein Fehler."""
    n = Nutzer.objects.create_user(email="e@example.invalid", name="Ohne Anfrage")
    eintrag = Protokolleintrag.objects.get(objekt_id=str(n.pk))
    assert eintrag.nutzer is None
    assert eintrag.nutzer_text == ""
