import { describe, expect, it } from "vitest";

import { ApiFehler } from "./api";
import { anmeldeZiel, fuehrtZurAnmeldung } from "./anmeldung";

describe("wann es zur Anmeldung geht", () => {
  it("bei 'nicht angemeldet'", () => {
    expect(fuehrtZurAnmeldung(new ApiFehler(403, "not_authenticated", null, ""))).toBe(
      true,
    );
  });

  it("nicht bei 'nicht berechtigt'", () => {
    // Die Sitzung steht. Wer hier zur Anmeldung geschickt wird, verliert sie
    // für nichts und landet danach wieder auf derselben verwehrten Seite.
    expect(fuehrtZurAnmeldung(new ApiFehler(403, "permission_denied", null, ""))).toBe(
      false,
    );
  });

  it("nicht bei einem Serverfehler und nicht bei fehlendem Fehler", () => {
    expect(fuehrtZurAnmeldung(new ApiFehler(500, null, null, ""))).toBe(false);
    expect(fuehrtZurAnmeldung(null)).toBe(false);
    expect(fuehrtZurAnmeldung(new Error("irgendwas"))).toBe(false);
  });
});

describe("Rücksprungziel", () => {
  it("hängt den Weg an, auf dem man war", () => {
    expect(anmeldeZiel("/zeit")).toBe("/anmelden/?next=%2Fzeit");
    expect(anmeldeZiel("/projekt?p=ams")).toBe("/anmelden/?next=%2Fprojekt%3Fp%3Dams");
  });
});
