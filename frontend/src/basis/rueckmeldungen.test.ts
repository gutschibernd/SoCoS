import { describe, expect, it } from "vitest";

import type { Rueckmeldung } from "./daten";
import { abschnitte, istOffen, standText } from "./rueckmeldungen";

function meldung(teil: Partial<Rueckmeldung>): Rueckmeldung {
  return {
    id: 1,
    art: "wunsch",
    titel: "Irgendwas",
    text: "",
    stand: "neu",
    antwort: "",
    erledigt_in: "",
    melder: 1,
    melder_name: "Anna",
    melder_initialen: "A",
    // Kein Hex-Wert, auch nicht im Testaufbau: Farben stehen in farben.css,
    // und socos/tests/test_oberflaeche.py prüft die ganze Quelle darauf.
    melder_farbe: "var(--marke)",
    erstellt_am: "2026-09-13T10:00:00Z",
    geaendert_am: "2026-09-13T10:00:00Z",
    ...teil,
  };
}

describe("die Stände", () => {
  it("nennt „in_arbeit“ lesbar", () => {
    expect(standText("in_arbeit")).toBe("in Arbeit");
  });

  // Abgelehnt ist ein Ende, kein offener Punkt: Ein Wunsch, der nicht kommt,
  // darf nicht für immer in der Liste der Dinge stehen, die noch anstehen.
  it("zählt abgelehnt nicht zu den offenen", () => {
    expect(istOffen("neu")).toBe(true);
    expect(istOffen("in_arbeit")).toBe(true);
    expect(istOffen("erledigt")).toBe(false);
    expect(istOffen("abgelehnt")).toBe(false);
  });
});

describe("abschnitte", () => {
  it("stellt das Offene voran und bündelt Erledigtes nach Version", () => {
    const liste = [
      meldung({ id: 1, stand: "erledigt", erledigt_in: "2026-09-01" }),
      meldung({ id: 2, stand: "neu" }),
      meldung({ id: 3, stand: "erledigt", erledigt_in: "2026-09-13" }),
      meldung({ id: 4, stand: "erledigt", erledigt_in: "2026-09-01" }),
      meldung({ id: 5, stand: "in_arbeit" }),
    ];

    expect(abschnitte(liste).map((a) => a.titel)).toEqual([
      "Offen",
      "Erledigt in 2026-09-13",
      "Erledigt in 2026-09-01",
    ]);
    expect(abschnitte(liste)[0].eintraege.map((e) => e.id)).toEqual([2, 5]);
    expect(abschnitte(liste)[2].eintraege.map((e) => e.id)).toEqual([1, 4]);
  });

  it("hängt Erledigtes ohne Version hinten an, nicht vorn", () => {
    const liste = [
      meldung({ id: 1, stand: "erledigt", erledigt_in: "" }),
      meldung({ id: 2, stand: "erledigt", erledigt_in: "2026-09-13" }),
    ];
    expect(abschnitte(liste).map((a) => a.titel)).toEqual([
      "Erledigt in 2026-09-13",
      "Erledigt",
    ]);
  });

  it("stellt Abgelehntes ganz ans Ende", () => {
    const liste = [
      meldung({ id: 1, stand: "abgelehnt" }),
      meldung({ id: 2, stand: "erledigt", erledigt_in: "2026-09-13" }),
      meldung({ id: 3, stand: "neu" }),
    ];
    expect(abschnitte(liste).map((a) => a.titel)).toEqual([
      "Offen",
      "Erledigt in 2026-09-13",
      "Abgelehnt",
    ]);
  });

  // Eine leere Liste ist kein Fehler, aber auch kein leerer Abschnitt: Die
  // Seite zeigt dann eine Leerstelle, keine Überschrift ohne Inhalt.
  it("lässt leere Abschnitte weg", () => {
    expect(abschnitte([])).toEqual([]);
    expect(abschnitte([meldung({ stand: "neu" })]).map((a) => a.titel)).toEqual(["Offen"]);
  });
});
