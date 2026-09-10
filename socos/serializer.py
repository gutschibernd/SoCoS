"""
Übersetzung zwischen Modellen und JSON.

Geld und Zeit gehen als **Zeichenkette** hinaus (`COERCE_DECIMAL_TO_STRING`).
JSON kennt nur Gleitkomma, und dort ist 0.1 + 0.2 nicht 0.3.
"""

from rest_framework import serializers

from socos import berechtigung
from socos.models import (
    Arbeitspaket,
    Bereich,
    Event,
    Eventziel,
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


class ArbeitspaketSerializer(serializers.ModelSerializer):
    unteraufgaben = UnteraufgabeSerializer(many=True, read_only=True)
    fortschritt = serializers.SerializerMethodField()
    projekt = serializers.IntegerField(source="bereich.projekt_id", read_only=True)

    class Meta:
        model = Arbeitspaket
        fields = [
            "id", "bereich", "projekt", "titel", "notiz", "status", "stufenstand",
            "reihenfolge", "stufen", "fortschritt", "unteraufgaben",
        ]

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
            bereich = daten.get("bereich")
            stufen = stufenvorlage(bereich.art) if bereich else []

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


class BereichSerializer(serializers.ModelSerializer):
    pakete = serializers.SerializerMethodField()

    class Meta:
        model = Bereich
        fields = ["id", "projekt", "titel", "art", "reihenfolge", "pakete"]

    def get_pakete(self, bereich):
        # Nur die nicht gelöschten: über die Beziehung käme sonst auch weich
        # Gelöschtes mit, weil Django dafür den Basis-Manager nimmt.
        menge = bereich.pakete.filter(geloescht_am__isnull=True).order_by("reihenfolge", "titel")
        return ArbeitspaketSerializer(menge, many=True, context=self.context).data


class ProjektSerializer(serializers.ModelSerializer):
    bereiche = serializers.SerializerMethodField()
    gebuchte_sekunden = serializers.SerializerMethodField()

    class Meta:
        model = Projekt
        fields = [
            "id", "titel", "untertitel", "farbe", "reihenfolge",
            "bereiche", "gebuchte_sekunden",
        ]

    def get_bereiche(self, projekt):
        menge = projekt.bereiche.filter(geloescht_am__isnull=True).order_by(
            "reihenfolge", "titel"
        )
        return BereichSerializer(menge, many=True, context=self.context).data

    def get_gebuchte_sekunden(self, projekt):
        return self.context.get("sekunden_je_projekt", {}).get(projekt.pk, 0)


# --- Zeit -------------------------------------------------------------------


class ZeitbuchungSerializer(serializers.ModelSerializer):
    sekunden = serializers.SerializerMethodField()
    laeuft = serializers.BooleanField(read_only=True)
    paket_titel = serializers.CharField(source="paket.titel", read_only=True)
    projekt_titel = serializers.CharField(source="paket.bereich.projekt.titel", read_only=True)
    projekt = serializers.IntegerField(source="paket.bereich.projekt_id", read_only=True)
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

    class Meta:
        model = Kontakt
        fields = [
            "id", "name", "funktion", "email", "telefon",
            "organisation", "organisation_name",
            "kennengelernt_auf", "kennengelernt_auf_titel",
            "ball", "offener_punkt", "letzter_kontakt", "verlauf",
        ]

    def get_letzter_kontakt(self, kontakt):
        letzter = (
            kontakt.verlauf.filter(geloescht_am__isnull=True).order_by("-datum").first()
        )
        return letzter.datum if letzter else None

    def get_verlauf(self, kontakt):
        menge = kontakt.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data


class OrganisationSerializer(serializers.ModelSerializer):
    kontakte = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = [
            "id", "name", "kurz", "typ", "stufe", "prioritaet", "nutzen",
            "kontakte", "verlauf",
        ]

    def get_kontakte(self, org):
        menge = org.kontakte.filter(geloescht_am__isnull=True).order_by("name")
        return KontaktSerializer(menge, many=True, context=self.context).data

    def get_verlauf(self, org):
        menge = org.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data


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
