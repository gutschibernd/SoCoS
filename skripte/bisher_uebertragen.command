#!/bin/bash
#
# Spielt daten/bisher.json (die Seite hinter dem Diamanten, socos/bisher.py)
# in die Datenbank ein — ohne Angabe am Server, mit „lokal“ hier.
#
#   skripte/bisher_uebertragen.command          → ssh socos, im Container
#   skripte/bisher_uebertragen.command lokal    → die lokale Datenbank
#
# Am Server erst nach dem Deploy, der `bisher_einspielen` mitbringt.
#
# Absichtlich nicht in skripte/LIESMICH.md: Die Zahlen sollen nirgends
# vermerkt sein, auch nicht, dass es sie gibt.
#
# Die Datei geht über stdin in den Container — kein Zwischenstand in /tmp am
# Server, und nichts davon als Argument in einer Prozessliste.
#
# Nebenbei fällt eine Zeile SOCOS_BISHER aus der .env, falls sie noch dasteht:
# So kamen die Beträge vom 2026-11-09 an für eine Nacht auf den Server, bevor
# sie in die Datenbank zogen. Der Container verliert sie beim nächsten Deploy.

set -euo pipefail
cd "$(dirname "$0")/.."

DATEI=daten/bisher.json
SERVER="${SOCOS_SERVER:-socos}"
ALTE_ZEILE_RAUS='if grep -q "^SOCOS_BISHER=" .env 2>/dev/null; then rest="$(grep -v "^SOCOS_BISHER=" .env)"; printf "%s\n" "$rest" > .env; fi'

[ -f "$DATEI" ] || { echo "$DATEI fehlt." >&2; exit 1; }

if [ "${1:-}" = "lokal" ]; then
    .venv/bin/python manage.py bisher_einspielen --datei "$DATEI"
    bash -c "$ALTE_ZEILE_RAUS"
else
    ssh "$SERVER" "set -e; cd /opt/socos; $ALTE_ZEILE_RAUS; docker compose -f betrieb/anwendung.yml exec -T anwendung python manage.py bisher_einspielen --datei -" < "$DATEI"
fi
