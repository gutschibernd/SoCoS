"""Das Signet — geprüft wird, was man ihm nicht ansieht.

Nicht geprüft wird, ob es schön ist. Geprüft wird das, woran es zweimal
gescheitert ist: krumme Maße, die bei 16 px zu einem grauen Verlauf werden,
und ein Rand, der am Homescreen unter die Rundung fällt.
"""

import pytest

from socos import marke

# Was am Homescreen frei bleiben muss. 8 von 64 sind 12,5 % — weniger geht auf
# einem Raster von 4 nicht, siehe die Rechnung in socos/marke.py. Splitter
# dürfen in den Rand hineinragen, sie sind Untergrund und dürfen angeschnitten
# werden; die Balken nicht.
RAND_IOS = 8


class TestBalken:
    def test_alle_masse_durch_vier_teilbar(self):
        """Sonst fällt bei 16 px eine Kante auf einen Bruchteil eines Pixels."""
        for x, y, breite, hoehe, _ in marke.BALKEN:
            assert x % 4 == 0 and y % 4 == 0
            assert breite % 4 == 0 and hoehe % 4 == 0

    def test_abstand_bleibt_im_sicheren_feld(self):
        """Der Grund, warum das Zeichen überarbeitet wurde: oben war kein Rand."""
        for x, y, breite, hoehe, _ in marke.BALKEN:
            assert x >= RAND_IOS
            assert y >= RAND_IOS
            assert x + breite <= marke.RASTER - RAND_IOS
            assert y + hoehe <= marke.RASTER - RAND_IOS

    def test_treppe_wird_nach_unten_schmaler(self):
        breiten = [breite for _, _, breite, _, _ in marke.BALKEN]
        assert breiten == sorted(breiten, reverse=True)

    def test_genau_ein_balken_ist_kupfern(self):
        """Es gibt einen Ton, der „das ist die Handlung" heißt. Genau einen."""
        kupferne = [b for b in marke.BALKEN if b[4] == marke.KUPFER]
        assert len(kupferne) == 1


class TestSplitter:
    def test_keiner_liegt_im_schutzhof(self):
        """Sonst steht ein Splitter an einem Balken und die Treppe franst aus."""
        hx, hy, hb, hh = marke.SCHUTZHOF
        for x, y, kante, _ in marke.SPLITTER:
            drin = x < hx + hb and x + kante > hx and y < hy + hh and y + kante > hy
            assert not drin, f"Splitter ({x}, {y}) liegt im Feld der Balken"

    def test_liegen_im_bild(self):
        for x, y, kante, _ in marke.SPLITTER:
            assert 0 <= x and x + kante <= marke.RASTER
            assert 0 <= y and y + kante <= marke.RASTER

    def test_masse_durch_zwei_teilbar(self):
        for x, y, kante, _ in marke.SPLITTER:
            assert x % 2 == 0 and y % 2 == 0 and kante % 4 == 0


class TestErzeuger:
    def test_alle_drei_gehen_dieselbe_liste_durch(self):
        """SVG, PIL und der PDF-Kopf zeichnen dasselbe Zeichen — oder keiner."""
        flaechen = list(marke.flaechen())
        assert len(flaechen) == len(marke.SPLITTER) + len(marke.BALKEN)

    def test_balken_liegen_ueber_den_splittern(self):
        flaechen = list(marke.flaechen())
        assert flaechen[-len(marke.BALKEN):] == marke.BALKEN

    def test_svg_nennt_jede_flaeche(self):
        svg = marke.als_svg()
        assert svg.count("<rect") == 1 + len(marke.SPLITTER) + len(marke.BALKEN)
        assert marke.GRUND in svg

    @pytest.mark.parametrize("kante", [16, 32, 180])
    def test_bild_hat_die_verlangte_kante(self, kante):
        assert marke.als_bild(kante).size == (kante, kante)
