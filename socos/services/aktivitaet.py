"""
Was zuletzt passiert ist — das Änderungsprotokoll als Sätze fürs Dashboard.

Gelesen wird **nur** das Protokoll; es gibt keine zweite Liste von
„Ereignissen" daneben. Eine eigene Tabelle dafür müsste jede Schreibstelle
mitbedienen, und die, die es vergisst, fehlte still in der Kachel.

Das Protokoll ist für die Frage „wer hat was geändert" gebaut, nicht zum
Vorlesen. Drei Dinge werden deshalb hier ausgedünnt:

- **Je Objekt nur der neueste Eintrag.** Clock-in und Clock-out sind zwei
  Einträge an derselben Buchung; lesen will man nur „hat 1:20 h gebucht".
- **Aufeinanderfolgende gleiche Handgriffe werden zusammengefasst.** Ein
  eingefügtes Meetingprotokoll legt zwanzig Abschnitte an — das ist ein Satz,
  nicht die ganze Kachel.
- **Was niemand getan hat, fehlt.** Einträge ohne Nutzer stammen aus Befehlen
  oder Tests, und die am Tagesende abgeschnittene Buchung hat zwar einen
  Auslöser (wer gerade das Dashboard öffnete), aber keinen Handelnden.
  Änderungen am Nutzer selbst fehlen ebenso: Dort landet jedes „Neuigkeiten
  gelesen", und das ist keine Nachricht fürs Team.
"""

from django.utils import timezone

from socos.models import Kontakt, Nutzer, Protokolleintrag, Zeitbuchung

# Wie viele Protokollzeilen höchstens durchgesehen werden, um die paar Sätze
# zu finden. Nach dem Ausdünnen bleibt von einem eingefügten Meetingprotokoll
# ein Satz übrig — dafür muss man aber erst an seinen Zeilen vorbei.
DURCHSICHT = 400

# Genus, Einzahl, Mehrzahl. Die Namen aus `Meta` taugen dafür nicht: Dort heißt
# die Mehrzahl von Eventziel „Hitlist" und die von Rückmeldung „Wünsche und
# Fehler" — richtig als Überschrift, falsch in „hat 3 … angelegt".
NAMEN = {
    "socos.Projekt": ("n", "Projekt", "Projekte"),
    "socos.Projektphase": ("f", "Projektphase", "Projektphasen"),
    "socos.Arbeitspaket": ("n", "Arbeitspaket", "Arbeitspakete"),
    "socos.Pensum": ("n", "Pensum", "Pensen"),
    "socos.Unteraufgabe": ("f", "Unteraufgabe", "Unteraufgaben"),
    "socos.Zeitbuchung": ("f", "Buchung", "Buchungen"),
    "socos.Organisation": ("f", "Organisation", "Organisationen"),
    "socos.Kontakt": ("m", "Kontakt", "Kontakte"),
    "socos.Verlaufseintrag": ("m", "Verlaufseintrag", "Verlaufseinträge"),
    "socos.Event": ("n", "Event", "Events"),
    "socos.Eventziel": ("n", "Eventziel", "Eventziele"),
    "socos.Eventanhang": ("m", "Anhang", "Anhänge"),
    "socos.Meeting": ("n", "Meeting", "Meetings"),
    "socos.Meetingabschnitt": ("m", "Protokollabschnitt", "Protokollabschnitte"),
    "socos.Meetinganhang": ("m", "Anhang", "Anhänge"),
    "socos.Kontostand": ("m", "Kontostand", "Kontostände"),
    "socos.Fixkosten": ("p", "Fixkosten", "Fixkosten"),
    "socos.Monatskosten": ("p", "Monatskosten", "Monatskosten"),
    "socos.Rueckmeldung": ("f", "Meldung", "Meldungen"),
    "socos.Aufgabe": ("f", "Aufgabe", "Aufgaben"),
    "socos.Vorhaben": ("n", "Vorhaben", "Vorhaben"),
    "socos.Canvaspunkt": ("m", "Canvas-Punkt", "Canvas-Punkte"),
    "socos.Persona": ("f", "Persona", "Personas"),
    "socos.Praktikumsthema": ("n", "Praktikumsthema", "Praktikumsthemen"),
    "socos.Lagethema": ("n", "Thema in Thoughts", "Themen in Thoughts"),
    "socos.Lageschritt": ("m", "Schritt in Thoughts", "Schritte in Thoughts"),
    "socos.Lageverbindung": ("f", "Verbindung in Thoughts", "Verbindungen in Thoughts"),
    "socos.Foerderprogramm": ("n", "Förderprogramm", "Förderprogramme"),
    "socos.Foerderfrage": ("f", "Frage an die Förderstelle", "Fragen an die Förderstelle"),
    "socos.Foerderantrag": ("m", "Förderantrag", "Förderanträge"),
    "socos.Foerderpaket": ("n", "Arbeitspaket eines Antrags", "Arbeitspakete eines Antrags"),
}
UNBEKANNT = ("m", "Eintrag", "Einträge")

# Bei Geld steht der Betrag im Objekttext („01.09.2026: 10000.00 €") — mit
# Punkt statt Komma und ohne Tausendertrenner. Der Satz sagt nur, dass etwas
# eingetragen wurde; die Zahl steht zwei Kacheln weiter richtig formatiert.
OHNE_OBJEKTTEXT = {"socos.Kontostand", "socos.Fixkosten", "socos.Monatskosten"}

BESTIMMT = {"m": "den", "f": "die", "n": "das", "p": "die"}
NEU = {"m": "einen neuen", "f": "eine neue", "n": "ein neues", "p": "neue"}

VERB = {
    Protokolleintrag.Aktion.ANGELEGT: "angelegt",
    Protokolleintrag.Aktion.GEAENDERT: "geändert",
    Protokolleintrag.Aktion.GELOESCHT: "gelöscht",
    Protokolleintrag.Aktion.WIEDERHERGESTELLT: "wiederhergestellt",
}


# Länger wird ein Objekt im Satz nicht. Ein Canvas-Punkt oder eine Aufgabe ist
# oft ein ganzer Satz für sich, und die Kachel soll fünf Zeilen zeigen, nicht
# drei Absätze.
OBJEKT_HOECHSTENS = 60


def kuerzen(text):
    """
    Der Objekttext, wie er im Satz steht: ohne `**` und gekürzt.

    Die Sternchen sind die Hervorhebung aus dem Vision Statement. Dort werden
    sie fett gesetzt, hier stünden sie roh im Satz.
    """
    text = " ".join(text.replace("**", "").split())
    if len(text) <= OBJEKT_HOECHSTENS:
        return text
    return text[: OBJEKT_HOECHSTENS - 1].rstrip() + "…"


def als_dauer(sekunden):
    """3:25 h — dieselbe Form wie `alsDauer` im Frontend."""
    minuten = max(0, int(sekunden)) // 60
    return f"{minuten // 60}:{minuten % 60:02d} h"


def _abgeschnitten(eintrag):
    """Die am Tagesende abgeschnittene Buchung — kein Handgriff eines Menschen."""
    entwurf = eintrag.aenderungen.get("ist_entwurf")
    return bool(entwurf and entwurf.get("neu") is True)


def _wird_gebucht(eintrag, buchung):
    """
    Ob dieser Eintrag der Moment ist, ab dem die Buchung zählt: angelegt mit
    Ende (nachgetragen), beendet (Clock-out) oder als Entwurf bestätigt.
    """
    if buchung.ende is None or buchung.ist_entwurf:
        return False
    if eintrag.aktion == Protokolleintrag.Aktion.ANGELEGT:
        return True
    if eintrag.aktion != Protokolleintrag.Aktion.GEAENDERT:
        return False
    ende = eintrag.aenderungen.get("ende")
    entwurf = eintrag.aenderungen.get("ist_entwurf")
    return bool(
        (ende and ende.get("alt") is None) or (entwurf and entwurf.get("neu") is False)
    )


def _buchungssatz(eintrag, buchung):
    """(vor, objekt, nach) für eine Zeitbuchung."""
    fremd = buchung.person_id != eintrag.nutzer_id
    fuer = f" für {buchung.person.name}" if fremd else ""
    paket = buchung.paket.titel

    if eintrag.aktion == Protokolleintrag.Aktion.ANGELEGT and buchung.ende is None:
        if fremd:
            return f"hat{fuer} die Uhr auf", paket, "gestartet"
        return "hat auf", paket, "eingestempelt"

    if _wird_gebucht(eintrag, buchung):
        tag = timezone.localdate(buchung.start)
        am = "" if tag == timezone.localdate(eintrag.zeitpunkt) else f" am {tag:%d.%m.}"
        return f"hat {als_dauer(buchung.sekunden)}{fuer}{am} auf", paket, "gebucht"

    return f"hat eine Buchung{fuer} auf", paket, VERB[eintrag.aktion]


def _satz(eintrag, anzahl, kontakte, buchungen):
    """(vor, objekt, nach) — der Satz ohne den Namen davor."""
    genus, einzahl, mehrzahl = NAMEN.get(eintrag.modell, UNBEKANNT)
    verb = VERB[eintrag.aktion]
    neu = eintrag.aktion == Protokolleintrag.Aktion.ANGELEGT

    if anzahl > 1:
        return f"hat {anzahl} {mehrzahl}", None, verb

    if eintrag.modell == "socos.Zeitbuchung" and eintrag.objekt_id in buchungen:
        return _buchungssatz(eintrag, buchungen[eintrag.objekt_id])

    artikel = NEU[genus] if neu else BESTIMMT[genus]
    if eintrag.modell in OHNE_OBJEKTTEXT:
        # Geld wird eingetragen, nicht angelegt.
        return f"hat {artikel} {einzahl}", None, "eingetragen" if neu else verb

    nach = verb
    kontakt = kontakte.get(eintrag.objekt_id) if eintrag.modell == "socos.Kontakt" else None
    if kontakt and kontakt.organisation:
        nach = f"von {kontakt.organisation.kurz or kontakt.organisation.name} {verb}"
    return f"hat {artikel} {einzahl}", kuerzen(eintrag.objekt_text) or None, nach


def letzte(anzahl=5):
    """
    Die letzten `anzahl` Handgriffe, neueste zuerst.

    Jeder als `{zeitpunkt, wer, vor, objekt, nach}`. `objekt` steht getrennt,
    damit die Oberfläche es hervorheben kann, ohne einen Satz zu zerlegen.
    """
    eintraege = list(
        Protokolleintrag.objects.select_related("nutzer")
        .filter(nutzer__isnull=False)
        .exclude(modell=Nutzer._meta.label)
        .order_by("-zeitpunkt", "-id")[:DURCHSICHT]
    )

    # Je Objekt der neueste Eintrag.
    gesehen, je_objekt = set(), []
    for e in eintraege:
        schluessel = (e.modell, e.objekt_id)
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)
        if e.modell == "socos.Zeitbuchung" and _abgeschnitten(e):
            continue
        je_objekt.append(e)

    # Gleiche Handgriffe hintereinander zu einem. Buchungen nie: „hat 3
    # Buchungen angelegt" sagt weniger als drei Zeilen mit Paket und Dauer.
    gruppen = []
    for e in je_objekt:
        letzte_gruppe = gruppen[-1] if gruppen else None
        if (
            letzte_gruppe
            and e.modell != "socos.Zeitbuchung"
            and (e.nutzer_id, e.modell, e.aktion)
            == (letzte_gruppe[0].nutzer_id, letzte_gruppe[0].modell, letzte_gruppe[0].aktion)
        ):
            letzte_gruppe.append(e)
            continue
        if len(gruppen) == anzahl:
            break
        gruppen.append([e])

    # Nachschlagen, was der Objekttext nicht hergibt — gebündelt, nicht je Zeile.
    def ids(modell):
        return [g[0].objekt_id for g in gruppen if len(g) == 1 and g[0].modell == modell]

    kontakte = {
        str(k.pk): k
        for k in Kontakt.alle_objekte.select_related("organisation").filter(
            pk__in=ids("socos.Kontakt")
        )
    }
    buchungen = {
        str(b.pk): b
        for b in Zeitbuchung.alle_objekte.select_related("paket", "person").filter(
            pk__in=ids("socos.Zeitbuchung")
        )
    }

    ergebnis = []
    for gruppe in gruppen:
        e = gruppe[0]
        vor, objekt, nach = _satz(e, len(gruppe), kontakte, buchungen)
        ergebnis.append(
            {
                "id": e.pk,
                "zeitpunkt": e.zeitpunkt,
                "wer": {
                    "name": e.nutzer.name or e.nutzer_text,
                    "initialen": e.nutzer.initialen,
                    "farbe": e.nutzer.farbe,
                },
                "vor": vor,
                "objekt": objekt,
                "nach": nach,
            }
        )
    return ergebnis
