/**
 * Was die Startseite rechnet — an einer Stelle, damit es prüfbar ist.
 *
 * Die Seite selbst zeigt nur Kacheln. Das Einzige, was sie ableitet, sind die
 * zuletzt bebuchten Pakete für den Ein-Klick-Start der Uhr.
 */

import type { Projekt } from "./daten";

/**
 * Auf diese Stände darf die Uhr laufen.
 *
 * „fertig" und „verworfen" fehlen mit Absicht: Der Server ließe eine Buchung
 * darauf zwar zu, aber wer ein abgeschlossenes Paket in der Liste sieht,
 * bucht früher oder später darauf — und dann steht die Zeit im Nachweis an
 * einem Paket, das seit Monaten zu ist.
 */
export const BUCHBAR = ["offen", "laeuft", "eingereicht", "zugesagt", "offene_frage"];

export type Buchungsziel = { id: number; titel: string; projekt: string };

/** Alle Pakete, auf die gebucht werden darf — nach Paketnummer greifbar. */
export function buchbarePakete(projekte: Projekt[]): Map<number, Buchungsziel> {
  const offen = new Map<number, Buchungsziel>();
  for (const projekt of projekte) {
    for (const bereich of projekt.bereiche) {
      for (const paket of bereich.pakete) {
        if (BUCHBAR.includes(paket.status)) {
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
    for (const bereich of projekt.bereiche) {
      for (const paket of bereich.pakete) {
        if (!BUCHBAR.includes(paket.status) && !auch.includes(paket.id)) continue;
        pakete.push({ id: paket.id, titel: `${bereich.titel} · ${paket.titel}`, projekt: projekt.titel });
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
