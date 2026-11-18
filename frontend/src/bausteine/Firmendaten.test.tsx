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

  it("kopiert die IBAN ohne Leerzeichen, und ihre Prüfziffer stimmt", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    expect(screen.getByText("AT41 2081 5000 4769 4104")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /IBAN kopieren/ }));
    await waitFor(() => expect(schreiben).toHaveBeenCalledWith("AT412081500047694104"));
    // ISO 13616: die ersten vier Zeichen ans Ende, Buchstaben als Zahlen,
    // Rest modulo 97 muss 1 sein. Fängt den Tippfehler, bevor ihn eine Bank fängt.
    const iban = "AT412081500047694104";
    const ziffern = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    expect(BigInt(ziffern) % 97n).toBe(1n);
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

  it("kopiert die Rechnungsadresse mit UID, Einleitung und Versand nur mit Haken", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    const kopieren = () => fireEvent.click(screen.getByRole("button", { name: "Rechnungsadresse kopieren" }));
    const block =
      "Sopharmis Medical Solutions FlexCo\nHermann-Findenegg Weg 7\n9500 Villach, Österreich\nUID: ATU83918619";

    expect(screen.getByRole("checkbox", { name: "Einleitung" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Versandadresse" })).not.toBeChecked();
    kopieren();
    await waitFor(() => expect(schreiben).toHaveBeenLastCalledWith(block));

    fireEvent.click(screen.getByRole("checkbox", { name: "Einleitung" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Versandadresse" }));
    kopieren();
    await waitFor(() =>
      expect(schreiben).toHaveBeenLastCalledWith(
        `Unsere Rechnungsadresse lautet:\n${block}\n\n` +
          "Versand bitte an:\nBernd Gutschi\nAntoniensteig 5a\n9500 Villach\nÖsterreich",
      ),
    );
  });

  it("schreibt auf Englisch, was hinausgeht — Namen und Nummern bleiben", async () => {
    const schreiben = zwischenablage(async () => {});
    render(<Firmendaten schliessen={() => {}} />);
    expect(screen.getByRole("radio", { name: "Deutsch" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Einleitung" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Versandadresse" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechnungsadresse kopieren" }));
    await waitFor(() =>
      expect(schreiben).toHaveBeenLastCalledWith(
        "Our billing address is:\nSopharmis Medical Solutions FlexCo\nHermann-Findenegg Weg 7\n" +
          "9500 Villach, Austria\nVAT ID: ATU83918619\n\n" +
          "Please ship to:\nBernd Gutschi\nAntoniensteig 5a\n9500 Villach\nAustria",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Land kopieren/ }));
    await waitFor(() => expect(schreiben).toHaveBeenLastCalledWith("Austria"));
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
