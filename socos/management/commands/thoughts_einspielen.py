"""
Spielt die Karte von Thoughts aus `daten/thoughts.json` ein.

Das Format ist das des Entwurfs (`entwurf/module/Lagekarte.html`): Themen,
Knoten und Kanten mit eigenen, kurzen Kennungen („gr", „gv"). So lässt sich
eine im Entwurf erarbeitete Karte ohne Umschreiben übernehmen.

**Warum ein Befehl und keine Migration:** Die Karte nennt Personen und
Vorhaben. Sie gehört nach `daten/` (in `.gitignore`) — eine Datenmigration
stünde für immer in der Versionsgeschichte.

Der Befehl vermischt keine zwei Karten. Steht schon etwas auf der Karte,
weigert er sich; `--ersetzen` löscht den alten Stand zuerst — weich, wie
alles.
"""

import json
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import Lageschritt, Lagethema, Lageverbindung
from socos.services import lagekarte

STANDARDDATEI = Path("daten/thoughts.json")

ARTEN = {wert for wert, _ in Lageschritt.Art.choices}


class Command(BaseCommand):
    help = "Spielt die Karte von Thoughts aus daten/thoughts.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))
        parser.add_argument(
            "--ersetzen",
            action="store_true",
            help="Die Karte, die schon da ist, zuerst entfernen (weich).",
        )

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")
        try:
            daten = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")

        themen = daten.get("themen", [])
        knoten = daten.get("knoten", [])
        kanten = daten.get("kanten", [])
        self._pruefen(themen, knoten, kanten)

        belegt = Lagethema.objects.exists() or Lageschritt.objects.exists()
        if belegt and not optionen["ersetzen"]:
            raise CommandError(
                "Auf der Karte steht schon etwas. Der Befehl vermischt keine zwei Karten.\n"
                "Mit `--ersetzen` wird die vorhandene zuerst entfernt (weich)."
            )

        with transaction.atomic():
            if belegt:
                entfernt = self._leeren()
                self.stdout.write(f"Entfernt (weich): {entfernt}")
            zahl = self._einspielen(themen, knoten, kanten)

        self.stdout.write(self.style.SUCCESS(f"Eingespielt: {zahl}"))

    # --- Prüfen ------------------------------------------------------------

    def _pruefen(self, themen, knoten, kanten):
        """Alles vorher — ein halb eingespielter Stand hülfe niemandem."""
        themen_ids = [t.get("id") for t in themen]
        knoten_ids = [k.get("id") for k in knoten]
        for name, ids in (("Themen", themen_ids), ("Knoten", knoten_ids)):
            if None in ids or len(set(ids)) != len(ids):
                raise CommandError(f"{name}: Jede Kennung muss da und eindeutig sein.")
        for t in themen:
            if not str(t.get("name", "")).strip():
                raise CommandError(f"Thema {t['id']}: ohne Namen.")
            if not 1 <= int(t.get("farbe", 1)) <= 8:
                raise CommandError(f"Thema {t['id']}: Farbe muss 1 bis 8 sein.")
        for k in knoten:
            if not str(k.get("titel", "")).strip():
                raise CommandError(f"Knoten {k['id']}: ohne Titel.")
            if k.get("thema") and k["thema"] not in themen_ids:
                raise CommandError(f"Knoten {k['id']}: Thema {k['thema']} gibt es nicht.")
            if k.get("art", "schritt") not in ARTEN:
                raise CommandError(f"Knoten {k['id']}: Art {k['art']} gibt es nicht.")
            if k.get("frist"):
                try:
                    date.fromisoformat(k["frist"])
                except ValueError:
                    raise CommandError(f"Knoten {k['id']}: Frist {k['frist']} ist kein Datum.")
        paare = set()
        for v in kanten:
            paar = (v.get("von"), v.get("nach"))
            if paar[0] not in knoten_ids or paar[1] not in knoten_ids:
                raise CommandError(f"Kante {paar[0]} → {paar[1]}: ein Ende gibt es nicht.")
            if paar[0] == paar[1] or paar in paare:
                raise CommandError(f"Kante {paar[0]} → {paar[1]}: auf sich selbst oder doppelt.")
            paare.add(paar)

    # --- Schreiben ---------------------------------------------------------

    def _leeren(self):
        """Weich, einzeln — damit das Protokoll jedes Stück nennt."""
        zahl = {"Verbindungen": 0, "Schritte": 0, "Themen": 0}
        for name, modell in (("Verbindungen", Lageverbindung), ("Schritte", Lageschritt), ("Themen", Lagethema)):
            for objekt in modell.objects.all():
                objekt.delete()
                zahl[name] += 1
        return ", ".join(f"{n} {name}" for name, n in zahl.items())

    def _einspielen(self, themen, knoten, kanten):
        thema_zu = {}
        for t in themen:
            thema_zu[t["id"]] = Lagethema.objects.create(
                name=t["name"].strip(), farbe=int(t.get("farbe", 1)), x=int(t.get("x", 0)), y=int(t.get("y", 0))
            )
        schritt_zu = {}
        for k in knoten:
            schritt_zu[k["id"]] = Lageschritt.objects.create(
                thema=thema_zu.get(k.get("thema")),
                titel=k["titel"].strip(),
                art=k.get("art", "schritt"),
                # Der Entwurf kannte einmal „läuft" und „wartet". Beides ist
                # heute offen: „wartet" folgt aus den Pfeilen.
                status="erledigt" if k.get("status") == "erledigt" else "offen",
                frist=k.get("frist") or None,
                notiz=k.get("notiz", ""),
                x=int(k.get("x", 0)),
                y=int(k.get("y", 0)),
            )
        for v in kanten:
            von, nach = schritt_zu[v["von"]], schritt_zu[v["nach"]]
            if lagekarte.ergaebe_kreis(von.pk, nach.pk):
                raise CommandError(f"Kante {v['von']} → {v['nach']} schlösse einen Kreis.")
            Lageverbindung.objects.create(von=von, nach=nach, text=v.get("text", ""))
        return f"{len(themen)} Themen, {len(knoten)} Schritte, {len(kanten)} Verbindungen"
