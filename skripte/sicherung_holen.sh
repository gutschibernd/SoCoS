#!/bin/bash
#
# Die Kopie außer Haus: holt eine frische Sicherung vom Server und legt sie in
# Synology Drive ab — von SoCoS und von der SQLite-Datei des Assistenten. Läuft über launchd alle zwei Stunden an, tut aber nur
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
ASSISTENT_ORDNER="/opt/socos-assistent"

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

# Zwei Teile mit je eigener Frist: SoCoS und die SQLite-Datei des Assistenten
# (Repository socos-assistent). **Getrennt, damit ein gescheiterter Teil nicht
# eine Woche liegen bleibt** — gälte die Frist für beide gemeinsam, hielte eine
# frische SoCoS-Kopie den nächsten Versuch für den Assistenten auf.
socos_faellig=1
assistent_faellig=1
if [ "${1:-}" != "--jetzt" ]; then
  [ -n "$(find "$ZIEL" -maxdepth 1 -name 'socos-*.tar.gz' -mtime "-$TAGE" -print -quit)" ] && socos_faellig=0
  [ -n "$(find "$ZIEL" -maxdepth 1 -name 'assistent-*.sqlite3' -mtime "-$TAGE" -print -quit)" ] && assistent_faellig=0
  if [ "$socos_faellig" = 0 ] && [ "$assistent_faellig" = 0 ]; then
    exit 0
  fi
fi

# BatchMode: Fragt ssh nach etwas (Passwort, unbekannter Schlüssel), soll der
# Lauf scheitern statt im Hintergrund ewig zu warten.
ssh_() { ssh -o BatchMode=yes -o ConnectTimeout=20 "$SERVER" "$@"; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Erst unter einem Zwischennamen in den Ordner, dann umbenennen: Ein
# Umbenennen ist ein Schritt, ein Kopieren nicht. Synology soll nie eine halb
# geschriebene Datei als Sicherung hochladen.
ablegen() {
  cp "$tmp/$1" "$ZIEL/.$1.teil" || fehler "Ablegen in $ZIEL gescheitert."
  mv "$ZIEL/.$1.teil" "$ZIEL/$1"
}

socos_holen() {
  notiz "Hole eine frische Sicherung von $SERVER …"

  # --- Am Server schreiben --------------------------------------------------

  ausgabe="$(ssh_ "$ANWENDUNG python manage.py sicherung_erstellen --no-color" 2>&1)" \
    || fehler "Der Server hat keine Sicherung geschrieben: $(printf '%s' "$ausgabe" | tail -1)"

  # Erste Zeile: "<pfad>  (<größe> kB)"
  pfad="$(printf '%s\n' "$ausgabe" | head -1 | awk '{print $1}')"
  case "$pfad" in
    /anwendung/sicherungen/socos-*.tar.gz) ;;
    *) fehler "Unerwartete Antwort vom Server: $(printf '%s' "$ausgabe" | head -1)" ;;
  esac
  name="$(basename "$pfad")"

  # --- Herunterholen und prüfen ---------------------------------------------

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

  # --- Ablegen --------------------------------------------------------------

  ablegen "$name"
  groesse="$(du -h "$ZIEL/$name" | awk '{print $1}')"
  notiz "Abgelegt: $ZIEL/$name ($groesse)"
  melden "SoCoS-Sicherung abgelegt" "$name ($groesse) liegt in Synology Drive."
}

assistent_holen() {
  # Solange der Assistent am Server nicht eingerichtet ist, gibt es nichts zu
  # holen — das ist kein Fehler. Sobald es ihn gibt, ist jedes Scheitern einer.
  if ! ssh_ "test -f $ASSISTENT_ORDNER/betrieb/assistent.yml" 2>/dev/null; then
    notiz "Kein Assistent auf $SERVER eingerichtet — nichts zu holen."
    return 0
  fi
  notiz "Hole eine frische Sicherung des Assistenten von $SERVER …"

  # Frisch geschrieben und gleich gestreamt, aus demselben Grund wie oben: Die
  # tägliche am Server kann seit Tagen scheitern, ohne dass es jemand sieht.
  # `sichern -` prüft die Datei im Container (integrity_check), bevor sie
  # hinausgeht.
  name="assistent-$(date -u +%Y%m%d-%H%M%S).sqlite3"
  ssh_ "cd $ASSISTENT_ORDNER && docker compose -f betrieb/assistent.yml exec -T assistent python -m assistent sichern -" \
    > "$tmp/$name" 2> "$tmp/fehler.txt" \
    || fehler "Der Assistent hat keine Sicherung geschrieben: $(tail -1 "$tmp/fehler.txt")"

  # Und hier noch einmal: Eine unterwegs abgerissene Datei ist keine Sicherung.
  [ "$(head -c 15 "$tmp/$name")" = "SQLite format 3" ] \
    || fehler "Die Sicherung des Assistenten ist keine SQLite-Datei."
  [ "$(sqlite3 "$tmp/$name" 'PRAGMA integrity_check' 2>&1)" = "ok" ] \
    || fehler "Die Sicherung des Assistenten ist beschädigt (integrity_check)."

  ablegen "$name"
  groesse="$(du -h "$ZIEL/$name" | awk '{print $1}')"
  notiz "Abgelegt: $ZIEL/$name ($groesse)"
  melden "Assistent-Sicherung abgelegt" "$name ($groesse) liegt in Synology Drive."
}

[ "$socos_faellig" = 1 ] && socos_holen
[ "$assistent_faellig" = 1 ] && assistent_holen
rm -f "$MERKER"
