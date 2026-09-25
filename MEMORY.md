# MEMORY — Warum-Entscheidungen, Fallen, offene Punkte

Neueste Einträge oben. Dieses Dokument beantwortet die Fragen, die man dem Code in
zwei Jahren nicht mehr ansieht. Es wird **im selben Commit** gepflegt, sobald eine
Änderung ein Schema, eine Architekturentscheidung oder einen fachlichen Sonderfall
betrifft.

---

## 2026-09-23 — Sicherheitsprüfung

Code von Hand durchgesehen, dazu `check --deploy`, `pip-audit`, `bandit` und
`npm audit`. Behoben, jeweils mit Test in `socos/tests/test_sicherheit.py`:

- **Abhängigkeiten:** Django 5.2.7 → 5.2.17, DRF → 3.17.2, pytest → 9.0.3.
  61 bekannte Lücken, danach keine. `npm audit --omit=dev` ist sauber; die
  Meldung zu `vitest` betrifft nur den Testläufer, die Behebung wäre der
  Sprung auf vitest 4 und steht noch aus.
- **Das Änderungsprotokoll zeigte fremde Stammdaten.** Es hält alt → neu je
  Feld fest und ist für alle lesbar — Adresse und Geburtsdatum, die der
  Nutzer-Serializer verbirgt, standen dort im Klartext. Jetzt filtert der
  `ProtokollSerializer` mit **derselben** Liste (`NutzerSerializer.STAMMDATEN`).
  Wer dem Nutzer ein neues privates Feld gibt, trägt es dort ein.
- **Ein Bearbeiter konnte per `POST /api/nutzer/` Konten anlegen.** Die
  gewöhnliche Regel sagt „POST = bearbeiten"; Konten sind aber
  Nutzerverwaltung. `perform_create` prüft jetzt `darf_nutzer_verwalten`.
- **`/healthz/` gab die Treibermeldung nach außen** (Rechner, Adresse,
  Datenbanknutzer). Der Grund steht jetzt nur noch im Server-Protokoll.
- **Content-Disposition im Zeitnachweis** über `content_disposition_header`,
  weil der Dateiname den Personennamen enthält.
- **Content-Security-Policy** (`socos/sicherheitskoepfe.py`): `script-src
  'self'` ohne `unsafe-inline`. Dafür ist das Skript der Anmeldeseite nach
  `statisch/anmelden.js` gewandert. **Kein eingebettetes Skript mehr, nirgends**
  — ein Test sieht in `anmelden.html` nach. Geprüft: Anmeldung, Anwendung,
  Admin, API-Ansicht ohne Verstoß.

Danach, auf Wunsch:

- **Sitzung hält fünf Tage** (`SESSION_COOKIE_AGE`), nicht Djangos zwei Wochen.
- **vitest 4** — damit ist auch `npm audit` ohne Meldung.
- **Anfragen höchstens 13 MB** (`request_body` im Caddyfile), Anhänge
  höchstens 12 MB (`ANHANG_HOECHSTENS`). Die Caddy-Grenze liegt knapp darüber,
  damit man bei einer zu großen Datei Djangos Satz sieht und nicht die nackte
  413. **Ausgenommen ist nur `/api/sicherung/einspielen/`** — ausdrücklich
  ohne Grenze: Das Archiv wächst mit allen Anhängen, und eine Grenze dort
  fiele erst auf, wenn man die Sicherung braucht. `deploy.sh` fasst Caddy
  **nicht** an. Und ein `caddy reload` genügt nicht: Das Caddyfile ist als
  Einzeldatei eingehängt, und nach `git pull` sieht der Container weiter die
  alte. Container neu anlegen, siehe betrieb/LIESMICH.md. Am Server geprüft:
  14 MB → 413 von Caddy, 5 MB gehen durch.

---

## 2026-09-23 — Anhänge am Meeting, und ein neuer Auftrag an das LLM (Migration 0026)

### `Meetinganhang`: die Datei unter `MEDIA_ROOT`, der Mailtext daneben

Eine Datei je Zeile, `upload_to="meetings/%Y/%m/"` — **unter `MEDIA_ROOT`**, damit
sie mit dem Medienordner in die Sicherung wandert. Das Modell steht in
`MODELLE_IM_ARCHIV` und vor `Meeting` in der Löschreihenfolge; ein Test schickt
Eintrag und Datei durch Ausfuhr und Einfuhr.

**Ausgeliefert wird nur über `GET /api/meetinganhaenge/<id>/datei/`**, hinter der
Anmeldung und immer als Download. `/medien/` bedient am Server niemand, und das
bleibt so: In der ersten Mail, die hier hing (Steuerberater), steckten
Ausweiskopien. Als Download, nie im Browser geöffnet, weil eine .eml oder ein
HTML-Anhang unter unserem Ursprung mit der Sitzung dessen liefe, der klickt.

**Eine .eml wird beim Hochladen gelesen** (`socos/services/mailtext.py`): Kopf,
Inhalt (Klartext, sonst HTML ohne Auszeichnung), die *Namen* ihrer Anhänge —
deren Inhalt nie. Das Ergebnis steht in `Meetinganhang.text`. Einmal beim
Hochladen und nicht beim Anzeigen, weil der Text in die Suche und den Auftrag
geht, und beides läuft über die Liste aller Meetings. Kein PDF-Text: Das bräuchte
eine Bibliothek je Format, und vermisst hat es noch niemand.

**Anhänge einer Mail fallen auf Wunsch am Server weg** (`anhaenge=ohne` beim
Hochladen, `mailtext.ohne_anhaenge`). Gefragt wird in der Oberfläche, und nur
wenn die Mail welche hat — erkannt grob an `filename=` im Rohtext
(`mailHatAnhaenge`); die Probe schlägt eher zu oft an als zu selten, und ohne
Frage geht die Mail unverändert hoch. Weggelassen wird **vor** dem Ablegen, nicht
danach: Die Mail an den Steuerberater trug Ausweiskopien, und die sollen gar nicht
erst auf die Platte. Was wegfiel, steht im Text („Anhänge (nicht mit abgelegt)"),
sonst liest sich „siehe Anhang" wie ein Versehen. Mit dem Logo der Signatur schrumpfte
die Mail von 16 MB auf 46 KB.

Eine Mail öffnet ein Fenster (Kopf, Text, Herunterladen), jede andere Datei lädt
direkt herunter.

Kein PATCH: Eine Datei ersetzt man durch eine neue. `Meeting.delete()` nimmt die
Anhänge weich mit; die Dateien bleiben auf der Platte.

`hole()` setzt bei `FormData` keinen JSON-Typ mehr — der Browser setzt ihn samt
Grenze selbst.

### Der Auftrag an das LLM, zweite Fassung

Die erste Fassung taugte für Stichworte und scheiterte an einem Transkript:

- „Nichts weglassen, auch den halben Satz" ergab Protokolle voller Begrüßung.
  Jetzt: **inhaltlich** vollständig — jede Zahl, Frist, Zusage —, Füllwerk darf
  weg.
- Feste Abschnitte (Besprochen / Entscheidungen / …) zerrissen jedes Thema.
  Jetzt: **Kurzfassung, ein Abschnitt je Thema** (Entschiedenes darin mit
  „Entschieden:"), Offene Fragen, **Aufgaben als „Wer: Was — bis wann"**.
- Hörfehler wurden übernommen („Sofarmis"). Jetzt stehen im Rahmen unsere Firma
  (`UNSERE_FIRMA`), die Rolle und das Haus jeder Person, und eine Regel, Namen
  danach zu schreiben — Unsicheres als „unklar:".
- Tabellen und Fettdruck kamen als Zeichensalat an, weil Abschnitte reiner Text
  sind. Jetzt ausdrücklich verboten.

**Mailtexte gehen als UNTERLAGE mit**, getrennt und mit derselben Regel wie die
Vorbereitung: Hintergrund, nie Gesprächsinhalt; bei Widerspruch gilt das
Gespräch, und der Widerspruch steht dabei. „Nicht zur Sprache gekommen" erfasst
jetzt auch, was in einer Mail erbeten wurde und im Termin nicht vorkam — genau
dafür hängt die Mail am Meeting.

---

## 2026-09-25 — Vision Statement, der dritte Workshop (Migration 0027)

Ein Satz mit drei Lücken: „Our Vision is …, hereby we want to help … by
building …". **Derselbe Mechanismus wie Canvas und Plan**: `Visionsteil` mit
drei Werten für `Canvaspunkt.feld`, je Teil höchstens **ein** Punkt (geprüft in
`feld`). Drei Textfelder am Vorhaben wären kürzer gewesen, hätten aber einen
zweiten Weg zum Schreiben, Zählen und Anzeigen gebraucht.

**Der Titel eines Teils ist das feste Stück Satz davor**, nicht ein Name für die
Lücke. Die Oberfläche setzt den Satz aus Titeln und Einträgen zusammen; ein
Satzzeichen am Ende eines Eintrags fällt dabei weg (`ohneSatzende`). Bearbeitet
wird an Ort und Stelle, nicht im Feldfenster: drei Felder brauchen kein
Weiterblättern.

Die Migration trägt die Vision vom 2026-09-25 ein, aber nur in eine leere Lücke.

Am Handy passen drei Workshops nicht mehr in eine Zeile des Umschalters. Er
steht dort als drei gleiche Spalten mit umbrechendem Titel, sonst schnitte
`overflow: hidden` den dritten still ab.

---

## 2026-09-22 — Business Plan Lite als Überblick, Aufgaben mit Frist (Migration 0025)

### Der Plan wird nicht in SoCoS geschrieben

Geschrieben wird er im Dokument, das bei der SPG Academy abgegeben wird. Ein
zweiter Ort für denselben Text liefe ihm hinterher, und beim Abgeben gälte doch
nur das Dokument. SoCoS zeigt je Abschnitt die Leitfragen („was hinein muss") und
einen Stand. Das Feldfenster und das PDF des Plans sind weg; `feld` nimmt nur
noch Canvas-Felder an. Punkte, die schon in einem Abschnitt standen, bleiben
sichtbar (unter den Fragen), statt still zu verschwinden.

### Der Stand ist ein JSON-Feld am Vorhaben (`Vorhaben.planstand`)

`{"markt": "entwurf", …}`, was fehlt, ist offen. Kein eigenes Modell: acht
Wörter, für die sonst Sicherung, Löschweitergabe und Abgleich nachgezogen werden
müssten. Mit dem Vorhaben wandert es ins Archiv, und das Protokoll zeigt alt → neu
wie bei jedem Feld. Gesetzt wird es über `POST /vorhaben/<id>/stand/` — **ein**
Abschnitt je Aufruf unter `select_for_update`. Ein PATCH mit dem ganzen
Wörterbuch hieße: Zwei drehen gleichzeitig verschiedene Abschnitte weiter, und der
Zweite überschreibt den Ersten.

### Die Abgaben stehen zweimal da, und das ist Absicht

Als Fahrplan in `basis/module.ts` (`PLANVERSIONEN`: 12.10., 27.10., 19.11.2026) —
dort zeigt die Plan-Seite, welche die nächste ist. Und als drei Aufgaben mit Frist
unter „Allgemein" auf der Tafel (angelegt von Migration 0025), wo sie abgehakt
werden. Die Plan-Seite liest die Aufgaben nicht: Eine Verbindung über den Text
einer Aufgabe bräche beim ersten Umformulieren. **Verschiebt die Academy eine
Abgabe, wird sie an beiden Stellen geändert** — in `module.ts` und an der Aufgabe.
Die Frist setzt man im Fenster, das ein Tipp auf die Aufgabe öffnet.

### `Aufgabe.frist` — die Tafel bekommt doch ein Datum

Bisher bewusst nicht (siehe 2026-09-14). Mit den Abgaben kam der erste Termin,
den ein Dritter setzt; ohne Datum stünde „Version 1 abgeben" neben „Version 2
abgeben", und keiner sähe, welche drängt. Die Frist ist freiwillig.

**Anlegen bleibt eine Zeile und Enter.** Text und Frist ändert man in einem
kleinen Fenster, das ein Tipp auf die Aufgabe öffnet — es ersetzt das Ändern an
Ort und Stelle (`Feldtext`) auf der Tafel. Ein Datumsfeld in jeder Zeile oder
in der Neuzeile stünde jedem im Weg, der keine Frist braucht, und das sind die
meisten. Auf der Ideenliste hat das Fenster kein Fristfeld: Eine Idee, die bis
zu einem Tag entschieden sein muss, ist schon eine Aufgabe.

Die Stichworte je Abschnitt des Plans und der Seitenumfang (`UMFANG`) sind aus
der Vorlage der SPG („Business Plan Lite — Structure example & guidelines")
zusammengefasst und stehen in `LEITFRAGEN` wie beim Canvas.

Sortiert wird: Priorität, dann Frist (frühere zuerst, ohne Frist hinten), dann
das Neueste. Die Frist schlägt die Priorität nicht — die setzt man von Hand.
Tage werden über UTC-Mitternacht gezählt: Am 25. Oktober hat der Tag 25 Stunden,
und zwei Ortsmitternächte ergäben dort 1,04 Tage.

## 2026-09-21 — Module und die SPG Academy (`Vorhaben`, `Canvaspunkt`, Migration 0021)

### „Module" steht unter Intern und klappt nur auf, wenn man drin ist

Zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben, stehen unter
**Intern · Module** und nicht in einer eigenen Gruppe der Leiste: Sie werden selten
gebraucht, und eine vierte Gruppe hätte jeden Tag zwei Zeilen gekostet. Der Zweig
ist **genau dann offen, wenn man in einem Modul ist** — kein gemerkter Zustand. Ein
Klick auf „Module" führt zur Übersicht (`/module`) und klappt damit auf.

Die Module stehen in **einer** Liste (`frontend/src/basis/module.ts`), aus der die
Leiste und die Übersichtskacheln leben. Neue Module entstehen im Code, nicht in der
Oberfläche — die Übersicht verweist dafür auf „Wünsche & Fehler".

### Es gibt genau ein Vorhaben, und es hängt an keinem Projekt

**Nachtrag, am selben Tag:** In der SPG Academy gibt es nur „Sopharmis
Arzneimittelspender". Die Migration 0022 legt es an, falls keines da ist; die
Oberfläche wählt nichts aus, sie zeigt es — samt Leinwand mit allen Fragen, auch
wenn noch kein Punkt eingetragen ist. Anlegen, Umbenennen und Entfernen gibt es in
der Oberfläche nicht mehr. Der erste Wurf hatte eine Auswahl, und ohne Vorhaben
stand statt der Leinwand nur „Noch kein Vorhaben" da — genau das, woran man sieht,
worum es geht, war damit versteckt. Das Modell `Vorhaben` bleibt getrennt von den
Punkten: Ein zweites wäre eine Auswahl in der Oberfläche, kein Umbau der Daten.

Im Workshop wird oft über etwas nachgedacht, das noch kein Projekt ist. Ein Verweis
auf ein Projekt zwänge dazu, zuerst eines anzulegen, und die Projektliste füllte
sich mit Einträgen, auf die nie jemand bucht. Das Vorhaben ist vom Workshop
getrennt: Kommt ein zweiter (Pitch, Finanzplan), hängt er am selben Vorhaben.

### Punkte je Feld, nicht ein Text je Feld — und abgeglichen, nicht ersetzt

`POST /api/vorhaben/<id>/feld/` nimmt die ganze Liste eines Feldes. Punkte mit
`id` werden geändert, ohne `id` angelegt, fehlende weich entfernt. Ersetzen wäre
kürzer, schriebe aber bei jedem Speichern jeden Punkt einmal als entfernt und einmal
als neu ins Änderungsprotokoll — auch die unveränderten. Eine `id` aus einem anderen
Feld wird nicht übernommen, sondern legt einen neuen Punkt an.

**Ein Bearbeiter darf dabei Punkte streichen**, obwohl Löschen sonst dem Admin
vorbehalten ist: Das ist Arbeit am Text des Feldes, wie ein ersetzter
Protokollabschnitt eines Meetings. Ein ganzes Vorhaben entfernt nur der Admin.

### Die Felder und Leitfragen stehen am Server

`Canvasfeld` (Reihenfolge = Nummerierung der SPG Academy) und `LEITFRAGEN` stehen in
`socos/models.py`; die Oberfläche holt beides über `/api/vorhaben/felder/`, das PDF
liest es direkt. Wo welches Feld auf der Leinwand steht, sagt nur
`bausteine.css` (über `data-feld`) — und im PDF `ANORDNUNG` in
`socos/services/leinwand.py`. **Die Namen bleiben englisch**, wie im
Workshop-Material. „Key Metrics" hat im Workshop keine Frage; die eine ist ergänzt.

Daneben steht `AUFGABEN`: was im Feld verlangt ist, aus den Vorbereitungsvideos
mitgeschrieben (erst für die Felder 1–6). Die Leitfragen sagen, *worüber* man
nachdenkt, die Aufgabe, *wie* das Ergebnis aussehen soll. Sie steht nur im
Feldfenster, nicht auf der Leinwand — dort bleibt Platz für die Ergebnisse.

### Business Plan Lite: derselbe Mechanismus, ein zweiter Satz Felder

Der zweite Workshop hat acht Abschnitte (`Planabschnitt`) statt neun Felder. Er
lebt im **selben** Modell: `Canvaspunkt.feld` nimmt die Werte beider Workshops, und
`WORKSHOPS` ordnet sie zu. Ein eigenes Modell hieße ein zweites Mal Sicherung,
Protokoll, Abgleich und Fenster für dieselbe Sache — Felder mit Punkten an einem
Vorhaben. Der Name `Canvaspunkt` stammt vom ersten Workshop und ist geblieben.

Die Leitfragen zum Plan sind aus der Kursbeschreibung abgeleitet, nicht aus den
Videos; die Aufgaben daraus kommen nach, wie beim Canvas. „Tips & Tricks" ist kein
Kapitel eines Plans, sondern die letzte Lektion — steht aber als Abschnitt da, damit
das Mitgeschriebene einen Ort hat.

`ausgefuellt()` bekommt die Felder des Workshops mit: An einem Vorhaben hängen die
Punkte aller Workshops, und ohne das zählte das Canvas die Abschnitte des Plans mit.

Das PDF des Plans fließt (platypus), das des Canvas bleibt eine feste Seite.
**Überholt am 2026-09-22:** Der Plan wird nicht mehr in SoCoS geschrieben, das
PDF des Plans ist weg (siehe oben).

### Personas (`Persona`, Migration 0024) — ein eigenes Modell

Steckbriefe zu Customer Segments: Name, Rolle (Nutzer · Kunde · beides — die
Aufgabe verlangt die Unterscheidung), Alter, Geschlecht, Wohnort, Beruf, Haushalt,
Einkommen, Bedürfnisse, Probleme. **Ein eigenes Modell und kein Punkt**, weil ein
Steckbrief Felder hat, nach denen man ihn liest; ein Freitext hätte bei jeder Persona
eine andere Reihenfolge. Das Einkommen ist `Decimal` (netto im Monat) wie jedes Geld.

Die Personas sind **erfunden** und fallen deshalb nicht unter „Personendaten aus
`daten/`". Gespeichert werden sie für sich im Steckbrief, nicht mit dem Speichern der
Punkte; entfernen darf sie nur der Admin — die gewöhnliche Regel.

Im PDF steht im Feld je Persona eine Zeile, der ganze Steckbrief folgt auf eigenen
Seiten (so vielen, wie es braucht — `addFromList` verwirft sonst still den Rest).

### Die Mittellinie ist ein Hintergrund, kein Pseudoelement

Die Linie Product | Market läuft durch die Mitte des Nutzenversprechens, hinter dem
Text. Der erste Versuch war ein `::before` mit `z-index: -1` in einem isolierten
Feld; das hing am Stapelkontext. Jetzt ist sie ein Hintergrundbild des Feldes
(ein Pixel breit, senkrecht wiederholt), und Überschrift und Listen decken sie mit
dem Grund ab — den eigenen Hintergrund malt der Browser immer unter die Inhalte.

### Das PDF zeichnet von Hand

Eine reportlab-Tabelle mit verbundenen Zellen rechnet die Höhe nach der ersten
Zeile; ein volles Feld schöbe die Leinwand über den Seitenrand. Gezeichnet wird
deshalb auf die Seite, und was nicht passt, wird bis 6,5 pt kleiner gesetzt. Reicht
auch das nicht, nennt das Feld die fehlenden Punkte, statt still abzuschneiden.

### Kleinigkeiten

- „zuletzt" am Vorhaben ist gerechnet (jüngstes `geaendert_am` von Vorhaben und
  Punkten, auch gestrichenen), nicht gespeichert.
- Das Feldfenster speichert beim Weiterblättern mit, was offen ist. Beim Tippen
  speichert es nicht — jede Pause stünde sonst im Änderungsprotokoll.
- `--text-sehr-leise` kommt auf der Leinwand nicht vor: auf `--akzent-hell` hielte
  es nur 4,41:1. Geprüft in `test_kontrast.py`.

---

## 2026-09-18 — Die Stufenleiste ist weg; der Fortschritt ist gebucht gegen Pensum

### Was raus ist

`Arbeitspaket.stufen` und `.stufenstand` (Migration `0019`), die drei Vorlagen
`STUFENVORLAGEN`, `stufenvorlage()`, die Aktionen `POST /pakete/<id>/stufe/` und
`/vorlage/`, die Stufenprüfung im Serializer, die Stufenbearbeitung im Frontend.
Der Abschnitt „Stufen" weiter unten (vom 2026-09-08) beschreibt den alten Stand
und bleibt als Begründung stehen, warum die Leiste am Paket hing — gilt nicht mehr.

**Warum:** „Konzept 1 Mon. · Umsetzung 3 Mon. · Test 2 Mon. · Abschluss" hat für
kein Paket je gestimmt. Der Stand war ein Klick, die Monate eine Vorlage; die
Prozentzahl, die daraus kam, sah wie eine Messung aus und war eine Schätzung.
Seit `0018` gibt es das Pensum je Person, und zwischen gebuchter Zeit und Pensum
liegt die einzige Zahl, die jemand nachrechnen kann.

### Wie der Fortschritt jetzt rechnet

`auswertung.fortschritt(gebuchte_sekunden, pensum_stunden)`, Prozent, kaufmännisch
gerundet. Drei Entscheidungen:

- **`None` statt 0 ohne Pensum.** 0 % hieße „nichts geschafft" — an einem
  Förderantrag oder einem Ziel gibt es keine Zahl, gegen die man rechnen könnte.
  Die Oberfläche zeigt dort keinen Balken, nur die gebuchte Zeit (und die nur,
  wenn es eine gibt).
- **Über 100 % bleibt über 100 %.** Der Balken läuft voll und wechselt auf
  `--warnung`. Ein überzogenes Paket soll auffallen, nicht aussehen wie ein
  fertiges.
- **Je Person, nicht nur je Paket.** `PensumSerializer.gebuchte_sekunden` kommt aus
  `sekunden_je_paket_und_person()`. Die Summe oben beantwortet nicht, wie viel
  *ich* noch offen habe, wenn der eine 270 Stunden trägt und der andere 140.

Die Summen (`sekunden_je_projekt`, `_je_paket`, `_je_paket_und_person`) werden
**einmal je Antwort** gerechnet und über den Serializer-Kontext gereicht
(`_mit_buchungssummen` in `api.py`) — für Projekt-, Phasen-, Paket- und
Pensum-ViewSet. Ohne Kontext steht 0 da; ein Test prüft den Projektbaum, nicht
nur das einzelne Paket, weil die Projektseite den Baum liest.

### Overhead quer über den Projekten

`ProjektSerializer.ist_auffang` (abgeleitet aus dem Merkmal am Paket, nicht aus
dem Titel — der wird umbenannt). Die Projektseite stellt das Projekt mit dem
Auffangpaket **vor** die anderen, in voller Breite — als Kopf mit **einem**
Knopf (`OverheadKarte`), nicht als Baum: Phase und Paket gibt es nur, weil jede
Buchung eines braucht; niemand gliedert Overhead. In den Auswahllisten bleibt es hinten (`reihenfolge` 900). Der Untertitel sagt jetzt,
was hineinfällt (`AUFFANG_UNTERTITEL`: Networking, Meetings, Gespräche) — damit
niemand ein eigenes Paket „Networking" daneben anlegt.

### Phasen haben einen Stand: offen · läuft · abgeschlossen

`Projektphase.stand` (Migration `0020`) ersetzt das Ja/Nein `abgeschlossen` aus
`0018`. Ein Ja/Nein konnte nicht sagen, ob eine Phase erst ansteht oder gerade
läuft — und genau das entscheidet, was auf der Projektseite aufgeklappt ist.
`abgeschlossen` bleibt als **Property** am Modell, damit `grund_gegen_buchung`
und die Tests weiter dieselbe Frage stellen. Die Migration übernimmt: abgeschlossen
bleibt, eine Phase mit Paketen wird „läuft", eine leere „offen" — eine Annahme,
aber die, die dem bisherigen Bild entspricht.

In `daten/sopharmis-daten.json` heißt das Feld `stand`; ein altes
`abgeschlossen: true` weist `daten_einspielen` laut ab (wie „bereiche"), weil
eine still übergangene Sperre eine Phase wieder Zeit annehmen ließe.

**Aufgeklappt ist, was läuft** — Phasen mit `stand == laeuft`, Pakete mit gebuchter
Zeit oder Status „läuft". Der Zustand lebt nur in der Komponente (kein Feld, kein
`localStorage`): Beim nächsten Öffnen gilt wieder die Regel.

---

## 2026-09-15 — Zeit nachtragen: der 400er, die Felder, mehrere Personen

### Der Fehler: `person` war ein Pflichtfeld

Jedes Nachtragen endete mit **400 „Dieses Feld ist zwingend erforderlich"** — über
einem Feld, das das Formular gar nicht kennt. `ZeitbuchungSerializer` ist ein
`ModelSerializer`; `Zeitbuchung.person` ist ein FK ohne `null`, also war das Feld
verpflichtend. `perform_create` hätte die Person aus der Sitzung gesetzt
(`validated_data.get("person") or request.user`) — nur kam es nie so weit, weil die
Prüfung davor abbrach.

Jetzt steht `person` ausdrücklich als `PrimaryKeyRelatedField(required=False)` im
Serializer. **Kein `read_only`**: Wer fremde Zeiten ändern darf, soll auch für
andere nachtragen können, und die Prüfung dafür steht schon in `_pruefe_fremde`.

Gefehlt hat der Test: Getestet waren `clock_in`, `clock_out`, `entwurf_bestaetigen`
und PATCH — der gewöhnliche POST auf `/api/zeiten/` nicht. `TestNachtragen` in
`test_api.py` deckt ihn jetzt ab, in beiden Richtungen (mit und ohne Person).

### Mehrere Personen, eine Spanne — im Frontend, nicht am Server

An einem Meeting sitzen zwei oder drei. Das Formular schickt deshalb **eine Anfrage
je angehakter Person**, nacheinander.

Kein Sammelaufruf am Server: Paket und Spanne sind für alle dieselben, was
schiefgehen kann (Paket weg, Spanne verdreht, Recht fehlt) trifft also entweder
alle oder keinen. Ein zweiter Weg, auf dem Buchungen entstehen, wäre ein zweiter
Weg, den man beim nächsten Feld vergisst.

**Überschneidungen sind erlaubt und bleiben es.** Die einzige Bedingung in der
Datenbank ist „höchstens eine **laufende** Buchung je Person"; zwei abgeschlossene
Buchungen zur selben Zeit sind fachlich in Ordnung (zwei Projekte in einem Termin)
und werden nicht abgewiesen.

### Tag + zwei Uhrzeiten statt zweimal `datetime-local`

Zwei `datetime-local` heißt: der Tag steht zweimal da und beide müssen stimmen. Wer
nur im ersten Feld das Datum ändert, bucht eine Spanne über Wochen — und sieht es
nicht. Jetzt: ein `date`, zwei `time`, die Dauer als Satz darunter, dazu Knöpfe für
15 min bis 8 h, die das Ende vom Beginn aus setzen.

**Ein Ende, das nicht nach dem Beginn liegt, gilt als Folgetag** (`spanne()` in
`basis/zeit.ts`, getestet). Ohne diese Regel ließe sich 22:00–01:00 gar nicht
eintragen. Damit es nicht still geschieht, nennt der Satz unter den Feldern den Tag
des Endes.

Dieselben Felder nimmt „Buchung ändern"; die laufende Buchung darf „bis" leer
lassen. Die Entwurfszeile fragt nur noch die **Uhrzeit** — der Tag ist der des
Beginns und kann nichts anderes sein.

### `bausteine/Paketwahl.tsx` — ein Feld mit Suche statt `<select>`

Zugeklappt zeigte das Auswahlmenü eine Zeile, und die hieß oft „Allgemein"; zu
welchem Projekt das gehört, stand im Gruppenkopf, den man zugeklappt nicht sieht.
Aufgeklappt war es der ganze Projektbaum ohne Suche, am Handy ein Rad des
Betriebssystems.

Die Wahl steht jetzt an **einer** Stelle und wird an drei Plätzen benutzt
(nachtragen, ändern, Clock-out). Gesucht wird wortweise über Projekt **und** Paket
(`paketeSuchen` in `basis/start.ts`, getestet); die zuletzt bebuchten Pakete stehen
oben und liefern auch die Vorauswahl beim Nachtragen.

### Kleinigkeiten

- `.paketwahl` hat **kein** `flex-basis`: In der Spalte `.feldblock` wäre das eine
  Höhe, und die Wahl stünde mit 240 px Luft unter ihrer Beschriftung. Genau so ist
  es beim ersten Versuch auch ausgesehen.
- Die Liste liegt auf `z-index: 86`, ihr Klickfänger auf 85 — über dem Dialog (80),
  sonst ginge sie in „Buchung ändern" nicht mehr zu.

---

## 2026-09-15 — Die Ideenliste (`Aufgabe.ist_idee`, Migration 0016)

### Kein eigenes Modell `Idee`

Der naheliegende Weg wäre eine zweite Tabelle gewesen — **genau den nicht.** Eine
Idee ist dasselbe wie eine Aufgabe, solange niemand entschieden hat, dass sie
getan wird: eine Zeile Text, eine Einschätzung, ein Haken. Der Unterschied ist
ein Zustand, kein Ding.

Was ein Kennzeichen an derselben Tabelle mitbringt:

- **„Das machen wir" ist ein PATCH.** Mit zwei Tabellen wäre es Löschen plus
  Anlegen — und damit eine neue Kennung, ein abgetippter Text und ein
  Änderungsprotokoll, das an der Stelle abreißt, an der die interessante Frage
  steht: *wer hat das entschieden.*
- **Sicherung, Protokoll und Berechtigung gelten ohne Zutun weiter.** Ein neues
  Modell müsste in `sicherung.py` (zwei Listen), in der Löschreihenfolge und in
  einem eigenen ViewSet nachgetragen werden. Drei Stellen, an denen ein
  Vergessen erst beim Wiederherstellen auffällt.

Der Preis: `erledigt` heißt auf der Ideenliste „vom Tisch" statt „erledigt". Das
ist dieselbe Aussage — *nicht mehr offen* —, nur in einem anderen Zusammenhang
gelesen; die Beschriftung sagt es, das Feld muss es nicht.

### Eine Unterseite, keine vierte Spalte

Eine Spalte „Ideen" neben den Personen stünde jeden Tag im Blick und wüchse mit
der Zeit länger als alle anderen zusammen. Dann sieht man die Tafel nicht mehr —
und die Tafel ist das, was *jetzt* zu tun ist. Deshalb `/aufgaben/ideen` und auf
der Tafel nur ein Knopf mit der Zahl der offenen Ideen.

Die Liste hat **keine Spalten je Person**: Wer eine Idee macht, ist ja gerade
die Frage, die noch offen ist. „Auf die Tafel" landet darum immer in
„Allgemein". Eine Personenauswahl an dieser Stelle wäre der einzige Ort in der
Anwendung, an dem eine Aufgabe doch die Spalte wechselt — und damit die Ausnahme
von der Regel, die die Tafel klein hält.

### Kein `?idee=` an der API

Tafel und Ideenliste kommen aus **einer** Antwort (`/api/aufgaben/`) und werden
in `basis/aufgaben.ts` getrennt — dort steht ohnehin die Sortierung. Ein Filter
am Server hätte keinen Aufrufer. Der Filter sitzt in `spalten()` selbst und
nicht beim Aufrufer: Eine durchgerutschte Idee sähe auf der Tafel aus wie jede
andere Zeile, und niemand fände den Grund (`aufgaben.test.ts` prüft beide
Richtungen).

---

## 2026-09-15 — Meetings (`Meeting`, `Meetingabschnitt`, Migration 0015)

### Ein Meeting hängt an nichts

Personen (`kontakte`) und Häuser (`organisationen`) sind **zwei Mengen, beide
optional** — kein Besitzer, kein Pflichtfeld. So entsteht ein Meeting im Alltag:
Zuerst steht der Termin, dann erst, wer kommt. Ein Pflichtfeld hätte dazu
geführt, dass man beim Anlegen irgendetwas einträgt, und das stünde danach
falsch im Verlauf.

**Nachgetragen gehören sie trotzdem** — nur über sie taucht das Meeting beim
Kontakt auf. Danach fragt die Oberfläche (ein Satz statt eines Gedankenstrichs,
solange nichts eingetragen ist), nicht die Datenbank.

Ein M2M kennt kein `on_delete=PROTECT`. Eine weich gelöschte Person bleibt
deshalb am Meeting stehen — **und das ist richtig so**: Sie war dort. Ein
Protokoll, das seine Teilnehmer im Nachhinein verliert, ist keines mehr.

### Drei Texte, drei Leben

`vorbereitung` (vorher, in Ruhe), `mitschrift` (währenddessen, schnell), die
Abschnitte (danach, gegliedert). Die Mitschrift wird beim Aufbereiten **nicht**
überschrieben: Sie ist die einzige Stelle, an der nachzulesen wäre, ob beim
Glattziehen etwas verrutscht ist. Steht ein Protokoll, rückt es in der Ansicht
nach oben; Vorbereitung und Mitschrift klappen zugeklappt ans Ende, in ihrer
Reihenfolge.

**„Verwerfen" ist kein eigener Endpunkt.** Es ist `POST …/protokoll/` mit einer
leeren Liste — dasselbe Ersetzen wie beim Übernehmen, nur durch nichts. Darf,
wer übernehmen darf (Bearbeiter): Es ist der Rückweg aus dem eigenen Schritt,
kein Löschen im Sinn der Rollen. Die Abschnitte sind danach weich gelöscht.

### `protokoll_ohne` — zwei Felder stehen nicht im Änderungsprotokoll

Vorbereitung und Mitschrift speichern sich beim Tippen selbst. Jede Schreibpause
schriebe sonst einen Protokolleintrag mit dem ganzen alten *und* dem ganzen
neuen Text; nach einer Stunde Mitschreiben ginge darin jeder echte Vorgang
unter. Was am **fertigen** Protokoll geändert wird, steht vollständig drin —
das sind die Abschnitte, und die schreibt niemand im Sekundentakt.

Umgesetzt als Klassenattribut am Modell, nicht als Eintrag in
`FELDER_OHNE_PROTOKOLL`: Ein global gesperrter Feldname träfe still auch das
gleichnamige Feld eines anderen Modells.

### Der Weg über ein LLM führt über die Zwischenablage

**SoCoS ruft kein Sprachmodell auf.** Was in einer Mitschrift steht, geht keinen
Dienst etwas an, den wir nicht selbst gewählt haben — und ein eingebauter Aufruf
wäre ein Schlüssel, eine Abrechnung und eine Abhängigkeit für drei Nutzer. Der
Kopierknopf legt Auftrag und Mitschrift in die Zwischenablage; wohin das
eingefügt wird, entscheidet der Mensch, der es sieht.

Auftrag und Parser stehen **in derselben Datei** (`frontend/src/basis/
meetings.ts`), weil sie dasselbe Format beschreiben. Stünde die eine Hälfte im
Backend, hätte sie beim nächsten Nachbessern ein Format, das die andere nicht
mehr liest — und auffallen würde es an einem Protokoll, das als ein Klumpen
hereinkommt.

Zwei Festlegungen im Auftrag, die nicht kosmetisch sind:

- **Die Vorbereitung geht mit — in einem eigenen Block, mit eigener Regel.**
  (Bis 2026-09-17 ging sie bewusst nicht mit.) Sie ist der Plan, nicht das
  Gespräch; läge sie unmarkiert neben der Mitschrift, machte das Modell aus
  „wollten wir ansprechen" still ein „wurde besprochen". Deshalb steht sie
  getrennt und beschriftet, und die Regel sagt, wofür sie da ist: Namen,
  Abkürzungen, Zusammenhang — und ein letzter Abschnitt „Nicht zur Sprache
  gekommen" für das, was geplant war und nicht vorkam. Das ist der Grund, sie
  mitzuschicken: Daran misst sich die Vorbereitung hinterher.
- **Was vor der ersten Überschrift steht, wird ein Abschnitt ohne Titel.** Ein
  Modell, das sich nicht an das Format hält, darf keinen Text kosten; sonst
  verschwände er genau dann, wenn man hinsehen müsste.

Ein zweiter Durchlauf **ersetzt** das Protokoll (mit Nachfrage), statt anzuhängen:
Wer noch einmal aufbereiten lässt, will das Ergebnis, nicht beides untereinander.

### `Meeting.delete()` nimmt die Abschnitte mit

Weiches Löschen ist ein UPDATE — `on_delete=CASCADE` löst dabei nie aus. Ohne
die eigene `delete()` bliebe das Protokoll als Satz Abschnitte zurück, die auf
nichts Sichtbares mehr zeigen. Erst das Meeting, dann die Abschnitte: Wehrt sich
das Meeting, bleiben sie unangetastet.

Und CASCADE statt des sonst üblichen PROTECT: Ein Abschnitt hat außerhalb seines
Meetings kein Leben. „Erst das Protokoll löschen" wäre die falsche Nachfrage.

### Verschoben wird am Server

`POST /api/meetingabschnitte/<id>/verschieben/`. Ein Tausch zweier
`reihenfolge`-Werte im Frontend bewegte nichts, wenn beide gleich sind — und das
sind sie bei von Hand angefügten Abschnitten. Der Server nummeriert die ganze
Liste in ihrer sichtbaren Ordnung neu durch; danach ist der Tausch immer echt.

### Meetings stehen im Verlauf, gespeichert werden sie nur einmal

`Verlaufszeile` (frontend/src/basis/kontakte.ts) hat ein Feld `quelle` und
kommt aus einem Verlaufseintrag **oder** aus einem Meeting. „Was war mit diesem
Haus zuletzt?" ist eine Frage mit einer Antwort; zwei Listen untereinander
hießen, sie beim Lesen im Kopf zusammenzuführen. Das Meeting selbst steht nur
auf seiner Seite — die Zeile im Verlauf ist ein Verweis mit einem Pfeil, kein
zweiter Datensatz.

Die Verlaufsart „Meeting" bleibt daneben bestehen: Für ein Telefonat von drei
Sätzen ist eine eigene Seite zu viel.

`letzter_kontakt` am Kontakt zählt Meetings mit — sonst stünde eine Person als
„seit Monaten nichts" da, mit der man vorige Woche eine Stunde geredet hat.

### Das Feld, das sich selbst speichert (`basis/entwurf.ts`)

Gespeichert wird nach 1,5 s Schreibpause, beim Verlassen des Feldes, beim
Wechsel in den Hintergrund (`visibilitychange` — am Handy jeder App-Wechsel),
bei `pagehide` und beim Abbauen des Feldes. Solange etwas offen ist, hält
`beforeunload` den Browser an; das ist die einzige Stelle, an der wirklich etwas
verlorengehen könnte.

**Der Server ist der Zwischenspeicher, nicht `localStorage`:** Ein Entwurf im
Browser liegt auf genau einem Gerät. Wer am Laptop mitschreibt und am Handy
nachsieht, fände dort nichts — und merkte es, wenn er es braucht.

**Die Falle:** Nach dem Speichern lädt die Liste neu und schickt denselben Wert
zurück herein. Ein Übernehmen ohne Prüfung nähme jemandem den Satz unter den
Fingern weg. Übernommen wird nur, solange nichts Eigenes offen ist.

Die Meetingseite bekommt `key={meeting.id}`: Ohne den trüge das Feld beim
Wechsel die Mitschrift des vorigen Meetings weiter — und speicherte sie beim
nächsten Tastendruck am falschen Ort.

### Kleinigkeiten

- `uhrzeit` ist nullbar und `ordering` sortiert sie mit `nulls_last`: „irgendwann
  am Dienstag" stünde sonst über „Dienstag 16:00".
- Der heutige Tag zählt zu „Kommend", bis er vorbei ist. Ein Meeting um 16:00
  gehört am Morgen nicht unter „Gewesen".
- **Start liegt auf dem Logo.** Der eigene Menüeintrag kostete eine Zeile in
  einer Leiste, die mit jeder Rubrik länger wird; ein Signet, das zur
  Startseite führt, ist ohnehin das, was jeder zuerst anklickt. Am Handy bleibt
  „Start" in der Fußleiste — dort ist das Logo erst zu sehen, wenn die
  Schublade offen ist.

### Was bewusst nicht gebaut wurde

- **Kein Kalender, keine Erinnerung, keine Einladung.** Ein Meeting ist ein
  Zettel mit einem Datum, kein Termin mit Benachrichtigung (siehe auch Event).
- **Keine Anhänge.** Käme das, müsste es unter `MEDIA_ROOT` liegen, sonst
  wandert es nicht in die Sicherung.
- **Keine Aufgaben aus dem Protokoll.** „Nächste Schritte" ist ein Abschnitt,
  keine Verknüpfung auf die Aufgabentafel. Die Verbindung wäre reizvoll und
  wäre der zweite Ort, an dem dieselbe Zusage steht.

---

## 2026-09-14 — Die Aufgabentafel (`Aufgabe`, Migration 0014)

### Warum überhaupt ein eigenes Modell

Gesucht war „eine stumpfe Liste": allgemeine Punkte, dazu je Person eine Spalte,
alle sehen alles. Der naheliegende Weg wäre gewesen, das an die vorhandene
`Unteraufgabe` zu hängen — **genau den nicht:** Die hängt an einem Arbeitspaket
und ist Projektarbeit. Ein „ohne Paket" daneben hieße, dass dieselbe Tabelle zwei
Dinge bedeutet, und jede Projektauswertung müsste ab da beide auseinanderhalten.

### `person = NULL` heißt „Allgemein"

Kein zweites Feld `ist_allgemein` daneben. Zwei Zustände für dieselbe Auskunft
können sich widersprechen, und dann entscheidet die Reihenfolge im Code, welcher
gilt.

`on_delete=SET_NULL` und nicht PROTECT: Nutzer werden nicht gelöscht, sondern
stillgelegt (`is_active`) — der Fall tritt also praktisch nie ein. Tritt er doch
ein (Einspielen einer Sicherung), ist eine Aufgabe ohne Person immer noch eine
lesbare Zeile, während PROTECT das Leeren blockieren würde.

### Drei Prioritätsstufen, kein „offen"

Die Organisation hat vier (`Prioritaet`, mit „noch nicht eingeschätzt"). Die
Aufgabe hat drei, weil die Priorität hier **mit einem Tipp weitergedreht** wird:
Ein Rundlauf über vier Werte ist einer zu viel, um ihn im Vorbeigehen zu treffen.
Wer eine Aufgabe aufschreibt, hat sie außerdem schon eingeschätzt — im Zweifel
als „mittel", und das ist die Vorgabe.

### Sortiert wird im Frontend (`basis/aufgaben.ts`)

In der Datenbank stünden „gering", „hoch", „mittel" alphabetisch — also genau
falsch. Ein `ORDER BY CASE` wäre ein zweiter Ort für den Rang der Stufen; er
liefe beim nächsten Anfassen gegen `PRIORITAETEN` auseinander, und auffallen
würde es niemandem.

Innerhalb einer Stufe steht **das Neueste oben**, nicht das Älteste: Das
Schreibfeld steht oben, und eine gerade eingetippte Zeile, die unten anklebt,
tippt man im Zweifel ein zweites Mal.

### Zugeklappte Spalten stehen im Browser, nicht am Server

`localStorage` unter `socos.aufgaben.zugeklappt`. Es ist keine Auskunft über die
Aufgaben, sondern darüber, wie einer von dreien gerade sitzt. Am Server wäre es
eine Einstellung, die alle drei teilen — und dann klappt einer dem anderen die
Spalte zu. Der Preis: An einem zweiten Gerät steht die Tafel wieder offen. Das
ist der billigere Fehler.

### Was die Tafel bewusst nicht hat

Kein Fälligkeitsdatum (seit 2026-09-22 doch eine freiwillige Frist, siehe dort),
keine Beschreibung, kein Verweis auf ein Arbeitspaket,
kein Verschieben zwischen Spalten, kein Feld „erledigt von". Das Letzte braucht
sie nicht: Das Änderungsprotokoll hängt an jedem Fachmodell und damit auch hier
(`test_aufgaben.py` prüft genau das).

Weiches Löschen gibt es wie überall, aber **keinen Knopf dafür in der Tafel** —
abgehakt wird mit dem Haken, und das genügt für einen Vertipper. Entfernen ist
Adminsache und geht über die API.

---

## 2026-09-14 — Die Uhr darf ohne Paket starten (Auffangpaket „Overhead")

### Warum

Die Uhr verlangte vor dem ersten Tick eine Entscheidung: auf welches Arbeitspaket?
Im Alltag steht die Entscheidung am Ende, nicht am Anfang — man fängt an und weiß
erst danach, woran man gearbeitet hat. Wer nicht suchen will, bucht gar nicht, und
dann fehlt die Stunde ganz.

### Eine Buchung ohne Paket gibt es weiterhin nicht

Der naheliegende Weg wäre `Zeitbuchung.paket = null` gewesen. **Genau den nicht:**
Dann gäbe es zwei Arten von Buchungen, und jede Auswertung, jeder Nachweis und jede
Summe müsste beide kennen — dieselbe Begründung, aus der „Overhead" schon immer ein
gewöhnliches Projekt ist und kein Sonderfall im Code.

Stattdessen: `clock_in` **ohne** `paket` bucht auf das **Auffangpaket**. Das ist ein
ganz normales Paket in einem ganz normalen Projekt; ab da ist die Buchung von jeder
anderen ununterscheidbar.

### `Arbeitspaket.ist_auffang` — ein Merkmal, kein Titelvergleich

Migration `0013`. Genau ein Paket im Bestand trägt es.

**Warum nicht `Projekt.objects.filter(titel="Overhead")`:** Ein Titel wird umbenannt.
Danach legte der nächste Klick still ein zweites Overhead-Projekt an — zwei Töpfe mit
demselben Namen, die Zeit auf beide verteilt, und in keiner Auswertung fiele das auf.
Das Merkmal überlebt jede Umbenennung.

**Es gibt keine DB-Bedingung „höchstens eines".** Bewusst: Der Schaden bei zweien wäre
ein Topf zu viel, kein falscher Wert — dafür lohnt kein partieller Index. Gelesen wird
ohnehin nur über `auffangpaket()` (in `socos/models.py`), und die nimmt das älteste.

**Angelegt wird beim ersten Griff, nicht in einer Migration.** Eine Migration legte es
auch dort an, wo nie jemand den Knopf drückt. Gibt es schon ein Projekt „Overhead",
wird das benutzt statt ein zweites daneben zu stellen — genau der Fall auf dem Server,
wo eines von Hand existiert.

### Umgebucht wird an zwei Stellen, und beide sind dieselbe Frage

- **Beim Clock-out**: Das Paket steht als Auswahlfeld im Notizfenster. Der Clock-out
  ist der Moment, in dem man es weiß.
- **In der Buchungsliste**: „Ändern" öffnet jetzt auch das Paket — **für jede
  Buchung**, nicht nur für die von Overhead. Ein Fehlgriff beim Start war vorher nur
  über Entfernen und Nachtragen zu beheben, und das ist zweimal Protokoll für eine
  Korrektur.

Serverseitig war dafür nichts nötig: `paket` war im `ZeitbuchungSerializer` immer
schreibbar. `clock_out` nimmt es neu entgegen.

### Die Falle im Auswahlfeld

Die Feldliste zeigt nur **buchbare** Pakete (nicht `fertig`/`verworfen`). Beim Ändern
einer alten Buchung hängt die aber vielleicht an genau so einem — ohne Ausnahme
verschwände es aus dem Feld, und **Speichern schöbe die Zeit still auf das erstbeste
andere**. Deshalb nimmt `paketgruppen(projekte, auch)` das Paket der Buchung
ausdrücklich mit auf.

### Kleinigkeiten

- `frontend/src/basis/uhr.ts`: `clockIn`/`clockOut` an einer Stelle. Vier Plätze
  starten die Uhr inzwischen; vier eigene `hole`-Aufrufe liefen beim nächsten Feld
  auseinander.
- Am Handy verschwindet „Keine Buchung läuft" aus der Uhrzeile, sobald dort zwei
  Knöpfe stehen — der Satz sagt nichts, was die stehende Uhr und der graue Punkt
  nicht schon sagen.

---

## 2026-09-13 — Das Zeichen bekommt einen Rand und einen Untergrund

### Warum

Am iPhone sah das Signet auf dem Homescreen schlecht aus. Der Befund war kein
Farbproblem: Der oberste Balken stand bei `y = 4` und lief von `x = 12` bis
`52`. iOS rundet die Kachel mit rund 22 % der Kante und beschneidet sie
zusätzlich als Superellipse — genau dort verlor der breiteste Balken beide
Enden, und weil die Treppe bündig links steht, kippte das Zeichen zusätzlich
nach links.

### Was jetzt gilt

**Die Treppe hat ringsum Luft.** Der Abstand zwischen den Balken geht von 8 auf
4, die Treppe wird damit 44 statt 56 hoch und sitzt bei y 12..56, x 12..52.

**Oben 12, unten 8 — und das ist keine Schlamperei.** Auf einem Raster von 4
ist der Schritt von Balken zu Balken zwangsläufig 12, die Treppe also 44 hoch;
die übrigen 20 Einheiten teilen sich nur in 12/8 oder 8/12. Der breiteste
Balken steht oben und läuft als einziger in die Rundung — er bekommt den
größeren Rand. 10/10 ist auf diesem Raster nicht erreichbar, und ein krummer
Wert wäre der teurere Fehler (siehe unten).

**Der Untergrund ist „Terrazzo":** `#072B2D` mit 26 gestreuten Quadraten aus der
Palette. Sie stehen als **feste Liste** in `socos/marke.py`, nicht als Zufall
zur Laufzeit — sonst sähe jeder Lauf von `manage.py symbole` anders aus, und
der Unterschied fiele erst im Reiter neben einem alten Lesezeichen auf. Die
Deckung der Entwürfe ist in die Farbwerte gerechnet, weil PIL und ein Browser
sonst zweimal dieselbe Mischung treffen müssten und es nicht täten.

**Kein Splitter liegt im Feld der Balken** (`SCHUTZHOF`, x 10..54, y 10..58).
Ohne diesen Hof wäre das Zeichen bei 16 px ein gesprenkeltes Quadrat statt
vier Balken.

### Zwei Fallen

**`x = 14` war die erste Fassung — und falsch.** 14 ist nicht durch 4 teilbar;
bei 16 px hätte jede linke Balkenkante auf einem halben Pixel gelegen. Genau
der Fehler von 2026-09-08, im zweiten Anlauf wiedergekommen. Gefangen hat ihn
`socos/tests/test_marke.py`, der neu dazu ist und beides prüft: dass alle Maße
durch 4 teilbar sind und dass kein Balken in den Rand von 8 läuft.

**Der PDF-Kopf zeichnete nur `BALKEN`.** Mit einem Untergrund wären daraus
zwei Zeichen geworden, und das zweite wäre erst auf einem Blatt aufgefallen,
das schon verschickt ist. SVG, PIL und `services/zeitnachweis.py` gehen jetzt
alle durch `marke.flaechen()`.

---

## 2026-09-13 — Das Fragezeichen ist weg: Doku, Neuigkeiten, Wünsche & Fehler

### Warum

Die Erklärungen hingen als `?` neben einzelnen Beschriftungen — zwölf Stück, verteilt
über acht Dateien. Das ist die richtige Form für „was heißt dieses Feld" und die
falsche für „wie arbeite ich damit": Wer die Frage stellt, bevor er auf der Seite
steht, findet die Antwort dort nicht, und wer sie zweimal gelesen hat, überfährt sie
nie wieder. Dazu kam: Was jemandem an der Software auffiel, blieb ein Zuruf über den
Tisch, und was sich geändert hatte, merkte man daran, dass ein Knopf woanders war.

Drei Dinge, eine Gruppe in der Leiste: **Software · Doku** und **Software · Wünsche
& Fehler**, dazu ein Fenster nach der Anmeldung.

### Die Änderungsliste steht im Quelltext, nicht in der Datenbank

`socos/aenderungen.py` ist die **einzige** Liste. Aus ihr leben beide Seiten: das
Fenster, das jeder einmal je Änderung sieht, und die Rubrik „Änderungen" in der Doku.

**Warum nicht als Modell:** Ein Eintrag gehört zu einem Deploy, nicht zu einem
Bestand. Er entsteht im selben Commit wie die Änderung, wandert mit ihr auf den
Server und ist auf einer frisch aufgesetzten Datenbank sofort da. Als Tabelle müsste
ihn jemand nach dem Deploy von Hand nachtragen — und genau das passiert beim dritten
Mal nicht mehr.

**Die Version ist das Datum** (`JJJJ-MM-TT`). Sie sortiert sich selbst, beantwortet
nebenbei „seit wann", und der Vergleich „was ist für diesen Nutzer neu" ist ein
Zeichenkettenvergleich. Zwei Änderungen an einem Tag bekommen **einen** Eintrag mit
zwei Punkten.

### Warum `neuigkeiten_bis` eine Version ist und kein Zeitstempel

`Nutzer.neuigkeiten_bis` merkt sich die zuletzt bestätigte **Version**, nicht den
Moment des Ansehens. Mit einem Zeitstempel entschiede die Uhr darüber, ob jemand eine
Änderung kennt, die vor seinem letzten Besuch veröffentlicht wurde — und nach einer
Zeitumstellung oder einem Restore wäre die Antwort eine andere.

Bestätigt wird immer bis `NEUESTE`, auch wenn jemand nach der ersten Seite schließt:
Sonst stünde das Fenster beim nächsten Anmelden wieder da, und die Zusage „einmal und
nie wieder" wäre keine. Was jemand überspringt, steht in der Doku.

**Neue Konten starten auf `NEUESTE`** (`NutzerVerwaltung.create_user`). Wer heute
dazukommt, braucht keine Führung durch die Änderungen der Monate davor — für ihn ist
nichts davon neu, es ist einfach die Anwendung.

### Wünsche & Fehler: die einzige Stelle, an der ein Leser schreibt

`Rueckmeldung` (Art · Titel · Text · Melder · Stand · Antwort · `erledigt_in`).

- **Melden darf jede Rolle** — `berechtigung.darf_melden` gilt für alle drei, auch für
  den Leser. Wem ein Fehler auffällt, der soll ihn melden können; was dabei entsteht,
  ist keine Fachinformation, sondern ein Zettel an uns. Dafür gibt es eine eigene
  Berechtigungsklasse (`RueckmeldungsBerechtigung`), weil die gemeinsame beim
  Schreiben `darf_bearbeiten` verlangt.
- **Stand, Antwort und Version setzt nur ein Admin.** Die Prüfung sitzt im
  Serializer und ist **feldweise** (`ADMINFELDER`): Ein Melder darf seinen eigenen
  Text nachschärfen, aber nicht nebenbei auf „erledigt" setzen. Fremde Texte fasst
  nur ein Admin an — das prüft das ViewSet, weil es dafür das Objekt braucht.
- **`erledigt_in` ist eine Zeichenkette, kein Verweis.** Die Versionen stehen im
  Quelltext; ein Fremdschlüssel bräuchte eine zweite Liste in der Datenbank daneben.
  Die Ansicht bündelt Erledigtes **nach dieser Version** — „was kam mit dem letzten
  Update?" ist die Frage, die dort gestellt wird.
- Abgelehntes zählt **nicht** zu den offenen Punkten. Ein Wunsch, der nicht kommt,
  muss das sagen dürfen, sonst steht er für immer auf „neu" und niemand traut der
  Liste mehr.

### Kleinigkeiten, die Zeit gekostet hätten

- **`.meldung` war schon vergeben** — das ist der kurze Hinweis, der oben rechts
  aufgeht. Die Liste der Wünsche heißt im Stil deshalb `.zettel`.
- Das Fenster nach der Anmeldung ist **eine Seite je Punkt**. Drei Absätze
  hintereinander liest niemand zu Ende; die Punkte darunter sagen ohne Lesen, wie
  viel noch kommt.
- Ob jemand Rückmeldungen verwalten darf, kommt aus `/api/ich/`
  (`darf.rueckmeldungen_verwalten`) und **nicht** aus `ich.rolle === "admin"` im
  Frontend. Sonst stünde eine Schwelle an einer zweiten Stelle.

---

## 2026-09-12 — Neue visuelle Sprache: Entwurf „Werkbank" (Etappe 1 von 3)

### Warum überhaupt

Bernd war mit Farbe, Schrift, Kontrast und Interaktivität unzufrieden. Aus zwei
Entwürfen (A „Ruhig" — gleiche Struktur, nur optimiert; B „Werkbank" —
Seitenleiste statt Kopfleiste) ist **B** gewählt worden. Die Entwürfe liegen als
Design-Canvas in `entwurf/redesign/` (Arbeitsdateien) und als Artefakt unter
`claude.ai/code/artifact/73c6181d-5e37-4e19-8ac5-a8c26ddfe79d`.

**Das ersetzt die bis dahin verbindliche visuelle Sprache** aus
`entwurf/Sopharmis Internal v6 leer.dc.html` (Figtree, `#0F4448`/`#EFEDE6`).
CLAUDE.md ist im selben Zug nachgezogen. Der alte Entwurf bleibt liegen — er ist
weiterhin die Quelle für *Layout und Beschriftungen*, nur nicht mehr für Farbe
und Schrift.

### „Kontrast stört mich" waren drei Fehler, nicht einer

Gemessen, nicht geschätzt:

1. **Die Fläche trennte nicht.** Karte zu Seitengrund **1,17:1**, Kante zu Karte
   **1,38:1** — Beige, Weiß und Rand lagen in einem Band. Jetzt Grund `#FAFAF7`,
   Kante `#D2CCBC` (**1,60:1**), und die Trennung trägt die Kante, nicht die
   Erhebung; Schatten gibt es keine.
2. **Die Kopfleiste schlug zu laut an.** Inaktive Einträge auf **4,82:1** (knapp
   über der Schwelle, also mühsam), aktiv als cremefarbener Block `#E8D9BE` —
   der hellste Fleck der Seite saß dort, wo man nicht hinsieht. Jetzt inaktiv
   auf **6,77:1**, aktiv ein ruhig aufgehellter Block mit Kupferkante unten.
3. **Elf Pixel, gesperrt, in Versalien** — und zwar **elfmal in bausteine.css
   einzeln hingeschrieben**. Das war der eigentliche Befund: Wer den Ton ändert,
   ändert ihn an einer Stelle und übersieht zehn. Jetzt **eine** Regel
   (`.karte > h2, .kennzahl .beschriftung, .tabelle th, …`), 12,5 px in
   gemischter Schreibung.

### Die Falle, die zweimal zugeschlagen hat

**Ein Textton muss gegen *jeden* Untergrund gerechnet werden, auf dem er steht —
nicht nur gegen Weiß.** `--text-sehr-leise` stand erst auf `#6F7671`: hält 4,66:1
auf Weiß und fällt auf dem Seitengrund (4,46) und auf der leisen Fläche (4,16)
durch. `#69706B` hält alle drei. Genau dieser Fehler stand in der Vorfassung von
`farben.css` schon einmal kommentiert und ist wiedergekommen, weil beim zweiten
Anlauf wieder nur gegen Weiß geprüft wurde.

Dasselbe bei `--ruhend`: als Punkt unauffällig, als **Text** auf
`--ruhend-hell` (`.status-verworfen`) nur **2,86:1**. Auf `#6B6F6B` gesetzt.

Alle 25 Paare (Text, Marke, Akzent, vier Zustände, Leiste) sind in beiden Themen
gerechnet und liegen über 4,5:1.

### Was die Farben jetzt bedeuten

**Das Kupfer führt, das Grün zieht sich in die Leiste zurück.** Vorher trugen
Grün, Kupfer, Grün-Hell, Creme und vier Zustandsfarben gleichzeitig Bedeutung,
und keine stach heraus, weil alle es taten. Jetzt heißt `--akzent` (`#A2552C`)
„das ist die Handlung"; `--marke` (`#0D4E52`) bleibt für Verweise und den
Zustand „läuft"; die Leiste ist in **beiden** Themen dunkel.

Daraus folgen zwei neue Namen in `farben.css`: `--kopf-aktiv-text` und
`--kopf-kante`. Grund: `--auf-marke` und `--akzent` kippen zwischen den Themen,
die Leiste nicht — wer dort `--marke-dunkel` benutzt, bekommt im dunklen Thema
Hell auf Hell. Das ist an drei Stellen tatsächlich passiert (`.uhr-knopf:hover`,
`.kopf-knopf[aria-current]`, die Initialen in `.profil i` / `.personen i`) und
dort behoben; die Initialen stehen jetzt auf `--marke-tiefer`, dem einzigen Ton,
der in beiden Themen dunkel ist.

### Schrift: Archivo statt Figtree, und sie liegt lokal

Archivo läuft enger und kantiger — bei 14 px Grundgröße (vorher 15) passt in
eine Tabellenzeile spürbar mehr, ohne dass sie gedrängt wirkt.

**Die Schriften kommen nicht mehr von Google** (`statisch/schriften.css`, 11
woff2-Schnitte, 294 kB). Ein Verweis auf `fonts.googleapis.com` meldet bei jedem
Seitenaufruf die IP des Nutzers an einen Dritten; in einem MedTech-Umfeld ist das
kein theoretisches Argument. Nur `latin` und `latin-ext` — `latin-ext` bleibt,
weil darin die tschechischen, polnischen und ungarischen Zeichen stehen, die in
Kontaktnamen vorkommen. Feste Pfade statt `{% static %}`, dieselbe Begründung
wie beim Favicon: Die Anmeldeseite muss stehen, bevor `collectstatic` gelaufen ist.

### Entschieden, nicht offen

- **Start bleibt eine eigene Seite** und bekommt in Etappe 2 einen Menüeintrag
  ganz oben. Mit Seitenleiste gibt es kein Logo mehr zum Klicken — heute ist das
  der einzige Weg dorthin.
- **Menügruppen heißen „Intern" (Dashboard, Projekt, Zeit) und „Extern"
  (Kontakte, Events).** „Arbeit"/„Leute" trennte nicht sauber: Zeit ist auch
  Leute, Events sind auch Arbeit.
- **Die Seitenleiste ist am Rechner fest 232 px, ohne Einklappknopf.** Eingeklappt
  wird nur am Handy — dort ist sie ohnehin eine Fußleiste mit fünf Einträgen.
- **Kontostand wird ein Liniendiagramm** mit gestrichelter Fortschreibung. Die
  Fortschreibung benutzt *dieselbe* Formel wie die Kennzahl Runway
  (Kontostand ÷ erwartete Monatskosten) — zwei Darstellungen desselben Werts,
  die sich widersprechen, wären schlimmer als eine weniger. Selbst gezeichnetes
  SVG, kein Diagrammpaket (dieselbe Regel wie bei den Zeichen).

### Etappe 2: die Seitenleiste (2026-09-12)

`Kopf.tsx` heißt jetzt `Seitenleiste.tsx`. Das Menü steht als **eine** Liste
(`GRUPPEN`) da; die vier Abkürzungen der Fußleiste am Handy (`FUSS`) nennen nur
Seitennamen und suchen Zeichen und Titel dort heraus — sonst hätte ein
umbenannter Eintrag am Handy noch den alten Namen.

Am Handy wird dieselbe Leiste zur Schublade hinter „Mehr" — kein zweites Menü.
Die Uhr ist ein eigener Baustein (`Uhrblock`) und steht an zwei Plätzen: am Fuß
der Leiste und am Handy über der Fußleiste, wo der Daumen liegt.

**Zwei Schwellen, und das ist Absicht.** Die Leiste klappt bei **900 px** weg,
die Tabellen werden erst bei **720 px** zu Karten: 232 px Leiste plus eine
brauchbare Inhaltsspalte gehen sich unter 900 nicht mehr aus, lange bevor eine
Tabelle bricht. Zwei verschiedene Fragen, zwei verschiedene Antworten.

**Die Falle, die hier drinsteckt:** Die Schublade fährt über `left` herein und
nicht über `transform`. `transform` macht aus einem Element einen Bezugsrahmen
für alles, was darin `position: fixed` ist — der dunkle Schatten und die Uhr
über der Fußleiste würden mit der Schublade mitwandern, statt stehen zu
bleiben. Das sieht man erst am Gerät.

Die alte Medienabfrage für 721–1279 px ist ersatzlos weg: Sie löste, dass die
Kopfzeile ihre eine Zeile sprengte. Es gibt keine Kopfzeile mehr.

### Etappe 3: Zeitraum, Linie, Farbwerte raus (2026-09-12)

**Der Zeitraum steht über den Zahlen, die er ändert** — nicht in der
Kontextleiste. Ein Filter oben in der Ecke sähe aus, als gälte er für die ganze
Seite; er gilt für vier Werte, und das steht jetzt daneben. Drei Spannen:
Woche · Monat · Jahr. „Woche" schickt **gar nichts** mit — ohne Angabe nimmt der
Server die laufende Woche und schreibt sie in die Antwort. Die Grenzen hier noch
einmal auszurechnen hieße, dieselbe Regel an zwei Stellen zu haben.

Der Endpunkt konnte `?von=&bis=` schon; am Server war nichts zu ändern. Die
Beschriftung der vierten Kennzahl wechselt mit („Woche Team" → „Jahr Team"), und
die beiden Karten heißen nicht mehr fest „· diese Woche". Eine Zahl, die
plausibel aussieht und einen anderen Zeitraum meint, ist die schlimmere Sorte
Fehler.

**Der Kontostand ist eine Linie** (`bausteine/Kontostandlinie.tsx`), selbst
gezeichnet, kein Diagrammpaket — dieselbe Begründung wie bei den Zeichen. Die
Tabelle mit den genauen Beträgen steht zugeklappt darunter; gebraucht wird sie,
wenn jemand einen einzelnen Stichtag nachschlägt, und das ist nicht der Grund,
warum man aufs Dashboard geht.

**Gerechnet wird in `basis/finanzen.ts`, nicht in der Komponente.** Was rechnet,
wird getestet (acht Fälle: Ordnung, Kappung bei null, glatte Teilung,
Jahreswechsel, fehlende Kosten, leeres Konto). Die Fortschreibung benutzt
dieselbe Formel wie der Runway — deshalb trifft die gestrichelte Linie die Null
genau dort, wo die Kennzahl es sagt.

**Zwei Fallen im SVG**, beide im Baustein kommentiert:

- `preserveAspectRatio="none"` zieht die Linienstärke waagrecht mit — an flachen
  Stellen wäre die Linie dünner als an steilen. Dagegen hilft
  `vector-effect: non-scaling-stroke`.
- Aus demselben Grund gibt es **keine Kreise**: Ein Punkt würde zur Ellipse. Der
  Übergang von „erfasst" zu „fortgeschrieben" ist eine senkrechte Marke.
- Die Beschriftung steht als HTML daneben, nicht im SVG — Text würde mitverzerrt.

**Die Farbwerte sind aus den Ansichten heraus.** Der `3px`-Strich oben stand
zweimal als `style={{ borderTop: "3px solid var(--warnung)" }}` in `Dashboard.tsx`
und `Zeit.tsx`; jetzt ist es die Klasse `.karte-achtung` mit Kante **links** und
getönter Fläche. Oben war derselbe Strich auch auf den vier Kennzahlen, wo er
nichts bedeutete — und was überall ist, sieht niemand mehr. `projekt.farbe` und
`person.farbe` bleiben inline: Das sind Daten, keine Palettenwerte.

**Vier Kennzahlen werden unter 1200 px zwei mal zwei.** Neben der Leiste bleiben
darunter keine 190 px je Karte übrig, und „142.860 €" brach in der Ziffernschrift
auf zwei Zeilen — ein Betrag, der umbricht, liest sich als zwei Zahlen. Zwei mal
zwei statt kleinerer Schrift: Die Zahl ist das, wofür die Karte da ist.

### Was noch offen ist

Der Augenschein in der laufenden Anwendung. Geprüft ist bisher die Anmeldeseite
(hell und dunkel, 375 und 1280) und ein Prüfgerüst aus dem gebauten CSS mit dem
echten Markup — Geometrie und Kontraste sind **gemessen**, nicht geschätzt. Die
acht Ansichten mit echten Daten hat noch niemand gesehen.

In `Dashboard.tsx` und `Zeit.tsx` stehen noch `style={{ borderTop… }}`-Angaben
mit Farbwerten — sie verstoßen gegen „kein Farbwert in einer Komponente" und
sind seit dem Wegfall der farbigen Kennzahl-Oberkante zum Teil wirkungslos.
Aufräumen in Etappe 3.

## 2026-09-11 — Die Anmeldeseite bekommt einen lebenden Hintergrund

Wunsch von Bernd: Die Anmeldung soll einen interaktiven, animierten Hintergrund
bekommen.

### Ein Raster aus Quadraten, kein Partikelnebel

Gebaut ist ein Feld kleiner Quadrate auf einem festen Raster (40 px am Rechner,
34 px am Handy), gezeichnet auf ein `<canvas>` hinter der Karte. Es hat drei
Antriebe, die sich addieren:

1. **Zwei überlagerte Sinuswellen** als Grundatmen. Zwei schiefe Wellen ergeben
   ein Muster, das sich nicht erkennbar wiederholt; eine allein zöge als
   sichtbarer Streifen durch.
2. **Der Zeiger** zieht die Quadrate in einem Umkreis von 230 px zu sich, lässt
   sie wachsen und färbt sie von `--rand-stark` über `--marke` bis `--wortmarke-o`.
   Solange niemand die Maus bewegt hat — am Handy also immer — wandert ein
   gedachter Zeiger in einer weiten Acht über die Fläche.
3. **Ringe**, die von einem Punkt auslaufen: beim Aufschlagen der Seite aus der
   Karte, bei jedem Klick, bei jedem Anschlag in einem Feld, beim Absenden.

Der dritte Punkt ist der eigentliche: Man tippt sein Passwort, und die Seite
antwortet. Das ist die Stelle, an der der Hintergrund aufhört, Zierde zu sein.

**Warum kein Partikelsystem und keine Bibliothek:** Die Formensprache steht fest
(eckige Kanten, 4-Spalten-Raster). Ein Raster ist das Zeichen, das diese Anwendung
ohnehin führt. Und die Seite läuft **ohne** das React-Bundle — sie muss stehen,
bevor irgendetwas gebaut ist. Also eine Schleife und drei Zustandsgrößen, inline
in der Vorlage.

### Die Falle: ein Formular, das erst durch eine Animation sichtbar wird

Die Karte und ihre Teile kommen versetzt herein — aus `opacity: 0`. Beim Prüfen
stand das Formular unsichtbar da: Der Browser hält die Zeitleiste in einem
verdeckten Tab an, die Animationen blieben bei 193 ms stehen, und in der Karte
war nichts als die Wortmarke.

Das war hier eine Eigenart der Prüfumgebung. Die Lehre ist es nicht: **Eine
Anmeldemaske, die bei `opacity: 0` beginnt, ist einen Aussetzer davon entfernt,
unbenutzbar zu sein** — und das ist die eine Seite, die stehen muss. Zwei
Festlegungen deshalb:

- Der ganze Auftritt hängt an der Klasse `.belebt`, und die setzt das Skript als
  erste Anweisung. Ohne Skript steht das Formular schlicht und sichtbar da.
- `animation-fill-mode: backwards`, nicht `both`. Nach dem Lauf gilt wieder der
  normale Zustand des Elements, nicht der letzte Bildschritt.

### Gemessen wird die Leinwand, nicht das Fenster

`window.innerWidth` ist in einem Rahmen, der beim Laden noch keine Größe hat, 0 —
das Raster wäre dann leer und bliebe es, weil kein `resize` mehr käme. Gemessen
wird deshalb `leinwand.clientWidth`, und neu vermessen wird über einen
`ResizeObserver` auf der Leinwand (entprellt um 120 ms, weil am Handy jedes Ein-
und Ausblenden der Adressleiste eine Messung auslöst).

### Der Test, der `--verzug` nicht durchgelassen hat

Die Verzögerung der einzelnen Teile stand zuerst als `--verzug` am Element.
`test_die_anmeldeseite_erfindet_keine_eigenen_farbnamen` hat das abgelehnt: Der
Test prüft **alle** `--namen` der Anmeldeseite gegen `farben.css`, nicht nur die,
die nach Farbe aussehen. Das ist richtig so — sonst käme irgendwann eine Farbe auf
demselben Weg herein. Die Verzögerung steht jetzt als `animation-delay` direkt am
Element.

Aus demselben Grund ist der Schatten der Karte neutrales Schwarz mit wenig
Deckkraft und kein getöntes Grün: Ein eigener Farbwert an vierter Stelle wäre
genau der, der beim nächsten Umstellen der Palette stehen bleibt.

### Offen

Die Bewegung selbst ist **nicht Bild für Bild geprüft** — die Prüfumgebung hatte
die Zeitleiste angehalten. Nachgewiesen sind: das Raster, der Zeigerhof, dass ein
Ring seinen Ursprung verlässt, hell und dunkel, 1280×800 und 375×812.

---

## 2026-09-11 — Anrede am Kontakt, und der Mailentwurf daraus

Zwei Wünsche von Bernd an einem Tag: Der Knopf „Umhängen" in der Personenkachel
sollte weg, und aus einer hinterlegten Mailadresse sollte sich das Mailprogramm
mit fertiger Anrede öffnen lassen.

### „Umhängen" ist ersatzlos weg

Der Knopf klappte in einer Organisation das Feld „Gehört zu" erst auf; bei den
losen Personen stand dasselbe Feld offen da. Die Begründung von damals — in einer
Organisation steht in jeder Kachel dasselbe Haus, das ist Rauschen — stimmt
optisch und war praktisch trotzdem falsch: Das Zuordnen *ist* das Auswählen, ein
Knopf davor ist ein Griff ohne eigene Bedeutung. Beim **Anlegen** war es ohnehin
nie nötig; eine Person, die in einer Organisation angelegt wird, bekommt die
Organisation gleich mit. Jetzt steht das Feld immer offen.

### `Kontakt.anrede` ist ein Feld, keine Ableitung

Für „Sehr geehrte Frau Muster" braucht es das Geschlecht, und das stand nirgends.
Naheliegend wäre eine Ableitung aus dem Vornamen. **Sie kommt nicht in Frage:**
Eine Vornamensliste trifft bei Kurzformen, bei Namen aus anderen Sprachen und bei
allen daneben, die in keine der beiden Schubladen passen — und zwar in der
Anrede einer Mail, also genau dort, wo es auffällt und verletzt.

Leer ist deshalb ein **gültiger Endzustand** und kein halb gepflegtes Feld: Der
Entwurf beginnt dann mit „Guten Tag Anna Muster," — richtig für jede Person, nur
weniger förmlich. „Sehr geehrte/r" mit Schrägstrich gibt es nicht; das wäre eine
Lücke, die jede einzelne Mail aufhalten würde.

### Der Nachname ist eine Faustregel, und das ist hier tragbar

`anredezeile` schneidet für die förmliche Anrede alles bis zum letzten
Leerzeichen weg. Das geht bei „Anna Muster, MSc" und bei „van der Berg" daneben.
Der Grund, es trotzdem so zu machen: Das Ergebnis ist ein **Entwurf im
Mailprogramm**, keine gesendete Mail. Was danebengeht, steht vor jemandem, der es
in zwei Sekunden ausbessert. Die Alternative — Vor- und Nachname als zwei Felder
— hieße, jede Person doppelt zu pflegen, damit ein Sonderfall seltener wird.

**Wo die Grenze läge:** Sobald aus dem Entwurf ein Versand ohne Blick darauf wird
(Serienmail, automatische Erinnerung), ist die Faustregel nicht mehr tragbar.
Dann braucht es getrennte Namensfelder — nicht vorher.

### Kein Betreff im Entwurf

`mailentwurf` setzt nur den Rumpf. Ein geratener Betreff („Kontaktaufnahme")
müsste jedes Mal gelöscht werden, und genau einmal geht er so hinaus.

---

## 2026-09-10 — Der Kontakt bekommt Erreichbarkeit und eine Herkunft

Ausgelöst von einer Meldung von Bernd: Zwei Personen, die er am Server im
Event-Bereich angelegt hatte, seien in den Kontakten „nicht zu finden".

### Was der Befund war

Sie waren angelegt, nichts war verloren. Die Kontakteseite listet seit dem
Umbau vom 8. September **Organisationen**, und ein Personenname steht dort
grundsätzlich nirgends: Der eine steckte hinter der Zeile seines Hauses, der
andere — ohne Organisation angelegt — hinter „Lose Kontakte". Die Suche fand
zwar beide, zeigte aber wieder nur die Organisationszeile.

**Die Ursache war nicht der Speicher, sondern eine Vorbelegung.** Im Formular
„Steht noch nicht in den Kontakten" stand „Keine Organisation" oben und war
vorausgewählt. Wer im Gespräch schnell tippt, lässt so etwas stehen.

### Drei Festlegungen

**1. `Kontakt.kennengelernt_auf` ist ein Feld, keine Ableitung.**
Naheliegend wäre gewesen, die Herkunft aus dem frühesten Verlaufseintrag mit
einem Event zu rechnen — das ist die Regel „Abgeleitete Werte werden
gerechnet" aus CLAUDE.md. Sie greift hier nicht: Trifft man jemanden, den man
seit Jahren kennt, auf einer Tagung wieder, stünde bei ihm plötzlich
„kennengelernt auf dem FFG Forum". Woher jemand kommt, ist eine Tatsache von
damals, keine Rechnung über den heutigen Verlauf. Sie entsteht an genau einer
Stelle — beim Anlegen im Event — und ist später nicht zu rekonstruieren.

`on_delete=PROTECT` wie überall: Ein Event, auf dem jemand kennengelernt
wurde, lässt sich nicht mehr entfernen (409). Sonst zeigte die Kachel auf
etwas, das es nicht mehr gibt, und die Auskunft verschwände still.

**2. Die Löschreihenfolge der Sicherung dreht sich um.**
`socos.Kontakt` steht jetzt **vor** `socos.Event`. Das ist die eigentliche
Falle an dieser Änderung: Das Archiv sähe weiter vollständig aus, und erst das
Einspielen bräche mitten im Leeren ab — mit halb geleerter Datenbank und dem
Archiv als einziger Quelle. `test_kontakt_mit_erreichbarkeit_und_herkunft_wandert_mit`
hält die Reihenfolge fest; wird sie zurückgedreht, fällt der Test.

**3. „Ohne Organisation" bleibt möglich, wird aber eine Wahl.**
Das Feld startet leer und verlangt eine Entscheidung; „Ohne Organisation"
steht als letzte Möglichkeit darin. Nicht verboten — es gibt echte lose
Kontakte —, aber nicht mehr das, was man aus Versehen bekommt.

### Personen sind in der Übersicht wieder auffindbar

`gesuchtePersonen` in `basis/kontakte.ts`: Bei gesetzter Suche stehen die
passenden Namen unter der Organisationszeile. **Nur bei gesetzter Suche** —
ohne sie wäre die Übersicht wieder die lange Personenliste, die sie bewusst
nicht mehr ist.

Der Helfer sucht ausdrücklich **nicht** über `passtKontakt`: Das nimmt den
Namen der Organisation mit, und wer „Förderstelle" eingibt, bekäme die ganze
Belegschaft unter die Zeile geschrieben. Gesucht wird in Name, Rolle, Mail und
Telefon — dem, was eine Person ausmacht. Der offene Punkt bleibt draußen: Er
sagt, was ansteht, nicht wer jemand ist.

### Telefon ist Text, kein zerlegtes Feld

Was auf einer Visitenkarte steht, ist mal `+43 664 …`, mal `0664 …`, mal eine
Durchwahl in Klammern. Ein erzwungenes Format hieße, dass die Nummer gar nicht
eingetragen wird.

### Offen

Mail und Telefon gibt es bisher nur bei der **Person**, nicht bei der
Organisation. Eine Zentrale („office@…") hat noch keinen Platz. Kommt sie
dazu, gehört sie an `Organisation` und nicht als Schein-Person daneben.

---

## 2026-09-10 — Ein dritter Ball, und aus drei Stufen wird eine Skala

Zwei Änderungen an derselben Seite, beide von Bernd angestoßen.

### „nichts offen" als dritter Stand

Der Ball kannte `uns` und `ihnen`. Ein Kontakt, bei dem gerade schlicht nichts
ansteht, hatte keinen richtigen Platz: Er stand auf „bei ihnen", und der Filter
„Wir warten" zeigte damit Leute, auf die niemand wartet.

- **`Ball.NICHTS` ist ein eigener Wert, kein leeres Feld.** Leer wäre von „noch
  nie eingetragen" nicht zu unterscheiden; „nichts offen" ist aber eine
  Aussage, die jemand getroffen hat.
- **Der Chip ist grün (`--gut`), nicht grau.** Grau sähe aus wie „nie gepflegt"
  — genau die Zeile, über die man hinwegliest.
- **`BAELLE` in `basis/kontakte.ts` löst `ball === "uns" ? … : …` ab.** Beim
  dritten Wert wird aus so einer Bedingung still eine falsche Aussage, und
  auffallen würde es niemandem. Dieselbe Reihung ordnet jetzt auch die Spalte
  „Offener Punkt": erst was wir schulden, dann worauf wir warten, dann die
  stehengebliebene Notiz einer Person, bei der nichts offen ist.
- **In der Übersicht gewinnt der dringendste Stand.** Eine Organisation zeigt
  „bei uns", sobald eine Person dort auf uns wartet; „nichts offen" steht nur
  da, wenn es für alle gilt.

### Die Stufe einer Organisation ist jetzt eine Leiter

Vorher drei Kategorien: Erstkontakt · Antrag läuft · Partner. **Eine davon war
ein Vorgang, kein Verhältnis** — ein Haus, das man gut kennt und mit dem gerade
kein Antrag läuft, fiel auf „Erstkontakt" zurück.

Jetzt fünf Stufen derselben Art, von fern nach nah: Erstkontakt ·
Kennengelernt · Im Austausch · Angebahnt · Partner.

- **Die Reihenfolge in `Organisationsstufe` ist die Skala.** `stufenrang` in
  `basis/kontakte.ts` zählt die Stellung in derselben Liste; wer eine Stufe
  einschiebt, schiebt sie an ihren Platz, und die Anzeige stimmt weiter.
- **Angezeigt wird sie als fünf Marken, eine Farbe.** Fünf Farben nebeneinander
  sähen aus wie fünf Bedeutungen; die Aussage steckt in der Anzahl. Drei Chips
  konnten das nicht: Dass einer über dem anderen steht, sah man ihnen nicht an.
- **`antrag` wandert per Migration auf `angebahnt`** (0007). Zurück fallen
  `kennengelernt` und `austausch` auf `erstkontakt` — die alte Leiter kennt die
  Zwischenstufen nicht, und sie zu `partner` zu machen wäre eine Behauptung.
- **Wer nicht bearbeiten darf, sieht die Stufe jetzt überhaupt.** Sie hing
  vorher allein an der Auswahlliste, und die gab es für Leser nicht.
- **Ein unbekannter Wert bekommt keine Marke** (`stufenrang` → 0) statt der
  ersten. Ein alter Wert soll die Leiter nicht füllen und nicht behaupten, das
  Haus stünde am Anfang.

**Offen:** `Organisationsstufe` und `Ball` stehen im Frontend ein zweites Mal
(`STUFEN`, `BAELLE`) — wie `VERLAUFSARTEN` seit dem Event-Reiter. Solange die
Listen kurz sind, ist das billiger als ein Endpunkt, der Auswahlwerte ausliefert.
Beim nächsten Wert, der auseinanderläuft, ist die Entscheidung neu zu treffen.

---

## 2026-09-10 — Prioritäten: was ein Haus uns bringt, neben dem, wie nah es ist

Bernd wollte eine Prio-Spalte in der Organisationsübersicht — auswählbar in der
Zeile, sortierbar per Klick auf den Kopf.

**Warum ein eigenes Feld neben der Stufe und keine sechste Stufe:** Die Stufe
sagt, wie nah wir uns sind; die Priorität, wie viel es bringt, näher zu kommen.
Eine Förderstelle, mit der wir noch nie geredet haben, kann das Wichtigste auf
der Liste sein — und ein alter Partner, an dem nichts mehr hängt, das
Unwichtigste. Auf einer gemeinsamen Leiter ließe sich genau das nicht mehr
sagen.

**`offen` ist ein Wert, kein leeres Feld.** „Noch nicht eingeschätzt" ist eine
Auskunft; `""` wäre keine, und `mittel` als Vorgabe wäre eine Behauptung, die
niemand aufgestellt hat. Die Migration setzt darum alle bestehenden Häuser auf
`offen` und rät nichts (etwa: Partner = hoch).

**In der Sortierung steht `offen` hinten — auch umgekehrt.** Was niemand
angesehen hat, gehört nicht an die Spitze einer Liste, die nach Wichtigkeit
sortiert. Ein unbekannter Wert (eine Stufe, die es einmal gab) landet ebenfalls
hinten statt vor „hoch": `findIndex` gibt −1, und −1 sortiert nach vorn.

**Gleichstand fällt immer auf den Namen zurück.** Sonst stünden die Häuser mit
„hoch" bei jedem Neuladen anders — `sort` ist zwar stabil, aber die Liste wird
vorher gefiltert.

**Sortiert wird im Browser, nicht am Server.** Drei Nutzer, eine vollständig
geladene Liste. Ein `?sortiere=` brächte einen zweiten Ort, an dem die
Reihenfolge steht.

**Zweimal bedienbar, ein Zustand:** Am Rechner sortiert der Klick auf den
Spaltenkopf. Am Handy wird aus der Tabelle eine Karte, `thead` ist dort
ausgeblendet — und mit ihm wäre die Sortierung unerreichbar. Deshalb steht in
der Filterzeile ein Auswahlfeld, das nur unter 720 px sichtbar ist und in
denselben Zustand schreibt. Zwei Formen, eine Wahrheit.

**Beim Prüfen aufgefallen, nicht von mir behoben:** KWF steht in der Datenbank
auf `stufe = "antrag"` — ein Wert, den es seit der Skala-Migration (0007) nicht
mehr gibt. Die Übersicht zeigt ihn deshalb als „antrag" ohne gefüllte Marke.
Der Datensatz muss nach dem Lauf der Migration so gesetzt worden sein.

---

## 2026-09-10 — Zurück-Knopf, Profil in vier Teilen, Events umgestellt

Vier Befunde von Bernd an einem Nachmittag. Der Reihe nach.

### Der Zurück-Knopf fehlte auf sechs von acht Seiten

Er stand in zwei Ansichten (Kontakte, Events) als „Alle Organisationen" /
„Alle Events" **in** der Ansicht. Überall sonst führte der einzige Weg zurück
über die Kopfleiste — und auf Profil und Einstellungen, die dort keinen Eintrag
haben, gar keiner.

Jetzt steht er **einmal** in der Titelzeile in `App.tsx`, für alle Seiten. Was
in acht Ansichten steht, weicht in der neunten ab.

**Was er tut, in dieser Reihenfolge** (`useSeite().zurueck`, basis/router.ts):

1. Steht etwas hinter der Seite (`/kontakte/12`, `/events/3`,
   `/projekt/bearbeiten`), geht es **eine Ebene hoch** — nicht in der Geschichte
   zurück. Wer über einen Verlaufseintrag von einem Kontakt zu einem Event
   gesprungen ist, will von dort zur Eventliste.
2. Sonst `history.back()`, **solange die Geschichte in SoCoS bleibt**.
3. Sonst zur Startseite.

**Die Falle, deretwegen gezählt wird:** Ein blindes `history.back()` trägt
jemanden, der eine Seite direkt aufgerufen hat (Lesezeichen, Neuladen), aus
SoCoS heraus — auf die Seite davor im Browser. Deshalb schreibt `wechseln` eine
Tiefe in `history.state`. Sie steht im Zustand des Eintrags und nicht in einer
Variablen: Eine Variable zählt nur hoch, der Browser gibt beim Vor und Zurück
den Zustand des jeweiligen Eintrags zurück.

Die beiden Zeilen in Kontakten und Events sind auf ihre Brotkrume
zusammengeschrumpft — die Ortsangabe bleibt, der zweite Knopf daneben wäre
Doppelung.

### Das Profil war eine Liste, kein Aufbau

Sieben Felder untereinander. Jetzt vier Teile mit einer Leiste — **rechts**,
nicht links wie in den Einstellungen: Hier wird geschrieben, und das Formular
soll am selben linken Rand beginnen wie jede andere Seite; die Leiste ist die
Übersicht daneben.

- **Person** (Name, Rolle, Geburtsdatum) · **Kontakt** (E-Mail, Telefon) ·
  **Adresse** (Straße, Ort) · **Konto**.
- **Konto ist nur zum Ansehen**: Berechtigung, Kürzel, Farbe, und der Hinweis,
  dass das Passwort ein Admin am Server setzt. Ein Passwortfeld im Browser
  hieße, dass das Passwort in Verlauf und Passwortspeicher landet — dieselbe
  Entscheidung wie beim Anlegen von Konten (siehe `Team.tsx`).
- **Der Teil steht im Weg** (`/profil/adresse`), wie die Rubriken der
  Einstellungen. Sonst würfe die Zurück-Geste jemanden aus dem Profil heraus,
  statt vom Teil zum Profil.
- **Gespeichert wird alles Geänderte, nicht nur der offene Teil.** Sonst
  verlöre ein Wechsel von „Person" zu „Adresse" die angefangene Zeile — an
  einer Stelle, die aussieht, als hätte man bloß umgeblättert. Unverändertes
  geht gar nicht erst hinaus; es stünde sonst als „alt = neu" im
  Änderungsprotokoll.

### Events: der Verlauf gehört über die Hitlist

Die Hitlist stand über dem Verlauf und war immer offen. Wer auf einer Tagung
schnell ein Gespräch festhalten wollte, scrollte erst an zwanzig geplanten
Namen vorbei.

- **Verlauf oben, Hitlist darunter — und zugeklappt**, bei jedem Aufruf neu
  (`<details>`, kein gemerkter Zustand: Gemerkt wäre sie genau dann offen, wenn
  man sie am wenigsten braucht). Zugeklappt zeigt die Zeile trotzdem, wie viele
  offen sind.
- `<details>` und kein Knopf mit Zustand: Auf- und Zuklappen kann der Browser
  selbst, samt Tastatur und Vorlesen. Ein Klick auf das `?` im `<summary>`
  bekommt ein `preventDefault` — sonst klappte jede Erklärung die Karte zu.

### Ein Verlaufseintrag hängt an keiner Hitlist-Zeile mehr

**Das war der eigentliche Fehler.** Der Verlauf bot nur die Namen von der
Hitlist an. Wer jemanden traf, der nicht auf dem Plan stand, musste ihn erst auf
die Planungsliste setzen — und die Liste erzählte danach eine Vorbereitung, die
es nie gab.

Jetzt bietet `wenGetroffen` (basis/events.ts) **alle** Kontakte und
Organisationen an, die Hitlist-Namen zuerst gruppiert. Die Hitlist ist wieder
das, was sie sein soll: der Plan von vorher.

**Und das Formular legt die Organisation gleich mit an.** „Vor Ort
kennengelernt" ist aus der Hitlist- in die Verlaufskarte gewandert (dort, wo die
Hitlist zugeklappt ist, hätte es niemand mehr gefunden), es steht still
zugeklappt hinter einem Knopf, und die Organisation kann neu sein: Wer auf einer
Tagung jemanden von einem unbekannten Haus trifft, hätte sonst drei Stationen
vor sich — Kontakte, Organisation, Person, zurück zum Event. Nach der dritten
notiert das niemand mehr.

Die neue Person landet **nicht** mehr auf der Hitlist (das tat sie vorher, als
„getroffen"), sondern ist oben im Feld „Mit wem" gleich ausgewählt.

**Nicht abgenommen:** Wieder ohne die Prüfung an 1280×800 und 375×812 in hell
und dunkel — die Oberfläche verlangt eine Anmeldung. Auf Bernds Wunsch trotzdem
committet.

---

## 2026-09-10 — Das Zahnrad führt auf eine Seite, nicht in einen Dialog

Bernd wollte hinter dem Zahnrad rechts oben „ein gesamtes Untermenü, kein Popup".
Aus dem Sicherungsdialog ist die Seite **`/einstellungen`** geworden, mit drei
Rubriken im Untermenü links: **Konten · Änderungsprotokoll · Sicherung**.

**Warum eine Seite und nicht der Dialog:** Der Dialog konnte genau eine Sache.
Alles Weitere hätte ihn in eine zweite Anwendung im Fenster verwandelt — mit
eigenem Zurück, eigener Tiefe und ohne Weg, den man sich merken kann. Auf einer
Seite hat jede Rubrik einen Pfad, ein Lesezeichen und die Zurück-Geste des
Geräts.

**Die Rubrik steht im Weg, nicht im Zustand der Ansicht.** `RUBRIKEN` liegt in
`basis/router.ts` neben `SEITEN`, `/einstellungen/protokoll` überlebt ein
Neuladen. Derselbe Grund wie bei den Kontakten: Zwei Geschichten nebeneinander —
eine im Browser, eine in der Ansicht — sind der schlechtere Weg.

**Team und Protokoll sind aus dem Profil hierher gewandert.** Sie standen dort
unter den eigenen Stammdaten, weil es keinen anderen Ort gab. Das Profil ist
jetzt, was sein Untertitel sagt: die eigenen Stammdaten.

**Wer welche Rubrik sieht, entscheiden die Rechte aus `/api/ich/`** —
`nutzer_verwalten` für die Konten, `sichern` für die Sicherung, das Protokoll
sehen alle drei Rollen („wer hat diese Zeit nachträglich geändert" ist keine
Admin-Frage). Was jemand nicht darf, steht gar nicht erst im Untermenü, und wer
gar nichts davon darf, sieht das Zahnrad nicht. Geprüft wird trotzdem am Server
bei jedem Aufruf: Eine versteckte Rubrik ist nur eine ungenannte URL.

**Ein Redirect gibt es bewusst nicht.** `/einstellungen` ohne Rubrik und
`/einstellungen/konten` ohne das Recht dazu zeigen beide die erste offene
Rubrik. Der Weg ohne Rubrik bleibt gültig, damit ein Lesezeichen darauf auch
nach einer Rechteänderung noch irgendwohin führt.

**Die Nachfrage vor dem Ersetzen des Bestands bleibt ein Dialog**, obwohl die
Rubrik eine Seite ist. Sie soll den Blick festhalten und zwei Wege offen lassen;
ein Abschnitt weiter unten auf derselben Seite wäre wegscrollbar.

**Nicht abgenommen:** Die Prüfung an 1280×800 und 375×812 in hell und dunkel
steht aus — die Oberfläche verlangt eine Anmeldung, und Passwörter tippt der
Assistent nicht ein. Auf Bernds Wunsch ohne diese Abnahme committet.

---

## 2026-09-09 — Formulare, die auf einen Klick geschwiegen haben

Bernd hat gemeldet: Formular leer, Knopf gedrückt, **nichts passiert**. Zwei
verschiedene Ursachen mit demselben Bild.

### Der stille Abbruch

Zwölf Anlege-Handler begannen mit `if (!name.trim()) return;`. Der Klick kam an,
der Handler war sofort wieder draußen, und die Seite sagte kein Wort. Der Grund
war überall derselbe: Die Prüfung war als Schutz vor einer sinnlosen Anfrage
gedacht, nicht als Auskunft an den, der davorsitzt.

Jetzt antwortet jeder dieser Handler mit einem Satz, der sagt, **was fehlt**,
über einen Baustein `Fehlerzeile` unter der Feldreihe.

- **Nicht über `melden`** (die Meldungen oben rechts): Die sind für das, was der
  Server sagt. Ein leeres Pflichtfeld gehört neben das Feld, sonst sucht man am
  anderen Ende des Bildschirms nach dem Satz.
- **`role="alert"` steht im Baustein**, nicht an den zwölf Aufrufstellen — an
  zwölf Stellen wird es vergessen.
- Weil die Zeile oft mitten in einer `.feld-reihe` landet, steht in
  `bausteine.css` eine Regel `.feld-reihe > .rueckmeldung { flex: 1 0 100% }`.
  Volle Breite heißt bei `flex-wrap: wrap`: eigene Zeile. Sonst stünde die
  Meldung als schmale Spalte neben dem Knopf.

### Kein Absendeknopf ist mehr stillgelegt

`disabled={!zeile.ziel}` und Geschwister waren die zweite Hälfte desselben
Problems: **Ein grauer Knopf kann nicht sagen, warum er grau ist.** Er nimmt den
Klick jetzt an und antwortet. Stillgelegt bleibt nur, was gerade läuft (das
Einspielen einer Sicherung) — dort steht der Grund im Knopf selbst.

### Der Entwurf, der einen RangeError warf

`EntwurfZeile.bestaetigen` rief bei leerem Feld `new Date("").toISOString()`.
Das ist ein `RangeError`: in der Konsole ein Fehler, auf der Seite nichts. Die
schlimmste Sorte, weil niemand sie meldet — es sieht aus, als hätte man
danebengeklickt.

### Die Anmeldeseite sagte die falsche Wahrheit

Zwei leere Felder ergaben „E-Mail oder Passwort stimmen nicht". Man sucht dann
den Fehler bei seinem Passwort, dabei stand nur nichts im Feld. Unterschieden
wird an der Stelle, an der Django den Fehler ablegt: Ein fehlendes Pflichtfeld
hängt am **Feld**, falsche Zugangsdaten hängen am **Formular**.

**Falle nebenbei:** `{# … #}` gilt in einer Django-Vorlage nur bis zum
Zeilenende. Ein dreizeiliger Kommentar damit stand zu zwei Dritteln als Text auf
der Seite. Mehrzeilig geht nur `{% comment %}`.

---

## 2026-09-09 — Der Feldtext übernahm die Änderung nicht (Projekttitel)

Wer den Titel eines Projekts änderte und herausklickte, sah wieder den alten
Titel. Gespeichert war er trotzdem — man sah es erst nach dem Neuladen.

**Zwei Ursachen übereinander:**

1. `Projekt.tsx` rief an genau zwei von dreizehn Stellen `aendern(…)` **ohne**
   `neuLaden()` danach: bei Titel und Untertitel eines Projekts. Der PATCH ging
   durch, die Liste wurde nie neu geholt.
2. Der `Feldtext` zeigte nach dem Schließen wieder den Prop `wert` — und der
   trägt bis zum Nachladen den alten Stand. Selbst mit `neuLaden` blitzte der
   alte Text auf.

**Behoben:** Der Feldtext zeigt nach dem Schließen seinen eigenen Entwurf.
Scheitert das Speichern, geht er auf `wert` zurück — sonst stünde ein Text auf
dem Bildschirm, den der Server nicht hat.

**Warum das wichtig ist:** Der Feldtext hat bewusst keinen Speichern-Knopf. Damit
ist der neue Text selbst die einzige Bestätigung. Fällt die weg, sieht es aus,
als sei die Eingabe verworfen worden.

**Wächter dagegen:** `test_jede_feldtext_aenderung_laedt_neu` in
`socos/tests/test_oberflaeche.py` liest jeden `speichern={…}`-Block mit
Klammerzählung und verlangt darin `neuLaden` (oder die Weitergabe an einen
örtlichen `speichern`, der es tut). Eine Regex je Zeile hätte den Block nicht
gesehen — er geht über acht Zeilen.

---

## 2026-09-09 — Abmelden: es gab einen Knopf, und er hat nie abgemeldet

Der einzige Weg hinaus war ein `knopf-still` unten auf der Profilseite, und der
war ein Anker auf `/abmelden/`. **Djangos `LogoutView` nimmt seit 5.0 nur noch
POST** — ein GET darauf ist 405. Der Knopf sah richtig aus, war an der
unauffälligsten Stelle der Anwendung versteckt und tat nichts.

Das ist die unangenehme Sorte Fehler: Nichts stürzt ab, nichts wird rot, die
Sitzung bleibt einfach stehen. Wer ihn drückte, blieb angemeldet.

**Jetzt:** ein Formular mit `method="post"` und dem CSRF-Feld, in der
Kopfleiste ganz außen neben dem Zahnrad. Ein Zeichenknopf mit `aria-label`,
44 px, dieselbe Form wie das Zahnrad — beide tragen darum jetzt eine gemeinsame
Klasse `.kopf-knopf` statt zweier gleicher Regelsätze, die beim ersten
Nachbessern auseinanderlaufen.

- **Formular statt `fetch`:** Nach dem POST soll der Browser der Weiterleitung
  auf `/anmelden/` folgen und dabei den ganzen Zustand im Speicher wegwerfen —
  React Query mitsamt Cache. Ein `fetch` hätte die abgemeldete Oberfläche
  stehen lassen und den Aufräumweg selbst nachbauen müssen.
- **Auf der Profilseite steht er nicht mehr.** Die Kopfleiste ist auf jeder
  Seite da, die Profilseite eingeschlossen. Zwei Wege wären zwei Stellen, an
  denen der 405 wieder einziehen kann.
- Zwei Tests halten das fest (`test_oberflaeche.py`): dass GET auf `/abmelden/`
  405 liefert und die Sitzung stehen bleibt, und dass in `frontend/src` kein
  `href` auf `/abmelden/` mehr vorkommt.

**Preis, bewusst bezahlt:** Der vierte Griff im rechten Block kostet bei genau
1280 px rund 60 px, und die kürzt sich die Uhr am Beschriftungstext ab („keine
B…"). Das ist genau das Nachgeben, das in `bausteine.css` für `.uhr-chip .wo`
vorgesehen ist — der einzige Teil der Leiste, der schrumpfen darf. Die
Alternative wäre die zweizeilige Kopfleiste gewesen, und die war eine Stunde
vorher ausdrücklich abgeschafft worden.

Geprüft an 1280×800 und 375×812, hell und dunkel; am Handy stehen die drei
Zeichenknöpfe rechts unter der Uhr.

---

## 2026-09-09 — Ein leerer Zustand darf den Weg hinein nicht verstellen

Auf der Kontakteseite war das Anlegen unerreichbar, solange es nichts anzuzeigen
gab: Der frühe Rücksprung für „noch keine Kontakte" stand **vor** der Karte
„Neue Organisation". Bei leerem Bestand sah man also nur den Satz, wofür die
Seite gut wäre — und der Bestand blieb leer. Dasselbe eine Ebene tiefer: Die
Zeile „Lose Kontakte" war der einzige Weg zu den Personen ohne Organisation und
stand nur da, wenn es schon welche gab; die erste ließ sich nie anlegen.

**Die Regel, die daraus folgt:** Was etwas anlegt, steht **über** der
Leerstelle, nicht dahinter. Die Leerstelle erklärt, sie ersetzt den Weg nicht.
`Events.tsx` hatte es von Anfang an so; die Kontakteseite war die Ausnahme.

- `zeigtLoseZeile` in `basis/kontakte.ts` hält die zweite Hälfte davon fest:
  ungefiltert steht die Zeile immer da, auch mit null Personen. Sobald welche da
  sind, folgt sie dem Filter wie jede andere Zeile — eine leere Zeile neben
  „Nichts gefunden" wäre eine Antwort, die der Suche widerspricht.
- Die Regel steht in `basis/`, nicht in der Ansicht, weil sie prüfbar ist.

Geprüft an 1280×800 und 375×812, hell und dunkel, mit Daten und ohne.

---

## 2026-09-09 — Startseite, und warum die Kopfleiste einzeilig bleiben muss

### Die Kopfleiste war bei 1280 px zweizeilig

Uhr, Name und Zahnrad sind in eine zweite Zeile gerutscht. Nachgemessen fehlten
gut fünfzig Pixel: Logo 188 + Menü 530 + rechter Block 623 + Abstände gegen
1236 px Innenbreite.

**Zwei Ursachen, zwei Antworten.**

- Der Zusatz „Sopharmis" neben „SoCoS" kostete allein rund achtzig Pixel. Er ist
  aus der Kopfleiste heraus. Groß und zweifarbig steht die Wortmarke weiter auf
  der Anmeldeseite — die Entscheidung vom 2026-09-08 gilt dort unverändert, in
  der Leiste ist jetzt nur noch Signet + „SoCoS".
- `flex-wrap: wrap` war die eigentliche Falle. **Flexbox bricht um, bevor
  irgendetwas schrumpft.** Ein Pakettitel, der sich um vierzig Pixel kürzen
  ließe, verhindert den Umbruch also nicht — er wird gar nicht erst gefragt.
  Deshalb ist die Leiste jetzt `nowrap`, alle Teile sind `flex: 0 0 auto`, und
  **genau eines** darf nachgeben: der Pakettitel in der Uhr (`flex: 0 1 auto;
  min-width: 0`), mit Auslassungspunkten.

**Drei Breiten, drei Formen** (`bausteine.css`, ganz unten):

| ab | Form |
|---|---|
| 1280 px | eine Zeile, der Pakettitel gibt nach |
| 721–1279 px | Logo und rechter Block oben, Menü über die volle Breite darunter |
| bis 720 px | wie gehabt: Logo, Menü, Uhr über die Breite, Knöpfe darunter |

Die Untergrenze 721 px im mittleren Bereich ist Absicht: Die Handy-Aufteilung
von 2026-09-09 soll davon nicht mitgeändert werden.

**`min-width: 0` auf der Navigation nicht vergessen.** Ohne das bleibt sie bei
ihrer Wunschbreite von gut 500 px stehen und ragt rechts aus dem Bild, statt
ihre fünf Einträge auf zwei Zeilen zu verteilen — ein Flex-Kind schrumpft
standardmäßig nicht unter seinen Inhalt.

### Die Startseite

Neue Seite `start`, **die Wurzel** (`/`) und zugleich der Rückfall für einen
Pfad, den es nicht gibt. Vorher fiel beides auf das Dashboard.

**Sie steht in keinem Menü.** Hin kommt man über das Logo links oben. Ein
sechster Eintrag neben Dashboard, Projekt, Zeit, Kontakte und Events wäre
neben seinen eigenen Zielen bloß Verdopplung; das Logo als Weg nach Hause ist
die Konvention, die niemand erklärt bekommen muss.

**Was darauf steht:** oben das Buchen, darunter sechs Kacheln — Zeit
nachtragen, Organisation erfassen, Person ohne Organisation, Event anlegen,
Projekt & Pakete, Zahlen & Runway. Die vier Kacheln zum Anlegen sieht nur, wer
`darf.bearbeiten` hat; die Schwelle steht wie alle anderen serverseitig in
`socos/berechtigung.py`, die Kachel verbirgt nur einen Weg, den der Server
ohnehin ablehnt.

**Warum das Buchen echte Funktion trägt und die Kacheln nicht.** Die Uhr zu
starten ist der häufigste Griff des Tages, und dafür führte der Weg bisher
über die Projektseite und das Suchen des Pakets im Baum. Auf der Startseite
stehen die **vier zuletzt bebuchten Pakete** als Knöpfe (ein Klick) und eine
Auswahl über alle buchbaren Pakete daneben — ohne die Auswahl käme man an ein
Paket, auf das noch nie gebucht wurde, überhaupt nicht heran. Alles andere
sind Abkürzungen auf Seiten, die es schon gibt; dort noch einmal Formulare
nachzubauen wäre die zweite Stelle, die beim nächsten neuen Feld vergessen
wird.

- `BUCHBAR` lässt **fertig** und **verworfen** aus. Der Server ließe eine
  Buchung darauf zu; wer ein abgeschlossenes Paket in der Liste sieht, bucht
  früher oder später darauf, und dann steht die Zeit im Nachweis an einem
  Paket, das seit Monaten zu ist.
- „Zuletzt" heißt **die letzten dreißig Tage**, und der Zeitraum geht als
  ausdrücklicher `von`-Parameter an die Schnittstelle. Keine stille
  Zeitscheibe: Gerechnet wird hier nichts, und in der Überschrift steht, was
  gemeint ist.
- Gefiltert wird gegen den Projektbaum, nicht gegen die Buchung: Ein Paket,
  das inzwischen fertig oder weich gelöscht ist, verschwindet aus den
  Knöpfen, statt einen Griff anzubieten, den der Server gleich ablehnt.
- Die Rechnerei steht in `frontend/src/basis/start.ts` mit Tests daneben —
  dasselbe Muster wie `kontakte.ts` und `events.ts`.

**Kein Gegenstück im Entwurf.** `Sopharmis Internal v6 leer.dc.html` kennt
keine Startseite; Kacheln, Beschriftungen und Reihenfolge sind hier zum ersten
Mal gesetzt und nicht aus der Vorlage übernommen.

---

## 2026-09-09 — Sicherung auch aus der Oberfläche (Zahnrad rechts oben)

Bisher gab es den ganzen Bestand nur über die Kommandozeile am Server heraus und
wieder hinein. Damit war „lokal befüllen und hochschieben" ein SSH-Vorgang und
ein Wiederherstellen im Ernstfall an einen Rechner mit Schlüssel gebunden. Jetzt
steht beides hinter einem kleinen Zahnrad rechts oben in der Kopfleiste:
herunterladen und wiederherstellen.

**Der Mechanismus steht in `socos/sicherung.py`, nicht in den Befehlen.**
`archiv_schreiben` und `archiv_einspielen` haben zwei Aufrufer — die beiden
Management-Befehle und die beiden Endpunkte unter `/api/sicherung/`. Zwei Kopien
liefen auseinander, und die Sicherung ist genau die Stelle, an der man das erst
im Ernstfall merkt.

**Entscheidungen dabei:**

- **`darf_sichern` ist ein eigenes Recht** in `socos/berechtigung.py`, obwohl es
  heute dasselbe bedeutet wie `darf_nutzer_verwalten` (beides: Admin). Das
  Archiv enthält *alles* — Passwort-Hashes und fremde Stammdaten —, und das
  Einspielen ersetzt den Bestand samt Konten. Käme je eine Rolle dazu, die
  Nutzer anlegen darf, soll sie nicht nebenbei die Datenbank tauschen können.
- **Das Einspielen verlangt zwei Dinge**: die Datei *und* das Wort
  `bestand-ersetzen` als `bestaetigung`. Das ist das Gegenstück zu
  `--ja-bestand-ersetzen` auf der Kommandozeile: Ein Klick auf ein Zahnrad soll
  keine Datenbank tauschen können. In der Oberfläche steht davor eine zweite
  Seite, die den Dateinamen nennt, sagt was verschwindet, und den milderen Weg
  daneben stellt (erst das Heutige sichern).
- **Nach dem Einspielen wird abgemeldet** (`logout`). Der Ausweis in der Sitzung
  gehörte zu einem Bestand, den es nicht mehr gibt; im ungünstigen Fall zeigt er
  auf ein fremdes Konto mit derselben Nummer. Sitzungen sind bewusst nicht im
  Archiv (siehe die Liste in `sicherung.py`), sie überleben also den Tausch.
- **Der Vorgang steht im Server-Protokoll, nicht im Änderungsprotokoll.** Das
  eigene Protokoll liegt in der Datenbank, die dieser Vorgang gerade ersetzt hat
  — ein Eintrag darin wäre eine Sekunde später weg.
- **Das Leeren und das Einlesen stehen in *einer* Transaktion.** Sonst nähme eine
  falsch gewählte Datei den ganzen Bestand mit: erst gelöscht, dann am Archiv
  gescheitert. Ein Test schickt bewusst eine Datei durch, die kein Archiv ist.
- **Das Format bleibt `.tar.gz`, kein ZIP.** Es ist dasselbe Archiv, das
  `deploy.sh` vor jedem Deploy schreibt; ein zweites Format bedeutete zwei Wege
  ins selbe Ziel und eine Datei, die im falschen davon nicht zurückgeht.

**Beim ersten Einspielen am Server aufgefallen:** `MEDIA_ROOT` ist dort der
Einhängepunkt eines Docker-Volumes. Das bisherige `rmtree` darauf scheiterte mit
„Device or resource busy" — und zwar **nachdem** die Datenbank schon getauscht
war: Bestand neu, Vorgang abgebrochen, Meldung ein Stacktrace. Jetzt wird der
Ordner geleert statt weggeworfen. Ein Test hält das an der Inode fest; sie muss
dieselbe bleiben.

**Nicht gelöst und weiterhin offen:** Die Datei geht durch den Browser des
Nutzers. Sie enthält Konten und Personendaten — wo sie danach liegt, entscheidet
der Mensch davor. Die Rubrik sagt das ausdrücklich; die Kopie außer Haus samt
Verschlüsselung bleibt der offene Punkt unten. (Der Dialog von damals ist seit
2026-09-10 die Rubrik „Sicherung" unter `/einstellungen` — siehe oben.)

---

## 2026-09-09 — Events: Hitlist vorher, Verlauf nachher

Neuer Reiter zwischen Kontakten und Profil. Ein **Event** ist eine Tagung, ein
Kongress, ein Messetag — der Anlass, bei dem man Leute trifft. Es trägt zwei
Dinge: vorher die **Hitlist** (wen wollen wir dort ansprechen, und weshalb),
nachher den **Verlauf** (mit wem haben wir geredet, was kam dabei heraus).

Drei Änderungen am Schema: `Event`, `Eventziel` (eine Zeile der Hitlist) und
ein nullbares Feld `event` am `Verlaufseintrag`.

Entscheidungen, die man dem Code sonst nicht ansieht:

- **Ein Event ist kein Termin.** Keine Uhrzeit, keine Erinnerung, kein
  Kalender. Termine und Aufgaben bleiben zurückgestellt (siehe unten bei den
  offenen Punkten) — das hier beantwortet eine andere Frage, nämlich „was ist
  mit diesem Haus passiert".
- **Der Verlauf am Event ist derselbe Verlauf wie beim Kontakt**, nur mit
  einem Verweis auf das Event. Eine zweite Verlaufssorte („Eventnotiz") liefe
  beim Lesen auseinander, und die Frage „was war zuletzt mit der Förderstelle?"
  hätte wieder zwei Antworten. Auf der Kontakteseite steht deshalb jetzt
  „· auf MedTech Days 2026" unter dem Eintrag.
- **Eine Zeile der Hitlist zeigt auf genau eines** — eine Organisation *oder*
  eine Person. Dieselbe Regel wie beim Verlaufseintrag, und aus demselben
  Grund: „mit dem Institut reden, egal mit wem" und „mit Frau Berger reden"
  sind zwei Vorhaben, und beim Abhaken wüsste sonst niemand, was erledigt ist.
- **Die Hitlist zeigt nur auf Bestehendes**, nie auf einen frei getippten
  Namen. Ein Name, der nur am Event steht, ist nach der Tagung nirgends
  wiederzufinden. Wer jemanden erst vor Ort kennenlernt, legt ihn in der Karte
  „Vor Ort kennengelernt" an: ein Griff, zwei Aufrufe — die Person landet in
  den Kontakten **und** auf der Liste, gleich als „getroffen".
- **Dieselbe Zeile zweimal anzulegen ist ein Doppelklick, kein Vorhaben.** Der
  zweite Aufruf bekommt die vorhandene Zeile zurück statt einer Fehlermeldung;
  ein roter Kasten erklärte nichts, was die Liste nicht schon zeigt. Die
  Datenbank weist es über zwei Teilindizes trotzdem ab — sie ist die
  Absicherung, nicht die Fehlermeldung.
- **Der Stand hat drei Werte** (offen · getroffen · verpasst). Vor dem Event
  ist alles offen; danach ist die einzige Frage, ob man die Person erwischt
  hat. Alles Weitere steht im Verlauf.
- **Verglichen wird mit dem letzten Tag, nicht mit dem ersten.** Eine
  dreitägige Tagung ist an ihrem zweiten Tag nicht vergangen — genau der
  Fehler, den man erst im Oktober sieht. `bis` leer heißt eintägig; ein
  zweites Datum, das dann dasselbe enthielte, müsste man beim Verschieben
  doppelt pflegen.
- **`teilnehmer` ist eine m:n-Beziehung ohne `through`.** An der Zuordnung
  hängt nichts weiter — kein Datum, keine Rolle. Sie wandert über das
  Fixture des Events in die Sicherung; ein eigener Test prüft das, weil genau
  solche Beziehungen in einem Export fehlen, der vollständig aussieht.
- **`VERLAUFSARTEN` steht jetzt in `basis/kontakte.ts`**, nicht mehr in der
  Kontakteseite: Die Eventseite zeigt denselben Verlauf, und zwei Listen
  liefen beim nächsten neuen Wert auseinander.

Geprüft an 1280×800 und 375×812, hell und dunkel, mit Daten und ohne.

---

## 2026-09-08 — Kontakte: erst die Organisation, dann die Person

Die Kontakteseite war ein Board über drei Spuren (Erstkontakt · Antrag · Partner)
mit den Personen als Einträgen darin. Gesucht wird aber nach der **Organisation**
(„was läuft mit der Förderstelle?"), und die Antwort darauf stand vorher an zwei
Orten: das Telefonat mit der Programmleitung hing an der Person, die Mail an das
Haus an der Organisation — und niemand sah den Faden.

Jetzt: eine Liste aller Organisationen, ein Klick öffnet die Organisation als
eigene Seite mit Personenkacheln, einem Verlauf und der Nachbuchzeile darüber.

Entscheidungen, die man dem Code sonst nicht ansieht:

- **Der Verlauf wird beim Anzeigen zusammengeführt, nicht beim Speichern**
  (`basis/kontakte.ts`). Ein zweites Feld „gehört auch zur Organisation" wäre
  eine zweite Wahrheit, die beim Umhängen einer Person auseinanderläuft. Das
  Modell bleibt, wie es war: ein Eintrag hängt an genau einem von beiden.
- **Die gewählte Organisation steht im Weg (`/kontakte/12`), nicht im Zustand
  der Ansicht.** Grund ist das Handy: „zurück zur Liste" ist dort die häufigste
  Bewegung, und man nimmt dafür die Zurück-Geste des Geräts. Läge die Auswahl im
  Zustand, würfe diese Geste jemanden aus der Seite statt eine Ebene hoch.
- **Aus der Liste erlaubter Unterseiten im Router wurde eine Prüfung je Seite**
  (`UNTERSEITEN` → `UNTERWEG`). Die beiden Fälle sind verschieden gebaut:
  „projekt" hat einen festen Weg (`bearbeiten`), „kontakte" trägt dort eine
  Organisationsnummer, die man nicht aufzählen kann. Was die Prüfung nicht
  durchlässt, wird weiterhin verworfen — der Grund von damals gilt unverändert.
- **Ein Weg ins Leere zeigt die Liste**, statt beim Zeichnen umzuleiten. Eine
  gelöschte Organisation oder ein altes Lesezeichen ist kein Fehlerfall, und
  der nächste Klick rückt auch den Weg wieder gerade.
- **Der Ball hängt an Personen, nicht an Organisationen.** Eine Organisation
  passt zum Filter, wenn eine ihrer Personen passt; eine ohne Personen fällt
  bei gesetztem Filter heraus — sie schuldet niemandem etwas.
- **In der Spalte „Offener Punkt" steht vorne, was wir schulden**, dann der
  Rest. Nur die eigenen Schulden zu zeigen ließe Zeilen leer aussehen, in denen
  etwas läuft; alle zu zeigen sprengt die Zeile. Die übrigen stehen als Zahl.
- **„Gehört zu" liegt in der Organisation hinter einem Knopf**, bei den losen
  Kontakten steht es offen da. In einer Organisation stünde in jeder Kachel
  dieselbe Antwort — dreimal dasselbe Feld ist Rauschen, und umgehängt wird
  selten.
- **Die losen Kontakte sind kein Sonderfall, sondern dieselbe Seite** ohne Kopf
  und ohne das Ziel „an die Organisation". Ein zweiter Weg für dieselbe Sache
  wäre der teurere.

Die Falle beim Bauen: `.feld` bringt `width: 100%` mit. In einem umbrechenden
Flex-Elternteil rechnet der seine eigene Breite damit zu klein, und ein Knopf
fällt grundlos in die zweite Zeile — sichtbar nur im Bild, nicht im Stylesheet.

Geprüft an 1280×800 und 375×812, hell und dunkel, mit Daten und ohne.

---

## 2026-09-08 — Echte Daten drin, Probedaten raus

Die Probedaten sind entfernt (`probedaten --entfernen`), die echten Projektdaten
stehen in der Datenbank. Eingespielt hat sie der neue Befehl
`manage.py daten_einspielen`, der `daten/sopharmis-daten.json` liest.

**Warum ein Befehl und keine Fixture und keine Datenmigration:** Kunden- und
Personendaten dürfen nicht ins Repository. `daten/` steht in `.gitignore`; eine
Fixture oder eine Datenmigration stünde für immer in der Versionsgeschichte, und
kein `git rm` holt sie wieder heraus.

**Der Befehl prüft erst, dann schreibt er.** Ein unbekannter Status mitten im
Einspielen bräche zwar die Transaktion ab — aber erst, nachdem die Hälfte
durchgelaufen ist, und die Meldung nennt dann einen einzigen Titel statt aller
Stellen, die noch anstehen. Geprüft werden Phasenart, Paketstatus, E-Mail und
Rolle; die Meldung listet alle Verstöße auf einmal.

**Was die Datei repariert werden musste**, um zum Modell zu passen:

| in der Datei | eingespielt als | warum |
|---|---|---|
| `in arbeit` | `laeuft` | kein Wert des Modells |
| `pausiert` (2×) | `verworfen` | kein Wert des Modells; die Notiz sagte beide Male „verworfen" |
| `initials: C1/C2/C3` | `initialen: FD/BG/AW` | Platzhalter aus dem Entwurf |

Die Notizen „National · verworfen" und „Land · verworfen" sind auf „National"
und „Land" gekürzt — der Status sagt es jetzt, und ein Wert an zwei Stellen
läuft irgendwann auseinander.

**Zwei Felder der Datei werden bewusst nicht eingespielt**, festgehalten als
`NICHT_EINGESPIELT` im Befehl:

- **`gebucht`** (`"34:20"` je Projekt) — gebuchte Zeit wird aus den
  Zeitbuchungen gerechnet, nicht gespeichert. Eine Zahl aus dem Entwurf, die
  niemand nachrechnen kann, wäre genau die Art Wert, die plausibel aussieht und
  falsch ist.
- **`sonstiges`** (Standort, Side-Quests) — dafür gibt es kein Modell. In ein
  fremdes gepresst wäre es schlechter aufgehoben als gar nicht.

**Stand der Konten:** Bernd hat sein Passwort behalten. Florian
(`dorighi@sopharmis.com`, admin) und Anna (`weissenbacher@sopharmis.com`,
bearbeiter) sind angelegt, **ohne Passwort und damit nicht anmeldbar** — zu
setzen mit `manage.py nutzer_passwort <adresse>`. Der Befehl fasst ein
bestehendes Konto nie an; ein zweiter Lauf ändert an Bernds Konto nichts.

**Was jetzt leer ist:** keine Zeitbuchungen, keine Kontakte, keine
Organisationen, keine Finanzzahlen. Die Oberfläche zeigt dort Leerstellen, keine
Fehler — genau dafür sind sie gebaut.

---

## 2026-09-08 — Der Deploy-Stack: Abbild, zwei Stacks, deploy.sh

Alles unter `betrieb/`. **Gebaut, aber noch nie gelaufen** — es gibt keine
Maschine, und auf dieser hier ist kein Docker. Das Abbild ist nie gebaut
worden; geprüft ist nur, was sich ohne Docker prüfen lässt (`collectstatic`
mit Produktionswerten, die Skript-Syntax, `socos/tests/test_betrieb.py`).

### Entscheidungen, die man den Dateien nicht ansieht

**Der Projektname steht als `name: socos` in der Compose-Datei**, nicht als
`COMPOSE_PROJECT_NAME` in der Umgebung. Beides leistet dasselbe, aber das eine
kann man vergessen und das andere nicht. Ein gleicher Name bedeutete gemeinsame
Volumes — im schlimmsten Fall zwei Anwendungen auf einer Datenbank.

**`POSTGRES_HOST` und `DJANGO_DEBUG` stehen als `environment:`** und gewinnen
damit gegen `env_file`. Die `.env` ist eine Vorlage aus der lokalen Welt: Sie
zeigt auf `127.0.0.1` — im Container wäre das der Container selbst — und sie
trägt eine `DJANGO_DEBUG=1`. Als Notbremse kostet das zwei Zeilen; als
vergessene Zeile am Server kostet es den `SECRET_KEY`.

**`collectstatic` läuft im Bau, mit Attrappenwerten in derselben `RUN`-Zeile**
statt in einem `ENV`. `settings.py` liest die Werte beim Import, verbindet sich
aber mit nichts. In einem `ENV` wären sie im laufenden Container gesetzt und
gewönnen gegen die echte Umgebung.

**`proxy-netz` legt kein Stack an, sondern einmal die Hand.** Ein Stack, der es
anlegte, nähme es beim `down` wieder mit — und risse das nächste Projekt an
diesem Proxy vom Netz.

**Der Healthcheck holt die Domain aus `DJANGO_ALLOWED_HOSTS`**, statt sie ein
zweites Mal zu tragen. Er braucht sie, weil er von innen an `127.0.0.1` fragt
und Django ohne passenden `Host` mit 400 antwortet.

**`medien/` und `sicherungen/` sind Volumes und gehören im Abbild schon dem
Nutzer**, der sie beschreibt. Docker legt ein fehlendes Ziel sonst als root an,
und der unprivilegierte Prozess darf nicht hinein.

### Die Falle des Tages: ein Kommentar, der sein eigenes Verbot zitiert

`test_axes.py` sucht im Caddyfile nach der Zeichenfolge, die dort nicht stehen
darf. Der Kommentar, der *erklärt*, warum sie fehlt, enthielt sie — und warf den
Test um. Dasselbe dreimal: das `ports:` in `anwendung.yml`, das `/dev/null` in
`gesundheit.sh`, das `git pull` im Kopf von `deploy.sh`.

**Wer eine Regel über den Quelltext prüft, prüft die Kommentare mit.** Die
Kommentare nennen den Grund jetzt, ohne die verbotene Form zu zitieren. Der
umgekehrte Weg — den Test klüger machen, damit er Kommentare überspringt —
wäre ein Parser für vier Dateiformate gewesen.

---

## 2026-09-06 — Fachliche Festlegungen aus der Abstimmung mit Bernd

Erste Runde Fragen und Antworten. Grundlage für das Datenmodell.

### Leitplanke über allem

**Die Software wird nicht künstlich verkompliziert.** Drei Nutzer, ein internes
Werkzeug. Im Zweifel die kleinere Variante bauen. Keine Konfigurierbarkeit ohne
zweiten konkreten Fall, keine Abstraktion „für später". Gilt für alle Aufgaben,
nicht nur für einzelne Funktionen.

### Team

Anna Weissenbacher, Bernd Gutschi, Florian Dorighi. Mehr Nutzer sind absehbar nicht
geplant; die Leser-Rolle existiert für den Fall, dass Mitarbeiter dazukommen.

### Struktur

Vier Ebenen: **Projekt → Projektphase → Arbeitspaket → Unteraufgabe.** Unteraufgaben waren
im Entwurf schon angelegt (`item.subs`) und sind ausdrücklich gewünscht.

„Overhead" ist **kein Sonderfall im Code**, sondern ein ganz normales Projekt, das
angelegt wird. Sonst gäbe es zwei Wege, Zeit zu verbuchen, und jede Auswertung müsste
beide kennen. Das eine Paket darin, auf das die Uhr ohne Paketwahl läuft, trägt seit
`0013` das Merkmal `ist_auffang` — siehe den Eintrag vom 2026-09-14.

Phasenart bleibt die feste Aufzählung `dev` · `fin` · `ziel`. Sie wählte bis
2026-09-18 die Vorlage für die Stufenliste eines neuen Pakets; seitdem ist sie
nur noch eine Beschriftung.

**Die mittlere Ebene hieß bis 2026-09-18 „Bereich"** (Migration `0017`). Umbenannt,
weil sie in der Sache eine Phase ist: ein Abschnitt mit Anfang, Ende und Pensum, auf
den der nächste folgt. „Bereich" klang nach einem Fach im Regal und ließ offen, ob
zwei davon nebeneinander oder nacheinander laufen — bei einer Kette wie
Anforderungsmanagement → Laborprototypen → Pilotvalidierung ist genau das die Frage.
Die Umbenennung geht durch bis in die API (`/api/phasen/`) und in den Schlüssel
`phasen` in `daten/sopharmis-daten.json`; `daten_einspielen` weist eine Datei mit dem
alten Schlüssel ausdrücklich zurück, statt ein Projekt ohne jede Phase anzulegen.

### Der Arzneimittelspender läuft in Phasen (2026-09-18)

Die Entwicklung des AMS ist keine Sammlung nebeneinanderliegender Pakete mehr,
sondern eine **Kette**: Anforderungsmanagement (abgeschlossen) → Laborprototypen
entwickeln (2026-10-01 bis 2027-02-28) → Erste Pilotvalidierung → MVP-Entwicklung
→ Erprobung klein → Full Redesign → Erprobung groß → CE-MDR. Eine Phase dauert
etwa fünf bis sechs Monate; die Arbeitspakete hängen darunter, und auf sie wird
gebucht.

Gefüllt ist bislang nur „Laborprototypen entwickeln" (AP01–AP07 aus dem
Arbeitsplan, 752 h je Gründer, 1.504 h gesamt). Die übrigen Phasen stehen leer —
absichtlich: Ein erfundenes Paket wäre in jeder Auslastung mitgezählt worden.

**Die Sachkosten aus AP05 (1.000 Euro Material) stehen im Beschreibungstext**
und nicht in einem eigenen Feld. Ein Kostenfeld am Paket für genau einen Fall
wäre Konfigurierbarkeit ohne zweiten Fall — und es tauchte in keiner
Finanzübersicht auf, weil die aus Kontoständen und Fixkosten rechnet. Kommt der
zweite Fall, wird die Grenze hier neu gezogen.

### `daten_einspielen --abgleichen`

Der Befehl konnte bis 2026-09-18 nur auf eine **leere** Datenbank einspielen.
Damit war die Datei `daten/sopharmis-daten.json` für einen laufenden Bestand
wertlos: Man hätte alles wegwerfen müssen, samt gebuchter Zeit. `--abgleichen`
zieht einen bestehenden Bestand aus der Datei nach.

**Wiedererkannt wird am Titel**, nicht an der `id` aus der Datei: Die steht
nirgends in der Datenbank, und ein zweites Feld nur zum Wiederfinden wäre ein
Schlüssel, den niemand pflegt und der beim ersten Umbenennen in der Oberfläche
falsch ist. Die Folge ist bewusst in Kauf genommen: Wer eine Phase in der
Oberfläche umbenennt, bekommt beim nächsten Abgleich eine zweite daneben.

**Ein Paket mit gebuchter Zeit wird nicht gelöscht, sondern „verworfen".**
`on_delete=PROTECT` steht zwischen Buchung und Paket, und weiches Löschen prüft
das nach — ein gelöschtes Paket machte seine Buchungen zu Waisen: in keiner
Liste mehr sichtbar, aber weiter im Zeitnachweis. Als „verworfen" nimmt es keine
neue Zeit mehr an, die alte bleibt auffindbar und umbuchbar. Der Befehl sagt es
laut; still wegzuräumen wäre falsch, weil die Entscheidung — umbuchen oder
stehenlassen — eine fachliche ist. Dieselbe Regel für die Phase darüber: Sie
bleibt stehen und rückt auf `RESTPLATZ` (900) ans Ende, statt mitten in der
Kette eine Position zu behaupten, die sie nicht mehr hat.

Konkret betrifft das **„Finanzierung beantragen"** — ein Paket aus der alten
Gliederung mit einer Buchung daran. Es steht als „verworfen" in der Restphase
„Entwicklung" am Ende des Projekts, bis jemand die Buchung umbucht.

### Laufzeit, Abschluss und Pensum (2026-09-18, Migration `0018`)

**Die Projektphase trägt `von`, `bis` und `abgeschlossen`.** Beide Daten dürfen
leer bleiben — eine Phase, die erst in zwei Jahren ansteht, hat noch keines, und
ein erfundenes stünde in jeder Hochrechnung.

`abgeschlossen` ist **ein eigenes Merkmal und nicht „`bis` liegt in der
Vergangenheit"**: Eine Phase läuft regelmäßig über ihr geplantes Ende hinaus.
Wäre das Datum die Sperre, fiele die Uhr an einem willkürlichen Morgen aus, ohne
dass jemand etwas entschieden hätte.

**Das Pensum ist ein eigenes Modell** (`Pensum`: Paket + Person + Stunden), kein
Feld am Paket und keine JSON-Liste darin. Im Arbeitsplan steht „AP02 — BG 270 h,
FD 140 h"; eine Gesamtzahl am Paket beantwortete nicht die Frage, die jemand am
Morgen wirklich hat — wie viel davon *er selbst* noch offen hat. Durch die Zahl
der Beteiligten teilen ginge nicht: Der eine trägt 270 Stunden, der andere 140.
Höchstens ein Eintrag je Paket und Person (`UniqueConstraint` auf die nicht
gelöschten); zwei wären zwei Pensen für dieselbe Arbeit, und keine Anzeige
könnte entscheiden, welches gilt. Stunden sind `Decimal` und gehen als
Zeichenkette hinaus.

**`Arbeitspaket.notiz` heißt jetzt `beschreibung`** (`RenameField`, nicht
entfernen und neu anlegen — `makemigrations` schlägt hier von sich aus das
Falsche vor, und die zehn Notizen an den Förderanträgen wären still weg
gewesen).

### Wer keine Zeit mehr annimmt

`Arbeitspaket.grund_gegen_buchung()` ist die **eine** Stelle, an der das steht,
und sie liefert einen Satz statt eines Wahrheitswerts: Die Antwort wird dem
Nutzer gezeigt, und „nicht buchbar" sagt ihm nicht, was er stattdessen tun soll.
Drei Gründe: weich gelöscht, Phase abgeschlossen, Status außerhalb von
`BUCHBARE_STAENDE`.

**Die Liste stand bis 2026-09-18 nur im Frontend** (`basis/start.ts`). Dort
räumte sie das Auswahlfeld auf und hielt nichts auf — ein `POST /api/zeiten/`
mit der Paketnummer ging durch, und die Zeit stand danach an einem Paket, das
seit Monaten zu war. Jetzt prüfen `_paket` (Start und Umbuchen) und der
`ZeitbuchungSerializer` (Nachtragen und Ändern); das Frontend liest
`paket.buchbar` vom Server, statt die Regel ein zweites Mal zu bauen.

Geprüft wird nur ein **neu gewähltes** Ziel. Eine Buchung, deren Phase inzwischen
abgeschlossen ist, bleibt änderbar — sonst wäre ein Tippfehler in der Uhrzeit für
immer eingefroren, und der einzige Ausweg wäre das Löschen der Zeit. Und die
laufende Uhr lässt sich noch stoppen: Ein Clock-out ohne Zielwechsel wählt kein
Paket.

### Stufen (überholt — seit 2026-09-18 entfernt, siehe oben)

Ein **Arbeitspaket** trägt seine eigene Stufenliste (Name + Dauer in Monaten). Beim
Anlegen wird sie aus der Vorlage der Phasenart kopiert und ist danach frei
änderbar — Namen wie Dauern.

**Warum am Paket und nicht an der Phase** (seit Migration `0004`, davor lag sie
eine Ebene höher): Eine Phase enthält Pakete verschiedenen Zuschnitts. Ein Antrag,
ein Prototyp und eine Doku laufen weder über dieselben Stufen noch über dieselben
Dauern. Eine Leiste für alle Pakete einer Phase zeigt für die meisten einen
Fortschritt, der so nie gemessen wurde.

**Warum kopieren statt vererben:** „je Paket anpassbar" wäre auch über eine
Vererbungskette mit Überschreibungen zu haben. Die müsste man aber bei jeder Anzeige
auflösen, und man sieht einem Paket dann nicht an, welche Stufen für es gelten.
Eine kopierte Liste ist ein Wert, kein Verweis — sie ist beim Lesen fertig.

Die drei Vorlagen (Namen sind bestätigt, Dauern sind der Stand aus dem Entwurf):

| Schlüssel | Stufen (Monate) |
|---|---|
| `dev` | Konzept 1 · Umsetzung 3 · Test 2 · Abschluss 1 |
| `fin` | Vorbereitung 1 · Einreichung 1 · Entscheidung 2 · Abrechnung 1 |
| `ziel` | Definition 1 · Abstimmung 1 · Verankert 1 |

Drei Entscheidungen dazu, die man dem Code sonst nicht ansieht:

- **Der Aufruf schickt nur den Namen der Vorlage**, nie ihren Inhalt
  (`POST /pakete/<id>/vorlage/`). Sonst stünden die Stufen ein zweites Mal im
  Frontend, und beim nächsten Nachbessern gäbe es zwei Fassungen davon.
- **Eine Vorlage setzt den Stand auf null.** „Stufe 3" heißt in einer anderen
  Leiste etwas anderes — ihn zu übernehmen wäre eine Behauptung.
- **Wer die Leiste kürzt, meint nicht den Stand:** Der wird gekappt, nicht mit
  einer Fehlermeldung abgewiesen. Sonst stünde ein Paket auf Stufe 4 von 2 und
  zeigte 100 %. Ein **ausdrücklich** mitgeschickter Stand außerhalb der Leiste
  wird weiter abgewiesen.
- **Eine geleerte Leiste wird nicht wieder befüllt.** Sie ist eine Entscheidung
  („dieses Paket hat keine Stufen"), keine Lücke — `save` füllt nur beim Anlegen.
- **Die Dauern werden beim Schreiben geprüft** (Name da, `monate` ganze Zahl
  0–120), nicht erst beim Rechnen. `fortschritt` machte aus einem Text in
  `monate` still eine 1 und lieferte eine falsche Prozentzahl — die sieht man ihr
  nicht an.

### Paketstatus

**Sieben Werte**, nicht die fünf aus dem JSON-Entwurf:
`offen · laeuft · eingereicht · zugesagt · fertig · verworfen · offene_frage`

Die fünf im JSON waren eine Vereinfachung. Für Förderanträge sind „eingereicht" und
„zugesagt" die entscheidenden Zwischenzustände — genau die, die man wissen will.

### Zeit

- Buchung hängt **am Arbeitspaket** (Pflicht), nicht am Projekt. Projekt und Phase
  ergeben sich daraus. Unteraufgaben bekommen keine eigenen Buchungen — eine Ebene
  reicht, sonst zerfällt jede Auswertung in zwei Töpfe.
- **Rundung auf 5 Minuten erst in der Auswertung**, nie beim Speichern. Gespeichert
  werden Start und Ende sekundengenau. Wer beim Erfassen rundet, kann die Rundung
  nicht mehr zurücknehmen, wenn die Regel sich ändert.
- **Nacherfassen ist eine eigene Funktion** mit eigenem Untermenü, kein Sonderfall im
  Clock-in. Vergessene Zeiten sind der Normalfall, nicht die Ausnahme.
- **Vergessener Clock-out:** Eine Buchung, die über das Tagesende hinausläuft, wird
  am Tagesende beendet und als **Entwurf** markiert. Sie muss beim nächsten Öffnen
  bestätigt oder korrigiert werden und zählt bis dahin in keiner Auswertung mit.
  Ein Entwurf ist damit sichtbar unfertig — besser als eine 14-Stunden-Buchung, die
  echt aussieht.
- Notiz beim Clock-out bleibt überspringbar (mit Rückfrage), so wie im Entwurf.
- Fremde Buchungen ändern dürfen Admin **und** Bearbeiter; löschen nur Admin.

### Geld

**Keine Abrechnung.** Kein Stundensatz, keine Umsatzsteuer, kein Rechnungsnummernkreis,
keine Förderabrechnung. Sopharmis ist förderfinanziert und stellt niemandem eine
Rechnung. Damit entfällt auch die im Startprompt beschriebene „eingefrorene
Rechnungsposition" — **es gibt derzeit keinen Beleg im System.** Die Grenze zwischen
gerechnet und eingefroren liegt aktuell also so: **alles wird gerechnet.**

Was es gibt:

- **Kontostand** als Stichtagswert. Beliebig viele Stichtage, jeder wird über sein
  Datum einem Monat zugeordnet. Kein Zwang, genau einen pro Monat zu haben.
- **Fixkosten** — der wiederkehrende Monatsbetrag. Basis für Verlauf und Prognose.
- **Monatskosten** — was in einem konkreten Monat tatsächlich angefallen ist.
- **Runway** wird gerechnet: Kontostand ÷ erwartete Monatskosten. Erwartet =
  Durchschnitt der letzten drei erfassten Monatskosten, solange es drei gibt, sonst
  die Fixkosten. *(So verstanden aus „mach da einfach was schlaues" — wenn die
  Prognose anders gemeint war, steht sie an einer Stelle in `socos/services/` und ist
  in fünf Minuten geändert.)*

### Zeitnachweis

**PDF-Export der Stunden eines Monats als saubere Tabelle** — je Person einzeln
herunterladbar und einmal für alle zusammen. Das ist der einzige Berichtsbedarf.

### Rollen

Drei Django-Gruppen. Entschieden wird ausschließlich serverseitig, die Schwellen
stehen an genau einer Stelle in `socos/berechtigung.py`.

| | Admin (Bernd, Florian) | Bearbeiter (Anna) | Leser (später) |
|---|---|---|---|
| Alles sehen, inkl. Finanzen und fremder Stunden | ✓ | ✓ | ✓ |
| Eigene Zeiten buchen und ändern | ✓ | ✓ | — |
| Fremde Zeiten ändern | ✓ | ✓ | — |
| Projekte, Phasen, Pakete, Kontakte pflegen | ✓ | ✓ | — |
| Finanzen eintragen | ✓ | — | — |
| Löschen | ✓ | — | — |
| Nutzer und Rollen verwalten | ✓ | — | — |

Der Leser sieht **alles**, auch Kontostand, Runway und die Stunden der anderen — so
ausdrücklich entschieden. Profil-Stammdaten (Adresse, Geburtsdatum) sieht nur man
selbst und der Admin.

### Regulatorik

Die Zeitdokumentation **muss auditierbar sein**.

- **Es gibt kein hartes Löschen.** Alles wird weich gelöscht: verschwindet aus den
  Listen, bleibt im Protokoll, ist für den Admin wiederherstellbar. **Ein** Mechanismus
  — kein zweiter Storno-Weg daneben, den man beim nächsten Modell vergisst.
- **Änderungsprotokoll: wer, wann, was, alt → neu je Feld.** Keine Begründungspflicht
  bei nachträglichen Änderungen.

### Vorerst nicht gebaut

- **Termine und Tasks** — bewusst zurückgestellt. Bernd geht die Liste erst durch.
- **Datenimport** aus `daten/sopharmis-daten.json` — die Datei wird erst gekürzt.
  Der Import kommt danach.
- **Fremdsysteme** (Kalender, Buchhaltung) — derzeit keine, ggf. später.

### Betrieb

- Domain: **socos.test.sopharmis.com** (Subdomain von sopharmis.com).
- VPS bei **Hetzner**, läuft seit 9. September 2026 — Einzelheiten in SERVER.md.
  Es ist der **Testauftritt**; eine getrennte Maschine für den echten Betrieb
  gibt es noch nicht.
- **Der DNS-Eintrag steht bei Cloudflare grau (DNS only), und das ist kein
  Versehen:** Universal SSL deckt nur eine Subdomain-Ebene ab, `socos.test.…`
  ist zwei. Orange scheitert schon am Handshake, und Let's Encrypt käme nicht
  durch. Begründung in SERVER.md.
- **Sicherung außer Haus und Restore-Test: offener Punkt**, siehe unten.

---

## 2026-09-08 — Die Marke: Wortmarke, Signet, Zeichen der Oberfläche

### Was gewählt wurde

**Klein einfarbig, groß zweifarbig.** In der Kopfleiste steht „SoCoS" in
Figtree 700 über einer Mono-Zeile — die *Bauweise* des Sopharmis-Logos (fett
oben, Schreibmaschine unten, beide auf eine Breite gezogen), nicht dessen
Schrift. *(Nachtrag 2026-09-09: Die Mono-Zeile ist aus der Kopfleiste heraus —
sie kostete dort achtzig Pixel und machte die Leiste bei 1280 px zweizeilig.
Auf der Anmeldeseite steht die Marke unverändert.)* Auf der Anmeldeseite steht dieselbe Marke groß, und dort sind die
beiden kleinen **o** kupfern: das Kürzel entziffert sich selbst als
**So**pharmis **Co**ntrolling **S**oftware.

**Warum nicht die Schrift des Mutterlogos** (DejaVu Sans Bold bzw. Verdana
Bold, beide auf dem Bitstream-Vera-Skelett): Sie kommt in der Anwendung sonst
nirgends vor und stünde zwischen lauter Figtree wie eingeklebt. Dazu kommt die
Lizenz — Verdana-Konturen dürfen nicht weitergegeben werden; frei wären nur
DejaVu (Vera-Lizenz) oder Figtree (OFL). *(Nachtrag 2026-09-12: Die Schrift der
Oberfläche ist jetzt Archivo — siehe den Eintrag zur neuen visuellen Sprache.
Das Argument bleibt dasselbe, nur der Name der Umgebungsschrift ändert sich.)*

**Signet: vier abgestufte Balken** — Projekt · Projektphase · Arbeitspaket ·
Unteraufgabe; der kupferne ist das Arbeitspaket, die Ebene, an der die Uhr
hängt. Ein „S" im Quadrat wäre bei 16 px lesbarer gewesen, hätte neben
„SoCoS · Sopharmis" in der Kopfleiste aber dieselbe Auskunft ein drittes Mal
gegeben.

### Vier Fallen, die dabei aufgefallen sind

**Die Maße des Signets sind alle durch 4 teilbar.** Bei 16 px ist eine
Rastereinheit (von 64) genau ein Viertelpixel. Die erste Fassung — Balkenhöhe
7, Abstand 5, Rand 10 — lag auf 1,75 Pixeln je Balken; im Reiter wurde daraus
ein grauer Verlauf statt vier Balken. Mit Höhe 8, Abstand 8, Rand 4 fällt jede
Kante auf eine ganze Pixelgrenze. *(Abstand und Rand sind am 2026-09-13 wieder
gefallen — siehe den Eintrag „Das Zeichen bekommt einen Rand" oben. Die Regel
„durch 4 teilbar" hat dabei zum zweiten Mal einen Fehler gefangen.)*

**`/favicon.svg` an der Wurzel käme nie an.** Die letzte Route in
`konfiguration/urls.py` fängt alles ab, was nicht `api/`, `admin/`, `static/`
oder `medien/` ist — ein Favicon an der Wurzel bekäme die React-Seite
ausgeliefert. Die Symboldateien liegen deshalb in `statisch/` und werden über
`/static/` geholt. Der Ordner steht **vor** `frontend/dist` in
`STATICFILES_DIRS`.

**Feste Pfade statt `static`-Tag auf der Anmeldeseite.** Die Ablage arbeitet
mit einem Manifest (`CompressedManifestStaticFilesStorage`), und das kennt
eine Datei erst nach `collectstatic`. Der Tag hat den Test der Anmeldeseite
sofort umgeworfen. Genau diese Seite muss aber stehen, bevor irgendetwas
gebaut ist. `collectstatic` legt neben der Datei mit Prüfsumme auch die unter
ihrem echten Namen ab — `/static/favicon.svg` findet also beides.

**Die Geometrie des Signets steht an einer Stelle:** `socos/marke.py`. Von
dort erzeugt `python manage.py symbole` das SVG, das ICO und das
Apple-Touch-Icon, und derselbe Modul liefert dem Zeitnachweis die Balken für
den PDF-Kopf. Kopfleiste und Anmeldeseite zeichnen nichts nach, sondern binden
`favicon.svg` als Bild ein. Nachgezeichnet wäre das Zeichen beim ersten
Nachbessern an einer der vier Stellen falsch — und man sähe es im Reiter oder
auf einem Blatt, das schon verschickt ist.

### Zeichen der Oberfläche

Sechzehn Zeichen in `frontend/src/bausteine/Zeichen.tsx`, selbst gezeichnet:
ein Raster (24), eine Strichstärke, Farbe von `currentColor`; die Regeln
stehen in `bausteine.css`, nicht je Zeichen. Sie ersetzen unter anderem die
getippten Pfeile `↑ ↓ ✕ ▾ ▸` — Schriftzeichen, die auf jedem Gerät anders
aussehen und in keiner Größe zum Rest passen.

Das Zeichen für „Projekt" ist mit Absicht die Abstufung aus dem Signet. Der
Knopf „Paket wählen" hat seines wieder verloren: Damit stand dasselbe
Balkenbild dreimal in einer Leiste.

## 2026-09-07 — Betriebsfunktionen: sichtbare Fehler, Team, Protokoll

Drei Dinge, ohne die sich die Anwendung nicht sauber betreiben lässt:

**Ein fehlgeschlagenes Speichern war unsichtbar.** Der Knopf reagierte, die
Zeile änderte sich nicht, und niemand wusste, ob es geklappt hat. Bei einer
Zeiterfassung heißt das: jemand glaubt, seine Stunden seien gebucht, und sie
sind es nicht. `basis/meldungen.ts` zeigt jetzt jeden schreibenden Fehlschlag
als Banner — mit einem Satz, der sagt, was los ist (409 nennt, was im Weg
steht). **Nur schreibende Aufrufe**; lesende haben ihren Weg über `Zustand`,
sonst stünde bei jedem Netzwackler ein Banner im Bild. Ein Fehler verschwindet
nicht von selbst, eine Erfolgsmeldung nach vier Sekunden schon: Ein Fehler, den
man wegblinzeln kann, wird übersehen.

**Eine abgelaufene Sitzung führt jetzt von überall zur Anmeldung**, nicht nur
beim ersten Abruf. Sonst klickt jemand weiter und wundert sich, warum nichts
gespeichert wird.

**Nutzerverwaltung und Änderungsprotokoll** stehen auf der Profilseite. Rollen
vergeben und Konten stilllegen darf nur der Admin — und **nicht für sich
selbst**: Sonst nimmt sich der letzte Admin versehentlich die Rechte und kommt
an die Verwaltung nicht mehr heran. Konten werden nie gelöscht, nur stillgelegt;
an ihnen hängen Zeiten, die im Nachweis stehen bleiben müssen.

**Kein Anlegeformular für Konten im Browser.** Das bleibt bei `nutzer_anlegen`
und `nutzer_passwort` an der Kommandozeile. Ein Formular hieße, dass irgendwann
jemand ein Passwort in ein Feld tippt — und damit in den Browserverlauf und in
den Passwortspeicher.

---

## 2026-09-07 — UI/UX-Durchgang: fünf gemessene Befunde

Vollständiger Durchgang an 1280×800 und 375×812, hell und dunkel, mit
Probedaten. **Gemessen statt geschaut** — per Skript im Browser, weil Augenmaß
genau die Fehler übersieht, die knapp danebenliegen.

1. **Die Grautöne aus dem Entwurf fallen durch WCAG AA.** `#7C8A8C` erreicht
   auf Weiß 3,58:1, `#8B979A` sogar nur 3,00:1 — verlangt sind 4,5:1 für Text
   unter 18 px. Und genau in diesen Tönen stehen die 11-px-Beschriftungen über
   jeder Karte, also der kleinste Text der Anwendung. Ersetzt durch `#5A6668`
   und `#5E6A6C`; die halten 4,5:1 auf Weiß, Seitengrund und leiser Fläche und
   behalten den Farbton. **Das ist eine bewusste Abweichung vom verbindlichen
   Entwurf** — Bernd weiß davon.
   `socos/tests/test_kontrast.py` rechnet die ganze Palette nach, ohne Browser.

2. **Handy-Regeln standen mitten in der Datei.** `.feld-klein { min-height: 34px }`
   stand *nach* dem Media-Query und hat die 44 px darin stillschweigend
   gewonnen — der Knopf war zu klein, und im Stylesheet sah beides richtig aus.
   Alle Handy-Regeln stehen jetzt in **einem** Block am Ende von
   `bausteine.css`, mit dem Grund als Kommentar darüber.

3. **Die Stufenleiste lief am Handy über den Rand.** Vier Stufen nebeneinander
   passen nicht in 375 px. Sie wird dort zur Liste — waagrecht scrollen wäre
   schlechter, weil die letzte Stufe genau die ist, die man antippt, um ein
   Paket auf „fertig" zu setzen.

4. **Runway zeigte „10.8 Mon."** — Punkt statt Komma. Dasselbe hatte der
   Zeitnachweis mit „26.25 Stunden".

5. Logo-Knopf 35 px, Inline-Änderfelder 24–32 px, die drei PDF-Knöpfe schoben
   die Karte über den Rand. Alles auf 44 px bzw. umbrechend.

Die Prüfung selbst: kein waagrechtes Scrollen der Seite, jedes Fingerziel
≥ 44 px, Eingabefelder ≥ 16 px (darunter zoomt iOS), nichts läuft aus seinem
Kasten, und jedes Text-auf-Grund-Paar erreicht sein AA-Verhältnis.

---

## 2026-09-07 — Die Oberfläche steht

Dashboard, Projekt, Zeit, Kontakte und Profil, dazu die Kopfleiste mit der
laufenden Uhr. Kein CSS-Rahmenwerk, keine Icon-Bibliothek; alle Farben kommen
aus `farben.css`, und ein Test verbietet Hex-Werte in Komponenten.

Entscheidungen, die man dem Code sonst nicht ansieht:

- **Kein react-router.** Fünf Seiten und eine einzige Unterseite. Ein Rahmenwerk
  brächte mehr Begriffe mit, als die Anwendung Wege hat. Welche Unterseite es zu
  welcher Seite gibt, steht in `router.ts` in `UNTERSEITEN`; was dort nicht steht,
  wird beim Lesen des Pfades verworfen. Sonst hinge an einer erfundenen zweiten
  Stufe eine Ansicht in einem Zustand, den niemand vorgesehen hat.
- **Alles Ändern steht unter `/projekt/bearbeiten`, nichts in der Übersicht.**
  Anlegen, Umordnen und Entfernen standen als Knöpfe in jeder Zeile und haben die
  Ansicht zugestellt — beim Lesen sind sie Rauschen, und der Papierkorb neben einem
  Paket ist einer zu viel. Dasselbe galt für die Texte: Ein Klick auf eine
  Überschrift machte ein Eingabefeld auf, auch wenn man nur lesen wollte. Die
  Übersicht kann darum nur noch **arbeiten** — Status, Stufenstand, Haken,
  Clock-in —, alles Schreiben von Text und Struktur sitzt im Bearbeiten.
  **Beide Modi sind dieselben Komponenten mit einem Schalter (`bearbeiten`), keine
  zweite Ansicht** — die zweite wird beim nächsten neuen Feld vergessen, und dann
  steht in der Übersicht etwas, das im Bearbeiten fehlt.
- **Ein Knopf am rechten Rand, kein Reiterpaar.** Zwei Reiter behaupten zwei
  gleichrangige Ansichten; es gibt aber eine Ansicht und einen Sonderzustand, in
  den man selten geht. Den Knopf sieht nur, wer bearbeiten darf — die Schwelle
  selbst bleibt serverseitig.
- **Projektkarten stehen nebeneinander, sobald der Platz für zwei Spalten reicht**
  (`minmax(min(420px, 100%), 1fr)`). Das `min(…, 100%)` ist nicht Zierat: Mit
  nacktem `420px` wäre die Spur am Handy breiter als das Fenster und die Seite
  scrollte waagrecht.
- **Die Uhr zählt aus dem Startzeitpunkt hoch**, nicht aus einem eigenen
  Zähler. Ein Zähler, der bei 0 beginnt, zeigt nach einem Neuladen eine falsche
  Dauer — und genau dann schaut jemand hin.
- **Nach jeder Änderung werden alle betroffenen Abrufe verworfen**, statt
  einzelne Einträge im Zwischenspeicher nachzuziehen. Das Nachziehen wäre eine
  zweite Stelle, an der steht, was eine Buchung mit einer Projektsumme macht.
- **Ein zweiter Klick auf dieselbe Stufe nimmt sie zurück.** Sonst käme man von
  einem Fehlgriff nur über den Umweg der Nachbarstufe wieder weg.
- **Die Phasenart wird nur angezeigt, wenn sie etwas hinzufügt.**
  „Entwicklung Entwicklung" ist Rauschen, das man beim Lesen aussortiert.
- **Das Überspringen der Clock-out-Notiz fragt einmal nach.** Eine erzwungene
  Notiz führt dazu, dass „x" eingetragen wird — und dann steht überall „x".

Geprüft an 1280×800 und 375×812, hell und dunkel, mit Daten und ohne. Die
Probedaten für die Sichtprüfung wurden danach hart entfernt, samt ihrer
Protokolleinträge: Die Anwendung startet leer, Daten kommen aus `daten/`.

---

## 2026-09-07 — Weiches Löschen ging an `PROTECT` vorbei

Beim Bauen der Schnittstelle aufgefallen: Ein Projekt ließ sich löschen, obwohl
Zeitbuchungen daran hingen. `on_delete=PROTECT` greift nämlich nur beim echten
Löschen — weiches Löschen ist für die Datenbank ein `UPDATE`, und der Schutz
läuft dabei ins Leere. Die Buchungen wären Waisen geworden: in keiner Liste mehr
sichtbar, aber weiter in der Datenbank und in jedem Nachweis.

`Basismodell.geschuetzte_verweise()` prüft das jetzt von Hand und wirft
`ProtectedError`; die zentrale Fehlerübersetzung macht daraus die 409, die es
schon gab. Weich Gelöschtes hält dabei **nicht** dagegen — sonst ließe sich nach
dem ersten Löschen nie wieder etwas entfernen.

`queryset.delete()` läuft dafür Zeile für Zeile statt als ein `UPDATE`. Das ist
langsamer und bei drei Nutzern völlig gleichgültig; ein Sammel-Update risse
genau die Beziehungen auf, die der Schutz verhindern soll.

## 2026-09-07 — Decimal wurde in der API stillschweigend zu float

`COERCE_DECIMAL_TO_STRING` deckt nur Felder ab, die durch einen Serializer
laufen. Ein `Decimal` in einem gewöhnlichen dict — etwa im Dashboard — machte
DRF kommentarlos zu einem `float`. Der Fehler wäre unsichtbar geblieben:
`10000.0` sieht aus wie `"10000.00"`.

Dafür gibt es jetzt `socos/renderer.py`. **Beides wird gebraucht**, die
Einstellung und der Renderer.

---

## 2026-09-07 — Ohne Sitzung führte die Oberfläche in eine Sackgasse

Wer `/` ohne Anmeldung öffnete, bekam von `/api/ich/` eine 403 mit
`not_authenticated`. Das Frontend zeichnete daraus „Das hat nicht geklappt" —
eine Fehlerseite ohne Weg zur Anmeldung. Das Gerüst war damit fertig, aber
nicht benutzbar.

`frontend/src/basis/anmeldung.ts` schickt jetzt bei **`not_authenticated`** zur
Anmeldung und hängt den Weg als `?next=` an. Bei `permission_denied`
ausdrücklich **nicht**: Dort steht die Sitzung, und wer zur Anmeldung geschickt
wird, verliert sie für nichts und landet danach wieder auf derselben verwehrten
Seite. Genau dafür gibt es das `code`-Feld an der 403.

Nebenbei: Im Dunkelmodus stand weiße Schrift auf dem aufgehellten Türkis des
Knopfes — 2,3:1. Dafür gibt es jetzt `--auf-marke` in beiden Paletten.

**Falle, die dabei eine Stunde gekostet hätte:** `runserver --noreload` hält
Vorlagen im Zwischenspeicher fest. Eine geänderte `anmelden.html` wurde weiter
in der alten Fassung ausgeliefert. Steht in CLAUDE.md.

---

## 2026-09-06 — Python 3.12 statt 3.14

Lokal liegen 3.12 und 3.14. Genommen wird **3.12**: Django 5.2 nennt 3.10–3.13 als
unterstützt, und bei 3.14 hängt man an Wheels, die es für Randabhängigkeiten noch
nicht überall gibt. Es gibt keinen Grund, das Risiko für nichts einzugehen.

---

## Offene Punkte

- [ ] **Kopie außer Haus** — wohin, und verschlüsselt ja/nein. Bei Personendaten
      wäre verschlüsselt die Antwort; dann braucht der Schlüssel einen Ort, der
      nicht im selben Archiv liegt.
- [ ] **Restore-Test mit Datum** in SERVER.md. Ein Restore ohne Test ist kein Backup.
- [ ] **Zeitbuchung auf Unteraufgaben** — vorerst bewusst nicht (gebucht wird
      aufs Paket). Bernd hält sich offen, das später zu ändern. Der Umbau wäre
      ein nullbares Feld `unteraufgabe` an `Zeitbuchung` plus eine Entscheidung,
      wie eine Auswertung dann beide Ebenen zusammenfasst.
- [ ] Termine/Tasks: Modell festlegen, sobald Bernd die Liste gekürzt hat.
      **Events sind das nicht** — sie haben keine Uhrzeit und keine Erinnerung.
      Wer das später baut, soll sie nicht dafür umwidmen.
- [ ] Datenimport bauen, sobald `daten/sopharmis-daten.json` bereinigt ist.
