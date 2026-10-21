"""
Die Planung einer Projektphase: was gerechnet wird (Soll bis heute, Lage einer
Aufgabe, was als Nächstes ansteht, die Achse), was geprüft wird (Antragspaket
nur aus dem Antrag der Phase, Zeitraum ganz oder gar nicht) und dass die neuen
Felder durch die Sicherung kommen.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.utils import timezone

from socos.models import (
    Arbeitspaket,
    Foerderantrag,
    Foerdergeber,
    Foerderpaket,
    Foerderprogramm,
    Foerderstunden,
    Pensum,
    Phasenart,
    Projekt,
    Projektphase,
    Unteraufgabe,
    Zeitbuchung,
)
from socos.services import planung as dienst

HEUTE = date(2026, 11, 15)


@pytest.fixture
def antrag(db):
    geber = Foerdergeber.objects.create(name="Kärntner Wirtschaftsförderungs Fonds", kurz="KWF")
    programm = Foerderprogramm.objects.create(geber=geber, name="Umsetzung.F&E&I")
    return Foerderantrag.objects.create(
        programm=programm, titel="Laborprototyp", stand=Foerderantrag.Stand.BEWILLIGT, beginn=date(2026, 10, 1)
    )


@pytest.fixture
def phase(db):
    projekt = Projekt.objects.create(titel="Arzneimittelspender")
    return Projektphase.objects.create(
        projekt=projekt, titel="Laborprototypen entwickeln", art=Phasenart.DEV,
        von=date(2026, 10, 1), bis=date(2027, 3, 31),
    )


def _buchen(person, paket, stunden, tag=date(2026, 11, 2)):
    start = timezone.make_aware(datetime(tag.year, tag.month, tag.day, 8))
    return Zeitbuchung.objects.create(person=person, paket=paket, start=start, ende=start + timedelta(hours=stunden))


class TestRechnung:
    def test_soll_bis_heute_gleichmaessig_ueber_die_tage(self):
        # 1.–30. November, 300 h: am 15. sind 15 von 30 Tagen vorbei.
        assert dienst.soll_bis(Decimal("300"), date(2026, 11, 1), date(2026, 11, 30), HEUTE) == Decimal("150.00")

    def test_soll_vor_dem_beginn_und_nach_dem_ende(self):
        assert dienst.soll_bis(Decimal("40"), date(2026, 12, 1), date(2026, 12, 31), HEUTE) == Decimal("0.00")
        assert dienst.soll_bis(Decimal("40"), date(2026, 10, 1), date(2026, 10, 31), HEUTE) == Decimal("40")

    def test_paketzeitraum_ueber_den_jahreswechsel(self):
        from socos.services.foerderung import zeitraum

        assert zeitraum(date(2026, 10, 1), None, 3, 5) == (date(2026, 12, 1), date(2027, 2, 28))
        # Mitten im Monat begonnen: auf den Tag, und das Ende schneidet ab.
        assert zeitraum(date(2026, 10, 19), date(2027, 2, 10), 3, 4) == (date(2026, 12, 19), date(2027, 2, 10))

    def test_lage_erledigt_gewinnt(self):
        aufgabe = Unteraufgabe(titel="x", erledigt=True, von=date(2026, 10, 1), bis=date(2026, 10, 2))
        assert dienst.lage(aufgabe, HEUTE) == "erledigt"
        aufgabe.erledigt = False
        assert dienst.lage(aufgabe, HEUTE) == "ueberfaellig"
        aufgabe.von, aufgabe.bis = date(2026, 11, 1), date(2026, 11, 15)
        assert dienst.lage(aufgabe, HEUTE) == "laeuft"
        aufgabe.von, aufgabe.bis = date(2026, 11, 16), date(2026, 11, 20)
        assert dienst.lage(aufgabe, HEUTE) == "steht_an"
        aufgabe.von = aufgabe.bis = None
        assert dienst.lage(aufgabe, HEUTE) == "ohne_termin"

    def test_naechste_ueberfaellig_dann_laufend_dann_anstehend(self):
        def a(id, lage, von, bis):
            return {"id": id, "lage": lage, "von": von, "bis": bis}

        aufgaben = [
            a(1, "steht_an", date(2026, 12, 1), date(2026, 12, 5)),
            a(2, "laeuft", date(2026, 11, 1), date(2026, 11, 30)),
            a(3, "ueberfaellig", date(2026, 10, 1), date(2026, 11, 10)),
            a(4, "laeuft", date(2026, 11, 10), date(2026, 11, 20)),
            a(5, "erledigt", date(2026, 10, 1), date(2026, 10, 2)),
            a(6, "ohne_termin", None, None),
        ] + [a(10 + i, "steht_an", date(2027, 1, 1 + i), date(2027, 1, 2 + i)) for i in range(6)]
        assert dienst.naechste(aufgaben) == [3, 4, 2, 1, 10, 11, 12, 13]

    def test_achse_vom_monatsanfang_bis_monatsende_und_ueber_heute(self):
        assert dienst.achse([date(2027, 1, 12), date(2027, 3, 3)], HEUTE) == {
            "von": date(2026, 11, 1),
            "bis": date(2027, 3, 31),
        }

    def test_achse_ohne_daten_sechs_monate_ab_heute(self):
        assert dienst.achse([None], HEUTE) == {"von": date(2026, 11, 1), "bis": date(2027, 4, 30)}


class TestPlanung:
    def test_mit_antrag(self, phase, antrag, bearbeiter, admin_nutzer):
        phase.foerderantrag = antrag
        phase.save()
        ap = Foerderpaket.objects.create(antrag=antrag, titel="AP02 Vereinzelung", von=2, bis=3, ergebnis="Greifer")
        Foerderstunden.objects.create(paket=ap, nutzer=bearbeiter, stunden=Decimal("270"))
        Foerderstunden.objects.create(paket=ap, person="N. N.", stunden=Decimal("30"))
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP02", foerderpaket=ap)
        # Das Pensum zählt nicht, sobald ein Antragspaket dahinter steht.
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("999"))
        Unteraufgabe.objects.create(
            paket=paket, titel="Greifer zeichnen", von=date(2026, 11, 3), bis=date(2026, 11, 20), stunden=Decimal("40")
        )
        Unteraufgabe.objects.create(paket=paket, titel="Ohne Termin", stunden=Decimal("12.5"))
        _buchen(bearbeiter, paket, 6)
        _buchen(admin_nutzer, paket, 2)

        daten = dienst.planung(phase, heute=HEUTE)

        assert daten["antrag"]["pakete"][0]["von"] == date(2026, 11, 1)
        assert daten["antrag"]["pakete"][0]["bis"] == date(2026, 12, 31)
        p = daten["pakete"][0]
        assert p["soll_quelle"] == "antrag"
        assert p["soll"] == Decimal("300")
        assert p["gebucht"] == Decimal("8.00")
        # 15 von 61 Tagen (1. Nov – 31. Dez) sind vorbei.
        assert p["soll_bis_heute"] == Decimal("73.77")
        assert p["aufgaben_stunden"] == Decimal("52.50")
        assert (p["plan_von"], p["plan_bis"]) == (date(2026, 11, 3), date(2026, 11, 20))
        personen = {x["name"]: x for x in p["personen"]}
        # Wer bucht, ohne im Antrag zu stehen, steht trotzdem da — ohne Soll.
        assert personen[admin_nutzer.initialen or admin_nutzer.name]["soll"] is None
        assert personen["N. N."]["gebucht"] == Decimal("0.00")
        assert daten["summen"]["ohne_termin"] == 1
        assert daten["naechste"] == [p["aufgaben"][0]["id"]]

    def test_ohne_antrag_ist_das_pensum_der_massstab(self, phase, bearbeiter):
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01")
        Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("40"))
        daten = dienst.planung(phase, heute=HEUTE)
        assert daten["antrag"] is None
        assert daten["pakete"][0]["soll_quelle"] == "pensum"
        assert daten["pakete"][0]["soll"] == Decimal("40")
        assert daten["pakete"][0]["soll_bis_heute"] is None
        assert daten["summen"]["soll_bis_heute"] is None

    def test_beginn_aus_der_phase_wenn_der_antrag_keinen_hat(self, phase, antrag):
        antrag.beginn = None
        antrag.save()
        phase.foerderantrag = antrag
        phase.save()
        Foerderpaket.objects.create(antrag=antrag, titel="AP01", von=1, bis=1)
        daten = dienst.planung(phase, heute=HEUTE)
        assert daten["antrag"]["beginn_aus_phase"] is True
        assert daten["antrag"]["pakete"][0]["von"] == date(2026, 10, 1)


class TestSchnittstelle:
    def test_leser_sieht_die_planung(self, client, leser, phase):
        client.force_login(leser)
        antwort = client.get(f"/api/planung/{phase.id}/")
        assert antwort.status_code == 200
        assert antwort.json()["phase"]["titel"] == "Laborprototypen entwickeln"

    def test_unbekannte_phase(self, client, leser):
        client.force_login(leser)
        assert client.get("/api/planung/999/").status_code == 404

    def test_aufgabe_mit_zeitraum_stunden_und_person(self, client, bearbeiter, phase):
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01")
        client.force_login(bearbeiter)
        antwort = client.post(
            "/api/unteraufgaben/",
            {"paket": paket.id, "titel": "Bericht", "von": "2026-11-01", "bis": "2026-11-05",
             "stunden": "7.50", "verantwortlich": bearbeiter.id},
            content_type="application/json",
        )
        assert antwort.status_code == 201, antwort.json()
        assert antwort.json()["stunden"] == "7.50"

    def test_zeitraum_ganz_oder_gar_nicht(self, client, bearbeiter, phase):
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01")
        aufgabe = Unteraufgabe.objects.create(paket=paket, titel="x")
        client.force_login(bearbeiter)
        halb = client.patch(f"/api/unteraufgaben/{aufgabe.id}/", {"von": "2026-11-01"}, content_type="application/json")
        assert halb.status_code == 400
        verkehrt = client.patch(
            f"/api/unteraufgaben/{aufgabe.id}/", {"von": "2026-11-05", "bis": "2026-11-01"},
            content_type="application/json",
        )
        assert verkehrt.status_code == 400
        ganz = client.patch(
            f"/api/unteraufgaben/{aufgabe.id}/", {"von": "2026-11-01", "bis": "2026-11-05"},
            content_type="application/json",
        )
        assert ganz.status_code == 200
        # Danach genügt ein Ende allein — der Beginn steht schon da.
        assert client.patch(
            f"/api/unteraufgaben/{aufgabe.id}/", {"bis": "2026-11-09"}, content_type="application/json"
        ).status_code == 200
        # Und beide leeren nimmt die Aufgabe aus dem Gantt.
        assert client.patch(
            f"/api/unteraufgaben/{aufgabe.id}/", {"von": None, "bis": None}, content_type="application/json"
        ).status_code == 200

    def test_antragspaket_nur_aus_dem_antrag_der_phase(self, client, bearbeiter, phase, antrag):
        fremd = Foerderantrag.objects.create(programm=antrag.programm, titel="Anderer", nummer=2)
        fremdes_paket = Foerderpaket.objects.create(antrag=fremd, titel="AP01")
        eigenes = Foerderpaket.objects.create(antrag=antrag, titel="AP01")
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01")
        client.force_login(bearbeiter)

        ohne_antrag = client.patch(f"/api/pakete/{paket.id}/", {"foerderpaket": eigenes.id}, content_type="application/json")
        assert ohne_antrag.status_code == 400

        assert client.patch(
            f"/api/phasen/{phase.id}/", {"foerderantrag": antrag.id}, content_type="application/json"
        ).status_code == 200
        assert client.patch(
            f"/api/pakete/{paket.id}/", {"foerderpaket": fremdes_paket.id}, content_type="application/json"
        ).status_code == 400
        assert client.patch(
            f"/api/pakete/{paket.id}/", {"foerderpaket": eigenes.id}, content_type="application/json"
        ).status_code == 200

        # Ein anderer Antrag an der Phase löst die Zuordnung der Pakete.
        assert client.patch(
            f"/api/phasen/{phase.id}/", {"foerderantrag": fremd.id}, content_type="application/json"
        ).status_code == 200
        paket.refresh_from_db()
        assert paket.foerderpaket is None

    def test_paket_zieht_in_eine_phase_ohne_den_antrag(self, client, bearbeiter, phase, antrag):
        phase.foerderantrag = antrag
        phase.save()
        ap = Foerderpaket.objects.create(antrag=antrag, titel="AP01")
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01", foerderpaket=ap)
        andere = Projektphase.objects.create(projekt=phase.projekt, titel="Validierung", art=Phasenart.DEV)
        client.force_login(bearbeiter)
        assert client.patch(
            f"/api/pakete/{paket.id}/", {"phase": andere.id}, content_type="application/json"
        ).status_code == 200
        paket.refresh_from_db()
        assert paket.phase == andere and paket.foerderpaket is None

    def test_phase_zieht_in_ein_anderes_projekt(self, client, bearbeiter, phase):
        claire = Projekt.objects.create(titel="Claire@home")
        andere = Projektphase.objects.create(projekt=claire, titel="Entwicklung", art=Phasenart.DEV)
        client.force_login(bearbeiter)
        assert client.patch(
            f"/api/phasen/{andere.id}/", {"projekt": phase.projekt_id, "titel": "Claire@home"},
            content_type="application/json",
        ).status_code == 200
        andere.refresh_from_db()
        assert andere.projekt == phase.projekt

    def test_phasenende_nicht_vor_dem_beginn(self, client, bearbeiter, phase):
        client.force_login(bearbeiter)
        assert client.patch(
            f"/api/phasen/{phase.id}/", {"bis": "2026-09-01"}, content_type="application/json"
        ).status_code == 400

    def test_verknuepfter_antrag_bleibt_stehen(self, client, admin_nutzer, phase, antrag):
        phase.foerderantrag = antrag
        phase.save()
        client.force_login(admin_nutzer)
        assert client.delete(f"/api/foerderantraege/{antrag.id}/").status_code == 409

    def test_leser_plant_nicht(self, client, leser, phase):
        paket = Arbeitspaket.objects.create(phase=phase, titel="AP01")
        client.force_login(leser)
        assert client.post(
            "/api/unteraufgaben/", {"paket": paket.id, "titel": "x"}, content_type="application/json"
        ).status_code == 403


@pytest.mark.django_db(transaction=True)
def test_planung_wandert_mit_der_sicherung(tmp_path, settings, bearbeiter, phase, antrag):
    """Verknüpfung zum Antrag, Zeitraum, Stunden und Verantwortliche kommen zurück."""
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    phase.foerderantrag = antrag
    phase.save()
    ap = Foerderpaket.objects.create(antrag=antrag, titel="AP02", von=2, bis=4)
    paket = Arbeitspaket.objects.create(phase=phase, titel="AP02", foerderpaket=ap)
    Unteraufgabe.objects.create(
        paket=paket, titel="Greifer", von=date(2026, 11, 3), bis=date(2026, 11, 20),
        stunden=Decimal("40.25"), verantwortlich=bearbeiter,
    )
    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)

    Unteraufgabe.objects.all().hart_loeschen()
    Arbeitspaket.objects.filter(pk=paket.pk).update(foerderpaket=None)
    Projektphase.objects.filter(pk=phase.pk).update(foerderantrag=None)

    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    aufgabe = Unteraufgabe.objects.get(titel="Greifer")
    assert (aufgabe.von, aufgabe.bis, aufgabe.stunden) == (date(2026, 11, 3), date(2026, 11, 20), Decimal("40.25"))
    assert aufgabe.verantwortlich.email == bearbeiter.email
    assert aufgabe.paket.foerderpaket.titel == "AP02"
    assert aufgabe.paket.phase.foerderantrag.titel == "Laborprototyp"
