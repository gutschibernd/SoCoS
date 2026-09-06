import pytest
from django.contrib.auth.models import Group

from socos import berechtigung
from socos.models import Nutzer


@pytest.fixture(autouse=True)
def rollen(db):
    """
    Die drei Rollen.

    Sie kommen eigentlich aus der Datenmigration 0002. Ein Test mit
    `transaction=True` leert die Datenbank aber am Ende vollständig — auch die
    Zeilen aus Datenmigrationen — und alle danach laufenden Tests fänden sie
    nicht mehr. Deshalb stehen sie hier noch einmal, statt dass die Testfolge
    von der Reihenfolge abhängt.
    """
    for name in berechtigung.ALLE_ROLLEN:
        Group.objects.get_or_create(name=name)


def _nutzer(email, name, rolle):
    n = Nutzer.objects.create_user(email=email, name=name)
    n.groups.add(Group.objects.get(name=rolle))
    return n


@pytest.fixture
def admin_nutzer(db):
    return _nutzer("admin@example.invalid", "Admin Person", berechtigung.ADMIN)


@pytest.fixture
def bearbeiter(db):
    return _nutzer("bearbeiter@example.invalid", "Bearbeitende Person", berechtigung.BEARBEITER)


@pytest.fixture
def leser(db):
    return _nutzer("leser@example.invalid", "Lesende Person", berechtigung.LESER)


@pytest.fixture
def ohne_rolle(db):
    return Nutzer.objects.create_user(email="ohne@example.invalid", name="Ohne Rolle")
