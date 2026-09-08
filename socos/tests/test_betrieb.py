"""
Der Deploy-Stack, soweit er sich ohne Docker prüfen lässt.

Was hier steht, sind die Zeilen, deren **Fehlen** man nicht sieht: ein
veröffentlichter Port, eine mitkopierte .env, ein DEBUG=1, das durchrutscht.
Sie fallen erst am Server auf, und dort fallen sie teuer auf.

Kein Test hier ersetzt einen echten Bau. Sie halten nur fest, was beim
Umbauen leise verlorengehen kann.
"""

from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent.parent
BETRIEB = WURZEL / "betrieb"


def lies(name: str) -> str:
    return (BETRIEB / name).read_text(encoding="utf-8")


def test_der_anwendungsstack_veroeffentlicht_keinen_port():
    """
    Docker schreibt eigene iptables-Regeln und geht an ufw vorbei: ein
    `ports:` hier hinge den Dienst ins offene Internet, auch wenn ufw den Port
    sperrt. Daran hängt zusätzlich SECURE_PROXY_SSL_HEADER — wäre gunicorn
    direkt erreichbar, könnte jeder `X-Forwarded-Proto: https` selbst setzen.
    """
    assert "ports:" not in lies("anwendung.yml"), (
        "betrieb/anwendung.yml veröffentlicht einen Port. Erreichbar sein darf "
        "die Anwendung nur über proxy-netz."
    )


def test_der_projektname_steht_in_der_datei():
    """
    Ohne ihn leitet Compose den Namen vom Ordner ab. Zwei Projekte mit gleichem
    Namen teilten sich die Volumes — im schlimmsten Fall zwei Anwendungen auf
    einer Datenbank.
    """
    assert "\nname: socos\n" in lies("anwendung.yml")


def test_datenbankhost_und_debug_werden_erzwungen():
    """
    Beides gewinnt gegen die .env. Die .env-Vorlage zeigt auf 127.0.0.1 — im
    Container wäre das der Container selbst; und eine vergessene DEBUG=1 nähme
    jede Produktionshärtung zurück.
    """
    inhalt = lies("anwendung.yml")
    assert "POSTGRES_HOST: datenbank" in inhalt
    assert 'DJANGO_DEBUG: "0"' in inhalt


def test_die_datenbank_haengt_nicht_am_internet():
    inhalt = lies("anwendung.yml")
    assert "internal: true" in inhalt


def test_geheimnisse_und_personendaten_bleiben_aus_dem_abbild():
    """
    Ein Abbild wird kopiert und weitergereicht, und jede Schicht bleibt darin
    lesbar. Was einmal drinsteht, holt kein späteres Löschen mehr heraus.
    """
    ignoriert = (WURZEL / ".dockerignore").read_text(encoding="utf-8")
    for eintrag in ("daten/", ".env"):
        assert eintrag in ignoriert, f".dockerignore lässt {eintrag} ins Abbild."

    dockerfile = lies("Dockerfile")
    assert "COPY .env" not in dockerfile


def test_healthcheck_und_deploy_teilen_ein_skript():
    """
    Zwei Kopien derselben Zeile driften auseinander, und die eine merkt es
    nicht. Beide Aufrufer zeigen deshalb auf betrieb/gesundheit.sh.
    """
    assert (BETRIEB / "gesundheit.sh").exists()
    assert "gesundheit.sh" in lies("Dockerfile")
    assert "gesundheit.sh" in lies("deploy.sh")


def test_der_healthcheck_setzt_den_host_und_schweigt_nicht():
    """
    Ohne den Host antwortet Django mit 400 (127.0.0.1 steht nicht in
    ALLOWED_HOSTS). Und ein Grund, der nach /dev/null geht, macht aus jedem
    Fehlschlag einen Ausfall — auf dem Weg hat ein Deploy-Skript schon einmal
    zum Zurückspielen einer gesunden Anlage geraten.
    """
    inhalt = lies("gesundheit.sh")
    assert '-H "Host: $domain"' in inhalt
    assert ">&2" in inhalt
    assert "/dev/null" not in inhalt


def test_deploy_sichert_vor_dem_ziehen():
    """
    Gesichert gehört der Stand, der gerade läuft — samt dem Schema, zu dem er
    gehört. Nach dem `git pull` wäre es der neue.
    """
    zeilen = lies("deploy.sh").splitlines()
    # Gesucht sind die Befehlszeilen, nicht die Kommentare darüber: Der Kopf
    # des Skripts erklärt das `git pull` schon, bevor es aufgerufen wird.
    befehle = [z.strip() for z in zeilen if not z.strip().startswith("#")]
    sicherung = next(i for i, z in enumerate(befehle) if "sicherung_erstellen" in z)
    ziehen = next(i for i, z in enumerate(befehle) if z.startswith("git pull"))
    assert sicherung < ziehen


def test_deploy_rumpf_steht_in_einer_gruppe():
    """
    Das Skript zieht sich selbst mit. Bash liest eine Datei häppchenweise und
    merkt sich die Byte-Position; ohne die Klammer liefe nach dem Ziehen die
    neue Datei ab der alten Position weiter — mitten in einem Wort.
    """
    zeilen = [z for z in lies("deploy.sh").splitlines() if z.strip()]
    assert "{" in zeilen, "Der Rumpf von deploy.sh steht in keiner Gruppe { … }."
    assert zeilen[-1] == "}"
    assert zeilen.index("{") < zeilen.index("set -euo pipefail")


def test_deploy_schlaegt_bei_fehlschlag_nichts_zerstoerendes_vor():
    """
    Eine Prüfung, die ihren eigenen Fehlschlag nicht von einem Ausfall
    unterscheiden kann, darf keinen Befehl vorschlagen, der Daten anfasst.
    """
    inhalt = lies("deploy.sh")
    for verboten in ("pg_restore", "down -v", "sicherung_einspielen", "volume rm"):
        assert verboten not in inhalt, (
            f"deploy.sh nennt `{verboten}`. Bei einem unklaren Fehlschlag ist "
            f"das ein Rat, der eine gesunde Anlage zerstört."
        )
