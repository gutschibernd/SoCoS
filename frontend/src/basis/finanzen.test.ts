import { describe, expect, it } from "vitest";

import { erfasstePunkte, fortschreibung, type Punkt } from "./finanzen";

const am = (datum: string, v: number): Punkt => ({ t: new Date(datum).getTime(), v });

describe("erfasstePunkte", () => {
  it("ordnet nach Datum, egal wie die Liste kommt", () => {
    const p = erfasstePunkte([
      { id: 2, datum: "2026-03-01", betrag: "100.00" },
      { id: 1, datum: "2026-01-01", betrag: "300.00" },
      { id: 3, datum: "2026-02-01", betrag: "200.00" },
    ]);
    expect(p.map((x) => x.v)).toEqual([300, 200, 100]);
  });

  it("macht aus der Zeichenkette eine Zahl — der Server schickt Decimal als Text", () => {
    const p = erfasstePunkte([{ id: 1, datum: "2026-01-01", betrag: "142860.55" }]);
    expect(p[0].v).toBeCloseTo(142860.55, 2);
  });
});

describe("fortschreibung", () => {
  it("trifft die Null nach so vielen Monaten, wie der Runway sagt", () => {
    // 142.860 / 18.400 = 7,76 Monate -> acht Stützpunkte, der letzte bei null.
    const p = fortschreibung(am("2026-09-10", 142860), 18400);
    expect(p).toHaveLength(8);
    expect(p[p.length - 1].v).toBe(0);
  });

  it("kappt bei null statt ins Minus zu laufen", () => {
    const p = fortschreibung(am("2026-01-01", 1000), 400);
    expect(p.map((x) => x.v)).toEqual([600, 200, 0]);
  });

  it("geht bei glatter Teilung genau auf", () => {
    const p = fortschreibung(am("2026-01-01", 1200), 400);
    expect(p.map((x) => x.v)).toEqual([800, 400, 0]);
  });

  it("setzt die Punkte auf Monatsgrenzen und rechnet über den Jahreswechsel", () => {
    const p = fortschreibung(am("2026-11-15", 300), 100);
    const monate = p.map((x) => new Date(x.t).getMonth());
    expect(monate).toEqual([11, 0, 1]); // Dezember, Jänner, Februar
    expect(new Date(p[1].t).getFullYear()).toBe(2027);
  });

  it("schreibt nichts fort, wenn die Kosten fehlen oder null sind", () => {
    expect(fortschreibung(am("2026-01-01", 1000), 0)).toEqual([]);
    expect(fortschreibung(am("2026-01-01", 1000), Number.NaN)).toEqual([]);
  });

  it("schreibt nichts fort, wenn das Konto schon leer ist", () => {
    expect(fortschreibung(am("2026-01-01", 0), 400)).toEqual([]);
    expect(fortschreibung(am("2026-01-01", -50), 400)).toEqual([]);
  });
});
