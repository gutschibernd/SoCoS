#!/bin/sh
#
# Lebenszeichen. **Zwei Aufrufer teilen dieses eine Skript** — der
# Container-Healthcheck und `deploy.sh`. Nicht zwei Kopien derselben Zeile.
#
# Der Grund eines Fehlschlags geht nach stderr und wird angezeigt, nie ins
# Leere: Eine Prüfung, die ihren eigenen Fehlschlag nicht von einem Ausfall
# des Dienstes unterscheiden kann, darf keine zerstörenden Befehle nach sich
# ziehen. Ein Deploy-Skript hat auf genau diesem Weg schon einmal zum
# Zurückspielen einer gesunden Anlage geraten.

set -u

port="${SOCOS_PORT:-8000}"

# Der Host muss die öffentliche Domain sein, obwohl wir 127.0.0.1 fragen:
# 127.0.0.1 steht nicht in ALLOWED_HOSTS, und Django antwortete mit 400.
# Genommen wird der erste Eintrag aus ALLOWED_HOSTS — damit die Domain an
# genau einer Stelle steht und nicht hier ein zweites Mal.
domain="$(printf '%s' "${DJANGO_ALLOWED_HOSTS:-}" | cut -d, -f1 | tr -d ' ')"
if [ -z "$domain" ]; then
    echo "Gesundheit: DJANGO_ALLOWED_HOSTS ist leer — ohne Domain gibt es keine Prüfung." >&2
    exit 1
fi

# Gefragt wird von innen, bewusst am Proxy vorbei: Sonst prüfte der Healthcheck
# den Proxy mit und meldete die Anwendung krank, wenn nur das Zertifikat klemmt.
if ! antwort="$(curl -sS --max-time 5 \
        -H "Host: $domain" \
        -w '\n%{http_code}' \
        "http://127.0.0.1:$port/healthz/" 2>&1)"; then
    echo "Gesundheit: keine Antwort — $antwort" >&2
    exit 1
fi

code="$(printf '%s' "$antwort" | tail -n 1)"
rumpf="$(printf '%s' "$antwort" | sed '$d')"

if [ "$code" = "200" ]; then
    exit 0
fi

echo "Gesundheit: HTTP $code — $rumpf" >&2
exit 1
