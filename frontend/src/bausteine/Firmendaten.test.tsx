import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Firmendaten } from "./Firmendaten";

function zwischenablage(schreiben: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(schreiben) }, configurable: true });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

afterEach(() => vi.restoreAllMocks());

describe("Firmendaten", () => {
  it("kopiert genau den Wert der Zeile, ohne Bezeichnung", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /UID-Nummer kopieren/ }));
    await waitFor(() => expect(schreiben).toHaveBeenCalledWith("ATU83918619"));
    expect(await screen.findByText("Kopiert")).toBeInTheDocument();
  });

  it("kopiert die Anschrift am Stück, wie sie in einem Brief steht", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ganze Anschrift" }));
    await waitFor(() =>
      expect(schreiben).toHaveBeenCalledWith(
        "Sopharmis Medical Solutions FlexCo\nHermann-Findenegg Weg 7\n9500 Villach, Österreich",
      ),
    );
  });

  it("kopiert die Rechnungsadresse mit UID, die Einleitung nur mit Haken", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    const block =
      "Sopharmis Medical Solutions FlexCo\nHermann-Findenegg Weg 7\n9500 Villach, Österreich\nUID: ATU83918619";

    const haken = screen.getByRole("checkbox", { name: "Einleitung" });
    expect(haken).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Rechnungsadresse kopieren" }));
    await waitFor(() => expect(schreiben).toHaveBeenLastCalledWith(block));

    fireEvent.click(haken);
    fireEvent.click(screen.getByRole("button", { name: "Rechnungsadresse kopieren" }));
    await waitFor(() =>
      expect(schreiben).toHaveBeenLastCalledWith(`Unsere Rechnungsadresse lautet:\n\n${block}`),
    );
  });

  it("sagt an der Zeile, wenn der Browser die Zwischenablage verweigert", async () => {
    zwischenablage(async () => {
      throw new Error("verweigert");
    });
    render(<Firmendaten schliessen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Steuernummer kopieren/ }));
    expect(await screen.findByText("Bitte markieren")).toBeInTheDocument();
  });

  it("schließt mit Esc und mit dem Klick daneben", () => {
    const schliessen = vi.fn();
    render(<Firmendaten schliessen={schliessen} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));
    expect(schliessen).toHaveBeenCalledTimes(2);
  });
});
