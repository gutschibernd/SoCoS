import { describe, expect, it } from "vitest";

import {
  achseUeber,
  gezogen,
  heuteIso,
  istGanzesDatum,
  startphase,
  lageAuf,
  monateDer,
  monatsText,
  plusTage,
  tage,
  zeitraumText,
} from "./gantt";

describe("Tage", () => {
  it("rechnet über die Zeitumstellung ohne Versatz", () => {
    // In Wien wird am 25.10.2026 die Uhr zurückgestellt.
    expect(plusTage("2026-10-24", 2)).toBe("2026-10-26");
    expect(tage({ von: "2026-10-01", bis: "2026-10-31" })).toBe(31);
  });

  it("heute im Kalender des Browsers", () => {
    expect(heuteIso(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});

describe("achseUeber", () => {
  it("vom Monatsanfang bis Monatsende, heute eingeschlossen", () => {
    expect(achseUeber(["2027-02-10", null, "2027-06-03"], "2026-10-13")).toEqual({
      von: "2026-10-01",
      bis: "2027-06-30",
    });
  });

  it("ohne Daten sechs Monate ab heute — wie der Server", () => {
    expect(achseUeber([null], "2026-11-15")).toEqual({ von: "2026-11-01", bis: "2027-04-30" });
  });

  it("Schaltjahr im Februar", () => {
    expect(achseUeber(["2028-02-03"], "2028-01-10").bis).toBe("2028-02-29");
  });
});

describe("Lage und Monate", () => {
  const achse = { von: "2026-10-01", bis: "2027-03-31" };

  it("ein Balken ab seinem Tag", () => {
    expect(lageAuf(achse, { von: "2026-11-01", bis: "2026-11-30" })).toEqual({ anfang: 31, laenge: 30 });
  });

  it("je Monat Anfang und Länge, Januar mit Jahr", () => {
    const monate = monateDer(achse);
    expect(monate).toHaveLength(6);
    expect(monate[1]).toMatchObject({ anfang: 31, laenge: 30, name: "Nov", jahr: 2026 });
    expect(monate[3]).toMatchObject({ name: "Jan", jahr: 2027 });
    expect(monate.every((m) => m.beschriftet)).toBe(true);
  });

  it("bei drei Jahren nur jeder dritte beschriftet", () => {
    const monate = monateDer({ von: "2026-01-01", bis: "2028-12-31" });
    expect(monate).toHaveLength(36);
    expect(monate.filter((m) => m.beschriftet)).toHaveLength(12);
  });
});

describe("gezogen", () => {
  const achse = { von: "2026-10-01", bis: "2026-12-31" };
  const spanne = { von: "2026-11-01", bis: "2026-11-10" };

  it("die Mitte verschiebt beides", () => {
    expect(gezogen(spanne, "mitte", 5, achse)).toEqual({ von: "2026-11-06", bis: "2026-11-15" });
  });

  it("ein Rand nie über den anderen", () => {
    expect(gezogen(spanne, "anfang", 30, achse)).toEqual({ von: "2026-11-10", bis: "2026-11-10" });
    expect(gezogen(spanne, "ende", -30, achse)).toEqual({ von: "2026-11-01", bis: "2026-11-01" });
  });

  it("bleibt auf der Achse und behält seine Länge", () => {
    expect(gezogen(spanne, "mitte", -60, achse)).toEqual({ von: "2026-10-01", bis: "2026-10-10" });
    expect(gezogen(spanne, "mitte", 90, achse)).toEqual({ von: "2026-12-22", bis: "2026-12-31" });
  });
});

describe("Texte", () => {
  it("Zeitraum mit Jahr nur, wo nötig", () => {
    expect(zeitraumText("2026-11-03", "2026-11-20")).toBe("3.11.–20.11.2026");
    expect(zeitraumText("2026-12-15", "2027-01-10")).toBe("15.12.2026–10.1.2027");
    expect(zeitraumText(null, null)).toBe("ohne Zeitraum");
  });

  it("Monate einer Phase", () => {
    expect(monatsText("2026-10-01", "2027-03-31")).toBe("Okt 2026 – Mär 2027");
  });
});

describe("startphase", () => {
  const p = (id: number, stand: string, von: string | null = null, bis: string | null = null) => ({ id, stand, von, bis });

  it("die laufende, in der heute liegt", () => {
    const phasen = [p(1, "laeuft"), p(2, "laeuft", "2026-02-01", "2026-06-30"), p(3, "laeuft", "2026-10-01", "2027-03-31")];
    expect(startphase(phasen, "2026-10-13")?.id).toBe(3);
  });

  it("sonst die erste laufende mit Zeitraum, dann irgendeine", () => {
    expect(startphase([p(1, "offen", "2027-01-01", "2027-02-01"), p(2, "laeuft")], "2026-10-13")?.id).toBe(2);
    expect(startphase([p(1, "offen"), p(2, "offen", "2027-01-01", "2027-02-01")], "2026-10-13")?.id).toBe(2);
    expect(startphase([], "2026-10-13")).toBeUndefined();
  });
});

describe("istGanzesDatum", () => {
  it("nimmt kein halb getipptes Jahr", () => {
    expect(istGanzesDatum("0002-04-01")).toBe(false);
    expect(istGanzesDatum("2027-04-01")).toBe(true);
    expect(istGanzesDatum("")).toBe(false);
  });
});
