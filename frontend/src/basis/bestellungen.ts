/**
 * Bestellungen — was sich ohne Bildschirm rechnen lässt: die Zusammenfassung
 * eines Korbs, die Reihenfolge des Sortiments, Kleinigkeiten zum Anzeigen.
 *
 * **Die Zusammenfassung ist ein Auftrag, kein Bericht.** Bei einem Onlineshop
 * geht sie an Claude, der damit in Chrome den Warenkorb füllt — deshalb steht
 * oben, was zu tun ist und dass er nicht zur Kasse geht. Bei einem Händler
 * ist sie der Text der Angebotsanfrage, den man selbst abschickt.
 */

import type { Bestellartikel, Bestellposition, Bestellweg, Korbrechnung, Lieferant } from "./daten";
import { alsEuro } from "./module";

export const BESTELLWEGE: { wert: Bestellweg; titel: string; wozu: string }[] = [
  { wert: "shop", titel: "Onlineshop", wozu: "Bambu Lab, Amazon — Artikel landen im Warenkorb" },
  { wert: "plattform", titel: "Plattform mit Anfragen", wozu: "Alibaba — manches kauft man, manches fragt man an" },
  { wert: "haendler", titel: "Direkthändler mit Angebot", wozu: "Ein Hersteller, bei dem man ein Angebot anfragt" },
];

export const bestellwegVon = (wert: Bestellweg) => BESTELLWEGE.find((w) => w.wert === wert) ?? BESTELLWEGE[0];

/** Ob ein eingetippter Text ein Link ist — sonst ist er der Name eines Artikels ohne Link. */
export function istLink(text: string): boolean {
  return /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(text.trim());
}

/** „eu.store.bambulab.com" aus dem ganzen Link — was neben einem Artikel steht. */
export function kurzerLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

/**
 * Derselbe Link, auch wenn er einmal mit und einmal ohne `www.`, mit
 * abschließendem Schrägstrich oder anderem Anker eingefügt wurde. Die Abfrage
 * bleibt: Bei Shopify steckt die Farbe in `?variant=…`.
 */
export function gleicherLink(a: string, b: string): boolean {
  const glatt = (l: string) => {
    try {
      const u = new URL(l.trim());
      return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
    } catch {
      return l.trim().toLowerCase();
    }
  };
  return a.trim() !== "" && b.trim() !== "" && glatt(a) === glatt(b);
}

/** Das Häufigste oben — wer zum fünften Mal Filament bestellt, sucht es nicht. Dann nach Name. */
export function sortiment(artikel: Bestellartikel[]): Bestellartikel[] {
  return [...artikel].sort((a, b) => b.bestellt_mal - a.bestellt_mal || a.name.localeCompare(b.name, "de"));
}

/** „12.11.2026" aus `"2026-11-12"`. */
export const tagText = (iso: string) => iso.split("-").reverse().join(".");

/** „1 Zeile", „3 Zeilen" — so viele Artikel liegen im Korb, nicht Stück. */
export const zeilenZahl = (n: number) => `${n} ${n === 1 ? "Zeile" : "Zeilen"}`;

export type Sammelzeile = { artikel: number; name: string; beschreibung: string; link: string; menge: number };

/**
 * Der Korb nach Artikel zusammengezählt, in der Reihenfolge des ersten
 * Hineinlegens. Im Korb hat jede Person ihre eigene Zeile; bestellt wird die
 * Summe.
 */
export function zusammengezaehlt(korb: Bestellposition[]): Sammelzeile[] {
  const zeilen: Sammelzeile[] = [];
  for (const p of korb) {
    const da = zeilen.find((z) => z.artikel === p.artikel);
    if (da) da.menge += p.menge;
    else zeilen.push({ artikel: p.artikel, name: p.name, beschreibung: p.beschreibung, link: p.link, menge: p.menge });
  }
  return zeilen;
}

function liste(zeilen: Sammelzeile[]): string {
  return zeilen
    .map((z, i) => {
      const kopf = `${i + 1}. ${z.menge} × ${z.name}${z.beschreibung.trim() ? ` — ${z.beschreibung.trim()}` : ""}`;
      return z.link ? `${kopf}\n   ${z.link}` : kopf;
    })
    .join("\n");
}

/** Wie der Knopf heißt, der den Text kopiert. */
export const zusammenfassungsKnopf = (art: Bestellweg) =>
  art === "haendler" ? "Anfrage kopieren" : "Zusammenfassung kopieren";

/**
 * Der Text, der in die Zwischenablage geht.
 *
 * - **Onlineshop:** der Auftrag an Claude, alles in den Warenkorb zu legen.
 * - **Plattform:** derselbe Auftrag, aber wer nur anzufragen ist, bekommt
 *   einen vorbereiteten Anfragetext — abgeschickt wird nichts.
 * - **Direkthändler:** die Mail mit der Bitte um ein Angebot.
 *
 * „Nicht zur Kasse" steht ausdrücklich da: Bestellen und bezahlen bleibt bei
 * dem, der den Text weitergibt.
 */
/**
 * Die Zeile unter dem Korb: wie viele Stück zur Staffel zählen, welcher
 * Rabatt erreicht ist und was das ungefähr macht. Leer, wenn es weder Preis
 * noch Staffel gibt.
 */
export function rechnungsText(r: Korbrechnung): string {
  const teile: string[] = [];
  if (r.prozent) teile.push(`${r.staffel_menge} Stück in der Staffel, −${r.prozent.replace(".", ",")} %`);
  if (Number(r.listensumme) > 0) {
    const statt = r.summe !== r.listensumme ? ` statt ${alsEuro(r.listensumme)}` : "";
    teile.push(`ca. ${alsEuro(r.summe)}${statt}`);
  }
  if (r.ohne_preis > 0) teile.push(`${r.ohne_preis} ${r.ohne_preis === 1 ? "Zeile" : "Zeilen"} ohne Preis`);
  return teile.join(" · ");
}

/** „Noch 2 Stück bis −35 %" — oder leer, wenn die oberste Stufe erreicht ist. */
export function naechsteStufeText(r: Korbrechnung): string {
  if (!r.naechste) return "";
  return `Noch ${r.naechste.fehlen} Stück bis −${r.naechste.prozent.replace(".", ",")} %`;
}

export function zusammenfassung(
  lieferant: Pick<Lieferant, "name" | "art" | "link">,
  korb: Bestellposition[],
  absender: string,
  heute: string,
  rechnung?: Korbrechnung,
): string {
  const zeilen = liste(zusammengezaehlt(korb));
  const stand = `aus SoCoS, Stand ${tagText(heute)}`;

  if (lieferant.art === "haendler") {
    return [
      "Betreff: Anfrage um ein Angebot",
      "",
      "Sehr geehrte Damen und Herren,",
      "",
      "wir bitten um ein Angebot für die folgenden Positionen, mit Lieferzeit und Versandkosten:",
      "",
      zeilen,
      "",
      "Mit freundlichen Grüßen",
      absender,
    ].join("\n");
  }

  const ort = lieferant.link ? [`${lieferant.art === "shop" ? "Shop" : "Plattform"}: ${lieferant.link}`] : [];
  const auftrag =
    lieferant.art === "shop"
      ? "Bitte in Chrome alle Artikel in den Warenkorb legen, jeweils in der angegebenen Menge und Variante. Nicht zur Kasse gehen — die Bestellung schicke ich selbst ab."
      : "Bitte in Chrome jeden Artikel öffnen. Was sich direkt bestellen lässt, in den Warenkorb legen, in der angegebenen Menge und Variante. Wo der Anbieter erst ein Angebot macht, einen Anfragetext mit Menge vorbereiten, aber nicht absenden. Nicht zur Kasse gehen.";

  // Was SoCoS erwartet, damit im Warenkorb auffällt, wenn der Mengenrabatt
  // nicht greift — der Shop rechnet ihn selbst, und nicht immer gleich.
  const erwartet = rechnung && rechnungsText(rechnung);
  return [
    `Sammelbestellung ${lieferant.art === "shop" ? "bei" : "über"} ${lieferant.name} — ${stand}`,
    "",
    auftrag,
    ...ort,
    "",
    zeilen,
    ...(erwartet ? ["", `Erwartet laut SoCoS: ${erwartet}. Bitte im Warenkorb vergleichen.`] : []),
  ].join("\n");
}
