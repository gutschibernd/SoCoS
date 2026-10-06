"""
Module · Förderungen: Summe, Laufzeit, Antragsreife, die Schnittstelle, der
Einspielbefehl und die Sicherung.

Geprüft wird, was gerechnet wird und was entschieden wurde: dass die Reife
nennt, was fehlt, und dass sie über der Grenze nicht „fertig" sagt — und dass
weich gelöschte Pakete in keiner Summe stehen.
"""

import json
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from socos.models import (
    Foerderantrag,
    Foerderfrage,
    Foerdergeber,
    Foerderpaket,
    Foerderposten,
    Foerderprogramm,
    Foerderstunden,
    Organisation,
)
from socos.services import foerderung


@pytest.fixture
def geber(db):
    return Foerdergeber.objects.create(name="Land Niederösterreich", kurz="NÖ")


@pytest.fixture
def programm(geber):
    return Foerderprogramm.objects.create(
        geber=geber, name="Pflegeinnovation NÖ", max_foerderung=Decimal("50000.00"), max_monate=24
    )


@pytest.fixture
def antrag(programm):
    return Foerderantrag.objects.create(programm=programm, titel="Befüllsystem")


def _paket(antrag, titel, von, bis, betrag):
    return Foerderpaket.objects.create(
        antrag=antrag, titel=titel, von=von, bis=bis, betrag=None if betrag is None else Decimal(betrag)
    )


def _reife(antrag):
    antrag.refresh_from_db()
    return {p["schluessel"]: p for p in foerderung.reife(antrag)}


class TestRechnung:
    def test_summe_und_laufzeit(self, antrag):
        _paket(antrag, "Anforderungen", 1, 3, "10000.10")
        _paket(antrag, "Bau", 4, 15, "20000.20")
        _paket(antrag, "Steuerung", 1, 18, None)

        assert foerderung.summe(antrag) == Decimal("30000.30")
        assert foerderung.laufzeit(antrag) == 18

    def test_entferntes_paket_zaehlt_nicht(self, antrag):
        _paket(antrag, "bleibt", 1, 3, "1000")
        _paket(antrag, "geht", 1, 30, "9000").delete()

        assert foerderung.summe(antrag) == Decimal("1000.00")
        assert foerderung.laufzeit(antrag) == 3

    def test_ohne_pakete(self, antrag):
        assert foerderung.summe(antrag) == Decimal("0.00")
        assert foerderung.laufzeit(antrag) == 0


class TestKalkulation:
    """Der Kostenplan des KWF-Antrags vom August 2026 — die Zahlen müssen genau aufgehen."""

    def _kwf(self, antrag):
        antrag.stundensatz = Decimal("50")
        antrag.gemeinkosten = Decimal("20")
        antrag.foerderquote = Decimal("50")
        antrag.save()
        plan = [("AP01", 40, 90), ("AP02", 270, 140), ("AP03", 150, 100), ("AP04", 140, 150),
                ("AP05", 0, 30), ("AP06", 40, 130), ("AP07", 112, 112)]
        pakete = {}
        for titel, bg, fd in plan:
            pakete[titel] = _paket(antrag, titel, 1, 5, None)
            for person, h in (("BG", bg), ("FD", fd)):
                if h:
                    Foerderstunden.objects.create(paket=pakete[titel], person=person, stunden=Decimal(h))
        Foerderposten.objects.create(antrag=antrag, paket=pakete["AP05"], bezeichnung="Kamera", betrag=Decimal("1000"))
        Foerderposten.objects.create(antrag=antrag, bezeichnung="Elektronik und Rest", betrag=Decimal("6000"))
        antrag.refresh_from_db()
        return pakete

    def test_kostenplan_geht_auf(self, antrag):
        self._kwf(antrag)
        k = foerderung.kosten(antrag)
        assert k["stunden"] == Decimal("1504")
        assert k["personal"] == Decimal("75200.00")
        assert k["sach"] == Decimal("7000.00")
        assert k["direkt"] == Decimal("82200.00")
        assert k["gemeinkosten"] == Decimal("16440.00")
        assert k["gesamt"] == Decimal("98640.00")
        assert k["zuschuss"] == Decimal("49320.00")
        assert k["eigenmittel"] == Decimal("49320.00")
        assert foerderung.summe(antrag) == Decimal("49320.00")

    def test_paket_kostet_stunden_und_seine_posten(self, antrag):
        pakete = self._kwf(antrag)
        ap05 = foerderung.paketkosten(pakete["AP05"], antrag)
        assert (ap05["stunden"], ap05["personal"], ap05["sach"], ap05["gesamt"]) == (
            Decimal("30"), Decimal("1500.00"), Decimal("1000.00"), Decimal("2500.00"),
        )

    def test_ohne_quote_ist_der_zuschuss_die_summe(self, antrag):
        _paket(antrag, "Bau", 1, 2, "1000")
        assert foerderung.kosten(antrag)["zuschuss"] == Decimal("1000.00")

    def test_entfernte_stunden_zaehlen_nicht(self, antrag):
        pakete = self._kwf(antrag)
        pakete["AP05"].stunden.get().delete()
        antrag.refresh_from_db()
        assert foerderung.kosten(antrag)["stunden"] == Decimal("1474")

    def test_stunden_ohne_satz(self, antrag):
        paket = _paket(antrag, "Bau", 1, 2, None)
        Foerderstunden.objects.create(paket=paket, person="BG", stunden=Decimal("10"))
        reife = _reife(antrag)
        assert not reife["pakete"]["erfuellt"]
        assert reife["pakete"]["hinweis"] == "Stunden ohne Stundensatz."

    def test_reife_mit_stunden_statt_betrag(self, antrag):
        self._kwf(antrag)
        reife = _reife(antrag)
        assert reife["pakete"]["erfuellt"] and reife["summe"]["erfuellt"]


class TestReife:
    def test_ein_leerer_antrag_hat_nur_den_titel(self, antrag):
        reife = _reife(antrag)
        assert [k for k, p in reife.items() if p["erfuellt"]] == ["titel"]
        assert reife["pakete"]["hinweis"] == "Noch kein Arbeitspaket."

    def test_ein_vollstaendiger_antrag(self, antrag):
        for feld in ("beschreibung", "nutzen", "mehrwert", "wirkung", "regelbetrieb"):
            setattr(antrag, feld, "Text")
        antrag.save()
        _paket(antrag, "Bau", 1, 18, "49000")

        assert all(p["erfuellt"] for p in _reife(antrag).values())

    def test_ueber_der_grenze_ist_nicht_fertig(self, antrag):
        _paket(antrag, "Bau", 1, 18, "50000.01")
        hinweis = _reife(antrag)["summe"]
        assert not hinweis["erfuellt"]
        assert "50.000 €" in hinweis["hinweis"]

    def test_genau_die_grenze_ist_in_ordnung(self, antrag):
        _paket(antrag, "Bau", 1, 24, "50000")
        reife = _reife(antrag)
        assert reife["summe"]["erfuellt"]
        assert reife["laufzeit"]["erfuellt"]

    def test_zu_lange_laufzeit(self, antrag):
        _paket(antrag, "Bau", 1, 25, "100")
        assert _reife(antrag)["laufzeit"]["hinweis"] == "25 Monate — erlaubt sind 24."

    def test_paket_ohne_betrag(self, antrag):
        _paket(antrag, "Bau", 1, 2, "100")
        _paket(antrag, "Steuerung", 1, 2, None)
        assert _reife(antrag)["pakete"]["hinweis"] == "1 Paket ohne Betrag."

    def test_beschreibung_zu_lang(self, antrag):
        antrag.beschreibung = "x" * 503
        antrag.save()
        assert _reife(antrag)["beschreibung"]["hinweis"] == "3 Zeichen zu lang."

    def test_programm_ohne_grenzen(self, programm, antrag):
        programm.max_foerderung = None
        programm.max_monate = None
        programm.save()
        _paket(antrag, "Bau", 1, 60, "999999")
        reife = _reife(antrag)
        assert reife["summe"]["erfuellt"] and reife["laufzeit"]["erfuellt"]


class TestSchnittstelle:
    def test_eine_abfrage_fuer_die_ganze_seite(self, client, leser, programm, antrag):
        Foerderfrage.objects.create(programm=programm, frage="Wie lang?")
        _paket(antrag, "Bau", 1, 3, "1234.50")
        client.force_login(leser)

        daten = client.get("/api/foerderprogramme/").json()[0]
        assert daten["geber"] == programm.geber_id
        assert client.get("/api/foerdergeber/").json()[0]["kurz"] == "NÖ"

        assert daten["max_foerderung"] == "50000.00"
        assert daten["fragen"][0]["frage"] == "Wie lang?"
        geholt = daten["antraege"][0]
        assert geholt["summe"] == "1234.50"  # Geld als Zeichenkette
        assert geholt["pakete"][0]["betrag"] == "1234.50"
        assert geholt["laufzeit"] == 3
        assert geholt["zeichen"] == {"titel": 200, "beschreibung": 500}
        assert len(geholt["reife"]) == 9

    def test_leser_schreibt_nicht(self, client, leser, antrag):
        client.force_login(leser)
        antwort = client.patch(f"/api/foerderantraege/{antrag.pk}/", {"titel": "neu"}, content_type="application/json")
        assert antwort.status_code == 403

    def test_bearbeiter_legt_an_aber_entfernt_nicht(self, client, bearbeiter, antrag):
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/foerderpakete/",
            {"antrag": antrag.pk, "titel": "Testung", "von": 2, "bis": 4, "betrag": "500.00"},
            content_type="application/json",
        )
        assert antwort.status_code == 201
        assert client.delete(f"/api/foerderpakete/{antwort.json()['id']}/").status_code == 403

    def test_paket_endet_nicht_vor_dem_anfang(self, client, bearbeiter, antrag):
        paket = _paket(antrag, "Bau", 3, 5, None)
        client.force_login(bearbeiter)
        antwort = client.patch(f"/api/foerderpakete/{paket.pk}/", {"bis": 2}, content_type="application/json")
        assert antwort.status_code == 400
        assert "bis" in antwort.json()

    def test_antrag_entfernen_nimmt_die_pakete_mit(self, client, admin_nutzer, antrag):
        paket = _paket(antrag, "Bau", 1, 2, "10")
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/foerderantraege/{antrag.pk}/").status_code == 204
        assert not Foerderpaket.objects.filter(pk=paket.pk).exists()
        assert Foerderpaket.alle_objekte.filter(pk=paket.pk).exists()  # weich

    def test_zeitachse_einstellen(self, client, bearbeiter, antrag):
        client.force_login(bearbeiter)
        pfad = f"/api/foerderantraege/{antrag.pk}/"
        assert client.patch(pfad, {"zeitachse": 36}, content_type="application/json").json()["zeitachse"] == 36
        assert client.patch(pfad, {"zeitachse": 0}, content_type="application/json").status_code == 400
        assert client.patch(pfad, {"zeitachse": 121}, content_type="application/json").status_code == 400
        assert client.patch(pfad, {"zeitachse": None}, content_type="application/json").json()["zeitachse"] is None

    def test_stunden_und_posten_ueber_die_schnittstelle(self, client, bearbeiter, antrag):
        paket = _paket(antrag, "Bau", 1, 2, None)
        client.force_login(bearbeiter)
        assert client.patch(
            f"/api/foerderantraege/{antrag.pk}/", {"stundensatz": "50.00", "foerderquote": "50"},
            content_type="application/json",
        ).status_code == 200
        assert client.post(
            "/api/foerderstunden/", {"paket": paket.pk, "person": "BG", "stunden": "10"},
            content_type="application/json",
        ).status_code == 201
        assert client.post(
            "/api/foerderposten/", {"antrag": antrag.pk, "paket": paket.pk, "bezeichnung": "Teile", "betrag": "100"},
            content_type="application/json",
        ).status_code == 201

        geholt = client.get(f"/api/foerderantraege/{antrag.pk}/").json()
        assert geholt["kosten"]["gesamt"] == "600.00"
        assert geholt["summe"] == "300.00"
        assert geholt["pakete"][0]["stunden"][0]["person"] == "BG"
        assert geholt["pakete"][0]["kosten"]["gesamt"] == "600.00"
        assert geholt["posten"][0]["bezeichnung"] == "Teile"

    def test_posten_nicht_an_fremdes_paket(self, client, bearbeiter, programm, antrag):
        fremd = _paket(Foerderantrag.objects.create(programm=programm, titel="Anderer"), "X", 1, 1, None)
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/foerderposten/", {"antrag": antrag.pk, "paket": fremd.pk, "bezeichnung": "Teile", "betrag": "1"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
        assert "paket" in antwort.json()

    def test_paket_entfernen_laesst_seine_posten_stehen(self, client, admin_nutzer, antrag):
        paket = _paket(antrag, "Bau", 1, 2, None)
        stunden = Foerderstunden.objects.create(paket=paket, person="BG", stunden=Decimal("5"))
        posten = Foerderposten.objects.create(antrag=antrag, paket=paket, bezeichnung="Teile", betrag=Decimal("9"))
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/foerderpakete/{paket.pk}/").status_code == 204
        assert not Foerderstunden.objects.filter(pk=stunden.pk).exists()
        posten.refresh_from_db()
        assert posten.paket is None and posten.geloescht_am is None

    def test_frage_abhaken_ohne_antworttext(self, client, bearbeiter, programm):
        frage = Foerderfrage.objects.create(programm=programm, frage="Wie lang?")
        client.force_login(bearbeiter)
        antwort = client.patch(f"/api/foerderfragen/{frage.pk}/", {"beantwortet": True}, content_type="application/json")
        assert antwort.status_code == 200
        frage.refresh_from_db()
        assert frage.beantwortet and frage.antwort == ""

    def test_programm_mit_antraegen_bleibt_stehen(self, client, admin_nutzer, programm, antrag):
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/foerderprogramme/{programm.pk}/").status_code == 409

    def test_geber_mit_programmen_bleibt_stehen(self, client, admin_nutzer, programm):
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/foerdergeber/{programm.geber_id}/").status_code == 409


class TestEinspielen:
    DATEN = {
        "name": "Pflegeinnovation NÖ",
        "max_foerderung": "50000",
        "max_monate": 24,
        "steckbrief": ["Höhe: 50.000 €", "Laufzeit: 2 Jahre"],
        "fragen": [
            {"frage": "Wie lang?", "antwort": "", "quelle": "Richtlinie"},
            {"frage": "Wie viel?", "antwort": "50.000 €"},
            {"frage": "Wer?", "antwort": "Teils geklärt", "beantwortet": False},
        ],
        "antraege": [
            {
                "titel": "Befüllsystem",
                "nutzen": ["Zeile eins", "Zeile zwei"],
                "pakete": [{"titel": "Bau", "von": 1, "bis": 6, "betrag": "1000"}, {"titel": "Test", "von": 6}],
            }
        ],
    }

    def _datei(self, tmp_path, daten):
        pfad = tmp_path / "foerderungen.json"
        pfad.write_text(json.dumps(daten), encoding="utf-8")
        return str(pfad)

    def test_spielt_alles_ein(self, db, tmp_path):
        call_command("foerderungen_einspielen", datei=self._datei(tmp_path, self.DATEN), verbosity=0)

        programm = Foerderprogramm.objects.get()
        assert programm.geber.name == "Land Niederösterreich"  # ohne Angabe
        assert programm.steckbrief == "Höhe: 50.000 €\nLaufzeit: 2 Jahre"
        antrag = Foerderantrag.objects.get()
        assert antrag.nutzen == "Zeile eins\nZeile zwei"
        assert [(p.titel, p.von, p.bis) for p in Foerderpaket.objects.all()] == [("Bau", 1, 6), ("Test", 6, 6)]
        # Ohne Haken in der Datei: beantwortet, wenn eine Antwort dasteht.
        assert [f.beantwortet for f in Foerderfrage.objects.all()] == [False, True, False]

    def test_vermischt_nicht_und_ersetzt_auf_wunsch(self, db, tmp_path):
        datei = self._datei(tmp_path, self.DATEN)
        call_command("foerderungen_einspielen", datei=datei, verbosity=0)
        with pytest.raises(CommandError):
            call_command("foerderungen_einspielen", datei=datei, verbosity=0)

        call_command("foerderungen_einspielen", datei=datei, ersetzen=True, verbosity=0)
        assert Foerderprogramm.objects.count() == 1
        assert Foerderpaket.objects.count() == 2
        assert Foerderpaket.alle_objekte.count() == 4

    def test_mehrere_programme_teilen_einen_geber(self, db, tmp_path):
        daten = {
            "programme": [
                {"name": "Basisprogramm", "geber": {"name": "FFG", "kurz": "FFG"}},
                {"name": "Kleinprojekt", "geber": {"name": "FFG", "link": "https://www.ffg.at"}},
                {"name": "Preseed", "geber": {"name": "aws"}},
            ]
        }
        call_command("foerderungen_einspielen", datei=self._datei(tmp_path, daten), verbosity=0)

        ffg = Foerdergeber.objects.get(name="FFG")
        assert sorted(p.name for p in ffg.programme.all()) == ["Basisprogramm", "Kleinprojekt"]
        assert (ffg.kurz, ffg.link) == ("FFG", "https://www.ffg.at")
        assert Foerdergeber.objects.count() == 2

    def test_weist_unsinnige_monate_ab(self, db, tmp_path):
        daten = json.loads(json.dumps(self.DATEN))
        daten["antraege"][0]["pakete"][0]["bis"] = 0
        with pytest.raises(CommandError, match="Monate"):
            call_command("foerderungen_einspielen", datei=self._datei(tmp_path, daten), verbosity=0)
        assert not Foerderprogramm.objects.exists()


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


@pytest.mark.django_db(transaction=True)
def test_foerderungen_wandern_mit_der_sicherung(tmp_path, medien):
    """
    Der Fördergeber zeigt auf eine Organisation. Er muss deshalb **vor** ihr
    geleert werden, sonst hält PROTECT beim Einspielen dagegen.
    """
    haus = Organisation.objects.create(name="Österreichische Forschungsförderungsgesellschaft")
    geber = Foerdergeber.objects.create(name="FFG", kurz="FFG", link="https://www.ffg.at", organisation=haus)
    programm = Foerderprogramm.objects.create(geber=geber, name="Pflegeinnovation NÖ", max_foerderung=Decimal("50000"))
    Foerderfrage.objects.create(programm=programm, frage="Wie lang?", antwort="2 Jahre")
    antrag = Foerderantrag.objects.create(programm=programm, titel="Befüllsystem", wirkung="DGKP-Zeit")
    _paket(antrag, "Bau", 2, 9, "12345.67")
    antrag.stundensatz = Decimal("50")
    antrag.save()
    Foerderstunden.objects.create(paket=antrag.pakete.get(), person="BG", stunden=Decimal("270"))
    Foerderposten.objects.create(antrag=antrag, paket=antrag.pakete.get(), bezeichnung="Kamera", betrag=Decimal("1000"))

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Foerderstunden.objects.all().hart_loeschen()
    Foerderposten.objects.all().hart_loeschen()
    Foerderpaket.objects.all().hart_loeschen()
    Foerderantrag.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    paket = Foerderpaket.objects.get()
    assert (paket.von, paket.bis, paket.betrag) == (2, 9, Decimal("12345.67"))
    assert paket.antrag.wirkung == "DGKP-Zeit"
    assert Foerderfrage.objects.get().antwort == "2 Jahre"
    assert paket.antrag.programm.geber.link == "https://www.ffg.at"
    assert paket.antrag.stundensatz == Decimal("50.00")
    assert (paket.stunden.get().person, paket.stunden.get().stunden) == ("BG", Decimal("270.00"))
    assert (paket.posten.get().bezeichnung, paket.posten.get().betrag) == ("Kamera", Decimal("1000.00"))
    assert paket.antrag.programm.geber.organisation.name == "Österreichische Forschungsförderungsgesellschaft"
