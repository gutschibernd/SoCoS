"""
Meetings: Protokoll, Reihenfolge, Löschen, Anhänge — und was bewusst *nicht*
im Änderungsprotokoll steht.

Geprüft wird, was entschieden wurde, nicht Django: dass ein Meeting an nichts
hängen muss, dass das Einspielen eines Protokolls das alte ersetzt statt es zu
verdoppeln, dass ein entferntes Meeting seine Abschnitte mitnimmt, und dass die
Mitschrift nicht bei jedem Tastendruck einen Protokolleintrag schreibt.
"""

from datetime import date
from email.message import EmailMessage

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from socos.models import (
    Kontakt,
    Meeting,
    Meetinganhang,
    Meetingabschnitt,
    Organisation,
    Protokolleintrag,
)
from socos.services.mailtext import html_zu_text


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
            {
                "id": person.pk,
                "name": "Berger",
                "funktion": "Programmleitung",
                "organisation_name": "Förderstelle Nord",
            }
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


# --- Anhänge ----------------------------------------------------------------

@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


def _mail(html=False):
    """Eine Mail wie die vom Steuerberater: HTML, ein PDF im Anhang."""
    nachricht = EmailMessage()
    nachricht["From"] = "Gabriel Platzer <gabriel@example.invalid>"
    nachricht["To"] = "bernd@example.invalid"
    nachricht["Subject"] = "Neuer Klient"
    nachricht["Date"] = "Sat, 19 Sep 2026 17:08:52 +0000"
    if html:
        nachricht.set_content("<html><head><style>p{}</style></head><body><p>Lieber&nbsp;Bernd,</p>"
                              "<ul><li>Steuernummer</li><li>UID</li></ul></body></html>", subtype="html")
    else:
        nachricht.set_content("Lieber Bernd,\n\nBH: EUR 90,00/h\n")
    nachricht.add_attachment(b"%PDF-1.4 geheim", maintype="application", subtype="pdf",
                             filename="Pass_Gutschi.pdf")
    return nachricht.as_bytes()


class TestAnhaenge:
    @pytest.mark.django_db
    def test_eine_mail_kommt_mit_ihrem_text(self, client, bearbeiter, meeting, medien):
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/meetinganhaenge/",
            {"meeting": meeting.pk, "datei": SimpleUploadedFile("klient.eml", _mail())},
        )

        assert antwort.status_code == 201, antwort.content
        daten = antwort.json()
        assert daten["art"] == "email"
        assert daten["name"] == "klient.eml"
        assert "Betreff: Neuer Klient" in daten["text"]
        assert "Von: Gabriel Platzer" in daten["text"]
        assert "BH: EUR 90,00/h" in daten["text"]
        # Der Name des Anhangs ja, sein Inhalt nie: Darin stehen Ausweise.
        assert "Anhänge: Pass_Gutschi.pdf" in daten["text"]
        assert "geheim" not in daten["text"]
        # Und das Meeting liefert ihn mit.
        meetingdaten = client.get(f"/api/meetings/{meeting.pk}/").json()
        assert [a["name"] for a in meetingdaten["anhaenge"]] == ["klient.eml"]

    def test_html_wird_zu_lesbarem_text(self):
        text = html_zu_text("<head><style>p{}</style></head><p>Lieber&nbsp;Bernd,</p><ul><li>UID</li></ul>")

        assert "p{}" not in text
        assert "Lieber\xa0Bernd," in text
        assert "- UID" in text

    @pytest.mark.django_db
    def test_eine_html_mail_verliert_ihre_auszeichnung(self, client, bearbeiter, meeting, medien):
        client.force_login(bearbeiter)

        daten = client.post(
            "/api/meetinganhaenge/",
            {"meeting": meeting.pk, "datei": SimpleUploadedFile("klient.eml", _mail(html=True))},
        ).json()

        assert "Lieber Bernd," in daten["text"]
        assert "- Steuernummer" in daten["text"]
        assert "<p>" not in daten["text"] and "<li>" not in daten["text"]

    @pytest.mark.django_db
    def test_eine_andere_datei_wird_nur_abgelegt(self, client, bearbeiter, meeting, medien):
        client.force_login(bearbeiter)

        daten = client.post(
            "/api/meetinganhaenge/",
            {"meeting": meeting.pk, "datei": SimpleUploadedFile("angebot.pdf", b"%PDF-1.4")},
        ).json()

        assert daten["art"] == "datei"
        assert daten["text"] == ""
        assert daten["groesse"] == 8

    @pytest.mark.django_db
    def test_herunterladen_liefert_die_datei_unter_ihrem_namen(
        self, client, leser, meeting, medien
    ):
        anhang = Meetinganhang(meeting=meeting, name="Angebot März.pdf", groesse=8)
        anhang.datei.save("angebot.pdf", SimpleUploadedFile("angebot.pdf", b"%PDF-1.4"), save=False)
        anhang.save()
        client.force_login(leser)

        antwort = client.get(f"/api/meetinganhaenge/{anhang.pk}/datei/")

        assert antwort.status_code == 200
        assert b"".join(antwort.streaming_content) == b"%PDF-1.4"
        # Immer als Download — nie im Browser unter unserem Ursprung geöffnet.
        assert antwort["Content-Disposition"].startswith("attachment")

    @pytest.mark.django_db
    def test_ein_leser_laedt_nichts_hoch(self, client, leser, meeting, medien):
        client.force_login(leser)

        antwort = client.post(
            "/api/meetinganhaenge/",
            {"meeting": meeting.pk, "datei": SimpleUploadedFile("a.pdf", b"x")},
        )

        assert antwort.status_code == 403

    @pytest.mark.django_db
    def test_ohne_datei_gibt_es_keinen_anhang(self, client, bearbeiter, meeting, medien):
        client.force_login(bearbeiter)

        antwort = client.post("/api/meetinganhaenge/", {"meeting": meeting.pk})

        assert antwort.status_code == 400
        assert not Meetinganhang.objects.exists()

    @pytest.mark.django_db
    def test_ein_entferntes_meeting_nimmt_seine_anhaenge_mit(self, meeting, medien):
        anhang = Meetinganhang(meeting=meeting, name="a.pdf")
        anhang.datei.save("a.pdf", SimpleUploadedFile("a.pdf", b"x"), save=False)
        anhang.save()

        meeting.delete()

        assert not Meetinganhang.objects.filter(pk=anhang.pk).exists()
        assert Meetinganhang.alle_objekte.filter(pk=anhang.pk).exists()


@pytest.mark.django_db(transaction=True)
def test_anhaenge_wandern_durch_die_sicherung(tmp_path, medien, bearbeiter):
    """Eintrag **und** Datei — ein Anhang ohne seine Datei ist ein toter Link."""
    meeting = Meeting.objects.create(titel="Steuerberatung", datum=date(2026, 9, 22))
    anhang = Meetinganhang(meeting=meeting, name="klient.eml", art="email", text="Betreff: X")
    anhang.datei.save("klient.eml", SimpleUploadedFile("klient.eml", b"Subject: X"), save=False)
    anhang.save()
    pfad = anhang.datei.path

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Meetinganhang.objects.get(meeting__titel="Steuerberatung")
    assert wieder_da.text == "Betreff: X"
    assert wieder_da.datei.path == pfad
    assert wieder_da.datei.read() == b"Subject: X"
