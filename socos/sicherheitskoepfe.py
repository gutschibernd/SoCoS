"""
Die Content-Security-Policy — was eine Seite von SoCoS laden und ausführen darf.

Django 5.2 bringt dafür nichts mit (erst 6.0), und für einen einzigen Kopf ist
eine Bibliothek zu viel. Gesetzt wird er hier und nicht im Caddyfile: Dann gilt
er auch lokal auf 8003, und ein Test hält ihn fest.

**Warum überhaupt:** React maskiert, was es zeichnet, und es gibt kein
`dangerouslySetInnerHTML`. Die Policy ist die zweite Linie für den Fall, dass
das einmal nicht mehr stimmt — ein eingeschleustes Skript läuft dann nicht,
und schickt die Sitzung auch nirgends hin.

`style-src 'unsafe-inline'` ist bewusst drin: Die Oberfläche setzt Breiten und
Farben einzelner Balken über `style`, die Anmeldeseite trägt ihren Stil im
Kopf. Eingeschleustes CSS ist ärgerlich, eingeschleustes Skript gefährlich —
die Grenze liegt bei `script-src`, und dort steht nur `'self'`.
"""

RICHTLINIE = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


class SicherheitskoepfeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        antwort = self.get_response(request)
        antwort.headers.setdefault("Content-Security-Policy", RICHTLINIE)
        return antwort
