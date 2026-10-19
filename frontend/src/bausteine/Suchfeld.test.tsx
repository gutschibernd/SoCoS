/**
 * Das Suchfeld steht über jeder Liste. Was hier kaputtgeht, fällt auf jeder
 * Seite zugleich aus — und zwar still: Eine Suche, die sich nicht leeren
 * lässt, sieht aus wie eine Liste, in der etwas fehlt.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Suchfeld, useSuchtaste } from "./Suchfeld";

function Probe({ anfang = "", von = 10, gezeigt = 3 }: { anfang?: string; von?: number; gezeigt?: number }) {
  const [wert, setWert] = useState(anfang);
  useSuchtaste();
  return (
    <>
      <input aria-label="Anderes Feld" />
      <Suchfeld wert={wert} setzen={setWert} platzhalter="Suchen …" treffer={{ gezeigt, von }} />
    </>
  );
}

const suchfeld = () => screen.getByRole("searchbox", { name: "Suchen" });

describe("Suchfeld", () => {
  it("leert sich mit dem Kreuz und behält den Fokus", () => {
    render(<Probe anfang="Wien" />);
    fireEvent.click(screen.getByRole("button", { name: "Suche leeren" }));
    expect(suchfeld()).toHaveValue("");
    expect(suchfeld()).toHaveFocus();
  });

  it("leert sich mit Escape", () => {
    render(<Probe anfang="Wien" />);
    fireEvent.keyDown(suchfeld(), { key: "Escape" });
    expect(suchfeld()).toHaveValue("");
  });

  it("nennt die Treffer nur, solange gesucht wird", () => {
    const { unmount } = render(<Probe anfang="" />);
    expect(screen.queryByText("3 von 10")).not.toBeInTheDocument();
    unmount();

    render(<Probe anfang="Wien" />);
    expect(screen.getByText("3 von 10")).toBeInTheDocument();
  });

  it("sagt „nichts“ statt „0 von 10“", () => {
    render(<Probe anfang="xyz" gezeigt={0} />);
    expect(screen.getByText("nichts")).toBeInTheDocument();
  });

  it("springt mit „/“ hinein — aber nicht aus einem anderen Feld heraus", () => {
    render(<Probe />);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(suchfeld()).toHaveFocus();

    // Wer in einem anderen Feld „/" tippt, meint das Zeichen.
    const anderes = screen.getByRole("textbox", { name: "Anderes Feld" });
    anderes.focus();
    fireEvent.keyDown(anderes, { key: "/" });
    expect(anderes).toHaveFocus();
  });
});
