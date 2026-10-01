import { describe, expect, it } from "vitest";

import { archiv, datumIn, fristText, gehoertZu, ideen, leute, sortiere, tafel, tageBis } from "./aufgaben";
import type { Aufgabe, Teammitglied } from "./daten";

function aufgabe(teil: Partial<Aufgabe> & { id: number }): Aufgabe {
  return {
    text: `Aufgabe ${teil.id}`,
    personen: [],
    prioritaet: "mittel",
    erledigt: false,
    frist: null,
    ist_idee: false,
    erstellt_am: "2026-09-01T08:00:00Z",
    geaendert_am: "2026-09-01T08:00:00Z",
    ...teil,
  };
}

function mitglied(teil: Partial<Teammitglied> & { id: number; name: string }): Teammitglied {
  return {
    initialen: teil.name.slice(0, 2).toUpperCase(),
    // Kein Farbwert im Quelltext — auch nicht im Test. Die Farbe wird hier
    // ohnehin nur durchgereicht.
    farbe: "",
    funktion: "",
    email: `${teil.id}@example.invalid`,
    is_active: true,
    rolle: "bearbeiter",
    ...teil,
  };
}

describe("Sortierung", () => {
  it("stellt Hohes vor Mittleres vor Geringes", () => {
    const liste = [
      aufgabe({ id: 1, prioritaet: "gering" }),
      aufgabe({ id: 2, prioritaet: "hoch" }),
      aufgabe({ id: 3, prioritaet: "mittel" }),
    ];
    expect(sortiere(liste).map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it("stellt bei gleicher Priorität das Neueste nach oben", () => {
    const liste = [
      aufgabe({ id: 1, erstellt_am: "2026-09-01T08:00:00Z" }),
      aufgabe({ id: 2, erstellt_am: "2026-09-03T08:00:00Z" }),
      aufgabe({ id: 3, erstellt_am: "2026-09-02T08:00:00Z" }),
    ];
    expect(sortiere(liste).map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it("stellt bei gleicher Priorität die frühere Frist nach oben, ohne Frist nach hinten", () => {
    const liste = [
      aufgabe({ id: 1, erstellt_am: "2026-09-09T08:00:00Z" }),
      aufgabe({ id: 2, frist: "2026-11-19" }),
      aufgabe({ id: 3, frist: "2026-10-12" }),
      aufgabe({ id: 4, prioritaet: "hoch" }),
    ];
    // Die Frist schlägt die Priorität nicht: 4 ist hoch und steht oben.
    expect(sortiere(liste).map((a) => a.id)).toEqual([4, 3, 2, 1]);
  });

  it("sortiert nicht in der übergebenen Liste", () => {
    const liste = [aufgabe({ id: 1, prioritaet: "gering" }), aufgabe({ id: 2, prioritaet: "hoch" })];
    sortiere(liste);
    expect(liste.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("Filter", () => {
  it("zeigt eine Aufgabe mit zwei Personen bei beiden", () => {
    const gemeinsam = aufgabe({ id: 1, personen: [2, 3] });
    expect(gehoertZu(gemeinsam, 2, 1)).toBe(true);
    expect(gehoertZu(gemeinsam, 3, 1)).toBe(true);
    expect(gehoertZu(gemeinsam, "ich", 3)).toBe(true);
    expect(gehoertZu(gemeinsam, "ich", 1)).toBe(false);
    expect(gehoertZu(gemeinsam, "allgemein", 1)).toBe(false);
  });

  it("nimmt „Allgemein“ als: niemandem zugeordnet", () => {
    expect(gehoertZu(aufgabe({ id: 1 }), "allgemein", 1)).toBe(true);
    expect(gehoertZu(aufgabe({ id: 1 }), "ich", 1)).toBe(false);
    expect(gehoertZu(aufgabe({ id: 1 }), "alle", 1)).toBe(true);
  });
});

describe("Tafel", () => {
  const heute = new Date(2026, 8, 28, 10, 0);

  it("gruppiert nach Fälligkeit und lässt leere Gruppen weg", () => {
    const liste = [
      aufgabe({ id: 1, frist: "2026-09-26" }),
      aufgabe({ id: 2, frist: "2026-09-28" }),
      aufgabe({ id: 3, frist: "2026-10-05" }),
      aufgabe({ id: 4, frist: "2026-10-06" }),
      aufgabe({ id: 5 }),
    ];
    const gruppen = tafel(liste, "alle", 1, heute);
    expect(gruppen.map((g) => [g.art, g.aufgaben.map((a) => a.id)])).toEqual([
      ["drueber", [1]],
      ["heute", [2]],
      ["bald", [3]],
      ["spaeter", [4]],
      ["ohne", [5]],
    ]);
    expect(tafel([aufgabe({ id: 1 })], "alle", 1, heute).map((g) => g.art)).toEqual(["ohne"]);
  });

  it("lässt Erledigtes und Ideen weg", () => {
    /* Tafel, Ideen und Archiv kommen aus **einer** Antwort. Fehlte der
       Filter an einer Stelle, sähe eine Idee auf der Tafel aus wie jede
       andere Zeile — und niemand fände den Grund. */
    const liste = [
      aufgabe({ id: 1 }),
      aufgabe({ id: 2, ist_idee: true }),
      aufgabe({ id: 3, erledigt: true }),
    ];
    expect(tafel(liste, "alle", 1, heute).flatMap((g) => g.aufgaben).map((a) => a.id)).toEqual([1]);
    expect(ideen(liste).map((a) => a.id)).toEqual([2]);
  });

  it("filtert nach Person", () => {
    const liste = [aufgabe({ id: 1, personen: [1] }), aufgabe({ id: 2, personen: [2] })];
    expect(tafel(liste, 2, 1, heute).flatMap((g) => g.aufgaben).map((a) => a.id)).toEqual([2]);
    expect(tafel(liste, "ich", 1, heute).flatMap((g) => g.aufgaben).map((a) => a.id)).toEqual([1]);
  });
});

describe("Ideenliste", () => {
  it("sortiert wie die Tafel: Hohes zuerst, Abgehaktes nicht dabei", () => {
    const liste = [
      aufgabe({ id: 1, ist_idee: true, prioritaet: "gering" }),
      aufgabe({ id: 2, ist_idee: true, prioritaet: "hoch" }),
      aufgabe({ id: 3, ist_idee: true, erledigt: true }),
    ];
    expect(ideen(liste).map((a) => a.id)).toEqual([2, 1]);
  });
});

describe("Archiv", () => {
  it("nimmt nur Abgehaktes, zuletzt Angefasstes oben, nach Monaten geteilt", () => {
    const liste = [
      aufgabe({ id: 1, erledigt: true, geaendert_am: "2026-08-30T08:00:00Z" }),
      aufgabe({ id: 2, erledigt: true, geaendert_am: "2026-09-05T08:00:00Z" }),
      aufgabe({ id: 3, erledigt: true, geaendert_am: "2026-09-12T08:00:00Z" }),
      aufgabe({ id: 4 }),
    ];
    const monate = archiv(liste, "alle", 1);
    expect(monate.map((m) => [m.monat, m.aufgaben.map((a) => a.id)])).toEqual([
      ["2026-09", [3, 2]],
      ["2026-08", [1]],
    ]);
  });

  it("gilt mit demselben Filter wie die Tafel", () => {
    const liste = [
      aufgabe({ id: 1, erledigt: true, personen: [1] }),
      aufgabe({ id: 2, erledigt: true, personen: [2] }),
    ];
    expect(archiv(liste, "ich", 1).flatMap((m) => m.aufgaben).map((a) => a.id)).toEqual([1]);
  });
});

describe("Leute", () => {
  const team = [
    mitglied({ id: 1, name: "Anna Beispiel" }),
    mitglied({ id: 2, name: "Bernd Beispiel" }),
    mitglied({ id: 3, name: "Florian Beispiel" }),
  ];

  it("stellt mich vorn, die anderen nach Namen", () => {
    expect(leute([], team, 3).map((m) => m.id)).toEqual([3, 1, 2]);
  });

  it("lässt stillgelegte Konten weg — außer sie haben noch Offenes", () => {
    const mit = [...team, mitglied({ id: 4, name: "Zita Ehemalig", is_active: false })];
    expect(leute([], mit, 2)).toHaveLength(3);
    expect(leute([aufgabe({ id: 9, personen: [2, 4] })], mit, 2).map((m) => m.id)).toContain(4);
  });
});

describe("Frist", () => {
  const heute = new Date(2026, 8, 22, 15, 30);

  it("zählt Kalendertage, nicht Stunden", () => {
    expect(tageBis("2026-09-22", heute)).toBe(0);
    expect(tageBis("2026-09-23", heute)).toBe(1);
    expect(tageBis("2026-10-12", heute)).toBe(20);
    expect(tageBis("2026-09-20", heute)).toBe(-2);
  });

  // Am 25. Oktober hat der Tag 25 Stunden. Über die Umstellung hinweg darf
  // kein Tag verloren gehen.
  it("verliert über die Zeitumstellung keinen Tag", () => {
    expect(tageBis("2026-10-27", new Date(2026, 9, 24, 23, 0))).toBe(3);
  });

  it("rechnet die Schnellfristen in Ortszeit, über Monatsenden hinweg", () => {
    expect(datumIn(1, heute)).toBe("2026-09-23");
    expect(datumIn(14, new Date(2026, 8, 28, 23, 30))).toBe("2026-10-12");
  });

  it("schreibt das Datum immer dazu", () => {
    expect(fristText("2026-10-12", heute)).toEqual({ text: "12.10. · in 20 Tagen", drueber: false, bald: false });
    expect(fristText("2026-09-23", heute).text).toBe("23.09. · morgen");
    expect(fristText("2026-09-22", heute)).toMatchObject({ text: "22.09. · heute", bald: true });
    expect(fristText("2026-09-19", heute)).toMatchObject({ text: "19.09. · 3 Tage drüber", drueber: true });
  });
});
