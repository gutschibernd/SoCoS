"""
Module · Lagekarte: Themen, Schritte, Verbindungen.

Geprüft wird, was der Server hütet: dass keine Verbindung einen Kreis
schließt (auch nicht beim Umhängen und Umdrehen), dass beim Entfernen nichts
ins Leere zeigt, dass Verschieben das Protokoll nicht zuschüttet, dass es nur
zwei Status gibt — und dass alles durch die Sicherung wandert.
"""

import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from socos.models import Lageschritt, Lagethema, Lageverbindung, Protokolleintrag
from socos.services import lagekarte


def _schritte(*titel, thema=None):
    return [Lageschritt.objects.create(titel=t, thema=thema) for t in titel]


def _verbinde(von, nach):
    return Lageverbindung.objects.create(von=von, nach=nach)


@pytest.mark.django_db
class TestKreis:
    def test_auf_sich_selbst_ist_ein_kreis(self):
        (a,) = _schritte("A")
        assert lagekarte.ergaebe_kreis(a.pk, a.pk)

    def test_ueber_drei_schritte(self):
        a, b, c = _schritte("A", "B", "C")
        _verbinde(a, b)
        _verbinde(b, c)
        assert lagekarte.ergaebe_kreis(c.pk, a.pk)
        assert not lagekarte.ergaebe_kreis(a.pk, c.pk)

    def test_parallele_wege_sind_kein_kreis(self):
        a, b, c, d = _schritte("A", "B", "C", "D")
        _verbinde(a, b)
        _verbinde(a, c)
        _verbinde(b, d)
        assert not lagekarte.ergaebe_kreis(c.pk, d.pk)

    def test_die_umgehaengte_verbindung_zaehlt_nicht_mit(self):
        a, b = _schritte("A", "B")
        v = _verbinde(a, b)
        # Umdrehen: b → a, während a → b noch in der Datenbank steht.
        assert lagekarte.ergaebe_kreis(b.pk, a.pk)
        assert not lagekarte.ergaebe_kreis(b.pk, a.pk, ohne_id=v.pk)

    def test_geloeste_verbindungen_zaehlen_nicht(self):
        a, b = _schritte("A", "B")
        _verbinde(a, b).delete()
        assert not lagekarte.ergaebe_kreis(b.pk, a.pk)


@pytest.mark.django_db
class TestSchnittstelle:
    def test_naechster_schritt_bringt_seinen_pfeil_mit(self, client, bearbeiter):
        client.force_login(bearbeiter)
        (a,) = _schritte("Gesellschaftervertrag")

        antwort = client.post(
            "/api/lageschritte/", {"titel": "Konto eröffnen", "haengt_an": a.pk}, content_type="application/json"
        )

        assert antwort.status_code == 201, antwort.content
        neu = Lageschritt.objects.get(titel="Konto eröffnen")
        assert Lageverbindung.objects.filter(von=a, nach=neu).exists()
        assert "haengt_an" not in antwort.json()

    def test_kreis_wird_abgewiesen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        a, b = _schritte("A", "B")
        _verbinde(a, b)

        antwort = client.post("/api/lageverbindungen/", {"von": b.pk, "nach": a.pk}, content_type="application/json")

        assert antwort.status_code == 400
        assert "Kreis" in antwort.content.decode()

    def test_umdrehen_ist_kein_kreis_mit_sich_selbst(self, client, bearbeiter):
        client.force_login(bearbeiter)
        a, b = _schritte("A", "B")
        v = _verbinde(a, b)

        antwort = client.patch(
            f"/api/lageverbindungen/{v.pk}/", {"von": b.pk, "nach": a.pk}, content_type="application/json"
        )

        assert antwort.status_code == 200, antwort.content
        v.refresh_from_db()
        assert (v.von, v.nach) == (b, a)

    def test_doppelt_und_auf_sich_selbst_wird_abgewiesen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        a, b = _schritte("A", "B")
        _verbinde(a, b)

        doppelt = client.post("/api/lageverbindungen/", {"von": a.pk, "nach": b.pk}, content_type="application/json")
        selbst = client.post("/api/lageverbindungen/", {"von": a.pk, "nach": a.pk}, content_type="application/json")

        assert doppelt.status_code == 400
        assert selbst.status_code == 400

    def test_eine_geloeste_verbindung_darf_neu_gezogen_werden(self, client, bearbeiter, admin_nutzer):
        a, b = _schritte("A", "B")
        v = _verbinde(a, b)
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/lageverbindungen/{v.pk}/").status_code == 204

        client.force_login(bearbeiter)
        antwort = client.post("/api/lageverbindungen/", {"von": a.pk, "nach": b.pk}, content_type="application/json")
        assert antwort.status_code == 201, antwort.content

    def test_es_gibt_nur_offen_und_erledigt(self, client, bearbeiter):
        client.force_login(bearbeiter)
        (a,) = _schritte("A")

        for status in ("laeuft", "wartet"):
            antwort = client.patch(f"/api/lageschritte/{a.pk}/", {"status": status}, content_type="application/json")
            assert antwort.status_code == 400
        antwort = client.patch(f"/api/lageschritte/{a.pk}/", {"status": "erledigt"}, content_type="application/json")
        assert antwort.status_code == 200

    def test_farbe_bleibt_bei_den_acht_toenen(self, client, bearbeiter):
        client.force_login(bearbeiter)
        assert client.post("/api/lagethemen/", {"name": "X", "farbe": 9}, content_type="application/json").status_code == 400
        assert client.post("/api/lagethemen/", {"name": "X", "farbe": 8}, content_type="application/json").status_code == 201


@pytest.mark.django_db
class TestAbschliessen:
    def test_nur_wenn_alles_erledigt_ist(self, client, bearbeiter):
        thema = Lagethema.objects.create(name="Gründung")
        a, b = _schritte("A", "B", thema=thema)
        a.status = "erledigt"
        a.save()
        client.force_login(bearbeiter)
        pfad = f"/api/lagethemen/{thema.pk}/"

        antwort = client.patch(pfad, {"abgeschlossen_am": "2026-10-09"}, content_type="application/json")
        assert antwort.status_code == 400
        assert "erledigen" in str(antwort.json())

        b.status = "erledigt"
        b.save()
        assert client.patch(pfad, {"abgeschlossen_am": "2026-10-09"}, content_type="application/json").status_code == 200
        thema.refresh_from_db()
        assert str(thema.abgeschlossen_am) == "2026-10-09"

    def test_wieder_aufnehmen(self, client, bearbeiter):
        thema = Lagethema.objects.create(name="Gründung", abgeschlossen_am="2026-10-01")
        client.force_login(bearbeiter)

        antwort = client.patch(f"/api/lagethemen/{thema.pk}/", {"abgeschlossen_am": None}, content_type="application/json")

        assert antwort.status_code == 200
        thema.refresh_from_db()
        assert thema.abgeschlossen_am is None

    def test_lesen_darf_jeder_abschliessen_nicht(self, client, leser):
        thema = Lagethema.objects.create(name="Gründung")
        client.force_login(leser)
        antwort = client.patch(f"/api/lagethemen/{thema.pk}/", {"abgeschlossen_am": "2026-10-09"}, content_type="application/json")
        assert antwort.status_code == 403


@pytest.mark.django_db
class TestEntfernen:
    def test_mit_dem_schritt_gehen_seine_pfeile(self, client, admin_nutzer):
        a, b, c = _schritte("A", "B", "C")
        _verbinde(a, b)
        _verbinde(b, c)
        client.force_login(admin_nutzer)

        assert client.delete(f"/api/lageschritte/{b.pk}/").status_code == 204

        assert not Lageverbindung.objects.exists()
        # Weich, wie alles.
        assert Lageverbindung.alle_objekte.filter(geloescht_am__isnull=False).count() == 2
        assert client.get("/api/lageverbindungen/").json() == []

    def test_ein_aufgeloestes_thema_laesst_lose_gedanken_zurueck(self, client, admin_nutzer):
        thema = Lagethema.objects.create(name="Gründung")
        a, b = _schritte("A", "B", thema=thema)
        client.force_login(admin_nutzer)

        assert client.delete(f"/api/lagethemen/{thema.pk}/").status_code == 204

        assert set(Lageschritt.objects.values_list("thema", flat=True)) == {None}
        assert Lageschritt.objects.count() == 2

    def test_entfernen_darf_nur_der_admin(self, client, bearbeiter, leser):
        (a,) = _schritte("A")
        client.force_login(bearbeiter)
        assert client.delete(f"/api/lageschritte/{a.pk}/").status_code == 403

        client.force_login(leser)
        assert client.get("/api/lageschritte/").status_code == 200
        assert client.patch(f"/api/lageschritte/{a.pk}/", {"titel": "B"}, content_type="application/json").status_code == 403


@pytest.mark.django_db
class TestProtokoll:
    def test_verschieben_schreibt_nichts(self, client, bearbeiter):
        (a,) = _schritte("A")
        client.force_login(bearbeiter)
        vorher = Protokolleintrag.objects.count()

        client.patch(f"/api/lageschritte/{a.pk}/", {"x": 240, "y": -96}, content_type="application/json")

        assert Protokolleintrag.objects.count() == vorher

    def test_abhaken_steht_im_protokoll(self, client, bearbeiter):
        (a,) = _schritte("A")
        client.force_login(bearbeiter)

        client.patch(f"/api/lageschritte/{a.pk}/", {"status": "erledigt", "x": 12}, content_type="application/json")

        eintrag = Protokolleintrag.objects.filter(objekt_id=str(a.pk), modell__icontains="lageschritt").latest("zeitpunkt")
        assert "status" in eintrag.aenderungen
        assert "x" not in eintrag.aenderungen


@pytest.mark.django_db(transaction=True)
def test_die_karte_wandert_durch_die_sicherung(tmp_path, settings, bearbeiter):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    thema = Lagethema.objects.create(name="Gründung", farbe=3, x=-420, y=-156)
    Lagethema.objects.create(name="Messe 2026", abgeschlossen_am="2026-10-09")
    a = Lageschritt.objects.create(titel="Gesellschaftervertrag", thema=thema, x=-700, y=-300)
    b = Lageschritt.objects.create(titel="Z-Achse geliefert", art=Lageschritt.Art.WARTEN, status="erledigt")
    Lageverbindung.objects.create(von=a, nach=b, text="wenn geliefert")

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Lageverbindung.alle_objekte.all().hart_loeschen()
    Lageschritt.alle_objekte.all().hart_loeschen()
    Lagethema.alle_objekte.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    thema = Lagethema.objects.get(name="Gründung")
    assert (thema.farbe, thema.x, thema.y, thema.abgeschlossen_am) == (3, -420, -156, None)
    assert str(Lagethema.objects.get(name="Messe 2026").abgeschlossen_am) == "2026-10-09"
    a = Lageschritt.objects.get(titel="Gesellschaftervertrag")
    assert (a.thema, a.x, a.y) == (thema, -700, -300)
    b = Lageschritt.objects.get(titel="Z-Achse geliefert")
    assert (b.art, b.status) == ("warten", "erledigt")
    assert Lageverbindung.objects.get(von=a, nach=b).text == "wenn geliefert"


# --- Einspielen aus daten/ -----------------------------------------------------


def _karte_datei(tmp_path, **mehr):
    """Eine kleine Karte im Format des Entwurfs."""
    daten = {
        "themen": [{"id": "gr", "name": "Gründung", "farbe": 1, "x": -420, "y": -160}],
        "knoten": [
            {"id": "gv", "thema": "gr", "titel": "Gesellschaftervertrag", "status": "laeuft", "x": -700, "y": -300},
            {"id": "ko", "thema": "gr", "titel": "Konto eröffnen", "status": "offen", "notiz": "Zur Bank."},
            {"id": "ffr", "thema": None, "titel": "Rückmeldung FFG", "art": "warten", "status": "offen", "frist": "2026-11-03"},
        ],
        "kanten": [{"von": "gv", "nach": "ko", "text": "dann"}],
    }
    daten.update(mehr)
    pfad = tmp_path / "thoughts.json"
    pfad.write_text(json.dumps(daten), encoding="utf-8")
    return str(pfad)


@pytest.mark.django_db
class TestEinspielen:
    def test_uebernimmt_die_karte_des_entwurfs(self, tmp_path):
        call_command("thoughts_einspielen", datei=_karte_datei(tmp_path), verbosity=0)

        thema = Lagethema.objects.get()
        assert (thema.name, thema.farbe, thema.x, thema.y) == ("Gründung", 1, -420, -160)
        gv = Lageschritt.objects.get(titel="Gesellschaftervertrag")
        # „läuft" gibt es nicht mehr — es ist offen.
        assert (gv.thema, gv.status, gv.x, gv.y) == (thema, "offen", -700, -300)
        ffr = Lageschritt.objects.get(titel="Rückmeldung FFG")
        assert (ffr.thema, ffr.art, str(ffr.frist)) == (None, "warten", "2026-11-03")
        v = Lageverbindung.objects.get()
        assert (v.von, v.nach.titel, v.text) == (gv, "Konto eröffnen", "dann")

    def test_vermischt_keine_zwei_karten(self, tmp_path):
        Lagethema.objects.create(name="Schon da")
        with pytest.raises(CommandError, match="vermischt keine"):
            call_command("thoughts_einspielen", datei=_karte_datei(tmp_path), verbosity=0)
        assert Lagethema.objects.count() == 1

    def test_ersetzen_loescht_den_alten_stand_weich(self, tmp_path):
        alt = Lagethema.objects.create(name="Alt")
        call_command("thoughts_einspielen", datei=_karte_datei(tmp_path), ersetzen=True, verbosity=0)
        assert list(Lagethema.objects.values_list("name", flat=True)) == ["Gründung"]
        assert Lagethema.alle_objekte.get(pk=alt.pk).geloescht_am is not None

    def test_eine_kaputte_datei_spielt_nichts_ein(self, tmp_path):
        kaputt = _karte_datei(tmp_path, kanten=[{"von": "gv", "nach": "gibtsnicht"}])
        with pytest.raises(CommandError, match="ein Ende gibt es nicht"):
            call_command("thoughts_einspielen", datei=kaputt, verbosity=0)
        assert not Lageschritt.objects.exists()

    def test_ein_kreis_in_der_datei_spielt_nichts_ein(self, tmp_path):
        kreis = _karte_datei(tmp_path, kanten=[{"von": "gv", "nach": "ko"}, {"von": "ko", "nach": "gv"}])
        with pytest.raises(CommandError, match="Kreis"):
            call_command("thoughts_einspielen", datei=kreis, verbosity=0)
        assert not Lageschritt.objects.exists()
