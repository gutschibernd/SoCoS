"""
Die Schnittstelle unter /api/.

Zeiträume sind **ausdrückliche Parameter** (`?von=&bis=`). Ohne Angabe kommt
alles — es gibt keinen stillen Filter auf „aktueller Monat".
"""

import logging
import tempfile
from datetime import date, timedelta
from pathlib import Path

from django.contrib.auth import logout
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from socos import aenderungen, berechtigung, serializer as ser, sicherung
from socos.models import (
    AUFGABEN,
    LEITFRAGEN,
    UMFANG,
    WORKSHOPS,
    Anhangart,
    Arbeitspaket,
    Abschnittstand,
    Aufgabe,
    Canvasfeld,
    Canvaspunkt,
    Event,
    Eventziel,
    Fixkosten,
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
    Planabschnitt,
    Projekt,
    Projektphase,
    Protokolleintrag,
    Rueckmeldung,
    Unteraufgabe,
    Verlaufseintrag,
    Vorhaben,
    Zeitbuchung,
    auffangpaket,
)
from socos.services import auswertung, finanzen
from socos.services import zeit as zeitdienst

logger = logging.getLogger(__name__)


def _datum(request, name):
    """Ein Datumsparameter. Ein unlesbarer Wert wird gemeldet, nicht verworfen."""
    roh = request.query_params.get(name)
    if not roh:
        return None
    try:
        return date.fromisoformat(roh)
    except ValueError:
        raise ValidationError({name: f"„{roh}“ ist kein Datum im Format JJJJ-MM-TT."})


class SocosViewSet(viewsets.ModelViewSet):
    """
    Gemeinsame Grundlage. Die Berechtigung kommt aus `socos/berechtigung.py`;
    `DELETE` löscht weich, weil `Basismodell.delete()` das tut.
    """

    permission_classes = [berechtigung.SocosBerechtigung]


# --- Projektstruktur --------------------------------------------------------


def _mit_buchungssummen(kontext):
    """
    Die gebuchte Zeit je Projekt, je Paket und je Paket und Person — einmal
    für die ganze Antwort gerechnet, nicht einmal je Zeile. Die Serializer
    lesen sie aus dem Kontext; fehlt er, steht 0 da.
    """
    kontext["sekunden_je_projekt"] = auswertung.sekunden_je_projekt()
    kontext["sekunden_je_paket"] = auswertung.sekunden_je_paket()
    kontext["sekunden_je_paket_und_person"] = auswertung.sekunden_je_paket_und_person()
    return kontext


class ProjektViewSet(SocosViewSet):
    serializer_class = ser.ProjektSerializer
    queryset = Projekt.objects.all()

    def get_serializer_context(self):
        return _mit_buchungssummen(super().get_serializer_context())


class ProjektphaseViewSet(SocosViewSet):
    serializer_class = ser.ProjektphaseSerializer
    queryset = Projektphase.objects.select_related("projekt")

    def get_serializer_context(self):
        return _mit_buchungssummen(super().get_serializer_context())


class ArbeitspaketViewSet(SocosViewSet):
    serializer_class = ser.ArbeitspaketSerializer
    queryset = Arbeitspaket.objects.select_related("phase", "phase__projekt")

    def get_serializer_context(self):
        return _mit_buchungssummen(super().get_serializer_context())

    def get_queryset(self):
        menge = super().get_queryset()
        if projekt := self.request.query_params.get("projekt"):
            menge = menge.filter(phase__projekt_id=projekt)
        if status := self.request.query_params.get("status"):
            menge = menge.filter(status=status)
        return menge


class PensumViewSet(SocosViewSet):
    serializer_class = ser.PensumSerializer
    queryset = Pensum.objects.select_related("paket", "person")

    def get_serializer_context(self):
        return _mit_buchungssummen(super().get_serializer_context())

    def get_queryset(self):
        menge = super().get_queryset()
        if paket := self.request.query_params.get("paket"):
            menge = menge.filter(paket_id=paket)
        return menge


class UnteraufgabeViewSet(SocosViewSet):
    serializer_class = ser.UnteraufgabeSerializer
    queryset = Unteraufgabe.objects.select_related("paket")

    def get_queryset(self):
        menge = super().get_queryset()
        if paket := self.request.query_params.get("paket"):
            menge = menge.filter(paket_id=paket)
        return menge


# --- Zeit -------------------------------------------------------------------


class ZeitbuchungViewSet(SocosViewSet):
    serializer_class = ser.ZeitbuchungSerializer
    queryset = Zeitbuchung.objects.select_related(
        "person", "paket", "paket__phase", "paket__phase__projekt"
    )

    def _schneide_vergessene(self):
        """
        Vergessene Clock-outs werden hier abgeschnitten, nicht von einem
        nächtlichen Dienst. Ein Dienst wäre eine zweite Stelle, an der
        Buchungen verändert werden, und die sieht man beim Lesen des Codes
        nicht.

        Gerufen von jedem Einstieg, der Buchungen zeigt — auch von `laufend`
        und `entwuerfe`, die nicht über `get_queryset` gehen.
        """
        auswertung.entwuerfe_aus_vergessenen_clockouts()

    def get_queryset(self):
        self._schneide_vergessene()
        menge = super().get_queryset()
        von, bis = _datum(self.request, "von"), _datum(self.request, "bis")
        if von:
            menge = menge.filter(start__date__gte=von)
        if bis:
            menge = menge.filter(start__date__lte=bis)
        if person := self.request.query_params.get("person"):
            menge = menge.filter(person_id=person)
        if paket := self.request.query_params.get("paket"):
            menge = menge.filter(paket_id=paket)
        if projekt := self.request.query_params.get("projekt"):
            menge = menge.filter(paket__phase__projekt_id=projekt)
        return menge

    def perform_create(self, serializer):
        person = serializer.validated_data.get("person") or self.request.user
        self._pruefe_fremde(person)
        serializer.save(person=person)

    def perform_update(self, serializer):
        self._pruefe_fremde(serializer.instance.person)
        serializer.save()

    def _pruefe_fremde(self, person):
        if person != self.request.user and not berechtigung.darf_fremde_zeiten_aendern(
            self.request.user
        ):
            raise PermissionDenied("Fremde Zeiten darfst du nicht ändern.")

    @action(detail=False, methods=["get"])
    def laufend(self, request):
        """
        Die eigene laufende Buchung.

        Immer ein Objekt mit dem Schlüssel `laufend`, nie ein blankes `null`:
        Ein Body, der nur aus `null` besteht, wird von DRF als **leerer** Body
        gerendert, und der Aufrufer bekommt einen Parserfehler statt einer
        Antwort.
        """
        self._schneide_vergessene()
        buchung = auswertung.laufende_buchung(request.user)
        return Response({"laufend": self.get_serializer(buchung).data if buchung else None})

    def _paket(self, request):
        """
        Das Paket aus der Anfrage — oder None, wenn keines mitkam.

        Hier steht die Torwache für Start und Umbuchen: Beide wählen ein Paket
        als **Ziel**, und beide kamen bisher an jeder Prüfung vorbei, weil die
        Liste der buchbaren Stände nur im Frontend stand.
        """
        paket_id = request.data.get("paket")
        if not paket_id:
            return None
        paket = Arbeitspaket.objects.filter(pk=paket_id).first()
        if paket is None:
            raise ValidationError({"paket": "Dieses Arbeitspaket gibt es nicht."})
        if grund := paket.grund_gegen_buchung():
            raise ValidationError({"paket": grund})
        return paket

    @action(detail=False, methods=["post"])
    def clock_in(self, request):
        """
        Startet die Uhr — auf einem Paket, oder ohne.

        **Ohne `paket` läuft sie auf dem Auffangpaket** („Overhead"). Zeit soll
        sich aufzeichnen lassen, bevor man weiß, wohin sie gehört; umgebucht
        wird beim Clock-out oder später in der Zeitliste. Eine Buchung ohne
        Paket gibt es dabei nicht — siehe `auffangpaket()`.

        Läuft schon eine, wird sie beendet — mit der mitgeschickten Notiz. Das
        Nachfragen erledigt die Oberfläche, nicht der Server: Der Server darf
        nicht davon abhängen, dass jemand einen Dialog beantwortet.
        """
        paket = self._paket(request) or auffangpaket()

        with transaction.atomic():
            laufend = auswertung.laufende_buchung(request.user)
            if laufend:
                laufend.ende = timezone.now()
                laufend.notiz = request.data.get("notiz", laufend.notiz)
                laufend.save()
            neu = Zeitbuchung.objects.create(
                person=request.user, paket=paket, start=timezone.now()
            )
        return Response(self.get_serializer(neu).data, status=201)

    @action(detail=False, methods=["post"])
    def clock_out(self, request):
        """
        Beendet die laufende Buchung.

        Kommt ein `paket` mit, wird die Buchung dorthin umgebucht. Das ist der
        Gegenpart zum Start ohne Paket: Beim Aufhören weiß man, woran man
        gearbeitet hat — beim Anfangen oft noch nicht.
        """
        laufend = auswertung.laufende_buchung(request.user)
        if laufend is None:
            raise ValidationError({"detail": "Es läuft gerade keine Buchung."})
        if paket := self._paket(request):
            laufend.paket = paket
        laufend.ende = timezone.now()
        laufend.notiz = request.data.get("notiz", "")
        laufend.save()
        return Response(self.get_serializer(laufend).data)

    @action(detail=True, methods=["post"])
    def entwurf_bestaetigen(self, request, pk=None):
        """
        Bestätigt eine am Tagesende abgeschnittene Buchung — mit dem Ende, das
        die Person angibt. Erst danach zählt sie in Auswertungen mit.
        """
        buchung = self.get_object()
        self._pruefe_fremde(buchung.person)
        if not buchung.ist_entwurf:
            raise ValidationError({"detail": "Diese Buchung ist kein Entwurf."})

        if rohes_ende := request.data.get("ende"):
            feld = ser.ZeitbuchungSerializer().fields["ende"]
            buchung.ende = feld.to_internal_value(rohes_ende)
        if buchung.ende <= buchung.start:
            raise ValidationError({"ende": "Das Ende muss nach dem Start liegen."})

        buchung.notiz = request.data.get("notiz", buchung.notiz)
        buchung.ist_entwurf = False
        buchung.save()
        return Response(self.get_serializer(buchung).data)

    @action(detail=False, methods=["get"])
    def entwuerfe(self, request):
        self._schneide_vergessene()
        menge = auswertung.offene_entwuerfe(request.user)
        return Response(self.get_serializer(menge, many=True).data)


# --- Kontakte ---------------------------------------------------------------


class OrganisationViewSet(SocosViewSet):
    serializer_class = ser.OrganisationSerializer
    queryset = Organisation.objects.all()


class KontaktViewSet(SocosViewSet):
    serializer_class = ser.KontaktSerializer
    queryset = Kontakt.objects.select_related("organisation")

    def get_queryset(self):
        menge = super().get_queryset()
        if ball := self.request.query_params.get("ball"):
            menge = menge.filter(ball=ball)
        if suche := self.request.query_params.get("suche"):
            menge = menge.filter(name__icontains=suche)
        return menge


class VerlaufViewSet(SocosViewSet):
    serializer_class = ser.VerlaufseintragSerializer
    queryset = Verlaufseintrag.objects.select_related("kontakt", "organisation", "wer")

    def perform_create(self, serializer):
        # Wer den Eintrag geschrieben hat, bestimmt der Server. Ein Feld, das
        # der Aufrufer setzen darf, ist keine Auskunft mehr.
        serializer.save(wer=self.request.user)


# --- Events -----------------------------------------------------------------


class EventViewSet(SocosViewSet):
    serializer_class = ser.EventSerializer
    queryset = Event.objects.prefetch_related(
        "teilnehmer",
        "ziele__organisation",
        "ziele__kontakt__organisation",
        "verlauf__kontakt",
        "verlauf__organisation",
        "verlauf__wer",
    )


class EventzielViewSet(SocosViewSet):
    """Die Hitlist. Eine Zeile zeigt auf eine Organisation **oder** eine Person."""

    serializer_class = ser.EventzielSerializer
    queryset = Eventziel.objects.select_related(
        "event", "organisation", "kontakt", "kontakt__organisation"
    )

    def get_queryset(self):
        menge = super().get_queryset()
        if event := self.request.query_params.get("event"):
            menge = menge.filter(event_id=event)
        return menge


# --- Meetings ---------------------------------------------------------------


class MeetingViewSet(SocosViewSet):
    """
    Besprechungen samt Protokoll.

    Kein Zeitfilter: Es gibt ein paar Dutzend Meetings im Jahr, und ein stiller
    Filter auf „dieser Monat" wäre genau die Art Fehler, bei der eine Liste
    vollständig aussieht und es nicht ist. Gesucht und geteilt wird in der
    Oberfläche.
    """

    serializer_class = ser.MeetingSerializer
    queryset = Meeting.objects.prefetch_related(
        "kontakte__organisation", "organisationen", "teilnehmer", "abschnitte", "anhaenge"
    )

    @action(detail=True, methods=["post"])
    def protokoll(self, request, pk=None):
        """
        Setzt das Protokoll — die geschickten Abschnitte **ersetzen** die
        vorhandenen.

        So kommt das aufbereitete Protokoll in einem Stück herein: Der Text aus
        dem LLM wird in der Oberfläche an seinen Überschriften zerlegt (siehe
        `frontend/src/basis/meetings.ts`) und hier als Liste abgeliefert.

        **Warum ersetzen und nicht anhängen:** Wer den Text ein zweites Mal
        durch das LLM schickt, weil beim ersten Versuch die Hälfte fehlte, will
        das Ergebnis — nicht beides untereinander. Dass dabei Änderungen von
        Hand verlorengehen, ist die Nachfrage in der Oberfläche wert; sie steht
        dort, weil nur sie weiß, ob schon etwas dasteht.

        Ein Abschnitt ohne Überschrift *und* ohne Text wird übergangen: Das ist
        eine Leerzeile aus der Zwischenablage, kein Abschnitt.

        **Eine leere Liste verwirft das Protokoll.** So macht die Oberfläche das
        Erstellen rückgängig — das Meeting steht danach wieder bei der
        Mitschrift. Kein eigener Endpunkt dafür: Es ist dasselbe Ersetzen, nur
        durch nichts. Und weich gelöscht wie alles andere, das Alte steht im
        Änderungsprotokoll.
        """
        meeting = self.get_object()
        roh = request.data.get("abschnitte")
        if not isinstance(roh, list):
            raise ValidationError({"abschnitte": "Erwartet wird eine Liste von Abschnitten."})
        if len(roh) > 200:
            raise ValidationError(
                {"abschnitte": "Über 200 Abschnitte — das ist kein Protokoll mehr."}
            )

        neue = []
        for stelle, eintrag in enumerate(roh):
            if not isinstance(eintrag, dict):
                raise ValidationError(
                    {"abschnitte": "Jeder Abschnitt ist ein Objekt aus Überschrift und Text."}
                )
            ueberschrift = str(eintrag.get("ueberschrift") or "").strip()[:200]
            text = str(eintrag.get("text") or "").strip()
            if not ueberschrift and not text:
                continue
            neue.append((ueberschrift, text, stelle))

        # In einem Zug: Ein Abbruch zwischen Leeren und Schreiben ließe das
        # Meeting ohne Protokoll zurück, und das Original steht dann nur noch
        # in der Zwischenablage von jemandem.
        with transaction.atomic():
            for alt in meeting.abschnitte.filter(geloescht_am__isnull=True):
                alt.delete()
            for ueberschrift, text, stelle in neue:
                Meetingabschnitt.objects.create(
                    meeting=meeting, ueberschrift=ueberschrift, text=text, reihenfolge=stelle
                )

        return Response(self.get_serializer(meeting).data)


class MeetingabschnittViewSet(SocosViewSet):
    """Einzelne Abschnitte — angelegt, geändert und verschoben wird hier."""

    serializer_class = ser.MeetingabschnittSerializer
    queryset = Meetingabschnitt.objects.select_related("meeting")

    def get_queryset(self):
        menge = super().get_queryset()
        if meeting := self.request.query_params.get("meeting"):
            menge = menge.filter(meeting_id=meeting)
        return menge

    @action(detail=True, methods=["post"])
    def verschieben(self, request, pk=None):
        """
        Einen Abschnitt um eine Stelle nach oben oder unten.

        **Warum das der Server macht und nicht die Oberfläche:** Getauscht
        werden müssten zwei `reihenfolge`-Werte — und die sind nicht
        zwangsläufig verschieden. Ein Abschnitt, der von Hand angefügt wurde,
        und einer aus einer Aufbereitung können dieselbe Zahl tragen; ein
        Tausch bewegte dann nichts, und niemand sähe warum. Hier wird die
        ganze Liste in ihrer sichtbaren Ordnung neu durchnummeriert, und der
        Tausch ist danach immer echt.
        """
        abschnitt = self.get_object()
        richtung = request.data.get("richtung")
        if richtung not in ("hoch", "runter"):
            raise ValidationError(
                {"richtung": "Erwartet wird „hoch“ oder „runter“."}
            )

        geschwister = list(
            abschnitt.meeting.abschnitte.filter(geloescht_am__isnull=True).order_by(
                "reihenfolge", "id"
            )
        )
        stelle = [g.pk for g in geschwister].index(abschnitt.pk)
        ziel = stelle - 1 if richtung == "hoch" else stelle + 1
        if 0 <= ziel < len(geschwister):
            geschwister[stelle], geschwister[ziel] = geschwister[ziel], geschwister[stelle]

        with transaction.atomic():
            for nummer, g in enumerate(geschwister):
                if g.reihenfolge != nummer:
                    g.reihenfolge = nummer
                    g.save(update_fields=["reihenfolge", "geaendert_am"])

        return Response(
            ser.MeetingabschnittSerializer(geschwister, many=True).data
        )


# Eine Mail mit ein paar Ausweiskopien im Anhang hat schnell 20 MB; ein
# Video aus dem Meeting hätte das Zehnfache und gehört nicht hierher.
ANHANG_HOECHSTENS = 40 * 1024 * 1024


class MeetinganhangViewSet(SocosViewSet):
    """
    Dateien am Meeting: hochladen, herunterladen, entfernen.

    Kein Ändern: Eine Datei ersetzt man, indem man die neue hochlädt und die
    alte entfernt. Ein PATCH auf „Name" wäre eine zweite Wahrheit neben dem,
    was in der Datei steht.
    """

    serializer_class = ser.MeetinganhangSerializer
    queryset = Meetinganhang.objects.select_related("meeting")
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        menge = super().get_queryset()
        if meeting := self.request.query_params.get("meeting"):
            menge = menge.filter(meeting_id=meeting)
        return menge

    def create(self, request, *args, **kwargs):
        from socos.services import mailtext

        try:
            meeting = Meeting.objects.get(pk=request.data.get("meeting"))
        except (Meeting.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"meeting": "Dieses Meeting gibt es nicht."})

        datei = request.FILES.get("datei")
        if datei is None:
            raise ValidationError({"datei": "Es kam keine Datei an."})
        if datei.size > ANHANG_HOECHSTENS:
            raise ValidationError(
                {"datei": f"„{datei.name}“ ist größer als {ANHANG_HOECHSTENS // (1024 * 1024)} MB."}
            )

        # `anhaenge=ohne`: Die Oberfläche hat gefragt, und die Antwort war,
        # dass die Anhänge einer Mail nicht mit abgelegt werden.
        ohne = request.data.get("anhaenge") == "ohne"

        art, text, inhalt = Anhangart.DATEI, "", datei
        anfang = datei.read(4000)
        datei.seek(0)
        if mailtext.ist_mail(datei.name, anfang):
            try:
                roh = datei.read()
                weg = []
                if ohne:
                    roh, weg = mailtext.ohne_anhaenge(roh)
                    inhalt = ContentFile(roh)
                text = mailtext.mailtext(roh, weggelassen=weg)
                art = Anhangart.EMAIL
            except mailtext.KeineMail:
                # Dann liegt sie eben als Datei da. Abgelehnt wird nichts, nur
                # weil der Text nicht herauskommt — die Datei selbst ist das,
                # was aufbewahrt werden soll.
                inhalt = datei
            datei.seek(0)

        anhang = Meetinganhang(
            meeting=meeting,
            name=datei.name[:255],
            groesse=inhalt.size,
            art=art,
            text=text,
        )
        anhang.datei.save(datei.name, inhalt, save=False)
        anhang.save()
        return Response(self.get_serializer(anhang).data, status=201)

    @action(detail=True, methods=["get"])
    def datei(self, request, pk=None):
        """
        Die Datei selbst — hinter der Anmeldung, nicht unter `/medien/`.

        Immer als Download, auch bei PDF und Bild: Eine .eml oder ein HTML-
        Anhang, im Browser unter unserem Ursprung geöffnet, liefe mit der
        Sitzung dessen, der klickt.
        """
        anhang = self.get_object()
        try:
            griff = anhang.datei.open("rb")
        except FileNotFoundError:
            raise ValidationError({"datei": "Die Datei fehlt auf dem Server."})
        antwort = FileResponse(griff, as_attachment=True, filename=anhang.name)
        antwort["X-Content-Type-Options"] = "nosniff"
        return antwort


# --- Module: SPG Academy ----------------------------------------------------


class VorhabenViewSet(SocosViewSet):
    """
    Die Vorhaben der SPG Academy samt ihrer Leinwand.

    Sehen dürfen alle, bearbeiten Admin und Bearbeiter, ein Vorhaben entfernen
    nur der Admin — die gewöhnliche Regel aus `berechtigung.py`, keine eigene.
    """

    serializer_class = ser.VorhabenSerializer
    queryset = Vorhaben.objects.prefetch_related("canvaspunkte", "personas")

    @action(detail=False, methods=["get"])
    def felder(self, request):
        """
        Die Felder eines Workshops in der Reihenfolge der SPG Academy, samt
        Aufgabe und Leitfragen. `?workshop=canvas` (Vorgabe) oder `businessplan`.
        """
        workshop = request.query_params.get("workshop", "canvas")
        if workshop not in WORKSHOPS:
            raise ValidationError({"workshop": f"„{workshop}“ ist kein Workshop der SPG Academy."})
        return Response([
            {
                "feld": wert,
                "nummer": nummer,
                "titel": titel,
                "aufgabe": AUFGABEN.get(wert, []),
                "leitfragen": LEITFRAGEN[wert],
                "umfang": UMFANG.get(wert, ""),
            }
            for nummer, (wert, titel) in enumerate(WORKSHOPS[workshop].choices, start=1)
        ])

    @action(detail=True, methods=["post"])
    def feld(self, request, pk=None):
        """
        Setzt die Punkte **eines** Feldes. Die geschickte Liste ist danach der
        Inhalt des Feldes, in ihrer Reihenfolge.

        Ein Punkt mit `id` wird geändert, einer ohne angelegt, und was fehlt,
        wird entfernt (weich, wie alles). **Warum abgeglichen und nicht einfach
        ersetzt:** Beim Ersetzen stünde nach jedem Speichern jeder Punkt
        zweimal im Änderungsprotokoll — einmal entfernt, einmal neu angelegt —,
        auch der, an dem niemand etwas geändert hat. Die Frage „wer hat diesen
        Satz umgeschrieben" hätte dann keine Antwort mehr.

        **Warum ein Bearbeiter hier Punkte entfernen darf,** obwohl Löschen
        sonst dem Admin vorbehalten ist: Einen Stichpunkt zu streichen ist
        Arbeit am Text des Feldes, nicht das Entfernen eines Datensatzes, den
        jemand vermissen könnte. Der gestrichene Punkt bleibt weich gelöscht
        und steht im Änderungsprotokoll — so wie ein ersetzter
        Protokollabschnitt eines Meetings.
        """
        vorhaben = self.get_object()

        # Nur das Canvas. Der Business Plan Lite wird nicht hier geschrieben,
        # sondern im Dokument, das abgegeben wird — hier steht nur sein Stand
        # (siehe `stand`).
        feld = request.data.get("feld")
        if feld not in Canvasfeld.values:
            raise ValidationError({"feld": f"„{feld}“ ist kein Feld des Canvas."})

        roh = request.data.get("punkte")
        if not isinstance(roh, list):
            raise ValidationError({"punkte": "Erwartet wird eine Liste von Punkten."})
        if len(roh) > 60:
            raise ValidationError({"punkte": "Über 60 Punkte in einem Feld — das ist kein Stichpunkt mehr."})

        vorhanden = {
            p.pk: p
            for p in vorhaben.canvaspunkte.filter(feld=feld, geloescht_am__isnull=True)
        }
        gewuenscht = []
        for eintrag in roh:
            if not isinstance(eintrag, dict):
                raise ValidationError({"punkte": "Jeder Punkt ist ein Objekt mit einem Text."})
            text = str(eintrag.get("text") or "").strip()
            # Eine leere Zeile ist kein Punkt — sie entsteht, wenn jemand
            # Enter drückt und dann doch nichts schreibt.
            if not text:
                continue
            if len(text) > 2000:
                raise ValidationError({"punkte": "Ein Punkt ist höchstens 2000 Zeichen lang."})
            gewuenscht.append((eintrag.get("id"), text))

        with transaction.atomic():
            behalten = set()
            for stelle, (kennung, text) in enumerate(gewuenscht):
                punkt = vorhanden.get(kennung) if isinstance(kennung, int) else None
                if punkt is None:
                    Canvaspunkt.objects.create(
                        vorhaben=vorhaben, feld=feld, text=text, reihenfolge=stelle
                    )
                    continue
                behalten.add(punkt.pk)
                if punkt.text != text or punkt.reihenfolge != stelle:
                    punkt.text, punkt.reihenfolge = text, stelle
                    punkt.save()
            for kennung, punkt in vorhanden.items():
                if kennung not in behalten:
                    punkt.delete()

        return Response(self.get_serializer(self.get_queryset().get(pk=vorhaben.pk)).data)

    @action(detail=True, methods=["post"])
    def stand(self, request, pk=None):
        """
        Setzt den Stand **eines** Abschnitts des Business Plan Lite:
        `{"abschnitt": "markt", "stand": "entwurf"}`.

        Eine eigene Aktion statt eines PATCH auf `planstand`: Zwei, die
        gleichzeitig verschiedene Abschnitte weiterdrehen, schickten sonst
        jeder das ganze Wörterbuch — und der zweite überschriebe still den
        ersten.
        """
        abschnitt = request.data.get("abschnitt")
        if abschnitt not in Planabschnitt.values:
            raise ValidationError({"abschnitt": f"„{abschnitt}“ ist kein Abschnitt des Plans."})
        stand = request.data.get("stand")
        if stand not in Abschnittstand.values:
            raise ValidationError({"stand": f"„{stand}“ ist kein Stand."})

        vorhaben = self.get_object()
        with transaction.atomic():
            vorhaben = Vorhaben.objects.select_for_update().get(pk=vorhaben.pk)
            if vorhaben.planstand.get(abschnitt, Abschnittstand.OFFEN) != stand:
                vorhaben.planstand = {**vorhaben.planstand, abschnitt: stand}
                vorhaben.save()

        return Response(self.get_serializer(self.get_queryset().get(pk=vorhaben.pk)).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        """Die Leinwand als PDF — eine Seite A4 quer, zum Mitnehmen in den Workshop."""
        from socos.services import leinwand

        vorhaben = self.get_object()
        antwort = HttpResponse(leinwand.erzeugen(vorhaben), content_type="application/pdf")
        antwort["Content-Disposition"] = f'attachment; filename="{leinwand.dateiname(vorhaben)}"'
        return antwort


class PersonaViewSet(SocosViewSet):
    """
    Die Steckbriefe zu Customer Segments. Die gewöhnliche Regel: sehen alle,
    anlegen und ändern Admin und Bearbeiter, entfernen nur der Admin.
    """

    serializer_class = ser.PersonaSerializer
    queryset = Persona.objects.all()


# --- Finanzen ---------------------------------------------------------------
#
# Sehen dürfen alle. Eintragen nur der Admin — deshalb `schreiben_nur_admin`.


class KontostandViewSet(SocosViewSet):
    serializer_class = ser.KontostandSerializer
    queryset = Kontostand.objects.all()
    schreiben_nur_admin = True


class FixkostenViewSet(SocosViewSet):
    serializer_class = ser.FixkostenSerializer
    queryset = Fixkosten.objects.all()
    schreiben_nur_admin = True


class MonatskostenViewSet(SocosViewSet):
    serializer_class = ser.MonatskostenSerializer
    queryset = Monatskosten.objects.all()
    schreiben_nur_admin = True


# --- Nutzer und Protokoll ---------------------------------------------------


class NutzerViewSet(SocosViewSet):
    serializer_class = ser.NutzerSerializer
    queryset = Nutzer.objects.all()

    def get_queryset(self):
        menge = super().get_queryset()
        # Stillgelegte Konten sieht nur der Admin. Für alle anderen wären sie
        # in jeder Auswahlliste im Weg.
        if not berechtigung.ist_admin(self.request.user):
            menge = menge.filter(is_active=True)
        return menge

    def perform_update(self, serializer):
        # Sein Profil bearbeitet jeder selbst; fremde nur der Admin.
        if serializer.instance != self.request.user and not berechtigung.ist_admin(
            self.request.user
        ):
            raise PermissionDenied("Nur das eigene Profil.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """
        Konten werden nicht gelöscht, sondern stillgelegt.

        Django hat mit `is_active` bereits diesen Schalter, und an einem Konto
        hängen Zeitbuchungen, die im Nachweis stehen bleiben müssen.
        """
        raise ValidationError(
            {"detail": "Konten werden stillgelegt, nicht gelöscht. Dafür gibt es "
                       "„stilllegen“ — die gebuchten Zeiten bleiben erhalten."}
        )

    @action(detail=True, methods=["post"])
    def rolle(self, request, pk=None):
        """Setzt die Rolle. Nur der Admin, und niemals die eigene."""
        from django.contrib.auth.models import Group

        if not berechtigung.darf_nutzer_verwalten(request.user):
            raise PermissionDenied("Rollen vergibt ein Admin.")

        nutzer = self.get_object()
        if nutzer == request.user:
            # Sonst nimmt sich der letzte Admin versehentlich selbst die
            # Rechte und kommt an die Nutzerverwaltung nicht mehr heran.
            raise ValidationError({"detail": "Die eigene Rolle kann man hier nicht ändern."})

        neue = request.data.get("rolle")
        if neue not in berechtigung.ALLE_ROLLEN:
            raise ValidationError(
                {"rolle": f"Erlaubt sind: {', '.join(berechtigung.ALLE_ROLLEN)}."}
            )

        nutzer.groups.clear()
        nutzer.groups.add(Group.objects.get(name=neue))
        nutzer.is_staff = neue == berechtigung.ADMIN
        nutzer.save(update_fields=["is_staff"])
        return Response(self.get_serializer(nutzer).data)

    @action(detail=True, methods=["post"])
    def stilllegen(self, request, pk=None):
        if not berechtigung.darf_nutzer_verwalten(request.user):
            raise PermissionDenied("Konten verwaltet ein Admin.")
        nutzer = self.get_object()
        if nutzer == request.user:
            raise ValidationError({"detail": "Das eigene Konto kann man nicht stilllegen."})
        nutzer.is_active = False
        nutzer.save(update_fields=["is_active"])
        return Response(self.get_serializer(nutzer).data)

    @action(detail=True, methods=["post"])
    def aktivieren(self, request, pk=None):
        if not berechtigung.darf_nutzer_verwalten(request.user):
            raise PermissionDenied("Konten verwaltet ein Admin.")
        nutzer = self.get_object()
        nutzer.is_active = True
        nutzer.save(update_fields=["is_active"])
        return Response(self.get_serializer(nutzer).data)


class AufgabeViewSet(SocosViewSet):
    """
    Die Tafel unter „Intern · Aufgaben".

    Keine eigene Berechtigung: sehen darf jeder, schreiben der Bearbeiter,
    entfernen der Admin — die gewöhnliche Regel aus `socos/berechtigung.py`.
    Insbesondere gibt es **keine** Prüfung auf „meine eigene Aufgabe": Die
    Tafel ist gemeinsam, und sich gegenseitig etwas daraufzuschreiben ist ihr
    Zweck.

    `?erledigt=nein` lässt das Abgehakte weg. Ohne Angabe kommt alles — es gibt
    hier so wenig einen stillen Filter wie bei den Zeiträumen.

    Das gilt auch für die Ideenliste: Sie kommt aus **derselben** Antwort und
    wird in `basis/aufgaben.ts` herausgetrennt. Ein `?idee=` daneben wäre ein
    Filter ohne Aufrufer — die Oberfläche lädt die Tafel und die Ideen in
    einem Zug und hat beides ohnehin schon da.
    """

    serializer_class = ser.AufgabeSerializer
    queryset = Aufgabe.objects.select_related("person")

    def get_queryset(self):
        menge = super().get_queryset()
        if (erledigt := self.request.query_params.get("erledigt")) in ("ja", "nein"):
            menge = menge.filter(erledigt=erledigt == "ja")
        return menge


class RueckmeldungViewSet(SocosViewSet):
    """
    Wünsche und Fehlermeldungen.

    **Anlegen darf jeder Angemeldete** — auch ein Leser; deshalb eine eigene
    Berechtigungsklasse statt der gemeinsamen. Was darüber hinaus gilt, ist
    feldweise und steht im Serializer: Stand, Antwort und Version setzt nur ein
    Admin, seinen eigenen Text schärft der Melder selbst nach.
    """

    serializer_class = ser.RueckmeldungSerializer
    queryset = Rueckmeldung.objects.select_related("melder")
    permission_classes = [berechtigung.RueckmeldungsBerechtigung]

    def perform_update(self, serializer):
        # Fremde Einträge fasst nur ein Admin an. Ohne das könnte jeder den
        # Text einer fremden Meldung umschreiben — die Felder, die den Stand
        # betreffen, sind im Serializer schon abgesichert, der Text nicht.
        eigener = serializer.instance.melder_id == self.request.user.pk
        if not eigener and not berechtigung.darf_rueckmeldung_verwalten(self.request.user):
            raise PermissionDenied("Fremde Meldungen ändert ein Admin.")
        serializer.save()


class ProtokollViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Nur lesen. Ein Änderungsprotokoll, das man ändern kann, beantwortet die
    Frage nicht mehr, für die es da ist.
    """

    serializer_class = ser.ProtokollSerializer
    queryset = Protokolleintrag.objects.select_related("nutzer")
    permission_classes = [berechtigung.SocosBerechtigung]

    def get_queryset(self):
        menge = super().get_queryset()
        if modell := self.request.query_params.get("modell"):
            menge = menge.filter(modell=modell)
        if objekt := self.request.query_params.get("objekt"):
            menge = menge.filter(objekt_id=objekt)
        return menge


# --- Einzelne Auskünfte -----------------------------------------------------


@api_view(["GET"])
def ich(request):
    """
    Wer bin ich und was darf ich.

    Das Frontend darf hieraus **nichts** ableiten, was es nicht auch ohne
    dürfte: Die Antwort sagt, was anzuzeigen ist — entschieden wird jede
    einzelne Anfrage trotzdem serverseitig neu.
    """
    nutzer = request.user
    return Response(
        {
            "id": nutzer.pk,
            "name": nutzer.name,
            "email": nutzer.email,
            "initialen": nutzer.initialen,
            "farbe": nutzer.farbe,
            "funktion": nutzer.funktion,
            "rolle": berechtigung.rolle(nutzer),
            # Was dieser Nutzer noch nicht gesehen hat — eine Seite je Punkt.
            # Steht hier und nicht hinter einem eigenen Abruf: Das Fenster soll
            # aufgehen, sobald die Oberfläche steht, nicht eine Anfrage später.
            "neuigkeiten": aenderungen.punkte_seit(nutzer.neuigkeiten_bis),
            "darf": {
                "bearbeiten": berechtigung.darf_bearbeiten(nutzer),
                "loeschen": berechtigung.darf_loeschen(nutzer),
                "finanzen_eintragen": berechtigung.darf_finanzen_eintragen(nutzer),
                "nutzer_verwalten": berechtigung.darf_nutzer_verwalten(nutzer),
                "sichern": berechtigung.darf_sichern(nutzer),
                "rueckmeldungen_verwalten": berechtigung.darf_rueckmeldung_verwalten(nutzer),
            },
        }
    )


@api_view(["GET"])
def aenderungsliste(request):
    """Alle Versionen für die Rubrik „Änderungen" in der Doku."""
    return Response({"neueste": aenderungen.NEUESTE, "versionen": aenderungen.VERSIONEN})


@api_view(["POST"])
def neuigkeiten_gesehen(request):
    """
    „Verstanden" im Neuigkeitenfenster.

    Gesetzt wird die **neueste** Version, nicht die zuletzt angezeigte: Wer das
    Fenster nach der ersten Seite schließt, soll es beim nächsten Anmelden nicht
    wieder vorfinden. Was er übersprungen hat, steht in der Doku.
    """
    nutzer = request.user
    nutzer.neuigkeiten_bis = aenderungen.NEUESTE
    nutzer.save(update_fields=["neuigkeiten_bis"])
    return Response({"neuigkeiten_bis": nutzer.neuigkeiten_bis})


@api_view(["GET"])
def zeitnachweis(request):
    """
    Der Zeitnachweis eines Monats als PDF — für eine Person oder fürs Team.

    `?monat=JJJJ-MM` und wahlweise `?person=<id>`. Ohne Monat der laufende.
    """
    from socos.services import zeitnachweis as nachweis

    roh = request.query_params.get("monat")
    if roh:
        try:
            jahr, monat_nr = roh.split("-")
            monat = date(int(jahr), int(monat_nr), 1)
        except (ValueError, TypeError):
            raise ValidationError({"monat": f"„{roh}“ ist kein Monat im Format JJJJ-MM."})
    else:
        monat = timezone.localdate().replace(day=1)

    person = None
    if kennung := request.query_params.get("person"):
        person = Nutzer.objects.filter(pk=kennung).first()
        if person is None:
            raise ValidationError({"person": "Diesen Nutzer gibt es nicht."})

    daten = nachweis.erzeugen(monat, person)
    antwort = HttpResponse(daten, content_type="application/pdf")
    # `attachment`, nicht `inline`: Der Nachweis wird abgelegt und verschickt,
    # nicht überflogen. Ein PDF, das sich im Tab öffnet, muss man erst wieder
    # von Hand speichern.
    antwort["Content-Disposition"] = (
        f'attachment; filename="{nachweis.dateiname(monat, person)}"'
    )
    return antwort


@api_view(["GET"])
def dashboard(request):
    """
    Alles, was das Dashboard braucht — in einem Abruf.

    Ein Dashboard, das acht Ressourcen einzeln zieht, zeigt acht verschiedene
    Ladezustände nebeneinander und ist am Handy langsam.

    Der Zeitraum ist ausdrücklich: `?von=&bis=`. Ohne Angabe die laufende Woche
    — und das steht als `zeitraum` in der Antwort, damit niemand raten muss,
    worauf sich die Zahlen beziehen.
    """
    auswertung.entwuerfe_aus_vergessenen_clockouts()

    von, bis = _datum(request, "von"), _datum(request, "bis")
    if not von and not bis:
        von, bis = zeitdienst.woche_um()

    je_person = auswertung.sekunden_je_person(von, bis)
    je_projekt = auswertung.sekunden_je_projekt(von, bis)

    team = list(Nutzer.objects.filter(is_active=True))
    laufende = {
        b.person_id: b
        for b in Zeitbuchung.objects.select_related(
            "paket", "paket__phase", "paket__phase__projekt"
        ).filter(ende__isnull=True)
    }

    return Response(
        {
            "zeitraum": {"von": von, "bis": bis},
            "finanzen": finanzen.uebersicht(),
            "kontostand_verlauf": ser.KontostandSerializer(
                Kontostand.objects.order_by("datum"), many=True
            ).data,
            "team": [
                {
                    "id": n.pk,
                    "name": n.name,
                    "initialen": n.initialen,
                    "farbe": n.farbe,
                    "sekunden": je_person.get(n.pk, 0),
                    "laeuft_auf": (
                        laufende[n.pk].paket.titel if n.pk in laufende else None
                    ),
                    "laeuft_seit": laufende[n.pk].start if n.pk in laufende else None,
                }
                for n in team
            ],
            "team_sekunden": sum(je_person.values()),
            "projekte": [
                {
                    "id": p.pk,
                    "titel": p.titel,
                    "untertitel": p.untertitel,
                    "farbe": p.farbe,
                    "sekunden": je_projekt.get(p.pk, 0),
                }
                for p in Projekt.objects.all()
            ],
            "offene_entwuerfe": ser.ZeitbuchungSerializer(
                auswertung.offene_entwuerfe(request.user), many=True
            ).data,
        }
    )


# --- Sicherung --------------------------------------------------------------
#
# Dieselben zwei Vorgänge wie `sicherung_erstellen` und `sicherung_einspielen`,
# nur aus der Oberfläche heraus. Der Mechanismus steht in `socos/sicherung.py`;
# hier stehen Berechtigung, Nachfrage und der Weg der Datei.


@api_view(["GET"])
def sicherung_ausgeben(request):
    """
    Der gesamte Bestand als eine Datei zum Herunterladen.

    Das Archiv geht **im Speicher** hinaus, nicht über eine temporäre Datei:
    Es enthält Passwort-Hashes und Stammdaten des ganzen Teams, und eine Datei
    im Ablagepfad des Servers wäre eine Kopie davon, die niemand mehr aufräumt.
    Bei drei Nutzern und einem Archiv in der Größenordnung eines Megabytes ist
    das der kleinere Weg.
    """
    if not berechtigung.darf_sichern(request.user):
        raise PermissionDenied("Sicherungen darf nur ein Admin ausgeben.")

    with tempfile.TemporaryDirectory() as tmp:
        name = sicherung.archivname(timezone.localtime())
        pfad = sicherung.archiv_schreiben(Path(tmp) / name)
        inhalt = pfad.read_bytes()

    antwort = HttpResponse(inhalt, content_type="application/gzip")
    antwort["Content-Disposition"] = f'attachment; filename="{name}"'
    antwort["Content-Length"] = str(len(inhalt))
    return antwort


@api_view(["POST"])
def sicherung_einspielen(request):
    """
    Ein hochgeladenes Archiv **ersetzt** den Bestand — samt Konten und Rollen.

    Zwei Dinge müssen mitkommen: die Datei als `archiv` und das Wort
    `bestand-ersetzen` als `bestaetigung`. Das entspricht `--ja-bestand-ersetzen`
    auf der Kommandozeile: Ein Klick auf ein Zahnrad soll nicht ausreichen, um
    eine Datenbank zu tauschen.

    Danach wird die Sitzung beendet. Wer weiterarbeitete, hätte einen Ausweis
    aus einem Bestand, den es nicht mehr gibt — im günstigen Fall zeigt er auf
    ein fremdes Konto mit derselben Nummer.
    """
    if not berechtigung.darf_sichern(request.user):
        raise PermissionDenied("Einen Bestand einspielen darf nur ein Admin.")

    datei = request.FILES.get("archiv")
    if datei is None:
        raise ValidationError({"archiv": "Es kam keine Datei an."})

    if request.data.get("bestaetigung") != "bestand-ersetzen":
        raise ValidationError(
            {
                "bestaetigung": "Ohne ausdrückliche Bestätigung wird nichts ersetzt.",
            }
        )

    wer = request.user.email
    with tempfile.TemporaryDirectory() as tmp:
        pfad = Path(tmp) / "hochgeladen.tar.gz"
        with pfad.open("wb") as ziel:
            for stueck in datei.chunks():
                ziel.write(stueck)

        try:
            geleert = sicherung.archiv_einspielen(pfad)
        except sicherung.ArchivFehler as fehler:
            raise ValidationError({"archiv": str(fehler)})

    # Ins Server-Protokoll, nicht ins Änderungsprotokoll: Das eigene Protokoll
    # liegt in der Datenbank, die dieser Vorgang gerade ersetzt hat — ein
    # Eintrag darin wäre eine Sekunde später weg.
    logger.warning("Bestand ersetzt: %s spielte %s ein.", wer, datei.name)

    logout(request._request)
    return Response(
        {
            "eingespielt": datei.name,
            "geleert": {bezeichner: anzahl for bezeichner, anzahl in geleert},
            "hinweis": "Der Bestand wurde ersetzt. Bitte neu anmelden.",
        }
    )
