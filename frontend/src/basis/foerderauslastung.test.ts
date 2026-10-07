/**
 * Die Förderauslastung zeichnet nur, was der Server rechnet — geprüft wird,
 * wie aus Zahlen Stufen und Höhen werden und wohin ein Beginn rutscht.
 */

import { describe, expect, it } from "vitest";

import {
  beginnVerschieben,
  ganzeStunden,
  istJahresanfang,
  istPlanbarerBeginn,
  monatskurz,
  prozentVon,
  stapelhoehe,
  standUmschalten,
  tonVon,
  waermestufe,
} from "./foerderauslastung";

describe("die Wärmekarte", () => {
  it("stuft nach dem Anteil an der Kapazität", () => {
    expect(waermestufe(undefined, undefined)).toBe(0);
    expect(waermestufe("0.00", "0")).toBe(0);
    expect(waermestufe("12.00", "20")).toBe(1);
    expect(waermestufe("30.00", "50")).toBe(2);
    expect(waermestufe("51.00", "85")).toBe(3);
    expect(waermestufe("60.00", "100")).toBe(3);
    expect(waermestufe("61.00", "101")).toBe(4);
  });

  it("ohne Kapazität steht nur die Zahl da", () => {
    expect(waermestufe("200.00", null)).toBe(1);
  });

  it("schreibt Stunden ganz", () => {
    expect(ganzeStunden("53.50")).toBe("54");
    expect(ganzeStunden("33.25")).toBe("33");
  });
});

describe("der Balkenstapel", () => {
  it("reicht über den höchsten Monat und die Kapazität hinaus", () => {
    expect(stapelhoehe({ "2027-01": "40.00", "2027-02": "100.00" }, null)).toBeCloseTo(110);
    expect(stapelhoehe({ "2027-01": "40.00" }, "200.00")).toBeCloseTo(220);
    expect(stapelhoehe({}, null)).toBe(1);
    expect(prozentVon("55.00", 110)).toBeCloseTo(50);
  });
});

describe("Monate", () => {
  it("heißen kurz und kennen den Jahresanfang", () => {
    expect(monatskurz("2027-03")).toBe("Mär 27");
    expect(monatskurz("2028-01")).toBe("Jän 28");
    expect(istJahresanfang("2028-01")).toBe(true);
    expect(istJahresanfang("2027-12")).toBe(false);
  });

  it("verschieben einen Beginn über den Jahreswechsel und behalten den Tag", () => {
    expect(beginnVerschieben("2027-12-10", 1)).toBe("2028-01-10");
    expect(beginnVerschieben("2027-01-10", -1)).toBe("2026-12-10");
    expect(beginnVerschieben("2027-01-31", 1)).toBe("2027-02-28");
    expect(beginnVerschieben("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("der vermutete Beginn", () => {
  it("nimmt kein halb getipptes Jahr", () => {
    expect(istPlanbarerBeginn("2027-04-01")).toBe(true);
    expect(istPlanbarerBeginn("0002-04-01")).toBe(false);
    expect(istPlanbarerBeginn("")).toBe(false);
  });
});

describe("Stände und Töne", () => {
  it("schaltet Stände in fester Reihenfolge", () => {
    expect(standUmschalten(["eingereicht"], "bewilligt")).toEqual(["bewilligt", "eingereicht"]);
    expect(standUmschalten(["bewilligt", "eingereicht"], "entwurf")).toEqual(["bewilligt", "eingereicht", "entwurf"]);
    expect(standUmschalten(["bewilligt", "eingereicht"], "bewilligt")).toEqual(["eingereicht"]);
  });

  it("gibt jedem Antrag einen der acht Töne, fest an der Nummer", () => {
    expect(tonVon(1)).toBe(2);
    expect(tonVon(8)).toBe(1);
    expect(tonVon(9)).toBe(tonVon(1));
  });
});
