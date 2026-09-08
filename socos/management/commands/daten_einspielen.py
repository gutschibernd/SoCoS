"""
Spielt die echten Projektdaten aus `daten/` ein.

**Warum ein Befehl und keine Fixture und keine Migration:** Kunden- und
Personendaten dürfen nicht ins Repository. `daten/` steht in `.gitignore`; eine
Fixture oder eine Datenmigration stünde dagegen für immer in der
Versionsgeschichte, und kein `git rm` holt sie wieder heraus.

Der Befehl weigert sich, wenn schon Projekte da sind. Er soll keinen Bestand
vermischen — erst `probedaten --entfernen`, dann einspielen.
"""

import json
from pathlib import Path

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos import berechtigung
from socos.models import Arbeitspaket, Bereich, Bereichsart, Nutzer, Paketstatus, Projekt

STANDARDDATEI = Path("daten/sopharmis-daten.json")

# Was die Datei mitführt, aber nicht eingespielt wird. Beides bewusst:
#
# gebucht     Gebuchte Zeit wird aus den Zeitbuchungen gerechnet, nicht
#             gespeichert (CLAUDE.md). Eine Zahl aus dem Entwurf, die niemand
#             nachrechnen kann, wäre genau die Art Wert, die plausibel aussieht
#             und falsch ist.
# sonstiges   Standort und Side-Quests haben kein Modell. Sie hier in ein
#             fremdes zu pressen (Kontakt? Notiz?) wäre schlimmer als sie
#             stehen zu lassen.
NICHT_EINGESPIELT = ("gebucht", "sonstiges")


class Command(BaseCommand):
    help = "Spielt Team und Projekte aus daten/sopharmis-daten.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")

        try:
            daten = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")

        if Projekt.alle_objekte.exists():
            raise CommandError(
                "Es sind schon Projekte da. Der Befehl vermischt keine zwei Bestände.\n"
                "Erst `probedaten --entfernen`, wenn das wirklich gewollt ist."
            )

        self._pruefen(daten)

        with transaction.atomic():
            self._team(daten.get("team", []))
            self._projekte(daten.get("projekte", []))

        self.stdout.write(self.style.SUCCESS("Daten eingespielt."))

    # --- Prüfen ------------------------------------------------------------

    def _pruefen(self, daten):
        """
        Erst alles prüfen, dann alles schreiben.

        Ein unbekannter Status mitten im Einspielen bräche zwar die Transaktion
        ab — aber erst, nachdem die Hälfte durchgelaufen ist. Die Meldung nennt
        dann einen Titel und nicht alle Stellen, die noch anstehen.
        """
        stati = set(Paketstatus.values)
        arten = set(Bereichsart.values)
        fehler = []

        for projekt in daten.get("projekte", []):
            for bereich in projekt.get("bereiche", []):
                if bereich.get("art") not in arten:
                    fehler.append(
                        f"Bereich „{bereich.get('titel')}“: art={bereich.get('art')!r} "
                        f"— erlaubt: {', '.join(sorted(arten))}"
                    )
                for paket in bereich.get("pakete", []):
                    if paket.get("status") not in stati:
                        fehler.append(
                            f"Paket „{paket.get('titel')}“: status={paket.get('status')!r} "
                            f"— erlaubt: {', '.join(sorted(stati))}"
                        )

        for person in daten.get("team", []):
            if not person.get("email"):
                fehler.append(f"Team „{person.get('name')}“: keine E-Mail-Adresse.")
            if person.get("rolle") not in berechtigung.ALLE_ROLLEN:
                fehler.append(
                    f"Team „{person.get('name')}“: rolle={person.get('rolle')!r} "
                    f"— erlaubt: {', '.join(berechtigung.ALLE_ROLLEN)}"
                )

        if fehler:
            raise CommandError("Die Datei passt nicht zum Modell:\n  " + "\n  ".join(fehler))

    # --- Team --------------------------------------------------------------

    def _team(self, team):
        """
        Konten **ohne** Passwort. Anmeldbar wird eines erst mit
        `nutzer_passwort`. Wer schon da ist, bleibt unverändert — der Befehl
        fasst kein bestehendes Konto an.
        """
        for person in team:
            email = person["email"].strip().lower()
            if Nutzer.objects.filter(email=email).exists():
                self.stdout.write(f"  Konto gibt es schon, unverändert: {email}")
                continue

            nutzer = Nutzer.objects.create_user(
                email=email,
                name=person["name"],
                initialen=person.get("initialen", ""),
                farbe=person.get("farbe", "#BFD9CE"),
            )
            if person["rolle"] == berechtigung.ADMIN:
                nutzer.is_staff = True
                nutzer.save(update_fields=["is_staff"])
            nutzer.groups.add(Group.objects.get(name=person["rolle"]))

            self.stdout.write(
                f"  Konto angelegt: {nutzer.name} <{email}> als {person['rolle']} "
                f"— noch kein Passwort"
            )

    # --- Projekte ----------------------------------------------------------

    def _projekte(self, projekte):
        for nr, eintrag in enumerate(projekte):
            projekt = Projekt.objects.create(
                titel=eintrag["titel"],
                untertitel=eintrag.get("untertitel", ""),
                farbe=eintrag.get("farbe", "#14595F"),
                reihenfolge=nr,
            )
            for b_nr, b in enumerate(eintrag.get("bereiche", [])):
                bereich = Bereich.objects.create(
                    projekt=projekt, titel=b["titel"], art=b["art"], reihenfolge=b_nr,
                )
                for p_nr, p in enumerate(b.get("pakete", [])):
                    Arbeitspaket.objects.create(
                        bereich=bereich,
                        titel=p["titel"],
                        status=p["status"],
                        notiz=p.get("notiz", ""),
                        reihenfolge=p_nr,
                    )
            self.stdout.write(
                f"  {projekt.titel}: {projekt.bereiche.count()} Bereiche, "
                f"{Arbeitspaket.objects.filter(bereich__projekt=projekt).count()} Pakete"
            )

        self.stdout.write(
            "  nicht eingespielt (siehe NICHT_EINGESPIELT im Befehl): "
            + ", ".join(NICHT_EINGESPIELT)
        )
