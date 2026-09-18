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
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos import berechtigung
from socos.models import (
    Arbeitspaket,
    Nutzer,
    Paketstatus,
    Pensum,
    Phasenart,
    Projekt,
    Projektphase,
)

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

#: Wohin eine Phase rückt, die nicht mehr in der Datei steht, aber wegen
#: gebuchter Zeit nicht entfernt werden kann. Hoch genug, dass sie hinter
#: allem steht, was aus der Datei kommt.
RESTPLATZ = 900


class Command(BaseCommand):
    help = "Spielt Team und Projekte aus daten/sopharmis-daten.json ein."

    def add_arguments(self, parser):
        parser.add_argument("--datei", default=str(STANDARDDATEI))
        parser.add_argument(
            "--abgleichen",
            action="store_true",
            help=(
                "Einen bestehenden Bestand nachziehen, statt auf eine leere "
                "Datenbank einzuspielen. Erkennt Projekte, Phasen und Pakete am "
                "Titel."
            ),
        )

    def handle(self, *args, **optionen):
        pfad = Path(optionen["datei"])
        if not pfad.exists():
            raise CommandError(f"{pfad} gibt es nicht.")

        try:
            daten = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as fehler:
            raise CommandError(f"{pfad} ist kein gültiges JSON: {fehler}")

        if Projekt.alle_objekte.exists() and not optionen["abgleichen"]:
            raise CommandError(
                "Es sind schon Projekte da. Der Befehl vermischt keine zwei Bestände.\n"
                "Entweder `--abgleichen`, um den Bestand aus der Datei nachzuziehen,\n"
                "oder `probedaten --entfernen`, wenn wirklich alles weg soll."
            )

        self._pruefen(daten)

        with transaction.atomic():
            self._team(daten.get("team", []))
            if optionen["abgleichen"]:
                self._abgleichen(daten.get("projekte", []))
            else:
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
        arten = set(Phasenart.values)
        # Aus der **Datei**, nicht aus der Datenbank: Team und Projekte werden
        # im selben Durchgang geschrieben, und geprüft wird vor dem ersten
        # Schreiben. Ein Konto, das erst gleich entsteht, ist hier schon gültig.
        bekannte_initialen = {
            person.get("initialen") for person in daten.get("team", []) if person.get("initialen")
        }
        fehler = []

        for projekt in daten.get("projekte", []):
            # Die Ebene hieß bis 2026-09-18 „bereiche". Eine Datei von damals
            # liefe sonst durch und legte ein Projekt **ohne jede Phase** an —
            # ein leerer Baum sieht nicht nach einem Fehler aus, sondern nach
            # einem Projekt, das noch niemand gegliedert hat.
            if "bereiche" in projekt:
                fehler.append(
                    f"Projekt „{projekt.get('titel')}“: „bereiche“ heißt jetzt „phasen“."
                )
            for phase in projekt.get("phasen", []):
                if phase.get("art") not in arten:
                    fehler.append(
                        f"Projektphase „{phase.get('titel')}“: art={phase.get('art')!r} "
                        f"— erlaubt: {', '.join(sorted(arten))}"
                    )
                for feld in ("von", "bis"):
                    if (wert := phase.get(feld)) is not None:
                        try:
                            date.fromisoformat(wert)
                        except (TypeError, ValueError):
                            fehler.append(
                                f"Projektphase „{phase.get('titel')}“: {feld}={wert!r} "
                                f"— erwartet JJJJ-MM-TT"
                            )
                for paket in phase.get("pakete", []):
                    if paket.get("status") not in stati:
                        fehler.append(
                            f"Paket „{paket.get('titel')}“: status={paket.get('status')!r} "
                            f"— erlaubt: {', '.join(sorted(stati))}"
                        )
                    # Die Pensen stehen als {Initialen: Stunden}. Geprüft wird
                    # **hier** und nicht beim Schreiben: Ein Tippfehler in den
                    # Initialen legte sonst kein Pensum an, und das Paket stünde
                    # hinterher auf null Stunden — ohne dass irgendwo etwas fehlt.
                    for initialen, stunden in (paket.get("pensen") or {}).items():
                        if initialen not in bekannte_initialen:
                            fehler.append(
                                f"Paket „{paket.get('titel')}“: „{initialen}“ steht in "
                                f"keinem Team-Eintrag — bekannt: "
                                f"{', '.join(sorted(bekannte_initialen)) or '(keine)'}"
                            )
                        try:
                            if Decimal(str(stunden)) <= 0:
                                raise InvalidOperation
                        except (InvalidOperation, ValueError):
                            fehler.append(
                                f"Paket „{paket.get('titel')}“, {initialen}: "
                                f"stunden={stunden!r} — erwartet eine Zahl über null "
                                f"als Zeichenkette."
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
            for ph_nr, ph in enumerate(eintrag.get("phasen", [])):
                phase = Projektphase.objects.create(
                    projekt=projekt,
                    titel=ph["titel"],
                    art=ph["art"],
                    reihenfolge=ph_nr,
                    von=self._datum(ph.get("von")),
                    bis=self._datum(ph.get("bis")),
                    abgeschlossen=bool(ph.get("abgeschlossen")),
                )
                for p_nr, p in enumerate(ph.get("pakete", [])):
                    paket = Arbeitspaket.objects.create(
                        phase=phase,
                        titel=p["titel"],
                        status=p["status"],
                        beschreibung=p.get("beschreibung", ""),
                        reihenfolge=p_nr,
                    )
                    self._pensen(paket, p.get("pensen") or {})
            self.stdout.write(
                f"  {projekt.titel}: {projekt.phasen.count()} Projektphasen, "
                f"{Arbeitspaket.objects.filter(phase__projekt=projekt).count()} Pakete"
            )

        self.stdout.write(
            "  nicht eingespielt (siehe NICHT_EINGESPIELT im Befehl): "
            + ", ".join(NICHT_EINGESPIELT)
        )

    # --- Abgleichen --------------------------------------------------------

    def _abgleichen(self, projekte):
        """
        Einen bestehenden Bestand aus der Datei nachziehen.

        **Wiedererkannt wird am Titel**, nicht an der `id` aus der Datei: Die
        steht nirgends in der Datenbank, und ein zweites Feld nur zum
        Wiederfinden wäre ein Schlüssel, den niemand pflegt und der beim
        ersten Umbenennen in der Oberfläche falsch ist.

        **Was in der Datei fehlt, wird weich gelöscht** — Phasen wie Pakete.
        Ein Abgleich, der nur hinzufügt, hinterlässt beim zweiten Durchgang
        eine Gliederung, die niemand so entschieden hat. Weich, weil es hartes
        Löschen hier nicht gibt: Zeit, die an einem entfernten Paket hängt,
        bleibt liegen und lässt sich umbuchen.
        """
        for nr, eintrag in enumerate(projekte):
            projekt = Projekt.objects.filter(titel=eintrag["titel"]).first()
            if projekt is None:
                self.stdout.write(f"  neu: {eintrag['titel']}")
                projekt = Projekt.objects.create(
                    titel=eintrag["titel"],
                    untertitel=eintrag.get("untertitel", ""),
                    farbe=eintrag.get("farbe", "#14595F"),
                    reihenfolge=nr,
                )

            behalten = []
            for ph_nr, ph in enumerate(eintrag.get("phasen", [])):
                phase = projekt.phasen.filter(
                    titel=ph["titel"], geloescht_am__isnull=True
                ).first()
                if phase is None:
                    phase = Projektphase(projekt=projekt, titel=ph["titel"])
                phase.art = ph["art"]
                phase.reihenfolge = ph_nr
                phase.von = self._datum(ph.get("von"))
                phase.bis = self._datum(ph.get("bis"))
                phase.abgeschlossen = bool(ph.get("abgeschlossen"))
                phase.save()
                behalten.append(phase.pk)
                self._pakete_abgleichen(phase, ph.get("pakete", []))

            for phase in projekt.phasen.filter(geloescht_am__isnull=True).exclude(
                pk__in=behalten
            ):
                # Die Pakete zuerst: Sonst stünde eine gelöschte Phase mit
                # lebenden Paketen da, und die blieben buchbar.
                self._pakete_abgleichen(phase, [])
                if phase.pakete.filter(geloescht_am__isnull=True).exists():
                    # Ans Ende, nicht an ihre alte Stelle: Sonst steht ein Rest
                    # mitten in der Kette und behauptet dort eine Position in
                    # der Abfolge, die er nicht mehr hat.
                    phase.reihenfolge = RESTPLATZ
                    phase.save(update_fields=["reihenfolge", "geaendert_am"])
                    self.stdout.write(
                        self.style.WARNING(
                            f"    Phase „{phase.titel}“ bleibt stehen und rückt ans "
                            f"Ende — es hängen noch Pakete daran, die nicht entfernt "
                            f"werden konnten."
                        )
                    )
                    continue
                phase.delete()
                self.stdout.write(f"    entfernt: Phase „{phase.titel}“")

            self.stdout.write(
                f"  {projekt.titel}: {projekt.phasen.filter(geloescht_am__isnull=True).count()} "
                f"Projektphasen, "
                f"{Arbeitspaket.objects.filter(phase__projekt=projekt, geloescht_am__isnull=True).count()} "
                f"Pakete"
            )

        self.stdout.write(
            "  nicht abgeglichen (siehe NICHT_EINGESPIELT im Befehl): "
            + ", ".join(NICHT_EINGESPIELT)
        )

    def _pakete_abgleichen(self, phase, pakete):
        behalten = []
        for nr, p in enumerate(pakete):
            paket = phase.pakete.filter(titel=p["titel"], geloescht_am__isnull=True).first()
            if paket is None:
                paket = Arbeitspaket(phase=phase, titel=p["titel"])
            paket.status = p["status"]
            paket.beschreibung = p.get("beschreibung", "")
            paket.reihenfolge = nr
            paket.save()
            behalten.append(paket.pk)
            self._pensen(paket, p.get("pensen") or {})

        for paket in phase.pakete.filter(geloescht_am__isnull=True).exclude(pk__in=behalten):
            self._paket_entfernen(paket)

    def _paket_entfernen(self, paket):
        """
        Ein Paket, das nicht mehr in der Datei steht.

        **Zeit hält es fest.** `on_delete=PROTECT` steht zwischen Buchung und
        Paket, und weiches Löschen prüft das ausdrücklich nach (siehe
        `geschuetzte_verweise`) — sonst wären die Buchungen Waisen: in keiner
        Liste mehr sichtbar, aber weiter im Zeitnachweis.

        Hängt Zeit daran, wird das Paket deshalb **nicht** gelöscht, sondern
        auf „verworfen" gesetzt. Damit nimmt es keine neue Zeit mehr an
        (`grund_gegen_buchung`), und die alte bleibt auffindbar und lässt sich
        umbuchen. Der Befehl sagt es laut; still wegzuräumen wäre hier das
        Falsche, weil die Entscheidung — umbuchen oder stehenlassen — eine
        fachliche ist.

        Unteraufgaben gehen mit: Sie hängen an nichts außer diesem Paket.
        """
        paket.pensen.filter(geloescht_am__isnull=True).delete()
        paket.unteraufgaben.filter(geloescht_am__isnull=True).delete()

        gebucht = paket.zeitbuchungen.filter(geloescht_am__isnull=True).count()
        if gebucht:
            paket.status = Paketstatus.VERWORFEN
            paket.save(update_fields=["status", "geaendert_am"])
            self.stdout.write(
                self.style.WARNING(
                    f"    Paket „{paket.titel}“ steht nicht mehr in der Datei, "
                    f"aber {gebucht} Buchung(en) hängen daran. Es bleibt stehen "
                    f"und ist jetzt „verworfen“ — nicht mehr buchbar, die Zeit "
                    f"bleibt auffindbar und lässt sich umbuchen."
                )
            )
            return

        paket.delete()
        self.stdout.write(f"    entfernt: Paket „{paket.titel}“")

    # --- Bausteine ---------------------------------------------------------

    def _pensen(self, paket, pensen):
        """
        Die Pensen eines Pakets — genau die aus der Datei, nicht mehr.

        Erst weg, dann neu: Ein Pensum, das aus der Datei verschwindet, muss
        auch aus der Datenbank verschwinden. Sonst stünde bei jemandem eine
        Stundenzahl, die im Arbeitsplan nicht mehr vorkommt, und niemand
        käme auf die Idee, danach zu suchen.
        """
        paket.pensen.filter(geloescht_am__isnull=True).delete()
        for initialen, stunden in pensen.items():
            person = Nutzer.objects.filter(initialen=initialen).first()
            if person is None:
                # Geprüft wurde gegen die **Datei**; hier fehlt das Konto
                # wirklich. Weitermachen wäre ein Paket ohne Pensum, und das
                # sieht aus wie eines, für das keine Stunden geplant sind.
                raise CommandError(
                    f"Paket „{paket.titel}“: kein Konto mit den Initialen „{initialen}“."
                )
            Pensum.objects.create(paket=paket, person=person, stunden=Decimal(str(stunden)))

    @staticmethod
    def _datum(wert):
        return date.fromisoformat(wert) if wert else None
