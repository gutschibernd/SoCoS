import { hole } from "../basis/api";
import { useNeuLaden, useTeam, type Ich } from "../basis/daten";
import { melden } from "../basis/meldungen";
import { Hilfe } from "./Hilfe";

const ROLLEN = [
  { wert: "admin", text: "Admin — darf alles" },
  { wert: "bearbeiter", text: "Bearbeiter — alles außer löschen und Finanzen" },
  { wert: "leser", text: "Leser — sieht alles, ändert nichts" },
];

/**
 * Die Nutzerverwaltung für den Admin.
 *
 * **Konten werden hier nicht angelegt.** Das geht nur über `nutzer_anlegen` an
 * der Kommandozeile, und das Passwort setzt danach `nutzer_passwort`
 * interaktiv. Ein Anlegeformular im Browser hieße, dass irgendwann jemand ein
 * Passwort in ein Formularfeld tippt — und damit in Server-Protokolle, in den
 * Browserverlauf und in den Passwortspeicher des Browsers.
 */
export function Team({ ich }: { ich: Ich }) {
  const team = useTeam();
  const neuLaden = useNeuLaden();

  if (!team.data) return null;

  async function rolleSetzen(id: number, rolle: string) {
    await hole(`/nutzer/${id}/rolle/`, { method: "POST", body: JSON.stringify({ rolle }) });
    melden("gut", "Rolle geändert.");
    neuLaden();
  }

  async function umschalten(id: number, aktiv: boolean) {
    await hole(`/nutzer/${id}/${aktiv ? "aktivieren" : "stilllegen"}/`, { method: "POST" });
    melden("gut", aktiv ? "Konto wieder aktiv." : "Konto stillgelegt.");
    neuLaden();
  }

  return (
    <div className="karte">
      <h2>
        Team
        <Hilfe text="Konten legt ein Administrator an der Kommandozeile an (nutzer_anlegen), das Passwort setzt nutzer_passwort interaktiv. Im Browser gibt es kein Anlegeformular — sonst landete irgendwann ein Passwort im Browserverlauf." />
      </h2>

      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
            <th>Rolle</th>
            <th>Zustand</th>
          </tr>
        </thead>
        <tbody>
          {team.data.map((p) => (
            <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
              <td data-spalte="Name">
                <span className="team-punkt" style={{ background: p.farbe }} />
                {p.name}
                {p.id === ich.id && <span className="team-du">du</span>}
              </td>
              <td data-spalte="E-Mail">{p.email}</td>
              <td data-spalte="Rolle">
                {p.id === ich.id ? (
                  // Sonst nimmt sich der letzte Admin versehentlich selbst die
                  // Rechte und kommt an die Verwaltung nicht mehr heran.
                  <span className="status status-laeuft">
                    {ROLLEN.find((r) => r.wert === p.rolle)?.wert ?? "—"}
                  </span>
                ) : (
                  <select
                    className="feld"
                    value={p.rolle ?? ""}
                    onChange={(e) => rolleSetzen(p.id, e.target.value)}
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
              <td data-spalte="Zustand">
                {p.id === ich.id ? (
                  <span style={{ color: "var(--text-leise)" }}>aktiv</span>
                ) : (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => umschalten(p.id, !p.is_active)}
                  >
                    {p.is_active ? "Stilllegen" : "Wieder aktivieren"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="nachweis-hinweis">
        Ein stillgelegtes Konto kann sich nicht mehr anmelden. Seine gebuchten
        Zeiten bleiben erhalten und stehen weiter im Zeitnachweis — deshalb wird
        ein Konto stillgelegt und nie gelöscht.
      </p>
    </div>
  );
}
