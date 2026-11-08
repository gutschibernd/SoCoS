#!/bin/bash
#
# Bringt daten/bisher.json (das Kästchen mit dem Diamanten, socos/bisher.py)
# als SOCOS_BISHER in eine .env — ohne Angabe auf den Server, mit „lokal“ in
# die .env dieses Arbeitsordners.
#
#   skripte/bisher_uebertragen.command          → ssh socos, /opt/socos/.env
#   skripte/bisher_uebertragen.command lokal    → ./.env
#
# Absichtlich nicht in skripte/LIESMICH.md: Die Zahlen sollen nirgends
# vermerkt sein, auch nicht, dass es sie gibt.
#
# Die Zeile geht über stdin an den Server, nicht als Argument: Ein Argument
# stünde in der Prozessliste und in der Shell-Historie der Maschine.

set -euo pipefail
cd "$(dirname "$0")/.."

DATEI=daten/bisher.json
SERVER="${SOCOS_SERVER:-socos}"

[ -f "$DATEI" ] || { echo "$DATEI fehlt." >&2; exit 1; }

# Eine Zeile, in einfachen Anführungszeichen: Docker Compose und
# django-environ nehmen den Inhalt dann wörtlich. Darum darf kein ' darin
# stehen — json.dumps mit ensure_ascii macht aus ä ä, und ein
# Apostroph wird '.
ZEILE="$(python3 - "$DATEI" <<'PY'
import json, sys
daten = json.load(open(sys.argv[1], encoding="utf-8"))
assert str(daten.get("pin", "")).strip(), "pin fehlt"
assert daten.get("posten"), "posten fehlt"
for p in daten["posten"]:
    assert p.get("von") and isinstance(p.get("betrag"), str), f"Posten unvollständig: {p}"
text = json.dumps(daten, separators=(",", ":"), ensure_ascii=True).replace("'", "\\u0027")
print(f"SOCOS_BISHER='{text}'")
PY
)"

# Die alte Zeile raus, die neue dazu — und in dieselbe Datei zurück
# (`cat >`), damit Rechte und Besitzer der .env bleiben, wie sie sind.
ERSETZEN='neu="$(cat)"; rest="$(grep -v "^SOCOS_BISHER=" .env || true)"; printf "%s\n%s\n" "$rest" "$neu" > .env'

if [ "${1:-}" = "lokal" ]; then
    [ -f .env ] || { echo ".env fehlt in $(pwd)." >&2; exit 1; }
    printf '%s\n' "$ZEILE" | bash -c "$ERSETZEN"
    echo "Lokal eingetragen. Django neu starten, damit es die .env neu liest."
else
    # `up -d` legt den Container neu an, weil sich seine Umgebung geändert
    # hat — ein bloßer Neustart läse die .env nicht neu.
    printf '%s\n' "$ZEILE" | ssh "$SERVER" "set -e; cd /opt/socos; [ -f .env ]; $ERSETZEN; docker compose -f betrieb/anwendung.yml up -d anwendung"
    echo "Am Server eingetragen, Anwendung neu angelegt."
fi
