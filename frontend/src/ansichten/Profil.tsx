import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, type Ich } from "../basis/daten";
import { melden } from "../basis/meldungen";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Protokoll } from "../bausteine/Protokoll";
import { Team } from "../bausteine/Team";

const FELDER: { schluessel: string; titel: string; typ?: string }[] = [
  { schluessel: "name", titel: "Name" },
  { schluessel: "funktion", titel: "Rolle" },
  { schluessel: "email", titel: "E-Mail", typ: "email" },
  { schluessel: "telefon", titel: "Telefon", typ: "tel" },
  { schluessel: "strasse", titel: "Adresse" },
  { schluessel: "ort", titel: "Ort" },
  { schluessel: "geburtsdatum", titel: "Geburtsdatum", typ: "date" },
];

export function Profil({ ich }: { ich: Ich }) {
  const neuLaden = useNeuLaden();
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(FELDER.map((f) => [f.schluessel, (ich as never as Record<string, string>)[f.schluessel] ?? ""])),
  );
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler] = useState("");

  async function speichern() {
    if (!werte.name?.trim()) return setFehler("Ohne Namen steht im Team und im Zeitnachweis eine leere Zeile.");
    setFehler("");
    await hole(`/nutzer/${ich.id}/`, { method: "PATCH", body: JSON.stringify(werte) });
    setGespeichert(true);
    melden("gut", "Profil gespeichert.");
    neuLaden();
  }

  return (
    <div className="spalte">
    <div className="karte" style={{ maxWidth: 620 }}>
      <h2>Stammdaten</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-leise)" }}>
        Adresse und Geburtsdatum sehen nur du und ein Administrator. Name, Rolle,
        E-Mail und Telefon sehen alle im Team.
      </p>

      {FELDER.map((feld) => (
        <label key={feld.schluessel} style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
            {feld.titel}
          </span>
          <input
            className="feld"
            type={feld.typ ?? "text"}
            value={werte[feld.schluessel] ?? ""}
            onChange={(e) => {
              setWerte({ ...werte, [feld.schluessel]: e.target.value });
              setGespeichert(false);
              setFehler("");
            }}
          />
        </label>
      ))}

      <div className="feld-reihe" style={{ marginTop: 16 }}>
        <button type="button" className="knopf" onClick={speichern}>
          Speichern
        </button>
        {gespeichert && <span className="rueckmeldung gut">Gespeichert.</span>}
        <Fehlerzeile text={fehler} />
      </div>
    </div>

    {ich.darf.nutzer_verwalten && <Team ich={ich} />}
    <Protokoll />
    </div>
  );
}
