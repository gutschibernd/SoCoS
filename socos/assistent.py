"""
Die Anmeldung des Assistenten — eines Telegram-Bots, der im Auftrag eines
Nutzers Aufgaben, Kontakte, Zeiten und Thoughts pflegt.

Der Bot läuft in einem eigenen Container und eigenem Repository
(`socos-assistent`) und spricht mit SoCoS **nur über diese API**, nie über die
Datenbank. Er schickt `Authorization: Bearer <schlüssel>`.

**Was er darf**, steht in `berechtigung.assistent_darf` — eine Erlaubnisliste.
Geprüft wird hier, bei der Anmeldung, und nicht je ViewSet: So gilt sie für
jeden DRF-Endpunkt, auch für die, die es heute noch nicht gibt.

**Im Protokoll** steht alles, was er tut, als „<Nutzer> · über Assistent".

**Warum kein DRF-`TokenAuthentication`:** Das speichert den Schlüssel im
Klartext in einer eigenen Tabelle (`authtoken`), die außerdem erst in die
Sicherung aufgenommen werden müsste. Hier ist es ein Feld am Nutzer, das nur
den Hash hält, und es wandert mit dem Nutzer ins Archiv.
"""

import hashlib
import secrets

from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from socos import aktueller_nutzer, berechtigung
from socos.models import Nutzer

#: Wie der Kanal im Protokoll heißt.
KANAL = "Assistent"

#: Vorsilbe, damit ein Schlüssel in einer `.env` oder einem Log als das zu
#: erkennen ist, was er ist — und ein Geheimnisscanner ihn findet.
VORSILBE = "socos_"


def _hash(schluessel):
    return hashlib.sha256(schluessel.encode("utf-8")).hexdigest()


def neuer_schluessel(nutzer):
    """
    Erzeugt einen Schlüssel, speichert seinen Hash und gibt ihn **einmal**
    zurück. Ein älterer Schlüssel ist damit tot.
    """
    schluessel = VORSILBE + secrets.token_urlsafe(32)
    nutzer.assistentschluessel = _hash(schluessel)
    nutzer.save(update_fields=["assistentschluessel"])
    return schluessel


def entziehen(nutzer):
    nutzer.assistentschluessel = None
    nutzer.save(update_fields=["assistentschluessel"])


class AssistentAnmeldung(BaseAuthentication):
    """
    Steht in `REST_FRAMEWORK` **hinter** der Sitzungsanmeldung. Die Reihenfolge
    ist nicht gleichgültig: Die erste Klasse bestimmt, ob eine fehlende
    Anmeldung 401 oder 403 heißt, und das Frontend erkennt „nicht angemeldet"
    an der 403 mit `code` (socos/fehler.py).
    """

    def authenticate(self, request):
        teile = get_authorization_header(request).split()
        if len(teile) != 2 or teile[0].lower() != b"bearer":
            return None  # kein Schlüssel — die Sitzung entscheidet

        schluessel = teile[1].decode("latin-1")
        nutzer = Nutzer.objects.filter(
            assistentschluessel=_hash(schluessel), is_active=True
        ).first()
        # Unbekannt, stillgelegt, ohne Rolle: dieselbe Antwort, wie beim
        # Kalender-Abo. Wer rät, soll nicht erfahren, wie nah er dran war.
        if nutzer is None or not berechtigung.darf_sehen(nutzer):
            raise exceptions.AuthenticationFailed("Unbekannter Schlüssel.")

        treffer = getattr(request._request, "resolver_match", None)
        if not berechtigung.assistent_darf(treffer.url_name if treffer else None, request.method):
            raise exceptions.PermissionDenied("Das darf der Assistent nicht.")

        # Die Middleware hat den Handelnden schon gesetzt — als anonym, weil
        # sie vom Schlüssel nichts weiß. Hier wird er nachgetragen; sie räumt
        # am Ende der Anfrage beides wieder ab.
        aktueller_nutzer.setzen(nutzer)
        aktueller_nutzer.kanal_setzen(KANAL)
        return nutzer, KANAL
