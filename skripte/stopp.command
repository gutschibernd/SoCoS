#!/bin/bash
#
# SoCoS beenden — zum Doppelklicken.
#
# Beendet Django (8003) und Vite (5176). Fasst die Ports der beiden anderen
# Projekte auf dieser Maschine nicht an.

set -uo pipefail
source "$(dirname "$0")/gemeinsam.sh"
zur_wurzel

printf "\n%s  SoCoS beenden%s\n" "$F_TITEL" "$F_AUS"

titel "Server abräumen"
LIEF=0
[ -n "$(lauscher "$DJANGO_PORT")" ] && LIEF=1
[ -n "$(lauscher "$VITE_PORT")" ] && LIEF=1

port_freimachen "$DJANGO_PORT" "Django"
port_freimachen "$VITE_PORT" "Vite"

if [ "$LIEF" -eq 1 ]; then
  gut "Django und Vite sind beendet"
else
  gut "Es lief nichts auf $DJANGO_PORT oder $VITE_PORT"
fi

# PostgreSQL bleibt bewusst laufen. Es ist ein Dienst der Maschine, kein Teil
# dieses Projekts — und die beiden anderen Projekte hängen ebenfalls daran.
printf "\n%s  PostgreSQL läuft weiter (gehört der Maschine, nicht diesem Projekt).%s\n\n" \
  "$F_LEISE" "$F_AUS"

sleep 1
