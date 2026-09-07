import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { hole } from "../basis/api";
import { Zustand } from "../basis/Zustand";
import { Hilfe } from "./Hilfe";
import { Leerstelle } from "./Leerstelle";

type Eintrag = {
  id: number;
  zeitpunkt: string;
  nutzer_text: string;
  modell: string;
  objekt_text: string;
  aktion: string;
  aenderungen: Record<string, { alt: unknown; neu: unknown }>;
};

const ZEIT = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const AKTION: Record<string, string> = {
  angelegt: "angelegt",
  geaendert: "geändert",
  geloescht: "entfernt",
  wiederhergestellt: "wiederhergestellt",
};

/** socos.Arbeitspaket → Arbeitspaket */
const kurz = (modell: string) => modell.split(".").pop() ?? modell;

const wert = (v: unknown) =>
  v === null || v === "" ? "leer" : typeof v === "object" ? JSON.stringify(v) : String(v);

/**
 * Das Änderungsprotokoll zum Nachschlagen.
 *
 * In einem MedTech-Umfeld ist „wer hat diese Zeit nachträglich geändert" keine
 * Neugier. Das Protokoll gibt es seit dem ersten Modell — hier wird es
 * lesbar, ohne dass jemand den Django-Admin öffnen muss.
 */
export function Protokoll() {
  const [alle, setAlle] = useState(false);
  const abfrage = useQuery({
    queryKey: ["protokoll"],
    queryFn: () => hole<Eintrag[]>("/protokoll/"),
  });

  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  const eintraege = alle ? abfrage.data : abfrage.data.slice(0, 25);

  return (
    <div className="karte">
      <h2>
        Änderungsprotokoll
        <Hilfe text="Wer, wann, was, alt → neu. Wird bei jeder Änderung geschrieben und nie verändert. Auch das Entfernen steht hier — gelöscht wird nur weich, ein Admin kann es zurückholen." />
      </h2>

      {abfrage.data.length === 0 ? (
        <Leerstelle was="Noch keine Einträge" satz="Sobald etwas angelegt oder geändert wird, steht es hier." />
      ) : (
        <>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Wann</th>
                <th>Wer</th>
                <th>Was</th>
                <th>Aktion</th>
                <th>Änderung</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td data-spalte="Wann" className="zahl">{ZEIT.format(new Date(e.zeitpunkt))}</td>
                  <td data-spalte="Wer">{e.nutzer_text || "System"}</td>
                  <td data-spalte="Was">
                    <span className="protokoll-modell">{kurz(e.modell)}</span>
                    {e.objekt_text}
                  </td>
                  <td data-spalte="Aktion">{AKTION[e.aktion] ?? e.aktion}</td>
                  <td data-spalte="Änderung">
                    {Object.keys(e.aenderungen).length === 0
                      ? "—"
                      : Object.entries(e.aenderungen).map(([feld, v]) => (
                          <div key={feld} className="protokoll-feld">
                            <b>{feld}</b>: {wert(v.alt)} → {wert(v.neu)}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {abfrage.data.length > 25 && (
            <button type="button" className="knopf-still" style={{ marginTop: 12 }} onClick={() => setAlle((a) => !a)}>
              {alle ? "Nur die letzten 25" : `Alle ${abfrage.data.length} anzeigen`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
