#!/bin/bash
#
# Gemeinsame Funktionen für die Skripte in diesem Ordner.
#
# Wird von den .command-Dateien eingebunden, nicht selbst aufgerufen.
# Geschrieben für die bash 3.2, die auf macOS liegt — keine assoziativen
# Arrays, kein ${var,,}.

# --- Ports ------------------------------------------------------------------
#
# 8003 und 5176 gehören diesem Projekt. 8000/5173 und 8001/5174 gehören zwei
# anderen Projekten auf derselben Maschine und werden hier **nie** angefasst.
DJANGO_PORT="${DJANGO_PORT:-8003}"
VITE_PORT="${PORT:-5176}"

VERBOTENE_PORTS="8000 8001 5173 5174"

# --- Ausgabe ----------------------------------------------------------------

if [ -t 1 ]; then
  F_TITEL=$'\033[1;36m'; F_GUT=$'\033[0;32m'; F_WARN=$'\033[0;33m'
  F_FEHLER=$'\033[0;31m'; F_LEISE=$'\033[0;90m'; F_AUS=$'\033[0m'
else
  F_TITEL=""; F_GUT=""; F_WARN=""; F_FEHLER=""; F_LEISE=""; F_AUS=""
fi

titel()  { printf "\n%s%s%s\n" "$F_TITEL" "$*" "$F_AUS"; }
melde()  { printf "  %s\n" "$*"; }
gut()    { printf "  %s✓%s %s\n" "$F_GUT" "$F_AUS" "$*"; }
warne()  { printf "  %s!%s %s\n" "$F_WARN" "$F_AUS" "$*"; }

# Der Grund eines Fehlschlags geht nach stderr und wird angezeigt — nie nach
# /dev/null. Eine Prüfung, die ihren eigenen Fehlschlag nicht von einem Ausfall
# unterscheiden kann, darf nichts Zerstörendes vorschlagen.
fehler() { printf "  %s✗%s %s\n" "$F_FEHLER" "$F_AUS" "$*" >&2; }

# Beim Doppelklick verschwindet das Fenster, sobald das Skript endet. Bei einem
# Fehler wäre die Meldung damit weg, bevor sie jemand gelesen hat.
abbrechen() {
  fehler "$1"
  [ -n "$2" ] && printf "\n    %s\n" "$2" >&2
  printf "\n%sZum Schließen Return drücken.%s\n" "$F_LEISE" "$F_AUS"
  read -r _ 2>/dev/null || true
  exit 1
}

# --- Projektwurzel ----------------------------------------------------------
#
# Ein doppelgeklicktes .command startet im Benutzerordner, nicht dort, wo es
# liegt. Ohne diesen Sprung liefe alles im falschen Verzeichnis.
zur_wurzel() {
  cd "$(dirname "${BASH_SOURCE[1]}")/.." || abbrechen "Projektordner nicht gefunden."
  WURZEL="$(pwd)"
}

# --- Prozesse ---------------------------------------------------------------

# Wer hört auf diesem Port?
lauscher() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null; }

# Macht einen Port frei. Zeigt dabei, was beendet wird — ein Skript, das
# stillschweigend Prozesse abräumt, ist beim nächsten Mal nicht mehr zu
# durchschauen.
port_freimachen() {
  local port="$1" was="$2" pids pid name

  for verboten in $VERBOTENE_PORTS; do
    if [ "$port" = "$verboten" ]; then
      abbrechen "Port $port gehört einem anderen Projekt." \
        "Die Skripte hier fassen nur 8003 und 5176 an. Bitte DJANGO_PORT/PORT prüfen."
    fi
  done

  pids="$(lauscher "$port")"
  [ -z "$pids" ] && return 0

  for pid in $pids; do
    name="$(ps -p "$pid" -o comm= 2>/dev/null | sed 's|.*/||')"
    melde "beende $was auf Port $port (${name:-unbekannt}, PID $pid)"
    kill "$pid" 2>/dev/null
  done

  # Bis zu drei Sekunden auf ein sauberes Ende warten, erst dann härter.
  local i=0
  while [ "$i" -lt 30 ] && [ -n "$(lauscher "$port")" ]; do
    sleep 0.1
    i=$((i + 1))
  done
  if [ -n "$(lauscher "$port")" ]; then
    warne "Port $port gibt nicht nach, erzwinge das Ende."
    for pid in $(lauscher "$port"); do kill -9 "$pid" 2>/dev/null; done
    sleep 0.5
  fi
}

# Wartet, bis auf dem Port jemand antwortet. Gibt 1 zurück, wenn nicht.
warte_auf_port() {
  local port="$1" sekunden="${2:-25}" i=0
  while [ "$i" -lt $((sekunden * 10)) ]; do
    [ -n "$(lauscher "$port")" ] && return 0
    sleep 0.1
    i=$((i + 1))
  done
  return 1
}
