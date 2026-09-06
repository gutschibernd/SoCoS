import { describe, expect, it } from "vitest";

import { ApiFehler } from "./api";

describe("ApiFehler", () => {
  it("unterscheidet 'nicht angemeldet' von 'nicht berechtigt'", () => {
    // Ohne diese Unterscheidung schickt das Frontend jemanden, dem bloß eine
    // Seite verwehrt ist, zurück zur Anmeldung — obwohl seine Sitzung steht.
    const abgemeldet = new ApiFehler(403, "not_authenticated", null, "");
    const verwehrt = new ApiFehler(403, "permission_denied", null, "");

    expect(abgemeldet.istAbgemeldet).toBe(true);
    expect(abgemeldet.istVerwehrt).toBe(false);
    expect(verwehrt.istAbgemeldet).toBe(false);
    expect(verwehrt.istVerwehrt).toBe(true);
  });

  it("erkennt 409 als 'wird noch verwendet'", () => {
    expect(new ApiFehler(409, "in_verwendung", null, "").istInVerwendung).toBe(true);
    expect(new ApiFehler(400, null, null, "").istInVerwendung).toBe(false);
  });
});
