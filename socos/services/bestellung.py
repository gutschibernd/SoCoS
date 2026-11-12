"""
Der Korb eines Lieferanten: hineinlegen und als bestellt markieren.

Der Korb ist kein eigenes Modell, sondern die Menge der Positionen ohne
Bestellung (siehe `Bestellung` in socos/models.py). Beides hier steht an einer
Stelle, damit die Oberfläche und ein späterer zweiter Weg (der Assistent)
nicht je eine eigene Regel dafür haben.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from socos.models import Bestellposition, Bestellung


def korb(lieferant):
    """Was gerade im Korb liegt, in der Reihenfolge des Hineinlegens."""
    return Bestellposition.objects.filter(
        artikel__lieferant=lieferant,
        artikel__geloescht_am__isnull=True,
        bestellung__isnull=True,
    ).select_related("artikel", "von")


def hineinlegen(artikel, menge, von):
    """
    Legt `menge` Stück in den Korb und gibt die Position zurück.

    **Dieselbe Person, derselbe Artikel: die Menge wächst**, statt dass eine
    zweite Zeile entsteht. Wer den Knopf im Sortiment zweimal drückt, meint
    zwei Stück. Legt jemand anderes denselben Artikel hinein, bleibt es eine
    eigene Zeile — sonst wüsste beim Bestellen niemand mehr, wer wie viel
    wollte. Zusammengezählt wird erst in der Zusammenfassung.
    """
    with transaction.atomic():
        vorhanden = (
            Bestellposition.objects.select_for_update()
            .filter(artikel=artikel, von=von, bestellung__isnull=True)
            .first()
        )
        if vorhanden:
            # Über `save()` und nicht `update(menge=F(…))`: Nur so steht die
            # neue Menge im Änderungsprotokoll. Die Zeile ist gesperrt, zwei
            # gleichzeitige Klicks zählen trotzdem beide.
            vorhanden.menge += menge
            vorhanden.save(update_fields=["menge", "geaendert_am"])
            return vorhanden
        return Bestellposition.objects.create(artikel=artikel, menge=menge, von=von)


def als_bestellt(lieferant, von, bestellt_am, notiz=""):
    """
    Macht aus dem Korb eine Bestellung im Archiv. Danach ist der Korb leer.

    Ein leerer Korb lässt sich nicht bestellen: Eine Bestellung ohne Zeilen
    stünde im Archiv und sähe aus, als fehlte etwas.
    """
    with transaction.atomic():
        positionen = list(korb(lieferant).select_for_update(of=("self",)))
        if not positionen:
            raise ValidationError({"korb": "Der Korb ist leer — es gibt nichts zu bestellen."})
        bestellung = Bestellung.objects.create(
            lieferant=lieferant, bestellt_am=bestellt_am, von=von, notiz=notiz.strip()[:300]
        )
        # Zeile für Zeile und nicht als ein `update()`: Nur so steht jede
        # Position mit „Bestellung: leer → …" im Änderungsprotokoll.
        for position in positionen:
            position.bestellung = bestellung
            position.save(update_fields=["bestellung", "geaendert_am"])
        return bestellung


# --- Was der Korb ungefähr kostet --------------------------------------------

CENT = Decimal("0.01")


def staffel_bereinigt(roh):
    """
    Die Staffel eines Lieferanten, geprüft und nach Menge sortiert — oder
    `ValueError` mit einem Satz, der am Feld stehen kann.
    """
    if roh in (None, ""):
        return []
    if not isinstance(roh, list):
        raise ValueError("Die Staffel ist eine Liste von Stufen.")
    stufen = []
    for stufe in roh:
        try:
            ab = int(stufe["ab"])
            prozent = Decimal(str(stufe["prozent"]).replace(",", "."))
        except (KeyError, TypeError, ValueError, ArithmeticError):
            raise ValueError("Jede Stufe braucht eine Menge und einen Prozentsatz.")
        if ab < 2:
            raise ValueError("Eine Stufe beginnt frühestens bei 2 Stück.")
        if not (0 < prozent < 100):
            raise ValueError("Der Rabatt liegt zwischen 0 und 100 Prozent.")
        stufen.append({"ab": ab, "prozent": str(prozent.normalize())})
    stufen.sort(key=lambda s: s["ab"])
    if len({s["ab"] for s in stufen}) != len(stufen):
        raise ValueError("Zwei Stufen beginnen bei derselben Menge.")
    return stufen


def rechnung(lieferant, positionen=None):
    """
    Was der Korb nach Listenpreis und Staffel ungefähr kostet — gerechnet,
    nicht gespeichert, und ein Richtwert: Was wirklich gilt, steht an der
    Kasse des Shops.

    **Die Staffel zählt über alle Artikel, die zu ihr gehören**, nicht je
    Artikel: Bei Bambu Lab sind 6 × Matte und 8 × Basic zusammen 14 Spulen
    und damit die oberste Stufe. Der Rabatt gilt auf den Listenpreis jedes
    dieser Artikel und wird je Stück auf Cent gerundet — so rechnet der Shop
    (16,99 € − 47 % = 9,00 €).

    Zeilen ohne Preis zählen zur Staffel mit, fehlen aber in der Summe; wie
    viele das sind, steht in `ohne_preis`, damit die Summe nicht vollständiger
    aussieht, als sie ist.
    """
    positionen = list(korb(lieferant) if positionen is None else positionen)
    stufen = staffel_bereinigt(lieferant.staffel)
    menge = sum(p.menge for p in positionen if p.artikel.in_staffel)
    erreicht = [s for s in stufen if s["ab"] <= menge]
    prozent = Decimal(erreicht[-1]["prozent"]) if erreicht else Decimal(0)
    naechste = next((s for s in stufen if s["ab"] > menge), None)

    einzeln, summe, liste, ohne_preis = {}, Decimal(0), Decimal(0), 0
    for p in positionen:
        preis = p.artikel.preis
        if preis is None:
            ohne_preis += 1
            continue
        if p.artikel.in_staffel and prozent:
            stueck = (preis * (100 - prozent) / 100).quantize(CENT, rounding=ROUND_HALF_UP)
        else:
            stueck = preis
        einzeln[p.id] = stueck
        summe += stueck * p.menge
        liste += preis * p.menge

    return {
        "staffel_menge": menge,
        "prozent": prozent,
        "naechste": (
            {"ab": naechste["ab"], "prozent": naechste["prozent"], "fehlen": naechste["ab"] - menge}
            if naechste and stufen
            else None
        ),
        "einzelpreise": einzeln,
        "summe": summe.quantize(CENT),
        "listensumme": liste.quantize(CENT),
        "ohne_preis": ohne_preis,
    }
