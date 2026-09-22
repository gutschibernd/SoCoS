"""
Die Sicherung. Zwei Sorten Test, und beide sind nötig:

1. **Vollständigkeit** — kein Modell fehlt in den Listen. Der Test fällt, sobald
   jemand ein Fachmodell anlegt und es nicht einträgt. Ohne ihn fiele es erst
   beim Wiederherstellen auf, unter Zeitdruck, wenn das Original schon weg ist.
2. **Rundlauf** — was hineingeht, kommt wieder heraus. Auch die Datei.
"""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from django.apps import apps
from django.conf import settings
from django.core.management import call_command

from socos import sicherung
from socos.models import (
    Arbeitspaket,
    Aufgabe,
    Projektphase,
    Phasenart,
    Phasenstand,
    Event,
    Eventziel,
    Kontakt,
    Nutzer,
    Organisation,
    Pensum,
    Projekt,
    Protokolleintrag,
    Verlaufseintrag,
    Vorhaben,
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
def test_der_medienordner_selbst_bleibt_stehen(tmp_path, medien, admin_nutzer):
    """
    Am Server ist MEDIA_ROOT der Einhängepunkt eines Docker-Volumes. Wer ihn
    wegwirft und neu anlegt, bekommt dort „Device or resource busy" — und zwar
    **nachdem** die Datenbank schon getauscht ist. Geleert werden darf nur der
    Inhalt.

    Geprüft wird das an der Inode: Bleibt sie gleich, ist es derselbe Ordner.
    """
    alt = (medien / "alt.txt")
    alt.write_text("kommt weg")
    inode_vorher = medien.stat().st_ino

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    (medien / "dazwischen.txt").write_text("steht nicht im Archiv")
    alt.unlink()

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    assert medien.stat().st_ino == inode_vorher, "Der Medienordner wurde neu angelegt."
    assert alt.read_text() == "kommt weg"
    assert not (medien / "dazwischen.txt").exists()


@pytest.mark.django_db(transaction=True)
def test_event_hitlist_und_teilnehmer_wandern_mit(tmp_path, medien, bearbeiter):
    """
    Am Event hängen drei Dinge, die kein einzelnes Feld sind: die Hitlist, die
    Teilnehmer (eine m:n-Beziehung) und der Verlauf, der über `event` dorthin
    zeigt. Genau solche Beziehungen fehlen in einem Export, der vollständig
    aussieht.
    """
    haus = Organisation.objects.create(name="Förderstelle Nord")
    person = Kontakt.objects.create(organisation=haus, name="Berger")
    event = Event.objects.create(titel="MedTech Days", ort="Wien", von="2026-10-14")
    event.teilnehmer.add(bearbeiter)
    Eventziel.objects.create(event=event, kontakt=person, anliegen="Antrag besprechen")
    Verlaufseintrag.objects.create(
        kontakt=person, event=event, art="event", titel="Am Stand angesprochen"
    )

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Event.objects.get(titel="MedTech Days")
    assert [n.email for n in wieder_da.teilnehmer.all()] == [bearbeiter.email]
    assert [z.anliegen for z in wieder_da.ziele.all()] == ["Antrag besprechen"]
    assert [v.titel for v in wieder_da.verlauf.all()] == ["Am Stand angesprochen"]


@pytest.mark.django_db(transaction=True)
def test_kontakt_mit_erreichbarkeit_und_herkunft_wandert_mit(tmp_path, medien, bearbeiter):
    """
    Mail, Telefon und das Event, auf dem jemand kennengelernt wurde.

    Das Feld `kennengelernt_auf` zeigt vom Kontakt auf das Event und dreht
    damit die Löschreihenfolge um: Wird das Event zuerst geleert, hält PROTECT
    dagegen und das Einspielen bricht mitten im Vorgang ab. Dieser Test fällt,
    wenn jemand die Reihenfolge in `sicherung.py` zurückdreht — die Ausfuhr
    allein sähe weiter vollständig aus.
    """
    haus = Organisation.objects.create(name="Institut Süd")
    event = Event.objects.create(titel="FFG Forum", ort="Wien", von="2026-10-02")
    Kontakt.objects.create(
        organisation=haus,
        name="Rauch",
        email="rauch@example.invalid",
        telefon="+43 664 1234567",
        kennengelernt_auf=event,
    )

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Kontakt.objects.get(name="Rauch")
    assert wieder_da.email == "rauch@example.invalid"
    assert wieder_da.telefon == "+43 664 1234567"
    assert wieder_da.kennengelernt_auf.titel == "FFG Forum"


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


@pytest.mark.django_db(transaction=True)
def test_rueckmeldung_wandert_mit_stand_und_melder_mit(tmp_path, medien, bearbeiter):
    """
    Eine Rückmeldung ist eine Zusage an den, der sie geschrieben hat.

    Geprüft wird nicht nur, dass die Zeile wiederkommt, sondern auch der Stand
    und der Melder: Ein Archiv, das Wünsche zurückholt und sie alle wieder auf
    „neu" stellt, sähe vollständig aus — und die Liste wäre trotzdem falsch.
    """
    from socos.models import Rueckmeldung, Rueckmeldungsart, Rueckmeldungsstand

    Rueckmeldung.objects.create(
        art=Rueckmeldungsart.FEHLER,
        titel="Zeitraum springt zurück",
        text="Nach dem Speichern steht wieder der laufende Monat da.",
        melder=bearbeiter,
        stand=Rueckmeldungsstand.ERLEDIGT,
        erledigt_in="2026-09-13",
    )

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Rueckmeldung.alle_objekte.all().hart_loeschen()
    assert not Rueckmeldung.objects.exists()

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Rueckmeldung.objects.get(titel="Zeitraum springt zurück")
    assert wieder_da.stand == Rueckmeldungsstand.ERLEDIGT
    assert wieder_da.erledigt_in == "2026-09-13"
    assert wieder_da.melder.email == bearbeiter.email


@pytest.mark.django_db(transaction=True)
def test_die_aufgabentafel_wandert_mit(tmp_path, medien, bearbeiter):
    """
    Die Tafel ist das, was am ehesten für „nur ein Zettel" gehalten wird — und
    genau deshalb der Kandidat, den jemand beim Archiv vergisst. Geprüft wird
    beides: die Aufgabe **mit** Person und die allgemeine ohne.
    """
    Aufgabe.objects.create(
        person=bearbeiter, text="Vertrag gegenzeichnen", prioritaet="hoch",
        frist=date(2026, 10, 12),
    )
    Aufgabe.objects.create(text="Kaffee bestellen", erledigt=True)

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    Aufgabe.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    meine = Aufgabe.objects.get(text="Vertrag gegenzeichnen")
    assert meine.person.email == bearbeiter.email
    assert meine.prioritaet == "hoch"
    assert meine.frist == date(2026, 10, 12)

    allgemein = Aufgabe.objects.get(text="Kaffee bestellen")
    assert allgemein.person is None
    assert allgemein.erledigt


@pytest.mark.django_db(transaction=True)
def test_pensen_und_phasenlaufzeit_wandern_mit(tmp_path, medien, bearbeiter):
    """
    Das Pensum ist die Zahl, gegen die später „was habe ich hier noch offen"
    gerechnet wird. Ein Archiv, das die Phasen und Pakete mitnimmt und die
    Pensen weglässt, sähe vollständig aus — und beim Wiederherstellen stünde
    jedes Arbeitspaket auf null Stunden, ohne dass irgendwo etwas fehlte.
    """
    projekt = Projekt.objects.create(titel="Arzneimittelspender")
    phase = Projektphase.objects.create(
        projekt=projekt,
        titel="Laborprototypen entwickeln",
        art=Phasenart.DEV,
        von=date(2026, 10, 1),
        bis=date(2027, 2, 28),
    )
    zu = Projektphase.objects.create(
        projekt=projekt,
        titel="Anforderungsmanagement",
        art=Phasenart.DEV,
        stand=Phasenstand.ABGESCHLOSSEN,
        reihenfolge=1,
    )
    paket = Arbeitspaket.objects.create(
        phase=phase,
        titel="AP02 – Vereinzelungsmechanik",
        beschreibung="Das größte Paket, weil es den kritischen Pfad enthält.",
    )
    Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("270.00"))

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    Pensum.objects.all().hart_loeschen()
    phase.von = None
    phase.bis = None
    phase.save()
    zu.stand = Phasenstand.LAEUFT
    zu.save()

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder = Projektphase.objects.get(titel="Laborprototypen entwickeln")
    assert wieder.von == date(2026, 10, 1)
    assert wieder.bis == date(2027, 2, 28)
    assert Projektphase.objects.get(titel="Anforderungsmanagement").abgeschlossen

    pensum = Pensum.objects.get(paket__titel="AP02 – Vereinzelungsmechanik")
    assert pensum.stunden == Decimal("270.00")
    assert pensum.person.email == bearbeiter.email
    assert "kritischen Pfad" in pensum.paket.beschreibung


@pytest.mark.django_db(transaction=True)
def test_stand_des_business_plan_wandert_mit(tmp_path, medien):
    """Der Stand je Abschnitt ist ein Feld am Vorhaben — er muss mit ihm zurückkommen."""
    vorhaben = Vorhaben.objects.create(titel="Spender", planstand={"markt": "entwurf", "summary": "fertig"})

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    vorhaben.planstand = {}
    vorhaben.save()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    assert Vorhaben.objects.get(titel="Spender").planstand == {"markt": "entwurf", "summary": "fertig"}
