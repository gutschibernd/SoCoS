"""
Legt Probedaten an, um die Oberfläche mit Inhalt zu sehen.

**Alle Namen hier sind erfunden.** Echte Kunden- und Personendaten kommen aus
`daten/` (in `.gitignore`) — nie aus einem Befehl im Repository. Was einmal in
der Versionsgeschichte steht, holt auch ein `git rm` nicht mehr heraus.

Der Befehl weigert sich, wenn schon Fachdaten vorhanden sind: Er soll niemals
einen echten Bestand vermischen. `--entfernen` nimmt alles wieder zurück,
inklusive der Protokolleinträge, die dabei entstanden sind.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from socos import sicherung
from socos.models import (
    Arbeitspaket,
    Bereich,
    Bereichsart,
    Fixkosten,
    Kontakt,
    Kontostand,
    Monatskosten,
    Nutzer,
    Organisation,
    Projekt,
    Protokolleintrag,
    Unteraufgabe,
    Verlaufseintrag,
    Zeitbuchung,
)

# Modelle, die der Befehl anfasst. Nutzer und Gruppen gehören nicht dazu —
# Konten legt ein Administrator an, nicht ein Probedatenbefehl.
FACHMODELLE = [
    b for b in sicherung.LOESCHREIHENFOLGE
    if b not in ("socos.Nutzer", "auth.Group", "socos.Protokolleintrag")
]


class Command(BaseCommand):
    help = "Legt erfundene Probedaten an (nur lokal). --entfernen nimmt sie zurück."

    def add_arguments(self, parser):
        parser.add_argument(
            "--entfernen", action="store_true",
            help="Entfernt alle Fachdaten und die dabei entstandenen Protokolleinträge.",
        )
        parser.add_argument(
            "--mit-probenutzern", action="store_true",
            help="Legt zwei zusätzliche Konten an, damit die Teamansichten etwas zeigen.",
        )

    def handle(self, *args, **optionen):
        if not settings.DEBUG:
            raise CommandError(
                "Probedaten gibt es nur lokal. Am Server ist DEBUG aus — und dort "
                "hätten erfundene Namen in einer echten Datenbank nichts verloren."
            )

        if optionen["entfernen"]:
            return self._entfernen()

        vorhanden = [
            b for b in FACHMODELLE if apps.get_model(b).alle_objekte.exists()
        ]
        if vorhanden:
            raise CommandError(
                "Es sind schon Fachdaten da (" + ", ".join(vorhanden) + ").\n"
                "Der Befehl vermischt keinen echten Bestand mit erfundenem. "
                "Erst `probedaten --entfernen`, wenn das wirklich gewollt ist."
            )

        with transaction.atomic():
            if optionen["mit_probenutzern"]:
                self._probenutzer()
            self._anlegen()
        self.stdout.write(self.style.SUCCESS("Probedaten angelegt."))
        self.stdout.write("Zurücknehmen mit:  python manage.py probedaten --entfernen")

    # --- Probenutzer -------------------------------------------------------

    def _probenutzer(self):
        """
        Zwei zusätzliche Konten, damit Teamansichten und Zeitnachweis etwas zu
        zeigen haben.

        Die Adressen enden auf `.invalid` — diese Endung ist per RFC 2606
        reserviert und kann nie eine echte Adresse sein. Die Konten bekommen
        **kein** Passwort und sind damit nicht anmeldbar; sie sind Anzeigedaten,
        keine Zugänge.
        """
        from django.contrib.auth.models import Group

        for email, name, farbe in [
            ("probe-a@beispiel.invalid", "Alex Probe", "#E0D3A8"),
            ("probe-b@beispiel.invalid", "Bea Muster", "#CBD2E0"),
        ]:
            if Nutzer.objects.filter(email=email).exists():
                continue
            nutzer = Nutzer.objects.create_user(email=email, name=name, farbe=farbe)
            nutzer.groups.add(Group.objects.get(name="bearbeiter"))
            self.stdout.write(f"  Probenutzer angelegt: {name} (nicht anmeldbar)")

    # --- Entfernen ---------------------------------------------------------

    def _entfernen(self):
        with transaction.atomic():
            for bezeichner in FACHMODELLE:
                modell = apps.get_model(bezeichner)
                # Hart, nicht weich: Weich Gelöschtes bliebe als Leiche liegen
                # und der Befehl ließe sich nie wieder ausführen.
                anzahl = modell.alle_objekte.all().hart_loeschen()[0]
                if anzahl:
                    self.stdout.write(f"  {bezeichner}: {anzahl} entfernt")

            probe = Nutzer.objects.filter(email__endswith="@beispiel.invalid")
            if probe.exists():
                namen = ", ".join(probe.values_list("name", flat=True))
                probe.delete()
                self.stdout.write(f"  Probenutzer entfernt: {namen}")

            weg = Protokolleintrag.objects.exclude(
                modell__in=["auth.Group"]
            ).exclude(
                modell="socos.Nutzer",
                objekt_text__in=list(
                    Nutzer.objects.values_list("name", flat=True)
                ),
            ).delete()[0]
            self.stdout.write(f"  Protokolleinträge: {weg} entfernt")
        self.stdout.write(self.style.SUCCESS("Probedaten entfernt."))

    # --- Anlegen -----------------------------------------------------------

    def _anlegen(self):
        team = list(Nutzer.objects.filter(is_active=True))
        if not team:
            raise CommandError(
                "Es gibt noch kein Konto. Erst `nutzer_anlegen`, dann Probedaten — "
                "Zeitbuchungen brauchen jemanden, der sie gebucht hat."
            )

        heute = timezone.localdate()

        # --- Projekte ------------------------------------------------------
        ams = Projekt.objects.create(
            titel="Arzneimittelspender",
            untertitel="AMS · automatische Sortierung",
            farbe="#14595F",
            reihenfolge=0,
        )
        claire = Projekt.objects.create(
            titel="Claire@home",
            untertitel="Studie mit Forschungspartner",
            farbe="#8A5638",
            reihenfolge=1,
        )
        overhead = Projekt.objects.create(
            titel="Overhead",
            untertitel="Verwaltung, Buchhaltung, Sonstiges",
            farbe="#7C8A8C",
            reihenfolge=2,
        )

        ams_dev = Bereich.objects.create(projekt=ams, titel="Entwicklung", art=Bereichsart.DEV)
        ams_fin = Bereich.objects.create(
            projekt=ams, titel="Finanzierung", art=Bereichsart.FIN, reihenfolge=1
        )
        ams_ziel = Bereich.objects.create(
            projekt=ams, titel="Ziele", art=Bereichsart.ZIEL, reihenfolge=2
        )
        cl_dev = Bereich.objects.create(projekt=claire, titel="Entwicklung", art=Bereichsart.DEV)
        cl_fin = Bereich.objects.create(
            projekt=claire, titel="Finanzierung", art=Bereichsart.FIN, reihenfolge=1
        )
        oh = Bereich.objects.create(projekt=overhead, titel="Laufendes", art=Bereichsart.DEV)

        pakete = {}

        def paket(bereich, titel, status="offen", stand=0, notiz="", nr=0):
            p = Arbeitspaket.objects.create(
                bereich=bereich, titel=titel, status=status,
                stufenstand=stand, notiz=notiz, reihenfolge=nr,
            )
            pakete[titel] = p
            return p

        paket(ams_dev, "Dauerlauftests", "laeuft", 2, "Prüfstand läuft seit KW 34.", 0)
        paket(ams_dev, "MVP", "offen", 0, "", 1)
        paket(ams_dev, "Erprobung klein", "offen", 0, "", 2)
        paket(ams_dev, "CE-MDR", "offen", 0, "Erst nach der Erprobung sinnvoll.", 3)

        paket(ams_fin, "Förderschiene A", "eingereicht", 2, "Zwischenbericht fällig.", 0)
        paket(ams_fin, "Förderschiene B", "verworfen", 0, "Passt nicht zum Zeitplan.", 1)
        paket(ams_fin, "Landesförderung", "laeuft", 1, "", 2)

        paket(ams_ziel, "Erprobtes Produkt auf den Markt bringen", "laeuft", 1, "", 0)

        paket(cl_dev, "Hardware", "laeuft", 1, "", 0)
        paket(cl_dev, "App: Dispensierhilfe", "offen", 0, "", 1)
        paket(cl_fin, "Forschungsförderung", "zugesagt", 3, "Zusage liegt vor.", 0)

        paket(oh, "Buchhaltung", "laeuft", 1, "", 0)
        paket(oh, "Büro und Organisation", "laeuft", 1, "", 1)

        Unteraufgabe.objects.create(
            paket=pakete["Dauerlauftests"], titel="Protokollvorlage anlegen", erledigt=True
        )
        Unteraufgabe.objects.create(
            paket=pakete["Dauerlauftests"], titel="Woche 2 auswerten", reihenfolge=1
        )
        Unteraufgabe.objects.create(
            paket=pakete["Dauerlauftests"], titel="Verschleißteile nachbestellen", reihenfolge=2
        )
        Unteraufgabe.objects.create(paket=pakete["MVP"], titel="Gehäuse festlegen")
        Unteraufgabe.objects.create(
            paket=pakete["Förderschiene A"], titel="Kostenplan aktualisieren"
        )

        # --- Zeitbuchungen -------------------------------------------------
        #
        # Über die letzten drei Wochen verteilt, damit Wochen- und Monatssicht
        # etwas zu zeigen haben.
        muster = [
            (0, "Dauerlauftests", 8, 30, 210, "Prüfstand umgebaut"),
            (0, "Buchhaltung", 13, 0, 75, "Belege sortiert"),
            (1, "Dauerlauftests", 9, 0, 300, "Messreihe 2"),
            (1, "Hardware", 14, 0, 120, "Sensorplatine getestet"),
            (2, "Förderschiene A", 10, 0, 165, "Zwischenbericht begonnen"),
            (3, "MVP", 9, 15, 240, "Gehäusevarianten skizziert"),
            (4, "Hardware", 8, 45, 195, ""),
            (6, "Dauerlauftests", 9, 0, 270, "Messreihe 3"),
            (7, "Büro und Organisation", 11, 0, 60, "Ablage"),
            (8, "Forschungsförderung", 9, 30, 150, "Kostenplan abgestimmt"),
            (9, "Dauerlauftests", 8, 0, 330, ""),
            (10, "App: Dispensierhilfe", 13, 30, 135, "Entwurf Bildschirmablauf"),
            (13, "Dauerlauftests", 9, 0, 285, "Messreihe 4"),
            (14, "Landesförderung", 10, 0, 120, "Antragsformular"),
            (15, "Buchhaltung", 15, 0, 90, ""),
            (16, "MVP", 9, 0, 255, ""),
            (17, "Hardware", 10, 30, 180, "Gehäusetest"),
        ]

        for i, (tage_zurueck, paket_titel, stunde, minute, dauer, notiz) in enumerate(muster):
            person = team[i % len(team)]
            tag = heute - timedelta(days=tage_zurueck)
            start = timezone.make_aware(
                timezone.datetime.combine(tag, timezone.datetime.min.time())
            ) + timedelta(hours=stunde, minutes=minute)
            Zeitbuchung.objects.create(
                person=person,
                paket=pakete[paket_titel],
                start=start,
                ende=start + timedelta(minutes=dauer),
                notiz=notiz,
            )

        # --- Kontakte ------------------------------------------------------
        #
        # Erfundene Organisationen und Personen. Die echten kommen aus daten/.
        orgs = [
            ("Bundesförderstelle", "Förderstelle", "angebahnt",
             "Kleinprojekt läuft, Zwischenbericht steht an."),
            ("Landesförderstelle", "Förderstelle", "angebahnt",
             "Umsetzungsschiene beantragt, Entscheidung offen."),
            ("Regionalagentur", "Förderstelle", "erstkontakt",
             "Büroförderung angefragt, noch keine Rückmeldung."),
            ("Universitätsklinik", "Forschung", "partner",
             "Studiendesign in Abstimmung, Ethikantrag vorbereitet."),
            ("Apothekenkooperation", "Partner", "austausch",
             "Praxistest der Dispensierhilfe zugesagt."),
            ("Gesundheitsfonds", "Fonds", "kennengelernt",
             "Interesse an der Präventionsseite, will ein Konzept sehen."),
        ]
        angelegt = {}
        for name, typ, stufe, nutzen in orgs:
            angelegt[name] = Organisation.objects.create(
                name=name, typ=typ, stufe=stufe, nutzen=nutzen
            )

        kontakte = [
            ("Bundesförderstelle", "M. Berger", "Programmmanagement", "uns",
             "Zwischenbericht abgeben", [
                 (12, "mail", "Erinnerung Zwischenbericht", "Frist läuft Mitte des Monats."),
                 (40, "call", "Rückfrage zum Kostenplan", "Personalkosten nachweisen."),
             ]),
            ("Landesförderstelle", "S. Hofer", "Förderreferat", "ihnen",
             "Entscheidung der Jury", [
                 (9, "meeting", "Antragsgespräch", "Unterlagen vollständig, Jury tagt im Oktober."),
             ]),
            ("Regionalagentur", "K. Wallner", "Beratung", "ihnen",
             "Auskunft zur Büroförderung", [
                 (24, "call", "Erstauskunft", "Programm läuft noch, Einreichung ab Herbst."),
             ]),
            ("Universitätsklinik", "Dr. A. Reiter", "Studienleitung", "ihnen",
             "Rückmeldung zum Studiendesign", [
                 (5, "meeting", "Abstimmung Studiendesign", "Nächster Schritt liegt bei der Klinik."),
                 (33, "mail", "Entwurf Protokoll", "Erster Entwurf verschickt."),
             ]),
            ("Apothekenkooperation", "T. Gruber", "Fachliche Leitung", "uns",
             "Testablauf beschreiben", [
                 (18, "call", "Praxistest besprochen", "Zwei Standorte stellen sich zur Verfügung."),
             ]),
            (None, "J. Steiner", "Loser Kontakt aus dem Netzwerk", "ihnen",
             "Einschätzung zur Vermarktung", [
                 (21, "event", "Gespräch auf einer Veranstaltung", "Nicht priorisiert."),
             ]),
            ("Universitätsklinik", "B. Moser", "Studienassistenz", "nichts",
             "", [
                 (7, "mail", "Terminbestätigung", "Alles beisammen, nächster Termin steht."),
             ]),
        ]

        for org_name, name, funktion, ball, offen, verlauf in kontakte:
            k = Kontakt.objects.create(
                organisation=angelegt.get(org_name) if org_name else None,
                name=name, funktion=funktion, ball=ball, offener_punkt=offen,
            )
            for tage, art, titel, text in verlauf:
                Verlaufseintrag.objects.create(
                    kontakt=k, datum=heute - timedelta(days=tage),
                    art=art, titel=titel, text=text, wer=team[0],
                )

        Verlaufseintrag.objects.create(
            organisation=angelegt["Universitätsklinik"],
            datum=heute - timedelta(days=2),
            art="mail",
            titel="Terminvorschläge",
            text="Drei Termine für das nächste Abstimmungsgespräch geschickt.",
            wer=team[0],
        )

        # --- Finanzen ------------------------------------------------------
        erster = heute.replace(day=1)

        def monate_zurueck(datum, n):
            jahr, monat = datum.year, datum.month - n
            while monat <= 0:
                monat += 12
                jahr -= 1
            return date(jahr, monat, 1)

        for n, betrag in [(4, "14200.00"), (3, "13100.00"), (2, "12050.00"),
                          (1, "11300.00"), (0, "10450.00")]:
            Kontostand.objects.create(datum=monate_zurueck(erster, n), betrag=Decimal(betrag))

        Fixkosten.objects.create(gueltig_ab=monate_zurueck(erster, 11), betrag=Decimal("450.00"))
        Fixkosten.objects.create(gueltig_ab=monate_zurueck(erster, 3), betrag=Decimal("610.00"))

        for n, betrag in [(3, "1100.00"), (2, "1050.00"), (1, "750.00")]:
            Monatskosten.objects.create(monat=monate_zurueck(erster, n), betrag=Decimal(betrag))

        self.stdout.write(
            f"  {Projekt.objects.count()} Projekte, "
            f"{Arbeitspaket.objects.count()} Arbeitspakete, "
            f"{Zeitbuchung.objects.count()} Zeitbuchungen, "
            f"{Organisation.objects.count()} Organisationen, "
            f"{Kontakt.objects.count()} Kontakte"
        )
