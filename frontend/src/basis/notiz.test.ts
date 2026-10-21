import { describe, expect, it } from "vitest";

import { bloecke, listenartAn, umschalten, zeilenumbruch, type Aenderung } from "./notiz";

/** Die Änderung auf den Text angewendet — so, wie das Feld sie einsetzt. */
function nach(text: string, a: Aenderung) {
  return text.slice(0, a.von) + a.ersatz + text.slice(a.bis);
}

describe("bloecke", () => {
  it("macht aus Zeilen mit Strich eine Liste und lässt den Rest als Absatz", () => {
    expect(bloecke("Rückruf vereinbart\n- Budget steht\n- Antrag bis März")).toEqual([
      { art: "absatz", text: "Rückruf vereinbart" },
      { art: "punkte", zeilen: ["Budget steht", "Antrag bis März"] },
    ]);
  });

  it("hält Zeilen ohne Leerzeile dazwischen in einem Absatz zusammen", () => {
    expect(bloecke("Erste Zeile\nzweite Zeile\n\nNeuer Absatz")).toEqual([
      { art: "absatz", text: "Erste Zeile\nzweite Zeile" },
      { art: "absatz", text: "Neuer Absatz" },
    ]);
  });

  it("nimmt Nummern mit ihrem Anfang", () => {
    expect(bloecke("3. drittens\n4. viertens")).toEqual([
      { art: "nummern", zeilen: ["drittens", "viertens"], start: 3 },
    ]);
  });

  it("kennt die Gedankenstriche aus dem Telefonat zur Förderung", () => {
    // So schreibt telefonatText() seine offenen Fragen — sie stehen schon im Bestand.
    expect(bloecke("Offen geblieben:\n– Wie hoch ist die Quote?")).toEqual([
      { art: "absatz", text: "Offen geblieben:" },
      { art: "punkte", zeilen: ["Wie hoch ist die Quote?"] },
    ]);
  });

  it("lässt einen leeren Punkt weg und hält Jahreszahlen nicht für Nummern", () => {
    expect(bloecke("- \n2026. wird ein gutes Jahr\n-5 Grad")).toEqual([
      { art: "absatz", text: "2026. wird ein gutes Jahr\n-5 Grad" },
    ]);
  });
});

describe("umschalten", () => {
  it("macht die Zeile mit dem Cursor zum Punkt und lässt den Cursor beim Wort", () => {
    const text = "Budget steht";
    const a = umschalten(text, 3, 3, "punkte");
    expect(nach(text, a)).toBe("- Budget steht");
    expect(a.auswahl).toEqual([5, 5]);
  });

  it("nimmt den Punkt beim zweiten Klick wieder weg", () => {
    const text = "- Budget steht";
    expect(nach(text, umschalten(text, 14, 14, "punkte"))).toBe("Budget steht");
  });

  it("nummeriert markierte Zeilen und überspringt die leeren", () => {
    const text = "Zuerst\n\nDanach\nZuletzt";
    const a = umschalten(text, 0, text.length, "nummern");
    expect(nach(text, a)).toBe("1. Zuerst\n\n2. Danach\n3. Zuletzt");
    // Markiert bleibt, was umgewandelt wurde — der zweite Klick dreht es zurück.
    expect(a.auswahl).toEqual([0, a.ersatz.length]);
  });

  it("wechselt von Punkten zu Nummern, ohne beides zu stapeln", () => {
    const text = "- eins\n- zwei";
    expect(nach(text, umschalten(text, 0, text.length, "nummern"))).toBe("1. eins\n2. zwei");
  });

  it("beginnt auf einer leeren Zeile eine Liste", () => {
    const text = "Notiz\n";
    const a = umschalten(text, 6, 6, "punkte");
    expect(nach(text, a)).toBe("Notiz\n- ");
    expect(a.auswahl).toEqual([8, 8]);
  });

  it("zählt die Zeile hinter einem markierten Umbruch nicht mit", () => {
    const text = "eins\nzwei";
    expect(nach(text, umschalten(text, 0, 5, "punkte"))).toBe("- eins\nzwei");
  });
});

describe("zeilenumbruch", () => {
  it("beginnt den nächsten Punkt mit derselben Marke", () => {
    const text = "• Budget";
    const a = zeilenumbruch(text, text.length)!;
    expect(nach(text, a)).toBe("• Budget\n• ");
    expect(a.auswahl).toEqual([11, 11]);
  });

  it("zählt die Nummer weiter", () => {
    const text = "1. Budget";
    expect(nach(text, zeilenumbruch(text, text.length)!)).toBe("1. Budget\n2. ");
  });

  it("beendet die Liste in einem leeren Punkt", () => {
    const text = "- Budget\n- ";
    const a = zeilenumbruch(text, text.length)!;
    expect(nach(text, a)).toBe("- Budget\n");
    expect(a.auswahl).toEqual([9, 9]);
  });

  it("tut außerhalb einer Liste nichts Eigenes", () => {
    expect(zeilenumbruch("Rückruf am Montag", 7)).toBeNull();
    // Im Strich selbst ist ein gewöhnlicher Umbruch gemeint.
    expect(zeilenumbruch("- Budget", 1)).toBeNull();
  });
});

describe("listenartAn", () => {
  it("sagt, in welcher Art Zeile der Cursor steht", () => {
    const text = "Notiz\n- Punkt\n2. Nummer";
    expect(listenartAn(text, 2)).toBeNull();
    expect(listenartAn(text, 9)).toBe("punkte");
    expect(listenartAn(text, text.length)).toBe("nummern");
  });
});
