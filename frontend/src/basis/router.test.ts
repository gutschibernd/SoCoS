import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { alsPfad, ausPfad, darueber, useSeite, wohinZurueck } from "./router";

describe("ausPfad", () => {
  it("liest die Seite", () => {
    expect(ausPfad("/zeit")).toEqual({ seite: "zeit", unter: null });
    expect(ausPfad("/kontakte/")).toEqual({ seite: "kontakte", unter: null });
  });

  // Die Wurzel ist die Startseite, und ein Pfad, den es nicht gibt, landet
  // dort ebenfalls — nicht auf dem Dashboard: Von der Startseite führt jeder
  // weitere Weg mit einem Klick weiter.
  it("fällt auf die Startseite zurück", () => {
    expect(ausPfad("/gibtsnicht")).toEqual({ seite: "start", unter: null });
    expect(ausPfad("/")).toEqual({ seite: "start", unter: null });
    expect(ausPfad("/start")).toEqual({ seite: "start", unter: null });
  });

  it("verwirft eine Unterseite unter der Startseite", () => {
    expect(ausPfad("/start/zeit")).toEqual({ seite: "start", unter: null });
  });

  it("liest die Unterseite", () => {
    expect(ausPfad("/projekt/bearbeiten")).toEqual({ seite: "projekt", unter: "bearbeiten" });
    expect(ausPfad("/aufgaben/ideen")).toEqual({ seite: "aufgaben", unter: "ideen" });
    expect(ausPfad("/aufgaben")).toEqual({ seite: "aufgaben", unter: null });
  });

  it("liest das Modul", () => {
    expect(ausPfad("/module")).toEqual({ seite: "module", unter: null });
    expect(ausPfad("/module/praktikum")).toEqual({ seite: "module", unter: "praktikum" });
    expect(ausPfad("/module/praktikum-4")).toEqual({ seite: "module", unter: null });
    // Die SPG Academy gibt es nicht mehr — ihr alter Weg führt zur Übersicht.
    expect(ausPfad("/module/spg")).toEqual({ seite: "module", unter: null });
    expect(ausPfad("/module/pitch")).toEqual({ seite: "module", unter: null });
  });

  it("liest ein Praktikumsthema als dritte Stufe", () => {
    expect(ausPfad("/module/praktikum/12")).toEqual({ seite: "module", unter: "praktikum/12" });
    expect(ausPfad("/module/praktikum-ideen")).toEqual({ seite: "module", unter: "praktikum-ideen" });
    expect(ausPfad("/module/praktikum-ideen/7")).toEqual({ seite: "module", unter: "praktikum-ideen/7" });
    expect(ausPfad("/module/praktikum/quatsch")).toEqual({ seite: "module", unter: null });
    expect(ausPfad("/module/spg/12")).toEqual({ seite: "module", unter: null });
    expect(ausPfad("/module/design/7")).toEqual({ seite: "module", unter: "design/7" });
    // Die Planung ist in die Projektseite gezogen; alte Lesezeichen führen dorthin.
    expect(ausPfad("/module/planung/28")).toEqual({ seite: "projekt", unter: "28" });
    expect(ausPfad("/module/planung")).toEqual({ seite: "projekt", unter: null });
    // Die dritte Stufe gilt nur, wo sie vorgesehen ist.
    expect(ausPfad("/kontakte/12/34")).toEqual({ seite: "kontakte", unter: null });
  });

  it("liest die gewählte Organisation und die losen Kontakte", () => {
    expect(ausPfad("/kontakte/12")).toEqual({ seite: "kontakte", unter: "12" });
    expect(ausPfad("/kontakte/lose")).toEqual({ seite: "kontakte", unter: "lose" });
  });

  // Eine erfundene zweite Stufe darf keine Ansicht in einen Zustand bringen,
  // den niemand vorgesehen hat — sie wird verworfen, die Seite bleibt.
  it("verwirft eine unbekannte Unterseite", () => {
    expect(ausPfad("/projekt/loeschen")).toEqual({ seite: "projekt", unter: null });
    expect(ausPfad("/projekt/28")).toEqual({ seite: "projekt", unter: "28" });
    expect(ausPfad("/zeit/bearbeiten")).toEqual({ seite: "zeit", unter: null });
    expect(ausPfad("/kontakte/quatsch")).toEqual({ seite: "kontakte", unter: null });
  });

  it("liest das gewählte Event", () => {
    expect(ausPfad("/events/3")).toEqual({ seite: "events", unter: "3" });
    expect(ausPfad("/events")).toEqual({ seite: "events", unter: null });
    expect(ausPfad("/events/lose")).toEqual({ seite: "events", unter: null });
  });

  // Die Rubrik gehört in den Weg und nicht in den Zustand der Ansicht:
  // „/einstellungen/protokoll" soll ein Lesezeichen sein dürfen.
  it("liest die Rubrik der Einstellungen", () => {
    expect(ausPfad("/einstellungen")).toEqual({ seite: "einstellungen", unter: null });
    expect(ausPfad("/einstellungen/konten")).toEqual({ seite: "einstellungen", unter: "konten" });
    expect(ausPfad("/einstellungen/sicherung")).toEqual({
      seite: "einstellungen",
      unter: "sicherung",
    });
    expect(ausPfad("/einstellungen/quatsch")).toEqual({ seite: "einstellungen", unter: null });
  });

  it("liest den Teil des Profils", () => {
    expect(ausPfad("/profil")).toEqual({ seite: "profil", unter: null });
    expect(ausPfad("/profil/adresse")).toEqual({ seite: "profil", unter: "adresse" });
    expect(ausPfad("/profil/gehalt")).toEqual({ seite: "profil", unter: null });
  });

  // Die Rubrik der Doku ist ein Weg und kein Zustand: „Schick mir den Link zur
  // Zeiterfassung" soll ein Link sein können.
  it("liest die Rubrik der Doku", () => {
    expect(ausPfad("/doku")).toEqual({ seite: "doku", unter: null });
    expect(ausPfad("/doku/aenderungen")).toEqual({ seite: "doku", unter: "aenderungen" });
    expect(ausPfad("/doku/erfunden")).toEqual({ seite: "doku", unter: null });
  });

  // „Wünsche & Fehler" hat keine zweite Ebene — eine erfundene wird verworfen,
  // die Seite bleibt.
  it("liest die Wünsche und Fehler", () => {
    expect(ausPfad("/rueckmeldungen")).toEqual({ seite: "rueckmeldungen", unter: null });
    expect(ausPfad("/rueckmeldungen/7")).toEqual({ seite: "rueckmeldungen", unter: null });
  });

  it("übergeht doppelte Schrägstriche", () => {
    expect(ausPfad("//kontakte//12")).toEqual({ seite: "kontakte", unter: "12" });
  });
});

describe("darueber", () => {
  // „Zurück" geht eine Stufe hoch: vom Thema zur Liste, nicht zur Übersicht.
  it("nimmt die letzte Stufe weg", () => {
    expect(darueber("praktikum/12")).toBe("praktikum");
    expect(darueber("12")).toBeNull();
  });
});

describe("alsPfad", () => {
  it("baut den Pfad zurück", () => {
    expect(alsPfad("projekt", null)).toBe("/projekt");
    expect(alsPfad("projekt", "bearbeiten")).toBe("/projekt/bearbeiten");
    expect(ausPfad(alsPfad("projekt", "bearbeiten"))).toEqual({
      seite: "projekt",
      unter: "bearbeiten",
    });
    expect(ausPfad(alsPfad("kontakte", "12"))).toEqual({ seite: "kontakte", unter: "12" });
  });
});

describe("wohinZurueck", () => {
  const entscheidung = { seite: "module", unter: "design/7" } as const;

  // Bernd, 2026-10-19: Vom Förderantrag, den man im Projekt angeklickt hat,
  // zurück ins Projekt — nicht eine Stufe hoch ins Förderprogramm.
  it("führt dorthin, woher man kam, auch aus einer Unterseite", () => {
    expect(wohinZurueck(entscheidung, { tiefe: 3 })).toBe("geschichte");
    expect(wohinZurueck({ seite: "projekt", unter: null }, { tiefe: 1 })).toBe("geschichte");
  });

  // Ohne Geschichte (Lesezeichen) trüge die Geschichte aus SoCoS heraus.
  it("geht ohne Geschichte eine Stufe hoch", () => {
    expect(wohinZurueck(entscheidung, { tiefe: 0 })).toEqual({ seite: "module", unter: "design" });
    expect(wohinZurueck(entscheidung, null)).toEqual({ seite: "module", unter: "design" });
  });

  // Ein Modul steht im Menü wie jede Seite — über ihm liegt keine Modulübersicht mehr.
  it("behandelt die oberste Stufe eines Moduls wie eine Seite", () => {
    const thoughts = { seite: "module", unter: "thoughts" } as const;
    expect(wohinZurueck(thoughts, null)).toEqual({ seite: "start", unter: null });
  });

  it("führt ohne Geschichte zur Startseite und von dort nirgends hin", () => {
    expect(wohinZurueck({ seite: "projekt", unter: null }, null)).toEqual({ seite: "start", unter: null });
    expect(wohinZurueck({ seite: "start", unter: null }, null)).toBeNull();
  });
});

/*
  Der Weg durch die echte Geschichte des Browsers (jsdom). `history.back()`
  meldet sich dort wie im Browser erst später mit `popstate` — deshalb das
  Warten.
*/
describe("useSeite", () => {
  beforeEach(() => {
    // Ein direkter Aufruf: ohne Zustand, also ohne Geschichte in SoCoS.
    window.history.replaceState(null, "", "/");
    // jsdom kennt kein Scrollen.
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  const oeffne = (pfad: string) => {
    window.history.replaceState(null, "", pfad);
    return renderHook(() => useSeite());
  };

  it("führt vom Förderantrag zurück in die Phase, aus der man kam", async () => {
    const { result } = oeffne("/projekt/28");
    act(() => result.current.wechseln("module", "foerderungen/2/1/3"));
    expect(result.current.kannZurueck).toBe(true);
    act(() => result.current.zurueck());
    await waitFor(() => expect(result.current.ort).toEqual({ seite: "projekt", unter: "28" }));
    expect(window.location.pathname).toBe("/projekt/28");
  });

  // Ein Umschalter (Reiter, Bearbeiten, Phase) ist kein Ort.
  it("legt für einen Umschalter keinen Eintrag an", async () => {
    const { result } = oeffne("/start");
    act(() => result.current.wechseln("aufgaben"));
    act(() => result.current.wechseln("aufgaben", "ideen", { ersetzen: true }));
    act(() => result.current.wechseln("aufgaben", "archiv", { ersetzen: true }));
    expect(window.location.pathname).toBe("/aufgaben/archiv");
    act(() => result.current.zurueck());
    await waitFor(() => expect(result.current.ort).toEqual({ seite: "start", unter: null }));
    expect(result.current.kannZurueck).toBe(false);
  });

  // Sonst täte das nächste Zurück scheinbar nichts.
  it("legt für denselben Ort keinen zweiten Eintrag an", async () => {
    const { result } = oeffne("/start");
    act(() => result.current.wechseln("projekt"));
    act(() => result.current.wechseln("projekt"));
    act(() => result.current.zurueck());
    await waitFor(() => expect(result.current.ort).toEqual({ seite: "start", unter: null }));
  });

  // Ohne Geschichte ersetzt jeder Schritt den Eintrag. Legte er einen an,
  // führte das nächste Zurück wieder hinunter, statt weiter nach oben.
  it("steigt ohne Geschichte Stufe für Stufe auf, ohne hin und her", () => {
    const { result } = oeffne("/module/foerderungen/2/1/3");
    const schritte: string[] = [];
    while (result.current.kannZurueck && schritte.length < 10) {
      act(() => result.current.zurueck());
      schritte.push(window.location.pathname);
      expect(window.history.state).toEqual({ tiefe: 0 });
    }
    expect(schritte).toEqual([
      "/module/foerderungen/2/1",
      "/module/foerderungen/2",
      "/module/foerderungen",
      "/start",
    ]);
  });
});
