import { describe, expect, it } from "vitest";

import type { Canvaspunkt, Vorhaben } from "./daten";
import {
  MODULWEGE,
  alsEntwuerfe,
  alsEuro,
  betragAusEingabe,
  betragZumBearbeiten,
  personaKurz,
  ausgefuellt,
  istGeaendert,
  punkteIn,
  zumSenden,
  workshopZuWeg,
  zuletztText,
} from "./module";

describe("die Wege der Module", () => {
  it("kennt beide Workshops der SPG Academy", () => {
    expect(MODULWEGE).toEqual(["spg", "spg-businessplan"]);
    expect(workshopZuWeg("spg-businessplan")?.teil.schluessel).toBe("businessplan");
    expect(workshopZuWeg("spg")?.modul.titel).toBe("SPG Academy");
    expect(workshopZuWeg("pitch")).toBeNull();
  });
});

const punkt = (id: number, feld: string, text: string, reihenfolge = 0): Canvaspunkt => ({
  id, feld, text, reihenfolge,
});

const vorhaben = (id: number, zuletzt: string, punkte: Canvaspunkt[] = []): Vorhaben => ({
  id, titel: `Vorhaben ${id}`, zuletzt, punkte, personas: [],
});

describe("die Leinwand", () => {
  const v = vorhaben(1, "2026-09-20T10:00:00Z", [
    punkt(3, "problem", "zweiter", 1),
    punkt(1, "problem", "erster", 0),
    punkt(2, "kunden", "Pflege", 0),
  ]);

  it("sortiert die Punkte eines Feldes", () => {
    expect(punkteIn(v, "problem").map((p) => p.text)).toEqual(["erster", "zweiter"]);
    expect(punkteIn(v, "kosten")).toEqual([]);
  });

  it("zählt Felder, nicht Punkte", () => {
    expect(ausgefuellt(v, ["problem", "kunden", "kosten"])).toBe(2);
  });

  // An einem Vorhaben hängen die Punkte aller Workshops. Das Canvas darf die
  // Abschnitte des Businessplans nicht mitzählen.
  it("zählt nur die Felder des Workshops", () => {
    const mitPlan = { ...v, punkte: [...v.punkte, punkt(9, "summary", "Kurzfassung")] };
    expect(ausgefuellt(mitPlan, ["problem", "kunden"])).toBe(2);
    expect(ausgefuellt(mitPlan, ["summary", "markt"])).toBe(1);
  });
});

describe("ein Feld bearbeiten", () => {
  const gespeichert = [punkt(1, "problem", "Verwechslung"), punkt(2, "problem", "Zeit", 1)];

  it("beginnt ein leeres Feld mit einer leeren Zeile", () => {
    const entwuerfe = alsEntwuerfe([]);
    expect(entwuerfe).toHaveLength(1);
    expect(entwuerfe[0]).toMatchObject({ id: null, text: "" });
  });

  // Dieselben Regeln wie am Server — sonst fragte das Fenster beim Schließen
  // nach einer Änderung, die beim Speichern ohnehin verworfen würde.
  it("sieht in einer leeren Zeile und in Randleerzeichen keine Änderung", () => {
    const entwuerfe = [
      ...alsEntwuerfe(gespeichert).map((e) => ({ ...e, text: ` ${e.text} ` })),
      { schluessel: "neu", id: null, text: "   " },
    ];
    expect(istGeaendert(gespeichert, entwuerfe)).toBe(false);
  });

  it("sieht einen geänderten, einen neuen, einen fehlenden und einen verschobenen Punkt", () => {
    const [a, b] = alsEntwuerfe(gespeichert);
    expect(istGeaendert(gespeichert, [a, { ...b, text: "Mehr Zeit" }])).toBe(true);
    expect(istGeaendert(gespeichert, [a, b, { schluessel: "n", id: null, text: "Neu" }])).toBe(true);
    expect(istGeaendert(gespeichert, [a])).toBe(true);
    expect(istGeaendert(gespeichert, [b, a])).toBe(true);
  });

  it("schickt die Liste ohne leere Zeilen und ohne Randleerzeichen", () => {
    const [a] = alsEntwuerfe(gespeichert);
    expect(
      zumSenden([a, { schluessel: "x", id: null, text: "" }, { schluessel: "y", id: null, text: " Neu " }]),
    ).toEqual([{ id: 1, text: "Verwechslung" }, { text: "Neu" }]);
  });
});

describe("zuletztText", () => {
  const jetzt = new Date(2026, 8, 21, 15, 0);

  it("sagt heute und gestern mit Uhrzeit, sonst das Datum", () => {
    expect(zuletztText(new Date(2026, 8, 21, 10, 42).toISOString(), jetzt)).toBe("heute 10:42");
    expect(zuletztText(new Date(2026, 8, 20, 16, 5).toISOString(), jetzt)).toBe("gestern 16:05");
    expect(zuletztText(new Date(2026, 8, 3, 9, 0).toISOString(), jetzt)).toBe("03.09.2026");
  });
});

describe("Personas", () => {
  it("liest einen Betrag, wie man ihn tippt", () => {
    expect(betragAusEingabe("1.450")).toBe("1450.00");
    expect(betragAusEingabe("1450,50 €")).toBe("1450.50");
    expect(betragAusEingabe("  ")).toBeNull();
    expect(betragAusEingabe("viel")).toBeUndefined();
    expect(betragAusEingabe("-3")).toBeUndefined();
  });

  it("schreibt ihn zurück, wie man ihn liest", () => {
    // de-AT wie überall in SoCoS: Der Tausendertrenner ist ein geschütztes
    // Leerzeichen, kein Punkt.
    expect(alsEuro("1450.00")).toMatch(/^1\s450 €$/);
    expect(alsEuro("1450.50")).toMatch(/^1\s450,50 €$/);
    expect(betragZumBearbeiten("1450.00")).toBe("1450");
    expect(betragZumBearbeiten("1450.50")).toBe("1450,50");
    expect(betragZumBearbeiten(null)).toBe("");
  });

  it("fasst nur zusammen, was eingetragen ist", () => {
    const p = {
      id: 1, vorhaben: 1, name: "Maria", rolle: "nutzer" as const, alter: 78, geschlecht: "",
      wohnort: "", beruf: "Pensionistin", haushalt: "", einkommen: null, beduerfnisse: "",
      probleme: "", reihenfolge: 0,
    };
    expect(personaKurz(p)).toBe("78 Jahre · Pensionistin");
    expect(personaKurz({ ...p, alter: null, beruf: "" })).toBe("");
  });
});
