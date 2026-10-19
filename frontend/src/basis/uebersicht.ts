/**
 * Die Übersicht: die Bausteine, aus denen sie jeder selbst zusammenstellt.
 *
 * **Ein** Katalog, aus dem die Seite und die Liste „Dazunehmen" leben. Die
 * Schlüssel stehen ein zweites Mal am Server (`socos/services/uebersicht.py`),
 * dort nur für das Speichern und den Vorschlag aus der Nutzung. Kennt diese
 * Liste einen Schlüssel vom Server nicht, fällt er hier still heraus.
 *
 * Hier steht nur, was sich ohne Bildschirm rechnen lässt: welche Bausteine es
 * gibt, und wie eine Anordnung sich ändert. Die Bausteine selbst stehen in
 * `ansichten/UebersichtBausteine.tsx`.
 */

export type Bausteinname =
  | "aufgaben"
  | "thoughts"
  | "ball"
  | "termine"
  | "foerderungen"
  | "projekte"
  | "zeit"
  | "geld"
  | "team"
  | "aktivitaet";

export type Platz = { baustein: Bausteinname; breit: boolean };

export type Anordnung = { bausteine: Platz[]; eigen: boolean };

/** In der Reihenfolge, in der „Dazunehmen" sie anbietet. */
export const KATALOG: { name: Bausteinname; titel: string; wozu: string }[] = [
  { name: "aufgaben", titel: "Meine Aufgaben", wozu: "Was dir zugeteilt ist, das Dringende zuerst" },
  { name: "ball", titel: "Wir sind am Zug", wozu: "Kontakte, denen wir etwas schulden" },
  { name: "termine", titel: "Nächste Termine", wozu: "Meetings und Events ab heute" },
  { name: "thoughts", titel: "Thoughts", wozu: "Was frei ist und worauf gewartet wird" },
  { name: "foerderungen", titel: "Anträge", wozu: "Förderanträge in Arbeit und eingereicht" },
  { name: "projekte", titel: "Projekte", wozu: "Die Phasen im Gantt" },
  { name: "zeit", titel: "Zeit buchen", wozu: "Die Uhr starten, zuletzt Gebuchtes mit einem Klick" },
  { name: "team", titel: "Team", wozu: "Wer eingestempelt ist, Stunden diese Woche" },
  { name: "geld", titel: "Geld", wozu: "Kontostand, Kosten, Runway" },
  { name: "aktivitaet", titel: "Zuletzt passiert", wozu: "Was die anderen angelegt und geändert haben" },
];

const BEKANNT = new Set<string>(KATALOG.map((k) => k.name));

export function titelVon(name: Bausteinname): string {
  return KATALOG.find((k) => k.name === name)?.titel ?? name;
}

/** Nur, was diese Fassung kennt — jeder Baustein höchstens einmal. */
export function bekannte(plaetze: Platz[]): Platz[] {
  const gesehen = new Set<string>();
  return plaetze.filter((p) => {
    if (!BEKANNT.has(p.baustein) || gesehen.has(p.baustein)) return false;
    gesehen.add(p.baustein);
    return true;
  });
}

/** Was noch nicht auf der Übersicht steht, in der Reihenfolge des Katalogs. */
export function fehlende(plaetze: Platz[]): Bausteinname[] {
  const da = new Set(plaetze.map((p) => p.baustein));
  return KATALOG.map((k) => k.name).filter((n) => !da.has(n));
}

/**
 * Ein Baustein von `von` an die Stelle `nach`. Was dort stand, rückt nach —
 * nach unten, wenn er von oben kommt, sonst nach oben. So landet er beim
 * Ziehen genau dort, wo man ihn loslässt.
 */
export function verschieben(plaetze: Platz[], von: number, nach: number): Platz[] {
  if (von === nach || von < 0 || von >= plaetze.length) return plaetze;
  const ziel = Math.max(0, Math.min(nach, plaetze.length - 1));
  const neu = [...plaetze];
  const [platz] = neu.splice(von, 1);
  neu.splice(ziel, 0, platz);
  return neu;
}

export function entfernen(plaetze: Platz[], name: Bausteinname): Platz[] {
  return plaetze.filter((p) => p.baustein !== name);
}

/** Dazugenommenes kommt nach oben — dort, wo man es gleich sieht. */
export function dazunehmen(plaetze: Platz[], name: Bausteinname): Platz[] {
  if (plaetze.some((p) => p.baustein === name)) return plaetze;
  return [{ baustein: name, breit: false }, ...plaetze];
}

export function breiteUmschalten(plaetze: Platz[], name: Bausteinname): Platz[] {
  return plaetze.map((p) => (p.baustein === name ? { ...p, breit: !p.breit } : p));
}
