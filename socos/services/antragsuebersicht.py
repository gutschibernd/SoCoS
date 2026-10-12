"""
Die Übersicht eines Förderantrags als PDF — zur eigenen Orientierung, nicht
zum Einreichen.

Eckdaten, worum es geht, die Arbeitspakete mit Zeitplan, die Kosten und was
noch offen ist. Gedacht für den Blick am Schreibtisch oder vor einem
Telefonat mit der Förderstelle: Was haben wir beantragt, wann läuft was, wo
steht das Geld.

**Gerechnet wird nichts hier**, alles kommt aus `services/foerderung.py` —
dieselben Summen, die die Seite zeigt. Eine zweite Rechnung liefe beim
nächsten Kostenfeld still auseinander, und dann stünde im PDF eine andere
Fördersumme als in der Anwendung.

**Die Textabschnitte des Antrags fehlen mit Absicht**, und das Ziel eines
Pakets wird nach ein paar Zeilen gekürzt. Die Übersicht soll auf ein, zwei
Seiten passen; wer die ganzen Texte braucht, nimmt „Projektinhalt kopieren".
"""

from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    CondPageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from socos.services import foerderung
from socos.services.ausschreibung import (
    AKZENT,
    GRUND,
    GRUND_FETT,
    LEISE,
    MARKE,
    RAND,
    TEXT,
    _Punkt,
    _schriften_anmelden,
    ascii_teil,
)
from socos.services.zeitnachweis import _signet

# Dieselben Namen wie in frontend/src/stil/farben.css — siehe ausschreibung.py.
FLAECHE_LEISE = colors.HexColor("#F3F2EC")  # --flaeche-leise
WARNUNG = colors.HexColor("#963D22")        # --warnung

RAND_SEITE = 18 * mm
# reportlab polstert den Rahmen einer Seite je Seite mit 6 pt. Die Ränder des
# Dokuments sind darum um so viel schmaler — sonst stünde der Text 6 pt
# eingerückt gegen die Haarlinie im Kopf, und Tabellen in voller Breite
# ragten über den Rahmen hinaus.
POLSTER = 6
KURZMONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
# So viele Zeichen vom Ziel eines Pakets; danach „…". Drei Zeilen in der
# Tabelle — mehr liest in einer Übersicht niemand.
ZIEL_ZEICHEN = 260


# --- Zahlen und Texte --------------------------------------------------------


def _deutsch(text: str) -> str:
    """„12,345.67" → „12.345,67"."""
    return text.replace(",", "_").replace(".", ",").replace("_", ".")


def euro(betrag) -> str:
    """Ganze Beträge ohne Cent, wie `alsEuro` in der Oberfläche."""
    betrag = Decimal(betrag)
    muster = "{:,.0f}" if betrag == betrag.to_integral_value() else "{:,.2f}"
    return f"{_deutsch(muster.format(betrag))} €"


def zahl(wert) -> str:
    """270.00 → „270", 12.50 → „12,5"."""
    text = f"{Decimal(wert):,.2f}".rstrip("0").rstrip(".")
    return _deutsch(text)


def monat(antrag, projektmonat: int, jahr=True) -> str:
    """„Mär 27" — ohne Beginn „M3"."""
    if antrag.beginn is None:
        return f"M{projektmonat}"
    kalender = foerderung.kalendermonat(antrag.beginn, projektmonat)
    kurz = KURZMONATE[int(kalender[5:]) - 1]
    return f"{kurz} {kalender[2:4]}" if jahr else kurz


def zeitraum(antrag, von: int, bis: int) -> str:
    projekt = f"M{von}" if von == bis else f"M{von}–{bis}"
    if antrag.beginn is None:
        return projekt
    kalender = monat(antrag, von) if von == bis else f"{monat(antrag, von)} – {monat(antrag, bis)}"
    return f"{kalender}<br/><font color='#565C58'>{projekt}</font>"


def gekuerzt(text: str, zeichen: int) -> str:
    """Am Wortende abgeschnitten, mit „…" — oder unverändert, wenn es passt."""
    text = " ".join(text.split())
    if len(text) <= zeichen:
        return text
    return text[:zeichen].rsplit(" ", 1)[0].rstrip(",;:.–-") + " …"


def offener_bedarf(text: str) -> list[str]:
    """Was wir noch brauchen, ohne das Erledigte — „✓ " davor heißt: ist da."""
    zeilen = (z.strip() for z in text.splitlines())
    return [z for z in zeilen if z and not z.startswith("✓")]


def _x(text) -> str:
    return escape(str(text))


# --- Stile --------------------------------------------------------------------


def _stile():
    _schriften_anmelden()

    def stil(name, **werte):
        grund = {"fontName": GRUND, "fontSize": 9, "leading": 12.5, "textColor": TEXT}
        return ParagraphStyle(name, **{**grund, **werte})

    return {
        "ueber": stil("ueber", fontSize=8.5, leading=11, textColor=LEISE),
        "titel": stil("titel", fontName=GRUND_FETT, fontSize=19, leading=23, spaceBefore=1.5 * mm),
        "meta": stil("meta", fontSize=9, leading=12, textColor=LEISE, spaceBefore=1.5 * mm),
        "kopf": stil("kopf", fontName=GRUND_FETT, fontSize=7.5, leading=9, textColor=MARKE),
        "text": stil("text", fontSize=10, leading=14.5),
        "zelle": stil("zelle"),
        "leise": stil("leise", fontSize=8, leading=11, textColor=LEISE),
        "zahl": stil("zahl", alignment=TA_RIGHT),
        "zahl_fett": stil("zahl_fett", fontName=GRUND_FETT, alignment=TA_RIGHT),
        "zahl_marke": stil("zahl_marke", fontName=GRUND_FETT, alignment=TA_RIGHT, textColor=MARKE),
        "fett": stil("fett", fontName=GRUND_FETT),
        "fett_marke": stil("fett_marke", fontName=GRUND_FETT, textColor=MARKE),
        "kopf_rechts": stil("kopf_rechts", fontName=GRUND_FETT, fontSize=7.5, leading=9, textColor=MARKE,
                            alignment=TA_RIGHT),
        "kennung": stil("kennung", fontName=GRUND_FETT, textColor=AKZENT),
        "kennwert": stil("kennwert", fontName=GRUND_FETT, fontSize=15, leading=18),
        "kennwert_marke": stil("kennwert_marke", fontName=GRUND_FETT, fontSize=15, leading=18, textColor=MARKE),
        "punkt": stil("punkt", spaceAfter=1.4 * mm),
    }


# --- Bausteine -----------------------------------------------------------------


class _Ueberschrift(Flowable):
    """Ein Abschnittskopf: Haarlinie darüber, darunter die Überschrift in Versalien."""

    def __init__(self, text):
        super().__init__()
        self.text = text.upper()

    def wrap(self, verfuegbar_b, verfuegbar_h):
        self.width, self.height = verfuegbar_b, 8 * mm
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(RAND)
        c.setLineWidth(0.6)
        c.line(0, self.height, self.width, self.height)
        c.setFillColor(MARKE)
        c.setFont(GRUND_FETT, 7.5)
        c.drawString(0, self.height - 5 * mm, self.text, charSpace=1.2)


class _Zeitplan(Flowable):
    """
    Die Pakete als Balken auf den Monaten des Antrags.

    Mit Beginn stehen Kalendermonate darüber, sonst M1, M2, … — und eine
    kupferne Linie an der Stelle von heute, wenn sie in die Laufzeit fällt.
    """

    ZEILE = 6.2 * mm
    KOPF = 5.5 * mm
    BESCHRIFTUNG = 58 * mm

    def __init__(self, antrag, pakete, anzahl, heute):
        super().__init__()
        self.antrag, self.pakete, self.anzahl, self.heute = antrag, pakete, anzahl, heute

    def wrap(self, verfuegbar_b, verfuegbar_h):
        self.width = verfuegbar_b
        self.height = self.KOPF + len(self.pakete) * self.ZEILE
        return self.width, self.height

    def _heute_stelle(self):
        beginn = self.antrag.beginn
        if beginn is None:
            return None
        import calendar

        tage = calendar.monthrange(self.heute.year, self.heute.month)[1]
        stelle = (self.heute.year * 12 + self.heute.month) - (beginn.year * 12 + beginn.month)
        stelle += (self.heute.day - 1) / tage
        return stelle if 0 <= stelle <= self.anzahl else None

    def draw(self):
        c = self.canv
        x0 = self.BESCHRIFTUNG
        spalte = (self.width - x0) / self.anzahl
        unter_kopf = self.height - self.KOPF
        # Jeder Monat beschriftet, solange Platz ist; sonst je Quartal oder Halbjahr.
        schritt = next(s for s in (1, 3, 6, 12) if spalte * s >= 9 * mm)

        c.setFont(GRUND, 6.5)
        for m in range(1, self.anzahl + 1):
            x = x0 + (m - 1) * spalte
            if self.antrag.beginn is not None:
                kalender = int(foerderung.kalendermonat(self.antrag.beginn, m)[5:])
                zeigen = m == 1 or (kalender - 1) % schritt == 0
                jahreswechsel = kalender == 1 and m > 1
                text = monat(self.antrag, m, jahr=m == 1 or kalender == 1)
            else:
                zeigen = (m - 1) % schritt == 0
                jahreswechsel = False
                text = f"M{m}"
            c.setStrokeColor(RAND)
            c.setLineWidth(0.6 if jahreswechsel else 0.25)
            c.line(x, 0, x, unter_kopf if not zeigen else self.height - 1 * mm)
            if zeigen:
                c.setFillColor(TEXT if jahreswechsel or m == 1 else LEISE)
                c.drawString(x + 1.2, unter_kopf + 1.6 * mm, text)
        c.setLineWidth(0.25)
        c.line(self.width, 0, self.width, unter_kopf)

        for i, paket in enumerate(self.pakete):
            y = unter_kopf - (i + 1) * self.ZEILE
            c.setStrokeColor(RAND)
            c.setLineWidth(0.25)
            c.line(0, y + self.ZEILE, self.width, y + self.ZEILE)
            grund = y + 2.1 * mm
            c.setFillColor(AKZENT)
            c.setFont(GRUND_FETT, 7.5)
            c.drawString(0, grund, f"AP{i + 1}")
            c.setFillColor(TEXT)
            c.setFont(GRUND, 7.5)
            platz = x0 - 9 * mm - 2 * mm
            titel = paket.titel
            while titel and c.stringWidth(titel, GRUND, 7.5) > platz:
                titel = titel[:-2].rstrip() + "…"
            c.drawString(8 * mm, grund, titel)
            c.setFillColor(MARKE)
            c.rect(
                x0 + (paket.von - 1) * spalte + 0.6,
                y + 1.4 * mm,
                (paket.bis - paket.von + 1) * spalte - 1.2,
                self.ZEILE - 2.8 * mm,
                stroke=0,
                fill=1,
            )
        c.setStrokeColor(RAND)
        c.line(0, 0, self.width, 0)

        stelle = self._heute_stelle()
        if stelle is not None:
            x = x0 + stelle * spalte
            c.setStrokeColor(AKZENT)
            c.setLineWidth(0.9)
            c.line(x, 0, x, unter_kopf)
            c.setFillColor(AKZENT)
            c.setFont(GRUND_FETT, 6)
            c.drawCentredString(x, -2.6 * mm, "heute")


def _tabelle(zeilen, breiten, stil=()):
    tabelle = Table(zeilen, colWidths=breiten, repeatRows=1)
    tabelle.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, RAND),
                *stil,
            ]
        )
    )
    return tabelle


def _abschnitt(titel, *inhalt):
    """
    Eine Überschrift steht nie allein am Seitenende: Ist weniger als ein
    Fingerbreit Platz, beginnt der Abschnitt auf der nächsten Seite.

    Kein `KeepTogether` um Überschrift und Tabelle — das schöbe die ganze
    Paketliste auf die nächste Seite und ließe die erste halb leer.
    """
    return [Spacer(0, 5 * mm), CondPageBreak(30 * mm), _Ueberschrift(titel), *inhalt]


# --- Die Teile der Seite ---------------------------------------------------------


def _kennzahlen(antrag, s, k, pakete, breite):
    programm = antrag.programm
    monate = foerderung.laufzeit(antrag)

    if programm.max_foerderung is None:
        summe_unter = "keine Obergrenze"
    elif k["zuschuss"] > programm.max_foerderung:
        summe_unter = f"<font color='#963D22'>{euro(k['zuschuss'] - programm.max_foerderung)} über der Grenze</font>"
    else:
        summe_unter = f"von höchstens {euro(programm.max_foerderung)}"

    if antrag.foerderquote is not None:
        kosten_unter = f"Förderquote {zahl(antrag.foerderquote)} %"
    elif k["eigenmittel"]:
        kosten_unter = f"Eigenmittel {euro(k['eigenmittel'])}"
    else:
        kosten_unter = "ohne Eigenmittel"

    if not monate:
        laufzeit_unter = "noch keine Pakete"
    elif antrag.beginn is not None:
        laufzeit_unter = f"{monat(antrag, 1)} – {monat(antrag, monate)}"
    else:
        laufzeit_unter = "Beginn noch offen"
    if programm.max_monate is not None and monate > programm.max_monate:
        laufzeit_unter = f"<font color='#963D22'>erlaubt sind {programm.max_monate}</font>"

    stunden_unter = (
        f"{zahl(k['stunden'])} h geplant" if foerderung.stunden_kosten_geld(antrag) else f"{zahl(k['stunden'])} h Aufwand"
    )

    felder = [
        ("Fördersumme", euro(k["zuschuss"]), summe_unter, True),
        ("Gesamtkosten", euro(k["gesamt"]), kosten_unter, False),
        ("Laufzeit", f"{monate} Monate" if monate != 1 else "1 Monat", laufzeit_unter, False),
        ("Arbeitspakete", str(len(pakete)), stunden_unter, False),
    ]
    zelle = [
        [
            Paragraph(_x(name.upper()), s["kopf"]),
            Paragraph(_x(wert), s["kennwert_marke" if marke else "kennwert"]),
            Paragraph(unter, s["leise"]),
        ]
        for name, wert, unter, marke in felder
    ]
    tabelle = Table([zelle], colWidths=[breite / 4] * 4)
    tabelle.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
                ("LINEABOVE", (0, 0), (-1, 0), 0.8, MARKE),
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, RAND),
                ("LINEBEFORE", (1, 0), (-1, 0), 0.25, RAND),
            ]
        )
    )
    return tabelle


def _paketliste(antrag, s, pakete, breite):
    geld = foerderung.stunden_kosten_geld(antrag)
    zeilen = [
        [
            "",
            Paragraph("ARBEITSPAKET", s["kopf"]),
            Paragraph("ZEITRAUM", s["kopf"]),
            Paragraph("STUNDEN", s["kopf_rechts"]),
            Paragraph("KOSTEN", s["kopf_rechts"]),
        ]
    ]
    summe_stunden, summe_kosten = Decimal("0"), Decimal("0")

    for i, paket in enumerate(pakete):
        kosten = foerderung.paketkosten(paket, antrag)
        summe_stunden += kosten["stunden"]
        summe_kosten += kosten["gesamt"]
        teile = [f"<font name='{GRUND_FETT}'>{_x(paket.titel)}</font>"]
        if paket.ziel.strip():
            teile.append(f"<font size='8.5' color='#565C58'>{_x(gekuerzt(paket.ziel, ZIEL_ZEICHEN))}</font>")
        if paket.ergebnis.strip():
            teile.append(f"<font size='8.5'><font color='#0D4E52'>Ergebnis:</font> {_x(paket.ergebnis)}</font>")
        stunden = foerderung.lebende_stunden(paket)
        if stunden:
            wer = " · ".join(f"{_x(z.name)} {zahl(z.stunden)} h" for z in stunden)
            teile.append(f"<font size='8' color='#565C58'>{wer}</font>")
        zeilen.append(
            [
                Paragraph(f"AP{i + 1}", s["kennung"]),
                Paragraph("<br/>".join(teile), s["zelle"]),
                Paragraph(zeitraum(antrag, paket.von, paket.bis), s["zelle"]),
                Paragraph(f"{zahl(kosten['stunden'])} h" if kosten["stunden"] else "—", s["zahl"]),
                Paragraph(euro(kosten["gesamt"]) if kosten["gesamt"] else "—", s["zahl"]),
            ]
        )

    zeilen.append(
        [
            "",
            Paragraph("Summe der Pakete", s["fett"]),
            "",
            Paragraph(f"{zahl(summe_stunden)} h", s["zahl_fett"]),
            Paragraph(euro(summe_kosten), s["zahl_fett"]),
        ]
    )
    feste = 11 * mm + 30 * mm + 17 * mm + 24 * mm
    tabelle = _tabelle(
        zeilen,
        [11 * mm, breite - feste, 30 * mm, 17 * mm, 24 * mm],
        [("LINEABOVE", (0, -1), (-1, -1), 0.8, MARKE), ("LINEBELOW", (0, -1), (-1, -1), 0, colors.white)],
    )
    teile = [tabelle]
    if not geld and summe_stunden:
        teile.append(Spacer(0, 2 * mm))
        teile.append(
            Paragraph("Wir sind Drittleister: Die Stunden sind unser Aufwand und stehen nicht in den Kosten.", s["leise"])
        )
    return teile


def _kostenliste(antrag, s, k, posten, pakete, breite):
    geld = foerderung.stunden_kosten_geld(antrag)
    zeilen = []

    def zeile(name, erklaerung, betrag, art=""):
        name_stil, zahl_stil = {
            "summe": ("fett", "zahl_fett"),
            "zuschuss": ("fett_marke", "zahl_marke"),
        }.get(art, ("zelle", "zahl"))
        zeilen.append(
            (art, [Paragraph(_x(name), s[name_stil]), Paragraph(erklaerung, s["leise"]), Paragraph(euro(betrag), s[zahl_stil])])
        )

    if geld and k["stunden"]:
        satz = euro(antrag.stundensatz) if antrag.stundensatz is not None else "<font color='#963D22'>Satz fehlt</font>"
        zeile("Personal", f"{zahl(k['stunden'])} h × {satz}", k["personal"])
    if k["sach"] or posten:
        zeile("Sach- und Materialkosten", f"{len(posten)} Posten", k["sach"])
    if k["pauschal"]:
        zeile("Pauschalbeträge der Pakete", "", k["pauschal"])
    if antrag.gemeinkosten is not None:
        zeile("Direkte Kosten", "", k["direkt"], "zwischen")
        zeile("Gemeinkosten", f"{zahl(antrag.gemeinkosten)} % der direkten Kosten", k["gemeinkosten"])
    zeile("Gesamtkosten", "", k["gesamt"], "summe")
    if antrag.foerderquote is not None:
        zeile("Zuschuss", f"Förderquote {zahl(antrag.foerderquote)} %", k["zuschuss"], "zuschuss")
        zeile("Eigenmittel", "", k["eigenmittel"])
    else:
        zeile("Beantragte Fördersumme", "", k["zuschuss"], "zuschuss")

    stil = []
    for nr, (art, _) in enumerate(zeilen):
        if art in ("summe", "zwischen"):
            stil.append(("LINEABOVE", (0, nr), (-1, nr), 0.8 if art == "summe" else 0.5, MARKE if art == "summe" else TEXT))
        if art == "zuschuss":
            stil.append(("BACKGROUND", (0, nr), (-1, nr), FLAECHE_LEISE))
            stil.append(("LEFTPADDING", (0, nr), (0, nr), 2 * mm))
            stil.append(("RIGHTPADDING", (-1, nr), (-1, nr), 2 * mm))

    teile = [_tabelle([z for _, z in zeilen], [58 * mm, breite - 58 * mm - 30 * mm, 30 * mm], stil)]

    if posten:
        nummer = {p.id: i + 1 for i, p in enumerate(pakete)}
        teile.append(Spacer(0, 4 * mm))
        teile.append(Paragraph("POSTEN", s["kopf"]))
        teile.append(Spacer(0, 1 * mm))
        teile.append(
            _tabelle(
                [
                    [
                        Paragraph(_x(p.bezeichnung), s["zelle"]),
                        Paragraph(f"AP{nummer[p.paket_id]}" if p.paket_id in nummer else "—", s["leise"]),
                        Paragraph(euro(p.betrag), s["zahl"]),
                    ]
                    for p in posten
                ],
                [breite - 16 * mm - 30 * mm, 16 * mm, 30 * mm],
            )
        )

    personen = _stunden_je_person(pakete)
    if personen:
        teile.append(Spacer(0, 4 * mm))
        teile.append(Paragraph("STUNDEN JE PERSON", s["kopf"]))
        teile.append(Spacer(0, 1 * mm))
        gesamt = sum((h for _, h in personen), Decimal("0")) or Decimal("1")
        teile.append(
            _tabelle(
                [
                    [
                        Paragraph(_x(name), s["zelle"]),
                        Paragraph(f"{(h * 100 / gesamt):.0f} %", s["leise"]),
                        Paragraph(f"{zahl(h)} h", s["zahl"]),
                    ]
                    for name, h in personen
                ],
                [breite - 16 * mm - 30 * mm, 16 * mm, 30 * mm],
            )
        )
    return teile


def _stunden_je_person(pakete):
    """Name und Stunden je Person über alle Pakete, die meisten zuerst."""
    summen, namen = {}, {}
    for paket in pakete:
        for z in foerderung.lebende_stunden(paket):
            schluessel = foerderung.personenschluessel(z)
            summen[schluessel] = summen.get(schluessel, Decimal("0")) + z.stunden
            namen[schluessel] = z.nutzer.name if z.nutzer_id else z.person.strip()
    return sorted(((namen[k], h) for k, h in summen.items()), key=lambda e: (-e[1], e[0].lower()))


def _offen(antrag, s):
    """Was der Reife fehlt und was wir noch brauchen — oder ein Satz, dass nichts fehlt."""
    def punkt(marke, text):
        return _Punkt(marke, Paragraph(text, s["punkt"]), einzug=5 * mm, groesse=2 * mm)

    # Volles Kupfer: fehlt dem Antrag selbst. Leeres Quadrat: noch zu besorgen.
    teile = [
        punkt("voll", f"<font name='{GRUND_FETT}'>{_x(p['text'])}</font> — {_x(p['hinweis'])}")
        for p in foerderung.reife(antrag)
        if not p["erfuellt"]
    ]
    teile += [punkt("leer", _x(text)) for text in offener_bedarf(antrag.datenbedarf)]
    if not teile:
        teile.append(Paragraph("Nichts offen — die Reife ist vollständig, und alles Nötige ist da.", s["text"]))
    return teile


# --- Das Dokument ---------------------------------------------------------------


def _kopf_und_fuss(leinwand, dokument, antrag):
    leinwand.saveState()
    breite, hoehe = A4
    _signet(leinwand, RAND_SEITE, hoehe - 13.4 * mm, 5.4 * mm)
    leinwand.setFillColor(MARKE)
    leinwand.setFont(GRUND_FETT, 10)
    leinwand.drawString(RAND_SEITE + 7.5 * mm, hoehe - 12 * mm, "SoCoS")
    leinwand.setFillColor(LEISE)
    leinwand.setFont(GRUND, 8)
    leinwand.drawRightString(breite - RAND_SEITE, hoehe - 12 * mm, "Antragsübersicht · nur zur Orientierung")
    leinwand.setStrokeColor(RAND)
    leinwand.setLineWidth(0.5)
    leinwand.line(RAND_SEITE, hoehe - 15.5 * mm, breite - RAND_SEITE, hoehe - 15.5 * mm)

    leinwand.drawString(RAND_SEITE, 10 * mm, f"Stand {timezone.localtime():%d.%m.%Y, %H:%M}")
    leinwand.drawRightString(breite - RAND_SEITE, 10 * mm, f"Seite {dokument.page}")
    leinwand.restoreState()


def erzeugen(antrag, heute=None):
    """Baut die Übersicht und gibt die Bytes zurück."""
    s = _stile()
    heute = heute or timezone.localdate()
    programm = antrag.programm
    geber = programm.geber
    pakete = sorted(foerderung.lebende_pakete(antrag), key=lambda p: (p.reihenfolge, p.id))
    posten = sorted(foerderung.lebende_posten(antrag), key=lambda p: (p.reihenfolge, p.id))
    k = foerderung.kosten(antrag)
    breite = A4[0] - 2 * RAND_SEITE

    meta = [antrag.get_stand_display().capitalize()]
    meta.append(f"Förderwerber: {antrag.foerderwerber}" if antrag.foerderwerber.strip() else "Förderwerber noch offen")
    if not foerderung.stunden_kosten_geld(antrag):
        meta.append("wir als Drittleister")
    if antrag.beginn is not None:
        meta.append(f"Beginn {antrag.beginn:%d.%m.%Y}")

    inhalt = [
        Paragraph(
            _x(f"{geber.kurz or geber.name} · {programm.name} · Antrag {antrag.nummer}"),
            s["ueber"],
        ),
        Paragraph(_x(antrag.titel or "(ohne Titel)"), s["titel"]),
        Paragraph(_x(" · ".join(meta)), s["meta"]),
        Spacer(0, 5 * mm),
        _kennzahlen(antrag, s, k, pakete, breite),
    ]

    beschreibung = antrag.beschreibung.strip()
    inhalt += _abschnitt(
        "Worum es geht",
        Paragraph(_x(beschreibung) if beschreibung else "Noch keine Beschreibung.", s["text" if beschreibung else "leise"]),
    )

    if pakete:
        anzahl = max(foerderung.laufzeit(antrag), 1)
        inhalt += _abschnitt("Zeitplan", _Zeitplan(antrag, pakete, anzahl, heute))
        inhalt.append(Spacer(0, 2 * mm))
        inhalt += _abschnitt("Arbeitspakete", *_paketliste(antrag, s, pakete, breite))
    else:
        inhalt += _abschnitt("Arbeitspakete", Paragraph("Noch kein Arbeitspaket.", s["leise"]))

    inhalt += _abschnitt("Kosten", *_kostenliste(antrag, s, k, posten, pakete, breite))
    inhalt += _abschnitt("Noch offen", *_offen(antrag, s))

    puffer = BytesIO()
    dokument = SimpleDocTemplate(
        puffer,
        pagesize=A4,
        leftMargin=RAND_SEITE - POLSTER,
        rightMargin=RAND_SEITE - POLSTER,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title=f"Antragsübersicht · {antrag.titel}",
        author="SoCoS",
    )
    zeichnen = lambda c, d: _kopf_und_fuss(c, d, antrag)  # noqa: E731
    dokument.build(inhalt, onFirstPage=zeichnen, onLaterPages=zeichnen)
    return puffer.getvalue()


def dateiname(antrag):
    return f"Antragsuebersicht_{ascii_teil(antrag.titel) or 'Antrag'}.pdf"
