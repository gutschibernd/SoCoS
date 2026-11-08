"""
Was Sopharmis bisher bekommen hat — die Seite hinter dem Kästchen mit dem
Diamanten unten rechts auf der Förderungsseite (`foerderungen/bisher`), erst
nach dem PIN.

**Diese Zahlen stehen absichtlich nirgends sonst.** Sie gehen in keine
Auswertung, keine Runway-Rechnung, keine Förderplanung, kein PDF, keine Doku
und keine Änderungsliste, und die Protokollseite blendet sie aus (Bernd,
2026-11-08: „nur aus persönlichem Interesse … sollen nirgends anders
aufscheinen"). Wer sie irgendwo anders braucht, fragt vorher.

**In der Sicherung und im Export stehen sie** (Bernd, 2026-11-09) — darum
sind sie ein Modell (`Eingang`). **Im Repository nicht**: Sie kommen aus
`daten/bisher.json` über `bisher_einspielen`, hinübergebracht von
`skripte/bisher_uebertragen.command`.

Der PIN wird **am Server** geprüft, und die Beträge kommen erst danach über
die Leitung. Stünden sie im Bundle, läse sie jeder Angemeldete aus dem
Quelltext. Der PIN selbst steht hier im Code: Er ist ein Sichtschutz, kein
Geheimnis — vier Ziffern probiert ein Angemeldeter mit einem Skript in
Minuten durch. Was schützt, ist die Anmeldung.
"""

import hmac
from decimal import Decimal

PIN = "1710"


def pin_stimmt(eingabe):
    """Zeitkonstant verglichen — ein `==` verriete über die Laufzeit, wie viele Stellen schon stimmen."""
    return hmac.compare_digest(str(eingabe or "").strip().encode(), PIN.encode())


def aufstellung():
    from socos.models import Eingang

    posten = [{"von": e.von, "wofuer": e.wofuer, "betrag": e.betrag} for e in Eingang.objects.all()]
    return {"posten": posten, "summe": sum((p["betrag"] for p in posten), Decimal("0"))}
