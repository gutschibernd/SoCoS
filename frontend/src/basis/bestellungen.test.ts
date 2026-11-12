import { describe, expect, it } from "vitest";

import {
  gleicherLink,
  istLink,
  kurzerLink,
  naechsteStufeText,
  rechnungsText,
  sortiment,
  zusammenfassung,
  zusammengezaehlt,
} from "./bestellungen";
import type { Bestellartikel, Bestellposition, Korbrechnung } from "./daten";

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
  preis: null,
  in_staffel: false,
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

describe("die Rechnung unter dem Korb", () => {
  const rechnung = (teil: Partial<Korbrechnung>): Korbrechnung => ({
    staffel_menge: 0,
    prozent: null,
    naechste: null,
    einzelpreise: {},
    summe: "0.00",
    listensumme: "0.00",
    ohne_preis: 0,
    ...teil,
  });

  it("nennt Staffel, Rabatt und die Summe gegen den Listenpreis", () => {
    const r = rechnung({ staffel_menge: 46, prozent: "47", summe: "414.00", listensumme: "781.54" });
    expect(rechnungsText(r)).toBe("46 Stück in der Staffel, −47 % · ca. 414 € statt 781,54 €");
    expect(naechsteStufeText(r)).toBe("");
  });

  it("sagt, wie viel bis zur nächsten Stufe fehlt, und was keinen Preis hat", () => {
    const r = rechnung({ staffel_menge: 3, summe: "50.97", listensumme: "50.97", ohne_preis: 1, naechste: { ab: 4, prozent: "25", fehlen: 1 } });
    expect(rechnungsText(r)).toBe("ca. 50,97 € · 1 Zeile ohne Preis");
    expect(naechsteStufeText(r)).toBe("Noch 1 Stück bis −25 %");
  });

  it("schreibt in die Zusammenfassung, was SoCoS erwartet", () => {
    const text = zusammenfassung(
      { name: "Bambu Lab", art: "shop", link: "" },
      [position({ menge: 14 })],
      "Bernd Gutschi",
      "2026-11-12",
      rechnung({ staffel_menge: 14, prozent: "47", summe: "126.00", listensumme: "237.86" }),
    );
    expect(text.endsWith("Erwartet laut SoCoS: 14 Stück in der Staffel, −47 % · ca. 126 € statt 237,86 €. Bitte im Warenkorb vergleichen.")).toBe(true);
  });

  it("lässt die Zeile weg, wenn es weder Preis noch Staffel gibt", () => {
    expect(rechnungsText(rechnung({}))).toBe("");
  });
});
