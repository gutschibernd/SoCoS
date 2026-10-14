"""
Die Runway-Planung: was gerechnet wird (Rhythmen, Gehälter, Szenarien,
Darlehen, Ist-Kontostand, Überbrückung), was geprüft wird (Rhythmus je Art,
Rechte), dass der Einspielbefehl nichts still verliert und dass Plan und Posten
durch die Sicherung kommen.

Die Daten sind erfunden. Echte Namen und Gehälter kommen aus `daten/`, nie aus
einem Test.
"""

import json
from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from socos.models import Kontostand, Planposten, Runwayplan
from socos.services import runway as dienst

BEGINN = date(2026, 10, 1)


def _plan(**felder):
    werte = dict(
        beginn=BEGINN,
        monate=12,
        startkontostand=Decimal("10000"),
        puffer=Decimal("0"),
        lohnnebenkosten=Decimal("30"),
        vierzehn_gehaelter=True,
        abruf_monate=3,
    )
    werte.update(felder)
    return Runwayplan.objects.create(**werte)


def _posten(art, betrag, von, **felder):
    return Planposten.objects.create(art=art, name=felder.pop("name", art), betrag=Decimal(betrag), von=von, **felder)


def _monate(szenario="basis", heute=BEGINN):
    return {m["monat"]: m for m in dienst.rechnen(szenario, heute=heute)["monate"]}


# --- Rechnung ----------------------------------------------------------------


@pytest.mark.django_db
class TestRhythmus:
    def test_monatlich_von_bis(self):
        _plan()
        _posten("kosten", "1000", date(2026, 10, 15), rhythmus="monatlich", bis=date(2027, 1, 15))
        m = _monate()
        assert [m[k]["kosten"] for k in ("2026-10", "2026-11", "2026-12", "2027-01", "2027-02")] == [
            Decimal("1000.00"), Decimal("1000.00"), Decimal("1000.00"), Decimal("1000.00"), Decimal("0"),
        ]

    def test_quartal_zaehlt_ab_dem_eigenen_beginn(self):
        """Begonnen im August: November, Februar, Mai, August — nicht Oktober, Jänner …"""
        _plan()
        _posten("kosten", "300", date(2026, 8, 1), rhythmus="quartal")
        m = _monate()
        mit = [k for k, v in m.items() if v["kosten"]]
        assert mit == ["2026-11", "2027-02", "2027-05", "2027-08"]

    def test_einmalig_steht_als_ereignis_da(self):
        _plan()
        _posten("kosten", "2500", date(2026, 11, 1), name="Notar")
        m = _monate()
        assert m["2026-11"]["ereignisse"] == [{"text": "Notar", "betrag": Decimal("-2500.00")}]

    def test_ausserhalb_des_plans_zaehlt_nicht(self):
        _plan(monate=6)
        _posten("kosten", "999", date(2027, 6, 1))
        assert all(not v["kosten"] for v in _monate().values())


@pytest.mark.django_db
class TestPersonal:
    def test_anteilig_im_ersten_und_letzten_monat_und_doppelt_im_juni(self):
        _plan()
        _posten("person", "1000", date(2027, 1, 15), rhythmus="monatlich", bis=date(2027, 7, 15))
        m = _monate()
        assert m["2026-12"]["personal"] == 0
        assert m["2027-01"]["personal"] == Decimal("712.90")  # 17/31 × 1000 × 1,3
        assert m["2027-02"]["personal"] == Decimal("1300.00")
        assert m["2027-06"]["personal"] == Decimal("2600.00")  # 14. Gehalt
        assert m["2027-07"]["personal"] == Decimal("629.03")  # 15/31 × 1000 × 1,3
        assert m["2027-08"]["personal"] == 0
        assert m["2027-01"]["ereignisse"][0]["text"] == "Eintritt person"

    def test_eigener_satz_und_zwoelf_gehaelter(self):
        _plan(vierzehn_gehaelter=False)
        _posten("person", "2000", date(2026, 10, 1), rhythmus="monatlich", lohnnebenkosten=Decimal("0"))
        m = _monate()
        assert m["2026-10"]["personal"] == Decimal("2000.00")
        assert m["2027-06"]["personal"] == Decimal("2000.00")


@pytest.mark.django_db
class TestSzenarien:
    @pytest.fixture
    def posten(self):
        _plan()
        _posten("umsatz", "42000", date(2027, 2, 1), wahrscheinlichkeit=50)
        _posten("foerderung", "5000", date(2026, 11, 1), status="geplant")
        _posten("foerderung", "3000", date(2026, 11, 1), status="zugesagt")

    @pytest.mark.parametrize(
        "szenario, umsatz, foerderung",
        [("optimistisch", "42000", "8000"), ("basis", "21000", "8000"), ("konservativ", "10500", "3000")],
    )
    def test_gewichtung(self, posten, szenario, umsatz, foerderung):
        m = _monate(szenario)
        assert m["2027-02"]["umsatz"] == Decimal(umsatz)
        assert m["2026-11"]["foerderung"] == Decimal(foerderung)

    def test_unbekanntes_szenario(self):
        with pytest.raises(ValueError):
            dienst.rechnen("rosig")


@pytest.mark.django_db
class TestDarlehen:
    def test_rueckzahlung_mit_zins_und_verlauf_ohne(self):
        _plan()
        _posten("darlehen", "10000", date(2026, 10, 1), bis=date(2027, 4, 1), zins=Decimal("6"))
        m = _monate()
        assert m["2026-10"]["darlehen"] == Decimal("10000.00")
        assert m["2027-04"]["rueckzahlung"] == Decimal("10300.00")  # 6 % für ein halbes Jahr
        assert m["2026-10"]["stand"] == Decimal("20000.00")
        assert m["2026-10"]["ohne_darlehen"] == Decimal("10000.00")
        assert m["2027-04"]["stand"] == Decimal("9700.00")
        assert m["2027-04"]["ohne_darlehen"] == Decimal("10000.00")

    def test_ohne_rueckzahlung_bleibt_es_stehen(self):
        _plan()
        _posten("darlehen", "10000", date(2026, 10, 1))
        assert all(not v["rueckzahlung"] for v in _monate().values())


@pytest.mark.django_db
class TestIst:
    def test_ein_kontostand_ersetzt_den_plan_bis_zu_seinem_tag(self):
        """Was im selben Monat danach fällig ist, kommt noch dazu."""
        _plan()
        _posten("kosten", "1000", date(2026, 10, 1), rhythmus="monatlich")
        _posten("kosten", "500", date(2026, 11, 20))
        Kontostand.objects.create(datum=date(2026, 11, 10), betrag=Decimal("7000"))
        m = _monate()
        assert m["2026-11"]["ist"] == Decimal("7000")
        assert m["2026-11"]["stand"] == Decimal("6500.00")
        assert m["2026-12"]["stand"] == Decimal("5500.00")

    def test_ohne_kontostand_der_reine_plan(self):
        _plan()
        _posten("kosten", "1000", date(2026, 10, 1), rhythmus="monatlich")
        Kontostand.objects.create(datum=date(2026, 9, 30), betrag=Decimal("1"))  # vor dem Plan
        m = _monate()
        assert m["2026-11"]["stand"] == Decimal("8000.00")
        assert m["2026-11"]["ist"] is None


@pytest.mark.django_db
class TestUeberbrueckung:
    @pytest.fixture
    def knapp(self):
        _plan(startkontostand=Decimal("12000"), puffer=Decimal("5000"))
        _posten("kosten", "2000", date(2026, 10, 1), rhythmus="monatlich")

    def test_abrufe_in_fuenftausendern_fuer_drei_monate(self, knapp):
        r = dienst.rechnen("basis", heute=BEGINN)
        assert [(a["monat"], a["betrag"]) for a in r["abrufe"]] == [
            ("2027-01", Decimal("5000")),
            ("2027-04", Decimal("10000")),
            ("2027-09", Decimal("5000")),
        ]
        k = r["kennzahlen"]
        assert k["ueberbrueckung"] == Decimal("20000")
        assert k["unter_puffer_ab"] == "2027-01"
        assert k["minus_ab"] == "2027-04"
        assert (k["tiefster_monat"], k["tiefster_stand"]) == ("2027-09", Decimal("-12000.00"))
        assert k["burn"] == Decimal("2000.00")

    def test_vorgeschlagen_wird_erst_ab_heute(self, knapp):
        r = dienst.rechnen("basis", heute=date(2027, 2, 15))
        assert r["abrufe"][0]["monat"] == "2027-02"
        assert r["kennzahlen"]["burn_ab"] == "2027-02"


@pytest.mark.django_db
def test_ohne_plan_keine_rechnung():
    assert dienst.rechnen("basis") is None


@pytest.mark.django_db
def test_je_posten_die_summe_im_plan():
    _plan()
    p = _posten("kosten", "100", date(2026, 10, 1), rhythmus="monatlich")
    assert dienst.rechnen("basis", heute=BEGINN)["je_posten"][str(p.id)] == Decimal("1200.00")


# --- Schnittstelle -------------------------------------------------------------


@pytest.mark.django_db
class TestSchnittstelle:
    def test_ohne_plan_steht_nichts_da(self, client, leser):
        client.force_login(leser)
        antwort = client.get("/api/runway/").json()
        assert antwort == {"plan": None, "posten": [], "rechnung": None}

    def test_geld_als_zeichenkette(self, client, leser):
        _plan()
        client.force_login(leser)
        antwort = client.get("/api/runway/?szenario=konservativ").json()
        assert antwort["rechnung"]["szenario"] == "konservativ"
        assert antwort["rechnung"]["monate"][0]["stand"] == "10000.00"
        assert antwort["plan"]["puffer"] == "0.00"

    def test_unbekanntes_szenario_ist_ein_fehler(self, client, leser):
        client.force_login(leser)
        assert client.get("/api/runway/?szenario=rosig").status_code == 400

    @pytest.mark.parametrize("wer", ["leser", "bearbeiter"])
    def test_eintragen_nur_der_admin(self, client, request, wer):
        client.force_login(request.getfixturevalue(wer))
        daten = {"art": "kosten", "name": "Miete", "betrag": "800", "von": "2026-10-01", "rhythmus": "monatlich"}
        assert client.post("/api/planposten/", daten, content_type="application/json").status_code == 403

    def test_person_ist_ohne_angabe_monatlich(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        antwort = client.post(
            "/api/planposten/",
            {"art": "person", "name": "N. N.", "betrag": "2400", "von": "2027-01-01"},
            content_type="application/json",
        )
        assert antwort.status_code == 201
        assert antwort.json()["rhythmus"] == "monatlich"

    def test_eine_tranche_ist_einmalig(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        antwort = client.post(
            "/api/planposten/",
            {"art": "foerderung", "name": "KWF", "betrag": "1000", "von": "2027-01-01", "rhythmus": "monatlich"},
            content_type="application/json",
        )
        assert antwort.status_code == 400
        assert "rhythmus" in antwort.json()

    def test_ende_vor_anfang(self, client, admin_nutzer):
        p = _posten("kosten", "10", date(2026, 10, 1), rhythmus="monatlich")
        client.force_login(admin_nutzer)
        antwort = client.patch(f"/api/planposten/{p.id}/", {"bis": "2026-09-01"}, content_type="application/json")
        assert antwort.status_code == 400

    def test_die_art_bleibt(self, client, admin_nutzer):
        p = _posten("kosten", "10", date(2026, 10, 1), rhythmus="monatlich")
        client.force_login(admin_nutzer)
        antwort = client.patch(f"/api/planposten/{p.id}/", {"art": "umsatz"}, content_type="application/json")
        assert antwort.status_code == 400

    def test_nur_ein_plan_und_der_bleibt(self, client, admin_nutzer):
        plan = _plan()
        client.force_login(admin_nutzer)
        zweiter = client.post("/api/runwayplaene/", {"beginn": "2027-01-01"}, content_type="application/json")
        assert zweiter.status_code == 400
        assert client.delete(f"/api/runwayplaene/{plan.id}/").status_code == 405

    def test_beginn_wird_der_erste(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        antwort = client.post("/api/runwayplaene/", {"beginn": "2027-01-17"}, content_type="application/json")
        assert antwort.json()["beginn"] == "2027-01-01"


# --- Einspielen ------------------------------------------------------------------


class TestEinspielen:
    DATEN = {
        "v": 1,
        "settings": {"start": "2026-10-01", "months": 24, "cash": 5000, "buffer": 15000, "lnk": 30, "sonder": True, "bridgeGroup": 3},
        "foerderungen": [
            {"name": "Programm A", "geber": "Geber A", "tranchen": [
                {"date": "2027-03-15", "amount": 1000, "status": "zugesagt", "note": "nach Bericht"},
                {"date": "2027-06-15", "amount": 500, "status": "geplant", "note": ""},
            ]},
        ],
        "investments": [],
        "umsaetze": [{"name": "Kunde A", "amount": 4200, "interval": "einmalig", "start": "2027-02-01", "end": "", "prob": 50}],
        "team": [{"name": "Person A", "role": "Design", "gross": 1600, "start": "2027-01-15", "end": "2027-07-15"}],
        "kosten": [
            {"name": "Material", "cat": " Bestand", "amount": 1400, "interval": "monatlich", "start": "2026-10-15", "end": "2027-03-15"},
            {"name": "Notar", "cat": "Gründung", "amount": 2500, "interval": "einmalig", "start": "2026-11-01", "end": ""},
        ],
        "darlehen": [{"name": "Gesellschafter", "amount": 10000, "date": "2026-10-01", "repay": "", "zins": 0}],
    }

    def _datei(self, tmp_path, daten=None):
        pfad = tmp_path / "finance.json"
        pfad.write_text(json.dumps(daten or self.DATEN), encoding="utf-8")
        return str(pfad)

    @pytest.mark.django_db
    def test_alles_kommt_an(self, tmp_path):
        call_command("runway_einspielen", datei=self._datei(tmp_path), verbosity=0)
        plan = Runwayplan.objects.get()
        assert (plan.beginn, plan.monate, plan.startkontostand, plan.puffer) == (
            date(2026, 10, 1), 24, Decimal("5000"), Decimal("15000"),
        )
        arten = sorted(Planposten.objects.values_list("art", flat=True))
        assert arten == ["darlehen", "foerderung", "foerderung", "kosten", "kosten", "person", "umsatz"]
        tranche = Planposten.objects.get(art="foerderung", status="zugesagt")
        assert (tranche.name, tranche.gruppe, tranche.notiz) == ("Programm A", "Geber A", "nach Bericht")
        material = Planposten.objects.get(name="Material")
        assert (material.gruppe, material.rhythmus, material.bis) == ("Bestand", "monatlich", date(2027, 3, 15))
        person = Planposten.objects.get(art="person")
        assert (person.rhythmus, person.gruppe, person.lohnnebenkosten) == ("monatlich", "Design", None)
        assert Planposten.objects.get(art="umsatz").wahrscheinlichkeit == 50

    @pytest.mark.django_db
    def test_zweimal_nur_mit_ersetzen(self, tmp_path):
        datei = self._datei(tmp_path)
        call_command("runway_einspielen", datei=datei, verbosity=0)
        with pytest.raises(CommandError, match="schon einen Plan"):
            call_command("runway_einspielen", datei=datei, verbosity=0)
        call_command("runway_einspielen", datei=datei, ersetzen=True, verbosity=0)
        assert Runwayplan.objects.count() == 1
        assert Planposten.objects.count() == 7
        assert Planposten.alle_objekte.count() == 14  # die alten weich entfernt

    @pytest.mark.django_db
    def test_investments_brechen_ab_statt_zu_fehlen(self, tmp_path):
        daten = json.loads(json.dumps(self.DATEN))
        daten["investments"] = [{"name": "Angel", "amount": 50000, "date": "2027-01-01", "status": "geplant"}]
        with pytest.raises(CommandError, match="Investment"):
            call_command("runway_einspielen", datei=self._datei(tmp_path, daten), verbosity=0)
        assert not Runwayplan.objects.exists()
        assert not Planposten.objects.exists()


# --- Sicherung -------------------------------------------------------------------


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


@pytest.mark.django_db(transaction=True)
def test_plan_und_posten_wandern_mit_der_sicherung(tmp_path, medien):
    _plan(puffer=Decimal("15000"), abruf_monate=6)
    _posten("person", "1600", date(2027, 1, 15), rhythmus="monatlich", bis=date(2027, 7, 15), gruppe="Design",
            lohnnebenkosten=Decimal("31.5"))
    _posten("umsatz", "42000", date(2027, 2, 1), wahrscheinlichkeit=50)

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Planposten.objects.all().hart_loeschen()
    Runwayplan.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    plan = Runwayplan.objects.get()
    assert (plan.puffer, plan.abruf_monate) == (Decimal("15000.00"), 6)
    person = Planposten.objects.get(art="person")
    assert (person.bis, person.gruppe, person.lohnnebenkosten) == (date(2027, 7, 15), "Design", Decimal("31.50"))
    assert Planposten.objects.get(art="umsatz").wahrscheinlichkeit == 50
