# SERVER — Maschine, Netz, Zugänge, wiederkehrende Prüfungen

**Keine Geheimnisse in dieser Datei.** Passwörter, Schlüssel und Tokens stehen in der
`.env` am Server bzw. im Passwortspeicher — nie hier, nie im Repository.

## Stand

**Die VPS existiert noch nicht.** Es wird zuerst lokal gebaut. Dieses Dokument wird
befüllt, sobald die Maschine steht.

## Vorgesehen

| | |
|---|---|
| Anbieter | Hetzner |
| Maschine | offen (Typ, Standort, IP) |
| Betriebssystem | offen |
| Domain | **socos.sopharmis.com** (Subdomain von sopharmis.com) |
| DNS | offen — A-Record auf die VPS, sobald sie steht |
| TLS | Caddy 2, automatisch über Let's Encrypt |

## Netz und Zugang (geplant)

- Cloud-Firewall **vor** der Maschine: nur 22, 80, 443. Zusätzlich `ufw`.

  > **Falle:** Docker schreibt eigene iptables-Regeln und geht an `ufw` vorbei. Ein
  > `ports:` in einer `docker-compose.yml` hängt den Dienst ins offene Internet,
  > auch wenn `ufw` den Port sperrt. Deshalb veröffentlicht der Anwendungs-Stack
  > **keinen einzigen Port**; erreichbar ist er nur über das externe Docker-Netz,
  > an dem der Proxy hängt.

- SSH nur mit Schlüssel. Passwort-Login aus, Root-Login aus. `fail2ban`,
  `unattended-upgrades`.

## Aufbau (geplant)

Zwei getrennte Compose-Stacks:

1. **Anwendung** — gunicorn + PostgreSQL. `COMPOSE_PROJECT_NAME=socos`.
2. **Front-Proxy** — Caddy 2, hält allein 80/443, terminiert TLS, verteilt über ein
   externes Docker-Netz auf den Alias der Anwendung.

Der Proxy gehört **keiner** Anwendung. So können später weitere Projekte dazukommen,
ohne dass ein Deploy von SoCoS ihre Erreichbarkeit antastet.

> **`COMPOSE_PROJECT_NAME=socos` ist nicht optional.** Ein gleicher Name bedeutete
> gemeinsame Volumes und im schlimmsten Fall zwei Anwendungen auf einer Datenbank.

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

Ein Skript, das **zwei Aufrufer teilen** — der Container-Healthcheck und `deploy.sh`.
Nicht zwei Kopien derselben Zeile in zwei Dateien.

- Fragt von innen: `127.0.0.1:8000/healthz/`, bewusst am Proxy vorbei.
- Setzt dabei den `Host` auf die öffentliche Domain. **Sonst antwortet Django mit
  400**, weil `127.0.0.1` nicht in `ALLOWED_HOSTS` steht.
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
