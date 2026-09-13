"""
Neuigkeiten und Rückmeldungen.

Geprüft wird das, was sich still verschieben kann: die Auswahl „was ist für
diesen Nutzer neu", die Reihenfolge, in der das Fenster die Seiten zeigt, und
die Grenze zwischen melden (darf jeder) und den Stand setzen (nur ein Admin).
"""

import pytest

from socos import aenderungen, berechtigung
from socos.models import Nutzer, Rueckmeldung, Rueckmeldungsstand


# --- Die Änderungsliste selbst ----------------------------------------------


def test_versionen_stehen_neueste_zuerst():
    """
    Die Reihenfolge ist die Zusage der Datei an alle, die sie lesen. Ein
    Eintrag, der unten angehängt statt oben eingefügt wird, fällt sonst
    nirgends auf — außer im Fenster, das dann die falsche Seite zuerst zeigt.
    """
    versionen = [v["version"] for v in aenderungen.VERSIONEN]
    assert versionen == sorted(versionen, reverse=True)


def test_jede_version_hat_datumsform_und_punkte():
    for fassung in aenderungen.VERSIONEN:
        assert len(fassung["version"]) == 10 and fassung["version"][4] == "-", (
            f"„{fassung['version']}“ ist kein Datum JJJJ-MM-TT — daran hängt der "
            f"Vergleich mit `neuigkeiten_bis`."
        )
        assert fassung["titel"]
        assert fassung["punkte"], "Eine Version ohne Punkte zeigt ein leeres Fenster."
        for punkt in fassung["punkte"]:
            assert punkt["titel"] and punkt["text"]


def test_seit_gibt_nur_neueres():
    neueste = aenderungen.NEUESTE
    assert aenderungen.seit(neueste) == []
    assert aenderungen.seit("") == aenderungen.VERSIONEN
    assert aenderungen.seit("0000-00-00") == aenderungen.VERSIONEN


def test_punkte_kommen_in_der_reihenfolge_ihres_entstehens():
    """Älteste Version zuerst — die Korrektur soll nach dem stehen, was sie korrigiert."""
    punkte = aenderungen.punkte_seit("")
    versionen = [p["version"] for p in punkte]
    assert versionen == sorted(versionen)
    assert len(punkte) == sum(len(v["punkte"]) for v in aenderungen.VERSIONEN)


@pytest.mark.django_db
def test_neues_konto_startet_auf_dem_aktuellen_stand():
    """
    Wer heute dazukommt, bekommt die Doku und keine Führung durch die
    Änderungen der Monate davor.
    """
    neu = Nutzer.objects.create_user(email="neu@example.invalid", name="Neue Person")
    assert neu.neuigkeiten_bis == aenderungen.NEUESTE
    assert aenderungen.punkte_seit(neu.neuigkeiten_bis) == []


# --- Das Fenster nach der Anmeldung -----------------------------------------


@pytest.mark.django_db
def test_wer_nichts_gesehen_hat_bekommt_die_neuigkeiten(client, bearbeiter):
    bearbeiter.neuigkeiten_bis = ""
    bearbeiter.save(update_fields=["neuigkeiten_bis"])
    client.force_login(bearbeiter)

    antwort = client.get("/api/ich/").json()
    assert len(antwort["neuigkeiten"]) == len(aenderungen.punkte_seit(""))


@pytest.mark.django_db
def test_gesehen_schliesst_das_fenster_dauerhaft(client, bearbeiter):
    bearbeiter.neuigkeiten_bis = ""
    bearbeiter.save(update_fields=["neuigkeiten_bis"])
    client.force_login(bearbeiter)

    assert client.post("/api/neuigkeiten/gesehen/").status_code == 200
    assert client.get("/api/ich/").json()["neuigkeiten"] == []

    bearbeiter.refresh_from_db()
    assert bearbeiter.neuigkeiten_bis == aenderungen.NEUESTE


@pytest.mark.django_db
def test_die_aenderungsliste_steht_allen_offen(client, leser):
    client.force_login(leser)
    antwort = client.get("/api/aenderungen/")
    assert antwort.status_code == 200
    assert antwort.json()["neueste"] == aenderungen.NEUESTE


# --- Wünsche und Fehler -----------------------------------------------------


def test_melden_darf_jede_rolle(admin_nutzer, bearbeiter, leser, ohne_rolle):
    assert berechtigung.darf_melden(admin_nutzer) is True
    assert berechtigung.darf_melden(bearbeiter) is True
    assert berechtigung.darf_melden(leser) is True
    assert berechtigung.darf_melden(ohne_rolle) is False


@pytest.mark.django_db
def test_leser_darf_melden_aber_den_stand_nicht_setzen(client, leser):
    client.force_login(leser)

    angelegt = client.post(
        "/api/rueckmeldungen/",
        {"art": "fehler", "titel": "Die Uhr zählt rückwärts"},
        content_type="application/json",
    )
    assert angelegt.status_code == 201
    # Der Melder ist, wer schickt — nicht, wen das Formular mitschickt.
    assert angelegt.json()["melder"] == leser.pk
    assert angelegt.json()["stand"] == Rueckmeldungsstand.NEU

    nummer = angelegt.json()["id"]
    verwehrt = client.patch(
        f"/api/rueckmeldungen/{nummer}/",
        {"stand": "erledigt"},
        content_type="application/json",
    )
    assert verwehrt.status_code == 400
    assert "stand" in verwehrt.json()


@pytest.mark.django_db
def test_der_melder_darf_seinen_eigenen_text_nachschaerfen(client, leser):
    client.force_login(leser)
    eigener = Rueckmeldung.objects.create(titel="Alt", melder=leser)
    assert (
        client.patch(
            f"/api/rueckmeldungen/{eigener.pk}/",
            {"titel": "Neu"},
            content_type="application/json",
        ).status_code
        == 200
    )


@pytest.mark.django_db
def test_fremde_meldungen_fasst_nur_ein_admin_an(client, leser, bearbeiter):
    fremde = Rueckmeldung.objects.create(titel="Fremd", melder=bearbeiter)
    client.force_login(leser)
    assert (
        client.patch(
            f"/api/rueckmeldungen/{fremde.pk}/",
            {"titel": "Umgeschrieben"},
            content_type="application/json",
        ).status_code
        == 403
    )


@pytest.mark.django_db
def test_admin_setzt_stand_und_version(client, admin_nutzer, bearbeiter):
    meldung = Rueckmeldung.objects.create(titel="Wunsch", melder=bearbeiter)
    client.force_login(admin_nutzer)
    antwort = client.patch(
        f"/api/rueckmeldungen/{meldung.pk}/",
        {"stand": "erledigt", "erledigt_in": aenderungen.NEUESTE, "antwort": "Drin."},
        content_type="application/json",
    )
    assert antwort.status_code == 200
    assert antwort.json()["stand"] == "erledigt"
    assert antwort.json()["erledigt_in"] == aenderungen.NEUESTE


@pytest.mark.django_db
def test_entfernen_bleibt_beim_admin_und_loescht_weich(client, admin_nutzer, bearbeiter):
    meldung = Rueckmeldung.objects.create(titel="Weg damit", melder=bearbeiter)

    client.force_login(bearbeiter)
    assert client.delete(f"/api/rueckmeldungen/{meldung.pk}/").status_code == 403

    client.force_login(admin_nutzer)
    assert client.delete(f"/api/rueckmeldungen/{meldung.pk}/").status_code == 204
    assert Rueckmeldung.objects.filter(pk=meldung.pk).count() == 0
    assert Rueckmeldung.alle_objekte.get(pk=meldung.pk).ist_geloescht
