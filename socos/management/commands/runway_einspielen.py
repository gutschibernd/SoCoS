"""
Spielt eine Runway-Planung aus dem Export des eigenständigen Runway-Planers ein
(der HTML-Datei, die vor dem Modul benutzt wurde) — Vorgabe
`daten/finance.json`.

**Warum ein Befehl und keine Migration:** Die Datei nennt Personen mit
Gehältern und Kunden mit Beträgen. Das gehört nach `daten/` (in `.gitignore`),
nicht in die Versionsgeschichte.

Was die Datei kennt, das Modul aber nicht rechnet (Investments, Rückzahlungen
von Förderungen, Kredite mit Raten), lässt den Befehl **abbrechen**, statt es
still wegzulassen: Ein Plan, dem ein Investment fehlt, sieht vollständig aus
und zeigt eine Lücke, die es nicht gibt. Einstellungen, die das Modul nicht
kennt (Umsatzsteuer, NeuFöG …), werden nur gemeldet — sie ändern eine Rechnung,
aber es geht kein eingetragener Betrag verloren.

Gibt es schon einen Plan, weigert sich der Befehl; `--ersetzen` entfernt Plan
und Posten zuerst — weich, wie alles.
"""

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos.models import Planposten, Runwayplan

STANDARDDATEI = Path("daten/finance.json")

RHYTHMUS = {"einmalig": "einmalig", "monatlich": "monatlich", "quartal": "quartal", "jaehrlich": "jaehrlich"}


def _betrag(wert, wo):
    if wert in (None, ""):
        return Decimal(0)
    try:
        return Decimal(str(wert))
    except InvalidOperation:
        raise CommandError(f"{wo}: {wert!r} ist kein Betrag.")


def _datum(wert, wo, pflicht=True):
    if not wert:
        if pflicht:
            raise CommandError(f"{wo}: ohne Datum.")
        return None
    try:
        return date.fromisoformat(str(wert)[:10])
    except ValueError:
        raise CommandError(f"{wo}: {wert!r} ist kein Datum.")


def _text(wert):
    return str(wert or "").strip()


class Command(BaseCommand):
    help = "Spielt eine Runway-Planung aus daten/finance.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))
        parser.add_argument(
            "--ersetzen",
            action="store_true",
            help="Den vorhandenen Plan samt Posten zuerst entfernen (weich).",
        )

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")
        try:
            daten = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")

        if Runwayplan.objects.exists() and not optionen["ersetzen"]:
            raise CommandError(
                "Es gibt schon einen Plan. Der Befehl vermischt nichts.\n"
                "Mit `--ersetzen` werden Plan und Posten zuerst entfernt (weich)."
            )

        # Alles vorher bauen und prüfen — ein halb eingespielter Plan hülfe niemandem.
        plan = self._plan(daten.get("settings") or {})
        posten = self._posten(daten)
        for p in posten:
            try:
                p.clean()
            except ValidationError as fehler:
                raise CommandError(f"{p.get_art_display()} „{p.name}“: {fehler.message_dict}")
        for hinweis in self._nicht_gerechnet(daten):
            self.stdout.write(self.style.WARNING(f"Wird nicht gerechnet: {hinweis}"))

        with transaction.atomic():
            if optionen["ersetzen"]:
                Planposten.objects.all().delete()
                Runwayplan.objects.all().delete()
            plan.save()
            for p in posten:
                p.save()

        self.stdout.write(self.style.SUCCESS(f"Eingespielt: Plan ab {plan.beginn:%m/%Y}, {len(posten)} Posten."))

    def _plan(self, s):
        return Runwayplan(
            beginn=_datum(s.get("start"), "Planbeginn"),
            monate=int(s.get("months") or 24),
            startkontostand=_betrag(s.get("cash"), "Kontostand"),
            puffer=_betrag(s.get("buffer"), "Puffer"),
            lohnnebenkosten=_betrag(s.get("lnk", 30), "Lohnnebenkosten"),
            vierzehn_gehaelter=bool(s.get("sonder", True)),
            abruf_monate=int(s.get("bridgeGroup") or 3),
        )

    def _posten(self, daten):
        if daten.get("investments"):
            raise CommandError(
                f"Die Datei enthält {len(daten['investments'])} Investment(s). Die rechnet das Modul "
                "noch nicht — eingespielt würde ein Plan, dem Geld fehlt."
            )
        posten = []
        for f in daten.get("foerderungen", []):
            for t in f.get("tranchen", []):
                wo = f"Förderung „{_text(f.get('name'))}“"
                if t.get("art") == "rueckzahlung":
                    raise CommandError(f"{wo}: Rückzahlungen von Förderungen rechnet das Modul noch nicht.")
                posten.append(
                    Planposten(
                        art=Planposten.Art.FOERDERUNG,
                        name=_text(f.get("name")) or "Förderung",
                        gruppe=_text(f.get("geber")),
                        notiz=_text(t.get("note")),
                        betrag=_betrag(t.get("amount"), wo),
                        von=_datum(t.get("date"), wo),
                        status=t.get("status") or Planposten.Status.GEPLANT,
                    )
                )
        for u in daten.get("umsaetze", []):
            wo = f"Umsatz „{_text(u.get('name'))}“"
            posten.append(
                Planposten(
                    art=Planposten.Art.UMSATZ,
                    name=_text(u.get("name")) or "Umsatz",
                    betrag=_betrag(u.get("amount"), wo),
                    rhythmus=RHYTHMUS.get(u.get("interval"), "einmalig"),
                    von=_datum(u.get("start"), wo),
                    bis=None if u.get("interval") == "einmalig" else _datum(u.get("end"), wo, pflicht=False),
                    wahrscheinlichkeit=int(u.get("prob") if u.get("prob") not in (None, "") else 100),
                )
            )
        for p in daten.get("team", []):
            wo = f"Person „{_text(p.get('name'))}“"
            posten.append(
                Planposten(
                    art=Planposten.Art.PERSON,
                    name=_text(p.get("name")) or "Mitarbeiter:in",
                    gruppe=_text(p.get("role")),
                    betrag=_betrag(p.get("gross"), wo),
                    rhythmus=Planposten.Rhythmus.MONATLICH,
                    von=_datum(p.get("start"), wo),
                    bis=_datum(p.get("end"), wo, pflicht=False),
                    lohnnebenkosten=None if p.get("lnk") in (None, "") else _betrag(p.get("lnk"), wo),
                )
            )
        for k in daten.get("kosten", []):
            wo = f"Kosten „{_text(k.get('name'))}“"
            posten.append(
                Planposten(
                    art=Planposten.Art.KOSTEN,
                    name=_text(k.get("name")) or "Kosten",
                    gruppe=_text(k.get("cat")),
                    betrag=_betrag(k.get("amount"), wo),
                    rhythmus=RHYTHMUS.get(k.get("interval"), "monatlich"),
                    von=_datum(k.get("start"), wo),
                    bis=None if k.get("interval") == "einmalig" else _datum(k.get("end"), wo, pflicht=False),
                )
            )
        for d in daten.get("darlehen", []):
            wo = f"Darlehen „{_text(d.get('name'))}“"
            if (d.get("typ") or "gesellschafter") != "gesellschafter" or d.get("tilgung") == "raten":
                raise CommandError(f"{wo}: Bankkredite und Ratentilgung rechnet das Modul noch nicht.")
            posten.append(
                Planposten(
                    art=Planposten.Art.DARLEHEN,
                    name=_text(d.get("name")) or "Gesellschafterdarlehen",
                    betrag=_betrag(d.get("amount"), wo),
                    von=_datum(d.get("date"), wo),
                    bis=_datum(d.get("repay"), wo, pflicht=False),
                    zins=_betrag(d.get("zins"), wo),
                )
            )
        return posten

    def _nicht_gerechnet(self, daten):
        s = daten.get("settings") or {}
        if s.get("ust"):
            yield "Umsatzsteuer und UVA"
        if Decimal(str(s.get("raise") or 0)):
            yield "jährliche Gehaltsanpassung"
        if Decimal(str(s.get("contingency") or 0)):
            yield "Sicherheitszuschlag auf Kosten"
        if (daten.get("neufoeg") or {}).get("aktiv"):
            yield "NeuFöG-Befreiung"
        if (daten.get("fp") or {}).get("aktiv"):
            yield "Forschungsprämie"
        if daten.get("actuals"):
            yield "Ist-Kontostände aus der Datei — sie kommen aus dem Dashboard"
        if any(Decimal(str(u.get("ziel") or 0)) for u in daten.get("umsaetze", [])):
            yield "Zahlungsziele bei Umsätzen"
