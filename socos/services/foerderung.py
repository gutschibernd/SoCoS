"""
Förderungen: was aus einem Antrag gerechnet wird — Summe, Laufzeit, Reife.

**Die Antragsreife steht hier und nicht in der Oberfläche.** Sie ist die Liste
dessen, was die Richtlinie (V.4 a–e) und das Online-Formular verlangen. Stünde
sie im Frontend, gäbe es eine zweite Stelle, die weiß, was ein Antrag braucht —
und die liefe beim nächsten Formularfeld auseinander.
"""

from decimal import Decimal

# Was das Online-Formular des Landes NÖ höchstens nimmt. Die Kurzbezeichnung
# begrenzt schon die Datenbank (`Foerderantrag.titel`); die Beschreibung nicht,
# weil beim Schreiben ein Satz zu viel normal ist — die Seite zählt mit.
ZEICHEN = {"titel": 200, "beschreibung": 500}


def lebende_pakete(antrag):
    """Über die Beziehung sähe Django auch weich gelöschte Pakete."""
    return [p for p in antrag.pakete.all() if p.geloescht_am is None]


def summe(antrag) -> Decimal:
    """Die beantragte Fördersumme: die Beträge aller Pakete, leere zählen nicht."""
    return sum((p.betrag for p in lebende_pakete(antrag) if p.betrag is not None), Decimal("0.00"))


def laufzeit(antrag) -> int:
    """Wie viele Monate der Antrag läuft — bis zum Ende des letzten Pakets."""
    return max((p.bis for p in lebende_pakete(antrag)), default=0)


def _euro(betrag) -> str:
    """„50.000 €" — für die Hinweise der Reife, im österreichischen Format."""
    ganz = f"{betrag:,.0f}".replace(",", ".")
    return f"{ganz} €"


def reife(antrag) -> list[dict]:
    """
    Was ein Antrag braucht, je Punkt erfüllt oder nicht — in der Reihenfolge,
    in der man ihn schreibt. `hinweis` sagt, was fehlt; bei einem erfüllten
    Punkt ist er leer.
    """
    programm = antrag.programm
    pakete = lebende_pakete(antrag)
    gesamt = summe(antrag)
    monate = laufzeit(antrag)
    zeichen = len(antrag.beschreibung.strip())

    def punkt(schluessel, text, erfuellt, hinweis):
        return {"schluessel": schluessel, "text": text, "erfuellt": erfuellt, "hinweis": "" if erfuellt else hinweis}

    ohne_betrag = [p for p in pakete if p.betrag is None]
    if not pakete:
        pakete_hinweis = "Noch kein Arbeitspaket."
    else:
        pakete_hinweis = f"{len(ohne_betrag)} {'Paket' if len(ohne_betrag) == 1 else 'Pakete'} ohne Betrag."

    if gesamt <= 0:
        summe_ok, summe_hinweis = False, "Noch keine Beträge."
    elif programm.max_foerderung is not None and gesamt > programm.max_foerderung:
        summe_ok = False
        summe_hinweis = f"{_euro(gesamt - programm.max_foerderung)} über der Grenze von {_euro(programm.max_foerderung)}."
    else:
        summe_ok, summe_hinweis = True, ""

    if programm.max_monate is not None and monate > programm.max_monate:
        laufzeit_ok, laufzeit_hinweis = False, f"{monate} Monate — erlaubt sind {programm.max_monate}."
    else:
        laufzeit_ok, laufzeit_hinweis = monate > 0, "Noch keine Laufzeit."

    return [
        punkt("titel", "Kurzbezeichnung", bool(antrag.titel.strip()), "Fehlt."),
        punkt(
            "beschreibung",
            "Beschreibung des Vorhabens",
            0 < zeichen <= ZEICHEN["beschreibung"],
            "Fehlt." if zeichen == 0 else f"{zeichen - ZEICHEN['beschreibung']} Zeichen zu lang.",
        ),
        punkt("nutzen", "Nutzen für Pflege und Betreuung", bool(antrag.nutzen.strip()), "Fehlt."),
        punkt("mehrwert", "Mehrwert gegenüber Bestehendem", bool(antrag.mehrwert.strip()), "Fehlt."),
        punkt("wirkung", "Wirkungsziele und Kennzahlen", bool(antrag.wirkung.strip()), "Fehlt."),
        punkt("pakete", "Arbeitspakete mit Beträgen", bool(pakete) and not ohne_betrag, pakete_hinweis),
        punkt("summe", "Fördersumme in der Grenze", summe_ok, summe_hinweis),
        punkt("laufzeit", "Laufzeit in der Grenze", laufzeit_ok, laufzeit_hinweis),
        punkt("regelbetrieb", "Kostenprognose Regelbetrieb", bool(antrag.regelbetrieb.strip()), "Fehlt."),
    ]
