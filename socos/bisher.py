"""
Was Sopharmis bisher bekommen hat — hinter dem Kästchen mit dem Diamanten
unten rechts auf der Förderungsseite, erst nach dem PIN.

**Diese Zahlen stehen absichtlich nirgends sonst.** Sie gehen in keine
Auswertung, keine Runway-Rechnung, keine Förderplanung, kein PDF, keine Doku
und keine Änderungsliste (Bernd, 2026-11-08: „nur aus persönlichem
Interesse … sollen nirgends anders aufscheinen"). Wer sie irgendwo anders
braucht, fragt vorher.

**Und nicht im Repository** (Bernd, 2026-11-09). Beträge und PIN kommen aus
der Umgebung, `SOCOS_BISHER` — am Server aus `/opt/socos/.env`, lokal aus
`.env`. Hinein schreibt sie `skripte/bisher_uebertragen.command`, und zwar
aus `daten/bisher.json`.

Kein Modell: Eine Tabelle in der Datenbank stünde im Änderungsprotokoll, in
der Sicherung und in der Admin-Oberfläche — drei Orte mehr.

Der PIN wird **am Server** geprüft, und die Beträge kommen erst danach über
die Leitung. Stünden sie im Bundle, läse sie jeder Angemeldete aus dem
Quelltext — der PIN wäre dann nur Zierde.
"""

import hmac
import json
from decimal import Decimal

from django.conf import settings


def hinterlegt():
    """`{"pin": …, "posten": [{von, wofuer, betrag}]}` — oder None, wenn hier nichts steht."""
    roh = getattr(settings, "BISHER", "")
    return json.loads(roh) if roh else None


def pin_stimmt(eingabe, daten):
    """Zeitkonstant verglichen — ein `==` verriete über die Laufzeit, wie viele Stellen schon stimmen."""
    return hmac.compare_digest(str(eingabe or "").strip().encode(), str(daten["pin"]).encode())


def aufstellung(daten):
    # Betrag als Zeichenkette in der Datei, dann Decimal — siehe CLAUDE.md, „Geld ist Decimal".
    posten = [
        {"von": p["von"], "wofuer": p.get("wofuer", ""), "betrag": Decimal(str(p["betrag"]))}
        for p in daten["posten"]
    ]
    return {"posten": posten, "summe": sum((p["betrag"] for p in posten), Decimal("0"))}
