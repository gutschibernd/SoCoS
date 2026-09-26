"""
Module · Praktikantenstellen: Themen, der Auftrag an das LLM, der Parser für
seine Antwort und der Aushang als PDF.

Geprüft wird, was entschieden wurde: dass der Auftrag nichts erfinden lässt
und Kontakt und Aufruf dem Aushang überlässt, dass der Parser nichts
verschluckt, wenn das Modell vom Format abweicht, dass das PDF **genau eine
Seite** hat — und dass eine Ausschreibung, die nicht passt, schon beim
Speichern abgewiesen wird.
"""

import re

import pytest
from django.core.management import call_command

from socos.models import Praktikumsthema, Protokolleintrag
from socos.services import ausschreibung

ANTWORT = """# Usability-Tests am Arzneimittelspender

Du testest mit älteren Menschen, ob sie unseren Spender **ohne Hilfe** bedienen können.

## Deine Aufgaben
- Testabläufe planen
- Interviews führen & auswerten

## Das bringst du mit
- Freude am Umgang mit Menschen

Gute Deutschkenntnisse sind nötig.
"""


@pytest.fixture
def thema(db):
    return Praktikumsthema.objects.create(
        titel="Usability Spender",
        kurzbeschreibung="Tests mit Senior:innen",
        punkte="- Testplan\n\n* Interviews\n3. Auswertung",
    )


def _seiten(daten):
    # `/Type /Page` ohne das s von `/Pages`.
    return len(re.findall(rb"/Type /Page(?!s)", daten))


class TestAuftrag:
    def test_das_thema_geht_mit(self, thema):
        text = ausschreibung.auftrag(thema)

        assert "Titel: Usability Spender" in text
        assert "Tests mit Senior:innen" in text
        # Die Punkte ohne ihren Strich, jeder mit genau einem neuen.
        assert "- Testplan\n- Interviews\n- Auswertung" in text

    def test_verbietet_das_erfinden_und_den_kontakt(self, thema):
        text = ausschreibung.auftrag(thema)

        assert "Erfinde nichts" in text
        assert "Vergütung" in text
        assert "Keine Kontaktdaten" in text
        assert "Sopharmis Medical Solutions FlexCo" in text

    def test_leere_felder_fallen_weg(self, db):
        text = ausschreibung.auftrag(Praktikumsthema(titel="Nur ein Titel"))

        assert "Kurzbeschreibung:" not in text
        assert "Stichpunkte:" not in text

    def test_der_auftrag_kommt_mit_dem_thema(self, client, leser, thema):
        client.force_login(leser)

        daten = client.get(f"/api/praktikumsthemen/{thema.pk}/").json()

        assert daten["auftrag"] == ausschreibung.auftrag(thema)


class TestParser:
    def test_titel_einleitung_und_abschnitte(self):
        teile = ausschreibung.zerlegen(ANTWORT)

        assert teile["titel"] == "Usability-Tests am Arzneimittelspender"
        assert teile["einleitung"] == [
            "Du testest mit älteren Menschen, ob sie unseren Spender **ohne Hilfe** bedienen können."
        ]
        assert [a["ueberschrift"] for a in teile["abschnitte"]] == ["Deine Aufgaben", "Das bringst du mit"]
        assert teile["abschnitte"][0]["bloecke"] == [
            ("punkt", "Testabläufe planen"),
            ("punkt", "Interviews führen & auswerten"),
        ]
        assert teile["abschnitte"][1]["bloecke"][-1] == ("absatz", "Gute Deutschkenntnisse sind nötig.")

    def test_ohne_titel_wird_nichts_verschluckt(self):
        teile = ausschreibung.zerlegen("Ein Satz ohne Überschrift.\n\n## Aufgaben\n- Eins")

        assert teile["titel"] == ""
        assert teile["einleitung"] == ["Ein Satz ohne Überschrift."]
        assert teile["abschnitte"][0]["bloecke"] == [("punkt", "Eins")]

    def test_ein_codezaun_fliegt_weg(self):
        teile = ausschreibung.zerlegen("```markdown\n# Titel\n## Aufgaben\n- Eins\n```")

        assert teile["titel"] == "Titel"
        assert len(teile["abschnitte"]) == 1

    def test_zeilen_eines_absatzes_werden_einer(self):
        teile = ausschreibung.zerlegen("# T\nErste Zeile\nzweite Zeile\n\nNeuer Absatz")

        assert teile["einleitung"] == ["Erste Zeile zweite Zeile", "Neuer Absatz"]


class TestPdf:
    @pytest.mark.django_db
    def test_der_aushang_als_pdf(self, client, leser, thema):
        thema.ausschreibung = ANTWORT
        thema.save()
        client.force_login(leser)

        antwort = client.get(f"/api/praktikumsthemen/{thema.pk}/pdf/")

        assert antwort.status_code == 200
        assert antwort["Content-Type"] == "application/pdf"
        assert _seiten(antwort.content) == 1
        assert 'filename="Praktikum_Usability-Spender.pdf"' in antwort["Content-Disposition"]

    @pytest.mark.django_db
    def test_ohne_ausschreibung_kein_pdf(self, client, leser, thema):
        client.force_login(leser)

        antwort = client.get(f"/api/praktikumsthemen/{thema.pk}/pdf/")

        assert antwort.status_code == 400

    @pytest.mark.django_db
    def test_ein_langer_text_wird_kleiner_und_bleibt_eine_seite(self, thema):
        punkte = "\n".join(f"- Punkt {i}: ein Satz, der fast eine Zeile füllt" for i in range(8))
        thema.ausschreibung = "# Titel\n" + "\n".join(f"## Abschnitt {i}\n{punkte}" for i in range(4))

        assert ausschreibung.passt(thema.ausschreibung)
        assert _seiten(ausschreibung.erzeugen(thema)) == 1

    def test_was_nicht_passt_passt_nicht(self):
        viel = "# Titel\n" + "\n".join(f"- Punkt {i} " + "Wort " * 30 for i in range(80))

        assert not ausschreibung.passt(viel)

    def test_leer_passt_immer(self):
        assert ausschreibung.passt("   ")


class TestSchnittstelle:
    @pytest.mark.django_db
    def test_ein_bearbeiter_legt_an(self, client, bearbeiter):
        client.force_login(bearbeiter)

        antwort = client.post(
            "/api/praktikumsthemen/",
            {"titel": "Marktrecherche", "kurzbeschreibung": "Pflegedienste in der Steiermark", "punkte": "Liste\nInterviews"},
            content_type="application/json",
        )

        assert antwort.status_code == 201
        assert Praktikumsthema.objects.get().punkte == "Liste\nInterviews"
        assert Protokolleintrag.objects.filter(modell="socos.Praktikumsthema").exists()

    @pytest.mark.django_db
    def test_die_ausschreibung_wird_gespeichert(self, client, bearbeiter, thema):
        client.force_login(bearbeiter)

        antwort = client.patch(
            f"/api/praktikumsthemen/{thema.pk}/", {"ausschreibung": ANTWORT}, content_type="application/json"
        )

        assert antwort.status_code == 200
        thema.refresh_from_db()
        assert thema.ausschreibung == ANTWORT.strip()

    @pytest.mark.django_db
    def test_was_nicht_auf_die_seite_passt_wird_abgewiesen(self, client, bearbeiter, thema):
        client.force_login(bearbeiter)
        viel = "# Titel\n" + "\n".join(f"- Punkt {i} " + "Wort " * 12 for i in range(60))

        antwort = client.patch(
            f"/api/praktikumsthemen/{thema.pk}/", {"ausschreibung": viel}, content_type="application/json"
        )

        assert antwort.status_code == 400
        assert "eine Seite" in str(antwort.json())
        thema.refresh_from_db()
        assert thema.ausschreibung == ""

    @pytest.mark.django_db
    def test_ein_leser_legt_nichts_an(self, client, leser):
        client.force_login(leser)

        antwort = client.post("/api/praktikumsthemen/", {"titel": "X"}, content_type="application/json")

        assert antwort.status_code == 403

    @pytest.mark.django_db
    def test_entfernen_darf_nur_der_admin(self, client, bearbeiter, admin_nutzer, thema):
        client.force_login(bearbeiter)
        assert client.delete(f"/api/praktikumsthemen/{thema.pk}/").status_code == 403

        client.force_login(admin_nutzer)
        assert client.delete(f"/api/praktikumsthemen/{thema.pk}/").status_code == 204
        # Weich, wie alles.
        assert Praktikumsthema.alle_objekte.filter(pk=thema.pk, geloescht_am__isnull=False).exists()


@pytest.mark.django_db(transaction=True)
def test_themen_wandern_durch_die_sicherung(tmp_path, settings, bearbeiter):
    settings.MEDIA_ROOT = tmp_path / "medien"
    settings.MEDIA_ROOT.mkdir()
    Praktikumsthema.objects.create(titel="Marktrecherche", punkte="Eins\nZwei", ausschreibung=ANTWORT)

    archiv = tmp_path / "archiv.tar.gz"
    call_command("sicherung_erstellen", ziel=str(archiv), verbosity=0)
    Praktikumsthema.objects.all().hart_loeschen()
    call_command("sicherung_einspielen", str(archiv), ja_bestand_ersetzen=True, verbosity=0)

    wieder_da = Praktikumsthema.objects.get(titel="Marktrecherche")
    assert wieder_da.punkte == "Eins\nZwei"
    assert wieder_da.ausschreibung == ANTWORT
