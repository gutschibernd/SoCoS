/**
 * Module — zusätzliche Werkzeuge unter „Intern · Module".
 *
 * **Eine** Liste, aus der die Leiste und die Übersichtsseite leben. Stünde sie
 * zweimal da, hätte ein neues Modul in der Leiste schon einen Eintrag und auf
 * der Übersicht noch keine Kachel, und niemand sähe warum.
 */

import { tageBis } from "./aufgaben";
import type { Abschnittstand, Canvaspunkt, Persona, Vorhaben, Workshopschluessel } from "./daten";
import type { ZeichenName } from "../bausteine/Zeichen";

/** Ein Workshop in einem Modul — ein Teil mit eigenem Weg und eigenen Feldern. */
export type Workshop = {
  /** Der Weg hinter `/module/` — der erste Teil eines Moduls trägt dessen Weg. */
  weg: string;
  titel: string;
  /** Wie die Schnittstelle ihn nennt (`/api/vorhaben/felder/?workshop=…`). */
  schluessel: Workshopschluessel;
  /** Was er zählt: „9 Felder", „8 Abschnitte", „1 Satz". */
  einheit: string;
};

/**
 * Ein Teil, der kein Workshop ist: eine Liste von Themen, die man selbst
 * anlegt — die Haupt-Aufgabenstellungen der Praktikantenstellen. Er hat keine
 * Felder vom Server und zählt nichts gegen eine feste Zahl.
 */
export type Themenliste = { weg: string; titel: string; schluessel: "praktikum" };

export type Teil = Workshop | Themenliste;

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
    weg: "spg",
    titel: "SPG Academy",
    wozu: "Workshop-Aufgaben ausarbeiten",
    zeichen: "akademie",
    teile: [
      { weg: "spg", titel: "Lean Model Canvas", schluessel: "canvas", einheit: "Felder" },
      { weg: "spg-businessplan", titel: "Business Plan Lite", schluessel: "businessplan", einheit: "Abschnitte" },
      { weg: "spg-vision", titel: "Vision Statement", schluessel: "vision", einheit: "Satz" },
    ],
  },
  {
    weg: "praktikum",
    titel: "Praktikantenstellen",
    wozu: "Themen für Praktika aufbereiten und ausschreiben",
    zeichen: "mappe",
    teile: [{ weg: "praktikum", titel: "Haupt-Aufgabenstellungen", schluessel: "praktikum" }],
  },
];

/** Alle Wege, die hinter `/module/` stehen dürfen — der Router fragt hier. */
export const MODULWEGE = MODULE.flatMap((m) => m.teile.map((t) => t.weg));

/** Das Modul und der Teil zu einem Weg — oder nichts. */
export function teilZuWeg(unter: string | null): { modul: Modul; teil: Teil } | null {
  for (const modul of MODULE) {
    const teil = modul.teile.find((t) => t.weg === unter);
    if (teil) return { modul, teil };
  }
  return null;
}

/* --- Die Leinwand --------------------------------------------------------- */

/** Die Punkte eines Feldes in ihrer Reihenfolge. */
export function punkteIn(vorhaben: Vorhaben, feld: string): Canvaspunkt[] {
  return vorhaben.punkte
    .filter((p) => p.feld === feld)
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);
}

/**
 * Wie viele der genannten Felder mindestens einen Punkt haben. Die Felder
 * werden mitgegeben, weil an einem Vorhaben die Punkte **aller** Workshops
 * hängen — ohne sie zählte das Canvas die Abschnitte des Businessplans mit.
 */
export function ausgefuellt(vorhaben: Vorhaben, felder: string[]): number {
  const belegt = new Set(vorhaben.punkte.map((p) => p.feld));
  return felder.filter((f) => belegt.has(f)).length;
}

/* --- Business Plan Lite ---------------------------------------------------- */

/**
 * Die drei Abgaben des Business Plan Lite, wie die SPG Academy sie setzt.
 *
 * Sie stehen außerdem als Aufgaben mit Frist auf der Tafel (Migration 0025) —
 * dort werden sie abgehakt. **Hier** steht nur der Fahrplan: Verschiebt die
 * Academy eine Abgabe, wird sie hier und auf der Tafel geändert.
 */
export const PLANVERSIONEN: { titel: string; frist: string }[] = [
  { titel: "Version 1", frist: "2026-10-12" },
  { titel: "Version 2", frist: "2026-10-27" },
  { titel: "Finale Abgabe", frist: "2026-11-19" },
];

export type Abgabe = {
  titel: string;
  frist: string;
  tage: number;
  /** Vorbei, die nächste, die jetzt ansteht, oder eine danach. */
  lage: "vorbei" | "naechste" | "spaeter";
};

/** Die Abgaben mit ihrem Abstand zu heute. Die erste, die nicht vorbei ist, ist die nächste. */
export function abgaben(heute = new Date()): Abgabe[] {
  let naechsteVergeben = false;
  return PLANVERSIONEN.map((v) => {
    const tage = tageBis(v.frist, heute);
    let lage: Abgabe["lage"] = "vorbei";
    if (tage >= 0) {
      lage = naechsteVergeben ? "spaeter" : "naechste";
      naechsteVergeben = true;
    }
    return { ...v, tage, lage };
  });
}

/** Die Reihenfolge ist der Weg, den ein Abschnitt geht — und die Reihenfolge des Weiterdrehens. */
export const STAENDE: { wert: Abschnittstand; text: string }[] = [
  { wert: "offen", text: "offen" },
  { wert: "entwurf", text: "Entwurf" },
  { wert: "fertig", text: "fertig" },
];

/** Der Stand eines Abschnitts — was nie gesetzt wurde, ist offen. */
export function standVon(vorhaben: Vorhaben, abschnitt: string): Abschnittstand {
  return vorhaben.planstand[abschnitt] ?? "offen";
}

/** Ein Tipp dreht weiter: offen → Entwurf → fertig → offen. */
export function naechsterStand(jetzt: Abschnittstand): Abschnittstand {
  const i = STAENDE.findIndex((s) => s.wert === jetzt);
  return STAENDE[(i + 1) % STAENDE.length].wert;
}

/** Wie viele der genannten Abschnitte fertig sind. */
export function fertigeAbschnitte(vorhaben: Vorhaben, abschnitte: string[]): number {
  return abschnitte.filter((a) => standVon(vorhaben, a) === "fertig").length;
}

/* --- Vision Statement ------------------------------------------------------ */

/**
 * Der Satz in Stücke zerlegt: `**…**` markiert eine Stelle fett, wie man es
 * aus Chat und Markdown kennt. Welche Stellen es sind, entscheidet, wer den
 * Satz schreibt — deshalb stehen sie im Text und nicht in einem Feld daneben.
 *
 * Ein `**` ohne Gegenstück bleibt als Zeichen stehen, statt den Rest des
 * Satzes fett zu machen: Ein vergessener Stern soll auffallen, nicht den
 * halben Satz verschlucken.
 */
export function fettStellen(text: string): { text: string; fett: boolean }[] {
  const stuecke: { text: string; fett: boolean }[] = [];
  const muster = /\*\*(.+?)\*\*/g;
  let ab = 0;
  for (const treffer of text.matchAll(muster)) {
    if (treffer.index > ab) stuecke.push({ text: text.slice(ab, treffer.index), fett: false });
    stuecke.push({ text: treffer[1], fett: true });
    ab = treffer.index + treffer[0].length;
  }
  if (ab < text.length) stuecke.push({ text: text.slice(ab), fett: false });
  return stuecke;
}

/* --- Ein Feld bearbeiten -------------------------------------------------- */

/**
 * Ein Punkt, während er bearbeitet wird. `id: null` heißt: neu, noch nicht
 * gespeichert. `schluessel` hält React die Zeile fest, auch wenn sich darüber
 * eine neue einschiebt — die `id` taugt dafür nicht, neue haben noch keine.
 */
export type Punktentwurf = { schluessel: string; id: number | null; text: string };

let naechsterSchluessel = 0;
export const neuerSchluessel = () => `neu-${++naechsterSchluessel}`;

export function alsEntwuerfe(punkte: Canvaspunkt[]): Punktentwurf[] {
  const entwuerfe = punkte.map((p) => ({ schluessel: `p-${p.id}`, id: p.id, text: p.text }));
  // Ein leeres Feld beginnt mit einer leeren Zeile — sonst müsste man vor dem
  // ersten Wort erst einen Knopf suchen.
  return entwuerfe.length ? entwuerfe : [{ schluessel: neuerSchluessel(), id: null, text: "" }];
}

/**
 * Ob sich gegenüber dem Gespeicherten etwas geändert hat — **mit denselben
 * Regeln wie der Server**: Leere Zeilen zählen nicht, Leerzeichen am Rand auch
 * nicht. Sonst fragte das Fenster beim Schließen nach etwas, das beim
 * Speichern ohnehin verworfen würde.
 */
export function istGeaendert(punkte: Canvaspunkt[], entwuerfe: Punktentwurf[]): boolean {
  const echte = entwuerfe.filter((e) => e.text.trim());
  if (echte.length !== punkte.length) return true;
  return echte.some((e, i) => e.id !== punkte[i].id || e.text.trim() !== punkte[i].text);
}

/** Was an den Server geht: die Liste in ihrer Reihenfolge, ohne leere Zeilen. */
export function zumSenden(entwuerfe: Punktentwurf[]): { id?: number; text: string }[] {
  return entwuerfe
    .filter((e) => e.text.trim())
    .map((e) => (e.id === null ? { text: e.text.trim() } : { id: e.id, text: e.text.trim() }));
}

/**
 * „heute 10:42", „gestern 16:05", sonst das Datum. Die Uhrzeit nur, solange sie
 * noch etwas sagt — „am 3. März um 10:42" fragt niemand.
 */
export function zuletztText(iso: string, jetzt = new Date()): string {
  const d = new Date(iso);
  const tag = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const gestern = new Date(jetzt);
  gestern.setDate(jetzt.getDate() - 1);
  const uhr = d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  if (tag(d) === tag(jetzt)) return `heute ${uhr}`;
  if (tag(d) === tag(gestern)) return `gestern ${uhr}`;
  return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* --- Personas -------------------------------------------------------------- */

export const ROLLEN: { wert: Persona["rolle"]; text: string }[] = [
  { wert: "nutzer", text: "Nutzer" },
  { wert: "kunde", text: "Kunde" },
  { wert: "beides", text: "Nutzer und Kunde" },
];

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

/** „78 · Pensionistin · Graz" — so viel, wie davon eingetragen ist. */
export function personaKurz(p: Persona): string {
  return [p.alter !== null ? `${p.alter} Jahre` : "", p.beruf, p.wohnort].filter(Boolean).join(" · ");
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
