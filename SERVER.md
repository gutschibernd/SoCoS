# SERVER — Maschine, Netz, Zugänge, wiederkehrende Prüfungen

**Keine Geheimnisse in dieser Datei.** Passwörter, Schlüssel und Tokens stehen in der
`.env` am Server bzw. im Passwortspeicher — nie hier, nie im Repository.

## Stand

**Die Maschine läuft.** Sie trägt den Testauftritt; eine getrennte Maschine für den
echten Betrieb gibt es noch nicht.

| | |
|---|---|
| Anbieter | Hetzner |
| Maschine | `ubuntu-4gb-fsn1-1`, Falkenstein, 4 GB RAM, 38 GB |
| IP | 128.140.115.157 |
| Betriebssystem | Ubuntu 26.04 LTS |
| Domain | **socos.test.sopharmis.com** (Subdomain von sopharmis.com) |
| DNS | Cloudflare, A-Record auf 128.140.115.157, **grau (DNS only)** |
| TLS | Caddy 2, automatisch über Let's Encrypt |
| Zugang | `ssh socos` (Eintrag in `~/.ssh/config`), Schlüssel `id_ed25519` |

### Warum der DNS-Eintrag grau sein muss

Cloudflares Universal SSL deckt nur **eine** Subdomain-Ebene ab — `*.sopharmis.com`,
nicht `socos.test.sopharmis.com`. Orange geschaltet scheitert am Rand schon der
TLS-Handshake, und die HTTP-01-Prüfung von Let's Encrypt läuft in Cloudflares
Umleitung statt zu Caddy. Orange ginge nur mit Advanced Certificate Manager
(kostenpflichtig) — und brächte dann die CDN-Falle aus dem Caddyfile-Abschnitt mit:
ohne `trusted_proxies` sähe django-axes nur noch Cloudflare-Adressen und sperrte bei
einem Angriff alle Nutzer zugleich aus.

## Netz und Zugang

- Cloud-Firewall **vor** der Maschine: nur 22, 80, 443. Zusätzlich `ufw`.

  > **Falle:** Docker schreibt eigene iptables-Regeln und geht an `ufw` vorbei. Ein
  > `ports:` in einer `docker-compose.yml` hängt den Dienst ins offene Internet,
  > auch wenn `ufw` den Port sperrt. Deshalb veröffentlicht der Anwendungs-Stack
  > **keinen einzigen Port**; erreichbar ist er nur über das externe Docker-Netz,
  > an dem der Proxy hängt.

- SSH nur mit Schlüssel. Passwort-Login aus, Root-Login aus. `fail2ban`,
  `unattended-upgrades`.

## Aufbau

Läuft seit 9. September 2026 am Server. Alles unter `betrieb/`, Anleitung in
[betrieb/LIESMICH.md](betrieb/LIESMICH.md).

Zwei getrennte Compose-Stacks:

1. **Anwendung** — `betrieb/anwendung.yml`: gunicorn + PostgreSQL.
2. **Front-Proxy** — `betrieb/proxy.yml`: Caddy 2, hält allein 80/443, terminiert
   TLS, verteilt über das externe Netz `proxy-netz` auf den Alias `socos`.

Der Proxy gehört **keiner** Anwendung. So können später weitere Projekte dazukommen,
ohne dass ein Deploy von SoCoS ihre Erreichbarkeit antastet.

`proxy-netz` wird **einmal von Hand** angelegt (`docker network create proxy-netz`)
und gehört keinem Stack. Ein Stack, der es anlegte, nähme es beim `down` mit — und
risse damit das andere Projekt vom Netz.

> **Der Projektname ist nicht optional.** Ein gleicher Name bedeutete gemeinsame
> Volumes und im schlimmsten Fall zwei Anwendungen auf einer Datenbank. Er steht
> deshalb als `name: socos` **in der Compose-Datei** und nicht als
> `COMPOSE_PROJECT_NAME` in einer Umgebung: In der Datei kann er nicht vergessen
> werden, in einer Sitzung schon.

### Was die Compose-Datei gegen die `.env` erzwingt

`POSTGRES_HOST: datenbank` und `DJANGO_DEBUG: "0"` stehen als `environment:` und
gewinnen damit gegen `env_file`. Beides sind Notbremsen: Die `.env`-Vorlage stammt
aus der lokalen Welt und zeigt auf `127.0.0.1` — im Container wäre das der Container
selbst; und eine vergessene `DJANGO_DEBUG=1` nähme jede Produktionshärtung zurück
und schriebe Einstellungen samt Datenbankpasswort in jede Fehlerseite.

### Caddyfile

**Im Caddyfile steht *kein* `header_up X-Forwarded-For`.**

Caddy steht als erster Sprung direkt am Internet und hat kein `trusted_proxies`; in
dem Fall verwirft es einen vom Anrufer mitgeschickten Header und setzt nur dessen
echte Adresse. Die Voreinstellung leistet damit schon genau das, was django-axes
braucht — Caddy warnt beim Reload sogar, wenn die Zeile dasteht.

Sie wäre zudem eine Falle für später: `header_up` wird **nach** dieser Logik
angewandt und gewinnt gegen sie. Käme je ein CDN davor, überschriebe sie jede echte
Client-Adresse mit der des CDN — und dann sperrte ein einziger Angreifer alle Nutzer
gleichzeitig aus.

**Regel:** direkt am Internet nichts setzen; kommt ein Proxy davor,
`trusted_proxies` konfigurieren und weiterhin kein `header_up`.

## Healthcheck

`betrieb/gesundheit.sh` — ein Skript, das **zwei Aufrufer teilen**: der
Container-Healthcheck und `deploy.sh`. Nicht zwei Kopien derselben Zeile in zwei
Dateien.

- Fragt von innen: `127.0.0.1:8000/healthz/`, bewusst am Proxy vorbei.
- Setzt dabei den `Host` auf die öffentliche Domain. **Sonst antwortet Django mit
  400**, weil `127.0.0.1` nicht in `ALLOWED_HOSTS` steht. Genommen wird der erste
  Eintrag aus `DJANGO_ALLOWED_HOSTS` — damit die Domain nicht ein zweites Mal
  irgendwo steht.
- Der Endpunkt ist vom HTTPS-Redirect **ausgenommen**. Sonst bekäme der Healthcheck
  eine 301 und der Dienst gälte dauerhaft als krank.
- Der Grund eines Fehlschlags geht nach **stderr und wird angezeigt**, nie nach
  `/dev/null`.

  > **Warum das wichtig ist:** Eine Prüfung, die ihren eigenen Fehlschlag nicht von
  > einem Ausfall unterscheiden kann, darf keine zerstörenden Befehle vorschlagen.
  > Ein Deploy-Skript hat auf genau diesem Weg schon einmal zum `pg_restore` einer
  > gesunden Anlage geraten.

## Sicherung

| | |
|---|---|
| Lokales Archiv | `python manage.py sicherung_erstellen` — Datenbank und Medien in **einer** Datei |
| Kopie außer Haus | **offen** — Ziel und Verschlüsselung noch zu entscheiden |
| Verschlüsselung | **offen** — bei Personendaten wäre „ja" die Antwort; dann braucht der Schlüssel einen Ort außerhalb desselben Archivs |

### Restore-Tests

**Ein Restore ohne Test ist kein Backup.**

| Datum | Von welchem Archiv | Ergebnis | Wer |
|---|---|---|---|
| — | — | noch keiner durchgeführt | — |

## Wiederkehrende Prüfungen

| Wie oft | Was |
|---|---|
| bei jedem Deploy | `manage.py check --deploy` ist leer |
| bei jedem Deploy | Healthcheck antwortet mit 200 |
| monatlich | Restore-Test, Ergebnis oben eintragen |
| monatlich | `unattended-upgrades` hat gelaufen, Neustart nötig? |
| quartalsweise | SSH-Schlüssel durchsehen, ausgeschiedene entfernen |
