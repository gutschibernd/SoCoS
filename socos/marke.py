"""
Das Signet der Marke: vier abgestufte Balken — Projekt · Bereich ·
Arbeitspaket · Unteraufgabe. Der kupferne ist das Arbeitspaket, die Ebene, an
der die Uhr hängt und an der jede Buchung klebt.

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
GRUND = "#0F4448"
HELL = "#FFFFFF"
KUPFER = "#C88A63"

RASTER = 64

# x, y, Breite, Höhe, Farbe — y von oben, wie im SVG.
#
# **Alle Maße sind durch 4 teilbar.** Bei 16 px ist eine Rastereinheit genau
# ein Viertelpixel; nur so fällt jede Kante auf eine ganze Pixelgrenze. Die
# erste Fassung (Höhe 7, Abstand 5, Rand 10) lag auf 1,75 Pixeln je Balken —
# im Reiter wurde daraus ein grauer Verlauf statt vier Balken.
BALKEN = [
    (12, 4, 40, 8, HELL),     # Projekt
    (12, 20, 32, 8, HELL),    # Bereich
    (12, 36, 24, 8, KUPFER),  # Arbeitspaket — hier hängt die Uhr
    (12, 52, 16, 8, HELL),    # Unteraufgabe
]


def als_svg():
    zeilen = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
        "  <!-- SoCoS. Erzeugt aus socos/marke.py — dort ändern, nicht hier. -->",
        f'  <rect width="64" height="64" fill="{GRUND}"/>',
    ]
    for x, y, breite, hoehe, farbe in BALKEN:
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
    for x, y, breite, hoehe, farbe in BALKEN:
        stift.rectangle(
            [x * f, y * f, (x + breite) * f - 1, (y + hoehe) * f - 1], fill=farbe
        )
    return bild.resize((kante, kante), Image.LANCZOS)
