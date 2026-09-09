import { describe, expect, it } from "vitest";

import { alsPfad, ausPfad } from "./router";

describe("ausPfad", () => {
  it("liest die Seite", () => {
    expect(ausPfad("/zeit")).toEqual({ seite: "zeit", unter: null });
    expect(ausPfad("/kontakte/")).toEqual({ seite: "kontakte", unter: null });
  });

  it("fällt auf das Dashboard zurück", () => {
    expect(ausPfad("/gibtsnicht")).toEqual({ seite: "dashboard", unter: null });
    expect(ausPfad("/")).toEqual({ seite: "dashboard", unter: null });
  });

  it("liest die Unterseite", () => {
    expect(ausPfad("/projekt/bearbeiten")).toEqual({ seite: "projekt", unter: "bearbeiten" });
  });

  it("liest die gewählte Organisation und die losen Kontakte", () => {
    expect(ausPfad("/kontakte/12")).toEqual({ seite: "kontakte", unter: "12" });
    expect(ausPfad("/kontakte/lose")).toEqual({ seite: "kontakte", unter: "lose" });
  });

  // Eine erfundene zweite Stufe darf keine Ansicht in einen Zustand bringen,
  // den niemand vorgesehen hat — sie wird verworfen, die Seite bleibt.
  it("verwirft eine unbekannte Unterseite", () => {
    expect(ausPfad("/projekt/loeschen")).toEqual({ seite: "projekt", unter: null });
    expect(ausPfad("/zeit/bearbeiten")).toEqual({ seite: "zeit", unter: null });
    expect(ausPfad("/kontakte/quatsch")).toEqual({ seite: "kontakte", unter: null });
  });

  it("liest das gewählte Event", () => {
    expect(ausPfad("/events/3")).toEqual({ seite: "events", unter: "3" });
    expect(ausPfad("/events")).toEqual({ seite: "events", unter: null });
    expect(ausPfad("/events/lose")).toEqual({ seite: "events", unter: null });
  });

  it("übergeht doppelte Schrägstriche", () => {
    expect(ausPfad("//kontakte//12")).toEqual({ seite: "kontakte", unter: "12" });
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
    expect(ausPfad(alsPfad("kontakte", "12"))).toEqual({ seite: "kontakte", unter: "12" });
  });
});
