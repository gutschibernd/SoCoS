#!/bin/bash
#
# Alle Tests — zum Doppelklicken.
#
# Beide Läufer, immer zusammen. Ein Frontend-Testläufer, den man einzeln
# aufrufen muss, wird nicht aufgerufen.

set -uo pipefail
source "$(dirname "$0")/gemeinsam.sh"
zur_wurzel

printf "\n%s  SoCoS — Tests%s\n" "$F_TITEL" "$F_AUS"

[ -x .venv/bin/pytest ] || abbrechen "Die virtuelle Umgebung fehlt." \
  "Einmal skripte/start.command doppelklicken — das legt sie an."

PROBLEME=0

titel "1 · Python (pytest)"
.venv/bin/pytest || PROBLEME=1

titel "2 · Oberfläche (vitest)"
(cd frontend && npm test) || PROBLEME=1

titel "3 · Typen (tsc)"
(cd frontend && npx tsc -b) && gut "keine Typfehler" || PROBLEME=1

# Prüft, was nur in Produktion gilt: HTTPS-Redirect, HSTS, sichere Cookies.
# Die Ausgabe muss leer sein und leer bleiben.
titel "4 · Produktionsprüfung (check --deploy)"
DJANGO_DEBUG=0 DJANGO_ALLOWED_HOSTS=socos.sopharmis.com \
  .venv/bin/python manage.py check --deploy || PROBLEME=1

printf "\n"
if [ "$PROBLEME" -eq 0 ]; then
  printf "%s  Alles grün.%s\n\n" "$F_GUT" "$F_AUS"
else
  printf "%s  Mindestens ein Lauf ist gescheitert — siehe oben.%s\n\n" "$F_FEHLER" "$F_AUS"
fi

printf "%sZum Schließen Return drücken.%s\n" "$F_LEISE" "$F_AUS"
read -r _ 2>/dev/null || true
exit "$PROBLEME"
