"""
Module · SPG Academy: das Lean Model Canvas an einem Vorhaben.

Geprüft wird, was entschieden wurde: die Reihenfolge der Felder aus der SPG
Academy, dass ein Feld abgeglichen und nicht ersetzt wird (sonst stünde jeder
unveränderte Punkt nach jedem Speichern im Änderungsprotokoll), wer was darf,
dass ein entferntes Vorhaben seine Punkte mitnimmt — und dass das PDF auch ein
übervolles Feld übersteht.
"""

import re

import pytest
from django.core.management import call_command

from datetime import date
from decimal import Decimal

from socos.models import Aufgabe, Canvasfeld, Canvaspunkt, Persona, Protokolleintrag, Vorhaben


@pytest.fixture
def vorhaben(db):
    return Vorhaben.objects.create(titel="Arzneimittelspender")


def _feld(client, vorhaben, feld, punkte):
    return client.post(
        f"/api/vorhaben/{vorhaben.pk}/feld/",
        {"feld": feld, "punkte": punkte},
        content_type="application/json",
    )


def _stand(client, vorhaben, abschnitt, stand):
    return client.post(
        f"/api/vorhaben/{vorhaben.pk}/stand/",
        {"abschnitt": abschnitt, "stand": stand},
        content_type="application/json",
    )


def _aktive(vorhaben, feld):
    return list(
        Canvaspunkt.objects.filter(vorhaben=vorhaben, feld=feld).order_by("reihenfolge")
    )


class TestFelder:
    @pytest.mark.django_db
    def test_neun_felder_in_der_reihenfolge_der_spg(self, client, leser):
        client.force_login(leser)

        felder = client.get("/api/vorhaben/felder/").json()

        assert [f["titel"] for f in felder] == [
            "The Problem",
            "Customer Segments",
            "Unique Value Propositions",
            "The Solution",
            "Unfair Advantage",
            "Channels",
            "Revenue Streams",
            "Key Metrics",
            "Cost Structure",
        ]
        assert [f["nummer"] for f in felder] == list(range(1, 10))

    @pytest.mark.django_db
    def test_jedes_feld_hat_leitfragen(self, client, leser):
        client.force_login(leser)

        felder = client.get("/api/vorhaben/felder/").json()

        assert all(f["leitfragen"] for f in felder)

    @pytest.mark.django_db
    def test_die_aufgabe_aus_den_videos_kommt_mit(self, client, leser):
        client.force_login(leser)

        felder = {f["feld"]: f for f in client.get("/api/vorhaben/felder/").json()}

        assert "three problems" in felder["problem"]["aufgabe"][0]
        # Ein Feld ohne Vorgabe aus den Videos bekommt eine leere Liste, kein Fehlen.
        assert felder["kosten"]["aufgabe"] == []


class TestBusinessPlanLite:
    @pytest.mark.django_db
    def test_acht_abschnitte_in_der_reihenfolge_der_lektionen(self, client, leser):
        client.force_login(leser)

        felder = client.get("/api/vorhaben/felder/?workshop=businessplan").json()

        assert [f["titel"] for f in felder] == [
            "Executive Summary",
            "Products & Services",
            "Market Research & Analysis",
            "Marketing & Sales",
            "Company Structure & Management",
            "Sustainable Development Goals",
            "Financial Planning",
            "Tips & Tricks",
        ]
        assert all(f["leitfragen"] for f in felder)

    @pytest.mark.django_db
    def test_der_umfang_aus_der_vorlage_kommt_mit(self, client, leser):
        client.force_login(leser)

        felder = {f["feld"]: f for f in client.get("/api/vorhaben/felder/?workshop=businessplan").json()}

        assert felder["markt"]["umfang"] == "2 pages"
        # Tips & Tricks ist kein Kapitel und hat deshalb keinen Umfang.
        assert felder["tipps"]["umfang"] == ""

    @pytest.mark.django_db
    def test_ein_unbekannter_workshop_ist_ein_fehler(self, client, leser):
        client.force_login(leser)

        assert client.get("/api/vorhaben/felder/?workshop=pitch").status_code == 400

    @pytest.mark.django_db
    def test_der_plan_wird_nicht_hier_geschrieben(self, client, bearbeiter, vorhaben):
        # Geschrieben wird er im Dokument, das abgegeben wird — hier steht nur
        # der Stand. Punkte in einen Abschnitt nimmt der Server nicht an.
        client.force_login(bearbeiter)

        antwort = _feld(client, vorhaben, "summary", [{"text": "Ein Spender."}])

        assert antwort.status_code == 400
        assert not _aktive(vorhaben, "summary")

    @pytest.mark.django_db
    def test_der_stand_eines_abschnitts(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        antwort = _stand(client, vorhaben, "markt", "entwurf")

        assert antwort.status_code == 200
        assert antwort.json()["planstand"] == {"markt": "entwurf"}
        _stand(client, vorhaben, "summary", "fertig")
        vorhaben.refresh_from_db()
        # Der zweite Abschnitt kommt dazu, statt den ersten zu ersetzen.
        assert vorhaben.planstand == {"markt": "entwurf", "summary": "fertig"}

    @pytest.mark.django_db
    def test_der_stand_steht_im_protokoll(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        _stand(client, vorhaben, "markt", "fertig")

        eintrag = Protokolleintrag.objects.filter(modell="socos.Vorhaben", objekt_id=vorhaben.pk).latest("id")
        assert eintrag.aenderungen["planstand"] == {"alt": {}, "neu": {"markt": "fertig"}}

    @pytest.mark.django_db
    def test_unbekannter_abschnitt_oder_stand(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        assert _stand(client, vorhaben, "problem", "fertig").status_code == 400
        assert _stand(client, vorhaben, "markt", "halb").status_code == 400

    @pytest.mark.django_db
    def test_ein_leser_setzt_keinen_stand(self, client, leser, vorhaben):
        client.force_login(leser)

        assert _stand(client, vorhaben, "markt", "fertig").status_code == 403

    @pytest.mark.django_db
    def test_die_abgaben_stehen_auf_der_tafel(self):
        # Die Migration 0025 schreibt die drei Abgaben mit ihrer Frist auf
        # die Tafel, in die Spalte „Allgemein".
        abgaben = Aufgabe.objects.filter(text__startswith="Business Plan Lite").order_by("frist")

        assert [(a.frist, a.person_id) for a in abgaben] == [
            (date(2026, 10, 12), None),
            (date(2026, 10, 27), None),
            (date(2026, 11, 19), None),
        ]


class TestPersonas:
    @pytest.mark.django_db
    def test_ein_bearbeiter_legt_einen_steckbrief_an(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/personas/",
            {"vorhaben": vorhaben.pk, "name": "Maria Huber", "rolle": "nutzer", "alter": 78,
             "einkommen": "1450.00"},
            content_type="application/json",
        )

        assert antwort.status_code == 201
        # Geld geht als Zeichenkette hinaus, wie überall in der API.
        assert antwort.json()["einkommen"] == "1450.00"
        assert Persona.objects.get().einkommen == Decimal("1450.00")

    @pytest.mark.django_db
    def test_die_personas_kommen_mit_dem_vorhaben(self, client, leser, vorhaben):
        Persona.objects.create(vorhaben=vorhaben, name="Thomas", rolle="kunde")
        client.force_login(leser)

        daten = next(v for v in client.get("/api/vorhaben/").json() if v["id"] == vorhaben.pk)

        assert [p["name"] for p in daten["personas"]] == ["Thomas"]

    @pytest.mark.django_db
    def test_ein_leser_legt_keine_an(self, client, leser, vorhaben):
        client.force_login(leser)

        antwort = client.post(
            "/api/personas/", {"vorhaben": vorhaben.pk, "name": "X"}, content_type="application/json"
        )

        assert antwort.status_code == 403

    @pytest.mark.django_db
    def test_entfernen_darf_nur_der_admin(self, client, bearbeiter, admin_nutzer, vorhaben):
        p = Persona.objects.create(vorhaben=vorhaben, name="Weg")
        client.force_login(bearbeiter)
        assert client.delete(f"/api/personas/{p.pk}/").status_code == 403

        client.force_login(admin_nutzer)
        assert client.delete(f"/api/personas/{p.pk}/").status_code == 204
        assert Persona.alle_objekte.get(pk=p.pk).ist_geloescht

    @pytest.mark.django_db
    def test_das_vorhaben_nimmt_seine_personas_mit(self, vorhaben):
        p = Persona.objects.create(vorhaben=vorhaben, name="Maria")

        vorhaben.delete()

        assert Persona.alle_objekte.get(pk=p.pk).ist_geloescht

    @pytest.mark.django_db
    def test_im_pdf_folgt_eine_seite_mit_den_steckbriefen(self, vorhaben):
        from socos.services import leinwand

        Persona.objects.create(
            vorhaben=vorhaben, name="Maria & <Huber>", alter=78, einkommen=Decimal("1450.50"),
            beduerfnisse="Zu Hause bleiben.",
        )

        daten = leinwand.erzeugen(vorhaben)

        assert len(re.findall(rb"/Type /Page(?!s)", daten)) == 2

    def test_der_betrag_im_pdf(self):
        from socos.services import leinwand

        assert leinwand.euro(Decimal("1450.00")) == "1\u00a0450 €"
        assert leinwand.euro(Decimal("1450.50")) == "1\u00a0450,50 €"


class TestVisionStatement:
    @pytest.mark.django_db
    def test_drei_teile_in_der_reihenfolge_des_satzes(self, client, leser):
        client.force_login(leser)

        felder = client.get("/api/vorhaben/felder/?workshop=vision").json()

        assert [f["titel"] for f in felder] == [
            "Our Vision is",
            "hereby we want to help",
            "by building",
        ]
        assert [f["leitfragen"] for f in felder] == [[], [], []]

    @pytest.mark.django_db
    def test_ein_teil_wird_geschrieben_und_umgeschrieben(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "wem", [{"text": "Pflegebedürftige"}])
        erster = _aktive(vorhaben, "wem")[0]

        _feld(client, vorhaben, "wem", [{"id": erster.pk, "text": "Pflegebedürftige zu Hause"}])

        # Derselbe Punkt, umgeschrieben — im Protokoll steht alt → neu.
        assert [(p.pk, p.text) for p in _aktive(vorhaben, "wem")] == [
            (erster.pk, "Pflegebedürftige zu Hause")
        ]

    @pytest.mark.django_db
    def test_eine_luecke_nimmt_nur_einen_text(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        antwort = _feld(client, vorhaben, "vision", [{"text": "Eins"}, {"text": "Zwei"}])

        assert antwort.status_code == 400
        assert _aktive(vorhaben, "vision") == []

    @pytest.mark.django_db
    def test_eine_leere_luecke_entfernt_den_teil(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "womit", [{"text": "einen Spender"}])

        _feld(client, vorhaben, "womit", [])

        assert _aktive(vorhaben, "womit") == []

    @staticmethod
    def _eintragen():
        from importlib import import_module

        from django.apps import apps

        import_module("socos.migrations.0027_vision_statement").eintragen(apps, None)

    @pytest.mark.django_db
    def test_die_migration_traegt_die_vision_ein(self):
        Canvaspunkt.objects.all().hart_loeschen()
        Vorhaben.objects.all().hart_loeschen()
        vorhaben = Vorhaben.objects.create(titel="Sopharmis Arzneimittelspender")

        self._eintragen()

        (punkt,) = _aktive(vorhaben, "vision")
        assert punkt.text.startswith("a world where medication at home is safe")

    @pytest.mark.django_db
    def test_die_migration_ueberschreibt_keine_vision(self):
        Canvaspunkt.objects.all().hart_loeschen()
        Vorhaben.objects.all().hart_loeschen()
        vorhaben = Vorhaben.objects.create(titel="Sopharmis Arzneimittelspender")
        Canvaspunkt.objects.create(vorhaben=vorhaben, feld="vision", text="Schon da")

        self._eintragen()

        assert [p.text for p in _aktive(vorhaben, "vision")] == ["Schon da"]


class TestFeldSetzen:
    @pytest.mark.django_db
    def test_punkte_kommen_in_ihrer_reihenfolge_an(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        antwort = _feld(client, vorhaben, "problem", [{"text": "Erstens"}, {"text": "Zweitens"}])

        assert antwort.status_code == 200
        assert [p["text"] for p in antwort.json()["punkte"]] == ["Erstens", "Zweitens"]

    @pytest.mark.django_db
    def test_leere_zeilen_werden_uebergangen(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        _feld(client, vorhaben, "kunden", [{"text": "  "}, {"text": "Pflegedienste"}, {"text": ""}])

        assert [p.text for p in _aktive(vorhaben, "kunden")] == ["Pflegedienste"]

    @pytest.mark.django_db
    def test_unveraenderte_punkte_stehen_nicht_neu_im_protokoll(
        self, client, bearbeiter, vorhaben
    ):
        """
        Der Grund für den Abgleich: Ersetzen schriebe bei jedem Speichern jeden
        Punkt einmal als entfernt und einmal als neu ins Protokoll.
        """
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "nutzen", [{"text": "Bleibt"}, {"text": "Wird geändert"}])
        bleibt, aendert = _aktive(vorhaben, "nutzen")
        vorher = Protokolleintrag.objects.count()

        _feld(
            client, vorhaben, "nutzen",
            [{"id": bleibt.pk, "text": "Bleibt"}, {"id": aendert.pk, "text": "Umgeschrieben"}],
        )

        neu = Protokolleintrag.objects.filter().order_by("id")[vorher:]
        assert [(e.objekt_id, e.aktion) for e in neu] == [(str(aendert.pk), "geaendert")]
        assert neu[0].aenderungen["text"] == {"alt": "Wird geändert", "neu": "Umgeschrieben"}

    @pytest.mark.django_db
    def test_was_fehlt_wird_weich_entfernt(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "kosten", [{"text": "Miete"}, {"text": "Personal"}])
        miete, personal = _aktive(vorhaben, "kosten")

        _feld(client, vorhaben, "kosten", [{"id": personal.pk, "text": "Personal"}])

        assert [p.text for p in _aktive(vorhaben, "kosten")] == ["Personal"]
        assert Canvaspunkt.alle_objekte.get(pk=miete.pk).ist_geloescht

    @pytest.mark.django_db
    def test_umsortieren_aendert_nur_die_reihenfolge(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "kanaele", [{"text": "A"}, {"text": "B"}])
        a, b = _aktive(vorhaben, "kanaele")

        _feld(client, vorhaben, "kanaele", [{"id": b.pk, "text": "B"}, {"id": a.pk, "text": "A"}])

        assert [p.pk for p in _aktive(vorhaben, "kanaele")] == [b.pk, a.pk]

    @pytest.mark.django_db
    def test_ein_fremder_punkt_wird_nicht_uebernommen(self, client, bearbeiter, vorhaben):
        """Eine Kennung aus einem anderen Feld legt einen neuen Punkt an, statt ihn herüberzuziehen."""
        client.force_login(bearbeiter)
        _feld(client, vorhaben, "problem", [{"text": "Bleibt im Problem"}])
        fremd = _aktive(vorhaben, "problem")[0]

        _feld(client, vorhaben, "loesung", [{"id": fremd.pk, "text": "Neu in der Lösung"}])

        assert [p.text for p in _aktive(vorhaben, "problem")] == ["Bleibt im Problem"]
        assert [p.text for p in _aktive(vorhaben, "loesung")] == ["Neu in der Lösung"]

    @pytest.mark.django_db
    def test_ein_unbekanntes_feld_ist_ein_fehler(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        antwort = _feld(client, vorhaben, "swot", [{"text": "x"}])

        assert antwort.status_code == 400


class TestBerechtigung:
    @pytest.mark.django_db
    def test_ein_leser_sieht_alles(self, client, leser, vorhaben):
        Canvaspunkt.objects.create(vorhaben=vorhaben, feld="problem", text="Sichtbar")
        client.force_login(leser)

        antwort = client.get("/api/vorhaben/")

        assert antwort.status_code == 200
        assert antwort.json()[0]["punkte"][0]["text"] == "Sichtbar"

    @pytest.mark.django_db
    def test_ein_leser_bearbeitet_nichts(self, client, leser, vorhaben):
        client.force_login(leser)

        anlegen = client.post(
            "/api/vorhaben/", {"titel": "Neu"}, content_type="application/json"
        )
        setzen = _feld(client, vorhaben, "problem", [{"text": "x"}])

        assert anlegen.status_code == 403
        assert setzen.status_code == 403
        # Nur dieses Vorhaben: Die Migrationen legen das eine Vorhaben samt
        # Vision schon an, die Datenbank ist also nie ganz leer.
        assert not Canvaspunkt.objects.filter(vorhaben=vorhaben).exists()

    @pytest.mark.django_db
    def test_ein_bearbeiter_legt_an_und_benennt_um(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        anlegen = client.post(
            "/api/vorhaben/", {"titel": "Ideenliste 2027"}, content_type="application/json"
        )
        umbenennen = client.patch(
            f"/api/vorhaben/{vorhaben.pk}/", {"titel": "Spender"}, content_type="application/json"
        )

        assert anlegen.status_code == 201
        assert umbenennen.status_code == 200

    @pytest.mark.django_db
    def test_ein_bearbeiter_entfernt_kein_vorhaben(self, client, bearbeiter, vorhaben):
        client.force_login(bearbeiter)

        assert client.delete(f"/api/vorhaben/{vorhaben.pk}/").status_code == 403


class TestEntfernen:
    @pytest.mark.django_db
    def test_die_punkte_gehen_mit(self, client, admin_nutzer, vorhaben):
        punkt = Canvaspunkt.objects.create(vorhaben=vorhaben, feld="problem", text="Weg")
        client.force_login(admin_nutzer)

        assert client.delete(f"/api/vorhaben/{vorhaben.pk}/").status_code == 204

        assert Canvaspunkt.alle_objekte.get(pk=punkt.pk).ist_geloescht
        assert not Vorhaben.objects.filter(pk=vorhaben.pk).exists()


class TestPdf:
    @pytest.mark.django_db
    def test_die_leinwand_als_pdf(self, client, leser, vorhaben):
        Canvaspunkt.objects.create(vorhaben=vorhaben, feld="nutzen", text="Kein Stellen mehr & <keine> Verwechslung")
        client.force_login(leser)

        antwort = client.get(f"/api/vorhaben/{vorhaben.pk}/pdf/")

        assert antwort.status_code == 200
        assert antwort["Content-Type"] == "application/pdf"
        assert antwort.content.startswith(b"%PDF")
        assert 'filename="Lean-Canvas_Arzneimittelspender.pdf"' in antwort["Content-Disposition"]

    @pytest.mark.django_db
    def test_ein_uebervolles_feld_sprengt_die_seite_nicht(self, vorhaben):
        from socos.services import leinwand

        for i in range(40):
            Canvaspunkt.objects.create(
                vorhaben=vorhaben, feld="loesung", reihenfolge=i,
                text=f"Punkt {i}: " + "ein ziemlich langer Satz, der umbrechen muss " * 4,
            )

        daten = leinwand.erzeugen(vorhaben)

        assert daten.startswith(b"%PDF")
        # Genau eine Seite: `/Type /Page` ohne das s von `/Pages`.
        assert len(re.findall(rb"/Type /Page(?!s)", daten)) == 1

    def test_der_dateiname_bleibt_ascii(self):
        from socos.services import leinwand

        assert leinwand.dateiname(Vorhaben(titel="Spender für Ärzte")) == "Lean-Canvas_Spender-fuer-Aerzte.pdf"


class TestDasEineVorhaben:
    """
    Die Migration 0022 legt „Sopharmis Arzneimittelspender" an — aber nur, wenn
    noch keines da ist. Geprüft an der Funktion selbst und nicht am Bestand:
    Ein Test mit `transaction=True` leert die Datenbank samt dem, was
    Migrationen angelegt haben (siehe conftest.py).
    """

    @staticmethod
    def _anlegen():
        from importlib import import_module

        from django.apps import apps

        import_module("socos.migrations.0022_das_eine_vorhaben").anlegen(apps, None)

    @pytest.mark.django_db
    def test_legt_es_an_wenn_keines_da_ist(self):
        Vorhaben.objects.all().hart_loeschen()

        self._anlegen()

        assert [v.titel for v in Vorhaben.objects.all()] == ["Sopharmis Arzneimittelspender"]

    @pytest.mark.django_db
    def test_laesst_ein_vorhandenes_stehen(self):
        Vorhaben.objects.all().hart_loeschen()
        Vorhaben.objects.create(titel="Von Hand angelegt")

        self._anlegen()

        assert [v.titel for v in Vorhaben.objects.all()] == ["Von Hand angelegt"]


@pytest.mark.django_db(transaction=True)
def test_vorhaben_und_punkte_wandern_durch_die_sicherung(tmp_path, settings, bearbeiter):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    vorhaben = Vorhaben.objects.create(titel="Spender")
    Canvaspunkt.objects.create(vorhaben=vorhaben, feld=Canvasfeld.PROBLEM, text="Verwechslung")
    Persona.objects.create(vorhaben=vorhaben, name="Maria", einkommen=Decimal("1450.00"))
    weg = Canvaspunkt.objects.create(vorhaben=vorhaben, feld=Canvasfeld.PROBLEM, text="Gestrichen")
    weg.delete()

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Vorhaben.objects.get(titel="Spender")
    assert [p.text for p in Canvaspunkt.objects.filter(vorhaben=wieder_da)] == ["Verwechslung"]
    assert Persona.objects.get(vorhaben=wieder_da).einkommen == Decimal("1450.00")
    # Auch das Gestrichene ist Bestand — das Protokoll verweist darauf.
    assert Canvaspunkt.alle_objekte.filter(text="Gestrichen").exists()
