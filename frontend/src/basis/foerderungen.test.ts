import { describe, expect, it } from "vitest";

import type { Foerderantrag, Foerderfrage, Foerderprogramm } from "./daten";
import {
  ausCent,
  bedarfDazu,
  bedarfUmschalten,
  bedarfspunkte,
  fragenSortiert,
  fragenStand,
  geldlage,
  gezogen,
  inCent,
  monatsanzahl,
  monatsname,
  neuePaketmonate,
  spanne,
  steckbriefpunkte,
} from "./foerderungen";
import { antragAusWeg, themaAusWeg } from "./module";

const antrag = (teil: Partial<Foerderantrag> = {}) => ({ laufzeit: 0, ...teil }) as Foerderantrag;
const programm = (teil: Partial<Foerderprogramm> = {}) => ({ max_monate: 24, ...teil }) as Foerderprogramm;
const frage = (id: number, antwort: string, reihenfolge = id) =>
  ({ id, antwort, reihenfolge, frage: `F${id}` }) as Foerderfrage;

describe("Geld in Cent", () => {
  it("liest und schreibt Beträge ohne Gleitkomma", () => {
    expect(inCent("12345.67")).toBe(1234567);
    expect(inCent("50000")).toBe(5000000);
    expect(inCent("0.1")).toBe(10);
    expect(ausCent(1234567)).toBe("12345.67");
    expect(ausCent(-105)).toBe("-1.05");
  });

  it("vergleicht die Summe mit der Grenze", () => {
    expect(geldlage("38500.00", "50000.00")).toEqual({ anteil: 77, frei: "11500.00", ueber: false });
    expect(geldlage("50000.01", "50000.00")).toEqual({ anteil: 100, frei: "-0.01", ueber: true });
    expect(geldlage("50000.00", "50000.00").ueber).toBe(false);
    expect(geldlage("100.00", null)).toEqual({ anteil: 0, frei: null, ueber: false });
  });
});

describe("die Zeitleiste", () => {
  it("zeigt die erlaubte Laufzeit, aber nie weniger als belegt", () => {
    expect(monatsanzahl(antrag({ laufzeit: 18 }), programm())).toBe(24);
    expect(monatsanzahl(antrag({ laufzeit: 30 }), programm())).toBe(30);
    expect(monatsanzahl(antrag(), programm({ max_monate: null }))).toBe(12);
  });

  it("nennt Projektmonate, mit Beginn Kalendermonate", () => {
    expect(monatsname(3, null)).toBe("M3");
    expect(monatsname(1, "2027-01-15")).toBe("Jän 27");
    expect(monatsname(13, "2026-12-01")).toBe("Dez 27");
    expect(spanne(1, 3, null)).toBe("M1–M3");
    expect(spanne(4, 4, null)).toBe("M4");
    expect(spanne(1, 3, "2027-01-01")).toBe("Jän 27 – Mär 27");
  });

  it("verschiebt einen Balken ganz und bleibt in der Achse", () => {
    expect(gezogen({ von: 3, bis: 5 }, "mitte", 2, 24)).toEqual({ von: 5, bis: 7 });
    expect(gezogen({ von: 3, bis: 5 }, "mitte", -9, 24)).toEqual({ von: 1, bis: 3 });
    expect(gezogen({ von: 20, bis: 23 }, "mitte", 5, 24)).toEqual({ von: 21, bis: 24 });
  });

  it("zieht einen Rand nie über den anderen", () => {
    expect(gezogen({ von: 3, bis: 5 }, "anfang", 4, 24)).toEqual({ von: 5, bis: 5 });
    expect(gezogen({ von: 3, bis: 5 }, "ende", -4, 24)).toEqual({ von: 3, bis: 3 });
    expect(gezogen({ von: 3, bis: 5 }, "ende", 40, 24)).toEqual({ von: 3, bis: 24 });
  });

  it("setzt ein neues Paket hinter das Geplante", () => {
    expect(neuePaketmonate(antrag({ laufzeit: 6 }), 24)).toEqual({ von: 7, bis: 9 });
    expect(neuePaketmonate(antrag(), 24)).toEqual({ von: 1, bis: 3 });
    expect(neuePaketmonate(antrag({ laufzeit: 24 }), 24)).toEqual({ von: 24, bis: 24 });
  });
});

describe("Listen aus Text", () => {
  it("teilt den Steckbrief in Begriff und Erklärung", () => {
    expect(steckbriefpunkte("Höhe: höchstens 50.000 €\n\nnur Text\nLaufzeit: 2 Jahre: ab Zusage")).toEqual([
      { begriff: "Höhe", text: "höchstens 50.000 €" },
      { begriff: "", text: "nur Text" },
      { begriff: "Laufzeit", text: "2 Jahre: ab Zusage" },
    ]);
  });

  it("hakt ab und öffnet wieder", () => {
    const text = "Medikamentenmenge\n✓ Muster der Dosetten\nPersonalkosten";
    expect(bedarfspunkte(text).map((p) => p.da)).toEqual([false, true, false]);
    expect(bedarfUmschalten(text, 0)).toBe("✓ Medikamentenmenge\n✓ Muster der Dosetten\nPersonalkosten");
    expect(bedarfUmschalten(text, 1)).toBe("Medikamentenmenge\nMuster der Dosetten\nPersonalkosten");
    expect(bedarfDazu("", " Zeitaufwand ")).toBe("Zeitaufwand");
    expect(bedarfDazu(text, "Neu")).toBe(`${text}\nNeu`);
  });
});

describe("Fragen an die Förderstelle", () => {
  it("stellt offene vor beantwortete", () => {
    const fragen = [frage(1, "ja"), frage(2, ""), frage(3, " "), frage(4, "nein")];
    expect(fragenSortiert(fragen).map((f) => f.id)).toEqual([2, 3, 1, 4]);
    expect(fragenStand(fragen)).toBe("2 offen");
    expect(fragenStand([frage(1, "ja")])).toBe("alle beantwortet");
    expect(fragenStand([])).toBe("noch keine");
  });
});

describe("der Weg zu einem Antrag", () => {
  it("findet den Antrag und verwechselt ihn nicht mit einem Thema", () => {
    expect(antragAusWeg("foerderungen/12")?.id).toBe(12);
    expect(antragAusWeg("praktikum/12")).toBeNull();
    expect(themaAusWeg("foerderungen/12")).toBeNull();
    expect(antragAusWeg("foerderungen")).toBeNull();
  });
});
