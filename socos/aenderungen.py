"""
Was sich in SoCoS geändert hat — die **einzige** Stelle, an der das steht.

Von hier lebt beides: das Fenster, das nach der Anmeldung aufgeht, wenn jemand
etwas noch nicht gesehen hat, und die Rubrik „Änderungen" in der Doku. Zwei
Listen liefen auseinander, und die zweite fiele niemandem auf — gelesen wird
immer nur die, die gerade aufgeht.

**Wer etwas ändert, das man in der Oberfläche merkt, trägt es hier ein — im
selben Commit.** Ein Eintrag ist kein Commit-Text: Er sagt einem Nutzer, was er
jetzt anders machen kann, nicht welche Datei angefasst wurde.

Die Version ist das Datum (`JJJJ-MM-TT`). Sie sortiert sich damit selbst und
beantwortet nebenbei die Frage „seit wann" — ein hochgezählter Zähler täte das
nicht und müsste gepflegt werden. Zwei Änderungen an einem Tag bekommen **einen**
Eintrag mit zwei Punkten, keine zweite Version.

Die Liste steht **neueste zuerst**.
"""

VERSIONEN = [
    {
        "version": "2026-09-21",
        "titel": "Module — und die SPG Academy als erstes",
        "punkte": [
            {
                "titel": "Neu unter Intern: Module",
                "text": (
                    "Zusätzliche Werkzeuge stehen jetzt unter Intern · Module. "
                    "Ein Klick darauf zeigt alle Module auf einen Blick und klappt "
                    "sie in der Leiste auf. Fehlt eines, meldet es unter "
                    "Wünsche & Fehler."
                ),
                "wo": "module",
            },
            {
                "titel": "SPG Academy: das Lean Model Canvas",
                "text": (
                    "Die Ergebnisse aus dem Workshop kommen jetzt auf eine Leinwand "
                    "mit den neun Feldern, nummeriert wie in der SPG Academy. Ein "
                    "Klick auf ein Feld öffnet es: Enter beginnt den nächsten "
                    "Punkt, und mit den Pfeilen unten gehst du Feld für Feld weiter. "
                    "Jede Idee ist ein eigenes Vorhaben, an keinem Projekt, und die "
                    "Leinwand gibt es auch als PDF."
                ),
                "wo": "module/spg",
            },
        ],
    },
    {
        "version": "2026-09-18",
        "titel": "Projektphasen statt Bereiche — und das Protokoll am Stück",
        "punkte": [
            {
                "titel": "Der Balken zeigt gebuchte Zeit gegen das Pensum",
                "text": (
                    "Die Stufenleiste (Konzept · Umsetzung · Test · Abschluss) "
                    "ist weg — sie hat nichts gemessen. Jedes Arbeitspaket "
                    "zeigt jetzt, wie viel seines Pensums schon gebucht ist: "
                    "in der Zeile die Summe, aufgeklappt je Person. Ohne "
                    "Pensum steht nur die gebuchte Zeit da."
                ),
                "wo": "projekt",
            },
            {
                "titel": "Phasen haben einen Stand und lassen sich zuklappen",
                "text": (
                    "Eine Phase ist offen, läuft oder ist abgeschlossen — "
                    "umgestellt wird das unter „Bearbeiten“. Aufgeklappt ist, "
                    "was läuft; die anderen sagen in der Zeile, was drin ist. "
                    "Auch Pakete klappen von selbst nur auf, wenn Zeit darauf "
                    "gebucht ist oder sie laufen. Das Overhead-Projekt steht "
                    "quer über den anderen — ein Knopf, kein Baum. Dort landen "
                    "Networking, Meetings und alles, was zu keinem Paket gehört."
                ),
                "wo": "projekt",
            },
            {
                "titel": "Das Protokoll wird hinter dem Stift bearbeitet",
                "text": (
                    "Über dem Protokoll steht jetzt „Bearbeiten“. Der Stift "
                    "öffnet ein Fenster mit allen Abschnitten auf einmal — "
                    "Speichern und Abbrechen bleiben beim Scrollen oben "
                    "stehen. Wer daneben klickt, ohne gespeichert zu haben, "
                    "wird gefragt, statt den Text zu verlieren. Die Abschnitte "
                    "auf der Seite selbst sind jetzt nur noch zum Lesen da."
                ),
                "wo": "meetings",
            },
            {
                "titel": "Auf eine abgeschlossene Phase läuft keine Uhr mehr",
                "text": (
                    "Eine Projektphase lässt sich abschließen. Danach nimmt "
                    "keines ihrer Arbeitspakete mehr Zeit an — weder über die "
                    "Uhr noch über das Nachtragen. Was schon gebucht ist, "
                    "bleibt änderbar, und eine laufende Uhr lässt sich noch "
                    "stoppen."
                ),
                "wo": "projekt",
            },
            {
                "titel": "Stunden je Arbeitspaket und Person",
                "text": (
                    "Ein Arbeitspaket kann festhalten, wie viele Stunden für "
                    "wen darin vorgesehen sind — im Arbeitsplan steht das als "
                    "„AP02: BG 270 h, FD 140 h“. Die Phase bekommt dazu "
                    "Beginn und Ende."
                ),
                "wo": "projekt",
            },
            {
                "titel": "Aus dem „Bereich“ wird die „Projektphase“",
                "text": (
                    "Die Ebene zwischen Projekt und Arbeitspaket heißt jetzt "
                    "Projektphase. Sie ist das auch: ein Abschnitt mit Anfang, "
                    "Ende und Pensum, auf den der nächste folgt. An den Daten "
                    "ändert sich nichts — alle Pakete und Buchungen hängen "
                    "dort, wo sie vorher hingen."
                ),
                "wo": "projekt",
            },
            {
                "titel": "Eine Kachel statt zwei breiter Felder",
                "text": (
                    "„Organisation“ und „Lose Person“ stehen jetzt geteilt in "
                    "einer Kachel, die so breit ist wie „Zeit nachtragen“ — "
                    "links die Organisation, rechts die Person ohne "
                    "Organisation. Vorher nahm dieses Paar die doppelte "
                    "Breite ein."
                ),
            },
        ],
    },
    {
        "version": "2026-09-17",
        "titel": "Meetings: die Vorbereitung geht mit, das Protokoll lässt sich verwerfen",
        "punkte": [
            {
                "titel": "Die Vorbereitung geht mit zum LLM",
                "text": (
                    "„Für ein LLM kopieren“ nimmt jetzt auch die Vorbereitung "
                    "mit — in einem eigenen Block, als Plan gekennzeichnet. "
                    "Das Modell darf daraus nichts „besprochen“ machen; was "
                    "geplant war und nicht zur Sprache kam, landet in einem "
                    "letzten Abschnitt „Nicht zur Sprache gekommen“."
                ),
                "wo": "doku/meetings",
            },
            {
                "titel": "Die Vorbereitung klappt unter das Protokoll",
                "text": (
                    "Sobald ein Protokoll steht, rückt es ganz nach oben; "
                    "Vorbereitung und Mitschrift stehen zugeklappt darunter, "
                    "so wie sie entstanden sind."
                ),
                "wo": "meetings",
            },
            {
                "titel": "„Verwerfen“ macht das Übernehmen rückgängig",
                "text": (
                    "Oben am Protokoll steht ein Knopf „Verwerfen“. Er nimmt "
                    "alle Abschnitte weg, Mitschrift und Vorbereitung stehen "
                    "wieder oben, und du kannst neu aufbereiten. Vorher wird "
                    "gefragt."
                ),
                "wo": "meetings",
            },
            {
                "titel": "Personen zum Meeting: tippen statt aufklappen",
                "text": (
                    "Unter „Mit wem“ steht statt des Aufklappmenüs ein "
                    "Suchfeld. Zwei, drei Buchstaben reichen — darunter "
                    "erscheinen die drei besten Treffer, nach Name, Haus oder "
                    "Funktion. Enter nimmt den ersten, und das Feld bleibt "
                    "für die nächste Person offen."
                ),
                "wo": "meetings",
            },
        ],
    },
    {
        "version": "2026-09-15",
        "titel": "Meetings, Ideen — und das Nachtragen von Zeit",
        "punkte": [
            {
                "titel": "Neu: Extern · Meetings",
                "text": (
                    "Eine Seite je Besprechung: oben, was wir aus dem Termin "
                    "holen wollen, darunter das Feld zum Mitschreiben, danach "
                    "das Protokoll. Ein Meeting lässt sich anlegen, bevor "
                    "feststeht, wer kommt — Personen und Häuser trägst du "
                    "später nach."
                ),
                "wo": "meetings",
            },
            {
                "titel": "Die Mitschrift speichert sich selbst",
                "text": (
                    "Während des Meetings gibt es keinen Speichern-Knopf: Das "
                    "Feld sichert nach einer kurzen Schreibpause, beim "
                    "Wegklicken und wenn du die App wechselst. Darunter "
                    "steht, wann zuletzt gespeichert wurde. Schließt du den "
                    "Tab, während etwas offen ist, fragt der Browser nach."
                ),
                "wo": "doku/meetings",
            },
            {
                "titel": "Aus der Mitschrift ein lesbares Protokoll",
                "text": (
                    "„Für ein LLM kopieren“ legt die Mitschrift samt Auftrag "
                    "in die Zwischenablage — die Regeln darin sagen dem "
                    "Modell, dass es nichts erfinden und nichts weglassen "
                    "darf. Das Ergebnis fügst du zurück ein; SoCoS zerlegt es "
                    "an den Überschriften in Abschnitte, die danach einzeln "
                    "änderbar und verschiebbar sind."
                ),
                "wo": "doku/meetings",
            },
            {
                "titel": "Meetings stehen im Verlauf beim Kontakt",
                "text": (
                    "Bei einer Person und bei ihrem Haus steht ein Meeting in "
                    "derselben Liste wie Mails und Telefonate, mit einem Pfeil "
                    "dorthin. Das gilt nur für die Personen, die am Meeting "
                    "eingetragen sind — ein Grund mehr, sie nachzutragen."
                ),
                "wo": "kontakte",
            },
            {
                "titel": "Neu: die Ideenliste",
                "text": (
                    "Rechts über der Aufgabentafel steht jetzt „Ideenliste“ "
                    "mit der Zahl der offenen Ideen. Dort schreibst du auf, "
                    "was möglich wäre und noch nicht entschieden ist — die "
                    "Tafel bleibt damit das, was jetzt zu tun ist."
                ),
                "wo": "aufgaben/ideen",
            },
            {
                "titel": "Aus einer Idee wird eine Aufgabe",
                "text": (
                    "„Auf die Tafel“ verschiebt die Idee unverändert nach "
                    "„Allgemein“ — kein Abtippen, und im Protokoll steht, wer "
                    "das entschieden hat. Der Haken daneben legt sie unter "
                    "„Vom Tisch“, von wo du sie jederzeit zurückholst."
                ),
                "wo": "doku/aufgaben",
            },
            {
                "titel": "Start liegt jetzt auf dem Logo",
                "text": (
                    "Der eigene Menüeintrag „Start“ ist weg; zur Startseite "
                    "kommst du über das SoCoS-Zeichen ganz oben in der "
                    "Leiste. Das schafft Platz für die Rubriken darunter. Am "
                    "Handy steht „Start“ weiter in der Fußleiste."
                ),
                "wo": "start",
            },
            {
                "titel": "Zeit nachtragen geht wieder",
                "text": (
                    "Der Knopf „Nachtragen“ hat mit „Fehler 400 — dieses Feld "
                    "ist zwingend erforderlich“ geantwortet, und zwar jedes "
                    "Mal: Der Server wollte eine Person genannt bekommen, das "
                    "Formular schickte keine mit. Ohne Angabe buchst du jetzt "
                    "für dich selbst."
                ),
                "wo": "zeit",
            },
            {
                "titel": "Ein Tag, zwei Uhrzeiten — und die Dauer daneben",
                "text": (
                    "Statt zweimal Datum und Uhrzeit trägst du den Tag einmal "
                    "ein und danach nur noch „von“ und „bis“. Die Knöpfe "
                    "daneben (15 min, 30 min, 1 h, 2 h, 8 h) setzen das Ende "
                    "vom Beginn aus; darunter steht, wie lang die Buchung "
                    "wird. Eine Uhrzeit vor dem Beginn zählt als Folgetag — "
                    "und der steht dann dabei."
                ),
                "wo": "zeit",
            },
            {
                "titel": "Dieselbe Zeit für mehrere Personen",
                "text": (
                    "Unter „Für wen“ hakst du an, wer dabei war. Aus einem "
                    "Meeting zu dritt wird ein Eintrag statt drei, und jede "
                    "Person bekommt ihre eigene Buchung. Vorgewählt bist du "
                    "selbst."
                ),
                "wo": "zeit",
            },
            {
                "titel": "Das Arbeitspaket suchst du jetzt",
                "text": (
                    "Das Auswahlmenü ist weg. Im Feld stehen die zuletzt "
                    "bebuchten Pakete oben, jedes mit seinem Projekt darunter; "
                    "tippen filtert, und die Wörter dürfen in beliebiger "
                    "Reihenfolge kommen. Das gilt auch beim Clock-out und beim "
                    "Ändern einer Buchung."
                ),
                "wo": "zeit",
            },
            {
                "titel": "Weniger Kacheln auf der Startseite",
                "text": (
                    "„Event anlegen“ und „Zahlen & Runway“ stehen dort nicht "
                    "mehr — beides erreichst du über die Leiste links. "
                    "„Organisation erfassen“ und „Person ohne Organisation“ "
                    "liegen jetzt zu zweit in einer Kachel nebeneinander: Es "
                    "ist derselbe Griff, nur mit und ohne Haus dahinter. Neu "
                    "dazugekommen ist „Aufgaben“."
                ),
                "wo": "start",
            },
        ],
    },
    {
        "version": "2026-09-14",
        "titel": "Die Aufgabentafel — und Zeit ohne Paketsuche",
        "punkte": [
            {
                "titel": "Neu: Intern · Aufgaben",
                "text": (
                    "Eine gemeinsame Tafel mit einer Spalte „Allgemein“ und "
                    "einer je Person. Hineinschreiben und Enter drücken, auf "
                    "die Priorität tippen zum Weiterdrehen, Haken zum "
                    "Abhaken — sortiert wird nach Priorität. Jeder sieht und "
                    "ändert alles."
                ),
                "wo": "aufgaben",
            },
            {
                "titel": "Am Handy ist das Ende einer Seite wieder erreichbar",
                "text": (
                    "Die letzte Zeile jeder langen Liste lag bisher hinter "
                    "der Uhr und der Fußleiste und ließ sich nicht antippen. "
                    "Unter jeder Seite steht jetzt genug Platz."
                ),
            },
            {
                "titel": "Spalten, die du selten brauchst, kannst du zuklappen",
                "text": (
                    "Der Pfeil rechts in der Spaltenüberschrift legt sie als "
                    "schmalen Streifen an den Rand. Das gilt nur für deinen "
                    "Browser — die anderen sehen die Tafel weiter so, wie sie "
                    "sie eingerichtet haben."
                ),
                "wo": "aufgaben",
            },
            {
                "titel": "„Ohne Paket starten“",
                "text": (
                    "Neben „Paket wählen“ steht jetzt ein zweiter Knopf — in "
                    "der Leiste unten, auf der Startseite und über der "
                    "Buchungsliste. Er startet die Uhr sofort; die Zeit läuft "
                    "so lange auf das Projekt „Overhead“."
                ),
                "wo": "zeit",
            },
            {
                "titel": "Umbuchen beim Clock-out",
                "text": (
                    "Im Fenster, das nach der Notiz fragt, steht jetzt auch "
                    "das Arbeitspaket. Wer dort eines wählt, bucht die Zeit "
                    "dorthin um — wer nichts ändert, lässt sie stehen."
                ),
            },
            {
                "titel": "Das Paket einer Buchung lässt sich ändern",
                "text": (
                    "„Ändern“ in der Buchungsliste öffnet jetzt auch das "
                    "Arbeitspaket, und zwar für jede Buchung. Ein Fehlgriff "
                    "beim Start war bisher nur über Entfernen und Nachtragen "
                    "zu beheben."
                ),
                "wo": "zeit",
            },
        ],
    },
    {
        "version": "2026-09-13",
        "titel": "Doku, Neuigkeiten, Wünsche & Fehler",
        "punkte": [
            {
                "titel": "Das Zeichen von SoCoS ist neu",
                "text": (
                    "Die vier Balken stehen jetzt auf dunklem Grund mit "
                    "gestreuten Farbsplittern und haben ringsum Luft — am "
                    "iPhone hat der Homescreen dem obersten Balken bisher die "
                    "Enden abgeschnitten. Wer SoCoS schon auf dem Homescreen "
                    "liegen hat, muss die Kachel einmal löschen und neu "
                    "ablegen; das alte Bild bleibt sonst liegen."
                ),
            },
            {
                "titel": "Die Fragezeichen sind weg",
                "text": (
                    "Die kleinen ?-Zeichen neben den Beschriftungen gibt es nicht "
                    "mehr. Was dort stand, steht jetzt vollständig und an einem "
                    "Ort unter „Software · Doku“ — nachlesbar, statt nur dort, wo "
                    "man gerade steht."
                ),
                "wo": "doku",
            },
            {
                "titel": "Dieses Fenster",
                "text": (
                    "Nach jeder Änderung an SoCoS geht beim nächsten Anmelden "
                    "einmal dieses Fenster auf — und danach nie wieder für "
                    "dieselbe Änderung. Alles Ältere steht in der Doku unter "
                    "„Änderungen“."
                ),
                "wo": "doku/aenderungen",
            },
            {
                "titel": "Wünsche und Fehler melden",
                "text": (
                    "Unter „Software · Wünsche & Fehler“ kann jeder etwas "
                    "eintragen — ein Fehler, der aufgefallen ist, oder ein Wunsch. "
                    "Den Stand (angenommen, in Arbeit, erledigt) setzt ein Admin; "
                    "erledigt wird mit der Version vermerkt, in der es drin ist."
                ),
                "wo": "rueckmeldungen",
            },
        ],
    },
]

#: Die neueste Version. Steht an einem Ort, weil drei Stellen sie brauchen:
#: das Konto, das als „gesehen" markiert wird, die neue Rückmeldung, die noch
#: keine Erledigung hat, und der Fuß der Doku.
NEUESTE = VERSIONEN[0]["version"] if VERSIONEN else ""


def seit(gesehen_bis):
    """
    Die Versionen, die nach `gesehen_bis` gekommen sind — neueste zuerst.

    Ein leeres `gesehen_bis` heißt „hat noch nie etwas gesehen": Dann kommt
    alles. Neue Konten starten deshalb auf `NEUESTE` (siehe
    `NutzerVerwaltung.create_user`) — wer heute dazukommt, braucht keine
    Führung durch die Änderungen der Monate davor, sondern die Doku.
    """
    return [v for v in VERSIONEN if v["version"] > (gesehen_bis or "")]


def punkte_seit(gesehen_bis):
    """
    Dasselbe, aber flach: eine Seite je Punkt, in der Reihenfolge, in der das
    Fenster sie zeigt — **älteste zuerst**.

    Wer zwei Versionen verpasst hat, soll sie in der Reihenfolge lesen, in der
    sie entstanden sind; sonst steht die Korrektur vor dem, was sie korrigiert.
    """
    flach = []
    for fassung in reversed(seit(gesehen_bis)):
        for punkt in fassung["punkte"]:
            flach.append({**punkt, "version": fassung["version"]})
    return flach
