/**
 * Notizen im Verlauf: Klartext mit Aufzählungen.
 *
 * **Warum Klartext und kein Feld mit Formatierung:** Derselbe Text steht im
 * Verlauf, auf der Eventseite, in der Suche und im Änderungsprotokoll — dort
 * als alt → neu. Ein `- ` vor einer Zeile liest sich überall, auch dort, wo
 * nichts gezeichnet wird; eine Formatierung als HTML stünde im Protokoll als
 * Tag-Salat. Es ist dieselbe Regel wie beim Designtext und beim
 * Meetingprotokoll: Zeilen mit `- ` sind Punkte.
 *
 * Gezeichnet wird daraus eine echte Liste (`bloecke`); geschrieben wird mit
 * zwei Knöpfen und mit Enter, das den nächsten Punkt beginnt (`umschalten`,
 * `zeilenumbruch`).
 */

export type Listenart = "punkte" | "nummern";

export type Block =
  | { art: "absatz"; text: string }
  | { art: "punkte"; zeilen: string[] }
  | { art: "nummern"; zeilen: string[]; start: number };

/**
 * Die Änderung am Text als Ersatz eines Bereichs — nicht als neuer
 * Gesamttext. So kann das Feld sie über den Browser einsetzen, und ⌘Z nimmt
 * genau diesen Schritt zurück.
 */
export type Aenderung = { von: number; bis: number; ersatz: string; auswahl: [number, number] };

type Marke = { art: Listenart; laenge: number; nummer: number; vorne: string };

// Der Gedankenstrich gehört dazu: Das Telefonat zur Förderung schreibt seine
// offenen Fragen mit „– " (basis/foerderungen.ts), und die stehen schon im
// Bestand.
const PUNKT = /^(\s*[-*•–])\s+/;
// Höchstens drei Ziffern: „2026. war ein gutes Jahr" ist kein Listenpunkt.
const NUMMER = /^(\s*)(\d{1,3})([.)])\s+/;

function marke(zeile: string): Marke | null {
  const punkt = PUNKT.exec(zeile);
  if (punkt) return { art: "punkte", laenge: punkt[0].length, nummer: 0, vorne: `${punkt[1]} ` };
  const nummer = NUMMER.exec(zeile);
  if (nummer)
    return {
      art: "nummern",
      laenge: nummer[0].length,
      nummer: Number(nummer[2]),
      vorne: `${nummer[1]}${Number(nummer[2]) + 1}${nummer[3]} `,
    };
  return null;
}

/** Ob die Zeile an dieser Stelle ein Listenpunkt ist — für den gedrückten Knopf. */
export function listenartAn(text: string, stelle: number): Listenart | null {
  const anfang = text.lastIndexOf("\n", stelle - 1) + 1;
  const ende = text.indexOf("\n", stelle);
  return marke(text.slice(anfang, ende === -1 ? text.length : ende))?.art ?? null;
}

/**
 * Der Text in Absätze und Listen zerlegt.
 *
 * Aufeinanderfolgende Zeilen ohne Marke bleiben **ein** Absatz mit ihren
 * Umbrüchen — wer zwei Zeilen untereinander schreibt, meint keine zwei
 * Absätze. Eine Leerzeile trennt. Ein Punkt ohne Inhalt (ein stehen
 * gebliebenes „- ") fällt weg, statt als leerer Punkt dazustehen.
 */
export function bloecke(text: string): Block[] {
  const ergebnis: Block[] = [];
  let offen: Block | null = null;
  for (const zeile of text.split("\n")) {
    if (!zeile.trim()) {
      offen = null;
      continue;
    }
    const m = marke(zeile);
    if (!m) {
      if (offen?.art === "absatz") offen.text += `\n${zeile.trim()}`;
      else ergebnis.push((offen = { art: "absatz", text: zeile.trim() }));
      continue;
    }
    const inhalt = zeile.slice(m.laenge).trim();
    if (!inhalt) continue;
    if (offen?.art !== m.art) {
      offen = m.art === "punkte" ? { art: "punkte", zeilen: [] } : { art: "nummern", zeilen: [], start: m.nummer };
      ergebnis.push(offen);
    }
    offen.zeilen.push(inhalt);
  }
  return ergebnis;
}

/** Anfang der ersten und Ende der letzten Zeile, die die Auswahl berührt. */
function zeilenbereich(text: string, von: number, bis: number): [number, number] {
  // Endet die Auswahl direkt hinter einem Umbruch (Zeilen per Dreifachklick
  // oder Umschalt+Pfeil markiert), gehört die Zeile danach nicht mehr dazu.
  const letzte = bis > von && text[bis - 1] === "\n" ? bis - 1 : bis;
  const anfang = text.lastIndexOf("\n", von - 1) + 1;
  const ende = text.indexOf("\n", letzte);
  return [anfang, ende === -1 ? text.length : ende];
}

/**
 * Der Knopf: die berührten Zeilen zu Punkten machen — oder, wenn sie es schon
 * alle sind, wieder zu gewöhnlichen Zeilen.
 *
 * Bei mehreren Zeilen bleiben Leerzeilen leer; sonst stünde zwischen zwei
 * Gedanken ein leerer Punkt. Eine einzelne leere Zeile bekommt die Marke
 * trotzdem: So beginnt man eine Liste, bevor man etwas schreibt.
 */
export function umschalten(text: string, von: number, bis: number, art: Listenart): Aenderung {
  const [anfang, ende] = zeilenbereich(text, von, bis);
  const zeilen = text.slice(anfang, ende).split("\n");
  const mehrere = zeilen.length > 1;
  const zaehlt = (z: string) => !mehrere || z.trim() !== "";
  const schonAlle = zeilen.every((z) => !zaehlt(z) || marke(z)?.art === art);

  let nummer = 0;
  const ersatz = zeilen
    .map((z) => {
      if (!zaehlt(z)) return z;
      const m = marke(z);
      const inhalt = m ? z.slice(m.laenge) : z.trimStart();
      if (schonAlle) return inhalt;
      nummer += 1;
      return `${art === "punkte" ? "-" : `${nummer}.`} ${inhalt}`;
    })
    .join("\n");

  // Eine Zeile: Der Cursor bleibt beim selben Wort — gemessen vom Zeilenende,
  // denn vorne hat sich die Marke geändert. Mehrere: Sie bleiben markiert,
  // damit ein zweiter Klick sie wieder zurückverwandelt.
  const vomEnde = (stelle: number) => Math.max(anfang, anfang + ersatz.length - (ende - stelle));
  const auswahl: [number, number] = mehrere
    ? [anfang, anfang + ersatz.length]
    : [vomEnde(von), vomEnde(bis)];
  return { von: anfang, bis: ende, ersatz, auswahl };
}

/**
 * Enter in einem Listenpunkt: der nächste Punkt, mit derselben Marke bzw.
 * der nächsten Nummer. Enter in einem leeren Punkt beendet die Liste — wie in
 * jedem Schreibprogramm, damit niemand die Marke von Hand wegradieren muss.
 *
 * `null`, wenn Enter tun soll, was es immer tut.
 */
export function zeilenumbruch(text: string, stelle: number): Aenderung | null {
  const anfang = text.lastIndexOf("\n", stelle - 1) + 1;
  const e = text.indexOf("\n", stelle);
  const ende = e === -1 ? text.length : e;
  const zeile = text.slice(anfang, ende);
  const m = marke(zeile);
  // Steht der Cursor in der Marke selbst, ist ein Umbruch dort gemeint.
  if (!m || stelle - anfang < m.laenge) return null;
  if (!zeile.slice(m.laenge).trim()) return { von: anfang, bis: ende, ersatz: "", auswahl: [anfang, anfang] };
  const ersatz = `\n${m.vorne}`;
  return { von: stelle, bis: stelle, ersatz, auswahl: [stelle + ersatz.length, stelle + ersatz.length] };
}
