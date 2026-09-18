"""
Das Signet der Marke: vier abgestufte Balken — Projekt · Projektphase ·
Arbeitspaket · Unteraufgabe — auf einem dunklen Feld mit gestreuten Splittern.
Der kupferne Balken ist das Arbeitspaket, die Ebene, an der die Uhr hängt und
an der jede Buchung klebt.

**Die Geometrie steht hier ein einziges Mal.** Favicon, ICO, Apple-Touch-Icon
und der Kopf des Zeitnachweises zeigen dasselbe Zeichen. Lägen die Maße
mehrfach vor, wäre nach der ersten Korrektur eines davon falsch — und man
sieht es erst im Browser-Reiter oder auf einem Blatt, das schon verschickt ist.

Auch die Oberfläche zeichnet nichts nach: Kopfleiste und Anmeldeseite binden
`statisch/favicon.svg` als Bild ein.

Die Dateien erzeugt `python manage.py symbole`.
"""

from PIL import Image, ImageDraw

# Die Farben stehen auch in frontend/src/stil/farben.css. Sie stehen hier ein
# zweites Mal, weil eine Bilddatei kein CSS liest.
#
# Das Kupfer ist der **dunkle** Wert der Palette (--akzent im dunklen Thema),
# nicht #8A5638. Auf dem dunklen Grün fällt der helle Wert zu: gemessen 1,7:1.
GRUND = "#072B2D"
HELL = "#FFFFFF"
KUPFER = "#C88A63"

RASTER = 64

# x, y, Breite, Höhe, Farbe — y von oben, wie im SVG.
#
# **Alle Maße sind durch 4 teilbar.** Bei 16 px ist eine Rastereinheit genau
# ein Viertelpixel; nur so fällt jede Kante auf eine ganze Pixelgrenze. Die
# erste Fassung (Höhe 7, Abstand 5, Rand 10) lag auf 1,75 Pixeln je Balken —
# im Reiter wurde daraus ein grauer Verlauf statt vier Balken.
#
# **Der Abstand ist 4, nicht 8, und dafür gibt es einen zweiten Grund.** Mit
# Abstand 8 war die Treppe 56 hoch und lief von y 4 bis 60 — am iPhone schnitt
# die Rundung des Homescreens (rund 22 % Radius, dazu die Superellipse an den
# Kanten) dem obersten Balken beide Enden ab. Mit Abstand 4 ist sie 44 hoch
# und sitzt bei y 12..56, x 12..52. Bei 16 px sind das 2 px Balken auf 1 px
# Luft — beides ganze Pixel.
#
# **Warum oben 12 und unten 8 Rand steht und nicht 10/10:** Auf einem Raster
# von 4 ist der Schritt von Balken zu Balken 12, die Treppe also zwangsläufig
# 44 hoch; die übrigen 20 Einheiten teilen sich nur in 12/8 oder 8/12. Der
# breiteste Balken steht oben und läuft als einziger in die Rundung — er
# bekommt den größeren Rand.
BALKEN = [
    (12, 12, 40, 8, HELL),     # Projekt
    (12, 24, 32, 8, HELL),     # Projektphase
    (12, 36, 24, 8, KUPFER),   # Arbeitspaket — hier hängt die Uhr
    (12, 48, 16, 8, HELL),     # Unteraufgabe
]

# x, y, Kantenlänge, Farbe — Splitter im Untergrund, „Terrazzo".
#
# **Sie stehen als feste Liste da und werden nicht gewürfelt.** Gewürfelt sähe
# jeder Lauf von `manage.py symbole` anders aus, und der Unterschied fiele erst
# im Reiter neben einem alten Lesezeichen auf.
#
# Die Töne sind fertig gemischt: Die Entwürfe hatten eine Deckung je Splitter,
# die ist hier in den Farbwert gerechnet. Sonst müssten SVG und PIL dieselbe
# Mischung zweimal treffen — und PIL rechnet anders als ein Browser.
#
# **Die Reihenfolge trägt Bedeutung**, wo Splitter einander überlappen: der
# spätere liegt oben. Nicht sortieren.
#
# Keiner von ihnen liegt im Feld der Balken (x 10..54, y 10..58). Der Schutzhof
# ist der Grund, warum das Zeichen auch bei 16 px noch vier Balken zeigt und
# nicht ein gesprenkeltes Quadrat.
SPLITTER = [
    (4, 52, 4, "#2D6464"),
    (58, 32, 4, "#0B3133"),
    (4, 34, 4, "#423B2D"),
    (60, 14, 4, "#559F9D"),
    (2, 14, 8, "#0B4144"),
    (6, 36, 4, "#478A89"),
    (36, 2, 4, "#326B6B"),
    (4, 36, 4, "#133E41"),
    (58, 30, 4, "#403B2D"),
    (60, 16, 4, "#73482C"),
    (2, 46, 4, "#144042"),
    (56, 42, 8, "#0E3639"),
    (30, 2, 4, "#0F3639"),
    (56, 8, 8, "#804C2C"),
    (2, 12, 8, "#0C484C"),
    (0, 36, 4, "#0E3437"),
    (54, 12, 4, "#3A7877"),
    (54, 30, 4, "#62442C"),
    (32, 0, 4, "#10373A"),
    (0, 50, 4, "#133D40"),
    (6, 14, 4, "#4D3E2D"),
    (30, 58, 4, "#164245"),
    (58, 24, 4, "#0D3436"),
    (8, 0, 4, "#0E3537"),
    (0, 0, 4, "#0B4044"),
    (0, 16, 4, "#0C3235"),
]

#: Das Feld, das den Balken gehört. Kein Splitter liegt darin — geprüft in
#: socos/tests/test_marke.py.
SCHUTZHOF = (10, 10, 44, 48)   # x, y, Breite, Höhe


def flaechen():
    """Splitter, dann Balken — in genau dieser Zeichenreihenfolge.

    Alle drei Erzeuger (SVG, PIL, der PDF-Kopf in services/zeitnachweis.py)
    gehen diese eine Liste durch. Zeichnete einer davon nur `BALKEN`, hätte
    SoCoS zwei Zeichen — und das zweite fiele erst auf einem Blatt auf, das
    schon unterwegs ist."""
    for x, y, kante, farbe in SPLITTER:
        yield x, y, kante, kante, farbe
    for x, y, breite, hoehe, farbe in BALKEN:
        yield x, y, breite, hoehe, farbe


def als_svg():
    zeilen = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
        "  <!-- SoCoS. Erzeugt aus socos/marke.py — dort ändern, nicht hier. -->",
        f'  <rect width="64" height="64" fill="{GRUND}"/>',
    ]
    for x, y, breite, hoehe, farbe in flaechen():
        zeilen.append(
            f'  <rect x="{x}" y="{y}" width="{breite}" height="{hoehe}" fill="{farbe}"/>'
        )
    zeilen.append("</svg>\n")
    return "\n".join(zeilen)


def als_bild(kante):
    """Zeichnet groß und verkleinert erst dann.

    Direkt in 16 px gezeichnet, fiele jede Kante hart auf ein Pixelraster, das
    die Abstufung nicht mehr hergibt. Über die Verkleinerung bleiben die vier
    Ebenen erkennbar."""
    gross = 8 * RASTER
    bild = Image.new("RGB", (gross, gross), GRUND)
    stift = ImageDraw.Draw(bild)
    f = gross / RASTER
    for x, y, breite, hoehe, farbe in flaechen():
        stift.rectangle(
            [x * f, y * f, (x + breite) * f - 1, (y + hoehe) * f - 1], fill=farbe
        )
    return bild.resize((kante, kante), Image.LANCZOS)
