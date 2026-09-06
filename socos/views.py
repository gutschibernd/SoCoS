"""Ansichten außerhalb der API."""

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db import connection
from django.http import HttpResponse, JsonResponse
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


@login_required
def anwendung(request):
    """
    Liefert die gebaute React-Anwendung.

    Lokal läuft stattdessen der Vite-Server auf 5176 und reicht `/api/` hierher
    weiter; diese Ansicht greift also nur in Produktion — und dann gibt es
    `frontend/dist/index.html`. Fehlt die Datei, sagt die Antwort, was zu tun
    ist, statt einen Stacktrace zu zeigen.
    """
    seite = settings.WURZEL / "frontend" / "dist" / "index.html"
    if not seite.exists():
        return HttpResponse(
            "Die Oberfläche ist nicht gebaut. `cd frontend && npm run build`.",
            status=503,
            content_type="text/plain; charset=utf-8",
        )
    return HttpResponse(seite.read_text(encoding="utf-8"))
