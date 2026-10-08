import { describe, expect, it } from "vitest";

import type { Foerderantrag, Foerderfrage, Foerdergeber, Foerderpaket, Foerderprogramm } from "./daten";
import {
  alsProzent,
  alsStunden,
  antwortErgaenzen,
  ausCent,
  bedarfDazu,
  bedarfUmschalten,
  bedarfspunkte,
  fragenSortiert,
  fragenStand,
  geldlage,
  gezogen,
  inCent,
  istAufgeschluesselt,
  monatsanzahl,
  achsengrenzen,
  monatsname,
  neuePaketmonate,
  offeneFragenDerOrganisation,
  paketsumme,
  projektinhalt,
  spanne,
  steckbriefpunkte,
  telefonatQuelle,
  telefonatText,
} from "./foerderungen";
import { alsEuro, foerderauslastungAusWeg, foerderungAusWeg, themaAusWeg } from "./module";

const antrag = (teil: Partial<Foerderantrag> = {}) => ({ laufzeit: 0, ...teil }) as Foerderantrag;
const programm = (teil: Partial<Foerderprogramm> = {}) => ({ max_monate: 24, ...teil }) as Foerderprogramm;
const frage = (id: number, beantwortet: boolean, reihenfolge = id) =>
  ({ id, beantwortet, antwort: "", reihenfolge, frage: `F${id}` }) as Foerderfrage;

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

  it("nimmt die eingestellte Achse zwischen Paketende und Programm", () => {
    expect(monatsanzahl(antrag({ zeitachse: 20, laufzeit: 18 }), programm())).toBe(20);
    expect(monatsanzahl(antrag({ zeitachse: 36, laufzeit: 18 }), programm())).toBe(24);
    expect(monatsanzahl(antrag({ zeitachse: 12, laufzeit: 20 }), programm())).toBe(20);
    expect(monatsanzahl(antrag({ zeitachse: 12, laufzeit: 30 }), programm())).toBe(30);
    expect(achsengrenzen(antrag({ laufzeit: 0 }), programm())).toEqual({ kuerzeste: 1, laengste: 24 });
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
    const fragen = [frage(1, true), frage(2, false), frage(3, false), frage(4, true)];
    expect(fragenSortiert(fragen).map((f) => f.id)).toEqual([2, 3, 1, 4]);
    expect(fragenStand(fragen)).toBe("2 offen");
    expect(fragenStand([frage(1, true)])).toBe("alle beantwortet");
    expect(fragenStand([])).toBe("noch keine");
  });
});

describe("das Telefonat mit der Förderstelle", () => {
  it("sammelt die offenen Fragen der Programme, deren Geber an der Organisation hängt", () => {
    const geber = [
      { id: 1, organisation: 7 },
      { id: 2, organisation: null },
    ] as Foerdergeber[];
    const programme = [
      { id: 10, geber: 1, fragen: [frage(1, true), frage(2, false)] },
      { id: 11, geber: 1, fragen: [frage(3, true)] },
      { id: 12, geber: 2, fragen: [frage(4, false)] },
    ] as Foerderprogramm[];
    const gruppen = offeneFragenDerOrganisation(7, geber, programme);
    expect(gruppen.map((g) => [g.programm.id, g.fragen.map((f) => f.id)])).toEqual([[10, [2]]]);
    expect(offeneFragenDerOrganisation(8, geber, programme)).toEqual([]);
  });

  it("schreibt Antworten und das offen Gebliebene in den Verlauf", () => {
    const fragen = [frage(1, false), frage(2, false), frage(3, false)];
    expect(telefonatText(fragen, { 1: " Ja, bis 2027 ", 2: "  " })).toBe(
      "F1\n→ Ja, bis 2027\n\nOffen geblieben:\n– F2\n– F3",
    );
    expect(telefonatText(fragen.slice(0, 1), { 1: "Nein" })).toBe("F1\n→ Nein");
  });

  it("hängt die Antwort an, statt zu überschreiben", () => {
    expect(antwortErgaenzen("Laut Richtlinie: 2 Jahre. ", " Start 2027 geht ", "Telefonat 06.10.2026")).toBe(
      "Laut Richtlinie: 2 Jahre.\n\nTelefonat 06.10.2026: Start 2027 geht",
    );
    expect(antwortErgaenzen("  ", "Ja", "Telefonat 06.10.2026")).toBe("Ja");
  });

  it("nennt Datum und Person als Quelle", () => {
    expect(telefonatQuelle("2026-10-06", "Anna Muster")).toBe("Telefonat 06.10.2026 · Anna Muster");
    expect(telefonatQuelle("2026-10-06", "")).toBe("Telefonat 06.10.2026");
  });
});

describe("der Weg zu einem Antrag", () => {
  it("findet Fördergeber, Programm und Antrag und verwechselt sie nicht mit einem Thema", () => {
    expect(foerderungAusWeg("foerderungen/2")).toMatchObject({ geber: 2, programm: null, antrag: null });
    expect(foerderungAusWeg("foerderungen/2/4")).toMatchObject({ geber: 2, programm: 4, antrag: null });
    expect(foerderungAusWeg("foerderungen/2/4/12")).toMatchObject({ geber: 2, programm: 4, antrag: 12 });
    expect(foerderungAusWeg("praktikum/12")).toBeNull();
    expect(foerderungAusWeg("foerderungen/2/4/12/1")).toBeNull();
    // Die Auslastung ist kein Fördergeber, und kein Fördergeber heißt „auslastung".
    expect(foerderungAusWeg("foerderungen/auslastung")).toBeNull();
    expect(foerderauslastungAusWeg("foerderungen/auslastung")).not.toBeNull();
    expect(foerderauslastungAusWeg("foerderungen/2")).toBeNull();
    expect(themaAusWeg("foerderungen/12")).toBeNull();
    expect(foerderungAusWeg("foerderungen")).toBeNull();
  });
});

describe("der Projektinhalt zum Kopieren", () => {
  const paket = (id: number, teil: Partial<Foerderpaket>) =>
    ({
      id, titel: `P${id}`, ziel: "", ergebnis: "", betrag: null, reihenfolge: id, von: 1, bis: 1,
      stunden: [], kosten: { stunden: "0.00", personal: "0.00", sach: "0.00", gesamt: "0.00" }, ...teil,
    }) as Foerderpaket;
  const voll = antrag({
    titel: "Dosetten digital",
    nummer: 2,
    stand: "entwurf",
    foerderwerber: "Sopharmis",
    rolle: "foerderwerber",
    stunden_sind_geld: true,
    beginn: "2027-01-01",
    beschreibung: "Worum es geht.",
    abschnitte: [
      { id: 7, antrag: 1, titel: "Nutzen für Pflege und Betreuung", text: "", reihenfolge: 0 },
      { id: 8, antrag: 1, titel: "Kostenprognose Regelbetrieb", text: "Trägt sich.", reihenfolge: 1 },
    ],
    datenbedarf: "✓ Muster\nPersonalkosten",
    laufzeit: 4,
    summe: "30000.00",
    stundensatz: null,
    gemeinkosten: null,
    foerderquote: null,
    posten: [],
    zeichen: { titel: 100, beschreibung: 1000 },
    reife: [{ schluessel: "x", text: "Titel gesetzt", erfuellt: true, hinweis: "" }],
    // Absichtlich verkehrt herum — die Reihenfolge entscheidet, nicht die Liste.
    pakete: [
      paket(2, {
        titel: "Pilot", von: 3, bis: 4, betrag: "30000.00", reihenfolge: 2,
        kosten: { stunden: "0.00", personal: "0.00", sach: "0.00", gesamt: "30000.00" },
      }),
      paket(1, { titel: "Konzept", von: 1, bis: 2, ziel: "Plan steht", reihenfolge: 1 }),
    ],
  });
  const prog = programm({
    name: "Pflegeinnovation",
    stelle: "",
    link: "",
    max_monate: 4,
    max_foerderung: "50000.00",
    steckbrief: "Höhe: höchstens 50.000 €",
    fragen: [frage(1, true), frage(2, false)],
  });
  const geber = { id: 1, name: "Land Niederösterreich", kurz: "NÖ" } as Foerdergeber;
  const text = projektinhalt(voll, prog, geber);

  it("nennt Eckdaten, Richtlinie und Texte — leere ausdrücklich", () => {
    expect(text).toMatch(/^# Förderantrag: Dosetten digital\n/);
    expect(text).toContain("- **Fördergeber:** Land Niederösterreich (NÖ)");
    expect(text).toContain("- **Antrag:** Nr. 2 · Stand: Entwurf");
    expect(text).toContain("- **Höhe:** höchstens 50.000 €");
    expect(text).toContain("## Beschreibung des Vorhabens\n\nWorum es geht.");
    expect(text).toContain("## Nutzen für Pflege und Betreuung\n\n_(noch leer)_");
    expect(text).toContain("## Kostenprognose Regelbetrieb\n\nTrägt sich.");
  });

  it("stellt die Arbeitspakete in ihrer Reihenfolge mit Monaten dar", () => {
    expect(text.indexOf("### AP1 · Konzept")).toBeLessThan(text.indexOf("### AP2 · Pilot"));
    expect(text).toContain("- **Zeitraum:** M3–M4 (Mär 27 – Apr 27)");
    expect(text).toContain("- **Ziel:** Plan steht");
    expect(text).toContain("- **Kosten:** noch offen");
    expect(text).toContain(`- **Kosten:** ${alsEuro("30000.00")}`);
    expect(text).not.toContain("## Kalkulation");
    expect(text).toContain("```\n      M1 M2 M3 M4\nAP1   ██ ██ ·· ··\nAP2   ·· ·· ██ ██\n```");
  });

  it("hakt Reife, Bedarf und Fragen ab, offene Fragen zuerst", () => {
    expect(text).toContain("## Antragsreife (1 von 1)\n\n- [x] Titel gesetzt");
    expect(text).toContain("- [x] Muster\n- [ ] Personalkosten");
    expect(text).toContain("## Fragen an die Förderstelle (1 offen)\n\n- [ ] F2\n- [x] F1");
  });

  it("nennt beim Drittleister die Rolle und die Stunden als Aufwand", () => {
    const stunden = [{ id: 1, paket: 1, nutzer: 3, person: "", name: "BG", stunden: "40.00" }];
    const mitAufwand = { ...voll, pakete: [paket(1, { titel: "Konzept", stunden })] };
    expect(projektinhalt(antrag(mitAufwand), prog, geber)).toContain("- **Stunden:** BG 40 h");
    const zuliefern = projektinhalt(
      antrag({ ...mitAufwand, rolle: "drittleister", stunden_sind_geld: false }), prog, geber,
    );
    expect(zuliefern).toContain("- **Unsere Rolle:** Drittleister");
    expect(zuliefern).toContain("- **Geschätzter Aufwand:** BG 40 h");
  });

  it("kommt ohne Fördergeber und ohne Pakete aus", () => {
    const knapp = projektinhalt(antrag({ ...voll, pakete: [] }), { ...prog, fragen: [] }, null);
    expect(knapp).not.toContain("Fördergeber");
    expect(knapp).toContain("## Arbeitspakete\n\n_(noch leer)_");
    expect(knapp).not.toContain("## Zeitplan");
  });
});

describe("Stunden und Kosten", () => {
  const nichts = { stunden: "0.00", personal: "0.00", sach: "0.00", gesamt: "0.00" };
  const paket = (teil: Partial<Foerderpaket>) => ({ stunden: [], kosten: nichts, ...teil }) as Foerderpaket;

  it("schreibt Stunden und Prozent österreichisch", () => {
    expect(alsStunden("1504.00")).toBe(`${(1504).toLocaleString("de-AT")} h`); // wie alsEuro
    expect(alsStunden("12.50")).toBe("12,5 h");
    expect(alsProzent("20.00")).toBe("20 %");
  });

  it("erkennt ein aufgeschlüsseltes Paket an Stunden oder Posten", () => {
    const mitStunden = paket({ stunden: [{ id: 1, paket: 1, nutzer: null, person: "BG", name: "BG", stunden: "1.00" }] });
    expect(istAufgeschluesselt(paket({}), true)).toBe(false);
    expect(istAufgeschluesselt(mitStunden, true)).toBe(true);
    expect(istAufgeschluesselt(paket({ kosten: { ...nichts, sach: "1000.00" } }), true)).toBe(true);
  });

  it("beim Drittleister machen Stunden kein Paket aufgeschlüsselt, Posten schon", () => {
    const mitStunden = paket({ stunden: [{ id: 1, paket: 1, nutzer: 3, person: "", name: "BG", stunden: "1.00" }] });
    expect(istAufgeschluesselt(mitStunden, false)).toBe(false);
    expect(istAufgeschluesselt(paket({ kosten: { ...nichts, sach: "1000.00" } }), false)).toBe(true);
  });

  it("summiert die Pakete in Cent", () => {
    const pakete = [paket({ kosten: { ...nichts, gesamt: "0.10" } }), paket({ kosten: { ...nichts, gesamt: "0.20" } })];
    expect(paketsumme(pakete)).toBe("0.30");
  });
});
