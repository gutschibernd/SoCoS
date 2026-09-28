/**
 * Was die Tafel sortiert, filtert und nach Fälligkeit gruppiert — und was
 * davon auf die Ideenliste und ins Archiv gehört. An einer Stelle, damit es
 * prüfbar ist.
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
 * Erst nach Priorität, dann nach Frist, dann **das Neueste zuerst**.
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
    // Bei gleicher Priorität drängt, was eine Frist hat — die frühere zuerst.
    // Die Frist schlägt die Priorität aber nicht: Die setzt man von Hand, und
    // wer „hoch" tippt, meint es.
    if (a.frist !== b.frist) {
      if (a.frist === null) return 1;
      if (b.frist === null) return -1;
      return a.frist < b.frist ? -1 : 1;
    }
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
 * Wessen Aufgaben gezeigt werden: meine, alle, die allgemeinen oder die einer
 * bestimmten Person (ihre Kennung).
 */
export type Filter = "ich" | "alle" | "allgemein" | number;

/**
 * Ob eine Aufgabe unter einem Filter steht. Eine Aufgabe mit zwei Personen
 * steht bei **beiden** — das ist der Sinn davon, sie zweien zu geben.
 */
export function gehoertZu(aufgabe: Aufgabe, filter: Filter, ich: number): boolean {
  if (filter === "alle") return true;
  if (filter === "allgemein") return aufgabe.personen.length === 0;
  return aufgabe.personen.includes(filter === "ich" ? ich : filter);
}

export type Gruppe = {
  art: "drueber" | "heute" | "bald" | "spaeter" | "ohne";
  titel: string;
  aufgaben: Aufgabe[];
};

const GRUPPEN: { art: Gruppe["art"]; titel: string }[] = [
  { art: "drueber", titel: "Überfällig" },
  { art: "heute", titel: "Heute" },
  { art: "bald", titel: "Nächste 7 Tage" },
  { art: "spaeter", titel: "Später" },
  { art: "ohne", titel: "Ohne Frist" },
];

function gruppeVon(aufgabe: Aufgabe, heute: Date): Gruppe["art"] {
  if (!aufgabe.frist) return "ohne";
  const tage = tageBis(aufgabe.frist, heute);
  if (tage < 0) return "drueber";
  if (tage === 0) return "heute";
  if (tage <= 7) return "bald";
  return "spaeter";
}

/**
 * Die Tafel: das Offene unter einem Filter, **nach Fälligkeit gruppiert**,
 * in jeder Gruppe nach `sortiere`.
 *
 * Warum Fälligkeit und nicht Person: Die Frage, mit der man die Seite
 * aufmacht, ist „was drängt" — und Überfälliges stand in der Spaltentafel
 * irgendwo in einer fremden Spalte, wo es niemand sah. Wem etwas gehört,
 * beantwortet der Filter.
 *
 * Leere Gruppen fallen weg; eine Überschrift „Heute" ohne etwas darunter ist
 * Rauschen. Die Ideen fallen **hier** heraus und nicht beim Aufrufer: Tafel
 * und Ideenliste kommen aus derselben Antwort, und ein vergessener Filter an
 * einer der beiden Stellen wäre nicht zu sehen.
 */
export function tafel(
  aufgaben: Aufgabe[],
  filter: Filter,
  ich: number,
  heute = new Date(),
): Gruppe[] {
  const offen = aufgaben.filter((a) => !a.ist_idee && !a.erledigt && gehoertZu(a, filter, ich));
  return GRUPPEN.map(({ art, titel }) => ({
    art,
    titel,
    aufgaben: sortiere(offen.filter((a) => gruppeVon(a, heute) === art)),
  })).filter((g) => g.aufgaben.length > 0);
}

/**
 * Die Ideenliste: **eine** Liste, ohne Filter.
 *
 * Eine Idee gehört niemandem — sie ist ja gerade noch nicht verteilt.
 * Sortiert wird wie auf der Tafel (Priorität, dann das Neueste oben).
 * Abgehakte Ideen („vom Tisch") stehen im Archiv, nicht hier.
 */
export function ideen(aufgaben: Aufgabe[]): Aufgabe[] {
  return sortiere(aufgaben.filter((a) => a.ist_idee && !a.erledigt));
}

/**
 * Das Archiv: alles Abgehakte — Aufgaben wie Ideen —, zuletzt Abgehaktes
 * oben, nach Monaten geteilt.
 *
 * **Warum ein eigener Reiter und nicht unter der Liste:** Unten auf der Tafel
 * wuchs das Erledigte mit jeder Woche, und wer nach unten scrollte, um das
 * Letzte zu finden, fand erst das Erledigte. Auf der Tafel steht nur, was
 * noch zu tun ist.
 *
 * Der Filter gilt hier wie auf der Tafel. Eine Idee gehört niemandem und
 * steht deshalb unter „Alle" und „Allgemein".
 *
 * Der Monat kommt aus `geaendert_am`. Ein eigenes „erledigt am" gibt es nicht;
 * wer es genau wissen muss, findet es im Änderungsprotokoll.
 */
export function archiv(
  aufgaben: Aufgabe[],
  filter: Filter,
  ich: number,
): { monat: string; titel: string; aufgaben: Aufgabe[] }[] {
  const erledigt = sortiereErledigte(
    aufgaben.filter((a) => a.erledigt && gehoertZu(a, filter, ich)),
  );
  const monate: { monat: string; titel: string; aufgaben: Aufgabe[] }[] = [];
  for (const a of erledigt) {
    const monat = a.geaendert_am.slice(0, 7);
    let gruppe = monate.find((m) => m.monat === monat);
    if (!gruppe) {
      const [j, m] = monat.split("-").map(Number);
      const titel = new Date(j, m - 1, 1).toLocaleDateString("de-AT", { month: "long", year: "numeric" });
      gruppe = { monat, titel, aufgaben: [] };
      monate.push(gruppe);
    }
    gruppe.aufgaben.push(a);
  }
  return monate;
}

/**
 * Wer im Filter und in der Auswahl „Für" steht: **ich zuerst**, dann die
 * anderen nach Namen.
 *
 * Warum ich vorn und nicht alphabetisch dazwischen: Der eigene Knopf ist der,
 * den man drückt, ohne hinzusehen. Er soll immer am selben Platz stehen.
 *
 * Dabei ist, wer aktiv ist **oder** noch offene Aufgaben hat. Ohne den
 * zweiten Teil verschwänden mit einem stillgelegten Konto still auch dessen
 * offene Punkte — und niemand sähe, dass sie je da waren.
 */
export function leute(aufgaben: Aufgabe[], team: Teammitglied[], ich: number): Teammitglied[] {
  const mitAufgaben = new Set(
    aufgaben.filter((a) => !a.ist_idee && !a.erledigt).flatMap((a) => a.personen),
  );
  const dabei = team.filter((m) => m.is_active || mitAufgaben.has(m.id));
  return [
    ...dabei.filter((m) => m.id === ich),
    ...dabei.filter((m) => m.id !== ich).sort((a, b) => a.name.localeCompare(b.name, "de")),
  ];
}

/**
 * Die Fristen, die man mit einem Tipp setzt. Gezählt in Tagen ab heute und
 * nicht als Wochentag („Freitag"): „in 7 Tagen" heißt an jedem Tag dasselbe.
 */
export const SCHNELLFRISTEN: { tage: number; text: string }[] = [
  { tage: 1, text: "Morgen" },
  { tage: 3, text: "In 3 Tagen" },
  { tage: 7, text: "In 7 Tagen" },
  { tage: 14, text: "In 14 Tagen" },
];

/** Das Datum `"JJJJ-MM-TT"` in `tage` Tagen — in Ortszeit, nicht in UTC. */
export function datumIn(tage: number, heute = new Date()): string {
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + tage);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** Ganze Kalendertage von `heute` bis zum Datum `"JJJJ-MM-TT"` — negativ, wenn es vorbei ist. */
export function tageBis(datum: string, heute = new Date()): number {
  const [j, m, t] = datum.split("-").map(Number);
  // Beide auf Mitternacht in UTC, damit die Umstellung auf Winterzeit am
  // 25. Oktober keinen Tag verschluckt: Zwischen zwei Ortsmitternächten
  // liegen dort 25 Stunden.
  const ziel = Date.UTC(j, m - 1, t);
  const start = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.round((ziel - start) / 86_400_000);
}

/**
 * Die Frist, wie sie neben einer Aufgabe steht: „12.10. · in 20 Tagen",
 * „heute", „morgen", „3 Tage drüber". Das Datum steht immer dabei — „in 20
 * Tagen" allein zwingt zum Nachrechnen, sobald man es jemandem weitersagt.
 */
export function fristText(frist: string, heute = new Date()): { text: string; drueber: boolean; bald: boolean } {
  const [, m, t] = frist.split("-");
  const datum = `${t}.${m}.`;
  const tage = tageBis(frist, heute);
  const wann =
    tage === 0
      ? "heute"
      : tage === 1
        ? "morgen"
        : tage > 1
          ? `in ${tage} Tagen`
          : tage === -1
            ? "1 Tag drüber"
            : `${-tage} Tage drüber`;
  return { text: `${datum} · ${wann}`, drueber: tage < 0, bald: tage >= 0 && tage <= 7 };
}
