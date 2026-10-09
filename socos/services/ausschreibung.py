"""
Die Ausschreibung eines Praktikums — der Auftrag an ein LLM, der Parser für
seine Antwort und der einseitige Aushang als PDF.

**Auftrag und Parser stehen in einer Datei**, aus demselben Grund wie beim
Meetingprotokoll (`frontend/src/basis/meetings.ts`): Beide beschreiben dasselbe
Format. Hier stehen sie im Backend, weil das PDF hier gezeichnet wird und
den Text zerlegen muss; der Auftrag kommt über den Serializer in die
Oberfläche. Stünde er dort ein zweites Mal, verlangte er beim nächsten
Nachbessern ein Format, das der Parser nicht mehr liest.

**Genau eine Seite A4.** Was nicht passt, wird kleiner gesetzt — bis 72 % der
Grundgröße. Reicht auch das nicht, wird die Ausschreibung schon beim
Speichern abgewiesen (`passt`), nicht erst beim PDF: Ein Aushang, der still
eine zweite Seite bekommt oder unten abgeschnitten ist, fällt erst am
Schwarzen Brett auf. A4 und nicht größer: Alle A-Formate haben dasselbe
Seitenverhältnis, ein Plakat ist dieselbe Datei, größer gedruckt.

Kein eingebautes LLM, wie bei den Meetings: SoCoS schickt nichts irgendwohin.
"""

import re
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Flowable, Frame, Paragraph, Spacer

UNSERE_FIRMA = "Sopharmis Medical Solutions FlexCo"
KONTAKT = "info@sopharmis.com"

# Die Farben der Oberfläche (frontend/src/stil/farben.css) — ein PDF liest kein
# CSS. Dieselben Namen, damit man die zweite Stelle findet.
MARKE = colors.HexColor("#0D4E52")        # --marke
MARKE_HELL = colors.HexColor("#E4EEED")   # --marke-hell
AKZENT_TEXT = "#A2552C"                   # --akzent, für die Auszeichnung im Absatz
AKZENT = colors.HexColor(AKZENT_TEXT)
TEXT = colors.HexColor("#171A18")         # --text
LEISE = colors.HexColor("#565C58")        # --text-leise
RAND = colors.HexColor("#D2CCBC")         # --rand
SEITENGRUND = colors.HexColor("#FAFAF7")  # --grund

# Höchstens so viele Zeichen — eine Sperre gegen ein eingefügtes Transkript,
# nicht die Grenze der Seite. Die prüft `passt`.
HOECHSTENS = 6000


# --- Der Auftrag -------------------------------------------------------------


def auftrag(thema):
    """
    Der Text, der mit dem Thema in die Zwischenablage geht.

    **Warum so viele Verbote:** Eine Ausschreibung ist ein Versprechen an
    jemanden, der sich darauf bewirbt. Ein Sprachmodell, das man bittet, eine
    „ansprechende Stellenanzeige" zu schreiben, füllt die Lücken mit dem, was
    in Stellenanzeigen eben steht — Vergütung, flexible Zeiten, „ein junges
    dynamisches Team". Das liest sich am besten und ist das, was wir dann
    beim Vorstellungsgespräch zurücknehmen müssen.

    **Kontakt und Aufruf schreibt das Modell nicht**, die setzt der Aushang
    selbst darunter. Sonst stünde die Adresse zweimal da, und einmal
    vielleicht falsch.
    """
    punkte = stichpunkte(thema.punkte)
    stoff = [f"Titel: {thema.titel}"]
    if thema.kurzbeschreibung.strip():
        stoff.append(f"Kurzbeschreibung:\n{thema.kurzbeschreibung.strip()}")
    if punkte:
        stoff.append("Stichpunkte:\n" + "\n".join(f"- {p}" for p in punkte))

    return f"""Du schreibst die Ausschreibung für ein Praktikum bei {UNSERE_FIRMA}. Sie wird als Aushang auf genau einer Seite A4 gedruckt und an Hochschulen verteilt. Wer sie liest, soll in einer Minute wissen, worum es geht, ob es zu ihr oder ihm passt und was man dabei lernt.

WAS DU BEKOMMST
- THEMA: Titel, Kurzbeschreibung und Stichpunkte, so wie wir sie intern notiert haben — knapp, mit Abkürzungen, nicht für Außenstehende geschrieben.

REGELN
1. Erfinde nichts. Keine Vergütung, Dauer, Beginn, Stundenzahl, Ort, Voraussetzung, kein Werkzeug und kein Versprechen, das nicht im Thema steht. Was fehlt, fehlt — lieber ein Abschnitt weniger als ein ausgedachter.
2. Schreib für Studierende, die uns nicht kennen. Interne Abkürzungen und Projektnamen erklärst du in Worten oder lässt sie weg.
3. Über {UNSERE_FIRMA} schreibst du nur, was im Thema steht.
4. Deutsch, per du, geschlechtergerecht mit Doppelpunkt ("Praktikant:in"). Konkret statt Floskeln: kein "dynamisches Team", keine "spannenden Herausforderungen", kein "Wir freuen uns auf dich".
5. Kurz, damit es auf eine Seite passt: höchstens 220 Wörter insgesamt, höchstens vier Abschnitte, höchstens fünf Punkte je Abschnitt, jeder Punkt höchstens eine Zeile (etwa zwölf Wörter).
6. Keine Kontaktdaten, keine E-Mail-Adresse und keinen Aufruf zur Bewerbung — das setzt der Aushang selbst darunter.

AUFBAU
# Titel
Was man tut, in höchstens acht Wörtern. Ohne das Wort "Praktikum" — das steht auf dem Aushang schon darüber.

Danach ohne Überschrift ein bis zwei Sätze: worum es geht und wozu es gut ist.

## Deine Aufgaben
Was du konkret tust, als Punkte mit "- ".

## Das bringst du mit
Nur, was im Thema steht oder aus den Aufgaben unmittelbar folgt. Keine Noten, Semester oder Studienrichtungen, die nicht genannt sind.

## Was du dabei lernst
Was man aus diesen Aufgaben mitnimmt, als Punkte mit "- ".

## Rahmen
Nur wenn das Thema Dauer, Beginn, Umfang, Ort oder Vergütung nennt — dann genau das, als Punkte. Sonst lass den Abschnitt weg.

FORM
- Genau eine Zeile mit "# " für den Titel, "## " für jeden Abschnitt. Keine anderen Überschriften.
- Punkte mit "- ". Fettdruck mit **…** höchstens für ein, zwei Wörter je Abschnitt.
- Keine Tabellen, keine Emojis, keine Pfeile, kein Codeblock.
- Antworte ausschließlich mit der Ausschreibung: keine Einleitung, keine Rückfrage, kein Schlusswort.

--- THEMA ---
{chr(10).join(stoff)}
--- ENDE DES THEMAS ---"""


def stichpunkte(text):
    """Die Punkte eines Themas: eine Zeile je Punkt, ohne Strich davor und ohne leere Zeilen."""
    return [z for z in (_ohne_strich(zeile) for zeile in text.splitlines()) if z]


def _ohne_strich(zeile):
    return re.sub(r"^\s*(?:[-*•–]|\d+[.)])\s+", "", zeile).strip()


# --- Der Parser --------------------------------------------------------------

_UEBERSCHRIFT = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
_PUNKT = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s+(.+)$")


def zerlegen(roh):
    """
    Die Antwort des LLM als `{"titel", "einleitung", "abschnitte"}`.

    `einleitung` ist eine Liste von Absätzen; jeder Abschnitt hat eine
    `ueberschrift` und `bloecke` — `("absatz", text)` oder `("punkt", text)`
    in ihrer Reihenfolge.

    **Was vor dem ersten Abschnitt steht, geht nicht verloren**, sondern wird
    Einleitung — auch wenn das Modell den Titel vergessen hat. Aus demselben
    Grund wie bei den Meetings: Hält sich das Modell nicht an das Format, soll
    der Text sichtbar schief stehen, nicht still verschwinden.
    """
    zeilen = _ohne_codezaun(roh).splitlines()
    titel = ""
    abschnitte = []
    bloecke = einleitung_bloecke = []
    absatz = []

    def absatz_ablegen():
        if absatz:
            bloecke.append(("absatz", " ".join(absatz)))
            absatz.clear()

    for zeile in zeilen:
        treffer = _UEBERSCHRIFT.match(zeile)
        if treffer:
            absatz_ablegen()
            text = treffer.group(2).strip()
            if len(treffer.group(1)) == 1 and not titel and not abschnitte:
                titel = text
                continue
            bloecke = []
            abschnitte.append({"ueberschrift": text, "bloecke": bloecke})
            continue
        punkt = _PUNKT.match(zeile)
        if punkt:
            absatz_ablegen()
            bloecke.append(("punkt", punkt.group(1).strip()))
        elif zeile.strip():
            absatz.append(zeile.strip())
        else:
            absatz_ablegen()
    absatz_ablegen()

    # Die Einleitung sind Absätze. Ein Punkt vor dem ersten Abschnitt bleibt
    # als eigener Absatz stehen, statt zu fehlen.
    einleitung = [text for _, text in einleitung_bloecke]
    return {"titel": titel, "einleitung": einleitung, "abschnitte": abschnitte}


def _ohne_codezaun(roh):
    text = roh.strip()
    if not text.startswith("```"):
        return text
    zeilen = text.splitlines()[1:]
    if zeilen and zeilen[-1].strip().startswith("```"):
        zeilen.pop()
    return "\n".join(zeilen)


def _auszeichnung(text):
    """Text für einen reportlab-Absatz: maskiert, `**…**` wird fett."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(text))




# --- Das PDF -----------------------------------------------------------------

# Überschriften in Sansation, dem Schriftzug der Firma nach außen (so steht er
# im Businessplan); alles, was gelesen wird, in Archivo wie in SoCoS selbst.
# Sansation hat für Fließtext zu enge, eckige Formen — auf zwei Zeilen geht
# das, auf zwanzig ermüdet es.
#
# **Archivo liegt hier ein zweites Mal, als TTF.** Die Dateien unter
# `statisch/schriften/` sind variable woff2, und reportlab liest weder woff2
# noch variable Schnitte. Die beiden hier sind daraus mit fontTools auf die
# Gewichte 400 und 600 festgelegt.
SCHRIFTEN = Path(__file__).resolve().parent.parent / "schriften"
KOPF, KOPF_FETT = "Sansation", "Sansation-Bold"
GRUND, GRUND_FETT = "Archivo", "Archivo-SemiBold"


def _schriften_anmelden():
    if GRUND in pdfmetrics.getRegisteredFontNames():
        return
    for name, datei in (
        (KOPF, "Sansation-Regular.ttf"), (KOPF_FETT, "Sansation-Bold.ttf"),
        (GRUND, "Archivo-Regular.ttf"), (GRUND_FETT, "Archivo-SemiBold.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(SCHRIFTEN / datei)))
    # Damit `<b>` im Absatz den SemiBold-Schnitt nimmt statt Helvetica-Bold.
    pdfmetrics.registerFontFamily(GRUND, normal=GRUND, bold=GRUND_FETT, italic=GRUND, boldItalic=GRUND_FETT)
    pdfmetrics.registerFontFamily(KOPF, normal=KOPF, bold=KOPF_FETT, italic=KOPF, boldItalic=KOPF_FETT)


RAND_SEITE = 18 * mm
# Die linke Spalte eines Abschnitts: dort steht nur die Überschrift.
SPALTE = 52 * mm
# Wie weit die Schrift schrumpfen darf. Darunter ist ein Aushang aus einem
# Meter Abstand nicht mehr zu lesen — dann ist der Text zu lang, nicht die
# Schrift zu groß.
MASSSTAEBE = [1 - 0.04 * i for i in range(8)]   # 1,00 … 0,72


class PasstNicht(ValueError):
    """Die Ausschreibung passt auch in der kleinsten Schrift nicht auf die Seite."""


def _flaeche():
    """Links, unten, Breite, Höhe des Textfeldes zwischen Kopf und Kontakt."""
    breite, hoehe = A4
    oben = hoehe - 48 * mm
    unten = 56 * mm
    return RAND_SEITE, unten, breite - 2 * RAND_SEITE, oben - unten


class _Punkt(Flowable):
    """
    Ein Absatz mit einer Marke davor — Nummer, volles oder leeres Quadrat.

    **Gezeichnet, nicht gesetzt**: Archivo hat kein ■ und kein □, und ein
    Ersatz aus einer zweiten Schrift sitzt nie auf derselben Linie.
    """

    def __init__(self, marke, absatz, einzug, groesse):
        super().__init__()
        self.marke, self.absatz, self.einzug, self.groesse = marke, absatz, einzug, groesse

    def wrap(self, verfuegbar_b, verfuegbar_h):
        _, h = self.absatz.wrap(verfuegbar_b - self.einzug, verfuegbar_h)
        self.width, self.height = verfuegbar_b, h
        return self.width, h

    def getSpaceAfter(self):
        return self.absatz.getSpaceAfter()

    def draw(self):
        c, st = self.canv, self.absatz.style
        # reportlab setzt die erste Grundlinie eine Schriftgröße unter die Oberkante.
        grundlinie = self.height - st.fontSize
        a = self.groesse
        mitte = grundlinie + st.fontSize * 0.36
        if self.marke == "voll":
            c.setFillColor(AKZENT)
            c.rect(0.5, mitte - a / 2, a, a, stroke=0, fill=1)
        elif self.marke == "leer":
            c.setStrokeColor(MARKE)
            c.setLineWidth(0.9)
            c.rect(0.5, mitte - a / 2, a, a, stroke=1, fill=0)
        else:
            c.setFillColor(AKZENT)
            c.setFont(GRUND_FETT, st.fontSize * 0.9)
            c.drawString(0, grundlinie, self.marke)
        self.absatz.drawOn(c, self.einzug, 0)


class _Abschnitt(Flowable):
    """Eine Zeile des Aushangs: Überschrift links, Inhalt rechts, Haarlinie darüber."""

    def __init__(self, kopf, inhalt, luft):
        super().__init__()
        self.kopf, self.inhalt, self.luft = kopf, inhalt, luft

    def wrap(self, verfuegbar_b, verfuegbar_h):
        self.width = verfuegbar_b
        rechts = verfuegbar_b - SPALTE
        self._hk = self.kopf.wrap(SPALTE - 4 * mm, verfuegbar_h)[1]
        self._hoehen = [f.wrap(rechts, verfuegbar_h)[1] for f in self.inhalt]
        abstaende = sum(f.getSpaceAfter() for f in self.inhalt[:-1])
        self.height = 2 * self.luft + max(self._hk, sum(self._hoehen) + abstaende)
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(RAND)
        c.setLineWidth(0.6)
        c.line(0, self.height, self.width, self.height)
        oben = self.height - self.luft
        self.kopf.drawOn(c, 0, oben - self._hk)
        for f, h in zip(self.inhalt, self._hoehen):
            oben -= h
            f.drawOn(c, SPALTE, oben)
            oben -= f.getSpaceAfter()


class _Linie(Flowable):
    """Die Haarlinie unter dem letzten Abschnitt."""

    def wrap(self, verfuegbar_b, verfuegbar_h):
        self.width, self.height = verfuegbar_b, 0.6
        return self.width, self.height

    def draw(self):
        self.canv.setStrokeColor(RAND)
        self.canv.setLineWidth(0.6)
        self.canv.line(0, 0, self.width, 0)


# Die Marke je Abschnitt: Der erste (die Aufgaben) wird gezählt, der zweite
# bekommt das volle Kupfer, alle weiteren das leere Quadrat in Marke.
def _marke(nr_abschnitt, nr_punkt):
    if nr_abschnitt == 0:
        return f"{nr_punkt + 1:02d}"
    return "voll" if nr_abschnitt == 1 else "leer"


def _absaetze(teile, s):
    """Die Flowables in der Größe `s` (1 = Grundgröße)."""
    _schriften_anmelden()
    stil = {
        "titel": ParagraphStyle(
            "titel", fontName=KOPF_FETT, fontSize=27 * s, leading=31 * s,
            textColor=MARKE, spaceAfter=4 * mm * s,
        ),
        "einleitung": ParagraphStyle(
            "einleitung", fontName=GRUND, fontSize=12 * s, leading=17.5 * s,
            textColor=LEISE, spaceAfter=3 * mm * s,
        ),
        "ueberschrift": ParagraphStyle(
            "ueberschrift", fontName=KOPF_FETT, fontSize=12.5 * s, leading=15 * s,
            textColor=MARKE,
        ),
        "absatz": ParagraphStyle(
            "absatz", fontName=GRUND, fontSize=10.5 * s, leading=14.5 * s,
            textColor=TEXT, spaceAfter=2 * mm * s,
        ),
        "punkt": ParagraphStyle(
            "punkt", fontName=GRUND, fontSize=10.5 * s, leading=14.5 * s,
            textColor=TEXT, spaceAfter=1.6 * mm * s,
        ),
    }
    fluss = []
    if teile["titel"]:
        fluss.append(Paragraph(_auszeichnung(teile["titel"]), stil["titel"]))
    for text in teile["einleitung"]:
        fluss.append(Paragraph(_auszeichnung(text), stil["einleitung"]))
    if teile["einleitung"]:
        fluss.append(Spacer(0, 2 * mm * s))
    for nr, abschnitt in enumerate(teile["abschnitte"]):
        inhalt, punkte = [], 0
        for art, text in abschnitt["bloecke"]:
            if art == "punkt":
                inhalt.append(_Punkt(
                    _marke(nr, punkte), Paragraph(_auszeichnung(text), stil["punkt"]),
                    einzug=7 * mm * s, groesse=2.2 * mm * s,
                ))
                punkte += 1
            else:
                inhalt.append(Paragraph(_auszeichnung(text), stil["absatz"]))
        kopf = Paragraph(_auszeichnung(abschnitt["ueberschrift"]), stil["ueberschrift"])
        fluss.append(_Abschnitt(kopf, inhalt, luft=3.8 * mm * s))
    if teile["abschnitte"]:
        fluss.append(_Linie())
    return fluss


def _hoehe(fluss, breite):
    """Wie hoch der Text wird. Die Abstände werden nicht zusammengelegt — die
    Rechnung liegt damit eher über der Wirklichkeit als darunter."""
    return sum(
        f.wrap(breite, 10_000)[1] + f.getSpaceBefore() + f.getSpaceAfter() for f in fluss
    )


def _massstab(teile):
    """Die größte Schrift, in der alles auf die Seite passt — oder `None`."""
    _, _, breite, hoehe = _flaeche()
    for s in MASSSTAEBE:
        if _hoehe(_absaetze(teile, s), breite) <= hoehe:
            return s
    return None


def passt(text):
    """Ob die Ausschreibung auf eine Seite passt. Leer passt immer."""
    if not text.strip():
        return True
    return _massstab(zerlegen(text)) is not None


def erzeugen(thema):
    """Baut den Aushang und gibt die Bytes zurück. Wirft `PasstNicht`."""
    teile = zerlegen(thema.ausschreibung)
    if not teile["titel"]:
        teile["titel"] = thema.titel
    s = _massstab(teile)
    if s is None:
        raise PasstNicht(thema.titel)

    puffer = BytesIO()
    breite, hoehe = A4
    blatt = canvas.Canvas(puffer, pagesize=A4)
    blatt.setTitle(f"Praktikum · {teile['titel']}")
    blatt.setAuthor(UNSERE_FIRMA)

    # Der Seitengrund der Oberfläche. Am Drucker bleibt davon fast nichts,
    # am Bildschirm nimmt er dem Weiß die Härte.
    blatt.setFillColor(SEITENGRUND)
    blatt.rect(0, 0, breite, hoehe, stroke=0, fill=1)

    _kopf(blatt, breite, hoehe)
    _schild(blatt, hoehe)

    links, unten, b, h = _flaeche()
    Frame(
        links, unten, b, h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        showBoundary=0,
    ).addFromList(_absaetze(teile, s), blatt)

    _kontakt(blatt, breite, teile["titel"])
    _fuss(blatt, breite)
    blatt.showPage()
    blatt.save()
    return puffer.getvalue()


def _kopf(blatt, breite, hoehe):
    """
    Der Briefkopf: die Firma in Worten, darunter eine Haarlinie.

    **Kein Signet.** Das Zeichen in `socos/marke.py` ist das von SoCoS, dem
    internen Werkzeug — auf einem Aushang nach außen gehört es nicht hin.
    Ein Logo der Firma liegt im Repository nicht vor; bis eines da ist, trägt
    die Schrift den Kopf.
    """
    oben = hoehe - 22 * mm
    blatt.setFillColor(MARKE)
    blatt.setFont(KOPF_FETT, 22)
    blatt.drawString(RAND_SEITE, oben, "Sopharmis")
    blatt.setFillColor(AKZENT)
    blatt.setFont(KOPF_FETT, 7.5)
    blatt.drawString(RAND_SEITE, oben - 5.5 * mm, "MEDICAL SOLUTIONS", charSpace=2.2)

    blatt.setFillColor(LEISE)
    blatt.setFont(GRUND, 9)
    blatt.drawRightString(breite - RAND_SEITE, oben + 1 * mm, "Ausschreibung")
    blatt.setFillColor(MARKE)
    blatt.drawRightString(breite - RAND_SEITE, oben - 4.5 * mm, KONTAKT)

    blatt.setStrokeColor(RAND)
    blatt.setLineWidth(0.6)
    blatt.line(RAND_SEITE, oben - 11 * mm, breite - RAND_SEITE, oben - 11 * mm)


def _schild(blatt, hoehe):
    """Das Schild über dem Titel: was das hier ist. Kupfer — der eine Ton,
    der auch am Brett „hier" heißt."""
    text, groesse, sperrung = "PRAKTIKUM", 8.5, 2
    b = blatt.stringWidth(text, KOPF_FETT, groesse) + sperrung * len(text) + 5 * mm
    y, h = hoehe - 43 * mm, 6.5 * mm
    blatt.setFillColor(AKZENT)
    blatt.roundRect(RAND_SEITE, y, b, h, 2, stroke=0, fill=1)
    blatt.setFillColor(colors.white)
    blatt.setFont(KOPF_FETT, groesse)
    blatt.drawString(RAND_SEITE + 2.5 * mm, y + 2.2 * mm, text, charSpace=sperrung)


def _kontakt(blatt, breite, titel):
    """Der Kasten unten: wohin man schreibt, und mit welchem Betreff."""
    x, y, b, h = RAND_SEITE, 20 * mm, breite - 2 * RAND_SEITE, 30 * mm
    blatt.setFillColor(MARKE)
    blatt.roundRect(x, y, b, h, 2, stroke=0, fill=1)

    innen = x + 9 * mm
    blatt.setFillColor(colors.white)
    blatt.setFont(GRUND, 11)
    blatt.drawString(innen, y + h - 10 * mm, "Interesse? Schreib uns.")
    blatt.setFont(KOPF_FETT, 22)
    blatt.drawString(innen, y + 8 * mm, KONTAKT)

    # Der Betreff hilft uns beim Zuordnen, wenn mehrere Aushänge hängen.
    # Rechts neben der Adresse, höchstens zwei Zeilen; was dann noch übrig
    # ist, wird gekürzt statt über den Kasten hinaus.
    platz = b - (innen - x) - blatt.stringWidth(KONTAKT, KOPF_FETT, 22) - 18 * mm
    zeilen = _umbrechen(blatt, f"Betreff: Praktikum – {titel}", GRUND, 9, platz, 2)
    blatt.setFillColor(MARKE_HELL)
    blatt.setFont(GRUND, 9)
    rechts = x + b - 9 * mm
    for i, zeile in enumerate(zeilen):
        blatt.drawRightString(rechts, y + 8 * mm + (len(zeilen) - 1 - i) * 12, zeile)


def _umbrechen(blatt, text, schrift, groesse, platz, hoechstens):
    """Zerlegt `text` in höchstens so viele Zeilen; die letzte wird mit … gekürzt."""
    breite = lambda t: blatt.stringWidth(t, schrift, groesse)
    zeilen, zeile = [], ""
    for wort in text.split():
        probe = f"{zeile} {wort}".strip()
        if breite(probe) <= platz or not zeile:
            zeile = probe
        else:
            zeilen.append(zeile)
            zeile = wort
    zeilen.append(zeile)
    if len(zeilen) > hoechstens:
        zeilen = zeilen[:hoechstens]
        zeilen[-1] += "…"
    letzte = zeilen[-1]
    while breite(letzte) > platz and len(letzte) > 1:
        letzte = letzte[:-2] + "…"
    zeilen[-1] = letzte
    return zeilen


def _fuss(blatt, breite):
    blatt.setFillColor(LEISE)
    blatt.setFont(GRUND, 8)
    blatt.drawString(RAND_SEITE, 10 * mm, UNSERE_FIRMA)
    blatt.drawRightString(breite - RAND_SEITE, 10 * mm, f"Stand {timezone.localdate():%d.%m.%Y}")


def dateiname(thema):
    return f"Praktikum_{ascii_teil(thema.titel) or 'Thema'}.pdf"


def ascii_teil(titel):
    """
    Ein Titel als Teil eines Dateinamens.

    Nur ASCII: Ein Umlaut im Dateinamen des Content-Disposition-Kopfs kommt je
    nach Browser als Mojibake an. Ausgeschrieben statt ersetzt — aus „Prüfung"
    wird „Pruefung", nicht „Pr-fung".
    """
    for umlaut, aus in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")):
        titel = titel.replace(umlaut, aus)
    teil = "".join(z if z.isascii() and z.isalnum() else "-" for z in titel)
    return "-".join(t for t in teil.split("-") if t)
