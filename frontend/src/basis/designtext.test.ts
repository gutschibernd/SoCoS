import { describe, expect, it } from "vitest";

import { kiAbgleich, kiAntwortLesen, kiBefehl } from "./designtext";

const E = {
  titel: "Dosierkammer aus PP",
  ausgangslage: "Die Kammer reist bei Reinigung.",
  alternativen: "- PET\n- PP",
  entscheidung: "",
  begruendung: "  ",
  sicherheit: "Weniger Undichtigkeit (R-12).",
  verweise: "",
};

describe("kiBefehl", () => {
  it("nimmt nur die ausgefüllten Felder, in der Reihenfolge des PDF", () => {
    const text = kiBefehl(E);

    expect(text).toContain("=== Titel ===\nDosierkammer aus PP");
    expect(text).toContain("=== Betrachtete Alternativen ===\n- PET\n- PP");
    expect(text).not.toContain("=== Entscheidung ===");
    expect(text).not.toContain("=== Begründung ===");
    expect(text.indexOf("Ausgangslage")).toBeLessThan(text.indexOf("Auswirkung auf die Sicherheit"));
    expect(text.trimEnd().endsWith("=== ENDE ===")).toBe(true);
  });

  it("kommt durch das eigene Lesen unverändert zurück", () => {
    const { felder, unbekannt } = kiAntwortLesen(kiBefehl(E));

    expect(unbekannt).toEqual([]);
    expect(felder).toEqual({
      titel: E.titel,
      ausgangslage: E.ausgangslage,
      alternativen: E.alternativen,
      sicherheit: E.sicherheit,
    });
  });
});

describe("kiAntwortLesen", () => {
  it("lässt Plauderei davor und danach weg", () => {
    const { felder } = kiAntwortLesen(
      "Gern, hier ist der überarbeitete Text:\n\n=== Ausgangslage ===\nDie Kammer reißt.\n=== ENDE ===\n\nIch habe „reist“ korrigiert.",
    );

    expect(felder).toEqual({ ausgangslage: "Die Kammer reißt." });
  });

  it("verträgt, was eine KI um die Trenner herum anstellt", () => {
    const { felder } = kiAntwortLesen(
      "```text\n**=== Titel ===**\nNeu\n\n## === auswirkung auf die  Sicherheit: ===\nZeile eins\n\nZeile zwei\n```",
    );

    expect(felder).toEqual({ titel: "Neu", sicherheit: "Zeile eins\n\nZeile zwei" });
  });

  it("liest Trenner, hinter denen der Text in derselben Zeile weitergeht", () => {
    // So kommt es aus einer Chat-Oberfläche, die Markdown anzeigt: Der
    // einzelne Umbruch nach dem Trenner wird beim Kopieren zum Leerzeichen.
    const { felder, unbekannt } = kiAntwortLesen(
      "=== Titel === Karussell Swap\n\n=== Ausgangslage === Der Prototyp ist zu groß.\n\n" +
        "=== Entscheidung === Das ganze Karussell wird entnommen.\n\n=== ENDE ===",
    );

    expect(unbekannt).toEqual([]);
    expect(felder).toEqual({
      titel: "Karussell Swap",
      ausgangslage: "Der Prototyp ist zu groß.",
      entscheidung: "Das ganze Karussell wird entnommen.",
    });
  });

  it("liest auch alles in einer einzigen Zeile", () => {
    const { felder } = kiAntwortLesen("=== Titel === Neu === Entscheidung === So. === ENDE === Gern geschehen!");

    expect(felder).toEqual({ titel: "Neu", entscheidung: "So." });
  });

  it("ein leerer Abschnitt leert kein Feld", () => {
    const { felder } = kiAntwortLesen("=== Begründung ===\n\n=== Entscheidung ===\nSo.\n=== ENDE ===");

    expect(felder).toEqual({ entscheidung: "So." });
  });

  it("nennt Abschnitte, die es nicht gibt, und übernimmt sie nicht", () => {
    const { felder, unbekannt } = kiAntwortLesen("=== Zusammenfassung ===\nBla\n=== Entscheidung ===\nSo.");

    expect(felder).toEqual({ entscheidung: "So." });
    expect(unbekannt).toEqual(["Zusammenfassung"]);
  });

  it("ohne Trenner erkennt es nichts", () => {
    expect(kiAntwortLesen("Einfach nur Text.").felder).toEqual({});
  });
});

describe("kiAbgleich", () => {
  it("sagt je Feld, ob sich etwas ändert", () => {
    const zeilen = kiAbgleich(E, { ausgangslage: "Die Kammer reißt bei Reinigung.", sicherheit: E.sicherheit });

    expect(zeilen.map((z) => [z.feld, z.geaendert])).toEqual([
      ["ausgangslage", true],
      ["sicherheit", false],
    ]);
  });
});
