"""
Die Designentscheidungen als PDF — der Teil der technischen Dokumentation,
der sagt, **warum** das Produkt so gebaut ist und warum es damit sicher ist.

Drei Entscheidungen dazu, die man dem Blatt nicht ansieht:

**Jede Entscheidung beginnt auf einer neuen Seite.** So lässt sich eine
einzelne austauschen oder zitieren („DE-007, Seite 9"), ohne dass die
nächste mitten auf ihrem Blatt anfängt.

**Leere Abschnitte stehen als „—" da, statt wegzufallen.** Ein fehlender
Abschnitt sieht aus wie einer, den es nicht gibt; ein Strich sagt, dass
nichts eingetragen ist — und genau das soll ein Prüfer sehen können.

**Der Änderungsverlauf kommt aus dem Änderungsprotokoll**, nicht aus einem
eigenen Feld. Wer, wann, welche Felder — das ist die Lenkung der
Aufzeichnung, die ISO 13485 verlangt, und sie steht ohnehin schon da. Ein
zweites, von Hand gepflegtes Revisionsfeld liefe auseinander.

Briefkopf, Schriften und Farben kommen aus dem Aushang
(`services/ausschreibung.py`): Beides sind Blätter der Firma nach außen, und
zwei Briefköpfe würden beim ersten Nachbessern verschieden.
"""

import re
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from socos.models import Designentscheidung, Entscheidungsstand, Protokolleintrag
from socos.services.ausschreibung import (
    AKZENT,
    GRUND,
    GRUND_FETT,
    KOPF_FETT,
    LEISE,
    MARKE,
    RAND,
    TEXT,
    UNSERE_FIRMA,
    _schriften_anmelden,
    ascii_teil,
)

RAND_SEITE = 18 * mm
# Die Breite, die ein Absatz bekommt: Der Rahmen von SimpleDocTemplate hält
# innen 6 pt Abstand. Eine Tabelle, die mit der Seitenbreite rechnet, stünde
# links und rechts um diese 6 pt über den Text hinaus.
BREITE = A4[0] - 2 * RAND_SEITE - 12
FLAECHE_LEISE = colors.HexColor("#F3F2EC")   # --flaeche-leise

# Die Abschnitte einer Entscheidung, in der Reihenfolge, in der man sie
# liest: wovon ausgegangen wurde, was zur Wahl stand, was gewählt wurde,
# warum — und was das für die Sicherheit heißt.
ABSCHNITTE = [
    ("ausgangslage", "Ausgangslage"),
    ("alternativen", "Betrachtete Alternativen"),
    ("entscheidung", "Entscheidung"),
    ("begruendung", "Begründung"),
    ("sicherheit", "Auswirkung auf die Sicherheit"),
]

AKTION = {
    Protokolleintrag.Aktion.ANGELEGT: "angelegt",
    Protokolleintrag.Aktion.GEAENDERT: "geändert",
    Protokolleintrag.Aktion.GELOESCHT: "entfernt",
    Protokolleintrag.Aktion.WIEDERHERGESTELLT: "wiederhergestellt",
}


def _stile():
    _schriften_anmelden()
    return {
        "titel": ParagraphStyle("titel", fontName=KOPF_FETT, fontSize=20, leading=25, textColor=MARKE),
        "unter": ParagraphStyle("unter", fontName=GRUND, fontSize=9.5, leading=13.5, textColor=LEISE),
        "kennung": ParagraphStyle("kennung", fontName=GRUND_FETT, fontSize=9, leading=12, textColor=AKZENT),
        "entscheidung": ParagraphStyle(
            "entscheidung", fontName=KOPF_FETT, fontSize=15, leading=19, textColor=MARKE, spaceAfter=2 * mm
        ),
        "abschnitt": ParagraphStyle(
            "abschnitt", fontName=GRUND_FETT, fontSize=10, leading=13, textColor=MARKE,
            spaceBefore=5 * mm, spaceAfter=1.5 * mm,
        ),
        "sicherheit": ParagraphStyle(
            "sicherheit", fontName=GRUND_FETT, fontSize=10, leading=13, textColor=AKZENT,
            spaceBefore=5 * mm, spaceAfter=1.5 * mm,
        ),
        "text": ParagraphStyle("text", fontName=GRUND, fontSize=9.5, leading=13.5, textColor=TEXT, spaceAfter=2 * mm),
        "punkt": ParagraphStyle(
            "punkt", fontName=GRUND, fontSize=9.5, leading=13.5, textColor=TEXT,
            leftIndent=4 * mm, bulletIndent=0, spaceAfter=1 * mm,
        ),
        "leer": ParagraphStyle("leer", fontName=GRUND, fontSize=9.5, leading=13.5, textColor=LEISE),
        "zelle": ParagraphStyle("zelle", fontName=GRUND, fontSize=8.5, leading=11, textColor=TEXT),
        "zelle_leise": ParagraphStyle("zelle_leise", fontName=GRUND, fontSize=7.5, leading=10, textColor=LEISE),
        "hinweis": ParagraphStyle("hinweis", fontName=GRUND_FETT, fontSize=9, leading=12, textColor=AKZENT),
    }


# --- Text in Absätze --------------------------------------------------------

_STRICH = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s+")


def _absaetze(text, s):
    """
    Freitext in Absätze: eine Leerzeile trennt Absätze, Zeilen mit einem
    Strich davor werden Punkte. Alles ist maskiert — ein „<" im Text der
    Begründung darf das PDF nicht zerbrechen.
    """
    if not text.strip():
        return [Paragraph("—", s["leer"])]
    teile = []
    for block in re.split(r"\n\s*\n", text.strip()):
        zeilen = [z for z in block.splitlines() if z.strip()]
        if all(_STRICH.match(z) for z in zeilen):
            teile.extend(
                Paragraph(escape(_STRICH.sub("", z).strip()), s["punkt"], bulletText="•") for z in zeilen
            )
        else:
            teile.append(Paragraph("<br/>".join(escape(z.strip()) for z in zeilen), s["text"]))
    return teile


def _verweise(text, s):
    """Verweise sind eine Liste, ein Verweis je Zeile — mit oder ohne Strich davor."""
    zeilen = [_STRICH.sub("", z).strip() for z in text.splitlines() if z.strip()]
    if not zeilen:
        return [Paragraph("—", s["leer"])]
    return [Paragraph(escape(z), s["punkt"], bulletText="•") for z in zeilen]


def _tag(datum):
    return f"{datum:%d.%m.%Y}" if datum else "—"


# --- Bausteine einer Entscheidung --------------------------------------------


def _kopfdaten(e, s):
    """Die vier Angaben, die jede Entscheidung oben trägt."""
    paare = [
        ("Stand", Entscheidungsstand(e.stand).label),
        ("Entschieden am", _tag(e.entschieden_am)),
        ("Entschieden von", e.entschieden_von or "—"),
        ("Zuletzt geändert", _tag(timezone.localtime(e.geaendert_am))),
    ]
    zeile_oben = [Paragraph(escape(k).upper(), s["zelle_leise"]) for k, _ in paare]
    zeile_unten = [Paragraph(escape(v), s["zelle"]) for _, v in paare]
    tabelle = Table([zeile_oben, zeile_unten], colWidths=[BREITE / 4] * 4)
    tabelle.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, RAND),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, RAND),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 5),
    ]))
    return tabelle


def _schild(e, s):
    """Ein Entwurf oder eine ersetzte Entscheidung sagt das, bevor man liest."""
    if e.stand == Entscheidungsstand.ENTWURF:
        text = "ENTWURF — noch nicht entschieden, nicht Teil der technischen Dokumentation."
    elif e.stand == Entscheidungsstand.ERSETZT:
        text = "ERSETZT — gilt nicht mehr. Wodurch, steht unter den Verweisen."
    else:
        return None
    kasten = Table([[Paragraph(text, s["hinweis"])]], colWidths=[BREITE])
    kasten.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FLAECHE_LEISE),
        ("LINEBEFORE", (0, 0), (0, -1), 2, AKZENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return kasten


def _feldname(feld):
    try:
        return str(Designentscheidung._meta.get_field(feld).verbose_name)
    except Exception:  # noqa: BLE001 — ein Feld, das es nicht mehr gibt
        return feld


def _verlauf(e, s):
    """Wer wann was an dieser Entscheidung getan hat — aus dem Änderungsprotokoll."""
    eintraege = Protokolleintrag.objects.filter(
        modell=Designentscheidung._meta.label, objekt_id=str(e.pk)
    ).order_by("zeitpunkt", "id")
    if not eintraege:
        return [Paragraph("—", s["leer"])]

    zeilen = [[Paragraph(t.upper(), s["zelle_leise"]) for t in ("Wann", "Wer", "Was")]]
    for p in eintraege:
        was = AKTION.get(p.aktion, p.aktion)
        if p.aktion == Protokolleintrag.Aktion.GEAENDERT and p.aenderungen:
            was += ": " + ", ".join(_feldname(f) for f in p.aenderungen)
        zeilen.append([
            Paragraph(f"{timezone.localtime(p.zeitpunkt):%d.%m.%Y %H:%M}", s["zelle"]),
            Paragraph(escape(p.nutzer_text or "System"), s["zelle"]),
            Paragraph(escape(was), s["zelle"]),
        ])
    tabelle = Table(zeilen, colWidths=[30 * mm, 42 * mm, BREITE - 72 * mm], repeatRows=1)
    tabelle.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RAND),
    ]))
    return [tabelle]


def _entscheidung(e, s):
    inhalt = [
        Paragraph(e.kennung, s["kennung"]),
        Paragraph(escape(e.titel), s["entscheidung"]),
        _kopfdaten(e, s),
    ]
    if schild := _schild(e, s):
        inhalt += [Spacer(1, 4 * mm), schild]
    for feld, titel in ABSCHNITTE:
        stil = s["sicherheit"] if feld == "sicherheit" else s["abschnitt"]
        absaetze = _absaetze(getattr(e, feld), s)
        # Die Überschrift nie allein am Seitenende.
        inhalt.append(KeepTogether([Paragraph(titel, stil), absaetze[0]]))
        inhalt.extend(absaetze[1:])
    verweise = _verweise(e.verweise, s)
    inhalt.append(KeepTogether([Paragraph("Verweise", s["abschnitt"]), verweise[0]]))
    inhalt.extend(verweise[1:])
    verlauf = _verlauf(e, s)
    inhalt.append(KeepTogether([Paragraph("Änderungsverlauf", s["abschnitt"]), verlauf[0]]))
    return inhalt


def _uebersicht(entscheidungen, s):
    zeilen = [[Paragraph(t.upper(), s["zelle_leise"]) for t in ("Nr.", "Titel", "Stand", "Entschieden am")]]
    for e in entscheidungen:
        zeilen.append([
            Paragraph(e.kennung, s["zelle"]),
            Paragraph(escape(e.titel), s["zelle"]),
            Paragraph(Entscheidungsstand(e.stand).label, s["zelle"]),
            Paragraph(_tag(e.entschieden_am), s["zelle"]),
        ])
    tabelle = Table(zeilen, colWidths=[18 * mm, BREITE - 70 * mm, 24 * mm, 28 * mm], repeatRows=1)
    tabelle.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, MARKE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, RAND),
    ]))
    return tabelle


# --- Das Blatt ---------------------------------------------------------------


class _Blatt(canvas.Canvas):
    """
    Zeichnet Kopf und Fuß erst, wenn alle Seiten stehen — sonst ließe sich
    „Seite 3 von 12" nicht schreiben. Bei einem gelenkten Dokument ist die
    Gesamtzahl kein Schmuck: Sie zeigt, dass kein Blatt fehlt.
    """

    def __init__(self, *args, untertitel="", **kwargs):
        super().__init__(*args, **kwargs)
        self._untertitel = untertitel
        self._seiten = []

    def showPage(self):
        self._seiten.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        gesamt = len(self._seiten)
        for zustand in self._seiten:
            self.__dict__.update(zustand)
            self._kopf_und_fuss(gesamt)
            super().showPage()
        super().save()

    def _kopf_und_fuss(self, gesamt):
        breite, hoehe = A4
        oben = hoehe - 14 * mm
        self.setFillColor(MARKE)
        self.setFont(KOPF_FETT, 13)
        self.drawString(RAND_SEITE, oben, "Sopharmis")
        self.setFillColor(AKZENT)
        self.setFont(KOPF_FETT, 5.5)
        self.drawString(RAND_SEITE, oben - 3.6 * mm, "MEDICAL SOLUTIONS", charSpace=1.6)

        self.setFillColor(LEISE)
        self.setFont(GRUND, 8)
        self.drawRightString(breite - RAND_SEITE, oben + 0.5 * mm, "Technische Dokumentation · Designentscheidungen")
        self.setFillColor(MARKE)
        self.drawRightString(breite - RAND_SEITE, oben - 3.6 * mm, self._untertitel)

        self.setStrokeColor(RAND)
        self.setLineWidth(0.6)
        self.line(RAND_SEITE, oben - 6.5 * mm, breite - RAND_SEITE, oben - 6.5 * mm)
        self.line(RAND_SEITE, 14 * mm, breite - RAND_SEITE, 14 * mm)

        self.setFillColor(LEISE)
        self.setFont(GRUND, 7.5)
        self.drawString(RAND_SEITE, 10 * mm, UNSERE_FIRMA)
        self.drawCentredString(breite / 2, 10 * mm, f"Stand {timezone.localtime():%d.%m.%Y %H:%M}")
        self.drawRightString(breite - RAND_SEITE, 10 * mm, f"Seite {self._pageNumber} von {gesamt}")


def erzeugen(entscheidungen, entwuerfe_ausgelassen=0):
    """
    Baut das PDF und gibt die Bytes zurück.

    Eine einzelne Entscheidung steht für sich; mehrere bekommen ein Deckblatt
    mit der Übersicht. Wie viele Entwürfe nicht drin sind, sagt das Deckblatt
    ausdrücklich — sonst sähe die Akte vollständig aus, ohne es zu sein.
    """
    s = _stile()
    einzeln = len(entscheidungen) == 1 and not entwuerfe_ausgelassen
    untertitel = entscheidungen[0].kennung if einzeln else "Gesamtübersicht"

    puffer = BytesIO()
    dokument = SimpleDocTemplate(
        puffer, pagesize=A4,
        leftMargin=RAND_SEITE, rightMargin=RAND_SEITE,
        topMargin=28 * mm, bottomMargin=22 * mm,
        title=f"Designentscheidung {entscheidungen[0]}" if einzeln else "Designentscheidungen",
        author=UNSERE_FIRMA,
    )

    inhalt = []
    if not einzeln:
        zahl = len(entscheidungen)
        inhalt += [
            Paragraph("Designentscheidungen", s["titel"]),
            Spacer(1, 2 * mm),
            Paragraph(
                "Begründete Entscheidungen zur Gestaltung des Produkts und ihre Auswirkung auf die "
                f"Sicherheit. Stand {timezone.localdate():%d.%m.%Y} · "
                f"{zahl} {'Entscheidung' if zahl == 1 else 'Entscheidungen'}.",
                s["unter"],
            ),
        ]
        if entwuerfe_ausgelassen:
            inhalt += [
                Spacer(1, 3 * mm),
                Paragraph(
                    f"{entwuerfe_ausgelassen} {'Entwurf ist' if entwuerfe_ausgelassen == 1 else 'Entwürfe sind'} "
                    "nicht enthalten — noch nicht entschieden.",
                    s["hinweis"],
                ),
            ]
        inhalt += [Spacer(1, 8 * mm), _uebersicht(entscheidungen, s)]

    for e in entscheidungen:
        if inhalt:
            inhalt.append(PageBreak())
        inhalt += _entscheidung(e, s)

    dokument.build(inhalt, canvasmaker=lambda *a, **k: _Blatt(*a, untertitel=untertitel, **k))
    return puffer.getvalue()


def dateiname(entscheidung):
    teil = ascii_teil(entscheidung.titel)
    return f"{entscheidung.kennung}_{teil}.pdf" if teil else f"{entscheidung.kennung}.pdf"


def sammelname():
    return f"Designentscheidungen_{timezone.localdate():%Y-%m-%d}.pdf"
