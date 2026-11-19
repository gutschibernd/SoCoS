import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, useTeam, type Ich, type Teammitglied } from "../basis/daten";
import { melden } from "../basis/meldungen";
import { anlegeBefehl, inZwischenablage, passwortBefehl } from "../basis/serverbefehl";
import { Zustand } from "../basis/Zustand";
import { Hinweis } from "./Hinweis";
import { Zeichen } from "./Zeichen";

/* Kurz in der Auswahl, ausgeschrieben im ⓘ darüber: Mit „Bearbeiter — alles
   außer löschen und Finanzen" war das Feld breiter als die Spalte und wurde
   mitten im Wort abgeschnitten. */
const ROLLEN = [
  { wert: "admin", text: "Admin" },
  { wert: "bearbeiter", text: "Bearbeiter" },
  { wert: "leser", text: "Leser" },
] as const;

/**
 * Die Nutzerverwaltung für den Admin.
 *
 * **Konten werden hier nicht angelegt** und Passwörter nicht gesetzt. Das geht
 * nur über `nutzer_anlegen` und `nutzer_passwort` an der Konsole des Servers.
 * Ein Formular im Browser hieße, dass irgendwann jemand ein Passwort in ein
 * Feld tippt — und damit in Server-Protokolle, in den Browserverlauf und in
 * den Passwortspeicher. Was hier steht, ist der **fertige Befehl zum
 * Kopieren** (Bernd, 2026-11-19): Pfad, Compose-Datei und Adresse tippt
 * niemand mehr ab, das Passwort fragt weiter die Konsole.
 *
 * **Stillgelegte Konten stehen hinter einem Umschalter**, wie das Archiv der
 * Praktikumsthemen. Sie sind die Mehrheit der Zeilen und fast nie gemeint;
 * vorher musste man an ihnen vorbei, um die drei Aktiven zu finden.
 */
export function Team({ ich }: { ich: Ich }) {
  const team = useTeam();
  const neuLaden = useNeuLaden();
  const [stillgelegte, setStillgelegte] = useState(false);
  // Ein Befehl, den der Browser nicht kopieren ließ — er steht dann zum
  // Markieren über der Liste, statt dass der Knopf still nichts tut.
  const [zumMarkieren, setZumMarkieren] = useState<string | null>(null);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  const aktive = team.data.filter((p) => p.is_active);
  const stille = team.data.filter((p) => !p.is_active);
  const liste = stillgelegte ? stille : aktive;

  async function kopieren(befehl: string, gut: string) {
    if (await inZwischenablage(befehl)) {
      setZumMarkieren(null);
      melden("gut", gut);
    } else {
      setZumMarkieren(befehl);
    }
  }

  async function rolleSetzen(p: Teammitglied, rolle: string) {
    await hole(`/nutzer/${p.id}/rolle/`, {
      method: "POST",
      body: JSON.stringify({ rolle }),
    });
    melden("gut", `${p.name} ist jetzt ${ROLLEN.find((r) => r.wert === rolle)?.text ?? rolle}.`);
    neuLaden();
  }

  async function umschalten(p: Teammitglied) {
    await hole(`/nutzer/${p.id}/${p.is_active ? "stilllegen" : "aktivieren"}/`, { method: "POST" });
    melden("gut", p.is_active ? `${p.name} ist stillgelegt.` : `${p.name} ist wieder aktiv.`);
    neuLaden();
  }

  return (
    <>
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>
            {stillgelegte ? "Konten · stillgelegt" : "Konten"}{" "}
            <Hinweis
              worum="Was heißt stilllegen"
              text="Ein stillgelegtes Konto kann sich nicht mehr anmelden. Seine Zeiten bleiben im Zeitnachweis — darum wird stillgelegt und nie gelöscht."
            />
          </b>
          <span>
            {aktive.length === 1 ? "1 aktiv" : `${aktive.length} aktiv`}
            {stille.length > 0 && ` · ${stille.length} stillgelegt`}
          </span>
        </div>
        <div className="vorhaben-aktionen">
          {(stillgelegte || stille.length > 0) && (
            <button
              type="button"
              className="knopf-still"
              aria-pressed={stillgelegte}
              onClick={() => setStillgelegte((s) => !s)}
            >
              <Zeichen name="archiv" />
              Stillgelegt <span className="zahl">{stille.length}</span>
            </button>
          )}
          <button
            type="button"
            className="knopf-still"
            onClick={() =>
              kopieren(
                anlegeBefehl(),
                "Der Befehl zum Anlegen ist in der Zwischenablage — Adresse und Name an der Konsole ersetzen.",
              )
            }
          >
            <Zeichen name="kopie" />
            Befehl: Konto anlegen
          </button>
        </div>
      </div>

      {zumMarkieren && (
        <div className="karte befehlkarte">
          <span className="beschriftung-klein">Der Browser lässt das Kopieren nicht zu — bitte markieren</span>
          <code>{zumMarkieren}</code>
          <button type="button" className="mini" onClick={() => setZumMarkieren(null)}>
            Schließen
          </button>
        </div>
      )}

      <div className="karte">
        {liste.length === 0 ? (
          <div className="leerstelle">
            <b>Kein Konto stillgelegt</b>
            <p>Stillgelegt wird ein Konto an seiner Zeile unter den aktiven.</p>
            <button type="button" className="knopf-still" onClick={() => setStillgelegte(false)}>
              Zu den aktiven Konten
            </button>
          </div>
        ) : (
          <table className="tabelle kontotabelle">
            <thead>
              <tr>
                <th>Person</th>
                <th>
                  Rolle{" "}
                  <Hinweis
                    worum="Was die Rollen dürfen"
                    text="Admin darf alles. Bearbeiter darf alles außer löschen und Finanzen. Leser sieht alles und ändert nichts."
                  />
                </th>
                <th aria-label="Griffe" />
              </tr>
            </thead>
            <tbody>
              {liste.map((p) => (
                <tr key={p.id} data-still={p.is_active ? undefined : "ja"}>
                  <td data-spalte="">
                    <span className="konto-person">
                      {/* Die Farbe ist die des Kontos, wie in der Leiste — ein Datum, kein Ton der Palette. */}
                      <i className="konto-kuerzel" style={{ background: p.farbe }}>
                        {p.initialen}
                      </i>
                      <span>
                        <b>
                          {p.name}
                          {p.id === ich.id && <span className="team-du">du</span>}
                        </b>
                        <em>{p.email}</em>
                      </span>
                    </span>
                  </td>
                  <td data-spalte="Rolle">
                    {p.id === ich.id ? (
                      // Sonst nimmt sich der letzte Admin versehentlich selbst die
                      // Rechte und kommt an die Verwaltung nicht mehr heran.
                      <span className="status status-laeuft">
                        {ROLLEN.find((r) => r.wert === p.rolle)?.text ?? "ohne Rolle"}
                      </span>
                    ) : (
                      <select
                        className="feld konto-rolle"
                        value={p.rolle ?? ""}
                        onChange={(e) => rolleSetzen(p, e.target.value)}
                        aria-label={`Rolle von ${p.name}`}
                      >
                        {p.rolle === null && <option value="">ohne Rolle</option>}
                        {ROLLEN.map((r) => (
                          <option key={r.wert} value={r.wert}>
                            {r.text}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-spalte="" data-breit="ja">
                    <div className="zeilen-aktionen">
                      <button
                        type="button"
                        className="mini"
                        title={passwortBefehl(p.email)}
                        onClick={() =>
                          kopieren(
                            passwortBefehl(p.email),
                            `Der Passwort-Befehl für ${p.name} ist in der Zwischenablage.`,
                          )
                        }
                      >
                        <Zeichen name="kopie" />
                        Passwort-Befehl
                      </button>
                      {p.id !== ich.id && (
                        <button type="button" className="mini" onClick={() => umschalten(p)}>
                          {p.is_active ? "Stilllegen" : "Wieder aktivieren"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
