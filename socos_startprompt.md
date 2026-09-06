Wir bauen ein neues Projekt auf einer frischen VPS. Das Verzeichnis ist leer.

# FACHLICH

Wir schreiben **SoCoS** — „Sopharmis Controlling Software": Projektsteuerung,
Kundenverwaltung und Zeiterfassung für ein MedTech-Startup.

Nutzer sind drei Cofounder: Anna, Bernd und Florian. Mehr werden es absehbar nicht.
Es sollen vorest mal Bernd und FLorian alles sehen und alles verwaltten bearbeiten und löschen können. Anna soll alles sehen und bearbeiten können. 
Es soll aber eine 3 stufe eingefüfgt werden nur lesen fall einmal mitarbeiter kommen


# ARCHITEKTUR (bewährt, bitte übernehmen)

- Django 5 + DRF liefert unter `/api/` die Schnittstelle, unter `/` die gebaute
  React-Anwendung (Vite). Ein Dienst, ein Ursprung, kein CORS.
- PostgreSQL 16. Schemaänderungen nur über Migrationen, nie per SQL. Gelaufene
  Migrationen werden nie bearbeitet — Korrekturen sind neue Migrationen.
- Lokal läuft alles nativ (venv, Homebrew-Postgres). Docker ist ausschließlich der
  Weg für den Server.
- **Lokale Ports: 8003 (Django) und 5176 (Vite).** 8000/5173 und 8001/5174 gehören
  zwei anderen Projekten auf derselben Maschine. `vite.config.ts` liest `PORT` und
  `DJANGO_PORT` aus der Umgebung, damit ein Worktree eigene Ports nehmen kann: Ein
  Vite auf fremdem Port, dessen Proxy noch auf den Hauptport zeigt, mischt zwei
  Zweige in einer Ansicht, und das sieht man nicht.
- Am Server zwei getrennte Compose-Stacks: die Anwendung (gunicorn + db) und ein
  Front-Proxy (Caddy 2), der allein 80/443 hält, TLS terminiert und über ein externes
  Docker-Netz auf den Alias der Anwendung verteilt. Die Anwendung veröffentlicht
  keinen einzigen Port. Der Proxy gehört keiner Anwendung, damit später weitere
  Projekte dazukommen können, ohne dass ein Deploy dieses Projekts ihre
  Erreichbarkeit antastet. `COMPOSE_PROJECT_NAME=socos` ist nicht optional — ein
  gleicher Name bedeutete gemeinsame Volumes und im schlimmsten Fall zwei
  Anwendungen auf einer Datenbank.
- **Geld und Zeit sind `Decimal`, in der API Zeichenketten** (eigener Renderer).
  JSON kennt nur Gleitkomma, und 0.1 + 0.2 ist dort nicht 0.3. Bei Stunden, die über
  ein Jahr zu einer Rechnung summiert werden, sind das Cent-Differenzen, die niemand
  mehr zuordnen kann. Gilt ab der ersten Zeile.
- **Abgeleitete Werte werden gerechnet, nicht gespeichert** — Summen, Auslastung,
  offener Betrag: Funktionen in `socos/services/`, keine Felder. **Ausnahme: was ein
  Beleg ist.** Eine Rechnungsposition friert Menge, Satz und Betrag ein; sonst ändert
  ein späterer Stundensatz rückwirkend eine gestellte Rechnung. Diese Grenze — was
  gerechnet wird und was einfriert — wird beim Datenmodell ausdrücklich gezogen und
  steht in MEMORY.md.
- **Es gibt keine stille Zeitscheibe.** Kein Manager-Filter auf „aktuelle Periode",
  keine Middleware, die einen Monat setzt, keine `contextvars` dafür. Zeiträume sind
  ausdrückliche Parameter (`?von=&bis=`); ohne Angabe kommt alles. Ein stiller Filter
  ist die Art Fehler, bei der Zahlen plausibel aussehen und falsch sind.
- **Fehler werden an einer Stelle übersetzt, nicht je ViewSet.** Zwei Fälle sind von
  Anfang an einzubauen, weil sie sonst später jede neue Ressource neu erwischen:
  `ProtectedError` (bei `on_delete=PROTECT`) wird **409** — die Anfrage war in
  Ordnung, der Datenzustand steht ihr entgegen; und die DRF-403 bekommt ein
  `code`-Feld, das `not_authenticated` von `permission_denied` unterscheidet. Ohne
  das schickt das Frontend jemanden, dem bloß eine Seite verwehrt ist, zurück zur
  Anmeldung, obwohl seine Sitzung steht.
- **Ein Änderungsprotokoll ab dem ersten Modell**, nicht später nachgerüstet: wer,
  wann, was, alt → neu. In einem MedTech-Umfeld ist die Frage „wer hat diese Zeit
  nachträglich geändert" keine Neugier. 

# SICHERHEIT

- Cloud-Firewall vor der Maschine (nur 22/80/443) plus ufw. Beachte: Docker schreibt
  eigene iptables-Regeln und geht an ufw vorbei — ein „ports:" in einer
  docker-compose.yml hängt den Dienst ins offene Internet.
- SSH nur mit Schlüssel, Passwort- und Root-Login aus, fail2ban, unattended-upgrades.
- In Produktion: HTTPS-Redirect, HSTS, Secure-Cookies, NOSNIFF, X-Frame-Options DENY,
  SameSite=Lax. `manage.py check --deploy` muss leer sein und leer bleiben; jede
  bewusst stillgelegte Warnung wird im Code begründet.
- Geheimnisse nur in `.env` am Server, nie im Repository; `.env.example` mit
  Beispielwerten. Die `.env` wird nicht gelesen, nicht geändert, nicht ausgegeben.
- **Kunden- und Personendaten kommen aus `daten/`** (in `.gitignore`), nie aus einer
  Fixture, einer Migration oder einem Befehlsargument. Was einmal in der
  Versionsgeschichte steht, holt auch ein `git rm` nicht mehr heraus.
- **Der Healthcheck ist ein Skript, das zwei Aufrufer teilen** (Container-Healthcheck
  und `deploy.sh`) — nicht zwei Kopien derselben Zeile in zwei Dateien. Er fragt von
  innen (`127.0.0.1:8000/healthz/`, bewusst am Proxy vorbei), setzt aber den `Host`
  auf die öffentliche Domain, sonst antwortet Django mit 400, weil `127.0.0.1` nicht
  in `ALLOWED_HOSTS` steht. Der Endpunkt ist vom HTTPS-Redirect ausgenommen, sonst
  bekäme der Healthcheck eine 301 und der Dienst gälte dauerhaft als krank.
- **Eine Prüfung, die ihren eigenen Fehlschlag nicht von einem Ausfall unterscheiden
  kann, darf keine zerstörenden Befehle vorschlagen.** Der Grund eines Fehlschlags
  geht nach stderr und wird angezeigt, nie nach `/dev/null`. (Ein Deploy-Skript hat
  auf genau diesem Weg schon einmal zum `pg_restore` einer gesunden Anlage geraten.)
- **`deploy.sh` liegt im Repository und zieht sich selbst mit.** Bash liest ein Skript
  häppchenweise nach Byte-Position; schreibt der `git pull` die Datei mitten im Lauf
  neu, läuft bash ab da an der falschen Stelle weiter. Deshalb steht der ganze Rumpf
  in einer Gruppe `{ … }`, die bash vollständig einlesen muss. Folge für die Arbeit
  daran: **eine Änderung an `deploy.sh` wirkt erst beim übernächsten Deploy.**

# BENUTZERVERWALTUNG

- Wenige, namentlich bekannte Nutzer. Kein Selbstregistrieren. Konten legt ein
  Administrator an.
- Konten entstehen **ohne** Passwort; gesetzt wird es danach. Kein Befehl nimmt ein
  Passwort als Argument entgegen — das stünde in der Shell-Historie und in der
  Prozessliste des Servers.
- **Kein Testkonto, dessen Passwort im Repository steht.** Wird eines gebraucht, wird
  es lokal von Hand angelegt und das Passwort steht nirgends in einer versionierten
  Datei. (Ein solches Konto ist andernorts über ein Sicherungsarchiv beinahe als
  Superuser mit aufgeschriebenem Passwort auf einen öffentlichen Server gewandert.)
- Django-Session-Auth mit Cookie, kein JWT. CSRF-Cookie für JavaScript lesbar, das
  Frontend schickt `X-CSRFToken`. Kein Tokenspeicher im Browser, der bei einem XSS
  abzuräumen wäre.
- Rollen über Django-Gruppen/Flags. **Entschieden wird serverseitig, immer.** Wenn es
  Schwellen gibt, stehen sie an genau einer Stelle (`socos/berechtigung.py`) — kein
  zweiter Ort mit einer Zahl, schon gar nicht im Frontend. Eine im Frontend
  versteckte Seite ist nur eine ungenannte URL.
- **django-axes gegen Rateversuche** (Sperre nach 5 Fehlversuchen je Nutzer+IP,
  Abkühlung 1 h). Dazu drei Punkte, die zusammengehören:
  1. **`django-ipware` muss installiert sein.** Fehlt es, liest axes stillschweigend
     nur `REMOTE_ADDR` und ignoriert jede `AXES_IPWARE_*`-Einstellung — hinter dem
     Proxy wäre das die Adresse des Proxys, und ein einziger Angreifer sperrte alle
     drei Nutzer gleichzeitig aus.
  2. `AXES_IPWARE_META_PRECEDENCE_ORDER` auf `X-Forwarded-For`, und
     `AXES_IPWARE_PROXY_COUNT = 0` — die Zahl ist 0, weil die Adressen *im Header*
     gezählt werden, nicht die Proxys davor.
  3. **Im Caddyfile steht *kein* `header_up X-Forwarded-For`.** Caddy steht als erster
     Sprung direkt am Internet und hat kein `trusted_proxies`; in dem Fall verwirft es
     einen vom Anrufer mitgeschickten Header und setzt nur dessen echte Adresse. Die
     Voreinstellung leistet damit schon genau das, was axes braucht — Caddy warnt beim
     Reload sogar, wenn die Zeile dasteht. Sie wäre zudem eine Falle für später:
     `header_up` wird **nach** dieser Logik angewandt und gewinnt gegen sie; käme je
     ein CDN davor, überschriebe sie jede echte Client-Adresse mit der des CDN — und
     damit träte genau die Massensperre ein, die sie verhindern sollte. **Regel:**
     direkt am Internet nichts setzen; kommt ein Proxy davor, `trusted_proxies`
     konfigurieren und weiterhin kein `header_up`.
  Diese drei Punkte werden durch einen Test festgehalten, nicht durch einen Kommentar.
- Der Django-Admin bleibt der Notzugang.

# SICHERUNG: ALLES NEUE MUSS MITWANDERN

Von Anfang an, nicht wenn Daten drin sind: ein Befehl, der den **gesamten** Bestand
als eine Datei ausgibt — Datenbank und hochgeladene Dateien zusammen — und ihn ebenso
wieder einspielt.

**Wer etwas Neues baut, das gespeichert wird, sorgt im selben Commit dafür, dass es im
Archiv landet.** Ein Export, der die Hälfte mitnimmt, ist schlimmer als keiner: Er
sieht vollständig aus, und der Verlust fällt erst beim Wiederherstellen auf — im
Ernstfall, unter Zeitdruck, wenn das Original schon weg ist. Konkret: neue Modelle in
die Löschreihenfolge des Einspielens eintragen; Modelle außerhalb der eigenen App
ausdrücklich aufnehmen; ein neuer Ablageort für Dateien neben `MEDIA_ROOT` wandert
**nicht** von selbst mit (im Zweifel: unter `MEDIA_ROOT` legen); ein Test schickt den
neuen Bestandteil durch Ausfuhr und Einfuhr und sieht nach, dass er danach noch da ist.

Dazu zwei Dinge, die anderswo als „offener Punkt" liegengeblieben sind und deshalb
hier in den ersten Aufbau gehören: **eine Kopie außer Haus** (mit der Entscheidung,
ob verschlüsselt, gleich mitbegründet) und ein **Restore-Test mit Datum** in SERVER.md.
Ein Restore ohne Test ist kein Backup.

Wenn später fremde Listen eingelesen werden (Kunden, Zeiten aus einem Vorsystem):
**Ein Import rät nie.** Fehlt eine Spalte, bricht er ab. Eine Zeile, die er nicht
auflösen kann, wird mit Zeilennummer und Grund gemeldet und nicht übernommen. Jede
Zeile bekommt einen eigenen Sicherungspunkt, sonst hinterlässt eine spät auffallende
Zeile halb angelegte Datensätze, die keine Meldung erwähnt. Und er löscht nichts.

# OBERFLÄCHE

Zeiten werden unterwegs erfasst. **Jede Änderung an der Oberfläche wird an beiden
Größen geprüft, bevor sie committet wird** — 1280×800 und 375×812, hell und dunkel.

- **Farben stehen an einer Stelle** als Werte unter `:root`, hell und dunkel. Kein
  Farbwert in einer Komponente, kein `style={{ color: … }}`. Die Anmeldeseiten laufen
  ohne das React-Bundle und brauchen dieselbe Palette ein zweites Mal in der
  Django-Vorlage — mit denselben Namen, damit man die zweite findet.
- **Kein CSS-Rahmenwerk, keine Icon-Bibliothek.** Bei einem Dutzend Ansichten bringt
  beides hunderte Dinge mit, von denen dreißig gebraucht werden, und diktiert nebenbei
  seinen Strich. Zeichen werden selbst gezeichnet, ein Raster, eine Strichstärke,
  Farbe von `currentColor`.
- **Aus einer Tabelle wird am Handy eine Karte — aus demselben Markup**, über ein
  Datenattribut je Zelle. Keine zweite Ansicht: die zweite wird beim nächsten neuen
  Feld vergessen.
- **Was der Finger trifft, ist mindestens 44 px hoch**, Eingabefelder sind 16 px groß
  (darunter zoomt iOS beim Hineintippen), Ränder achten auf `env(safe-area-*)`.
- **Keine erklärenden Absätze in der Seite, sondern ein `?` daneben**, das am Rechner
  beim Überfahren und am Handy beim Antippen aufgeht. Ein Absatz mitten in der Seite
  wird ab dem dritten Öffnen nicht mehr gelesen, muss aber jedesmal überblättert
  werden und kostet am Handy den halben Bildschirm.
- **Vor jedem Löschen eine Nachfrage, die den Namen nennt und den milderen Weg
  vorschlägt** (beenden, stilllegen, als abgeschlossen führen). Kein `window.confirm`.
  Wichtiger als die Rückfrage ist, was darin steht: bei einem Zeiterfassungssystem ist
  „wer hat wann woran gearbeitet" über Jahre die häufigere Frage als „weg damit".
- **Eine leere Liste ist kein Fehler**, sondern eine Leerstelle mit einem Satz dazu,
  was fehlt und was der nächste Griff wäre.
- **Ein einziger Helfer entscheidet, was statt der Seite dasteht**, solange die Daten
  fehlen: *gescheitert*, *keine Verbindung*, *wird geladen*. Gerufen wird er hinter
  der Prüfung auf die Daten selbst (`if (!x.data) …`), nicht hinter `isLoading` oder
  `isError` — zwischen zwei Versuchen ist eine Abfrage weder das eine noch das andere,
  und `data` trotzdem leer. Dazu die Falle dahinter: **React Query hält einen zweiten
  Versuch an, solange das Fenster verdeckt ist** (`focusManager.isFocused()`), am
  Handy also jedesmal, wenn jemand kurz die App wechselt. Der Zustand ist dann
  `pending`/`paused`, `error` bleibt `null` — eine Seite, die das als „wird geladen …"
  zeichnet, lädt nie fertig. Wiederholt wird außerdem nur, was gar keine Antwort
  bekommen hat: eine 404 wird beim zweiten Fragen nicht zur 200.

# TESTS

pytest **und** ein Frontend-Testläufer (vitest) ab dem ersten Commit — nicht später,
sonst wird der Läufer nie eingeführt und die erste Rechenfunktion im Frontend bleibt
ungeprüft. Tests für alles, was rechnet oder prüft (Rundung, Summen, Abrechenbarkeit,
Berechtigung), nicht für Django selbst. Was nur in Produktion gilt (Security-Header,
axes-Konfiguration), wird einzeln geprüft.

# ARBEITSWEISE

- **Alles auf Deutsch**: Code, Bezeichner, Felder, Kommentare, Commit-Messages,
  Oberfläche, Doku. Englisch nur, wo Django es vorgibt (`clean`, `save`, `Meta`).
- **Kommentare erklären das Warum, nicht das Was.** Ein Kommentar, der festhält, warum
  ein naheliegender Weg *nicht* gegangen wurde, ist das Wertvollste in der Datei.
- Nach jeder abgeschlossenen Einheit selbstständig committen, ohne Rückfrage. Immer
  explizit stagen (`git add <pfad>`), nie `git add .`. Kein push, kein Deploy, kein
  Serverzugriff ohne ausdrückliche Aufforderung.
- **Nichts, was fremde Änderungen im Arbeitsverzeichnis vernichtet**: kein
  `git stash`, kein `git checkout -- <datei>`, kein `git reset --hard`, kein
  `git clean`. Eigene Fehler mit `git revert` oder einem neuen Commit korrigieren.
- **Vier Dokumente von Anfang an**, und CLAUDE.md beginnt mit einer Tabelle
  „Wo was steht", die auf die anderen drei verweist:
  - `CLAUDE.md` — kurz, nur die Regeln und Fallen, die beim Arbeiten gebraucht werden
  - `README.md` — Befehle, Setup, Deploy
  - `SERVER.md` — Maschine, Netz, Zugänge (ohne Geheimnisse), wiederkehrende Prüfungen
  - `MEMORY.md` — Warum-Entscheidungen, bekannte Fallen, offene Punkte, Änderungslog
    (neueste Einträge oben, mit Datum)
- **MEMORY.md wird im selben Commit gepflegt**, sobald eine Änderung ein Schema, eine
  Architekturentscheidung oder einen fachlichen Sonderfall betrifft. Sie ist das
  einzige Dokument, das die Fragen beantwortet, die man dem Code in zwei Jahren nicht
  mehr ansieht — und das einzige, das ohne diese Regel nicht entsteht.
- Sobald die Anwendung benutzt wird, kommt ein `docs/handbuch.md` dazu, **das zugleich
  die Hilfeseite in der Anwendung ist** — ein Text, zwei Verwendungen. Zwei getrennte
  Texte laufen auseinander.

# ERSTER SCHRITT

**Stelle mir zuerst die offenen Fragen — noch kein Code.** Ich erwarte Fragen zu:

1. **Datenmodell**: Kunde, Projekt, Aufgabe, Zeiteintrag — welche Ebenen gibt es
   wirklich, welche hängt woran, und was ist optional?
2. **Zeit**: Start/Stopp oder nacherfasst? Rundung (und wo genau — beim Erfassen oder
   erst beim Abrechnen)? Darf ein Eintrag geändert werden, nachdem er abgerechnet ist,
   und wenn ja, was passiert dann mit der Rechnung?
3. **Geld**: Woran hängt der Stundensatz — Person, Projekt, Kunde, Kombination? Was
   ist abrechenbar und was nicht? Währung, Umsatzsteuer, Rechnungsnummernkreis?
4. **Sichtbarkeit unter den dreien** — siehe oben, die drei heiklen Stellen.
5. **Regulatorik**: MedTech heißt womöglich ISO 13485 / MDR. Muss die Projekt- oder
   Zeitdokumentation auditierbar sein? Das entscheidet über die Tiefe des
   Änderungsprotokolls und darüber, ob es überhaupt ein hartes Löschen gibt.
6. **Fremdsysteme**: Buchhaltung, Rechnungsprogramm, Kalender — was muss hinaus, was
   herein, in welchem Format?
7. **Betrieb**: Domain, Anbieter, gibt es auf der VPS schon etwas?

Die Antworten landen als erster Eintrag in MEMORY.md, nicht nur im Code.

**Danach**: Repository anlegen, die vier Dokumente als Gerüst, dann das
Django-Grundgerüst mit Auth, Healthcheck und Änderungsprotokoll — und erst
anschließend das erste Fachmodell.
