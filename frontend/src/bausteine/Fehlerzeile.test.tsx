import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Fehlerzeile } from "./Fehlerzeile";

describe("Fehlerzeile", () => {
  it("steht nicht im Weg, solange nichts fehlt", () => {
    const { container } = render(<Fehlerzeile text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("meldet sich als Alarm, damit eine Vorlesesoftware den Satz sagt", () => {
    render(<Fehlerzeile text="Ohne Titel gibt es nichts anzulegen." />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ohne Titel gibt es nichts anzulegen.",
    );
  });
});
