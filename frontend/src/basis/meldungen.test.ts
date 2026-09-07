import { beforeEach, describe, expect, it, vi } from "vitest";

import { melden, schliessen, zuhoeren, type Meldung } from "./meldungen";

let gesehen: Meldung[] = [];
let abmelden = () => {};

beforeEach(() => {
  abmelden();
  gesehen = [];
  abmelden = zuhoeren((m) => {
    gesehen = m;
  });
  for (const m of [...gesehen]) schliessen(m.id);
});

describe("Meldungen", () => {
  it("zeigt einen Fehler an", () => {
    melden("fehler", "Das ging schief.");
    expect(gesehen.map((m) => m.text)).toEqual(["Das ging schief."]);
  });

  it("lässt einen Fehler stehen, bis jemand ihn wegklickt", () => {
    // Ein Fehler, der nach vier Sekunden verschwindet, wird übersehen — und
    // dann fehlt die Buchung, ohne dass es jemand weiß.
    vi.useFakeTimers();
    melden("fehler", "Buchung nicht gespeichert.");
    vi.advanceTimersByTime(60_000);
    expect(gesehen).toHaveLength(1);
    vi.useRealTimers();
  });

  it("lässt eine Erfolgsmeldung von selbst verschwinden", () => {
    vi.useFakeTimers();
    melden("gut", "Gespeichert.");
    expect(gesehen).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(gesehen).toHaveLength(0);
    vi.useRealTimers();
  });

  it("kann mehrere gleichzeitig zeigen", () => {
    melden("fehler", "eins");
    melden("fehler", "zwei");
    expect(gesehen).toHaveLength(2);
  });

  it("schließt genau die weggeklickte", () => {
    const a = melden("fehler", "eins");
    melden("fehler", "zwei");
    schliessen(a);
    expect(gesehen.map((m) => m.text)).toEqual(["zwei"]);
  });
});
