"""
Das Lean Model Canvas eines Vorhabens als PDF — **eine** Seite A4 quer.

Den Business Plan Lite gibt es hier nicht als PDF: Er wird im Dokument
geschrieben, das abgegeben wird, und SoCoS führt nur seinen Stand.

Gezeichnet wird von Hand auf die Seite und nicht mit einer reportlab-Tabelle:
Die Leinwand hat Felder, die über zwei Zeilen gehen, und eine Tabelle mit
verbundenen Zellen rechnet deren Höhe nach dem Inhalt der ersten Zeile. Ein
volles Feld schöbe dann die ganze Leinwand über den Seitenrand, statt in
seinem Kasten zu bleiben.

**Was nicht in seinen Kasten passt, wird kleiner gesetzt — bis 6,5 pt.** Reicht
auch das nicht, steht am Ende des Feldes, wie viele Punkte fehlen. Ein Feld,
das still abgeschnitten wird, sähe vollständig aus.
"""

from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from socos.models import Canvasfeld
from socos.services.zeitnachweis import LEISE, MARKE, RAND, TEXT, _signet

# Die Hervorhebung des Nutzenversprechens — derselbe Ton wie `--akzent-hell`
# in farben.css. Ein PDF liest kein CSS; derselbe Name, damit man ihn findet.
AKZENT = colors.HexColor("#A2552C")
AKZENT_HELL = colors.HexColor("#F8EDE5")

# Die Anordnung — dieselbe wie `.leinwand` in bausteine.css: zehn Spalten,
# zwei hohe Zeilen und eine flache. (Spalte, Zeile, Breite, Höhe) in Rasterzellen.
ANORDNUNG = {
    Canvasfeld.PROBLEM: (0, 0, 2, 2),
    Canvasfeld.LOESUNG: (2, 0, 2, 1),
    Canvasfeld.KENNZAHLEN: (2, 1, 2, 1),
    Canvasfeld.NUTZEN: (4, 0, 2, 2),
    Canvasfeld.VORTEIL: (6, 0, 2, 1),
    Canvasfeld.KANAELE: (6, 1, 2, 1),
    Canvasfeld.KUNDEN: (8, 0, 2, 2),
    Canvasfeld.KOSTEN: (0, 2, 5, 1),
    Canvasfeld.EINNAHMEN: (5, 2, 5, 1),
}

RAND_SEITE = 14 * mm
POLSTER = 3 * mm
GROESSEN = (9, 8.5, 8, 7.5, 7, 6.5)


def _stil(groesse):
    return ParagraphStyle(
        f"punkt-{groesse}", fontName="Helvetica", fontSize=groesse,
        leading=groesse * 1.3, textColor=TEXT,
        leftIndent=3.2 * mm, bulletIndent=0, spaceAfter=groesse * 0.45,
    )


def _absaetze(texte, groesse):
    stil = _stil(groesse)
    return [
        Paragraph(escape(t).replace("\n", "<br/>"), stil, bulletText="–")
        for t in texte
    ]


def _feld(leinwand, x, y, breite, hoehe, nummer, titel, texte, hervorheben):
    """Ein Kasten: Nummer und Name oben, die Punkte darunter. `y` ist die Unterkante."""
    if hervorheben:
        leinwand.setFillColor(AKZENT_HELL)
        leinwand.rect(x, y, breite, hoehe, stroke=0, fill=1)
    leinwand.setStrokeColor(RAND)
    leinwand.setLineWidth(0.6)
    leinwand.rect(x, y, breite, hoehe, stroke=1, fill=0)

    oben = y + hoehe - POLSTER - 8
    leinwand.setFont("Courier", 8)
    leinwand.setFillColor(AKZENT)
    leinwand.drawString(x + POLSTER, oben, str(nummer))
    leinwand.setFont("Helvetica-Bold", 9.5)
    leinwand.setFillColor(TEXT)
    leinwand.drawString(x + POLSTER + 4.5 * mm, oben, titel)

    innen_breite = breite - 2 * POLSTER
    platz = oben - 2.5 * mm - (y + POLSTER)
    if not texte:
        return oben - 2.5 * mm

    for groesse in GROESSEN:
        absaetze = _absaetze(texte, groesse)
        hoehen = [a.wrap(innen_breite, platz)[1] + a.style.spaceAfter for a in absaetze]
        if sum(hoehen) <= platz:
            break

    # Bei der kleinsten Größe so viele, wie Platz haben — und der Rest wird
    # genannt, nicht verschwiegen.
    rest = len(absaetze)
    hinweis_hoehe = 9  # Platz für die Zeile „… und n weitere“
    cursor = oben - 2.5 * mm
    for i, (absatz, h) in enumerate(zip(absaetze, hoehen)):
        braucht_hinweis = i < len(absaetze) - 1
        if cursor - h < y + POLSTER + (hinweis_hoehe if braucht_hinweis else 0):
            break
        absatz.drawOn(leinwand, x + POLSTER, cursor - h + absatz.style.spaceAfter)
        cursor -= h
        rest -= 1
    if rest:
        leinwand.setFont("Helvetica-Oblique", 7)
        leinwand.setFillColor(LEISE)
        leinwand.drawString(
            x + POLSTER, y + POLSTER,
            f"… und {rest} weitere{'r' if rest == 1 else ''} Punkt{'' if rest == 1 else 'e'} — siehe SoCoS",
        )
        return y + POLSTER
    return cursor


def erzeugen(vorhaben):
    """Baut das PDF und gibt die Bytes zurück."""
    puffer = BytesIO()
    breite, hoehe = landscape(A4)
    leinwand = canvas.Canvas(puffer, pagesize=(breite, hoehe))
    leinwand.setTitle(f"Lean Model Canvas · {vorhaben.titel}")
    leinwand.setAuthor("Sopharmis")

    # Kopf: Signet, Marke, dann Workshop und Vorhaben.
    _signet(leinwand, RAND_SEITE, hoehe - 13.4 * mm, 5.4 * mm)
    leinwand.setFillColor(MARKE)
    leinwand.setFont("Helvetica-Bold", 10)
    leinwand.drawString(RAND_SEITE + 7.5 * mm, hoehe - 12 * mm, "Sopharmis")
    leinwand.setFillColor(LEISE)
    leinwand.setFont("Helvetica", 8)
    leinwand.drawString(RAND_SEITE + 27.5 * mm, hoehe - 12 * mm, "SPG Academy · Lean Model Canvas")

    leinwand.setFillColor(TEXT)
    leinwand.setFont("Helvetica-Bold", 15)
    leinwand.drawString(RAND_SEITE, hoehe - 24 * mm, vorhaben.titel)

    punkte = {}
    for p in vorhaben.canvaspunkte.filter(geloescht_am__isnull=True).order_by("reihenfolge", "id"):
        punkte.setdefault(p.feld, []).append(p.text)
    personas = list(vorhaben.personas.filter(geloescht_am__isnull=True).order_by("reihenfolge", "id"))
    # Im Feld selbst steht je Persona eine Zeile; der ganze Steckbrief folgt
    # auf der zweiten Seite. Eine Leinwand mit drei Steckbriefen im Feld
    # Customer Segments hätte für die Punkte keinen Platz mehr.
    punkte.setdefault(Canvasfeld.KUNDEN, []).extend(f"Persona: {persona_kurz(p)}" for p in personas)

    # Das Raster: zwei hohe Zeilen oben, eine flachere unten. Darunter die
    # Zeile „Product | Market" — deshalb beginnt das Raster höher.
    links, rechts = RAND_SEITE, breite - RAND_SEITE
    unten, oben = 24 * mm, hoehe - 30 * mm
    spalte = (rechts - links) / 10
    zeilen = [0.39, 0.39, 0.22]
    gesamt = oben - unten
    kanten = [oben]
    for anteil in zeilen:
        kanten.append(kanten[-1] - gesamt * anteil)

    for nummer, (wert, titel) in enumerate(Canvasfeld.choices, start=1):
        sp, ze, b, h = ANORDNUNG[wert]
        x = links + sp * spalte
        y = kanten[ze + h]
        textende = _feld(
            leinwand, x, y, b * spalte, kanten[ze] - y,
            nummer, titel, punkte.get(wert, []), wert == Canvasfeld.NUTZEN,
        )
        if wert == Canvasfeld.NUTZEN:
            # Die Mittellinie teilt die Leinwand in Product und Market. Im
            # Nutzenversprechen läuft sie nur unter dem Text — quer durch die
            # Sätze wäre sie ein Strich, über den man beim Lesen stolpert.
            mitte = links + 5 * spalte
            leinwand.setStrokeColor(AKZENT)
            leinwand.setLineWidth(0.6)
            leinwand.setDash(2, 2)
            leinwand.line(mitte, y, mitte, max(y, textende - 2 * mm))
            leinwand.setDash()

    # Die Zeile darunter, mit etwas Abstand: links Product, rechts Market.
    zeile_oben, zeile_unten = unten - 3 * mm, unten - 9 * mm
    leinwand.setStrokeColor(RAND)
    leinwand.setLineWidth(0.6)
    leinwand.rect(links, zeile_unten, rechts - links, zeile_oben - zeile_unten, stroke=1, fill=0)
    leinwand.line(links + 5 * spalte, zeile_unten, links + 5 * spalte, zeile_oben)
    leinwand.setFont("Helvetica-Bold", 8.5)
    leinwand.setFillColor(LEISE)
    for text, von in (("Product", links), ("Market", links + 5 * spalte)):
        leinwand.drawCentredString(von + 2.5 * spalte, zeile_unten + 2 * mm, text)

    leinwand.setFont("Helvetica", 8)
    leinwand.setFillColor(LEISE)
    leinwand.drawString(
        RAND_SEITE, 9 * mm, f"Erstellt am {timezone.localtime():%d.%m.%Y um %H:%M} · SoCoS"
    )
    leinwand.showPage()

    if personas:
        _steckbriefe(leinwand, vorhaben, personas)

    leinwand.save()
    return puffer.getvalue()


def euro(betrag):
    """1400 → „1 400 €", 1400.50 → „1 400,50 €" — de-AT wie die Oberfläche,
    mit geschütztem Leerzeichen, damit die Zahl nicht umbricht."""
    ganz = int(betrag)
    text = f"{ganz:,}".replace(",", "\u00a0")
    cent = int(round((betrag - ganz) * 100))
    return f"{text},{cent:02d} €" if cent else f"{text} €"


def persona_kurz(persona):
    """„Maria Huber, 78, Pensionistin" — so viel, wie davon eingetragen ist."""
    teile = [persona.name]
    if persona.alter is not None:
        teile.append(str(persona.alter))
    if persona.beruf:
        teile.append(persona.beruf)
    return ", ".join(teile) + f" ({persona.get_rolle_display()})"


def _steckbriefe(leinwand, vorhaben, personas):
    """Die zweite Seite: je Persona ein Steckbrief, untereinander."""
    from reportlab.platypus import Frame, Spacer

    breite, hoehe = landscape(A4)
    stil_titel = ParagraphStyle("st", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=TEXT)
    stil_name = ParagraphStyle(
        "sn", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=TEXT, spaceBefore=4 * mm
    )
    stil_daten = ParagraphStyle("sd", fontName="Helvetica", fontSize=8.5, leading=12, textColor=LEISE)
    stil_text = ParagraphStyle("sx", fontName="Helvetica", fontSize=9, leading=12.5, textColor=TEXT)

    inhalt = [Paragraph(f"Personas · {escape(vorhaben.titel)}", stil_titel), Spacer(1, 2 * mm)]
    for p in personas:
        daten = [p.get_rolle_display()]
        if p.alter is not None:
            daten.append(f"{p.alter} Jahre")
        daten += [x for x in (p.geschlecht, p.wohnort, p.beruf, p.haushalt) if x]
        if p.einkommen is not None:
            daten.append(f"{euro(p.einkommen)} netto im Monat")
        inhalt.append(Paragraph(escape(p.name), stil_name))
        inhalt.append(Paragraph(escape(" · ".join(daten)), stil_daten))
        for titel, text in (("Bedürfnisse und Ziele", p.beduerfnisse), ("Probleme und Frust", p.probleme)):
            if text:
                inhalt.append(Paragraph(f"<b>{titel}:</b> {escape(text).replace(chr(10), '<br/>')}", stil_text))

    # `addFromList` nimmt aus der Liste, was auf die Seite passt, und lässt den
    # Rest stehen. Ohne die Schleife verschwänden überzählige Steckbriefe
    # still — und das PDF sähe trotzdem vollständig aus.
    while inhalt:
        Frame(RAND_SEITE, 16 * mm, breite - 2 * RAND_SEITE, hoehe - 30 * mm, showBoundary=0).addFromList(
            inhalt, leinwand
        )
        leinwand.setFont("Helvetica", 8)
        leinwand.setFillColor(LEISE)
        leinwand.drawString(
            RAND_SEITE, 9 * mm, f"Erstellt am {timezone.localtime():%d.%m.%Y um %H:%M} · SoCoS"
        )
        leinwand.showPage()


def dateiname(vorhaben):
    # Nur ASCII: Ein Umlaut im Dateinamen des Content-Disposition-Kopfs kommt
    # je nach Browser als Mojibake an. Ausgeschrieben statt ersetzt — aus
    # „Prüfung" wird „Pruefung", nicht „Pr-fung".
    titel = vorhaben.titel
    for umlaut, aus in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")):
        titel = titel.replace(umlaut, aus)
    teil = "".join(z if z.isascii() and z.isalnum() else "-" for z in titel)
    teil = "-".join(t for t in teil.split("-") if t) or "Vorhaben"
    return f"Lean-Canvas_{teil}.pdf"
