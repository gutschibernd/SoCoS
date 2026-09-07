"""
Kontostand, Kosten, Runway.

Nichts davon wird gespeichert — alles hier gerechnet. Geld ist durchgehend
`Decimal`; ein `float` hätte bei Beträgen, die sich über Monate summieren,
Cent-Differenzen zur Folge, die niemand mehr zuordnen kann.
"""

from decimal import Decimal

from socos.models import Fixkosten, Kontostand, Monatskosten

# Wie viele Monate in die erwarteten Kosten eingehen. Drei, weil ein einzelner
# Monat mit einer großen Anschaffung den Runway sonst halbiert und der nächste
# ihn wieder verdoppelt — eine Zahl, die springt, benutzt niemand.
MONATE_FUER_PROGNOSE = 3


def letzter_kontostand():
    return Kontostand.objects.order_by("-datum").first()


def fixkosten_am(stichtag=None):
    """Der zuletzt gesetzte Fixkostenbetrag, der am Stichtag schon galt."""
    menge = Fixkosten.objects.all()
    if stichtag:
        menge = menge.filter(gueltig_ab__lte=stichtag)
    eintrag = menge.order_by("-gueltig_ab").first()
    return eintrag.betrag if eintrag else None


def erwartete_monatskosten():
    """
    Was ein Monat voraussichtlich kostet.

    Durchschnitt der letzten drei **erfassten** Monatskosten, solange es drei
    gibt — die sagen mehr als ein geplanter Wert. Sonst die Fixkosten.

    Gibt zusätzlich zurück, worauf die Zahl beruht: Eine Prognose, der man
    nicht ansieht, woher sie kommt, wird entweder blind geglaubt oder gar
    nicht.
    """
    letzte = list(
        Monatskosten.objects.order_by("-monat").values_list("betrag", flat=True)[
            :MONATE_FUER_PROGNOSE
        ]
    )
    if len(letzte) == MONATE_FUER_PROGNOSE:
        schnitt = (sum(letzte) / Decimal(len(letzte))).quantize(Decimal("0.01"))
        return schnitt, f"Schnitt der letzten {MONATE_FUER_PROGNOSE} Monate"

    fix = fixkosten_am()
    if fix is not None:
        return fix, "Fixkosten"

    return None, "noch keine Kosten erfasst"


def runway_in_monaten():
    """
    Wie lange das Geld reicht: Kontostand ÷ erwartete Monatskosten.

    Gibt `None` zurück, wenn eine der beiden Zahlen fehlt — **nicht** 0 und
    nicht „unendlich". Beides sähe aus wie eine Aussage, wäre aber nur die
    fehlende Eingabe.
    """
    stand = letzter_kontostand()
    kosten, _ = erwartete_monatskosten()
    if stand is None or not kosten:
        return None
    return (stand.betrag / kosten).quantize(Decimal("0.1"))


def uebersicht():
    """Die vier Kennzahlen des Dashboards, so weit sie berechenbar sind."""
    stand = letzter_kontostand()
    kosten, grundlage = erwartete_monatskosten()
    return {
        "kontostand": stand.betrag if stand else None,
        "kontostand_stand": stand.datum if stand else None,
        "fixkosten": fixkosten_am(),
        "erwartete_monatskosten": kosten,
        "prognose_grundlage": grundlage,
        "runway_monate": runway_in_monaten(),
    }
