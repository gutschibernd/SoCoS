"""
Förderungen: was aus einem Antrag gerechnet wird — Summe, Laufzeit, Reife.

**Die Antragsreife steht hier und nicht in der Oberfläche.** Sie ist die Liste
dessen, was das Formular verlangt, und dazu je ein Punkt für jeden Abschnitt,
den der Antrag führt. Stünde sie im Frontend, gäbe es eine zweite Stelle, die
weiß, was ein Antrag braucht — und die liefe beim nächsten Feld auseinander.
"""

import calendar
from datetime import date, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from fractions import Fraction

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


def stunden_kosten_geld(antrag) -> bool:
    """
    Ob die Stunden eines Antrags in die Kalkulation gehen.

    Beim Drittleister nicht: Dort sind sie unser geschätzter Aufwand für die
    Förderauslastung. Der Antrag eines anderen rechnet mit Paketbeträgen, und
    die Stunden darin würden sonst als „ohne Stundensatz" in der Reife stehen.
    """
    return antrag.rolle == antrag.Rolle.FOERDERWERBER


def _personal(stunden: Decimal, antrag) -> Decimal:
    if antrag.stundensatz is None or not stunden_kosten_geld(antrag):
        return Decimal("0.00")
    return _cent(stunden * antrag.stundensatz)


def _cent(wert: Decimal) -> Decimal:
    return wert.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _prozent(wert: Decimal, prozent) -> Decimal:
    return _cent(wert * prozent / Decimal(100)) if prozent is not None else Decimal("0.00")


def paketkosten(paket, antrag) -> dict:
    """
    Was ein Paket kostet: Stunden mal Satz, die ihm zugeordneten Posten und
    sein Pauschalbetrag. Ohne Satz zählen die Stunden nicht als Geld — die
    Reife sagt dann, dass er fehlt. Beim Drittleister zählen sie nie.
    """
    stunden = sum((s.stunden for s in lebende_stunden(paket)), Decimal("0.00"))
    personal = _personal(stunden, antrag)
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
    personal = _personal(stunden, antrag)
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


# --- Der Förderzeitraum ----------------------------------------------------------
#
# **Ein Projektmonat beginnt am Tag des Beginns, nicht am Monatsersten.** Bei
# Beginn 19.10. läuft M1 vom 19.10. bis 18.11. Bis 2026-10-21 war M1 der
# Kalendermonat des Beginns, und der Zeitplan zeigte Pakete ab Anfang Oktober,
# obwohl vor dem 19. nichts gefördert wird (Bernd: „die arbeitspakete fangen
# anfang oktober an"). Das Ende schneidet den letzten Monat ab, wo es mitten
# in ihm liegt.


def monate_dazu(tag: date, monate: int) -> date:
    """Derselbe Tag `monate` später — am Monatsende der letzte, den es gibt (31.01. → 28.02.)."""
    stelle = tag.year * 12 + tag.month - 1 + monate
    jahr, monat = divmod(stelle, 12)
    return date(jahr, monat + 1, min(tag.day, calendar.monthrange(jahr, monat + 1)[1]))


def projektmonat(beginn: date, ende: date | None, monat: int) -> tuple[date, date]:
    """
    Erster und letzter Tag von M`monat`. Immer vom Beginn aus gezählt und
    nicht von Monat zu Monat weiter — sonst bliebe nach einem Februar jeder
    Monat am 28. hängen.
    """
    erster = monate_dazu(beginn, monat - 1)
    letzter = monate_dazu(beginn, monat) - timedelta(days=1)
    # Nur der Monat, in dem das Ende liegt, wird gekürzt. Ein Paket, das
    # darüber hinausreicht, behält seine Monate — die Reife sagt, dass es
    # nicht passt, statt dass es still auf null Tage schrumpft.
    if ende is not None and erster <= ende < letzter:
        letzter = ende
    return erster, letzter


def zeitraum(beginn: date, ende: date | None, von: int, bis: int) -> tuple[date, date]:
    """M`von`–M`bis` als Kalendertage."""
    return projektmonat(beginn, ende, von)[0], projektmonat(beginn, ende, bis)[1]


def rahmen(antrag) -> int | None:
    """
    Wie viele Projektmonate der Förderzeitraum hat — der letzte zählt, auch
    wenn das Ende mitten in ihm liegt. Ohne Beginn oder Ende gibt es keinen.
    """
    if antrag.beginn is None or antrag.ende is None:
        return None
    monate = 1
    while monate_dazu(antrag.beginn, monate) <= antrag.ende:
        monate += 1
    return monate


def paketende(antrag) -> int:
    """In welchem Monat das letzte Paket endet."""
    return max((p.bis for p in lebende_pakete(antrag)), default=0)


def laufzeit(antrag) -> int:
    """
    Wie viele Monate der Antrag läuft: der Förderzeitraum, wenn er feststeht,
    sonst bis zum Ende des letzten Pakets.
    """
    monate = rahmen(antrag)
    return paketende(antrag) if monate is None else monate


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

    geld = stunden_kosten_geld(antrag)
    ohne_betrag = [
        p for p in pakete if paketkosten(p, antrag)["gesamt"] <= 0 and not (geld and lebende_stunden(p))
    ]
    ohne_satz = geld and antrag.stundensatz is None and any(lebende_stunden(p) for p in pakete)
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
    elif rahmen(antrag) is not None and paketende(antrag) > monate:
        laufzeit_ok = False
        laufzeit_hinweis = f"Pakete reichen bis M{paketende(antrag)}, das Ende liegt in M{monate}."
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


# --- Die Förderauslastung -------------------------------------------------------
#
# Alle Anträge in den gewählten Ständen auf einer Kalenderachse: welche Pakete
# wann laufen und wer in welchem Monat wie viele Stunden hat — gegen die
# Kapazität, die hinter dem Zahnrad der Seite steht.
#
# **Die Stunden eines Pakets liegen gleichmäßig auf seinen Monaten.** Das ist
# eine Annahme, und sie steht so in der Doku: Ein Antrag sagt, wie viele
# Stunden ein Paket hat, nicht wann darin. Für die Planung reicht das.

VIERTEL = Decimal("0.25")
NULL = Decimal("0.00")


def verteilen(stunden: Decimal, anteile: list) -> list[Decimal]:
    """
    Teilt Stunden nach `anteile` (die zusammen 1 ergeben), je Teil auf die
    Viertelstunde abgerundet; der Rest kommt in den letzten. 100 h zu je einem
    Drittel sind 33,25 · 33,25 · 33,50.

    **Warum nicht einfach geteilt:** 100 / 3 hat keine Darstellung in zwei
    Nachkommastellen, und dreimal 33,33 sind 99,99. Über ein Jahr und mehrere
    Anträge summiert stünden dann Stunden in der Auslastung, die sich keinem
    Antrag mehr zuordnen lassen.
    """
    if not anteile:
        raise ValueError("Ein Paket läuft mindestens einen Monat.")
    teile = [
        (stunden * Decimal(a.numerator) / Decimal(a.denominator) / VIERTEL).to_integral_value(rounding=ROUND_DOWN)
        * VIERTEL
        for a in anteile[:-1]
    ]
    return teile + [stunden - sum(teile, NULL)]


def kalenderanteile(beginn: date, ende: date | None, von: int, bis: int) -> dict[str, Fraction]:
    """
    Welcher Anteil eines Pakets auf welchen Kalendermonat fällt („2026-10" →
    13/90). Jeder Projektmonat trägt gleich viel; einer, der über einen
    Monatswechsel reicht, teilt seinen Teil nach Tagen.

    **Warum nicht gleich nach Tagen übers ganze Paket:** Mit Beginn am Ersten
    deckt sich jeder Projektmonat mit einem Kalendermonat, und dann soll jeder
    gleich viel tragen wie bisher — nicht der Jänner mehr als der Februar,
    weil er drei Tage länger ist.
    """
    anteile: dict[str, Fraction] = {}
    je_monat = Fraction(1, bis - von + 1)
    for monat in range(von, bis + 1):
        erster, letzter = projektmonat(beginn, ende, monat)
        tage = (letzter - erster).days + 1
        tag = erster
        while tag <= letzter:
            monatsletzter = date(tag.year, tag.month, calendar.monthrange(tag.year, tag.month)[1])
            bis_dahin = min(letzter, monatsletzter)
            schluessel = f"{tag.year:04d}-{tag.month:02d}"
            anteile[schluessel] = anteile.get(schluessel, Fraction(0)) + je_monat * ((bis_dahin - tag).days + 1) / tage
            tag = bis_dahin + timedelta(days=1)
    return anteile


def _monatsreihe(erster: str, letzter: str) -> list[str]:
    jahr, monat = int(erster[:4]), int(erster[5:])
    reihe = []
    while (aktuell := f"{jahr:04d}-{monat:02d}") <= letzter:
        reihe.append(aktuell)
        jahr, monat = (jahr + 1, 1) if monat == 12 else (jahr, monat + 1)
    return reihe


def personenschluessel(zeile) -> str:
    """Ein Nutzer ist er selbst, ein Name ohne Konto ist sein Text — „N. N." zweimal ist eine Person."""
    return f"n{zeile.nutzer_id}" if zeile.nutzer_id is not None else f"p:{zeile.person.strip()}"


def _anteil(stunden: Decimal, kapazitaet):
    """Prozent der Kapazität, ganzzahlig. Ohne Kapazität gibt es keinen Maßstab."""
    if not kapazitaet:
        return None
    return (stunden * 100 / kapazitaet).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def auslastung(staende, heute=None) -> dict:
    """
    Die Förderauslastung über alle lebenden Anträge in `staende`.

    Ein Antrag ohne Beginn hat keinen Platz auf der Achse; er steht unter
    `ohne_termin` und zählt in keiner Monatssumme — sonst lägen seine Stunden
    in irgendeinem Monat, den sich niemand ausgesucht hat.

    Summen werden hier gerechnet und nicht in der Seite, auch die je Person
    und Monat: `verteilung` ist die feinste Ebene (Monat · Antrag · Paket ·
    Person), alles andere ist daraus summiert.

    **Die Achse reicht immer auch über den laufenden Monat.** Finge sie beim
    frühesten Paket an, wanderte sie mit, sobald man den ersten Antrag
    verschiebt — und es sähe aus, als hätten sich die anderen bewegt. Am
    heutigen Monat verankert bleibt sie stehen. Gefiltert wird dabei nichts.
    """
    from django.utils import timezone

    from socos.models import Foerderantrag, Foerderkapazitaet, Nutzer

    antraege = (
        Foerderantrag.objects.filter(stand__in=staende)
        .select_related("programm__geber")
        .prefetch_related("pakete__stunden__nutzer")
        .order_by("beginn", "id")
    )
    kapazitaeten = {
        k.nutzer_id: k.stunden_je_monat for k in Foerderkapazitaet.objects.select_related("nutzer")
    }

    def kopf(antrag):
        geber = antrag.programm.geber
        return {
            "id": antrag.id,
            "titel": antrag.titel,
            "nummer": antrag.nummer,
            "stand": antrag.stand,
            "rolle": antrag.rolle,
            "beginn": antrag.beginn,
            "ende": antrag.ende,
            "geber": geber.id,
            "geber_name": geber.kurz or geber.name,
            "programm": antrag.programm_id,
            "programm_name": antrag.programm.name,
        }

    heute = heute or timezone.localdate()
    jetzt = f"{heute.year:04d}-{heute.month:02d}"
    personen = {}  # Schlüssel → Angaben, in der Reihenfolge des ersten Auftretens

    def person(zeile):
        schluessel = personenschluessel(zeile)
        if schluessel not in personen:
            personen[schluessel] = {
                "schluessel": schluessel,
                "nutzer": zeile.nutzer_id,
                "name": zeile.name.strip(),
                "voller_name": zeile.nutzer.name if zeile.nutzer_id else zeile.person.strip(),
                "kapazitaet": kapazitaeten.get(zeile.nutzer_id),
            }
        return schluessel

    auf_der_achse, ohne_termin, verteilung, enden = [], [], [], []
    for antrag in antraege:
        pakete = sorted(lebende_pakete(antrag), key=lambda p: (p.reihenfolge, p.id))
        gesamt = sum((s.stunden for p in pakete for s in lebende_stunden(p)), NULL)
        if antrag.beginn is None:
            ohne_termin.append({**kopf(antrag), "laufzeit": laufzeit(antrag), "stunden": gesamt})
            continue

        eintraege = []
        for paket in pakete:
            anteile = kalenderanteile(antrag.beginn, antrag.ende, paket.von, paket.bis)
            monate = sorted(anteile)
            enden += [monate[0], monate[-1]]
            stunden = NULL
            for zeile in lebende_stunden(paket):
                wer = person(zeile)
                for monat, teil in zip(monate, verteilen(zeile.stunden, [anteile[m] for m in monate])):
                    if teil:
                        verteilung.append(
                            {"monat": monat, "antrag": antrag.id, "paket": paket.id, "person": wer, "stunden": teil}
                        )
                stunden += zeile.stunden
            eintraege.append(
                {
                    "id": paket.id,
                    "titel": paket.titel,
                    "ergebnis": paket.ergebnis,
                    "von": monate[0],
                    "bis": monate[-1],
                    "stunden": stunden,
                }
            )
        auf_der_achse.append({**kopf(antrag), "pakete": eintraege, "stunden": gesamt})

    def summiert(schluessel_von):
        summen = {}
        for z in verteilung:
            ziel = summen.setdefault(schluessel_von(z), {})
            ziel[z["monat"]] = ziel.get(z["monat"], NULL) + z["stunden"]
        return summen

    je_antrag = summiert(lambda z: z["antrag"])
    for eintrag in auf_der_achse:
        eintrag["je_monat"] = je_antrag.get(eintrag["id"], {})

    # Wer eine Kapazität hat, steht auch ohne Stunden da: Freie Zeit ist in
    # einer Auslastung genauso eine Antwort wie zu viel. Stillgelegte nur,
    # wenn sie noch Stunden haben.
    for nutzer in Nutzer.objects.filter(pk__in=kapazitaeten, is_active=True).exclude(
        pk__in=[p["nutzer"] for p in personen.values()]
    ):
        personen[f"n{nutzer.pk}"] = {
            "schluessel": f"n{nutzer.pk}",
            "nutzer": nutzer.pk,
            "name": nutzer.initialen or nutzer.name,
            "voller_name": nutzer.name,
            "kapazitaet": kapazitaeten[nutzer.pk],
        }

    je_person = summiert(lambda z: z["person"])
    for angaben in personen.values():
        monate = je_person.get(angaben["schluessel"], {})
        angaben["stunden"] = sum(monate.values(), NULL)
        angaben["je_monat"] = {
            monat: {"stunden": h, "anteil": _anteil(h, angaben["kapazitaet"])} for monat, h in monate.items()
        }

    je_monat = {}
    for z in verteilung:
        je_monat[z["monat"]] = je_monat.get(z["monat"], NULL) + z["stunden"]

    return {
        "staende": list(staende),
        "monate": _monatsreihe(min(enden + [jetzt]), max(enden + [jetzt])) if enden else [],
        "heute": jetzt,
        "antraege": auf_der_achse,
        "ohne_termin": ohne_termin,
        # Erst die Nutzer nach Namen, dann die Namen ohne Konto.
        "personen": sorted(personen.values(), key=lambda p: (p["nutzer"] is None, p["voller_name"].lower())),
        "je_monat": je_monat,
        "kapazitaet": sum(kapazitaeten.values(), NULL) if kapazitaeten else None,
        "verteilung": verteilung,
    }
