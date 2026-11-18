import { describe, expect, it } from "vitest";

import {
  alsDauer,
  alsStunden,
  alsUhr,
  alsZeitpunkt,
  aufFuenfMinuten,
  heuteAlsDatum,
  monatVerschieben,
  monatskalender,
  nachTagen,
  paketkuerzel,
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

describe("Monate und Tage der Zeitliste", () => {
  it("blättert über die Jahresgrenze", () => {
    expect(monatVerschieben("2026-12", 1)).toBe("2027-01");
    expect(monatVerschieben("2026-01", -1)).toBe("2025-12");
    expect(monatVerschieben("2026-10", 0)).toBe("2026-10");
  });

  it("gruppiert nach dem Tag des Beginns, neuester zuerst, ohne Entwürfe", () => {
    const b = (start: string, sekunden: number, ist_entwurf = false) => ({ start, sekunden, ist_entwurf });
    const tage = nachTagen([
      b(new Date(2026, 9, 13, 9).toISOString(), 3600),
      b(new Date(2026, 9, 14, 23, 30).toISOString(), 3600),
      b(new Date(2026, 9, 13, 14).toISOString(), 1800),
      b(new Date(2026, 9, 13, 16).toISOString(), 9999, true),
    ]);
    expect(tage.map((t) => t.tag)).toEqual(["2026-10-14", "2026-10-13"]);
    expect(tage[1].sekunden).toBe(5400);
    // Innerhalb des Tages die spätere zuerst — wie die Liste darüber.
    expect(tage[1].buchungen[0].sekunden).toBe(1800);
  });
});

describe("Kalender der Zeitseite", () => {
  const stunden = (h: number) => h * 3600;

  it("beginnt am Montag und füllt jede Woche auf sieben Felder", () => {
    // Der 1. November 2026 ist ein Sonntag.
    const wochen = monatskalender("2026-11", new Map(), "2026-12-31");
    expect(wochen[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(wochen[0][6]?.nummer).toBe(1);
    expect(wochen.every((w) => w.length === 7)).toBe(true);
    expect(wochen.flat().filter(Boolean)).toHaveLength(30);
  });

  it("färbt Werktage nach den Stunden, Wochenende und Zukunft nie", () => {
    const summen = new Map([
      ["2026-11-02", stunden(8)],
      ["2026-11-03", stunden(7.5)],
      ["2026-11-07", stunden(9)],
      ["2026-11-20", stunden(9)],
    ]);
    const tage = monatskalender("2026-11", summen, "2026-11-18").flat();
    const stufe = (nummer: number) => tage.find((t) => t?.nummer === nummer)?.stufe;
    expect(stufe(2)).toBe("voll");
    expect(stufe(3)).toBe("teil");
    expect(stufe(4)).toBe("leer");
    expect(stufe(7)).toBeUndefined(); // Samstag, auch mit Stunden
    expect(stufe(8)).toBeUndefined(); // Sonntag
    expect(stufe(20)).toBeUndefined(); // nach heute
  });

  it("lässt den heutigen Tag ohne Rot, solange er leer ist", () => {
    const leer = monatskalender("2026-11", new Map(), "2026-11-18").flat();
    expect(leer.find((t) => t?.heute)?.stufe).toBeUndefined();
    const halb = monatskalender("2026-11", new Map([["2026-11-18", 3600]]), "2026-11-18").flat();
    expect(halb.find((t) => t?.heute)?.stufe).toBe("teil");
  });

  it("färbt nichts, wenn mehrere Personen zusammen stehen", () => {
    const tage = monatskalender("2026-11", new Map([["2026-11-02", stunden(20)]]), "2026-11-18", false).flat();
    expect(tage.some((t) => t?.stufe)).toBe(false);
  });
});

describe("Paketkürzel", () => {
  it("nimmt die Nummer vorne und lässt den Rest weg", () => {
    expect(paketkuerzel("AP02 Entwicklung der Sensorik für das Gerät")).toBe("AP02");
    expect(paketkuerzel("AP 3.1 – Klinische Bewertung")).toBe("AP3.1");
    expect(paketkuerzel("ap12: Zulassung")).toBe("AP12");
  });

  it("lässt einen Titel ohne Nummer stehen", () => {
    expect(paketkuerzel("Overhead")).toBe("Overhead");
    expect(paketkuerzel("APPLIKATION")).toBe("APPLIKATION");
  });
});
