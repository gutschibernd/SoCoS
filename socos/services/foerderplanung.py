"""
Die Förderplanung als PDF: alle Anträge auf einer Zeitachse, auf **genau
einer A4-Seite quer**, wie die Folie „Förderübersicht", von der sie kommt.

Oben steht der Fokus, darunter die weiteren Möglichkeiten, unten was vorbei
ist (abgelehnt oder nie eingereicht). Rechts stehen Förderung, Quote und die
Gesamtkosten, die man ausgeben und abrechnen muss, damit die Förderung fließt.

**Eine Seite, immer.** Eine Folie, die auf Seite zwei weitergeht, legt
niemand mehr nebeneinander auf den Tisch. Wird es eng, rücken die Zeilen
zusammen, und die Schrift schrumpft mit ihnen. Die Breite bleibt dabei
gleich, damit die Achse so lesbar bleibt, wie es geht.

**Die Regeln stehen ein zweites Mal in `frontend/src/basis/foerderplanung.ts`**
(Gruppen, Balken, Name, Quote). Die Seite rechnet im Browser, weil sie beim
Ziehen sofort zeichnen muss. Das PDF rechnet hier, damit es ein gewöhnlicher
Link bleibt, der am Handy wie am Schreibtisch im Download-Ordner landet.
Beide Seiten haben Tests mit denselben Fällen. Wer eine Regel ändert, ändert
sie an beiden Stellen.
"""

import calendar
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from socos.services import foerderung
from socos.services.antragsuebersicht import euro
from socos.services.ausschreibung import (
    AKZENT,
    GRUND,
    GRUND_FETT,
    LEISE,
    MARKE,
    MARKE_HELL,
    RAND,
    TEXT,
    _schriften_anmelden,
)
from socos.services.zeitnachweis import _signet

# Dieselben Namen wie in frontend/src/stil/farben.css (hell).
AKZENT_HELL = colors.HexColor("#F8EDE5")    # --akzent-hell
MARKE_RAND = colors.HexColor("#8FB6B4")     # --marke-rand
WARTEND = colors.HexColor("#5C4A70")        # --wartend
WARTEND_HELL = colors.HexColor("#EEE9F2")   # --wartend-hell
RUHEND = colors.HexColor("#6B6F6B")         # --ruhend
RUHEND_HELL = colors.HexColor("#F3F2EC")    # --ruhend-hell
RAND_STARK = colors.HexColor("#B0AA99")     # --rand-stark
GUT = colors.HexColor("#3D6B44")            # --gut
WARNUNG = colors.HexColor("#963D22")        # --warnung
FLAECHE_LEISE = colors.HexColor("#F3F2EC")  # --flaeche-leise
SEHR_LEISE = colors.HexColor("#69706B")     # --text-sehr-leise

VORBEI = {"abgelehnt", "verfallen"}
MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

SEITE = landscape(A4)
RAND_SEITE = 12 * mm
ETIKETT = 74 * mm
RECHTS = 40 * mm
# Höhen bei Maßstab 1. Weniger Zeilen werden nicht beliebig aufgeblasen,
# sonst stünden zwei Anträge in daumendicken Balken da.
ZEILE = 10 * mm
GRUPPE = 8 * mm
ACHSE = 6 * mm
GROESSTER_MASSSTAB = Decimal("1.3")


# --- Die Regeln (wie basis/foerderplanung.ts) ----------------------------------


def foerdername(programm) -> str:
    """„aws" + „Preseed" → „aws Preseed", ohne das Kürzel zu doppeln (verglichen wird das erste Wort)."""
    geber = programm.geber
    vorne = (geber.kurz or geber.name) if geber else ""
    erstes = vorne.split()[0].lower() if vorne.split() else ""
    if not vorne or programm.name.lower().startswith(erstes):
        return programm.name
    return f"{vorne} {programm.name}"


def _nach_datum(tag):
    """Früher zuerst, ohne Datum zuletzt."""
    return (tag is None, tag or date.min)


def _anfang(a):
    tage = [t for t in (a.schreiben_ab, a.einreichung, a.entscheidung, a.beginn) if t]
    return min(tage) if tage else None


def gruppen(antraege):
    """Fokus nach Priorität, weitere nach Termin, Vorbei das Jüngste zuerst."""
    offen = [a for a in antraege if a.stand not in VORBEI]
    fokus = sorted(
        (a for a in offen if a.prioritaet is not None),
        key=lambda a: (a.prioritaet, *_nach_datum(a.einreichung), a.id),
    )
    weitere = sorted(
        (a for a in offen if a.prioritaet is None),
        key=lambda a: (*_nach_datum(_anfang(a)), foerdername(a.programm).casefold()),
    )

    def ende(a):
        return a.entscheidung or a.einreichung or _anfang(a)

    vorbei = [a for a in antraege if a.stand in VORBEI]
    # Das Jüngste zuerst, ohne Datum zuletzt: zweimal stabil sortiert.
    vorbei.sort(key=lambda a: foerdername(a.programm).casefold())
    vorbei.sort(key=lambda a: ende(a) or date.min, reverse=True)
    vorbei.sort(key=lambda a: ende(a) is None)
    return fokus, weitere, vorbei


def _monate_dazu(tag: date, monate: int) -> date:
    stelle = tag.year * 12 + tag.month - 1 + monate
    jahr, monat = divmod(stelle, 12)
    monat += 1
    return date(jahr, monat, min(tag.day, calendar.monthrange(jahr, monat)[1]))


def balken(a):
    """[(art, von, bis, angenommen)] — ein Abschnitt, dem ein Ende fehlt, hat keinen."""
    liste = []
    if a.schreiben_ab and a.einreichung:
        liste.append(("schreiben", a.schreiben_ab, a.einreichung, False))
    if a.einreichung and a.entscheidung:
        liste.append(("pruefung", a.einreichung, a.entscheidung, False))
    if a.beginn:
        bis = a.ende or _monate_dazu(a.beginn, a.programm.max_monate or 12) - timedelta(days=1)
        liste.append(("laufzeit", a.beginn, bis, a.ende is None))
    return liste


def geld(a):
    """
    (Förderung, „bis", Quote, Gesamtkosten) — oder None, wenn es nichts zu zeigen gibt.

    Mit Kalkulation kommen die Zahlen aus `foerderung.kosten`. Ohne Quote ist
    dort die ganze Summe Zuschuss, hier steht dann 100 %. Ohne Kalkulation
    steht die Grenze des Programms da und, mit Quote, Grenze ÷ Quote — auf
    ganze Euro, denn es ist eine Größenordnung, keine Kalkulation.
    """
    k = foerderung.kosten(a)
    if k["zuschuss"] > 0:
        return k["zuschuss"], False, a.foerderquote if a.foerderquote is not None else Decimal(100), k["gesamt"]
    grenze = a.programm.max_foerderung
    if not grenze:
        return None
    quote = a.foerderquote if a.foerderquote else None
    gesamt = (grenze * 100 / quote).quantize(Decimal("1"), ROUND_HALF_UP) if quote else None
    return grenze, True, quote, gesamt


def prozent(wert) -> str:
    text = f"{Decimal(wert):.2f}".rstrip("0").rstrip(".")
    return f"{text.replace('.', ',')} %"


# --- Zeichnen --------------------------------------------------------------------


def _gekuerzt(text, schrift, groesse, breite):
    if stringWidth(text, schrift, groesse) <= breite:
        return text
    while text and stringWidth(text + " …", schrift, groesse) > breite:
        text = text[:-1]
    return text.rstrip() + " …"


class _Blatt:
    """Die eine Seite. `m` ist der Maßstab der Höhen und Schriften."""

    def __init__(self, c, achse_von, achse_bis, heute, m):
        self.c, self.von, self.bis, self.heute, self.m = c, achse_von, achse_bis, heute, m
        self.links = RAND_SEITE
        self.spur_x = RAND_SEITE + ETIKETT
        self.spur_b = SEITE[0] - 2 * RAND_SEITE - ETIKETT - RECHTS
        self.rechts_x = SEITE[0] - RAND_SEITE
        self.tage = (achse_bis - achse_von).days + 1

    def x(self, tag: date, ende=False) -> float:
        tage = (tag - self.von).days + (1 if ende else 0)
        return self.spur_x + self.spur_b * tage / self.tage

    def monatslinien(self, oben, unten):
        c = self.c
        c.setStrokeColor(FLAECHE_LEISE)
        c.setLineWidth(0.5)
        tag = self.von
        while tag <= self.bis:
            c.line(self.x(tag), oben, self.x(tag), unten)
            tag = _monate_dazu(tag, 1)

    def achse(self, y):
        """Monatsnamen über der Spur; bei vielen Monaten nur jeder zweite oder dritte."""
        c, m = self.c, self.m
        monate = []
        tag = self.von
        while tag <= self.bis:
            monate.append(tag)
            tag = _monate_dazu(tag, 1)
        schritt = 1 if len(monate) <= 18 else 2 if len(monate) <= 30 else 3
        groesse = 6.5 * min(m, 1.1)
        c.setFont(GRUND, groesse)
        c.setFillColor(LEISE)
        # Am Kalender ausgerichtet (Jän, Apr, Jul, Okt), damit der Januar mit
        # dem Jahr immer beschriftet ist und kein Nachbar ihm auf die Zehen steigt.
        erster = True
        for tag in monate:
            if (tag.month - 1) % schritt:
                continue
            name = MONATE[tag.month - 1] + (f" {tag:%y}" if tag.month == 1 or erster else "")
            c.drawString(self.x(tag) + 1.2, y, name)
            erster = False
        c.setFont(GRUND_FETT, groesse)
        c.setFillColor(MARKE)
        c.drawString(self.links, y, "FÖRDERUNG")
        c.drawRightString(self.rechts_x, y, "FÖRDERUNG €")

    def heute_linie(self, oben, unten):
        if not (self.von <= self.heute <= self.bis):
            return
        c = self.c
        x = self.x(self.heute) + self.spur_b / self.tage / 2
        c.setStrokeColor(AKZENT)
        c.setLineWidth(0.9)
        c.line(x, oben, x, unten)
        c.setFillColor(AKZENT)
        # Unter der letzten Zeile, nicht oben — dort stünde es auf den Monatsnamen.
        c.setFont(GRUND_FETT, 6 * min(self.m, 1.1))
        c.drawCentredString(x, unten - 7, "heute")

    def gruppe(self, y, titel, anzahl, zusatz=""):
        """Kopf einer Gruppe; `y` ist die Oberkante. Gibt die Unterkante zurück."""
        c, h = self.c, GRUPPE * self.m
        c.setStrokeColor(RAND)
        c.setLineWidth(0.6)
        c.line(self.links, y, self.rechts_x, y)
        groesse = 7.5 * min(self.m, 1.1)
        grund = y - h / 2 - groesse * 0.35
        c.setFillColor(MARKE)
        c.setFont(GRUND_FETT, groesse)
        text = f"{titel.upper()}  {anzahl}"
        c.drawString(self.links, grund, text, charSpace=0.8)
        if zusatz:
            c.setFillColor(LEISE)
            c.setFont(GRUND, groesse)
            c.drawString(self.links + stringWidth(text, GRUND_FETT, groesse) + len(text) * 0.8 + 6, grund, zusatz)
        return y - h

    def zeile(self, y, a, platz=None):
        """Eine Förderung; `y` ist die Oberkante. Gibt die Unterkante zurück."""
        c, m = self.c, self.m
        h = ZEILE * m
        mitte = y - h / 2
        schrift = min(m, 1.15)

        # Links: Name, darunter Vermerk oder Titel.
        x = self.links
        gross, klein = 8.5 * schrift, 6.5 * schrift
        if platz is not None:
            r = gross * 0.62
            c.setFillColor(AKZENT)
            c.circle(x + r, mitte + klein * 0.55, r, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont(GRUND_FETT, gross * 0.8)
            c.drawCentredString(x + r, mitte + klein * 0.55 - gross * 0.28, str(platz))
            x += 2 * r + 3
        breite = ETIKETT - (x - self.links) - 6
        c.setFillColor(TEXT)
        c.setFont(GRUND_FETT, gross)
        c.drawString(x, mitte + 0.5, _gekuerzt(foerdername(a.programm), GRUND_FETT, gross, breite))
        c.setFillColor(SEHR_LEISE)
        c.setFont(GRUND, klein)
        c.drawString(x, mitte - klein - 1, _gekuerzt(a.vermerk or a.titel, GRUND, klein, breite))

        # Die Spur.
        vorbei = a.stand in VORBEI
        for art, von, bis, angenommen in sorted(balken(a), key=lambda b: b[0] != "laufzeit"):
            dick = h * (0.56 if art == "laufzeit" else 0.34)
            x0, x1 = self.x(max(von, self.von)), self.x(min(bis, self.bis), ende=True)
            if vorbei:
                fuellung, kante = RUHEND_HELL, RAND_STARK
            elif art == "schreiben":
                fuellung, kante = AKZENT_HELL, AKZENT
            elif art == "pruefung":
                fuellung, kante = WARTEND_HELL, WARTEND
            elif a.stand == "bewilligt" and not angenommen:
                fuellung, kante = MARKE, MARKE
            else:
                fuellung, kante = (None if angenommen else MARKE_HELL), MARKE_RAND
            c.saveState()
            c.setLineWidth(0.6)
            c.setStrokeColor(kante)
            if angenommen:
                c.setDash(2, 1.5)
            if fuellung is not None:
                c.setFillColor(fuellung)
            c.roundRect(x0, mitte - dick / 2, max(x1 - x0, 1), dick, min(2.2, dick / 2),
                        stroke=1, fill=1 if fuellung is not None else 0)
            c.restoreState()

        r = min(3.4, h * 0.2)
        if a.einreichung and self.von <= a.einreichung <= self.bis:
            farbe = RUHEND if a.stand == "verfallen" else WARNUNG if a.stand == "entwurf" else WARTEND
            mx = self.x(a.einreichung) + self.spur_b / self.tage / 2
            c.setFillColor(colors.white)
            c.setStrokeColor(farbe)
            c.setLineWidth(0.9)
            c.circle(mx, mitte, r, stroke=1, fill=1)
            c.setFillColor(farbe)
            c.setFont(GRUND_FETT, r * 1.7)
            c.drawCentredString(mx, mitte - r * 0.6, "!")
        if a.entscheidung and self.von <= a.entscheidung <= self.bis:
            farbe = {"bewilligt": GUT, "abgelehnt": WARNUNG, "verfallen": RUHEND}.get(a.stand, WARTEND)
            mx = self.x(a.entscheidung) + self.spur_b / self.tage / 2
            c.setFillColor(farbe)
            p = c.beginPath()
            p.moveTo(mx, mitte + r)
            p.lineTo(mx + r, mitte)
            p.lineTo(mx, mitte - r)
            p.lineTo(mx - r, mitte)
            p.close()
            c.drawPath(p, stroke=0, fill=1)

        # Rechts: Förderung, darunter Quote und Gesamtkosten, darunter der Stand.
        g = geld(a)
        zeilen = []
        if g:
            foerderung_, bis, quote, gesamt = g
            zeilen.append((("bis " if bis else "") + euro(foerderung_), GRUND if bis else GRUND_FETT,
                           LEISE if bis else TEXT, 8 * schrift))
            if quote is not None:
                text = prozent(quote) + (f" von {euro(gesamt)}" if gesamt is not None else "")
                zeilen.append((text, GRUND, SEHR_LEISE, 6.3 * schrift))
        zeilen.append((a.get_stand_display(), GRUND, LEISE, 6.3 * schrift))
        hoehe = sum(z[3] * 1.15 for z in zeilen)
        grund = mitte + hoehe / 2
        for text, schriftart, farbe, groesse in zeilen:
            grund -= groesse * 1.15
            c.setFillColor(farbe)
            c.setFont(schriftart, groesse)
            c.drawRightString(self.rechts_x, grund + groesse * 0.2, text)

        c.setStrokeColor(FLAECHE_LEISE)
        c.setLineWidth(0.4)
        c.line(self.links, y - h, self.rechts_x, y - h)
        return y - h


def _legende(c, x, y):
    """Was Flächen und Zeichen bedeuten — wie in der Anwendung, als eine Zeile."""
    c.setFont(GRUND, 7)
    for art, text in (("schreiben", "Antrag schreiben"), ("!", "Einreichung"), ("pruefung", "Prüfung"),
                      ("raute", "Entscheidung"), ("laufzeit", "Laufzeit"), ("angenommen", "Laufzeit angenommen")):
        c.saveState()
        c.setLineWidth(0.6)
        if art == "!":
            c.setStrokeColor(WARNUNG)
            c.setFillColor(colors.white)
            c.circle(x + 3, y + 2.5, 3, stroke=1, fill=1)
            c.setFillColor(WARNUNG)
            c.setFont(GRUND_FETT, 5)
            c.drawCentredString(x + 3, y + 0.8, "!")
            breite = 6
        elif art == "raute":
            c.setFillColor(WARTEND)
            p = c.beginPath()
            p.moveTo(x + 3, y + 5.5)
            p.lineTo(x + 6, y + 2.5)
            p.lineTo(x + 3, y - 0.5)
            p.lineTo(x, y + 2.5)
            p.close()
            c.drawPath(p, stroke=0, fill=1)
            breite = 6
        else:
            fuellung, kante = {
                "schreiben": (AKZENT_HELL, AKZENT), "pruefung": (WARTEND_HELL, WARTEND),
                "laufzeit": (MARKE_HELL, MARKE_RAND), "angenommen": (None, MARKE_RAND),
            }[art]
            c.setStrokeColor(kante)
            if fuellung is None:
                c.setDash(2, 1.5)
            else:
                c.setFillColor(fuellung)
            c.roundRect(x, y - 0.5, 14, 6, 1.5, stroke=1, fill=1 if fuellung is not None else 0)
            breite = 14
        c.restoreState()
        c.setFillColor(LEISE)
        c.setFont(GRUND, 7)
        c.drawString(x + breite + 3, y + 0.5, text)
        x += breite + 3 + stringWidth(text, GRUND, 7) + 12


def _achse(antraege, heute):
    tage = [heute]
    for a in antraege:
        tage += [t for t in (a.schreiben_ab, a.einreichung, a.entscheidung) if t]
        tage += [b[2] for b in balken(a)]
        tage += [b[1] for b in balken(a)]
    von = min(tage).replace(day=1)
    letzter = max(tage)
    if len(tage) == 1:
        letzter = _monate_dazu(heute.replace(day=1), 5)
    bis = letzter.replace(day=calendar.monthrange(letzter.year, letzter.month)[1])
    return von, bis


def erzeugen(antraege, heute=None) -> bytes:
    """Baut die Seite und gibt die Bytes zurück. `antraege` sind die lebenden Anträge."""
    _schriften_anmelden()
    heute = heute or timezone.localdate()
    antraege = list(antraege)
    fokus, weitere, vorbei = gruppen(antraege)
    teile = [(t, z, g) for t, z, g in (
        ("Fokus", "gereiht nach Priorität", fokus),
        ("Weitere Möglichkeiten", "", weitere),
        ("Vorbei", "abgelehnt oder nicht eingereicht", vorbei),
    ) if g]

    breite, hoehe = SEITE
    oben = hoehe - 34 * mm
    unten = 14 * mm
    noetig = ACHSE + sum(GRUPPE + len(g) * ZEILE for _, _, g in teile)
    m = min(float(GROESSTER_MASSSTAB), (oben - unten - ACHSE) / max(noetig - ACHSE, 1))
    achse_von, achse_bis = _achse(antraege, heute)

    puffer = BytesIO()
    c = canvas.Canvas(puffer, pagesize=SEITE)
    c.setTitle("Förderplanung")
    c.setAuthor("SoCoS")

    # Kopf und Fuß wie bei den übrigen PDFs.
    _signet(c, RAND_SEITE, hoehe - 13.4 * mm, 5.4 * mm)
    c.setFillColor(MARKE)
    c.setFont(GRUND_FETT, 10)
    c.drawString(RAND_SEITE + 7.5 * mm, hoehe - 12 * mm, "SoCoS")
    c.setFillColor(LEISE)
    c.setFont(GRUND, 8)
    c.drawRightString(breite - RAND_SEITE, hoehe - 12 * mm, "Förderplanung · nur zur Orientierung")
    c.setStrokeColor(RAND)
    c.setLineWidth(0.5)
    c.line(RAND_SEITE, hoehe - 15.5 * mm, breite - RAND_SEITE, hoehe - 15.5 * mm)
    c.drawString(RAND_SEITE, 7 * mm, f"Stand {timezone.localtime():%d.%m.%Y, %H:%M}")
    c.setFillColor(TEXT)
    c.setFont(GRUND_FETT, 16)
    c.drawString(RAND_SEITE, hoehe - 24 * mm, "Förderplanung")
    _legende(c, RAND_SEITE + 48 * mm, hoehe - 24 * mm)

    blatt = _Blatt(c, achse_von, achse_bis, heute, m)
    y = oben
    if not teile:
        c.setFillColor(LEISE)
        c.setFont(GRUND, 10)
        c.drawString(RAND_SEITE, y - 10 * mm, "Noch kein Antrag in der Planung.")
    else:
        blatt.monatslinien(y - ACHSE, y - ACHSE - (noetig - ACHSE) * m)
        blatt.achse(y - ACHSE + 1.8 * mm)
        y -= ACHSE
        anfang = y
        for titel, zusatz, liste in teile:
            y = blatt.gruppe(y, titel, len(liste), zusatz)
            for platz, a in enumerate(liste, start=1):
                y = blatt.zeile(y, a, platz if titel == "Fokus" else None)
        blatt.heute_linie(anfang, y)

    c.showPage()
    c.save()
    return puffer.getvalue()


def dateiname(heute=None) -> str:
    heute = heute or timezone.localdate()
    return f"Foerderplanung_{heute:%Y-%m-%d}.pdf"
