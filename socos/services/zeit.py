"""
Rechnen mit Zeiten.

**Gerundet wird erst hier, nie beim Speichern.** Gespeichert werden Start und
Ende sekundengenau; wer beim Erfassen rundet, kann die Rundung nicht mehr
zurücknehmen, wenn die Regel sich ändert.

Dieselbe Rundung gibt es ein zweites Mal im Frontend
(`frontend/src/basis/zeit.ts`), für die Anzeige. Beide sind getestet und müssen
dasselbe Ergebnis liefern.
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

RUNDUNG_MINUTEN = 5


def auf_fuenf_minuten(sekunden):
    """
    Auf volle 5 Minuten, kaufmännisch. Genau 2,5 Minuten Rest gehen auf.

    Warum aufrunden statt abschneiden: Sonst verschwände über eine Woche
    verteilt eine Viertelstunde, die jemand tatsächlich gearbeitet hat.
    """
    schritt = RUNDUNG_MINUTEN * 60
    if sekunden <= 0:
        return 0
    return int(Decimal(sekunden / schritt).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) * schritt


def summe_gerundet(sekundenliste):
    """
    Erst summieren, dann runden.

    Andersherum wären drei Buchungen zu je zwei Minuten zusammen null — pro
    Woche eine halbe Stunde Arbeit, die still verschwindet.
    """
    return auf_fuenf_minuten(sum(sekundenliste))


def als_stunden(sekunden):
    """Dezimalstunden für den Zeitnachweis, als Decimal — nie als float."""
    return (Decimal(auf_fuenf_minuten(sekunden)) / Decimal(3600)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def als_stunden_text(sekunden):
    """
    Dezimalstunden als deutscher Text: 26,25 — mit Komma.

    Der Punkt aus `str(Decimal)` ist in einem deutschen Dokument schlicht
    falsch und wird beim Übertragen in eine Tabelle zur Fehlerquelle.
    """
    return f"{als_stunden(sekunden)}".replace(".", ",")


def als_dauer(sekunden):
    """Sekunden als 3:25 (Stunden:Minuten)."""
    minuten = max(0, int(sekunden)) // 60
    return f"{minuten // 60}:{minuten % 60:02d}"


def dauer(buchung, jetzt=None):
    """
    Dauer einer Buchung in Sekunden. Eine laufende zählt bis `jetzt`.

    Ein Entwurf zählt **null**: Er ist nicht bestätigt, und eine unbestätigte
    Buchung darf keine Auswertung beeinflussen.
    """
    if buchung.ist_entwurf:
        return 0
    bis = buchung.ende or (jetzt or timezone.now())
    return max(0, int((bis - buchung.start).total_seconds()))


def tagesende(zeitpunkt):
    """
    Der letzte Moment des Tages, an dem `zeitpunkt` liegt — in lokaler Zeit.

    Nicht `start + 24 h`: An den beiden Umstellungstagen hat ein Tag 23 oder
    25 Stunden, und eine Buchung landete sonst eine Stunde daneben.
    """
    lokal = timezone.localtime(zeitpunkt)
    naechster = timezone.make_aware(
        datetime.combine(lokal.date() + timedelta(days=1), time.min),
        timezone.get_current_timezone(),
    )
    return naechster - timedelta(seconds=1)


def woche_um(tag=None):
    """Montag bis Sonntag der Woche, in der `tag` liegt."""
    tag = tag or timezone.localdate()
    montag = tag - timedelta(days=tag.weekday())
    return montag, montag + timedelta(days=6)


def monatsgrenzen(monat: date):
    """Erster und letzter Tag des Monats, in dem `monat` liegt."""
    erster = monat.replace(day=1)
    if erster.month == 12:
        naechster = erster.replace(year=erster.year + 1, month=1)
    else:
        naechster = erster.replace(month=erster.month + 1)
    return erster, naechster - timedelta(days=1)
