import { describe, expect, it } from "vitest";

import type { Runwayplan, Runwayrechnung } from "./daten";
import { Achse, kfmt, lanes, niceStep, parseDe, slug, x0, zelle, zusammenfassen } from "./runway";

const plan = (teile: Partial<Runwayplan> = {}): Runwayplan => ({
  v: 2,
  settings: {
    company: "", start: "2026-10-01", months: 12, cash: 0, buffer: 0, lnk: 30, sonder: true, raise: 0,
    bridgeGroup: 3, ust: false, uva: "monat", contingency: 0, rebase: true,
  },
  neufoeg: { aktiv: false, gruendung: "", satz: 5.6, check: {} },
  fp: { aktiv: false, satz: 14, monat: 9 },
  baseline: null,
  notes: "",
  foerderungen: [], investments: [], umsaetze: [], team: [], kosten: [], darlehen: [],
  ...teile,
});

const rechnung = (teile: Partial<Runwayrechnung> = {}): Runwayrechnung =>
  ({ A: [], sug: [], ...teile }) as unknown as Runwayrechnung;

describe("Beträge", () => {
  it("kurz für Achse und Zeitachse", () => {
    expect([kfmt(60000), kfmt(-2500), kfmt(1_500_000), kfmt(420)]).toEqual(["60k", "−2,5k", "1,5 Mio", "420"]);
  });

  it("Zellen: ganze Euro, null als Strich", () => {
    expect(zelle("0.4")).toBe("–");
    expect(zelle("-1234.6")).toMatch(/^−1.235$/);
  });

  it("deutsche Eingabe", () => {
    expect([parseDe("1.250,50"), parseDe("1250.5"), parseDe("12.000"), parseDe(""), parseDe("abc")]).toEqual([1250.5, 1250.5, 12000, null, NaN]);
  });

  it("leer heißt Ersatz, 0 bleibt 0", () => {
    expect([x0("", 30), x0(0, 30), x0("12", 30)]).toEqual([30, 0, 12]);
  });

  it("runde Achsenschritte", () => {
    expect([niceStep(13000), niceStep(2200), niceStep(4100)]).toEqual([20000, 2500, 5000]);
  });
});

describe("Achse", () => {
  const a = new Achse("2026-10-01");
  it("zählt über den Jahreswechsel", () => {
    expect([a.idx("2027-01-15"), a.idx(""), a.moy(3), a.yr(3), a.key(3)]).toEqual([3, null, 0, 2027, "2027-01"]);
    expect([a.lab(3), a.labL(0)]).toEqual(["Jän 27", "Oktober 2026"]);
  });
});

describe("Zeitachse", () => {
  it("Tranchen einer Förderung, Personen als Balken, Darlehen als Rauten", () => {
    const S = plan({
      foerderungen: [{ id: "f", name: "KWF", geber: "KWF", tranchen: [{ id: "t", date: "2027-03-15", amount: 49260, status: "zugesagt" }] }],
      team: [{ id: "p", name: "Niki", gross: 1600, start: "2027-01-15", end: "2027-07-15" }],
      darlehen: [{ id: "d", name: "GF", typ: "gesellschafter", amount: 10000, date: "2026-10-01", repay: "2027-04-01", zins: 0 }],
    });
    const z = lanes(S, rechnung());
    expect(z.map((r) => r.l)).toEqual(["KWF", "Niki", "Gesellschafterdarlehen"]);
    expect(z[0].pts).toEqual([{ i: 5, v: 49260, st: "zugesagt" }]);
    expect(z[1].rng).toEqual([3, 9]);
    expect(z[2].pts?.map((p) => [p.i, p.v, p.dia])).toEqual([[0, 10000, true], [6, -10000, true]]);
  });

  it("ein Vorschlag zur Überbrückung steht als eigene Zeile", () => {
    const z = lanes(plan(), rechnung({ sug: [{ i: 2, amount: "15000.00", before: "8600" }] }));
    expect(z).toEqual([{ g: "Vorschlag", l: "Überbrückung nötig", farbe: "bad", pts: [{ i: 2, v: 15000, st: "geplant", dia: true }] }]);
  });

  it("Punkte im selben Monat werden einer — mit dem unsichersten Status", () => {
    const p = zusammenfassen(
      [
        { i: 3, v: 100, st: "erhalten" },
        { i: 3, v: 50, st: "geplant" },
        { i: 20, v: 1, st: "geplant" },
      ],
      12,
    );
    expect(p).toEqual([{ i: 3, v: 150, st: "geplant", cnt: 2 }]);
  });
});

describe("Dateiname", () => {
  it("ohne Umlaute und Sonderzeichen", () => {
    expect(slug("Sopharmis GmbH & Co")).toBe("sopharmis-gmbh-co");
  });
});
