"""Der Befehl, der Phasen auflöst: Zeit bleibt erhalten, alles andere geht weich."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from socos.models import (
    Arbeitspaket,
    Pensum,
    Projekt,
    Projektphase,
    Protokolleintrag,
    Unteraufgabe,
    Zeitbuchung,
    auffangpaket,
)


@pytest.fixture
def alte_phase(admin_nutzer):
    projekt = Projekt.objects.create(titel="Arzneimittelspender")
    phase = Projektphase.objects.create(projekt=projekt, titel="Finanzierung", art="fin")
    paket = Arbeitspaket.objects.create(phase=phase, titel="Antrag KWF")
    Unteraufgabe.objects.create(paket=paket, titel="Budget")
    Pensum.objects.create(paket=paket, person=admin_nutzer, stunden=Decimal("10"))
    start = timezone.now() - timedelta(hours=3)
    Zeitbuchung.objects.create(person=admin_nutzer, paket=paket, start=start, ende=start + timedelta(hours=2))
    return phase


def test_ohne_ausfuehren_aendert_sich_nichts(alte_phase, admin_nutzer):
    call_command("phasen_aufloesen", "Finanzierung", "--als", admin_nutzer.email)
    assert Projektphase.objects.filter(pk=alte_phase.pk).exists()
    assert Zeitbuchung.objects.get().paket.phase == alte_phase


def test_bucht_um_und_entfernt_weich(alte_phase, admin_nutzer):
    call_command("phasen_aufloesen", str(alte_phase.pk), "--als", admin_nutzer.email, "--ausfuehren")

    buchung = Zeitbuchung.objects.get()
    assert buchung.paket == auffangpaket()
    # Die zwei Stunden stehen weiter im Nachweis.
    assert buchung.sekunden == 2 * 3600
    assert not Projektphase.objects.filter(pk=alte_phase.pk).exists()
    assert Projektphase.alle_objekte.get(pk=alte_phase.pk).geloescht_am is not None
    assert not Arbeitspaket.objects.filter(phase=alte_phase).exists()
    assert not Unteraufgabe.objects.exists()
    assert not Pensum.objects.exists()
    # Wer es war, steht im Protokoll — auch ohne Anfrage.
    umbuchung = Protokolleintrag.objects.get(modell="socos.Zeitbuchung", aktion="geaendert")
    assert umbuchung.nutzer == admin_nutzer


def test_lehnt_das_auffangpaket_und_unklare_titel_ab(admin_nutzer):
    overhead = auffangpaket().phase
    with pytest.raises(CommandError, match="Auffangpaket"):
        call_command("phasen_aufloesen", str(overhead.pk), "--als", admin_nutzer.email)

    projekt = Projekt.objects.create(titel="Zwei")
    Projektphase.objects.create(projekt=projekt, titel="Ziele", art="ziel")
    Projektphase.objects.create(projekt=projekt, titel="Ziele", art="ziel")
    with pytest.raises(CommandError, match="mehrmals"):
        call_command("phasen_aufloesen", "Ziele", "--als", admin_nutzer.email)
