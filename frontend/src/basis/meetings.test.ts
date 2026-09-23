import { describe, expect, it } from "vitest";

import {
  abschnitteAusText,
  auftragFuerLLM,
  besteTreffer,
  groesse,
  mailkopf,
  passtMeeting,
  teileNachZeit,
  wann,
} from "./meetings";
import type { Kontakt, Meeting, Meetinganhang } from "./daten";

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
    anhaenge: [],
    ...teil,
  };
}

function anhang(teil: Partial<Meetinganhang> = {}): Meetinganhang {
  return {
    id: 1,
    meeting: 1,
    name: "klient.eml",
    groesse: 1000,
    art: "email",
    text: "",
    erstellt_am: "2026-09-19T17:00:00Z",
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
    expect(auftrag).toContain('"## Überschrift"');
  });

  /* Die erste Fassung verlangte „nichts weglassen, auch den halben Satz" —
     bei einem Transkript ein Protokoll voller Begrüßung. Vollständig heißt
     jetzt: jede Zahl, Frist und Zusage. */
  it("verlangt inhaltliche Vollständigkeit, nicht jedes Füllwort", () => {
    const auftrag = auftragFuerLLM(meeting({ mitschrift: "x" }));

    expect(auftrag).toContain("jede Zahl, jeder Betrag, jede Frist und jede Zusage");
    expect(auftrag).toContain("Smalltalk");
    expect(auftrag).not.toContain("auch der halbe Satz");
  });

  it("gibt Kurzfassung, Themenabschnitte und Aufgaben mit Wer und Wann vor", () => {
    const auftrag = auftragFuerLLM(meeting({ mitschrift: "x" }));

    expect(auftrag).toContain("## Kurzfassung");
    expect(auftrag).toContain("ein Abschnitt je Thema");
    expect(auftrag).toContain('"- Wer: Was — bis wann"');
    // Abschnitte stehen in SoCoS als reiner Text.
    expect(auftrag).toContain("keine Tabellen, kein Fettdruck");
  });

  /* Ein Transkript hört „Sofarmis". Mit Firma, Rollen und Häusern im Rahmen
     kann das Modell das richtigstellen, statt es zu übernehmen. */
  it("liefert die richtigen Schreibweisen: Firma, Rolle und Haus", () => {
    const auftrag = auftragFuerLLM(
      meeting({
        mitschrift: "x",
        personen: [
          { id: 1, name: "Julia Richter", funktion: "Steuerberaterin", organisation_name: "Taxletics" },
        ],
      }),
    );

    expect(auftrag).toContain("Sopharmis Medical Solutions FlexCo");
    expect(auftrag).toContain("Julia Richter (Steuerberaterin, Taxletics)");
    expect(auftrag).toContain("Transkripte verhören sich");
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
    expect(auftrag).toContain("Nichts daraus wird zu etwas, das besprochen");
    expect(auftrag).toContain("## Nicht zur Sprache gekommen");
    // Der Plan steht vor dem Gespräch, nicht mittendrin.
    expect(auftrag.indexOf("--- ENDE DER VORBEREITUNG ---")).toBeLessThan(
      auftrag.indexOf("--- MITSCHRIFT ---"),
    );
  });

  it("legt den Text einer E-Mail als Unterlage bei, gekennzeichnet als Hintergrund", () => {
    const auftrag = auftragFuerLLM(
      meeting({
        mitschrift: "x",
        anhaenge: [
          anhang({ text: "Betreff: Neuer Klient\n\nBH: EUR 90,00/h" }),
          anhang({ id: 2, name: "Pass.pdf", art: "datei", text: "" }),
        ],
      }),
    );

    expect(auftrag).toContain(
      '--- UNTERLAGE 1: E-Mail „klient.eml“ (Hintergrund, kein Gesprächsinhalt) ---',
    );
    expect(auftrag).toContain("BH: EUR 90,00/h");
    expect(auftrag).toContain("gilt das Gespräch");
    // Eine Datei ohne Text: nur ihr Name, kein leerer Block.
    expect(auftrag).toContain("Inhalt liegt nicht bei): Pass.pdf");
    expect(auftrag).not.toContain("UNTERLAGE 2");
    expect(auftrag.indexOf("--- ENDE DER UNTERLAGE 1 ---")).toBeLessThan(
      auftrag.indexOf("--- MITSCHRIFT ---"),
    );
  });

  it("erwähnt ohne Vorbereitung und Unterlagen auch keine", () => {
    const auftrag = auftragFuerLLM(meeting({ vorbereitung: "  ", mitschrift: "kurz" }));

    expect(auftrag).not.toContain("VORBEREITUNG");
    expect(auftrag).not.toContain("UNTERLAGE");
    expect(auftrag).not.toContain("Nicht zur Sprache gekommen");
  });
});

describe("mailkopf", () => {
  it("liest Absender ohne Adresse, Datum und Betreff", () => {
    const kopf = mailkopf(
      "Von: Gabriel Platzer <gabriel@example.invalid>\nAn: x\nDatum: 19.09.2026 19:08\nBetreff: Neuer Klient\n\nVon: im Zitat <z@x>",
    );

    expect(kopf).toEqual({ von: "Gabriel Platzer", datum: "19.09.2026 19:08", betreff: "Neuer Klient" });
  });

  it("lässt fehlende Zeilen leer", () => {
    expect(mailkopf("")).toEqual({ von: "", datum: "", betreff: "" });
  });
});

describe("groesse", () => {
  it("zeigt Byte, Kilobyte und Megabyte", () => {
    expect(groesse(512)).toBe("512 B");
    expect(groesse(740 * 1024)).toBe("740 KB");
    expect(groesse(16.4 * 1024 * 1024)).toBe("16,4 MB");
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
    kontakt({ id: 1, name: "Berger", funktion: "", organisation_name: "Förderstelle Nord" }),
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
    const m = meeting({ personen: [{ id: 3, name: "Berger", funktion: "", organisation_name: "Förderstelle" }] });

    expect(passtMeeting(m, "förder")).toBe(true);
  });

  it("findet auch, was in einer angehängten Mail steht", () => {
    const m = meeting({ anhaenge: [anhang({ text: "BH: EUR 90,00/h" })] });

    expect(passtMeeting(m, "90,00")).toBe(true);
  });

  it("lässt bei leerer Suche alles durch", () => {
    expect(passtMeeting(meeting(), "  ")).toBe(true);
  });
});
