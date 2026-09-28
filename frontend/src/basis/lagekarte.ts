/**
 * Module · Stellwerk: was aus seiner Lagekarte gerechnet wird.
 *
 * Gespeichert ist nur, was jemand hingestellt hat — Themen, Schritte, wer an
 * wem hängt, und wo eine Kachel auf der Sternkarte liegt. **Alles hier ist
 * abgeleitet**: ob ein Schritt wartet oder als Nächstes frei ist, wie die
 * Stränge angeordnet sind, wie ein Pfeil läuft, wo ein neuer Gedanke Platz
 * findet. Ein gespeichertes „wartet" wäre nach dem ersten Abhaken eines
 * Vorgängers falsch, und niemand würde es merken.
 *
 * Die Zeichenfläche selbst steht in `bausteine/Lagebuehne.ts`; hier steht nur,
 * was sich ohne Bildschirm rechnen und darum prüfen lässt.
 */

import type { Karte, Lageschritt, Lagethema } from "./daten";

export type P = { x: number; y: number };

/* --- Schlüssel ------------------------------------------------------------ */

/**
 * Ein Knoten auf der Bühne: die Mitte, ein Thema oder ein Schritt. Themen und
 * Schritte haben je eigene Nummern vom Server — ohne Vorsilbe hießen Thema 3
 * und Schritt 3 gleich.
 */
export type Schluessel = string;
export const MITTE: Schluessel = "mitte";
export const alsThema = (id: number): Schluessel => `t:${id}`;
export const alsSchritt = (id: number): Schluessel => `s:${id}`;
export const istThema = (k: Schluessel) => k.startsWith("t:");
export const istSchritt = (k: Schluessel) => k.startsWith("s:");
export const nummer = (k: Schluessel) => Number(k.slice(2));

/** Wo auf der Karte ein Schritt hängt: an seinem Thema oder, lose, an der Mitte. */
export const nabeVon = (s: Lageschritt): Schluessel => (s.thema !== null ? alsThema(s.thema) : MITTE);

/* --- Der Graph ------------------------------------------------------------ */

export type Graph = {
  karte: Karte;
  schritt: (id: number) => Lageschritt | undefined;
  thema: (id: number) => Lagethema | undefined;
  vor: (id: number) => number[];
  nach: (id: number) => number[];
};

/** Die Karte mit Nachschlagetafeln — einmal je Stand gebaut, nicht je Frage. */
export function graph(karte: Karte): Graph {
  const schritte = new Map(karte.schritte.map((s) => [s.id, s]));
  const themen = new Map(karte.themen.map((t) => [t.id, t]));
  const vor = new Map<number, number[]>();
  const nach = new Map<number, number[]>();
  for (const v of karte.verbindungen) {
    // Ein Pfeil, dessen Ende (noch) fehlt, zählt nicht — etwa zwischen dem
    // Anlegen und dem Neuladen.
    if (!schritte.has(v.von) || !schritte.has(v.nach)) continue;
    (vor.get(v.nach) ?? vor.set(v.nach, []).get(v.nach)!).push(v.von);
    (nach.get(v.von) ?? nach.set(v.von, []).get(v.von)!).push(v.nach);
  }
  return {
    karte,
    schritt: (id) => schritte.get(id),
    thema: (id) => themen.get(id),
    vor: (id) => vor.get(id) ?? [],
    nach: (id) => nach.get(id) ?? [],
  };
}

/** Offen, aber ein Vorgänger ist es auch noch. */
export function gesperrt(g: Graph, s: Lageschritt): boolean {
  return s.status === "offen" && g.vor(s.id).some((v) => g.schritt(v)?.status !== "erledigt");
}

/**
 * Als Nächstes frei: offen, nichts davor offen — und nichts, worauf von außen
 * gewartet wird. Das hat die Art „Warten", und wer die Rückmeldung der FFG
 * „als Nächstes" angezeigt bekommt, kann trotzdem nichts tun.
 */
export function frei(g: Graph, s: Lageschritt): boolean {
  return s.status === "offen" && s.art !== "warten" && !gesperrt(g, s);
}

export const wartetAussen = (s: Lageschritt) => s.status === "offen" && s.art === "warten";

/** Die offenen Vorgänger aus einem **anderen** Thema — das, was ein Thema aufhält. */
export function kreuzSperre(g: Graph, s: Lageschritt): Lageschritt[] {
  return g
    .vor(s.id)
    .map((v) => g.schritt(v)!)
    .filter((v) => v.status !== "erledigt" && v.thema !== s.thema);
}

/**
 * Ob man von `von` über Verbindungen nach `zu` kommt. `ohne` lässt eine
 * Verbindung außer Acht — die, die gerade umgehängt oder umgedreht wird;
 * sonst meldete „Umdrehen" einen Kreis mit sich selbst. Dieselbe Regel wie
 * `ergaebe_kreis` in socos/services/lagekarte.py, die das Letzte Wort hat.
 */
export function erreichbar(g: Graph, von: number, zu: number, ohne: number | null = null): boolean {
  const ausgaenge = new Map<number, number[]>();
  for (const v of g.karte.verbindungen) {
    if (v.id === ohne) continue;
    (ausgaenge.get(v.von) ?? ausgaenge.set(v.von, []).get(v.von)!).push(v.nach);
  }
  const gesehen = new Set<number>();
  const stapel = [von];
  while (stapel.length) {
    const x = stapel.pop()!;
    if (x === zu) return true;
    for (const y of ausgaenge.get(x) ?? []) {
      if (!gesehen.has(y)) {
        gesehen.add(y);
        stapel.push(y);
      }
    }
  }
  return false;
}

/** Warum eine Verbindung `von → nach` nicht geht — oder `null`, wenn sie geht. */
export function verbindungsHindernis(g: Graph, von: number, nach: number, ohne: number | null = null): string | null {
  if (von === nach) return "Ein Schritt kann nicht an sich selbst hängen.";
  if (g.karte.verbindungen.some((v) => v.id !== ohne && v.von === von && v.nach === nach))
    return "Diese Verbindung gibt es schon.";
  if (erreichbar(g, nach, von, ohne)) return "Das ergäbe einen Kreis — dann wartet alles aufeinander.";
  return null;
}

/* --- Was die Karte gerade sagt -------------------------------------------- */

export type Hubzeile = { art: "wartet" | "frei" | "kreuz" | "leer"; text: string };

/** Was auf der Kachel eines Themas steht, wenn man nur die Lage ansieht. Höchstens vier Zeilen. */
export function hubZeilen(g: Graph, thema: Lagethema): Hubzeile[] {
  const ns = g.karte.schritte.filter((s) => s.thema === thema.id);
  const zeilen: Hubzeile[] = [
    ...ns.filter(wartetAussen).map((s) => ({ art: "wartet" as const, text: `wartet: ${s.titel}` })),
    ...ns
      .filter((s) => frei(g, s))
      .slice(0, 2)
      .map((s) => ({ art: "frei" as const, text: s.titel })),
  ];
  const auf = new Set(ns.filter((s) => s.status === "offen").flatMap((s) => kreuzSperre(g, s).map((v) => v.thema)));
  for (const a of auf) {
    const name = a !== null ? g.thema(a)?.name : undefined;
    zeilen.push({ art: "kreuz", text: name ? `wartet auf ${name}` : "wartet auf einen losen Gedanken" });
  }
  if (!zeilen.length)
    zeilen.push({
      art: "leer",
      text: !ns.length ? "noch leer" : ns.every((s) => s.status === "erledigt") ? "alles erledigt" : "nichts frei",
    });
  return zeilen.slice(0, 4);
}

const nachFrist = (a: Lageschritt, b: Lageschritt) => (a.frist ?? "9999").localeCompare(b.frist ?? "9999");

/** Die Lage in der Seitenspalte: was wartet, was frei ist, was noch lose herumliegt. */
export function lage(g: Graph) {
  const schritte = g.karte.schritte;
  return {
    wartet: schritte.filter(wartetAussen),
    haengt: schritte
      .filter((s) => s.status === "offen" && s.art !== "warten")
      .map((s) => ({ schritt: s, an: kreuzSperre(g, s)[0] }))
      .filter((x): x is { schritt: Lageschritt; an: Lageschritt } => !!x.an),
    frei: schritte.filter((s) => frei(g, s)).sort(nachFrist),
    lose: schritte.filter((s) => s.thema === null),
  };
}

/** „3/5" — erledigt von allen, je Thema. */
export function fortschritt(karte: Karte, thema: number) {
  const ns = karte.schritte.filter((s) => s.thema === thema);
  return { fertig: ns.filter((s) => s.status === "erledigt").length, alle: ns.length, status: ns.map((s) => s.status) };
}

/* --- Stränge -------------------------------------------------------------- */

export const RASTER = 12;
export const aufRaster = (v: number) => Math.round(v / RASTER) * RASTER;
export const klemme = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export type Band = { thema: number | null; y: number; h: number; x0: number; x1: number };

/**
 * Die Stränge: eine Zeile je Thema, die Spalte ist der **längste** Weg über
 * alle Abhängigkeiten — auch über Themengrenzen. Dadurch rückt „Bewerbung
 * FFG" hinter „Unterzeichnung Bank", und die Lücke im Strang der
 * Praktikantinnen zeigt von selbst, dass dort gewartet wird.
 *
 * `lage` ist dieselbe Ansicht, eingeklappt auf die Themen untereinander.
 */
export function straenge(g: Graph): { pos: Record<Schluessel, P>; lage: Record<Schluessel, P>; baender: Band[] } {
  const { themen, schritte } = g.karte;
  const tiefe = new Map<number, number>();
  const t = (id: number): number => {
    const bekannt = tiefe.get(id);
    if (bekannt !== undefined) return bekannt;
    tiefe.set(id, 0); // Wächter, falls doch ein Kreis hereinkommt
    const v = g.vor(id);
    const d = v.length ? Math.max(...v.map((x) => t(x) + 1)) : 0;
    tiefe.set(id, d);
    return d;
  };
  schritte.forEach((s) => t(s.id));

  const spuren: (number | null)[] = themen.map((x) => x.id);
  if (schritte.some((s) => s.thema === null)) spuren.push(null);
  const SPALTE = 300;
  const ZEILE = 96;
  const zeilen = spuren.map((thema) => {
    const spalten = new Map<number, Lageschritt[]>();
    schritte
      .filter((s) => s.thema === thema)
      .forEach((s) => {
        const d = tiefe.get(s.id)!;
        (spalten.get(d) ?? spalten.set(d, []).get(d)!).push(s);
      });
    const hoechstens = Math.max(1, ...[...spalten.values()].map((a) => a.length));
    return { thema, spalten, h: Math.max(150, hoechstens * ZEILE + 60) };
  });

  const gesamt = zeilen.reduce((a, z) => a + z.h, 0);
  let y = -gesamt / 2;
  let maxX = 0;
  const pos: Record<Schluessel, P> = {};
  const baender: Band[] = [];
  for (const { thema, spalten, h } of zeilen) {
    const mitteY = aufRaster(y + h / 2);
    for (const [d, liste] of spalten) {
      liste.forEach((s, i) => {
        const x = d * SPALTE;
        maxX = Math.max(maxX, x);
        pos[alsSchritt(s.id)] = { x, y: mitteY + (i - (liste.length - 1) / 2) * ZEILE };
      });
    }
    if (thema !== null) pos[alsThema(thema)] = { x: -300, y: mitteY };
    baender.push({ thema, y, h, x0: -440, x1: 0 });
    y += h;
  }
  pos[MITTE] = { x: -640, y: 0 };
  baender.forEach((b) => (b.x1 = maxX + 170));

  const lageP: Record<Schluessel, P> = { [MITTE]: { x: -380, y: 0 } };
  themen.forEach((th, i) => (lageP[alsThema(th.id)] = { x: 0, y: (i - (themen.length - 1) / 2) * 200 }));
  return { pos, lage: lageP, baender };
}

/* --- Pfeilführung --------------------------------------------------------- */

/** Ein Rechteck um seine Mitte, mit halber Breite und Höhe. */
export type Rechteck = { x: number; y: number; w: number; h: number };

type Seite = "r" | "l" | "u" | "o";
type Lauf = {
  A: Rechteck;
  Z: Rechteck;
  h: boolean;
  sa: Seite;
  sz: Seite;
  p1: P;
  p2: P;
};
type Andock = { lauf: Lauf; ende: "a" | "z"; s: Seite; gegen: number };

const RICHTUNG = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const; // rechts, links, unten, oben
const NORMALE: Record<Seite, number> = { r: 0, l: 1, u: 2, o: 3 };
const achse = (d: number) => (d < 2 ? 1 : 2); // 1 = waagrecht, 2 = senkrecht
const quer = (s: Seite) => s === "l" || s === "r";

/**
 * Rechtwinklig wie ein Schaltplan: hinaus und hinein immer senkrecht zur
 * Kachelkante, geführt auf dem Raster. Gerechnet wird für alle Pfeile auf
 * einmal, denn ein Pfeil allein weiß nicht, wer sonst an derselben Seite
 * hängt oder dieselbe Spur nimmt — und genau dort überlappen sie sonst.
 *
 * Zwei Stufen: `fein = false` ist die schnelle Führung über eine Mittelspur,
 * für die Zeit, in der sich etwas bewegt. `fein = true` sucht auf dem Raster
 * einen Weg um alle `hindernisse` herum, der keine belegte Spur entlangläuft —
 * kreuzen ja, übereinander nie. Findet er keinen, bleibt die schnelle.
 *
 * Zurück kommt je Pfeil die Punktfolge, oder `null`, wenn die beiden Kacheln
 * (noch) aufeinanderliegen.
 */
export function fuehre(
  pfeile: Pfeilenden[],
  kacheln: Record<string, Rechteck>,
  fein = false,
  hindernisse: Rechteck[] = [],
): (P[] | null)[] {
  const grobe = grob(pfeile, kacheln);
  if (!fein) return grobe;
  const feine = feinSuche(pfeile, kacheln, hindernisse);
  return feine.map((pts, i) => pts ?? grobe[i]);
}

/** Ein Pfeil von Kachel `a` zu Kachel `b` — die Schlüssel verweisen in die Kacheln. */
export type Pfeilenden = { a: string; b: string };

function andocken(pfeile: Pfeilenden[], kacheln: Record<string, Rechteck>, amRaster: boolean): (Lauf | null)[] {
  const ab = 4;
  const seiten = new Map<string, Andock[]>();
  const laeufe = pfeile.map(({ a, b }) => {
    const A = kacheln[a];
    const Z = kacheln[b];
    if (!A || !Z) return null;
    const dx = Z.x - A.x;
    const dy = Z.y - A.y;
    const lueckeX = Math.abs(dx) - A.w - Z.w;
    const lueckeY = Math.abs(dy) - A.h - Z.h;
    if (lueckeX < 16 && lueckeY < 16) return null; // liegen (noch) aufeinander, etwa beim Einklappen
    // Die Richtung mit mehr Platz entscheidet, an welcher Seite der Pfeil ansetzt.
    const h = lueckeX >= lueckeY;
    const lauf: Lauf = {
      A,
      Z,
      h,
      sa: h ? (dx > 0 ? "r" : "l") : dy > 0 ? "u" : "o",
      sz: h ? (dx > 0 ? "l" : "r") : dy > 0 ? "o" : "u",
      p1: { x: 0, y: 0 },
      p2: { x: 0, y: 0 },
    };
    const seite = (k: string, s: Seite, ende: "a" | "z", gegen: number) =>
      (seiten.get(`${k}|${s}`) ?? seiten.set(`${k}|${s}`, []).get(`${k}|${s}`)!).push({ lauf, ende, s, gegen });
    seite(a, lauf.sa, "a", h ? Z.y : Z.x);
    seite(b, lauf.sz, "z", h ? A.y : A.x);
    return lauf;
  });

  if (amRaster) ueberlauf(seiten);
  // Andockpunkte: über die Seite verteilt, sortiert nach der Lage des anderen
  // Endes — so kreuzen sich die Pfeile an der Kachel nicht. Für den Wegsucher
  // liegen sie auf Rasterlinien, sonst begänne jeder Weg mit einem Versatz.
  for (const liste of seiten.values()) {
    liste.sort((p, q) => p.gegen - q.gegen);
    const n = liste.length;
    liste.forEach((p, i) => {
      const r = p.ende === "a" ? p.lauf.A : p.lauf.Z;
      const mitte = quer(p.s) ? r.y : r.x;
      const halb = quer(p.s) ? r.h : r.w;
      let versatz = mitte - halb + 6 + ((2 * halb - 12) * (i + 1)) / (n + 1);
      if (amRaster) {
        const j0 = Math.ceil((mitte - halb + 5) / RASTER);
        const j1 = Math.floor((mitte + halb - 5) / RASTER);
        const m = j1 - j0 + 1;
        if (m >= n) versatz = (j0 + Math.floor(((i + 0.5) * m) / n)) * RASTER;
      }
      const q =
        p.s === "r"
          ? { x: r.x + r.w + ab, y: versatz }
          : p.s === "l"
            ? { x: r.x - r.w - ab, y: versatz }
            : p.s === "u"
              ? { x: versatz, y: r.y + r.h + ab }
              : { x: versatz, y: r.y - r.h - ab };
      if (p.ende === "a") p.lauf.p1 = q;
      else p.lauf.p2 = q;
    });
  }
  return laeufe;
}

/**
 * Hat eine Seite mehr Pfeile als Rasterlinien, müssten sich zwei eine Spur
 * teilen. Dann weichen die äußersten auf die Nachbarseite aus: wer nach oben
 * will, auf die Oberseite, wer nach unten will, auf die Unterseite.
 */
function ueberlauf(seiten: Map<string, Andock[]>) {
  const linien = (p: Andock, s: Seite) => {
    const r = p.ende === "a" ? p.lauf.A : p.lauf.Z;
    const mitte = quer(s) ? r.y : r.x;
    const halb = quer(s) ? r.h : r.w;
    return Math.floor((mitte + halb - 5) / RASTER) - Math.ceil((mitte - halb + 5) / RASTER) + 1;
  };
  for (const [k, liste] of [...seiten]) {
    if (!liste.length) continue;
    const kachel = k.slice(0, k.lastIndexOf("|") + 1); // „s:12|"
    const s = liste[0].s;
    liste.sort((p, q) => p.gegen - q.gegen);
    let vorn = true;
    while (liste.length > Math.max(1, linien(liste[0], s))) {
      const p = vorn ? liste.shift()! : liste.pop()!;
      const neu: Seite = quer(s) ? (vorn ? "o" : "u") : vorn ? "l" : "r";
      const anderes = p.ende === "a" ? p.lauf.Z : p.lauf.A;
      p.s = neu;
      p.gegen = quer(s) ? anderes.x : anderes.y;
      if (p.ende === "a") p.lauf.sa = neu;
      else p.lauf.sz = neu;
      (seiten.get(kachel + neu) ?? seiten.set(kachel + neu, []).get(kachel + neu)!).push(p);
      vorn = !vorn;
    }
  }
}

function grob(pfeile: Pfeilenden[], kacheln: Record<string, Rechteck>): (P[] | null)[] {
  const laeufe = andocken(pfeile, kacheln, false);
  const belegt: { h: boolean; c: number; von: number; bis: number }[] = [];
  return laeufe.map((L) => {
    if (!L) return null;
    const { h, p1, p2 } = L;
    const q = h ? [p1.y, p2.y] : [p1.x, p2.x];
    const l = h ? [p1.x, p2.x] : [p1.y, p2.y];
    if (Math.abs(q[0] - q[1]) < 0.5) return [p1, p2];
    const lo = Math.min(...l) + 8;
    const hi = Math.max(...l) - 8;
    const von = Math.min(...q);
    const bis = Math.max(...q);
    const c0 = hi > lo ? klemme(aufRaster((l[0] + l[1]) / 2), lo, hi) : (l[0] + l[1]) / 2;
    let c = c0;
    // Die Mittelspur, und wenn dort schon einer läuft, die nächste daneben.
    for (const n of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      const v = c0 + n * RASTER;
      if (hi > lo && (v < lo || v > hi)) continue;
      if (!belegt.some((s) => s.h === h && Math.abs(s.c - v) < RASTER - 1 && s.von < bis + 6 && von < s.bis + 6)) {
        c = v;
        break;
      }
    }
    belegt.push({ h, c, von, bis });
    return h
      ? [p1, { x: c, y: p1.y }, { x: c, y: p2.y }, p2]
      : [p1, { x: p1.x, y: c }, { x: p2.x, y: c }, p2];
  });
}

function feinSuche(pfeile: Pfeilenden[], kacheln: Record<string, Rechteck>, hindernisse: Rechteck[]): (P[] | null)[] {
  const laeufe = andocken(pfeile, kacheln, true);
  const G = RASTER;
  const zk = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  const gesperrtZ = new Set<number>();
  for (const r of hindernisse)
    for (let i = Math.ceil((r.x - r.w - G / 2) / G); i <= Math.floor((r.x + r.w + G / 2) / G); i++)
      for (let j = Math.ceil((r.y - r.h - G / 2) / G); j <= Math.floor((r.y + r.h + G / 2) / G); j++)
        gesperrtZ.add(zk(i, j));
  const belegt = new Map<number, number>(); // Zelle → Bits: 1 waagrecht, 2 senkrecht
  const freiZ = (k: number, bits: number) => !((belegt.get(k) ?? 0) & bits);
  // Die Rasterzelle direkt vor dem Andockpunkt, schon außerhalb der Sperrzone.
  const vorplatz = (q: P, s: Seite): [number, number] =>
    s === "r"
      ? [Math.floor((q.x + G / 2) / G) + 1, Math.round(q.y / G)]
      : s === "l"
        ? [Math.ceil((q.x - G / 2) / G) - 1, Math.round(q.y / G)]
        : s === "u"
          ? [Math.round(q.x / G), Math.floor((q.y + G / 2) / G) + 1]
          : [Math.round(q.x / G), Math.ceil((q.y - G / 2) / G) - 1];

  // Kurze zuerst: Sie haben die wenigsten Umwege und sollen die geraden Spuren bekommen.
  const laenge = (L: Lauf) => Math.abs(L.p1.x - L.p2.x) + Math.abs(L.p1.y - L.p2.y);
  const reihe = laeufe
    .map((L, i) => ({ L, i }))
    .filter((x): x is { L: Lauf; i: number } => !!x.L)
    .sort((a, b) => laenge(a.L) - laenge(b.L));
  const ergebnis: (P[] | null)[] = laeufe.map(() => null);

  // A* über (Zelle, Richtung). Ein Knick kostet, damit der Weg ruhig bleibt.
  const suche = (si: number, sj: number, dS: number, ei: number, ej: number, dE: number, rand: number) => {
    const i0 = Math.min(si, ei) - rand;
    const i1 = Math.max(si, ei) + rand;
    const j0 = Math.min(sj, ej) - rand;
    const j1 = Math.max(sj, ej) + rand;
    const W = i1 - i0 + 1;
    const H = j1 - j0 + 1;
    const idx = (i: number, j: number, d: number) => ((j - j0) * W + (i - i0)) * 4 + d;
    const kosten = new Float64Array(W * H * 4).fill(Infinity);
    const von = new Int32Array(W * H * 4).fill(-1);
    const haufen: number[][] = []; // [f, g, i, j, d]
    const hinein = (e: number[]) => {
      haufen.push(e);
      let k = haufen.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (haufen[p][0] <= haufen[k][0]) break;
        [haufen[p], haufen[k]] = [haufen[k], haufen[p]];
        k = p;
      }
    };
    const heraus = () => {
      const oben = haufen[0];
      const letzt = haufen.pop()!;
      if (haufen.length) {
        haufen[0] = letzt;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < haufen.length && haufen[l][0] < haufen[m][0]) m = l;
          if (r < haufen.length && haufen[r][0] < haufen[m][0]) m = r;
          if (m === k) break;
          [haufen[m], haufen[k]] = [haufen[k], haufen[m]];
          k = m;
        }
      }
      return oben;
    };
    const hdist = (i: number, j: number) => Math.abs(i - ei) + Math.abs(j - ej);
    if (!freiZ(zk(si, sj), achse(dS))) return null;
    kosten[idx(si, sj, dS)] = 0;
    hinein([hdist(si, sj), 0, si, sj, dS]);
    while (haufen.length) {
      const [, g, i, j, d] = heraus();
      if (g > kosten[idx(i, j, d)]) continue;
      if (i === ei && j === ej) {
        if (!freiZ(zk(i, j), achse(d) | achse(dE))) continue;
        const weg: [number, number, number, number][] = [];
        let k = idx(i, j, d);
        let naechst = dE;
        while (k >= 0) {
          const d2 = k % 4;
          const c = (k - d2) / 4;
          weg.unshift([(c % W) + i0, Math.floor(c / W) + j0, d2, naechst]);
          naechst = d2;
          k = von[k];
        }
        return weg;
      }
      for (let d2 = 0; d2 < 4; d2++) {
        if (d2 === (d ^ 1)) continue; // keine Kehrtwende
        if (!freiZ(zk(i, j), achse(d) | achse(d2))) continue;
        const ni = i + RICHTUNG[d2][0];
        const nj = j + RICHTUNG[d2][1];
        if (ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
        const nk = zk(ni, nj);
        if (gesperrtZ.has(nk) && !(ni === ei && nj === ej)) continue;
        if (!freiZ(nk, achse(d2))) continue;
        const g2 = g + 1 + (d2 !== d ? 4 : 0);
        const k2 = idx(ni, nj, d2);
        if (g2 < kosten[k2]) {
          kosten[k2] = g2;
          von[k2] = idx(i, j, d);
          hinein([g2 + hdist(ni, nj), g2, ni, nj, d2]);
        }
      }
    }
    return null;
  };

  for (const { L, i } of reihe) {
    const [si, sj] = vorplatz(L.p1, L.sa);
    const [ei, ej] = vorplatz(L.p2, L.sz);
    const dS = NORMALE[L.sa];
    const dE = NORMALE[L.sz] ^ 1; // hinein = entgegen der Normalen
    let weg = null;
    for (const rand of [10, 40]) {
      weg = suche(si, sj, dS, ei, ej, dE, rand);
      if (weg) break;
    }
    if (!weg) continue; // bleibt bei der schnellen Führung
    for (const [wi, wj, rein, raus] of weg) {
      const k = zk(wi, wj);
      belegt.set(k, (belegt.get(k) ?? 0) | achse(rein) | achse(raus));
    }
    const pts: P[] = [L.p1];
    const erst = { x: si * G, y: sj * G };
    const letzt = { x: ei * G, y: ej * G };
    pts.push(quer(L.sa) ? { x: erst.x, y: L.p1.y } : { x: L.p1.x, y: erst.y });
    for (const [wi, wj] of weg) pts.push({ x: wi * G, y: wj * G });
    pts.push(quer(L.sz) ? { x: letzt.x, y: L.p2.y } : { x: L.p2.x, y: letzt.y });
    pts.push(L.p2);
    ergebnis[i] = straffe(pts);
  }
  return ergebnis;
}

/** Doppelte und gerade durchlaufende Punkte weg — übrig bleiben die Knicke. */
export function straffe(pts: P[]): P[] {
  const gleich = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const a = pts.filter((q, i) => !i || !gleich(q.x, pts[i - 1].x) || !gleich(q.y, pts[i - 1].y));
  return a.filter(
    (q, i) =>
      i === 0 ||
      i === a.length - 1 ||
      !(
        (gleich(a[i - 1].x, q.x) && gleich(q.x, a[i + 1].x)) ||
        (gleich(a[i - 1].y, q.y) && gleich(q.y, a[i + 1].y))
      ),
  );
}

/* --- Wo Neues hinkommt ---------------------------------------------------- */

/** Ob an `p` auf der Sternkarte schon etwas liegt. */
export function belegt(karte: Karte, p: P, ohne: Schluessel | null = null): boolean {
  const hier = [
    { k: MITTE, x: 0, y: 0, w: 220, h: 100 },
    ...karte.themen.map((t) => ({ k: alsThema(t.id), x: t.x, y: t.y, w: 260, h: 120 })),
    ...karte.schritte.map((s) => ({ k: alsSchritt(s.id), x: s.x, y: s.y, w: 220, h: 90 })),
  ];
  return hier.some((o) => o.k !== ohne && Math.abs(o.x - p.x) < (o.w + 200) / 2 && Math.abs(o.y - p.y) < (o.h + 70) / 2);
}

export function richtung(von: P, zu: P): P {
  const dx = zu.x - von.x;
  const dy = zu.y - von.y;
  const l = Math.hypot(dx, dy);
  return l < 1 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l };
}

/** Der nächste freie Platz um `p` — erst seitlich, dann weiter hinaus in Richtung `u`. */
export function freiNahe(karte: Karte, p: P, u: P, ohne: Schluessel | null = null): P {
  const nx = -u.y;
  const ny = u.x;
  for (let i = 0; i < 40; i++) {
    const seitlich = [0, 1, -1, 2, -2, 3, -3][i % 7] * 110;
    const weiter = Math.floor(i / 7) * 250;
    const q = { x: Math.round(p.x + u.x * weiter + nx * seitlich), y: Math.round(p.y + u.y * weiter + ny * seitlich) };
    if (!belegt(karte, q, ohne)) return q;
  }
  return { x: p.x, y: p.y + 120 };
}

const nabenLage = (karte: Karte, thema: number | null): P => {
  const t = thema !== null ? karte.themen.find((x) => x.id === thema) : undefined;
  return t ? { x: t.x, y: t.y } : { x: 0, y: 0 };
};

/**
 * Wo ein neuer Schritt hinkommt: hinter seinen Vorgänger, vom Thema weg; in
 * ein Thema, von der Mitte weg; ohne beides als loser Gedanke im Kreis um die
 * Mitte.
 */
export function platzFuer(karte: Karte, neu: { thema: number | null; nach?: Lageschritt | null }, ohne: Schluessel | null = null): P {
  if (neu.nach) {
    const a = neu.nach;
    const u = richtung(nabenLage(karte, a.thema), a);
    return freiNahe(karte, { x: a.x + u.x * 250, y: a.y + u.y * 250 }, u, ohne);
  }
  if (neu.thema !== null) {
    const h = nabenLage(karte, neu.thema);
    const u = richtung({ x: 0, y: 0 }, h);
    return freiNahe(karte, { x: h.x + u.x * 280, y: h.y + u.y * 280 }, u, ohne);
  }
  for (let r = 250; r < 900; r += 130)
    for (let w = 0; w < 360; w += 30) {
      const b = ((w + 15) * Math.PI) / 180;
      const q = { x: Math.round(Math.cos(b) * r * 1.3), y: Math.round(Math.sin(b) * r) };
      if (!belegt(karte, q, ohne)) return q;
    }
  return { x: 0, y: 200 };
}

/** Ein neues Thema: auf einem Bogen um die Mitte, wo noch keines liegt. */
export function platzFuerThema(karte: Karte): P {
  for (let r = 460; r < 1200; r += 120)
    for (let w = 90; w < 450; w += 24) {
      const b = (w * Math.PI) / 180;
      const q = { x: Math.round(Math.cos(b) * r), y: Math.round(Math.sin(b) * r * 0.7) };
      if (!karte.themen.some((t) => Math.abs(t.x - q.x) < 300 && Math.abs(t.y - q.y) < 170) && !belegt(karte, q)) return q;
    }
  return { x: 0, y: 480 };
}

/** Der erste Thementon, den noch keines hat — sind alle acht vergeben, reihum. */
export function freieFarbe(themen: Lagethema[]): number {
  return [1, 2, 3, 4, 5, 6, 7, 8].find((f) => !themen.some((t) => t.farbe === f)) ?? (themen.length % 8) + 1;
}

/**
 * Das Fangfeld: „Gründung: Notar anrufen" legt den Gedanken ins Thema, dessen
 * Name so beginnt. Ohne Doppelpunkt, oder wenn kein Thema passt, bleibt er
 * lose — und der Doppelpunkt samt Text davor im Titel, damit nichts verloren geht.
 */
export function fang(text: string, themen: Lagethema[]): { titel: string; thema: number | null } {
  const roh = text.trim();
  const treffer = /^([^:]{2,40}):\s*(.+)$/.exec(roh);
  if (treffer) {
    const vorn = treffer[1].trim().toLowerCase();
    const t = themen.find((x) => x.name.toLowerCase().startsWith(vorn));
    if (t) return { titel: treffer[2].trim(), thema: t.id };
  }
  return { titel: roh, thema: null };
}

export const ARTEN: { wert: Lageschritt["art"]; text: string; kurz: string }[] = [
  { wert: "schritt", text: "Schritt", kurz: "Schritt" },
  { wert: "warten", text: "Warten auf", kurz: "Warten" },
  { wert: "entscheidung", text: "Entscheidung", kurz: "Entscheidung" },
  { wert: "termin", text: "Termin", kurz: "Termin" },
];
