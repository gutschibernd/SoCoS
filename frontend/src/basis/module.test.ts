import { describe, expect, it } from "vitest";

import {
  MODULWEGE,
  alsEuro,
  designAusWeg,
  einstiegAusWeg,
  entscheidungsZahl,
  nachUmfang,
  todoZahl,
  betragAusEingabe,
  betragZumBearbeiten,
  punkteAusText,
  teilZuWeg,
  themaAusWeg,
  listeFuer,
  themenZahl,
} from "./module";

describe("die Wege der Module", () => {
  it("kennt die Praktikanten, Thoughts, die Förderungen, Runway und Design", () => {
    expect(MODULWEGE).toEqual([
      "praktikanten", "praktikum", "praktikum-ideen", "praktikum-todos", "thoughts", "foerderungen", "runway", "design",
    ]);
    expect(teilZuWeg("thoughts")?.teil.schluessel).toBe("thoughts");
    expect(teilZuWeg("praktikum")?.modul.titel).toBe("Praktikanten");
    expect(teilZuWeg("praktikum-todos")?.teil.schluessel).toBe("todos");
    expect(teilZuWeg("praktikum")?.teil.titel).toBe("Haupt-Aufgabenstellungen");
    // Die SPG Academy ist entfernt; ein altes Lesezeichen landet auf der Übersicht.
    expect(teilZuWeg("spg")).toBeNull();
    expect(teilZuWeg("pitch")).toBeNull();
  });

  it("hat einen Einstieg nur für ein Modul mit mehreren Teilen", () => {
    expect(einstiegAusWeg("praktikanten")?.modul.teile.map((t) => t.titel)).toEqual([
      "Haupt-Aufgabenstellungen", "Sonstige Ideen", "To-Dos",
    ]);
    // Der Einstieg ist kein Teil — und ein Teil ist kein Einstieg.
    expect(teilZuWeg("praktikanten")).toBeNull();
    expect(einstiegAusWeg("praktikum")).toBeNull();
    // Thoughts hat einen Teil, dessen Weg der des Moduls ist: kein Einstieg.
    expect(einstiegAusWeg("thoughts")).toBeNull();
    expect(einstiegAusWeg(null)).toBeNull();
  });

  it("ein To-Do ist kein Thema", () => {
    expect(themaAusWeg("praktikum-todos/3")).toBeNull();
  });

  it("findet das Thema hinter dem Weg", () => {
    expect(themaAusWeg("praktikum/12")?.id).toBe(12);
    expect(themaAusWeg("praktikum-ideen/7")?.teil.titel).toBe("Sonstige Ideen");
    expect(themaAusWeg("praktikum")).toBeNull();
    expect(themaAusWeg("praktikum/12/x")).toBeNull();
    expect(themaAusWeg("spg/12")).toBeNull();
    expect(themaAusWeg(null)).toBeNull();
  });

  it("findet die Designentscheidung hinter dem Weg", () => {
    expect(designAusWeg("design/7")?.id).toBe(7);
    expect(designAusWeg("design")).toBeNull();
    expect(designAusWeg("design/7/1")).toBeNull();
    expect(designAusWeg("planung/7")).toBeNull();
    expect(themaAusWeg("design/7")).toBeNull();
  });

  it("zählt Entscheidungen", () => {
    expect(entscheidungsZahl(1)).toBe("1 Entscheidung");
    expect(entscheidungsZahl(0)).toBe("0 Entscheidungen");
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

describe("die To-Dos der Praktikanten", () => {
  it("gruppiert nach Umfang, das Kleinste zuerst, darin nach Titel", () => {
    const gruppen = nachUmfang([
      { titel: "Spender", umfang: "woche" as const },
      { titel: "LinkedIn", umfang: "vormittag" as const },
      { titel: "Instagram", umfang: "vormittag" as const },
    ]);
    expect(gruppen.map((g) => [g.umfang.wert, g.umfang.stufe, g.todos.map((t) => t.titel)])).toEqual([
      ["vormittag", 1, ["Instagram", "LinkedIn"]],
      // „tag" fehlt: Eine leere Gruppe steht nicht da.
      ["woche", 3, ["Spender"]],
    ]);
  });

  it("zählt To-Dos", () => {
    expect(todoZahl(1)).toBe("1 To-Do");
    expect(todoZahl(0)).toBe("0 To-Dos");
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
