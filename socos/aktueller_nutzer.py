"""
Wer gerade handelt — für das Änderungsprotokoll.

**Warum eine ContextVar und nicht ein Parameter an jedem `save()`:**
Das Protokoll ist nur so viel wert, wie es vollständig ist. Ein `nutzer=`-Argument,
das man an jeder Schreibstelle mitgeben muss, wird irgendwo vergessen — und dann
steht dort ein anonymer Eintrag, ohne dass jemand etwas merkt. Der Fehler fällt erst
auf, wenn man das Protokoll braucht.

Das ist ausdrücklich **kein** stiller Datenfilter (siehe CLAUDE.md): hier wird nichts
weggelassen und keine Abfrage eingeschränkt. Es wird nur festgehalten, wer der
Auslöser war.
"""

from contextvars import ContextVar

_handelnder: ContextVar = ContextVar("socos_handelnder", default=None)


def setzen(nutzer):
    """Setzt den Handelnden und gibt das Token zum Zurücksetzen zurück."""
    return _handelnder.set(nutzer)


def zuruecksetzen(token):
    _handelnder.reset(token)


def holen():
    """Der handelnde Nutzer, oder None bei Aufrufen ohne Anfrage (Befehle, Tests)."""
    nutzer = _handelnder.get()
    if nutzer is not None and getattr(nutzer, "is_authenticated", False):
        return nutzer
    return None


class HandelnderMiddleware:
    """Hinterlegt den angemeldeten Nutzer für die Dauer der Anfrage."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = setzen(getattr(request, "user", None))
        try:
            return self.get_response(request)
        finally:
            zuruecksetzen(token)
