import { describe, expect, it } from "vitest";

import type { Paket, Pensum, Projekt, Teammitglied, Unteraufgabe } from "./daten";
import { praktikantAusWeg } from "./module";
import {
  offenePhasen,
  praktikanten,
  straengeVon,
  stundenAnteil,
  stundenAusEingabe,
  stundenText,
  stundenZumBearbeiten,
  todoStand,
} from "./straenge";

const NIKI = 7;
const KARLA = 8;

function pensum(id: number, paket: number, person: number, strang: Pensum["strang"], stunden = "100.00", sekunden = 0): Pensum {
  return { id, paket, person, person_name: "", stunden, gebuchte_sekunden: sekunden, strang };
}

function todo(id: number, paket: number, titel: string, erledigt = false, verantwortlich: number | null = null, reihenfolge = id): Unteraufgabe {
  return { id, paket, titel, erledigt, reihenfolge, von: null, bis: null, stunden: null, verantwortlich };
}

function paket(id: number, titel: string, pensen: Pensum[], unteraufgaben: Unteraufgabe[] = []): Paket {
  return {
    id, phase: 1, projekt: 1, titel, beschreibung: "", status: "offen", gebuchte_sekunden: 0, pensum_stunden: "0",
    fortschritt: null, unteraufgaben, pensen, buchbar: true, grund_gegen_buchung: "", reihenfolge: id, foerderpaket: null,
  };
}

function projekt(pakete: Paket[], stand: "offen" | "abgeschlossen" = "offen"): Projekt {
  return {
    id: 1, titel: "Praktikum 2027", untertitel: "", farbe: "", gebuchte_sekunden: 0, ist_auffang: false,
    phasen: [{ id: 1, projekt: 1, titel: "Sommer", art: "dev", von: null, bis: null, stand, foerderantrag: null, reihenfolge: 0, pakete }],
  };
}

const mitglied = (id: number, name: string): Teammitglied => ({
  id, name, initialen: name.slice(0, 2).toUpperCase(), farbe: "", funktion: "", email: "", is_active: true, rolle: "bearbeiter",
});

describe("die Stränge einer Person", () => {
  const projekte = [
    projekt([
      paket(1, "Social Media", [pensum(1, 1, NIKI, "neben")]),
      paket(2, "Usability-Tests", [pensum(2, 2, NIKI, "haupt"), pensum(3, 2, KARLA, "neben")], [
        todo(10, 2, "Fragebogen", true, NIKI, 2),
        todo(11, 2, "Testplan", false, null, 1),
        todo(12, 2, "Karlas Auswertung", false, KARLA, 3),
      ]),
      // Ein gewöhnliches Pensum ist kein Strang.
      paket(3, "Overhead", [pensum(4, 3, NIKI, "")]),
    ]),
  ];

  it("stellt den Hauptstrang vor die Nebenstränge", () => {
    expect(straengeVon(projekte, NIKI).map((s) => [s.art, s.paket.titel])).toEqual([
      ["haupt", "Usability-Tests"],
      ["neben", "Social Media"],
    ]);
  });

  it("zeigt die eigenen und die gemeinsamen To-Dos, nicht die des anderen — in ihrer Reihenfolge", () => {
    const [haupt] = straengeVon(projekte, NIKI);
    expect(haupt.todos.map((t) => t.titel)).toEqual(["Testplan", "Fragebogen"]);
    expect(todoStand(haupt)).toEqual({ erledigt: 1, gesamt: 2 });
    const [karla] = straengeVon(projekte, KARLA);
    expect(karla.todos.map((t) => t.titel)).toEqual(["Testplan", "Karlas Auswertung"]);
  });

  it("zählt als Praktikant, wer einen Strang hat — nach Namen", () => {
    const team = [mitglied(1, "Bernd"), mitglied(KARLA, "Karla"), mitglied(NIKI, "Niki")];
    expect(praktikanten(projekte, team).map((p) => p.name)).toEqual(["Karla", "Niki"]);
  });
});

describe("Stunden", () => {
  const strang = (stunden: string, sekunden: number) =>
    straengeVon([projekt([paket(1, "X", [pensum(1, 1, NIKI, "haupt", stunden, sekunden)])])], NIKI)[0];

  it("gebucht gegen das Pensum, ohne Pensum nur gebucht", () => {
    expect(stundenText(strang("300.00", 12 * 3600))).toBe("12 von 300 h");
    expect(stundenText(strang("0.00", 5 * 3600))).toBe("5 h");
  });

  it("der Anteil ist gekappt und fehlt ohne Pensum", () => {
    expect(stundenAnteil(strang("100.00", 25 * 3600))).toBe(0.25);
    expect(stundenAnteil(strang("10.00", 30 * 3600))).toBe(1);
    expect(stundenAnteil(strang("0.00", 3600))).toBeNull();
  });

  it("liest die Eingabe als Decimal-Zeichenkette", () => {
    expect(stundenAusEingabe("300")).toBe("300.00");
    expect(stundenAusEingabe("12,5")).toBe("12.50");
    expect(stundenAusEingabe("")).toBe("0.00");
    expect(stundenAusEingabe("viel")).toBeNull();
    expect(stundenAusEingabe("1.234,5")).toBeNull();
    expect(stundenZumBearbeiten("12.50")).toBe("12,5");
    expect(stundenZumBearbeiten("0.00")).toBe("");
  });
});

describe("Wege und Phasen", () => {
  it("liest die Person aus dem Weg", () => {
    expect(praktikantAusWeg("praktikum-aufgaben/7")).toBe(7);
    expect(praktikantAusWeg("praktikum-aufgaben")).toBeNull();
    expect(praktikantAusWeg("praktikum/7")).toBeNull();
    expect(praktikantAusWeg(null)).toBeNull();
  });

  it("bietet für ein neues Paket nur Phasen an, die nicht abgeschlossen sind", () => {
    expect(offenePhasen([projekt([])])).toEqual([{ id: 1, titel: "Praktikum 2027 · Sommer" }]);
    expect(offenePhasen([projekt([], "abgeschlossen")])).toEqual([]);
  });
});
