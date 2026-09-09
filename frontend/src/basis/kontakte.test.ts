import { describe, expect, it } from "vitest";

import {
  letzterKontakt,
  offenerPunkt,
  passtKontakt,
  passtOrganisation,
  verlaufDerOrganisation,
  verlaufDerPersonen,
  wartenAufUns,
} from "./kontakte";
import type { Kontakt, Organisation, Verlaufseintrag } from "./daten";

function eintrag(id: number, datum: string, titel = `Eintrag ${id}`): Verlaufseintrag {
  return {
    id,
    kontakt: null,
    kontakt_name: "",
    organisation: null,
    organisation_name: "",
    event: null,
    event_titel: "",
    datum,
    art: "call",
    titel,
    text: "",
    wer_name: "Bernd",
  };
}

function person(id: number, name: string, teil: Partial<Kontakt> = {}): Kontakt {
  return {
    id,
    name,
    funktion: "",
    organisation: 1,
    organisation_name: "Förderstelle",
    ball: "ihnen",
    offener_punkt: "",
    letzter_kontakt: null,
    verlauf: [],
    ...teil,
  };
}

function organisation(teil: Partial<Organisation> = {}): Organisation {
  return {
    id: 1,
    name: "Förderstelle",
    kurz: "FÖR",
    typ: "Förderstelle",
    stufe: "antrag",
    nutzen: "",
    kontakte: [],
    verlauf: [],
    ...teil,
  };
}

describe("verlaufDerOrganisation", () => {
  it("führt Einträge an der Organisation und an ihren Personen in einen Strang", () => {
    const org = organisation({
      verlauf: [eintrag(1, "2026-08-01", "Antrag abgegeben")],
      kontakte: [person(7, "Andrea", { verlauf: [eintrag(2, "2026-09-01", "Rückfrage")] })],
    });

    expect(verlaufDerOrganisation(org).map((z) => [z.titel, z.wem])).toEqual([
      ["Rückfrage", "Andrea"],
      ["Antrag abgegeben", ""],
    ]);
  });

  it("sortiert neuestes zuerst, bei gleichem Datum den jüngeren Eintrag", () => {
    const org = organisation({
      verlauf: [eintrag(3, "2026-09-01"), eintrag(9, "2026-09-01"), eintrag(4, "2026-09-02")],
    });

    expect(verlaufDerOrganisation(org).map((z) => z.id)).toEqual([4, 9, 3]);
  });

  it("lässt die Quelllisten unangetastet", () => {
    const org = organisation({ verlauf: [eintrag(2, "2026-08-01"), eintrag(1, "2026-09-01")] });
    verlaufDerOrganisation(org);

    expect(org.verlauf.map((v) => v.id)).toEqual([2, 1]);
  });

  it("nimmt für lose Personen denselben Strang", () => {
    const zeilen = verlaufDerPersonen([
      person(7, "Andrea", { verlauf: [eintrag(1, "2026-07-01")] }),
      person(8, "Martin", { verlauf: [eintrag(2, "2026-09-01")] }),
    ]);

    expect(zeilen.map((z) => z.wem)).toEqual(["Martin", "Andrea"]);
  });
});

describe("letzterKontakt", () => {
  it("nimmt das jüngste Datum aus beiden Quellen", () => {
    const org = organisation({
      verlauf: [eintrag(1, "2026-08-01")],
      kontakte: [person(7, "Andrea", { verlauf: [eintrag(2, "2026-09-04")] })],
    });

    expect(letzterKontakt(org)).toBe("2026-09-04");
  });

  it("ist null, solange nichts eingetragen ist", () => {
    expect(letzterKontakt(organisation())).toBeNull();
  });
});

describe("wartenAufUns", () => {
  it("zählt nur die Personen, bei denen der Ball bei uns liegt", () => {
    const kontakte = [
      person(1, "A", { ball: "uns" }),
      person(2, "B", { ball: "ihnen" }),
      person(3, "C", { ball: "uns" }),
    ];

    expect(wartenAufUns(kontakte)).toBe(2);
  });
});

describe("offenerPunkt", () => {
  it("stellt nach vorn, was wir schulden, und zählt die übrigen", () => {
    const kontakte = [
      person(1, "A", { ball: "ihnen", offener_punkt: "Wir warten auf den Bericht" }),
      person(2, "B", { ball: "uns", offener_punkt: "Kostenplan nachreichen" }),
      person(3, "C", { ball: "uns", offener_punkt: "Termin bestätigen" }),
    ];

    expect(offenerPunkt(kontakte)).toEqual({ text: "Kostenplan nachreichen", weitere: 2 });
  });

  it("zeigt auch einen Punkt, auf den wir nur warten", () => {
    // Sonst sähe die Zeile leer aus, obwohl dort etwas läuft.
    const kontakte = [person(1, "A", { ball: "ihnen", offener_punkt: "Wir warten auf den Bericht" })];

    expect(offenerPunkt(kontakte)).toEqual({ text: "Wir warten auf den Bericht", weitere: 0 });
  });

  it("übergeht Personen ohne eingetragenen Punkt", () => {
    const kontakte = [
      person(1, "A", { ball: "uns", offener_punkt: "   " }),
      person(2, "B", { ball: "uns", offener_punkt: "Angebot anfordern" }),
    ];

    expect(offenerPunkt(kontakte)).toEqual({ text: "Angebot anfordern", weitere: 0 });
  });

  it("ist leer, wenn nichts offen ist", () => {
    expect(offenerPunkt([person(1, "A", { ball: "ihnen" })])).toEqual({ text: "", weitere: 0 });
  });
});

describe("passtKontakt", () => {
  const andrea = person(7, "Andrea Berger", {
    funktion: "Programmleitung",
    ball: "uns",
    offener_punkt: "Kostenplan",
  });

  it("filtert nach dem Ball", () => {
    expect(passtKontakt(andrea, "", "uns")).toBe(true);
    expect(passtKontakt(andrea, "", "ihnen")).toBe(false);
    expect(passtKontakt(andrea, "", "alle")).toBe(true);
  });

  it("sucht ohne Rücksicht auf Groß- und Kleinschreibung in Name, Rolle und Punkt", () => {
    expect(passtKontakt(andrea, "BERGER", "alle")).toBe(true);
    expect(passtKontakt(andrea, "programmleitung", "alle")).toBe(true);
    expect(passtKontakt(andrea, "kostenplan", "alle")).toBe(true);
    expect(passtKontakt(andrea, "Prüfstand", "alle")).toBe(false);
  });

  it("nimmt eine Suche aus lauter Leerzeichen als keine Suche", () => {
    expect(passtKontakt(andrea, "   ", "alle")).toBe(true);
  });
});

describe("passtOrganisation", () => {
  const org = organisation({
    name: "Institut für Biomechanik",
    typ: "Forschung",
    nutzen: "Stellt den Prüfstand",
    kontakte: [person(7, "Andrea Berger", { ball: "uns", funktion: "Programmleitung" })],
  });

  it("passt zum Ballfilter, wenn eine ihrer Personen ihn hat", () => {
    expect(passtOrganisation(org, "", "uns")).toBe(true);
    expect(passtOrganisation(org, "", "ihnen")).toBe(false);
  });

  it("fällt bei gesetztem Ballfilter heraus, solange sie keine Person hat", () => {
    const ohne = organisation({ kontakte: [] });

    expect(passtOrganisation(ohne, "", "uns")).toBe(false);
    expect(passtOrganisation(ohne, "", "alle")).toBe(true);
  });

  it("findet sie über ihren eigenen Text", () => {
    expect(passtOrganisation(org, "biomechanik", "alle")).toBe(true);
    expect(passtOrganisation(org, "prüfstand", "alle")).toBe(true);
    expect(passtOrganisation(org, "Forschung", "alle")).toBe(true);
  });

  it("findet sie über eine Person darin", () => {
    expect(passtOrganisation(org, "Berger", "alle")).toBe(true);
    expect(passtOrganisation(org, "Haslinger", "alle")).toBe(false);
  });

  it("prüft Suche und Ball unabhängig voneinander", () => {
    // Der Ball schließt aus, obwohl der Name passt.
    expect(passtOrganisation(org, "Biomechanik", "ihnen")).toBe(false);
  });
});
