"""
Was die Sicherheitsprüfung vom 2026-09-23 gefunden hat — je Fund ein Test,
damit er nicht leise zurückkommt.
"""

import datetime
from unittest import mock

import pytest

from socos.models import Nutzer


@pytest.mark.django_db
def test_protokoll_zeigt_fremde_stammdaten_nicht(client, admin_nutzer, bearbeiter):
    """
    Das Protokoll hält alt → neu je Feld fest und ist für alle lesbar. Ohne
    Filter stünde dort die Adresse, die der Nutzer-Serializer gerade verbirgt.
    """
    admin_nutzer.strasse = "Geheimgasse 1"
    admin_nutzer.geburtsdatum = datetime.date(1980, 1, 2)
    admin_nutzer.funktion = "Leitung"
    admin_nutzer.save()

    client.force_login(bearbeiter)
    eintraege = client.get(
        f"/api/protokoll/?modell=socos.Nutzer&objekt={admin_nutzer.pk}"
    ).json()
    geaendert = [e for e in eintraege if e["aktion"] == "geaendert"]
    assert geaendert
    for eintrag in geaendert:
        assert "strasse" not in eintrag["aenderungen"]
        assert "geburtsdatum" not in eintrag["aenderungen"]
    assert any("funktion" in e["aenderungen"] for e in geaendert)


@pytest.mark.django_db
def test_protokoll_zeigt_eigene_stammdaten_und_dem_admin(client, admin_nutzer, bearbeiter):
    bearbeiter.strasse = "Meine Gasse 2"
    bearbeiter.save()

    for wer in (bearbeiter, admin_nutzer):
        client.force_login(wer)
        eintraege = client.get(
            f"/api/protokoll/?modell=socos.Nutzer&objekt={bearbeiter.pk}"
        ).json()
        assert any("strasse" in (e["aenderungen"] or {}) for e in eintraege)


@pytest.mark.django_db
def test_bearbeiter_legt_kein_konto_an(client, bearbeiter):
    """POST ist nach der gewöhnlichen Regel „bearbeiten" — für Konten reicht das nicht."""
    client.force_login(bearbeiter)
    antwort = client.post(
        "/api/nutzer/",
        {"email": "neu@example.invalid", "name": "Neu"},
        content_type="application/json",
    )
    assert antwort.status_code == 403
    assert not Nutzer.objects.filter(email="neu@example.invalid").exists()


@pytest.mark.django_db
def test_healthz_verraet_den_grund_nicht(client):
    """Von außen erreichbar — die Treibermeldung nennt Rechner und Datenbanknutzer."""
    with mock.patch(
        "socos.views.connection.cursor",
        side_effect=Exception('connection to server at "datenbank" (10.0.0.5) failed: user "socos"'),
    ):
        antwort = client.get("/healthz/")
    assert antwort.status_code == 503
    assert "10.0.0.5" not in antwort.content.decode()
    assert "socos" not in antwort.content.decode()


@pytest.mark.django_db
def test_zeitnachweis_dateiname_bricht_den_kopf_nicht(client, admin_nutzer):
    admin_nutzer.name = 'Anna "Nana" Müller'
    admin_nutzer.save()
    client.force_login(admin_nutzer)
    antwort = client.get(f"/api/zeitnachweis/?monat=2026-09&person={admin_nutzer.pk}")
    assert antwort.status_code == 200
    kopf = antwort["Content-Disposition"]
    assert kopf.startswith("attachment;")
    # Ein nicht maskiertes Anführungszeichen schlösse den Namen vorzeitig.
    assert 'filename="Zeitnachweis_2026-09_Anna-"' not in kopf


@pytest.mark.django_db
def test_anmeldeseite_hat_eine_csp_ohne_eingebettete_skripte(client):
    antwort = client.get("/anmelden/")
    richtlinie = antwort["Content-Security-Policy"]
    assert "script-src 'self'" in richtlinie
    assert "unsafe-inline" not in richtlinie.split("script-src")[1].split(";")[0]
    assert "frame-ancestors 'none'" in richtlinie


def test_anmeldeseite_bettet_kein_skript_ein():
    """Ein <script> ohne src liefe unter der Policy nicht — die Seite stünde still."""
    import re

    from django.conf import settings

    quelle = (settings.WURZEL / "vorlagen" / "anmelden.html").read_text(encoding="utf-8")
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", quelle)
