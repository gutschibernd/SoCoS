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

from socos.models import Foerderantrag, Foerderfrage, Foerderpaket, Foerderprogramm
from socos.services import foerderung


@pytest.fixture
def programm(db):
    return Foerderprogramm.objects.create(
        name="Pflegeinnovation NÖ", max_foerderung=Decimal("50000.00"), max_monate=24
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
    programm = Foerderprogramm.objects.create(name="Pflegeinnovation NÖ", max_foerderung=Decimal("50000"))
    Foerderfrage.objects.create(programm=programm, frage="Wie lang?", antwort="2 Jahre")
    antrag = Foerderantrag.objects.create(programm=programm, titel="Befüllsystem", wirkung="DGKP-Zeit")
    _paket(antrag, "Bau", 2, 9, "12345.67")

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Foerderpaket.objects.all().hart_loeschen()
    Foerderantrag.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    paket = Foerderpaket.objects.get()
    assert (paket.von, paket.bis, paket.betrag) == (2, 9, Decimal("12345.67"))
    assert paket.antrag.wirkung == "DGKP-Zeit"
    assert Foerderfrage.objects.get().antwort == "2 Jahre"
