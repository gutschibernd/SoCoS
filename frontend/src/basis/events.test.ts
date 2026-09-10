import { describe, expect, it } from "vitest";

import type { Event, Eventziel, Kontakt, Organisation } from "./daten";
import {
  alsAnfrage,
  istVorbei,
  letzterTag,
  nochOffen,
  passtEvent,
  teileNachZeit,
  wen,
  wenGetroffen,
  zaehlung,
} from "./events";

const ziel = (teil: Partial<Eventziel>): Eventziel => ({
  id: 1,
  event: 1,
  organisation: null,
  organisation_name: "",
  kontakt: null,
  kontakt_name: "",
  kontakt_organisation: "",
  anliegen: "",
  stand: "offen",
  reihenfolge: 0,
  ...teil,
});

const event = (teil: Partial<Event>): Event => ({
  id: 1,
  titel: "MedTech Days",
  ort: "Wien",
  von: "2026-10-14",
  bis: null,
  notiz: "",
  teilnehmer: [],
  teilnehmer_namen: [],
  ziele: [],
  verlauf: [],
  ...teil,
});

describe("letzterTag und istVorbei", () => {
  it("nimmt bei einem eintägigen Event den einen Tag", () => {
    expect(letzterTag(event({ bis: null }))).toBe("2026-10-14");
  });

  // Der Fehler, den man erst im Oktober sieht: Am zweiten Tag einer
  // dreitägigen Tagung ist sie nicht vergangen.
  it("hält ein mehrtägiges Event bis zum letzten Tag für laufend", () => {
    const tagung = event({ von: "2026-10-14", bis: "2026-10-16" });
    expect(istVorbei(tagung, "2026-10-15")).toBe(false);
    expect(istVorbei(tagung, "2026-10-16")).toBe(false);
    expect(istVorbei(tagung, "2026-10-17")).toBe(true);
  });

  it("hält ein Event an seinem eigenen Tag für laufend", () => {
    expect(istVorbei(event({ von: "2026-10-14" }), "2026-10-14")).toBe(false);
  });
});

describe("teileNachZeit", () => {
  const a = event({ id: 1, titel: "A", von: "2026-10-01" });
  const b = event({ id: 2, titel: "B", von: "2026-12-01" });
  const c = event({ id: 3, titel: "C", von: "2026-11-01" });

  it("sortiert Kommendes aufsteigend und Vergangenes absteigend", () => {
    const { kommend, vergangen } = teileNachZeit([a, b, c], "2026-10-20");
    expect(kommend.map((e) => e.titel)).toEqual(["C", "B"]);
    expect(vergangen.map((e) => e.titel)).toEqual(["A"]);
  });

  it("ordnet gleiche Tage nach Titel", () => {
    const zwei = event({ id: 4, titel: "Aa", von: "2026-11-01" });
    const { kommend } = teileNachZeit([c, zwei], "2026-10-20");
    expect(kommend.map((e) => e.titel)).toEqual(["Aa", "C"]);
  });
});

describe("zaehlung", () => {
  it("zählt je Stand", () => {
    expect(
      zaehlung([
        ziel({ id: 1, stand: "offen" }),
        ziel({ id: 2, stand: "getroffen" }),
        ziel({ id: 3, stand: "getroffen" }),
      ]),
    ).toEqual({ gesamt: 3, offen: 1, getroffen: 2, verpasst: 0 });
  });
});

describe("wen", () => {
  it("nennt bei einer Person das Haus dazu", () => {
    expect(
      wen(ziel({ kontakt: 7, kontakt_name: "Berger", kontakt_organisation: "FFG" })),
    ).toEqual({ name: "Berger", dazu: "FFG" });
  });

  // „FFG · FFG" wäre dieselbe Auskunft zweimal.
  it("wiederholt bei einer Organisation nicht ihren eigenen Namen", () => {
    expect(wen(ziel({ organisation: 3, organisation_name: "FFG" }))).toEqual({
      name: "FFG",
      dazu: "",
    });
  });
});

describe("alsAnfrage", () => {
  it("setzt genau eines von beiden", () => {
    expect(alsAnfrage("o12")).toEqual({ organisation: 12, kontakt: null });
    expect(alsAnfrage("k7")).toEqual({ organisation: null, kontakt: 7 });
  });

  it("verwirft, was kein Schlüssel ist", () => {
    expect(alsAnfrage("")).toBeNull();
    expect(alsAnfrage("x3")).toBeNull();
    expect(alsAnfrage("o")).toBeNull();
  });
});

describe("nochOffen", () => {
  const orgs = [
    { id: 1, name: "FFG", typ: "Förderstelle" },
    { id: 2, name: "TU Graz", typ: "Forschung" },
  ] as Organisation[];
  const personen = [
    { id: 7, name: "Berger", funktion: "Leitung", organisation_name: "FFG" },
    { id: 8, name: "Huber", funktion: "Einkauf", organisation_name: "" },
  ] as Kontakt[];

  it("lässt weg, was schon auf der Liste steht", () => {
    const offen = nochOffen(orgs, personen, [
      ziel({ id: 1, organisation: 1, organisation_name: "FFG" }),
      ziel({ id: 2, kontakt: 8, kontakt_name: "Huber" }),
    ]);
    expect(offen.organisationen.map((a) => a.name)).toEqual(["TU Graz"]);
    expect(offen.personen.map((a) => a.name)).toEqual(["Berger"]);
  });

  it("nimmt bei einer losen Person ihre Rolle als Zusatz", () => {
    const offen = nochOffen([], personen, []);
    expect(offen.personen.map((a) => a.dazu)).toEqual(["FFG", "Einkauf"]);
  });
});

describe("wenGetroffen", () => {
  const orgs = [
    { id: 1, name: "FFG", typ: "Förderstelle" },
    { id: 2, name: "TU Graz", typ: "Forschung" },
  ] as Organisation[];
  const personen = [
    { id: 7, name: "Berger", funktion: "Leitung", organisation_name: "FFG" },
    { id: 8, name: "Huber", funktion: "Einkauf", organisation_name: "" },
  ] as Kontakt[];

  // Der Kern der Sache: Wer nicht auf der Hitlist steht, kann trotzdem
  // getroffen worden sein. Vorher bot der Verlauf nur die Hitlist an.
  it("bietet auch an, wer nicht auf der Hitlist steht", () => {
    const wahl = wenGetroffen(orgs, personen, [
      ziel({ id: 1, kontakt: 7, kontakt_name: "Berger", kontakt_organisation: "FFG" }),
    ]);
    expect(wahl.hitlist.map((a) => a.name)).toEqual(["Berger"]);
    expect(wahl.personen.map((a) => a.name)).toEqual(["Huber"]);
    expect(wahl.organisationen.map((a) => a.name)).toEqual(["FFG", "TU Graz"]);
  });

  // Sonst stünde derselbe Name zweimal im Auswahlfeld, einmal je Gruppe.
  it("zeigt niemanden zweimal", () => {
    const wahl = wenGetroffen(orgs, personen, [
      ziel({ id: 1, organisation: 2, organisation_name: "TU Graz" }),
      ziel({ id: 2, kontakt: 8, kontakt_name: "Huber" }),
    ]);
    const alle = [...wahl.hitlist, ...wahl.personen, ...wahl.organisationen].map((a) => a.wert);
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("kommt mit einem Event ohne Hitlist zurecht", () => {
    const wahl = wenGetroffen(orgs, personen, []);
    expect(wahl.hitlist).toEqual([]);
    expect(wahl.personen).toHaveLength(2);
    expect(wahl.organisationen).toHaveLength(2);
  });
});

describe("passtEvent", () => {
  const tagung = event({
    titel: "MedTech Days",
    ort: "Wien",
    ziele: [ziel({ id: 1, organisation: 1, organisation_name: "Förderstelle Nord" })],
  });

  it("findet über Titel und Ort", () => {
    expect(passtEvent(tagung, "medtech")).toBe(true);
    expect(passtEvent(tagung, "wien")).toBe(true);
  });

  // Wer den Namen einer Förderstelle eingibt, sucht das Event, auf dem er sie
  // treffen wollte.
  it("findet über die Hitlist", () => {
    expect(passtEvent(tagung, "förderstelle")).toBe(true);
  });

  it("lässt eine leere Suche alles durch", () => {
    expect(passtEvent(tagung, "   ")).toBe(true);
  });

  it("verwirft, was nirgends vorkommt", () => {
    expect(passtEvent(tagung, "graz")).toBe(false);
  });
});
