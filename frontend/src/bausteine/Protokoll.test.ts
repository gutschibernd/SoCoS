import { describe, expect, it } from "vitest";

import { wert } from "./Protokoll";

describe("Werte im Änderungsprotokoll", () => {
  it("zeigt leer, ja und nein statt null und true", () => {
    expect(wert(null)).toBe("leer");
    expect(wert("")).toBe("leer");
    expect(wert(true)).toBe("ja");
    expect(wert(false)).toBe("nein");
  });

  it("schreibt Tage und Zeitpunkte deutsch", () => {
    expect(wert("2026-11-19")).toBe("19.11.2026");
    expect(wert("2026-11-19T11:45:17.804Z")).toMatch(/^19\.11\.2026, \d{2}:45$/);
  });

  // Ein Betrag als Zeichenkette (Decimal) bleibt genau so, wie er kam.
  it("lässt Beträge und Text unverändert", () => {
    expect(wert("462.19")).toBe("462.19");
    expect(wert("Messestand MEDICA")).toBe("Messestand MEDICA");
  });
});
