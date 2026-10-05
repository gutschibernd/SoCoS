"""
Spielt ein Förderprogramm samt Fragen, Anträgen und Arbeitspaketen aus
`daten/foerderungen.json` ein.

**Warum ein Befehl und keine Migration:** Die Anträge nennen den Förderwerber,
ein Pflegeheim, und Zahlen aus dessen Betrieb. Das gehört nach `daten/` (in
`.gitignore`) — eine Datenmigration stünde für immer in der Versionsgeschichte.

Gibt es ein Programm mit demselben Namen schon, weigert sich der Befehl;
`--ersetzen` entfernt es zuerst — weich, wie alles, samt allem darunter.
"""

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import Foerderantrag, Foerderfrage, Foerderpaket, Foerderprogramm

STANDARDDATEI = Path("daten/foerderungen.json")
STAENDE = {wert for wert, _ in Foerderantrag.Stand.choices}


def _betrag(wert, wo):
    if wert in (None, ""):
        return None
    try:
        return Decimal(str(wert))
    except InvalidOperation:
        raise CommandError(f"{wo}: {wert!r} ist kein Betrag.")


class Command(BaseCommand):
    help = "Spielt ein Förderprogramm aus daten/foerderungen.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))
        parser.add_argument(
            "--ersetzen",
            action="store_true",
            help="Ein gleichnamiges Programm zuerst entfernen (weich).",
        )

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")
        try:
            daten = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")

        self._pruefen(daten)
        name = daten["name"].strip()
        vorhanden = Foerderprogramm.objects.filter(name=name).first()
        if vorhanden and not optionen["ersetzen"]:
            raise CommandError(
                f"„{name}“ gibt es schon. Der Befehl vermischt nichts.\n"
                "Mit `--ersetzen` wird das vorhandene zuerst entfernt (weich)."
            )

        with transaction.atomic():
            if vorhanden:
                self._entfernen(vorhanden)
            zahl = self._einspielen(daten)
        self.stdout.write(self.style.SUCCESS(f"Eingespielt: {zahl}"))

    def _pruefen(self, daten):
        """Alles vorher — ein halb eingespielter Stand hülfe niemandem."""
        if not str(daten.get("name", "")).strip():
            raise CommandError("Das Programm braucht einen Namen.")
        _betrag(daten.get("max_foerderung"), "Programm")
        for i, a in enumerate(daten.get("antraege", []), start=1):
            if not str(a.get("titel", "")).strip():
                raise CommandError(f"Antrag {i}: ohne Titel.")
            if len(a["titel"]) > 200:
                raise CommandError(f"Antrag {i}: Die Kurzbezeichnung ist länger als 200 Zeichen.")
            if a.get("stand", "entwurf") not in STAENDE:
                raise CommandError(f"Antrag {i}: Stand {a['stand']} gibt es nicht.")
            if a.get("beginn"):
                try:
                    date.fromisoformat(a["beginn"])
                except ValueError:
                    raise CommandError(f"Antrag {i}: Beginn {a['beginn']} ist kein Datum.")
            for j, p in enumerate(a.get("pakete", []), start=1):
                wo = f"Antrag {i}, Paket {j}"
                if not str(p.get("titel", "")).strip():
                    raise CommandError(f"{wo}: ohne Titel.")
                von, bis = int(p.get("von", 1)), int(p.get("bis", p.get("von", 1)))
                if von < 1 or bis < von:
                    raise CommandError(f"{wo}: Monate {von}–{bis} gehen nicht.")
                _betrag(p.get("betrag"), wo)

    def _entfernen(self, programm):
        """Weich und einzeln, damit das Protokoll jedes Stück nennt."""
        for antrag in Foerderantrag.objects.filter(programm=programm):
            for paket in Foerderpaket.objects.filter(antrag=antrag):
                paket.delete()
            antrag.delete()
        for frage in Foerderfrage.objects.filter(programm=programm):
            frage.delete()
        programm.delete()

    def _einspielen(self, daten):
        programm = Foerderprogramm.objects.create(
            name=daten["name"].strip(),
            stelle=daten.get("stelle", ""),
            link=daten.get("link", ""),
            max_foerderung=_betrag(daten.get("max_foerderung"), "Programm"),
            max_monate=daten.get("max_monate"),
            steckbrief="\n".join(daten.get("steckbrief", [])),
        )
        fragen = daten.get("fragen", [])
        for i, f in enumerate(fragen):
            Foerderfrage.objects.create(
                programm=programm,
                frage=f["frage"].strip(),
                antwort=f.get("antwort", ""),
                # Fehlt der Haken in der Datei, gilt: beantwortet, wenn eine Antwort dasteht.
                beantwortet=f.get("beantwortet", bool(f.get("antwort", "").strip())),
                quelle=f.get("quelle", ""),
                reihenfolge=i,
            )
        antraege = daten.get("antraege", [])
        pakete = 0
        for nummer, a in enumerate(antraege, start=1):
            antrag = Foerderantrag.objects.create(
                programm=programm,
                nummer=a.get("nummer", nummer),
                titel=a["titel"].strip(),
                stand=a.get("stand", "entwurf"),
                foerderwerber=a.get("foerderwerber", ""),
                beginn=a.get("beginn") or None,
                **{feld: "\n".join(a[feld]) if isinstance(a.get(feld), list) else a.get(feld, "")
                   for feld in ("beschreibung", "nutzen", "mehrwert", "wirkung", "regelbetrieb", "datenbedarf")},
            )
            for i, p in enumerate(a.get("pakete", [])):
                Foerderpaket.objects.create(
                    antrag=antrag,
                    titel=p["titel"].strip(),
                    ziel=p.get("ziel", ""),
                    ergebnis=p.get("ergebnis", ""),
                    von=int(p.get("von", 1)),
                    bis=int(p.get("bis", p.get("von", 1))),
                    betrag=_betrag(p.get("betrag"), "Paket"),
                    reihenfolge=i,
                )
                pakete += 1
        return f"„{programm.name}“ mit {len(fragen)} Fragen, {len(antraege)} Anträgen, {pakete} Arbeitspaketen"
