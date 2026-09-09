import { describe, expect, it } from "vitest";

import type { Projekt } from "./daten";
import { buchbarePakete, letztePakete } from "./start";

/** Ein Projektbaum mit so wenig Feldern wie möglich — der Rest spielt hier keine Rolle. */
function baum(pakete: { id: number; titel: string; status: string }[]): Projekt[] {
  return [
    {
      id: 1,
      titel: "Zulassung",
      untertitel: "",
      farbe: "#000",
      gebuchte_sekunden: 0,
      bereiche: [
        {
          id: 1,
          projekt: 1,
          titel: "Dossier",
          art: "dev",
          pakete: pakete.map((p) => ({
            id: p.id,
            bereich: 1,
            projekt: 1,
            titel: p.titel,
            notiz: "",
            status: p.status,
            stufenstand: 0,
            stufen: [],
            fortschritt: 0,
            unteraufgaben: [],
          })),
        },
      ],
    },
  ];
}

describe("buchbarePakete", () => {
  it("lässt fertige und verworfene Pakete aus", () => {
    const offen = buchbarePakete(
      baum([
        { id: 1, titel: "Modul 3", status: "offen" },
        { id: 2, titel: "Modul 1", status: "fertig" },
        { id: 3, titel: "Altlast", status: "verworfen" },
        { id: 4, titel: "Nachfrage", status: "offene_frage" },
      ]),
    );
    expect([...offen.keys()]).toEqual([1, 4]);
    expect(offen.get(1)).toEqual({ id: 1, titel: "Modul 3", projekt: "Zulassung" });
  });
});

describe("letztePakete", () => {
  const projekte = baum([
    { id: 1, titel: "Modul 3", status: "offen" },
    { id: 2, titel: "Modul 1", status: "laeuft" },
    { id: 3, titel: "Modul 2", status: "offen" },
    { id: 9, titel: "Abgeschlossen", status: "fertig" },
  ]);

  it("nimmt die jüngste Buchung je Paket, ohne Wiederholung", () => {
    const treffer = letztePakete(
      [
        { paket: 1, start: "2026-09-01T08:00:00Z" },
        { paket: 2, start: "2026-09-03T08:00:00Z" },
        { paket: 1, start: "2026-09-05T08:00:00Z" },
      ],
      projekte,
    );
    expect(treffer.map((t) => t.id)).toEqual([1, 2]);
  });

  it("übergeht ein Paket, auf das nicht mehr gebucht werden darf", () => {
    const treffer = letztePakete(
      [
        { paket: 9, start: "2026-09-05T08:00:00Z" },
        { paket: 3, start: "2026-09-04T08:00:00Z" },
      ],
      projekte,
    );
    expect(treffer.map((t) => t.id)).toEqual([3]);
  });

  // Ein Paket, das es nicht mehr gibt (weich gelöscht), darf die Liste nicht
  // kürzen — es rückt nach, statt eine Lücke zu lassen.
  it("füllt bis zur gewünschten Anzahl auf", () => {
    const treffer = letztePakete(
      [
        { paket: 9, start: "2026-09-05T08:00:00Z" },
        { paket: 1, start: "2026-09-04T08:00:00Z" },
        { paket: 2, start: "2026-09-03T08:00:00Z" },
        { paket: 3, start: "2026-09-02T08:00:00Z" },
      ],
      projekte,
      2,
    );
    expect(treffer.map((t) => t.id)).toEqual([1, 2]);
  });

  it("gibt bei leerem Verlauf nichts zurück", () => {
    expect(letztePakete([], projekte)).toEqual([]);
  });
});
