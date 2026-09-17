/**
 * Was die Meetingseite rechnet — an einer Stelle, damit es prüfbar ist.
 *
 * Zwei Dinge stehen hier, und sie gehören zusammen: der **Auftrag**, den der
 * Kopierknopf einem LLM mitgibt, und der **Parser**, der das Ergebnis wieder
 * zerlegt. Beide beschreiben dasselbe Format. Stünden sie in zwei Dateien —
 * oder gar eine Hälfte im Backend —, hätte die eine Seite beim nächsten
 * Nachbessern ein Format, das die andere nicht mehr liest, und auffallen
 * würde es erst an einem Protokoll, das als ein einziger Klumpen hereinkommt.
 */

import type { Kontakt, Meeting } from "./daten";

/* --- Die Liste ------------------------------------------------------------ */

export function passtMeeting(meeting: Meeting, suche: string): boolean {
  const wort = suche.trim().toLowerCase();
  if (!wort) return true;
  const felder = [
    meeting.titel,
    meeting.ort,
    ...meeting.personen.map((p) => `${p.name} ${p.organisation_name}`),
    ...meeting.haeuser.map((h) => h.name),
    ...meeting.teilnehmer_namen,
    // Auch im Inhalt: „wo haben wir über die Abrechnung geredet?" ist die
    // Frage, mit der man ein halbes Jahr später hierherkommt.
    meeting.vorbereitung,
    meeting.mitschrift,
    ...meeting.abschnitte.map((a) => `${a.ueberschrift} ${a.text}`),
  ];
  return felder.join(" ").toLowerCase().includes(wort);
}

/* --- Personen finden ------------------------------------------------------ */

/**
 * Die besten Treffer für „wen trag ich ein" — wenige, gereiht, nicht alle.
 *
 * **Warum eine Rangfolge und nicht bloß ein Filter:** Wer „be" tippt, meint
 * Berger, nicht Lieberwirth — obwohl beide die zwei Buchstaben enthalten. Ein
 * Name, der so *beginnt*, steht vor einem, in dem ein Wort so beginnt, und der
 * vor einem, der es nur irgendwo enthält. Das Haus und die Funktion zählen
 * zuletzt: „nord" soll die Leute der Förderstelle Nord finden, aber nicht vor
 * jemandem, der Nordmann heißt.
 *
 * Mehrere Wörter müssen alle passen („berger nord"), jedes für sich irgendwo.
 * Gleichstand entscheidet der Name — damit die Liste bei jedem Tippen stabil
 * bleibt und nicht springt.
 */
export function besteTreffer(kontakte: Kontakt[], suche: string, anzahl = 3): Kontakt[] {
  const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];

  const gewichtet = kontakte
    .map((k) => ({ k, gewicht: gewichtVon(k, woerter) }))
    .filter((t) => t.gewicht > 0)
    .sort((a, b) => b.gewicht - a.gewicht || a.k.name.localeCompare(b.k.name, "de"));

  return gewichtet.slice(0, anzahl).map((t) => t.k);
}

function gewichtVon(k: Kontakt, woerter: string[]): number {
  const name = k.name.toLowerCase();
  const nebenbei = `${k.organisation_name} ${k.funktion}`.toLowerCase();
  let summe = 0;
  for (const wort of woerter) {
    let gewicht = 0;
    if (name.startsWith(wort)) gewicht = 4;
    else if (name.split(/[\s-]+/).some((teil) => teil.startsWith(wort))) gewicht = 3;
    else if (name.includes(wort)) gewicht = 2;
    else if (nebenbei.includes(wort)) gewicht = 1;
    // Ein Wort, das nirgends passt, lässt den ganzen Kontakt durchfallen.
    if (gewicht === 0) return 0;
    summe += gewicht;
  }
  return summe;
}

/**
 * Kommend und vergangen, jeweils in der Richtung sortiert, in der man liest:
 * das Nächste zuerst, das zuletzt Gewesene zuerst.
 *
 * Der heutige Tag zählt zu „kommend", solange er läuft — ein Meeting um 16:00
 * gehört am Morgen nicht unter „vergangen".
 */
export function teileNachZeit(
  meetings: Meeting[],
  heute: string,
): { kommend: Meeting[]; vergangen: Meeting[] } {
  const reihung = (a: Meeting, b: Meeting, richtung: 1 | -1) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? -richtung : richtung;
    const au = a.uhrzeit ?? "";
    const bu = b.uhrzeit ?? "";
    if (au !== bu) return au < bu ? -richtung : richtung;
    return a.titel.localeCompare(b.titel);
  };
  return {
    kommend: meetings.filter((m) => m.datum >= heute).sort((a, b) => reihung(a, b, 1)),
    vergangen: meetings.filter((m) => m.datum < heute).sort((a, b) => reihung(a, b, -1)),
  };
}

/** „14.10.2026" oder „14.10.2026, 14:30" — die Uhrzeit nur, wenn es eine gibt. */
export function wann(meeting: Pick<Meeting, "datum" | "uhrzeit">): string {
  const tag = new Date(`${meeting.datum}T00:00:00`).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  // Sekunden kommen aus der Datenbank mit („14:30:00") und stehen in keiner
  // Besprechung auf dem Zettel.
  return meeting.uhrzeit ? `${tag}, ${meeting.uhrzeit.slice(0, 5)}` : tag;
}

/* --- Der Weg über ein LLM ------------------------------------------------- */

/**
 * Der Auftrag, der mit der Mitschrift in die Zwischenablage geht.
 *
 * **Warum die Regeln hier stehen und nicht im Kopf des Nutzers:** Ein Protokoll
 * ist eine Aussage darüber, was besprochen wurde. Ein Sprachmodell, das man
 * nur bittet, „das schön zu machen", füllt Lücken — es schreibt das Ergebnis
 * hin, das zur Aufzählung passt, und die Zusage, die man erwarten würde. Genau
 * das darf in einem Protokoll nicht passieren, und genau das fällt beim
 * Gegenlesen am wenigsten auf: Der erfundene Satz ist der, der sich am besten
 * liest.
 *
 * Die **Vorbereitung geht mit — aber in einem eigenen Block, mit eigener
 * Regel.** Sie ist der Plan, nicht das Gespräch, und genau das ist die Gefahr:
 * Läge sie unmarkiert daneben, machte das Modell aus „wollten wir ansprechen"
 * still ein „wurde besprochen", im fertigen Protokoll nicht mehr zu
 * unterscheiden. Deshalb steht sie getrennt, und die Regel sagt, wofür sie da
 * ist: Zusammenhang, Namen, Abkürzungen — und ein Abschnitt darüber, was vom
 * Plan *nicht* zur Sprache kam. Das ist das, woran sich die Vorbereitung
 * hinterher misst.
 */
export function auftragFuerLLM(meeting: Meeting): string {
  const rahmen = [
    `Titel: ${meeting.titel}`,
    `Datum: ${wann(meeting)}`,
    meeting.ort ? `Ort: ${meeting.ort}` : "",
    meeting.teilnehmer_namen.length ? `Von uns: ${meeting.teilnehmer_namen.join(", ")}` : "",
    meeting.personen.length
      ? `Von außen: ${meeting.personen
          .map((p) => (p.organisation_name ? `${p.name} (${p.organisation_name})` : p.name))
          .join(", ")}`
      : "",
    meeting.haeuser.length ? `Organisationen: ${meeting.haeuser.map((h) => h.name).join(", ")}` : "",
  ].filter(Boolean);

  const vorbereitung = meeting.vorbereitung.trim();

  return `Du bekommst die rohe Mitschrift einer Besprechung${vorbereitung ? " und die Vorbereitung, die vorher dazu geschrieben wurde" : ""}. Mach daraus ein lesbares Protokoll.

Regeln:
1. Erfinde nichts. Keine Ergebnisse, Zahlen, Namen, Termine oder Zusagen, die nicht in der Mitschrift stehen. Lieber eine kurze Zeile als ein runder Satz.
2. Lass nichts weg. Jeder Punkt der Mitschrift kommt vor, auch der halbe Satz.
3. Deute nicht. Was unklar ist, bleibt unklar — schreib "unklar:" davor, statt es glattzuziehen.
4. Keine Einleitung, kein Fazit, keine Höflichkeit von dir. Nur das Protokoll.
5. Gliedere in Abschnitte. Jeder Abschnitt beginnt mit einer Überschrift in einer eigenen Zeile, eingeleitet mit zwei Rauten:

## Überschrift

   Darunter der Text: kurze Absätze oder Aufzählungen mit "- ". Keine weiteren Überschriften innerhalb eines Abschnitts.
6. Sinnvolle Abschnitte, soweit die Mitschrift etwas dazu hergibt: Anlass, Besprochen, Entscheidungen, Offene Punkte, Nächste Schritte. Bei nächsten Schritten steht dahinter, wer und bis wann — aber nur, wenn es dasteht.${
    vorbereitung
      ? `
7. Die Vorbereitung ist der Plan, nicht das Gespräch. Sie hilft dir, Namen, Abkürzungen und den Zusammenhang der Mitschrift zu verstehen — aber nichts daraus wird zu etwas, das besprochen, entschieden oder zugesagt wurde, solange es nicht in der Mitschrift steht. Was in der Vorbereitung vorkommt und in der Mitschrift nicht, kommt als Stichwort in einen letzten Abschnitt "Nicht zur Sprache gekommen".
8. Antworte auf Deutsch und ausschließlich mit dem Protokoll.`
      : `
7. Antworte auf Deutsch und ausschließlich mit dem Protokoll.`
  }

Rahmen:
${rahmen.join("\n")}
${
  vorbereitung
    ? `
--- VORBEREITUNG (vorher geschrieben, kein Gesprächsinhalt) ---
${vorbereitung}
--- ENDE DER VORBEREITUNG ---
`
    : ""
}
--- MITSCHRIFT ---
${meeting.mitschrift.trim()}
--- ENDE DER MITSCHRIFT ---`;
}

export type Abschnittsentwurf = { ueberschrift: string; text: string };

const UEBERSCHRIFT = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Zerlegt das zurückgegebene Protokoll an seinen Überschriften.
 *
 * **Was vor der ersten Überschrift steht, geht nicht verloren**, sondern wird
 * ein Abschnitt ohne Überschrift. Ein Modell, das sich nicht an das Format
 * hält, darf einen Text kosten, den jemand gerade eingefügt hat — es würde
 * sonst genau dann still verschwinden, wenn das Format nicht eingehalten
 * wurde, also im einzigen Fall, in dem man hinsehen müsste.
 *
 * Ein Codeblock drumherum (``` … ```) fliegt weg: Manche Modelle verpacken die
 * ganze Antwort so, und die Zeile mit den Rauten wäre sonst der erste
 * Abschnittstitel.
 */
export function abschnitteAusText(roh: string): Abschnittsentwurf[] {
  const zeilen = ohneCodezaun(roh).split(/\r?\n/);
  const abschnitte: Abschnittsentwurf[] = [];
  let offen: { ueberschrift: string; zeilen: string[] } = { ueberschrift: "", zeilen: [] };

  const ablegen = () => {
    const text = offen.zeilen.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (offen.ueberschrift || text) abschnitte.push({ ueberschrift: offen.ueberschrift, text });
  };

  for (const zeile of zeilen) {
    const treffer = zeile.match(UEBERSCHRIFT);
    if (treffer) {
      ablegen();
      offen = { ueberschrift: treffer[2].trim().slice(0, 200), zeilen: [] };
    } else {
      offen.zeilen.push(zeile);
    }
  }
  ablegen();
  return abschnitte;
}

function ohneCodezaun(roh: string): string {
  const text = roh.trim();
  if (!text.startsWith("```")) return text;
  const zeilen = text.split(/\r?\n/);
  zeilen.shift();
  if (zeilen[zeilen.length - 1]?.trim().startsWith("```")) zeilen.pop();
  return zeilen.join("\n");
}
