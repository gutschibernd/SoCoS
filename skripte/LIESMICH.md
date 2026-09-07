# Skripte

Zum **Doppelklicken** im Finder. Jede Datei öffnet ein Terminal-Fenster und
zeigt, was sie tut.

| Datei | Was sie macht |
|---|---|
| `start.command` | Räumt alte Server ab, bringt alles auf Stand, startet Django und Vite, öffnet den Browser |
| `stopp.command` | Beendet Django und Vite |
| `tests.command` | pytest, vitest, Typprüfung und `check --deploy` — alle vier |
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

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `SOCOS_KEIN_BROWSER=1` | Kein Browserfenster beim Start |
| `DJANGO_PORT`, `PORT` | Andere Ports, z. B. für einen Worktree |
