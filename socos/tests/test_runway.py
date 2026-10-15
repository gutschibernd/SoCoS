"""
Die Runway-Planung: dass die Rechnung die des Runway-Planers ist (Umsatzsteuer,
Gehälter, NeuFöG, Forschungsprämie, Darlehen, Szenarien, Überbrückung), wo sie
mit Absicht abweicht (Ist ab dem Stichtag, Rhythmus ab dem eigenen Beginn), wer
schreiben darf, dass gleichzeitiges Speichern nicht still überschreibt, dass
das Protokoll Feld für Feld schreibt, und dass der Plan durch die Sicherung
kommt.

Die Daten sind erfunden. Echte Namen und Gehälter kommen aus `daten/`, nie aus
einem Test.

Gegen den Planer selbst geprüft wurde die Rechnung beim Bau mit einem Plan,
der jede Funktion benutzt — drei Szenarien, 36 Monate, alle Töpfe, keine
Abweichung. Der Planer liegt nicht im Repository; diese Tests halten fest,
was dabei herauskam.
"""

import json
from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from socos.models import Kontostand, Protokolleintrag, Runwayplan
from socos.services import runway as dienst


def _plan(**teile):
    plan = dienst.leerer_plan(date(2026, 10, 14))
    plan["settings"].update({"start": "2026-10-01", "months": 12, "cash": 10000, "buffer": 0, "ust": False})
    for k, v in teile.items():
        if isinstance(v, dict) and isinstance(plan.get(k), dict):
            plan[k].update(v)
        else:
            plan[k] = v
    return dienst.normalisieren(plan)


def _monate(plan, szenario="basis", ist=None):
    A, _ = dienst.berechnen(plan, szenario, True, ist or {})
    return A


def D(wert):
    return Decimal(str(wert))


# --- Rechnung --------------------------------------------------------------------


class TestRhythmus:
    def test_monatlich_von_bis(self):
        A = _monate(_plan(kosten=[{"amount": 1000, "interval": "monatlich", "start": "2026-10-15", "end": "2027-01-15"}]))
        assert [A[i]["kosten"] for i in range(5)] == [D(1000)] * 4 + [D(0)]

    def test_quartal_zaehlt_ab_dem_eigenen_beginn(self):
        """Begonnen im August: November, Februar, Mai, August (der Planer begann im Oktober neu)."""
        A = _monate(_plan(kosten=[{"amount": 300, "interval": "quartal", "start": "2026-08-01"}]))
        assert [m["i"] for m in A if m["kosten"]] == [1, 4, 7, 10]

    def test_einmalig_als_ereignis(self):
        A = _monate(_plan(kosten=[{"name": "Notar", "amount": 2500, "interval": "einmalig", "start": "2026-11-01"}]))
        assert A[1]["ev"] == [{"t": "Notar", "v": D(-2500)}]

    def test_sicherheitszuschlag_und_kategorie(self):
        plan = _plan(kosten=[{"amount": 1000, "interval": "monatlich", "start": "2026-10-01", "cat": " Miete "}])
        plan["settings"]["contingency"] = 10
        A = _monate(plan)
        assert A[0]["kosten"] == D(1100)
        assert A[0]["kostCat"] == {"Miete": D(1100)}


class TestPersonal:
    def test_volle_monate_vierzehn_gehaelter_und_lohnnebenkosten(self):
        A = _monate(_plan(team=[{"gross": 1000, "start": "2027-01-15", "end": "2027-07-15"}]))
        assert A[3]["team"] == D(1300)  # Jänner zählt ganz, wie im Planer
        assert A[8]["team"] == D(2600)  # Juni doppelt
        assert A[9]["team"] == D(1300)  # Juli
        assert A[10]["team"] == 0
        assert A[3]["head"] == 1

    def test_gehaltsanpassung_ab_jaenner(self):
        plan = _plan(team=[{"gross": 1000, "start": "2026-10-01", "lnk": 0}])
        plan["settings"].update({"raise": 3, "sonder": False})
        A = _monate(plan)
        assert A[2]["team"] == D(1000)
        assert A[3]["team"] == D(1030)

    def test_neufoeg_im_ersten_jahr_fuer_alle(self):
        plan = _plan(team=[{"id": "a", "gross": 1000, "start": "2026-10-01", "lnk": 0}], neufoeg={"aktiv": True, "gruendung": "2026-10-01"})
        plan["settings"]["sonder"] = False
        A = _monate(plan)
        assert A[0]["neuf"] == D("56.0")
        assert A[0]["team"] == D(1000) - D("56.0")


class TestSzenarien:
    @pytest.fixture
    def plan(self):
        return _plan(
            umsaetze=[{"amount": 42000, "interval": "einmalig", "start": "2027-02-01", "prob": 50}],
            foerderungen=[{"name": "F", "tranchen": [
                {"date": "2026-11-01", "amount": 5000, "status": "geplant"},
                {"date": "2026-11-01", "amount": 3000, "status": "zugesagt"},
            ]}],
            investments=[{"amount": 20000, "date": "2027-01-01", "status": "geplant"}],
        )

    @pytest.mark.parametrize(
        "szenario, umsatz, foerderung, investment",
        [("optimistisch", 42000, 8000, 20000), ("basis", 21000, 8000, 20000), ("konservativ", 10500, 3000, 0)],
    )
    def test_gewichtung(self, plan, szenario, umsatz, foerderung, investment):
        A = _monate(plan, szenario)
        assert (A[4]["ums"], A[1]["foerd"], A[3]["inv"]) == (D(umsatz), D(foerderung), D(investment))

    def test_unbekanntes_szenario(self, db):
        with pytest.raises(ValueError):
            dienst.rechnen(_plan(), "rosig")


class TestSteuern:
    def test_uva_am_fuenfzehnten_des_zweitfolgenden_monats(self):
        plan = _plan(umsaetze=[{"amount": 1000, "interval": "einmalig", "start": "2026-10-01", "ust": "20"}])
        plan["settings"]["ust"] = True
        A = _monate(plan, "optimistisch")
        assert A[0]["ustIn"] == D(200)
        assert A[2]["uvaOut"] == D(200)

    def test_vierteljaehrlich_nach_dem_quartal(self):
        plan = _plan(kosten=[{"amount": 1000, "interval": "einmalig", "start": "2026-10-01", "ust": "20"}])
        plan["settings"].update({"ust": True, "uva": "quartal"})
        A = _monate(plan)
        assert A[4]["uvaIn"] == D(200)  # Q4 endet im Dezember, Gutschrift im Februar

    def test_forschungspraemie_im_folgejahr(self):
        plan = _plan(team=[{"gross": 1000, "start": "2026-10-01", "lnk": 0, "fe": 50}], fp={"aktiv": True, "satz": 14, "monat": 9})
        plan["settings"].update({"sonder": False, "months": 24})
        A, basis = dienst.berechnen(plan, "basis", True, {})
        assert basis[2026] == D(1500)  # Oktober bis Dezember, je 500
        assert A[11]["fp"] == D(210)  # September 2027


class TestDarlehen:
    def test_endfaellig_mit_zins_und_verlauf_ohne(self):
        plan = _plan(darlehen=[{"amount": 10000, "date": "2026-10-01", "repay": "2027-04-01", "zins": 6}])
        A, _ = dienst.berechnen(plan, "basis", True, {})
        Z, _ = dienst.berechnen(plan, "basis", False, {})
        assert A[0]["darl"] == D(10000)
        assert A[6]["tilg"] == D(10300)
        assert (A[0]["cash"], Z[0]["cash"]) == (D(20000), D(10000))

    def test_raten(self):
        plan = _plan(darlehen=[{"typ": "bank", "amount": 12000, "date": "2026-10-01", "tilgung": "raten", "tilgStart": "2026-12-01", "raten": 12, "zins": 0}])
        A = _monate(plan)
        assert A[0]["kredit"] == D(12000)
        assert A[1]["tilg"] == 0
        assert A[2]["tilg"] == D(1000)

    def test_rueckzahlung_einer_foerderung_zaehlt_in_jedem_szenario(self):
        plan = _plan(foerderungen=[{"name": "F", "tranchen": [{"date": "2027-01-01", "amount": 500, "art": "rueckzahlung", "status": "geplant"}]}])
        assert _monate(plan, "konservativ")[3]["foerdBack"] == D(500)


class TestIst:
    def test_ein_stichtag_ersetzt_den_plan_bis_zu_seinem_tag(self):
        """Was im selben Monat danach fällig ist, kommt noch dazu."""
        plan = _plan(kosten=[
            {"amount": 1000, "interval": "monatlich", "start": "2026-10-01"},
            {"amount": 500, "interval": "einmalig", "start": "2026-11-20"},
        ])
        k = Kontostand(datum=date(2026, 11, 10), betrag=D(7000))
        A = _monate(plan, ist={1: k})
        assert A[1]["ist"] == D(7000)
        assert A[1]["cash"] == D(6500)
        assert A[2]["cash"] == D(5500)

    def test_am_monatsletzten_wie_die_ist_zelle_des_planers(self):
        plan = _plan(team=[{"gross": 1000, "start": "2026-10-01", "lnk": 0}])
        plan["settings"]["sonder"] = False
        A = _monate(plan, ist={0: Kontostand(datum=date(2026, 10, 31), betrag=D(5000))})
        assert A[0]["cash"] == D(5000)

    def test_abschaltbar(self):
        plan = _plan()
        plan["settings"]["rebase"] = False
        A = _monate(plan, ist={0: Kontostand(datum=date(2026, 10, 31), betrag=D(1))})
        assert A[0]["cash"] == D(10000)


class TestUeberbrueckung:
    def test_in_fuenftausendern_fuer_drei_monate(self):
        plan = _plan(kosten=[{"amount": 2000, "interval": "monatlich", "start": "2026-10-01"}])
        plan["settings"].update({"cash": 12000, "buffer": 5000})
        A = _monate(plan)
        abrufe = dienst.ueberbrueckung(A, D(5000), 3)
        assert [(a["i"], a["amount"]) for a in abrufe] == [(3, D(5000)), (6, D(10000)), (11, D(5000))]


# --- Dokument ----------------------------------------------------------------------


class TestNormalisieren:
    def test_export_huelle_und_grenzen(self):
        plan = dienst.normalisieren({"format": "runway-planer", "plan": {"settings": {"months": 200, "start": "2027-03-17"}, "actuals": {"2027-03": 1}}})
        assert plan["settings"]["months"] == 72
        assert plan["settings"]["start"] == "2027-03-01"
        assert "actuals" not in plan

    def test_jeder_eintrag_bekommt_eine_kennung(self):
        plan = dienst.normalisieren({"settings": {}, "kosten": [{"name": "a"}, "Unsinn"], "foerderungen": [{"tranchen": [{}]}]})
        assert len(plan["kosten"]) == 1 and plan["kosten"][0]["id"]
        assert plan["foerderungen"][0]["tranchen"][0]["id"]

    def test_unterschiede_mit_namen_im_pfad(self):
        alt = _plan(kosten=[{"id": "k", "name": "Overhead", "amount": 1000}])
        neu = json.loads(json.dumps(alt))
        neu["kosten"][0]["amount"] = 1200
        neu["settings"]["buffer"] = 15000
        u = dienst.unterschiede(alt, neu)
        assert u["kosten[Overhead].amount"] == {"alt": 1000, "neu": 1200}
        assert u["settings.buffer"] == {"alt": 0, "neu": 15000}


# --- Schnittstelle -------------------------------------------------------------------


@pytest.mark.django_db
class TestSchnittstelle:
    def _put(self, client, plan, stand):
        return client.put("/api/runway/", {"plan": plan, "stand": stand}, content_type="application/json")

    def test_ohne_plan_kommt_ein_leerer(self, client, leser):
        client.force_login(leser)
        antwort = client.get("/api/runway/").json()
        assert antwort["stand"] is None
        assert antwort["darf_schreiben"] is False
        assert antwort["rechnung"]["leer"] is True

    def test_geld_als_zeichenkette(self, client, leser):
        Runwayplan.objects.create(daten=_plan())
        client.force_login(leser)
        antwort = client.get("/api/runway/?szenario=konservativ").json()
        assert antwort["rechnung"]["A"][0]["cash"] == "10000.00"

    def test_unbekanntes_szenario(self, client, leser):
        client.force_login(leser)
        assert client.get("/api/runway/?szenario=rosig").status_code == 400

    @pytest.mark.parametrize("wer", ["leser", "bearbeiter"])
    def test_schreiben_nur_der_admin(self, client, request, wer):
        client.force_login(request.getfixturevalue(wer))
        assert self._put(client, _plan(), None).status_code == 403
        assert client.post("/api/runway/ist/", {"monat": "2026-10", "betrag": "1"}, content_type="application/json").status_code == 403

    def test_anlegen_aendern_und_protokoll(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        erst = self._put(client, _plan(kosten=[{"id": "k", "name": "Miete", "amount": 800}]), None).json()
        assert Runwayplan.objects.count() == 1
        plan = erst["plan"]
        plan["kosten"][0]["amount"] = 900
        zweit = self._put(client, plan, erst["stand"])
        assert zweit.status_code == 200
        eintrag = Protokolleintrag.objects.filter(modell="socos.Runwayplan", aktion="geaendert").get()
        assert eintrag.aenderungen == {"kosten[Miete].amount": {"alt": 800, "neu": 900}}

    def test_veralteter_stand_ueberschreibt_nicht(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        erst = self._put(client, _plan(), None).json()
        self._put(client, {**erst["plan"], "notes": "von woanders"}, erst["stand"])
        veraltet = self._put(client, {**erst["plan"], "notes": "meins"}, erst["stand"])
        assert veraltet.status_code == 409
        assert Runwayplan.objects.get().daten["notes"] == "von woanders"

    def test_ist_zelle_schreibt_den_kontostand(self, client, admin_nutzer):
        Runwayplan.objects.create(daten=_plan())
        client.force_login(admin_nutzer)
        ist = lambda betrag: client.post("/api/runway/ist/", {"monat": "2026-11", "betrag": betrag}, content_type="application/json")  # noqa: E731
        antwort = ist("7000").json()
        assert Kontostand.objects.get().datum == date(2026, 11, 30)
        assert antwort["rechnung"]["A"][1]["ist"] == "7000.00"
        ist("7100")
        assert Kontostand.objects.get().betrag == D(7100)
        ist(None)
        assert not Kontostand.objects.exists()
        ist("7200")  # holt den weich entfernten am selben Tag zurück
        assert Kontostand.objects.get().betrag == D(7200)

    def test_ist_zelle_aendert_einen_stichtag_mitten_im_monat(self, client, admin_nutzer):
        Runwayplan.objects.create(daten=_plan())
        Kontostand.objects.create(datum=date(2026, 10, 1), betrag=D(10000))
        client.force_login(admin_nutzer)
        client.post("/api/runway/ist/", {"monat": "2026-10", "betrag": "9000"}, content_type="application/json")
        k = Kontostand.objects.get()
        assert (k.datum, k.betrag) == (date(2026, 10, 1), D(9000))


# --- Einspielen ------------------------------------------------------------------------


class TestEinspielen:
    DATEN = {
        "v": 1,
        "settings": {"company": "Firma", "start": "2026-10-01", "months": 24, "cash": 5000, "buffer": 15000},
        "foerderungen": [{"id": "f", "name": "Programm A", "geber": "Geber A", "tranchen": [{"id": "t", "date": "2027-03-15", "amount": 1000, "status": "zugesagt"}]}],
        "kosten": [{"id": "k", "name": "Miete", "amount": 800, "interval": "monatlich", "start": "2026-10-01"}],
        "actuals": {"2026-10": 4000},
    }

    def _datei(self, tmp_path, daten=None):
        pfad = tmp_path / "finance.json"
        pfad.write_text(json.dumps(daten or self.DATEN), encoding="utf-8")
        return str(pfad)

    @pytest.mark.django_db
    def test_kommt_an_wie_der_planer_es_oeffnet(self, tmp_path):
        call_command("runway_einspielen", datei=self._datei(tmp_path), verbosity=0)
        plan = Runwayplan.objects.get().daten
        assert plan["settings"]["company"] == "Firma"
        assert plan["settings"]["ust"] is True  # Vorgabe des Planers, die Datei kennt das Feld nicht
        assert plan["foerderungen"][0]["tranchen"][0]["amount"] == 1000
        assert "actuals" not in plan
        assert not Kontostand.objects.exists()

    @pytest.mark.django_db
    def test_zweimal_nur_mit_ersetzen(self, tmp_path):
        datei = self._datei(tmp_path)
        call_command("runway_einspielen", datei=datei, verbosity=0)
        with pytest.raises(CommandError, match="schon einen Plan"):
            call_command("runway_einspielen", datei=datei, verbosity=0)
        call_command("runway_einspielen", datei=datei, ersetzen=True, verbosity=0)
        assert Runwayplan.objects.count() == 1

    @pytest.mark.django_db
    def test_keine_planung(self, tmp_path):
        with pytest.raises(CommandError, match="keinen Runway-Plan"):
            call_command("runway_einspielen", datei=self._datei(tmp_path, {"irgendwas": 1}), verbosity=0)


# --- Sicherung ---------------------------------------------------------------------------


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


@pytest.mark.django_db(transaction=True)
def test_der_plan_wandert_mit_der_sicherung(tmp_path, medien):
    plan = _plan(team=[{"id": "p", "name": "Person A", "gross": 1600, "start": "2027-01-15"}], notes="Annahme: KWF zahlt im März")
    Runwayplan.objects.create(daten=plan)

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Runwayplan.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder = Runwayplan.objects.get().daten
    assert wieder["team"][0]["gross"] == 1600
    assert wieder["notes"] == "Annahme: KWF zahlt im März"
