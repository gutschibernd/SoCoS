"""
Fehler werden **an einer Stelle** übersetzt, nicht je ViewSet.

Zwei Fälle sind von Anfang an drin, weil sie sonst später jede neue Ressource
neu erwischen.
"""

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_standard


def fehler_behandeln(exc, context):
    # 409 statt 400: Die Anfrage war in Ordnung — es ist der Datenzustand, der
    # ihr entgegensteht. Ein 400 hieße "du hast falsch gefragt", und der Aufrufer
    # suchte den Fehler in seiner Anfrage statt in den Daten.
    if isinstance(exc, ProtectedError):
        haengt_dran = sorted({str(o) for o in exc.protected_objects})[:5]
        return Response(
            {
                "code": "in_verwendung",
                "detail": "Wird noch verwendet und kann darum nicht entfernt werden.",
                "verwendet_von": haengt_dran,
            },
            status=status.HTTP_409_CONFLICT,
        )

    antwort = drf_standard(exc, context)
    if antwort is None:
        return None

    # Die DRF-403 bekommt ein `code`. Ohne das kann das Frontend "nicht
    # angemeldet" nicht von "darfst du nicht" unterscheiden und schickt jemanden,
    # dem bloß eine Seite verwehrt ist, zurück zur Anmeldung — obwohl seine
    # Sitzung steht.
    if isinstance(exc, NotAuthenticated):
        antwort.data = {**_als_dict(antwort.data), "code": "not_authenticated"}
    elif isinstance(exc, PermissionDenied):
        antwort.data = {**_als_dict(antwort.data), "code": "permission_denied"}

    return antwort


def _als_dict(daten):
    if isinstance(daten, dict):
        return daten
    return {"detail": daten}
