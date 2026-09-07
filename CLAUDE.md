# CLAUDE.md — Regeln und Fallen für die Arbeit an SoCoS

## Wo was steht

| Frage | Dokument |
|---|---|
| Wie starte ich das lokal, wie deploye ich? | [README.md](README.md) |
| Welche Maschine, welches Netz, welche Zugänge? | [SERVER.md](SERVER.md) |
| Warum ist etwas so entschieden? Was ist offen? | [MEMORY.md](MEMORY.md) |
| Wie arbeite ich hier — Regeln, Fallen, Ports | dieses Dokument |

## Sprache

**Alles auf Deutsch**: Code, Bezeichner, Feldnamen, Kommentare, Commit-Messages,
Oberfläche, Doku. Englisch nur dort, wo Django es vorgibt (`clean`, `save`, `Meta`,
`objects`).

**Kommentare erklären das Warum, nicht das Was.** Ein Kommentar, der festhält, warum
ein naheliegender Weg *nicht* gegangen wurde, ist das Wertvollste in der Datei.

## Grundhaltung

**Nicht künstlich verkomplizieren.** Drei Nutzer, ein internes Werkzeug. Im Zweifel
die kleinere Variante bauen und das sagen, statt die größere vorzuschlagen. Ein
Mechanismus statt zwei. Keine Konfigurierbarkeit ohne einen zweiten konkreten Fall.

Ausgenommen sind die Punkte, die unten mit Begründung stehen — Änderungsprotokoll,
Sicherung, axes-Konfiguration. Die sind klein, aber nicht nachrüstbar.

## Ports — die wichtigste lokale Falle

**Django 8003, Vite 5176.** 8000/5173 und 8001/5174 gehören zwei anderen Projekten
auf derselben Maschine.

`vite.config.ts` liest `PORT` und `DJANGO_PORT` aus der Umgebung, damit ein Worktree
eigene Ports nehmen kann. **Ein Vite auf fremdem Port, dessen Proxy noch auf den
Hauptport zeigt, mischt zwei Zweige in einer Ansicht — und das sieht man nicht.**

## `runserver --noreload` hält Vorlagen fest

Django legt Vorlagen in einen Zwischenspeicher und wirft ihn nur beim Neustart
weg. Der Autoreloader tut das bei jeder Dateiänderung — `--noreload` nicht.
Wer damit startet und dann `vorlagen/anmelden.html` ändert, bekommt weiter die
alte Seite ausgeliefert und sucht den Fehler in der Datei, die längst richtig
ist. **Nach einer Vorlagenänderung neu starten, oder ohne `--noreload` arbeiten.**

## Datenbank

Schemaänderungen **nur über Migrationen**, nie per SQL. Gelaufene Migrationen werden
nie bearbeitet; Korrekturen sind neue Migrationen.

## Geld und Zeit sind `Decimal`

In der API sind sie **Zeichenketten** (eigener Renderer). JSON kennt nur Gleitkomma,
und dort ist 0.1 + 0.2 nicht 0.3. Bei Stunden, die über ein Jahr summiert werden,
sind das Differenzen, die niemand mehr zuordnen kann. Gilt ab der ersten Zeile.

## Abgeleitete Werte werden gerechnet, nicht gespeichert

Summen, Auslastung, Runway, Fortschritt: Funktionen in `socos/services/`, keine
Felder.

**Die Ausnahme wäre, was ein Beleg ist** — ein Wert, der eingefroren gehört, weil
eine spätere Änderung sonst rückwirkend ein Dokument verändert. **In SoCoS gibt es
derzeit keinen solchen Beleg**, weil es keine Abrechnung gibt (siehe MEMORY.md).
Alles wird gerechnet. Kommt je ein Beleg dazu, wird diese Grenze hier und in
MEMORY.md neu gezogen.

## Es gibt keine stille Zeitscheibe

Kein Manager-Filter auf „aktuelle Periode", keine Middleware, die einen Monat setzt,
keine `contextvars` dafür. Zeiträume sind ausdrückliche Parameter (`?von=&bis=`);
ohne Angabe kommt alles.

**Warum:** Ein stiller Filter ist die Art Fehler, bei der Zahlen plausibel aussehen
und falsch sind.

## Fehler werden an einer Stelle übersetzt

In `socos/fehler.py`, nicht je ViewSet. Zwei Fälle sind von Anfang an drin, weil sie
sonst jede neue Ressource neu erwischen:

- **`ProtectedError` → 409.** Die Anfrage war in Ordnung, der Datenzustand steht ihr
  entgegen. Keine 400.
- **DRF-403 bekommt ein `code`-Feld**, das `not_authenticated` von `permission_denied`
  unterscheidet. Ohne das schickt das Frontend jemanden, dem bloß eine Seite verwehrt
  ist, zurück zur Anmeldung, obwohl seine Sitzung steht.

## Berechtigung

Serverseitig, immer. Schwellen stehen an **genau einer Stelle**: `socos/berechtigung.py`.
Kein zweiter Ort mit einer Zahl oder Rolle, schon gar nicht im Frontend. Eine im
Frontend versteckte Seite ist nur eine ungenannte URL.

## Löschen

**Es gibt kein hartes Löschen.** Alles wird weich gelöscht. Ein Mechanismus, kein
zweiter Weg daneben.

## Änderungsprotokoll

Ab dem ersten Modell, nicht nachgerüstet: wer, wann, was, **alt → neu je Feld**.
In einem MedTech-Umfeld ist „wer hat diese Zeit nachträglich geändert" keine
Neugier.

## Sicherung: alles Neue muss mitwandern

**Wer etwas Neues baut, das gespeichert wird, sorgt im selben Commit dafür, dass es
im Archiv landet.** Konkret: neue Modelle in die Löschreihenfolge des Einspielens
eintragen; Modelle außerhalb der eigenen App ausdrücklich aufnehmen; ein neuer
Ablageort für Dateien neben `MEDIA_ROOT` wandert **nicht** von selbst mit (im
Zweifel unter `MEDIA_ROOT` legen); ein Test schickt den neuen Bestandteil durch
Ausfuhr und Einfuhr und sieht nach, dass er danach noch da ist.

**Warum so streng:** Ein Export, der die Hälfte mitnimmt, ist schlimmer als keiner.
Er sieht vollständig aus, und der Verlust fällt erst beim Wiederherstellen auf —
im Ernstfall, unter Zeitdruck, wenn das Original schon weg ist.

## Oberfläche

- **Farben stehen an einer Stelle** als Werte unter `:root`, hell und dunkel. Kein
  Farbwert in einer Komponente, kein `style={{ color: … }}`. Die Anmeldeseiten laufen
  ohne das React-Bundle und brauchen dieselbe Palette ein zweites Mal in der
  Django-Vorlage — mit denselben Namen, damit man die zweite findet.
- **Kein CSS-Rahmenwerk, keine Icon-Bibliothek.** Zeichen werden selbst gezeichnet:
  ein Raster, eine Strichstärke, Farbe von `currentColor`.
- **Aus einer Tabelle wird am Handy eine Karte — aus demselben Markup**, über ein
  Datenattribut je Zelle. Keine zweite Ansicht: die zweite wird beim nächsten neuen
  Feld vergessen.
- **Was der Finger trifft, ist mindestens 44 px hoch**, Eingabefelder 16 px (darunter
  zoomt iOS beim Hineintippen), Ränder achten auf `env(safe-area-*)`.
- **Keine erklärenden Absätze in der Seite, sondern ein `?` daneben**, das am Rechner
  beim Überfahren und am Handy beim Antippen aufgeht.
- **Vor jedem Löschen eine Nachfrage, die den Namen nennt und den milderen Weg
  vorschlägt** (beenden, stilllegen, als abgeschlossen führen). Kein `window.confirm`.
- **Eine leere Liste ist kein Fehler**, sondern eine Leerstelle mit einem Satz dazu,
  was fehlt und was der nächste Griff wäre.
- **Ein einziger Helfer entscheidet, was statt der Seite dasteht**, solange die Daten
  fehlen. Gerufen wird er **hinter der Prüfung auf die Daten selbst** (`if (!x.data)`),
  nicht hinter `isLoading` oder `isError`.

  **Die Falle dahinter:** React Query hält einen zweiten Versuch an, solange das
  Fenster verdeckt ist (`focusManager.isFocused()`) — am Handy also jedesmal, wenn
  jemand kurz die App wechselt. Der Zustand ist dann `pending`/`paused`, `error`
  bleibt `null`. Eine Seite, die das als „wird geladen …" zeichnet, lädt nie fertig.

**Jede Änderung an der Oberfläche wird an beiden Größen geprüft, bevor sie committet
wird — 1280×800 und 375×812, hell und dunkel.**

### Visuelle Sprache (verbindlich, aus dem Entwurf)

Eckige Kanten (2 px Radius) · `#0F4448` `#14595F` `#8A5638` `#EFEDE6` `#FFFFFF` ·
**Figtree** für Text, **IBM Plex Mono** für Zahlen und Zeiten · 4-Spalten-Raster.

Layout und Beschriftungen nicht neu erfinden. Vorlage ist
`Sopharmis Internal v6 leer.dc.html`. Wenn etwas fehlt: nachfragen.

## Tests

pytest **und** vitest, ab dem ersten Commit. Getestet wird alles, was rechnet oder
prüft — Rundung, Summen, Prognose, Berechtigung — nicht Django selbst. Was nur in
Produktion gilt (Security-Header, axes-Konfiguration), wird einzeln geprüft.

## Git

- Nach jeder abgeschlossenen Einheit committen. **Immer explizit stagen**
  (`git add <pfad>`), nie `git add .` — sonst landet irgendwann `daten/` oder eine
  `.env` im Repository.
- Kein push, kein Deploy, kein Serverzugriff ohne ausdrückliche Aufforderung.
- **Nichts, was fremde Änderungen im Arbeitsverzeichnis vernichtet**: kein
  `git stash`, kein `git checkout -- <datei>`, kein `git reset --hard`, kein
  `git clean`. Eigene Fehler mit `git revert` oder einem neuen Commit korrigieren.
- **MEMORY.md wird im selben Commit gepflegt**, sobald eine Änderung ein Schema, eine
  Architekturentscheidung oder einen fachlichen Sonderfall betrifft.

## Daten

**Kunden- und Personendaten kommen aus `daten/`** (in `.gitignore`), nie aus einer
Fixture, einer Migration oder einem Befehlsargument.

**Kein Testkonto, dessen Passwort im Repository steht.** Wird eines gebraucht, wird
es lokal von Hand angelegt.
