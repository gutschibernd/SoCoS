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
from socos.services import auswertung, zeit as zeitdienst


class NutzerSerializer(serializers.ModelSerializer):
    """
    Adresse und Geburtsdatum sieht nur man selbst und der Admin. Die
    Entscheidung fällt serverseitig — ein im Frontend verstecktes Feld ist nur
    ein ungenanntes Feld.
    """

    class Meta:
        model = Nutzer
        fields = [
            "id", "name", "initialen", "farbe", "funktion", "email", "telefon",
            "strasse", "ort", "geburtsdatum", "is_active",
        ]
        read_only_fields = ["id", "is_active"]

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
    stufen = serializers.SerializerMethodField()
    projekt = serializers.IntegerField(source="bereich.projekt_id", read_only=True)

    class Meta:
        model = Arbeitspaket
        fields = [
            "id", "bereich", "projekt", "titel", "notiz", "status", "stufenstand",
            "reihenfolge", "stufen", "fortschritt", "unteraufgaben",
        ]

    def get_fortschritt(self, paket):
        return auswertung.fortschritt(paket)

    def get_stufen(self, paket):
        """Die Stufen des Bereichs, mitgeliefert — sonst bräuchte die Leiste
        einen zweiten Abruf je Paket."""
        return paket.bereich.stufen

    def validate(self, daten):
        bereich = daten.get("bereich") or getattr(self.instance, "bereich", None)
        stand = daten.get("stufenstand", getattr(self.instance, "stufenstand", 0))
        if bereich and not 0 <= stand <= len(bereich.stufen or []):
            raise serializers.ValidationError(
                {"stufenstand": f"Muss zwischen 0 und {len(bereich.stufen or [])} liegen."}
            )
        return daten


class BereichSerializer(serializers.ModelSerializer):
    pakete = serializers.SerializerMethodField()

    class Meta:
        model = Bereich
        fields = ["id", "projekt", "titel", "art", "reihenfolge", "stufen", "pakete"]

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

    class Meta:
        model = Verlaufseintrag
        fields = [
            "id", "kontakt", "organisation", "datum", "art", "titel", "text",
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
    letzter_kontakt = serializers.SerializerMethodField()
    verlauf = serializers.SerializerMethodField()

    class Meta:
        model = Kontakt
        fields = [
            "id", "name", "funktion", "organisation", "organisation_name",
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
        fields = ["id", "name", "kurz", "typ", "stufe", "nutzen", "kontakte", "verlauf"]

    def get_kontakte(self, org):
        menge = org.kontakte.filter(geloescht_am__isnull=True).order_by("name")
        return KontaktSerializer(menge, many=True, context=self.context).data

    def get_verlauf(self, org):
        menge = org.verlauf.filter(geloescht_am__isnull=True).order_by("-datum", "-id")
        return VerlaufseintragSerializer(menge, many=True, context=self.context).data


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
