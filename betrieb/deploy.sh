#!/usr/bin/env bash
#
# Deploy. Wird am Server im Projektordner aufgerufen: betrieb/deploy.sh
#
# **Der ganze Rumpf steht in einer Gruppe { … }, und das ist der Grund:**
# Das Skript zieht sich mit `git pull` selbst mit. Bash liest eine Skriptdatei
# aber häppchenweise und merkt sich dabei die Byte-Position. Ohne die Klammer
# liefe nach dem Ziehen die *neue* Datei ab der alten Position weiter —
# mitten in einem Wort. Die Klammer zwingt bash, alles vorher einzulesen.
#
# Folge davon: **Eine Änderung an dieser Datei wirkt erst beim übernächsten
# Deploy.** Der laufende Deploy führt noch die alte Fassung zu Ende.

{
set -euo pipefail

wurzel="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$wurzel"

stack=(docker compose -f betrieb/anwendung.yml)

schritt()  { printf '\n\033[1m» %s\033[0m\n' "$*"; }
hinweis()  { printf '  %s\n' "$*"; }
abbruch()  { printf '\n\033[31mAbbruch: %s\033[0m\n' "$*" >&2; }

# --- Vorbedingungen --------------------------------------------------------

if [ ! -f .env ]; then
    abbruch ".env fehlt. Sie gehört auf den Server, nie ins Repository."
    exit 1
fi

# --- Sicherung, bevor irgendetwas angefasst wird ---------------------------
#
# Vor dem `git pull`, nicht danach: Gesichert werden soll der Stand, der
# gerade läuft — samt dem Schema, zu dem er gehört.

schritt "Sicherung des laufenden Standes"
if [ -n "$("${stack[@]}" ps --status running -q anwendung 2>/dev/null)" ]; then
    "${stack[@]}" exec -T anwendung python manage.py sicherung_erstellen
else
    hinweis "Keine laufende Anwendung — nichts zu sichern (erster Deploy?)."
fi

# --- Stand holen und bauen -------------------------------------------------

schritt "Stand holen"
git pull --ff-only

schritt "Abbild bauen"
"${stack[@]}" build

schritt "Starten"
"${stack[@]}" up -d

# --- Nachsehen, ob es wirklich läuft ---------------------------------------

schritt "Warten, bis der Dienst antwortet"
gesund=0
for _ in $(seq 1 60); do
    if "${stack[@]}" exec -T anwendung betrieb/gesundheit.sh >/dev/null 2>&1; then
        gesund=1
        break
    fi
    sleep 2
done

if [ "$gesund" -ne 1 ]; then
    abbruch "Der Dienst antwortet nach zwei Minuten nicht."
    # Den Grund zeigen, nicht verschlucken. Erst der Healthcheck selbst, dann
    # das Protokoll — bei einem Container, der gar nicht erst hochkommt,
    # scheitert schon das exec, und dann steht die Antwort im Protokoll.
    "${stack[@]}" exec -T anwendung betrieb/gesundheit.sh || true
    "${stack[@]}" logs --tail 50 anwendung >&2 || true
    cat >&2 <<'HINWEIS'

  Diese Prüfung weiß nicht, *warum* nichts antwortet. Sie unterscheidet einen
  kaputten Start nicht von einem Netzproblem — deshalb steht hier kein Befehl,
  der etwas zurückspielt oder löscht. Erst das Protokoll lesen.

  Zurück auf den vorherigen Stand geht es von Hand:
      git log --oneline -5
      git checkout <alter-commit> && betrieb/deploy.sh
HINWEIS
    exit 1
fi

schritt "check --deploy"
ausgabe="$("${stack[@]}" exec -T anwendung python manage.py check --deploy 2>&1)"
if ! printf '%s' "$ausgabe" | grep -q "identified no issues"; then
    abbruch "check --deploy meldet etwas."
    printf '%s\n' "$ausgabe" >&2
    exit 1
fi
hinweis "$ausgabe"

schritt "Fertig."
hinweis "Sicherungen liegen im Volume socos_sicherungen."
hinweis "Herausholen:  ${stack[*]} cp anwendung:/anwendung/sicherungen ./sicherungen"
}
