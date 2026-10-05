/**
 * Was die Eventseite rechnet — an einer Stelle, damit es prüfbar ist.
 *
 * Zwei Dinge stehen hier, die man sonst in der Ansicht verstreut:
 *
 * 1. **Was auf einer Hitlist-Zeile steht.** Eine Zeile zeigt entweder auf eine
 *    Organisation oder auf eine Person (siehe `Eventziel` in socos/models.py).
 *    Welcher Name dann in der Spalte steht und was klein darunter, ist eine
 *    Entscheidung — keine Formatierung.
 * 2. **Wann ein Event vorbei ist.** Verglichen wird mit dem **letzten** Tag,
 *    nicht mit dem ersten: Eine dreitägige Tagung ist an ihrem zweiten Tag
 *    nicht vergangen. Das ist genau der Fehler, den man erst im Oktober sieht.
 */

import { datumIn } from "./aufgaben";
import type { Event, Eventziel, Kontakt, Organisation } from "./daten";

/** Der letzte Tag eines Events. Ohne `bis` ist es eintägig. */
export function letzterTag(event: Event): string {
  return event.bis || event.von;
}

/** Ein `bis` gleich `von` ist eintägig — so kann es aus älteren Einträgen kommen. */
export function istMehrtaegig(event: Pick<Event, "von" | "bis">): boolean {
  return !!event.bis && event.bis !== event.von;
}

/**
 * Was beim Umschalten des Hakens „Mehrtägig" gespeichert wird.
 *
 * **An:** Der letzte Tag wird der Tag danach — ein leeres Feld wäre wieder
 * eintägig, und der Haken spränge nach dem Speichern zurück.
 * **Aus:** `bis` wird geleert. Liegt das Ende dann am selben Tag vor dem
 * Beginn (Messe 17:00 bis Folgetag 10:00), geht es mit; sonst wiese der
 * Server die ganze Änderung ab und der Haken bliebe stehen.
 */
export function mehrtaegigUmschalten(
  event: Pick<Event, "von" | "beginn" | "ende">,
  an: boolean,
): Partial<Pick<Event, "bis" | "ende">> {
  if (an) return { bis: datumIn(1, new Date(`${event.von}T00:00:00`)) };
  if (event.beginn && event.ende && event.ende <= event.beginn) return { bis: null, ende: null };
  return { bis: null };
}

export function istVorbei(event: Event, heute: string): boolean {
  return letzterTag(event) < heute;
}

/**
 * Kommendes aufsteigend (das Nächste zuerst), Vergangenes absteigend (das
 * Letzte zuerst). Beide Male steht oben, was am ehesten gebraucht wird — vor
 * einem Event die Vorbereitung, danach das Nachfassen.
 */
export function teileNachZeit(
  events: Event[],
  heute: string,
): { kommend: Event[]; vergangen: Event[] } {
  const kommend = events
    .filter((e) => !istVorbei(e, heute))
    .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : a.titel.localeCompare(b.titel)));
  const vergangen = events
    .filter((e) => istVorbei(e, heute))
    .sort((a, b) => (a.von > b.von ? -1 : a.von < b.von ? 1 : a.titel.localeCompare(b.titel)));
  return { kommend, vergangen };
}

export type Zaehlung = { gesamt: number; offen: number; getroffen: number; verpasst: number };

export function zaehlung(ziele: Eventziel[]): Zaehlung {
  return {
    gesamt: ziele.length,
    offen: ziele.filter((z) => z.stand === "offen").length,
    getroffen: ziele.filter((z) => z.stand === "getroffen").length,
    verpasst: ziele.filter((z) => z.stand === "verpasst").length,
  };
}

/**
 * Wen eine Hitlist-Zeile meint: der Name, und darunter das Haus.
 *
 * Bei einer Zeile auf die Organisation bleibt `dazu` leer — „Förderstelle
 * Nord · Förderstelle Nord" wäre dieselbe Auskunft zweimal.
 */
export function wen(ziel: Eventziel): { name: string; dazu: string } {
  if (ziel.kontakt !== null) {
    return { name: ziel.kontakt_name, dazu: ziel.kontakt_organisation };
  }
  return { name: ziel.organisation_name, dazu: "" };
}

/** Der Wert für das Auswahlfeld: `o12` oder `k7`. */
export type Zielschluessel = `o${number}` | `k${number}`;

/**
 * Leer nur im unmöglichen Fall, dass eine Zeile auf nichts zeigt. Die
 * Datenbank lässt ihn nicht zu (`eventziel_zeigt_auf_genau_eines`) — ein
 * `!` an dieser Stelle wäre trotzdem eine Behauptung über Daten, die von
 * außen kommen.
 */
export function schluessel(ziel: Pick<Eventziel, "organisation" | "kontakt">): Zielschluessel | "" {
  if (ziel.kontakt !== null) return `k${ziel.kontakt}`;
  if (ziel.organisation !== null) return `o${ziel.organisation}`;
  return "";
}

/**
 * Aus dem Wert des Auswahlfeldes wird, was der Server erwartet: genau eines
 * von beiden gesetzt.
 */
export function alsAnfrage(wert: string): { organisation: number | null; kontakt: number | null } | null {
  const treffer = /^([ok])(\d+)$/.exec(wert);
  if (!treffer) return null;
  const nummer = Number(treffer[2]);
  return treffer[1] === "o"
    ? { organisation: nummer, kontakt: null }
    : { organisation: null, kontakt: nummer };
}

export type Auswahl = { wert: Zielschluessel; name: string; dazu: string };

/**
 * Was noch auf die Liste kann — ohne das, was schon daraufsteht.
 *
 * Wer bereits Eingetragenes zur Auswahl anbietet, bekommt beim zweiten Klick
 * entweder eine Fehlermeldung oder eine doppelte Zeile. Beides erklärt
 * weniger als eine Auswahl, die nur zeigt, was noch geht.
 */
export function nochOffen(
  organisationen: Organisation[],
  kontakte: Kontakt[],
  schonDrauf: Eventziel[],
): { organisationen: Auswahl[]; personen: Auswahl[] } {
  const vergeben = new Set(schonDrauf.map(schluessel));
  return {
    organisationen: organisationen
      .filter((o) => !vergeben.has(`o${o.id}`))
      .map((o) => ({ wert: `o${o.id}` as Zielschluessel, name: o.name, dazu: o.typ })),
    personen: kontakte
      .filter((k) => !vergeben.has(`k${k.id}`))
      .map((k) => ({
        wert: `k${k.id}` as Zielschluessel,
        name: k.name,
        dazu: k.organisation_name || k.funktion,
      })),
  };
}

/**
 * Wen man auf diesem Event getroffen haben kann: **alle** Kontakte und
 * Organisationen, nicht nur die von der Hitlist.
 *
 * **Warum das nicht die Hitlist ist:** Die Hitlist ist der Plan von vorher —
 * wen wir ansprechen wollen. Wen man dort tatsächlich trifft, entscheidet der
 * Gang über den Flur. Solange der Verlauf nur die Namen von der Liste anbot,
 * musste jemand erst auf die Planungsliste, damit man ein Gespräch mit ihm
 * festhalten konnte; die Liste erzählte danach eine Vorbereitung, die es nie
 * gab.
 *
 * Die Namen von der Liste stehen trotzdem zuerst — auf einer Tagung sind sie
 * die häufigste Wahl.
 */
export function wenGetroffen(
  organisationen: Organisation[],
  kontakte: Kontakt[],
  ziele: Eventziel[],
): { hitlist: Auswahl[]; personen: Auswahl[]; organisationen: Auswahl[] } {
  const uebrig = nochOffen(organisationen, kontakte, ziele);
  return {
    hitlist: ziele
      .map((z) => ({ wert: schluessel(z), ...wen(z) }))
      .filter((a): a is Auswahl => a.wert !== ""),
    personen: uebrig.personen,
    organisationen: uebrig.organisationen,
  };
}

function enthaelt(heuhaufen: string, nadel: string): boolean {
  return heuhaufen.toLowerCase().includes(nadel.trim().toLowerCase());
}

/**
 * Die Suche geht über das Event **und** über seine Hitlist: Wer den Namen
 * einer Förderstelle eingibt, sucht das Event, auf dem er sie treffen wollte.
 */
export function passtEvent(event: Event, suche: string): boolean {
  if (!suche.trim()) return true;
  if (enthaelt(`${event.titel} ${event.ort} ${event.notiz}`, suche)) return true;
  return event.ziele.some((z) => {
    const w = wen(z);
    return enthaelt(`${w.name} ${w.dazu} ${z.anliegen}`, suche);
  });
}

/** Wie eine Person mit einem Event verbunden ist — das Stärkste gewinnt. */
export type Eventbezug = {
  id: number;
  titel: string;
  von: string;
  /** „getroffen" heißt: ein Gespräch steht im Verlauf oder auf der Hitlist abgehakt. */
  wie: "kennengelernt" | "getroffen" | "verpasst" | "vorgemerkt";
};

/**
 * Die Events, mit denen eine Person zu tun hat — für ihre Kachel.
 *
 * **Gerechnet und nicht gespeichert:** Die Verbindung steht schon an drei
 * Stellen — Hitlist, Verlauf mit Event, „kennengelernt auf". Ein viertes Feld
 * „Events der Person" wäre eine zweite Wahrheit daneben, die beim ersten
 * Abhaken auf der Hitlist veraltet.
 *
 * Je Event eine Zeile. Steht jemand auf der Hitlist **und** im Verlauf, zählt
 * das Gespräch: Getroffen ist mehr als vorgemerkt.
 */
export function eventsDerPerson(
  kontakt: Pick<Kontakt, "id" | "kennengelernt_auf">,
  events: Event[],
): Eventbezug[] {
  const rang = { kennengelernt: 4, getroffen: 3, verpasst: 2, vorgemerkt: 1 } as const;
  const bezuege: Eventbezug[] = [];
  for (const e of events) {
    const kandidaten: Eventbezug["wie"][] = [];
    if (kontakt.kennengelernt_auf === e.id) kandidaten.push("kennengelernt");
    if (e.verlauf.some((v) => v.kontakt === kontakt.id)) kandidaten.push("getroffen");
    const ziel = e.ziele.find((z) => z.kontakt === kontakt.id);
    if (ziel) {
      kandidaten.push(
        ziel.stand === "getroffen" ? "getroffen" : ziel.stand === "verpasst" ? "verpasst" : "vorgemerkt",
      );
    }
    if (kandidaten.length === 0) continue;
    const wie = kandidaten.reduce((a, b) => (rang[b] > rang[a] ? b : a));
    bezuege.push({ id: e.id, titel: e.titel, von: e.von, wie });
  }
  // Das Neueste zuerst: Was als Nächstes ansteht oder zuletzt war, ist die Frage.
  return bezuege.sort((a, b) => (a.von > b.von ? -1 : a.von < b.von ? 1 : 0));
}

/**
 * Mit welchen Events man die Person von ihrer Kachel aus verbinden kann — alle,
 * auf deren Hitlist sie noch nicht steht, getrennt nach kommend und vergangen.
 *
 * **Auch Vergangenes:** Wen man auf einer Tagung kennengelernt hat, trägt man
 * oft erst Tage später ein. Die Zeile auf der Hitlist eines vergangenen Events
 * kommt dann gleich als „getroffen" (siehe `standBeimVerbinden`) — als „offen"
 * stünde sie dort für immer als verpasste Vorbereitung.
 */
export function eventsZumVerbinden(
  kontaktId: number,
  events: Event[],
  heute: string,
): { kommend: Event[]; vergangen: Event[] } {
  const frei = (e: Event) => !e.ziele.some((z) => z.kontakt === kontaktId);
  const { kommend, vergangen } = teileNachZeit(events, heute);
  return { kommend: kommend.filter(frei), vergangen: vergangen.filter(frei) };
}

/** Vor dem Event ist es ein Vorhaben, danach ein Treffen. */
export function standBeimVerbinden(event: Event, heute: string): Eventziel["stand"] {
  return istVorbei(event, heute) ? "getroffen" : "offen";
}
