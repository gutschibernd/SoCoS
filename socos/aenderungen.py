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
        "version": "2026-09-15",
        "titel": "Meetings — und eine kürzere Startseite",
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
                "titel": "Weniger Kacheln auf der Startseite",
                "text": (
                    "„Event anlegen“ und „Zahlen & Runway“ stehen dort nicht "
                    "mehr — beides erreichst du über die Leiste links. "
                    "„Organisation erfassen“ und „Person ohne Organisation“ "
                    "liegen jetzt zu zweit in einer Kachel nebeneinander: Es "
                    "ist derselbe Griff, nur mit und ohne Haus dahinter."
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
