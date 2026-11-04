# Skripte

Zum **Doppelklicken** im Finder. Jede Datei öffnet ein Terminal-Fenster und
zeigt, was sie tut.

| Datei | Was sie macht |
|---|---|
| `start.command` | Räumt alte Server ab, bringt alles auf Stand, startet Django und Vite, öffnet den Browser |
| `stopp.command` | Beendet Django und Vite |
| `tests.command` | pytest, vitest, Typprüfung und `check --deploy` — alle vier |
| `sicherung_einrichten.command` | Richtet die wöchentliche Kopie außer Haus auf diesem Mac ein |
| `sicherung_holen.sh` | Holt sie — läuft über launchd, nicht selbst doppelklicken |
| `gemeinsam.sh` | Gemeinsame Funktionen. Nicht selbst aufrufen. |

## start.command im Einzelnen

1. **Alte Server abräumen** — immer zuerst und immer, auch wenn scheinbar
   nichts läuft. Ein übriggebliebener Server aus einem früheren Lauf liefert
   alten Code aus, und man sucht den Fehler dann in einer Datei, die längst
   richtig ist.
2. **PostgreSQL** starten, falls es nicht läuft.
3. **Python** — venv anlegen, falls sie fehlt; Abhängigkeiten nur nachziehen,
   wenn `requirements.txt` neuer ist als die letzte Installation; Migrationen
   anwenden.
4. **npm-Pakete** nur nachziehen, wenn `package-lock.json` neuer ist.
5. **Django (8003) und Vite (5176) starten**, jeweils mit Prüfung, ob sie
   wirklich hochgekommen sind.
6. **Browser öffnen** auf http://localhost:5176

Das Fenster bleibt offen, solange die Server laufen. **Strg-C** beendet beide —
oder ein Doppelklick auf `stopp.command`.

## Nur diese zwei Ports

Die Skripte fassen ausschließlich **8003** (Django) und **5176** (Vite) an.
8000/5173 und 8001/5174 gehören zwei anderen Projekten auf dieser Maschine;
`gemeinsam.sh` bricht ab, wenn jemand versucht, einen davon freizumachen.

**PostgreSQL wird nie beendet.** Es ist ein Dienst der Maschine, und die beiden
anderen Projekte hängen ebenfalls daran.

## Wenn etwas schiefgeht

Das Fenster bleibt bei einem Fehler offen und zeigt den Grund samt den letzten
Zeilen aus dem Protokoll. Die vollständigen Protokolle liegen in
`protokolle/django.log` und `protokolle/vite.log` (nicht im Repository).

Ein gewolltes Ende (Strg-C, `stopp.command`) wird **nicht** als Fehler
gemeldet — sonst liest man den roten Text beim echten Absturz nicht mehr.

## Die Kopie außer Haus

`sicherung_einrichten.command` einmal doppelklicken. Danach läuft
`sicherung_holen.sh` alle zwei Stunden an, solange der Mac wach ist. **Es holt
nur dann, wenn die letzte Kopie älter als sieben Tage ist.** Ein fester
Wochentermin fiele aus, wäre der Laptop gerade aus. Dann:

1. Am Server wird eigens eine frische Sicherung geschrieben (über `ssh socos`).
2. Sie wird heruntergeladen, gegen die Prüfsumme am Server verglichen und
   darauf geprüft, dass `datenbank.json` drin ist.
3. Erst dann landet sie in Synology Drive unter
   `00_Managment/SoCoS-Sicherungen`: zuerst unter einem Zwischennamen, dann
   umbenannt, damit Synology nie eine halbe Datei hochlädt.

Rechts oben kommt ein Hinweis, ob es geklappt hat. Ein Fehler wird höchstens
einmal am Tag gemeldet, sonst stünde ohne Netz alle zwei Stunden dieselbe
Meldung da. Protokoll: `~/Library/Logs/SoCoS-Sicherung.log`.

**Nach einer Änderung an `sicherung_holen.sh` noch einmal einrichten.**
launchd führt eine Kopie unter `~/Library/Application Support/SoCoS` aus, weil
macOS einem Hintergrundauftrag das Lesen unter `~/Documents` verweigert.

Sofort holen, egal wie alt die letzte ist:

```bash
"$HOME/Library/Application Support/SoCoS/sicherung_holen.sh" --jetzt
```

Wieder abschalten:

```bash
launchctl bootout gui/$(id -u)/com.sopharmis.socos-sicherung && rm ~/Library/LaunchAgents/com.sopharmis.socos-sicherung.plist
```

| Variable | Wirkung |
|---|---|
| `SOCOS_SICHERUNG_ZIEL` | Anderer Zielordner |
| `SOCOS_SICHERUNG_TAGE` | Anderer Abstand als 7 Tage |

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `SOCOS_KEIN_BROWSER=1` | Kein Browserfenster beim Start |
| `DJANGO_PORT`, `PORT` | Andere Ports, z. B. für einen Worktree |
