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

  it("behält den Entwurf im offenen Feld, wenn das Speichern scheitert", async () => {
    const speichern = vi.fn().mockRejectedValue(new Error("nein"));
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Ein langer Text, den niemand zweimal tippen will");

    // Bis 2026-11-04 stand hier wieder „Alt" — und alles Getippte war weg,
    // nur die Warnung blieb. Das offene Feld zeigt, dass nichts gespeichert ist.
    const feld = await screen.findByRole("textbox");
    expect(feld).toHaveValue("Ein langer Text, den niemand zweimal tippen will");
  });

  it("behält den Entwurf auch, wenn `speichern` den Fehler schluckt und `false` liefert", async () => {
    const speichern = vi.fn().mockResolvedValue(false);
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Neu");

    expect(await screen.findByRole("textbox")).toHaveValue("Neu");
  });

  it("nimmt nach einem gescheiterten Speichern mit Escape auf den alten Stand zurück", async () => {
    const speichern = vi.fn().mockRejectedValue(new Error("nein"));
    render(<Feldtext wert="Alt" aendern speichern={speichern} />);

    aendere("Neu");
    fireEvent.keyDown(await screen.findByRole("textbox"), { key: "Escape" });

    expect(screen.getByText("Alt")).toBeInTheDocument();
  });

  it("lässt nicht mehr Zeichen zu, als der Server annimmt", () => {
    render(<Feldtext wert="" aendern hoechstens={250} speichern={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Zum Ändern klicken"));

    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "250");
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
