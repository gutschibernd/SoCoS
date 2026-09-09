# MEMORY — Warum-Entscheidungen, Fallen, offene Punkte

Neueste Einträge oben. Dieses Dokument beantwortet die Fragen, die man dem Code in
zwei Jahren nicht mehr ansieht. Es wird **im selben Commit** gepflegt, sobald eine
Änderung ein Schema, eine Architekturentscheidung oder einen fachlichen Sonderfall
betrifft.

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
der Mensch davor. Der Dialog sagt das ausdrücklich; die Kopie außer Haus samt
Verschlüsselung bleibt der offene Punkt unten.

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
Stellen, die noch anstehen. Geprüft werden Bereichsart, Paketstatus, E-Mail und
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

Vier Ebenen: **Projekt → Bereich → Arbeitspaket → Unteraufgabe.** Unteraufgaben waren
im Entwurf schon angelegt (`item.subs`) und sind ausdrücklich gewünscht.

„Overhead" ist **kein Sonderfall im Code**, sondern ein ganz normales Projekt, das
angelegt wird. Sonst gäbe es zwei Wege, Zeit zu verbuchen, und jede Auswertung müsste
beide kennen.

Bereichsart bleibt die feste Aufzählung `dev` · `fin` · `ziel`. Sie wählt die
Vorlage für die Stufenliste eines neuen Pakets, sonst nichts.

### Stufen

Ein **Arbeitspaket** trägt seine eigene Stufenliste (Name + Dauer in Monaten). Beim
Anlegen wird sie aus der Vorlage der Bereichsart kopiert und ist danach frei
änderbar — Namen wie Dauern.

**Warum am Paket und nicht am Bereich** (seit Migration `0004`, davor lag sie am
Bereich): Ein Bereich enthält Pakete verschiedenen Zuschnitts. Ein Antrag, ein
Prototyp und eine Doku laufen weder über dieselben Stufen noch über dieselben
Dauern. Eine Leiste für alle Pakete eines Bereichs zeigt für die meisten einen
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

- Buchung hängt **am Arbeitspaket** (Pflicht), nicht am Projekt. Projekt und Bereich
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
| Projekte, Bereiche, Pakete, Kontakte pflegen | ✓ | ✓ | — |
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
Schrift. Auf der Anmeldeseite steht dieselbe Marke groß, und dort sind die
beiden kleinen **o** kupfern: das Kürzel entziffert sich selbst als
**So**pharmis **Co**ntrolling **S**oftware.

**Warum nicht die Schrift des Mutterlogos** (DejaVu Sans Bold bzw. Verdana
Bold, beide auf dem Bitstream-Vera-Skelett): Sie kommt in der Anwendung sonst
nirgends vor und stünde zwischen lauter Figtree wie eingeklebt. Dazu kommt die
Lizenz — Verdana-Konturen dürfen nicht weitergegeben werden; frei wären nur
DejaVu (Vera-Lizenz) oder Figtree (OFL).

**Signet: vier abgestufte Balken** — Projekt · Bereich · Arbeitspaket ·
Unteraufgabe; der kupferne ist das Arbeitspaket, die Ebene, an der die Uhr
hängt. Ein „S" im Quadrat wäre bei 16 px lesbarer gewesen, hätte neben
„SoCoS · Sopharmis" in der Kopfleiste aber dieselbe Auskunft ein drittes Mal
gegeben.

### Vier Fallen, die dabei aufgefallen sind

**Die Maße des Signets sind alle durch 4 teilbar.** Bei 16 px ist eine
Rastereinheit (von 64) genau ein Viertelpixel. Die erste Fassung — Balkenhöhe
7, Abstand 5, Rand 10 — lag auf 1,75 Pixeln je Balken; im Reiter wurde daraus
ein grauer Verlauf statt vier Balken. Mit Höhe 8, Abstand 8, Rand 4 fällt jede
Kante auf eine ganze Pixelgrenze.

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
- **Die Bereichsart wird nur angezeigt, wenn sie etwas hinzufügt.**
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
- [ ] Datenimport bauen, sobald `daten/sopharmis-daten.json` bereinigt ist.
