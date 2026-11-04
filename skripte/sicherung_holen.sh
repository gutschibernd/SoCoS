#!/bin/bash
#
# Die Kopie außer Haus: holt eine frische Sicherung vom Server und legt sie in
# Synology Drive ab. Läuft über launchd alle zwei Stunden an, tut aber nur
# etwas, wenn die letzte Kopie dort älter als eine Woche ist.
#
# **Warum alle zwei Stunden und nicht einmal die Woche zu einer festen
# Uhrzeit:** Ein Laptop ist zu der Uhrzeit oft zu, und launchd holt einen
# verpassten Termin nur nach, wenn der Rechner schlief — nicht, wenn er aus
# war. So entscheidet das Alter der letzten Kopie, nicht der Kalender. Ein
# Lauf, der nichts zu tun hat, endet nach einem `find`.
#
# **Warum eine frische Sicherung statt der letzten vom Server:** Die tägliche
# am Server kann seit Tagen scheitern, ohne dass es jemand sieht. Eine, die
# eigens für diese Kopie geschrieben wird, prüft den Weg jedesmal ganz.
#
# Eingerichtet wird das mit `sicherung_einrichten.command`, das dieses Skript
# außerhalb von ~/Documents ablegt — siehe dort, warum.
#
# Aufruf von Hand:  sicherung_holen.sh --jetzt   (holt, egal wie alt die letzte ist)
#
# Geschrieben für die bash 3.2 von macOS.

set -euo pipefail

ZIEL="${SOCOS_SICHERUNG_ZIEL:-$HOME/Library/CloudStorage/SynologyDrive-Sopharmis/00_Managment/SoCoS-Sicherungen}"
TAGE="${SOCOS_SICHERUNG_TAGE:-7}"
SERVER="${SOCOS_SICHERUNG_SERVER:-socos}"
ANWENDUNG="cd /opt/socos && docker compose -f betrieb/anwendung.yml exec -T anwendung"

# Ein Fehler wird höchstens einmal am Tag gemeldet. Ohne Netz scheitert jeder
# Lauf, und alle zwei Stunden dieselbe Meldung wird bald nicht mehr gelesen.
MERKER="$HOME/Library/Logs/SoCoS-Sicherung.gemeldet"

zeit()   { date "+%Y-%m-%d %H:%M:%S"; }
notiz()  { printf "%s  %s\n" "$(zeit)" "$*"; }

melden() {
  # $1 = Titel, $2 = Text. Ein Hinweis in der Mitteilungszentrale.
  # Doppelte Anführungszeichen im Text (etwa aus einer Meldung des Servers)
  # beendeten die AppleScript-Zeichenkette — der Hinweis bliebe dann einfach aus.
  local einfach="'"
  local text="${2//\"/$einfach}"
  osascript -e "display notification \"$text\" with title \"$1\"" >/dev/null 2>&1 || true
}

fehler() {
  notiz "FEHLER: $*"
  if [ "$(cat "$MERKER" 2>/dev/null || true)" != "$(date +%F)" ]; then
    melden "SoCoS-Sicherung gescheitert" "$*"
    date +%F > "$MERKER"
  fi
  exit 1
}

# --- Ist etwas zu tun? ------------------------------------------------------

# Fehlt der Ordner darüber, ist Synology Drive nicht eingebunden. Dann wird
# nichts angelegt: Ein Ordner, den Synology nicht kennt, sähe aus wie eine
# Kopie außer Haus und läge doch nur auf dieser Platte.
[ -d "$(dirname "$ZIEL")" ] || fehler "Synology Drive ist nicht eingebunden ($(dirname "$ZIEL") fehlt)."
mkdir -p "$ZIEL"

if [ "${1:-}" != "--jetzt" ]; then
  if [ -n "$(find "$ZIEL" -maxdepth 1 -name 'socos-*.tar.gz' -mtime "-$TAGE" -print -quit)" ]; then
    exit 0
  fi
fi

notiz "Hole eine frische Sicherung von $SERVER …"

# BatchMode: Fragt ssh nach etwas (Passwort, unbekannter Schlüssel), soll der
# Lauf scheitern statt im Hintergrund ewig zu warten.
ssh_() { ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVER" "$@"; }

# --- Am Server schreiben ----------------------------------------------------

ausgabe="$(ssh_ "$ANWENDUNG python manage.py sicherung_erstellen --no-color" 2>&1)" \
  || fehler "Der Server hat keine Sicherung geschrieben: $(printf '%s' "$ausgabe" | tail -1)"

# Erste Zeile: "<pfad>  (<größe> kB)"
pfad="$(printf '%s\n' "$ausgabe" | head -1 | awk '{print $1}')"
case "$pfad" in
  /anwendung/sicherungen/socos-*.tar.gz) ;;
  *) fehler "Unerwartete Antwort vom Server: $(printf '%s' "$ausgabe" | head -1)" ;;
esac
name="$(basename "$pfad")"

# --- Herunterholen und prüfen -----------------------------------------------

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

ssh_ "$ANWENDUNG cat '$pfad'" > "$tmp/$name" \
  || fehler "Das Archiv ließ sich nicht herunterladen."

soll="$(ssh_ "$ANWENDUNG sha256sum '$pfad'" | awk '{print $1}')" \
  || fehler "Die Prüfsumme am Server ließ sich nicht lesen."
ist="$(shasum -a 256 "$tmp/$name" | awk '{print $1}')"
[ -n "$soll" ] && [ "$soll" = "$ist" ] \
  || fehler "Das heruntergeladene Archiv weicht vom Original ab (Prüfsumme)."

# Dieselbe Prüfung wie beim Einspielen: Ohne datenbank.json ist es keins.
tar -tzf "$tmp/$name" 2>/dev/null | grep -qx 'datenbank.json' \
  || fehler "Das Archiv enthält kein datenbank.json."

# --- Ablegen ----------------------------------------------------------------

# Erst unter einem Zwischennamen in den Ordner, dann umbenennen: Ein
# Umbenennen ist ein Schritt, ein Kopieren nicht. Synology soll nie eine halb
# geschriebene Datei als Sicherung hochladen.
cp "$tmp/$name" "$ZIEL/.$name.teil" || fehler "Ablegen in $ZIEL gescheitert."
mv "$ZIEL/.$name.teil" "$ZIEL/$name"

groesse="$(du -h "$ZIEL/$name" | awk '{print $1}')"
notiz "Abgelegt: $ZIEL/$name ($groesse)"
rm -f "$MERKER"
melden "SoCoS-Sicherung abgelegt" "$name ($groesse) liegt in Synology Drive."
