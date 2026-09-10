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

export type Ballfilter = "alle" | Kontakt["ball"];

/**
 * Wer am Zug ist, mit seiner Beschriftung — die Werte kommen aus `Ball` in
 * socos/models.py.
 *
 * Als Liste und nicht als Bedingung im Markup: Solange es zwei Werte waren,
 * war `ball === "uns" ? … : …` kurz und richtig. Beim dritten wird daraus
 * still eine falsche Aussage — „nichts offen" stünde als „bei ihnen" da, und
 * auffallen würde es niemandem.
 */
export const BAELLE = [
  { wert: "uns", text: "bei uns" },
  { wert: "ihnen", text: "bei ihnen" },
  { wert: "nichts", text: "nichts offen" },
] as const;

export function ballText(ball: string): string {
  return BAELLE.find((b) => b.wert === ball)?.text ?? ball;
}

/**
 * Die Skala der Nähe zu einer Organisation, von fern nach nah — dieselbe
 * Reihenfolge wie `Organisationsstufe` in socos/models.py.
 *
 * Sie steht hier und nicht in der Kontakteseite, weil die Anzeige aus der
 * **Stellung** in dieser Liste besteht: „zwei von fünf". Zwei Listen wären
 * zwei Skalen, und eine eingeschobene Stufe verschöbe nur eine davon.
 */
export const STUFEN = [
  { wert: "erstkontakt", titel: "Erstkontakt" },
  { wert: "kennengelernt", titel: "Kennengelernt" },
  { wert: "austausch", titel: "Im Austausch" },
  { wert: "angebahnt", titel: "Angebahnt" },
  { wert: "partner", titel: "Partner" },
] as const;

export function stufentitel(stufe: string): string {
  return STUFEN.find((s) => s.wert === stufe)?.titel ?? stufe;
}

/**
 * Die wievielte Stufe das ist, 1 … STUFEN.length.
 *
 * Ein unbekannter Wert — eine Stufe, die es einmal gab und nicht mehr gibt —
 * ergibt 0: keine gefüllte Marke, aber auch kein Absturz und keine
 * Behauptung, das Haus stünde ganz am Anfang.
 */
export function stufenrang(stufe: string): number {
  return STUFEN.findIndex((s) => s.wert === stufe) + 1;
}

/**
 * Die vier Arten eines Verlaufseintrags, mit ihrer Beschriftung.
 *
 * Sie stehen hier und nicht in der Kontakteseite, weil die Eventseite denselben
 * Verlauf zeigt. Zwei Listen liefen beim nächsten neuen Wert auseinander — und
 * die Werte selbst kommen ohnehin aus `Verlaufsart` in socos/models.py.
 */
export const VERLAUFSARTEN = [
  { wert: "meeting", text: "Meeting" },
  { wert: "mail", text: "Mail" },
  { wert: "call", text: "Call" },
  { wert: "event", text: "Event" },
] as const;

export function artText(art: string): string {
  return VERLAUFSARTEN.find((a) => a.wert === art)?.text ?? art;
}

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
 * Vorne steht, was **wir** schulden, dahinter, worauf wir warten. Ein Punkt,
 * auf den wir bloß warten, ist auch offen — ihn zu verschweigen ließe die
 * Zeile leer aussehen, obwohl dort etwas läuft.
 *
 * Ganz hinten steht der Text einer Person, bei der nichts offen ist: Er ist
 * stehengebliebene Notiz, kein Vorgang. Ihn zu unterschlagen wäre trotzdem
 * falsch — er stünde sonst nirgends mehr, obwohl ihn jemand geschrieben hat.
 */
export function offenerPunkt(kontakte: Kontakt[]): { text: string; weitere: number } {
  const offene = kontakte.filter((k) => k.offener_punkt.trim());
  const rang = (k: Kontakt) => {
    const i = BAELLE.findIndex((b) => b.wert === k.ball);
    return i < 0 ? BAELLE.length : i;
  };
  const zuerst = [...offene].sort((a, b) => rang(a) - rang(b));
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

/**
 * Ob die Zeile „Lose Kontakte" in der Übersicht steht.
 *
 * Sie ist der einzige Weg zu den Personen ohne Organisation. Stünde sie nur
 * da, wenn es welche gibt, ließe sich die erste nie anlegen — die Seite
 * dahinter wäre erst erreichbar, wenn man sie nicht mehr braucht. Ungefiltert
 * steht sie darum immer da, auch mit null Personen. Sobald welche da sind,
 * folgt sie dem Filter wie jede andere Zeile: eine leere Zeile neben
 * „Nichts gefunden" wäre eine Antwort, die der Suche widerspricht.
 */
export function zeigtLoseZeile(
  lose: Kontakt[],
  gefilterteLose: Kontakt[],
  suche: string,
  ball: Ballfilter,
): boolean {
  if (lose.length > 0) return gefilterteLose.length > 0;
  return !suche.trim() && ball === "alle";
}
