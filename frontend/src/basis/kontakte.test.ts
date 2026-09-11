import { describe, expect, it } from "vitest";

import {
  anredezeile,
  ballText,
  gesuchtePersonen,
  letzterKontakt,
  offenerPunkt,
  passtKontakt,
  passtOrganisation,
  stufenrang,
  stufentitel,
  verlaufDerOrganisation,
  verlaufDerPersonen,
  wartenAufUns,
  zeigtLoseZeile,
  prioritaetsrang,
  sortiereOrganisationen,
  mailentwurf,
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
    anrede: "",
    funktion: "",
    email: "",
    telefon: "",
    organisation: 1,
    organisation_name: "Förderstelle",
    kennengelernt_auf: null,
    kennengelernt_auf_titel: "",
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
    stufe: "angebahnt",
    prioritaet: "offen",
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
      person(4, "D", { ball: "nichts" }),
    ];

    expect(wartenAufUns(kontakte)).toBe(2);
  });
});

describe("ballText", () => {
  it("beschriftet alle drei Stände", () => {
    expect(ballText("uns")).toBe("bei uns");
    expect(ballText("ihnen")).toBe("bei ihnen");
    expect(ballText("nichts")).toBe("nichts offen");
  });

  it("gibt einen unbekannten Wert unverändert zurück, statt ihn zu verschlucken", () => {
    expect(ballText("krumm")).toBe("krumm");
  });
});

describe("stufenrang", () => {
  it("zählt von der ersten Stufe an, nicht von null", () => {
    expect(stufenrang("erstkontakt")).toBe(1);
    expect(stufenrang("partner")).toBe(5);
  });

  it("ordnet die Stufen von fern nach nah", () => {
    const raenge = ["erstkontakt", "kennengelernt", "austausch", "angebahnt", "partner"].map(
      stufenrang,
    );

    expect(raenge).toEqual([...raenge].sort((a, b) => a - b));
  });

  it("gibt einer unbekannten Stufe keine Marke, statt sie ganz nach vorn zu stellen", () => {
    // „antrag" gab es bis zur Skala. Ein alter Wert soll die Leiter nicht füllen.
    expect(stufenrang("antrag")).toBe(0);
    expect(stufentitel("antrag")).toBe("antrag");
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

  it("stellt eine stehengebliebene Notiz hinter das, was wirklich läuft", () => {
    const kontakte = [
      person(1, "A", { ball: "nichts", offener_punkt: "Broschüre lag bei" }),
      person(2, "B", { ball: "ihnen", offener_punkt: "Wir warten auf den Bericht" }),
    ];

    expect(offenerPunkt(kontakte)).toEqual({ text: "Wir warten auf den Bericht", weitere: 1 });
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
    expect(passtKontakt(andrea, "", "nichts")).toBe(false);
    expect(passtKontakt(andrea, "", "alle")).toBe(true);
  });

  it("holt mit „nichts offen“ nur die, bei denen gerade nichts ansteht", () => {
    const ruhig = person(8, "Martin Haslinger", { ball: "nichts" });

    expect(passtKontakt(ruhig, "", "nichts")).toBe(true);
    expect(passtKontakt(ruhig, "", "ihnen")).toBe(false);
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

describe("zeigtLoseZeile", () => {
  const lose = [person(9, "Ohne Haus", { organisation: null, organisation_name: "" })];

  it("steht ungefiltert auch dann da, wenn es noch keine lose Person gibt", () => {
    // Sonst ist die Seite, auf der man die erste anlegt, nie erreichbar.
    expect(zeigtLoseZeile([], [], "", "alle")).toBe(true);
  });

  it("verschwindet bei gesetzter Suche oder gesetztem Ball, wenn keine da ist", () => {
    expect(zeigtLoseZeile([], [], "berger", "alle")).toBe(false);
    expect(zeigtLoseZeile([], [], "", "uns")).toBe(false);
  });

  it("folgt dem Filter, sobald es lose Personen gibt", () => {
    expect(zeigtLoseZeile(lose, lose, "ohne", "alle")).toBe(true);
    expect(zeigtLoseZeile(lose, [], "berger", "alle")).toBe(false);
  });
});

describe("gesuchtePersonen", () => {
  const belegschaft = [
    person(1, "Daniel Krautzer", { funktion: "Standortleitung" }),
    person(2, "Christian Rauch", { funktion: "" }),
    person(3, "Anna Berger", { funktion: "" }),
  ];

  it("bleibt leer, solange nichts gesucht wird", () => {
    // Sonst stünden unter jeder Organisation alle ihre Personen, und die
    // Übersicht wäre wieder die lange Liste, die sie nicht mehr sein soll.
    expect(gesuchtePersonen(belegschaft, "")).toEqual([]);
    expect(gesuchtePersonen(belegschaft, "   ")).toEqual([]);
  });

  it("nennt die Person, auf die die Suche zeigt", () => {
    expect(gesuchtePersonen(belegschaft, "rauch").map((k) => k.name)).toEqual([
      "Christian Rauch",
    ]);
  });

  it("findet auch über die Rolle", () => {
    expect(gesuchtePersonen(belegschaft, "standort").map((k) => k.name)).toEqual([
      "Daniel Krautzer",
    ]);
  });

  it("findet über die Mailadresse", () => {
    const mit = [person(4, "Sven Stegemann", { email: "sven@institut.example" })];
    expect(gesuchtePersonen(mit, "institut.example").map((k) => k.name)).toEqual([
      "Sven Stegemann",
    ]);
  });

  it("hängt nicht die ganze Belegschaft an, wenn die Organisation gepasst hat", () => {
    // Alle drei gehören zur „Förderstelle". Die Zeile steht wegen ihres
    // eigenen Namens da; jeden dort Beschäftigten darunterzuschreiben wäre
    // eine Antwort auf eine Frage, die niemand gestellt hat.
    expect(gesuchtePersonen(belegschaft, "Förderstelle")).toEqual([]);
  });
});

describe("sortiereOrganisationen", () => {
  const liste = [
    organisation({ id: 1, name: "Zeta", prioritaet: "mittel" }),
    organisation({ id: 2, name: "Alpha", prioritaet: "gering" }),
    organisation({ id: 3, name: "Beta", prioritaet: "hoch" }),
    organisation({ id: 4, name: "Gamma", prioritaet: "offen" }),
    organisation({ id: 5, name: "Delta", prioritaet: "hoch" }),
  ];
  const namen = (liste: Organisation[]) => liste.map((o) => o.name);

  it("stellt das Wichtigste nach oben", () => {
    expect(namen(sortiereOrganisationen(liste, { nach: "prioritaet", auf: true }))).toEqual([
      "Beta",
      "Delta",
      "Zeta",
      "Alpha",
      "Gamma",
    ]);
  });

  // Was niemand eingeschätzt hat, gehört nicht an die Spitze — auch nicht,
  // wenn man die Richtung umdreht.
  it("dreht die Richtung um", () => {
    expect(namen(sortiereOrganisationen(liste, { nach: "prioritaet", auf: false }))).toEqual([
      "Gamma",
      "Alpha",
      "Zeta",
      "Beta",
      "Delta",
    ]);
  });

  // Sonst stünden gleich wichtige Häuser bei jedem Neuladen anders.
  it("fällt bei Gleichstand auf den Namen zurück", () => {
    const gleich = sortiereOrganisationen(
      [
        organisation({ id: 1, name: "Zeta", prioritaet: "hoch" }),
        organisation({ id: 2, name: "Alpha", prioritaet: "hoch" }),
      ],
      { nach: "prioritaet", auf: false },
    );
    expect(namen(gleich)).toEqual(["Alpha", "Zeta"]);
  });

  it("sortiert nach Namen, auf und ab", () => {
    expect(namen(sortiereOrganisationen(liste, { nach: "name", auf: true }))).toEqual([
      "Alpha",
      "Beta",
      "Delta",
      "Gamma",
      "Zeta",
    ]);
    expect(namen(sortiereOrganisationen(liste, { nach: "name", auf: false }))[0]).toBe("Zeta");
  });

  it("lässt die übergebene Liste in Ruhe", () => {
    const vorher = namen(liste);
    sortiereOrganisationen(liste, { nach: "prioritaet", auf: true });
    expect(namen(liste)).toEqual(vorher);
  });

  // Ein Wert, den es einmal gab und nicht mehr gibt, darf die Liste nicht
  // anführen.
  it("stellt einen unbekannten Wert ganz nach hinten", () => {
    expect(prioritaetsrang("weissnicht")).toBeGreaterThan(prioritaetsrang("offen"));
    const mitAltem = sortiereOrganisationen(
      [
        organisation({ id: 1, name: "Alt", prioritaet: "weissnicht" as Organisation["prioritaet"] }),
        organisation({ id: 2, name: "Neu", prioritaet: "gering" }),
      ],
      { nach: "prioritaet", auf: true },
    );
    expect(namen(mitAltem)).toEqual(["Neu", "Alt"]);
  });
});

describe("Anrede und Mailentwurf", () => {
  it("spricht mit gepflegter Anrede förmlich und nur mit dem Nachnamen an", () => {
    expect(anredezeile(person(1, "Anna Muster", { anrede: "frau" }))).toBe(
      "Sehr geehrte Frau Muster,",
    );
    expect(anredezeile(person(2, "Karl Huber", { anrede: "herr" }))).toBe(
      "Sehr geehrter Herr Huber,",
    );
  });

  // Der Leerfall ist kein halb ausgefülltes Feld, sondern eine eigene,
  // vollständige Anrede — sonst stünde „Sehr geehrte/r " in der Mail.
  it("bleibt ohne Anrede neutral und nimmt den ganzen Namen", () => {
    expect(anredezeile(person(3, "Anna Muster"))).toBe("Guten Tag Anna Muster,");
  });

  it("verschluckt sich nicht an einem leeren oder einteiligen Namen", () => {
    expect(anredezeile(person(4, "   "))).toBe("Guten Tag,");
    expect(anredezeile(person(5, "  ", { anrede: "frau" }))).toBe("Guten Tag,");
    expect(anredezeile(person(6, "Muster", { anrede: "herr" }))).toBe("Sehr geehrter Herr Muster,");
  });

  // Mehrfache Leerzeichen sind beim Eintippen der Normalfall, nicht der
  // Sonderfall — „Frau  Muster" mit zwei Leerzeichen wäre in der Mail sichtbar.
  it("übersteht überzählige Leerzeichen im Namen", () => {
    expect(anredezeile(person(7, "  Anna   Muster  ", { anrede: "frau" }))).toBe(
      "Sehr geehrte Frau Muster,",
    );
  });

  it("baut eine mailto-Adresse mit kodierter Anrede und Platz für den ersten Satz", () => {
    const url = mailentwurf(
      person(8, "Anna Muster", { anrede: "frau", email: "anna@muster.at" }),
    );
    expect(url).toBe(
      "mailto:anna%40muster.at?body=Sehr%20geehrte%20Frau%20Muster%2C%0A%0A",
    );
  });
});
