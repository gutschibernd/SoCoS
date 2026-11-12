"""
Module · Bestellungen: Lieferanten, Sortiment, Korb, Archiv, Mails — und der
Namensvorschlag aus einem Link.

Geprüft wird, was entschieden wurde: dass derselbe Artikel von derselben
Person keine zweite Zeile macht, dass „bestellt" den Korb ins Archiv nimmt und
das Archiv danach feststeht, dass ein Artikel aus dem Sortiment verschwinden
kann, ohne das Archiv mitzunehmen — und dass der Server über das Linkfeld
keine Adresse im eigenen Netz aufruft.
"""

from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from socos.models import (
    Bestellartikel,
    Bestellposition,
    Bestellung,
    Lieferant,
    Lieferantenanhang,
    Protokolleintrag,
)
from socos.services import produktlink


@pytest.fixture
def bambu(db):
    return Lieferant.objects.create(name="Bambu Lab", art="shop", link="https://eu.store.bambulab.com")


@pytest.fixture
def pla(bambu):
    return Bestellartikel.objects.create(
        lieferant=bambu, name="PLA Basic", link="https://eu.store.bambulab.com/products/pla-basic",
        beschreibung="Schwarz, 1 kg",
    )


@pytest.fixture
def medien(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    return settings.MEDIA_ROOT


def _hinein(client, artikel, menge=1):
    return client.post("/api/bestellpositionen/", {"artikel": artikel.pk, "menge": menge}, content_type="application/json")


# --- Korb -------------------------------------------------------------------


class TestKorb:
    def test_wer_bearbeiten_darf_legt_hinein(self, client, bearbeiter, pla):
        client.force_login(bearbeiter)

        antwort = _hinein(client, pla, 6)

        assert antwort.status_code == 201, antwort.content
        daten = antwort.json()
        assert daten["menge"] == 6
        assert daten["von"] == bearbeiter.pk
        assert daten["name"] == "PLA Basic"
        assert daten["beschreibung"] == "Schwarz, 1 kg"

    def test_ein_leser_legt_nichts_hinein(self, client, leser, pla):
        client.force_login(leser)
        assert _hinein(client, pla).status_code == 403

    def test_dieselbe_person_derselbe_artikel_eine_zeile(self, client, bearbeiter, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla, 2)
        _hinein(client, pla, 3)

        assert [p.menge for p in Bestellposition.objects.all()] == [5]

    def test_eine_andere_person_bekommt_ihre_eigene_zeile(self, client, bearbeiter, admin_nutzer, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla, 2)
        client.force_login(admin_nutzer)
        _hinein(client, pla, 1)

        assert sorted(p.menge for p in Bestellposition.objects.all()) == [1, 2]

    def test_die_menge_ist_mindestens_eins(self, client, bearbeiter, pla):
        client.force_login(bearbeiter)
        assert _hinein(client, pla, 0).status_code == 400

    def test_der_lieferant_zeigt_den_korb(self, client, bearbeiter, bambu, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla, 4)

        liste = client.get("/api/lieferanten/").json()
        seite = client.get(f"/api/lieferanten/{bambu.pk}/").json()

        assert liste[0]["im_korb"] == 1
        assert [(p["name"], p["menge"]) for p in seite["korb"]] == [("PLA Basic", 4)]
        assert seite["bestellungen"] == []


# --- Bestellt und Archiv ------------------------------------------------------


class TestBestellt:
    def test_der_korb_wandert_ins_archiv(self, client, bearbeiter, bambu, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla, 6)

        antwort = client.post(
            f"/api/lieferanten/{bambu.pk}/bestellt/",
            {"bestellt_am": "2026-11-12", "notiz": "Bestellnr. 4711"},
            content_type="application/json",
        )

        assert antwort.status_code == 201, antwort.content
        assert antwort.json()["notiz"] == "Bestellnr. 4711"
        seite = client.get(f"/api/lieferanten/{bambu.pk}/").json()
        assert seite["korb"] == []
        assert seite["zuletzt_bestellt"] == "2026-11-12"
        [bestellung] = seite["bestellungen"]
        assert bestellung["bestellt_am"] == "2026-11-12"
        assert bestellung["von_name"] == "Bearbeitende Person"
        assert [(p["name"], p["menge"]) for p in bestellung["positionen"]] == [("PLA Basic", 6)]
        # Das Sortiment zählt mit, wie oft der Artikel schon bestellt war.
        assert seite["artikel"][0]["bestellt_mal"] == 1

    def test_jede_position_steht_im_protokoll(self, client, bearbeiter, bambu, pla):
        client.force_login(bearbeiter)
        position = Bestellposition.objects.get(pk=_hinein(client, pla).json()["id"])
        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        eintrag = Protokolleintrag.objects.filter(
            modell="socos.Bestellposition", objekt_id=str(position.pk), aktion="geaendert"
        ).last()
        assert eintrag is not None
        assert "bestellung" in eintrag.aenderungen

    def test_ohne_datum_gilt_heute(self, client, bearbeiter, bambu, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla)

        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        assert Bestellung.objects.get().bestellt_am == date.today()

    def test_ein_leerer_korb_laesst_sich_nicht_bestellen(self, client, bearbeiter, bambu):
        client.force_login(bearbeiter)

        antwort = client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        assert antwort.status_code == 400
        assert not Bestellung.objects.exists()

    def test_im_archiv_aendert_sich_nichts(self, client, admin_nutzer, bambu, pla):
        client.force_login(admin_nutzer)
        nummer = _hinein(client, pla, 2).json()["id"]
        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        aendern = client.patch(f"/api/bestellpositionen/{nummer}/", {"menge": 9}, content_type="application/json")
        entfernen = client.delete(f"/api/bestellpositionen/{nummer}/")

        assert aendern.status_code == 400
        assert entfernen.status_code == 400
        assert Bestellposition.objects.get(pk=nummer).menge == 2

    def test_nach_dem_bestellen_ist_der_naechste_korb_neu(self, client, bearbeiter, bambu, pla):
        client.force_login(bearbeiter)
        _hinein(client, pla, 2)
        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        _hinein(client, pla, 1)

        # Eine neue Zeile — nicht die Menge der bestellten erhöht.
        assert sorted(p.menge for p in Bestellposition.objects.all()) == [1, 2]


# --- Sortiment und Lieferant entfernen ----------------------------------------


class TestEntfernen:
    def test_ein_artikel_geht_aus_sortiment_und_korb_das_archiv_bleibt(self, client, admin_nutzer, bambu, pla):
        client.force_login(admin_nutzer)
        _hinein(client, pla, 2)
        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")
        _hinein(client, pla, 1)

        assert client.delete(f"/api/bestellartikel/{pla.pk}/").status_code == 204

        seite = client.get(f"/api/lieferanten/{bambu.pk}/").json()
        assert seite["artikel"] == []
        assert seite["korb"] == []
        assert [p["name"] for p in seite["bestellungen"][0]["positionen"]] == ["PLA Basic"]

    def test_ein_lieferant_ohne_archiv_nimmt_alles_mit(self, client, admin_nutzer, bambu, pla):
        client.force_login(admin_nutzer)
        _hinein(client, pla)

        assert client.delete(f"/api/lieferanten/{bambu.pk}/").status_code == 204

        assert not Lieferant.objects.exists()
        assert not Bestellartikel.objects.exists()
        assert not Bestellposition.objects.exists()

    def test_ein_lieferant_mit_archiv_bleibt(self, client, admin_nutzer, bambu, pla):
        client.force_login(admin_nutzer)
        _hinein(client, pla)
        client.post(f"/api/lieferanten/{bambu.pk}/bestellt/", {}, content_type="application/json")

        assert client.delete(f"/api/lieferanten/{bambu.pk}/").status_code == 409

        # Nichts halb entfernt: Der Lieferant und sein Sortiment stehen noch.
        assert Lieferant.objects.filter(pk=bambu.pk).exists()
        assert Bestellartikel.objects.filter(pk=pla.pk).exists()

    def test_entfernen_darf_nur_der_admin(self, client, bearbeiter, bambu):
        client.force_login(bearbeiter)
        assert client.delete(f"/api/lieferanten/{bambu.pk}/").status_code == 403

    def test_ohne_bestellweg_kein_lieferant(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post("/api/lieferanten/", {"name": "Amazon"}, content_type="application/json")

        assert antwort.status_code == 400
        assert "art" in antwort.json()


# --- Mails am Lieferanten ------------------------------------------------------


class TestMails:
    def test_eine_mail_haengt_am_lieferanten(self, client, bearbeiter, bambu, medien):
        client.force_login(bearbeiter)
        mail = b"From: Vertrieb <vertrieb@example.invalid>\r\nSubject: Ihr Angebot\r\n\r\nPreis auf Anfrage\r\n"

        antwort = client.post(
            "/api/lieferantenanhaenge/",
            {"lieferant": bambu.pk, "datei": SimpleUploadedFile("angebot.eml", mail)},
        )

        assert antwort.status_code == 201, antwort.content
        assert antwort.json()["art"] == "email"
        seite = client.get(f"/api/lieferanten/{bambu.pk}/").json()
        assert "Betreff: Ihr Angebot" in seite["anhaenge"][0]["text"]


@pytest.mark.django_db(transaction=True)
def test_bestellungen_wandern_durch_die_sicherung(tmp_path, medien, bearbeiter):
    lieferant = Lieferant.objects.create(name="Pumpen GmbH", art="haendler", notiz="Frau Muster")
    artikel = Bestellartikel.objects.create(lieferant=lieferant, name="Membranpumpe", beschreibung="24 V")
    bestellung = Bestellung.objects.create(lieferant=lieferant, bestellt_am=date(2026, 11, 3), von=bearbeiter)
    Bestellposition.objects.create(artikel=artikel, menge=2, von=bearbeiter, bestellung=bestellung)
    Bestellposition.objects.create(artikel=artikel, menge=1, von=bearbeiter)
    anhang = Lieferantenanhang(lieferant=lieferant, name="angebot.eml", groesse=4, art="email", text="Betreff: Angebot")
    anhang.datei.save("angebot.eml", SimpleUploadedFile("angebot.eml", b"From"), save=False)
    anhang.save()

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    for modell in (Bestellposition, Bestellung, Bestellartikel, Lieferantenanhang, Lieferant):
        modell.alle_objekte.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder = Lieferant.objects.get(name="Pumpen GmbH")
    assert (wieder.art, wieder.notiz) == ("haendler", "Frau Muster")
    assert sorted(
        (p.artikel.name, p.menge, p.bestellung_id is not None) for p in Bestellposition.objects.all()
    ) == [("Membranpumpe", 1, False), ("Membranpumpe", 2, True)]
    assert Bestellung.objects.get().von.email == "bearbeiter@example.invalid"
    assert Lieferantenanhang.objects.get().datei.read() == b"From"


# --- Der Name aus dem Link -----------------------------------------------------


@pytest.fixture
def oeffentlich(monkeypatch):
    """Jeder Name zeigt ins öffentliche Netz — die Tests rufen niemanden auf."""
    monkeypatch.setattr(produktlink, "_oeffentlich", lambda host, port: port in (None, 80, 443))


class TestNameAusDemLink:
    @pytest.mark.parametrize(
        ("link", "name"),
        [
            ("https://eu.store.bambulab.com/de/products/pla-basic-filament?variant=4711", "Pla basic filament"),
            (
                "https://www.amazon.de/Anker-Ladeger%C3%A4t-USB-C-65W/dp/B0BXXXXXXX/ref=sr_1_3",
                "Anker Ladegerät USB C 65W",
            ),
            (
                "https://www.alibaba.com/product-detail/Custom-JST-Wire-Harness_1600123456789.html",
                "Custom JST Wire Harness",
            ),
            ("https://www.amazon.de/dp/B0BXXXXXXX", ""),
        ],
    )
    def test_der_sprechende_teil_des_pfades(self, link, name):
        assert produktlink.name_aus_link(link) == name

    def test_der_titel_der_seite_geht_vor(self, oeffentlich):
        seite = '<html><head><meta content="PLA Basic &amp; Co" property="og:title"><title>Shop</title>'

        name = produktlink.vorschlag("https://eu.store.bambulab.com/products/pla-basic", holen=lambda _: seite)

        assert name == "PLA Basic & Co"

    def test_der_shopname_hinter_dem_strich_faellt_weg(self):
        assert produktlink.aufgeraeumt("PLA Basic – Bambu Lab EU Store") == "PLA Basic"
        assert produktlink.aufgeraeumt("Stecker JST-XH 4-polig | Mouser") == "Stecker JST-XH 4-polig"

    def test_eine_sperrseite_verliert_gegen_den_link(self, oeffentlich):
        seite = "<html><head><title>Robot Check</title></head>"

        name = produktlink.vorschlag("https://www.amazon.de/Filament-PETG-Grau/dp/B0BXXXXXXX", holen=lambda _: seite)

        assert name == "Filament PETG Grau"

    def test_antwortet_die_seite_nicht_kommt_der_name_aus_dem_link(self, oeffentlich):
        def holen(_):
            raise TimeoutError("zu langsam")

        assert produktlink.vorschlag("https://example.com/products/pumpe-24v", holen=holen) == "Pumpe 24v"

    @pytest.mark.parametrize(
        "link",
        [
            "http://127.0.0.1/admin/",
            "http://localhost:8003/api/",
            "http://10.0.0.5/",
            "http://192.168.1.1/",
            "http://[::1]/",
            "http://169.254.169.254/latest/meta-data/",
            "https://example.com:5432/",
            "ftp://example.com/datei",
            "file:///etc/passwd",
            "kein link",
        ],
    )
    def test_nichts_im_eigenen_netz(self, link):
        with pytest.raises(produktlink.KeinLink):
            produktlink.pruefen(link)

    def test_der_endpunkt_meldet_einen_falschen_link_am_feld(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post("/api/artikelvorschlag/", {"link": "http://127.0.0.1/"}, content_type="application/json")

        assert antwort.status_code == 400
        assert "link" in antwort.json()

    def test_der_endpunkt_liefert_den_namen(self, client, bearbeiter, oeffentlich, monkeypatch):
        monkeypatch.setattr(produktlink, "seite_holen", lambda _: '<meta property="og:title" content="PETG HF">')
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/artikelvorschlag/", {"link": "https://eu.store.bambulab.com/products/petg-hf"},
            content_type="application/json",
        )

        assert antwort.status_code == 200, antwort.content
        assert antwort.json() == {"name": "PETG HF"}

    def test_ein_leser_bekommt_keinen_vorschlag(self, client, leser):
        client.force_login(leser)
        assert client.post("/api/artikelvorschlag/", {"link": "https://example.com/"}).status_code == 403


# --- Preis und Staffel -----------------------------------------------------------

BAMBU_STAFFEL = [{"ab": 4, "prozent": "25"}, {"ab": 6, "prozent": "35"}, {"ab": 10, "prozent": "43"}, {"ab": 14, "prozent": "47"}]


class TestStaffel:
    @pytest.fixture
    def filament(self, bambu):
        bambu.staffel = BAMBU_STAFFEL
        bambu.save()
        basic = Bestellartikel.objects.create(lieferant=bambu, name="PLA Basic", preis="16.99", in_staffel=True)
        matte = Bestellartikel.objects.create(lieferant=bambu, name="PLA Matte", preis="18.99", in_staffel=True)
        duese = Bestellartikel.objects.create(lieferant=bambu, name="Düse", preis="5.00")
        return bambu, basic, matte, duese

    def test_unter_der_ersten_stufe_gilt_der_listenpreis(self, client, bearbeiter, filament):
        bambu, basic, _, _ = filament
        client.force_login(bearbeiter)
        _hinein(client, basic, 3)

        r = client.get(f"/api/lieferanten/{bambu.pk}/").json()["rechnung"]

        assert r["prozent"] is None
        assert r["summe"] == "50.97"
        assert r["naechste"] == {"ab": 4, "prozent": "25", "fehlen": 1}

    def test_die_staffel_zaehlt_ueber_alle_filamente_und_rundet_wie_der_shop(self, client, bearbeiter, filament):
        bambu, basic, matte, duese = filament
        client.force_login(bearbeiter)
        _hinein(client, basic, 8)
        _hinein(client, matte, 6)
        _hinein(client, duese, 2)

        seite = client.get(f"/api/lieferanten/{bambu.pk}/").json()
        r = seite["rechnung"]
        preis = {p["name"]: r["einzelpreise"][str(p["id"])] for p in seite["korb"]}

        assert r["staffel_menge"] == 14
        assert r["prozent"] == "47"
        # 16,99 − 47 % = 9,0047 → 9,00; 18,99 − 47 % = 10,0647 → 10,06. Die Düse zählt nicht.
        assert preis == {"PLA Basic": "9.00", "PLA Matte": "10.06", "Düse": "5.00"}
        assert r["summe"] == "142.36"
        assert r["listensumme"] == "259.86"
        assert r["naechste"] is None

    def test_ohne_preis_zaehlt_mit_fehlt_aber_in_der_summe(self, client, bearbeiter, filament):
        bambu, basic, _, _ = filament
        ohne = Bestellartikel.objects.create(lieferant=bambu, name="PLA Pure", in_staffel=True)
        client.force_login(bearbeiter)
        _hinein(client, basic, 2)
        _hinein(client, ohne, 2)

        r = client.get(f"/api/lieferanten/{bambu.pk}/").json()["rechnung"]

        assert r["prozent"] == "25"
        assert r["ohne_preis"] == 1
        assert r["summe"] == "25.48"

    @pytest.mark.parametrize(
        "staffel",
        [[{"ab": 1, "prozent": "10"}], [{"ab": 4, "prozent": "100"}], [{"ab": 4}], [{"ab": 4, "prozent": "5"}, {"ab": 4, "prozent": "9"}]],
    )
    def test_eine_kaputte_staffel_wird_abgewiesen(self, client, bearbeiter, bambu, staffel):
        client.force_login(bearbeiter)

        antwort = client.patch(f"/api/lieferanten/{bambu.pk}/", {"staffel": staffel}, content_type="application/json")

        assert antwort.status_code == 400
        assert "staffel" in antwort.json()

    def test_die_staffel_wird_sortiert_gespeichert(self, client, bearbeiter, bambu):
        client.force_login(bearbeiter)

        client.patch(
            f"/api/lieferanten/{bambu.pk}/",
            {"staffel": [{"ab": 14, "prozent": "47"}, {"ab": 4, "prozent": "25,0"}]},
            content_type="application/json",
        )

        bambu.refresh_from_db()
        assert bambu.staffel == [{"ab": 4, "prozent": "25"}, {"ab": 14, "prozent": "47"}]
