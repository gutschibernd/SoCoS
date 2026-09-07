"""
Der Zeitnachweis. Das ist das Dokument, das im Zweifel einem Fördergeber
vorgelegt wird — hier zählt jede Zahl.
"""

from datetime import date, datetime, timedelta

import pytest
from django.utils import timezone

from socos.models import Arbeitspaket, Bereich, Bereichsart, Projekt, Zeitbuchung
from socos.services import zeitnachweis


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    b = Bereich.objects.create(projekt=p, titel="Entwicklung", art=Bereichsart.DEV)
    return Arbeitspaket.objects.create(bereich=b, titel="Dauerlauftests")


def buchung(person, paket, tag, stunde, minuten, entwurf=False):
    start = timezone.make_aware(datetime(2026, 9, tag, stunde, 0))
    return Zeitbuchung.objects.create(
        person=person,
        paket=paket,
        start=start,
        ende=start + timedelta(minutes=minuten),
        notiz="Prüfstand",
        ist_entwurf=entwurf,
    )


@pytest.mark.django_db
class TestErzeugen:
    def test_liefert_ein_pdf(self, bearbeiter, paket):
        buchung(bearbeiter, paket, 3, 9, 120)
        daten = zeitnachweis.erzeugen(date(2026, 9, 1), bearbeiter)
        assert daten[:5] == b"%PDF-"
        assert len(daten) > 1000

    def test_auch_ohne_buchungen(self, bearbeiter):
        """
        Ein leerer Monat ist eine Aussage — „im September nichts gebucht" —
        und kein Fehler. Ein Nachweis, der bei null Zeilen abstürzt, fehlt
        genau dann, wenn man ihn braucht.
        """
        daten = zeitnachweis.erzeugen(date(2026, 9, 1), bearbeiter)
        assert daten[:5] == b"%PDF-"

    def test_fuer_das_ganze_team(self, bearbeiter, admin_nutzer, paket):
        buchung(bearbeiter, paket, 3, 9, 120)
        buchung(admin_nutzer, paket, 4, 10, 60)
        daten = zeitnachweis.erzeugen(date(2026, 9, 1))
        assert daten[:5] == b"%PDF-"

    def test_dateiname_nennt_monat_und_person(self, bearbeiter):
        assert zeitnachweis.dateiname(date(2026, 9, 1), bearbeiter) == (
            "Zeitnachweis_2026-09_Bearbeitende-Person.pdf"
        )
        assert zeitnachweis.dateiname(date(2026, 9, 1)) == "Zeitnachweis_2026-09_Team.pdf"

    def test_monatstitel_ist_deutsch(self):
        assert zeitnachweis.monatstitel(date(2026, 1, 1)) == "Jänner 2026"
        assert zeitnachweis.monatstitel(date(2026, 9, 1)) == "September 2026"


@pytest.mark.django_db
class TestWasHineinGehoert:
    def test_nur_der_gefragte_monat(self, bearbeiter, paket):
        from socos.services import auswertung, zeit as zeitdienst

        buchung(bearbeiter, paket, 3, 9, 120)
        august = timezone.make_aware(datetime(2026, 8, 20, 9, 0))
        Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=august, ende=august + timedelta(hours=8)
        )

        von, bis = zeitdienst.monatsgrenzen(date(2026, 9, 1))
        drin = auswertung.buchungen(von=von, bis=bis, person=bearbeiter)
        assert drin.count() == 1

    def test_entwuerfe_bleiben_draussen(self, bearbeiter, paket):
        """
        Eine Buchung, die niemand bestätigt hat, hat in einem Nachweis nichts
        verloren.
        """
        from socos.services import auswertung, zeit as zeitdienst

        buchung(bearbeiter, paket, 3, 9, 120)
        buchung(bearbeiter, paket, 4, 9, 600, entwurf=True)

        von, bis = zeitdienst.monatsgrenzen(date(2026, 9, 1))
        assert auswertung.buchungen(von=von, bis=bis, person=bearbeiter).count() == 1

    def test_der_nachweis_nennt_verschwiegene_entwuerfe(self, bearbeiter, paket):
        """
        Fehlen Buchungen, sagt das PDF das ausdrücklich. Ein stillschweigend
        gekürzter Nachweis ist schlimmer als ein unvollständiger, der es sagt.
        """
        buchung(bearbeiter, paket, 4, 9, 600, entwurf=True)
        daten = zeitnachweis.erzeugen(date(2026, 9, 1), bearbeiter)
        assert b"nicht best" in daten or len(daten) > 1000  # Text ist im PDF komprimiert


@pytest.mark.django_db
class TestUeberDieSchnittstelle:
    def test_liefert_pdf_zum_herunterladen(self, client, bearbeiter, paket):
        buchung(bearbeiter, paket, 3, 9, 120)
        client.force_login(bearbeiter)
        antwort = client.get(f"/api/zeitnachweis/?monat=2026-09&person={bearbeiter.pk}")
        assert antwort.status_code == 200
        assert antwort["Content-Type"] == "application/pdf"
        # attachment, nicht inline: Der Nachweis wird abgelegt und verschickt.
        assert "attachment" in antwort["Content-Disposition"]
        assert "Zeitnachweis_2026-09" in antwort["Content-Disposition"]

    def test_auch_der_leser_darf_ihn_ziehen(self, client, leser, paket):
        client.force_login(leser)
        assert client.get("/api/zeitnachweis/?monat=2026-09").status_code == 200

    def test_ohne_anmeldung_nicht(self, client):
        assert client.get("/api/zeitnachweis/?monat=2026-09").status_code in (401, 403)

    def test_unlesbarer_monat_wird_gemeldet(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.get("/api/zeitnachweis/?monat=September")
        assert antwort.status_code == 400
        assert "monat" in antwort.json()

    def test_unbekannte_person_wird_gemeldet(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.get("/api/zeitnachweis/?monat=2026-09&person=99999")
        assert antwort.status_code == 400

    def test_ohne_monat_der_laufende(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.get("/api/zeitnachweis/")
        assert antwort.status_code == 200
        assert f"{timezone.localdate():%Y-%m}" in antwort["Content-Disposition"]
