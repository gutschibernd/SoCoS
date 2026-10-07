"""
Spielt Förderprogramme samt Fragen, Anträgen und Arbeitspaketen aus einer
JSON-Datei ein — Vorgabe `daten/foerderungen.json`.

Die Datei ist entweder **ein** Programm oder `{"programme": [...]}`. Ein
Programm nennt seinen Fördergeber (`"geber": {"name": …, "kurz": …}`); den
gibt es danach einmal, gleich wie viele Programme ihn nennen. Ohne Angabe
kommt es unter das Land Niederösterreich — so war es, bevor es Fördergeber gab.

**Warum ein Befehl und keine Migration:** Die Anträge nennen den Förderwerber,
ein Pflegeheim, und Zahlen aus dessen Betrieb. Das gehört nach `daten/` (in
`.gitignore`) — eine Datenmigration stünde für immer in der Versionsgeschichte.

Die langen Texte eines Antrags stehen als `"abschnitte": [{"titel": …,
"text": …}]` — so viele und so benannt, wie das Programm sie verlangt.

Gibt es ein Programm mit demselben Namen schon, weigert sich der Befehl;
`--ersetzen` entfernt es zuerst — weich, wie alles, samt allem darunter.
"""

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import (
    Foerderabschnitt,
    Foerderantrag,
    Foerderfrage,
    Foerdergeber,
    Foerderpaket,
    Foerderposten,
    Foerderprogramm,
    Foerderstunden,
)

STANDARDDATEI = Path("daten/foerderungen.json")
STAENDE = {wert for wert, _ in Foerderantrag.Stand.choices}
OHNE_GEBER = {"name": "Land Niederösterreich", "kurz": "NÖ"}
# Bis 2026-10-07 hatte der Antrag diese Texte als feste Felder. Eine alte
# Datei würde sonst ohne ein Wort ohne sie eingespielt.
ALTE_TEXTE = ("nutzen", "mehrwert", "wirkung", "regelbetrieb")


def _text(wert):
    """Ein langer Text darf in der Datei als Liste von Zeilen stehen."""
    return "\n".join(wert) if isinstance(wert, list) else (wert or "")


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

        programme = daten["programme"] if "programme" in daten else [daten]
        for programm in programme:
            self._pruefen(programm)

        vorhanden = {}
        for programm in programme:
            name = programm["name"].strip()
            alt = Foerderprogramm.objects.filter(name=name).first()
            if alt and not optionen["ersetzen"]:
                raise CommandError(
                    f"„{name}“ gibt es schon. Der Befehl vermischt nichts.\n"
                    "Mit `--ersetzen` wird das vorhandene zuerst entfernt (weich)."
                )
            vorhanden[name] = alt

        with transaction.atomic():
            for programm in programme:
                if vorhanden[programm["name"].strip()]:
                    self._entfernen(vorhanden[programm["name"].strip()])
                zahl = self._einspielen(programm)
                self.stdout.write(self.style.SUCCESS(f"Eingespielt: {zahl}"))

    def _pruefen(self, daten):
        """Alles vorher — ein halb eingespielter Stand hülfe niemandem."""
        if not str(daten.get("name", "")).strip():
            raise CommandError("Das Programm braucht einen Namen.")
        if not str((daten.get("geber") or OHNE_GEBER).get("name", "")).strip():
            raise CommandError(f"{daten['name']}: Der Fördergeber braucht einen Namen.")
        _betrag(daten.get("max_foerderung"), "Programm")
        for i, a in enumerate(daten.get("antraege", []), start=1):
            if not str(a.get("titel", "")).strip():
                raise CommandError(f"Antrag {i}: ohne Titel.")
            if len(a["titel"]) > 200:
                raise CommandError(f"Antrag {i}: Die Kurzbezeichnung ist länger als 200 Zeichen.")
            alt = [k for k in ALTE_TEXTE if k in a]
            if alt:
                raise CommandError(
                    f"Antrag {i}: {', '.join(alt)} gibt es nicht mehr als Feld — "
                    'bitte als "abschnitte": [{"titel": …, "text": …}] angeben.'
                )
            for j, ab in enumerate(a.get("abschnitte", []), start=1):
                if not str(ab.get("titel", "")).strip():
                    raise CommandError(f"Antrag {i}, Abschnitt {j}: ohne Überschrift.")
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
            for abschnitt in Foerderabschnitt.objects.filter(antrag=antrag):
                abschnitt.delete()
            for posten in Foerderposten.objects.filter(antrag=antrag):
                posten.delete()
            for paket in Foerderpaket.objects.filter(antrag=antrag):
                for stunden in Foerderstunden.objects.filter(paket=paket):
                    stunden.delete()
                paket.delete()
            antrag.delete()
        for frage in Foerderfrage.objects.filter(programm=programm):
            frage.delete()
        programm.delete()

    def _einspielen(self, daten):
        angabe = daten.get("geber") or OHNE_GEBER
        geber, neu = Foerdergeber.objects.get_or_create(
            name=angabe["name"].strip(),
            defaults={k: angabe.get(k, "") for k in ("kurz", "link", "beschreibung")},
        )
        if not neu:
            # Was die Datei mitbringt, gilt — leer gelassene Angaben bleiben stehen.
            geaendert = [k for k in ("kurz", "link", "beschreibung") if angabe.get(k) and angabe[k] != getattr(geber, k)]
            for k in geaendert:
                setattr(geber, k, angabe[k])
            if geaendert:
                geber.save()
        programm = Foerderprogramm.objects.create(
            geber=geber,
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
                beschreibung=_text(a.get("beschreibung")),
                datenbedarf=_text(a.get("datenbedarf")),
            )
            for i, ab in enumerate(a.get("abschnitte", [])):
                Foerderabschnitt.objects.create(
                    antrag=antrag, titel=ab["titel"].strip(), text=_text(ab.get("text")), reihenfolge=i
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
        return f"„{programm.name}“ ({geber.name}) mit {len(fragen)} Fragen, {len(antraege)} Anträgen, {pakete} Arbeitspaketen"
