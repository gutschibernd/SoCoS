"""
Der gesamte Bestand als **eine** Datei: Datenbank und hochgeladene Dateien
zusammen.
"""

import shutil
import tarfile
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from socos import sicherung


class Command(BaseCommand):
    help = "Schreibt Datenbank und Medien in ein Archiv."

    def add_arguments(self, parser):
        parser.add_argument(
            "--ziel",
            default=None,
            help="Pfad der Archivdatei. Vorgabe: sicherungen/socos-<zeitpunkt>.tar.gz",
        )

    def handle(self, *args, **optionen):
        wurzel = Path(settings.WURZEL)
        if optionen["ziel"]:
            ziel = Path(optionen["ziel"])
        else:
            ordner = wurzel / "sicherungen"
            ordner.mkdir(exist_ok=True)
            ziel = ordner / f"socos-{timezone.localtime():%Y%m%d-%H%M%S}.tar.gz"
        ziel.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)

            datenbank = tmp / sicherung.DATENBANK_IM_ARCHIV
            with datenbank.open("w", encoding="utf-8") as datei:
                call_command(
                    "dumpdata",
                    *sicherung.MODELLE_IM_ARCHIV,
                    # Auch weich Gelöschtes muss mit. Es ist Bestand: das
                    # Änderungsprotokoll verweist darauf, und der Admin kann es
                    # wiederherstellen.
                    all=True,
                    natural_foreign=True,
                    indent=2,
                    stdout=datei,
                )

            medien_quelle = Path(settings.MEDIA_ROOT)
            medien_ziel = tmp / sicherung.MEDIEN_IM_ARCHIV
            if medien_quelle.exists():
                shutil.copytree(medien_quelle, medien_ziel)
            else:
                medien_ziel.mkdir()

            with tarfile.open(ziel, "w:gz") as archiv:
                archiv.add(datenbank, arcname=sicherung.DATENBANK_IM_ARCHIV)
                archiv.add(medien_ziel, arcname=sicherung.MEDIEN_IM_ARCHIV)

        groesse = ziel.stat().st_size / 1024
        self.stdout.write(self.style.SUCCESS(f"{ziel}  ({groesse:.0f} kB)"))
        self.stdout.write(
            "Enthalten: " + ", ".join(sicherung.MODELLE_IM_ARCHIV) + " und die Medien."
        )
