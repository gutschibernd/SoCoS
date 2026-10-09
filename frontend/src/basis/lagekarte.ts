/**
 * Module · Thoughts: was aus der Lagekarte gerechnet wird.
 *
 * Gespeichert ist nur, was jemand hingestellt hat — Themen, Schritte, wer an
 * wem hängt, und wo eine Kachel auf der Sternkarte liegt. **Alles hier ist
 * abgeleitet**: ob ein Schritt wartet oder als Nächstes frei ist, wie die
 * Stränge angeordnet sind, wie „Neu anordnen" die Sternkarte aufräumt, wie
 * ein Pfeil läuft, wo ein neuer Gedanke Platz findet. Ein gespeichertes „wartet" wäre nach dem ersten Abhaken eines
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
/** Das Bündel erledigter Schritte am Anfang eines Strangs — je Thema höchstens eins. */
export const alsBuendel = (thema: number | null): Schluessel => `b:${thema ?? "lose"}`;
export const istBuendel = (k: Schluessel) => k.startsWith("b:");
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

/**
 * Die Karte ohne abgeschlossene Themen — ohne deren Schritte und ohne Pfeile,
 * die zu ihnen führen. Abgeschlossen wird nur, was ganz erledigt ist; ein
 * fehlender Vorgänger sperrt also nichts, was vorher frei gewesen wäre.
 */
export function offeneKarte(k: Karte): Karte {
  const zu = new Set(k.themen.filter((t) => t.abgeschlossen_am).map((t) => t.id));
  if (!zu.size) return k;
  const schritte = k.schritte.filter((s) => s.thema === null || !zu.has(s.thema));
  const da = new Set(schritte.map((s) => s.id));
  return {
    themen: k.themen.filter((t) => !zu.has(t.id)),
    schritte,
    verbindungen: k.verbindungen.filter((v) => da.has(v.von) && da.has(v.nach)),
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
 * Was erledigt ist und vor dem auch alles erledigt ist — der abgeschlossene
 * Anfang der Karte. Ein erledigter Schritt hinter einem offenen gehört nicht
 * dazu: Er steht mitten in laufender Arbeit, und eingeklappt sähe man nicht
 * mehr, dass dort etwas außer der Reihe fertig wurde.
 */
export function erledigterVorlauf(g: Graph): Set<number> {
  const ja = new Map<number, boolean>();
  const pruefe = (id: number): boolean => {
    const bekannt = ja.get(id);
    if (bekannt !== undefined) return bekannt;
    ja.set(id, false); // Wächter, falls doch ein Kreis hereinkommt
    const r = g.schritt(id)?.status === "erledigt" && g.vor(id).every(pruefe);
    ja.set(id, r);
    return r;
  };
  return new Set(g.karte.schritte.filter((s) => pruefe(s.id)).map((s) => s.id));
}

/** Ab so vielen erledigten Schritten am Anfang eines Themas gibt es ein Bündel (Wunsch Bernd: drei). */
export const BUENDEL_AB = 3;

export type Buendel = { thema: number | null; ids: number[]; eingeklappt: boolean };

/**
 * Die Bündel: je Thema (und für die losen Gedanken) der erledigte Vorlauf,
 * sobald er `BUENDEL_AB` Schritte hat. `aufgeklappt` nennt die Themen, die
 * jemand aufgeklappt hat (`null` für die losen); `eingeklappt` sagt je
 * Schritt, auf welchem Bündel er liegt. Gilt für beide Ansichten gleich.
 */
export function buendelVon(g: Graph, aufgeklappt: ReadonlySet<number | null> = new Set()) {
  const vorlauf = erledigterVorlauf(g);
  const buendel: Buendel[] = [];
  const eingeklappt = new Map<number, Schluessel>();
  for (const thema of new Set(g.karte.schritte.map((s) => s.thema))) {
    const ids = g.karte.schritte.filter((s) => s.thema === thema && vorlauf.has(s.id)).map((s) => s.id);
    if (ids.length < BUENDEL_AB) continue;
    const zu = !aufgeklappt.has(thema);
    buendel.push({ thema, ids, eingeklappt: zu });
    if (zu) ids.forEach((id) => eingeklappt.set(id, alsBuendel(thema)));
  }
  return { buendel, eingeklappt };
}

/**
 * Die Stränge: eine Zeile je Thema, die Spalte ist der **längste** Weg über
 * alle Abhängigkeiten — auch über Themengrenzen. Dadurch rückt „Bewerbung
 * FFG" hinter „Unterzeichnung Bank", und die Lücke im Strang der
 * Praktikantinnen zeigt von selbst, dass dort gewartet wird.
 *
 * Ein eingeklappter erledigter Vorlauf (`buendelVon`) liegt als **Bündel**
 * in der ersten Spalte, seine Schritte darauf; alles andere rückt dahinter.
 * Aufgeklappt stehen die Schritte, wo sie ohne Bündel stünden. Gerechnet,
 * nicht gespeichert: Wird ein Schritt wieder geöffnet, fällt er von selbst
 * heraus.
 *
 * `lage` ist dieselbe Ansicht, eingeklappt auf die Themen untereinander.
 */
export function straenge(
  g: Graph,
  aufgeklappt: ReadonlySet<number | null> = new Set(),
): {
  pos: Record<Schluessel, P>;
  lage: Record<Schluessel, P>;
  baender: Band[];
  buendel: Buendel[];
  eingeklappt: Map<number, Schluessel>;
} {
  const { themen, schritte } = g.karte;
  const { buendel, eingeklappt } = buendelVon(g, aufgeklappt);
  const mitBuendel = new Set(buendel.filter((b) => b.eingeklappt).map((b) => b.thema));

  // Eingeklappte zählen als Spalte 0, das Bündel selbst steht dort. In einem
  // Strang mit Bündel beginnt alles andere erst dahinter.
  const tiefe = new Map<number, number>();
  const t = (id: number): number => {
    if (eingeklappt.has(id)) return 0;
    const bekannt = tiefe.get(id);
    if (bekannt !== undefined) return bekannt;
    tiefe.set(id, 0); // Wächter, falls doch ein Kreis hereinkommt
    const v = g.vor(id);
    const ab = mitBuendel.has(g.schritt(id)?.thema ?? null) ? 1 : 0;
    const d = Math.max(ab, ...v.map((x) => t(x) + 1));
    tiefe.set(id, d);
    return d;
  };
  schritte.forEach((s) => t(s.id));

  const spuren: (number | null)[] = themen.map((x) => x.id);
  if (schritte.some((s) => s.thema === null)) spuren.push(null);
  const SPALTE = 300;
  const ZEILE = 96;
  const zeilen = spuren.map((thema) => {
    const spalten = new Map<number, Schluessel[]>();
    const lege = (d: number, k: Schluessel) => (spalten.get(d) ?? spalten.set(d, []).get(d)!).push(k);
    if (mitBuendel.has(thema)) lege(0, alsBuendel(thema));
    schritte
      .filter((s) => s.thema === thema && !eingeklappt.has(s.id))
      .forEach((s) => lege(tiefe.get(s.id)!, alsSchritt(s.id)));
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
      liste.forEach((k, i) => {
        const x = d * SPALTE;
        maxX = Math.max(maxX, x);
        pos[k] = { x, y: mitteY + (i - (liste.length - 1) / 2) * ZEILE };
      });
    }
    if (thema !== null) pos[alsThema(thema)] = { x: -300, y: mitteY };
    baender.push({ thema, y, h, x0: -440, x1: 0 });
    y += h;
  }
  for (const [id, b] of eingeklappt) pos[alsSchritt(id)] = pos[b];
  pos[MITTE] = { x: -640, y: 0 };
  baender.forEach((b) => (b.x1 = maxX + 170));

  const lageP: Record<Schluessel, P> = { [MITTE]: { x: -380, y: 0 } };
  themen.forEach((th, i) => (lageP[alsThema(th.id)] = { x: 0, y: (i - (themen.length - 1) / 2) * 200 }));
  return { pos, lage: lageP, baender, buendel, eingeklappt };
}

/* --- Neu anordnen --------------------------------------------------------- */

/**
 * Die Maße der aufgeräumten Sternkarte. Alles fällt auf das Raster, damit
 * zwei Kacheln derselben Zeile genau dieselbe Mitte haben — nur dann läuft
 * der Pfeil zwischen ihnen gerade.
 *
 * `block` ist die Mindesthöhe eines Themas: In der Lage wachsen die Themen
 * schneller als ihre Abstände (siehe `lageG` in der Bühne), und zwei
 * einzeilige Themen mit nur `zeile` Abstand lägen dort aufeinander.
 */
export const ORDNUNG = {
  nabe: 480,
  erste: 840,
  spalte: 312,
  zeile: 120,
  block: 192,
  luft: 48,
  loseJeReihe: 5,
};

export type Anordnung = {
  themen: { id: number; x: number; y: number }[];
  schritte: { id: number; x: number; y: number }[];
};

/** Der längste Weg zu jedem Schritt — nur über die Kanten, die `zaehlt` gelten lässt. */
function tiefen(g: Graph, ids: number[], zaehlt: (von: number, nach: number) => boolean): Map<number, number> {
  const tiefe = new Map<number, number>();
  const t = (id: number): number => {
    const bekannt = tiefe.get(id);
    if (bekannt !== undefined) return bekannt;
    tiefe.set(id, 0); // Wächter, falls doch ein Kreis hereinkommt
    const v = g.vor(id).filter((x) => zaehlt(x, id));
    const d = v.length ? Math.max(...v.map((x) => t(x) + 1)) : 0;
    tiefe.set(id, d);
    return d;
  };
  ids.forEach(t);
  return tiefe;
}

const nachLage = (a: Lageschritt, b: Lageschritt) => a.y - b.y || a.x - b.x || a.id - b.id;

/**
 * Die Zeilen eines Themas. Der erste Nachfolger bleibt in der Zeile seines
 * Vorgängers, damit eine Kette als gerade Linie durchläuft; jeder weitere
 * beginnt darunter eine neue. Die Reihenfolge kommt aus der bisherigen Lage —
 * was oben lag, bleibt oben.
 */
function zeilenVon(g: Graph, ns: Lageschritt[], spalte: Map<number, number>) {
  const imThema = new Set(ns.map((s) => s.id));
  const zeile = new Map<number, number>();
  const besetzt = new Set<string>();
  let n = 0;
  const lege = (s: Lageschritt, wunsch: number) => {
    if (zeile.has(s.id)) return;
    const sp = spalte.get(s.id) ?? 0;
    let z = wunsch;
    while (besetzt.has(`${sp}:${z}`)) z++;
    zeile.set(s.id, z);
    besetzt.add(`${sp}:${z}`);
    n = Math.max(n, z + 1);
    g.nach(s.id)
      .filter((id) => imThema.has(id))
      .map((id) => g.schritt(id)!)
      .sort(nachLage)
      .forEach((k, i) => lege(k, i === 0 ? z : n));
  };
  const wurzeln = ns.filter((s) => !g.vor(s.id).some((v) => imThema.has(v))).sort(nachLage);
  // Danach alle übrigen — falls doch ein Kreis hereinkommt, hätte er keine Wurzel.
  for (const s of [...wurzeln, ...[...ns].sort(nachLage)]) lege(s, n);
  return { zeile, n };
}

/**
 * Welche Themen rechts und welche links der Mitte stehen. Gesucht wird unter
 * allen Teilungen der Themen, wie sie im Uhrzeigersinn um die Mitte liegen —
 * so bleiben Nachbarn Nachbarn. Es zählen: beide Seiten gleich hoch, möglichst
 * kein Pfeil quer über die Mitte, und möglichst wenige Themen wechseln die Seite.
 */
function seitenWahl(g: Graph, hoeheVon: Map<number, number>, zeile: number) {
  const { themen } = g.karte;
  const winkel = (t: Lagethema) => {
    const w = Math.atan2(t.x, -t.y); // 0 oben, im Uhrzeigersinn
    return w < 0 ? w + 2 * Math.PI : w;
  };
  const reihum = [...themen].sort((a, b) => winkel(a) - winkel(b) || a.id - b.id);
  const quer: [number, number][] = [];
  for (const v of g.karte.verbindungen) {
    const a = g.schritt(v.von)?.thema;
    const b = g.schritt(v.nach)?.thema;
    if (a != null && b != null && a !== b) quer.push([a, b]);
  }
  const hoehe = (l: Lagethema[]) =>
    l.reduce((s, t) => s + hoeheVon.get(t.id)!, 0) + ORDNUNG.luft * Math.max(0, l.length - 1);
  let best = { preis: Infinity, rechts: [] as Lagethema[], links: [] as Lagethema[] };
  for (let r = 0; r < Math.max(1, reihum.length); r++)
    for (let k = 0; k <= reihum.length; k++) {
      const kreis = [...reihum.slice(r), ...reihum.slice(0, r)];
      const rechts = kreis.slice(0, k);
      // Im Uhrzeigersinn läuft die linke Seite von unten nach oben.
      const links = kreis.slice(k).reverse();
      const re = new Set(rechts.map((t) => t.id));
      const preis =
        Math.abs(hoehe(rechts) - hoehe(links)) / zeile +
        3 * quer.filter(([a, b]) => re.has(a) !== re.has(b)).length +
        themen.filter((t) => t.x >= 0 !== re.has(t.id)).length;
      if (preis < best.preis - 1e-9) best = { preis, rechts, links };
    }
  return best;
}

/**
 * Die aufgeräumte Sternkarte: die Themen untereinander links und rechts der
 * Mitte, gespiegelt und um die Mitte zentriert; die Schritte eines Themas
 * laufen von ihm nach außen, eine Spalte je Abhängigkeit — wie in den
 * Strängen, nur auf beiden Seiten. Lose Gedanken stehen in Reihen unter
 * allem, damit kein Pfeil von der Mitte durch sie hindurch muss.
 *
 * Die Spalte zählt Abhängigkeiten auch über Themengrenzen, aber nur auf
 * derselben Seite: Ein Pfeil von rechts nach links läuft ohnehin über die
 * Mitte, und eine Lücke deswegen hülfe niemandem.
 *
 * `zeile` misst die Bühne an den höchsten Kacheln; ohne Angabe gilt das
 * Grundmaß.
 */
export function anordnen(g: Graph, zeile = ORDNUNG.zeile): Anordnung {
  const O = ORDNUNG;
  const { themen, schritte } = g.karte;
  const vonThema = new Map<number, Lageschritt[]>(themen.map((t) => [t.id, []]));
  for (const s of schritte) if (s.thema !== null) vonThema.get(s.thema)?.push(s);
  const themaVon = (id: number) => g.schritt(id)?.thema ?? null;
  const ids = schritte.map((s) => s.id);
  const hoehe = (zeilen: number) => Math.max(O.block, Math.max(1, zeilen) * zeile);

  // Für die Wahl der Seiten genügt die Höhe mit Spalten nur innerhalb des Themas.
  const innen = tiefen(g, ids, (v, n) => themaVon(v) === themaVon(n));
  const hoeheVon = new Map(themen.map((t) => [t.id, hoehe(zeilenVon(g, vonThema.get(t.id)!, innen).n)]));
  const { rechts, links } = seitenWahl(g, hoeheVon, zeile);
  const seite = new Map<number, number>([...rechts.map((t) => [t.id, 1] as const), ...links.map((t) => [t.id, -1] as const)]);
  const spalte = tiefen(g, ids, (v, n) => {
    const a = themaVon(v);
    const b = themaVon(n);
    return a !== null && b !== null && seite.get(a) === seite.get(b);
  });

  const erg: Anordnung = { themen: [], schritte: [] };
  let unten = 0;
  for (const [liste, v] of [[rechts, 1], [links, -1]] as const) {
    const bloecke = liste.map((t) => ({ t, ...zeilenVon(g, vonThema.get(t.id)!, spalte) }));
    const H = bloecke.reduce((n, b) => n + hoehe(b.n), 0) + O.luft * Math.max(0, bloecke.length - 1);
    // Das Thema steht auf der Höhe seiner ersten Zeile, nicht in der Mitte
    // seines Blocks: Dann läuft der Pfeil zur Kette gerade hinaus. Bei einer
    // ungeraden Zahl Themen rückt die Seite so, dass das mittlere genau auf
    // Höhe der Mitte steht — sonst bekäme ausgerechnet dieser Pfeil einen
    // Versatz von ein paar Pixeln.
    const naben: number[] = [];
    let y = aufRaster(-H / 2);
    for (const b of bloecke) {
      naben.push(y + (hoehe(b.n) - Math.max(1, b.n) * zeile) / 2 + zeile / 2);
      y += hoehe(b.n) + O.luft;
    }
    const ruck = naben.length % 2 ? -naben[(naben.length - 1) / 2] : 0;
    bloecke.forEach((b, i) => {
      const z0 = naben[i] + ruck;
      erg.themen.push({ id: b.t.id, x: v * O.nabe, y: z0 });
      for (const s of vonThema.get(b.t.id)!)
        erg.schritte.push({ id: s.id, x: v * (O.erste + spalte.get(s.id)! * O.spalte), y: z0 + b.zeile.get(s.id)! * zeile });
    });
    if (bloecke.length) unten = Math.max(unten, y - O.luft + ruck);
  }

  const loseTiefe = tiefen(g, ids, (v, n) => themaVon(v) === null && themaVon(n) === null);
  const lose = schritte
    .filter((s) => s.thema === null)
    .sort((a, b) => loseTiefe.get(a.id)! - loseTiefe.get(b.id)! || nachLage(a, b));
  const y0 = aufRaster(unten + zeile);
  lose.forEach((s, i) => {
    const reihe = Math.floor(i / O.loseJeReihe);
    const breit = Math.min(O.loseJeReihe, lose.length - reihe * O.loseJeReihe);
    erg.schritte.push({ id: s.id, x: ((i % O.loseJeReihe) - (breit - 1) / 2) * O.spalte, y: y0 + reihe * zeile });
  });
  return erg;
}

/* --- Pfeilführung --------------------------------------------------------- */

/** Ein Rechteck um seine Mitte, mit halber Breite und Höhe. */
export type Rechteck = { x: number; y: number; w: number; h: number };

type Seite = "r" | "l" | "u" | "o";
type Lauf = {
  A: Rechteck;
  Z: Rechteck;
  sa: Seite;
  sz: Seite;
  /**
   * Die Andockstellen an beiden Enden, als `Kachel|Seite`. Zwei Pfeile mit
   * derselben Stelle am Anfang (oder am Ende) dürfen ein Stück gemeinsam
   * laufen und sich dann verzweigen — alle anderen nie übereinander.
   */
  fa: string;
  fz: string;
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
 * einen Weg um alle `hindernisse` herum, der keine fremde Spur entlangläuft —
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

/**
 * Müssen an einer Seite doch zwei Stellen sein — ein Pfeil kommt an, einer
 * geht —, setzen sie nie an der Ecke an, sondern mindestens `ANDOCK_RAND`
 * davon entfernt, und liegen mindestens `ANDOCK_ABSTAND` (zwei Rasterlinien)
 * auseinander, sonst sehen sie aus wie einer.
 */
export const ANDOCK_RAND = 12;
export const ANDOCK_ABSTAND = 2 * RASTER;

/** Die Rasterlinien, an denen an einer Seite angedockt werden darf. */
const andockLinien = (mitte: number, halb: number) => {
  const j0 = Math.ceil((mitte - halb + ANDOCK_RAND) / RASTER);
  const j1 = Math.floor((mitte + halb - ANDOCK_RAND) / RASTER);
  return { j0, j1, l: j1 - j0 + 1 };
};

/**
 * Wo die `i`-te von `n` Andockstellen an einer Seite liegt: um die Mitte, mit
 * Luft zwischen ihnen, aber nie näher als `ANDOCK_RAND` an der Ecke.
 */
export function andockStelle(mitte: number, halb: number, i: number, n: number, amRaster: boolean): number {
  if (n === 1 && !amRaster) return mitte;
  const spanne = 2 * halb - 2 * ANDOCK_RAND;
  if (amRaster) {
    const { j0, j1, l } = andockLinien(mitte, halb);
    const minS = ANDOCK_ABSTAND / RASTER;
    if (n === 1) return l > 0 ? klemme(Math.round(mitte / RASTER), j0, j1) * RASTER : mitte;
    if ((l - 1) / (n - 1) >= minS) {
      const hoechst = Math.floor((l - 1) / (n - 1));
      let s = Math.min(hoechst, Math.max(minS, Math.round((l + 1) / (n + 1))));
      // Symmetrisch um die Mittellinie geht nur, wenn die ganze Spanne eine
      // gerade Zahl Rasterschritte ist — sonst hinge ein Pfeil eine Linie schief.
      if ((s * (n - 1)) % 2) s = s + 1 <= hoechst ? s + 1 : s - 1 >= minS ? s - 1 : s;
      const start = klemme(Math.round(mitte / RASTER) - Math.floor((s * (n - 1)) / 2), j0, j1 - s * (n - 1));
      return (start + i * s) * RASTER;
    }
  }
  // Ohne Raster (oder wenn es nicht reicht): gleichmäßig um die Mitte.
  if (spanne <= 0) return mitte;
  const schritt = Math.min(spanne / (n - 1), Math.max(ANDOCK_ABSTAND, spanne / (n + 1)));
  return mitte + (i - (n - 1) / 2) * schritt;
}

/**
 * Wonach die Andockstellen an einer Seite sortiert werden: nach dem Winkel zum
 * anderen Ende, von der Seite aus gesehen — so kreuzen sich die Pfeile an der
 * Kachel nicht.
 */
function gegenUeber(s: Seite, von: Rechteck, zu: Rechteck): number {
  const dx = zu.x - von.x;
  const dy = zu.y - von.y;
  return s === "r" ? Math.atan2(dy, dx) : s === "l" ? Math.atan2(dy, -dx) : s === "u" ? Math.atan2(dx, dy) : Math.atan2(dx, -dy);
}

/** Die Mitte einer Seite, `ab` davor. */
function seitenMitte(r: Rechteck, s: Seite, ab = 4): P {
  return s === "r"
    ? { x: r.x + r.w + ab, y: r.y }
    : s === "l"
      ? { x: r.x - r.w - ab, y: r.y }
      : s === "u"
        ? { x: r.x, y: r.y + r.h + ab }
        : { x: r.x, y: r.y - r.h - ab };
}

type Wahl = { sa: Seite; sz: Seite; knicke: number; aufschlag: number };

/**
 * Die Wege, die ein Pfeil von A nach Z nehmen kann: einander gegenüber
 * (gerade, oder mit zwei Knicken über eine Mittelspur) oder über Eck — an
 * einer Seite hinaus, an einer quer dazu hinein, mit einem einzigen Knick.
 *
 * Über Eck nur, wenn beide Schenkel lang genug sind; sonst entstünde ein
 * Haken von ein paar Pixeln. Senkrecht gegenüber kostet einen kleinen
 * Aufschlag: Bei einem Fächer ging sonst die Hälfte oben und unten hinaus.
 * Von oben oder unten **hinein** kostet ebenfalls: Ein Thema, das man von
 * der Seite liest, soll seinen Pfeil auch von der Seite bekommen — nur wo
 * diese Seite schon belegt ist (ein Zusammenlauf), lohnt sich der Weg unten herein.
 */
function wege(A: Rechteck, Z: Rechteck): Wahl[] {
  const dx = Z.x - A.x;
  const dy = Z.y - A.y;
  const h: Seite = dx > 0 ? "r" : "l";
  const hz: Seite = dx > 0 ? "l" : "r";
  const v: Seite = dy > 0 ? "u" : "o";
  const vz: Seite = dy > 0 ? "o" : "u";
  const schenkel = 2 * RASTER;
  const w: Wahl[] = [];
  if (Math.abs(dx) - A.w - Z.w >= 16) w.push({ sa: h, sz: hz, knicke: Math.abs(dy) < 0.5 ? 0 : 2, aufschlag: 0 });
  if (Math.abs(dy) - A.h - Z.h >= 16) w.push({ sa: v, sz: vz, knicke: Math.abs(dx) < 0.5 ? 0 : 2, aufschlag: 0.3 });
  if (Math.abs(dy) - A.h >= schenkel && Math.abs(dx) - Z.w >= schenkel) w.push({ sa: v, sz: hz, knicke: 1, aufschlag: 0 });
  if (Math.abs(dx) - A.w >= schenkel && Math.abs(dy) - Z.h >= schenkel) w.push({ sa: h, sz: vz, knicke: 1, aufschlag: 0.6 });
  // Als Letztes ein Bogen: an derselben Seite hinaus und wieder hinein. Nur
  // für den Fall, dass alles andere durch eine Kachel liefe — etwa drei
  // Themen übereinander, und der Pfeil geht vom obersten zum untersten.
  if (w.length) for (const s of ["r", "l", "u", "o"] as const) w.push({ sa: s, sz: s, knicke: 2, aufschlag: 1.5 });
  return w;
}

/** Wo ein Bogen außen an beiden Kacheln vorbeiläuft. */
function bogenSpur(A: Rechteck, Z: Rechteck, s: Seite): number {
  const luft = 2 * RASTER;
  return s === "r"
    ? aufRaster(Math.max(A.x + A.w, Z.x + Z.w) + luft)
    : s === "l"
      ? aufRaster(Math.min(A.x - A.w, Z.x - Z.w) - luft)
      : s === "u"
        ? aufRaster(Math.max(A.y + A.h, Z.y + Z.h) + luft)
        : aufRaster(Math.min(A.y - A.h, Z.y - Z.h) - luft);
}

/** Der Weg eines Pfeils ohne Rücksicht auf andere — zum Abwägen, ob er durch eine Kachel liefe. */
function skizze(A: Rechteck, Z: Rechteck, sa: Seite, sz: Seite): P[] {
  const p1 = seitenMitte(A, sa);
  const p2 = seitenMitte(Z, sz);
  if (quer(sa) !== quer(sz)) return [p1, quer(sa) ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y }, p2];
  if (sa === sz) {
    const c = bogenSpur(A, Z, sa);
    return quer(sa) ? [p1, { x: c, y: p1.y }, { x: c, y: p2.y }, p2] : [p1, { x: p1.x, y: c }, { x: p2.x, y: c }, p2];
  }
  if (quer(sa)) {
    const c = (p1.x + p2.x) / 2;
    return [p1, { x: c, y: p1.y }, { x: c, y: p2.y }, p2];
  }
  const c = (p1.y + p2.y) / 2;
  return [p1, { x: p1.x, y: c }, { x: p2.x, y: c }, p2];
}

/** Ob eine rechtwinklige Punktfolge durch ein Rechteck läuft. */
function trifft(pts: P[], r: Rechteck): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (
      Math.max(a.x, b.x) > r.x - r.w &&
      Math.min(a.x, b.x) < r.x + r.w &&
      Math.max(a.y, b.y) > r.y - r.h &&
      Math.min(a.y, b.y) < r.y + r.h
    )
      return true;
  }
  return false;
}

/**
 * Welche Seite jeder Pfeil nimmt, und wo genau er dort ansetzt.
 *
 * **Ein Pfeil setzt in der Mitte einer Seite an**, und dafür stehen alle vier
 * Seiten zur Wahl. Früher verteilten sich mehrere Pfeile über eine Seite —
 * dann lief keiner von ihnen mittig, und zwei Kacheln auf einer Linie bekamen
 * trotzdem einen Pfeil mit Versatz. Jetzt wird je Pfeil abgewogen: wenige
 * Knicke, keine Kachel im Weg, und eine Seite möglichst für sich. Teilen
 * zwei Pfeile, die beide hinausgehen (oder beide hereinkommen), eine Seite,
 * laufen sie aus einem Punkt und verzweigen sich — wie ein Stammbaum. Nur
 * wenn an einer Seite einer hinaus- und einer hereingeht, bekommen sie zwei
 * Stellen; ein gemeinsamer Punkt läse sich wie ein Durchgang.
 *
 * Gerade Pfeile wählen zuerst, dann die über Eck, zuletzt die mit zwei
 * Knicken: Wer am wenigsten Auswahl hat, soll sie nicht verlieren.
 */
function andocken(pfeile: Pfeilenden[], kacheln: Record<string, Rechteck>, amRaster: boolean): (Lauf | null)[] {
  const ab = 4;
  const seiten = new Map<string, Andock[]>();
  const alle = Object.entries(kacheln);
  const kandidaten = pfeile.map(({ a, b }) => {
    const A = kacheln[a];
    const Z = kacheln[b];
    if (!A || !Z) return null;
    // Liegen (noch) aufeinander, etwa beim Einklappen.
    if (Math.abs(Z.x - A.x) - A.w - Z.w < 16 && Math.abs(Z.y - A.y) - A.h - Z.h < 16) return null;
    const w = wege(A, Z);
    return w.length ? { a, b, A, Z, w, min: Math.min(...w.map((x) => x.knicke)), weit: Math.hypot(Z.x - A.x, Z.y - A.y) } : null;
  });
  const reihe = kandidaten
    .map((k, i) => ({ k, i }))
    .filter((x): x is { k: NonNullable<(typeof kandidaten)[number]>; i: number } => !!x.k)
    .sort((p, q) => p.k.min - q.k.min || p.k.weit - q.k.weit);

  const laeufe: (Lauf | null)[] = pfeile.map(() => null);
  for (const { k, i } of reihe) {
    // Was an einer Seite schon hängt: in derselben Richtung ein wenig — einmal,
    // nicht je Pfeil, denn ein Stamm wird vom dritten Ast nicht voller —,
    // entgegen viel.
    const preis = (kachel: string, s: Seite, ende: "a" | "z") => {
      const da = seiten.get(`${kachel}|${s}`) ?? [];
      return (da.some((p) => p.ende === ende) ? 0.5 : 0) + 6 * da.filter((p) => p.ende !== ende).length;
    };
    let wahl = k.w[0];
    let bester = Infinity;
    for (const w of k.w) {
      const sk = skizze(k.A, k.Z, w.sa, w.sz);
      const im = alle.filter(([key, r]) => key !== k.a && key !== k.b && trifft(sk, r)).length;
      const p = w.knicke + w.aufschlag + preis(k.a, w.sa, "a") + preis(k.b, w.sz, "z") + 4 * im;
      if (p < bester) {
        bester = p;
        wahl = w;
      }
    }
    const lauf: Lauf = {
      A: k.A,
      Z: k.Z,
      sa: wahl.sa,
      sz: wahl.sz,
      fa: `${k.a}|${wahl.sa}`,
      fz: `${k.b}|${wahl.sz}`,
      p1: { x: 0, y: 0 },
      p2: { x: 0, y: 0 },
    };
    const seite = (key: string, s: Seite, ende: "a" | "z", gegen: number) =>
      (seiten.get(`${key}|${s}`) ?? seiten.set(`${key}|${s}`, []).get(`${key}|${s}`)!).push({ lauf, ende, s, gegen });
    seite(k.a, lauf.sa, "a", gegenUeber(lauf.sa, k.A, k.Z));
    seite(k.b, lauf.sz, "z", gegenUeber(lauf.sz, k.Z, k.A));
    laeufe[i] = lauf;
  }

  // Für den Wegsucher liegen die Stellen auf Rasterlinien, sonst begänne
  // jeder Weg mit einem Versatz.
  for (const liste of seiten.values()) {
    const mittel = (g: Andock[]) => g.reduce((n, p) => n + p.gegen, 0) / g.length;
    const gruppen = (["a", "z"] as const)
      .map((e) => liste.filter((p) => p.ende === e))
      .filter((g) => g.length)
      .sort((p, q) => mittel(p) - mittel(q));
    gruppen.forEach((g, gi) =>
      g.forEach((p) => {
        const r = p.ende === "a" ? p.lauf.A : p.lauf.Z;
        const versatz = andockStelle(quer(p.s) ? r.y : r.x, quer(p.s) ? r.h : r.w, gi, gruppen.length, amRaster);
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
      }),
    );
  }
  return laeufe;
}

const verwandt = (p: { fa: string; fz: string }, q: { fa: string; fz: string }) => p.fa === q.fa || p.fz === q.fz;

function grob(pfeile: Pfeilenden[], kacheln: Record<string, Rechteck>): (P[] | null)[] {
  const laeufe = andocken(pfeile, kacheln, false);
  const belegt: { h: boolean; c: number; von: number; bis: number; fa: string; fz: string }[] = [];
  // Die Spur, die eine Andockstelle schon hat: Verwandte nehmen dieselbe, dann
  // verzweigen sie sich an einer Stelle, statt sich gegenseitig zu kreuzen.
  const kanal = new Map<string, number>();
  // Die weiteste Strecke quer zuerst: Sie bekommt die Mittelspur, und wer
  // danach kommt, weicht zum Ziel hin aus — also innen an ihr vorbei. In der
  // Reihenfolge der Liste bekam die kurze die Mitte, die lange wich nach
  // außen aus und kreuzte sie.
  const weite = (L: Lauf) => (quer(L.sa) ? Math.abs(L.p1.y - L.p2.y) : Math.abs(L.p1.x - L.p2.x));
  const reihe = laeufe
    .map((L, i) => ({ L, i }))
    .filter((x): x is { L: Lauf; i: number } => !!x.L)
    .sort((a, b) => weite(b.L) - weite(a.L));
  const ergebnis: (P[] | null)[] = laeufe.map(() => null);
  for (const { L, i } of reihe) {
    const { p1, p2 } = L;
    if (quer(L.sa) !== quer(L.sz)) {
      ergebnis[i] = [p1, quer(L.sa) ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y }, p2];
      continue;
    }
    const h = quer(L.sa);
    if (L.sa === L.sz) {
      const c = bogenSpur(L.A, L.Z, L.sa);
      ergebnis[i] = h ? [p1, { x: c, y: p1.y }, { x: c, y: p2.y }, p2] : [p1, { x: p1.x, y: c }, { x: p2.x, y: c }, p2];
      continue;
    }
    const q = h ? [p1.y, p2.y] : [p1.x, p2.x];
    const l = h ? [p1.x, p2.x] : [p1.y, p2.y];
    if (Math.abs(q[0] - q[1]) < 0.5) {
      ergebnis[i] = [p1, p2];
      continue;
    }
    const lo = Math.min(...l) + 8;
    const hi = Math.max(...l) - 8;
    const von = Math.min(...q);
    const bis = Math.max(...q);
    const zumZiel = l[1] >= l[0] ? 1 : -1;
    const c0 = hi > lo ? klemme(aufRaster((l[0] + l[1]) / 2), lo, hi) : (l[0] + l[1]) / 2;
    const passt = (v: number | undefined): v is number => v !== undefined && (hi <= lo || (v >= lo && v <= hi));
    const geteilt = [kanal.get(`${h}${L.fa}`), kanal.get(`${h}${L.fz}`)].find(passt);
    let c = geteilt ?? c0;
    // Die Mittelspur, und wenn dort schon ein Fremder läuft, die nächste daneben.
    if (geteilt === undefined)
      for (const n of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        const v = c0 + n * zumZiel * RASTER;
        if (hi > lo && (v < lo || v > hi)) continue;
        if (!belegt.some((s) => s.h === h && !verwandt(s, L) && Math.abs(s.c - v) < RASTER - 1 && s.von < bis + 6 && von < s.bis + 6)) {
          c = v;
          break;
        }
      }
    belegt.push({ h, c, von, bis, fa: L.fa, fz: L.fz });
    if (!kanal.has(`${h}${L.fa}`)) kanal.set(`${h}${L.fa}`, c);
    if (!kanal.has(`${h}${L.fz}`)) kanal.set(`${h}${L.fz}`, c);
    ergebnis[i] = h
      ? [p1, { x: c, y: p1.y }, { x: c, y: p2.y }, p2]
      : [p1, { x: p1.x, y: c }, { x: p2.x, y: c }, p2];
  }
  return ergebnis;
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
  // Je Zelle, wer dort entlangläuft (Bits: 1 waagrecht, 2 senkrecht). Verwandte
  // dürfen auf derselben Spur laufen, Fremde nur quer darüber.
  type Spur = { bits: number; fa: string; fz: string };
  const belegt = new Map<number, Spur[]>();
  const freiZ = (k: number, bits: number, L: Lauf) => (belegt.get(k) ?? []).every((e) => !(e.bits & bits) || verwandt(e, L));
  const fremd = (k: number, L: Lauf) => (belegt.get(k) ?? []).some((e) => !verwandt(e, L));
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
  const suche = (L: Lauf, si: number, sj: number, dS: number, ei: number, ej: number, dE: number, rand: number) => {
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
    if (!freiZ(zk(si, sj), achse(dS), L)) return null;
    kosten[idx(si, sj, dS)] = 0;
    hinein([hdist(si, sj), 0, si, sj, dS]);
    while (haufen.length) {
      const [, g, i, j, d] = heraus();
      if (g > kosten[idx(i, j, d)]) continue;
      if (i === ei && j === ej) {
        if (!freiZ(zk(i, j), achse(d) | achse(dE), L)) continue;
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
        if (!freiZ(zk(i, j), achse(d) | achse(d2), L)) continue;
        const ni = i + RICHTUNG[d2][0];
        const nj = j + RICHTUNG[d2][1];
        if (ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
        const nk = zk(ni, nj);
        if (gesperrtZ.has(nk) && !(ni === ei && nj === ej)) continue;
        if (!freiZ(nk, achse(d2), L)) continue;
        // Kreuzen darf er, aber es kostet: Sonst nimmt er bei gleicher Länge
        // die Spur jenseits eines anderen Pfeils so gern wie die diesseits.
        const g2 = g + 1 + (d2 !== d ? 4 : 0) + (fremd(nk, L) ? 6 : 0);
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
      weg = suche(L, si, sj, dS, ei, ej, dE, rand);
      if (weg) break;
    }
    if (!weg) continue; // bleibt bei der schnellen Führung
    for (const [wi, wj, rein, raus] of weg) {
      const k = zk(wi, wj);
      (belegt.get(k) ?? belegt.set(k, []).get(k)!).push({ bits: achse(rein) | achse(raus), fa: L.fa, fz: L.fz });
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
