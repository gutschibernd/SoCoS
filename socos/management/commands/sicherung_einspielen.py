"""
Spielt ein Archiv zurück. **Ersetzt den Bestand** — deshalb nur mit
ausdrücklicher Bestätigung.

Was dabei passiert, steht in `socos/sicherung.py`; hier steht nur die
Nachfrage.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

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

        try:
            geleert = sicherung.archiv_einspielen(archivpfad)
        except sicherung.ArchivFehler as fehler:
            raise CommandError(str(fehler))

        for bezeichner, anzahl in geleert:
            self.stdout.write(f"geleert: {bezeichner} ({anzahl})")
        self.stdout.write(self.style.SUCCESS(f"{archivpfad} eingespielt."))
