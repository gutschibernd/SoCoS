import { describe, expect, it } from "vitest";

import {
  alsDauer,
  alsStunden,
  alsUhr,
  alsZeitpunkt,
  aufFuenfMinuten,
  heuteAlsDatum,
  plusMinuten,
  spanne,
  summeGerundet,
  tagAusZeitpunkt,
  uhrzeitAusZeitpunkt,
  wannKurz,
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

describe("heuteAlsDatum", () => {
  it("nimmt den Tag der Uhr an der Wand, nicht den nach UTC", () => {
    // 8. September, 23:30 Ortszeit. Über UTC gerechnet stünde in Mitteleuropa
    // der 9. im Feld — und der Eintrag läge am falschen Tag.
    expect(heuteAlsDatum(new Date(2026, 8, 8, 23, 30))).toBe("2026-09-08");
  });

  it("füllt Monat und Tag zweistellig auf", () => {
    expect(heuteAlsDatum(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("Tag und Uhrzeit", () => {
  it("zerlegt einen Zeitpunkt in die beiden Felder", () => {
    const iso = new Date(2026, 8, 15, 9, 2).toISOString();
    expect(tagAusZeitpunkt(iso)).toBe("2026-09-15");
    expect(uhrzeitAusZeitpunkt(iso)).toBe("09:02");
  });

  it("setzt beide Felder wieder zu Ortszeit zusammen", () => {
    const d = alsZeitpunkt("2026-09-15", "09:02");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(2);
    expect(d.getSeconds()).toBe(0);
  });

  it("rechnet Minuten auf eine Uhrzeit und läuft über Mitternacht um", () => {
    expect(plusMinuten("09:02", 90)).toBe("10:32");
    expect(plusMinuten("23:30", 120)).toBe("01:30");
  });
});

describe("spanne", () => {
  it("liefert Beginn und Ende desselben Tages", () => {
    const s = spanne("2026-09-15", "09:00", "17:00");
    expect(s?.ueberNacht).toBe(false);
    expect((s!.ende.getTime() - s!.start.getTime()) / 3_600_000).toBe(8);
  });

  it("legt ein Ende, das nicht nach dem Beginn liegt, auf den Folgetag", () => {
    // 22:00 bis 01:00 sind drei Stunden. Ohne diese Regel käme eine negative
    // Dauer heraus — und die Buchung ließe sich gar nicht erst eintragen.
    const s = spanne("2026-09-15", "22:00", "01:00");
    expect(s?.ueberNacht).toBe(true);
    expect(s?.ende.getDate()).toBe(16);
    expect((s!.ende.getTime() - s!.start.getTime()) / 3_600_000).toBe(3);
  });

  it("gilt auch für zwei gleiche Uhrzeiten — 24 Stunden, nicht null", () => {
    const s = spanne("2026-09-15", "09:00", "09:00");
    expect((s!.ende.getTime() - s!.start.getTime()) / 3_600_000).toBe(24);
  });

  it("gibt null zurück, solange etwas fehlt", () => {
    expect(spanne("2026-09-15", "", "17:00")).toBeNull();
    expect(spanne("", "09:00", "17:00")).toBeNull();
  });
});

describe("wannKurz", () => {
  const jetzt = new Date(2026, 8, 28, 8, 0);
  const iso = (d: Date) => d.toISOString();

  it("sagt Minuten, solange es unter einer Stunde ist", () => {
    expect(wannKurz(iso(new Date(2026, 8, 28, 7, 59, 40)), jetzt)).toBe("gerade eben");
    expect(wannKurz(iso(new Date(2026, 8, 28, 7, 56)), jetzt)).toBe("vor 4 Min.");
  });

  it("zeigt heute nur die Uhrzeit", () => {
    expect(wannKurz(iso(new Date(2026, 8, 28, 6, 5)), jetzt)).toBe("06:05");
  });

  it("zählt nach dem Kalendertag, nicht nach 24 Stunden", () => {
    expect(wannKurz(iso(new Date(2026, 8, 27, 23, 50)), jetzt)).toBe("gestern 23:50");
    expect(wannKurz(iso(new Date(2026, 8, 25, 9, 12)), jetzt)).toBe("25.09. 09:12");
  });
});
