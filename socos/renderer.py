"""
Der eigene JSON-Renderer.

**Geld und Zeit sind `Decimal` und gehen als Zeichenkette hinaus.**

Für Felder, die durch einen Serializer laufen, erledigt das schon
`COERCE_DECIMAL_TO_STRING`. Für alles andere nicht: Die
DRF-Voreinstellung macht aus einem `Decimal` in einem gewöhnlichen dict —
etwa im Dashboard — kommentarlos einen `float`. JSON kennt nur Gleitkomma, und
dort ist 0.1 + 0.2 nicht 0.3. Bei Beträgen, die über ein Jahr summiert werden,
sind das Cent-Differenzen, die niemand mehr zuordnen kann.

Der Fehler wäre unsichtbar: `10000.0` sieht aus wie `"10000.00"`.
"""

from decimal import Decimal

from rest_framework.renderers import JSONRenderer
from rest_framework.utils.encoders import JSONEncoder


class SocosJSONEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class SocosJSONRenderer(JSONRenderer):
    encoder_class = SocosJSONEncoder
