"""
Module · Designentscheidungen: Nummern, Pflichtangaben, Rechte und das PDF.

Geprüft wird, was entschieden wurde: dass eine Nummer nie zweimal vergeben
wird, auch nicht nach dem Entfernen; dass „entschieden" erst geht, wenn
Datum, Entscheidung, Begründung und Sicherheit dastehen; dass die
Gesamtakte keine Entwürfe enthält und das sagt — und dass alles durch die
Sicherung kommt.
"""

import re
from datetime import date

import pytest
from django.core.management import call_command

from socos.models import Designentscheidung, Protokolleintrag
from socos.services import designentscheidung as dienst

FERTIG = {
    "titel": "Dosierkammer aus PP statt PET",
    "stand": "entschieden",
    "entschieden_am": "2026-10-01",
    "entscheidung": "Die Kammer wird aus Polypropylen gespritzt.",
    "begruendung": "PP ist gegen die Reinigungsmittel der Pflege beständig.",
    "sicherheit": "Kein Spannungsriss mehr, damit keine Fehldosierung durch Undichtigkeit (R-12).",
}


def _seiten(daten):
    return len(re.findall(rb"/Type /Page(?!s)", daten))


class TestNummer:
    def test_wird_fortlaufend_vergeben(self, db):
        a = Designentscheidung.objects.create(titel="Eins")
        b = Designentscheidung.objects.create(titel="Zwei")

        assert (a.nummer, b.nummer) == (1, 2)
        assert b.kennung == "DE-002"
        assert str(b) == "DE-002 Zwei"

    def test_eine_entfernte_nummer_kommt_nicht_wieder(self, db):
        """Ein altes Dokument, das auf DE-002 verweist, darf nie auf eine andere zeigen."""
        Designentscheidung.objects.create(titel="Eins")
        zwei = Designentscheidung.objects.create(titel="Zwei")
        zwei.delete()

        drei = Designentscheidung.objects.create(titel="Drei")

        assert drei.nummer == 3

    def test_laesst_sich_nicht_setzen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        Designentscheidung.objects.create(titel="Eins")

        daten = client.post("/api/designentscheidungen/", {"titel": "Neu", "nummer": 1}, content_type="application/json").json()

        assert daten["nummer"] == 2
        assert daten["kennung"] == "DE-002"


class TestPflichtangaben:
    def test_ein_entwurf_darf_fast_leer_sein(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post("/api/designentscheidungen/", {"titel": "Nur ein Gedanke"}, content_type="application/json")

        assert antwort.status_code == 201
        assert antwort.json()["stand"] == "entwurf"

    def test_entschieden_verlangt_begruendung_und_sicherheit(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/designentscheidungen/",
            {"titel": "Halb", "stand": "entschieden", "entscheidung": "So.", "sicherheit": "  "},
            content_type="application/json",
        )

        assert antwort.status_code == 400
        assert set(antwort.json()) == {"entschieden_am", "begruendung", "sicherheit"}

    def test_auch_beim_umstellen_eines_entwurfs(self, client, bearbeiter):
        """Ein PATCH schickt nur den Stand — geprüft wird, was danach gespeichert wäre."""
        client.force_login(bearbeiter)
        e = Designentscheidung.objects.create(titel="Entwurf", entscheidung="So.")

        antwort = client.patch(
            f"/api/designentscheidungen/{e.pk}/", {"stand": "entschieden"}, content_type="application/json"
        )

        assert antwort.status_code == 400
        assert "entscheidung" not in antwort.json()
        assert "begruendung" in antwort.json()

    def test_die_antwort_sagt_was_noch_fehlt(self, client, bearbeiter):
        """Dieselbe Liste, mit der abgewiesen wird — die Seite zeigt sie vor dem Umstellen."""
        client.force_login(bearbeiter)
        e = Designentscheidung.objects.create(titel="Entwurf", entscheidung="So.")

        daten = client.get(f"/api/designentscheidungen/{e.pk}/").json()

        assert daten["fehlt"] == ["entschieden_am", "begruendung", "sicherheit"]

    def test_vollstaendig_geht_es(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post("/api/designentscheidungen/", FERTIG, content_type="application/json")

        assert antwort.status_code == 201

    def test_ein_feld_leeren_einer_entschiedenen_geht_nicht(self, client, bearbeiter):
        client.force_login(bearbeiter)
        e = Designentscheidung.objects.create(**{**FERTIG, "entschieden_am": date(2026, 10, 1)})

        antwort = client.patch(
            f"/api/designentscheidungen/{e.pk}/", {"sicherheit": ""}, content_type="application/json"
        )

        assert antwort.status_code == 400


class TestRechte:
    def test_leser_sieht_aber_legt_nicht_an(self, client, leser):
        Designentscheidung.objects.create(titel="Eins")
        client.force_login(leser)

        assert client.get("/api/designentscheidungen/").status_code == 200
        antwort = client.post("/api/designentscheidungen/", {"titel": "Neu"}, content_type="application/json")
        assert antwort.status_code == 403

    def test_entfernen_nur_der_admin_und_nur_weich(self, client, bearbeiter, admin_nutzer):
        e = Designentscheidung.objects.create(titel="Eins")

        client.force_login(bearbeiter)
        assert client.delete(f"/api/designentscheidungen/{e.pk}/").status_code == 403

        client.force_login(admin_nutzer)
        assert client.delete(f"/api/designentscheidungen/{e.pk}/").status_code == 204
        assert Designentscheidung.alle_objekte.get(pk=e.pk).geloescht_am is not None

    def test_jede_aenderung_steht_im_protokoll(self, client, bearbeiter):
        client.force_login(bearbeiter)
        e = Designentscheidung.objects.create(titel="Eins")

        client.patch(f"/api/designentscheidungen/{e.pk}/", {"begruendung": "Weil."}, content_type="application/json")

        eintrag = Protokolleintrag.objects.filter(modell="socos.Designentscheidung", objekt_id=str(e.pk)).first()
        assert eintrag.aenderungen["begruendung"] == {"alt": "", "neu": "Weil."}
        assert eintrag.nutzer == bearbeiter


class TestPdf:
    def test_eine_entscheidung_auch_als_entwurf(self, client, leser):
        e = Designentscheidung.objects.create(titel="Prüfung <b>roh</b> & „Zeichen“", ausgangslage="- eins\n- zwei")
        client.force_login(leser)

        antwort = client.get(f"/api/designentscheidungen/{e.pk}/pdf/")

        assert antwort.status_code == 200
        assert antwort["Content-Type"] == "application/pdf"
        assert "DE-001_Pruefung-b-roh-b-Zeichen.pdf" in antwort["Content-Disposition"]
        assert antwort.content.startswith(b"%PDF")

    def test_gesamt_ohne_entwuerfe(self, client, leser):
        Designentscheidung.objects.create(**{**FERTIG, "entschieden_am": date(2026, 10, 1)})
        Designentscheidung.objects.create(titel="Noch offen")
        client.force_login(leser)

        antwort = client.get("/api/designentscheidungen/gesamt/")

        assert antwort.status_code == 200
        # Deckblatt mit Übersicht, dann eine Seite je Entscheidung — der Entwurf fehlt.
        assert _seiten(antwort.content) == 2
        assert "Designentscheidungen_" in antwort["Content-Disposition"]

    def test_gesamt_ohne_eine_entschiedene_gibt_es_nicht(self, client, leser):
        Designentscheidung.objects.create(titel="Noch offen")
        client.force_login(leser)

        assert client.get("/api/designentscheidungen/gesamt/").status_code == 400

    def test_lange_texte_laufen_ueber_seiten(self, db):
        """Eine Begründung über mehrere Seiten darf das PDF nicht sprengen."""
        e = Designentscheidung.objects.create(
            titel="Lang", begruendung="\n\n".join(["Ein langer Absatz mit vielen Worten. " * 30] * 25)
        )

        assert _seiten(dienst.erzeugen([e])) > 2

    def test_der_verlauf_nennt_die_felder(self, db):
        e = Designentscheidung.objects.create(titel="Eins")
        e.begruendung = "Weil."
        e.save()

        teile = dienst._verlauf(e, dienst._stile())

        text = " ".join(str(z[2].text) for z in teile[0]._cellvalues[1:])
        assert "angelegt" in text
        assert "geändert: Begründung" in text


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


def test_wandert_durch_die_sicherung(tmp_path, medien, bearbeiter):
    Designentscheidung.objects.create(**{**FERTIG, "entschieden_am": date(2026, 10, 1), "verweise": "R-12\nISO 14971"})

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Designentscheidung.alle_objekte.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder = Designentscheidung.objects.get()
    assert wieder.nummer == 1
    assert wieder.stand == "entschieden"
    assert wieder.entschieden_am == date(2026, 10, 1)
    assert wieder.sicherheit == FERTIG["sicherheit"]
    assert wieder.verweise == "R-12\nISO 14971"
