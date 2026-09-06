import { describe, expect, it } from "vitest";

import {
  alsDauer,
  alsStunden,
  alsUhr,
  aufFuenfMinuten,
  summeGerundet,
} from "./zeit";

describe("Anzeige", () => {
  it("zeigt die laufende Uhr zweistellig", () => {
    expect(alsUhr(0)).toBe("00:00:00");
    expect(alsUhr(5025)).toBe("01:23:45");
    expect(alsUhr(-1)).toBe("00:00:00");
  });

  it("zeigt Dauern als Stunden:Minuten", () => {
    expect(alsDauer(0)).toBe("0:00");
    expect(alsDauer(12_300)).toBe("3:25");
    expect(alsDauer(59)).toBe("0:00");
  });
});

describe("Rundung auf 5 Minuten", () => {
  it("rundet auf den nächsten Schritt", () => {
    expect(aufFuenfMinuten(0)).toBe(0);
    expect(aufFuenfMinuten(60)).toBe(0); // 1 min
    expect(aufFuenfMinuten(150)).toBe(300); // genau 2,5 min geht auf
    expect(aufFuenfMinuten(200)).toBe(300);
    expect(aufFuenfMinuten(420)).toBe(300); // 7 min
    expect(aufFuenfMinuten(480)).toBe(600); // 8 min
  });

  it("lässt genau 2,5 Minuten aufgehen", () => {
    // Sonst verschwände in einer Woche eine Viertelstunde, die jemand
    // gearbeitet hat.
    expect(aufFuenfMinuten(150)).toBe(300);
  });

  it("summiert erst und rundet dann", () => {
    // Drei Buchungen zu je 2 Minuten sind zusammen 6 Minuten, also 5 gerundet.
    // Einzeln gerundet wären es 0 — eine halbe Stunde Arbeit pro Woche, die
    // still verschwindet.
    expect(summeGerundet([120, 120, 120])).toBe(300);
    expect([120, 120, 120].map(aufFuenfMinuten).reduce((a, b) => a + b)).toBe(0);
  });

  it("gibt Dezimalstunden mit Komma aus", () => {
    expect(alsStunden(12_300)).toBe("3,42");
    expect(alsStunden(3600)).toBe("1,00");
  });
});
