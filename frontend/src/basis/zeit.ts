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
