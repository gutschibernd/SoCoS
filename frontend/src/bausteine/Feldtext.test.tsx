/**
 * Der Feldtext hat keinen Speichern-Knopf. Damit ist das, was nach dem
 * Verlassen des Feldes dasteht, die einzige Bestätigung — und genau das war
 * kaputt: Der Prop `wert` trägt bis zum Nachladen den alten Stand.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Feldtext } from "./Feldtext";

/** Öffnet das Feld, tippt hinein und klickt heraus. */
function aendere(neu: string) {
  fireEvent.click(screen.getByTitle("Zum Ändern klicken"));
  const feld = screen.getByRole("textbox");
  fireEvent.change(feld, { target: { value: neu } });
  fireEvent.blur(feld);
}

describe("Feldtext", () => {
  it("zeigt den neuen Text, obwohl `wert` noch den alten trägt", async () => {
    const speichern = vi.fn().mockResolvedValue(undefined);
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Neu");

    expect(speichern).toHaveBeenCalledWith("Neu");
    // Der Aufrufer hat noch nicht neu geladen — trotzdem muss „Neu" dastehen.
    expect(await screen.findByText("Neu")).toBeInTheDocument();
    expect(screen.queryByText("Alt")).not.toBeInTheDocument();
  });

  it("nimmt den Entwurf zurück, wenn das Speichern scheitert", async () => {
    const speichern = vi.fn().mockRejectedValue(new Error("nein"));
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Neu");

    // Sonst stünde ein Text auf dem Bildschirm, den der Server nicht hat.
    expect(await screen.findByText("Alt")).toBeInTheDocument();
  });

  it("speichert nicht, wenn sich nichts geändert hat", () => {
    const speichern = vi.fn();
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Alt");

    expect(speichern).not.toHaveBeenCalled();
  });

  it("nimmt mit Escape zurück, ohne zu speichern", () => {
    const speichern = vi.fn();
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    fireEvent.click(screen.getByTitle("Zum Ändern klicken"));
    const feld = screen.getByRole("textbox");
    fireEvent.change(feld, { target: { value: "Neu" } });
    fireEvent.keyDown(feld, { key: "Escape" });

    expect(speichern).not.toHaveBeenCalled();
    expect(screen.getByText("Alt")).toBeInTheDocument();
  });
});
