"""
Die Rollentabelle aus MEMORY.md als Test.

Nicht Django wird hier geprüft, sondern die fachliche Entscheidung: Anna darf
bearbeiten, aber nicht löschen und keine Finanzen eintragen; der Leser sieht
alles und ändert nichts.
"""

import pytest

from socos import berechtigung


@pytest.mark.parametrize(
    "wer,sehen,bearbeiten,loeschen,finanzen,nutzer_verwalten",
    [
        ("admin_nutzer", True, True, True, True, True),
        ("bearbeiter", True, True, False, False, False),
        ("leser", True, False, False, False, False),
        ("ohne_rolle", False, False, False, False, False),
    ],
)
def test_rollentabelle(request, wer, sehen, bearbeiten, loeschen, finanzen, nutzer_verwalten):
    n = request.getfixturevalue(wer)
    assert berechtigung.darf_sehen(n) is sehen
    assert berechtigung.darf_bearbeiten(n) is bearbeiten
    assert berechtigung.darf_loeschen(n) is loeschen
    assert berechtigung.darf_finanzen_eintragen(n) is finanzen
    assert berechtigung.darf_nutzer_verwalten(n) is nutzer_verwalten


def test_leser_sieht_auch_finanzen_und_fremde_stunden(leser):
    """So ausdrücklich entschieden — der Leser sieht alles, er ändert nur nichts."""
    assert berechtigung.darf_sehen(leser) is True


def test_bearbeiter_darf_fremde_zeiten_aendern(bearbeiter):
    assert berechtigung.darf_fremde_zeiten_aendern(bearbeiter) is True


def test_leser_darf_fremde_zeiten_nicht_aendern(leser):
    assert berechtigung.darf_fremde_zeiten_aendern(leser) is False


def test_stammdaten_nur_selbst_und_admin(admin_nutzer, bearbeiter, leser):
    assert berechtigung.darf_stammdaten_sehen(bearbeiter, bearbeiter) is True
    assert berechtigung.darf_stammdaten_sehen(admin_nutzer, bearbeiter) is True
    assert berechtigung.darf_stammdaten_sehen(leser, bearbeiter) is False
    assert berechtigung.darf_stammdaten_sehen(bearbeiter, leser) is False


def test_superuser_ist_admin_ohne_gruppe(db):
    from socos.models import Nutzer

    n = Nutzer.objects.create_superuser(email="root@example.invalid", name="Root")
    assert berechtigung.rolle(n) == berechtigung.ADMIN


def test_anonymer_darf_nichts():
    from django.contrib.auth.models import AnonymousUser

    a = AnonymousUser()
    assert berechtigung.rolle(a) is None
    assert berechtigung.darf_sehen(a) is False
    assert berechtigung.darf_bearbeiten(a) is False
