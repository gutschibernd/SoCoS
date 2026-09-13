import type { Kontostand } from "./daten";

/**
 * Die Punkte für die Kontostandlinie — erfasst und fortgeschrieben.
 *
 * Steht hier und nicht in der Komponente, weil es rechnet: Was rechnet, wird
 * getestet, und eine Funktion, die aus zwei Zahlen eine Reihe macht, lässt
 * sich prüfen, ohne ein SVG zu zeichnen.
 *
 * **Die Fortschreibung benutzt dieselbe Formel wie der Runway** — Kontostand
 * geteilt durch erwartete Monatskosten. Der Server rechnet daraus die Zahl
 * („7,8 Monate"), hier entsteht daraus die Linie. Zwei Darstellungen desselben
 * Werts, die sich widersprechen, wären schlimmer als eine weniger: Niemand
 * könnte sagen, welche stimmt.
 */

export type Punkt = { t: number; v: number };

/**
 * Monat für Monat abziehen statt einmal zu teilen: Die Stützpunkte sollen auf
 * Monatsgrenzen liegen. `setMonth` rechnet dabei über Jahresgrenzen hinweg und
 * kappt zu kurze Monate selbst — der 31. plus einen Monat ist im Februar der
 * 3. März, und das ist für eine Fortschreibung nah genug.
 *
 * Der letzte Schritt wird bei null gekappt: Ein negativer Kontostand ist keine
 * Prognose, sondern eine andere Geschichte.
 */
export function fortschreibung(letzter: Punkt, monatskosten: number): Punkt[] {
  if (!(monatskosten > 0) || letzter.v <= 0) return [];
  const monate = Math.ceil(letzter.v / monatskosten);
  const punkte: Punkt[] = [];
  for (let i = 1; i <= monate; i++) {
    const d = new Date(letzter.t);
    d.setMonth(d.getMonth() + i);
    punkte.push({ t: d.getTime(), v: Math.max(0, letzter.v - monatskosten * i) });
  }
  return punkte;
}

/** Die erfassten Stichtage als Punkte, nach Datum geordnet. */
export function erfasstePunkte(verlauf: Kontostand[]): Punkt[] {
  return verlauf
    .map((k) => ({ t: new Date(k.datum).getTime(), v: Number(k.betrag) }))
    .sort((a, b) => a.t - b.t);
}
