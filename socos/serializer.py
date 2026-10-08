"""
Übersetzung zwischen Modellen und JSON.

Geld und Zeit gehen als **Zeichenkette** hinaus (`COERCE_DECIMAL_TO_STRING`).
JSON kennt nur Gleitkomma, und dort ist 0.1 + 0.2 nicht 0.3.
"""

from decimal import Decimal

from rest_framework import serializers

from socos import berechtigung
from socos.models import (
    Arbeitspaket,
    Lageschritt,
    Lagethema,
    Lageverbindung,
    Aufgabe,
    Canvaspunkt,
    Event,
    Eventanhang,
    Eventziel,
    Fixkosten,
    Foerderantrag,
    Foerdergeber,
    Foerderfrage,
    Foerderpaket,
    Foerderposten,
    Foerderabschnitt,
    Foerderprogramm,
    Foerderkapazitaet,
    Foerderstunden,
    Kontakt,
    Kontostand,
    Meeting,
    Meetinganhang,
    Meetingabschnitt,
    Monatskosten,
    Nutzer,
    Organisation,
    Pensum,
    Persona,
    Praktikumsthema,
    Projekt,
    Projektphase,
    Protokolleintrag,
    Rueckmeldung,
    Unteraufgabe,
    Verlaufseintrag,
    Vorhaben,
    Zeitbuchung,
)
from socos.services import ausschreibung, auswertung, foerderung, lagekarte, zeit as zeitdienst


class NutzerSerializer(serializers.ModelSerializer):
    """
    Adresse und Geburtsdatum sieht nur man selbst und der Admin. Die
    Entscheidung fällt serverseitig — ein im Frontend verstecktes Feld ist nur
    ein ungenanntes Feld.
    """

    #: Was nur man selbst und der Admin sieht. Das Änderungsprotokoll liest
    #: dieselbe Liste — sonst stünde die neue Adresse dort für alle im Klartext.
    STAMMDATEN = ("strasse", "ort", "geburtsdatum")

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
            for feld in self.STAMMDATEN:
                daten.pop(feld, None)
        return daten


# --- Projektstruktur --------------------------------------------------------


class UnteraufgabeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unteraufgabe
        fields = ["id", "paket", "titel", "erledigt", "reihenfolge"]


class PensumSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.name", read_only=True)
    # Was diese Person auf dieses Paket schon gebucht hat — gegen ihr Pensum.
    # Aus dem Kontext (`sekunden_je_paket_und_person`), einmal für alle
    # gerechnet; ohne Kontext steht 0 da.
    gebuchte_sekunden = serializers.SerializerMethodField()

    class Meta:
        model = Pensum
        fields = ["id", "paket", "person", "person_name", "stunden", "gebuchte_sekunden"]

    def get_gebuchte_sekunden(self, pensum):
        summen = self.context.get("sekunden_je_paket_und_person", {})
        return summen.get((pensum.paket_id, pensum.person_id), 0)


class ArbeitspaketSerializer(serializers.ModelSerializer):
    unteraufgaben = UnteraufgabeSerializer(many=True, read_only=True)
    pensen = serializers.SerializerMethodField()
    # Gebucht, Pensum (Summe über alle Personen, Decimal → Zeichenkette) und
    # der Fortschritt dazwischen. Alles gerechnet, nichts gespeichert.
    gebuchte_sekunden = serializers.SerializerMethodField()
    pensum_stunden = serializers.SerializerMethodField()
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
            "id", "phase", "projekt", "titel", "beschreibung", "status",
            "reihenfolge", "gebuchte_sekunden", "pensum_stunden", "fortschritt",
            "unteraufgaben", "pensen", "buchbar", "grund_gegen_buchung",
        ]

    def get_pensen(self, paket):
        menge = self._pensen(paket).order_by("person__name")
        return PensumSerializer(menge, many=True, context=self.context).data

    def get_buchbar(self, paket):
        return paket.grund_gegen_buchung() is None

    def get_grund_gegen_buchung(self, paket):
        return paket.grund_gegen_buchung() or ""

    def _pensen(self, paket):
        return paket.pensen.filter(geloescht_am__isnull=True)

    def get_gebuchte_sekunden(self, paket):
        return self.context.get("sekunden_je_paket", {}).get(paket.pk, 0)

    def get_pensum_stunden(self, paket):
        return sum((p.stunden for p in self._pensen(paket)), Decimal("0"))

    def get_fortschritt(self, paket):
        return auswertung.fortschritt(
            self.get_gebuchte_sekunden(paket), self.get_pensum_stunden(paket)
        )


class ProjektphaseSerializer(serializers.ModelSerializer):
    pakete = serializers.SerializerMethodField()

    class Meta:
        model = Projektphase
        fields = [
            "id", "projekt", "titel", "art", "reihenfolge",
            "von", "bis", "stand", "pakete",
        ]

    def get_pakete(self, phase):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = phase.pakete.filter(geloescht_am__isnull=True).order_by("reihenfolge", "titel")
        return ArbeitspaketSerializer(menge, many=True, context=self.context).data


class ProjektSerializer(serializers.ModelSerializer):
    phasen = serializers.SerializerMethodField()
    gebuchte_sekunden = serializers.SerializerMethodField()
    # Ob hier das Auffangpaket liegt („Overhead"). Die Projektseite stellt
    # dieses Projekt quer über die anderen — es gehört zu allen. Abgeleitet
    # aus dem Merkmal am Paket, nicht aus dem Titel: Der wird umbenannt.
    ist_auffang = serializers.SerializerMethodField()

    class Meta:
        model = Projekt
        fields = [
            "id", "titel", "untertitel", "farbe", "reihenfolge",
            "phasen", "gebuchte_sekunden", "ist_auffang",
        ]

    def get_ist_auffang(self, projekt):
        return Arbeitspaket.objects.filter(phase__projekt=projekt, ist_auffang=True).exists()

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
            "ball", "offener_punkt", "hintergrund", "anknuepfen", "meiden",
            "letzter_kontakt", "verlauf", "meetings",
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


class EventanhangSerializer(serializers.ModelSerializer):
    """Nur lesend, bis auf das Event — siehe `MeetinganhangSerializer`."""

    class Meta:
        model = Eventanhang
        fields = ["id", "event", "name", "groesse", "art", "text", "erstellt_am"]
        read_only_fields = ["name", "groesse", "art", "text", "erstellt_am"]


class EventSerializer(serializers.ModelSerializer):
    ziele = serializers.SerializerMethodField()
    anhaenge = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()
    teilnehmer_namen = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "titel", "ort", "von", "bis", "beginn", "ende", "notiz", "teilnehmer",
            "teilnehmer_namen", "ziele", "verlauf", "anhaenge",
        ]

    def get_ziele(self, event):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = event.ziele.filter(geloescht_am__isnull=True).order_by("reihenfolge", "id")
        return EventzielSerializer(menge, many=True, context=self.context).data

    def get_anhaenge(self, event):
        menge = event.anhaenge.filter(geloescht_am__isnull=True)
        return EventanhangSerializer(menge, many=True, context=self.context).data

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
        beginn = daten.get("beginn", getattr(self.instance, "beginn", None))
        ende = daten.get("ende", getattr(self.instance, "ende", None))
        if ende and not beginn:
            raise serializers.ValidationError({"ende": "Ein Ende braucht einen Beginn."})
        # Nur am selben Tag zu prüfen: Über mehrere Tage darf 10:00 am letzten
        # vor 18:00 am ersten liegen.
        if beginn and ende and (not bis or bis == von) and ende <= beginn:
            raise serializers.ValidationError({"ende": "Das Ende liegt vor dem Beginn."})
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


class MeetinganhangSerializer(serializers.ModelSerializer):
    """
    Nur lesend, bis auf das Meeting. Name, Größe, Art und Text setzt das
    Hochladen selbst (siehe `MeetinganhangViewSet.create`) — sie beschreiben
    die Datei, und die kommt nicht als JSON.
    """

    class Meta:
        model = Meetinganhang
        fields = ["id", "meeting", "name", "groesse", "art", "text", "erstellt_am"]
        read_only_fields = ["name", "groesse", "art", "text", "erstellt_am"]


class MeetingSerializer(serializers.ModelSerializer):
    """
    Ein Meeting samt Protokoll und den Namen der Beteiligten.

    Die Namen kommen mit, weil die Liste sonst Nummern zeigte und für jede
    Zeile die Kontakte nachladen müsste. Geschrieben wird über `kontakte`,
    `organisationen` und `teilnehmer` — die Namenlisten sind nur lesbar.
    """

    abschnitte = serializers.SerializerMethodField()
    anhaenge = serializers.SerializerMethodField()
    personen = serializers.SerializerMethodField()
    haeuser = serializers.SerializerMethodField()
    teilnehmer_namen = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id", "titel", "datum", "uhrzeit", "ort",
            "kontakte", "personen", "organisationen", "haeuser",
            "teilnehmer", "teilnehmer_namen",
            "vorbereitung", "mitschrift", "abschnitte", "anhaenge",
        ]
        # Ohne Uhrzeit kein Kalendereintrag mit Uhrzeit. Pflicht beim Anlegen,
        # und beim Ändern darf sie nicht geleert werden. Ein PATCH, das nur die
        # Mitschrift schickt, geht bei einem alten Meeting ohne Uhrzeit
        # trotzdem durch — sonst ließe es sich nicht mehr weiterschreiben.
        extra_kwargs = {"uhrzeit": {"required": True, "allow_null": False}}

    def get_abschnitte(self, meeting):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = meeting.abschnitte.filter(geloescht_am__isnull=True).order_by(
            "reihenfolge", "id"
        )
        return MeetingabschnittSerializer(menge, many=True, context=self.context).data

    def get_anhaenge(self, meeting):
        menge = meeting.anhaenge.filter(geloescht_am__isnull=True)
        return MeetinganhangSerializer(menge, many=True, context=self.context).data

    def get_personen(self, meeting):
        return [
            {
                "id": k.id,
                "name": k.name,
                # Die Rolle geht in den Auftrag an das LLM: „Julia (Steuer-
                # beraterin)" ordnet einen Satz im Transkript anders ein als
                # bloß „Julia".
                "funktion": k.funktion,
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

    def to_representation(self, eintrag):
        """
        Das Protokoll hält jede Änderung am Nutzer mit alt → neu fest — auch
        Adresse und Geburtsdatum. Gelesen werden darf es von allen; die
        Stammdaten darin nur, wer sie auch am Nutzer selbst sähe.
        """
        daten = super().to_representation(eintrag)
        if eintrag.modell != Nutzer._meta.label or not daten.get("aenderungen"):
            return daten
        anfrage = self.context.get("request")
        betroffen = Nutzer(pk=int(eintrag.objekt_id))
        if not berechtigung.darf_stammdaten_sehen(anfrage.user if anfrage else None, betroffen):
            daten["aenderungen"] = {
                feld: wert
                for feld, wert in daten["aenderungen"].items()
                if feld not in NutzerSerializer.STAMMDATEN
            }
        return daten


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
    Die Tafel. Leere `personen` heißen „Allgemein" — ein gewöhnlicher,
    schreibbarer Wert, kein Sonderfall.

    Anders als beim Melder einer Rückmeldung sind die Personen hier **nicht**
    der Absender: Eine Aufgabe schreibt man dem anderen auf die Tafel, das ist
    der ganze Zweck. Wer sie angelegt hat, steht im Änderungsprotokoll.

    `ist_idee` ist ein gewöhnliches schreibbares Feld — „das machen wir" ist
    genau ein PATCH darauf. Keine eigene Aktion `/uebernehmen/` daneben: Sie
    täte dasselbe und wäre ein zweiter Weg zum selben Zustand.

    Namen und Kürzel liefert die Aufgabe nicht mit: Die Oberfläche hat das
    Team ohnehin geladen und schlägt dort nach.
    """

    class Meta:
        model = Aufgabe
        fields = [
            "id", "text", "personen", "prioritaet", "erledigt",
            "frist", "ist_idee", "erstellt_am", "geaendert_am",
        ]
        read_only_fields = ["id", "erstellt_am", "geaendert_am"]

    def update(self, aufgabe, daten):
        """
        Wer die Personen geändert hat, schreibt das Protokoll hier selbst.

        **Warum nicht über die Signale in `protokoll.py`:** Die sehen nur die
        Spalten der Tabelle, und eine Menge ist keine. Ein allgemeines
        `m2m_changed` wäre der breitere Weg, feuert aber auch beim Einspielen
        einer Sicherung — ohne ein `raw`, an dem man das erkennen könnte — und
        schriebe dann für jede Zuordnung einen Eintrag, den niemand gemacht hat.
        """
        vorher = sorted(aufgabe.personen.values_list("pk", flat=True))
        aufgabe = super().update(aufgabe, daten)
        nachher = sorted(aufgabe.personen.values_list("pk", flat=True))
        if vorher != nachher:
            Protokolleintrag.schreiben(
                aufgabe,
                Protokolleintrag.Aktion.GEAENDERT,
                {"personen": {"alt": vorher, "neu": nachher}},
            )
        return aufgabe

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


# --- Module: SPG Academy ----------------------------------------------------


class CanvaspunktSerializer(serializers.ModelSerializer):
    class Meta:
        model = Canvaspunkt
        fields = ["id", "feld", "text", "reihenfolge"]


class PersonaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Persona
        fields = [
            "id", "vorhaben", "name", "rolle", "alter", "geschlecht", "wohnort", "beruf",
            "haushalt", "einkommen", "beduerfnisse", "probleme", "reihenfolge",
        ]


class VorhabenSerializer(serializers.ModelSerializer):
    """
    Ein Vorhaben samt allen Punkten seiner Leinwand — in einem Stück.

    Die Punkte kommen mit, weil die Leinwand sie alle auf einmal zeigt und es
    nur eine Handvoll Vorhaben gibt. Geschrieben werden sie nicht hier, sondern
    feldweise über `POST /api/vorhaben/<id>/feld/`, der Stand des Business Plan
    Lite über `POST /api/vorhaben/<id>/stand/`.
    """

    punkte = serializers.SerializerMethodField()
    personas = serializers.SerializerMethodField()
    zuletzt = serializers.SerializerMethodField()

    class Meta:
        model = Vorhaben
        fields = ["id", "titel", "punkte", "personas", "planstand", "zuletzt"]
        read_only_fields = ["planstand"]

    def get_punkte(self, vorhaben):
        # Nur die nicht gelöschten — über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = [p for p in vorhaben.canvaspunkte.all() if p.geloescht_am is None]
        menge.sort(key=lambda p: (p.feld, p.reihenfolge, p.id))
        return CanvaspunktSerializer(menge, many=True).data

    def get_personas(self, vorhaben):
        menge = [p for p in vorhaben.personas.all() if p.geloescht_am is None]
        menge.sort(key=lambda p: (p.reihenfolge, p.id))
        return PersonaSerializer(menge, many=True).data

    def get_zuletzt(self, vorhaben):
        """
        Wann zuletzt daran gearbeitet wurde — auch ein entfernter Punkt zählt.

        Gerechnet, nicht gespeichert: Ein Feld am Vorhaben müsste bei jedem
        Punkt mitgeschrieben werden, und genau das vergisst der nächste Weg,
        der einen Punkt ändert.
        """
        stempel = (
            [vorhaben.geaendert_am]
            + [p.geaendert_am for p in vorhaben.canvaspunkte.all()]
            + [p.geaendert_am for p in vorhaben.personas.all()]
        )
        return max(stempel)


class PraktikumsthemaSerializer(serializers.ModelSerializer):
    """
    Ein Praktikumsthema samt dem Auftrag an das LLM.

    Der Auftrag kommt fertig mit, statt auf Knopfdruck geholt zu werden:
    Safari lässt in die Zwischenablage nur schreiben, solange der Klick noch
    „frisch" ist — nach einer Anfrage an den Server ist er das nicht mehr.
    """

    auftrag = serializers.SerializerMethodField()

    class Meta:
        model = Praktikumsthema
        fields = ["id", "titel", "art", "kurzbeschreibung", "punkte", "ausschreibung", "auftrag", "geaendert_am"]
        read_only_fields = ["geaendert_am"]

    def get_auftrag(self, thema):
        return ausschreibung.auftrag(thema)

    def validate_ausschreibung(self, text):
        """
        Abgewiesen wird hier und nicht erst beim PDF: Beim Speichern sitzt man
        vor dem Text und kann kürzen. Beim PDF stünde man mit einem Aushang da,
        der nicht auf die Seite passt.
        """
        if len(text) > ausschreibung.HOECHSTENS:
            raise serializers.ValidationError(
                f"Das sind über {ausschreibung.HOECHSTENS} Zeichen — für einen Aushang viel zu lang."
            )
        if not ausschreibung.passt(text):
            raise serializers.ValidationError(
                "Die Ausschreibung passt auch in kleinerer Schrift nicht auf eine Seite. "
                "Kürze sie — oder bitte das LLM darum."
            )
        return text


# --- Module: Thoughts (die Lagekarte) ------------------------------------------------------


class LagethemaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lagethema
        fields = ["id", "name", "farbe", "x", "y"]


class LageschrittSerializer(serializers.ModelSerializer):
    """
    Ein Schritt. `haengt_an` gibt es nur beim Anlegen: „Nächster Schritt"
    legt den Schritt **und** die Verbindung zum Vorgänger an — in einem Zug,
    damit nie ein neuer Schritt ohne seinen Pfeil dasteht, weil die zweite
    Anfrage gescheitert ist.
    """

    haengt_an = serializers.PrimaryKeyRelatedField(
        queryset=Lageschritt.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Lageschritt
        fields = ["id", "thema", "titel", "art", "status", "frist", "notiz", "x", "y", "haengt_an"]

    def create(self, daten):
        vorgaenger = daten.pop("haengt_an", None)
        schritt = super().create(daten)
        if vorgaenger is not None:
            Lageverbindung.objects.create(von=vorgaenger, nach=schritt)
        return schritt

    def update(self, schritt, daten):
        daten.pop("haengt_an", None)
        return super().update(schritt, daten)


class LageverbindungSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lageverbindung
        fields = ["id", "von", "nach", "text"]
        # Die Einschränkung am Modell gilt nur unter den lebenden; DRF liest
        # daraus sonst einen Prüfer, der auch gelöste Verbindungen mitzählt.
        validators = []

    def validate(self, daten):
        alt = self.instance
        von = daten.get("von", alt.von if alt else None)
        nach = daten.get("nach", alt.nach if alt else None)
        if von == nach:
            raise serializers.ValidationError("Ein Schritt kann nicht an sich selbst hängen.")
        doppelt = Lageverbindung.objects.filter(von=von, nach=nach)
        if alt:
            doppelt = doppelt.exclude(pk=alt.pk)
        if doppelt.exists():
            raise serializers.ValidationError("Diese Verbindung gibt es schon.")
        if lagekarte.ergaebe_kreis(von.pk, nach.pk, ohne_id=alt.pk if alt else None):
            raise serializers.ValidationError("Das ergäbe einen Kreis — dann wartet alles aufeinander.")
        return daten


# --- Module: Förderungen ----------------------------------------------------


def _geld(werte: dict) -> dict:
    """Decimal als Zeichenkette, wie alles Geld in der Schnittstelle."""
    return {k: str(v) for k, v in werte.items()}


class FoerderstundenSerializer(serializers.ModelSerializer):
    # Initialen des Nutzers oder der Name — damit die Seite nicht selbst
    # entscheidet, welches von beiden gilt.
    name = serializers.CharField(read_only=True)

    class Meta:
        model = Foerderstunden
        fields = ["id", "paket", "nutzer", "person", "name", "stunden"]
        # Sonst prüfte DRF den Namen als Pflichtfeld, bevor `validate` sagen
        # kann, dass ein Nutzer genügt.
        extra_kwargs = {"person": {"required": False}}

    def validate_stunden(self, wert):
        if wert < 0:
            raise serializers.ValidationError("Stunden sind nicht negativ.")
        return wert

    def validate(self, daten):
        nutzer = daten.get("nutzer", self.instance.nutzer if self.instance else None)
        person = daten.get("person", self.instance.person if self.instance else "").strip()
        # Wer einen Nutzer wählt, löscht damit den Namen — und umgekehrt. Sonst
        # müsste die Seite beim Umstellen immer beide Felder mitschicken.
        if "nutzer" in daten and nutzer is not None:
            person = ""
        elif "person" in daten and person:
            nutzer = None
        if (nutzer is None) == (not person):
            raise serializers.ValidationError({"person": "Entweder ein Nutzer oder ein Name."})
        daten["nutzer"], daten["person"] = nutzer, person
        return daten


class FoerderkapazitaetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foerderkapazitaet
        fields = ["id", "nutzer", "stunden_je_monat"]

    def validate_stunden_je_monat(self, wert):
        if wert < 0:
            raise serializers.ValidationError("Stunden sind nicht negativ.")
        return wert

    def validate_nutzer(self, nutzer):
        # Hier und nicht erst in der Datenbank: Deren Einschränkung käme als
        # 500 zurück, nicht als Satz.
        andere = Foerderkapazitaet.objects.filter(nutzer=nutzer)
        if self.instance is not None:
            andere = andere.exclude(pk=self.instance.pk)
        if andere.exists():
            raise serializers.ValidationError(f"Für {nutzer.name} steht schon eine Kapazität.")
        return nutzer


class FoerderpostenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foerderposten
        fields = ["id", "antrag", "paket", "bezeichnung", "betrag", "reihenfolge"]

    def validate(self, daten):
        antrag = daten.get("antrag", self.instance.antrag if self.instance else None)
        paket = daten.get("paket", self.instance.paket if self.instance else None)
        if paket is not None and paket.antrag_id != antrag.id:
            raise serializers.ValidationError({"paket": "Das Paket gehört zu einem anderen Antrag."})
        if daten.get("betrag") is not None and daten["betrag"] < 0:
            raise serializers.ValidationError({"betrag": "Ein Betrag ist nicht negativ."})
        return daten


class FoerderabschnittSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foerderabschnitt
        fields = ["id", "antrag", "titel", "text", "reihenfolge"]


class FoerderpaketSerializer(serializers.ModelSerializer):
    stunden = serializers.SerializerMethodField()
    kosten = serializers.SerializerMethodField()

    class Meta:
        model = Foerderpaket
        fields = ["id", "antrag", "titel", "ziel", "ergebnis", "von", "bis", "betrag", "reihenfolge", "stunden", "kosten"]

    def get_stunden(self, paket):
        stunden = sorted(foerderung.lebende_stunden(paket), key=lambda s: (s.name, s.id))
        return FoerderstundenSerializer(stunden, many=True).data

    def get_kosten(self, paket):
        # Der Antrag kommt aus dem Kontext, wenn das Paket mit ihm geholt
        # wird — sonst zöge jedes Paket ihn einzeln nach.
        antrag = self.context.get("antrag") or paket.antrag
        return _geld(foerderung.paketkosten(paket, antrag))

    def validate(self, daten):
        # Hier und nicht erst in der Datenbank: Deren Einschränkung käme als
        # 500 zurück, nicht als Satz, der sagt, was falsch ist.
        von = daten.get("von", self.instance.von if self.instance else 1)
        bis = daten.get("bis", self.instance.bis if self.instance else von)
        if bis < von:
            raise serializers.ValidationError({"bis": "Das Paket endet, bevor es anfängt."})
        if daten.get("betrag") is not None and daten["betrag"] < 0:
            raise serializers.ValidationError({"betrag": "Ein Betrag ist nicht negativ."})
        return daten


class FoerderantragSerializer(serializers.ModelSerializer):
    """
    Ein Antrag samt Paketen und dem, was daraus gerechnet wird — Summe,
    Laufzeit, Reife. `zeichen` sagt der Seite, was das Formular höchstens nimmt,
    damit die Zahl nur in `services/foerderung.py` steht.
    """

    abschnitte = serializers.SerializerMethodField()
    pakete = serializers.SerializerMethodField()
    posten = serializers.SerializerMethodField()
    kosten = serializers.SerializerMethodField()
    summe = serializers.SerializerMethodField()
    laufzeit = serializers.SerializerMethodField()
    reife = serializers.SerializerMethodField()
    zeichen = serializers.SerializerMethodField()
    # Ob die Stunden Geld sind. Die Regel steht in `services/foerderung.py`;
    # die Seite liest sie, statt die Rolle selbst zu deuten.
    stunden_sind_geld = serializers.SerializerMethodField()

    class Meta:
        model = Foerderantrag
        fields = [
            "id", "programm", "nummer", "titel", "stand", "foerderwerber", "rolle", "beginn", "zeitachse",
            "beschreibung", "datenbedarf",
            "stundensatz", "gemeinkosten", "foerderquote",
            "abschnitte", "pakete", "posten", "kosten", "summe", "laufzeit", "reife", "zeichen", "stunden_sind_geld",
            "geaendert_am",
        ]
        read_only_fields = ["geaendert_am"]

    def get_abschnitte(self, antrag):
        return FoerderabschnittSerializer(foerderung.lebende_abschnitte(antrag), many=True).data

    def get_pakete(self, antrag):
        pakete = sorted(foerderung.lebende_pakete(antrag), key=lambda p: (p.reihenfolge, p.id))
        return FoerderpaketSerializer(pakete, many=True, context={**self.context, "antrag": antrag}).data

    def get_posten(self, antrag):
        posten = sorted(foerderung.lebende_posten(antrag), key=lambda p: (p.reihenfolge, p.id))
        return FoerderpostenSerializer(posten, many=True).data

    def get_kosten(self, antrag):
        return _geld(foerderung.kosten(antrag))

    def get_stunden_sind_geld(self, antrag):
        return foerderung.stunden_kosten_geld(antrag)

    def validate(self, daten):
        for feld in ("stundensatz", "gemeinkosten", "foerderquote"):
            if daten.get(feld) is not None and daten[feld] < 0:
                raise serializers.ValidationError({feld: "Der Wert ist nicht negativ."})
        if daten.get("foerderquote") is not None and daten["foerderquote"] > 100:
            raise serializers.ValidationError({"foerderquote": "Mehr als 100 % gibt es nicht."})
        if daten.get("zeitachse") is not None and not 1 <= daten["zeitachse"] <= 120:
            raise serializers.ValidationError({"zeitachse": "Der Zeitplan zeigt 1 bis 120 Monate."})
        return daten

    def get_summe(self, antrag):
        return str(foerderung.summe(antrag))

    def get_laufzeit(self, antrag):
        return foerderung.laufzeit(antrag)

    def get_reife(self, antrag):
        return foerderung.reife(antrag)

    def get_zeichen(self, antrag):
        return foerderung.ZEICHEN


class FoerderfrageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foerderfrage
        fields = ["id", "programm", "frage", "antwort", "beantwortet", "quelle", "reihenfolge", "geaendert_am"]
        read_only_fields = ["geaendert_am"]


class FoerdergeberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foerdergeber
        fields = ["id", "name", "kurz", "link", "beschreibung", "organisation"]


class FoerderprogrammSerializer(serializers.ModelSerializer):
    """
    Das Programm mit allem, was darunter hängt — eine Abfrage für die ganze
    Seite. Geschrieben wird je Teil über dessen eigenen Weg.
    """

    fragen = serializers.SerializerMethodField()
    antraege = serializers.SerializerMethodField()

    class Meta:
        model = Foerderprogramm
        fields = [
            "id", "geber", "name", "stelle", "link", "max_foerderung", "max_monate", "steckbrief",
            "fragen", "antraege",
        ]

    def get_fragen(self, programm):
        fragen = [f for f in programm.fragen.all() if f.geloescht_am is None]
        return FoerderfrageSerializer(sorted(fragen, key=lambda f: (f.reihenfolge, f.id)), many=True).data

    def get_antraege(self, programm):
        antraege = [a for a in programm.antraege.all() if a.geloescht_am is None]
        return FoerderantragSerializer(sorted(antraege, key=lambda a: (a.nummer, a.id)), many=True).data
