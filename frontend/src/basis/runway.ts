/**
 * Die Runway-Planung im Frontend: Monate benennen, die Lage in einen Satz
 * fassen, die Achse der Linie wählen.
 *
 * **Gerechnet wird am Server** (`socos/services/runway.py`). Hier wird nichts
 * summiert, was der Server schon summiert hat — nur abgelesen und gezeichnet.
 * Was hier steht, rechnet trotzdem ein wenig (Monatsabstände, Achsenschritte)
 * und wird deshalb getestet.
 */

import type { Planposten, Postenart, Rhythmus, Runwayplan, Runwayrechnung, Szenario } from "./daten";

export const SZENARIEN: { wert: Szenario; text: string; im: string }[] = [
  { wert: "konservativ", text: "Konservativ", im: "konservativen Szenario" },
  { wert: "basis", text: "Basis", im: "Basis-Szenario" },
  { wert: "optimistisch", text: "Optimistisch", im: "optimistischen Szenario" },
];

export const RHYTHMEN: { wert: Rhythmus; text: string }[] = [
  { wert: "einmalig", text: "einmalig" },
  { wert: "monatlich", text: "monatlich" },
  { wert: "quartal", text: "quartalsweise" },
  { wert: "jaehrlich", text: "jährlich" },
];

/**
 * Die Register der Seite, in ihrer Reihenfolge. Wie die Felder je Art heißen,
 * steht hier einmal — Tabellenkopf, Kartenbeschriftung am Handy und das
 * Anlegen lesen dieselbe Liste.
 */
export const ARTEN: {
  art: Postenart;
  titel: string;
  einzahl: string;
  /** Wie `von` und `bis` bei dieser Art heißen. */
  von: string;
  bis: string | null;
  gruppe: string | null;
  neu: string;
  /** Womit ein neuer Posten anfängt. */
  rhythmus: Rhythmus;
}[] = [
  { art: "foerderung", titel: "Förderungen", einzahl: "Tranche", von: "Zahlung", bis: null, gruppe: "Fördergeber", neu: "Förderung, z. B. aws Preseed", rhythmus: "einmalig" },
  { art: "umsatz", titel: "Umsätze", einzahl: "Umsatz", von: "Ab / am", bis: "Bis", gruppe: null, neu: "Umsatz, z. B. Pilotkunde", rhythmus: "einmalig" },
  { art: "person", titel: "Team", einzahl: "Person", von: "Eintritt", bis: "Austritt", gruppe: "Rolle", neu: "Name oder Stelle", rhythmus: "monatlich" },
  { art: "kosten", titel: "Kosten", einzahl: "Kostenposition", von: "Ab / am", bis: "Bis", gruppe: "Kategorie", neu: "Kosten, z. B. Büromiete", rhythmus: "monatlich" },
  { art: "darlehen", titel: "Darlehen", einzahl: "Darlehen", von: "Auszahlung", bis: "Rückzahlung", gruppe: null, neu: "Gesellschafter:in", rhythmus: "einmalig" },
];

export const artInfo = (art: Postenart) => ARTEN.find((a) => a.art === art)!;

const MONAT_LANG = new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" });
const MONAT_KURZ = new Intl.DateTimeFormat("de-AT", { month: "short" });
const TAG = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

/** „2027-01" → ein Datum am Ersten, ohne Zeitzone dazwischen. */
const alsDatum = (monat: string) => new Date(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)) - 1, 1);

/** „2027-01" → „Jänner 2027". */
export const monatLang = (monat: string) => MONAT_LANG.format(alsDatum(monat));

/** „2027-01" → „Jän 27". Am Handy und unter der Linie zählt jeder Buchstabe. */
export const monatKurz = (monat: string) =>
  `${MONAT_KURZ.format(alsDatum(monat)).replace(".", "")} ${monat.slice(2, 4)}`;

/** „2026-10-01" → „01.10.2026". */
export const tagText = (tag: string) => TAG.format(new Date(`${tag}T00:00:00`));

/** Wie viele Monate von `a` bis `b`, beide „JJJJ-MM". */
export function monatsabstand(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

/** Der letzte Tag des Monats von `tag` — für „zum Monatsende beenden". */
export function monatsende(tag: string): string {
  const d = new Date(Number(tag.slice(0, 4)), Number(tag.slice(5, 7)), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const GANZ = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 });

/**
 * Ganze Euro. Ein Plan über zwei Jahre hat keine Cent-Genauigkeit, und eine
 * Zahl mit Cent täte so, als hätte er sie. Das Minus ist ein echtes Minus
 * (U+2212) — ein Bindestrich vor einer Zahl ist in Plex Mono kaum zu sehen.
 * Vor dem € steht ein geschütztes Leerzeichen: Im Lagesatz brach sonst das
 * Zeichen allein in die nächste Zeile.
 */
export const euro = (betrag: string | number) => `${GANZ.format(Math.round(Number(betrag))).replace("-", "−")}\u00a0€`;

/** Für die Achse: „60k", „−20k", „0". Ein ganzer Betrag mit € stünde dort viermal zu breit. */
export const euroKurz = (betrag: number) =>
  Math.abs(betrag) >= 1000
    ? `${(betrag / 1000).toLocaleString("de-AT", { maximumFractionDigits: 1 }).replace("-", "−")}k`
    : GANZ.format(betrag).replace("-", "−");

/** Mit Vorzeichen, für Ereignisse: „+49.260 €", „−2.500 €". */
export const euroMitVorzeichen = (betrag: string | number) => (Number(betrag) > 0 ? `+${euro(betrag)}` : euro(betrag));

export type Lage = { art: "luecke" | "puffer" | "gut"; titel: string; satz: string };

/**
 * Die Lage in einem Satz — dieselben drei Fälle wie im Planer vor dem Modul:
 * Minus, unter dem Puffer, durchfinanziert. Die Zahlen kommen aus der
 * Rechnung; hier wird nur gewählt, welcher Satz zutrifft.
 */
export function lage(rechnung: Runwayrechnung, plan: Runwayplan): Lage {
  const k = rechnung.kennzahlen;
  const im = SZENARIEN.find((s) => s.wert === rechnung.szenario)!.im;
  const puffer = euro(plan.puffer);
  const abruf = rechnung.abrufe[0];
  const fehlen = Number(k.ueberbrueckung) > 0 && abruf
    ? ` Um den Mindestpuffer von ${puffer} zu halten, fehlen ${euro(k.ueberbrueckung)}, erstmals im ${monatLang(abruf.monat)}.`
    : "";
  if (k.minus_ab)
    return { art: "luecke", titel: "Liquiditätslücke", satz: `Im ${im} ist das Konto ab ${monatLang(k.minus_ab)} im Minus.${fehlen}` };
  if (k.unter_puffer_ab)
    return {
      art: "puffer",
      titel: "Unter dem Puffer",
      satz: `Im ${im} bleibt das Konto im Plus, unterschreitet aber ab ${monatLang(k.unter_puffer_ab)} den Mindestpuffer von ${puffer}.${fehlen}`,
    };
  const ende = rechnung.monate[rechnung.monate.length - 1].monat;
  const dank = k.ohne_darlehen_minus_ab
    ? ` Das trägt das Gesellschafterdarlehen — ohne es wäre das Konto ab ${monatLang(k.ohne_darlehen_minus_ab)} im Minus.`
    : "";
  return { art: "gut", titel: "Durchfinanziert", satz: `Im ${im} bleibt der Kontostand bis ${monatLang(ende)} über dem Mindestpuffer von ${puffer}.${dank}` };
}

/**
 * Wie lange das Geld reicht, ab dem laufenden Monat: „3 Mon." bis zum ersten
 * Minus — oder mehr als der Rest des Plans.
 */
export function runwayText(rechnung: Runwayrechnung): { wert: string; hinweis: string } {
  const k = rechnung.kennzahlen;
  const ab = k.burn_ab;
  const letzter = rechnung.monate[rechnung.monate.length - 1].monat;
  if (k.minus_ab) {
    const n = Math.max(0, monatsabstand(ab, k.minus_ab));
    return { wert: `${n} Mon.`, hinweis: `Minus ab ${monatLang(k.minus_ab)}` };
  }
  return { wert: `> ${monatsabstand(ab, letzter) + 1} Mon.`, hinweis: `gedeckt bis ${monatLang(letzter)}` };
}

/**
 * Die Werteachse der Linie: von einem runden Wert unter dem tiefsten bis zu
 * einem runden über dem höchsten Stand, die Null und der Puffer immer
 * drinnen — sonst fiele die Linie, um die es geht, aus dem Bild.
 */
export function achse(werte: number[], puffer: number): { unten: number; oben: number; schritt: number } {
  const tief = Math.min(0, puffer, ...werte);
  // Ein Plan, in dem alles null ist, hätte sonst eine Achse ohne Höhe.
  const hoch = Math.max(0, puffer, ...werte, tief + 1000);
  const roh = (hoch - tief) / 4;
  const zehner = 10 ** Math.floor(Math.log10(roh));
  const schritt = ([1, 2, 2.5, 5, 10].find((f) => f * zehner >= roh) ?? 10) * zehner;
  return { unten: Math.floor(tief / schritt) * schritt, oben: Math.ceil(hoch / schritt) * schritt, schritt };
}

/**
 * Die Posten einer Art in der Reihenfolge, in der sie dastehen: Förderungen
 * nach Name und Zahlung (die Tranchen einer Förderung stehen beisammen), alles
 * andere nach Beginn.
 */
export function sortiert(posten: Planposten[], art: Postenart): Planposten[] {
  const hier = posten.filter((p) => p.art === art);
  return art === "foerderung"
    ? hier.sort((a, b) => a.name.localeCompare(b.name, "de") || a.von.localeCompare(b.von) || a.id - b.id)
    : hier.sort((a, b) => a.von.localeCompare(b.von) || a.id - b.id);
}

/** Was es für das Feld „Fördergeber" oder „Kategorie" schon gibt — für die Vorschlagsliste. */
export function vorschlaege(posten: Planposten[], art: Postenart, feld: "name" | "gruppe"): string[] {
  return [...new Set(posten.filter((p) => p.art === art).map((p) => p[feld].trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
}
