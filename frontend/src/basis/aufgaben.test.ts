import { describe, expect, it } from "vitest";

import { ideen, naechstePrioritaet, sortiere, spalten } from "./aufgaben";
import type { Aufgabe, Teammitglied } from "./daten";

function aufgabe(teil: Partial<Aufgabe> & { id: number }): Aufgabe {
  return {
    text: `Aufgabe ${teil.id}`,
    person: null,
    person_name: "",
    prioritaet: "mittel",
    erledigt: false,
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

describe("Priorität weiterdrehen", () => {
  it("dreht nach oben: mittel → hoch", () => {
    expect(naechstePrioritaet("mittel")).toBe("hoch");
  });

  it("läuft von oben wieder unten herum", () => {
    expect(naechstePrioritaet("hoch")).toBe("gering");
    expect(naechstePrioritaet("gering")).toBe("mittel");
  });

  it("ist nach drei Tipps wieder dort, wo sie war", () => {
    const start = "mittel";
    const rund = naechstePrioritaet(naechstePrioritaet(naechstePrioritaet(start)));
    expect(rund).toBe(start);
  });

  it("landet bei einem unbekannten Wert nicht im Nichts", () => {
    expect(naechstePrioritaet("erfunden")).toBe("gering");
  });
});

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

  it("sortiert nicht in der übergebenen Liste", () => {
    const liste = [aufgabe({ id: 1, prioritaet: "gering" }), aufgabe({ id: 2, prioritaet: "hoch" })];
    sortiere(liste);
    expect(liste.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("Spalten", () => {
  const team = [
    mitglied({ id: 1, name: "Anna Beispiel" }),
    mitglied({ id: 2, name: "Bernd Beispiel" }),
    mitglied({ id: 3, name: "Florian Beispiel" }),
  ];

  it("beginnt mit Allgemein und stellt mich dahinter", () => {
    const spaltenliste = spalten([], team, 3);
    expect(spaltenliste.map((s) => s.titel)).toEqual([
      "Allgemein",
      "Florian Beispiel",
      "Anna Beispiel",
      "Bernd Beispiel",
    ]);
    expect(spaltenliste[0].person).toBeNull();
  });

  it("legt jede Aufgabe in genau eine Spalte", () => {
    const liste = [
      aufgabe({ id: 1 }),
      aufgabe({ id: 2, person: 2 }),
      aufgabe({ id: 3, person: 2, erledigt: true }),
    ];
    const spaltenliste = spalten(liste, team, 2);
    expect(spaltenliste[0].offen.map((a) => a.id)).toEqual([1]);
    expect(spaltenliste[1].offen.map((a) => a.id)).toEqual([2]);
    expect(spaltenliste[1].erledigt.map((a) => a.id)).toEqual([3]);
  });

  it("lässt stillgelegte Konten weg — außer sie haben noch Aufgaben", () => {
    const mitStillgelegtem = [...team, mitglied({ id: 4, name: "Zita Ehemalig", is_active: false })];
    expect(spalten([], mitStillgelegtem, 2)).toHaveLength(4);

    const mitOffenem = spalten([aufgabe({ id: 9, person: 4 })], mitStillgelegtem, 2);
    expect(mitOffenem.map((s) => s.titel)).toContain("Zita Ehemalig");
  });

  it("zeigt Erledigtes mit dem zuletzt Abgehakten oben", () => {
    const liste = [
      aufgabe({ id: 1, erledigt: true, geaendert_am: "2026-09-01T08:00:00Z" }),
      aufgabe({ id: 2, erledigt: true, geaendert_am: "2026-09-05T08:00:00Z" }),
    ];
    expect(spalten(liste, team, 2)[0].erledigt.map((a) => a.id)).toEqual([2, 1]);
  });
});

describe("Ideenliste", () => {
  it("trennt die Ideen von der Tafel — in beide Richtungen", () => {
    /* Der Fehler, den dieser Test fangen soll: Tafel und Ideenliste kommen aus
       **einer** Antwort. Fehlte der Filter an einer der beiden Stellen, sähe
       eine Idee auf der Tafel aus wie jede andere Zeile — und niemand fände
       den Grund. */
    const liste = [
      aufgabe({ id: 1 }),
      aufgabe({ id: 2, ist_idee: true }),
      aufgabe({ id: 3, person: 2 }),
    ];
    const team = [mitglied({ id: 2, name: "Anna Berger" })];

    const tafel = spalten(liste, team, 2);
    expect(tafel.flatMap((s) => s.offen).map((a) => a.id)).toEqual([1, 3]);
    expect(ideen(liste).offen.map((a) => a.id)).toEqual([2]);
  });

  it("sortiert wie die Tafel: Hohes zuerst", () => {
    const liste = [
      aufgabe({ id: 1, ist_idee: true, prioritaet: "gering" }),
      aufgabe({ id: 2, ist_idee: true, prioritaet: "hoch" }),
    ];
    expect(ideen(liste).offen.map((a) => a.id)).toEqual([2, 1]);
  });

  it("legt Abgehaktes unter „Vom Tisch“, zuletzt Angefasstes oben", () => {
    const liste = [
      aufgabe({ id: 1, ist_idee: true, erledigt: true, geaendert_am: "2026-09-01T08:00:00Z" }),
      aufgabe({ id: 2, ist_idee: true, erledigt: true, geaendert_am: "2026-09-05T08:00:00Z" }),
      aufgabe({ id: 3, ist_idee: true }),
    ];
    const { offen, vomTisch } = ideen(liste);
    expect(offen.map((a) => a.id)).toEqual([3]);
    expect(vomTisch.map((a) => a.id)).toEqual([2, 1]);
  });
});
