import { describe, expect, it } from "vitest";

import { anzeigefall, type Abfragezustand } from "./Zustand";

const zustand = (teil: Partial<Abfragezustand>): Abfragezustand => ({
  status: "pending",
  fetchStatus: "idle",
  error: null,
  ...teil,
});

describe("was statt der Seite dasteht", () => {
  it("zeigt beim ersten Laden 'wird geladen'", () => {
    expect(anzeigefall(zustand({ status: "pending", fetchStatus: "fetching" }))).toBe(
      "laedt",
    );
  });

  it("erkennt einen angehaltenen Versuch als fehlende Verbindung", () => {
    // Die eigentliche Falle: React Query hält den zweiten Versuch an, solange
    // das Fenster verdeckt ist. Der Zustand ist dann pending/paused und error
    // bleibt null. Wer das als "wird geladen" zeichnet, lädt nie fertig.
    const angehalten = zustand({ status: "pending", fetchStatus: "paused", error: null });
    expect(angehalten.error).toBeNull();
    expect(anzeigefall(angehalten)).toBe("keine_verbindung");
  });

  it("meldet einen Fehler als gescheitert", () => {
    expect(
      anzeigefall(zustand({ status: "error", fetchStatus: "idle", error: new Error("x") })),
    ).toBe("gescheitert");
  });

  it("gibt bei geladenen Daten die Seite frei", () => {
    expect(anzeigefall(zustand({ status: "success", fetchStatus: "idle" }))).toBe("leer");
  });
});
