import { describe, expect, it } from "vitest";

import type { Karte, Lageschritt, Lagethema, Lageverbindung } from "./daten";
import {
  ORDNUNG,
  RASTER,
  alsSchritt,
  alsThema,
  anordnen,
  belegt,
  erreichbar,
  fang,
  freieFarbe,
  frei,
  fuehre,
  gesperrt,
  graph,
  hubZeilen,
  kreuzSperre,
  lage,
  platzFuer,
  straenge,
  straffe,
  verbindungsHindernis,
  type P,
  type Rechteck,
} from "./lagekarte";

const thema = (id: number, name: string, x = 0, y = 0): Lagethema => ({ id, name, farbe: id, x, y });
const schritt = (id: number, titel: string, mehr: Partial<Lageschritt> = {}): Lageschritt => ({
  id, thema: null, titel, art: "schritt", status: "offen", frist: null, notiz: "", x: 0, y: 0, ...mehr,
});
let naechste = 100;
const pfeil = (von: number, nach: number, text = ""): Lageverbindung => ({ id: ++naechste, von, nach, text });

/** Die Gründung und die Praktikantinnen aus dem Entwurf, verkürzt. */
function beispiel(): Karte {
  return {
    themen: [thema(1, "Gründung", -420, -160), thema(2, "Praktikantinnen", -300, -470)],
    schritte: [
      schritt(1, "Gesellschaftervertrag", { thema: 1 }),
      schritt(2, "Konto eröffnen", { thema: 1 }),
      schritt(3, "Unterzeichnung Bank", { thema: 1 }),
      schritt(4, "Themen finden", { thema: 2, status: "erledigt" }),
      schritt(5, "Bewerbung FFG", { thema: 2 }),
      schritt(6, "Rückmeldung FFG", { thema: 2, art: "warten" }),
    ],
    verbindungen: [pfeil(1, 2), pfeil(2, 3), pfeil(4, 5), pfeil(3, 5, "Gründung fertig"), pfeil(5, 6)],
  };
}

describe("wartet und frei — gerechnet, nicht gespeichert", () => {
  it("frei ist, was offen ist und vor dem nichts Offenes steht", () => {
    const g = graph(beispiel());
    expect(frei(g, g.schritt(1)!)).toBe(true);
    expect(frei(g, g.schritt(2)!)).toBe(false);
    expect(gesperrt(g, g.schritt(2)!)).toBe(true);
  });

  it("ein erledigter Vorgänger gibt frei", () => {
    const k = beispiel();
    k.schritte[0].status = "erledigt";
    const g = graph(k);
    expect(frei(g, g.schritt(2)!)).toBe(true);
  });

  it("was von außen kommt, ist nie „als Nächstes“ — auch ohne Vorgänger", () => {
    const k: Karte = { themen: [], schritte: [schritt(1, "Z-Achse geliefert", { art: "warten" })], verbindungen: [] };
    const g = graph(k);
    expect(frei(g, g.schritt(1)!)).toBe(false);
    expect(lage(g).wartet.map((s) => s.titel)).toEqual(["Z-Achse geliefert"]);
  });

  it("was ein Thema aufhält, kommt aus einem anderen Thema", () => {
    const g = graph(beispiel());
    // Bewerbung FFG hängt an Themen finden (erledigt, eigenes Thema) und an der Bank (offen, Gründung).
    expect(kreuzSperre(g, g.schritt(5)!).map((s) => s.titel)).toEqual(["Unterzeichnung Bank"]);
    expect(lage(g).haengt.map((h) => [h.schritt.titel, h.an.titel])).toEqual([["Bewerbung FFG", "Unterzeichnung Bank"]]);
  });

  it("die Kachel eines Themas sagt, worauf es wartet", () => {
    const g = graph(beispiel());
    expect(hubZeilen(g, g.thema(2)!)).toEqual([
      { art: "wartet", text: "wartet: Rückmeldung FFG" },
      { art: "kreuz", text: "wartet auf Gründung" },
    ]);
    expect(hubZeilen(g, thema(9, "Leer"))).toEqual([{ art: "leer", text: "noch leer" }]);
  });

  it("die freien stehen nach Frist, ohne Frist zuletzt", () => {
    const k: Karte = {
      themen: [],
      schritte: [schritt(1, "ohne"), schritt(2, "später", { frist: "2026-12-01" }), schritt(3, "bald", { frist: "2026-10-01" })],
      verbindungen: [],
    };
    expect(lage(graph(k)).frei.map((s) => s.titel)).toEqual(["bald", "später", "ohne"]);
  });

  it("ein Pfeil, dessen Ende fehlt, sperrt nichts", () => {
    const k: Karte = { themen: [], schritte: [schritt(2, "B")], verbindungen: [pfeil(99, 2)] };
    const g = graph(k);
    expect(frei(g, g.schritt(2)!)).toBe(true);
  });
});

describe("Kreise — dieselbe Regel wie am Server", () => {
  it("weist einen Kreis über drei Schritte ab", () => {
    const g = graph(beispiel());
    expect(erreichbar(g, 1, 3)).toBe(true);
    expect(verbindungsHindernis(g, 3, 1)).toMatch(/Kreis/);
    expect(verbindungsHindernis(g, 1, 3)).toBeNull();
  });

  it("Umdrehen zählt die umgedrehte Verbindung nicht mit", () => {
    const k = beispiel();
    const g = graph(k);
    const a = k.verbindungen[0]; // 1 → 2
    expect(verbindungsHindernis(g, 2, 1)).toMatch(/Kreis/);
    expect(verbindungsHindernis(g, 2, 1, a.id)).toBeNull();
  });

  it("doppelt und auf sich selbst geht nicht", () => {
    const g = graph(beispiel());
    expect(verbindungsHindernis(g, 1, 2)).toMatch(/gibt es schon/);
    expect(verbindungsHindernis(g, 4, 4)).toMatch(/sich selbst/);
  });
});

describe("Stränge", () => {
  it("die Spalte ist der längste Weg — auch über Themengrenzen", () => {
    const { pos } = straenge(graph(beispiel()));
    // Bewerbung FFG rückt hinter die Unterzeichnung Bank, nicht hinter „Themen finden“.
    expect(pos[alsSchritt(3)].x).toBe(600);
    expect(pos[alsSchritt(5)].x).toBe(900);
    expect(pos[alsSchritt(6)].x).toBe(1200);
    // Jedes Thema hat seine Zeile.
    expect(pos[alsSchritt(1)].y).toBe(pos[alsThema(1)].y);
    expect(pos[alsSchritt(4)].y).toBe(pos[alsThema(2)].y);
  });

  it("lose Gedanken bekommen ein eigenes Band ohne Thema", () => {
    const k = beispiel();
    k.schritte.push(schritt(7, "Messe?"));
    const { baender } = straenge(graph(k));
    expect(baender.map((b) => b.thema)).toEqual([1, 2, null]);
  });

  it("übersteht einen Kreis, der doch hereinkommt", () => {
    const k: Karte = { themen: [], schritte: [schritt(1, "A"), schritt(2, "B")], verbindungen: [pfeil(1, 2), pfeil(2, 1)] };
    expect(() => straenge(graph(k))).not.toThrow();
  });
});

describe("Pfeilführung", () => {
  const kachel = (x: number, y: number): Rechteck => ({ x, y, w: 100, h: 24 });
  const rechtwinklig = (pts: P[]) =>
    pts.slice(1).every((q, i) => Math.abs(q.x - pts[i].x) < 0.01 || Math.abs(q.y - pts[i].y) < 0.01);
  /** Ob zwei verschiedene Wege einander rechtwinklig kreuzen — Endpunkte zählen nicht. */
  const kreuzen = (wege: P[][]) => {
    const strecken = wege.flatMap((pts, i) => pts.slice(1).map((q, k) => ({ i, a: pts[k], b: q })));
    const zwischen = (w: number, p: number, q: number) => w > Math.min(p, q) + 0.5 && w < Math.max(p, q) - 0.5;
    return strecken.some((s) =>
      strecken.some((t) => {
        if (s.i === t.i) return false;
        const [h, v] = Math.abs(s.a.y - s.b.y) < 0.01 ? [s, t] : [t, s];
        if (Math.abs(h.a.y - h.b.y) > 0.01 || Math.abs(v.a.x - v.b.x) > 0.01) return false;
        return zwischen(v.a.x, h.a.x, h.b.x) && zwischen(h.a.y, v.a.y, v.b.y);
      }),
    );
  };
  /** Die Mitte welcher Seite von `r` der Punkt ist — oder `null`, wenn keiner. */
  const seitenmitte = (q: P, r: Rechteck) => {
    const nah = (a: number, b: number) => Math.abs(a - b) < 0.01;
    if (nah(q.y, r.y) && nah(q.x, r.x + r.w + 4)) return "r";
    if (nah(q.y, r.y) && nah(q.x, r.x - r.w - 4)) return "l";
    if (nah(q.x, r.x) && nah(q.y, r.y + r.h + 4)) return "u";
    if (nah(q.x, r.x) && nah(q.y, r.y - r.h - 4)) return "o";
    return null;
  };

  it("liegen zwei Kacheln auf einer Linie, läuft der Pfeil gerade", () => {
    const kacheln = { a: kachel(0, 0), b: kachel(400, 0) };
    for (const fein of [false, true])
      expect(fuehre([{ a: "a", b: "b" }], kacheln, fein, Object.values(kacheln))).toEqual([[{ x: 104, y: 0 }, { x: 296, y: 0 }]]);
  });

  it("über Eck: mittig hinaus, mittig hinein, ein Knick", () => {
    const kacheln = { a: kachel(0, 0), b: kachel(400, 96) };
    for (const fein of [false, true]) {
      const [pts] = fuehre([{ a: "a", b: "b" }], kacheln, fein, Object.values(kacheln));
      expect(rechtwinklig(pts!)).toBe(true);
      expect(pts).toHaveLength(3);
      expect(seitenmitte(pts![0], kacheln.a)).toBe("u");
      expect(seitenmitte(pts![2], kacheln.b)).toBe("l");
    }
  });

  it("eine Verzweigung nimmt eine freie Seite, statt sich neben den geraden Pfeil zu drängen", () => {
    // a → b gerade, a → c eine Zeile tiefer; d sammelt b und c wieder ein.
    const kacheln = { a: kachel(0, 0), b: kachel(312, 0), c: kachel(312, 120), d: kachel(624, 0) };
    const pfeile = [{ a: "a", b: "b" }, { a: "a", b: "c" }, { a: "b", b: "d" }, { a: "c", b: "d" }];
    for (const fein of [false, true]) {
      const wege = fuehre(pfeile, kacheln, fein, Object.values(kacheln)).map((pts) => pts!);
      expect(wege[0]).toHaveLength(2);
      expect(seitenmitte(wege[1][0], kacheln.a)).toBe("u");
      expect(seitenmitte(wege[1][wege[1].length - 1], kacheln.c)).toBe("l");
      expect(wege[2]).toHaveLength(2);
      expect(seitenmitte(wege[3][0], kacheln.c)).toBe("r");
      expect(seitenmitte(wege[3][wege[3].length - 1], kacheln.d)).toBe("u");
      expect(kreuzen(wege)).toBe(false);
    }
  });

  it("der Wegsucher geht um eine Kachel dazwischen herum", () => {
    const kacheln = { a: kachel(0, 0), b: kachel(600, 0), mitte: kachel(300, 0) };
    const [pts] = fuehre([{ a: "a", b: "b" }], kacheln, true, Object.values(kacheln));
    expect(rechtwinklig(pts!)).toBe(true);
    // Kein Punkt liegt in der Kachel dazwischen.
    const m = kacheln.mitte;
    const drin = pts!.some((q) => Math.abs(q.x - m.x) < m.w && Math.abs(q.y - m.y) < m.h);
    expect(drin).toBe(false);
    expect(pts!.length).toBeGreaterThan(2);
  });

  it("jeder Pfeil setzt mittig an einer Seite an, und keine zwei kreuzen sich", () => {
    const gross: Rechteck = { x: 0, y: 0, w: 110, h: 45 };
    const kacheln: Record<string, Rechteck> = { a: gross };
    const pfeile = [-360, -240, -120, 0, 120, 240, 360].map((y, i) => {
      kacheln[`z${i}`] = kachel(500, y);
      return { a: "a", b: `z${i}` };
    });
    for (const fein of [false, true]) {
      const wege = fuehre(pfeile, kacheln, fein, Object.values(kacheln)).map((pts) => pts!);
      for (const pts of wege) expect(seitenmitte(pts[0], gross)).not.toBeNull();
      // Der auf derselben Linie geht gerade rechts hinaus.
      expect(wege[3]).toEqual([{ x: 114, y: 0 }, { x: 396, y: 0 }]);
      expect(kreuzen(wege)).toBe(false);
    }
  });

  it("ein Fächer ist symmetrisch um die Mitte und ohne Kreuzung", () => {
    const mitte: Rechteck = { x: -420, y: 0, w: 170, h: 64 };
    const kacheln: Record<string, Rechteck> = { m: mitte };
    const ys = [-444, -222, 0, 222, 444];
    ys.forEach((y, i) => (kacheln[`t${i}`] = { x: 0, y, w: 200, h: 40 + 10 * i }));
    const pfeile = ys.map((_, i) => ({ a: "m", b: `t${i}` }));
    for (const fein of [false, true]) {
      const wege = fuehre(pfeile, kacheln, fein, Object.values(kacheln)).map((pts) => pts!);
      const starts = wege.map((pts) => pts[0]);
      starts.forEach((q) => expect(seitenmitte(q, mitte)).not.toBeNull());
      // Gespiegelt um die Mitte: oben wie unten.
      starts.forEach((q, i) => {
        expect(q.x).toBeCloseTo(starts[starts.length - 1 - i].x);
        expect(q.y).toBeCloseTo(-starts[starts.length - 1 - i].y);
      });
      expect(kreuzen(wege)).toBe(false);
    }
  });

  it("liegt eine Kachel genau dazwischen, geht der Pfeil im Bogen außen herum", () => {
    const kacheln = { a: kachel(0, -200), mitte: kachel(0, 0), b: kachel(0, 200) };
    for (const fein of [false, true]) {
      const [pts] = fuehre([{ a: "a", b: "b" }], kacheln, fein, Object.values(kacheln));
      expect(rechtwinklig(pts!)).toBe(true);
      const m = kacheln.mitte;
      for (let i = 1; i < pts!.length; i++) {
        const [p, q] = [pts![i - 1], pts![i]];
        const durch = Math.max(p.x, q.x) > m.x - m.w && Math.min(p.x, q.x) < m.x + m.w && Math.max(p.y, q.y) > m.y - m.h && Math.min(p.y, q.y) < m.y + m.h;
        expect(durch).toBe(false);
      }
    }
  });

  it("liegen zwei Kacheln aufeinander, gibt es keinen Pfeil", () => {
    expect(fuehre([{ a: "a", b: "b" }], { a: kachel(0, 0), b: kachel(10, 5) })).toEqual([null]);
  });

  it("straffe lässt nur die Knicke übrig", () => {
    expect(
      straffe([
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 },
      ]),
    ).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  });
});

describe("Neu anordnen", () => {
  const O = ORDNUNG;
  const lage = (k: Karte) => {
    const a = anordnen(graph(k));
    return {
      a,
      t: new Map(a.themen.map((x) => [x.id, x])),
      s: new Map(a.schritte.map((x) => [x.id, x])),
    };
  };

  it("eine Kette läuft in einer Zeile vom Thema nach außen, eine Verzweigung beginnt darunter", () => {
    const { t, s } = lage({
      themen: [thema(1, "Gründung", 300, 0)],
      schritte: [1, 2, 3, 4].map((id) => schritt(id, `S${id}`, { thema: 1 })),
      verbindungen: [pfeil(1, 2), pfeil(2, 3), pfeil(1, 4)],
    });
    expect(t.get(1)!).toEqual({ id: 1, x: O.nabe, y: 0 }); // das einzige Thema auf Höhe der Mitte …
    expect(s.get(1)!.y).toBe(0); // … und mit seiner Kette auf einer Linie
    expect([1, 2, 3].map((id) => s.get(id)!.y)).toEqual([s.get(1)!.y, s.get(1)!.y, s.get(1)!.y]);
    expect([1, 2, 3].map((id) => s.get(id)!.x)).toEqual([O.erste, O.erste + O.spalte, O.erste + 2 * O.spalte]);
    expect(s.get(4)!).toEqual({ id: 4, x: O.erste + O.spalte, y: s.get(1)!.y + O.zeile });
  });

  it("die Themen stehen links und rechts gleich verteilt und gespiegelt", () => {
    const { t, s } = lage({
      themen: [thema(1, "Oben", 0, -400), thema(2, "Rechts", 400, 0), thema(3, "Unten", 0, 400), thema(4, "Links", -400, 0)],
      schritte: [1, 2, 3, 4].map((id) => schritt(id, `S${id}`, { thema: id })),
      verbindungen: [],
    });
    const rechts = [...t.values()].filter((x) => x.x > 0).map((x) => x.y);
    const links = [...t.values()].filter((x) => x.x < 0).map((x) => x.y);
    expect(rechts).toHaveLength(2);
    expect(rechts.sort()).toEqual(links.sort());
    // Jeder Schritt auf der Seite seines Themas, nach außen.
    for (const id of [1, 2, 3, 4]) expect(Math.sign(s.get(id)!.x)).toBe(Math.sign(t.get(id)!.x));
  });

  it("alles liegt auf dem Raster", () => {
    const { a } = lage(beispiel());
    for (const p of [...a.themen, ...a.schritte]) {
      expect(Math.abs(p.x % RASTER)).toBe(0);
      expect(Math.abs(p.y % RASTER)).toBe(0);
    }
  });

  it("eine Abhängigkeit über Themen derselben Seite rückt eine Spalte weiter", () => {
    const { t, s } = lage(beispiel());
    // „Bewerbung FFG" hängt an „Unterzeichnung Bank" (Spalte 2) — wenn beide Themen auf einer Seite stehen.
    if (Math.sign(t.get(1)!.x) === Math.sign(t.get(2)!.x)) expect(Math.abs(s.get(5)!.x)).toBe(O.erste + 3 * O.spalte);
    else expect(Math.abs(s.get(5)!.x)).toBe(O.erste + O.spalte);
  });

  it("lose Gedanken stehen unter allem, um die Mitte zentriert", () => {
    const k = beispiel();
    k.schritte.push(schritt(7, "Lose A"), schritt(8, "Lose B"));
    const { a, s } = lage(k);
    const tiefster = Math.max(...a.themen.map((x) => x.y), ...a.schritte.filter((x) => x.id < 7).map((x) => x.y));
    expect(s.get(7)!.y).toBeGreaterThan(tiefster);
    expect(s.get(7)!.y).toBe(s.get(8)!.y);
    expect(s.get(7)!.x + s.get(8)!.x).toBe(0);
  });

  it("danach laufen die Pfeile einer Kette gerade", () => {
    const k = beispiel();
    const { t, s } = lage(k);
    const kacheln: Record<string, Rechteck> = {};
    for (const [id, p] of t) kacheln[alsThema(id)] = { x: p.x, y: p.y, w: 110, h: 30 };
    for (const [id, p] of s) kacheln[alsSchritt(id)] = { x: p.x, y: p.y, w: 100, h: 30 };
    const kette = [pfeil(1, 2), pfeil(2, 3), pfeil(5, 6)].map((v) => ({ a: alsSchritt(v.von), b: alsSchritt(v.nach) }));
    for (const pts of fuehre(kette, kacheln, true, Object.values(kacheln))) expect(pts).toHaveLength(2);
  });
});

describe("Wo Neues hinkommt", () => {
  it("ein nächster Schritt liegt frei und vom Thema weg", () => {
    const k = beispiel();
    k.schritte[0].x = -700;
    k.schritte[0].y = -300;
    const p = platzFuer(k, { thema: 1, nach: k.schritte[0] });
    expect(belegt(k, p)).toBe(false);
    expect(p.x).toBeLessThan(-700); // Gründung liegt rechts davon, also weiter nach links
  });

  it("ein loser Gedanke kreist um die Mitte, ohne auf ihr zu liegen", () => {
    const leer: Karte = { themen: [], schritte: [], verbindungen: [] };
    const p = platzFuer(leer, { thema: null });
    expect(belegt(leer, p)).toBe(false);
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(200);
  });

  it("ein neues Thema bekommt den ersten freien Ton, sind alle vergeben, reihum", () => {
    expect(freieFarbe([thema(1, "a"), thema(2, "b")])).toBe(3);
    const acht = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => thema(i, String(i)));
    expect(freieFarbe(acht)).toBe(1);
  });
});

describe("Das Fangfeld", () => {
  const themen = [thema(1, "Gründung"), thema(2, "Praktikantinnen")];

  it("legt „Thema: Text“ ins Thema, dessen Name so beginnt", () => {
    expect(fang("gründ: Notar anrufen", themen)).toEqual({ titel: "Notar anrufen", thema: 1 });
  });

  it("ohne passendes Thema bleibt der ganze Text stehen — und der Gedanke lose", () => {
    expect(fang("Wien: Messe anfragen", themen)).toEqual({ titel: "Wien: Messe anfragen", thema: null });
    expect(fang("  Messe anfragen ", themen)).toEqual({ titel: "Messe anfragen", thema: null });
  });
});
