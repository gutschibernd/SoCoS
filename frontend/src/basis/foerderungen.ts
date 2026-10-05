/**
 * Förderungen — was sich ohne Bildschirm rechnen lässt: die Monatsachse der
 * Zeitleiste, das Ziehen eines Balkens, Geld in Cent, die Listen aus Text.
 *
 * **Was ein Antrag braucht (die Reife) steht nicht hier**, sondern am Server
 * (socos/services/foerderung.py). Hier wird nur gezeichnet, was von dort kommt.
 */

import type { Foerderantrag, Foerderfrage, Foerderprogramm } from "./daten";

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

/* --- Die Zeitleiste -------------------------------------------------------- */

/**
 * Wie viele Monate die Zeitleiste zeigt: die erlaubte Laufzeit, damit man
 * sieht, wie viel Platz noch ist — mindestens aber so viele, wie der Antrag
 * schon belegt. Ohne Grenze ein Jahr oder die Laufzeit.
 */
export function monatsanzahl(antrag: Foerderantrag, programm: Foerderprogramm): number {
  return Math.max(programm.max_monate ?? 12, antrag.laufzeit, 1);
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

export const antragsstandText = (stand: Foerderantrag["stand"]) => STAENDE.find((s) => s.wert === stand)?.text ?? stand;

/** Wie viele Punkte der Reife erfüllt sind. */
export function reifezahl(antrag: Foerderantrag): { erfuellt: number; von: number } {
  return { erfuellt: antrag.reife.filter((p) => p.erfuellt).length, von: antrag.reife.length };
}
