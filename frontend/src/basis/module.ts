/**
 * Module — zusätzliche Werkzeuge unter „Intern · Module".
 *
 * **Eine** Liste, aus der die Leiste und die Übersichtsseite leben. Stünde sie
 * zweimal da, hätte ein neues Modul in der Leiste schon einen Eintrag und auf
 * der Übersicht noch keine Kachel, und niemand sähe warum.
 */

import type { Umfang } from "./daten";
import type { ZeichenName } from "../bausteine/Zeichen";

/** Die Haupt-Aufgabenstellungen der Praktikanten: Themen mit Ausschreibung und Aushang. */
export type Themenliste = { weg: string; titel: string; wozu: string; schluessel: "praktikum" };

/** Die To-Dos der Praktikanten: kleine Pakete zum Heraussuchen, ein eigenes Modell. */
export type Todoteil = { weg: string; titel: string; wozu: string; schluessel: "todos" };

/** Meine Aufgaben: Haupt- und Nebenstränge je Praktikant (`ansichten/Praktikanten.tsx`). */
export type Strangteil = { weg: string; titel: string; wozu: string; schluessel: "straenge" };

/** Die Einschulung — eine Leerstelle, bis sie gebaut wird. */
export type Einschulungsteil = { weg: string; titel: string; wozu: string; schluessel: "einschulung" };

/** Die Teile, die auf dem Einstieg der Praktikanten als große Kachel stehen. */
export type Praktikantenteil = Themenliste | Todoteil | Strangteil | Einschulungsteil;

/** Ein Teil, der eine eigene Seite ohne Unterteile ist — Thoughts. */
export type Kartenteil = { weg: string; titel: string; schluessel: "thoughts" };

/** Die Förderungen: Programme mit Anträgen — eine eigene Seite, Anträge darunter. */
export type Foerderteil = { weg: string; titel: string; schluessel: "foerderung" };

/** Die Runway-Planung: eine Seite, keine Unterseiten. */
export type Runwayteil = { weg: string; titel: string; schluessel: "runway" };

/** Die Designentscheidungen: eine Liste, je Entscheidung eine eigene Seite darunter. */
export type Designteil = { weg: string; titel: string; schluessel: "design" };

/** Die Bestellungen: eine Liste der Lieferanten, je Lieferant eine Seite darunter. */
export type Bestellteil = { weg: string; titel: string; schluessel: "bestellungen" };

export type Teil = Praktikantenteil | Kartenteil | Foerderteil | Runwayteil | Designteil | Bestellteil;

export type Modul = {
  /**
   * Der Weg hinter `/module/`. Hat das Modul einen Teil, ist es dessen Weg.
   * Hat es mehrere, ist es ein eigener: Dort steht der Einstieg mit einer
   * großen Kachel je Teil (`/module/praktikanten`).
   */
  weg: string;
  titel: string;
  wozu: string;
  zeichen: ZeichenName;
  /** Die Teile darin, in ihrer Reihenfolge. */
  teile: Teil[];
};

export const MODULE: Modul[] = [
  {
    // Bis 2026-11-09 „Praktikantenstellen", mit den Haupt-Aufgaben unter
    // `/module/praktikum` als erstem Teil. Seit die To-Dos dazukamen, ist es
    // mehr als die Stellen, und der Einstieg hat einen eigenen Weg. Die Wege
    // der Teile sind geblieben, damit Lesezeichen auf ein Thema weiter gehen.
    weg: "praktikanten",
    titel: "Praktikanten",
    wozu: "Wer woran arbeitet, To-Dos zum Aussuchen, Aufgabenstellungen ausschreiben",
    zeichen: "mappe",
    // Seit 2026-11-19 in dieser Reihenfolge (Bernd): Wer hier hereinkommt,
    // will zuerst wissen, woran er ist. Die Ausschreibungen braucht man vor
    // dem Praktikum, nicht währenddessen — sie stehen hinten. Die
    // „Sonstigen Ideen" sind in den To-Dos aufgegangen.
    teile: [
      // `wozu` ist die eine Zeile auf der Kachel des Einstiegs.
      {
        weg: "praktikum-aufgaben",
        titel: "Meine Aufgaben",
        wozu: "Hauptstrang, Nebenstränge und ihre To-Dos — und die Uhr darauf",
        schluessel: "straenge",
      },
      {
        weg: "praktikum-todos",
        titel: "To-Dos",
        wozu: "Ideen, die noch niemandem gehören — zum Aussuchen für zwischendurch",
        schluessel: "todos",
      },
      {
        weg: "praktikum-einschulung",
        titel: "Einschulung",
        wozu: "Was man bei Sopharmis wissen muss — kommt noch",
        schluessel: "einschulung",
      },
      {
        weg: "praktikum",
        titel: "Haupt-Aufgabenstellungen",
        wozu: "Was wir als Praktikum vergeben — mit Ausschreibung und Aushang",
        schluessel: "praktikum",
      },
    ],
  },
  {
    weg: "thoughts",
    titel: "Thoughts",
    wozu: "Was in welchem Thema ansteht und worauf gewartet wird",
    zeichen: "thoughts",
    teile: [{ weg: "thoughts", titel: "Themen, Schritte, Abhängigkeiten", schluessel: "thoughts" }],
  },
  {
    weg: "foerderungen",
    titel: "Förderungen",
    wozu: "Programme verstehen, Anträge mit Arbeitspaketen planen",
    zeichen: "foerderung",
    teile: [{ weg: "foerderungen", titel: "Fördergeber, Programme, Anträge", schluessel: "foerderung" }],
  },
  // Die Projektplanung stand bis 2026-10-19 hier als eigenes Modul. Sie ist
  // in die Projektseite gezogen: Unter dem Gantt steht die gewählte Phase mit
  // Paketen, Stunden und Aufgaben (ansichten/Planung.tsx).
  {
    // Ein Modul neben der Kennzahl auf dem Dashboard, nicht an ihrer Stelle
    // (Bernd, 2026-10-14: „mal zum Testen"). Bewährt es sich, kommt die
    // Runway des Dashboards von hier.
    weg: "runway",
    titel: "Runway-Planung",
    wozu: "Was herein- und hinausgeht und wie lange das Geld reicht",
    zeichen: "kurve",
    teile: [{ weg: "runway", titel: "Plan, Posten, Verlauf", schluessel: "runway" }],
  },
  {
    // Sammelbestellungen je Lieferant (Bernd, 2026-11-12). Die Zusammenfassung
    // des Korbs geht an Claude, der damit in Chrome den Warenkorb füllt.
    weg: "bestellungen",
    titel: "Bestellungen",
    wozu: "Sammelbestellungen je Lieferant, Sortiment, Mails mit Herstellern",
    zeichen: "wagen",
    teile: [{ weg: "bestellungen", titel: "Lieferanten, Korb, Archiv", schluessel: "bestellungen" }],
  },
  {
    // Für die technische Dokumentation nach ISO 13485: Was hier entschieden
    // und begründet ist, geht als PDF in die Akte.
    weg: "design",
    titel: "Designentscheidungen",
    wozu: "Entscheidungen begründen, Sicherheit belegen, als PDF in die Akte",
    zeichen: "schild",
    teile: [{ weg: "design", titel: "Entscheidungen", schluessel: "design" }],
  },
];

/** Alle Wege, die hinter `/module/` stehen dürfen — der Router fragt hier. */
export const MODULWEGE = MODULE.flatMap((m) => [
  ...(m.teile.length > 1 ? [m.weg] : []),
  ...m.teile.map((t) => t.weg),
]);

/** Das Modul, dessen Einstieg hinter diesem Weg steht — nur bei mehreren Teilen. */
export function einstiegAusWeg(unter: string | null): { modul: Modul } | null {
  const modul = MODULE.find((m) => m.teile.length > 1 && m.weg === unter);
  return modul ? { modul } : null;
}

/**
 * Das Thema hinter `praktikum/12` — oder nichts.
 *
 * Die Liste steht mit im Weg, damit „zurück" in die Liste führt, aus der man
 * kam. Ein altes Lesezeichen auf `praktikum-ideen/12` führt ins Leere: Die
 * Ideen sind seit 2026-11-19 To-Dos.
 */
export function themaAusWeg(unter: string | null): { modul: Modul; teil: Themenliste; id: number } | null {
  const treffer = /^([a-z-]+)\/(\d+)$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "praktikum") return null;
  return { modul: gefunden.modul, teil: gefunden.teil, id: Number(treffer[2]) };
}

/** Die Seite eines Praktikanten hinter `praktikum-aufgaben/7` — die Nummer seines Kontos, oder nichts. */
export function praktikantAusWeg(unter: string | null): number | null {
  const treffer = /^praktikum-aufgaben\/(\d+)$/.exec(unter ?? "");
  return treffer ? Number(treffer[1]) : null;
}

/**
 * Ein Fördergeber hinter `foerderungen/2`, ein Programm darin hinter
 * `foerderungen/2/4`, ein Antrag hinter `foerderungen/2/4/12` — oder nichts.
 * Was darüber liegt, steht mit im Weg, damit „zurück" ohne Geschichte
 * (Lesezeichen) Stufe für Stufe nach oben führt. Ob es alles gibt, sagt erst der Server; die Seite zeigt dann,
 * dass es fehlt.
 */
export function foerderungAusWeg(unter: string | null): {
  modul: Modul;
  teil: Foerderteil;
  geber: number;
  programm: number | null;
  antrag: number | null;
} | null {
  const treffer = /^([a-z-]+)\/(\d+)(?:\/(\d+))?(?:\/(\d+))?$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "foerderung") return null;
  return {
    modul: gefunden.modul,
    teil: gefunden.teil,
    geber: Number(treffer[2]),
    programm: treffer[3] ? Number(treffer[3]) : null,
    antrag: treffer[4] ? Number(treffer[4]) : null,
  };
}

/** Der Weg der Förderauslastung — eine Seite neben den Fördergebern, keine Ebene darunter. */
export const AUSLASTUNGSWEG = "foerderungen/auslastung";

/** Die Förderauslastung hinter `foerderungen/auslastung` — oder nichts. */
export function foerderauslastungAusWeg(unter: string | null): { modul: Modul; teil: Foerderteil } | null {
  const gefunden = unter === AUSLASTUNGSWEG ? teilZuWeg("foerderungen") : null;
  return gefunden && gefunden.teil.schluessel === "foerderung" ? { modul: gefunden.modul, teil: gefunden.teil } : null;
}

/** Der Weg der Förderplanung — wie die Auslastung eine Seite neben den Fördergebern. */
export const PLANUNGSWEG = "foerderungen/planung";

/** Die Förderplanung hinter `foerderungen/planung` — oder nichts. */
export function foerderplanungAusWeg(unter: string | null): { modul: Modul; teil: Foerderteil } | null {
  const gefunden = unter === PLANUNGSWEG ? teilZuWeg("foerderungen") : null;
  return gefunden && gefunden.teil.schluessel === "foerderung" ? { modul: gefunden.modul, teil: gefunden.teil } : null;
}

/** Der Weg zu dem, was bisher hereinkam — hinter dem Diamanten auf der Förderungsseite. */
export const BISHERWEG = "foerderungen/bisher";

/** Die Seite hinter dem Diamanten unter `foerderungen/bisher` — oder nichts. */
export function foerderbisherAusWeg(unter: string | null): { modul: Modul; teil: Foerderteil } | null {
  const gefunden = unter === BISHERWEG ? teilZuWeg("foerderungen") : null;
  return gefunden && gefunden.teil.schluessel === "foerderung" ? { modul: gefunden.modul, teil: gefunden.teil } : null;
}

/**
 * Eine Designentscheidung hinter `design/7` — oder nichts. Die Nummer im Weg
 * ist die `id`, nicht die Kennung DE-007: Die id ändert sich nie, und der
 * Server findet sie ohne Umweg.
 */
export function designAusWeg(unter: string | null): { modul: Modul; teil: Designteil; id: number } | null {
  const treffer = /^([a-z-]+)\/(\d+)$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "design") return null;
  return { modul: gefunden.modul, teil: gefunden.teil, id: Number(treffer[2]) };
}

/** Ein Lieferant hinter `bestellungen/3` — oder nichts. Ob es ihn gibt, sagt erst der Server. */
export function lieferantAusWeg(unter: string | null): { modul: Modul; teil: Bestellteil; id: number } | null {
  const treffer = /^([a-z-]+)\/(\d+)$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "bestellungen") return null;
  return { modul: gefunden.modul, teil: gefunden.teil, id: Number(treffer[2]) };
}

/** „1 Entscheidung", „3 Entscheidungen". */
export function entscheidungsZahl(zahl: number): string {
  return `${zahl} ${zahl === 1 ? "Entscheidung" : "Entscheidungen"}`;
}

/** „3 Themen" — wie die Zeile auf der Übersicht und die Leiste zählen. */
export function themenZahl(zahl: number): string {
  return `${zahl} ${zahl === 1 ? "Thema" : "Themen"}`;
}

/** Ob ein Teil auf dem Einstieg der Praktikanten als große Kachel steht. */
export function istPraktikantenteil(teil: Teil): teil is Praktikantenteil {
  return ["praktikum", "todos", "straenge", "einschulung"].includes(teil.schluessel);
}

/** Das Modul und der Teil zu einem Weg — oder nichts. */
export function teilZuWeg(unter: string | null): { modul: Modul; teil: Teil } | null {
  for (const modul of MODULE) {
    const teil = modul.teile.find((t) => t.weg === unter);
    if (teil) return { modul, teil };
  }
  return null;
}

/* --- Beträge --------------------------------------------------------------- */

/**
 * „1.450" oder „1450,50" → "1450.00" / "1450.50" für die API; leer → null.
 * `undefined`, wenn es keine Zahl ist — dann sagt das Feld das, statt still
 * etwas anderes zu speichern.
 */
export function betragAusEingabe(text: string): string | null | undefined {
  const roh = text.replace(/€/g, "").replace(/\s/g, "");
  if (!roh) return null;
  // Ein einzelner Punkt vor ein oder zwei Ziffern ist ein Dezimalpunkt, kein
  // Tausendertrenner: Wer einen Dollarpreis abschreibt, tippt „462.19" und
  // meint nicht 46 219 € — genau so ist es am 2026-11-17 im Korb gelandet.
  // „1.450" (drei Ziffern) bleibt Tausend, wie man es hier schreibt.
  if (/^\d+\.\d{1,2}$/.test(roh)) return Number(roh).toFixed(2);
  const zahl = Number(roh.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(zahl) || zahl < 0) return undefined;
  return zahl.toFixed(2);
}

/** "1450.00" → „1 450 €", "1450.50" → „1 450,50 €" — de-AT wie das Dashboard. */
export function alsEuro(betrag: string): string {
  const zahl = Number(betrag);
  const ganz = Number.isInteger(zahl);
  return `${zahl.toLocaleString("de-AT", {
    minimumFractionDigits: ganz ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

/** Der Betrag so, wie er im Eingabefeld steht: "1450.50" → „1450,50". */
export function betragZumBearbeiten(betrag: string | null): string {
  if (betrag === null) return "";
  return betrag.replace(/\.00$/, "").replace(".", ",");
}

/* --- Praktikanten ----------------------------------------------------------- */

/**
 * Die Stufen des Umfangs, in der Reihenfolge der Skala. Die Namen stehen
 * auch am Modell (`Nebenaufgabe.Umfang`); hier kommt die Stufe für die
 * Balken dazu.
 */
export const UMFAENGE: { wert: Umfang; titel: string; stufe: 1 | 2 | 3 | 4 }[] = [
  { wert: "vormittag", titel: "Ein Vormittag", stufe: 1 },
  { wert: "tag", titel: "Ein Tag", stufe: 2 },
  { wert: "woche", titel: "Eine Woche", stufe: 3 },
  { wert: "gross", titel: "Größer", stufe: 4 },
];

export const umfangVon = (wert: Umfang) => UMFAENGE.find((u) => u.wert === wert) ?? UMFAENGE[0];

/**
 * Die To-Dos nach Umfang gruppiert, das Kleinste zuerst, darin nach Titel.
 * Nur Gruppen, in denen etwas steht. Wer ein To-Do heraussucht, fragt
 * zuerst, wie viel Zeit er hat — erst dann, was es ist.
 */
export function nachUmfang<T extends { umfang: Umfang; titel: string }>(
  todos: T[],
): { umfang: (typeof UMFAENGE)[number]; todos: T[] }[] {
  return UMFAENGE.map((umfang) => ({
    umfang,
    todos: todos.filter((t) => t.umfang === umfang.wert).sort((a, b) => a.titel.localeCompare(b.titel, "de")),
  })).filter((g) => g.todos.length > 0);
}

/** „1 To-Do", „3 To-Dos". */
export function todoZahl(zahl: number): string {
  return `${zahl} ${zahl === 1 ? "To-Do" : "To-Dos"}`;
}

/**
 * Die Punkte eines Themas, wie sie auf der Karte stehen: eine Zeile je Punkt,
 * ohne einen Strich, den jemand aus Gewohnheit davorgesetzt hat. Dieselbe
 * Regel wie `stichpunkte` in socos/services/ausschreibung.py — sonst stünde
 * auf der Karte ein Punkt, den der Auftrag an das LLM nicht mitnimmt.
 */
export function punkteAusText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((z) => z.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}
