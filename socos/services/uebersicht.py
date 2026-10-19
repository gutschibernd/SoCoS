"""
Die Übersicht: welche Bausteine jemand sieht und in welcher Reihenfolge.

Jeder baut sie sich selbst zusammen. Wer das noch nie getan hat, bekommt einen
**Vorschlag aus der eigenen Nutzung**: gezählt wird, woran er in den letzten
dreißig Tagen geschrieben hat (Änderungsprotokoll). Florian legt Kontakte an
und hakt Aufgaben ab, Bernd arbeitet in Thoughts und den Förderungen — ein
gemeinsamer fester Vorschlag wäre für einen der beiden falsch gewesen, und
einer nach Namen stünde im Code (siehe CLAUDE.md, „Daten").

Gerechnet, nicht gespeichert: Der Vorschlag ändert sich mit der Arbeit, bis
jemand selbst etwas verschiebt. Ab dann gilt das Gespeicherte.

Die Schlüssel stehen ein zweites Mal im Frontend (`basis/uebersicht.ts`),
dort mit dem, was sie zeigen. Hier entscheiden sie nur, was gespeichert werden
darf und was der Vorschlag nimmt. Kennt das Frontend einen Schlüssel nicht,
lässt es ihn weg.
"""

from collections import Counter
from datetime import timedelta

from django.utils import timezone

from socos.models import Protokolleintrag

# Baustein → die Modelle, deren Protokollzeilen für ihn sprechen. Ein leeres
# Tupel heißt: nie aus der Nutzung vorgeschlagen, nur von Hand dazugenommen.
BAUSTEINE = {
    "aufgaben": ("socos.Aufgabe",),
    "thoughts": ("socos.Lagethema", "socos.Lageschritt", "socos.Lageverbindung"),
    "ball": ("socos.Kontakt", "socos.Organisation", "socos.Verlaufseintrag"),
    "termine": (
        "socos.Meeting",
        "socos.Meetingabschnitt",
        "socos.Meetinganhang",
        "socos.Event",
        "socos.Eventziel",
    ),
    "foerderungen": (
        "socos.Foerdergeber",
        "socos.Foerderprogramm",
        "socos.Foerderfrage",
        "socos.Foerderantrag",
        "socos.Foerderabschnitt",
        "socos.Foerderpaket",
        "socos.Foerderstunden",
        "socos.Foerderposten",
    ),
    "projekte": (
        "socos.Projekt",
        "socos.Projektphase",
        "socos.Arbeitspaket",
        "socos.Unteraufgabe",
        "socos.Pensum",
    ),
    "zeit": ("socos.Zeitbuchung",),
    "geld": ("socos.Kontostand", "socos.Fixkosten", "socos.Monatskosten", "socos.Runwayplan"),
    "team": (),
    "aktivitaet": (),
}

# Was breit steht, wenn es vorgeschlagen wird: Der Gantt und der Kontoverlauf
# brauchen die Breite, eine Liste nicht.
BREIT = {"projekte", "geld"}

# Wie weit zurück gezählt wird, und ab wie vielen Zeilen ein Bereich zählt.
# Fünf, damit ein einzelnes Nachschlagen mit einer Korrektur nicht schon einen
# Baustein bringt.
TAGE = 30
SCHWELLE = 5

# Aufgaben brauchen beide jeden Tag, „Zuletzt passiert" sagt, was die anderen
# getan haben. Dazwischen höchstens vier aus der Nutzung — sonst ist die
# Übersicht wieder die ganze Anwendung auf einer Seite.
ERSTER, LETZTER, DAZWISCHEN = "aufgaben", "aktivitaet", 4

# Wer noch nichts getan hat (ein neues Konto), bekommt das, was für alle gilt:
# was ansteht, mit wem wir reden, wann wir uns sehen.
OHNE_NUTZUNG = ["aufgaben", "termine", "ball", "aktivitaet"]


def _eintrag(baustein):
    return {"baustein": baustein, "breit": baustein in BREIT}


def vorschlag(nutzer, jetzt=None):
    """Die Übersicht aus der eigenen Nutzung der letzten dreißig Tage."""
    jetzt = jetzt or timezone.now()
    modelle = Protokolleintrag.objects.filter(
        nutzer=nutzer, zeitpunkt__gte=jetzt - timedelta(days=TAGE)
    ).values_list("modell", flat=True)
    zu_baustein = {m: b for b, ms in BAUSTEINE.items() for m in ms}
    zaehlung = Counter(zu_baustein[m] for m in modelle if m in zu_baustein)

    genutzt = [
        b
        for b, n in sorted(zaehlung.items(), key=lambda x: (-x[1], x[0]))
        if n >= SCHWELLE and b not in (ERSTER, LETZTER)
    ][:DAZWISCHEN]
    if not genutzt and zaehlung[ERSTER] < SCHWELLE:
        return [_eintrag(b) for b in OHNE_NUTZUNG]
    return [_eintrag(b) for b in [ERSTER, *genutzt, LETZTER]]


def bereinigt(bausteine):
    """
    Was gespeichert werden darf: bekannte Schlüssel, jeder höchstens einmal,
    `breit` als Wahrheitswert. Alles andere fällt still heraus — eine
    Übersicht mit einem unbekannten Baustein ist keine falsche Eingabe, die man
    jemandem vorhalten müsste, sondern ein Rest aus einer älteren Fassung.
    """
    if not isinstance(bausteine, list):
        raise ValueError("Die Übersicht ist eine Liste von Bausteinen.")
    gesehen, ergebnis = set(), []
    for eintrag in bausteine:
        if not isinstance(eintrag, dict):
            continue
        baustein = eintrag.get("baustein")
        if baustein not in BAUSTEINE or baustein in gesehen:
            continue
        gesehen.add(baustein)
        ergebnis.append({"baustein": baustein, "breit": eintrag.get("breit") is True})
    return ergebnis


def fuer(nutzer):
    """Was die Übersicht zeigt, und ob es selbst zusammengestellt ist."""
    eigen = bereinigt(nutzer.uebersicht or [])
    if eigen:
        return {"bausteine": eigen, "eigen": True}
    return {"bausteine": vorschlag(nutzer), "eigen": False}
