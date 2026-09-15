"""
Die Tafel unter „Intern · Aufgaben".

Geprüft wird, was entschieden wurde: wer schreiben darf, dass „Allgemein" ein
gewöhnlicher Wert ist und kein Sonderfall, und dass eine leere Zeile keine
Aufgabe wird. Dass DRF eine Liste ausgibt, wird nicht geprüft.

Dazu die Ideenliste — sie ist dieselbe Tabelle mit `ist_idee`. Geprüft wird
genau das, was diese Entscheidung tragen muss: dass aus der Idee ohne Abtippen
eine Aufgabe wird und dass der Schritt im Protokoll steht.
"""

import pytest

from socos.models import Aufgabe, Aufgabenprioritaet, Protokolleintrag


@pytest.mark.django_db
def test_bearbeiter_darf_anlegen_und_abhaken(client, bearbeiter):
    """Anna trägt ein und hakt ab — beides ohne Adminrecht."""
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/",
        {"text": "Angebot Lieferant nachfassen"},
        content_type="application/json",
    )
    assert antwort.status_code == 201
    # Ohne Angabe steht eine neue Aufgabe auf „mittel": Wer sie aufschreibt,
    # hat sie eingeschätzt — im Zweifel als normal.
    assert antwort.json()["prioritaet"] == Aufgabenprioritaet.MITTEL

    kennung = antwort.json()["id"]
    assert (
        client.patch(
            f"/api/aufgaben/{kennung}/", {"erledigt": True}, content_type="application/json"
        ).status_code
        == 200
    )
    assert Aufgabe.objects.get(pk=kennung).erledigt


@pytest.mark.django_db
def test_leser_darf_sehen_aber_nicht_schreiben(client, leser):
    client.force_login(leser)
    assert client.get("/api/aufgaben/").status_code == 200
    antwort = client.post(
        "/api/aufgaben/", {"text": "Nur geschaut"}, content_type="application/json"
    )
    assert antwort.status_code == 403


@pytest.mark.django_db
def test_die_tafel_ist_gemeinsam(client, bearbeiter, admin_nutzer):
    """
    Der Punkt der ganzen Seite: Man schreibt dem anderen etwas auf. Es gibt
    deshalb **keine** Prüfung auf „meine eigene Aufgabe" — weder beim Anlegen
    noch beim Abhaken.
    """
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/",
        {"text": "Vertrag gegenzeichnen", "person": admin_nutzer.pk},
        content_type="application/json",
    )
    assert antwort.status_code == 201
    assert antwort.json()["person_name"] == admin_nutzer.name

    fremde = Aufgabe.objects.create(person=admin_nutzer, text="Fremder Punkt")
    assert (
        client.patch(
            f"/api/aufgaben/{fremde.pk}/",
            {"prioritaet": "hoch"},
            content_type="application/json",
        ).status_code
        == 200
    )


@pytest.mark.django_db
def test_ohne_person_ist_allgemein(client, bearbeiter):
    """
    `person = null` ist die Spalte „Allgemein" und damit ein gewöhnlicher Wert.
    Ein zweites Feld daneben könnte ihm widersprechen.
    """
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/", {"text": "Kaffee bestellen"}, content_type="application/json"
    )
    assert antwort.status_code == 201
    assert antwort.json()["person"] is None
    assert antwort.json()["person_name"] == ""


@pytest.mark.django_db
def test_eine_leere_zeile_wird_keine_aufgabe(client, bearbeiter):
    """
    Sonst entstünde bei einem Enter auf dem leeren Feld ein Zettel, den danach
    niemand wiederfindet — er zeigt ja nichts an.
    """
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/", {"text": "   "}, content_type="application/json"
    )
    assert antwort.status_code == 400


@pytest.mark.django_db
def test_entfernen_loescht_weich_und_nur_der_admin(client, bearbeiter, admin_nutzer):
    aufgabe = Aufgabe.objects.create(text="Zu viel aufgeschrieben")

    client.force_login(bearbeiter)
    assert client.delete(f"/api/aufgaben/{aufgabe.pk}/").status_code == 403

    client.force_login(admin_nutzer)
    assert client.delete(f"/api/aufgaben/{aufgabe.pk}/").status_code == 204
    assert not Aufgabe.objects.filter(pk=aufgabe.pk).exists()
    assert Aufgabe.alle_objekte.get(pk=aufgabe.pk).geloescht_am is not None


@pytest.mark.django_db
def test_wer_die_prioritaet_gedreht_hat_steht_im_protokoll(client, bearbeiter):
    """
    Die Tafel führt bewusst kein eigenes Feld darüber, wer wann etwas geändert
    hat. Sie braucht auch keines: Das Änderungsprotokoll hängt an jedem
    Fachmodell und damit auch hier.
    """
    client.force_login(bearbeiter)
    aufgabe = Aufgabe.objects.create(text="Prüfbericht lesen")
    client.patch(
        f"/api/aufgaben/{aufgabe.pk}/", {"prioritaet": "hoch"}, content_type="application/json"
    )

    eintrag = Protokolleintrag.objects.filter(
        modell="socos.Aufgabe", objekt_id=str(aufgabe.pk), aktion="geaendert"
    ).first()
    assert eintrag is not None
    assert eintrag.nutzer_text == bearbeiter.name
    assert eintrag.aenderungen["prioritaet"] == {"alt": "mittel", "neu": "hoch"}


@pytest.mark.django_db
def test_erledigtes_laesst_sich_weglassen(client, bearbeiter):
    """
    `?erledigt=nein` ist ein **ausdrücklicher** Filter. Ohne Angabe kommt alles
    — die Tafel hat so wenig eine stille Vorauswahl wie die Zeiterfassung
    einen stillen Monat.
    """
    Aufgabe.objects.create(text="Offen")
    Aufgabe.objects.create(text="Abgehakt", erledigt=True)

    client.force_login(bearbeiter)
    assert len(client.get("/api/aufgaben/").json()) == 2
    offen = client.get("/api/aufgaben/?erledigt=nein").json()
    assert [a["text"] for a in offen] == ["Offen"]


@pytest.mark.django_db
def test_aus_einer_idee_wird_eine_aufgabe_mit_einem_patch(client, bearbeiter):
    """
    Der Grund, warum die Idee **kein eigenes Modell** ist: „Das machen wir"
    darf kein Löschen samt Abtippen sein. Text, Einschätzung und Verlauf
    bleiben dieselbe Zeile.
    """
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/",
        {"text": "Messestand aus Holz statt Alu", "ist_idee": True, "prioritaet": "hoch"},
        content_type="application/json",
    )
    assert antwort.status_code == 201
    kennung = antwort.json()["id"]

    uebernommen = client.patch(
        f"/api/aufgaben/{kennung}/", {"ist_idee": False}, content_type="application/json"
    )
    assert uebernommen.status_code == 200
    aufgabe = Aufgabe.objects.get(pk=kennung)
    assert not aufgabe.ist_idee
    # Dieselbe Kennung, derselbe Text, dieselbe Einschätzung — nichts abgetippt.
    assert aufgabe.text == "Messestand aus Holz statt Alu"
    assert aufgabe.prioritaet == Aufgabenprioritaet.HOCH


@pytest.mark.django_db
def test_eine_neue_zeile_ist_ohne_angabe_keine_idee(client, bearbeiter):
    """
    Die Vorgabe ist die Tafel, nicht die Ideenliste: Wer über die API etwas
    anlegt und nichts dazu sagt, meint den Zettel, der jetzt getan werden soll.
    """
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/aufgaben/", {"text": "Rechnung prüfen"}, content_type="application/json"
    )
    assert antwort.status_code == 201
    assert antwort.json()["ist_idee"] is False


@pytest.mark.django_db
def test_das_uebernehmen_steht_im_protokoll(client, bearbeiter):
    """
    Ohne eigenes Modell gilt das Änderungsprotokoll ohne Zutun weiter — „wer
    hat das entschieden" ist damit beantwortet, ohne ein Feld dafür.
    """
    client.force_login(bearbeiter)
    idee = Aufgabe.objects.create(text="Zweiter Lieferant", ist_idee=True)
    client.patch(
        f"/api/aufgaben/{idee.pk}/", {"ist_idee": False}, content_type="application/json"
    )

    eintrag = Protokolleintrag.objects.filter(
        modell="socos.Aufgabe", objekt_id=str(idee.pk), aktion="geaendert"
    ).first()
    assert eintrag is not None
    assert eintrag.aenderungen["ist_idee"] == {"alt": True, "neu": False}
