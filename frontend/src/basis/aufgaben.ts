/**
 * Was die Tafel sortiert und in Spalten teilt — und was davon auf die
 * Ideenliste gehört. An einer Stelle, damit es prüfbar ist.
 *
 * Sortiert wird hier und nicht am Server: In der Datenbank stünden „gering",
 * „hoch", „mittel" alphabetisch, also genau falsch. Ein `ORDER BY CASE` täte
 * es zwar, wäre aber ein zweiter Ort, an dem der Rang der Stufen steht — und
 * der zweite läuft beim nächsten Anfassen auseinander.
 */

import type { Aufgabe, Teammitglied } from "./daten";

export type Prioritaet = Aufgabe["prioritaet"];

/** Die Reihenfolge in dieser Liste **ist** der Rang. Oben steht, was zuerst kommt. */
export const PRIORITAETEN: { wert: Prioritaet; text: string }[] = [
  { wert: "hoch", text: "Hoch" },
  { wert: "mittel", text: "Mittel" },
  { wert: "gering", text: "Gering" },
];

export function prioritaetstext(prioritaet: string): string {
  return PRIORITAETEN.find((p) => p.wert === prioritaet)?.text ?? prioritaet;
}

/** Unbekanntes ganz nach hinten, statt vor „hoch" zu landen (findIndex = -1). */
export function prioritaetsrang(prioritaet: string): number {
  const i = PRIORITAETEN.findIndex((p) => p.wert === prioritaet);
  return i < 0 ? PRIORITAETEN.length : i;
}

/**
 * Ein Tipp auf die Priorität dreht sie **nach oben** weiter: mittel → hoch →
 * gering → mittel.
 *
 * Warum nach oben und nicht der Liste nach abwärts: Eine neue Aufgabe steht
 * auf „mittel", und der Griff, den man danach am häufigsten tut, ist „das ist
 * wichtiger". Der wäre abwärts zwei Tipps weit weg.
 *
 * Drei Stufen und kein „nicht eingeschätzt": Ein Rundlauf über vier Werte ist
 * einer zu viel, um ihn im Vorbeigehen zu treffen.
 */
export function naechstePrioritaet(jetzt: string): Prioritaet {
  const rang = prioritaetsrang(jetzt) % PRIORITAETEN.length;
  const naechster = (rang + PRIORITAETEN.length - 1) % PRIORITAETEN.length;
  return PRIORITAETEN[naechster].wert;
}

/**
 * Eine Spalte der Tafel. `person: null` ist „Allgemein" — dieselbe Bedeutung
 * wie im Feld selbst, kein zweiter Zustand daneben.
 */
export type Spalte = {
  person: number | null;
  titel: string;
  initialen: string;
  farbe: string;
  offen: Aufgabe[];
  erledigt: Aufgabe[];
};

/**
 * Erst nach Priorität, dann **das Neueste zuerst**.
 *
 * Warum nicht das Älteste zuerst, wie man es von einer Abarbeitungsliste
 * kennt: Das Feld zum Schreiben steht oben. Eine gerade eingetippte Zeile, die
 * unten an ihrer Gruppe anklebt, sieht man nicht — und tippt sie im Zweifel
 * ein zweites Mal. Dass Altes nach unten sinkt, ist genau das, wofür die
 * Priorität da ist.
 *
 * Gleichstand fällt auf die Kennung zurück, nicht auf die Reihenfolge der
 * Antwort: `sort` ist zwar stabil, die Liste kommt aber gefiltert hier an.
 */
export function sortiere(aufgaben: Aufgabe[]): Aufgabe[] {
  return [...aufgaben].sort((a, b) => {
    const unterschied = prioritaetsrang(a.prioritaet) - prioritaetsrang(b.prioritaet);
    if (unterschied !== 0) return unterschied;
    if (a.erstellt_am !== b.erstellt_am) return a.erstellt_am < b.erstellt_am ? 1 : -1;
    return b.id - a.id;
  });
}

/** Das Abgehakte: zuletzt Angefasstes oben — das ist das zuletzt Abgehakte. */
function sortiereErledigte(aufgaben: Aufgabe[]): Aufgabe[] {
  return [...aufgaben].sort((a, b) =>
    a.geaendert_am === b.geaendert_am ? b.id - a.id : a.geaendert_am < b.geaendert_am ? 1 : -1,
  );
}

/**
 * Die Ideenliste: **eine** Liste, keine Spalten.
 *
 * Eine Idee gehört niemandem — sie ist ja gerade noch nicht verteilt. Eine
 * Spalte je Person hieße, die Entscheidung „wer macht das" schon getroffen zu
 * haben, und genau die steht hier noch aus.
 *
 * Sortiert wird wie auf der Tafel (Priorität, dann das Neueste oben) — es ist
 * dieselbe Liste in einem anderen Zustand, nicht eine zweite Art von Zeile.
 * `erledigt` heißt hier „vom Tisch": Was gemacht wird, wandert als Aufgabe auf
 * die Tafel und ist dann keine Idee mehr.
 */
export function ideen(aufgaben: Aufgabe[]): { offen: Aufgabe[]; vomTisch: Aufgabe[] } {
  const eigene = aufgaben.filter((a) => a.ist_idee);
  return {
    offen: sortiere(eigene.filter((a) => !a.erledigt)),
    vomTisch: sortiereErledigte(eigene.filter((a) => a.erledigt)),
  };
}

/**
 * Die Spalten der Tafel: **Allgemein**, dann ich, dann die anderen nach Namen.
 *
 * Warum ich an zweiter Stelle und nicht alphabetisch dazwischen: Die eigene
 * Spalte ist die, in die man schreibt, ohne hinzusehen. Sie soll immer am
 * selben Platz stehen — auch für den, dessen Name hinten im Alphabet liegt.
 *
 * Eine Spalte bekommt, wer aktiv ist **oder** noch Aufgaben auf der Tafel hat.
 * Ohne den zweiten Teil verschwänden mit einem stillgelegten Konto still auch
 * dessen offene Punkte — und niemand sähe, dass sie je da waren.
 */
export function spalten(
  aufgaben: Aufgabe[],
  team: Teammitglied[],
  ich: number,
): Spalte[] {
  /* Die Ideen fallen **hier** heraus und nicht beim Aufrufer: Tafel und
     Ideenliste kommen aus derselben Antwort, und ein vergessener Filter an
     einer der beiden Stellen wäre nicht zu sehen — eine Idee sähe auf der
     Tafel aus wie jede andere Zeile. */
  const aufDerTafel = aufgaben.filter((a) => !a.ist_idee);

  const mitAufgaben = new Set(
    aufDerTafel.map((a) => a.person).filter((p): p is number => p !== null),
  );
  const leute = team.filter((m) => m.is_active || mitAufgaben.has(m.id));

  const geordnet = [
    ...leute.filter((m) => m.id === ich),
    ...leute
      .filter((m) => m.id !== ich)
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  ];

  const bauen = (person: number | null, titel: string, initialen: string, farbe: string) => {
    const eigene = aufDerTafel.filter((a) => a.person === person);
    return {
      person,
      titel,
      initialen,
      farbe,
      offen: sortiere(eigene.filter((a) => !a.erledigt)),
      erledigt: sortiereErledigte(eigene.filter((a) => a.erledigt)),
    };
  };

  /* „Allgemein" bekommt kein Kürzel: Ein Zeichen im Kreis behauptete eine
     Person, und die Spalte ist gerade die, die keiner ist. */
  return [
    bauen(null, "Allgemein", "", ""),
    ...geordnet.map((m) => bauen(m.id, m.name, m.initialen, m.farbe)),
  ];
}
