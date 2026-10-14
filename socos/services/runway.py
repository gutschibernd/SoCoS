"""
Runway-Planung: Monat für Monat, was herein- und hinausgeht, und wie lange das
Geld damit reicht.

Nichts davon wird gespeichert, alles hier gerechnet. Geld ist durchgehend
`Decimal`; jeder einzelne Betrag wird auf den Cent gerundet, **bevor** er in
eine Summe geht — sonst stünde in der Monatssumme ein Cent, den keine Zeile
darüber erklärt.

**Was es bewusst nicht gibt** (Bernd, 2026-10-14, „schlanker Kern"): Umsatzsteuer
und UVA, NeuFöG, Forschungsprämie, Kredite mit Raten, Investments. Kommt eines
davon, gehört es hier dazu und nicht in die Seite.

**Die Szenarien** stehen als ausdrücklicher Parameter im Aufruf, nicht als
Einstellung des Plans:

- *optimistisch*: jeder Umsatz voll, jede Förderung.
- *basis*: Umsätze mit ihrer Wahrscheinlichkeit gewichtet, jede Förderung.
- *konservativ*: Umsätze mit der halben Wahrscheinlichkeit, nur zugesagte
  und erhaltene Förderungen.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from django.utils import timezone

from socos.models import Kontostand, Planposten, Runwayplan

SZENARIEN = ("konservativ", "basis", "optimistisch")

NULL = Decimal("0")
HUNDERT = Decimal("100")
CENT = Decimal("0.01")

# Ein Abruf wird auf volle 5.000 € gerundet. Niemand überweist sich
# 13.427,18 €, und eine Zahl mit Cent täte so, als wäre der Plan so genau.
ABRUF_STUFE = Decimal("5000")

# Juni und November: dort kommt in Österreich das 13. und 14. Gehalt.
SONDERMONATE = (6, 11)

# Der Burn ist der Schnitt der nächsten sechs Monate. Ein einzelner Monat mit
# einer großen Anschaffung verdoppelte ihn sonst, und der nächste halbierte ihn.
#
# **Nur was hinausgeht, ohne Umsatz dagegen.** Der Planer vor dem Modul zog
# den Umsatz ab — und ein einziger Auftrag im Februar machte daraus „positiv",
# während jeden Monat Gehälter abgehen. Was hereinkommt, steht in der Linie.
BURN_MONATE = 6

SCHRITT = {
    Planposten.Rhythmus.MONATLICH: 1,
    Planposten.Rhythmus.QUARTAL: 3,
    Planposten.Rhythmus.JAEHRLICH: 12,
}

#: Die Töpfe, in die gebucht wird — die ersten drei herein, die anderen hinaus.
EIN = ("foerderung", "umsatz", "darlehen")
AUS = ("personal", "kosten", "rueckzahlung")


def _cent(wert):
    return wert.quantize(CENT, rounding=ROUND_HALF_UP)


def _monat(beginn, i):
    """Der Erste des i-ten Monats ab `beginn`."""
    jahr, rest = divmod(beginn.month - 1 + i, 12)
    return date(beginn.year + jahr, rest + 1, 1)


def _index(beginn, tag):
    return (tag.year - beginn.year) * 12 + (tag.month - beginn.month)


def _tag_im_monat(erster, tag):
    """Derselbe Tag in einem anderen Monat — der 31. ist im Februar der 28."""
    return erster.replace(day=min(tag, monthrange(erster.year, erster.month)[1]))


def _letzter(erster):
    return _tag_im_monat(erster, 31)


@dataclass
class Buchung:
    monat: int
    datum: date
    topf: str
    betrag: Decimal
    posten: int | None = None
    ereignis: str = ""

    @property
    def vorzeichen(self):
        return self.betrag if self.topf in EIN else -self.betrag


def _termine(beginn, n, posten):
    """
    Wann ein Posten fällig ist: (Monatsnummer, Tag). Gezählt wird ab seinem
    eigenen Anfang, nicht ab dem Planbeginn — eine Quartalszahlung, die im
    August anfing, bleibt im November, auch wenn der Plan im Oktober beginnt.
    """
    i0 = _index(beginn, posten.von)
    if posten.rhythmus == Planposten.Rhythmus.EINMALIG:
        yield i0, posten.von
        return
    ende = min(n - 1, _index(beginn, posten.bis) if posten.bis else n - 1)
    i = i0
    while i <= ende:
        if i >= 0:
            yield i, _tag_im_monat(_monat(beginn, i), posten.von.day)
        i += SCHRITT[posten.rhythmus]


def _beschaeftigt(erster, eintritt, austritt):
    """
    Welcher Anteil eines Monats bezahlt wird — tageweise im Monat des Eintritts
    und des Austritts. Ein Praktikum vom 15.1. bis 15.7. sind sechs Gehälter,
    nicht sieben.
    """
    letzter = _letzter(erster)
    von = max(erster, eintritt)
    bis = min(letzter, austritt) if austritt else letzter
    if bis < von:
        return NULL
    if von == erster and bis == letzter:
        return Decimal(1)
    return Decimal((bis - von).days + 1) / Decimal(letzter.day)


def buchungen(plan, posten, szenario, mit_darlehen=True):
    """Alle Zahlungen im Planzeitraum, je eine Zeile."""
    n = plan.monate
    beginn = plan.beginn
    ergebnis = []

    def buchen(i, datum, topf, betrag, p, ereignis=""):
        betrag = _cent(betrag)
        if 0 <= i < n and betrag:
            ergebnis.append(Buchung(i, datum, topf, betrag, p.pk, ereignis))

    for p in posten:
        if p.art == Planposten.Art.FOERDERUNG:
            if szenario == "konservativ" and p.status == Planposten.Status.GEPLANT:
                continue
            buchen(_index(beginn, p.von), p.von, "foerderung", p.betrag, p, f"{p.name} · Tranche")

        elif p.art == Planposten.Art.UMSATZ:
            anteil = Decimal(p.wahrscheinlichkeit) / HUNDERT
            faktor = {"optimistisch": Decimal(1), "basis": anteil, "konservativ": anteil / 2}[szenario]
            einmalig = p.rhythmus == Planposten.Rhythmus.EINMALIG
            for i, tag in _termine(beginn, n, p):
                buchen(i, tag, "umsatz", p.betrag * faktor, p, p.name if einmalig else "")

        elif p.art == Planposten.Art.KOSTEN:
            einmalig = p.rhythmus == Planposten.Rhythmus.EINMALIG
            for i, tag in _termine(beginn, n, p):
                buchen(i, tag, "kosten", p.betrag, p, p.name if einmalig else "")

        elif p.art == Planposten.Art.PERSON:
            satz = p.lohnnebenkosten if p.lohnnebenkosten is not None else plan.lohnnebenkosten
            aufschlag = 1 + satz / HUNDERT
            erster_monat = max(0, _index(beginn, p.von))
            letzter_monat = min(n - 1, _index(beginn, p.bis) if p.bis else n - 1)
            for i in range(erster_monat, letzter_monat + 1):
                erster = _monat(beginn, i)
                brutto = p.betrag * _beschaeftigt(erster, p.von, p.bis)
                if plan.vierzehn_gehaelter and erster.month in SONDERMONATE:
                    brutto *= 2
                # Das Gehalt geht am Monatsende hinaus — wichtig für den
                # Abgleich mit einem Kontostand mitten im Monat.
                ereignis = f"Eintritt {p.name}" if erster <= p.von <= _letzter(erster) else ""
                buchen(i, _letzter(erster), "personal", brutto * aufschlag, p, ereignis)

        elif p.art == Planposten.Art.DARLEHEN:
            if not mit_darlehen:
                continue
            a = _index(beginn, p.von)
            buchen(a, p.von, "darlehen", p.betrag, p, f"{p.name} · Auszahlung")
            if p.bis:
                r = _index(beginn, p.bis)
                zinsen = p.betrag * p.zins / HUNDERT * Decimal(max(0, r - a)) / 12
                buchen(r, p.bis, "rueckzahlung", p.betrag + zinsen, p, f"{p.name} · Rückzahlung")

    return ergebnis


def iststaende(plan):
    """
    Je Monat der letzte erfasste Kontostand — aus dem Dashboard, kein zweites
    Feld dafür. Zwei Stellen, an denen ein Kontostand steht, liefen beim
    ersten vergessenen Nachtrag auseinander.
    """
    bis = _letzter(_monat(plan.beginn, plan.monate - 1))
    staende = {}
    for k in Kontostand.objects.filter(datum__gte=plan.beginn, datum__lte=bis).order_by("datum"):
        staende[_index(plan.beginn, k.datum)] = k
    return staende


def verlauf(plan, alle, ist=None):
    """
    Die Monate mit ihren Summen und dem Kontostand am Monatsende.

    **Ein Ist-Kontostand ersetzt den Plan bis zu seinem Tag.** Was im selben
    Monat danach noch fällig ist, kommt dazu; ab dem nächsten Monat wird von
    dort aus weitergerechnet. Ein Kontostand vom 14. ist kein Monatsende — ihn
    als solches zu nehmen, ließe die Zahlungen der zweiten Monatshälfte
    verschwinden.
    """
    ist = ist or {}
    monate = []
    stand = plan.startkontostand
    for i in range(plan.monate):
        hier = [b for b in alle if b.monat == i]
        summen = {topf: sum((b.betrag for b in hier if b.topf == topf), NULL) for topf in EIN + AUS}
        ein = sum((summen[t] for t in EIN), NULL)
        aus = sum((summen[t] for t in AUS), NULL)
        anfang = stand
        stand = anfang + ein - aus
        k = ist.get(i)
        if k is not None:
            stand = k.betrag + sum((b.vorzeichen for b in hier if b.datum > k.datum), NULL)
        monate.append(
            {
                "monat": _monat(plan.beginn, i).strftime("%Y-%m"),
                **summen,
                "ein": ein,
                "aus": aus,
                "netto": ein - aus,
                "anfang": anfang,
                "stand": stand,
                "ist": k.betrag if k else None,
                "ist_datum": k.datum if k else None,
                "ereignisse": [
                    {"text": b.ereignis, "betrag": b.vorzeichen}
                    for b in sorted(hier, key=lambda b: (b.datum, b.topf))
                    if b.ereignis
                ],
            }
        )
    return monate


def ueberbrueckung(monate, puffer, abruf_monate, ab=0):
    """
    Wann und wie viel per Gesellschafterdarlehen nachgeschossen werden muss,
    damit der Kontostand nie unter den Puffer fällt.

    Ein Abruf deckt den tiefsten Stand der nächsten `abruf_monate` Monate ab,
    nicht nur den einen — sonst käme jeden Monat ein neuer. Vorgeschlagen wird
    erst ab dem laufenden Monat (`ab`): Ein Abruf im vergangenen März ist kein
    Vorschlag mehr, sondern ein Versäumnis.
    """
    abrufe = []
    nachgeschossen = NULL
    for i in range(ab, len(monate)):
        if monate[i]["stand"] + nachgeschossen >= puffer:
            continue
        tiefster = min(m["stand"] for m in monate[i : i + abruf_monate]) + nachgeschossen
        betrag = ((puffer - tiefster) / ABRUF_STUFE).to_integral_value(rounding=ROUND_CEILING) * ABRUF_STUFE
        abrufe.append({"monat": monate[i]["monat"], "vorher": monate[i]["stand"] + nachgeschossen, "betrag": betrag})
        nachgeschossen += betrag
    return abrufe


def _erster(monate, bedingung):
    return next((m["monat"] for m in monate if bedingung(m)), None)


def rechnen(szenario="basis", heute=None):
    """
    Die ganze Planung für ein Szenario — oder `None`, solange es keinen Plan
    gibt. `heute` steht als Parameter da, damit ein Test einen Tag festhalten
    kann; die Seite bekommt es in der Antwort zurück.
    """
    if szenario not in SZENARIEN:
        raise ValueError(f"Unbekanntes Szenario: {szenario}")
    plan = Runwayplan.objects.first()
    if plan is None:
        return None
    heute = heute or timezone.localdate()
    posten = list(Planposten.objects.all())
    alle = buchungen(plan, posten, szenario)
    monate = verlauf(plan, alle, iststaende(plan))

    # Ohne Gesellschafterdarlehen: derselbe Verlauf, nur deren Ein- und
    # Rückzahlungen herausgerechnet. **Nicht** ein zweiter Lauf ohne sie: Ein
    # Ist-Kontostand enthält das Darlehen längst, und ein zweiter Lauf setzte
    # ihn an dieser Stelle wieder hinein.
    darlehen = NULL
    for m in monate:
        darlehen += m["darlehen"] - m["rueckzahlung"]
        m["ohne_darlehen"] = m["stand"] - darlehen

    jetzt = min(max(0, _index(plan.beginn, heute)), plan.monate - 1)
    vorne = monate[jetzt : jetzt + BURN_MONATE]
    burn = sum((m["personal"] + m["kosten"] for m in vorne), NULL) / len(vorne)
    tiefster = min(monate, key=lambda m: m["stand"])
    abrufe = ueberbrueckung(monate, plan.puffer, plan.abruf_monate, ab=jetzt)

    je_posten = {}
    for b in alle:
        je_posten[b.posten] = je_posten.get(b.posten, NULL) + b.betrag

    return {
        "szenario": szenario,
        "heute": heute,
        "monate": monate,
        "kennzahlen": {
            "minus_ab": _erster(monate, lambda m: m["stand"] < 0),
            "unter_puffer_ab": _erster(monate, lambda m: m["stand"] < plan.puffer),
            "tiefster_stand": tiefster["stand"],
            "tiefster_monat": tiefster["monat"],
            "ueberbrueckung": sum((a["betrag"] for a in abrufe), NULL),
            "burn": _cent(burn),
            "burn_ab": monate[jetzt]["monat"],
            "ohne_darlehen_minus_ab": _erster(monate, lambda m: m["ohne_darlehen"] < 0),
            "darlehen_summe": sum((m["darlehen"] for m in monate), NULL),
            "letzter_ist": max(
                (m["ist_datum"] for m in monate if m["ist_datum"]), default=None
            ),
        },
        "abrufe": abrufe,
        # Was jeder Posten im Planzeitraum ausmacht — im gewählten Szenario.
        "je_posten": {str(k): v for k, v in je_posten.items()},
    }
