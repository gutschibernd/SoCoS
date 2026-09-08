# Betrieb — das Abbild, die zwei Stacks, der Deploy

Alles hier läuft **am Server**, nichts davon lokal. Lokal wird mit
`skripte/start.command` gearbeitet (siehe [../skripte/LIESMICH.md](../skripte/LIESMICH.md)).

| Datei | Was sie ist |
|---|---|
| `Dockerfile` | Zwei Stufen: Oberfläche bauen, dann Anwendung. Node bleibt draußen. |
| `anwendung.yml` | Stack 1 — gunicorn und PostgreSQL. **Veröffentlicht keinen Port.** |
| `proxy.yml` | Stack 2 — Caddy. Hält allein 80 und 443. |
| `Caddyfile` | Der einzige Auftritt: socos.sopharmis.com |
| `eintritt.sh` | Was beim Start des Containers passiert: migrieren, dann gunicorn |
| `gesundheit.sh` | Ein Lebenszeichen, **zwei Aufrufer**: Container-Healthcheck und `deploy.sh` |
| `deploy.sh` | Sichern, ziehen, bauen, starten, nachsehen |

Warum zwei Stacks: Der Proxy gehört **keiner** Anwendung. So können später
weitere Projekte auf dieselbe Maschine, ohne dass ein Deploy von SoCoS ihre
Erreichbarkeit antastet.

## Einmalig, in dieser Reihenfolge

Die Maschine selbst — Firewall, SSH, `ufw`, `fail2ban`,
`unattended-upgrades` — steht in [../SERVER.md](../SERVER.md).

```bash
# 1 · Docker samt compose-Plugin (Ubuntu)
curl -fsSL https://get.docker.com | sh
```

```bash
# 2 · Das gemeinsame Netz. Beide Stacks erwarten es, keiner legt es an —
#     ein Stack, der es anlegte, nähme es beim `down` auch wieder mit.
docker network create proxy-netz
```

```bash
# 3 · Repository und Umgebung
git clone <repo> /opt/socos && cd /opt/socos
cp .env.example .env && chmod 600 .env
```

In der `.env` müssen stehen: ein frischer `DJANGO_SECRET_KEY`
(`python3 -c "import secrets; print(secrets.token_urlsafe(64))"`),
`DJANGO_ALLOWED_HOSTS=socos.sopharmis.com`,
`DJANGO_CSRF_TRUSTED_ORIGINS=https://socos.sopharmis.com` und ein
`POSTGRES_PASSWORD`. `POSTGRES_HOST` und `DJANGO_DEBUG` sind egal — die
setzt `anwendung.yml` selbst, damit eine Vorlage aus der lokalen Welt am
Server nichts anrichten kann.

**Vor Schritt 4 nachsehen, dass der A-Record wirklich schon zeigt.** Caddy
holt beim ersten Start das Zertifikat; Let's Encrypt lässt fünf Fehlschläge
je Stunde und Name zu, danach sitzt man fest.

```bash
# 4 · Anwendung, dann Proxy
betrieb/deploy.sh
docker compose -f betrieb/proxy.yml up -d
```

```bash
# 5 · Konten. Kein Befehl nimmt ein Passwort als Argument — es stünde in der
#     Shell-Historie und in der Prozessliste des Servers.
docker compose -f betrieb/anwendung.yml exec anwendung \
    python manage.py nutzer_anlegen anna@sopharmis.com "Anna Weissenbacher" --rolle bearbeiter
docker compose -f betrieb/anwendung.yml exec anwendung \
    python manage.py nutzer_passwort anna@sopharmis.com
```

## Deployen

```bash
cd /opt/socos && betrieb/deploy.sh
```

Das Skript sichert **zuerst** den laufenden Stand, zieht dann, baut, startet und
sieht nach, ob der Dienst antwortet und `check --deploy` schweigt. Schlägt etwas
fehl, zeigt es den Grund und das Protokoll — und **schlägt bewusst nichts vor,
was Daten anfasst**. Eine Prüfung, die ihren eigenen Fehlschlag nicht von einem
Ausfall unterscheiden kann, darf das nicht.

> **Eine Änderung an `deploy.sh` wirkt erst beim übernächsten Deploy.** Das
> Skript zieht sich selbst mit; der laufende Lauf führt noch die alte Fassung
> zu Ende. Deshalb steht sein Rumpf in einer Gruppe `{ … }`.

Zurück auf einen früheren Stand geht von Hand:

```bash
git log --oneline -5 && git checkout <alter-commit> && betrieb/deploy.sh
```

## Nachsehen

```bash
docker compose -f betrieb/anwendung.yml logs -f --tail 100 anwendung
```

```bash
docker compose -f betrieb/anwendung.yml exec anwendung betrieb/gesundheit.sh
```

```bash
docker compose -f betrieb/proxy.yml logs --tail 50 caddy
```

## Sicherung

`deploy.sh` legt vor jedem Deploy eine an. Von Hand:

```bash
docker compose -f betrieb/anwendung.yml exec anwendung python manage.py sicherung_erstellen
```

```bash
docker compose -f betrieb/anwendung.yml cp anwendung:/anwendung/sicherungen ./sicherungen
```

> **Das Datenbank-Volume ist keine Sicherung.** Es liegt auf derselben Platte
> derselben Maschine. Auch ein Hetzner-Snapshot ist es nur halb: derselbe
> Anbieter, dasselbe Konto. **Kopie außer Haus und Verschlüsselung sind ein
> offener Punkt** — siehe MEMORY.md.

Und: **Ein Restore ohne Test ist kein Backup.** Einmal durchspielen, bevor die
ersten echten Daten drin sind, und das Datum in die Tabelle in SERVER.md.

## Zwei Fallen, die man nicht sieht

**Kein `ports:` in `anwendung.yml`.** Docker schreibt eigene iptables-Regeln und
geht an `ufw` vorbei — ein veröffentlichter Port hinge im offenen Internet, auch
wenn `ufw` ihn sperrt. Daran hängt zusätzlich `SECURE_PROXY_SSL_HEADER`: Wäre
gunicorn direkt erreichbar, könnte jeder `X-Forwarded-Proto` selbst mitschicken
und Django hielte eine unverschlüsselte Anfrage für eine verschlüsselte.

**Das Volume `proxy_caddy-daten` enthält die Zertifikate.** Wer es wegwirft,
holt sich alles neu — und läuft in die Ausstellungsgrenze.

`socos/tests/test_betrieb.py` hält beides und ein paar weitere Zeilen fest,
deren Fehlen man nicht sieht.
