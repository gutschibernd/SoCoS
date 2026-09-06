# SoCoS — Sopharmis Controlling Software

Projektsteuerung, Kontaktverwaltung und Zeiterfassung für Sopharmis.
Drei Nutzer, interne Anwendung, keine öffentliche Registrierung.

Django 5 + DRF unter `/api/`, gebaute React-Anwendung (Vite) unter `/`.
Ein Dienst, ein Ursprung, kein CORS. PostgreSQL 16.

> Regeln und Fallen: [CLAUDE.md](CLAUDE.md) · Entscheidungen: [MEMORY.md](MEMORY.md) ·
> Maschine und Zugänge: [SERVER.md](SERVER.md)

## Lokal einrichten

Voraussetzungen: Python 3.12, Node 20+, PostgreSQL 16 (Homebrew).

```bash
# 1 · Datenbank anlegen
createuser socos --pwprompt
createdb socos --owner socos

# 2 · Python
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3 · Umgebung
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"   # in .env eintragen

# 4 · Schema
python manage.py migrate

# 5 · Frontend
cd frontend && npm install && cd ..
```

## Lokal starten

Zwei Terminals.

```bash
source .venv/bin/activate && python manage.py runserver 8003
```

```bash
cd frontend && npm run dev
```

Die Anwendung liegt dann auf **http://localhost:5176**. Vite reicht `/api/` an
Django auf **8003** weiter.

> **Ports:** 8000/5173 und 8001/5174 gehören zwei anderen Projekten auf derselben
> Maschine. Ein Vite auf fremdem Port, dessen Proxy noch auf den Hauptport zeigt,
> mischt zwei Zweige in einer Ansicht — und das sieht man nicht.

## Konten anlegen

Es gibt kein Selbstregistrieren. Konten legt ein Administrator an — **ohne**
Passwort; gesetzt wird es danach in einem eigenen Schritt.

```bash
python manage.py nutzer_anlegen anna@sopharmis.com "Anna Weissenbacher" --rolle bearbeiter
python manage.py nutzer_passwort anna@sopharmis.com
```

`nutzer_passwort` fragt das Passwort interaktiv ab. **Kein Befehl nimmt ein Passwort
als Argument entgegen** — das stünde in der Shell-Historie und in der Prozessliste
des Servers.

Rollen: `admin` · `bearbeiter` · `leser` (siehe MEMORY.md).

## Tests

```bash
source .venv/bin/activate && pytest
```

```bash
cd frontend && npm test
```

Beide Läufer gehören zu jedem Commit. Ein Frontend-Testläufer, der erst später
eingeführt wird, wird nie eingeführt — und die erste Rechenfunktion im Frontend
bleibt ungeprüft.

Vor einem Deploy zusätzlich:

```bash
DJANGO_DEBUG=0 python manage.py check --deploy
```

Die Ausgabe muss leer sein und leer bleiben. Jede bewusst stillgelegte Warnung wird
im Code begründet.

## Sicherung

```bash
python manage.py sicherung_erstellen            # eine Datei: Datenbank + Medien
python manage.py sicherung_einspielen <datei>   # spielt sie zurück
```

**Wer etwas Neues baut, das gespeichert wird, sorgt im selben Commit dafür, dass es
im Archiv landet.** Ein Export, der die Hälfte mitnimmt, ist schlimmer als keiner —
der Verlust fällt erst beim Wiederherstellen auf.

## Deploy

Kommt, sobald die VPS steht. Siehe [SERVER.md](SERVER.md).

Vorgesehen: zwei getrennte Compose-Stacks — die Anwendung (gunicorn + db) und ein
Front-Proxy (Caddy 2), der allein 80/443 hält. Die Anwendung veröffentlicht keinen
einzigen Port.

> **Eine Änderung an `deploy.sh` wirkt erst beim übernächsten Deploy.** Das Skript
> zieht sich selbst mit; deshalb steht sein ganzer Rumpf in einer Gruppe `{ … }`,
> die bash vollständig einlesen muss, bevor sie läuft.
