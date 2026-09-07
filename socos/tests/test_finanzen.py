"""
Kontostand, Kosten, Runway. Die Prognose ist eine Zahl, nach der jemand
entscheidet, ob er nächsten Monat noch eine Rechnung bezahlen kann.
"""

from datetime import date
from decimal import Decimal

import pytest

from socos.models import Fixkosten, Kontostand, Monatskosten
from socos.services import finanzen


@pytest.mark.django_db
class TestPrognose:
    def test_ohne_daten_gibt_es_keine_zahl(self):
        """
        None, nicht 0 und nicht „unendlich". Beides sähe aus wie eine Aussage,
        wäre aber nur die fehlende Eingabe.
        """
        assert finanzen.runway_in_monaten() is None
        betrag, grundlage = finanzen.erwartete_monatskosten()
        assert betrag is None
        assert "keine Kosten" in grundlage

    def test_ohne_ist_werte_zaehlen_die_fixkosten(self):
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        betrag, grundlage = finanzen.erwartete_monatskosten()
        assert betrag == Decimal("450.00")
        assert grundlage == "Fixkosten"

    def test_ab_drei_monaten_zaehlt_der_schnitt(self):
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        for monat, betrag in [(6, "600.00"), (7, "500.00"), (8, "700.00")]:
            Monatskosten.objects.create(monat=date(2026, monat, 1), betrag=Decimal(betrag))

        betrag, grundlage = finanzen.erwartete_monatskosten()
        assert betrag == Decimal("600.00")
        assert "letzten 3" in grundlage

    def test_zwei_monate_reichen_noch_nicht(self):
        """
        Aus zwei Monaten einen Schnitt zu bilden sähe belastbar aus und wäre es
        nicht. Dann lieber die geplante Zahl, die als geplant benannt ist.
        """
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        Monatskosten.objects.create(monat=date(2026, 7, 1), betrag=Decimal("2000.00"))
        Monatskosten.objects.create(monat=date(2026, 8, 1), betrag=Decimal("2000.00"))

        betrag, grundlage = finanzen.erwartete_monatskosten()
        assert betrag == Decimal("450.00")
        assert grundlage == "Fixkosten"

    def test_ein_ausreisser_haut_die_prognose_nicht_um(self):
        """
        Genau deshalb drei Monate: Ein einzelner Monat mit einer großen
        Anschaffung halbierte den Runway, und der nächste verdoppelte ihn
        wieder. Eine Zahl, die springt, benutzt niemand.
        """
        for monat, betrag in [(6, "500.00"), (7, "500.00"), (8, "2000.00")]:
            Monatskosten.objects.create(monat=date(2026, monat, 1), betrag=Decimal(betrag))
        betrag, _ = finanzen.erwartete_monatskosten()
        assert betrag == Decimal("1000.00")  # nicht 2000


@pytest.mark.django_db
class TestRunway:
    def test_kontostand_durch_erwartete_kosten(self):
        Kontostand.objects.create(datum=date(2026, 9, 1), betrag=Decimal("10000.00"))
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        assert finanzen.runway_in_monaten() == Decimal("22.2")

    def test_ohne_kontostand_keine_zahl(self):
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        assert finanzen.runway_in_monaten() is None

    def test_ist_immer_decimal(self):
        """Kein float. 0.1 + 0.2 ist dort nicht 0.3."""
        Kontostand.objects.create(datum=date(2026, 9, 1), betrag=Decimal("10000.00"))
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("300.00"))
        assert isinstance(finanzen.runway_in_monaten(), Decimal)


@pytest.mark.django_db
class TestFixkosten:
    def test_der_zuletzt_gueltige_zaehlt(self):
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        Fixkosten.objects.create(gueltig_ab=date(2026, 7, 1), betrag=Decimal("620.00"))
        assert finanzen.fixkosten_am(date(2026, 3, 1)) == Decimal("450.00")
        assert finanzen.fixkosten_am(date(2026, 9, 1)) == Decimal("620.00")
        assert finanzen.fixkosten_am() == Decimal("620.00")


@pytest.mark.django_db
def test_monatskosten_werden_auf_den_ersten_normiert():
    """Sonst gäbe es denselben Monat mehrfach und `unique` fiele nicht darüber."""
    k = Monatskosten.objects.create(monat=date(2026, 9, 17), betrag=Decimal("500.00"))
    k.refresh_from_db()
    assert k.monat == date(2026, 9, 1)
