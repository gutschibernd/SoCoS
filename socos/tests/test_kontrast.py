"""
Kontrast der Palette — gerechnet, nicht geschaut.

Der Entwurf brachte für die gedämpften Töne `#7C8A8C` und `#8B979A` mit. Auf
Weiß gemessen sind das 3,58:1 und 3,00:1; WCAG AA verlangt für Text unter 18 px
mindestens 4,5:1. Genau in diesen Tönen stehen die 11-px-Beschriftungen über
jeder Karte — also der kleinste Text der ganzen Anwendung.

Dieser Test rechnet die Werte aus `farben.css` nach. Er braucht keinen Browser
und fällt, sobald jemand einen Ton wieder aufhellt.
"""

import re
from pathlib import Path

import pytest

WURZEL = Path(__file__).resolve().parent.parent.parent
FARBEN = WURZEL / "frontend" / "src" / "stil" / "farben.css"

# WCAG 2.1: 4,5:1 für Text unter 18 px (bzw. unter 14 px fett), 3:1 darüber.
AA_KLEIN = 4.5


def _luminanz(hexfarbe):
    hexfarbe = hexfarbe.lstrip("#")
    teile = [int(hexfarbe[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in teile]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def kontrast(a, b):
    la, lb = _luminanz(a), _luminanz(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def _palette(block):
    """Die Farbwerte eines :root-Blocks aus farben.css."""
    text = FARBEN.read_text()
    start = text.index(block)
    ende = text.index("}", start)
    return dict(re.findall(r"(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})", text[start:ende]))


HELL = _palette(":root {")
DUNKEL = _palette(':root[data-thema="dunkel"] {')


class TestKontrastHell:
    @pytest.mark.parametrize("vordergrund", ["--text", "--text-leise", "--text-sehr-leise"])
    @pytest.mark.parametrize("hintergrund", ["--flaeche", "--grund", "--flaeche-leise"])
    def test_text_auf_allen_flaechen(self, vordergrund, hintergrund):
        wert = kontrast(HELL[vordergrund], HELL[hintergrund])
        assert wert >= AA_KLEIN, (
            f"{vordergrund} ({HELL[vordergrund]}) auf {hintergrund} "
            f"({HELL[hintergrund]}) erreicht nur {wert:.2f}:1."
        )

    def test_marke_als_text_auf_flaeche(self):
        """Links und Knopfbeschriftungen in der Markenfarbe."""
        assert kontrast(HELL["--marke"], HELL["--flaeche"]) >= AA_KLEIN

    def test_text_auf_der_markenflaeche(self):
        """Der Knopf: heller Text auf gefülltem Grund."""
        assert kontrast(HELL["--auf-marke"], HELL["--marke"]) >= AA_KLEIN

    @pytest.mark.parametrize(
        "text,flaeche",
        [
            ("--gut", "--gut-hell"),
            ("--warnung", "--warnung-hell"),
            ("--wartend", "--wartend-hell"),
            ("--marke", "--marke-hell"),
        ],
    )
    def test_statuschips(self, text, flaeche):
        """Die Statuschips: farbiger Text auf farbigem Grund, 12 px."""
        wert = kontrast(HELL[text], HELL[flaeche])
        assert wert >= AA_KLEIN, f"{text} auf {flaeche}: {wert:.2f}:1"

    def test_kopfleiste(self):
        for ton in ("--kopf-text", "--kopf-text-leise"):
            wert = kontrast(HELL[ton], HELL["--kopf-grund"])
            assert wert >= AA_KLEIN, f"{ton} auf --kopf-grund: {wert:.2f}:1"


class TestKontrastDunkel:
    @pytest.mark.parametrize("vordergrund", ["--text", "--text-leise", "--text-sehr-leise"])
    @pytest.mark.parametrize("hintergrund", ["--flaeche", "--grund", "--flaeche-leise"])
    def test_text_auf_allen_flaechen(self, vordergrund, hintergrund):
        wert = kontrast(DUNKEL[vordergrund], DUNKEL[hintergrund])
        assert wert >= AA_KLEIN, (
            f"dunkel: {vordergrund} auf {hintergrund} erreicht nur {wert:.2f}:1."
        )

    def test_text_auf_der_markenflaeche(self):
        """
        Der Knopf im Dunkeln. Hier stand einmal Weiß auf aufgehelltem Türkis —
        2,3:1. Dafür gibt es `--auf-marke` in beiden Paletten.
        """
        assert kontrast(DUNKEL["--auf-marke"], DUNKEL["--marke"]) >= AA_KLEIN

    def test_kopfleiste(self):
        for ton in ("--kopf-text", "--kopf-text-leise"):
            wert = kontrast(DUNKEL[ton], DUNKEL["--kopf-grund"])
            assert wert >= AA_KLEIN, f"dunkel: {ton} auf --kopf-grund: {wert:.2f}:1"


def test_die_urspruenglichen_entwurfstoene_wuerden_durchfallen():
    """
    Festgehalten, damit niemand sie versehentlich zurückholt: Die Grautöne aus
    dem Entwurf erreichen auf Weiß nur 3,58:1 und 3,00:1.
    """
    assert kontrast("#7C8A8C", "#FFFFFF") < AA_KLEIN
    assert kontrast("#8B979A", "#FFFFFF") < AA_KLEIN
