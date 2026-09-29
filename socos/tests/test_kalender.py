"""
Das Kalender-Abo.

Geprüft wird, was schiefgehen kann, ohne dass man es in SoCoS sieht: dass der
Schlüssel wirklich schützt, dass die Zeiten in UTC richtig umgerechnet sind —
auch über die Sommerzeit —, und dass nichts in die Datei gerät, was hinter der
Anmeldung bleiben soll.
"""

from datetime import date, time

import pytest

from socos import kalender
from socos.models import Event, Meeting


def _abo(client, nutzer):
    client.force_login(nutzer)
    link = client.get("/api/kalender/").json()["link"]
    client.logout()
    return link.split("testserver", 1)[1]


def _entfaltet(text):
    return text.replace("\r\n ", "")


class TestZugang:
    @pytest.mark.django_db
    def test_der_link_liefert_ohne_anmeldung(self, client, leser):
        pfad = _abo(client, leser)

        antwort = client.get(pfad)

        assert antwort.status_code == 200
        assert antwort["Content-Type"].startswith("text/calendar")
        assert antwort.content.decode().startswith("BEGIN:VCALENDAR\r\n")

    @pytest.mark.django_db
    def test_derselbe_link_bei_jedem_aufruf(self, client, leser):
        assert _abo(client, leser) == _abo(client, leser)

    @pytest.mark.django_db
    def test_ein_erfundener_schluessel_bekommt_404(self, client, leser):
        _abo(client, leser)
        assert client.get("/kalender/geraten.ics").status_code == 404

    @pytest.mark.django_db
    def test_ein_neuer_link_macht_den_alten_tot(self, client, leser):
        alt = _abo(client, leser)
        client.force_login(leser)
        neu = client.post("/api/kalender/neu/").json()["link"].split("testserver", 1)[1]
        client.logout()

        assert neu != alt
        assert client.get(alt).status_code == 404
        assert client.get(neu).status_code == 200

    @pytest.mark.django_db
    def test_ein_stillgelegtes_konto_hat_kein_abo_mehr(self, client, leser):
        pfad = _abo(client, leser)
        leser.is_active = False
        leser.save()

        assert client.get(pfad).status_code == 404

    @pytest.mark.django_db
    def test_ohne_rolle_kein_link(self, client, ohne_rolle):
        client.force_login(ohne_rolle)
        assert client.get("/api/kalender/").status_code == 403

    @pytest.mark.django_db
    def test_der_schluessel_steht_nicht_im_protokoll(self, client, leser):
        from socos.models import Protokolleintrag

        pfad = _abo(client, leser)
        schluessel = pfad.rsplit("/", 1)[1].removesuffix(".ics")

        for eintrag in Protokolleintrag.objects.all():
            assert schluessel not in str(eintrag.aenderungen)


class TestZeiten:
    def test_ein_event_ohne_beginn_ist_ganztaegig_bis_zum_tag_danach(self):
        event = Event(von=date(2026, 10, 14), bis=date(2026, 10, 16))
        assert kalender.zeitraum_event(event) == (
            "DTSTART;VALUE=DATE:20261014",
            "DTEND;VALUE=DATE:20261017",
        )

    def test_sommerzeit_ist_zwei_stunden_vor_utc(self):
        event = Event(von=date(2026, 7, 1), beginn=time(9, 0), ende=time(17, 0))
        assert kalender.zeitraum_event(event) == (
            "DTSTART:20260701T070000Z",
            "DTEND:20260701T150000Z",
        )

    def test_winterzeit_ist_eine_stunde_vor_utc(self):
        meeting = Meeting(datum=date(2026, 12, 1), uhrzeit=time(14, 0))
        assert kalender.zeitraum_meeting(meeting) == (
            "DTSTART:20261201T130000Z",
            "DTEND:20261201T140000Z",
        )

    def test_ein_event_ohne_ende_dauert_eine_stunde_am_letzten_tag(self):
        event = Event(von=date(2026, 10, 14), bis=date(2026, 10, 15), beginn=time(9, 0))
        assert kalender.zeitraum_event(event) == (
            "DTSTART:20261014T070000Z",
            "DTEND:20261015T080000Z",
        )

    def test_ein_spaetes_meeting_endet_am_naechsten_tag(self):
        meeting = Meeting(datum=date(2026, 12, 1), uhrzeit=time(23, 30))
        assert kalender.zeitraum_meeting(meeting)[1] == "DTEND:20261201T233000Z"

    def test_ein_altes_meeting_ohne_uhrzeit_ist_ganztaegig(self):
        meeting = Meeting(datum=date(2026, 9, 1))
        assert kalender.zeitraum_meeting(meeting) == (
            "DTSTART;VALUE=DATE:20260901",
            "DTEND;VALUE=DATE:20260902",
        )


class TestInhalt:
    @pytest.mark.django_db
    def test_titel_ort_und_link_aber_keine_notizen(self):
        Event.objects.create(
            titel="MedTech Days, Tag 1", ort="Wien; Halle B", von="2026-10-14",
            notiz="Geheime Notiz",
        )
        Meeting.objects.create(
            titel="Jour fixe", datum=date(2026, 10, 2), uhrzeit="10:00",
            vorbereitung="Nicht nach draußen",
        )

        text = _entfaltet(kalender.ics("https://socos.example"))

        assert "SUMMARY:MedTech Days\\, Tag 1" in text
        assert r"LOCATION:Wien\; Halle B" in text
        assert "URL:https://socos.example/events/" in text
        assert "SUMMARY:Jour fixe" in text
        assert "Geheime Notiz" not in text
        assert "Nicht nach draußen" not in text

    @pytest.mark.django_db
    def test_geloeschtes_verschwindet(self):
        event = Event.objects.create(titel="Abgesagt", von="2026-10-14")
        event.delete()

        assert "Abgesagt" not in kalender.ics("https://socos.example")

    def test_lange_zeilen_werden_nach_byte_gefaltet(self):
        zeile = "SUMMARY:" + "ä" * 100
        gefaltet = kalender._gefaltet(zeile)

        for teil in gefaltet.split("\r\n"):
            assert len(teil.encode("utf-8")) <= 75
        assert gefaltet.replace("\r\n ", "") == zeile


class TestPflichtfelder:
    @pytest.mark.django_db
    def test_ein_meeting_ohne_uhrzeit_wird_abgewiesen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/meetings/", {"titel": "Ohne Zeit", "datum": "2026-10-01"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
        assert "uhrzeit" in antwort.json()

    @pytest.mark.django_db
    def test_die_uhrzeit_laesst_sich_nicht_leeren(self, client, bearbeiter):
        m = Meeting.objects.create(titel="X", datum=date(2026, 10, 1), uhrzeit="10:00")
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/meetings/{m.pk}/", {"uhrzeit": None}, content_type="application/json"
        )
        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_ein_altes_meeting_ohne_uhrzeit_laesst_sich_weiterschreiben(self, client, bearbeiter):
        m = Meeting.objects.create(titel="Alt", datum=date(2026, 9, 1))
        client.force_login(bearbeiter)
        antwort = client.patch(
            f"/api/meetings/{m.pk}/", {"mitschrift": "weiter"}, content_type="application/json"
        )
        assert antwort.status_code == 200

    @pytest.mark.django_db
    def test_ein_event_ende_braucht_einen_beginn(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/events/", {"titel": "E", "von": "2026-10-01", "ende": "17:00"},
            content_type="application/json",
        )
        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_am_selben_tag_liegt_das_ende_nach_dem_beginn(self, client, bearbeiter):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/events/",
            {"titel": "E", "von": "2026-10-01", "beginn": "17:00", "ende": "09:00"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
