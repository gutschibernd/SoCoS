/**
 * Rechnen mit Zeiten — die Anzeige-Seite.
 *
 * **Gerundet wird erst in der Auswertung, nie beim Speichern.** Gespeichert
 * werden Start und Ende sekundengenau; wer beim Erfassen rundet, kann die
 * Rundung nicht mehr zurücknehmen, wenn die Regel sich ändert.
 *
 * Die maßgebliche Rundung für Berichte steht serverseitig in
 * socos/services/zeit.py. Diese hier ist für die Anzeige und muss dasselbe
 * Ergebnis liefern — beide sind getestet.
 */

export const RUNDUNG_MINUTEN = 5;

/** Sekunden als laufende Uhr: 01:23:45 */
export function alsUhr(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(s / 3600))}:${zwei(Math.floor(s / 60) % 60)}:${zwei(s % 60)}`;
}

/** Sekunden als Dauer: 3:25 (Stunden:Minuten) */
export function alsDauer(sekunden: number): string {
  const minuten = Math.floor(Math.max(0, sekunden) / 60);
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")}`;
}

/**
 * Auf volle 5 Minuten, kaufmännisch. Genau 2,5 Minuten Rest gehen auf — sonst
 * verschwände in einer Woche eine Viertelstunde, die jemand gearbeitet hat.
 */
export function aufFuenfMinuten(sekunden: number): number {
  const schritt = RUNDUNG_MINUTEN * 60;
  return Math.round(Math.max(0, sekunden) / schritt) * schritt;
}

/** Erst summieren, dann runden. Andersherum summieren sich die Rundungsfehler. */
export function summeGerundet(einzelne: number[]): number {
  return aufFuenfMinuten(einzelne.reduce((a, b) => a + b, 0));
}

/** Dezimalstunden für den Zeitnachweis: 3,25 h */
export function alsStunden(sekunden: number): string {
  return (aufFuenfMinuten(sekunden) / 3600).toFixed(2).replace(".", ",");
}

/**
 * Heute als `2026-09-08` für ein `<input type="date">`.
 *
 * Nicht `toISOString().slice(0, 10)`: Das rechnet nach UTC, und westlich von
 * Greenwich — oder hier abends nach 22 Uhr Sommerzeit — steht dann der
 * falsche Tag im Feld. Gebraucht wird der Tag der Uhr an der Wand.
 */
export function heuteAlsDatum(jetzt = new Date()): string {
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

/** Der Tag eines Zeitpunkts als `2026-09-15` — für ein `<input type="date">`. */
export function tagAusZeitpunkt(iso: string): string {
  return heuteAlsDatum(new Date(iso));
}

/** Die Uhrzeit eines Zeitpunkts als `09:02` — für ein `<input type="time">`. */
export function uhrzeitAusZeitpunkt(iso: string): string {
  const d = new Date(iso);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/**
 * Tag und Uhrzeit zu einem Zeitpunkt — aus den Bestandteilen, nicht über
 * `new Date("2026-09-15T09:02")`.
 *
 * Der Zeichenkettenweg ist in alten Safari-Fassungen als UTC gelesen worden;
 * daraus wird im Sommer eine Buchung zwei Stunden daneben, und das fällt an
 * einer einzelnen Zeile niemandem auf.
 */
export function alsZeitpunkt(tag: string, uhrzeit: string): Date {
  const [jahr, monat, tagnr] = tag.split("-").map(Number);
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  return new Date(jahr, monat - 1, tagnr, stunde, minute, 0, 0);
}

export type Spanne = { start: Date; ende: Date; ueberNacht: boolean };

/**
 * Beginn und Ende aus einem Tag und zwei Uhrzeiten.
 *
 * **Ein Ende, das nicht nach dem Beginn liegt, meint den Folgetag** — 22:00
 * bis 01:00 sind drei Stunden, keine negativen einundzwanzig. Die Oberfläche
 * schreibt den Folgetag ausdrücklich hin; stillschweigend wäre es genau die
 * Sorte Zahl, die plausibel aussieht und um einen Tag danebenliegt.
 *
 * Fehlt etwas, kommt `null` — der Aufrufer sagt dann, was fehlt.
 */
export function spanne(tag: string, von: string, bis: string): Spanne | null {
  if (!tag || !von || !bis) return null;
  const start = alsZeitpunkt(tag, von);
  let ende = alsZeitpunkt(tag, bis);
  const ueberNacht = ende <= start;
  if (ueberNacht) ende = new Date(ende.getTime() + 24 * 60 * 60_000);
  return { start, ende, ueberNacht };
}

/**
 * Eine Uhrzeit plus Minuten, als `HH:MM`. Über Mitternacht hinaus fängt sie
 * wieder bei 00:00 an — welcher Tag gemeint ist, entscheidet `spanne`.
 */
export function plusMinuten(uhrzeit: string, minuten: number): string {
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  const gesamt = (((stunde * 60 + minute + minuten) % 1440) + 1440) % 1440;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(gesamt / 60))}:${zwei(gesamt % 60)}`;
}
