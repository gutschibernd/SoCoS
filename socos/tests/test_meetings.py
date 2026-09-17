"""
Meetings: Protokoll, Reihenfolge, Löschen — und was bewusst *nicht* im
Änderungsprotokoll steht.

Geprüft wird, was entschieden wurde, nicht Django: dass ein Meeting an nichts
hängen muss, dass das Einspielen eines Protokolls das alte ersetzt statt es zu
verdoppeln, dass ein entferntes Meeting seine Abschnitte mitnimmt, und dass die
Mitschrift nicht bei jedem Tastendruck einen Protokolleintrag schreibt.
"""

from datetime import date

import pytest

from socos.models import (
    Kontakt,
    Meeting,
    Meetingabschnitt,
    Organisation,
    Protokolleintrag,
)


@pytest.fixture
def haus(db):
    return Organisation.objects.create(name="Förderstelle Nord", typ="Förderstelle")


@pytest.fixture
def person(db, haus):
    return Kontakt.objects.create(organisation=haus, name="Berger", funktion="Programmleitung")


@pytest.fixture
def meeting(db):
    # Ein echtes Datum und keine Zeichenkette: Das Modell formatiert es in
    # seinem `__str__`, und das Änderungsprotokoll ruft den beim Anlegen auf.
    return Meeting.objects.create(titel="Abstimmung Antrag", datum=date(2026, 9, 15))


class TestAnlegen:
    @pytest.mark.django_db
    def test_ein_meeting_haengt_an_nichts(self, client, bearbeiter):
        """Weder Person noch Haus sind Pflicht — der Termin steht oft zuerst."""
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/meetings/",
            {"titel": "Erstgespräch", "datum": "2026-10-01"},
            content_type="application/json",
        )

        assert antwort.status_code == 201
        assert antwort.json()["personen"] == []
        assert antwort.json()["haeuser"] == []

    @pytest.mark.django_db
    def test_personen_und_haeuser_kommen_mit_namen_zurueck(
        self, client, bearbeiter, meeting, person, haus
    ):
        client.force_login(bearbeiter)

        antwort = client.patch(
            f"/api/meetings/{meeting.pk}/",
            {"kontakte": [person.pk], "organisationen": [haus.pk]},
            content_type="application/json",
        )

        assert antwort.status_code == 200
        assert antwort.json()["personen"] == [
            {"id": person.pk, "name": "Berger", "organisation_name": "Förderstelle Nord"}
        ]
        assert antwort.json()["haeuser"] == [{"id": haus.pk, "name": "Förderstelle Nord"}]

    @pytest.mark.django_db
    def test_das_meeting_steht_im_verlauf_der_person(self, client, bearbeiter, meeting, person):
        """
        Die Kontakteseite führt Verlauf und Meetings in einem Strang — dafür
        muss der Kontakt seine Meetings mitliefern.
        """
        meeting.kontakte.add(person)
        client.force_login(bearbeiter)

        kontakt = client.get(f"/api/kontakte/{person.pk}/").json()

        assert kontakt["meetings"] == [
            {
                "id": meeting.pk,
                "titel": "Abstimmung Antrag",
                "datum": "2026-09-15",
                "hat_protokoll": False,
            }
        ]
        # Und es zählt als Kontakt: sonst stünde die Person als „seit Monaten
        # nichts" da, obwohl man eine Stunde mit ihr geredet hat.
        assert kontakt["letzter_kontakt"] == "2026-09-15"


class TestProtokoll:
    @pytest.mark.django_db
    def test_abschnitte_kommen_in_der_geschickten_reihenfolge_an(self, client, bearbeiter, meeting):
        client.force_login(bearbeiter)

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {
                "abschnitte": [
                    {"ueberschrift": "Anlass", "text": "Erstes Gespräch."},
                    {"ueberschrift": "Nächste Schritte", "text": "Angebot bis 30.9."},
                ]
            },
            content_type="application/json",
        )

        assert antwort.status_code == 200
        assert [(a["ueberschrift"], a["reihenfolge"]) for a in antwort.json()["abschnitte"]] == [
            ("Anlass", 0),
            ("Nächste Schritte", 1),
        ]

    @pytest.mark.django_db
    def test_ein_zweiter_durchlauf_ersetzt_statt_zu_verdoppeln(self, client, bearbeiter, meeting):
        """
        Wer die Mitschrift ein zweites Mal aufbereiten lässt, will das Ergebnis
        — nicht beides untereinander.
        """
        client.force_login(bearbeiter)
        client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": [{"ueberschrift": "Erster Versuch", "text": "halb"}]},
            content_type="application/json",
        )

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": [{"ueberschrift": "Zweiter Versuch", "text": "ganz"}]},
            content_type="application/json",
        )

        assert [a["ueberschrift"] for a in antwort.json()["abschnitte"]] == ["Zweiter Versuch"]
        assert Meetingabschnitt.objects.filter(meeting=meeting).count() == 1
        # Weich gelöscht, nicht weg: Das Protokoll von vorhin steht noch im
        # Änderungsprotokoll und lässt sich wiederherstellen.
        assert Meetingabschnitt.alle_objekte.filter(meeting=meeting).count() == 2

    @pytest.mark.django_db
    def test_eine_leere_liste_verwirft_das_protokoll(self, client, bearbeiter, meeting):
        """
        „Rückgängig" in der Oberfläche ist dasselbe Ersetzen, nur durch nichts —
        kein zweiter Weg daneben. Weich gelöscht, damit das Alte im
        Änderungsprotokoll bleibt.
        """
        client.force_login(bearbeiter)
        client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": [{"ueberschrift": "Anlass", "text": "Erstes Gespräch."}]},
            content_type="application/json",
        )

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": []},
            content_type="application/json",
        )

        assert antwort.status_code == 200
        assert antwort.json()["abschnitte"] == []
        assert Meetingabschnitt.objects.filter(meeting=meeting).count() == 0
        assert Meetingabschnitt.alle_objekte.filter(meeting=meeting).count() == 1

    @pytest.mark.django_db
    def test_leere_abschnitte_werden_uebergangen(self, client, bearbeiter, meeting):
        client.force_login(bearbeiter)

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {
                "abschnitte": [
                    {"ueberschrift": "", "text": ""},
                    {"ueberschrift": "Kosten", "text": "40.000"},
                ]
            },
            content_type="application/json",
        )

        assert [a["ueberschrift"] for a in antwort.json()["abschnitte"]] == ["Kosten"]

    @pytest.mark.django_db
    def test_etwas_anderes_als_eine_liste_wird_abgewiesen(self, client, bearbeiter, meeting):
        client.force_login(bearbeiter)

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": "## Anlass"},
            content_type="application/json",
        )

        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_ein_leser_darf_kein_protokoll_setzen(self, client, leser, meeting):
        client.force_login(leser)

        antwort = client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {"abschnitte": [{"ueberschrift": "Kosten", "text": "40.000"}]},
            content_type="application/json",
        )

        assert antwort.status_code == 403
        assert not Meetingabschnitt.objects.exists()


class TestVerschieben:
    @pytest.mark.django_db
    def test_ein_abschnitt_geht_eine_stelle_hoch(self, client, bearbeiter, meeting):
        client.force_login(bearbeiter)
        client.post(
            f"/api/meetings/{meeting.pk}/protokoll/",
            {
                "abschnitte": [
                    {"ueberschrift": "A", "text": ""},
                    {"ueberschrift": "B", "text": ""},
                    {"ueberschrift": "C", "text": ""},
                ]
            },
            content_type="application/json",
        )
        zweiter = Meetingabschnitt.objects.get(meeting=meeting, ueberschrift="B")

        antwort = client.post(
            f"/api/meetingabschnitte/{zweiter.pk}/verschieben/",
            {"richtung": "hoch"},
            content_type="application/json",
        )

        assert [a["ueberschrift"] for a in antwort.json()] == ["B", "A", "C"]

    @pytest.mark.django_db
    def test_gleiche_reihenfolge_wird_beim_verschieben_geradegezogen(
        self, client, bearbeiter, meeting
    ):
        """
        Von Hand angefügte Abschnitte können dieselbe Nummer tragen. Ein
        bloßer Tausch der beiden Werte bewegte dann nichts — deshalb wird die
        ganze Liste neu durchnummeriert.
        """
        a = Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="A", reihenfolge=0)
        b = Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="B", reihenfolge=0)
        client.force_login(bearbeiter)

        antwort = client.post(
            f"/api/meetingabschnitte/{b.pk}/verschieben/",
            {"richtung": "hoch"},
            content_type="application/json",
        )

        assert [x["ueberschrift"] for x in antwort.json()] == ["B", "A"]
        a.refresh_from_db()
        b.refresh_from_db()
        assert (b.reihenfolge, a.reihenfolge) == (0, 1)

    @pytest.mark.django_db
    def test_am_rand_passiert_nichts(self, client, bearbeiter, meeting):
        erster = Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="A", reihenfolge=0)
        Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="B", reihenfolge=1)
        client.force_login(bearbeiter)

        antwort = client.post(
            f"/api/meetingabschnitte/{erster.pk}/verschieben/",
            {"richtung": "hoch"},
            content_type="application/json",
        )

        assert [x["ueberschrift"] for x in antwort.json()] == ["A", "B"]


class TestLoeschen:
    @pytest.mark.django_db
    def test_ein_entferntes_meeting_nimmt_seine_abschnitte_mit(self, meeting):
        """
        Weiches Löschen ist ein UPDATE — CASCADE löst dabei nie aus. Ohne die
        eigene `delete()` bliebe das Protokoll als Satz Abschnitte zurück, die
        auf nichts Sichtbares mehr zeigen.
        """
        Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="Kosten")

        meeting.delete()

        assert not Meeting.objects.filter(pk=meeting.pk).exists()
        assert not Meetingabschnitt.objects.filter(meeting=meeting).exists()
        assert Meetingabschnitt.alle_objekte.filter(meeting=meeting).count() == 1

    @pytest.mark.django_db
    def test_ein_meeting_mit_person_laesst_sich_entfernen(self, meeting, person):
        """
        Die Beteiligten hängen als Menge daran und nicht mit PROTECT: Sie
        sollen das Entfernen nicht aufhalten.
        """
        meeting.kontakte.add(person)

        meeting.delete()

        assert not Meeting.objects.filter(pk=meeting.pk).exists()


class TestAenderungsprotokoll:
    @pytest.mark.django_db
    def test_die_mitschrift_steht_nicht_im_protokoll(self, client, bearbeiter, meeting):
        """
        Sie speichert sich beim Tippen selbst. Stünde jede Pause als Eintrag
        mit dem ganzen alten und neuen Text im Änderungsprotokoll, ginge darin
        nach einer Stunde Mitschreiben jeder echte Vorgang unter.
        """
        client.force_login(bearbeiter)

        for text in ("Ber", "Berger sagt", "Berger sagt zu"):
            client.patch(
                f"/api/meetings/{meeting.pk}/",
                {"mitschrift": text},
                content_type="application/json",
            )

        eintraege = Protokolleintrag.objects.filter(
            modell="socos.Meeting", objekt_id=str(meeting.pk)
        )
        assert not eintraege.filter(aktion=Protokolleintrag.Aktion.GEAENDERT).exists()

    @pytest.mark.django_db
    def test_eine_aenderung_am_protokoll_steht_vollstaendig_drin(self, client, bearbeiter, meeting):
        """Das Gegenstück: Was am fertigen Protokoll geändert wird, zählt."""
        abschnitt = Meetingabschnitt.objects.create(meeting=meeting, ueberschrift="Kosten")
        client.force_login(bearbeiter)

        client.patch(
            f"/api/meetingabschnitte/{abschnitt.pk}/",
            {"text": "Deckelung bei 40.000"},
            content_type="application/json",
        )

        eintrag = Protokolleintrag.objects.filter(
            modell="socos.Meetingabschnitt",
            objekt_id=str(abschnitt.pk),
            aktion=Protokolleintrag.Aktion.GEAENDERT,
        ).first()
        assert eintrag is not None
        assert eintrag.aenderungen["text"]["neu"] == "Deckelung bei 40.000"
