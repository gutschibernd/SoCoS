"""
Übersetzung zwischen Modellen und JSON.

Geld und Zeit gehen als **Zeichenkette** hinaus (`COERCE_DECIMAL_TO_STRING`).
JSON kennt nur Gleitkomma, und dort ist 0.1 + 0.2 nicht 0.3.
"""

from rest_framework import serializers

from socos import berechtigung
from socos.models import (
    Arbeitspaket,
    Aufgabe,
    Event,
    Eventziel,
    Fixkosten,
    Kontakt,
    Kontostand,
    Meeting,
    Meetingabschnitt,
    Monatskosten,
    Nutzer,
    Organisation,
    Pensum,
    Projekt,
    Projektphase,
    Protokolleintrag,
    Rueckmeldung,
    Unteraufgabe,
    Verlaufseintrag,
    Zeitbuchung,
    stufenvorlage,
)
from socos.services import auswertung, zeit as zeitdienst


class NutzerSerializer(serializers.ModelSerializer):
    """
    Adresse und Geburtsdatum sieht nur man selbst und der Admin. Die
    Entscheidung fällt serverseitig — ein im Frontend verstecktes Feld ist nur
    ein ungenanntes Feld.
    """

    rolle = serializers.SerializerMethodField()

    class Meta:
        model = Nutzer
        fields = [
            "id", "name", "initialen", "farbe", "funktion", "email", "telefon",
            "strasse", "ort", "geburtsdatum", "is_active", "rolle",
        ]
        # is_active und rolle sind hier bewusst nur lesbar. Geändert werden sie
        # über eigene Aktionen — ein PATCH, das nebenbei eine Rolle mitschickt,
        # ist zu leicht versehentlich abzuschicken.
        read_only_fields = ["id", "is_active", "rolle"]

    def get_rolle(self, nutzer):
        return berechtigung.rolle(nutzer)

    def to_representation(self, instanz):
        daten = super().to_representation(instanz)
        anfragender = self.context.get("request").user if self.context.get("request") else None
        if not berechtigung.darf_stammdaten_sehen(anfragender, instanz):
            for feld in ("strasse", "ort", "geburtsdatum"):
                daten.pop(feld, None)
        return daten


# --- Projektstruktur --------------------------------------------------------


class UnteraufgabeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unteraufgabe
        fields = ["id", "paket", "titel", "erledigt", "reihenfolge"]


class PensumSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.name", read_only=True)

    class Meta:
        model = Pensum
        fields = ["id", "paket", "person", "person_name", "stunden"]


class ArbeitspaketSerializer(serializers.ModelSerializer):
    unteraufgaben = UnteraufgabeSerializer(many=True, read_only=True)
    pensen = serializers.SerializerMethodField()
    fortschritt = serializers.SerializerMethodField()
    projekt = serializers.IntegerField(source="phase.projekt_id", read_only=True)
    # Ob die Uhr hier laufen darf — und wenn nicht, warum. Der Grund kommt
    # mit, damit die Oberfläche den Satz zeigen kann, statt einen Knopf
    # kommentarlos auszugrauen.
    buchbar = serializers.SerializerMethodField()
    grund_gegen_buchung = serializers.SerializerMethodField()

    class Meta:
        model = Arbeitspaket
        fields = [
            "id", "phase", "projekt", "titel", "beschreibung", "status", "stufenstand",
            "reihenfolge", "stufen", "fortschritt", "unteraufgaben", "pensen",
            "buchbar", "grund_gegen_buchung",
        ]

    def get_pensen(self, paket):
        menge = paket.pensen.filter(geloescht_am__isnull=True).order_by("person__name")
        return PensumSerializer(menge, many=True, context=self.context).data

    def get_buchbar(self, paket):
        return paket.grund_gegen_buchung() is None

    def get_grund_gegen_buchung(self, paket):
        return paket.grund_gegen_buchung() or ""

    def get_fortschritt(self, paket):
        return auswertung.fortschritt(paket)

    def validate_stufen(self, stufen):
        """
        Die Leiste kommt als Liste aus {"name", "monate"} herein.

        Geprüft wird sie hier und nicht erst beim Rechnen: `fortschritt` würde
        aus einem Text in `monate` eine 1 machen und stillschweigend eine
        falsche Zahl liefern — und eine falsche Prozentzahl sieht man ihr
        nicht an.
        """
        if not isinstance(stufen, list):
            raise serializers.ValidationError("Eine Liste von Stufen wird gebraucht.")
        sauber = []
        for i, stufe in enumerate(stufen, 1):
            if not isinstance(stufe, dict):
                raise serializers.ValidationError(f"Stufe {i}: ein Objekt wird gebraucht.")
            name = str(stufe.get("name", "")).strip()
            if not name:
                raise serializers.ValidationError(f"Stufe {i}: Der Name fehlt.")
            if len(name) > 60:
                raise serializers.ValidationError(f"Stufe {i}: Der Name ist zu lang.")
            try:
                monate = int(stufe["monate"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError(f"Stufe {i}: Die Dauer ist keine ganze Zahl.")
            # Obergrenze, damit ein Tippfehler (12 statt 1,2) nicht als
            # jahrzehntelange Stufe durchgeht und den Fortschritt einfriert.
            if not 0 <= monate <= 120:
                raise serializers.ValidationError(
                    f"Stufe {i}: Die Dauer muss zwischen 0 und 120 Monaten liegen."
                )
            sauber.append({"name": name, "monate": monate})
        return sauber

    def validate(self, daten):
        # Nur ein **ausdrücklich mitgeschickter** Stand wird geprüft. Wer bloß
        # die Leiste kürzt, meint nicht den Stand — der wird in `update`
        # gekappt. Eine Fehlermeldung wäre hier die falsche Antwort auf eine
        # richtige Absicht.
        if "stufenstand" not in daten:
            return daten

        if "stufen" in daten:
            stufen = daten["stufen"]
        elif self.instance is not None:
            stufen = self.instance.stufen or []
        else:
            # Beim Anlegen füllt das Modell die Leiste erst in `save`. Hier
            # zählt darum schon die Vorlage, sonst wäre jeder Stand über 0
            # beim Anlegen unzulässig.
            phase = daten.get("phase")
            stufen = stufenvorlage(phase.art) if phase else []

        stand = daten["stufenstand"]
        if not 0 <= stand <= len(stufen):
            raise serializers.ValidationError(
                {"stufenstand": f"Muss zwischen 0 und {len(stufen)} liegen."}
            )
        return daten

    def update(self, paket, daten):
        paket = super().update(paket, daten)
        # Wird die Leiste gekürzt, ragt der Stand über ihr Ende hinaus. Hier
        # ist die einzige Stelle, an der beide Werte zugleich vorliegen —
        # sonst stünde ein Paket auf Stufe 4 von 3 und zeigte 100 %.
        if paket.stufenstand > len(paket.stufen or []):
            paket.stufenstand = len(paket.stufen or [])
            paket.save(update_fields=["stufenstand"])
        return paket


class ProjektphaseSerializer(serializers.ModelSerializer):
    pakete = serializers.SerializerMethodField()

    class Meta:
        model = Projektphase
        fields = [
            "id", "projekt", "titel", "art", "reihenfolge",
            "von", "bis", "abgeschlossen", "pakete",
        ]

    def get_pakete(self, phase):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = phase.pakete.filter(geloescht_am__isnull=True).order_by("reihenfolge", "titel")
        return ArbeitspaketSerializer(menge, many=True, context=self.context).data


class ProjektSerializer(serializers.ModelSerializer):
    phasen = serializers.SerializerMethodField()
    gebuchte_sekunden = serializers.SerializerMethodField()

    class Meta:
        model = Projekt
        fields = [
            "id", "titel", "untertitel", "farbe", "reihenfolge",
            "phasen", "gebuchte_sekunden",
        ]

    def get_phasen(self, projekt):
        menge = projekt.phasen.filter(geloescht_am__isnull=True).order_by(
            "reihenfolge", "titel"
        )
        return ProjektphaseSerializer(menge, many=True, context=self.context).data

    def get_gebuchte_sekunden(self, projekt):
        return self.context.get("sekunden_je_projekt", {}).get(projekt.pk, 0)


# --- Zeit -------------------------------------------------------------------


class ZeitbuchungSerializer(serializers.ModelSerializer):
    # Ohne Angabe bucht man **für sich selbst** — die Person setzt
    # `perform_create` aus der Sitzung. Als Pflichtfeld (so kommt es aus dem
    # Modell) hat sie jedes Nachtragen mit 400 abgewiesen, und die Meldung
    # nannte ein Feld, das im Formular gar nicht vorkommt.
    person = serializers.PrimaryKeyRelatedField(queryset=Nutzer.objects.all(), required=False)
    sekunden = serializers.SerializerMethodField()
    laeuft = serializers.BooleanField(read_only=True)
    paket_titel = serializers.CharField(source="paket.titel", read_only=True)
    projekt_titel = serializers.CharField(source="paket.phase.projekt.titel", read_only=True)
    projekt = serializers.IntegerField(source="paket.phase.projekt_id", read_only=True)
    person_name = serializers.CharField(source="person.name", read_only=True)

    class Meta:
        model = Zeitbuchung
        fields = [
            "id", "person", "person_name", "paket", "paket_titel", "projekt",
            "projekt_titel", "start", "ende", "notiz", "ist_entwurf",
            "sekunden", "laeuft",
        ]
        read_only_fields = ["ist_entwurf"]

    def get_sekunden(self, buchung):
        # Ungerundet. Gerundet wird in der Auswertung, nicht an der Einzelzeile
        # — sonst summieren sich die Rundungsfehler.
        bis = buchung.ende or zeitdienst.timezone.now()
        return max(0, int((bis - buchung.start).total_seconds()))

    def validate(self, daten):
        start = daten.get("start", getattr(self.instance, "start", None))
        ende = daten.get("ende", getattr(self.instance, "ende", None))
        if start and ende and ende <= start:
            raise serializers.ValidationError({"ende": "Das Ende muss nach dem Start liegen."})

        # Nur ein **neu gewähltes** Ziel wird geprüft. Eine Buchung, deren
        # Phase inzwischen abgeschlossen ist, muss weiter änderbar bleiben:
        # Sonst wäre ein Tippfehler in der Uhrzeit für immer eingefroren, und
        # der einzige Ausweg wäre das Löschen der Zeit.
        paket = daten.get("paket")
        if paket is not None and paket != getattr(self.instance, "paket", None):
            if grund := paket.grund_gegen_buchung():
                raise serializers.ValidationError({"paket": grund})
        return daten


# --- Kontakte ---------------------------------------------------------------


class VerlaufseintragSerializer(serializers.ModelSerializer):
    wer_name = serializers.CharField(source="wer.name", read_only=True, default="")
    # Die Kontakteseite bekommt den Verlauf verschachtelt und weiß deshalb
    # selbst, an wem ein Eintrag hängt. Die Eventseite bekommt ihn flach — dort
    # steht ohne diese Namen nur eine Nummer.
    kontakt_name = serializers.CharField(source="kontakt.name", read_only=True, default="")
    organisation_name = serializers.CharField(
        source="organisation.name", read_only=True, default=""
    )
    event_titel = serializers.CharField(source="event.titel", read_only=True, default="")

    class Meta:
        model = Verlaufseintrag
        fields = [
            "id", "kontakt", "kontakt_name", "organisation", "organisation_name",
            "event", "event_titel", "datum", "art", "titel", "text",
            "wer", "wer_name",
        ]
        read_only_fields = ["wer"]

    def validate(self, daten):
        kontakt = daten.get("kontakt", getattr(self.instance, "kontakt", None))
        org = daten.get("organisation", getattr(self.instance, "organisation", None))
        if bool(kontakt) == bool(org):
            raise serializers.ValidationError(
                "Ein Verlaufseintrag gehört zu genau einem — einem Kontakt oder "
                "einer Organisation."
            )
        return daten


class KontaktSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name", read_only=True, default=""
    )
    # Der Titel des Events, auf dem die Person kennengelernt wurde. Ohne ihn
    # stünde in der Kachel eine Zahl, und der Frontend müsste die Eventliste
    # laden, nur um einen Namen anzuzeigen.
    kennengelernt_auf_titel = serializers.CharField(
        source="kennengelernt_auf.titel", read_only=True, default=""
    )
    letzter_kontakt = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()
    meetings = serializers.SerializerMethodField()

    class Meta:
        model = Kontakt
        fields = [
            "id", "name", "anrede", "funktion", "email", "telefon",
            "organisation", "organisation_name",
            "kennengelernt_auf", "kennengelernt_auf_titel",
            "ball", "offener_punkt", "letzter_kontakt", "verlauf", "meetings",
        ]

    def get_letzter_kontakt(self, kontakt):
        """
        Wann zuletzt etwas mit dieser Person war — **Verlauf und Meetings**.

        Ein Meeting ist der deutlichste Kontakt, den es gibt; es hier zu
        übergehen ließe eine Person als „seit Monaten nichts" dastehen, obwohl
        man vorige Woche eine Stunde mit ihr geredet hat.
        """
        letzter = kontakt.verlauf.filter(geloescht_am__isnull=True).order_by("-datum").first()
        treffen = kontakt.meetings.filter(geloescht_am__isnull=True).order_by("-datum").first()
        datumsangaben = [x.datum for x in (letzter, treffen) if x]
        return max(datumsangaben) if datumsangaben else None

    def get_verlauf(self, kontakt):
        menge = kontakt.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data

    def get_meetings(self, kontakt):
        return meetingzeilen(kontakt.meetings)


class OrganisationSerializer(serializers.ModelSerializer):
    kontakte = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()
    meetings = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = [
            "id", "name", "kurz", "typ", "stufe", "prioritaet", "nutzen",
            "kontakte", "verlauf", "meetings",
        ]

    def get_kontakte(self, org):
        menge = org.kontakte.filter(geloescht_am__isnull=True).order_by("name")
        return KontaktSerializer(menge, many=True, context=self.context).data

    def get_verlauf(self, org):
        menge = org.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data

    def get_meetings(self, org):
        """Nur die Meetings, die am Haus selbst hängen.

        Die Meetings der Personen darin kommen über deren eigene Liste mit —
        zusammengeführt wird beim Anzeigen, so wie beim Verlauf auch (siehe
        `frontend/src/basis/kontakte.ts`). Hier beides zu mischen hieße, eine
        Besprechung, bei der das Haus *und* eine Person eingetragen sind,
        zweimal auszuliefern.
        """
        return meetingzeilen(org.meetings)


# --- Events -----------------------------------------------------------------


class EventzielSerializer(serializers.ModelSerializer):
    """Eine Zeile der Hitlist. Sie zeigt auf genau eines von beiden."""

    organisation_name = serializers.CharField(
        source="organisation.name", read_only=True, default=""
    )
    kontakt_name = serializers.CharField(source="kontakt.name", read_only=True, default="")
    # Zu wem die Person gehört. Auf einer Hitlist stehen zehn Namen, und ohne
    # das Haus daneben weiß niemand mehr, wen er da ansprechen wollte.
    kontakt_organisation = serializers.CharField(
        source="kontakt.organisation.name", read_only=True, default=""
    )

    class Meta:
        model = Eventziel
        fields = [
            "id", "event", "organisation", "organisation_name", "kontakt",
            "kontakt_name", "kontakt_organisation", "anliegen", "stand",
            "reihenfolge",
        ]

    def validate(self, daten):
        kontakt = daten.get("kontakt", getattr(self.instance, "kontakt", None))
        org = daten.get("organisation", getattr(self.instance, "organisation", None))
        if bool(kontakt) == bool(org):
            raise serializers.ValidationError(
                "Eine Zeile der Hitlist zeigt auf genau eines — eine Organisation "
                "oder eine Person."
            )
        return daten

    def create(self, daten):
        """
        Steht der Eintrag schon auf der Liste, wird er zurückgegeben statt
        angelegt.

        **Warum kein Fehler:** Zweimal dieselbe Organisation einzutragen ist ein
        Doppelklick, kein Vorhaben. Ein roter Kasten dafür erklärt nichts, was
        die Liste nicht schon zeigt. Die Datenbank weist es trotzdem ab — sie
        ist die Absicherung, nicht die Fehlermeldung.
        """
        vorhanden = Eventziel.objects.filter(
            event=daten["event"],
            organisation=daten.get("organisation"),
            kontakt=daten.get("kontakt"),
        ).first()
        return vorhanden or super().create(daten)


class EventSerializer(serializers.ModelSerializer):
    ziele = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()
    teilnehmer_namen = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "titel", "ort", "von", "bis", "notiz", "teilnehmer",
            "teilnehmer_namen", "ziele", "verlauf",
        ]

    def get_ziele(self, event):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = event.ziele.filter(geloescht_am__isnull=True).order_by("reihenfolge", "id")
        return EventzielSerializer(menge, many=True, context=self.context).data

    def get_verlauf(self, event):
        menge = event.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data

    def get_teilnehmer_namen(self, event):
        return [n.name for n in event.teilnehmer.all()]

    def validate(self, daten):
        von = daten.get("von", getattr(self.instance, "von", None))
        bis = daten.get("bis", getattr(self.instance, "bis", None))
        if von and bis and bis < von:
            raise serializers.ValidationError({"bis": "Das Ende liegt vor dem Anfang."})
        return daten


# --- Meetings ---------------------------------------------------------------


def meetingzeilen(menge):
    """
    Meetings in der kurzen Form, wie sie im Verlauf einer Person oder eines
    Hauses stehen: Datum, Titel, und ob schon ein Protokoll da ist.

    **Ohne die Texte.** Auf der Kontakteseite steht das Meeting als Zeile mit
    einem Knopf daneben; die Mitschrift dort mitzuliefern hieße, den Verlauf
    einer Organisation mit zwanzig Protokollen zu laden, um zwanzig
    Überschriften anzuzeigen.
    """
    treffer = menge.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
    return [
        {
            "id": m.id,
            "titel": m.titel,
            "datum": m.datum,
            "hat_protokoll": m.abschnitte.filter(geloescht_am__isnull=True).exists(),
        }
        for m in treffer
    ]


class MeetingabschnittSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meetingabschnitt
        fields = ["id", "meeting", "ueberschrift", "text", "reihenfolge"]


class MeetingSerializer(serializers.ModelSerializer):
    """
    Ein Meeting samt Protokoll und den Namen der Beteiligten.

    Die Namen kommen mit, weil die Liste sonst Nummern zeigte und für jede
    Zeile die Kontakte nachladen müsste. Geschrieben wird über `kontakte`,
    `organisationen` und `teilnehmer` — die Namenlisten sind nur lesbar.
    """

    abschnitte = serializers.SerializerMethodField()
    personen = serializers.SerializerMethodField()
    haeuser = serializers.SerializerMethodField()
    teilnehmer_namen = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id", "titel", "datum", "uhrzeit", "ort",
            "kontakte", "personen", "organisationen", "haeuser",
            "teilnehmer", "teilnehmer_namen",
            "vorbereitung", "mitschrift", "abschnitte",
        ]

    def get_abschnitte(self, meeting):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = meeting.abschnitte.filter(geloescht_am__isnull=True).order_by(
            "reihenfolge", "id"
        )
        return MeetingabschnittSerializer(menge, many=True, context=self.context).data

    def get_personen(self, meeting):
        return [
            {
                "id": k.id,
                "name": k.name,
                # Das Haus dahinter — ohne es steht in der Zeile ein Name, den
                # ein halbes Jahr später niemand mehr einordnet.
                "organisation_name": k.organisation.name if k.organisation else "",
            }
            for k in meeting.kontakte.all()
        ]

    def get_haeuser(self, meeting):
        return [{"id": o.id, "name": o.name} for o in meeting.organisationen.all()]

    def get_teilnehmer_namen(self, meeting):
        return [n.name for n in meeting.teilnehmer.all()]


# --- Finanzen ---------------------------------------------------------------


class KontostandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Kontostand
        fields = ["id", "datum", "betrag"]


class FixkostenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fixkosten
        fields = ["id", "gueltig_ab", "betrag"]


class MonatskostenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Monatskosten
        fields = ["id", "monat", "betrag"]


# --- Protokoll --------------------------------------------------------------


class ProtokollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Protokolleintrag
        fields = [
            "id", "zeitpunkt", "nutzer_text", "modell", "objekt_id",
            "objekt_text", "aktion", "aenderungen",
        ]


# --- Wünsche und Fehler -----------------------------------------------------


class RueckmeldungSerializer(serializers.ModelSerializer):
    """
    Melden darf jeder; Stand, Antwort und Version setzt nur ein Admin.

    Die Prüfung steht **hier** und nicht nur im ViewSet, weil sie feldweise ist:
    Ein Melder darf seinen eigenen Eintrag noch nachschärfen, aber nicht
    nebenbei auf „erledigt" setzen. Wer was darf, kommt aus
    `socos/berechtigung.py` — hier steht nur, auf welche Felder es sich bezieht.
    """

    #: Was nur ein Admin schreiben darf. Als Liste und nicht dreimal in einer
    #: Bedingung: Beim vierten Feld wird die Bedingung vergessen.
    ADMINFELDER = ("stand", "antwort", "erledigt_in")

    melder_name = serializers.CharField(source="melder.name", read_only=True, default="")
    melder_initialen = serializers.CharField(
        source="melder.initialen", read_only=True, default=""
    )
    melder_farbe = serializers.CharField(source="melder.farbe", read_only=True, default="")

    class Meta:
        model = Rueckmeldung
        fields = [
            "id", "art", "titel", "text", "stand", "antwort", "erledigt_in",
            "melder", "melder_name", "melder_initialen", "melder_farbe",
            "erstellt_am", "geaendert_am",
        ]
        # Der Melder ist, wer schickt — nicht, wen das Formular mitschickt.
        read_only_fields = ["id", "melder", "erstellt_am", "geaendert_am"]

    def _nutzer(self):
        anfrage = self.context.get("request")
        return anfrage.user if anfrage else None

    def validate(self, daten):
        gesetzt = [f for f in self.ADMINFELDER if f in daten]
        if gesetzt and not berechtigung.darf_rueckmeldung_verwalten(self._nutzer()):
            raise serializers.ValidationError(
                {gesetzt[0]: "Den Stand einer Rückmeldung setzt ein Admin."}
            )
        return daten

    def create(self, daten):
        daten["melder"] = self._nutzer()
        return super().create(daten)


class AufgabeSerializer(serializers.ModelSerializer):
    """
    Die Tafel. `person = null` heißt „Allgemein" — und ist deshalb ein
    gewöhnlicher, schreibbarer Wert, kein Sonderfall.

    Anders als beim Melder einer Rückmeldung ist die Person hier **nicht** der
    Absender: Eine Aufgabe schreibt man dem anderen auf die Tafel, das ist der
    ganze Zweck. Wer sie angelegt hat, steht im Änderungsprotokoll.

    `ist_idee` ist ein gewöhnliches schreibbares Feld — „das machen wir" ist
    genau ein PATCH darauf. Keine eigene Aktion `/uebernehmen/` daneben: Sie
    täte dasselbe und wäre ein zweiter Weg zum selben Zustand.
    """

    person_name = serializers.CharField(source="person.name", read_only=True, default="")

    class Meta:
        model = Aufgabe
        fields = [
            "id", "text", "person", "person_name", "prioritaet", "erledigt",
            "ist_idee", "erstellt_am", "geaendert_am",
        ]
        read_only_fields = ["id", "erstellt_am", "geaendert_am"]

    def validate_text(self, text):
        """
        Eine leere Zeile ist keine Aufgabe. Geprüft hier und nicht erst in der
        Ansicht: Ein Enter auf einem leeren Feld darf keinen Zettel erzeugen,
        den danach niemand mehr findet, weil er nichts anzeigt.
        """
        text = text.strip()
        if not text:
            raise serializers.ValidationError("Ohne Text ist es keine Aufgabe.")
        return text
