/**
 * Module · Projektplanung: was die Seite aus den Daten der Planung macht —
 * Reihenfolge, Texte, Eingaben. Gerechnet (Soll, Lage, was als Nächstes
 * ansteht) wird am Server, in socos/services/planung.py.
 */

import type { Aufgabenlage, Planungsaufgabe, Planungspaket } from "./daten";
import { kurzdatum } from "./gantt";

/** „12.50" → „12,5 h", „300.00" → „300 h". Mit `stellen = 0` ganze Stunden — für die großen Zahlen oben. */
export function alsH(stunden: string | null, stellen = 2): string {
  if (stunden === null) return "—";
  return `${Number(stunden).toLocaleString("de-AT", { maximumFractionDigits: stellen })} h`;
}

/**
 * „7,5" oder „7.5" → "7.50" für die API; leer → null. `undefined`, wenn es
 * keine Zahl ist — dann sagt das Feld das, statt still etwas anderes zu
 * speichern.
 */
export function stundenAusEingabe(text: string): string | null | undefined {
  const roh = text.replace(/h$/i, "").trim().replace(",", ".");
  if (!roh) return null;
  const zahl = Number(roh);
  if (!Number.isFinite(zahl) || zahl < 0) return undefined;
  return zahl.toFixed(2);
}

/**
 * Die Aufgaben eines Pakets, wie sie im Gantt untereinander stehen: nach
 * Beginn, ohne Termin am Ende. Nach dem Plan und nicht nach der Reihenfolge
 * des Anlegens — ein Gantt, dessen Balken kreuz und quer liegen, liest
 * niemand. Bei gleichem Beginn entscheidet die Reihenfolge, dann die Kennung.
 */
export function aufgabenImPlan(aufgaben: Planungsaufgabe[]): Planungsaufgabe[] {
  return [...aufgaben].sort(
    (a, b) =>
      (a.von ?? "9999").localeCompare(b.von ?? "9999") || a.reihenfolge - b.reihenfolge || a.id - b.id,
  );
}

/** Wie die Lage einer Aufgabe neben ihr steht. */
export function lageText(aufgabe: Pick<Planungsaufgabe, "lage" | "von" | "bis">): string {
  const texte: Record<Aufgabenlage, () => string> = {
    erledigt: () => "erledigt",
    ohne_termin: () => "ohne Termin",
    ueberfaellig: () => `überfällig seit ${kurzdatum(aufgabe.bis!)}`,
    laeuft: () => `läuft bis ${kurzdatum(aufgabe.bis!)}`,
    steht_an: () => `ab ${kurzdatum(aufgabe.von!)}`,
  };
  return texte[aufgabe.lage]();
}

/**
 * Welche Pakete beim Öffnen aufgeklappt sind: die, an denen jetzt gearbeitet
 * wird — eine Aufgabe läuft oder ist überfällig, oder heute liegt im Zeitraum
 * des Antrags. Ist es keines, das erste: Eine Seite, auf der alles zu ist,
 * sieht leer aus.
 */
export function startOffen(
  pakete: Planungspaket[],
  antragszeit: Map<number, { von: string | null; bis: string | null }>,
  heute: string,
): Set<number> {
  const offen = pakete.filter((p) => {
    if (p.aufgaben.some((a) => a.lage === "laeuft" || a.lage === "ueberfaellig")) return true;
    const zeit = p.foerderpaket === null ? undefined : antragszeit.get(p.foerderpaket);
    return !!zeit?.von && !!zeit.bis && zeit.von <= heute && heute <= zeit.bis;
  });
  return new Set((offen.length ? offen : pakete.slice(0, 1)).map((p) => p.id));
}

/**
 * Gebucht gegen Soll bis heute, als Satz: „12 h über Plan", „30 h unter
 * Plan", „im Plan". Nicht „voraus" oder „zurück": Mehr gebuchte Stunden heißt
 * nicht, dass die Arbeit weiter ist. Eine Stunde Spiel ist „im Plan" — sonst
 * stünde nach jedem Clock-out ein anderes Wort da.
 */
export function standGegenPlan(gebucht: string, sollBisHeute: string | null): string | null {
  if (sollBisHeute === null) return null;
  const abstand = Number(gebucht) - Number(sollBisHeute);
  if (Math.abs(abstand) < 1) return "im Plan";
  const h = Math.round(Math.abs(abstand)).toLocaleString("de-AT");
  return abstand > 0 ? `${h} h über Plan` : `${h} h unter Plan`;
}
