"""
Der Zeitnachweis als PDF — je Monat, je Person und für alle zusammen.

Das ist das Dokument, das im Zweifel einem Fördergeber vorgelegt wird. Zwei
Entscheidungen dazu, die man dem Ergebnis nicht ansieht:

**Jede Zeile zeigt ihre echte Dauer, nur die Summen sind gerundet.** Würde jede
Zeile auf 5 Minuten gerundet, wäre die Summe der Zeilen nicht die ausgewiesene
Summe — und dann steht ein Dokument da, dessen Zahlen sich nicht aufaddieren.
Das ist genau die Sorte Widerspruch, über die eine Prüfung stolpert.

**Entwürfe kommen nicht hinein.** Eine Buchung, die niemand bestätigt hat, hat
in einem Nachweis nichts verloren. Fehlen welche, sagt das PDF das ausdrücklich,
statt sie stillschweigend wegzulassen.
"""

from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from socos import marke
from socos.models import Nutzer, Zeitbuchung
from socos.services import auswertung
from socos.services import zeit as zeitdienst

# Dieselben Farben wie in der Oberfläche. Sie stehen hier ein zweites Mal, weil
# ein PDF kein CSS liest — mit denselben Namen, damit man die Stelle findet.
MARKE = colors.HexColor("#14595F")
TEXT = colors.HexColor("#16272B")
LEISE = colors.HexColor("#7C8A8C")
RAND = colors.HexColor("#DFDBD1")
FLAECHE_LEISE = colors.HexColor("#F7F5F0")
WARNUNG = colors.HexColor("#9C4229")

MONATE = [
    "Jänner", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]


def _stile():
    grund = getSampleStyleSheet()
    return {
        "titel": ParagraphStyle("titel", parent=grund["Normal"], fontName="Helvetica-Bold",
                                fontSize=16, leading=20, textColor=TEXT),
        "unter": ParagraphStyle("unter", parent=grund["Normal"], fontName="Helvetica",
                                fontSize=9.5, leading=13, textColor=LEISE),
        "person": ParagraphStyle("person", parent=grund["Normal"], fontName="Helvetica-Bold",
                                 fontSize=12, leading=16, textColor=MARKE, spaceBefore=6),
        "zelle": ParagraphStyle("zelle", parent=grund["Normal"], fontName="Helvetica",
                                fontSize=8.5, leading=11, textColor=TEXT),
        "zahl": ParagraphStyle("zahl", parent=grund["Normal"], fontName="Courier",
                               fontSize=8.5, leading=11, textColor=TEXT, alignment=TA_RIGHT),
        "hinweis": ParagraphStyle("hinweis", parent=grund["Normal"], fontName="Helvetica-Oblique",
                                  fontSize=8.5, leading=12, textColor=WARNUNG),
        "fuss": ParagraphStyle("fuss", parent=grund["Normal"], fontName="Helvetica",
                               fontSize=8, leading=11, textColor=LEISE),
    }


def monatstitel(monat):
    return f"{MONATE[monat.month - 1]} {monat.year}"


def _signet(leinwand, x, y, kante):
    """Das Signet der Marke, gerechnet aus socos/marke.py.

    `y` ist die Unterkante. Die Balken sind dort von oben beschrieben, wie im
    SVG; reportlab zählt von unten — daher die Spiegelung."""
    f = kante / marke.RASTER
    leinwand.setFillColor(colors.HexColor(marke.GRUND))
    leinwand.rect(x, y, kante, kante, stroke=0, fill=1)
    for bx, by, bbreite, bhoehe, farbe in marke.BALKEN:
        leinwand.setFillColor(colors.HexColor(farbe))
        leinwand.rect(
            x + bx * f,
            y + (marke.RASTER - by - bhoehe) * f,
            bbreite * f,
            bhoehe * f,
            stroke=0,
            fill=1,
        )


def _kopf_und_fuss(leinwand, dokument, untertitel):
    leinwand.saveState()
    breite, hoehe = A4

    _signet(leinwand, 18 * mm, hoehe - 13.4 * mm, 5.4 * mm)
    leinwand.setFillColor(MARKE)
    leinwand.setFont("Helvetica-Bold", 10)
    leinwand.drawString(25.5 * mm, hoehe - 12 * mm, "Sopharmis")
    leinwand.setFillColor(LEISE)
    leinwand.setFont("Helvetica", 8)
    leinwand.drawString(45.5 * mm, hoehe - 12 * mm, untertitel)

    leinwand.setStrokeColor(RAND)
    leinwand.setLineWidth(0.5)
    leinwand.line(18 * mm, hoehe - 15 * mm, breite - 18 * mm, hoehe - 15 * mm)

    leinwand.setFont("Helvetica", 8)
    leinwand.drawString(
        18 * mm, 10 * mm,
        f"Erstellt am {timezone.localtime():%d.%m.%Y um %H:%M} · SoCoS",
    )
    leinwand.drawRightString(breite - 18 * mm, 10 * mm, f"Seite {dokument.page}")
    leinwand.restoreState()


def _tabelle(buchungen):
    """Die Buchungstabelle einer Person. Gibt (Flowable, Sekunden) zurück."""
    stile = _stile()
    kopf = ["Datum", "Projekt · Arbeitspaket", "Von", "Bis", "Dauer", "Notiz"]
    zeilen = [[Paragraph(f"<b>{t}</b>", stile["zelle"]) for t in kopf]]
    gesamt = 0

    for b in buchungen:
        sekunden = zeitdienst.dauer(b)
        gesamt += sekunden
        start = timezone.localtime(b.start)
        ende = timezone.localtime(b.ende) if b.ende else None
        zeilen.append([
            Paragraph(f"{start:%d.%m.}", stile["zelle"]),
            Paragraph(
                f"{b.paket.bereich.projekt.titel} · {b.paket.titel}", stile["zelle"]
            ),
            Paragraph(f"{start:%H:%M}", stile["zahl"]),
            Paragraph(f"{ende:%H:%M}" if ende else "läuft", stile["zahl"]),
            Paragraph(zeitdienst.als_dauer(sekunden), stile["zahl"]),
            Paragraph(b.notiz or "—", stile["zelle"]),
        ])

    zeilen.append([
        Paragraph("<b>Summe</b>", stile["zelle"]),
        "", "", "",
        Paragraph(f"<b>{zeitdienst.als_dauer(zeitdienst.auf_fuenf_minuten(gesamt))}</b>", stile["zahl"]),
        Paragraph(
            f"<b>{zeitdienst.als_stunden_text(gesamt)} Stunden</b> (auf 5 Minuten gerundet)",
            stile["zelle"],
        ),
    ])

    tabelle = Table(
        zeilen,
        colWidths=[15 * mm, 60 * mm, 13 * mm, 13 * mm, 15 * mm, 58 * mm],
        repeatRows=1,
    )
    tabelle.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, 0), FLAECHE_LEISE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RAND),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, RAND),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, MARKE),
        ("SPAN", (0, -1), (3, -1)),
        ("BACKGROUND", (0, -1), (-1, -1), FLAECHE_LEISE),
    ]))
    return tabelle, gesamt


def erzeugen(monat, person=None):
    """
    Baut das PDF und gibt die Bytes zurück.

    `monat` ist ein Datum im gewünschten Monat, `person` ein Nutzer oder None
    für alle.
    """
    von, bis = zeitdienst.monatsgrenzen(monat)
    stile = _stile()

    personen = [person] if person else list(Nutzer.objects.filter(is_active=True))

    puffer = BytesIO()
    untertitel = f"Zeitnachweis {monatstitel(monat)}"
    dokument = SimpleDocTemplate(
        puffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=22 * mm, bottomMargin=18 * mm,
        title=untertitel,
        author="Sopharmis",
    )

    inhalt = [
        Paragraph("Zeitnachweis", stile["titel"]),
        Paragraph(
            f"{monatstitel(monat)} · {von:%d.%m.%Y} bis {bis:%d.%m.%Y}"
            + (f" · {person.name}" if person else " · gesamtes Team"),
            stile["unter"],
        ),
        Spacer(1, 8 * mm),
    ]

    gesamt_alle = 0
    for i, p in enumerate(personen):
        buchungen = list(
            auswertung.buchungen(von=von, bis=bis, person=p).order_by("start")
        )
        entwuerfe = Zeitbuchung.objects.filter(
            person=p, ist_entwurf=True, start__date__gte=von, start__date__lte=bis
        ).count()

        block = [Paragraph(p.name, stile["person"]), Spacer(1, 2 * mm)]

        if not buchungen:
            block.append(Paragraph("Keine Buchungen in diesem Monat.", stile["unter"]))
        else:
            tabelle, sekunden = _tabelle(buchungen)
            gesamt_alle += sekunden
            block.append(tabelle)

        if entwuerfe:
            block.append(Spacer(1, 2 * mm))
            block.append(Paragraph(
                f"{entwuerfe} Buchung(en) sind noch nicht bestätigt und daher hier "
                f"nicht enthalten.",
                stile["hinweis"],
            ))

        # Der Personenname darf nicht allein am Seitenende stehen.
        inhalt.append(KeepTogether(block[:2]) if len(block) > 2 else KeepTogether(block))
        inhalt.extend(block[2:] if len(block) > 2 else [])
        inhalt.append(Spacer(1, 7 * mm))

        if person is None and i < len(personen) - 1 and len(buchungen) > 12:
            inhalt.append(PageBreak())

    if person is None and len(personen) > 1:
        inhalt.append(Spacer(1, 3 * mm))
        inhalt.append(Paragraph(
            f"<b>Team gesamt: {zeitdienst.als_dauer(zeitdienst.auf_fuenf_minuten(gesamt_alle))} "
            f"({zeitdienst.als_stunden_text(gesamt_alle)} Stunden)</b>",
            stile["zelle"],
        ))

    dokument.build(
        inhalt,
        onFirstPage=lambda c, d: _kopf_und_fuss(c, d, untertitel),
        onLaterPages=lambda c, d: _kopf_und_fuss(c, d, untertitel),
    )
    return puffer.getvalue()


def dateiname(monat, person=None):
    teil = person.name.replace(" ", "-") if person else "Team"
    return f"Zeitnachweis_{monat:%Y-%m}_{teil}.pdf"
