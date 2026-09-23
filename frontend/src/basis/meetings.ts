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
    // Auch in der Mail, die zum Termin geführt hat — „wo stand der Stundensatz?"
    ...meeting.anhaenge.map((a) => `${a.name} ${a.text}`),
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

/** „740 KB", „16,4 MB" — genug, um zu sehen, ob da die Mail mit den Ausweisen hängt. */
export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("de-AT", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Von wem und wann eine angehängte Mail ist — aus den Kopfzeilen, die der
 * Server beim Hochladen vor ihren Text setzt (`socos/services/mailtext.py`).
 * Der Name ohne Adresse: In der Zeile unter dem Dateinamen zählt, wer es war.
 */
export function mailkopf(text: string): { von: string; datum: string; betreff: string } {
  const zeile = (name: string) =>
    text.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";
  const von = zeile("Von").replace(/\s*<[^>]*>\s*$/, "").replace(/^"(.*)"$/, "$1");
  return { von, datum: zeile("Datum"), betreff: zeile("Betreff") };
}

/** Eine .eml — am Namen, oder am Typ, den manche Mailprogramme beim Ziehen setzen. */
export function istMaildatei(datei: { name: string; type: string }): boolean {
  return datei.name.toLowerCase().endsWith(".eml") || datei.type === "message/rfc822";
}

/**
 * Ob eine Mail Anhänge hat — nur, um zu wissen, ob gefragt werden muss.
 *
 * **Grob mit Absicht:** Ein Teil mit Dateinamen trägt `filename=` im Kopf,
 * ein Mailtext ohne Anhang nie. Zerlegt wird die Mail am Server; hier genügt
 * es, keinen zu fragen, der nichts anzuhängen hat. Irrt sich die Probe, steht
 * eine Frage zu viel da — nie ein Ausweis zu viel auf dem Server, denn ohne
 * Frage geht die Mail so hoch, wie sie ist, und die Probe schlägt eher zu oft
 * an als zu selten.
 */
export function mailHatAnhaenge(roh: string): boolean {
  return /\bfilename\*?(?:\d+\*?)?\s*=/i.test(roh);
}

/**
 * Den Text einer angehängten Mail in Kopf und Inhalt teilen — der Server
 * schreibt die Kopfzeilen vor die erste Leerzeile (`socos/services/mailtext.py`).
 */
export function mailTeilen(text: string): {
  kopf: { name: string; wert: string }[];
  inhalt: string;
} {
  const grenze = text.indexOf("\n\n");
  const oben = grenze < 0 ? text : text.slice(0, grenze);
  const inhalt = grenze < 0 ? "" : text.slice(grenze + 2).trim();
  const kopf = oben
    .split("\n")
    .map((zeile) => zeile.match(/^([^:]{1,40}): (.*)$/))
    .filter((t): t is RegExpMatchArray => Boolean(t))
    .map((t) => ({ name: t[1], wert: t[2] }));
  return { kopf, inhalt };
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
 * Wie wir heißen. Steht im Auftrag, weil ein Transkript den Namen verhört —
 * aus „Sopharmis" wird „Sofarmis", und das Modell schreibt es dann zwanzigmal
 * so ins Protokoll.
 */
export const UNSERE_FIRMA = "Sopharmis Medical Solutions FlexCo";

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
 * **Was die erste Fassung falsch machte** und diese deshalb anders macht:
 *
 * - „Lass nichts weg, auch den halben Satz" — bei Stichworten richtig, bei
 *   einem Transkript ein Protokoll voller Begrüßung und Wiederholung. Jetzt:
 *   *inhaltlich* vollständig, jede Zahl, Frist und Zusage; Füllwerk darf weg.
 * - Feste Abschnitte „Besprochen, Entscheidungen, …" zerrissen jedes Thema in
 *   drei Teile. Jetzt: ein Abschnitt je Thema, das Entschiedene darin markiert,
 *   davor eine Kurzfassung, danach die Aufgaben mit Wer und Wann.
 * - Keine Schreibweisen: Das Modell übernahm jeden Hörfehler des Transkripts.
 *   Jetzt steht der Rahmen mit Rollen und Häusern da und die Regel, Namen
 *   danach zu schreiben.
 * - Markdown-Tabellen und Fettdruck, die in SoCoS als Zeichensalat ankommen,
 *   weil Abschnitte als reiner Text stehen.
 *
 * **Vorbereitung und Unterlagen gehen mit — getrennt, mit eigener Regel.** Sie
 * sind Plan und Hintergrund, nicht das Gespräch, und genau das ist die
 * Gefahr: Lägen sie unmarkiert daneben, machte das Modell aus „wollten wir
 * ansprechen" oder „schreibt der Steuerberater" still ein „wurde besprochen".
 * Was davon *nicht* zur Sprache kam, bekommt einen eigenen Abschnitt — daran
 * misst sich die Vorbereitung hinterher.
 *
 * Unterlagen sind die Anhänge, deren Text SoCoS kennt (E-Mails). Von allen
 * anderen geht nur der Name mit.
 */
export function auftragFuerLLM(meeting: Meeting): string {
  const vorbereitung = meeting.vorbereitung.trim();
  const unterlagen = meeting.anhaenge.filter((a) => a.text.trim());
  const nurNamen = meeting.anhaenge.filter((a) => !a.text.trim());
  const mitHintergrund = Boolean(vorbereitung || unterlagen.length);

  const person = (p: Meeting["personen"][number]) => {
    const dazu = [p.funktion, p.organisation_name].filter(Boolean).join(", ");
    return dazu ? `${p.name} (${dazu})` : p.name;
  };

  const rahmen = [
    `- Titel: ${meeting.titel}`,
    `- Datum: ${wann(meeting)}`,
    meeting.ort ? `- Ort: ${meeting.ort}` : "",
    `- Unsere Firma: ${UNSERE_FIRMA}`,
    meeting.teilnehmer_namen.length ? `- Von uns: ${meeting.teilnehmer_namen.join(", ")}` : "",
    meeting.personen.length ? `- Von außen: ${meeting.personen.map(person).join("; ")}` : "",
    meeting.haeuser.length
      ? `- Organisationen: ${meeting.haeuser.map((h) => h.name).join(", ")}`
      : "",
    nurNamen.length
      ? `- Weitere Dateien am Meeting (nur der Name, Inhalt liegt nicht bei): ${nurNamen
          .map((a) => a.name)
          .join(", ")}`
      : "",
  ].filter(Boolean);

  const quellen = [
    "- MITSCHRIFT: Stichworte oder ein automatisches Transkript. Die einzige Quelle dafür, was besprochen, entschieden oder zugesagt wurde.",
    vorbereitung
      ? "- VORBEREITUNG: vorher geschrieben — was wir aus dem Termin holen wollten. Der Plan, nicht das Gespräch."
      : "",
    unterlagen.length
      ? "- UNTERLAGEN: E-Mails rund um den Termin. Hintergrund, nicht das Gespräch."
      : "",
    "- RAHMEN: Titel, Tag und wer dabei war — maßgeblich dafür, wie Namen geschrieben werden.",
  ].filter(Boolean);

  const regeln = [
    "Erfinde nichts. Kein Ergebnis, keine Zahl, kein Name, keine Frist und keine Zusage, die nicht in der Mitschrift steht. Lieber eine knappe Zeile als ein runder Satz.",
    "Bleib inhaltlich vollständig: Jede Aussage mit Gehalt, jede Zahl, jeder Betrag, jede Frist und jede Zusage kommt vor. Weglassen darfst du nur Begrüßung, Smalltalk, Füllwörter und Wiederholungen.",
    'Unklares bleibt unklar. Was sich nicht eindeutig lesen lässt, widersprüchlich ist oder nur halb gesagt wurde, bekommt "unklar:" davor — nicht glätten, nicht raten.',
    `Transkripte verhören sich. Namen von Personen und Firmen und Fachbegriffe schreibst du so, wie sie im Rahmen${unterlagen.length ? " und in den Unterlagen" : ""} stehen. Ist ein Wort offensichtlich falsch erkannt und das richtige sicher, verbessere es still; ist es nicht sicher, schreib "unklar:" und das Gehörte in Anführungszeichen.`,
    "Wer etwas gesagt hat oder übernimmt, schreibst du nur dazu, wenn es aus der Mitschrift hervorgeht.",
    mitHintergrund
      ? `${[vorbereitung ? "Vorbereitung" : "", unterlagen.length ? "Unterlagen" : ""].filter(Boolean).join(" und ")} helfen dir, Zusammenhang, Namen und Abkürzungen zu verstehen. Nichts daraus wird zu etwas, das besprochen, entschieden oder zugesagt wurde, solange es nicht in der Mitschrift steht. Widersprechen sich Mitschrift und ${unterlagen.length ? "Unterlage" : "Vorbereitung"} (andere Zahl, andere Frist, anderer Name), gilt das Gespräch — und der Widerspruch steht als "unklar:" dabei.`
      : "",
  ].filter(Boolean);

  const aufbau = [
    "## Kurzfassung",
    "Drei bis fünf Sätze: worum es ging, was herausgekommen ist, was als Nächstes passiert.",
    "",
    "## (ein Abschnitt je Thema)",
    'In der Reihenfolge des Gesprächs. Die Überschrift nennt das Thema ("Einbringung der Geräte"), nicht die Art ("Besprochen"). Darin knappe Aufzählungen mit "- ". Was entschieden wurde, beginnt mit "Entschieden:".',
    "",
    "## Offene Fragen",
    "Nur wenn es welche gibt: was ungeklärt blieb, und bei wem es liegt, falls das gesagt wurde.",
    "",
    "## Aufgaben",
    'Eine Zeile je Aufgabe: "- Wer: Was — bis wann". Fehlt Wer oder Wann in der Mitschrift, steht dort "offen".',
    ...(mitHintergrund
      ? [
          "",
          "## Nicht zur Sprache gekommen",
          `Was ${[vorbereitung ? "in der Vorbereitung als Ziel oder Frage stand" : "", unterlagen.length ? "in den Unterlagen erbeten oder angekündigt wurde" : ""].filter(Boolean).join(" oder ")} und in der Mitschrift nicht vorkommt — als Stichwort. Gibt es nichts, lass den Abschnitt weg.`,
        ]
      : []),
  ];

  const bloecke = [
    vorbereitung
      ? `--- VORBEREITUNG (vorher geschrieben, kein Gesprächsinhalt) ---\n${vorbereitung}\n--- ENDE DER VORBEREITUNG ---`
      : "",
    ...unterlagen.map(
      (a, i) =>
        `--- UNTERLAGE ${i + 1}: ${a.art === "email" ? "E-Mail" : "Datei"} „${a.name}“ (Hintergrund, kein Gesprächsinhalt) ---\n${a.text.trim()}\n--- ENDE DER UNTERLAGE ${i + 1} ---`,
    ),
    `--- MITSCHRIFT ---\n${meeting.mitschrift.trim()}\n--- ENDE DER MITSCHRIFT ---`,
  ].filter(Boolean);

  return `Du schreibst das Protokoll einer Besprechung von ${UNSERE_FIRMA}. Es wird abgelegt und später von jemandem gelesen, der nicht dabei war: Es muss ohne Rückfrage verständlich sein und darf nichts behaupten, was nicht gesagt wurde.

WAS DU BEKOMMST
${quellen.join("\n")}

REGELN
${regeln.map((r, i) => `${i + 1}. ${r}`).join("\n")}

AUFBAU
Das Protokoll besteht aus Abschnitten. Jeder beginnt mit einer eigenen Zeile "## Überschrift". In dieser Reihenfolge:

${aufbau.join("\n")}

FORM
- Überschriften nur für die Abschnitte, immer mit "##". Keine anderen Überschriften (#, ###), keine Tabellen, kein Fettdruck, kein Codeblock — das Protokoll wird als reiner Text angezeigt.
- Deutsch, sachlich, knapp. Ganze Sätze nur in der Kurzfassung.
- Antworte ausschließlich mit dem Protokoll: keine Einleitung, keine Rückfrage, kein Schlusswort.

RAHMEN
${rahmen.join("\n")}

${bloecke.join("\n\n")}`;
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
