/**
 * Was passiert, wenn die Schnittstelle sagt: nicht angemeldet.
 *
 * **Nur** bei `not_authenticated`. Bei `permission_denied` steht die Sitzung —
 * wer dort zur Anmeldung geschickt wird, verliert sie für nichts und landet
 * nach dem Anmelden wieder auf derselben verwehrten Seite.
 */

import { ApiFehler } from "./api";

export const ANMELDESEITE = "/anmelden/";

/** Soll dieser Fehler zur Anmeldung führen? */
export function fuehrtZurAnmeldung(fehler: unknown): boolean {
  return fehler instanceof ApiFehler && fehler.istAbgemeldet;
}

/** Das Ziel, auf das nach dem Anmelden zurückgesprungen wird. */
export function anmeldeZiel(pfad: string): string {
  return `${ANMELDESEITE}?next=${encodeURIComponent(pfad)}`;
}

export function zurAnmeldung(ort: Location = window.location) {
  ort.assign(anmeldeZiel(ort.pathname + ort.search));
}
