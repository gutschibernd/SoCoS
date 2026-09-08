import { describe, expect, it } from "vitest";

import { alsPfad, ausPfad } from "./router";

describe("ausPfad", () => {
  it("erkennt die bekannten Seiten", () => {
    expect(ausPfad("/zeit")).toEqual({ seite: "zeit", unter: "" });
    expect(ausPfad("/kontakte/")).toEqual({ seite: "kontakte", unter: "" });
  });

  it("liest die Ebene darunter", () => {
    expect(ausPfad("/kontakte/12")).toEqual({ seite: "kontakte", unter: "12" });
    expect(ausPfad("/kontakte/lose")).toEqual({ seite: "kontakte", unter: "lose" });
  });

  it("führt einen unbekannten Weg aufs Dashboard, ohne Unterebene", () => {
    expect(ausPfad("/quatsch/12")).toEqual({ seite: "dashboard", unter: "" });
    expect(ausPfad("/")).toEqual({ seite: "dashboard", unter: "" });
  });

  it("übergeht doppelte Schrägstriche", () => {
    expect(ausPfad("//kontakte//12")).toEqual({ seite: "kontakte", unter: "12" });
  });

  it("dreht das Kodieren wieder zurück", () => {
    expect(ausPfad(alsPfad("kontakte", "lose"))).toEqual({ seite: "kontakte", unter: "lose" });
  });
});

describe("alsPfad", () => {
  it("lässt die Unterebene weg, wenn es keine gibt", () => {
    expect(alsPfad("dashboard", "")).toBe("/dashboard");
  });

  it("hängt sie sonst an", () => {
    expect(alsPfad("kontakte", "12")).toBe("/kontakte/12");
  });
});
