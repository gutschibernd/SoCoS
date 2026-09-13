/**
 * Was die Seite „Wünsche & Fehler" sortiert und beschriftet — an einer Stelle,
 * damit es prüfbar ist.
 *
 * Die Stände kommen aus `Rueckmeldungsstand` in socos/models.py. Sie stehen
 * hier als Liste und nicht als Bedingung im Markup: Solange es zwei Werte
 * waren, war `stand === "erledigt" ? … : …` kurz und richtig; beim fünften wird
 * daraus still eine falsche Aussage.
 */

import type { Rueckmeldung } from "./daten";

export type Stand = Rueckmeldung["stand"];

export const STAENDE: { wert: Stand; text: string; klasse: string }[] = [
  { wert: "neu", text: "neu", klasse: "status-offen" },
  { wert: "angenommen", text: "angenommen", klasse: "status-eingereicht" },
  { wert: "in_arbeit", text: "in Arbeit", klasse: "status-laeuft" },
  { wert: "erledigt", text: "erledigt", klasse: "status-fertig" },
  { wert: "abgelehnt", text: "abgelehnt", klasse: "status-verworfen" },
];

/** Was noch auf jemanden wartet. „abgelehnt" ist erledigt — nur anders. */
export const OFFENE_STAENDE: Stand[] = ["neu", "angenommen", "in_arbeit"];

export function istOffen(stand: Stand): boolean {
  return OFFENE_STAENDE.includes(stand);
}

export function standText(stand: string): string {
  return STAENDE.find((s) => s.wert === stand)?.text ?? stand;
}

export function standKlasse(stand: string): string {
  return STAENDE.find((s) => s.wert === stand)?.klasse ?? "status-offen";
}

export const ARTEN: { wert: Rueckmeldung["art"]; text: string }[] = [
  { wert: "fehler", text: "Fehler" },
  { wert: "wunsch", text: "Wunsch" },
];

export function artText(art: string): string {
  return ARTEN.find((a) => a.wert === art)?.text ?? art;
}

export type Abschnitt = {
  /** Die Überschrift des Abschnitts — bei Erledigtem die Version. */
  titel: string;
  /** Die Version, wenn der Abschnitt eine ist. Sonst leer. */
  version: string;
  eintraege: Rueckmeldung[];
};

/**
 * Erst das Offene, dann das Erledigte — **nach Version gebündelt**, neueste
 * zuerst.
 *
 * Warum die Version die Bündelung trägt und nicht bloß als Zeile neben dem
 * Eintrag steht: „Was ist mit dem letzten Update gekommen?" ist die Frage, die
 * hier gestellt wird. Eine Liste, in der die Versionen einzeln an den Zeilen
 * hängen, beantwortet sie erst, wenn man sie im Kopf sortiert.
 *
 * Erledigtes ohne Version landet unter „ohne Version" — das kommt vor, wenn
 * jemand etwas abhakt, das keinen Deploy gebraucht hat, und ist kein Fehler.
 * Abgelehntes steht am Ende, für sich: Es ist kein Ergebnis einer Version.
 */
export function abschnitte(liste: Rueckmeldung[]): Abschnitt[] {
  const offen = liste.filter((r) => istOffen(r.stand));
  const erledigt = liste.filter((r) => r.stand === "erledigt");
  const abgelehnt = liste.filter((r) => r.stand === "abgelehnt");

  const nachVersion = new Map<string, Rueckmeldung[]>();
  for (const eintrag of erledigt) {
    const version = eintrag.erledigt_in || "";
    nachVersion.set(version, [...(nachVersion.get(version) ?? []), eintrag]);
  }

  // Neueste Version zuerst; „ohne Version" ans Ende. Die leere Zeichenkette
  // sortiert sonst vor allen Datumsangaben und stünde nach dem Umdrehen als
  // erster Abschnitt da.
  const versionen = [
    ...[...nachVersion.keys()].filter(Boolean).sort().reverse(),
    ...(nachVersion.has("") ? [""] : []),
  ];

  return [
    ...(offen.length ? [{ titel: "Offen", version: "", eintraege: offen }] : []),
    ...versionen.map((version) => ({
      titel: version ? `Erledigt in ${version}` : "Erledigt",
      version,
      eintraege: nachVersion.get(version) ?? [],
    })),
    ...(abgelehnt.length
      ? [{ titel: "Abgelehnt", version: "", eintraege: abgelehnt }]
      : []),
  ];
}
