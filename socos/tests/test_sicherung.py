"""
Die Sicherung. Zwei Sorten Test, und beide sind nötig:

1. **Vollständigkeit** — kein Modell fehlt in den Listen. Der Test fällt, sobald
   jemand ein Fachmodell anlegt und es nicht einträgt. Ohne ihn fiele es erst
   beim Wiederherstellen auf, unter Zeitdruck, wenn das Original schon weg ist.
2. **Rundlauf** — was hineingeht, kommt wieder heraus. Auch die Datei.
"""

from pathlib import Path

import pytest
from django.apps import apps
from django.conf import settings
from django.core.management import call_command

from socos import sicherung
from socos.models import (
    Arbeitspaket,
    Bereich,
    Bereichsart,
    Nutzer,
    Projekt,
    Protokolleintrag,
)


# --- Vollständigkeit --------------------------------------------------------


def test_jedes_eigene_modell_ist_im_archiv():
    """
    Der Test, der zählt: Er fällt bei jedem neuen Modell, das nicht eingetragen
    wurde. Ausgenommen ist nur, was Django selbst wieder anlegt.
    """
    eigene = {
        m._meta.label
        for m in apps.get_app_config("socos").get_models()
    }
    fehlend = eigene - set(sicherung.MODELLE_IM_ARCHIV)
    assert not fehlend, (
        f"Diese Modelle wandern nicht ins Archiv: {sorted(fehlend)}. "
        f"Eintragen in socos/sicherung.py — MODELLE_IM_ARCHIV *und* "
        f"LOESCHREIHENFOLGE."
    )


def test_loeschreihenfolge_deckt_das_archiv_ab():
    assert set(sicherung.LOESCHREIHENFOLGE) == set(sicherung.MODELLE_IM_ARCHIV)


def test_alle_bezeichner_lassen_sich_auflösen():
    for bezeichner in sicherung.MODELLE_IM_ARCHIV:
        assert apps.get_model(bezeichner) is not None


# --- Rundlauf ---------------------------------------------------------------


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    Path(settings.MEDIA_ROOT).mkdir()
    return Path(settings.MEDIA_ROOT)


@pytest.mark.django_db(transaction=True)
def test_rundlauf_datenbank_und_medien(tmp_path, medien, admin_nutzer):
    beleg = medien / "unterordner" / "beleg.txt"
    beleg.parent.mkdir(parents=True)
    beleg.write_text("hochgeladen")

    anzahl_protokoll = Protokolleintrag.objects.count()
    assert anzahl_protokoll > 0  # sonst prüft der Rundlauf unten nichts

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    assert archiv.exists()

    # Bestand vernichten — Datenbank und Datei.
    Protokolleintrag.objects.all().delete()
    Nutzer.objects.all().delete()
    beleg.unlink()
    assert not Nutzer.objects.exists()

    call_command(
        "sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0
    )

    wieder_da = Nutzer.objects.get(email="admin@example.invalid")
    assert wieder_da.name == "Admin Person"
    assert {g.name for g in wieder_da.groups.all()} == {"admin"}
    assert Protokolleintrag.objects.count() == anzahl_protokoll
    assert beleg.read_text() == "hochgeladen"


@pytest.mark.django_db(transaction=True)
def test_die_stufenleiste_eines_pakets_wandert_mit(tmp_path, medien, admin_nutzer):
    """
    Die Leiste ist ein JSON-Feld mit angepassten Dauern. Ein Export, der sie
    auf die Vorlage zurückfallen ließe, sähe vollständig aus — und der Verlust
    fiele erst beim Wiederherstellen auf.
    """
    projekt = Projekt.objects.create(titel="Rundlauf")
    bereich = Bereich.objects.create(projekt=projekt, titel="Entwicklung", art=Bereichsart.DEV)
    paket = Arbeitspaket.objects.create(
        bereich=bereich,
        titel="Eigene Leiste",
        stufen=[{"name": "Sondierung", "monate": 7}, {"name": "Bau", "monate": 2}],
        stufenstand=1,
    )

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    paket.stufen = [{"name": "Egal", "monate": 1}]
    paket.stufenstand = 0
    paket.save()

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Arbeitspaket.objects.get(titel="Eigene Leiste")
    assert wieder_da.stufen == [
        {"name": "Sondierung", "monate": 7},
        {"name": "Bau", "monate": 2},
    ]
    assert wieder_da.stufenstand == 1


@pytest.mark.django_db(transaction=True)
def test_stillgelegter_nutzer_wandert_mit(tmp_path, medien, bearbeiter):
    """
    Ein stillgelegtes Konto ist Bestand, kein Müll — das Änderungsprotokoll
    verweist darauf. Dasselbe gilt für weich Gelöschtes; dafür sorgt `all=True`
    beim Ausgeben. Ein eigener Test dazu kommt mit dem ersten Fachmodell, das
    von `Basismodell` erbt.
    """
    bearbeiter.is_active = False
    bearbeiter.save()

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Nutzer.objects.all().delete()
    call_command(
        "sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0
    )

    assert Nutzer.objects.get(email="bearbeiter@example.invalid").is_active is False


@pytest.mark.django_db
def test_einspielen_ohne_bestaetigung_tut_nichts(tmp_path, medien, admin_nutzer):
    from django.core.management.base import CommandError

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    with pytest.raises(CommandError, match="ja-bestand-ersetzen"):
        call_command("sicherung_einspielen", str(archiv), verbosity=0)

    assert Nutzer.objects.filter(email="admin@example.invalid").exists()


@pytest.mark.django_db
def test_fremdes_archiv_wird_abgewiesen(tmp_path, medien):
    """Der Grund steht in der Meldung — nicht bloß ein Stacktrace."""
    import tarfile

    from django.core.management.base import CommandError

    falsch = tmp_path / "falsch.tar.gz"
    beliebig = tmp_path / "beliebig.txt"
    beliebig.write_text("kein Archiv von uns")
    with tarfile.open(falsch, "w:gz") as t:
        t.add(beliebig, arcname="beliebig.txt")

    with pytest.raises(CommandError, match="datenbank.json"):
        call_command(
            "sicherung_einspielen", str(falsch), ja_bestand_ersetzen=True, verbosity=0
        )


# --- Über die Oberfläche ----------------------------------------------------
#
# Dieselben zwei Vorgänge, nur über die Schnittstelle. Geprüft wird, was hier
# fachlich entschieden ist: wer darf, was ohne Bestätigung passiert (nichts),
# und dass die Sitzung danach nicht weiterläuft.


@pytest.mark.django_db(transaction=True)
def test_ausgeben_liefert_ein_einspielbares_archiv(client, tmp_path, medien, admin_nutzer):
    client.force_login(admin_nutzer)
    antwort = client.get("/api/sicherung/")

    assert antwort.status_code == 200
    assert antwort["Content-Type"] == "application/gzip"
    assert "attachment" in antwort["Content-Disposition"]
    assert ".tar.gz" in antwort["Content-Disposition"]

    # Und der Rundlauf: Was der Download liefert, muss auch wieder hineingehen.
    archiv = tmp_path / "aus-der-oberflaeche.tar.gz"
    archiv.write_bytes(antwort.content)
    Nutzer.objects.all().delete()

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)
    assert Nutzer.objects.filter(email="admin@example.invalid").exists()


@pytest.mark.django_db
def test_ausgeben_nur_fuer_den_admin(client, bearbeiter, leser):
    for nutzer in (bearbeiter, leser):
        client.force_login(nutzer)
        assert client.get("/api/sicherung/").status_code == 403


@pytest.mark.django_db
def test_ausgeben_ohne_anmeldung_verwehrt(client):
    assert client.get("/api/sicherung/").status_code == 403


@pytest.mark.django_db(transaction=True)
def test_einspielen_ueber_die_oberflaeche(client, tmp_path, medien, admin_nutzer):
    beleg = medien / "beleg.txt"
    beleg.write_text("hochgeladen")
    projekt = Projekt.objects.create(titel="Vor der Sicherung")

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    projekt.hart_loeschen() if hasattr(projekt, "hart_loeschen") else projekt.delete()
    Projekt.alle_objekte.all().delete()
    beleg.unlink()

    client.force_login(admin_nutzer)
    with archiv.open("rb") as datei:
        antwort = client.post(
            "/api/sicherung/einspielen/",
            {"archiv": datei, "bestaetigung": "bestand-ersetzen"},
        )

    assert antwort.status_code == 200, antwort.content
    assert Projekt.objects.filter(titel="Vor der Sicherung").exists()
    assert beleg.read_text() == "hochgeladen"

    # Die Sitzung ist beendet: Der Ausweis gehörte zu einem Bestand, den es
    # nicht mehr gibt.
    assert client.get("/api/projekte/").status_code == 403


@pytest.mark.django_db(transaction=True)
def test_einspielen_ohne_bestaetigung_ersetzt_nichts(client, tmp_path, medien, admin_nutzer):
    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Projekt.objects.create(titel="Steht danach immer noch da")

    client.force_login(admin_nutzer)
    with archiv.open("rb") as datei:
        antwort = client.post("/api/sicherung/einspielen/", {"archiv": datei})

    assert antwort.status_code == 400
    assert Projekt.objects.filter(titel="Steht danach immer noch da").exists()


@pytest.mark.django_db(transaction=True)
def test_einspielen_nur_fuer_den_admin(client, tmp_path, medien, admin_nutzer, bearbeiter):
    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    client.force_login(bearbeiter)
    with archiv.open("rb") as datei:
        antwort = client.post(
            "/api/sicherung/einspielen/",
            {"archiv": datei, "bestaetigung": "bestand-ersetzen"},
        )

    assert antwort.status_code == 403
    assert Nutzer.objects.filter(email="admin@example.invalid").exists()


@pytest.mark.django_db(transaction=True)
def test_fremde_datei_laesst_den_bestand_stehen(client, tmp_path, medien, admin_nutzer):
    """
    Der Bestand wird geleert, bevor eingelesen wird. Scheitert das Einlesen,
    muss das Leeren mit zurückgenommen werden — sonst nähme eine falsch
    gewählte Datei alles mit.
    """
    fremd = tmp_path / "fremd.tar.gz"
    fremd.write_bytes(b"das ist gar kein Archiv")
    Projekt.objects.create(titel="Bleibt")

    client.force_login(admin_nutzer)
    with fremd.open("rb") as datei:
        antwort = client.post(
            "/api/sicherung/einspielen/",
            {"archiv": datei, "bestaetigung": "bestand-ersetzen"},
        )

    assert antwort.status_code == 400
    assert Projekt.objects.filter(titel="Bleibt").exists()
    assert Nutzer.objects.filter(email="admin@example.invalid").exists()
