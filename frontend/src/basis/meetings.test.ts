import { describe, expect, it } from "vitest";

import {
  abschnitteAusText,
  auftragFuerLLM,
  besteTreffer,
  passtMeeting,
  teileNachZeit,
  wann,
} from "./meetings";
import type { Kontakt, Meeting } from "./daten";

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

  /* Die Vorbereitung ist der Plan, nicht das Gespräch. Sie geht mit, aber in
     einem eigenen, so beschrifteten Block — und mit der Regel, dass daraus
     nichts „besprochen" wird. Läge sie unmarkiert neben der Mitschrift, wäre
     genau das nicht mehr zu verhindern. */
  it("schickt die Vorbereitung als eigenen Block mit, nicht als Gesprächsinhalt", () => {
    const auftrag = auftragFuerLLM(
      meeting({ vorbereitung: "Preis drücken", mitschrift: "nichts dazu gesagt" }),
    );

    expect(auftrag).toContain("--- VORBEREITUNG (vorher geschrieben, kein Gesprächsinhalt) ---");
    expect(auftrag).toContain("Preis drücken");
    expect(auftrag).toContain("Die Vorbereitung ist der Plan, nicht das Gespräch");
    expect(auftrag).toContain("Nicht zur Sprache gekommen");
    // Der Plan steht vor dem Gespräch, nicht mittendrin.
    expect(auftrag.indexOf("--- ENDE DER VORBEREITUNG ---")).toBeLessThan(
      auftrag.indexOf("--- MITSCHRIFT ---"),
    );
  });

  it("erwähnt ohne Vorbereitung auch keine", () => {
    const auftrag = auftragFuerLLM(meeting({ vorbereitung: "  ", mitschrift: "kurz" }));

    expect(auftrag).not.toContain("VORBEREITUNG");
    expect(auftrag).not.toContain("Nicht zur Sprache gekommen");
  });
});

function kontakt(teil: Partial<Kontakt> & Pick<Kontakt, "id" | "name">): Kontakt {
  return {
    anrede: "",
    funktion: "",
    email: "",
    telefon: "",
    organisation: null,
    organisation_name: "",
    kennengelernt_auf: null,
    kennengelernt_auf_titel: "",
    ball: "nichts",
    offener_punkt: "",
    letzter_kontakt: null,
    verlauf: [],
    meetings: [],
    ...teil,
  };
}

describe("besteTreffer", () => {
  const leute = [
    kontakt({ id: 1, name: "Berger", organisation_name: "Förderstelle Nord" }),
    kontakt({ id: 2, name: "Lieberwirth", organisation_name: "Klinikum Süd" }),
    kontakt({ id: 3, name: "Anna Bergmann", funktion: "Programmleitung" }),
    kontakt({ id: 4, name: "Nordmann", organisation_name: "Klinikum Süd" }),
    kontakt({ id: 5, name: "Zeller", organisation_name: "Förderstelle Nord" }),
  ];

  it("liefert ohne Eingabe nichts — die Liste ist ein Vorschlag, kein Verzeichnis", () => {
    expect(besteTreffer(leute, "  ")).toEqual([]);
  });

  /* „be" meint Berger, nicht Lieberwirth — der Anfang des Namens schlägt den
     Anfang eines Wortes darin, und der schlägt das bloße Enthalten. */
  it("reiht: Namensanfang vor Wortanfang vor Enthalten vor Haus", () => {
    expect(besteTreffer(leute, "be", 5).map((k) => k.id)).toEqual([1, 3, 2]);
  });

  it("findet über das Haus, aber hinter dem Namen", () => {
    expect(besteTreffer(leute, "nord", 5).map((k) => k.id)).toEqual([4, 1, 5]);
  });

  it("verlangt bei mehreren Wörtern jedes", () => {
    expect(besteTreffer(leute, "berg nord").map((k) => k.id)).toEqual([1]);
  });

  it("gibt höchstens die gewünschte Zahl zurück", () => {
    expect(besteTreffer(leute, "e", 2)).toHaveLength(2);
  });

  it("findet über die Funktion", () => {
    expect(besteTreffer(leute, "programm").map((k) => k.id)).toEqual([3]);
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
