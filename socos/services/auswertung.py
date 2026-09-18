"""
Auswertungen über Zeitbuchungen.

**Zeiträume sind ausdrückliche Parameter.** Es gibt keinen stillen Filter auf
„aktuelle Periode": Ohne `von`/`bis` kommt alles. Ein stiller Filter ist die Art
Fehler, bei der Zahlen plausibel aussehen und falsch sind.
"""

from decimal import Decimal

from django.db.models import Q

from socos.models import Zeitbuchung
from socos.services import zeit as zeitdienst


def buchungen(von=None, bis=None, person=None, projekt=None, mit_entwuerfen=False):
    """
    Die Buchungen im Zeitraum. `von` und `bis` sind Datumsangaben, beide
    einschließlich.

    Entwürfe (vergessener Clock-out) sind **draußen**, solange sie niemand
    bestätigt hat. Sie sollen sichtbar sein, aber keine Summe verfälschen.
    """
    menge = Zeitbuchung.objects.select_related(
        "person", "paket", "paket__phase", "paket__phase__projekt"
    )
    if not mit_entwuerfen:
        menge = menge.filter(ist_entwurf=False)
    if von:
        menge = menge.filter(start__date__gte=von)
    if bis:
        menge = menge.filter(start__date__lte=bis)
    if person:
        menge = menge.filter(person=person)
    if projekt:
        menge = menge.filter(paket__phase__projekt=projekt)
    return menge


def sekunden_je_person(von=None, bis=None):
    """
    {Nutzer-ID: gerundete Sekunden}.

    Gerundet wird die Summe je Person, nicht jede Buchung — sonst summieren
    sich die Rundungsfehler.
    """
    roh = {}
    for b in buchungen(von, bis):
        roh.setdefault(b.person_id, []).append(zeitdienst.dauer(b))
    return {pid: zeitdienst.summe_gerundet(werte) for pid, werte in roh.items()}


def sekunden_je_projekt(von=None, bis=None):
    roh = {}
    for b in buchungen(von, bis):
        roh.setdefault(b.paket.phase.projekt_id, []).append(zeitdienst.dauer(b))
    return {pid: zeitdienst.summe_gerundet(werte) for pid, werte in roh.items()}


def sekunden_je_paket(von=None, bis=None):
    roh = {}
    for b in buchungen(von, bis):
        roh.setdefault(b.paket_id, []).append(zeitdienst.dauer(b))
    return {pid: zeitdienst.summe_gerundet(werte) for pid, werte in roh.items()}


def laufende_buchung(person):
    """Die eine laufende Buchung einer Person, oder None."""
    return (
        Zeitbuchung.objects.select_related("paket", "paket__phase", "paket__phase__projekt")
        .filter(person=person, ende__isnull=True)
        .first()
    )


def offene_entwuerfe(person=None):
    """
    Buchungen, die am Tagesende abgeschnitten wurden und noch bestätigt werden
    müssen. Sie stehen der Person beim nächsten Öffnen vor der Nase.
    """
    menge = Zeitbuchung.objects.select_related(
        "paket", "paket__phase", "paket__phase__projekt"
    ).filter(ist_entwurf=True)
    if person:
        menge = menge.filter(person=person)
    return menge.order_by("start")


def sekunden_je_paket_und_person(von=None, bis=None):
    """
    {(Paket-ID, Nutzer-ID): gerundete Sekunden} — die Grundlage für den
    Fortschritt je Person gegen ihr Pensum.
    """
    roh = {}
    for b in buchungen(von, bis):
        roh.setdefault((b.paket_id, b.person_id), []).append(zeitdienst.dauer(b))
    return {schluessel: zeitdienst.summe_gerundet(werte) for schluessel, werte in roh.items()}


def fortschritt(gebuchte_sekunden, pensum_stunden):
    """
    Wie weit ein Paket ist: gebuchte Zeit gegen das Pensum, in Prozent.

    **`None` statt 0, wenn es kein Pensum gibt.** 0 % hieße „nichts geschafft"
    — das wäre eine Aussage über ein Paket, für das nie eine Zahl vorgesehen
    war (die Förderanträge, die Ziele). Die Oberfläche zeigt dort nur die
    gebuchte Zeit und keinen Balken.

    Über 100 % ist erlaubt und gewollt: Ein Paket, das sein Pensum überzogen
    hat, soll das zeigen, nicht bei 100 stehen bleiben.

    Bis 2026-09-18 kam der Fortschritt aus einer Stufenleiste je Paket (ein
    Stand per Klick, Monate aus einer Vorlage). Weg, weil das nichts gemessen
    hat — die Stunden sind gebucht, das Pensum steht im Arbeitsplan, und
    zwischen beiden liegt die einzige Zahl, die jemand nachrechnen kann.
    """
    if not pensum_stunden or pensum_stunden <= 0:
        return None
    return round(100 * Decimal(gebuchte_sekunden) / 3600 / Decimal(pensum_stunden))


def entwuerfe_aus_vergessenen_clockouts(jetzt=None):
    """
    Schneidet Buchungen, die über ihr Tagesende hinauslaufen, dort ab und
    markiert sie als Entwurf.

    Wird beim Abrufen der eigenen Zeiten aufgerufen — nicht von einem
    Hintergrunddienst. **Warum:** Ein Dienst, der nachts läuft, ist eine
    zweite Stelle, an der Buchungen verändert werden, und die sieht man beim
    Lesen des Codes nicht. So passiert es dort, wo jemand hinschaut.
    """
    from django.utils import timezone as tz

    jetzt = jetzt or tz.now()
    geschnitten = []
    for buchung in Zeitbuchung.objects.filter(ende__isnull=True):
        grenze = zeitdienst.tagesende(buchung.start)
        if jetzt > grenze:
            buchung.ende = grenze
            buchung.ist_entwurf = True
            buchung.save(update_fields=["ende", "ist_entwurf", "geaendert_am"])
            geschnitten.append(buchung)
    return geschnitten
