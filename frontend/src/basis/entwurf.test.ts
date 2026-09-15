/**
 * Das Feld, das sich selbst speichert. Geprüft wird das, was im Meeting weh
 * täte: dass gespeichert wird, ohne dass jemand daran denkt — und dass ein
 * Nachladen vom Server niemandem den Satz unter den Fingern wegnimmt.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { standText, useEntwurf } from "./entwurf";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useEntwurf", () => {
  it("speichert nach der Schreibpause, nicht bei jedem Zeichen", async () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEntwurf("", speichern, 1000));

    act(() => result.current.setzen("Ber"));
    act(() => result.current.setzen("Berger sagt zu"));
    expect(speichern).not.toHaveBeenCalled();
    expect(result.current.stand).toBe("offen");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(speichern).toHaveBeenCalledTimes(1);
    expect(speichern).toHaveBeenCalledWith("Berger sagt zu");
    expect(result.current.stand).toBe("rein");
  });

  it("speichert sofort, wenn das Feld verlassen wird", async () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEntwurf("", speichern, 5000));

    act(() => result.current.setzen("halber Satz"));
    await act(async () => result.current.jetztSichern());

    expect(speichern).toHaveBeenCalledWith("halber Satz");
  });

  /* Der Fall, der ohne Absicht Text kostet: Nach dem Speichern lädt die Liste
     neu und schickt denselben Wert noch einmal herein — währenddessen tippt
     jemand weiter. */
  it("überschreibt nicht, was gerade getippt wird", () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ wert }) => useEntwurf(wert, speichern, 1000), {
      initialProps: { wert: "alt" },
    });

    act(() => result.current.setzen("gerade getippt"));
    rerender({ wert: "vom Server" });

    expect(result.current.text).toBe("gerade getippt");
  });

  it("übernimmt einen neuen Stand vom Server, solange nichts offen ist", () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ wert }) => useEntwurf(wert, speichern, 1000), {
      initialProps: { wert: "alt" },
    });

    rerender({ wert: "von jemand anderem" });

    expect(result.current.text).toBe("von jemand anderem");
  });

  it("merkt sich einen Fehlschlag, ohne den Text wegzuwerfen", async () => {
    const speichern = vi.fn().mockRejectedValue(new Error("weg"));
    const { result } = renderHook(() => useEntwurf("", speichern, 1000));

    act(() => result.current.setzen("wichtig"));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.stand).toBe("fehler");
    expect(result.current.text).toBe("wichtig");
  });

  it("schickt beim Abbauen hinaus, was noch offen ist", () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useEntwurf("", speichern, 5000));

    act(() => result.current.setzen("beim Wegklicken"));
    unmount();

    expect(speichern).toHaveBeenCalledWith("beim Wegklicken");
  });
});

describe("standText", () => {
  it("sagt, wann zuletzt gespeichert wurde", () => {
    const text = standText("rein", new Date("2026-09-15T14:30:00"));

    expect(text).toContain("Gespeichert");
    expect(text).toContain("14:30");
  });

  it("nennt einen Fehlschlag beim Namen und sagt, dass der Text noch da ist", () => {
    expect(standText("fehler", null)).toContain("Text steht noch da");
  });

  /* Über einem leeren Feld wäre „Gespeichert" eine Aussage über etwas, das nie
     passiert ist. */
  it("behauptet vor dem ersten Speichern nicht, es sei gespeichert", () => {
    expect(standText("rein", null)).toBe("Speichert von selbst");
  });
});
