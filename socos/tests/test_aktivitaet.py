"""
Die Kachel „Zuletzt passiert" im Dashboard: das Änderungsprotokoll als Sätze.

Geprüft wird das Ausdünnen — was hier fehlt oder doppelt steht, sieht am
Dashboard plausibel aus und ist trotzdem falsch.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from socos import aktueller_nutzer
from socos.models import (
    Arbeitspaket,
    Kontakt,
    Meeting,
    Meetingabschnitt,
    Organisation,
    Projekt,
    Projektphase,
    Protokolleintrag,
    Zeitbuchung,
)
from socos.services import aktivitaet


@pytest.fixture
def paket(db):
    p = Projekt.objects.create(titel="Arzneimittelspender")
    phase = Projektphase.objects.create(projekt=p, titel="Entwicklung")
    return Arbeitspaket.objects.create(phase=phase, titel="Dauerlauftests")


@pytest.fixture
def als(db):
    """Handelt als der übergebene Nutzer — so wie es die Middleware täte."""
    tokens = []

    def setzen(nutzer):
        tokens.append(aktueller_nutzer.setzen(nutzer))

    yield setzen
    for t in reversed(tokens):
        aktueller_nutzer.zuruecksetzen(t)


def satz(eintrag):
    return " ".join(t for t in (eintrag["vor"], eintrag["objekt"], eintrag["nach"]) if t)


def test_kontakt_mit_organisation(als, bearbeiter):
    zwt = Organisation.objects.create(name="Zentrum für Wundtherapie", kurz="ZWT")
    als(bearbeiter)
    Kontakt.objects.create(name="Peter Steiner", organisation=zwt)

    oben = aktivitaet.letzte()[0]
    assert oben["wer"]["name"] == "Bearbeitende Person"
    assert satz(oben) == "hat einen neuen Kontakt Peter Steiner von ZWT angelegt"
    assert oben["objekt"] == "Peter Steiner"


def test_clock_in_und_clock_out_sind_ein_satz(als, bearbeiter, paket):
    """Nur der neueste Stand je Buchung — sonst stünde sie zweimal da."""
    als(bearbeiter)
    jetzt = timezone.now()
    b = Zeitbuchung.objects.create(
        person=bearbeiter, paket=paket, start=jetzt - timedelta(hours=1, minutes=20)
    )
    assert satz(aktivitaet.letzte()[0]) == "hat auf Dauerlauftests eingestempelt"

    b.ende = jetzt
    b.save()
    alle = aktivitaet.letzte()
    assert [satz(e) for e in alle if "Dauerlauftests" in satz(e)] == [
        "hat 1:20 h auf Dauerlauftests gebucht"
    ]


def test_nachgetragen_fuer_einen_anderen_tag(als, bearbeiter, paket):
    als(bearbeiter)
    gestern = timezone.now() - timedelta(days=3)
    Zeitbuchung.objects.create(
        person=bearbeiter, paket=paket, start=gestern, ende=gestern + timedelta(hours=2)
    )
    tag = timezone.localdate(gestern)
    assert satz(aktivitaet.letzte()[0]) == f"hat 2:00 h am {tag:%d.%m.} auf Dauerlauftests gebucht"


def test_abgeschnittene_buchung_ist_kein_handgriff(als, bearbeiter, admin_nutzer, paket):
    """
    Das Abschneiden am Tagesende läuft in der Anfrage dessen, der gerade das
    Dashboard öffnet. Als „Admin hat 14 h gebucht" darf es nicht erscheinen.
    """
    als(admin_nutzer)
    b = Zeitbuchung.objects.create(
        person=admin_nutzer, paket=paket, start=timezone.now() - timedelta(days=1)
    )
    b.ende = b.start + timedelta(hours=14)
    b.ist_entwurf = True
    b.save()
    assert all("Dauerlauftests" not in satz(e) for e in aktivitaet.letzte())


def test_viele_gleiche_handgriffe_werden_ein_satz(als, bearbeiter):
    als(bearbeiter)
    m = Meeting.objects.create(titel="Jour fixe", datum=timezone.localdate())
    for i in range(12):
        Meetingabschnitt.objects.create(meeting=m, ueberschrift=f"Punkt {i}", reihenfolge=i)

    oben = aktivitaet.letzte()
    assert satz(oben[0]) == "hat 12 Protokollabschnitte angelegt"
    assert satz(oben[1]).startswith("hat ein neues Meeting ")


def test_ohne_handelnden_und_nutzerkonten_fehlen(db, bearbeiter):
    """Befehle, Tests und „Neuigkeiten gelesen" sind keine Nachricht fürs Team."""
    Projekt.objects.create(titel="Ohne Handelnden")
    bearbeiter.neuigkeiten_bis = "2026-09-28"
    bearbeiter.save()
    assert Protokolleintrag.objects.exists()
    assert aktivitaet.letzte() == []


def test_hoechstens_fuenf(als, bearbeiter, admin_nutzer):
    """Abwechselnd zwei Personen, damit nichts zusammengefasst wird."""
    for i in range(8):
        als(bearbeiter if i % 2 else admin_nutzer)
        Projekt.objects.create(titel=f"Projekt {i}")
    liste = aktivitaet.letzte(5)
    assert [e["objekt"] for e in liste] == [f"Projekt {i}" for i in range(7, 2, -1)]


def test_steht_im_dashboard_mit_letztem_clock_out(client, bearbeiter, paket):
    ende = timezone.now() - timedelta(hours=3)
    Zeitbuchung.objects.create(
        person=bearbeiter, paket=paket, start=ende - timedelta(hours=1), ende=ende
    )
    client.force_login(bearbeiter)
    client.post("/api/zeiten/clock_in/", {"paket": paket.pk}, content_type="application/json")

    d = client.get("/api/dashboard/").json()
    ich = next(p for p in d["team"] if p["id"] == bearbeiter.pk)
    assert ich["laeuft_auf"] == "Dauerlauftests"
    assert ich["zuletzt_bis"] is not None
    assert d["aktivitaet"][0]["nach"] == "eingestempelt"


def test_langer_objekttext_wird_gekuerzt_und_ohne_sternchen(als, bearbeiter):
    als(bearbeiter)
    Projekt.objects.create(titel="Ein **sehr** langer Titel " + "x" * 80)
    objekt = aktivitaet.letzte()[0]["objekt"]
    assert "**" not in objekt
    assert len(objekt) == aktivitaet.OBJEKT_HOECHSTENS
    assert objekt.endswith("…")


def test_jedes_gesicherte_modell_hat_einen_namen_im_satz():
    """
    Ohne Eintrag in `NAMEN` stünde am Dashboard „hat einen neuen Eintrag
    angelegt" — plausibel und nichtssagend. Genau das wäre der Lagekarte
    passiert: Sie und diese Kachel sind in zwei Zweigen gleichzeitig
    entstanden, und keiner der beiden konnte vom anderen wissen.

    Nutzer und Protokoll fehlen mit Absicht (siehe Kopf von aktivitaet.py).
    """
    from socos.sicherung import MODELLE_IM_ARCHIV

    fehlend = [
        m
        for m in MODELLE_IM_ARCHIV
        if m.startswith("socos.") and m not in {"socos.Nutzer", "socos.Protokolleintrag"} and m not in aktivitaet.NAMEN
    ]
    assert not fehlend, f"Ohne Namen im Satz: {fehlend}"
