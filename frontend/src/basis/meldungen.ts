/**
 * Sichtbare Rückmeldung für alles, was schreibt.
 *
 * **Warum das nicht optional ist:** Ohne diese Stelle scheitert ein Speichern
 * still. Der Knopf reagiert, die Zeile ändert sich nicht, und niemand weiß, ob
 * es geklappt hat — bei einer Zeiterfassung heißt das: jemand glaubt, seine
 * Stunden seien gebucht, und sie sind es nicht.
 *
 * Nur schreibende Aufrufe melden sich hier. Lesende haben ihren eigenen Weg
 * über `Zustand` — sonst stünde bei jedem Netzwackler ein Banner im Bild.
 */

export type Meldung = { id: number; art: "fehler" | "gut"; text: string };

type Zuhoerer = (meldungen: Meldung[]) => void;

let laufendeNummer = 0;
let offen: Meldung[] = [];
const zuhoerer = new Set<Zuhoerer>();

function verteilen() {
  for (const z of zuhoerer) z(offen);
}

export function zuhoeren(z: Zuhoerer) {
  zuhoerer.add(z);
  z(offen);
  return () => {
    zuhoerer.delete(z);
  };
}

export function melden(art: Meldung["art"], text: string) {
  const meldung = { id: ++laufendeNummer, art, text };
  offen = [...offen, meldung];
  verteilen();
  // Erfolg verschwindet von selbst, ein Fehler nicht: Wer ihn wegklickt, hat
  // ihn gelesen. Ein Fehler, der nach vier Sekunden verschwindet, wird
  // übersehen — und dann fehlt die Buchung, ohne dass es jemand weiß.
  if (art === "gut") setTimeout(() => schliessen(meldung.id), 4000);
  return meldung.id;
}

export function schliessen(id: number) {
  offen = offen.filter((m) => m.id !== id);
  verteilen();
}
