"""
Schreibt die Symboldateien nach `statisch/`.

Sie liegen im Repository, damit ein Server sie nicht bauen muss. Der Befehl
wird gebraucht, wenn sich am Signet etwas ändert — dann in socos/marke.py, und
danach hier durch.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from socos import marke


class Command(BaseCommand):
    help = "Erzeugt favicon.svg, favicon.ico und apple-touch-icon.png in statisch/."

    def handle(self, *args, **optionen):
        ziel = settings.WURZEL / "statisch"
        ziel.mkdir(exist_ok=True)

        (ziel / "favicon.svg").write_text(marke.als_svg(), encoding="utf-8")

        # Ein ICO mit drei Größen darin — für Browser ohne SVG-Favicon und für
        # die Lesezeichenleiste, die 48 px zieht.
        marke.als_bild(256).save(ziel / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

        # Ohne Transparenz und ohne eigene Rundung: iOS rundet selbst, und ein
        # zweites Mal gerundet sieht aus wie ein Fehler.
        marke.als_bild(180).save(ziel / "apple-touch-icon.png")

        for datei in sorted(ziel.iterdir()):
            self.stdout.write(f"{datei.name}  {datei.stat().st_size} Bytes")
