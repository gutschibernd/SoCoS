"""
Was ins Archiv wandert und in welcher Reihenfolge es wieder hineingeht.

**Wer etwas Neues baut, das gespeichert wird, trägt es hier ein — im selben
Commit.** Ein Export, der die Hälfte mitnimmt, ist schlimmer als keiner: Er sieht
vollständig aus, und der Verlust fällt erst beim Wiederherstellen auf, im
Ernstfall, unter Zeitdruck, wenn das Original schon weg ist.

`socos/tests/test_sicherung.py` prüft, dass diese beiden Listen zu den
tatsächlich vorhandenen Modellen passen. Ein vergessenes Modell lässt den Test
fallen, nicht erst den Wiederherstellungsversuch.
"""

# Alles, was im Archiv landet. Modelle außerhalb der eigenen App stehen
# ausdrücklich hier — sie wandern nicht von selbst mit.
MODELLE_IM_ARCHIV = [
    "socos.Nutzer",
    "socos.Protokolleintrag",
    "socos.Projekt",
    "socos.Bereich",
    "socos.Arbeitspaket",
    "socos.Unteraufgabe",
    "socos.Zeitbuchung",
    "socos.Organisation",
    "socos.Kontakt",
    "socos.Verlaufseintrag",
    "socos.Event",
    "socos.Eventziel",
    "socos.Kontostand",
    "socos.Fixkosten",
    "socos.Monatskosten",
    # Die Rollen. Ohne sie darf nach dem Einspielen niemand mehr etwas.
    "auth.Group",
]

# Beim Einspielen wird in dieser Reihenfolge geleert: das Abhängige zuerst.
LOESCHREIHENFOLGE = [
    # Das Abhängige zuerst, sonst hält on_delete=PROTECT dagegen. Der
    # Verlaufseintrag hängt am Event *und* am Kontakt, das Eventziel am Event
    # *und* an Kontakt oder Organisation — beide stehen deshalb vor allen
    # dreien.
    "socos.Verlaufseintrag",
    "socos.Eventziel",
    "socos.Event",
    "socos.Zeitbuchung",
    "socos.Unteraufgabe",
    "socos.Arbeitspaket",
    "socos.Bereich",
    "socos.Projekt",
    "socos.Kontakt",
    "socos.Organisation",
    "socos.Kontostand",
    "socos.Fixkosten",
    "socos.Monatskosten",
    "socos.Protokolleintrag",
    "socos.Nutzer",
    "auth.Group",
]

# Bewusst **nicht** im Archiv:
#
# contenttypes, auth.Permission  Legt Django beim Migrieren selbst an. Mit
#                                festen IDs im Archiv kollidierten sie mit den
#                                frisch angelegten.
# sessions                       Angemeldete Sitzungen sind kein Bestand. Nach
#                                dem Einspielen meldet man sich neu an.
# axes                           Fehlversuche und Sperren sind Betriebszustand.
# admin.LogEntry                 Das eigene Änderungsprotokoll ist die Quelle.
#
# Verweise auf diese Modelle werden über natürliche Schlüssel gesichert
# (--natural-foreign), damit sie nach dem Migrieren wieder auflösbar sind.

DATENBANK_IM_ARCHIV = "datenbank.json"
MEDIEN_IM_ARCHIV = "medien"
