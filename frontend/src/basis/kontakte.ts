/**
 * Was die Kontakteseite rechnet — an einer Stelle, damit es prüfbar ist.
 *
 * Die Seite zeigt zuerst Organisationen. Ein Verlaufseintrag hängt aber
 * entweder an der Organisation **oder** an einer Person darin (siehe
 * `Verlaufseintrag` in socos/models.py). Wer den Verlauf „mit dieser
 * Organisation" lesen will, muss beides zusammenführen — sonst steht das
 * Telefonat mit der Programmleitung an einer anderen Stelle als die Mail an
 * die Behörde, und den Faden sieht niemand mehr.
 *
 * Zusammengeführt wird beim Anzeigen, nicht beim Speichern: Ein zweites Feld
 * „gehört auch zur Organisation" wäre eine zweite Wahrheit, die beim
 * Umhängen einer Person auseinanderläuft.
 */

import type { Kontakt, Organisation, Verlaufseintrag } from "./daten";

export type Ballfilter = "alle" | "uns" | "ihnen";

export type Verlaufszeile = Verlaufseintrag & {
  /** Mit wem — leer, wenn der Eintrag an der Organisation selbst hängt. */
  wem: string;
};

/**
 * Neuestes zuerst, bei gleichem Datum der jüngere Eintrag — dieselbe Ordnung
 * wie im Backend (`ordering = ["-datum", "-id"]`). Zwei Ordnungen für
 * dieselbe Liste wären der Fehler, den man erst bei zwei Einträgen am selben
 * Tag sieht.
 */
function neuesteZuerst(a: Verlaufszeile, b: Verlaufszeile): number {
  if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
  return b.id - a.id;
}

export function verlaufDerOrganisation(org: Organisation): Verlaufszeile[] {
  return [
    ...org.verlauf.map((v) => ({ ...v, wem: "" })),
    ...org.kontakte.flatMap((k) => k.verlauf.map((v) => ({ ...v, wem: k.name }))),
  ].sort(neuesteZuerst);
}

/** Derselbe Strang für die losen Kontakte — sie haben keine Organisation. */
export function verlaufDerPersonen(kontakte: Kontakt[]): Verlaufszeile[] {
  return kontakte.flatMap((k) => k.verlauf.map((v) => ({ ...v, wem: k.name }))).sort(neuesteZuerst);
}

/** Das Datum des jüngsten Eintrags, egal ob an der Organisation oder an einer Person. */
export function letzterKontakt(org: Organisation): string | null {
  return verlaufDerOrganisation(org)[0]?.datum ?? null;
}

export function wartenAufUns(kontakte: Kontakt[]): number {
  return kontakte.filter((k) => k.ball === "uns").length;
}

/**
 * Was in der Übersicht als offener Punkt der Organisation steht.
 *
 * Es gibt keinen offenen Punkt *der Organisation* — den haben die Personen.
 * Gezeigt wird einer, die übrigen als Zahl daneben: Alle aufzuzählen sprengt
 * die Zeile, gar keinen zu zeigen macht die Spalte wertlos.
 *
 * Vorne steht, was **wir** schulden. Ein Punkt, auf den wir bloß warten, ist
 * aber auch offen — ihn zu verschweigen ließe die Zeile leer aussehen,
 * obwohl dort etwas läuft.
 */
export function offenerPunkt(kontakte: Kontakt[]): { text: string; weitere: number } {
  const offene = kontakte.filter((k) => k.offener_punkt.trim());
  const zuerst = offene.filter((k) => k.ball === "uns").concat(offene.filter((k) => k.ball !== "uns"));
  return { text: zuerst[0]?.offener_punkt ?? "", weitere: Math.max(0, zuerst.length - 1) };
}

function enthaelt(heuhaufen: string, nadel: string): boolean {
  return heuhaufen.toLowerCase().includes(nadel.trim().toLowerCase());
}

export function passtKontakt(k: Kontakt, suche: string, ball: Ballfilter): boolean {
  if (ball !== "alle" && k.ball !== ball) return false;
  if (!suche.trim()) return true;
  return enthaelt(`${k.name} ${k.funktion} ${k.offener_punkt} ${k.organisation_name}`, suche);
}

/**
 * Der Ball liegt bei Personen, nicht bei der Organisation: Sie passt zum
 * Filter, wenn eine ihrer Personen passt. Eine Organisation ohne Personen
 * fällt bei gesetztem Filter heraus — sie schuldet niemandem etwas und
 * niemand ihr.
 *
 * Die Suche geht dagegen über beides: Wer „Biomechanik" eingibt, will die
 * Organisation finden, wer einen Personennamen eingibt, die Organisation
 * dahinter.
 */
export function passtOrganisation(org: Organisation, suche: string, ball: Ballfilter): boolean {
  if (ball !== "alle" && !org.kontakte.some((k) => k.ball === ball)) return false;
  if (!suche.trim()) return true;
  if (enthaelt(`${org.name} ${org.kurz} ${org.typ} ${org.nutzen}`, suche)) return true;
  return org.kontakte.some((k) => passtKontakt(k, suche, "alle"));
}
