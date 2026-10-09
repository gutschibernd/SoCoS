import { describe, expect, it } from "vitest";

import {
  MODULWEGE,
  alsEuro,
  betragAusEingabe,
  betragZumBearbeiten,
  punkteAusText,
  teilZuWeg,
  themaAusWeg,
  listeFuer,
  themenZahl,
} from "./module";

describe("die Wege der Module", () => {
  it("kennt die Praktikantenstellen, Thoughts und die Förderungen", () => {
    expect(MODULWEGE).toEqual(["praktikum", "praktikum-ideen", "thoughts", "foerderungen"]);
    expect(teilZuWeg("thoughts")?.teil.schluessel).toBe("thoughts");
    expect(teilZuWeg("praktikum")?.modul.titel).toBe("Praktikantenstellen");
    expect(teilZuWeg("praktikum")?.teil.titel).toBe("Haupt-Aufgabenstellungen");
    // Die SPG Academy ist entfernt; ein altes Lesezeichen landet auf der Übersicht.
    expect(teilZuWeg("spg")).toBeNull();
    expect(teilZuWeg("pitch")).toBeNull();
  });

  it("findet das Thema hinter dem Weg", () => {
    expect(themaAusWeg("praktikum/12")?.id).toBe(12);
    expect(themaAusWeg("praktikum-ideen/7")?.teil.titel).toBe("Sonstige Ideen");
    expect(themaAusWeg("praktikum")).toBeNull();
    expect(themaAusWeg("praktikum/12/x")).toBeNull();
    expect(themaAusWeg("spg/12")).toBeNull();
    expect(themaAusWeg(null)).toBeNull();
  });

  it("zählt Themen und Ideen", () => {
    expect(themenZahl(1, "aufgabe")).toBe("1 Thema");
    expect(themenZahl(0, "aufgabe")).toBe("0 Themen");
    expect(themenZahl(1, "idee")).toBe("1 Idee");
    expect(themenZahl(3, "idee")).toBe("3 Ideen");
  });

  it("kennt die Liste zu jeder Art", () => {
    expect(listeFuer("aufgabe").weg).toBe("praktikum");
    expect(listeFuer("idee").weg).toBe("praktikum-ideen");
  });
});

describe("Beträge", () => {
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
});

describe("die Punkte eines Praktikumsthemas", () => {
  it("eine Zeile je Punkt, ohne Strich und ohne Leerzeilen", () => {
    expect(punkteAusText("- Testplan\n\n* Interviews\n3. Auswertung\n  Ohne Strich  ")).toEqual([
      "Testplan",
      "Interviews",
      "Auswertung",
      "Ohne Strich",
    ]);
  });

  it("lässt einen Bindestrich im Wort stehen", () => {
    expect(punkteAusText("E-Mail-Umfrage")).toEqual(["E-Mail-Umfrage"]);
  });
});
