"""
Die Planung einer Projektphase — Pakete, Aufgaben, Antrag und Stand auf einer
Zeitachse (`GET /api/planung/<phase>/`).

**Alles hier wird gerechnet, nichts gespeichert:** der Zeitraum, den die
Aufgaben eines Pakets belegen, was bis heute laut Antrag gearbeitet sein
sollte, welche Aufgabe überfällig ist und was als Nächstes ansteht. Die Seite
summiert nichts selbst — eine zweite Rechnung im Frontend liefe beim nächsten
Feld auseinander.

**Der Maßstab ist der Antrag, wenn es einen gibt.** Die Stunden eines Pakets
müssen so gebucht werden, wie sie beantragt sind; die Aufgaben darunter dürfen
abweichen. Ohne Antrag ist das Pensum der Maßstab.
"""

import calendar
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from socos.services import auswertung
from socos.services.foerderung import kalendermonat, lebende_abschnitte, lebende_pakete, lebende_stunden

#: Wie viele anstehende Aufgaben unter „Als Nächstes" stehen, nach den
#: überfälligen und den laufenden. Mehr ist keine nächste Aufgabe mehr,
#: sondern der Plan — und der steht darunter im Gantt.
ANSTEHENDE = 5

_NULL = Decimal("0.00")


def _monatsanfang(tag: date) -> date:
    return tag.replace(day=1)


def _monatsende(tag: date) -> date:
    return tag.replace(day=calendar.monthrange(tag.year, tag.month)[1])


def monatsspanne(beginn: date, von: int, bis: int) -> tuple[date, date]:
    """Projektmonate M`von`–M`bis` als Kalendertage: vom Ersten bis zum Letzten."""
    erster = date.fromisoformat(kalendermonat(beginn, von) + "-01")
    letzter = date.fromisoformat(kalendermonat(beginn, bis) + "-01")
    return erster, _monatsende(letzter)


def soll_bis(stunden: Decimal, von: date, bis: date, heute: date) -> Decimal:
    """
    Wie viele der `stunden` bis einschließlich `heute` gearbeitet sein sollten,
    gleichmäßig über die Tage von `von` bis `bis` verteilt.

    **Gleichmäßig ist eine Annahme**, dieselbe wie in der Förderauslastung: Der
    Antrag sagt nicht, wann im Paket gearbeitet wird. Die Zahl ist ein
    Anhaltspunkt für „wo stehen wir", keine Vorgabe.
    """
    if heute < von:
        return _NULL
    if heute >= bis:
        return stunden
    tage = (bis - von).days + 1
    vorbei = (heute - von).days + 1
    return (stunden * vorbei / tage).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def lage(aufgabe, heute: date) -> str:
    """
    Wo eine Aufgabe steht: erledigt, ohne Termin, überfällig, läuft, steht an.
    Erledigt gewinnt — eine abgehakte Aufgabe ist nicht überfällig, auch wenn
    ihr Ende vorbei ist.
    """
    if aufgabe.erledigt:
        return "erledigt"
    if aufgabe.von is None:
        return "ohne_termin"
    if aufgabe.bis < heute:
        return "ueberfaellig"
    if aufgabe.von <= heute:
        return "laeuft"
    return "steht_an"


def naechste(aufgaben: list[dict]) -> list[int]:
    """
    Was als Nächstes zu tun ist: erst das Überfällige (früheste Frist zuerst),
    dann was läuft (was zuerst endet), dann die nächsten anstehenden.
    Aufgaben ohne Termin stehen nicht darin — sie sind noch nicht geplant, und
    die Seite sagt, wie viele das sind.
    """
    nach_lage = lambda name, schluessel: sorted(  # noqa: E731
        (a for a in aufgaben if a["lage"] == name), key=lambda a: (a[schluessel], a["id"])
    )
    reihe = nach_lage("ueberfaellig", "bis") + nach_lage("laeuft", "bis") + nach_lage("steht_an", "von")[:ANSTEHENDE]
    return [a["id"] for a in reihe]


def achse(daten: list[date], heute: date) -> dict:
    """
    Vom Monatsanfang des frühesten bis zum Monatsende des spätesten Datums.

    **Heute liegt immer auf der Achse** — die Seite soll zeigen, wo man steht,
    auch vor dem Beginn. Ohne jedes Datum: der laufende Monat und fünf danach,
    damit das erste Ziehen einen Platz hat.
    """
    daten = [d for d in daten if d is not None] + [heute]
    von = _monatsanfang(min(daten))
    bis = max(daten)
    if len(daten) == 1:
        bis = date(heute.year + (heute.month + 4) // 12, (heute.month + 4) % 12 + 1, 1)
    return {"von": von, "bis": _monatsende(bis)}


def _stunden(sekunden: int) -> Decimal:
    return (Decimal(sekunden) / 3600).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _antrag(antrag, beginn) -> dict | None:
    if antrag is None:
        return None
    programm = antrag.programm
    pakete = []
    for nummer, fp in enumerate(sorted(lebende_pakete(antrag), key=lambda p: (p.reihenfolge, p.id)), start=1):
        von, bis = monatsspanne(beginn, fp.von, fp.bis) if beginn else (None, None)
        pakete.append(
            {
                "id": fp.id,
                "nummer": nummer,
                "titel": fp.titel,
                "ziel": fp.ziel,
                "ergebnis": fp.ergebnis,
                "monat_von": fp.von,
                "monat_bis": fp.bis,
                "von": von,
                "bis": bis,
                "stunden": sum((s.stunden for s in lebende_stunden(fp)), _NULL),
            }
        )
    return {
        "id": antrag.id,
        "titel": antrag.titel,
        "stand": antrag.stand,
        "beschreibung": antrag.beschreibung,
        "programm": programm.id,
        "programm_name": programm.name,
        "geber": programm.geber_id,
        "geber_name": programm.geber.kurz or programm.geber.name,
        # Der Beginn, mit dem gerechnet wird. Hat der Antrag keinen, gilt der
        # Beginn der Phase — und die Seite sagt dazu, dass er geliehen ist.
        "beginn": beginn,
        "beginn_aus_phase": antrag.beginn is None and beginn is not None,
        "abschnitte": [{"titel": a.titel, "text": a.text} for a in lebende_abschnitte(antrag)],
        "pakete": pakete,
    }


def planung(phase, heute: date | None = None) -> dict:
    from django.utils import timezone

    from socos.models import Nutzer

    heute = heute or timezone.localdate()
    antrag = phase.foerderantrag
    if antrag is not None and antrag.geloescht_am is not None:
        antrag = None
    beginn = (antrag.beginn or phase.von) if antrag else None
    antragsdaten = _antrag(antrag, beginn)
    antragspakete = {p["id"]: p for p in (antragsdaten["pakete"] if antragsdaten else [])}

    je_paket = auswertung.sekunden_je_paket()
    je_person = auswertung.sekunden_je_paket_und_person()

    pakete = []
    alle_aufgaben = []
    termine = [phase.von, phase.bis]
    for paket in phase.pakete.filter(geloescht_am__isnull=True).select_related("foerderpaket").order_by(
        "reihenfolge", "titel"
    ):
        fp = antragspakete.get(paket.foerderpaket_id)
        personen = {}  # Schlüssel → Zeile, damit eine Person nur einmal dasteht

        if fp is not None:
            quelle = "antrag"
            for zeile in lebende_stunden(paket.foerderpaket):
                schluessel = f"n{zeile.nutzer_id}" if zeile.nutzer_id else f"p:{zeile.person.strip()}"
                eintrag = personen.setdefault(
                    schluessel, {"nutzer": zeile.nutzer_id, "name": zeile.name, "soll": _NULL, "gebucht_sekunden": 0}
                )
                eintrag["soll"] += zeile.stunden
        else:
            quelle = "pensum"
            for pensum in paket.pensen.filter(geloescht_am__isnull=True).select_related("person"):
                personen[f"n{pensum.person_id}"] = {
                    "nutzer": pensum.person_id,
                    "name": pensum.person.initialen or pensum.person.name,
                    "soll": pensum.stunden,
                    "gebucht_sekunden": 0,
                }
        # Wer gebucht hat, steht da — auch ohne Soll. Gerade das fällt bei der
        # Abrechnung auf: Stunden einer Person, die im Antrag nicht vorkommt.
        for (paket_id, nutzer_id), sekunden in je_person.items():
            if paket_id != paket.id:
                continue
            eintrag = personen.get(f"n{nutzer_id}")
            if eintrag is None:
                nutzer = Nutzer.objects.get(pk=nutzer_id)
                eintrag = personen[f"n{nutzer_id}"] = {
                    "nutzer": nutzer_id,
                    "name": nutzer.initialen or nutzer.name,
                    "soll": None,
                    "gebucht_sekunden": 0,
                }
            eintrag["gebucht_sekunden"] = sekunden

        soll = sum((p["soll"] for p in personen.values() if p["soll"] is not None), _NULL)
        gebucht = je_paket.get(paket.id, 0)

        aufgaben = []
        for aufgabe in paket.unteraufgaben.filter(geloescht_am__isnull=True).select_related("verantwortlich").order_by(
            "reihenfolge", "id"
        ):
            zeile = {
                "id": aufgabe.id,
                "paket": paket.id,
                "titel": aufgabe.titel,
                "erledigt": aufgabe.erledigt,
                "reihenfolge": aufgabe.reihenfolge,
                "von": aufgabe.von,
                "bis": aufgabe.bis,
                "stunden": aufgabe.stunden,
                "verantwortlich": aufgabe.verantwortlich_id,
                "verantwortlich_name": (
                    (aufgabe.verantwortlich.initialen or aufgabe.verantwortlich.name) if aufgabe.verantwortlich else ""
                ),
                "lage": lage(aufgabe, heute),
            }
            aufgaben.append(zeile)
            termine += [aufgabe.von, aufgabe.bis]
        alle_aufgaben += aufgaben

        datiert = [a for a in aufgaben if a["von"] is not None]
        if fp is not None:
            termine += [fp["von"], fp["bis"]]
        pakete.append(
            {
                "id": paket.id,
                "titel": paket.titel,
                "status": paket.status,
                "beschreibung": paket.beschreibung,
                "foerderpaket": fp["id"] if fp else None,
                "soll_quelle": quelle,
                "soll": soll,
                "gebucht": _stunden(gebucht),
                # Nur mit einem Zeitraum aus dem Antrag: Ein Pensum sagt nicht,
                # wann gearbeitet wird.
                "soll_bis_heute": (
                    soll_bis(soll, fp["von"], fp["bis"], heute) if fp is not None and fp["von"] is not None else None
                ),
                "personen": [
                    {**p, "gebucht": _stunden(p.pop("gebucht_sekunden"))}
                    for p in sorted(personen.values(), key=lambda p: p["name"])
                ],
                "plan_von": min((a["von"] for a in datiert), default=None),
                "plan_bis": max((a["bis"] for a in datiert), default=None),
                "aufgaben_stunden": sum((a["stunden"] for a in aufgaben if a["stunden"] is not None), _NULL),
                "aufgaben": aufgaben,
            }
        )

    def summe(feld):
        return sum((p[feld] for p in pakete if p[feld] is not None), _NULL)

    return {
        "heute": heute,
        "phase": {
            "id": phase.id,
            "titel": phase.titel,
            "von": phase.von,
            "bis": phase.bis,
            "stand": phase.stand,
            "projekt": phase.projekt_id,
            "projekt_titel": phase.projekt.titel,
            "foerderantrag": antrag.id if antrag else None,
        },
        "antrag": antragsdaten,
        "achse": achse(termine, heute),
        "pakete": pakete,
        "naechste": naechste(alle_aufgaben),
        "summen": {
            "soll": summe("soll"),
            "gebucht": summe("gebucht"),
            "soll_bis_heute": summe("soll_bis_heute") if any(p["soll_bis_heute"] is not None for p in pakete) else None,
            "aufgaben_stunden": summe("aufgaben_stunden"),
            "aufgaben": len(alle_aufgaben),
            "erledigt": sum(1 for a in alle_aufgaben if a["erledigt"]),
            "ohne_termin": sum(1 for a in alle_aufgaben if a["lage"] == "ohne_termin"),
        },
    }
