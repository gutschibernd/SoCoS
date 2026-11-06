/**
 * Die Förderplanung: wohin eine Zeile gehört, wie gereiht wird, welche Balken
 * sie hat und was beim Ziehen gespeichert wird.
 */

import { describe, expect, it } from "vitest";

import type { Foerderantrag, Foerderprogramm } from "./daten";
import { balken, foerdername, gezogeneDaten, gruppiert, hintenAn, neueReihung, type Planzeile } from "./foerderplanung";

function antrag(teil: Partial<Foerderantrag> & { id: number }): Foerderantrag {
  return {
    stand: "entwurf",
    prioritaet: null,
    schreiben_ab: null,
    einreichung: null,
    entscheidung: null,
    beginn: null,
    ende: null,
    vermerk: "",
    titel: `Antrag ${teil.id}`,
    ...teil,
  } as Foerderantrag;
}

const programm = { id: 1, geber: 1, name: "Preseed", max_monate: 12, antraege: [] } as unknown as Foerderprogramm;
const zeile = (a: Foerderantrag, name = `F${a.id}`): Planzeile => ({ antrag: a, programm, name });

describe("der Name einer Förderung", () => {
  it("setzt das Kürzel des Gebers davor", () => {
    expect(foerdername({ name: "Preseed" }, { kurz: "aws", name: "Austria Wirtschaftsservice" })).toBe("aws Preseed");
  });
  it("doppelt es nicht, wenn es schon im Namen steht", () => {
    expect(foerdername({ name: "FFG Basisprogramm" }, { kurz: "FFG", name: "FFG" })).toBe("FFG Basisprogramm");
  });
  it("erkennt das Kürzel am ersten Wort", () => {
    expect(foerdername({ name: "Pflegeinnovation NÖ" }, { kurz: "Pflege NÖ", name: "Land NÖ" })).toBe("Pflegeinnovation NÖ");
  });
  it("nimmt den Namen, wenn es kein Kürzel gibt", () => {
    expect(foerdername({ name: "Innovation" }, { kurz: "", name: "Wirtschaftsagentur Wien" })).toBe(
      "Wirtschaftsagentur Wien Innovation",
    );
  });
});

describe("die Gruppen", () => {
  it("reiht den Fokus nach Priorität, die übrigen nach Termin, Vorbei zuletzt", () => {
    const { fokus, weitere, vorbei } = gruppiert([
      zeile(antrag({ id: 1, prioritaet: 2 })),
      zeile(antrag({ id: 2, prioritaet: 1 })),
      zeile(antrag({ id: 3, einreichung: "2027-03-01" })),
      zeile(antrag({ id: 4 })),
      zeile(antrag({ id: 5, schreiben_ab: "2026-12-01", einreichung: "2027-04-01" })),
      zeile(antrag({ id: 6, stand: "abgelehnt", prioritaet: 1, entscheidung: "2026-11-06" })),
      zeile(antrag({ id: 7, stand: "verfallen", einreichung: "2026-11-05" })),
      zeile(antrag({ id: 8, stand: "bewilligt", beginn: "2026-01-01" })),
    ]);
    expect(fokus.map((z) => z.antrag.id)).toEqual([2, 1]);
    // Ohne jedes Datum ganz hinten; bewilligt gehört noch dazu, es läuft.
    expect(weitere.map((z) => z.antrag.id)).toEqual([8, 5, 3, 4]);
    // Abgelehnt verlässt den Fokus, auch mit Priorität; das Jüngste zuerst.
    expect(vorbei.map((z) => z.antrag.id)).toEqual([6, 7]);
  });
});

describe("die Reihung im Fokus", () => {
  const fokus = [
    { id: 10, prioritaet: 1 },
    { id: 11, prioritaet: 2 },
    { id: 12, prioritaet: 5 },
  ];
  it("tauscht mit dem Nachbarn und nummeriert durch", () => {
    expect(neueReihung(fokus, 12, -1)).toEqual(
      new Map([
        [12, 2],
        [11, 3],
      ]),
    );
  });
  it("nimmt einen heraus und rückt die übrigen nach", () => {
    expect(neueReihung(fokus, 10, null)).toEqual(
      new Map<number, number | null>([
        [10, null],
        [11, 1],
        [12, 2],
      ]),
    );
  });
  it("tut am Rand nichts", () => {
    expect(neueReihung(fokus, 10, -1).size).toBe(0);
    expect(neueReihung(fokus, 12, 1).size).toBe(0);
  });
  it("hängt Neues hinten an", () => {
    expect(hintenAn(fokus)).toBe(6);
    expect(hintenAn([])).toBe(1);
  });
});

describe("die Balken", () => {
  it("zeichnet nur Abschnitte mit beiden Enden", () => {
    expect(balken(antrag({ id: 1, einreichung: "2026-10-01" }), programm)).toEqual([]);
    expect(
      balken(antrag({ id: 1, schreiben_ab: "2026-08-01", einreichung: "2026-10-01", entscheidung: "2026-11-06" }), programm).map(
        (b) => b.art,
      ),
    ).toEqual(["schreiben", "pruefung"]);
  });
  it("nimmt ohne Ende die Höchstlaufzeit des Programms an", () => {
    expect(balken(antrag({ id: 1, beginn: "2027-03-01" }), programm)).toEqual([
      { art: "laufzeit", spanne: { von: "2027-03-01", bis: "2028-02-29" }, angenommen: true },
    ]);
    expect(balken(antrag({ id: 1, beginn: "2027-03-01" }), { max_monate: null })[0].spanne.bis).toBe("2028-02-29");
    expect(balken(antrag({ id: 1, beginn: "2027-03-01", ende: "2027-08-31" }), programm)[0]).toEqual({
      art: "laufzeit",
      spanne: { von: "2027-03-01", bis: "2027-08-31" },
      angenommen: undefined,
    });
  });
});

describe("was ein gezogener Balken speichert", () => {
  const a = antrag({
    id: 1,
    schreiben_ab: "2026-08-01",
    einreichung: "2026-10-01",
    entscheidung: "2026-11-06",
    beginn: "2027-03-01",
  });
  it("verschiebt als Ganzes die ganze Zeile", () => {
    expect(
      gezogeneDaten(a, "laufzeit", { von: "2027-03-01", bis: "2028-02-29" }, { von: "2027-03-11", bis: "2028-03-10" }),
    ).toEqual({ schreiben_ab: "2026-08-11", einreichung: "2026-10-11", entscheidung: "2026-11-16", beginn: "2027-03-11" });
  });
  it("ändert am Rand nur das eine Datum", () => {
    expect(
      gezogeneDaten(a, "pruefung", { von: "2026-10-01", bis: "2026-11-06" }, { von: "2026-10-01", bis: "2026-12-01" }),
    ).toEqual({ entscheidung: "2026-12-01" });
    expect(
      gezogeneDaten(a, "schreiben", { von: "2026-08-01", bis: "2026-10-01" }, { von: "2026-07-01", bis: "2026-10-01" }),
    ).toEqual({ schreiben_ab: "2026-07-01" });
  });
  it("speichert nichts, wenn nichts gewandert ist", () => {
    expect(gezogeneDaten(a, "schreiben", { von: "2026-08-01", bis: "2026-10-01" }, { von: "2026-08-01", bis: "2026-10-01" })).toEqual({});
  });
});
