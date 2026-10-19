import { describe, expect, it } from "vitest";

import {
  KATALOG,
  bekannte,
  breiteUmschalten,
  dazunehmen,
  entfernen,
  fehlende,
  verschieben,
  type Platz,
} from "./uebersicht";

const p = (baustein: Platz["baustein"], breit = false): Platz => ({ baustein, breit });
const namen = (liste: Platz[]) => liste.map((x) => x.baustein);

describe("die Übersicht", () => {
  const drei = [p("aufgaben"), p("ball"), p("aktivitaet")];

  it("verschiebt nach unten und nach oben dorthin, wo man loslässt", () => {
    expect(namen(verschieben(drei, 0, 2))).toEqual(["ball", "aktivitaet", "aufgaben"]);
    expect(namen(verschieben(drei, 2, 0))).toEqual(["aktivitaet", "aufgaben", "ball"]);
    expect(namen(verschieben(drei, 1, 1))).toEqual(["aufgaben", "ball", "aktivitaet"]);
  });

  it("hält ein Ziel außerhalb der Liste an ihren Enden fest", () => {
    expect(namen(verschieben(drei, 0, 9))).toEqual(["ball", "aktivitaet", "aufgaben"]);
    expect(namen(verschieben(drei, 2, -3))).toEqual(["aktivitaet", "aufgaben", "ball"]);
    expect(verschieben(drei, 5, 0)).toBe(drei);
  });

  it("nimmt dazu nach oben und nicht doppelt", () => {
    expect(namen(dazunehmen(drei, "geld"))).toEqual(["geld", "aufgaben", "ball", "aktivitaet"]);
    expect(dazunehmen(drei, "ball")).toBe(drei);
  });

  it("entfernt und schaltet die Breite um", () => {
    expect(namen(entfernen(drei, "ball"))).toEqual(["aufgaben", "aktivitaet"]);
    expect(breiteUmschalten(drei, "ball")[1]).toEqual(p("ball", true));
    expect(breiteUmschalten(breiteUmschalten(drei, "ball"), "ball")[1]).toEqual(p("ball"));
  });

  it("lässt Unbekanntes und Doppeltes weg", () => {
    const roh = [p("ball"), { baustein: "gibtsnicht", breit: false } as unknown as Platz, p("ball", true)];
    expect(bekannte(roh)).toEqual([p("ball")]);
  });

  it("bietet an, was fehlt — in der Reihenfolge des Katalogs", () => {
    const rest = fehlende(drei);
    expect(rest).not.toContain("ball");
    expect(rest).toHaveLength(KATALOG.length - 3);
    expect(rest[0]).toBe("termine");
  });
});
