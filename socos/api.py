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
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from socos import berechtigung, serializer as ser, sicherung
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
    STUFENVORLAGEN,
    Verlaufseintrag,
    Zeitbuchung,
    stufenvorlage,
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


class ProjektViewSet(SocosViewSet):
    serializer_class = ser.ProjektSerializer
    queryset = Projekt.objects.all()

    def get_serializer_context(self):
        kontext = super().get_serializer_context()
        # Einmal für alle Projekte rechnen statt einmal je Projekt.
        kontext["sekunden_je_projekt"] = auswertung.sekunden_je_projekt()
        return kontext


class BereichViewSet(SocosViewSet):
    serializer_class = ser.BereichSerializer
    queryset = Bereich.objects.select_related("projekt")


class ArbeitspaketViewSet(SocosViewSet):
    serializer_class = ser.ArbeitspaketSerializer
    queryset = Arbeitspaket.objects.select_related("bereich", "bereich__projekt")

    def get_queryset(self):
        menge = super().get_queryset()
        if projekt := self.request.query_params.get("projekt"):
            menge = menge.filter(bereich__projekt_id=projekt)
        if status := self.request.query_params.get("status"):
            menge = menge.filter(status=status)
        return menge

    @action(detail=True, methods=["post"])
    def stufe(self, request, pk=None):
        """
        Setzt den Stufenstand und leitet den Status daraus ab — so wie im
        Entwurf: ein Klick auf die Leiste bewegt beides.
        """
        paket = self.get_object()
        try:
            stand = int(request.data.get("stufenstand"))
        except (TypeError, ValueError):
            raise ValidationError({"stufenstand": "Eine ganze Zahl wird gebraucht."})

        gesamt = len(paket.stufen or [])
        if not 0 <= stand <= gesamt:
            raise ValidationError({"stufenstand": f"Muss zwischen 0 und {gesamt} liegen."})

        paket.stufenstand = stand
        # Nur die drei neutralen Zustände werden abgeleitet. „eingereicht",
        # „zugesagt", „verworfen" und „offene Frage" setzt jemand bewusst —
        # sie automatisch zu überschreiben, machte die Leiste gefährlich.
        if paket.status in ("offen", "laeuft", "fertig"):
            paket.status = "fertig" if stand >= gesamt else ("laeuft" if stand else "offen")
        paket.save()
        return Response(self.get_serializer(paket).data)

    @action(detail=True, methods=["post"])
    def vorlage(self, request, pk=None):
        """
        Setzt die Stufenleiste des Pakets auf eine der drei Vorlagen.

        Der Aufrufer schickt nur den **Namen** der Vorlage, nicht ihren Inhalt.
        Sonst stünden die Stufen an einer zweiten Stelle — im Frontend —, und
        beim nächsten Nachbessern hätte man zwei Fassungen davon.
        """
        vorlage = request.data.get("vorlage")
        if vorlage not in STUFENVORLAGEN:
            erlaubt = ", ".join(STUFENVORLAGEN)
            raise ValidationError({"vorlage": f"Unbekannt. Erlaubt sind: {erlaubt}."})

        paket = self.get_object()
        paket.stufen = stufenvorlage(vorlage)
        # Der Stand gehört zur alten Leiste. Er auf die neue zu übertragen,
        # hieße zu behaupten, „Stufe 3" bedeute in beiden dasselbe.
        paket.stufenstand = 0
        paket.save()
        return Response(self.get_serializer(paket).data)


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
        "person", "paket", "paket__bereich", "paket__bereich__projekt"
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
            menge = menge.filter(paket__bereich__projekt_id=projekt)
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

    @action(detail=False, methods=["post"])
    def clock_in(self, request):
        """
        Startet die Uhr auf einem Paket.

        Läuft schon eine, wird sie beendet — mit der mitgeschickten Notiz. Das
        Nachfragen erledigt die Oberfläche, nicht der Server: Der Server darf
        nicht davon abhängen, dass jemand einen Dialog beantwortet.
        """
        paket_id = request.data.get("paket")
        if not paket_id:
            raise ValidationError({"paket": "Auf welches Arbeitspaket?"})
        paket = Arbeitspaket.objects.filter(pk=paket_id).first()
        if paket is None:
            raise ValidationError({"paket": "Dieses Arbeitspaket gibt es nicht."})

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
        laufend = auswertung.laufende_buchung(request.user)
        if laufend is None:
            raise ValidationError({"detail": "Es läuft gerade keine Buchung."})
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
            "darf": {
                "bearbeiten": berechtigung.darf_bearbeiten(nutzer),
                "loeschen": berechtigung.darf_loeschen(nutzer),
                "finanzen_eintragen": berechtigung.darf_finanzen_eintragen(nutzer),
                "nutzer_verwalten": berechtigung.darf_nutzer_verwalten(nutzer),
                "sichern": berechtigung.darf_sichern(nutzer),
            },
        }
    )


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
            "paket", "paket__bereich", "paket__bereich__projekt"
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
