import { describe, expect, it } from "vitest";

import type { Karte, Lageschritt, Lagethema, Lageverbindung } from "./daten";
import {
  ANDOCK_ABSTAND,
  ANDOCK_RAND,
  alsSchritt,
  alsThema,
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

  it("läuft rechtwinklig von Kante zu Kante", () => {
    const [pts] = fuehre([{ a: "a", b: "b" }], { a: kachel(0, 0), b: kachel(400, 96) });
    expect(pts).not.toBeNull();
    expect(rechtwinklig(pts!)).toBe(true);
    expect(pts![0].x).toBe(104); // rechte Kante von a, 4 px davor
    expect(pts![pts!.length - 1].x).toBe(296); // linke Kante von b
  });

  it("zwei Pfeile an derselben Seite docken an verschiedenen Punkten an", () => {
    const kacheln = { a: kachel(0, 0), b: kachel(400, -120), c: kachel(400, 120) };
    const [p1, p2] = fuehre([{ a: "a", b: "b" }, { a: "a", b: "c" }], kacheln);
    expect(p1![0].y).not.toBe(p2![0].y);
    // Sortiert nach der Lage des anderen Endes: der nach oben dockt oben an.
    expect(p1![0].y).toBeLessThan(p2![0].y);
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

  it("kein Pfeil setzt an einer Ecke an, und an einer Seite halten sie Abstand", () => {
    const gross: Rechteck = { x: 0, y: 0, w: 110, h: 45 };
    const kacheln: Record<string, Rechteck> = { a: gross };
    const pfeile = [-360, -240, -120, 0, 120, 240, 360].map((y, i) => {
      kacheln[`z${i}`] = kachel(500, y);
      return { a: "a", b: `z${i}` };
    });
    for (const fein of [false, true]) {
      const starts = fuehre(pfeile, kacheln, fein, Object.values(kacheln)).map((pts) => pts![0]);
      for (const q of starts) {
        const rechts = Math.abs(q.x - (gross.x + gross.w + 4)) < 0.01;
        const kante = rechts || Math.abs(Math.abs(q.y) - (gross.h + 4)) < 0.01;
        expect(kante).toBe(true);
        // Entlang der Seite mindestens ANDOCK_RAND von der Ecke entfernt.
        if (rechts) expect(Math.abs(q.y)).toBeLessThanOrEqual(gross.h - ANDOCK_RAND);
        else expect(Math.abs(q.x)).toBeLessThanOrEqual(gross.w - ANDOCK_RAND);
      }
      // Je Seite: Nachbarn mindestens ANDOCK_ABSTAND auseinander.
      const seiten = new Map<string, number[]>();
      for (const q of starts) {
        const k = Math.abs(q.x - (gross.x + gross.w + 4)) < 0.01 ? "r" : q.y < 0 ? "o" : "u";
        seiten.set(k, [...(seiten.get(k) ?? []), k === "r" ? q.y : q.x]);
      }
      for (const werte of seiten.values()) {
        werte.sort((p, q) => p - q);
        werte.slice(1).forEach((v, i) => expect(v - werte[i]).toBeGreaterThanOrEqual(ANDOCK_ABSTAND - 0.01));
      }
    }
  });

  it("ein Fächer geht rechts hinaus, symmetrisch und ohne Kreuzung", () => {
    const mitte: Rechteck = { x: -420, y: 0, w: 170, h: 64 };
    const kacheln: Record<string, Rechteck> = { m: mitte };
    const ys = [-444, -222, 0, 222, 444];
    ys.forEach((y, i) => (kacheln[`t${i}`] = { x: 0, y, w: 200, h: 40 + 10 * i }));
    const pfeile = ys.map((_, i) => ({ a: "m", b: `t${i}` }));
    for (const fein of [false, true]) {
      const wege = fuehre(pfeile, kacheln, fein, Object.values(kacheln)).map((pts) => pts!);
      // Alle an der rechten Seite, gespiegelt um die Mitte.
      const starts = wege.map((pts) => pts[0]);
      starts.forEach((q) => expect(q.x).toBeCloseTo(mitte.x + mitte.w + 4));
      starts.forEach((q, i) => expect(q.y).toBeCloseTo(-starts[starts.length - 1 - i].y));
      // Keine zwei Wege kreuzen sich.
      const strecken = wege.flatMap((pts, i) => pts.slice(1).map((q, k) => ({ i, a: pts[k], b: q })));
      for (const s of strecken)
        for (const t of strecken) {
          if (s.i === t.i) continue;
          const [h, v] = Math.abs(s.a.y - s.b.y) < 0.01 ? [s, t] : [t, s];
          if (Math.abs(h.a.y - h.b.y) > 0.01 || Math.abs(v.a.x - v.b.x) > 0.01) continue;
          const zwischen = (w: number, p: number, q: number) => w > Math.min(p, q) + 0.5 && w < Math.max(p, q) - 0.5;
          expect(zwischen(v.a.x, h.a.x, h.b.x) && zwischen(h.a.y, v.a.y, v.b.y)).toBe(false);
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
