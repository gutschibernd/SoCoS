import { describe, expect, it } from "vitest";

import type { Canvaspunkt, Vorhaben } from "./daten";
import {
  alsEntwuerfe,
  ausgefuellt,
  gewaehltesVorhaben,
  istGeaendert,
  punkteIn,
  vorhabenAusWeg,
  wegZuVorhaben,
  zumSenden,
  zuletztText,
} from "./module";

const punkt = (id: number, feld: string, text: string, reihenfolge = 0): Canvaspunkt => ({
  id, feld, text, reihenfolge,
});

const vorhaben = (id: number, zuletzt: string, punkte: Canvaspunkt[] = []): Vorhaben => ({
  id, titel: `Vorhaben ${id}`, zuletzt, punkte,
});

describe("der Weg zum Vorhaben", () => {
  it("liest die Kennung und schreibt sie zurück", () => {
    expect(vorhabenAusWeg("spg-4")).toBe(4);
    expect(vorhabenAusWeg("spg")).toBeNull();
    expect(vorhabenAusWeg(null)).toBeNull();
    expect(wegZuVorhaben(4)).toBe("spg-4");
    expect(wegZuVorhaben(null)).toBe("spg");
  });
});

describe("gewaehltesVorhaben", () => {
  const alt = vorhaben(1, "2026-09-01T10:00:00Z");
  const neu = vorhaben(2, "2026-09-20T10:00:00Z");

  it("nimmt das aus dem Weg, solange es das gibt", () => {
    expect(gewaehltesVorhaben([alt, neu], 1)).toBe(alt);
  });

  // Ohne Auswahl will man dort weitermachen, wo zuletzt gearbeitet wurde —
  // nicht beim ersten nach dem Alphabet.
  it("sonst das zuletzt bearbeitete", () => {
    expect(gewaehltesVorhaben([alt, neu], null)).toBe(neu);
    expect(gewaehltesVorhaben([alt, neu], 99)).toBe(neu);
  });

  it("gibt nichts zurück, wenn es keines gibt", () => {
    expect(gewaehltesVorhaben([], null)).toBeNull();
  });
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
    expect(ausgefuellt(v)).toBe(2);
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
