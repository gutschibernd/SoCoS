import { useState } from "react";

import { hole } from "../basis/api";
import {
  useKontakte,
  useNeuLaden,
  useOrganisationen,
  type Ich,
  type Kontakt,
  type Organisation,
} from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";

const SPUREN: { wert: Organisation["stufe"]; titel: string }[] = [
  { wert: "erstkontakt", titel: "Erstkontakt" },
  { wert: "antrag", titel: "Antrag läuft" },
  { wert: "partner", titel: "Partner" },
];

const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function Kontakte({ ich }: { ich: Ich }) {
  const organisationen = useOrganisationen();
  const kontakte = useKontakte();
  const neuLaden = useNeuLaden();

  const [suche, setSuche] = useState("");
  const [ballFilter, setBallFilter] = useState<"alle" | "uns" | "ihnen">("alle");
  const [neueOrg, setNeueOrg] = useState({ name: "", typ: "" });
  const [neuerKontakt, setNeuerKontakt] = useState({ name: "", funktion: "", organisation: "" });
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);

  if (!organisationen.data) return <Zustand abfrage={organisationen} erneut={() => organisationen.refetch()} />;
  if (!kontakte.data) return <Zustand abfrage={kontakte} erneut={() => kontakte.refetch()} />;

  async function orgAnlegen() {
    if (!neueOrg.name.trim()) return;
    await hole("/organisationen/", {
      method: "POST",
      body: JSON.stringify({ name: neueOrg.name.trim(), typ: neueOrg.typ.trim() }),
    });
    setNeueOrg({ name: "", typ: "" });
    neuLaden();
  }

  async function kontaktAnlegen() {
    if (!neuerKontakt.name.trim()) return;
    await hole("/kontakte/", {
      method: "POST",
      body: JSON.stringify({
        name: neuerKontakt.name.trim(),
        funktion: neuerKontakt.funktion.trim(),
        organisation: neuerKontakt.organisation ? Number(neuerKontakt.organisation) : null,
      }),
    });
    setNeuerKontakt({ name: "", funktion: "", organisation: "" });
    neuLaden();
  }

  const passt = (k: Kontakt) =>
    (ballFilter === "alle" || k.ball === ballFilter) &&
    (!suche || `${k.name} ${k.organisation_name} ${k.funktion}`.toLowerCase().includes(suche.toLowerCase()));

  const lose = kontakte.data.filter((k) => k.organisation === null && passt(k));
  const gewaehlterKontakt = kontakte.data.find((k) => k.id === gewaehlt) ?? null;

  const leer = organisationen.data.length === 0 && kontakte.data.length === 0;

  return (
    <div className="spalte">
      {ich.darf.bearbeiten && (
        <div className="karte">
          <h2>Neu anlegen</h2>
          <div className="feld-reihe">
            <input className="feld" placeholder="Organisation" value={neueOrg.name} onChange={(e) => setNeueOrg({ ...neueOrg, name: e.target.value })} />
            <input className="feld" placeholder="Typ (Förderstelle, Partner …)" value={neueOrg.typ} onChange={(e) => setNeueOrg({ ...neueOrg, typ: e.target.value })} />
            <button type="button" className="knopf-still" onClick={orgAnlegen}>
              Organisation
            </button>
          </div>
          <div className="feld-reihe" style={{ marginTop: 8 }}>
            <input className="feld" placeholder="Name der Person" value={neuerKontakt.name} onChange={(e) => setNeuerKontakt({ ...neuerKontakt, name: e.target.value })} />
            <input className="feld" placeholder="Rolle" value={neuerKontakt.funktion} onChange={(e) => setNeuerKontakt({ ...neuerKontakt, funktion: e.target.value })} />
            <select className="feld" value={neuerKontakt.organisation} onChange={(e) => setNeuerKontakt({ ...neuerKontakt, organisation: e.target.value })} aria-label="Organisation">
              <option value="">Loser Kontakt</option>
              {organisationen.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button type="button" className="knopf" onClick={kontaktAnlegen}>
              Kontakt
            </button>
          </div>
        </div>
      )}

      {leer ? (
        <div className="karte">
          <Leerstelle
            was="Noch keine Kontakte"
            satz={
              ich.darf.bearbeiten
                ? "Organisationen sind Förderstellen, Partner und Forschungseinrichtungen. Personen hängen daran — oder stehen als loser Kontakt für sich."
                : "Kontakte legt ein Bearbeiter oder Admin an."
            }
          />
        </div>
      ) : (
        <>
          <div className="karte">
            <div className="feld-reihe">
              <input className="feld" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Suchen" />
              <select className="feld" value={ballFilter} onChange={(e) => setBallFilter(e.target.value as typeof ballFilter)} aria-label="Wer ist am Zug">
                <option value="alle">Alle</option>
                <option value="uns">Warten auf uns</option>
                <option value="ihnen">Wir warten</option>
              </select>
              <Hilfe text={`„Warten auf uns“ heißt: wir schulden etwas. „Wir warten“ heißt: der Ball liegt bei den anderen.`} />
            </div>
          </div>

          <div className="raster raster-3">
            {SPUREN.map((spur) => {
              const orgs = organisationen.data!.filter((o) => o.stufe === spur.wert);
              return (
                <div className="karte" key={spur.wert}>
                  <h2>{spur.titel}</h2>
                  {orgs.length === 0 ? (
                    <Leerstelle was="Keine Organisation in dieser Stufe" satz="" />
                  ) : (
                    orgs.map((o) => (
                      <div className="org" key={o.id}>
                        <div className="org-kopf">
                          <i>{o.kurz}</i>
                          <b>{o.name}</b>
                        </div>
                        {o.typ && <div className="org-typ">{o.typ}</div>}
                        {o.nutzen && <p className="org-nutzen">{o.nutzen}</p>}
                        <ul className="org-personen">
                          {o.kontakte.filter(passt).map((k) => (
                            <li key={k.id}>
                              <button type="button" onClick={() => setGewaehlt(k.id)}>
                                {k.name}
                                <span className={`ball ball-${k.ball}`}>
                                  {k.ball === "uns" ? "bei uns" : "bei ihnen"}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div className="karte">
            <h2>Lose Kontakte</h2>
            {lose.length === 0 ? (
              <Leerstelle was="Keine losen Kontakte" satz="Personen ohne Organisation stehen hier." />
            ) : (
              <ul className="org-personen">
                {lose.map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => setGewaehlt(k.id)}>
                      {k.name}
                      <span className={`ball ball-${k.ball}`}>
                        {k.ball === "uns" ? "bei uns" : "bei ihnen"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {gewaehlterKontakt && (
            <div className="karte">
              <h2>{gewaehlterKontakt.name}</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-leise)" }}>
                {gewaehlterKontakt.funktion || "—"}
                {gewaehlterKontakt.organisation_name && ` · ${gewaehlterKontakt.organisation_name}`}
              </p>
              {gewaehlterKontakt.offener_punkt && (
                <p style={{ margin: "0 0 12px", fontSize: 14 }}>
                  <b>Offen:</b> {gewaehlterKontakt.offener_punkt}
                </p>
              )}
              {gewaehlterKontakt.verlauf.length === 0 ? (
                <Leerstelle was="Noch kein Verlauf" satz="Halte hier fest, was besprochen wurde — in einem halben Jahr weiß es sonst niemand mehr." />
              ) : (
                <ul className="verlauf">
                  {gewaehlterKontakt.verlauf.map((v) => (
                    <li key={v.id}>
                      <span className="zahl datum">{DATUM.format(new Date(v.datum))}</span>
                      <div>
                        <b>{v.titel}</b>
                        {v.text && <p>{v.text}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
