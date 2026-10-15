/**
 * Module — zusätzliche Werkzeuge unter „Intern · Module".
 *
 * **Eine** Liste, aus der die Leiste und die Übersichtsseite leben. Stünde sie
 * zweimal da, hätte ein neues Modul in der Leiste schon einen Eintrag und auf
 * der Übersicht noch keine Kachel, und niemand sähe warum.
 */

import type { Themenart } from "./daten";
import type { ZeichenName } from "../bausteine/Zeichen";

/**
 * Eine Liste von Themen, die man selbst anlegt — die Haupt-Aufgabenstellungen
 * der Praktikantenstellen oder ihre sonstigen Ideen. Der Weg des ersten Teils
 * ist der Weg des Moduls. Beide Listen sind dasselbe Modell; `art` trennt sie.
 */
export type Themenliste = { weg: string; titel: string; schluessel: "praktikum"; art: Themenart };

/** Ein Teil, der eine eigene Seite ohne Unterteile ist — Thoughts. */
export type Kartenteil = { weg: string; titel: string; schluessel: "thoughts" };

/** Die Förderungen: Programme mit Anträgen — eine eigene Seite, Anträge darunter. */
export type Foerderteil = { weg: string; titel: string; schluessel: "foerderung" };

/** Die Projektplanung: die Phasen als Liste, je Phase eine eigene Seite darunter. */
export type Planungsteil = { weg: string; titel: string; schluessel: "planung" };

/** Die Runway-Planung: eine Seite, keine Unterseiten. */
export type Runwayteil = { weg: string; titel: string; schluessel: "runway" };

/** Die Designentscheidungen: eine Liste, je Entscheidung eine eigene Seite darunter. */
export type Designteil = { weg: string; titel: string; schluessel: "design" };

export type Teil = Themenliste | Kartenteil | Foerderteil | Planungsteil | Runwayteil | Designteil;

export type Modul = {
  /** Der Weg hinter `/module/`, und der Anfang der Wege seiner Teile. */
  weg: string;
  titel: string;
  wozu: string;
  zeichen: ZeichenName;
  /** Die Teile darin, in ihrer Reihenfolge. */
  teile: Teil[];
};

export const MODULE: Modul[] = [
  {
    weg: "praktikum",
    titel: "Praktikantenstellen",
    wozu: "Themen für Praktika aufbereiten und ausschreiben",
    zeichen: "mappe",
    teile: [
      { weg: "praktikum", titel: "Haupt-Aufgabenstellungen", schluessel: "praktikum", art: "aufgabe" },
      { weg: "praktikum-ideen", titel: "Sonstige Ideen", schluessel: "praktikum", art: "idee" },
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
  {
    // Ein eigenes Modul und nicht Teil der Förderungen (Wunsch Bernd): Hier
    // wird die Arbeit geplant, die nach der Zusage getan wird — der Antrag
    // ist dabei der Maßstab, nicht der Ort.
    weg: "planung",
    titel: "Projektplanung",
    wozu: "Eine Phase mit Paketen, Aufgaben und Antrag im Gantt planen",
    zeichen: "gantt",
    teile: [{ weg: "planung", titel: "Phasen", schluessel: "planung" }],
  },
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
export const MODULWEGE = MODULE.flatMap((m) => m.teile.map((t) => t.weg));

/**
 * Das Thema hinter `praktikum/12` oder `praktikum-ideen/12` — oder nichts.
 *
 * Die Liste steht mit im Weg, damit „zurück" in die Liste führt, aus der man
 * kam. Welche Art das Thema wirklich hat, sagt erst der Server: Zeigt ein
 * altes Lesezeichen auf die falsche Liste, steht das Thema trotzdem da.
 */
export function themaAusWeg(unter: string | null): { modul: Modul; teil: Themenliste; id: number } | null {
  const treffer = /^([a-z-]+)\/(\d+)$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "praktikum") return null;
  return { modul: gefunden.modul, teil: gefunden.teil, id: Number(treffer[2]) };
}

/**
 * Ein Fördergeber hinter `foerderungen/2`, ein Programm darin hinter
 * `foerderungen/2/4`, ein Antrag hinter `foerderungen/2/4/12` — oder nichts.
 * Was darüber liegt, steht mit im Weg, damit „zurück" Stufe für Stufe nach
 * oben führt. Ob es alles gibt, sagt erst der Server; die Seite zeigt dann,
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

/**
 * Die Planung einer Phase hinter `planung/28` — oder nichts. Die Nummer ist
 * die der Projektphase; ob es sie gibt, sagt erst der Server.
 */
export function planungAusWeg(unter: string | null): { modul: Modul; teil: Planungsteil; phase: number } | null {
  const treffer = /^([a-z-]+)\/(\d+)$/.exec(unter ?? "");
  const gefunden = treffer && teilZuWeg(treffer[1]);
  if (!treffer || !gefunden || gefunden.teil.schluessel !== "planung") return null;
  return { modul: gefunden.modul, teil: gefunden.teil, phase: Number(treffer[2]) };
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

/** „1 Entscheidung", „3 Entscheidungen". */
export function entscheidungsZahl(zahl: number): string {
  return `${zahl} ${zahl === 1 ? "Entscheidung" : "Entscheidungen"}`;
}

/** „3 Themen", „1 Idee" — wie die Zeile auf der Übersicht und die Leiste zählen. */
export function themenZahl(zahl: number, art: Themenart): string {
  if (art === "idee") return `${zahl} ${zahl === 1 ? "Idee" : "Ideen"}`;
  return `${zahl} ${zahl === 1 ? "Thema" : "Themen"}`;
}

/** Die Liste, in der ein Thema dieser Art steht. */
export function listeFuer(art: Themenart): Themenliste {
  for (const modul of MODULE)
    for (const teil of modul.teile) if (teil.schluessel === "praktikum" && teil.art === art) return teil;
  throw new Error(`Keine Liste für ${art}`);
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

/* --- Praktikantenstellen ---------------------------------------------------- */

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
