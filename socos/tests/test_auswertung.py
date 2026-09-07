"""Auswertungen über Zeitbuchungen — und die Regeln, die dabei greifen."""

from datetime import datetime, timedelta

import pytest
from django.db.utils import IntegrityError
from django.utils import timezone

from socos.models import Arbeitspaket, Bereich, Bereichsart, Projekt, Zeitbuchung
from socos.services import auswertung, zeit


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    b = Bereich.objects.create(projekt=p, titel="Entwicklung", art=Bereichsart.DEV)
    return Arbeitspaket.objects.create(bereich=b, titel="Dauerlauftests")


def buchung(person, paket, start, minuten=None, entwurf=False):
    return Zeitbuchung.objects.create(
        person=person,
        paket=paket,
        start=start,
        ende=start + timedelta(minutes=minuten) if minuten else None,
        ist_entwurf=entwurf,
    )


@pytest.mark.django_db
class TestStufen:
    def test_bereich_bekommt_die_vorlage_seiner_art(self, paket):
        namen = [s["name"] for s in paket.bereich.stufen]
        assert namen == ["Konzept", "Umsetzung", "Test", "Abschluss"]

    def test_die_kopie_ist_danach_frei_aenderbar(self, paket):
        """
        Kopiert, nicht verwiesen: Eine Änderung an diesem Bereich darf keinen
        anderen berühren.
        """
        anderer = Bereich.objects.create(
            projekt=paket.bereich.projekt, titel="Zweite Entwicklung", art=Bereichsart.DEV
        )
        paket.bereich.stufen[1]["monate"] = 12
        paket.bereich.save()
        anderer.refresh_from_db()
        assert anderer.stufen[1]["monate"] == 3

    def test_fortschritt_rechnet_ueber_monate_nicht_ueber_anzahl(self, paket):
        """
        Konzept 1 · Umsetzung 3 · Test 2 · Abschluss 1 — sieben Monate. Nach
        dem Konzept ist ein Siebtel geschafft, nicht ein Viertel.
        """
        paket.stufenstand = 1
        assert auswertung.fortschritt(paket) == 14
        paket.stufenstand = 2
        assert auswertung.fortschritt(paket) == 57
        paket.stufenstand = 4
        assert auswertung.fortschritt(paket) == 100


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
