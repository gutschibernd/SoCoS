"""
Das Kästchen mit dem Diamanten: Ohne den richtigen PIN kommt kein Betrag über
die Leitung. Die Beträge hier sind erfunden — die echten stehen nicht im
Repository, sondern in der .env (socos/bisher.py).
"""

import json

import pytest

ERFUNDEN = {
    "pin": "4242",
    "posten": [
        {"von": "Geber A", "wofuer": "Gehälter", "betrag": "0.10"},
        {"von": "Geber B", "betrag": "0.20"},
    ],
}


@pytest.fixture
def hinterlegt(settings):
    settings.BISHER = json.dumps(ERFUNDEN)


def _post(client, pin):
    return client.post("/api/bisher/", {"pin": pin}, content_type="application/json")


def test_ohne_anmeldung_nichts(client, hinterlegt):
    assert _post(client, "4242").status_code == 403


def test_falscher_pin_ist_eine_400_ohne_betraege(client, admin_nutzer, hinterlegt):
    client.force_login(admin_nutzer)
    for falsch in ("", "0000", "42420", None):
        antwort = _post(client, falsch)
        assert antwort.status_code == 400
        assert "posten" not in antwort.json()


def test_richtiger_pin_gibt_die_aufstellung_als_zeichenketten(client, admin_nutzer, hinterlegt):
    client.force_login(admin_nutzer)
    antwort = _post(client, " 4242 ")
    assert antwort.status_code == 200
    daten = antwort.json()
    assert [p["betrag"] for p in daten["posten"]] == ["0.10", "0.20"]
    assert daten["posten"][1]["wofuer"] == ""
    # Decimal, nicht Gleitkomma: 0.1 + 0.2 ist hier 0.3.
    assert daten["summe"] == "0.30"


def test_ohne_hinterlegte_daten_auch_mit_irgendeinem_pin_nichts(client, admin_nutzer, settings):
    settings.BISHER = ""
    client.force_login(admin_nutzer)
    antwort = _post(client, "4242")
    assert antwort.status_code == 400
    assert "posten" not in antwort.json()


def test_get_geht_nicht(client, admin_nutzer, hinterlegt):
    # Ein PIN in der Adresse stünde im Zugriffsprotokoll.
    client.force_login(admin_nutzer)
    assert client.get("/api/bisher/?pin=4242").status_code == 405
