"""
Die Anmeldeseite und die zweite Kopie der Farbpalette.

Die Anmeldeseite läuft ohne das React-Bundle und braucht die Palette deshalb ein
zweites Mal. Zwei Kopien laufen auseinander — dieser Test hält sie zusammen.
"""

import re
from pathlib import Path

import pytest

WURZEL = Path(__file__).resolve().parent.parent.parent
FARBEN_CSS = WURZEL / "frontend" / "src" / "stil" / "farben.css"
ANMELDEN = WURZEL / "vorlagen" / "anmelden.html"


def _variablen(text):
    """Alle definierten --namen aus einem Stylesheet."""
    return set(re.findall(r"(--[a-z0-9-]+)\s*:", text))


def test_die_anmeldeseite_erfindet_keine_eigenen_farbnamen():
    """
    Jeder Name auf der Anmeldeseite muss auch in farben.css stehen. Sonst gäbe
    es eine Farbe, die man beim Ändern der Palette nicht findet.
    """
    fremde = _variablen(ANMELDEN.read_text()) - _variablen(FARBEN_CSS.read_text())
    assert not fremde, (
        f"vorlagen/anmelden.html definiert Namen, die es in farben.css nicht "
        f"gibt: {sorted(fremde)}"
    )


def test_beide_kennen_hell_und_dunkel():
    for datei in (FARBEN_CSS, ANMELDEN):
        assert "prefers-color-scheme: dark" in datei.read_text(), (
            f"{datei.name} hat keine dunkle Fassung."
        )


def test_keine_harte_farbe_in_einer_komponente():
    """
    Farben stehen an einer Stelle. Ein Hex-Wert in einer Komponente ist eine
    Farbe, die beim nächsten Umstellen der Palette stehen bleibt.
    """
    quelle = WURZEL / "frontend" / "src"
    treffer = []
    for datei in list(quelle.rglob("*.tsx")) + list(quelle.rglob("*.ts")):
        for nummer, zeile in enumerate(datei.read_text().splitlines(), 1):
            if re.search(r"#[0-9a-fA-F]{3,8}\b", zeile):
                treffer.append(f"{datei.relative_to(WURZEL)}:{nummer}")
    assert not treffer, (
        "Farbwerte gehören nach frontend/src/stil/farben.css, nicht in eine "
        f"Komponente: {treffer}"
    )


def test_eingabefelder_sind_16px():
    """Darunter zoomt iOS beim Hineintippen in das Feld."""
    assert "font-size: 16px" in ANMELDEN.read_text()
    grund = (WURZEL / "frontend" / "src" / "stil" / "grund.css").read_text()
    assert "font-size: 16px" in grund


@pytest.mark.django_db
def test_anmeldeseite_ist_ohne_sitzung_erreichbar(client):
    antwort = client.get("/anmelden/")
    assert antwort.status_code == 200
    assert "Sopharmis" in antwort.content.decode()


@pytest.mark.django_db
def test_anwendung_schickt_ohne_sitzung_zur_anmeldung(client):
    antwort = client.get("/")
    assert antwort.status_code == 302
    assert antwort["Location"].startswith("/anmelden/")


@pytest.mark.django_db
def test_abmelden_geht_nur_per_post(client, leser):
    """
    Djangos LogoutView nimmt seit 5.0 nur POST. Ein `<a href="/abmelden/">`
    sieht richtig aus, liefert 405 und meldet niemanden ab — genau das war der
    Knopf auf der Profilseite. Der Test hält fest, warum es ein Formular ist.
    """
    client.force_login(leser)

    assert client.get("/abmelden/").status_code == 405
    assert client.get("/").status_code == 200, "die Sitzung steht noch"

    antwort = client.post("/abmelden/")
    assert antwort.status_code == 302
    assert antwort["Location"] == "/anmelden/"
    assert client.get("/")["Location"].startswith("/anmelden/")


def test_kein_abmeldelink_in_der_oberflaeche():
    """
    Ein Link auf /abmelden/ wäre wieder der stille 405. Abgemeldet wird über
    das Formular in der Kopfleiste, sonst nirgends.
    """
    quelle = WURZEL / "frontend" / "src"
    treffer = []
    for datei in quelle.rglob("*.tsx"):
        for nummer, zeile in enumerate(datei.read_text().splitlines(), 1):
            if "/abmelden/" in zeile and "href" in zeile:
                treffer.append(f"{datei.relative_to(WURZEL)}:{nummer}")
    assert not treffer, f"Abmelden gehört in ein POST-Formular, nicht in einen Link: {treffer}"
