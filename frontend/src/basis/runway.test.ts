import { describe, expect, it } from "vitest";

import type { Planposten, Runwayplan, Runwayrechnung } from "./daten";
import { achse, euro, euroKurz, lage, monatKurz, monatLang, monatsabstand, monatsende, runwayText, sortiert, vorschlaege } from "./runway";

const plan: Runwayplan = {
  id: 1,
  beginn: "2026-10-01",
  monate: 3,
  startkontostand: "5000.00",
  puffer: "15000.00",
  lohnnebenkosten: "30.00",
  vierzehn_gehaelter: true,
  abruf_monate: 3,
};

const monat = (m: string, stand: string) => ({
  monat: m, foerderung: "0", umsatz: "0", darlehen: "0", personal: "0", kosten: "0", rueckzahlung: "0",
  ein: "0", aus: "0", netto: "0", anfang: "0", stand, ohne_darlehen: stand, ist: null, ist_datum: null, ereignisse: [],
});

const rechnung = (k: Partial<Runwayrechnung["kennzahlen"]>, abrufe: Runwayrechnung["abrufe"] = []): Runwayrechnung => ({
  szenario: "basis",
  heute: "2026-10-14",
  monate: [monat("2026-10", "20000"), monat("2026-11", "18000"), monat("2026-12", "16000")],
  kennzahlen: {
    minus_ab: null, unter_puffer_ab: null, tiefster_stand: "16000", tiefster_monat: "2026-12",
    ueberbrueckung: "0", burn: "2000", burn_ab: "2026-10", ohne_darlehen_minus_ab: null,
    darlehen_summe: "0", letzter_ist: null, ...k,
  },
  abrufe,
  je_posten: {},
});

const posten = (id: number, teile: Partial<Planposten>): Planposten => ({
  id, art: "foerderung", name: "", gruppe: "", notiz: "", betrag: "0", rhythmus: "einmalig", von: "2026-10-01",
  bis: null, status: "geplant", wahrscheinlichkeit: 100, lohnnebenkosten: null, zins: "0", ...teile,
});

describe("Monate", () => {
  it("heißen österreichisch", () => {
    expect(monatLang("2027-01")).toBe("Jänner 2027");
    expect(monatKurz("2027-02")).toBe("Feb 27");
  });

  it("zählen über den Jahreswechsel", () => {
    expect(monatsabstand("2026-10", "2027-01")).toBe(3);
    expect(monatsabstand("2027-01", "2027-01")).toBe(0);
  });

  it("enden am richtigen Tag", () => {
    expect(monatsende("2027-02-10")).toBe("2027-02-28");
    expect(monatsende("2028-02-01")).toBe("2028-02-29");
    expect(monatsende("2026-12-31")).toBe("2026-12-31");
  });
});

describe("Euro", () => {
  it("ganz und mit echtem Minus", () => {
    expect(euro("16679.35")).toMatch(/^16.679\s€$/);
    expect(euro("-740.65")).toBe("−741\u00a0€");
  });

  it("kurz für die Achse", () => {
    expect([euroKurz(60000), euroKurz(-20000), euroKurz(2500), euroKurz(0)]).toEqual(["60k", "−20k", "2,5k", "0"]);
  });
});

describe("Lage", () => {
  it("Minus geht vor Puffer", () => {
    const l = lage(rechnung({ minus_ab: "2027-01", unter_puffer_ab: "2026-10", ueberbrueckung: "20000" }, [
      { monat: "2026-10", vorher: "8600", betrag: "15000" },
    ]), plan);
    expect(l.art).toBe("luecke");
    expect(l.satz).toContain("ab Jänner 2027 im Minus");
    expect(l.satz).toContain("erstmals im Oktober 2026");
  });

  it("unter dem Puffer", () => {
    expect(lage(rechnung({ unter_puffer_ab: "2026-12" }), plan).art).toBe("puffer");
  });

  it("durchfinanziert, und sagt, wenn es am Darlehen hängt", () => {
    const l = lage(rechnung({ ohne_darlehen_minus_ab: "2026-11" }), plan);
    expect(l.art).toBe("gut");
    expect(l.satz).toContain("bis Dezember 2026");
    expect(l.satz).toContain("ohne es wäre das Konto ab November 2026 im Minus");
  });
});

describe("Runway", () => {
  it("Monate bis zum ersten Minus, ab dem laufenden Monat", () => {
    expect(runwayText(rechnung({ minus_ab: "2027-01" }))).toEqual({ wert: "3 Mon.", hinweis: "Minus ab Jänner 2027" });
  });

  it("ohne Minus mehr als der Rest des Plans", () => {
    expect(runwayText(rechnung({})).wert).toBe("> 3 Mon.");
  });
});

describe("Achse", () => {
  it("hat Null und Puffer drinnen und runde Schritte", () => {
    const a = achse([8600, 61359, -740], 15000);
    expect(a.unten).toBeLessThanOrEqual(-740);
    expect(a.oben).toBeGreaterThanOrEqual(61359);
    expect([10000, 20000, 25000]).toContain(a.schritt);
    expect(Math.abs(a.unten % a.schritt)).toBe(0);
  });

  it("steht auch ohne Ausschlag", () => {
    const a = achse([0, 0], 0);
    expect(a.oben).toBeGreaterThan(a.unten);
  });
});

describe("Posten", () => {
  it("Tranchen einer Förderung stehen beisammen", () => {
    const liste = [
      posten(1, { name: "KWF", von: "2027-03-15" }),
      posten(2, { name: "FFG", von: "2027-07-01" }),
      posten(3, { name: "KWF", von: "2026-12-01" }),
      posten(4, { art: "kosten", name: "Miete" }),
    ];
    expect(sortiert(liste, "foerderung").map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("schlagen vor, was es schon gibt — ohne Leerzeichen und doppelt", () => {
    const liste = [posten(1, { gruppe: "FFG" }), posten(2, { gruppe: " FFG" }), posten(3, { gruppe: "" })];
    expect(vorschlaege(liste, "foerderung", "gruppe")).toEqual(["FFG"]);
  });
});
