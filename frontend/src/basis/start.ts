/**
 * Was die Startseite rechnet — an einer Stelle, damit es prüfbar ist.
 *
 * Die Seite selbst zeigt nur Kacheln. Das Einzige, was sie ableitet, sind die
 * zuletzt bebuchten Pakete für den Ein-Klick-Start der Uhr.
 */

import type { Projekt } from "./daten";

/*
 * **Ob ein Paket Zeit annimmt, entscheidet der Server** und schickt es als
 * `paket.buchbar` mit; steht es auf `false`, sagt `grund_gegen_buchung`
 * warum. Hier stand bis 2026-09-18 eine eigene Liste erlaubter Stände —
 * eine zweite Wahrheit neben der des Servers, und die stille Sorte: Der
 * Server hätte eine Buchung auf ein fertiges Paket angenommen, die Liste
 * hier hat sie nur nicht angeboten.
 *
 * Seit die Regel serverseitig gilt (`Arbeitspaket.grund_gegen_buchung`),
 * wird sie hier gelesen und nicht nachgebaut. Sonst wäre beim nächsten
 * Grund — eine abgeschlossene Projektphase war der erste — eine der beiden
 * Stellen wieder falsch, und zwar die, die niemand ansieht.
 */

export type Buchungsziel = { id: number; titel: string; projekt: string };

/** Alle Pakete, auf die gebucht werden darf — nach Paketnummer greifbar. */
export function buchbarePakete(projekte: Projekt[]): Map<number, Buchungsziel> {
  const offen = new Map<number, Buchungsziel>();
  for (const projekt of projekte) {
    for (const phase of projekt.phasen) {
      for (const paket of phase.pakete) {
        if (paket.buchbar) {
          offen.set(paket.id, { id: paket.id, titel: paket.titel, projekt: projekt.titel });
        }
      }
    }
  }
  return offen;
}

/**
 * Die zuletzt bebuchten Pakete, höchstens `anzahl`, ohne Wiederholung.
 *
 * Gefiltert wird gegen den Projektbaum und nicht gegen die Buchung selbst:
 * Ein Paket, das inzwischen fertig, verworfen oder weich gelöscht ist, soll
 * hier nicht mehr auftauchen — sonst bietet die Seite einen Griff an, der
 * nicht mehr gemeint ist.
 *
 * Fällt ein Paket weg, rückt das nächstältere nach — die Liste bleibt also
 * so lang, wie es Kandidaten gibt. Ein leerer Platz wäre nur eine Lücke ohne
 * Auskunft; die Reihenfolge bleibt dabei die der letzten Buchung.
 */
export function letztePakete(
  buchungen: { paket: number; start: string }[],
  projekte: Projekt[],
  anzahl = 4,
): Buchungsziel[] {
  const offen = buchbarePakete(projekte);
  const gesehen = new Set<number>();
  const treffer: Buchungsziel[] = [];

  for (const buchung of [...buchungen].sort((a, z) => z.start.localeCompare(a.start))) {
    if (gesehen.has(buchung.paket)) continue;
    gesehen.add(buchung.paket);
    const ziel = offen.get(buchung.paket);
    if (ziel) treffer.push(ziel);
    if (treffer.length === anzahl) break;
  }
  return treffer;
}

export type Paketgruppe = { projekt: string; pakete: Buchungsziel[] };

/**
 * Die Pakete für ein Auswahlfeld, nach Projekt gruppiert.
 *
 * Drei Felder brauchen dieselbe Liste — der Start auf der Startseite, die
 * Umbuchung beim Clock-out und das Ändern einer Buchung. Dreimal derselbe
 * Dreifach-`flatMap` in drei Ansichten wäre dreimal derselbe Filter, und beim
 * nächsten Status vergisst man zwei davon.
 *
 * `auch` nimmt Pakete auf, die sonst herausfielen: Die Buchung, die gerade
 * geändert wird, hängt vielleicht an einem Paket, das inzwischen fertig ist.
 * Ohne diese Ausnahme verschwände genau das aus dem Feld — und die Änderung
 * schöbe die Zeit still auf ein anderes Paket.
 */
export function paketgruppen(projekte: Projekt[], auch: number[] = []): Paketgruppe[] {
  const gruppen: Paketgruppe[] = [];
  for (const projekt of projekte) {
    const pakete: Buchungsziel[] = [];
    for (const phase of projekt.phasen) {
      for (const paket of phase.pakete) {
        if (!paket.buchbar && !auch.includes(paket.id)) continue;
        pakete.push({ id: paket.id, titel: `${phase.titel} · ${paket.titel}`, projekt: projekt.titel });
      }
    }
    if (pakete.length > 0) gruppen.push({ projekt: projekt.titel, pakete });
  }
  return gruppen;
}

/**
 * Die Pakete für ein Suchfeld: gefiltert, flach, die zuletzt bebuchten oben.
 *
 * Gesucht wird **wortweise über Projekt und Paket** und ohne Rücksicht auf
 * Groß- und Kleinschreibung: „arz dauer" findet „Arzneimittelspender ·
 * Dauerlauftests". Ein Feld, in das man die Wörter in der Reihenfolge des
 * Titels tippen muss, ist keine Suche, sondern ein Ratespiel.
 *
 * `zuletzt` sind Paketnummern in der Reihenfolge der letzten Buchungen. Sie
 * stehen vorn, weil man fast immer wieder dorthin bucht, wo man gestern
 * gebucht hat. Der Rest behält die Reihenfolge des Projektbaums.
 */
export function paketeSuchen(
  gruppen: Paketgruppe[],
  suche: string,
  zuletzt: number[] = [],
): Buchungsziel[] {
  const worte = suche.toLowerCase().split(/\s+/).filter(Boolean);
  const passt = (p: Buchungsziel) =>
    worte.every((wort) => `${p.projekt} ${p.titel}`.toLowerCase().includes(wort));
  const rang = (p: Buchungsziel) => {
    const platz = zuletzt.indexOf(p.id);
    return platz === -1 ? zuletzt.length : platz;
  };
  return gruppen
    .flatMap((g) => g.pakete)
    .filter(passt)
    .sort((a, z) => rang(a) - rang(z));
}
