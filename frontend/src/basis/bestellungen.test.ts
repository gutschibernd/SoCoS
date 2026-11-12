import { describe, expect, it } from "vitest";

import {
  gleicherLink,
  istLink,
  kurzerLink,
  sortiment,
  zusammenfassung,
  zusammengezaehlt,
} from "./bestellungen";
import type { Bestellartikel, Bestellposition } from "./daten";

const position = (teil: Partial<Bestellposition>): Bestellposition => ({
  id: 1,
  artikel: 1,
  menge: 1,
  von: 1,
  von_initialen: "BG",
  bestellung: null,
  name: "PLA Basic",
  link: "https://eu.store.bambulab.com/products/pla-basic?variant=1",
  beschreibung: "Schwarz, 1 kg",
  erstellt_am: "2026-11-12T10:00:00Z",
  ...teil,
});

const artikel = (teil: Partial<Bestellartikel>): Bestellartikel => ({
  id: 1,
  lieferant: 1,
  name: "PLA Basic",
  link: "",
  beschreibung: "",
  bestellt_mal: 0,
  ...teil,
});

describe("der Korb, zusammengezählt", () => {
  it("zählt dieselben Artikel verschiedener Personen zusammen, in der Reihenfolge des ersten", () => {
    const korb = [
      position({ id: 1, artikel: 7, menge: 2 }),
      position({ id: 2, artikel: 9, menge: 1, name: "PETG HF", beschreibung: "" }),
      position({ id: 3, artikel: 7, menge: 3, von: 2 }),
    ];
    expect(zusammengezaehlt(korb).map((z) => [z.name, z.menge])).toEqual([
      ["PLA Basic", 5],
      ["PETG HF", 1],
    ]);
  });
});

describe("die Zusammenfassung", () => {
  const korb = [
    position({ id: 1, artikel: 7, menge: 6 }),
    position({ id: 2, artikel: 8, menge: 1, name: "PTFE-Schlauch", link: "", beschreibung: "" }),
  ];

  it("sagt beim Onlineshop, was zu tun ist — und dass niemand zur Kasse geht", () => {
    const text = zusammenfassung(
      { name: "Bambu Lab", art: "shop", link: "https://eu.store.bambulab.com" },
      korb,
      "Bernd Gutschi",
      "2026-11-12",
    );
    expect(text.split("\n")[0]).toBe("Sammelbestellung bei Bambu Lab — aus SoCoS, Stand 12.11.2026");
    expect(text).toContain("in den Warenkorb legen");
    expect(text).toContain("Nicht zur Kasse gehen");
    expect(text).toContain("Shop: https://eu.store.bambulab.com");
    expect(text).toContain(
      "1. 6 × PLA Basic — Schwarz, 1 kg\n   https://eu.store.bambulab.com/products/pla-basic?variant=1",
    );
    // Ohne Link keine leere Zeile darunter.
    expect(text.endsWith("2. 1 × PTFE-Schlauch")).toBe(true);
  });

  it("lässt auf einer Plattform anfragen, aber nichts absenden", () => {
    const text = zusammenfassung({ name: "Alibaba", art: "plattform", link: "" }, korb, "Bernd Gutschi", "2026-11-12");
    expect(text.split("\n")[0]).toBe("Sammelbestellung über Alibaba — aus SoCoS, Stand 12.11.2026");
    expect(text).toContain("aber nicht absenden");
    expect(text).not.toContain("Plattform:");
  });

  it("ist beim Händler die Anfrage um ein Angebot, unterschrieben", () => {
    const text = zusammenfassung({ name: "Pumpen GmbH", art: "haendler", link: "" }, korb, "Bernd Gutschi", "2026-11-12");
    expect(text.startsWith("Betreff: Anfrage um ein Angebot\n\nSehr geehrte Damen und Herren,")).toBe(true);
    expect(text).toContain("1. 6 × PLA Basic — Schwarz, 1 kg");
    expect(text.endsWith("Mit freundlichen Grüßen\nBernd Gutschi")).toBe(true);
    expect(text).not.toContain("Claude");
  });
});

describe("Links", () => {
  it("erkennt einen Link — und einen Namen, der keiner ist", () => {
    expect(istLink("https://www.amazon.de/dp/B0BXXXXXXX")).toBe(true);
    expect(istLink("  http://example.com/x ")).toBe(true);
    expect(istLink("Membranpumpe 24 V")).toBe(false);
    expect(istLink("https://amaz")).toBe(false);
  });

  it("zeigt den Shop ohne www", () => {
    expect(kurzerLink("https://www.amazon.de/dp/B0")).toBe("amazon.de");
    expect(kurzerLink("kein link")).toBe("kein link");
  });

  it("hält denselben Link mit und ohne www und Schrägstrich für gleich — die Variante nicht", () => {
    expect(gleicherLink("https://www.example.com/p/pla/", "https://example.com/p/pla")).toBe(true);
    expect(gleicherLink("https://example.com/p/pla?variant=1", "https://example.com/p/pla?variant=2")).toBe(false);
    expect(gleicherLink("", "")).toBe(false);
  });
});

describe("das Sortiment", () => {
  it("stellt das Häufigste nach oben, dann nach Name", () => {
    const liste = sortiment([
      artikel({ id: 1, name: "Zange", bestellt_mal: 0 }),
      artikel({ id: 2, name: "PLA", bestellt_mal: 4 }),
      artikel({ id: 3, name: "Düse", bestellt_mal: 0 }),
      artikel({ id: 4, name: "PETG", bestellt_mal: 4 }),
    ]);
    expect(liste.map((a) => a.name)).toEqual(["PETG", "PLA", "Düse", "Zange"]);
  });
});
