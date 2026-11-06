/**
 * Die Rechnung hinter der Förderplanung — welche Zeile wohin gehört, welche
 * Balken sie hat, was beim Ziehen gespeichert wird. Ohne React, damit sie
 * sich prüfen lässt.
 *
 * Eine Zeile ist ein Antrag. Er geht durch drei Abschnitte wie auf der Folie
 * „Förderübersicht": schreiben (bis zur Einreichung), Prüfung (bis zur
 * Entscheidung), Laufzeit (Beginn bis Ende).
 */

import type { Antragsstand, Foerderantrag, Foerdergeber, Foerderprogramm } from "./daten";
import { plusTage, tagnummer, type Spanne } from "./gantt";

export type Planzeile = {
  antrag: Foerderantrag;
  programm: Foerderprogramm;
  /** „aws Preseed" — so, wie man die Förderung nennt. */
  name: string;
};

/** Was vorbei ist: Es hat jemand entschieden, oder es kam nie zur Einreichung. */
export const VORBEI: Antragsstand[] = ["abgelehnt", "verfallen"];

export const istVorbei = (a: Pick<Foerderantrag, "stand">) => VORBEI.includes(a.stand);

/**
 * „aws" + „Preseed" → „aws Preseed". Fängt das Programm schon so an wie das
 * Kürzel („aws Preseed", „Pflegeinnovation NÖ" unter „Pflege NÖ"), steht es
 * nicht doppelt da — verglichen wird das erste Wort des Kürzels.
 */
export function foerdername(programm: Pick<Foerderprogramm, "name">, geber?: Pick<Foerdergeber, "kurz" | "name">): string {
  const vorne = geber ? geber.kurz || geber.name : "";
  const erstesWort = vorne.split(/\s+/)[0].toLowerCase();
  if (!vorne || programm.name.toLowerCase().startsWith(erstesWort)) return programm.name;
  return `${vorne} ${programm.name}`;
}

/** Alle lebenden Anträge als Zeilen. */
export function planzeilen(programme: Foerderprogramm[], geber: Foerdergeber[]): Planzeile[] {
  const nachId = new Map(geber.map((g) => [g.id, g]));
  return programme.flatMap((programm) =>
    programm.antraege.map((antrag) => ({ antrag, programm, name: foerdername(programm, nachId.get(programm.geber)) })),
  );
}

/** Früher zuerst, ohne Datum zuletzt — sonst stünde, was noch keinen Termin hat, ganz oben. */
function nachDatum(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Wann eine Zeile anfängt — das früheste ihrer Daten. Danach wird „Weitere" geordnet. */
function anfang(a: Foerderantrag): string | null {
  return [a.schreiben_ab, a.einreichung, a.entscheidung, a.beginn].filter((d): d is string => !!d).sort()[0] ?? null;
}

/**
 * Drei Gruppen, wie die zwei Folien: oben der Fokus nach Priorität (Folie 2),
 * darunter alle weiteren Möglichkeiten nach Termin (Folie 1), unten was
 * vorbei ist — abgelehnt oder nie eingereicht, das Jüngste zuerst.
 */
export function gruppiert(zeilen: Planzeile[]): { fokus: Planzeile[]; weitere: Planzeile[]; vorbei: Planzeile[] } {
  const offen = zeilen.filter((z) => !istVorbei(z.antrag));
  const fokus = offen
    .filter((z) => z.antrag.prioritaet !== null)
    .sort(
      (x, y) =>
        x.antrag.prioritaet! - y.antrag.prioritaet! ||
        nachDatum(x.antrag.einreichung, y.antrag.einreichung) ||
        x.antrag.id - y.antrag.id,
    );
  const weitere = offen
    .filter((z) => z.antrag.prioritaet === null)
    .sort((x, y) => nachDatum(anfang(x.antrag), anfang(y.antrag)) || x.name.localeCompare(y.name, "de"));
  const ende = (a: Foerderantrag) => a.entscheidung ?? a.einreichung ?? anfang(a);
  const vorbei = zeilen
    .filter((z) => istVorbei(z.antrag))
    .sort((x, y) => nachDatum(ende(y.antrag), ende(x.antrag)) || x.name.localeCompare(y.name, "de"));
  return { fokus, weitere, vorbei };
}

/**
 * Die neuen Prioritäten, wenn `id` in der Fokusliste um einen Platz wandert
 * (−1 höher, +1 tiefer) oder sie verlässt (`null`). Die Liste wird dabei
 * durchnummeriert: 1, 2, 3 … Zurück kommen nur die Anträge, deren Zahl sich
 * ändert — jeder davon ist ein Eintrag im Änderungsprotokoll.
 */
export function neueReihung(
  fokus: Pick<Foerderantrag, "id" | "prioritaet">[],
  id: number,
  schritt: -1 | 1 | null,
): Map<number, number | null> {
  const ids = fokus.map((a) => a.id);
  const stelle = ids.indexOf(id);
  const neu = new Map<number, number | null>();
  if (stelle < 0) return neu;
  if (schritt === null) {
    ids.splice(stelle, 1);
    neu.set(id, null);
  } else {
    const ziel = stelle + schritt;
    if (ziel < 0 || ziel >= ids.length) return neu;
    [ids[stelle], ids[ziel]] = [ids[ziel], ids[stelle]];
  }
  const bisher = new Map(fokus.map((a) => [a.id, a.prioritaet]));
  ids.forEach((i, platz) => {
    if (bisher.get(i) !== platz + 1) neu.set(i, platz + 1);
  });
  return neu;
}

/** Die Priorität für einen, der neu in den Fokus kommt: hinten an. */
export function hintenAn(fokus: Pick<Foerderantrag, "prioritaet">[]): number {
  return fokus.reduce((hoechste, a) => Math.max(hoechste, a.prioritaet ?? 0), 0) + 1;
}

function monateDazu(iso: string, monate: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const stelle = j * 12 + m - 1 + monate;
  const jahr = Math.floor(stelle / 12);
  const monat = (stelle % 12) + 1;
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(Math.min(t, letzter)).padStart(2, "0")}`;
}

export type Abschnitt = "schreiben" | "pruefung" | "laufzeit";

export type Planbalken = {
  art: Abschnitt;
  spanne: Spanne;
  /**
   * Die Laufzeit ohne Ende: so lang, wie das Programm höchstens erlaubt
   * (sonst ein Jahr) — gezeichnet, damit man sieht, wohin sie reicht, aber
   * erkennbar als Annahme.
   */
  angenommen?: boolean;
};

/** Die Balken einer Zeile. Ein Abschnitt, dem ein Ende fehlt, hat keinen. */
export function balken(a: Foerderantrag, programm: Pick<Foerderprogramm, "max_monate">): Planbalken[] {
  const liste: Planbalken[] = [];
  if (a.schreiben_ab && a.einreichung) liste.push({ art: "schreiben", spanne: { von: a.schreiben_ab, bis: a.einreichung } });
  if (a.einreichung && a.entscheidung) liste.push({ art: "pruefung", spanne: { von: a.einreichung, bis: a.entscheidung } });
  if (a.beginn) {
    const bis = a.ende ?? plusTage(monateDazu(a.beginn, programm.max_monate ?? 12), -1);
    liste.push({ art: "laufzeit", spanne: { von: a.beginn, bis }, angenommen: !a.ende || undefined });
  }
  return liste;
}

/** Alle Daten einer Zeile, auch das angenommene Ende — damit die Achse sie trägt. */
export function datenDer(z: Planzeile): string[] {
  const a = z.antrag;
  return [
    a.schreiben_ab,
    a.einreichung,
    a.entscheidung,
    ...balken(a, z.programm).map((b) => b.spanne.bis),
  ].filter((d): d is string => !!d);
}

export type Plandaten = Partial<
  Pick<Foerderantrag, "schreiben_ab" | "einreichung" | "entscheidung" | "beginn" | "ende">
>;

const FELDER: Record<Abschnitt, [keyof Plandaten, keyof Plandaten]> = {
  schreiben: ["schreiben_ab", "einreichung"],
  pruefung: ["einreichung", "entscheidung"],
  laufzeit: ["beginn", "ende"],
};

/**
 * Was ein gezogener Balken speichert.
 *
 * **Als Ganzes gezogen, wandert die ganze Zeile** — Schreiben, Einreichung,
 * Entscheidung und Laufzeit um dieselben Tage. „Die Förderung ein Quartal
 * später" ist das, was man auf der Folie tat; wanderte nur ein Abschnitt,
 * schöbe er sich über den nächsten, und der Server lehnte ab.
 *
 * Ein Rand gezogen ändert nur dieses eine Datum.
 */
export function gezogeneDaten(a: Foerderantrag, art: Abschnitt, alt: Spanne, neu: Spanne): Plandaten {
  const vorne = tagnummer(neu.von) - tagnummer(alt.von);
  const hinten = tagnummer(neu.bis) - tagnummer(alt.bis);
  const [anfangsfeld, endfeld] = FELDER[art];
  if (vorne === hinten) {
    if (vorne === 0) return {};
    const daten: Plandaten = {};
    for (const feld of ["schreiben_ab", "einreichung", "entscheidung", "beginn", "ende"] as const) {
      const tag = a[feld];
      if (tag) daten[feld] = plusTage(tag, vorne);
    }
    // Ein angenommenes Ende wird beim Verschieben nicht zum festen.
    return daten;
  }
  const daten: Plandaten = {};
  if (vorne !== 0) daten[anfangsfeld] = neu.von;
  if (hinten !== 0) daten[endfeld] = neu.bis;
  return daten;
}
