/**
 * Die Anlegekarte trägt jedes „Neu …" der Anwendung. Zwei Dinge daran sind
 * keine Optik: Enter muss aus jedem Feld anlegen (vorher ging es im
 * Datumsfeld nicht), und ein Doppelklick darf nicht zwei Einträge ergeben.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Anlegekarte, Beschriftet } from "./Anlegekarte";

function zeige(anlegen: () => Promise<void> | void, abbrechen?: () => void) {
  render(
    <Anlegekarte titel="Neues Event" knopf="Event anlegen" anlegen={anlegen} abbrechen={abbrechen}>
      <Beschriftet text="Titel">
        <input className="feld" defaultValue="Medica" />
      </Beschriftet>
      <Beschriftet text="Tag" art="tag">
        <input className="feld" type="date" defaultValue="2026-11-16" />
      </Beschriftet>
    </Anlegekarte>,
  );
}

describe("Anlegekarte", () => {
  it("legt mit Enter an — auch aus dem Datumsfeld", () => {
    const anlegen = vi.fn();
    zeige(anlegen);
    fireEvent.submit(screen.getByLabelText("Tag"));
    expect(anlegen).toHaveBeenCalledTimes(1);
  });

  it("beschriftet jedes Feld, statt den Platzhalter dafür zu nehmen", () => {
    zeige(vi.fn());
    expect(screen.getByLabelText("Titel")).toHaveValue("Medica");
  });

  it("sperrt den Knopf, solange der Server arbeitet", async () => {
    let fertig: () => void = () => {};
    const anlegen = vi.fn(() => new Promise<void>((r) => (fertig = r)));
    zeige(anlegen);

    const knopf = screen.getByRole("button", { name: "Event anlegen" });
    fireEvent.click(knopf);
    fireEvent.click(knopf);

    expect(anlegen).toHaveBeenCalledTimes(1);
    expect(knopf).toBeDisabled();
    fertig();
    await vi.waitFor(() => expect(knopf).not.toBeDisabled());
  });

  it("bricht mit Escape ab", () => {
    const abbrechen = vi.fn();
    zeige(vi.fn(), abbrechen);
    fireEvent.keyDown(screen.getByLabelText("Titel"), { key: "Escape" });
    expect(abbrechen).toHaveBeenCalled();
  });

  it("zeigt bei einer leeren Liste kein Abbrechen", () => {
    zeige(vi.fn());
    expect(screen.queryByRole("button", { name: "Abbrechen" })).not.toBeInTheDocument();
  });
});
