import { describe, expect, it } from "vitest";

import type { Planungsaufgabe, Planungspaket } from "./daten";
import { aufgabenImPlan, alsH, lageText, standGegenPlan, startOffen, stundenAusEingabe } from "./planung";

const aufgabe = (id: number, teile: Partial<Planungsaufgabe> = {}): Planungsaufgabe => ({
  id,
  paket: 1,
  titel: `A${id}`,
  erledigt: false,
  reihenfolge: 0,
  von: null,
  bis: null,
  stunden: null,
  verantwortlich: null,
  verantwortlich_name: "",
  lage: "ohne_termin",
  ...teile,
});

const paket = (id: number, teile: Partial<Planungspaket> = {}): Planungspaket => ({
  id,
  titel: `AP0${id}`,
  status: "offen",
  beschreibung: "",
  foerderpaket: null,
  soll_quelle: "pensum",
  soll: "0",
  gebucht: "0",
  soll_bis_heute: null,
  personen: [],
  plan_von: null,
  plan_bis: null,
  aufgaben_stunden: "0",
  aufgaben: [],
  ...teile,
});

describe("Stunden", () => {
  it("zeigt ohne Nullen", () => {
    expect(alsH("12.50")).toBe("12,5 h");
    expect(alsH("300.00")).toBe("300 h");
    expect(alsH(null)).toBe("—");
    expect(alsH("67.22", 0)).toBe("67 h");
  });

  it("liest Komma, Punkt und ein h dahinter", () => {
    expect(stundenAusEingabe("7,5")).toBe("7.50");
    expect(stundenAusEingabe("12 h")).toBe("12.00");
    expect(stundenAusEingabe("")).toBeNull();
    expect(stundenAusEingabe("viel")).toBeUndefined();
    expect(stundenAusEingabe("-3")).toBeUndefined();
  });
});

describe("aufgabenImPlan", () => {
  it("nach Beginn, ohne Termin am Ende", () => {
    const reihe = aufgabenImPlan([
      aufgabe(1),
      aufgabe(2, { von: "2026-11-10", bis: "2026-11-12" }),
      aufgabe(3, { von: "2026-11-01", bis: "2026-11-30" }),
      aufgabe(4, { von: "2026-11-10", bis: "2026-11-11", reihenfolge: -1 }),
    ]);
    expect(reihe.map((a) => a.id)).toEqual([3, 4, 2, 1]);
  });
});

describe("lageText", () => {
  it("sagt, was los ist", () => {
    expect(lageText({ lage: "ueberfaellig", von: "2026-10-01", bis: "2026-10-12" })).toBe("überfällig seit 12.10.");
    expect(lageText({ lage: "laeuft", von: "2026-10-01", bis: "2026-10-31" })).toBe("läuft bis 31.10.");
    expect(lageText({ lage: "steht_an", von: "2026-11-03", bis: "2026-11-05" })).toBe("ab 3.11.");
    expect(lageText({ lage: "ohne_termin", von: null, bis: null })).toBe("ohne Termin");
  });
});

describe("startOffen", () => {
  const zeit = new Map([[71, { von: "2026-10-01", bis: "2026-10-31" }]]);

  it("was läuft oder im Antragszeitraum liegt", () => {
    const pakete = [
      paket(1),
      paket(2, { aufgaben: [aufgabe(9, { lage: "ueberfaellig", von: "2026-10-01", bis: "2026-10-02" })] }),
      paket(3, { foerderpaket: 71 }),
    ];
    expect([...startOffen(pakete, zeit, "2026-10-13")]).toEqual([2, 3]);
  });

  it("sonst das erste", () => {
    expect([...startOffen([paket(1), paket(2)], zeit, "2027-01-01")]).toEqual([1]);
  });
});

describe("standGegenPlan", () => {
  it("über, unter oder im Plan", () => {
    expect(standGegenPlan("80.00", "120.40")).toBe("40 h unter Plan");
    expect(standGegenPlan("130.00", "120.00")).toBe("10 h über Plan");
    expect(standGegenPlan("120.50", "120.00")).toBe("im Plan");
    expect(standGegenPlan("10.00", null)).toBeNull();
  });
});
