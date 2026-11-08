"""
Spielt die Eingänge hinter dem Diamanten (`socos/bisher.py`) aus
`daten/bisher.json` ein — oder, mit `--datei -`, von stdin. So kommt die
Datei vom Mac über ssh direkt in den Container, ohne Zwischenablage am Server
(`skripte/bisher_uebertragen.command`).

**Warum ein Befehl und keine Migration:** Die Beträge gehören nicht ins
Repository; eine Datenmigration stünde für immer in der Versionsgeschichte.

Die Datei ist der Stand. Zeile *n* der Datei ist der Eingang mit
`reihenfolge` *n*: Was sich geändert hat, wird geändert (das Protokoll zeigt
alt → neu), was neu ist, angelegt, und was in der Datei nicht mehr steht,
weich entfernt. Zweimal hintereinander eingespielt ändert nichts.

    {"posten": [{"von": "Geber", "wofuer": "wofür", "betrag": "1234.50"}, …]}

Der Betrag steht als Zeichenkette in der Datei — als Zahl ginge er durch
Gleitkomma, bevor er beim Decimal ankommt.
"""

import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import Eingang

STANDARDDATEI = "daten/bisher.json"


class Command(BaseCommand):
    help = "Spielt die Eingänge hinter dem Diamanten aus daten/bisher.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=STANDARDDATEI, help="Pfad, oder - für stdin.")

    def handle(self, *args, **optionen):
        posten = self._lesen(optionen["datei"])

        angelegt = geaendert = entfernt = 0
        with transaction.atomic():
            vorhanden = {e.reihenfolge: e for e in Eingang.objects.all()}
            for nummer, p in enumerate(posten):
                eingang = vorhanden.pop(nummer, None)
                if eingang is None:
                    Eingang.objects.create(reihenfolge=nummer, **p)
                    angelegt += 1
                elif any(getattr(eingang, feld) != wert for feld, wert in p.items()):
                    for feld, wert in p.items():
                        setattr(eingang, feld, wert)
                    eingang.save()
                    geaendert += 1
            # Einzeln und weich — damit das Protokoll jedes Stück nennt.
            for eingang in vorhanden.values():
                eingang.delete()
                entfernt += 1

        self.stdout.write(
            self.style.SUCCESS(f"{len(posten)} Eingänge — angelegt {angelegt}, geändert {geaendert}, entfernt {entfernt}.")
        )

    def _lesen(self, datei):
        """Alles prüfen, bevor etwas geschrieben wird — ein halb eingespielter Stand hülfe niemandem."""
        try:
            text = sys.stdin.read() if datei == "-" else Path(datei).read_text(encoding="utf-8")
        except FileNotFoundError:
            raise CommandError(f"{datei} gibt es nicht.")
        try:
            daten = json.loads(text)
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{datei} ist kein gültiges JSON: {fehler}")

        roh = daten.get("posten") if isinstance(daten, dict) else None
        if not roh:
            raise CommandError("Es steht kein einziger Posten in der Datei.")

        posten = []
        for nummer, p in enumerate(roh, start=1):
            von = str(p.get("von", "")).strip()
            betrag = p.get("betrag")
            if not von:
                raise CommandError(f"Posten {nummer}: „von“ fehlt.")
            if not isinstance(betrag, str):
                raise CommandError(f"Posten {nummer}: Der Betrag muss als Zeichenkette dastehen, z. B. \"700.00\".")
            try:
                wert = Decimal(betrag).quantize(Decimal("0.01"))
            except InvalidOperation:
                raise CommandError(f"Posten {nummer}: „{betrag}“ ist kein Betrag.")
            posten.append({"von": von, "wofuer": str(p.get("wofuer", "")).strip(), "betrag": wert})
        return posten
