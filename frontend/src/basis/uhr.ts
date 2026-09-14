/**
 * Die Uhr starten und beenden — an **einer** Stelle.
 *
 * Vier Plätze starten sie inzwischen (Startseite, Projektbaum, Seitenleiste,
 * Zeitseite). Vier Aufrufe von `hole("/zeiten/clock_in/", …)` nebeneinander
 * laufen beim nächsten Feld auseinander, und auffallen würde nur der Platz,
 * den man gerade benutzt.
 */

import { hole } from "./api";

/**
 * Clock-in. **Ohne `paket` läuft die Uhr auf dem Auffangpaket** („Overhead"):
 * Zeit soll sich aufzeichnen lassen, bevor man weiß, wohin sie gehört.
 * Umgebucht wird beim Clock-out oder später in der Zeitliste.
 */
export function clockIn(paket?: number) {
  return hole("/zeiten/clock_in/", {
    method: "POST",
    body: JSON.stringify(paket ? { paket } : {}),
  });
}

/** Clock-out. Mit `paket` wird die Buchung dabei umgebucht. */
export function clockOut(notiz: string, paket?: number) {
  return hole("/zeiten/clock_out/", {
    method: "POST",
    body: JSON.stringify(paket ? { notiz, paket } : { notiz }),
  });
}
