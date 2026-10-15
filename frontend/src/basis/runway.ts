/**
 * Die Runway-Planung im Frontend: Beträge und Monate benennen, die Achse der
 * Linie wählen, die Zeilen der Zeitachse zusammenstellen, Tabellen als CSV.
 *
 * **Gerechnet wird am Server** (`socos/services/runway.py`). Was hier steht,
 * ist Darstellung — die Helfer des Runway-Planers (`kfmt`, `fmtE`, `niceStep`,
 * die Zeilen der Zeitachse aus `drawCharts`), aus dem das Modul stammt.
 */

import type { Planeintrag, Runwayplan, Runwayrechnung } from "./daten";

export const MON = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const MONL = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const EUR = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const GANZ = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 });

/** Eine Zahl aus dem Plan oder der Rechnung — leer und Unsinn sind 0 (`num` des Planers). */
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** `x0` des Planers: leer heißt Ersatz, 0 bleibt 0. */
export const x0 = (v: unknown, ersatz: number): number => (v === "" || v === null || v === undefined ? ersatz : num(v));

/** „€ 16.679" — ganze Euro, mit echtem Minus. */
export const fmtE = (v: string | number) => EUR.format(Math.round(num(v))).replace("-", "−");

/** „16.679" ohne Währung, „–" für null — die Zellen der Übersichten. */
export const zelle = (v: string | number) => (Math.round(num(v)) ? GANZ.format(Math.round(num(v))).replace("-", "−") : "–");

/** „12k", „1,5 Mio" — für Achsen und die Zeitachse. */
export function kfmt(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString("de-AT", { maximumFractionDigits: 2 })} Mio`;
  if (a >= 1000) return `${s}${(a / 1000).toLocaleString("de-AT", { maximumFractionDigits: a < 10000 ? 1 : 0 })}k`;
  return `${s}${Math.round(a)}`;
}

/** „1.250,50" oder „1250.5" → 1250.5; leer → null; Unsinn → NaN. */
export function parseDe(text: string): number | null {
  let s = String(text ?? "").trim().replace(/[\s€]/g, "").replace("−", "-");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

/** Ein runder Achsenschritt (`niceStep` des Planers). */
export function niceStep(r: number): number {
  const p = 10 ** Math.floor(Math.log10(r));
  const f = r / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Die Monatsachse ab dem Planstart. */
export class Achse {
  readonly y: number;
  readonly m: number;
  constructor(start: string) {
    this.y = Number(start.slice(0, 4));
    this.m = Number(start.slice(5, 7));
  }
  idx(d: unknown): number | null {
    const t = String(d ?? "");
    if (!/^\d{4}-\d{2}/.test(t)) return null;
    return (Number(t.slice(0, 4)) - this.y) * 12 + (Number(t.slice(5, 7)) - this.m);
  }
  moy(i: number) {
    return (((this.m - 1 + i) % 12) + 12) % 12;
  }
  yr(i: number) {
    return this.y + Math.floor((this.m - 1 + i) / 12);
  }
  key(i: number) {
    return `${this.yr(i)}-${String(this.moy(i) + 1).padStart(2, "0")}`;
  }
  /** „Okt 26" */
  lab(i: number) {
    return `${MON[this.moy(i)]} ${String(this.yr(i)).slice(2)}`;
  }
  /** „Oktober 2026" */
  labL(i: number) {
    return `${MONL[this.moy(i)]} ${this.yr(i)}`;
  }
}

/* --- Die Zeitachse ----------------------------------------------------------- */

export type Status = "geplant" | "zugesagt" | "erhalten";
export type Farbe = "foerd" | "inv" | "ums" | "team" | "kost" | "darl" | "tax" | "bad";

/** Ein Punkt der Zeitachse; `dia` heißt Raute (Darlehen, Vorschlag). */
export type Lanenpunkt = { i: number; v: number; st: Status; dia?: boolean; cnt?: number };

/** Eine Zeile der Zeitachse: Punkte oder ein Balken über die Laufzeit. */
export type Lane = {
  g: string;
  l: string;
  farbe: Farbe;
  pts?: Lanenpunkt[];
  rng?: [number, number];
  txt?: string;
  op?: number;
  small?: boolean;
};

/**
 * Die Zeilen der Zeitachse unter der Linie — wer, was, wann (`drawCharts` des
 * Planers). Gruppiert nach Art; einmalige Umsätze und Ausgaben stehen je in
 * einer Sammelzeile, Wiederkehrendes als Balken über die Laufzeit.
 */
export function lanes(S: Runwayplan, r: Runwayrechnung): Lane[] {
  const a = new Achse(S.settings.start);
  const n = S.settings.months;
  const rows: Lane[] = [];
  const begrenzt = (start: unknown, ende: unknown): [number, number] => [
    Math.max(0, a.idx(start) ?? 0),
    Math.min(n - 1, a.idx(ende) ?? n - 1),
  ];

  S.foerderungen.forEach((f) =>
    rows.push({
      g: "Förderung",
      l: f.name || "Förderung",
      farbe: "foerd",
      pts: f.tranchen.flatMap((t) => {
        const i = a.idx(t.date);
        if (i === null) return [];
        const zurueck = t.art === "rueckzahlung";
        return [{ i, v: (zurueck ? -1 : 1) * num(t.amount), st: zurueck ? "erhalten" : ((t.status as Status) ?? "geplant") }];
      }),
    }),
  );
  if (r.A.some((m) => num(m.fp)))
    rows.push({ g: "Förderung", l: "Forschungsprämie", farbe: "foerd", pts: r.A.filter((m) => num(m.fp)).map((m) => ({ i: m.i, v: num(m.fp), st: "geplant" })) });
  if (S.investments.length)
    rows.push({
      g: "Investments", l: "Investments", farbe: "inv",
      pts: S.investments.flatMap((x) => {
        const i = a.idx(x.date);
        return i === null ? [] : [{ i, v: num(x.amount), st: (x.status as Status) ?? "geplant" }];
      }),
    });
  const einmalig = S.umsaetze.filter((u) => u.interval === "einmalig");
  if (einmalig.length)
    rows.push({ g: "Umsatz", l: "Einmalige Umsätze", farbe: "ums", pts: einmalig.map((u) => ({ i: a.idx(u.start) ?? 0, v: num(u.amount), st: "geplant" })) });
  S.umsaetze
    .filter((u) => u.interval !== "einmalig")
    .forEach((u) => {
      const p = x0(u.prob, 100);
      rows.push({
        g: "Umsatz", l: String(u.name || "Umsatz"), farbe: "ums", rng: begrenzt(u.start, u.end),
        txt: `${kfmt(num(u.amount))}/${u.interval === "quartal" ? "Q" : u.interval === "jaehrlich" ? "J" : "M"} · ${p} %`,
        op: 0.25 + (0.55 * p) / 100,
      });
    });
  S.team.forEach((p) =>
    rows.push({ g: "Team", l: String(p.name || "Mitarbeiter:in"), farbe: "team", rng: begrenzt(p.start, p.end), txt: `${kfmt(num(p.gross))} brutto`, op: 0.55 }),
  );
  const ausgaben = S.kosten.filter((k) => k.interval === "einmalig");
  if (ausgaben.length)
    rows.push({ g: "Ausgaben", l: "Einmalige Ausgaben", farbe: "kost", pts: ausgaben.map((k) => ({ i: a.idx(k.start) ?? 0, v: -num(k.amount), st: "erhalten" })) });
  const uva = r.A.filter((m) => num(m.uvaIn) || num(m.uvaOut)).map((m) => ({ i: m.i, v: num(m.uvaIn) - num(m.uvaOut), st: "erhalten" as Status }));
  if (uva.length) rows.push({ g: "Steuern", l: "Umsatzsteuer (UVA)", farbe: "tax", pts: uva, small: true });
  (
    [
      ["gesellschafter", "Gesellschafterdarlehen"],
      ["bank", "Bankkredite"],
      ["foerder", "Förderdarlehen"],
    ] as const
  ).forEach(([typ, label]) => {
    const ds = S.darlehen.filter((d) => (d.typ || "gesellschafter") === typ);
    if (!ds.length) return;
    rows.push({
      g: "Darlehen", l: label, farbe: "darl",
      pts: ds.flatMap((d) => {
        const von = a.idx(d.date);
        const bis = a.idx(d.repay);
        const betrag = num(d.amount);
        if (von === null) return [];
        const p: Lanenpunkt[] = [{ i: von, v: betrag, st: "erhalten", dia: true }];
        if (d.tilgung !== "raten" && bis !== null && bis > von)
          p.push({ i: bis, v: -betrag * (1 + ((num(d.zins) / 100) * (bis - von)) / 12), st: "geplant", dia: true });
        return p;
      }),
    });
  });
  if (r.sug.length)
    rows.push({ g: "Vorschlag", l: "Überbrückung nötig", farbe: "bad", pts: r.sug.map((s) => ({ i: s.i, v: num(s.amount), st: "geplant", dia: true })) });
  return rows;
}

const RANG: Record<Status, number> = { geplant: 0, zugesagt: 1, erhalten: 2 };

/**
 * Punkte im selben Monat werden einer — mit der Summe, der Anzahl und dem
 * unsichersten Status. Zwei Tranchen im März sind ein Punkt mit einer 2.
 */
export function zusammenfassen(pts: Lanenpunkt[], n: number): Lanenpunkt[] {
  const je = new Map<number, Lanenpunkt>();
  for (const p of pts) {
    if (p.i < 0 || p.i >= n) continue;
    const da = je.get(p.i);
    if (da) {
      da.v += p.v;
      da.cnt = (da.cnt ?? 1) + 1;
      if (RANG[p.st] < RANG[da.st]) da.st = p.st;
    } else je.set(p.i, { ...p, cnt: 1 });
  }
  return [...je.values()].sort((x, y) => x.i - y.i);
}

/* --- Sonstiges -------------------------------------------------------------- */

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Für den Dateinamen eines Exports: „2026-10-14". */
export function stempel(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function slug(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan";
}

/** Eine Tabelle als CSV mit Semikolon — so öffnet Excel sie in Österreich. */
export function tabelleAlsCsv(tabelle: HTMLTableElement): string {
  return [...tabelle.querySelectorAll("tr")]
    .map((tr) =>
      [...tr.children]
        .map((z) => {
          const eingabe = z.querySelector("input");
          let t = (eingabe ? eingabe.value : (z.textContent ?? "")).trim().replace(/\s+/g, " ");
          if (z.tagName === "TD") t = t === "–" ? "0" : t.replace(/[.\s  ]/g, "").replace("−", "-");
          return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(";"),
    )
    .join("\r\n");
}

/** Eine Datei zum Herunterladen anbieten. */
export function anbieten(dateiname: string, inhalt: string) {
  const typ = dateiname.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/json";
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Was eine Datei enthält, in einem Satz — vor dem Ersetzen des Plans. */
export function zusammenfassung(p: Runwayplan): string {
  const tranchen = p.foerderungen.reduce((s, f) => s + (f.tranchen?.length ?? 0), 0);
  return `${p.foerderungen.length} Förderungen (${tranchen} Tranchen), ${p.investments.length} Investments, ${p.umsaetze.length} Umsätze, ${p.team.length} Personen, ${p.kosten.length} Kostenpositionen, ${p.darlehen.length} Darlehen`;
}

/** Ein leerer Eintrag je Liste (`defaults` des Planers). */
export function neuerEintrag(liste: string, start: string): Planeintrag {
  const id = uid();
  switch (liste) {
    case "foerderungen":
      return { id, name: "", geber: "", tranchen: [neueTranche()] };
    case "investments":
      return { id, name: "", amount: "", date: "", art: "Eigenkapital", status: "geplant" };
    case "umsaetze":
      return { id, name: "", amount: "", interval: "monatlich", start, end: "", ziel: 30, ust: "20", prob: 50 };
    case "team":
      return { id, name: "", role: "", gross: "", start, end: "", lnk: "", fe: "", neufoeg: true };
    case "kosten":
      return { id, name: "", cat: "", amount: "", interval: "monatlich", start, end: "", ust: "20", fe: false };
    default:
      return { id, name: "", typ: "gesellschafter", amount: "", date: start, tilgung: "endfaellig", repay: "", tilgStart: "", raten: 24, zins: 0 };
  }
}

export const neueTranche = (): Planeintrag => ({ id: uid(), date: "", art: "auszahlung", amount: "", status: "geplant", note: "" });
