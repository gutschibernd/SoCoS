"""
Praktikanten · Meine Aufgaben: Stränge am Pensum.

Geprüft wird, was entschieden wurde: Ein Strang ist ein Pensum mit
`strang`, gesetzt über dieselbe Schnittstelle wie jedes Pensum; wer einen
hat, bekommt „Mein Praktikum" als ersten Baustein der Übersicht.
"""

from decimal import Decimal

import pytest

from socos.models import Arbeitspaket, Pensum, Projekt, Projektphase
from socos.services import uebersicht


@pytest.fixture
def paket(db):
    projekt = Projekt.objects.create(titel="Praktikum 2027")
    phase = Projektphase.objects.create(projekt=projekt, titel="Sommer", art="dev")
    return Arbeitspaket.objects.create(phase=phase, titel="Usability-Tests", beschreibung="Zehn Tests mit Senior:innen")


@pytest.mark.django_db
def test_ein_strang_wird_ueber_das_pensum_angelegt(client, bearbeiter, paket):
    client.force_login(bearbeiter)

    antwort = client.post(
        "/api/pensen/",
        {"paket": paket.pk, "person": bearbeiter.pk, "stunden": "300", "strang": "haupt"},
        content_type="application/json",
    )

    assert antwort.status_code == 201
    assert antwort.json()["strang"] == "haupt"
    # Stunden bleiben eine Zeichenkette — Decimal, nicht Gleitkomma.
    assert antwort.json()["stunden"] == "300.00"
    assert Pensum.objects.get().strang == Pensum.Strang.HAUPT


@pytest.mark.django_db
def test_ohne_angabe_ist_es_kein_strang(client, bearbeiter, paket):
    client.force_login(bearbeiter)

    client.post(
        "/api/pensen/", {"paket": paket.pk, "person": bearbeiter.pk, "stunden": "10"}, content_type="application/json"
    )

    assert Pensum.objects.get().strang == ""


@pytest.mark.django_db
def test_ein_erfundener_strang_wird_abgewiesen(client, bearbeiter, paket):
    client.force_login(bearbeiter)

    antwort = client.post(
        "/api/pensen/",
        {"paket": paket.pk, "person": bearbeiter.pk, "stunden": "10", "strang": "seiten"},
        content_type="application/json",
    )

    assert antwort.status_code == 400 and "strang" in antwort.json()


@pytest.mark.django_db
def test_vom_strang_loesen_laesst_das_pensum_stehen(client, bearbeiter, paket):
    pensum = Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("80"), strang="neben")
    client.force_login(bearbeiter)

    client.patch(f"/api/pensen/{pensum.pk}/", {"strang": ""}, content_type="application/json")

    pensum.refresh_from_db()
    assert (pensum.strang, pensum.stunden, pensum.geloescht_am) == ("", Decimal("80.00"), None)


@pytest.mark.django_db
def test_ein_leser_legt_keinen_strang_an(client, leser, paket):
    client.force_login(leser)

    antwort = client.post(
        "/api/pensen/",
        {"paket": paket.pk, "person": leser.pk, "stunden": "10", "strang": "haupt"},
        content_type="application/json",
    )

    assert antwort.status_code == 403


# --- Die Übersicht ----------------------------------------------------------


def _schluessel(liste):
    return [e["baustein"] for e in liste]


@pytest.mark.django_db
def test_wer_einen_strang_hat_bekommt_sein_praktikum_zuerst(bearbeiter, paket):
    Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("300"), strang="haupt")

    assert _schluessel(uebersicht.vorschlag(bearbeiter)) == ["praktikum", *uebersicht.OHNE_NUTZUNG]


@pytest.mark.django_db
def test_ein_gewoehnliches_pensum_bringt_kein_praktikum(bearbeiter, paket):
    Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("300"))

    assert "praktikum" not in _schluessel(uebersicht.vorschlag(bearbeiter))


@pytest.mark.django_db
def test_ein_entferntes_paket_bringt_kein_praktikum(bearbeiter, paket):
    Pensum.objects.create(paket=paket, person=bearbeiter, stunden=Decimal("300"), strang="haupt")
    Pensum.objects.all().delete()
    paket.delete()

    assert "praktikum" not in _schluessel(uebersicht.vorschlag(bearbeiter))


@pytest.mark.django_db
def test_praktikum_darf_gespeichert_werden():
    assert uebersicht.bereinigt([{"baustein": "praktikum", "breit": False}]) == [
        {"baustein": "praktikum", "breit": False}
    ]


# --- Der Umzug der sonstigen Ideen ------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_die_sonstigen_ideen_ziehen_als_todos_um():
    """
    Bernd: „kann man löschen". Verschwinden soll trotzdem nichts — jede Idee
    steht danach als To-Do da, das Thema ist weich gelöscht.
    """
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    vorher, nachher = [("socos", "0062_mailtexte_neu")], [("socos", "0063_praktikum_straenge")]
    executor = MigrationExecutor(connection)
    executor.migrate(vorher)
    alt = executor.loader.project_state(vorher).apps
    Thema = alt.get_model("socos", "Praktikumsthema")
    Thema.objects.create(titel="Messestand", art="idee", kurzbeschreibung="Für die MEDICA", punkte="Plan\nBudget")
    Thema.objects.create(titel="Spender", art="aufgabe")

    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(nachher)
    neu = executor.loader.project_state(nachher).apps

    todo = neu.get_model("socos", "Nebenaufgabe").objects.get(titel="Messestand")
    assert (todo.umfang, todo.beschreibung) == ("gross", "Für die MEDICA\n\nPlan\nBudget")
    themen = neu.get_model("socos", "Praktikumsthema").objects
    assert themen.get(titel="Messestand").geloescht_am is not None
    assert themen.get(titel="Spender").geloescht_am is None

    # Auf den neuesten Stand, damit die übrigen Tests ihr Schema vorfinden.
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())
