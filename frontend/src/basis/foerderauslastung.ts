/**
 * Was die Seite der Förderauslastung zum Zeichnen braucht. Gerechnet wird am
 * Server (`services/foerderung.auslastung`); hier steht nur, wie aus den
 * Zahlen Höhe, Stufe und Beschriftung werden.
 */

import type { Antragsstand } from "./daten";
import { monatsname } from "./foerderungen";

/** Die Stände, die man dazuschalten kann — Entwürfe zum Planen rundherum. */
export const AUSLASTUNGSSTAENDE: { wert: Antragsstand; text: string }[] = [
  { wert: "bewilligt", text: "bewilligt" },
  { wert: "eingereicht", text: "eingereicht" },
  { wert: "entwurf", text: "Entwurf" },
];

/** Was beim Öffnen gewählt ist: was feststeht und was unterwegs ist. */
export const ANFANGSSTAENDE: Antragsstand[] = ["bewilligt", "eingereicht"];

/** Schaltet einen Stand ein oder aus — in der Reihenfolge der Liste, damit die Abfrage gleich heißt. */
export function standUmschalten(gewaehlt: Antragsstand[], stand: Antragsstand): Antragsstand[] {
  const neu = gewaehlt.includes(stand) ? gewaehlt.filter((s) => s !== stand) : [...gewaehlt, stand];
  return AUSLASTUNGSSTAENDE.map((s) => s.wert).filter((s) => neu.includes(s));
}

/** „Mär 27" für „2027-03". */
export const monatskurz = (monat: string) => monatsname(1, monat);

/** Der Jänner fängt ein neues Jahr an — dort steht die Jahreszahl und eine kräftigere Linie. */
export const istJahresanfang = (monat: string) => monat.endsWith("-01");

/** Stunden ohne Nachkommastellen, wie sie in einer engen Zelle stehen: „54". */
export const ganzeStunden = (stunden: string) => String(Math.round(Number(stunden)));

/**
 * Wie voll eine Zelle der Wärmekarte ist. 0 heißt: keine Stunden. Ohne
 * Kapazität gibt es keinen Maßstab, dann steht nur die Zahl da (1).
 * Ab 100 % ist es zu viel (4) — das Kupfer, die Handlung.
 */
export function waermestufe(stunden: string | undefined, anteil: string | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!stunden || Number(stunden) <= 0) return 0;
  if (anteil === null || anteil === undefined) return 1;
  const prozent = Number(anteil);
  if (prozent > 100) return 4;
  if (prozent >= 85) return 3;
  if (prozent >= 50) return 2;
  return 1;
}

/**
 * Wie hoch der Balkenstapel reicht: das Größte aus Monatssumme und
 * Kapazität, mit etwas Luft darüber — sonst stieße der höchste Monat oben an,
 * und die Kapazitätslinie läge auf der Kante.
 */
export function stapelhoehe(jeMonat: Record<string, string>, kapazitaet: string | null): number {
  const groesste = Math.max(0, ...Object.values(jeMonat).map(Number), Number(kapazitaet ?? 0));
  return groesste > 0 ? groesste * 1.1 : 1;
}

/** Anteil an der Stapelhöhe in Prozent, für die Höhe eines Abschnitts. */
export const prozentVon = (stunden: string | number, hoehe: number) => (Number(stunden) / hoehe) * 100;

/**
 * Der Beginn um `um` Monate verschoben, als Datum „JJJJ-MM-TT". Der Tag
 * bleibt, wo es ihn gibt; der 31. wird im Februar zum 28. (oder 29.) —
 * sonst rutschte ein Antrag beim Verschieben still einen Monat weiter.
 */
export function beginnVerschieben(beginn: string, um: number): string {
  const [jahr, monat, tag] = beginn.split("-").map(Number);
  const stelle = jahr * 12 + (monat - 1) + um;
  const neuJahr = Math.floor(stelle / 12);
  const neuMonat = (stelle % 12) + 1;
  const letzter = new Date(Date.UTC(neuJahr, neuMonat, 0)).getUTCDate();
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${neuJahr}-${zwei(neuMonat)}-${zwei(Math.min(tag, letzter))}`;
}

/**
 * Ob ein Datum aus dem Datumsfeld ein Beginn sein kann: vollständig und ab
 * dem Jahr 2000. Ein halb getipptes Jahr kommt als „0002-04-01" an.
 */
export const istPlanbarerBeginn = (wert: string) => /^\d{4}-\d{2}-\d{2}$/.test(wert) && Number(wert.slice(0, 4)) >= 2000;

/** Welcher der acht Thementöne zu einem Antrag gehört — an der Nummer, damit er beim Umschalten nicht wechselt. */
export const tonVon = (antrag: number) => (antrag % 8) + 1;
