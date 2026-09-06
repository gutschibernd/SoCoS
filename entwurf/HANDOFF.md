# Sopharmis Internal — Übergabe an Claude Code

## Was hier liegt

| Datei | Inhalt |
|---|---|
| `Sopharmis Internal v6 leer.dc.html` | Die UI **ohne Projektdaten**. Alle Listen leer, Kontostand und Fixkosten 0, ein Platzhalter-Nutzer „Du“. Das ist die Vorlage für den Nachbau. |
| `Sopharmis Internal v6.dc.html` | Dieselbe UI **mit** den Beispiel-/Projektdaten. Nur als Referenz, wie es gefüllt aussieht. |
| `daten/sopharmis-daten.json` | Die Projektdaten aus dem Entwurf, zum Durchschauen und späteren Import. |

## Funktionsumfang der leeren Fassung

**Topbar** — Logo (Link aufs Dashboard), Menü Dashboard · Projekt · Zeit · Kontakte, Timer-Chip mit Clock-in/out und Dropdown der letzten 3 Buchungen, Profil-Chip.

**Dashboard** — vier Kennzahlen (Kontostand, Fixkosten pro Monat, Runway, Wochenstunden Team); Termine als Zeitachse; „Team jetzt“; Stunden pro Person als Säulen plus Projektverteilung; Projektfortschritt und Förderschienen; eigene Task-Liste; Kontostand-Verlauf mit Monatsupdate.

**Projekt** — Projekt → Bereich → Arbeitspaket. Pro Paket ein Stufenfortschritt (Stufen mit Monatsdauer, Klick setzt den Stand), Status offen · läuft · pausiert · wartet extern · fertig, Clock-in auf Projekt und Paket. Filter nach Projekt und Status. Detailbereich mit Stufenleiste, Notiz und gebuchten Zeiten.

**Struktur** (Unterseite von Projekt) — Bereiche und Pakete anlegen, umbenennen, verschieben, ordnen, entfernen.

**Zeit** — Clock-Leiste mit Dropdown der letzten 5 Buchungen, Wochenübersicht, Buchungsliste. Beim Wechsel oder Clock-out fragt ein Dialog nach einer kurzen Notiz.

**Kontakte (CRM)** — durchgehende Bar zum Anlegen eines Kontakts (Name, Rolle, Organisation, Nutzensatz), Bar für neue Organisationen, Suche, Filter (Alle / Warten auf uns / Wir warten), Pipeline-Board über vier Spuren (Erstkontakt, Antrag läuft, Partner, Lose Kontakte), Detailbereich mit Stufe, Nutzensatz, Personen und Verlauf.

## Startprompt für Claude Code

```
Ich baue eine interne Projektmanagement-App für ein Drei-Personen-Startup (Sopharmis,
Medizintechnik, Österreich). Es gibt einen fertigen, abgestimmten UI-Entwurf als eine
einzelne HTML-Datei: "Sopharmis Internal v6 leer.dc.html". Sie enthält die komplette
Oberfläche, aber keine Daten.

Lies zuerst diese Datei vollständig und die Übergabenotiz HANDOFF.md. Danach:

1. Fasse mir in Stichworten zusammen, welche Ansichten, Datentypen und Interaktionen
   du im Entwurf erkennst. Nichts bauen, bis ich das bestätigt habe.
2. Schlage einen Stack und eine Projektstruktur vor. Randbedingungen:
   - lokal lauffähig, drei Nutzer, keine öffentliche Instanz
   - Daten müssen persistent sein (Zeitbuchungen, Pakete, Kontakte)
   - Zeiterfassung läuft mitlaufend, muss einen Serverneustart überleben
   - Export der Daten als JSON muss möglich sein
   Nenne zwei Varianten mit Vor- und Nachteilen und eine Empfehlung.
3. Warte auf meine Entscheidung.

Wichtig für die Umsetzung:
- Die visuelle Sprache des Entwurfs ist verbindlich: eckige Kanten (2px Radius),
  Farben #0F4448 / #14595F / #8A5638 / #EFEDE6 / #FFFFFF, Figtree für Text,
  IBM Plex Mono für Zahlen und Zeiten, alles auf einem 4-Spalten-Raster.
- Layout und Beschriftungen nicht neu erfinden. Wenn dir etwas fehlt, frag nach.
- Keine Beispieldaten anlegen. Die App startet leer; Daten importiere ich selbst.
- Bau als erstes das Datenmodell und einen Import, der eine JSON-Datei im Format von
  daten/sopharmis-daten.json einliest und dabei jede Zeile validiert und ein Protokoll
  ausgibt, was übernommen und was abgewiesen wurde.

Datenmodell, das der Entwurf voraussetzt:
- Team: id, name, initials, farbe
- Projekt: id, titel, untertitel, farbe → Bereiche (art: dev | fin | ziel)
  → Arbeitspakete (titel, status, notiz, stufenstand)
- Paketstatus: offen | laeuft | pausiert | wartet | fertig
- Stufen pro Paketart, je Stufe eine Dauer in Monaten
- Zeitbuchung: person, paket, start, ende, notiz
- Organisation: name, kurz, typ, stufe (Erstkontakt | Antrag läuft | Partner), nutzen
- Person: name, rolle, orgId (nullable), ball (us | them), offenerPunkt, verlauf
- Termin, Task, Finanzen (kontostand, fixkostenProMonat)
```

## Datenimport — Reihenfolge zum Durchschauen

`daten/sopharmis-daten.json` ist bewusst so gebaut, dass du es vor dem Import Block für Block prüfen kannst. Alles mit `_pruefen` ist von mir gesetzt und nicht verifiziert.

1. **team** — echte Namen und Kürzel eintragen.
2. **finanzen** — Kontostand und Fixkosten waren Platzhalter (10.000 / 450).
3. **projekte** — der wichtigste Block. Paketnamen, Reihenfolge und Status durchgehen; die Stufendauern pro Paketart fehlen noch und sollten von dir kommen.
4. **organisationen** und **personen** — die Personennamen bis auf Sendlhofer und Stephan sind erfunden, ebenso „Apotheke Musterstraße“. Löschen oder ersetzen.
5. **termine** und **tasks** — Fristen gegen die echten Bescheide prüfen.
6. **zeitbuchungen** — reine Beispielwerte, vermutlich komplett verwerfen.
