"""
Was ins Archiv wandert und in welcher Reihenfolge es wieder hineingeht.

**Wer etwas Neues baut, das gespeichert wird, trägt es hier ein — im selben
Commit.** Ein Export, der die Hälfte mitnimmt, ist schlimmer als keiner: Er sieht
vollständig aus, und der Verlust fällt erst beim Wiederherstellen auf, im
Ernstfall, unter Zeitdruck, wenn das Original schon weg ist.

`socos/tests/test_sicherung.py` prüft, dass diese beiden Listen zu den
tatsächlich vorhandenen Modellen passen. Ein vergessenes Modell lässt den Test
fallen, nicht erst den Wiederherstellungsversuch.
"""

# Alles, was im Archiv landet. Modelle außerhalb der eigenen App stehen
# ausdrücklich hier — sie wandern nicht von selbst mit.
MODELLE_IM_ARCHIV = [
    "socos.Nutzer",
    "socos.Protokolleintrag",
    "socos.Projekt",
    "socos.Bereich",
    "socos.Arbeitspaket",
    "socos.Unteraufgabe",
    "socos.Zeitbuchung",
    "socos.Organisation",
    "socos.Kontakt",
    "socos.Verlaufseintrag",
    "socos.Kontostand",
    "socos.Fixkosten",
    "socos.Monatskosten",
    # Die Rollen. Ohne sie darf nach dem Einspielen niemand mehr etwas.
    "auth.Group",
]

# Beim Einspielen wird in dieser Reihenfolge geleert: das Abhängige zuerst.
LOESCHREIHENFOLGE = [
    # Das Abhängige zuerst, sonst hält on_delete=PROTECT dagegen.
    "socos.Verlaufseintrag",
    "socos.Zeitbuchung",
    "socos.Unteraufgabe",
    "socos.Arbeitspaket",
    "socos.Bereich",
    "socos.Projekt",
    "socos.Kontakt",
    "socos.Organisation",
    "socos.Kontostand",
    "socos.Fixkosten",
    "socos.Monatskosten",
    "socos.Protokolleintrag",
    "socos.Nutzer",
    "auth.Group",
]

# Bewusst **nicht** im Archiv:
#
# contenttypes, auth.Permission  Legt Django beim Migrieren selbst an. Mit
#                                festen IDs im Archiv kollidierten sie mit den
#                                frisch angelegten.
# sessions                       Angemeldete Sitzungen sind kein Bestand. Nach
#                                dem Einspielen meldet man sich neu an.
# axes                           Fehlversuche und Sperren sind Betriebszustand.
# admin.LogEntry                 Das eigene Änderungsprotokoll ist die Quelle.
#
# Verweise auf diese Modelle werden über natürliche Schlüssel gesichert
# (--natural-foreign), damit sie nach dem Migrieren wieder auflösbar sind.

DATENBANK_IM_ARCHIV = "datenbank.json"
MEDIEN_IM_ARCHIV = "medien"


def archivname(zeitpunkt):
    """
    Der Dateiname eines Archivs. Steht hier, weil ihn zwei Stellen brauchen:
    die Vorgabe von `sicherung_erstellen` und der Name, unter dem der Download
    aus der Oberfläche im Ordner des Nutzers landet.
    """
    return f"socos-{zeitpunkt:%Y%m%d-%H%M%S}.tar.gz"


# --- Der Mechanismus --------------------------------------------------------
#
# Die Logik steht hier und nicht in den Management-Befehlen, weil sie zwei
# Aufrufer hat: `sicherung_erstellen`/`sicherung_einspielen` am Server und die
# beiden Endpunkte unter `/api/sicherung/`, die dasselbe aus der Oberfläche
# heraus tun. Zwei Kopien liefen auseinander — und die Sicherung ist genau die
# Stelle, an der man das erst im Ernstfall merkt.

import shutil
import tarfile
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command


class ArchivFehler(Exception):
    """Das Archiv passt nicht. Der Grund steht in der Meldung."""


def archiv_schreiben(ziel):
    """Schreibt Datenbank und Medien nach `ziel` (eine .tar.gz) und gibt sie zurück."""
    ziel = Path(ziel)
    ziel.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        datenbank = tmp / DATENBANK_IM_ARCHIV
        with datenbank.open("w", encoding="utf-8") as datei:
            call_command(
                "dumpdata",
                *MODELLE_IM_ARCHIV,
                # Auch weich Gelöschtes muss mit. Es ist Bestand: das
                # Änderungsprotokoll verweist darauf, und der Admin kann es
                # wiederherstellen.
                all=True,
                natural_foreign=True,
                indent=2,
                stdout=datei,
            )

        medien_quelle = Path(settings.MEDIA_ROOT)
        medien_ziel = tmp / MEDIEN_IM_ARCHIV
        if medien_quelle.exists():
            shutil.copytree(medien_quelle, medien_ziel)
        else:
            medien_ziel.mkdir()

        with tarfile.open(ziel, "w:gz") as archiv:
            archiv.add(datenbank, arcname=DATENBANK_IM_ARCHIV)
            archiv.add(medien_ziel, arcname=MEDIEN_IM_ARCHIV)

    return ziel


def archiv_einspielen(quelle):
    """
    Ersetzt den **gesamten** Bestand durch das Archiv — Datenbank und Medien.

    Wer das aufruft, hat die Bestätigung schon eingeholt: hier wird nicht mehr
    gefragt.
    """
    from django.apps import apps
    from django.db import transaction

    quelle = Path(quelle)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        try:
            with tarfile.open(quelle, "r:gz") as archiv:
                # filter="data" wehrt Pfade ab, die aus dem Zielordner
                # herausführen. Ein Archiv ist eine fremde Datei.
                archiv.extractall(tmp, filter="data")
        except tarfile.TarError as fehler:
            raise ArchivFehler(f"Das ist kein lesbares .tar.gz-Archiv: {fehler}")

        datenbank = tmp / DATENBANK_IM_ARCHIV
        if not datenbank.exists():
            raise ArchivFehler(
                f"Das Archiv enthält kein {DATENBANK_IM_ARCHIV}. "
                "Stammt es aus der Sicherung von SoCoS?"
            )

        geleert = []
        with transaction.atomic():
            for bezeichner in LOESCHREIHENFOLGE:
                modell = apps.get_model(bezeichner)
                menge = getattr(modell, "alle_objekte", modell.objects).all()
                # Hart löschen: ein weiches ließe die alten Zeilen stehen und
                # das Einspielen liefe auf doppelte Schlüssel.
                anzahl = (
                    menge.hart_loeschen()
                    if hasattr(menge, "hart_loeschen")
                    else menge.delete()
                )
                geleert.append((bezeichner, anzahl))

            try:
                call_command("loaddata", str(datenbank), verbosity=0)
            except Exception as fehler:  # noqa: BLE001 — der Grund gehört zum Aufrufer
                # Die Transaktion nimmt das Leeren mit zurück; der Bestand steht
                # danach wieder so da wie vorher.
                raise ArchivFehler(f"Das Archiv ließ sich nicht einlesen: {fehler}")

        medien_quelle = tmp / MEDIEN_IM_ARCHIV
        if medien_quelle.exists():
            _medien_ersetzen(medien_quelle)

    return geleert


def _medien_ersetzen(quelle):
    """
    Den Medienordner **leeren und neu füllen** — nicht wegwerfen und neu anlegen.

    Am Server ist `MEDIA_ROOT` der Einhängepunkt eines Docker-Volumes. Ein
    `rmtree` darauf scheitert mit „Device or resource busy": Der Inhalt lässt
    sich löschen, das Verzeichnis selbst nicht. Und der Fehler kommt **nach**
    dem Datenbankteil — der Bestand wäre schon getauscht, das Einspielen
    trotzdem abgebrochen.
    """
    ziel = Path(settings.MEDIA_ROOT)
    ziel.mkdir(parents=True, exist_ok=True)

    for eintrag in ziel.iterdir():
        if eintrag.is_dir() and not eintrag.is_symlink():
            shutil.rmtree(eintrag)
        else:
            eintrag.unlink()

    shutil.copytree(quelle, ziel, dirs_exist_ok=True)
