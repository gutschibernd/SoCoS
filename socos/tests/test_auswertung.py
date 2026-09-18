"""Auswertungen über Zeitbuchungen — und die Regeln, die dabei greifen."""

from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from django.db.utils import IntegrityError
from django.utils import timezone

from socos.models import Arbeitspaket, Projektphase, Phasenart, Projekt, Zeitbuchung
from socos.services import auswertung, zeit


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    b = Projektphase.objects.create(projekt=p, titel="Entwicklung", art=Phasenart.DEV)
    return Arbeitspaket.objects.create(phase=b, titel="Dauerlauftests")


def buchung(person, paket, start, minuten=None, entwurf=False):
    return Zeitbuchung.objects.create(
        person=person,
        paket=paket,
        start=start,
        ende=start + timedelta(minutes=minuten) if minuten else None,
        ist_entwurf=entwurf,
    )


class TestFortschritt:
    """
    Gebuchte Zeit gegen das Pensum. Die Stufenleiste, aus der das bis
    2026-09-18 kam, hat nichts gemessen — das hier lässt sich nachrechnen.
    """

    def test_gebucht_gegen_pensum(self):
        # 10 von 40 Stunden
        assert auswertung.fortschritt(36000, Decimal("40")) == 25

    def test_ohne_pensum_gibt_es_keinen_fortschritt(self):
        """
        `None`, nicht 0: Ein Förderantrag ohne Pensum hat nicht „nichts
        geschafft", er hat keine Zahl, gegen die man rechnen könnte.
        """
        assert auswertung.fortschritt(36000, Decimal("0")) is None
        assert auswertung.fortschritt(36000, None) is None

    def test_ueber_hundert_bleibt_ueber_hundert(self):
        """Ein überzogenes Pensum soll das zeigen, nicht bei 100 stehen bleiben."""
        assert auswertung.fortschritt(180000, Decimal("40")) == 125

    def test_rundet_kaufmaennisch(self):
        # 1 h von 3 h = 33,33 %
        assert auswertung.fortschritt(3600, Decimal("3")) == 33


@pytest.mark.django_db
class TestSekundenJePaketUndPerson:
    def test_trennt_nach_person(self, paket, bearbeiter, admin_nutzer):
        start = timezone.now() - timedelta(hours=5)
        buchung(bearbeiter, paket, start, 60)
        buchung(bearbeiter, paket, start + timedelta(hours=1), 30)
        buchung(admin_nutzer, paket, start, 120)
        summen = auswertung.sekunden_je_paket_und_person()
        assert summen[(paket.pk, bearbeiter.pk)] == 5400
        assert summen[(paket.pk, admin_nutzer.pk)] == 7200


@pytest.mark.django_db
class TestLaufendeBuchung:
    def test_nur_eine_je_person(self, paket, bearbeiter):
        """
        Die Datenbank hält das fest, nicht nur der Code. Zwei laufende Uhren
        derselben Person wären eine Zeit, die doppelt gezählt wird.
        """
        buchung(bearbeiter, paket, timezone.now())
        with pytest.raises(IntegrityError):
            buchung(bearbeiter, paket, timezone.now())

    def test_zwei_personen_duerfen_gleichzeitig_laufen(self, paket, bearbeiter, admin_nutzer):
        buchung(bearbeiter, paket, timezone.now())
        buchung(admin_nutzer, paket, timezone.now())
        assert Zeitbuchung.objects.filter(ende__isnull=True).count() == 2

    def test_eine_laufende_zaehlt_bis_jetzt(self, paket, bearbeiter):
        b = buchung(bearbeiter, paket, timezone.now() - timedelta(minutes=30))
        assert 1780 < zeit.dauer(b) < 1820


@pytest.mark.django_db
class TestEntwuerfe:
    def test_zaehlen_in_keiner_summe_mit(self, paket, bearbeiter):
        """
        Ein Entwurf ist nicht bestätigt. Er soll sichtbar sein, aber keine
        Summe verfälschen — sonst steht in einem Nachweis eine Zahl, die
        niemand bestätigt hat.
        """
        start = timezone.now() - timedelta(hours=3)
        buchung(bearbeiter, paket, start, minuten=60)
        buchung(bearbeiter, paket, start - timedelta(days=1), minuten=600, entwurf=True)

        assert auswertung.sekunden_je_person()[bearbeiter.pk] == 3600

    def test_vergessener_clockout_wird_am_tagesende_geschnitten(self, paket, bearbeiter):
        gestern = timezone.now() - timedelta(days=1)
        b = buchung(bearbeiter, paket, gestern)

        geschnitten = auswertung.entwuerfe_aus_vergessenen_clockouts()
        assert len(geschnitten) == 1

        b.refresh_from_db()
        assert b.ist_entwurf is True
        assert timezone.localtime(b.ende).date() == timezone.localtime(gestern).date()
        assert timezone.localtime(b.ende).hour == 23

    def test_eine_heute_laufende_wird_nicht_angefasst(self, paket, bearbeiter):
        b = buchung(bearbeiter, paket, timezone.now() - timedelta(minutes=10))
        assert auswertung.entwuerfe_aus_vergessenen_clockouts() == []
        b.refresh_from_db()
        assert b.ende is None and b.ist_entwurf is False


@pytest.mark.django_db
class TestZeitraum:
    def test_ohne_angabe_kommt_alles(self, paket, bearbeiter):
        """
        Es gibt keine stille Zeitscheibe. Kein Filter auf „aktueller Monat",
        der Zahlen plausibel und falsch macht.
        """
        alt = timezone.make_aware(datetime(2024, 1, 15, 9, 0))
        buchung(bearbeiter, paket, alt, minuten=60)
        buchung(bearbeiter, paket, timezone.now() - timedelta(hours=2), minuten=60)
        assert auswertung.buchungen().count() == 2

    def test_von_und_bis_sind_einschliesslich(self, paket, bearbeiter):
        tag = timezone.make_aware(datetime(2026, 5, 10, 9, 0))
        buchung(bearbeiter, paket, tag, minuten=60)
        von = bis = tag.date()
        assert auswertung.buchungen(von=von, bis=bis).count() == 1

    def test_summen_werden_je_person_gerundet_nicht_je_buchung(self, paket, bearbeiter):
        start = timezone.now() - timedelta(hours=5)
        for i in range(3):
            buchung(bearbeiter, paket, start + timedelta(hours=i), minuten=2)
        # 3 × 2 min = 6 min → 5 min. Einzeln gerundet wären es 0.
        assert auswertung.sekunden_je_person()[bearbeiter.pk] == 300
