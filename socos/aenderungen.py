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
        "version": "2026-09-13",
        "titel": "Doku, Neuigkeiten, Wünsche & Fehler",
        "punkte": [
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
