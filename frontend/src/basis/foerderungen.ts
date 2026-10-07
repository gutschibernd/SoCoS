/**
 * Förderungen — was sich ohne Bildschirm rechnen lässt: die Monatsachse der
 * Zeitleiste, das Ziehen eines Balkens, Geld in Cent, die Listen aus Text.
 *
 * **Was ein Antrag braucht (die Reife) steht nicht hier**, sondern am Server
 * (socos/services/foerderung.py). Hier wird nur gezeichnet, was von dort kommt.
 */

import type { Foerderantrag, Foerderfrage, Foerdergeber, Foerderpaket, Foerderprogramm } from "./daten";
import { alsEuro } from "./module";

/* --- Geld ------------------------------------------------------------------ */

/**
 * "12345.67" → 1234567. Gerechnet wird in ganzen Cent — mit Gleitkomma wäre
 * 0.1 + 0.2 nicht 0.3, und „noch 0,01 € frei" stünde neben einer runden Summe.
 */
export function inCent(betrag: string): number {
  const [ganz, rest = ""] = betrag.trim().split(".");
  const vorzeichen = ganz.startsWith("-") ? -1 : 1;
  return vorzeichen * (Math.abs(Number(ganz)) * 100 + Number((rest + "00").slice(0, 2)));
}

/** 1234567 → "12345.67" — wie die Schnittstelle Geld schreibt. */
export function ausCent(cent: number): string {
  const betrag = Math.abs(cent);
  return `${cent < 0 ? "-" : ""}${Math.floor(betrag / 100)}.${String(betrag % 100).padStart(2, "0")}`;
}

export type Geldlage = {
  /** Wie viel der Grenze belegt ist, 0–100, für den Balken. */
  anteil: number;
  /** Was bis zur Grenze frei ist — oder, negativ, wie viel darüber. */
  frei: string | null;
  ueber: boolean;
};

/** Die Summe gegen die Höchstförderung. Ohne Grenze gibt es nichts zu vergleichen. */
export function geldlage(summe: string, grenze: string | null): Geldlage {
  if (grenze === null || inCent(grenze) <= 0) return { anteil: 0, frei: null, ueber: false };
  const s = inCent(summe);
  const g = inCent(grenze);
  return { anteil: Math.min(100, Math.round((s / g) * 100)), frei: ausCent(g - s), ueber: s > g };
}

/** "1504.00" → „1.504 h", "12.50" → „12,5 h". */
export function alsStunden(stunden: string): string {
  return `${Number(stunden).toLocaleString("de-AT", { maximumFractionDigits: 2 })} h`;
}

/** "20.00" → „20 %". */
export function alsProzent(prozent: string): string {
  return `${Number(prozent).toLocaleString("de-AT", { maximumFractionDigits: 2 })} %`;
}

/**
 * Ob ein Paket aufgeschlüsselt ist — dann steht seine Summe gerechnet da,
 * nicht als Betrag zum Eintippen. Stunden zählen nur, wo sie Geld sind: Beim
 * Drittleister bleibt das Paket ein Pauschalbetrag, auch mit Aufwand darin.
 */
export function istAufgeschluesselt(paket: Foerderpaket, stundenSindGeld: boolean): boolean {
  return (stundenSindGeld && paket.stunden.length > 0) || inCent(paket.kosten.sach) > 0;
}

/** Die Summe der Paketkosten, in Cent gerechnet. */
export function paketsumme(pakete: Foerderpaket[]): string {
  return ausCent(pakete.reduce((s, p) => s + inCent(p.kosten.gesamt), 0));
}

/* --- Die Zeitleiste -------------------------------------------------------- */

/**
 * Wie viele Monate die Zeitleiste zeigt: die erlaubte Laufzeit, damit man
 * sieht, wie viel Platz noch ist — mindestens aber so viele, wie der Antrag
 * schon belegt. Ohne Grenze ein Jahr oder die Laufzeit.
 */
export function monatsanzahl(antrag: Foerderantrag, programm: Foerderprogramm): number {
  const { kuerzeste, laengste } = achsengrenzen(antrag, programm);
  // Die eingestellte Achse ist ein Wunsch, keine Schere: Reichen die Pakete
  // weiter, wächst sie mit — sonst verschwände ein Balken stillschweigend.
  return Math.min(Math.max(antrag.zeitachse ?? laengste, kuerzeste), Math.max(laengste, kuerzeste));
}

/**
 * Wie kurz und wie lang der Zeitplan sein darf: vom Ende des letzten Pakets
 * bis zur Höchstlaufzeit des Programms. Länger als das Programm braucht es
 * nicht — dort läge nur, was ohnehin nicht gefördert wird.
 */
export function achsengrenzen(antrag: Foerderantrag, programm: Foerderprogramm): { kuerzeste: number; laengste: number } {
  return { kuerzeste: Math.max(antrag.laufzeit, 1), laengste: programm.max_monate ?? 12 };
}

const MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/**
 * Wie ein Projektmonat heißt: „M3" — oder, sobald ein Beginn feststeht, der
 * Kalendermonat („Mär 27"). Der Beginn ist ein Datum; gezählt wird ab seinem Monat.
 */
export function monatsname(monat: number, beginn: string | null): string {
  if (!beginn) return `M${monat}`;
  const [jahr, mon] = beginn.split("-").map(Number);
  const stelle = mon - 1 + (monat - 1);
  return `${MONATE[stelle % 12]} ${String((jahr + Math.floor(stelle / 12)) % 100).padStart(2, "0")}`;
}

/** „M1–M3", „M4" — oder mit Beginn „Jän 27 – Mär 27". */
export function spanne(von: number, bis: number, beginn: string | null): string {
  if (von === bis) return monatsname(von, beginn);
  return beginn ? `${monatsname(von, beginn)} – ${monatsname(bis, beginn)}` : `M${von}–M${bis}`;
}

export type Griff = "mitte" | "anfang" | "ende";

/**
 * Wohin ein Balken nach dem Ziehen gehört. Die Mitte verschiebt ihn ganz,
 * ein Rand nur diesen Rand — nie über den anderen hinweg und nie aus der
 * Achse hinaus. `um` sind ganze Monate.
 */
export function gezogen(
  paket: { von: number; bis: number },
  griff: Griff,
  um: number,
  anzahl: number,
): { von: number; bis: number } {
  if (griff === "mitte") {
    const dauer = paket.bis - paket.von;
    const von = Math.min(Math.max(1, paket.von + um), Math.max(1, anzahl - dauer));
    return { von, bis: von + dauer };
  }
  if (griff === "anfang") return { von: Math.min(Math.max(1, paket.von + um), paket.bis), bis: paket.bis };
  return { von: paket.von, bis: Math.max(Math.min(anzahl, paket.bis + um), paket.von) };
}

/**
 * Wo ein neues Paket hinkommt: im Anschluss an das, was schon geplant ist,
 * drei Monate lang — solange das in die Achse passt.
 */
export function neuePaketmonate(antrag: Foerderantrag, anzahl: number): { von: number; bis: number } {
  const von = Math.min(antrag.laufzeit + 1, anzahl);
  return { von, bis: Math.min(von + 2, anzahl) };
}

/* --- Listen aus Text ------------------------------------------------------- */

/** Der Steckbrief: eine Zeile je Punkt, „Begriff: Erklärung". Ohne Doppelpunkt ist es nur Text. */
export function steckbriefpunkte(text: string): { begriff: string; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => {
      const i = z.indexOf(": ");
      return i > 0 && i < 40 ? { begriff: z.slice(0, i), text: z.slice(i + 2) } : { begriff: "", text: z };
    });
}

const DA = "✓ ";

/** Was wir noch brauchen: eine Zeile je Punkt, „✓ " davor heißt: ist da. */
export function bedarfspunkte(text: string): { text: string; da: boolean }[] {
  return text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => (z.startsWith("✓") ? { text: z.slice(1).trim(), da: true } : { text: z, da: false }));
}

/** Der Text, nachdem ein Punkt abgehakt oder wieder geöffnet wurde. */
export function bedarfUmschalten(text: string, stelle: number): string {
  return bedarfspunkte(text)
    .map((p, i) => ((i === stelle ? !p.da : p.da) ? DA + p.text : p.text))
    .join("\n");
}

/** Der Text mit einem Punkt mehr — offen, ans Ende. */
export function bedarfDazu(text: string, neu: string): string {
  const punkte = bedarfspunkte(text).map((p) => (p.da ? DA + p.text : p.text));
  return [...punkte, neu.trim()].filter(Boolean).join("\n");
}

/* --- Fragen ---------------------------------------------------------------- */

/** Offen ist eine Frage, solange sie nicht abgehakt ist — ein Antworttext allein genügt nicht. */
export const istOffen = (f: Foerderfrage) => !f.beantwortet;

/** Offene zuerst, in ihrer Reihenfolge; beantwortete rutschen nach unten. */
export function fragenSortiert(fragen: Foerderfrage[]): Foerderfrage[] {
  return [...fragen].sort(
    (a, b) => Number(!istOffen(a)) - Number(!istOffen(b)) || a.reihenfolge - b.reihenfolge || a.id - b.id,
  );
}

/* --- Das Telefonat mit der Förderstelle ------------------------------------ */

/**
 * Die offenen Fragen aller Programme der Fördergeber, die an dieser
 * Organisation hängen — das ist die Liste, die man beim Anruf vor sich hat.
 */
export function offeneFragenDerOrganisation(
  organisation: number,
  geber: Foerdergeber[],
  programme: Foerderprogramm[],
): { programm: Foerderprogramm; fragen: Foerderfrage[] }[] {
  const ihre = new Set(geber.filter((g) => g.organisation === organisation).map((g) => g.id));
  return programme
    .filter((p) => ihre.has(p.geber))
    .map((programm) => ({ programm, fragen: fragenSortiert(programm.fragen).filter(istOffen) }))
    .filter((g) => g.fragen.length > 0);
}

/** „Telefonat 06.10.2026 · Anna Muster" — die Quelle, die an der Antwort steht. */
export function telefonatQuelle(datum: string, mitWem: string): string {
  const [j, m, t] = datum.split("-");
  return [`Telefonat ${t}.${m}.${j}`, mitWem].filter(Boolean).join(" · ");
}

/**
 * Die neue Antwort kommt **unter** das, was schon an der Frage stand.
 *
 * Zu einer offenen Frage steht oft schon ein halber Satz — meist der Verweis
 * auf die Richtlinie. Überschrieben wäre er weg, und das Telefonat ersetzt
 * ihn nicht, es ergänzt ihn. Die Quelle davor sagt, woher der neue Teil kommt.
 */
export function antwortErgaenzen(bisher: string, neu: string, quelle: string): string {
  return bisher.trim() ? `${bisher.trim()}\n\n${quelle}: ${neu.trim()}` : neu.trim();
}

/**
 * Der Text des Verlaufseintrags: jede beantwortete Frage mit ihrer Antwort,
 * darunter, was offen geblieben ist.
 *
 * **Warum die offenen mit drinstehen:** In einem halben Jahr liest man den
 * Eintrag und fragt sich, ob man danach überhaupt gefragt hat. Die Antwort
 * steht dann da: ja, und es blieb offen.
 */
export function telefonatText(fragen: Foerderfrage[], antworten: Record<number, string>): string {
  const beantwortet = fragen.filter((f) => antworten[f.id]?.trim());
  const offen = fragen.filter((f) => !antworten[f.id]?.trim());
  const teile = beantwortet.map((f) => `${f.frage}\n→ ${antworten[f.id].trim()}`);
  if (offen.length) teile.push(["Offen geblieben:", ...offen.map((f) => `– ${f.frage}`)].join("\n"));
  return teile.join("\n\n");
}

/** „3 offen", „alle beantwortet", „noch keine". */
export function fragenStand(fragen: Foerderfrage[]): string {
  if (fragen.length === 0) return "noch keine";
  const offen = fragen.filter(istOffen).length;
  return offen === 0 ? "alle beantwortet" : `${offen} offen`;
}

/* --- Der Antrag ------------------------------------------------------------ */

export const STAENDE: { wert: Foerderantrag["stand"]; text: string }[] = [
  { wert: "entwurf", text: "Entwurf" },
  { wert: "eingereicht", text: "eingereicht" },
  { wert: "bewilligt", text: "bewilligt" },
  { wert: "abgelehnt", text: "abgelehnt" },
];

export const ROLLEN: { wert: Foerderantrag["rolle"]; text: string }[] = [
  { wert: "foerderwerber", text: "Förderwerber" },
  { wert: "drittleister", text: "Drittleister" },
];

export const antragsstandText = (stand: Foerderantrag["stand"]) => STAENDE.find((s) => s.wert === stand)?.text ?? stand;

/** Wie viele Punkte der Reife erfüllt sind. */
export function reifezahl(antrag: Foerderantrag): { erfuellt: number; von: number } {
  return { erfuellt: antrag.reife.filter((p) => p.erfuellt).length, von: antrag.reife.length };
}

/* --- Der Projektinhalt zum Mitnehmen --------------------------------------- */

const LEER = "_(noch leer)_";
const oderLeer = (text: string) => text.trim() || LEER;

/**
 * Der ganze Antrag als Markdown, um ihn einem Sprachmodell zu geben:
 * Eckdaten, Texte, Arbeitspakete, Zeitplan, Reife, Bedarf, Fragen.
 *
 * **Leere Felder stehen ausdrücklich als „noch leer" da**, statt wegzufallen —
 * sonst erfindet das Modell den fehlenden Abschnitt, statt nach ihm zu fragen.
 * Der Zeitplan steht zweimal: als Liste mit Monaten (lesbar) und als Raster
 * in einem Codeblock (damit Überschneidungen sichtbar sind).
 */
export function projektinhalt(antrag: Foerderantrag, programm: Foerderprogramm, geber: Foerdergeber | null): string {
  const pakete = [...antrag.pakete].sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);
  const anzahl = monatsanzahl(antrag, programm);
  const z: string[] = [];

  z.push(`# Förderantrag: ${antrag.titel || "(ohne Titel)"}`, "");
  z.push("## Eckdaten", "");
  if (geber) z.push(`- **Fördergeber:** ${geber.kurz ? `${geber.name} (${geber.kurz})` : geber.name}`);
  z.push(`- **Programm:** ${programm.name}`);
  if (programm.stelle) z.push(`- **Förderstelle:** ${programm.stelle}`);
  if (programm.link) z.push(`- **Richtlinie / Link:** ${programm.link}`);
  z.push(`- **Antrag:** Nr. ${antrag.nummer} · Stand: ${antragsstandText(antrag.stand)}`);
  z.push(`- **Förderwerber:** ${antrag.foerderwerber || "noch offen"}`);
  if (!antrag.stunden_sind_geld) z.push("- **Unsere Rolle:** Drittleister");
  z.push(`- **Geplanter Beginn:** ${antrag.beginn ?? "noch offen"}`);
  z.push(
    `- **Laufzeit:** ${antrag.laufzeit} Monate` + (programm.max_monate ? ` (höchstens ${programm.max_monate})` : ""),
  );
  z.push(
    `- **Beantragte Fördersumme:** ${alsEuro(antrag.summe)}` +
      (programm.max_foerderung ? ` (Höchstförderung ${alsEuro(programm.max_foerderung)})` : ""),
  );
  z.push(
    `- **Zeichengrenzen im Online-Formular:** Kurzbezeichnung ${antrag.zeichen.titel}, Beschreibung ${antrag.zeichen.beschreibung}`,
  );

  const steckbrief = steckbriefpunkte(programm.steckbrief);
  if (steckbrief.length) {
    z.push("", "## Richtlinie in Kürze", "");
    for (const p of steckbrief) z.push(p.begriff ? `- **${p.begriff}:** ${p.text}` : `- ${p.text}`);
  }

  z.push("", "## Beschreibung des Vorhabens", "", oderLeer(antrag.beschreibung));
  for (const a of antrag.abschnitte) z.push("", `## ${a.titel}`, "", oderLeer(a.text));

  if (antrag.stundensatz || antrag.foerderquote || antrag.posten.length) {
    const k = antrag.kosten;
    z.push("", "## Kalkulation", "");
    if (antrag.stunden_sind_geld)
      z.push(`- **Personal:** ${alsStunden(k.stunden)} × ${antrag.stundensatz ? alsEuro(antrag.stundensatz) : "noch offen"} = ${alsEuro(k.personal)}`);
    z.push(`- **Sach- und Materialkosten:** ${alsEuro(k.sach)}`);
    for (const posten of antrag.posten) z.push(`  - ${posten.bezeichnung}: ${alsEuro(posten.betrag)}`);
    if (inCent(k.pauschal) > 0) z.push(`- **Pauschalbeträge der Pakete:** ${alsEuro(k.pauschal)}`);
    z.push(`- **Direkte Kosten:** ${alsEuro(k.direkt)}`);
    if (antrag.gemeinkosten) z.push(`- **Gemeinkosten ${alsProzent(antrag.gemeinkosten)}:** ${alsEuro(k.gemeinkosten)}`);
    z.push(`- **Gesamtkosten:** ${alsEuro(k.gesamt)}`);
    if (antrag.foerderquote) z.push(`- **Zuschuss ${alsProzent(antrag.foerderquote)}:** ${alsEuro(k.zuschuss)}`);
    if (inCent(k.eigenmittel) > 0) z.push(`- **Eigenmittel:** ${alsEuro(k.eigenmittel)}`);
  }

  z.push("", "## Arbeitspakete", "");
  if (pakete.length === 0) z.push(LEER);
  pakete.forEach((p, i) => {
    z.push(`### AP${i + 1} · ${p.titel || "(ohne Titel)"}`, "");
    const monate = spanne(p.von, p.bis, null);
    z.push(`- **Zeitraum:** ${monate}${antrag.beginn ? ` (${spanne(p.von, p.bis, antrag.beginn)})` : ""}`);
    z.push(`- **Dauer:** ${p.bis - p.von + 1} Monate`);
    if (p.stunden.length)
      z.push(
        `- **${antrag.stunden_sind_geld ? "Stunden" : "Geschätzter Aufwand"}:** ` +
          p.stunden.map((s) => `${s.name} ${alsStunden(s.stunden)}`).join(", "),
      );
    z.push(`- **Kosten:** ${inCent(p.kosten.gesamt) > 0 ? alsEuro(p.kosten.gesamt) : "noch offen"}`);
    z.push(`- **Ziel:** ${p.ziel.trim() || "noch leer"}`);
    z.push(`- **Ergebnis:** ${p.ergebnis.trim() || "noch leer"}`, "");
  });

  if (pakete.length) {
    z.push("## Zeitplan", "", "```");
    const breite = String(anzahl).length + 1;
    const kopf = Array.from({ length: anzahl }, (_, i) => `M${i + 1}`.padStart(breite)).join(" ");
    z.push(`${"".padEnd(5)} ${kopf}`);
    pakete.forEach((p, i) => {
      const zellen = Array.from({ length: anzahl }, (_, m) =>
        (m + 1 >= p.von && m + 1 <= p.bis ? "█" : "·").repeat(breite),
      ).join(" ");
      z.push(`${`AP${i + 1}`.padEnd(5)} ${zellen}`);
    });
    z.push("```", "");
  }

  if (antrag.reife.length) {
    const { erfuellt, von } = reifezahl(antrag);
    z.push(`## Antragsreife (${erfuellt} von ${von})`, "");
    for (const p of antrag.reife) z.push(`- [${p.erfuellt ? "x" : " "}] ${p.text}${p.hinweis ? ` — ${p.hinweis}` : ""}`);
    z.push("");
  }

  const bedarf = bedarfspunkte(antrag.datenbedarf);
  if (bedarf.length) {
    z.push("## Was wir noch brauchen", "");
    for (const p of bedarf) z.push(`- [${p.da ? "x" : " "}] ${p.text}`);
    z.push("");
  }

  if (programm.fragen.length) {
    z.push(`## Fragen an die Förderstelle (${fragenStand(programm.fragen)})`, "");
    for (const f of fragenSortiert(programm.fragen)) {
      z.push(`- [${f.beantwortet ? "x" : " "}] ${f.frage}`);
      if (f.antwort.trim()) z.push(`  - Antwort: ${f.antwort.trim().replace(/\r?\n/g, " ")}`);
    }
    z.push("");
  }

  return z.join("\n").trimEnd() + "\n";
}
