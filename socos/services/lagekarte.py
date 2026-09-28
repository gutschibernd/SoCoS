"""
Lagekarte: was der Server an den Verbindungen prüft.

Nur das, was die Datenbank allein nicht halten kann. Doppelte Verbindungen und
Verbindungen auf sich selbst hält sie (Einschränkungen am Modell). Einen Kreis
über drei Schritte sieht sie nicht — dafür diese Datei.

Alles andere an der Lagekarte — „wartet", „als Nächstes frei", Stränge,
Pfeilführung — rechnet die Oberfläche (`frontend/src/basis/lagekarte.ts`).
Es ist nirgends gespeichert und darum auch nichts, was der Server hüten müsste.
"""

from socos.models import Lageverbindung


def ergaebe_kreis(von_id, nach_id, ohne_id=None):
    """
    Ob eine Verbindung `von → nach` einen Kreis schlösse — also ob man von
    `nach` aus über bestehende Verbindungen schon zu `von` kommt.

    `ohne_id` lässt eine Verbindung außer Acht: die, die gerade umgehängt oder
    umgedreht wird. Ohne das meldete „Umdrehen" jeder Verbindung einen Kreis
    mit sich selbst.
    """
    if von_id == nach_id:
        return True
    menge = Lageverbindung.objects.all()
    if ohne_id is not None:
        menge = menge.exclude(pk=ohne_id)
    ausgaenge = {}
    for v, n in menge.values_list("von_id", "nach_id"):
        ausgaenge.setdefault(v, []).append(n)

    gesehen, stapel = set(), [nach_id]
    while stapel:
        schritt = stapel.pop()
        if schritt == von_id:
            return True
        for weiter in ausgaenge.get(schritt, ()):
            if weiter not in gesehen:
                gesehen.add(weiter)
                stapel.append(weiter)
    return False
