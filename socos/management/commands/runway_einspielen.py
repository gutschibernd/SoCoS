"""
Spielt einen Plan des Runway-Planers ein — den Export aus „Daten exportieren"
oder die rohe Datei, Vorgabe `daten/finance.json`.

**Warum ein Befehl und keine Migration:** Die Datei nennt Personen mit
Gehältern und Kunden mit Beträgen. Das gehört nach `daten/` (in `.gitignore`),
nicht in die Versionsgeschichte. In der Oberfläche geht dasselbe über
„Daten importieren".

Der Plan wird so übernommen, wie der Planer ihn öffnen würde
(`services/runway.normalisieren`). Ist-Kontostände der Datei werden **nicht**
übernommen — sie stehen in SoCoS als Kontostand auf dem Dashboard; der Befehl
sagt, wie viele es waren.

Gibt es schon einen Plan, weigert sich der Befehl; `--ersetzen` überschreibt
ihn (der alte Stand steht danach im Änderungsprotokoll).
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import Protokolleintrag, Runwayplan
from socos.services import runway

STANDARDDATEI = Path("daten/finance.json")


class Command(BaseCommand):
    help = "Spielt einen Runway-Plan aus daten/finance.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))
        parser.add_argument("--ersetzen", action="store_true", help="Einen vorhandenen Plan überschreiben.")

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")
        try:
            roh = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")
        inhalt = roh.get("plan") if isinstance(roh, dict) and roh.get("format") == "runway-planer" else roh
        if not isinstance(inhalt, dict) or not isinstance(inhalt.get("settings"), dict):
            raise CommandError(f"{pfad} enthält keinen Runway-Plan.")

        vorhanden = Runwayplan.objects.first()
        if vorhanden and not optionen["ersetzen"]:
            raise CommandError(
                "Es gibt schon einen Plan. Der Befehl vermischt nichts.\n"
                "Mit `--ersetzen` wird er überschrieben."
            )

        plan = runway.normalisieren(inhalt)
        with transaction.atomic():
            if vorhanden:
                unterschied = runway.unterschiede(runway.normalisieren(vorhanden.daten), plan)
                vorhanden.daten = plan
                vorhanden.save()
                if unterschied:
                    Protokolleintrag.schreiben(vorhanden, Protokolleintrag.Aktion.GEAENDERT, unterschied)
            else:
                Runwayplan.objects.create(daten=plan)

        ist = inhalt.get("actuals") or {}
        if ist:
            self.stdout.write(
                self.style.WARNING(
                    f"{len(ist)} Ist-Kontostände aus der Datei nicht übernommen — sie gehören als "
                    "Kontostand aufs Dashboard oder in die Ist-Zeile der Monatsübersicht."
                )
            )
        zahl = sum(len(plan[liste]) for liste in runway.LISTEN)
        self.stdout.write(self.style.SUCCESS(f"Eingespielt: Plan ab {plan['settings']['start'][:7]}, {zahl} Einträge."))
