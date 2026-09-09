"""
Der gesamte Bestand als **eine** Datei: Datenbank und hochgeladene Dateien
zusammen.

Was dabei passiert, steht in `socos/sicherung.py` — dieselbe Funktion ruft der
Endpunkt auf, den das Zahnrad in der Oberfläche bedient.
"""

from pathlib import Path

from django.conf import settings
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
        if optionen["ziel"]:
            ziel = Path(optionen["ziel"])
        else:
            ordner = Path(settings.WURZEL) / "sicherungen"
            ordner.mkdir(exist_ok=True)
            ziel = ordner / sicherung.archivname(timezone.localtime())

        sicherung.archiv_schreiben(ziel)

        groesse = ziel.stat().st_size / 1024
        self.stdout.write(self.style.SUCCESS(f"{ziel}  ({groesse:.0f} kB)"))
        self.stdout.write(
            "Enthalten: " + ", ".join(sicherung.MODELLE_IM_ARCHIV) + " und die Medien."
        )
