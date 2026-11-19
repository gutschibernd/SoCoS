/**
 * Praktikanten · Meine Aufgaben: die Stränge eines Praktikanten.
 *
 * **Ein Strang ist ein Pensum mit `strang`** — eine Person auf einem
 * Arbeitspaket, als Haupt- oder Nebenstrang (siehe `Pensum` in
 * socos/models.py). Das Ziel ist die Beschreibung des Pakets, die To-Dos
 * sind seine Unteraufgaben, gebucht wird aufs Paket wie überall.
 *
 * **Wer Praktikant ist, wird hier gerechnet**: wer mindestens einen Strang
 * hat. Kein Schalter am Konto, keine Rolle im Frontend.
 *
 * Alles hier lebt aus `/api/projekte/` — dieselbe Abfrage, aus der die
 * Projektseite zeichnet. Eine eigene Schnittstelle für Stränge wäre die
 * zweite Sicht auf dieselben Pakete.
 */

import type { Paket, Pensum, Projekt, Projektphase, Teammitglied, Unteraufgabe } from "./daten";

export type Strangart = "haupt" | "neben";

export type Strang = {
  art: Strangart;
  pensum: Pensum;
  paket: Paket;
  phase: Projektphase;
  projekt: Projekt;
  /**
   * Die To-Dos, die diese Person angehen: die ihr zugeteilten und die, die
   * niemandem gehören. Ein Paket, das zwei Praktikanten teilen, zeigt jedem
   * seine eigenen und die gemeinsamen — nicht die des anderen.
   */
  todos: Unteraufgabe[];
};

export type Praktikant = {
  id: number;
  name: string;
  initialen: string;
  farbe: string;
  straenge: Strang[];
};

/** Die Stränge einer Person: der Hauptstrang zuerst, dann in der Ordnung des Projektbaums. */
export function straengeVon(projekte: Projekt[], person: number): Strang[] {
  const haupt: Strang[] = [];
  const neben: Strang[] = [];
  for (const projekt of projekte)
    for (const phase of projekt.phasen)
      for (const paket of phase.pakete)
        for (const pensum of paket.pensen) {
          if (pensum.person !== person || (pensum.strang !== "haupt" && pensum.strang !== "neben")) continue;
          const todos = paket.unteraufgaben
            .filter((u) => u.verantwortlich === null || u.verantwortlich === person)
            .sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);
          const strang = { art: pensum.strang, pensum, paket, phase, projekt, todos };
          (pensum.strang === "haupt" ? haupt : neben).push(strang);
        }
  return [...haupt, ...neben];
}

/** Alle, die mindestens einen Strang haben, nach Namen. */
export function praktikanten(projekte: Projekt[], team: Teammitglied[]): Praktikant[] {
  return team
    .map((n) => ({ id: n.id, name: n.name, initialen: n.initialen, farbe: n.farbe, straenge: straengeVon(projekte, n.id) }))
    .filter((p) => p.straenge.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Wie viele To-Dos erledigt sind und wie viele es gibt. */
export function todoStand(strang: Strang): { erledigt: number; gesamt: number } {
  return { erledigt: strang.todos.filter((t) => t.erledigt).length, gesamt: strang.todos.length };
}

/** Gebucht gegen das Pensum dieser Person: „12 von 300 h", ohne Pensum nur „12 h". */
export function stundenText(strang: Strang): string {
  const gebucht = Math.round(strang.pensum.gebuchte_sekunden / 3600);
  const soll = Number(strang.pensum.stunden);
  return soll > 0 ? `${gebucht} von ${zahl(soll)} h` : `${gebucht} h`;
}

/** Gebucht gegen Pensum, 0 bis 1 — null, wenn es kein Pensum gibt. Über 1 wird gekappt: Die Leiste ist voll. */
export function stundenAnteil(strang: Strang): number | null {
  const soll = Number(strang.pensum.stunden);
  if (!(soll > 0)) return null;
  return Math.min(1, strang.pensum.gebuchte_sekunden / 3600 / soll);
}

const zahl = (n: number) => n.toLocaleString("de-AT", { maximumFractionDigits: 2 });

/**
 * „300" oder „12,5" → "300.00" / "12.50" für die API; leer → "0". `null`,
 * wenn es keine Zahl ist — dann sagt das Feld das, statt still etwas anderes
 * zu speichern.
 */
export function stundenAusEingabe(text: string): string | null {
  const roh = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!roh) return "0.00";
  if (!/^\d+(\.\d{1,2})?$/.test(roh)) return null;
  return Number(roh).toFixed(2);
}

/** "300.00" → „300", "12.50" → „12,5" — so, wie es im Feld steht. */
export function stundenZumBearbeiten(stunden: string): string {
  const n = Number(stunden);
  return n === 0 ? "" : zahl(n).replace(/\s/g, "");
}

/** Die Phasen, in denen ein neues Paket entstehen darf: alle, die nicht abgeschlossen sind. */
export function offenePhasen(projekte: Projekt[]): { id: number; titel: string }[] {
  return projekte.flatMap((p) =>
    p.phasen.filter((ph) => ph.stand !== "abgeschlossen").map((ph) => ({ id: ph.id, titel: `${p.titel} · ${ph.titel}` })),
  );
}
