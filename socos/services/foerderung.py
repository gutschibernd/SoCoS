"""
Förderungen: was aus einem Antrag gerechnet wird — Summe, Laufzeit, Reife.

**Die Antragsreife steht hier und nicht in der Oberfläche.** Sie ist die Liste
dessen, was das Formular verlangt, und dazu je ein Punkt für jeden Abschnitt,
den der Antrag führt. Stünde sie im Frontend, gäbe es eine zweite Stelle, die
weiß, was ein Antrag braucht — und die liefe beim nächsten Feld auseinander.
"""

from decimal import ROUND_HALF_UP, Decimal

# Was das Online-Formular des Landes NÖ höchstens nimmt. Die Kurzbezeichnung
# begrenzt schon die Datenbank (`Foerderantrag.titel`); die Beschreibung nicht,
# weil beim Schreiben ein Satz zu viel normal ist — die Seite zählt mit.
ZEICHEN = {"titel": 200, "beschreibung": 500}


def lebende_pakete(antrag):
    """Über die Beziehung sähe Django auch weich gelöschte Pakete."""
    return [p for p in antrag.pakete.all() if p.geloescht_am is None]


def lebende_abschnitte(antrag):
    return sorted(
        (a for a in antrag.abschnitte.all() if a.geloescht_am is None), key=lambda a: (a.reihenfolge, a.id)
    )


def lebende_stunden(paket):
    return [s for s in paket.stunden.all() if s.geloescht_am is None]


def lebende_posten(antrag):
    return [p for p in antrag.posten.all() if p.geloescht_am is None]


def _cent(wert: Decimal) -> Decimal:
    return wert.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _prozent(wert: Decimal, prozent) -> Decimal:
    return _cent(wert * prozent / Decimal(100)) if prozent is not None else Decimal("0.00")


def paketkosten(paket, antrag) -> dict:
    """
    Was ein Paket kostet: Stunden mal Satz, die ihm zugeordneten Posten und
    sein Pauschalbetrag. Ohne Satz zählen die Stunden nicht als Geld — die
    Reife sagt dann, dass er fehlt.
    """
    stunden = sum((s.stunden for s in lebende_stunden(paket)), Decimal("0.00"))
    personal = _cent(stunden * antrag.stundensatz) if antrag.stundensatz is not None else Decimal("0.00")
    sach = sum((p.betrag for p in lebende_posten(antrag) if p.paket_id == paket.id), Decimal("0.00"))
    pauschal = paket.betrag if paket.betrag is not None else Decimal("0.00")
    return {"stunden": stunden, "personal": personal, "sach": sach, "gesamt": personal + sach + pauschal}


def kosten(antrag) -> dict:
    """
    Die Kalkulation eines Antrags, wie ein Kostenplan sie aufstellt:
    Personal (Stunden mal Satz) + Sachkosten + Pauschalbeträge der Pakete =
    direkte Kosten, darauf die Gemeinkostenpauschale, daraus mit der
    Förderquote der Zuschuss.

    **Ohne Quote ist der Zuschuss die ganze Summe** — so rechnet ein Antrag,
    dessen Paketbeträge schon die Fördersumme sind (Land NÖ).
    """
    pakete = lebende_pakete(antrag)
    stunden = sum((s.stunden for p in pakete for s in lebende_stunden(p)), Decimal("0.00"))
    personal = _cent(stunden * antrag.stundensatz) if antrag.stundensatz is not None else Decimal("0.00")
    # Posten an einem entfernten Paket zählen weiter: Das Geld ist ja nicht
    # weg, nur seine Zuordnung.
    sach = sum((p.betrag for p in lebende_posten(antrag)), Decimal("0.00"))
    pauschal = sum((p.betrag for p in pakete if p.betrag is not None), Decimal("0.00"))
    direkt = personal + sach + pauschal
    gemein = _prozent(direkt, antrag.gemeinkosten)
    gesamt = direkt + gemein
    zuschuss = _prozent(gesamt, antrag.foerderquote) if antrag.foerderquote is not None else gesamt
    return {
        "stunden": stunden,
        "personal": personal,
        "sach": sach,
        "pauschal": pauschal,
        "direkt": direkt,
        "gemeinkosten": gemein,
        "gesamt": gesamt,
        "zuschuss": zuschuss,
        "eigenmittel": gesamt - zuschuss,
    }


def summe(antrag) -> Decimal:
    """Die beantragte Fördersumme — der Zuschuss aus der Kalkulation."""
    return kosten(antrag)["zuschuss"]


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

    Die Abschnitte stehen je mit ihrer Überschrift darin, unter dem Schlüssel
    `abschnitt-<id>` — die Seite springt damit an die richtige Stelle.
    """
    programm = antrag.programm
    pakete = lebende_pakete(antrag)
    gesamt = summe(antrag)
    monate = laufzeit(antrag)
    zeichen = len(antrag.beschreibung.strip())

    def punkt(schluessel, text, erfuellt, hinweis):
        return {"schluessel": schluessel, "text": text, "erfuellt": erfuellt, "hinweis": "" if erfuellt else hinweis}

    ohne_betrag = [p for p in pakete if paketkosten(p, antrag)["gesamt"] <= 0 and not lebende_stunden(p)]
    ohne_satz = antrag.stundensatz is None and any(lebende_stunden(p) for p in pakete)
    if not pakete:
        pakete_hinweis = "Noch kein Arbeitspaket."
    elif ohne_satz:
        pakete_hinweis = "Stunden ohne Stundensatz."
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
        *(
            punkt(f"abschnitt-{a.id}", a.titel, bool(a.text.strip()), "Noch leer.")
            for a in lebende_abschnitte(antrag)
        ),
        punkt("pakete", "Arbeitspakete mit Beträgen", bool(pakete) and not ohne_betrag and not ohne_satz, pakete_hinweis),
        punkt("summe", "Fördersumme in der Grenze", summe_ok, summe_hinweis),
        punkt("laufzeit", "Laufzeit in der Grenze", laufzeit_ok, laufzeit_hinweis),
    ]
