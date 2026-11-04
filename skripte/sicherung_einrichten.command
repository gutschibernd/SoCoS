#!/bin/bash
#
# Richtet die wöchentliche Kopie außer Haus auf diesem Mac ein (Doppelklick).
# Darf beliebig oft laufen — nach jeder Änderung an sicherung_holen.sh muss
# es das sogar, weil launchd die Kopie ausführt, nicht die Datei hier.
#
# **Warum das Skript kopiert wird statt von hier aus zu laufen:** Das
# Repository liegt unter ~/Documents, und macOS lässt einen Hintergrundauftrag
# dort nicht lesen („Operation not permitted"), solange man der bash nicht
# vollen Festplattenzugriff gibt. Das wäre ein großes Tor für ein kleines
# Skript. Unter ~/Library/Application Support gilt diese Sperre nicht.
#
# Entfernen:
#   launchctl bootout gui/$(id -u)/com.sopharmis.socos-sicherung
#   rm ~/Library/LaunchAgents/com.sopharmis.socos-sicherung.plist

set -euo pipefail
hier="$(cd "$(dirname "$0")" && pwd)"
source "$hier/gemeinsam.sh"

KENNUNG="com.sopharmis.socos-sicherung"
ORT="$HOME/Library/Application Support/SoCoS"
SKRIPT="$ORT/sicherung_holen.sh"
AUFTRAG="$HOME/Library/LaunchAgents/$KENNUNG.plist"
PROTOKOLL="$HOME/Library/Logs/SoCoS-Sicherung.log"

titel "Wöchentliche SoCoS-Sicherung einrichten"

mkdir -p "$ORT" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$hier/sicherung_holen.sh" "$SKRIPT"
chmod 755 "$SKRIPT"
gut "Skript abgelegt: $SKRIPT"

# StartInterval 7200: alle zwei Stunden, solange der Mac wach ist. Was das
# Skript dann tut, entscheidet das Alter der letzten Kopie (siehe dort).
cat > "$AUFTRAG" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$KENNUNG</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SKRIPT</string></array>
  <key>StartInterval</key><integer>7200</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$PROTOKOLL</string>
  <key>StandardErrorPath</key><string>$PROTOKOLL</string>
</dict>
</plist>
PLIST
plutil -lint "$AUFTRAG" >/dev/null
gut "Auftrag angelegt: $AUFTRAG"

launchctl bootout "gui/$(id -u)/$KENNUNG" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AUFTRAG"
gut "Bei launchd angemeldet — läuft ab jetzt alle zwei Stunden an."

melde ""
melde "Protokoll:  $PROTOKOLL"
melde "Das erste Holen läuft gerade im Hintergrund; der Hinweis kommt rechts oben."
