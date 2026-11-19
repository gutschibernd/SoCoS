import { describe, expect, it } from "vitest";

import { anlegeBefehl, passwortBefehl } from "./serverbefehl";

describe("Befehle für die Konsole", () => {
  // Genau so tippt Bernd ihn am Server — ein falscher Pfad hieße, dass der
  // kopierte Befehl an der Konsole scheitert, und das fiele erst dort auf.
  it("setzt das Passwort für genau diese Adresse", () => {
    expect(passwortBefehl("ries@sopharmis.com")).toBe(
      "cd /opt/socos && docker compose -f betrieb/anwendung.yml exec anwendung python manage.py nutzer_passwort ries@sopharmis.com",
    );
  });

  it("legt ein Konto ohne Passwort an, mit Rolle", () => {
    expect(anlegeBefehl()).toMatch(/manage\.py nutzer_anlegen \S+@\S+ "[^"]+" --rolle bearbeiter$/);
    expect(anlegeBefehl()).not.toMatch(/passwort/i);
  });
});
