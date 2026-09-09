"""
Events und die Hitlist.

Geprüft wird, was fachlich entschieden wurde: eine Zeile der Hitlist zeigt auf
genau eines, dieselbe Zeile gibt es nur einmal, und der Verlauf eines Events
steht an derselben Stelle wie jeder andere Verlauf — beim Kontakt.
"""

import pytest

from socos.models import Event, Eventziel, Kontakt, Organisation, Verlaufseintrag


@pytest.fixture
def event(db):
    return Event.objects.create(titel="MedTech Days", ort="Wien", von="2026-10-14")


@pytest.fixture
def haus(db):
    return Organisation.objects.create(name="Förderstelle Nord", typ="Förderstelle")


@pytest.fixture
def person(db, haus):
    return Kontakt.objects.create(organisation=haus, name="Berger", funktion="Programmleitung")


class TestHitlist:
    @pytest.mark.django_db
    def test_eine_zeile_zeigt_auf_genau_eines(self, client, bearbeiter, event, haus, person):
        client.force_login(bearbeiter)

        beides = client.post(
            "/api/eventziele/",
            {"event": event.pk, "organisation": haus.pk, "kontakt": person.pk},
            content_type="application/json",
        )
        assert beides.status_code == 400

        keines = client.post(
            "/api/eventziele/", {"event": event.pk}, content_type="application/json"
        )
        assert keines.status_code == 400

        assert not Eventziel.objects.exists()

    @pytest.mark.django_db
    def test_dieselbe_organisation_kommt_nicht_zweimal_auf_die_liste(
        self, client, bearbeiter, event, haus
    ):
        """
        Ein zweiter Klick ist ein Doppelklick, kein zweites Vorhaben. Er
        bekommt die vorhandene Zeile zurück statt einer Fehlermeldung.
        """
        client.force_login(bearbeiter)
        daten = {"event": event.pk, "organisation": haus.pk, "anliegen": "Antrag besprechen"}

        erste = client.post("/api/eventziele/", daten, content_type="application/json")
        zweite = client.post("/api/eventziele/", daten, content_type="application/json")

        assert erste.status_code == 201
        assert zweite.status_code == 201
        assert erste.json()["id"] == zweite.json()["id"]
        assert Eventziel.objects.count() == 1

    @pytest.mark.django_db
    def test_dieselbe_organisation_darf_auf_zwei_events_stehen(
        self, client, bearbeiter, event, haus
    ):
        zweites = Event.objects.create(titel="Kongress Graz", von="2026-11-03")
        client.force_login(bearbeiter)
        for e in (event, zweites):
            antwort = client.post(
                "/api/eventziele/",
                {"event": e.pk, "organisation": haus.pk},
                content_type="application/json",
            )
            assert antwort.status_code == 201
        assert Eventziel.objects.count() == 2

    @pytest.mark.django_db
    def test_die_liste_laesst_sich_auf_ein_event_einschraenken(
        self, client, leser, event, haus, person
    ):
        anderes = Event.objects.create(titel="Anderes", von="2026-12-01")
        Eventziel.objects.create(event=event, organisation=haus)
        Eventziel.objects.create(event=anderes, kontakt=person)

        client.force_login(leser)
        antwort = client.get(f"/api/eventziele/?event={event.pk}")
        assert antwort.status_code == 200
        assert [z["organisation"] for z in antwort.json()] == [haus.pk]

    @pytest.mark.django_db
    def test_die_person_bringt_ihr_haus_mit(self, client, leser, event, person, haus):
        """Zehn Namen ohne Organisation daneben sind zehn Namen."""
        Eventziel.objects.create(event=event, kontakt=person)
        client.force_login(leser)
        zeile = client.get(f"/api/events/{event.pk}/").json()["ziele"][0]
        assert zeile["kontakt_name"] == "Berger"
        assert zeile["kontakt_organisation"] == haus.name


class TestEvent:
    @pytest.mark.django_db
    def test_das_ende_darf_nicht_vor_dem_anfang_liegen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/events/",
            {"titel": "Rückwärts", "von": "2026-10-14", "bis": "2026-10-12"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
        assert "bis" in antwort.json()

    @pytest.mark.django_db
    def test_teilnehmer_werden_gespeichert(self, client, bearbeiter, admin_nutzer, event):
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/events/{event.pk}/",
            {"teilnehmer": [bearbeiter.pk, admin_nutzer.pk]},
            content_type="application/json",
        )
        assert antwort.status_code == 200
        assert sorted(antwort.json()["teilnehmer"]) == sorted([bearbeiter.pk, admin_nutzer.pk])
        assert set(antwort.json()["teilnehmer_namen"]) == {bearbeiter.name, admin_nutzer.name}

    @pytest.mark.django_db
    def test_ein_event_mit_hitlist_wird_nicht_geloescht(
        self, client, admin_nutzer, event, haus
    ):
        """
        409, nicht 400: Die Anfrage war in Ordnung, der Datenzustand steht ihr
        entgegen. Sonst verschwände die Hitlist als Waise aus jeder Liste und
        bliebe in der Datenbank.
        """
        Eventziel.objects.create(event=event, organisation=haus)
        client.force_login(admin_nutzer)
        antwort = client.delete(f"/api/events/{event.pk}/")
        assert antwort.status_code == 409
        assert Event.objects.filter(pk=event.pk).exists()

    @pytest.mark.django_db
    def test_geloeschte_hitlistzeilen_stehen_nicht_mehr_am_event(
        self, client, admin_nutzer, event, haus, person
    ):
        bleibt = Eventziel.objects.create(event=event, organisation=haus)
        Eventziel.objects.create(event=event, kontakt=person).delete()

        client.force_login(admin_nutzer)
        ziele = client.get(f"/api/events/{event.pk}/").json()["ziele"]
        assert [z["id"] for z in ziele] == [bleibt.pk]


class TestVerlaufAmEvent:
    @pytest.mark.django_db
    def test_ein_gespraech_am_event_steht_an_beiden_stellen(
        self, client, bearbeiter, event, person
    ):
        """
        Ein Feld am Verlaufseintrag, keine zweite Verlaufssorte: Der Eintrag
        steht am Event **und** beim Kontakt — es ist derselbe Eintrag.
        """
        client.force_login(bearbeiter)
        angelegt = client.post(
            "/api/verlauf/",
            {
                "kontakt": person.pk,
                "event": event.pk,
                "art": "event",
                "datum": "2026-10-14",
                "titel": "Am Stand angesprochen",
                "text": "Will die Unterlagen sehen.",
            },
            content_type="application/json",
        )
        assert angelegt.status_code == 201

        am_event = client.get(f"/api/events/{event.pk}/").json()["verlauf"]
        assert [e["titel"] for e in am_event] == ["Am Stand angesprochen"]
        assert am_event[0]["kontakt_name"] == "Berger"

        beim_kontakt = client.get(f"/api/kontakte/{person.pk}/").json()["verlauf"]
        assert [e["id"] for e in beim_kontakt] == [am_event[0]["id"]]
        assert beim_kontakt[0]["event_titel"] == "MedTech Days"

    @pytest.mark.django_db
    def test_ein_verlaufseintrag_braucht_kein_event(self, client, bearbeiter, person):
        """Die meisten Gespräche gehören zu keinem Event."""
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/verlauf/",
            {"kontakt": person.pk, "art": "call", "titel": "Rückruf"},
            content_type="application/json",
        )
        assert antwort.status_code == 201
        assert Verlaufseintrag.objects.get().event_id is None

    @pytest.mark.django_db
    def test_ein_event_mit_verlauf_wird_nicht_geloescht(
        self, client, admin_nutzer, event, person
    ):
        Verlaufseintrag.objects.create(
            kontakt=person, event=event, art="event", titel="Gespräch"
        )
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/events/{event.pk}/").status_code == 409
