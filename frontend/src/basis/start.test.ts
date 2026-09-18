import { describe, expect, it } from "vitest";

import type { Projekt } from "./daten";
import { buchbarePakete, letztePakete, paketeSuchen, paketgruppen } from "./start";

/** Die Stände, auf die der Server die Uhr laufen lässt — siehe `models.py`. */
const BUCHBARE_STAENDE = ["offen", "laeuft", "eingereicht", "zugesagt", "offene_frage"];

/** Ein Projektbaum mit so wenig Feldern wie möglich — der Rest spielt hier keine Rolle. */
function baum(pakete: { id: number; titel: string; status: string }[]): Projekt[] {
  return [
    {
      id: 1,
      titel: "Zulassung",
      untertitel: "",
      // Kein Hex-Wert, auch nicht in einer Prüfung: test_oberflaeche.py
      // sucht nach Farbwerten im Frontend, und diese Farbe wird nie gezeichnet.
      farbe: "var(--marke)",
      gebuchte_sekunden: 0,
      ist_auffang: false,
      phasen: [
        {
          id: 1,
          projekt: 1,
          titel: "Dossier",
          art: "dev",
          von: null,
          bis: null,
          stand: "laeuft",
          pakete: pakete.map((p) => ({
            id: p.id,
            phase: 1,
            projekt: 1,
            titel: p.titel,
            beschreibung: "",
            status: p.status,
            gebuchte_sekunden: 0,
            pensum_stunden: "0",
            fortschritt: null,
            unteraufgaben: [],
            pensen: [],
            // Wie der Server es rechnet (`Arbeitspaket.grund_gegen_buchung`).
            // Die Prüfungen hier reichen einen Status herein, weil sich so am
            // kürzesten sagen lässt, welcher Fall gemeint ist — entschieden
            // wird die Frage aber serverseitig, und dort steht auch ihr Test.
            buchbar: BUCHBARE_STAENDE.includes(p.status),
            grund_gegen_buchung: BUCHBARE_STAENDE.includes(p.status) ? "" : "zu",
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

describe("paketgruppen", () => {
  const projekte = baum([
    { id: 1, titel: "Modul 3", status: "offen" },
    { id: 9, titel: "Abgeschlossen", status: "fertig" },
  ]);

  it("gruppiert nach Projekt und nennt die Projektphase mit", () => {
    expect(paketgruppen(projekte)).toEqual([
      { projekt: "Zulassung", pakete: [{ id: 1, titel: "Dossier · Modul 3", projekt: "Zulassung" }] },
    ]);
  });

  // Sonst verschwände das Paket, an dem die Buchung hängt, aus dem Feld — und
  // Speichern schöbe die Zeit still auf ein anderes.
  it("nimmt ein fertiges Paket auf, wenn die Buchung daran hängt", () => {
    const gruppen = paketgruppen(projekte, [9]);
    expect(gruppen[0].pakete.map((p) => p.id)).toEqual([1, 9]);
  });

  it("lässt ein Projekt ohne buchbares Paket weg", () => {
    expect(paketgruppen(baum([{ id: 9, titel: "Abgeschlossen", status: "fertig" }]))).toEqual([]);
  });
});

describe("paketeSuchen", () => {
  const gruppen = paketgruppen(
    baum([
      { id: 1, titel: "Dauerlauftests", status: "offen" },
      { id: 2, titel: "Risikoanalyse", status: "offen" },
      { id: 3, titel: "Allgemein", status: "offen" },
    ]),
  );

  it("findet über Projekt und Paket, wortweise und in beliebiger Reihenfolge", () => {
    expect(paketeSuchen(gruppen, "dauer").map((p) => p.id)).toEqual([1]);
    expect(paketeSuchen(gruppen, "DAUER").map((p) => p.id)).toEqual([1]);
    // „Zulassung" ist das Projekt, „Dossier" die Projektphase, „Risiko" das Paket.
    expect(paketeSuchen(gruppen, "risiko zulassung").map((p) => p.id)).toEqual([2]);
  });

  it("stellt die zuletzt bebuchten Pakete voran", () => {
    expect(paketeSuchen(gruppen, "", [3, 2]).map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it("gibt ohne Suchwort alles zurück", () => {
    expect(paketeSuchen(gruppen, "  ")).toHaveLength(3);
  });
});
