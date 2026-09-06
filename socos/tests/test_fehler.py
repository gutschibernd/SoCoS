"""
Die zentrale Fehlerübersetzung. Beide Fälle würden sonst jede neue Ressource
neu erwischen.
"""

import pytest
from django.db.models import ProtectedError
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from socos.fehler import fehler_behandeln


def test_protected_error_wird_409(db, admin_nutzer):
    """
    409 und nicht 400: Die Anfrage war in Ordnung — es ist der Datenzustand, der
    ihr entgegensteht. Bei 400 suchte der Aufrufer den Fehler in seiner Anfrage.
    """
    antwort = fehler_behandeln(ProtectedError("hängt dran", {admin_nutzer}), {})
    assert antwort.status_code == 409
    assert antwort.data["code"] == "in_verwendung"
    assert "Admin Person" in antwort.data["verwendet_von"]


def test_nicht_angemeldet_bekommt_eigenen_code():
    antwort = fehler_behandeln(NotAuthenticated(), {})
    assert antwort.status_code == 401 or antwort.status_code == 403
    assert antwort.data["code"] == "not_authenticated"


def test_verwehrt_bekommt_eigenen_code():
    """
    Ohne diese Unterscheidung schickt das Frontend jemanden, dem bloß eine Seite
    verwehrt ist, zurück zur Anmeldung — obwohl seine Sitzung steht.
    """
    antwort = fehler_behandeln(PermissionDenied(), {})
    assert antwort.status_code == 403
    assert antwort.data["code"] == "permission_denied"


def test_die_beiden_codes_sind_verschieden():
    a = fehler_behandeln(NotAuthenticated(), {}).data["code"]
    b = fehler_behandeln(PermissionDenied(), {}).data["code"]
    assert a != b
