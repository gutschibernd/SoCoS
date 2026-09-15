import { describe, expect, it } from "vitest";

import { abschnitteAusText, auftragFuerLLM, passtMeeting, teileNachZeit, wann } from "./meetings";
import type { Meeting } from "./daten";

function meeting(teil: Partial<Meeting> = {}): Meeting {
  return {
    id: 1,
    titel: "Abstimmung Förderstelle",
    datum: "2026-09-15",
    uhrzeit: null,
    ort: "",
    kontakte: [],
    personen: [],
    organisationen: [],
    haeuser: [],
    teilnehmer: [],
    teilnehmer_namen: [],
    vorbereitung: "",
    mitschrift: "",
    abschnitte: [],
    ...teil,
  };
}

describe("abschnitteAusText", () => {
  it("zerlegt an den Überschriften", () => {
    const zerlegt = abschnitteAusText(
      "## Anlass\nErstes Gespräch.\n\n## Nächste Schritte\n- Angebot bis 30.9.\n- Rückruf",
    );

    expect(zerlegt).toEqual([
      { ueberschrift: "Anlass", text: "Erstes Gespräch." },
      { ueberschrift: "Nächste Schritte", text: "- Angebot bis 30.9.\n- Rückruf" },
    ]);
  });

  it("nimmt jede Überschriftentiefe, auch mit Rauten am Ende", () => {
    expect(abschnitteAusText("# Eins\na\n### Zwei ###\nb").map((a) => a.ueberschrift)).toEqual([
      "Eins",
      "Zwei",
    ]);
  });

  /* Der Fall, der sonst still Text kostet: Ein Modell, das sich nicht an das
     Format hält, liefert einen Klumpen ohne Überschrift. Der muss ankommen —
     sonst verschwindet er genau dann, wenn man hinsehen müsste. */
  it("behält, was vor der ersten Überschrift steht", () => {
    expect(abschnitteAusText("Einfach nur Text.\n\n## Danach\nmehr")).toEqual([
      { ueberschrift: "", text: "Einfach nur Text." },
      { ueberschrift: "Danach", text: "mehr" },
    ]);
  });

  it("wirft einen Codezaun um die ganze Antwort weg", () => {
    expect(abschnitteAusText("```markdown\n## Anlass\nText\n```")).toEqual([
      { ueberschrift: "Anlass", text: "Text" },
    ]);
  });

  it("macht aus leerem Text keine Abschnitte", () => {
    expect(abschnitteAusText("   \n\n  ")).toEqual([]);
  });

  it("lässt eine Überschrift ohne Text stehen", () => {
    expect(abschnitteAusText("## Offene Punkte")).toEqual([
      { ueberschrift: "Offene Punkte", text: "" },
    ]);
  });

  it("hält eine Raute im Fließtext nicht für eine Überschrift", () => {
    expect(abschnitteAusText("## Kosten\nRaute #3 im Antrag")).toEqual([
      { ueberschrift: "Kosten", text: "Raute #3 im Antrag" },
    ]);
  });
});

describe("auftragFuerLLM", () => {
  it("nimmt die Mitschrift mit und sagt, dass nichts erfunden werden darf", () => {
    const auftrag = auftragFuerLLM(meeting({ mitschrift: "Berger: Antrag bis Ende Oktober" }));

    expect(auftrag).toContain("Berger: Antrag bis Ende Oktober");
    expect(auftrag).toContain("Erfinde nichts");
    expect(auftrag).toContain("## Überschrift");
  });

  /* Die Vorbereitung ist der Plan, nicht das Gespräch. Läge sie daneben, machte
     das Modell aus „wollten wir ansprechen" ein „wurde besprochen". */
  it("schickt die Vorbereitung nicht mit", () => {
    const auftrag = auftragFuerLLM(
      meeting({ vorbereitung: "Preis drücken", mitschrift: "nichts dazu gesagt" }),
    );

    expect(auftrag).not.toContain("Preis drücken");
  });
});

describe("teileNachZeit", () => {
  it("zählt den heutigen Tag zu den kommenden", () => {
    const heute = meeting({ id: 1, datum: "2026-09-15" });
    const gestern = meeting({ id: 2, datum: "2026-09-14" });
    const geteilt = teileNachZeit([gestern, heute], "2026-09-15");

    expect(geteilt.kommend.map((m) => m.id)).toEqual([1]);
    expect(geteilt.vergangen.map((m) => m.id)).toEqual([2]);
  });

  it("sortiert kommend das Nächste zuerst, vergangen das Letzte zuerst", () => {
    const liste = [
      meeting({ id: 1, datum: "2026-10-01" }),
      meeting({ id: 2, datum: "2026-09-20" }),
      meeting({ id: 3, datum: "2026-09-01" }),
      meeting({ id: 4, datum: "2026-08-01" }),
    ];
    const geteilt = teileNachZeit(liste, "2026-09-15");

    expect(geteilt.kommend.map((m) => m.id)).toEqual([2, 1]);
    expect(geteilt.vergangen.map((m) => m.id)).toEqual([3, 4]);
  });

  it("stellt am selben Tag die frühere Uhrzeit voran", () => {
    const liste = [
      meeting({ id: 1, datum: "2026-09-20", uhrzeit: "16:00:00" }),
      meeting({ id: 2, datum: "2026-09-20", uhrzeit: "09:00:00" }),
    ];

    expect(teileNachZeit(liste, "2026-09-15").kommend.map((m) => m.id)).toEqual([2, 1]);
  });
});

describe("wann", () => {
  it("lässt die Uhrzeit weg, wenn es keine gibt", () => {
    expect(wann({ datum: "2026-09-15", uhrzeit: null })).toBe("15.09.2026");
  });

  it("zeigt Stunde und Minute, aber keine Sekunden", () => {
    expect(wann({ datum: "2026-09-15", uhrzeit: "14:30:00" })).toBe("15.09.2026, 14:30");
  });
});

describe("passtMeeting", () => {
  it("findet auch, was im Protokoll steht", () => {
    const m = meeting({
      abschnitte: [
        { id: 1, meeting: 1, ueberschrift: "Kosten", text: "Deckelung bei 40.000", reihenfolge: 0 },
      ],
    });

    expect(passtMeeting(m, "deckelung")).toBe(true);
    expect(passtMeeting(m, "kündigung")).toBe(false);
  });

  it("findet über die Person und ihr Haus", () => {
    const m = meeting({ personen: [{ id: 3, name: "Berger", organisation_name: "Förderstelle" }] });

    expect(passtMeeting(m, "förder")).toBe(true);
  });

  it("lässt bei leerer Suche alles durch", () => {
    expect(passtMeeting(meeting(), "  ")).toBe(true);
  });
});
