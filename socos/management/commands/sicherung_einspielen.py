"""
Spielt ein Archiv zurück. **Ersetzt den Bestand** — deshalb nur mit
ausdrücklicher Bestätigung.
"""

import shutil
import tarfile
import tempfile
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos import sicherung


class Command(BaseCommand):
    help = "Spielt ein Archiv aus sicherung_erstellen zurück. Ersetzt den Bestand."

    def add_arguments(self, parser):
        parser.add_argument("archiv")
        parser.add_argument(
            "--ja-bestand-ersetzen",
            action="store_true",
            help="Ohne diesen Schalter passiert nichts.",
        )

    def handle(self, *args, **optionen):
        archivpfad = Path(optionen["archiv"])
        if not archivpfad.exists():
            raise CommandError(f"{archivpfad} gibt es nicht.")

        if not optionen["ja_bestand_ersetzen"]:
            raise CommandError(
                "Dieser Befehl löscht den gesamten Bestand und ersetzt ihn durch "
                "das Archiv. Wenn das gewollt ist: --ja-bestand-ersetzen anhängen."
            )

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            with tarfile.open(archivpfad, "r:gz") as archiv:
                # filter="data" wehrt Pfade ab, die aus dem Zielordner
                # herausführen. Ein Archiv ist eine fremde Datei.
                archiv.extractall(tmp, filter="data")

            datenbank = tmp / sicherung.DATENBANK_IM_ARCHIV
            if not datenbank.exists():
                raise CommandError(
                    f"{archivpfad} enthält kein {sicherung.DATENBANK_IM_ARCHIV}. "
                    "Ist das ein Archiv aus sicherung_erstellen?"
                )

            with transaction.atomic():
                for bezeichner in sicherung.LOESCHREIHENFOLGE:
                    modell = apps.get_model(bezeichner)
                    menge = getattr(modell, "alle_objekte", modell.objects).all()
                    # Hart löschen: ein weiches ließe die alten Zeilen stehen und
                    # das Einspielen liefe auf doppelte Schlüssel.
                    anzahl = (
                        menge.hart_loeschen()
                        if hasattr(menge, "hart_loeschen")
                        else menge.delete()
                    )
                    self.stdout.write(f"geleert: {bezeichner} ({anzahl})")

                call_command("loaddata", str(datenbank), verbosity=0)

            medien_quelle = tmp / sicherung.MEDIEN_IM_ARCHIV
            medien_ziel = Path(settings.MEDIA_ROOT)
            if medien_quelle.exists():
                if medien_ziel.exists():
                    shutil.rmtree(medien_ziel)
                shutil.copytree(medien_quelle, medien_ziel)

        self.stdout.write(self.style.SUCCESS(f"{archivpfad} eingespielt."))
