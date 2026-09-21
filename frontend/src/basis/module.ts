/**
 * Module — zusätzliche Werkzeuge unter „Intern · Module".
 *
 * **Eine** Liste, aus der die Leiste und die Übersichtsseite leben. Stünde sie
 * zweimal da, hätte ein neues Modul in der Leiste schon einen Eintrag und auf
 * der Übersicht noch keine Kachel, und niemand sähe warum.
 */

import type { Canvaspunkt, Vorhaben } from "./daten";
import type { ZeichenName } from "../bausteine/Zeichen";

/** Ein Workshop in einem Modul — ein Teil mit eigenem Weg und eigenen Feldern. */
export type Workshop = {
  /** Der Weg hinter `/module/` — der erste Teil eines Moduls trägt dessen Weg. */
  weg: string;
  titel: string;
  /** Wie die Schnittstelle ihn nennt (`/api/vorhaben/felder/?workshop=…`). */
  schluessel: "canvas" | "businessplan";
  /** Was er zählt: „9 Felder", „8 Abschnitte". */
  einheit: string;
};

export type Modul = {
  /** Der Weg hinter `/module/`, und der Anfang der Wege seiner Teile. */
  weg: string;
  titel: string;
  wozu: string;
  zeichen: ZeichenName;
  /** Die Workshops darin, in ihrer Reihenfolge. */
  teile: Workshop[];
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
    ],
  },
];

/** Alle Wege, die hinter `/module/` stehen dürfen — der Router fragt hier. */
export const MODULWEGE = MODULE.flatMap((m) => m.teile.map((t) => t.weg));

/** Das Modul und der Workshop zu einem Weg — oder nichts. */
export function workshopZuWeg(unter: string | null): { modul: Modul; teil: Workshop } | null {
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
