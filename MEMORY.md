# MEMORY — Warum-Entscheidungen, Fallen, offene Punkte

Neueste Einträge oben. Dieses Dokument beantwortet die Fragen, die man dem Code in
zwei Jahren nicht mehr ansieht. Es wird **im selben Commit** gepflegt, sobald eine
Änderung ein Schema, eine Architekturentscheidung oder einen fachlichen Sonderfall
betrifft.

---

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
Schrift. *(Nachtrag 2026-09-09: Die Mono-Zeile ist aus der Kopfleiste heraus —
sie kostete dort achtzig Pixel und machte die Leiste bei 1280 px zweizeilig.
Auf der Anmeldeseite steht die Marke unverändert.)* Auf der Anmeldeseite steht dieselbe Marke groß, und dort sind die
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
      **Events sind das nicht** — sie haben keine Uhrzeit und keine Erinnerung.
      Wer das später baut, soll sie nicht dafür umwidmen.
- [ ] Datenimport bauen, sobald `daten/sopharmis-daten.json` bereinigt ist.
