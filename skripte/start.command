#!/bin/bash
#
# SoCoS starten — zum Doppelklicken.
#
# Räumt alte Server ab, bringt Abhängigkeiten und Schema auf Stand und startet
# Django (8003) und Vite (5176). Das Fenster bleibt offen, solange die Server
# laufen; Strg-C oder ein Doppelklick auf stopp.command beendet beide.

set -uo pipefail
source "$(dirname "$0")/gemeinsam.sh"
zur_wurzel

printf "\n%s  SoCoS — Sopharmis Controlling Software%s\n" "$F_TITEL" "$F_AUS"
printf "%s  %s%s\n" "$F_LEISE" "$WURZEL" "$F_AUS"

# --- 1 · Alte Server abräumen ----------------------------------------------
#
# Immer zuerst und immer, auch wenn scheinbar nichts läuft. Ein übriggebliebener
# Server aus einem früheren Lauf liefert alten Code aus, und man sucht den
# Fehler dann in einer Datei, die längst richtig ist.

titel "1 · Alte Server abräumen"
port_freimachen "$DJANGO_PORT" "Django"
port_freimachen "$VITE_PORT" "Vite"
gut "Ports $DJANGO_PORT und $VITE_PORT sind frei"

# --- 2 · Datenbank ----------------------------------------------------------

titel "2 · Datenbank"
if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  melde "PostgreSQL läuft nicht, starte es …"
  brew services start postgresql@16 >/dev/null 2>&1
  if ! warte_auf_port 5432 20; then
    abbrechen "PostgreSQL antwortet nicht auf 5432." \
      "Von Hand versuchen:  brew services start postgresql@16"
  fi
fi
gut "PostgreSQL antwortet"

# --- 3 · Python -------------------------------------------------------------

titel "3 · Python"
[ -f .env ] || abbrechen "Es gibt keine .env." \
  "Anlegen mit:  cp .env.example .env  — dann Werte eintragen (siehe README.md)."

if [ ! -x .venv/bin/python ]; then
  melde "Lege die virtuelle Umgebung an …"
  python3.12 -m venv .venv || abbrechen "python3.12 fehlt." \
    "Installieren mit:  brew install python@3.12"
fi

# Nur nachinstallieren, wenn requirements.txt neuer ist als die letzte
# Installation. Sonst kostet jeder Start eine halbe Minute für nichts.
MARKE=".venv/.stand-requirements"
if [ ! -f "$MARKE" ] || [ requirements.txt -nt "$MARKE" ]; then
  melde "Installiere Python-Abhängigkeiten …"
  .venv/bin/pip install -q --upgrade pip >/dev/null
  .venv/bin/pip install -q -r requirements.txt || abbrechen "pip install ist gescheitert."
  touch "$MARKE"
fi
gut "Umgebung steht"

melde "Wende Migrationen an …"
AUSGABE="$(.venv/bin/python manage.py migrate 2>&1)" \
  || abbrechen "Die Migrationen sind gescheitert." "$AUSGABE"
printf "%s" "$AUSGABE" | grep -q "Applying" && melde "$(printf "%s" "$AUSGABE" | grep -c "Applying") Migration(en) angewandt"
gut "Schema ist auf Stand"

# --- 4 · Frontend -----------------------------------------------------------

titel "4 · Oberfläche"
if [ ! -d frontend/node_modules ] || [ frontend/package-lock.json -nt frontend/node_modules ]; then
  melde "Installiere npm-Pakete …"
  (cd frontend && npm install --silent) || abbrechen "npm install ist gescheitert."
  touch frontend/node_modules
fi
gut "Pakete stehen"

# --- 5 · Starten ------------------------------------------------------------

mkdir -p protokolle
DJANGO_LOG="protokolle/django.log"
VITE_LOG="protokolle/vite.log"

aufraeumen() {
  printf "\n"
  titel "Beende die Server"
  [ -n "${DJANGO_PID:-}" ] && kill "$DJANGO_PID" 2>/dev/null
  [ -n "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null
  sleep 1
  port_freimachen "$DJANGO_PORT" "Django"
  port_freimachen "$VITE_PORT" "Vite"
  gut "Alles beendet"
  printf "\n"
  exit 0
}
trap aufraeumen INT TERM

titel "5 · Server starten"

# Bewusst OHNE --noreload: Django hält Vorlagen im Zwischenspeicher fest und
# wirft ihn nur beim Neustart weg. Mit --noreload bekäme man nach einer
# Änderung an vorlagen/anmelden.html weiter die alte Seite ausgeliefert.
.venv/bin/python manage.py runserver "$DJANGO_PORT" > "$DJANGO_LOG" 2>&1 &
DJANGO_PID=$!

if ! warte_auf_port "$DJANGO_PORT" 25; then
  fehler "Django ist nicht hochgekommen. Die letzten Zeilen aus $DJANGO_LOG:"
  tail -n 25 "$DJANGO_LOG" >&2
  abbrechen "Start abgebrochen."
fi

GESUNDHEIT="$(curl -s "http://127.0.0.1:$DJANGO_PORT/healthz/" 2>&1)"
case "$GESUNDHEIT" in
  *gesund*) gut "Django läuft auf $DJANGO_PORT" ;;
  *) fehler "Django antwortet, ist aber nicht gesund: $GESUNDHEIT"
     tail -n 20 "$DJANGO_LOG" >&2
     abbrechen "Start abgebrochen." ;;
esac

(cd frontend && npm run dev) > "$VITE_LOG" 2>&1 &
VITE_PID=$!

if ! warte_auf_port "$VITE_PORT" 25; then
  fehler "Vite ist nicht hochgekommen. Die letzten Zeilen aus $VITE_LOG:"
  tail -n 25 "$VITE_LOG" >&2
  kill "$DJANGO_PID" 2>/dev/null
  abbrechen "Start abgebrochen."
fi
gut "Vite läuft auf $VITE_PORT"

# --- 6 · Fertig -------------------------------------------------------------

printf "\n%s  Bereit:  http://localhost:%s%s\n" "$F_GUT" "$VITE_PORT" "$F_AUS"
printf "%s  Protokolle: %s und %s%s\n" "$F_LEISE" "$DJANGO_LOG" "$VITE_LOG" "$F_AUS"
printf "%s  Zum Beenden: Strg-C — oder Doppelklick auf stopp.command%s\n\n" \
  "$F_LEISE" "$F_AUS"

# SOCOS_KEIN_BROWSER=1 unterdrückt das Fenster — für Tests und für den Fall,
# dass schon ein Tab offen ist.
[ -z "${SOCOS_KEIN_BROWSER:-}" ] && open "http://localhost:$VITE_PORT" 2>/dev/null

# Offen bleiben, solange einer der beiden lebt. Fällt einer aus, zeigt das
# Skript warum — statt das Fenster kommentarlos zu schließen.
while kill -0 "$DJANGO_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 1
done

printf "\n"

# Wurde von außen beendet (stopp.command, Fenster zu, kill) oder ist etwas
# abgestürzt? Der Unterschied zählt: Bei einem gewollten Ende ist ein roter
# Fehler samt Protokollauszug schlicht falsch — und wer ihn dreimal gesehen
# hat, liest ihn beim echten Absturz nicht mehr.
#
# 143 = SIGTERM, 130 = SIGINT. Beides heißt: jemand hat es abgestellt.
if ! kill -0 "$DJANGO_PID" 2>/dev/null; then
  wait "$DJANGO_PID" 2>/dev/null; ENDE=$?; WER="Django"; WO="$DJANGO_LOG"
else
  wait "$VITE_PID" 2>/dev/null; ENDE=$?; WER="Vite"; WO="$VITE_LOG"
fi

case "$ENDE" in
  0|130|143)
    melde "$WER wurde beendet."
    ;;
  *)
    fehler "$WER ist abgestürzt (Ende-Code $ENDE). Die letzten Zeilen aus $WO:"
    tail -n 25 "$WO" >&2
    ;;
esac
aufraeumen
