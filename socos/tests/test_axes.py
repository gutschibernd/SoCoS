"""
Die drei Punkte zur Sperre gegen Rateversuche — als Test, nicht als Kommentar.

Sie hängen zusammen und einzeln sieht keiner von ihnen wichtig aus. Genau
deshalb steht hier ein Test: Wer einen davon herausnimmt, merkt es sofort und
nicht erst, wenn ein einziger Angreifer alle drei Nutzer gleichzeitig aussperrt.
"""

import importlib.util
from pathlib import Path

from django.conf import settings

WURZEL = Path(__file__).resolve().parent.parent.parent


def test_ipware_ist_installiert():
    """
    Fehlt django-ipware, liest axes **stillschweigend** nur REMOTE_ADDR und
    ignoriert jede AXES_IPWARE_*-Einstellung. Hinter dem Proxy wäre das die
    Adresse des Proxys — und ein einziger Angreifer sperrte damit alle Nutzer
    gleichzeitig aus. Es gibt dabei keine Fehlermeldung.
    """
    assert importlib.util.find_spec("ipware") is not None, (
        "django-ipware fehlt. Ohne das Paket sind die AXES_IPWARE_*-Einstellungen "
        "unten wirkungslos, ohne dass irgendetwas warnt."
    )


def test_echte_adresse_kommt_aus_x_forwarded_for():
    assert settings.AXES_IPWARE_META_PRECEDENCE_ORDER[0] == "HTTP_X_FORWARDED_FOR"


def test_proxy_count_ist_null():
    """
    Die Zahl zählt Adressen **im Header**, nicht Proxys davor. Caddy schreibt
    genau eine hinein — die des Anrufers. Eine 1 hier würde die falsche Adresse
    nehmen oder gar keine finden.
    """
    assert settings.AXES_IPWARE_PROXY_COUNT == 0


def test_gesperrt_wird_die_kombination_aus_nutzer_und_ip():
    """
    Eine reine Nutzersperre lässt sich missbrauchen, um jemanden gezielt
    auszusperren; eine reine IP-Sperre trifft hinter einem Anschluss alle.
    """
    assert settings.AXES_LOCKOUT_PARAMETERS == [["username", "ip_address"]]
    assert settings.AXES_FAILURE_LIMIT == 5
    assert settings.AXES_COOLOFF_TIME == 1


def test_axes_backend_steht_vor_dem_modelbackend():
    """Sonst prüft Django erst das Passwort und zählt den Versuch danach."""
    backends = settings.AUTHENTICATION_BACKENDS
    assert backends[0] == "axes.backends.AxesStandaloneBackend"
    assert "django.contrib.auth.backends.ModelBackend" in backends[1:]


def test_axes_middleware_steht_ganz_unten():
    assert settings.MIDDLEWARE[-1] == "axes.middleware.AxesMiddleware"


def test_kein_header_up_x_forwarded_for_im_caddyfile():
    """
    Caddy steht als erster Sprung direkt am Internet und hat kein
    `trusted_proxies`. In dem Fall verwirft es einen mitgeschickten
    X-Forwarded-For und setzt nur die echte Adresse des Anrufers — genau das,
    was axes braucht. Caddy warnt beim Reload sogar, wenn die Zeile dasteht.

    Sie wäre außerdem eine Falle für später: `header_up` wird **nach** dieser
    Logik angewandt und gewinnt gegen sie. Käme je ein CDN davor, überschriebe
    sie jede echte Client-Adresse mit der des CDN — und damit träte genau die
    Massensperre ein, die sie verhindern sollte.

    Solange es noch kein Caddyfile gibt, prüft dieser Test nichts. Sobald eines
    dazukommt, greift er von selbst.
    """
    for pfad in WURZEL.rglob("Caddyfile*"):
        if ".venv" in pfad.parts or "node_modules" in pfad.parts:
            continue
        inhalt = pfad.read_text().lower()
        assert "header_up x-forwarded-for" not in inhalt, (
            f"{pfad} setzt X-Forwarded-For selbst. Siehe SERVER.md — direkt am "
            f"Internet nichts setzen; kommt ein Proxy davor, trusted_proxies "
            f"konfigurieren und weiterhin kein header_up."
        )
