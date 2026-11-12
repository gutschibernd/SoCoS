"""
Der Korb eines Lieferanten: hineinlegen und als bestellt markieren.

Der Korb ist kein eigenes Modell, sondern die Menge der Positionen ohne
Bestellung (siehe `Bestellung` in socos/models.py). Beides hier steht an einer
Stelle, damit die Oberfläche und ein späterer zweiter Weg (der Assistent)
nicht je eine eigene Regel dafür haben.
"""

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
