/**
 * Die Rechnung hinter dem Gantt — Tage, Monate, Ziehen. Ohne React, damit sie
 * sich prüfen lässt.
 *
 * **Die Einheit ist der Tag.** Phasen dauern Monate, Aufgaben Tage; mit Tagen
 * als Raster tragen beide denselben Baustein. Ein Datum ist überall eine
 * Zeichenkette „JJJJ-MM-TT", wie sie die API liefert — gerechnet wird in
 * UTC-Tagen, sonst verschiebt die Sommerzeit einen Balken um eine Stunde und
 * beim Abrunden um einen Tag.
 */

export type Achse = { von: string; bis: string };
export type Spanne = { von: string; bis: string };
export type Griff = "anfang" | "mitte" | "ende";

const TAG_MS = 86_400_000;

/** „2026-10-01" → Tage seit 1970 (UTC). */
export function tagnummer(iso: string): number {
  const [j, m, t] = iso.split("-").map(Number);
  return Math.round(Date.UTC(j, m - 1, t) / TAG_MS);
}

export function ausTagnummer(nummer: number): string {
  return new Date(nummer * TAG_MS).toISOString().slice(0, 10);
}

export function plusTage(iso: string, tage: number): string {
  return ausTagnummer(tagnummer(iso) + tage);
}

/** Heute im Kalender des Browsers — nicht in UTC, sonst wäre kurz nach Mitternacht noch gestern. */
export function heuteIso(jetzt = new Date()): string {
  const m = String(jetzt.getMonth() + 1).padStart(2, "0");
  const t = String(jetzt.getDate()).padStart(2, "0");
  return `${jetzt.getFullYear()}-${m}-${t}`;
}

function monatsanfang(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function monatsende(iso: string): string {
  const [j, m] = iso.split("-").map(Number);
  return ausTagnummer(Math.round(Date.UTC(j, m, 1) / TAG_MS) - 1);
}

/** Wie viele Tage die Achse hat, beide Enden eingeschlossen. */
export function tage(achse: Achse): number {
  return tagnummer(achse.bis) - tagnummer(achse.von) + 1;
}

/**
 * Die Achse über alle Daten: vom Monatsanfang des frühesten bis zum
 * Monatsende des spätesten. **Heute liegt immer darauf**, damit man sieht, wo
 * man steht. Ohne jedes Datum der laufende Monat und fünf danach — dieselbe
 * Regel wie `achse` in socos/services/planung.py.
 */
export function achseUeber(daten: (string | null | undefined)[], heute: string): Achse {
  const da = daten.filter((d): d is string => !!d);
  const alle = [...da, heute].sort();
  let bis = alle[alle.length - 1];
  if (da.length === 0) {
    const [j, m] = heute.split("-").map(Number);
    const stelle = j * 12 + m - 1 + 5;
    bis = `${Math.floor(stelle / 12)}-${String((stelle % 12) + 1).padStart(2, "0")}-01`;
  }
  return { von: monatsanfang(alle[0]), bis: monatsende(bis) };
}

/** Wo ein Balken auf der Achse liegt: ab Tag `anfang`, `laenge` Tage lang. */
export function lageAuf(achse: Achse, spanne: Spanne): { anfang: number; laenge: number } {
  const anfang = tagnummer(spanne.von) - tagnummer(achse.von);
  return { anfang, laenge: tagnummer(spanne.bis) - tagnummer(spanne.von) + 1 };
}

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export type Monat = { anfang: number; laenge: number; name: string; jahr: number; beschriftet: boolean };

/**
 * Die Monate der Achse. Bei vielen Monaten wird nicht jeder beschriftet —
 * sonst stehen die Namen übereinander; die Linien bleiben je Monat. Der
 * Januar trägt das Jahr.
 */
export function monateDer(achse: Achse): Monat[] {
  const monate: Monat[] = [];
  const start = tagnummer(achse.von);
  const ende = tagnummer(achse.bis);
  let [j, m] = achse.von.split("-").map(Number);
  while (true) {
    const erster = Math.max(start, Math.round(Date.UTC(j, m - 1, 1) / TAG_MS));
    if (erster > ende) break;
    const letzter = Math.min(ende, Math.round(Date.UTC(j, m, 1) / TAG_MS) - 1);
    monate.push({ anfang: erster - start, laenge: letzter - erster + 1, name: MONATE[m - 1], jahr: j, beschriftet: true });
    [j, m] = m === 12 ? [j + 1, 1] : [j, m + 1];
  }
  const jede = monate.length > 24 ? 3 : monate.length > 12 ? 2 : 1;
  return monate.map((monat, stelle) => ({ ...monat, beschriftet: stelle % jede === 0 }));
}

/**
 * Ein gezogener Balken. Die Mitte verschiebt beides, ein Rand nur sich — und
 * nie über den anderen hinaus: Ein Balken ist mindestens einen Tag lang.
 * Auf der Achse bleibt er; wer weiter will, zieht nach dem Speichern noch
 * einmal, dann ist die Achse mitgewachsen.
 */
export function gezogen(spanne: Spanne, griff: Griff, um: number, achse: Achse): Spanne {
  const a0 = tagnummer(achse.von);
  const a1 = tagnummer(achse.bis);
  let von = tagnummer(spanne.von);
  let bis = tagnummer(spanne.bis);
  if (griff === "mitte") {
    const laenge = bis - von;
    von = Math.min(Math.max(von + um, a0), a1 - laenge);
    bis = von + laenge;
  } else if (griff === "anfang") {
    von = Math.min(Math.max(von + um, a0), bis);
  } else {
    bis = Math.max(Math.min(bis + um, a1), von);
  }
  return { von: ausTagnummer(von), bis: ausTagnummer(bis) };
}

/** „2026-11-03" → „3.11.", mit Jahr „3.11.2026". */
export function kurzdatum(iso: string, mitJahr = false): string {
  const [j, m, t] = iso.split("-").map(Number);
  return `${t}.${m}.${mitJahr ? j : ""}`;
}

/** „3.11.–20.11.2026", über den Jahreswechsel „15.12.2026–10.1.2027". */
export function zeitraumText(von: string | null, bis: string | null): string {
  if (!von || !bis) return "ohne Zeitraum";
  if (von === bis) return kurzdatum(von, true);
  const gleichesJahr = von.slice(0, 4) === bis.slice(0, 4);
  return `${kurzdatum(von, !gleichesJahr)}–${kurzdatum(bis, true)}`;
}

/** „Okt 2026 – Mär 2027" — für Phasen, die in Monaten denken. */
export function monatsText(von: string | null, bis: string | null): string {
  if (!von || !bis) return "ohne Zeitraum";
  const monat = (iso: string) => `${MONATE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  return monat(von) === monat(bis) ? monat(von) : `${monat(von)} – ${monat(bis)}`;
}

/**
 * Ob ein Datumsfeld ein ganzes Datum trägt. Chrome meldet das Feld schon nach
 * der ersten Ziffer der Jahreszahl als gültig — „0002-04-01" —, und
 * gespeichert wäre eine Phase im Jahr 2.
 */
export function istGanzesDatum(wert: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) && wert >= "2000-01-01" && wert <= "2099-12-31";
}

/**
 * Welche Phase beim Öffnen unter dem Gantt steht: die laufende, in der heute
 * liegt — sonst die erste laufende, sonst die erste mit Zeitraum, sonst die
 * erste. Geöffnet ist, woran gearbeitet wird.
 */
export function startphase<T extends { id: number; stand: string; von: string | null; bis: string | null }>(
  phasen: T[],
  heute: string,
): T | undefined {
  const laufend = phasen.filter((p) => p.stand === "laeuft");
  return (
    laufend.find((p) => p.von && p.bis && p.von <= heute && heute <= p.bis) ??
    laufend.find((p) => p.von) ??
    laufend[0] ??
    phasen.find((p) => p.von) ??
    phasen[0]
  );
}
