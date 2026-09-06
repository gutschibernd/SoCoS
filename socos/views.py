"""Ansichten außerhalb der API."""

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache


@never_cache
def healthz(request):
    """
    Lebenszeichen für Container-Healthcheck und `deploy.sh`.

    Gefragt wird von innen (`127.0.0.1:8000/healthz/`, bewusst am Proxy vorbei),
    aber mit dem `Host` der öffentlichen Domain — sonst antwortet Django mit 400,
    weil 127.0.0.1 nicht in ALLOWED_HOSTS steht.

    Vom HTTPS-Redirect ausgenommen (siehe SECURE_REDIRECT_EXEMPT): sonst bekäme
    der Healthcheck eine 301 und der Dienst gälte dauerhaft als krank.

    Die Datenbank wird mitgeprüft. Ein Dienst, der antwortet, aber keine Daten
    erreicht, ist für den Aufrufer nicht besser als einer, der schweigt.
    """
    try:
        with connection.cursor() as zeiger:
            zeiger.execute("SELECT 1")
            zeiger.fetchone()
    except Exception as fehler:  # noqa: BLE001 — der Grund gehört in die Antwort
        return JsonResponse(
            {"status": "krank", "grund": f"Datenbank nicht erreichbar: {fehler}"},
            status=503,
        )
    return JsonResponse({"status": "gesund"})
