import { describe, expect, it } from "vitest";

import { alsPfad, ausPfad } from "./router";

describe("ausPfad", () => {
  it("liest die Seite", () => {
    expect(ausPfad("/zeit")).toEqual({ seite: "zeit", unter: null });
  });

  it("fällt auf das Dashboard zurück", () => {
    expect(ausPfad("/gibtsnicht")).toEqual({ seite: "dashboard", unter: null });
    expect(ausPfad("/")).toEqual({ seite: "dashboard", unter: null });
  });

  it("liest die Unterseite", () => {
    expect(ausPfad("/projekt/bearbeiten")).toEqual({ seite: "projekt", unter: "bearbeiten" });
  });

  // Eine erfundene zweite Stufe darf keine Ansicht in einen Zustand bringen,
  // den niemand vorgesehen hat — sie wird verworfen, die Seite bleibt.
  it("verwirft eine unbekannte Unterseite", () => {
    expect(ausPfad("/projekt/loeschen")).toEqual({ seite: "projekt", unter: null });
    expect(ausPfad("/zeit/bearbeiten")).toEqual({ seite: "zeit", unter: null });
  });
});

describe("alsPfad", () => {
  it("baut den Pfad zurück", () => {
    expect(alsPfad("projekt", null)).toBe("/projekt");
    expect(alsPfad("projekt", "bearbeiten")).toBe("/projekt/bearbeiten");
    expect(ausPfad(alsPfad("projekt", "bearbeiten"))).toEqual({
      seite: "projekt",
      unter: "bearbeiten",
    });
  });
});
