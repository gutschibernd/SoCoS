"""
Die Schnittstelle. Geprüft wird, was fachlich entschieden wurde — nicht, dass
DRF funktioniert.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from socos.models import (
    Arbeitspaket,
    Bereich,
    Bereichsart,
    Fixkosten,
    Kontostand,
    Organisation,
    Projekt,
    Zeitbuchung,
)


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    b = Bereich.objects.create(projekt=p, titel="Entwicklung", art=Bereichsart.DEV)
    return Arbeitspaket.objects.create(bereich=b, titel="Dauerlauftests")


class TestBerechtigungAnDerSchnittstelle:
    @pytest.mark.django_db
    def test_leser_darf_alles_sehen(self, client, leser, paket):
        client.force_login(leser)
        assert client.get("/api/projekte/").status_code == 200
        assert client.get("/api/dashboard/").status_code == 200

    @pytest.mark.django_db
    def test_leser_darf_nichts_anlegen(self, client, leser):
        client.force_login(leser)
        antwort = client.post(
            "/api/projekte/", {"titel": "Neu"}, content_type="application/json"
        )
        assert antwort.status_code == 403
        assert antwort.json()["code"] == "permission_denied"

    @pytest.mark.django_db
    def test_bearbeiter_darf_anlegen_aber_nicht_loeschen(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        assert (
            client.post(
                "/api/projekte/", {"titel": "Claire@home"}, content_type="application/json"
            ).status_code
            == 201
        )
        assert client.delete(f"/api/pakete/{paket.pk}/").status_code == 403

    @pytest.mark.django_db
    def test_bearbeiter_darf_keine_finanzen_eintragen(self, client, bearbeiter):
        """Sehen ja, eintragen nein — so entschieden."""
        client.force_login(bearbeiter)
        assert client.get("/api/kontostaende/").status_code == 200
        antwort = client.post(
            "/api/kontostaende/",
            {"datum": "2026-09-01", "betrag": "10000.00"},
            content_type="application/json",
        )
        assert antwort.status_code == 403

    @pytest.mark.django_db
    def test_admin_darf_finanzen_eintragen(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        antwort = client.post(
            "/api/kontostaende/",
            {"datum": "2026-09-01", "betrag": "10000.00"},
            content_type="application/json",
        )
        assert antwort.status_code == 201


@pytest.mark.django_db
class TestGeldIstZeichenkette:
    def test_betraege_gehen_als_text_hinaus(self, client, admin_nutzer):
        """
        JSON kennt nur Gleitkomma, und dort ist 0.1 + 0.2 nicht 0.3. Ein
        Betrag, der als Zahl hinausgeht, ist beim Summieren nicht mehr genau.
        """
        Kontostand.objects.create(datum=date(2026, 9, 1), betrag=Decimal("10000.55"))
        client.force_login(admin_nutzer)
        daten = client.get("/api/kontostaende/").json()
        assert daten[0]["betrag"] == "10000.55"
        assert isinstance(daten[0]["betrag"], str)

    def test_auch_im_dashboard(self, client, admin_nutzer):
        Kontostand.objects.create(datum=date(2026, 9, 1), betrag=Decimal("10000.00"))
        Fixkosten.objects.create(gueltig_ab=date(2026, 1, 1), betrag=Decimal("450.00"))
        client.force_login(admin_nutzer)
        fin = client.get("/api/dashboard/").json()["finanzen"]
        assert isinstance(fin["kontostand"], str)
        assert isinstance(fin["runway_monate"], str)


@pytest.mark.django_db
class TestZeitraum:
    def test_ohne_angabe_nimmt_das_dashboard_die_laufende_woche(self, client, bearbeiter):
        """Und sagt in der Antwort, welchen Zeitraum es genommen hat."""
        client.force_login(bearbeiter)
        zeitraum = client.get("/api/dashboard/").json()["zeitraum"]
        assert zeitraum["von"] and zeitraum["bis"]
        assert date.fromisoformat(zeitraum["bis"]) - date.fromisoformat(
            zeitraum["von"]
        ) == timedelta(days=6)

    def test_buchungen_ohne_zeitraum_liefern_alles(self, client, bearbeiter, paket):
        alt = timezone.make_aware(datetime(2020, 1, 15, 9, 0))
        Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=alt, ende=alt + timedelta(hours=1)
        )
        client.force_login(bearbeiter)
        assert len(client.get("/api/zeiten/").json()) == 1

    def test_unlesbares_datum_wird_gemeldet_nicht_verworfen(self, client, bearbeiter):
        """
        Ein still ignorierter Parameter liefert Zahlen für einen anderen
        Zeitraum als den gefragten — und die sehen richtig aus.
        """
        client.force_login(bearbeiter)
        antwort = client.get("/api/zeiten/?von=letzte-woche")
        assert antwort.status_code == 400
        assert "von" in antwort.json()


@pytest.mark.django_db
class TestUhr:
    def test_clock_in_startet_und_clock_out_beendet(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json"
        )
        assert antwort.status_code == 201
        assert antwort.json()["laeuft"] is True

        assert client.get("/api/zeiten/laufend/").json()["laufend"]["paket"] == paket.pk

        beendet = client.post(
            "/api/zeiten/clock_out/", {"notiz": "Testreihe 3"}, content_type="application/json"
        ).json()
        assert beendet["ende"] is not None
        assert beendet["notiz"] == "Testreihe 3"
        assert client.get("/api/zeiten/laufend/").json()["laufend"] is None

    def test_ein_zweites_clock_in_beendet_das_erste(self, client, bearbeiter, paket):
        """
        Zwei laufende Uhren wären eine doppelt gezählte Zeit. Das Nachfragen
        macht die Oberfläche — der Server darf nicht davon abhängen, dass
        jemand einen Dialog beantwortet.
        """
        zweites = Arbeitspaket.objects.create(bereich=paket.bereich, titel="MVP")
        client.force_login(bearbeiter)
        client.post("/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json")
        client.post(
            "/api/zeiten/clock_in/",
            {"paket": zweites.pk, "notiz": "umgeschwenkt"},
            content_type="application/json",
        )
        assert Zeitbuchung.objects.filter(ende__isnull=True).count() == 1
        erste = Zeitbuchung.objects.get(paket=paket)
        assert erste.ende is not None
        assert erste.notiz == "umgeschwenkt"

    def test_clock_out_ohne_laufende_buchung_meldet_das(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post("/api/zeiten/clock_out/", content_type="application/json")
        assert antwort.status_code == 400

    def test_leser_darf_die_uhr_nicht_starten(self, client, leser, paket):
        client.force_login(leser)
        antwort = client.post(
            "/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json"
        )
        assert antwort.status_code == 403


@pytest.mark.django_db
class TestEntwuerfe:
    def test_ein_vergessener_clockout_taucht_als_entwurf_auf(self, client, bearbeiter, paket):
        gestern = timezone.now() - timedelta(days=1)
        Zeitbuchung.objects.create(person=bearbeiter, paket=paket, start=gestern)

        client.force_login(bearbeiter)
        entwuerfe = client.get("/api/zeiten/entwuerfe/").json()
        assert len(entwuerfe) == 1
        assert entwuerfe[0]["ist_entwurf"] is True

    def test_bestaetigen_macht_ihn_zu_einer_echten_buchung(self, client, bearbeiter, paket):
        gestern = timezone.now() - timedelta(days=1)
        b = Zeitbuchung.objects.create(person=bearbeiter, paket=paket, start=gestern)
        client.force_login(bearbeiter)
        client.get("/api/zeiten/entwuerfe/")  # schneidet ab
        b.refresh_from_db()

        antwort = client.post(
            f"/api/zeiten/{b.pk}/entwurf_bestaetigen/",
            {"ende": (gestern + timedelta(hours=2)).isoformat(), "notiz": "vergessen"},
            content_type="application/json",
        )
        assert antwort.status_code == 200
        assert antwort.json()["ist_entwurf"] is False

    def test_ende_vor_start_wird_abgewiesen(self, client, bearbeiter, paket):
        gestern = timezone.now() - timedelta(days=1)
        b = Zeitbuchung.objects.create(person=bearbeiter, paket=paket, start=gestern)
        client.force_login(bearbeiter)
        client.get("/api/zeiten/entwuerfe/")
        antwort = client.post(
            f"/api/zeiten/{b.pk}/entwurf_bestaetigen/",
            {"ende": (gestern - timedelta(hours=1)).isoformat()},
            content_type="application/json",
        )
        assert antwort.status_code == 400


@pytest.mark.django_db
class TestStufenleiste:
    def test_ein_klick_setzt_stand_und_status(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        daten = client.post(
            f"/api/pakete/{paket.pk}/stufe/", {"stufenstand": 2}, content_type="application/json"
        ).json()
        assert daten["stufenstand"] == 2
        assert daten["status"] == "laeuft"
        assert daten["fortschritt"] == 57  # Konzept 1 + Umsetzung 3 von 7 Monaten

    def test_die_letzte_stufe_macht_fertig(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        daten = client.post(
            f"/api/pakete/{paket.pk}/stufe/", {"stufenstand": 4}, content_type="application/json"
        ).json()
        assert daten["status"] == "fertig"

    def test_bewusst_gesetzte_status_werden_nicht_ueberschrieben(self, client, bearbeiter, paket):
        """
        „eingereicht", „zugesagt", „verworfen" und „offene Frage" setzt jemand
        bewusst. Sie automatisch zu überschreiben, machte die Leiste
        gefährlich.
        """
        paket.status = "eingereicht"
        paket.save()
        client.force_login(bearbeiter)
        daten = client.post(
            f"/api/pakete/{paket.pk}/stufe/", {"stufenstand": 1}, content_type="application/json"
        ).json()
        assert daten["stufenstand"] == 1
        assert daten["status"] == "eingereicht"

    def test_ein_stand_ausserhalb_der_leiste_wird_abgewiesen(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        antwort = client.post(
            f"/api/pakete/{paket.pk}/stufe/", {"stufenstand": 99}, content_type="application/json"
        )
        assert antwort.status_code == 400


@pytest.mark.django_db
class TestLoeschen:
    def test_loeschen_ist_weich(self, client, admin_nutzer, paket):
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/pakete/{paket.pk}/").status_code == 204
        assert not Arbeitspaket.objects.filter(pk=paket.pk).exists()
        assert Arbeitspaket.alle_objekte.filter(pk=paket.pk).exists()

    def test_was_noch_gebraucht_wird_gibt_409_und_nennt_den_grund(
        self, client, admin_nutzer, paket
    ):
        """
        409 und nicht 400: Die Anfrage war in Ordnung, der Datenzustand steht
        ihr entgegen.
        """
        Zeitbuchung.objects.create(
            person=admin_nutzer,
            paket=paket,
            start=timezone.now() - timedelta(hours=2),
            ende=timezone.now(),
        )
        client.force_login(admin_nutzer)
        antwort = client.delete(f"/api/projekte/{paket.bereich.projekt.pk}/")
        assert antwort.status_code == 409
        assert antwort.json()["code"] == "in_verwendung"
        assert antwort.json()["verwendet_von"]


@pytest.mark.django_db
class TestStammdaten:
    def test_fremde_adresse_bleibt_verborgen(self, client, bearbeiter, leser):
        bearbeiter.strasse = "Musterweg 1"
        bearbeiter.geburtsdatum = date(1990, 5, 1)
        bearbeiter.save()

        client.force_login(leser)
        eintrag = [
            n for n in client.get("/api/nutzer/").json() if n["id"] == bearbeiter.pk
        ][0]
        assert "strasse" not in eintrag
        assert "geburtsdatum" not in eintrag
        assert eintrag["name"] == "Bearbeitende Person"

    def test_die_eigene_sieht_man(self, client, bearbeiter):
        bearbeiter.strasse = "Musterweg 1"
        bearbeiter.save()
        client.force_login(bearbeiter)
        eigen = [
            n for n in client.get("/api/nutzer/").json() if n["id"] == bearbeiter.pk
        ][0]
        assert eigen["strasse"] == "Musterweg 1"

    def test_admin_sieht_alle(self, client, admin_nutzer, bearbeiter):
        bearbeiter.strasse = "Musterweg 1"
        bearbeiter.save()
        client.force_login(admin_nutzer)
        fremd = [
            n for n in client.get("/api/nutzer/").json() if n["id"] == bearbeiter.pk
        ][0]
        assert fremd["strasse"] == "Musterweg 1"


@pytest.mark.django_db
class TestVerlauf:
    def test_gehoert_zu_genau_einem(self, client, bearbeiter):
        org = Organisation.objects.create(name="KWF")
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/verlauf/",
            {"organisation": org.pk, "art": "call", "titel": "Erstauskunft"},
            content_type="application/json",
        )
        assert antwort.status_code == 201
        # Beides zugleich ist nie gemeint.
        doppelt = client.post(
            "/api/verlauf/",
            {"art": "call", "titel": "Ohne Bezug"},
            content_type="application/json",
        )
        assert doppelt.status_code == 400

    def test_wer_bestimmt_der_server(self, client, bearbeiter, admin_nutzer):
        """Ein Feld, das der Aufrufer setzen darf, ist keine Auskunft mehr."""
        org = Organisation.objects.create(name="FFG")
        client.force_login(bearbeiter)
        daten = client.post(
            "/api/verlauf/",
            {"organisation": org.pk, "art": "mail", "titel": "X", "wer": admin_nutzer.pk},
            content_type="application/json",
        ).json()
        assert daten["wer"] == bearbeiter.pk


@pytest.mark.django_db
class TestWeichesLoeschenUndSchutz:
    def test_ein_leeres_projekt_laesst_sich_loeschen(self, client, admin_nutzer):
        p = Projekt.objects.create(titel="Verworfen")
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/projekte/{p.pk}/").status_code == 204

    def test_schutz_greift_auch_beim_weichen_loeschen(self, admin_nutzer, paket):
        """
        PROTECT greift nur beim echten Löschen. Weiches Löschen ist ein UPDATE
        — der Schutz liefe ins Leere, und die Zeitbuchungen wären Waisen: in
        keiner Liste mehr sichtbar, aber weiter in der Datenbank und im
        Nachweis.
        """
        from django.db.models import ProtectedError

        Zeitbuchung.objects.create(
            person=admin_nutzer,
            paket=paket,
            start=timezone.now() - timedelta(hours=1),
            ende=timezone.now(),
        )
        with pytest.raises(ProtectedError):
            paket.delete()
        assert Arbeitspaket.objects.filter(pk=paket.pk).exists()

    def test_eine_weich_geloeschte_buchung_haelt_nicht_mehr_fest(self, admin_nutzer, paket):
        """
        Sonst ließe sich nach dem ersten Löschen nie wieder etwas entfernen —
        das Gelöschte hielte für immer dagegen.
        """
        b = Zeitbuchung.objects.create(
            person=admin_nutzer,
            paket=paket,
            start=timezone.now() - timedelta(hours=1),
            ende=timezone.now(),
        )
        b.delete()
        paket.delete()
        assert not Arbeitspaket.objects.filter(pk=paket.pk).exists()

    def test_auch_ein_sammellöschen_prueft(self, admin_nutzer, paket):
        """
        Ein queryset.delete() als ein UPDATE wäre schneller und risse dabei
        genau die Beziehungen auf, die PROTECT verhindern soll.
        """
        from django.db.models import ProtectedError

        Zeitbuchung.objects.create(
            person=admin_nutzer,
            paket=paket,
            start=timezone.now() - timedelta(hours=1),
            ende=timezone.now(),
        )
        with pytest.raises(ProtectedError):
            Arbeitspaket.objects.filter(pk=paket.pk).delete()
