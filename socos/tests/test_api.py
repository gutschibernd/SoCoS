"""
Die Schnittstelle. Geprüft wird, was fachlich entschieden wurde — nicht, dass
DRF funktioniert.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.db.utils import IntegrityError
from django.utils import timezone

from socos.models import (
    AUFFANG_PROJEKT,
    Arbeitspaket,
    Fixkosten,
    Kontostand,
    Organisation,
    Paketstatus,
    Pensum,
    Phasenart,
    Phasenstand,
    Projekt,
    Projektphase,
    Zeitbuchung,
)


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    b = Projektphase.objects.create(projekt=p, titel="Entwicklung", art=Phasenart.DEV)
    return Arbeitspaket.objects.create(phase=b, titel="Dauerlauftests")


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
        zweites = Arbeitspaket.objects.create(phase=paket.phase, titel="MVP")
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
class TestZeitOhnePaket:
    """
    Der Start ohne Paketwahl. Fachlich entschieden: Es gibt **keine** Buchung
    ohne Paket — solche Zeit landet auf dem Auffangpaket und wird später
    umgebucht.
    """

    def test_clock_in_ohne_paket_landet_auf_overhead(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post("/api/zeiten/clock_in/", {}, content_type="application/json")
        assert antwort.status_code == 201
        assert antwort.json()["projekt_titel"] == AUFFANG_PROJEKT

        gebucht = Arbeitspaket.objects.get(pk=antwort.json()["paket"])
        assert gebucht.ist_auffang is True

    def test_der_zweite_start_legt_kein_zweites_overhead_an(self, client, bearbeiter):
        """
        Sonst stünden nach einer Woche fünf Projekte „Overhead" im Baum und
        jede Auswertung teilte dieselbe Zeit auf fünf Töpfe auf.
        """
        client.force_login(bearbeiter)
        erste = client.post("/api/zeiten/clock_in/", {}, content_type="application/json").json()
        client.post("/api/zeiten/clock_out/", {}, content_type="application/json")
        zweite = client.post("/api/zeiten/clock_in/", {}, content_type="application/json").json()

        assert erste["paket"] == zweite["paket"]
        assert Projekt.objects.filter(titel=AUFFANG_PROJEKT).count() == 1

    def test_ein_vorhandenes_overhead_projekt_wird_benutzt(self, client, bearbeiter):
        """Kein zweites Projekt gleichen Namens daneben."""
        vorhanden = Projekt.objects.create(titel="Overhead")
        Projektphase.objects.create(projekt=vorhanden, titel="Laufendes", art=Phasenart.DEV)
        client.force_login(bearbeiter)

        buchung = client.post("/api/zeiten/clock_in/", {}, content_type="application/json").json()
        assert buchung["projekt"] == vorhanden.pk
        assert Projekt.objects.filter(titel__iexact=AUFFANG_PROJEKT).count() == 1

    def test_clock_out_bucht_auf_das_gewaehlte_paket_um(self, client, bearbeiter, paket):
        """
        Der Gegenpart zum Start ohne Paket: Beim Aufhören weiß man, woran man
        gearbeitet hat — beim Anfangen oft noch nicht.
        """
        client.force_login(bearbeiter)
        client.post("/api/zeiten/clock_in/", {}, content_type="application/json")
        beendet = client.post(
            "/api/zeiten/clock_out/",
            {"paket": paket.pk, "notiz": "Doku gelesen"},
            content_type="application/json",
        ).json()

        assert beendet["paket"] == paket.pk
        assert beendet["notiz"] == "Doku gelesen"

    def test_ein_unbekanntes_paket_wird_gemeldet_nicht_still_verworfen(
        self, client, bearbeiter
    ):
        """
        Sonst bliebe die Buchung auf Overhead stehen, obwohl die Oberfläche ein
        Paket geschickt hat — und niemand sähe warum.
        """
        client.force_login(bearbeiter)
        client.post("/api/zeiten/clock_in/", {}, content_type="application/json")
        antwort = client.post(
            "/api/zeiten/clock_out/", {"paket": 999_999}, content_type="application/json"
        )
        assert antwort.status_code == 400
        assert "paket" in antwort.json()

    def test_eine_bestehende_buchung_laesst_sich_umhaengen(self, client, bearbeiter, paket):
        """„Das Arbeitspaket ändern" gilt für alle Buchungen, nicht nur für die
        laufende."""
        anderes = Arbeitspaket.objects.create(phase=paket.phase, titel="MVP")
        buchung = Zeitbuchung.objects.create(
            person=bearbeiter,
            paket=paket,
            start=timezone.now() - timedelta(hours=2),
            ende=timezone.now() - timedelta(hours=1),
        )
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/zeiten/{buchung.pk}/", {"paket": anderes.pk}, content_type="application/json"
        )
        assert antwort.status_code == 200
        buchung.refresh_from_db()
        assert buchung.paket == anderes


@pytest.mark.django_db
class TestNachtragen:
    """
    Zeit nachtragen — der Weg ohne Uhr.

    Die Person kommt nicht mit: Man bucht fast immer für sich. Dass sie als
    Pflichtfeld im Serializer stand, hat **jedes** Nachtragen mit 400
    abgewiesen, und die Meldung („Dieses Feld ist zwingend erforderlich")
    nannte das Feld nicht, weil das Formular es gar nicht kennt.
    """

    def test_ohne_person_bucht_man_fuer_sich_selbst(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        start = timezone.now() - timedelta(hours=3)
        antwort = client.post(
            "/api/zeiten/",
            {
                "paket": paket.pk,
                "start": start.isoformat(),
                "ende": (start + timedelta(hours=2)).isoformat(),
                "notiz": "Meeting SPG",
            },
            content_type="application/json",
        )
        assert antwort.status_code == 201, antwort.json()
        assert antwort.json()["person"] == bearbeiter.pk

    def test_fuer_jemand_anderen_darf_wer_fremde_zeiten_aendern_darf(
        self, client, bearbeiter, admin_nutzer, paket
    ):
        """Zwei Personen im selben Meeting: dieselbe Spanne, zwei Buchungen."""
        client.force_login(bearbeiter)
        start = timezone.now() - timedelta(hours=3)
        antwort = client.post(
            "/api/zeiten/",
            {
                "person": admin_nutzer.pk,
                "paket": paket.pk,
                "start": start.isoformat(),
                "ende": (start + timedelta(hours=2)).isoformat(),
            },
            content_type="application/json",
        )
        assert antwort.status_code == 201, antwort.json()
        assert antwort.json()["person"] == admin_nutzer.pk

    def test_leser_darf_auch_fuer_sich_nichts_nachtragen(self, client, leser, paket):
        client.force_login(leser)
        start = timezone.now() - timedelta(hours=3)
        antwort = client.post(
            "/api/zeiten/",
            {"paket": paket.pk, "start": start.isoformat(), "ende": timezone.now().isoformat()},
            content_type="application/json",
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
class TestFortschrittAmPaket:
    """
    Das Paket bringt gebuchte Zeit, Pensum und den Fortschritt dazwischen
    mit — gerechnet, nicht gespeichert, und je Person gegen ihr Pensum.
    """

    def test_gebucht_pensum_und_fortschritt(self, client, bearbeiter, admin_nutzer, paket):
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("40"))
        Pensum.objects.create(paket=paket, person=admin_nutzer, stunden=Decimal("10"))
        start = timezone.now() - timedelta(hours=6)
        Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=start, ende=start + timedelta(hours=4)
        )
        Zeitbuchung.objects.create(
            person=admin_nutzer, paket=paket, start=start, ende=start + timedelta(hours=1)
        )
        client.force_login(bearbeiter)
        daten = client.get(f"/api/pakete/{paket.pk}/").json()
        assert daten["gebuchte_sekunden"] == 5 * 3600
        # Decimal → Zeichenkette (CLAUDE.md)
        assert daten["pensum_stunden"] == "50.00"
        assert daten["fortschritt"] == 10
        je_person = {p["person"]: p["gebuchte_sekunden"] for p in daten["pensen"]}
        assert je_person == {bearbeiter.pk: 4 * 3600, admin_nutzer.pk: 3600}

    def test_ohne_pensum_kein_fortschritt(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        daten = client.get(f"/api/pakete/{paket.pk}/").json()
        assert daten["pensum_stunden"] == "0"
        assert daten["fortschritt"] is None

    def test_auch_im_projektbaum(self, client, bearbeiter, paket):
        """
        Die Projektseite liest den Baum, nicht das einzelne Paket. Die Summen
        müssen dort genauso stehen — sonst zeigt der Balken 0.
        """
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("2"))
        start = timezone.now() - timedelta(hours=2)
        Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=start, ende=start + timedelta(hours=1)
        )
        client.force_login(bearbeiter)
        projekte = client.get("/api/projekte/").json()
        gefunden = projekte[0]["phasen"][0]["pakete"][0]
        assert gefunden["fortschritt"] == 50
        assert gefunden["pensen"][0]["gebuchte_sekunden"] == 3600

    def test_das_overhead_projekt_ist_als_auffang_markiert(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        client.post("/api/zeiten/clock_in/", {}, content_type="application/json")
        nach_titel = {p["titel"]: p["ist_auffang"] for p in client.get("/api/projekte/").json()}
        assert nach_titel["Overhead"] is True
        assert nach_titel[paket.phase.projekt.titel] is False


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
        antwort = client.delete(f"/api/projekte/{paket.phase.projekt.pk}/")
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
class TestOrganisationsprioritaet:
    """
    Das Verwertungspotential — eigenes Feld neben der Stufe, weil es etwas
    anderes sagt: Die Stufe misst die Nähe, die Priorität den Nutzen.
    """

    def test_ohne_angabe_ist_sie_nicht_eingeschaetzt(self, client, bearbeiter):
        """Kein geratener Mittelwert: „offen" ist eine Auskunft, „mittel" wäre eine Behauptung."""
        org = Organisation.objects.create(name="KWF")
        client.force_login(bearbeiter)
        daten = client.get(f"/api/organisationen/{org.pk}/").json()
        assert daten["prioritaet"] == "offen"

    def test_ein_bearbeiter_darf_sie_setzen(self, client, bearbeiter):
        org = Organisation.objects.create(name="FFG")
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/organisationen/{org.pk}/",
            {"prioritaet": "hoch"},
            content_type="application/json",
        )
        assert antwort.status_code == 200
        org.refresh_from_db()
        assert org.prioritaet == "hoch"

    def test_ein_erfundener_wert_kommt_nicht_durch(self, client, bearbeiter):
        """Sonst stünde in der Spalte ein Wort, das keine Sortierung kennt."""
        org = Organisation.objects.create(name="AWS")
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/organisationen/{org.pk}/",
            {"prioritaet": "sehr wichtig"},
            content_type="application/json",
        )
        assert antwort.status_code == 400


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


@pytest.mark.django_db
class TestNutzerverwaltung:
    def test_admin_setzt_eine_rolle(self, client, admin_nutzer, leser):
        client.force_login(admin_nutzer)
        antwort = client.post(
            f"/api/nutzer/{leser.pk}/rolle/",
            {"rolle": "bearbeiter"},
            content_type="application/json",
        )
        assert antwort.status_code == 200
        assert antwort.json()["rolle"] == "bearbeiter"
        leser.refresh_from_db()
        assert {g.name for g in leser.groups.all()} == {"bearbeiter"}

    def test_die_eigene_rolle_nicht(self, client, admin_nutzer):
        """
        Sonst nimmt sich der letzte Admin versehentlich selbst die Rechte und
        kommt an die Nutzerverwaltung nicht mehr heran.
        """
        client.force_login(admin_nutzer)
        antwort = client.post(
            f"/api/nutzer/{admin_nutzer.pk}/rolle/",
            {"rolle": "leser"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
        from socos import berechtigung

        assert berechtigung.rolle(admin_nutzer) == "admin"

    def test_bearbeiter_darf_keine_rollen_vergeben(self, client, bearbeiter, leser):
        client.force_login(bearbeiter)
        antwort = client.post(
            f"/api/nutzer/{leser.pk}/rolle/", {"rolle": "admin"}, content_type="application/json"
        )
        assert antwort.status_code == 403

    def test_unbekannte_rolle_wird_abgewiesen(self, client, admin_nutzer, leser):
        client.force_login(admin_nutzer)
        antwort = client.post(
            f"/api/nutzer/{leser.pk}/rolle/", {"rolle": "chef"}, content_type="application/json"
        )
        assert antwort.status_code == 400

    def test_stilllegen_und_wieder_aktivieren(self, client, admin_nutzer, leser):
        client.force_login(admin_nutzer)
        assert client.post(f"/api/nutzer/{leser.pk}/stilllegen/").status_code == 200
        leser.refresh_from_db()
        assert leser.is_active is False
        assert client.post(f"/api/nutzer/{leser.pk}/aktivieren/").status_code == 200
        leser.refresh_from_db()
        assert leser.is_active is True

    def test_das_eigene_konto_nicht_stilllegen(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        assert client.post(f"/api/nutzer/{admin_nutzer.pk}/stilllegen/").status_code == 400

    def test_konten_werden_nicht_geloescht(self, client, admin_nutzer, leser):
        """
        An einem Konto hängen Zeitbuchungen, die im Nachweis stehen bleiben
        müssen. Django hat mit is_active bereits den richtigen Schalter.
        """
        client.force_login(admin_nutzer)
        antwort = client.delete(f"/api/nutzer/{leser.pk}/")
        assert antwort.status_code == 400
        assert "stillgelegt" in str(antwort.json())

    def test_stillgelegte_sieht_nur_der_admin(self, client, admin_nutzer, bearbeiter, leser):
        """Sonst stünden sie in jeder Auswahlliste im Weg."""
        leser.is_active = False
        leser.save()

        client.force_login(bearbeiter)
        assert leser.pk not in [n["id"] for n in client.get("/api/nutzer/").json()]

        client.force_login(admin_nutzer)
        assert leser.pk in [n["id"] for n in client.get("/api/nutzer/").json()]


@pytest.mark.django_db
class TestProtokollAnsehen:
    def test_alle_duerfen_es_lesen(self, client, leser, paket):
        """
        „Wer hat diese Zeit nachträglich geändert" ist in einem MedTech-Umfeld
        keine Neugier.
        """
        antwort = client.get("/api/protokoll/")
        assert antwort.status_code in (401, 403)
        client.force_login(leser)
        antwort = client.get("/api/protokoll/")
        assert antwort.status_code == 200
        assert len(antwort.json()) > 0

    def test_niemand_darf_es_aendern(self, client, admin_nutzer):
        """Ein Protokoll, das man ändern kann, beantwortet die Frage nicht mehr."""
        client.force_login(admin_nutzer)
        eintrag = client.get("/api/protokoll/").json()[0]
        assert client.delete(f"/api/protokoll/{eintrag['id']}/").status_code == 405
        assert (
            client.patch(
                f"/api/protokoll/{eintrag['id']}/",
                {"aktion": "angelegt"},
                content_type="application/json",
            ).status_code
            == 405
        )

    def test_eine_geaenderte_zeit_steht_mit_alt_und_neu_darin(
        self, client, bearbeiter, paket
    ):
        start = timezone.now() - timedelta(hours=3)
        b = Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=start, ende=start + timedelta(hours=1)
        )
        client.force_login(bearbeiter)
        client.patch(
            f"/api/zeiten/{b.pk}/", {"notiz": "korrigiert"}, content_type="application/json"
        )

        eintraege = client.get(
            f"/api/protokoll/?modell=socos.Zeitbuchung&objekt={b.pk}"
        ).json()
        aenderung = [e for e in eintraege if e["aktion"] == "geaendert"][0]
        assert aenderung["aenderungen"]["notiz"] == {"alt": "", "neu": "korrigiert"}
        assert aenderung["nutzer_text"] == "Bearbeitende Person"


class TestBuchsperre:
    """
    Auf welche Pakete keine Zeit mehr laufen darf — **serverseitig**.

    Die Liste der buchbaren Stände stand bis 2026-09-18 nur im Frontend. Dort
    räumt sie das Auswahlfeld auf und hält nichts auf: Ein `POST` mit der
    Paketnummer ging durch, und die Zeit stand danach an einem Paket, das seit
    Monaten zu war. Genau deshalb gibt es diese Tests.
    """

    @pytest.mark.django_db
    def test_der_stand_wird_ueber_die_api_gesetzt(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        daten = client.patch(
            f"/api/phasen/{paket.phase.pk}/",
            {"stand": "abgeschlossen"},
            content_type="application/json",
        ).json()
        assert daten["stand"] == "abgeschlossen"
        assert client.get(f"/api/pakete/{paket.pk}/").json()["buchbar"] is False

        antwort = client.patch(
            f"/api/phasen/{paket.phase.pk}/", {"stand": "erfunden"}, content_type="application/json"
        )
        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_abgeschlossene_phase_nimmt_keine_zeit_an(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        paket.phase.stand = Phasenstand.ABGESCHLOSSEN
        paket.phase.save()

        antwort = client.post(
            "/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json"
        )
        assert antwort.status_code == 400
        # Der Satz nennt die Phase. „Nicht buchbar" sagte nicht, was los ist.
        assert "abgeschlossen" in str(antwort.json()["paket"])

    @pytest.mark.django_db
    def test_fertiges_paket_nimmt_keine_zeit_an(self, client, bearbeiter, paket):
        client.force_login(bearbeiter)
        paket.status = Paketstatus.FERTIG
        paket.save()

        antwort = client.post(
            "/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json"
        )
        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_nachtragen_auf_eine_abgeschlossene_phase_geht_nicht(
        self, client, bearbeiter, paket
    ):
        """Der zweite Weg zur Zeit — und er lief an `clock_in` vorbei."""
        client.force_login(bearbeiter)
        paket.phase.stand = Phasenstand.ABGESCHLOSSEN
        paket.phase.save()

        start = timezone.now() - timedelta(hours=3)
        antwort = client.post(
            "/api/zeiten/",
            {
                "paket": paket.pk,
                "start": start.isoformat(),
                "ende": (start + timedelta(hours=1)).isoformat(),
            },
            content_type="application/json",
        )
        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_eine_bestehende_buchung_bleibt_aenderbar(self, client, bearbeiter, paket):
        """
        Wird die Phase geschlossen, während schon Zeit darauf steht, muss sich
        ein Tippfehler in der Uhrzeit noch berichtigen lassen. Sonst wäre das
        Löschen der Zeit der einzige Ausweg.
        """
        client.force_login(bearbeiter)
        start = timezone.now() - timedelta(hours=3)
        b = Zeitbuchung.objects.create(
            person=bearbeiter, paket=paket, start=start, ende=start + timedelta(hours=1)
        )
        paket.phase.stand = Phasenstand.ABGESCHLOSSEN
        paket.phase.save()

        antwort = client.patch(
            f"/api/zeiten/{b.pk}/",
            {"ende": (start + timedelta(hours=2)).isoformat()},
            content_type="application/json",
        )
        assert antwort.status_code == 200

    @pytest.mark.django_db
    def test_die_laufende_uhr_laesst_sich_noch_stoppen(self, client, bearbeiter, paket):
        """Ein Clock-out ohne Zielwechsel wählt kein Paket — er beendet nur."""
        client.force_login(bearbeiter)
        Zeitbuchung.objects.create(person=bearbeiter, paket=paket, start=timezone.now())
        paket.phase.stand = Phasenstand.ABGESCHLOSSEN
        paket.phase.save()

        antwort = client.post(
            "/api/zeiten/clock_out/", {"notiz": "fertig"}, content_type="application/json"
        )
        assert antwort.status_code == 200


class TestPensum:
    @pytest.mark.django_db
    def test_stunden_kommen_als_zeichenkette(self, client, bearbeiter, paket):
        """
        Decimal, nicht Gleitkomma (CLAUDE.md). Bei Stunden, die über ein Jahr
        summiert werden, sind das Differenzen, die niemand mehr zuordnet.
        """
        client.force_login(bearbeiter)
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("270.25"))

        daten = client.get("/api/projekte/").json()
        pensen = daten[0]["phasen"][0]["pakete"][0]["pensen"]
        assert pensen[0]["stunden"] == "270.25"
        assert pensen[0]["person_name"] == bearbeiter.name

    @pytest.mark.django_db
    def test_zweimal_dieselbe_person_am_selben_paket_geht_nicht(self, bearbeiter, paket):
        """Zwei Pensen für dieselbe Arbeit — keine Anzeige könnte entscheiden,
        welches gilt."""
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("40"))
        with pytest.raises(IntegrityError):
            Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("90"))
