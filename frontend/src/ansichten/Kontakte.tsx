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
import { Feldtext } from "../bausteine/Feldtext";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";

const SPUREN: { wert: Organisation["stufe"]; titel: string }[] = [
  { wert: "erstkontakt", titel: "Erstkontakt" },
  { wert: "antrag", titel: "Antrag läuft" },
  { wert: "partner", titel: "Partner" },
];

const ARTEN = [
  { wert: "meeting", text: "Meeting" },
  { wert: "mail", text: "Mail" },
  { wert: "call", text: "Call" },
  { wert: "event", text: "Event" },
];

const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

async function aendern(pfad: string, daten: Record<string, unknown>): Promise<void> {
  await hole(pfad, { method: "PATCH", body: JSON.stringify(daten) });
}

export function Kontakte({ ich }: { ich: Ich }) {
  const organisationen = useOrganisationen();
  const kontakte = useKontakte();
  const neuLaden = useNeuLaden();

  const [suche, setSuche] = useState("");
  const [ballFilter, setBallFilter] = useState<"alle" | "uns" | "ihnen">("alle");
  const [neueOrg, setNeueOrg] = useState({ name: "", typ: "" });
  const [neuerKontakt, setNeuerKontakt] = useState({ name: "", funktion: "", organisation: "" });
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [loeschen, setLoeschen] = useState<{ pfad: string; name: string; was: string } | null>(null);
  const [fehler, setFehler] = useState("");

  if (!organisationen.data)
    return <Zustand abfrage={organisationen} erneut={() => organisationen.refetch()} />;
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

  async function entfernen() {
    if (!loeschen) return;
    setFehler("");
    try {
      await hole(loeschen.pfad, { method: "DELETE" });
      setLoeschen(null);
      setGewaehlt(null);
      neuLaden();
    } catch (e) {
      setFehler(
        e instanceof Error && "istInVerwendung" in e && (e as { istInVerwendung: boolean }).istInVerwendung
          ? "Daran hängen noch Personen oder Verlaufseinträge. Die zuerst entfernen oder umhängen."
          : "Das hat nicht geklappt.",
      );
      setLoeschen(null);
    }
  }

  const passt = (k: Kontakt) =>
    (ballFilter === "alle" || k.ball === ballFilter) &&
    (!suche ||
      `${k.name} ${k.organisation_name} ${k.funktion} ${k.offener_punkt}`
        .toLowerCase()
        .includes(suche.toLowerCase()));

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

      {fehler && (
        <div className="karte">
          <p className="rueckmeldung schlecht" style={{ margin: 0 }}>
            {fehler}
          </p>
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
                          <b>
                            <Feldtext
                              wert={o.name}
                              aendern={ich.darf.bearbeiten}
                              speichern={async (name) => {
                                await aendern(`/organisationen/${o.id}/`, { name });
                                neuLaden();
                              }}
                            />
                          </b>
                          {ich.darf.loeschen && (
                            <button
                              type="button"
                              className="mini"
                              title={`„${o.name}“ entfernen`}
                              onClick={() =>
                                setLoeschen({
                                  pfad: `/organisationen/${o.id}/`,
                                  name: o.name,
                                  was: "Die Organisation",
                                })
                              }
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {ich.darf.bearbeiten && (
                          <select
                            className="feld feld-klein"
                            value={o.stufe}
                            onChange={async (e) => {
                              await aendern(`/organisationen/${o.id}/`, { stufe: e.target.value });
                              neuLaden();
                            }}
                            aria-label={`Stufe von ${o.name}`}
                          >
                            {SPUREN.map((sp) => (
                              <option key={sp.wert} value={sp.wert}>
                                {sp.titel}
                              </option>
                            ))}
                          </select>
                        )}

                        <div className="org-typ">
                          <Feldtext
                            wert={o.typ}
                            platzhalter="Typ …"
                            aendern={ich.darf.bearbeiten}
                            speichern={async (typ) => {
                              await aendern(`/organisationen/${o.id}/`, { typ });
                              neuLaden();
                            }}
                          />
                        </div>

                        <div className="org-nutzen">
                          <Feldtext
                            wert={o.nutzen}
                            mehrzeilig
                            platzhalter="Was bringt uns dieser Kontakt?"
                            aendern={ich.darf.bearbeiten}
                            speichern={async (nutzen) => {
                              await aendern(`/organisationen/${o.id}/`, { nutzen });
                              neuLaden();
                            }}
                          />
                        </div>

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
            <KontaktTiefe
              kontakt={gewaehlterKontakt}
              organisationen={organisationen.data}
              ich={ich}
              neuLaden={neuLaden}
              schliessen={() => setGewaehlt(null)}
              zumLoeschen={() =>
                setLoeschen({
                  pfad: `/kontakte/${gewaehlterKontakt.id}/`,
                  name: gewaehlterKontakt.name,
                  was: "Die Person mit ihrem Verlauf",
                })
              }
            />
          )}
        </>
      )}

      {loeschen && (
        <Loeschdialog
          name={loeschen.name}
          was={loeschen.was}
          abbrechen={() => setLoeschen(null)}
          loeschen={entfernen}
        />
      )}
    </div>
  );
}

function KontaktTiefe({
  kontakt,
  organisationen,
  ich,
  neuLaden,
  schliessen,
  zumLoeschen,
}: {
  kontakt: Kontakt;
  organisationen: Organisation[];
  ich: Ich;
  neuLaden: () => void;
  schliessen: () => void;
  zumLoeschen: () => void;
}) {
  const [eintrag, setEintrag] = useState({ art: "call", titel: "", text: "" });

  async function verlaufAnlegen() {
    if (!eintrag.titel.trim()) return;
    await hole("/verlauf/", {
      method: "POST",
      body: JSON.stringify({
        kontakt: kontakt.id,
        art: eintrag.art,
        titel: eintrag.titel.trim(),
        text: eintrag.text.trim(),
      }),
    });
    setEintrag({ art: "call", titel: "", text: "" });
    neuLaden();
  }

  return (
    <div className="karte" style={{ borderTop: "3px solid var(--marke)" }}>
      <div className="projekt-kopf">
        <div style={{ minWidth: 200 }}>
          <h3>
            <Feldtext
              wert={kontakt.name}
              aendern={ich.darf.bearbeiten}
              speichern={async (name) => {
                await aendern(`/kontakte/${kontakt.id}/`, { name });
                neuLaden();
              }}
            />
          </h3>
          <div className="unter">
            <Feldtext
              wert={kontakt.funktion}
              platzhalter="Rolle …"
              aendern={ich.darf.bearbeiten}
              speichern={async (funktion) => {
                await aendern(`/kontakte/${kontakt.id}/`, { funktion });
                neuLaden();
              }}
            />
          </div>
        </div>
        <button type="button" className="knopf-still" onClick={schliessen}>
          Schließen
        </button>
        {ich.darf.loeschen && (
          <button type="button" className="knopf-still" onClick={zumLoeschen}>
            Entfernen
          </button>
        )}
      </div>

      {ich.darf.bearbeiten && (
        <div className="feld-reihe" style={{ marginBottom: 14 }}>
          <select
            className="feld"
            value={kontakt.organisation ?? ""}
            onChange={async (e) => {
              await aendern(`/kontakte/${kontakt.id}/`, {
                organisation: e.target.value ? Number(e.target.value) : null,
              });
              neuLaden();
            }}
            aria-label="Organisation"
          >
            <option value="">Loser Kontakt</option>
            {organisationen.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="feld"
            value={kontakt.ball}
            onChange={async (e) => {
              await aendern(`/kontakte/${kontakt.id}/`, { ball: e.target.value });
              neuLaden();
            }}
            aria-label="Wer ist am Zug"
          >
            <option value="uns">Am Zug: wir</option>
            <option value="ihnen">Am Zug: die anderen</option>
          </select>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <span className="beschriftung-klein">Offener Punkt</span>
        <div style={{ fontSize: 15 }}>
          <Feldtext
            wert={kontakt.offener_punkt}
            platzhalter="Was steht als Nächstes an?"
            aendern={ich.darf.bearbeiten}
            speichern={async (offener_punkt) => {
              await aendern(`/kontakte/${kontakt.id}/`, { offener_punkt });
              neuLaden();
            }}
          />
        </div>
      </div>

      {ich.darf.bearbeiten && (
        <div className="nachtrag" style={{ marginBottom: 14 }}>
          <div className="feld-reihe">
            <select className="feld" style={{ flex: "0 1 130px" }} value={eintrag.art} onChange={(e) => setEintrag({ ...eintrag, art: e.target.value })} aria-label="Art">
              {ARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.text}
                </option>
              ))}
            </select>
            <input className="feld" placeholder="Worum ging es?" value={eintrag.titel} onChange={(e) => setEintrag({ ...eintrag, titel: e.target.value })} />
            <input className="feld" placeholder="Ergebnis, nächster Schritt …" value={eintrag.text} onChange={(e) => setEintrag({ ...eintrag, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && verlaufAnlegen()} />
            <button type="button" className="knopf" onClick={verlaufAnlegen}>
              Eintragen
            </button>
          </div>
        </div>
      )}

      {kontakt.verlauf.length === 0 ? (
        <Leerstelle
          was="Noch kein Verlauf"
          satz="Halte hier fest, was besprochen wurde — in einem halben Jahr weiß es sonst niemand mehr."
        />
      ) : (
        <ul className="verlauf">
          {kontakt.verlauf.map((v) => (
            <li key={v.id}>
              <span className="zahl datum">{DATUM.format(new Date(v.datum))}</span>
              <div style={{ flex: 1 }}>
                <b>{v.titel}</b>
                {v.text && <p>{v.text}</p>}
                <span className="verlauf-fuss">
                  {ARTEN.find((a) => a.wert === v.art)?.text ?? v.art}
                  {v.wer_name && ` · ${v.wer_name}`}
                </span>
              </div>
              {ich.darf.loeschen && (
                <button
                  type="button"
                  className="mini"
                  title="Eintrag entfernen"
                  onClick={async () => {
                    await hole(`/verlauf/${v.id}/`, { method: "DELETE" });
                    neuLaden();
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
