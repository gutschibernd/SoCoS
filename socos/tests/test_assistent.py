"""
Der Schlüssel des Assistenten (Telegram-Bot).

Geprüft wird, was man von außen nicht sieht: dass der Schlüssel wirklich
schützt, dass der Bot nur an die Endpunkte der Erlaubnisliste kommt — gerade
nicht an Sicherung, Nutzerverwaltung und die Schlüssel selbst —, und dass im
Protokoll steht, dass er es war.
"""

import pytest
from rest_framework.test import APIClient

from socos import berechtigung
from socos.models import (
    Aufgabe,
    Lageschritt,
    Lageverbindung,
    Nutzer,
    Protokolleintrag,
)


def _schluessel(nutzer):
    client = APIClient()
    client.force_login(nutzer)
    return client.post("/api/assistent/neu/").json()["schluessel"]


def _bot(schluessel):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {schluessel}")
    return client


@pytest.mark.django_db
class TestSchluessel:
    def test_ohne_schluessel_ist_keiner_ausgegeben(self, client, admin_nutzer):
        client.force_login(admin_nutzer)
        assert client.get("/api/assistent/").json() == {"ausgegeben": False}

    def test_der_schluessel_kommt_einmal_und_nur_als_hash_in_die_datenbank(self, admin_nutzer):
        schluessel = _schluessel(admin_nutzer)

        admin_nutzer.refresh_from_db()
        assert schluessel.startswith("socos_")
        assert admin_nutzer.assistentschluessel
        assert schluessel not in admin_nutzer.assistentschluessel
        assert len(admin_nutzer.assistentschluessel) == 64

    def test_mit_schluessel_lesen_und_schreiben(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))

        assert bot.get("/api/aufgaben/").status_code == 200
        antwort = bot.post("/api/aufgaben/", {"text": "Angebot schicken"}, format="json")

        assert antwort.status_code == 201
        assert Aufgabe.objects.get(text="Angebot schicken")

    def test_braucht_kein_csrf(self, admin_nutzer):
        bot = APIClient(enforce_csrf_checks=True)
        bot.credentials(HTTP_AUTHORIZATION=f"Bearer {_schluessel(admin_nutzer)}")
        assert bot.post("/api/aufgaben/", {"text": "x"}, format="json").status_code == 201

    def test_ein_erfundener_schluessel_kommt_nicht_rein(self, admin_nutzer):
        _schluessel(admin_nutzer)
        assert _bot("socos_geraten").get("/api/aufgaben/").status_code == 403

    def test_ein_neuer_schluessel_macht_den_alten_tot(self, admin_nutzer):
        alt = _schluessel(admin_nutzer)
        neu = _schluessel(admin_nutzer)

        assert _bot(alt).get("/api/aufgaben/").status_code == 403
        assert _bot(neu).get("/api/aufgaben/").status_code == 200

    def test_entziehen(self, client, admin_nutzer):
        schluessel = _schluessel(admin_nutzer)
        client.force_login(admin_nutzer)

        assert client.post("/api/assistent/entziehen/").json() == {"ausgegeben": False}
        assert _bot(schluessel).get("/api/aufgaben/").status_code == 403

    def test_ein_stillgelegtes_konto_hat_keinen_assistenten_mehr(self, admin_nutzer):
        schluessel = _schluessel(admin_nutzer)
        admin_nutzer.is_active = False
        admin_nutzer.save()

        assert _bot(schluessel).get("/api/aufgaben/").status_code == 403

    def test_ohne_rolle_kein_schluessel(self, client, ohne_rolle):
        client.force_login(ohne_rolle)
        assert client.get("/api/assistent/").status_code == 403
        assert client.post("/api/assistent/neu/").status_code == 403

    def test_ein_leser_bleibt_auch_ueber_den_assistenten_leser(self, leser):
        bot = _bot(_schluessel(leser))

        assert bot.get("/api/aufgaben/").status_code == 200
        assert bot.post("/api/aufgaben/", {"text": "x"}, format="json").status_code == 403

    def test_der_schluessel_steht_nicht_im_protokoll(self, admin_nutzer):
        schluessel = _schluessel(admin_nutzer)
        admin_nutzer.refresh_from_db()

        for eintrag in Protokolleintrag.objects.all():
            text = str(eintrag.aenderungen)
            assert schluessel not in text
            assert admin_nutzer.assistentschluessel not in text


@pytest.mark.django_db
class TestErlaubnisliste:
    """Was der Bot nicht darf, auch wenn sein Nutzer Admin ist."""

    @pytest.mark.parametrize(
        "methode, pfad",
        [
            ("get", "/api/sicherung/"),
            ("post", "/api/sicherung/einspielen/"),
            ("post", "/api/assistent/neu/"),
            ("post", "/api/assistent/entziehen/"),
            ("post", "/api/kalender/neu/"),
            ("get", "/api/kontostaende/"),
            ("get", "/api/runway/"),
            ("get", "/api/protokoll/"),
            ("post", "/api/nutzer/"),
        ],
    )
    def test_gesperrt(self, admin_nutzer, methode, pfad):
        bot = _bot(_schluessel(admin_nutzer))
        antwort = getattr(bot, methode)(pfad, {}, format="json")

        assert antwort.status_code == 403
        assert antwort.json()["code"] == "permission_denied"

    def test_nutzer_nur_lesen(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))

        assert bot.get("/api/nutzer/").status_code == 200
        antwort = bot.patch(f"/api/nutzer/{admin_nutzer.pk}/", {"name": "Bot"}, format="json")
        assert antwort.status_code == 403

    def test_entfernen_nur_bei_verbindungen_in_thoughts(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))
        aufgabe = Aufgabe.objects.create(text="bleibt")
        a = Lageschritt.objects.create(titel="A")
        b = Lageschritt.objects.create(titel="B")
        verbindung = Lageverbindung.objects.create(von=a, nach=b)

        assert bot.delete(f"/api/aufgaben/{aufgabe.pk}/").status_code == 403
        assert bot.delete(f"/api/lageschritte/{a.pk}/").status_code == 403
        assert bot.delete(f"/api/lageverbindungen/{verbindung.pk}/").status_code == 204
        assert Lageverbindung.alle_objekte.get(pk=verbindung.pk).ist_geloescht

    def test_zeit_starten_und_stoppen(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))

        assert bot.post("/api/zeiten/clock_in/", {}, format="json").status_code == 201
        assert bot.get("/api/zeiten/laufend/").json()["laufend"] is not None
        assert bot.post("/api/zeiten/clock_out/", {"notiz": "Telefonat"}, format="json").status_code == 200

    def test_unbekannte_namen_sind_zu(self):
        # Ein Name, der nur mit einem erlaubten beginnt, ist kein erlaubter.
        assert not berechtigung.assistent_darf("zeitnachweis", "GET")
        assert not berechtigung.assistent_darf("eventziel-list", "GET")
        assert not berechtigung.assistent_darf(None, "GET")
        assert berechtigung.assistent_darf("zeit-clock-in", "POST")


@pytest.mark.django_db
class TestProtokoll:
    def test_was_der_bot_schreibt_steht_als_ueber_assistent_da(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))
        bot.post("/api/aufgaben/", {"text": "vom Bot"}, format="json")

        aufgabe = Aufgabe.objects.get(text="vom Bot")
        eintrag = Protokolleintrag.objects.get(modell="socos.Aufgabe", objekt_id=str(aufgabe.pk))
        assert eintrag.nutzer == admin_nutzer
        assert eintrag.nutzer_text == "Admin Person · über Assistent"

    def test_die_naechste_anfrage_in_der_oberflaeche_traegt_keinen_vermerk(self, admin_nutzer):
        bot = _bot(_schluessel(admin_nutzer))
        bot.post("/api/aufgaben/", {"text": "vom Bot"}, format="json")

        selbst = APIClient()
        selbst.force_login(admin_nutzer)
        selbst.post("/api/aufgaben/", {"text": "selbst"}, format="json")

        aufgabe = Aufgabe.objects.get(text="selbst")
        eintrag = Protokolleintrag.objects.get(modell="socos.Aufgabe", objekt_id=str(aufgabe.pk))
        assert eintrag.nutzer_text == "Admin Person"
