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
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, Paragraph

from socos.services.leinwand import ascii_teil

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

RAND_SEITE = 20 * mm
# Wie weit die Schrift schrumpfen darf. Darunter ist ein Aushang aus einem
# Meter Abstand nicht mehr zu lesen — dann ist der Text zu lang, nicht die
# Schrift zu groß.
MASSSTAEBE = [1 - 0.04 * i for i in range(8)]   # 1,00 … 0,72


class PasstNicht(ValueError):
    """Die Ausschreibung passt auch in der kleinsten Schrift nicht auf die Seite."""


def _flaeche():
    """Links, unten, Breite, Höhe des Textfeldes zwischen Kopf und Kontakt."""
    breite, hoehe = A4
    oben = hoehe - 44 * mm
    unten = 52 * mm
    return RAND_SEITE, unten, breite - 2 * RAND_SEITE, oben - unten


def _absaetze(teile, s):
    """Die Flowables in der Größe `s` (1 = Grundgröße)."""
    stil = {
        "titel": ParagraphStyle(
            "titel", fontName="Helvetica-Bold", fontSize=25 * s, leading=29 * s,
            textColor=TEXT, spaceAfter=5 * mm * s,
        ),
        "einleitung": ParagraphStyle(
            "einleitung", fontName="Helvetica", fontSize=12 * s, leading=17 * s,
            textColor=LEISE, spaceAfter=3 * mm * s,
        ),
        "ueberschrift": ParagraphStyle(
            "ueberschrift", fontName="Helvetica-Bold", fontSize=12 * s, leading=15 * s,
            textColor=MARKE, spaceBefore=6 * mm * s, spaceAfter=2 * mm * s,
        ),
        "absatz": ParagraphStyle(
            "absatz", fontName="Helvetica", fontSize=10.5 * s, leading=15 * s,
            textColor=TEXT, spaceAfter=2 * mm * s,
        ),
        "punkt": ParagraphStyle(
            "punkt", fontName="Helvetica", fontSize=10.5 * s, leading=15 * s,
            textColor=TEXT, leftIndent=5 * mm * s, bulletIndent=0.5 * mm * s,
            spaceAfter=1.2 * mm * s,
        ),
    }
    fluss = []
    if teile["titel"]:
        fluss.append(Paragraph(_auszeichnung(teile["titel"]), stil["titel"]))
    for text in teile["einleitung"]:
        fluss.append(Paragraph(_auszeichnung(text), stil["einleitung"]))
    for abschnitt in teile["abschnitte"]:
        fluss.append(Paragraph(_auszeichnung(abschnitt["ueberschrift"]), stil["ueberschrift"]))
        for art, text in abschnitt["bloecke"]:
            if art == "punkt":
                fluss.append(Paragraph(
                    f'<bullet color="{AKZENT_TEXT}">&bull;</bullet>{_auszeichnung(text)}', stil["punkt"]
                ))
            else:
                fluss.append(Paragraph(_auszeichnung(text), stil["absatz"]))
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

    _kopf(blatt, breite, hoehe)

    # Die Zeile über dem Titel: was das hier ist. Kupfer, gesperrt — der eine
    # Ton, der auch am Brett „hier" heißt.
    blatt.setFillColor(AKZENT)
    blatt.setFont("Helvetica-Bold", 9)
    blatt.drawString(RAND_SEITE, hoehe - 40 * mm, "PRAKTIKUM", charSpace=2)

    links, unten, b, h = _flaeche()
    fluss = _absaetze(teile, s)
    Frame(
        links, unten, b, h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        showBoundary=0,
    ).addFromList(fluss, blatt)

    _kontakt(blatt, breite, teile["titel"])
    _fuss(blatt, breite)
    blatt.showPage()
    blatt.save()
    return puffer.getvalue()


def _kopf(blatt, breite, hoehe):
    """
    Der Briefkopf: die Firma in Worten, darunter eine Haarlinie mit einem
    kupfernen Stück am Anfang.

    **Kein Signet.** Das Zeichen in `socos/marke.py` ist das von SoCoS, dem
    internen Werkzeug — auf einem Aushang nach außen gehört es nicht hin.
    Ein Logo der Firma liegt im Repository nicht vor; bis eines da ist, trägt
    die Schrift den Kopf.
    """
    oben = hoehe - 18 * mm
    blatt.setFillColor(MARKE)
    blatt.setFont("Helvetica-Bold", 20)
    blatt.drawString(RAND_SEITE, oben, "Sopharmis")
    blatt.setFillColor(AKZENT)
    blatt.setFont("Helvetica", 7.5)
    blatt.drawString(RAND_SEITE, oben - 5 * mm, "MEDICAL SOLUTIONS", charSpace=2.2)

    blatt.setFillColor(LEISE)
    blatt.setFont("Helvetica", 9)
    blatt.drawRightString(breite - RAND_SEITE, oben, "Ausschreibung")
    blatt.drawRightString(breite - RAND_SEITE, oben - 5 * mm, KONTAKT)

    linie = oben - 10 * mm
    blatt.setStrokeColor(RAND)
    blatt.setLineWidth(0.6)
    blatt.line(RAND_SEITE, linie, breite - RAND_SEITE, linie)
    blatt.setStrokeColor(AKZENT)
    blatt.setLineWidth(1.6)
    blatt.line(RAND_SEITE, linie, RAND_SEITE + 24 * mm, linie)


def _kontakt(blatt, breite, titel):
    """Der Kasten unten: wohin man schreibt, und mit welchem Betreff."""
    x, y, b, h = RAND_SEITE, 20 * mm, breite - 2 * RAND_SEITE, 26 * mm
    blatt.setFillColor(MARKE_HELL)
    blatt.rect(x, y, b, h, stroke=0, fill=1)
    blatt.setFillColor(AKZENT)
    blatt.rect(x, y, 1.6 * mm, h, stroke=0, fill=1)

    innen = x + 8 * mm
    blatt.setFillColor(MARKE)
    blatt.setFont("Helvetica-Bold", 13)
    blatt.drawString(innen, y + h - 9 * mm, "Interesse? Schreib uns.")
    blatt.setFillColor(AKZENT)
    blatt.setFont("Helvetica-Bold", 16)
    blatt.drawString(innen, y + h - 16.5 * mm, KONTAKT)

    # Der Betreff hilft uns beim Zuordnen, wenn mehrere Aushänge hängen. Zu
    # lang gekürzt statt über den Kasten hinaus.
    betreff = f"Betreff: Praktikum – {titel}"
    platz = b - 16 * mm
    if blatt.stringWidth(betreff, "Helvetica", 9) > platz:
        while blatt.stringWidth(betreff + "…", "Helvetica", 9) > platz:
            betreff = betreff[:-1]
        betreff = betreff.rstrip() + "…"
    blatt.setFillColor(LEISE)
    blatt.setFont("Helvetica", 9)
    blatt.drawString(innen, y + 4.5 * mm, betreff)


def _fuss(blatt, breite):
    blatt.setStrokeColor(RAND)
    blatt.setLineWidth(0.6)
    blatt.line(RAND_SEITE, 14 * mm, breite - RAND_SEITE, 14 * mm)
    blatt.setFillColor(LEISE)
    blatt.setFont("Helvetica", 8)
    blatt.drawString(RAND_SEITE, 9.5 * mm, UNSERE_FIRMA)
    blatt.drawRightString(breite - RAND_SEITE, 9.5 * mm, f"Stand {timezone.localdate():%d.%m.%Y}")


def dateiname(thema):
    return f"Praktikum_{ascii_teil(thema.titel) or 'Thema'}.pdf"
