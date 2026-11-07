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

# Über welchen Weg gehandelt wird, wenn nicht über die Oberfläche — heute nur
# „Assistent" (der Telegram-Bot, siehe socos/assistent.py). Leer heißt: selbst
# in der Oberfläche. **Warum es im Protokoll stehen muss:** Bei „wer hat diese
# Zeit nachträglich geändert" ist „Bernd" nur die halbe Antwort, wenn es ein
# Bot war, der eine Sprachnachricht falsch verstanden hat.
_kanal: ContextVar = ContextVar("socos_kanal", default="")


def setzen(nutzer):
    """Setzt den Handelnden und gibt das Token zum Zurücksetzen zurück."""
    return _handelnder.set(nutzer)


def zuruecksetzen(token):
    _handelnder.reset(token)


def kanal_setzen(name):
    """Setzt den Kanal für den Rest der Anfrage; die Middleware räumt auf."""
    _kanal.set(name)


def kanal():
    return _kanal.get()


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
        # Erst die Anmeldung von DRF weiß, ob ein Schlüssel im Spiel ist; sie
        # setzt den Kanal (und den Handelnden) mitten in der Anfrage nach.
        # Das Zurücksetzen hier hebt beides wieder auf — `reset` stellt den
        # Stand von *vor* dem eigenen `set` her, gleich was dazwischen geschah.
        kanal_token = _kanal.set("")
        try:
            return self.get_response(request)
        finally:
            _kanal.reset(kanal_token)
            zuruecksetzen(token)
