/**
 * Kontakte: erst die Liste aller Organisationen, dann eine Organisation ganz.
 *
 * Warum nicht mehr das Board über drei Spuren: In der Spurenansicht stand die
 * Person im Mittelpunkt und die Organisation war nur ihre Überschrift. Gesucht
 * wird aber nach der Organisation („was läuft mit der Förderstelle?"), und die
 * Antwort darauf ist ein Verlauf, der Gespräche mit allen Personen dort und
 * die Post an das Haus selbst in **einem** Faden zeigt. Das Zusammenführen
 * steht in basis/kontakte.ts.
 *
 * Die gewählte Organisation steht im Weg (`/kontakte/12`), nicht im Zustand
 * dieser Ansicht — sonst wirft die Zurück-Geste am Handy jemanden aus der
 * Seite statt eine Ebene hoch. Siehe basis/router.ts.
 */

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
import {
  artText,
  letzterKontakt,
  offenerPunkt,
  passtKontakt,
  passtOrganisation,
  verlaufDerOrganisation,
  verlaufDerPersonen,
  wartenAufUns,
  zeigtLoseZeile,
  VERLAUFSARTEN,
  type Ballfilter,
  type Verlaufszeile,
} from "../basis/kontakte";
import type { Seite } from "../basis/router";
import { heuteAlsDatum } from "../basis/zeit";
import { Zustand } from "../basis/Zustand";
import { Feldtext } from "../bausteine/Feldtext";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

const STUFEN: { wert: Organisation["stufe"]; titel: string }[] = [
  { wert: "erstkontakt", titel: "Erstkontakt" },
  { wert: "antrag", titel: "Antrag läuft" },
  { wert: "partner", titel: "Partner" },
];

/** Der Weg zu den Personen ohne Organisation. Kein Name kann so heißen. */
const LOSE = "lose";

const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

const alsDatum = (iso: string | null) => (iso ? DATUM.format(new Date(`${iso}T00:00:00`)) : "—");
const stufentitel = (stufe: Organisation["stufe"]) =>
  STUFEN.find((s) => s.wert === stufe)?.titel ?? stufe;

async function aendern(pfad: string, daten: Record<string, unknown>): Promise<void> {
  await hole(pfad, { method: "PATCH", body: JSON.stringify(daten) });
}

type Loeschauftrag = { pfad: string; name: string; was: string; danach?: () => void };

export function Kontakte({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const organisationen = useOrganisationen();
  const kontakte = useKontakte();
  const neuLaden = useNeuLaden();

  const [loeschen, setLoeschen] = useState<Loeschauftrag | null>(null);
  const [fehler, setFehler] = useState("");

  if (!organisationen.data)
    return <Zustand abfrage={organisationen} erneut={() => organisationen.refetch()} />;
  if (!kontakte.data) return <Zustand abfrage={kontakte} erneut={() => kontakte.refetch()} />;

  async function entfernen() {
    if (!loeschen) return;
    setFehler("");
    try {
      await hole(loeschen.pfad, { method: "DELETE" });
      loeschen.danach?.();
      setLoeschen(null);
      neuLaden();
    } catch (e) {
      setFehler(
        e instanceof Error &&
          "istInVerwendung" in e &&
          (e as { istInVerwendung: boolean }).istInVerwendung
          ? "Daran hängen noch Personen oder Verlaufseinträge. Die zuerst entfernen oder umhängen."
          : "Das hat nicht geklappt.",
      );
      setLoeschen(null);
    }
  }

  const oeffnen = (ziel: string) => wechseln("kontakte", ziel);
  const zurueck = () => wechseln("kontakte");
  const lose = kontakte.data.filter((k) => k.organisation === null);

  // Ein Weg ins Leere — eine Organisation, die inzwischen weg ist, oder ein
  // altes Lesezeichen — zeigt die Liste. Der nächste Klick rückt auch den Weg
  // wieder gerade; ein Umleiten beim Zeichnen wäre der teurere Weg dorthin.
  const gewaehlt = organisationen.data.find((o) => String(o.id) === unter) ?? null;

  return (
    <div className="spalte">
      {fehler && (
        <div className="karte">
          <p className="rueckmeldung schlecht" style={{ margin: 0 }}>
            {fehler}
          </p>
        </div>
      )}

      {gewaehlt ? (
        <Organisationsseite
          org={gewaehlt}
          organisationen={organisationen.data}
          ich={ich}
          neuLaden={neuLaden}
          zurueck={zurueck}
          zumLoeschen={setLoeschen}
        />
      ) : unter === LOSE ? (
        <LoseSeite
          kontakte={lose}
          organisationen={organisationen.data}
          ich={ich}
          neuLaden={neuLaden}
          zurueck={zurueck}
          zumLoeschen={setLoeschen}
        />
      ) : (
        <Uebersicht
          organisationen={organisationen.data}
          lose={lose}
          ich={ich}
          neuLaden={neuLaden}
          oeffnen={oeffnen}
        />
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

/* --- Die Liste ------------------------------------------------------------ */

function Uebersicht({
  organisationen,
  lose,
  ich,
  neuLaden,
  oeffnen,
}: {
  organisationen: Organisation[];
  lose: Kontakt[];
  ich: Ich;
  neuLaden: () => void;
  oeffnen: (ziel: string) => void;
}) {
  const [suche, setSuche] = useState("");
  const [ball, setBall] = useState<Ballfilter>("alle");
  const [neue, setNeue] = useState({ name: "", typ: "" });
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!neue.name.trim()) return setFehler("Ohne Namen gibt es nichts anzulegen.");
    setFehler("");
    const angelegt = await hole<Organisation>("/organisationen/", {
      method: "POST",
      body: JSON.stringify({ name: neue.name.trim(), typ: neue.typ.trim() }),
    });
    setNeue({ name: "", typ: "" });
    neuLaden();
    // Gleich hinein: Wer eine Organisation anlegt, will als Nächstes die
    // Personen und den ersten Verlaufseintrag eintragen.
    oeffnen(String(angelegt.id));
  }

  const gefiltert = organisationen.filter((o) => passtOrganisation(o, suche, ball));
  const gefilterteLose = lose.filter((k) => passtKontakt(k, suche, ball));
  const nichts = organisationen.length === 0 && lose.length === 0;
  const loseZeigen = zeigtLoseZeile(lose, gefilterteLose, suche, ball);

  // Das Anlegen steht über dem Leerfall, nicht dahinter: Eine Seite, die im
  // leeren Zustand nur erklärt, wofür sie gut wäre, bleibt leer.
  if (nichts)
    return (
      <>
        {ich.darf.bearbeiten && (
          <NeueOrganisation neue={neue} setNeue={setNeue} anlegen={anlegen} fehler={fehler} />
        )}
        <div className="karte">
          <Leerstelle
            was="Noch keine Kontakte"
            satz={
              ich.darf.bearbeiten
                ? "Organisationen sind Förderstellen, Partner und Forschungseinrichtungen. Personen hängen daran — oder stehen als loser Kontakt für sich."
                : "Kontakte legt ein Bearbeiter oder Admin an."
            }
            aktion={
              ich.darf.bearbeiten
                ? { text: "Person ohne Organisation", tun: () => oeffnen(LOSE) }
                : undefined
            }
          />
        </div>
      </>
    );

  return (
    <>
      {ich.darf.bearbeiten && <NeueOrganisation neue={neue} setNeue={setNeue} anlegen={anlegen} fehler={fehler} />}

      <div className="karte">
        <div className="feld-reihe">
          <input
            className="feld"
            placeholder="Suchen — Organisation, Person, offener Punkt …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            aria-label="Suchen"
          />
          <select
            className="feld"
            style={{ flex: "0 1 210px" }}
            value={ball}
            onChange={(e) => setBall(e.target.value as Ballfilter)}
            aria-label="Wer ist am Zug"
          >
            <option value="alle">Alle</option>
            <option value="uns">Warten auf uns</option>
            <option value="ihnen">Wir warten</option>
          </select>
          <Hilfe text="„Warten auf uns“ heißt: wir schulden etwas. „Wir warten“ heißt: der Ball liegt bei den anderen. Der Ball hängt an den Personen — eine Organisation passt, wenn eine ihrer Personen passt." />
        </div>
      </div>

      <div className="karte">
        <h2>Organisationen</h2>
        {gefiltert.length === 0 && !loseZeigen ? (
          <Leerstelle
            was="Nichts gefunden"
            satz="Kein Eintrag passt zu Suche und Filter."
            aktion={{
              text: "Filter zurücksetzen",
              tun: () => {
                setSuche("");
                setBall("alle");
              },
            }}
          />
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Typ</th>
                <th>Stufe</th>
                <th>Personen</th>
                <th>Am Zug</th>
                <th>Zuletzt</th>
                <th>Offener Punkt</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((o) => {
                const offen = offenerPunkt(o.kontakte);
                return (
                  <tr key={o.id}>
                    <td data-spalte="Organisation">
                      <button
                        type="button"
                        className="zeilen-titel"
                        onClick={() => oeffnen(String(o.id))}
                      >
                        <i className="kuerzel">{o.kurz}</i>
                        {o.name}
                      </button>
                    </td>
                    <td data-spalte="Typ">{o.typ || "—"}</td>
                    <td data-spalte="Stufe">
                      <span className={`status stufe-${o.stufe}`}>{stufentitel(o.stufe)}</span>
                    </td>
                    <td data-spalte="Personen" className="zahl">
                      {o.kontakte.length}
                    </td>
                    <td data-spalte="Am Zug">
                      <AmZug kontakte={o.kontakte} />
                    </td>
                    <td data-spalte="Zuletzt" className="zahl">
                      {alsDatum(letzterKontakt(o))}
                    </td>
                    <td data-spalte="Offener Punkt">
                      {offen.text || "—"}
                      {offen.weitere > 0 && <span className="weitere">+{offen.weitere}</span>}
                    </td>
                  </tr>
                );
              })}

              {loseZeigen && (
                <tr>
                  <td data-spalte="Organisation">
                    <button type="button" className="zeilen-titel" onClick={() => oeffnen(LOSE)}>
                      <i className="kuerzel kuerzel-leer">—</i>
                      Lose Kontakte
                    </button>
                  </td>
                  <td data-spalte="Typ">Personen ohne Organisation</td>
                  <td data-spalte="Stufe">—</td>
                  <td data-spalte="Personen" className="zahl">
                    {gefilterteLose.length}
                  </td>
                  <td data-spalte="Am Zug">
                    <AmZug kontakte={gefilterteLose} />
                  </td>
                  <td data-spalte="Zuletzt" className="zahl">
                    {alsDatum(verlaufDerPersonen(gefilterteLose)[0]?.datum ?? null)}
                  </td>
                  <td data-spalte="Offener Punkt">{offenerPunkt(gefilterteLose).text || "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function NeueOrganisation({
  neue,
  setNeue,
  anlegen,
  fehler,
}: {
  neue: { name: string; typ: string };
  setNeue: (n: { name: string; typ: string }) => void;
  anlegen: () => void;
  fehler: string;
}) {
  return (
    <div className="karte">
      <h2>Neue Organisation</h2>
      <div className="feld-reihe">
        <input
          className="feld"
          placeholder="Name"
          value={neue.name}
          onChange={(e) => setNeue({ ...neue, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
        <input
          className="feld"
          placeholder="Typ (Förderstelle, Partner …)"
          value={neue.typ}
          onChange={(e) => setNeue({ ...neue, typ: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
        <button type="button" className="knopf" onClick={anlegen}>
          <Zeichen name="plus" />
          Anlegen
        </button>
      </div>
      <Fehlerzeile text={fehler} />
    </div>
  );
}

function AmZug({ kontakte }: { kontakte: Kontakt[] }) {
  if (kontakte.length === 0) return <>—</>;
  const uns = wartenAufUns(kontakte);
  if (uns === 0) return <span className="ball ball-ihnen">bei ihnen</span>;
  return <span className="ball ball-uns">{uns === kontakte.length ? "bei uns" : `${uns} bei uns`}</span>;
}

/* --- Eine Organisation ---------------------------------------------------- */

function Organisationsseite({
  org,
  organisationen,
  ich,
  neuLaden,
  zurueck,
  zumLoeschen,
}: {
  org: Organisation;
  organisationen: Organisation[];
  ich: Ich;
  neuLaden: () => void;
  zurueck: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  return (
    <>
      <Zurueck name={org.name} zurueck={zurueck} />

      <div className="karte">
        <div className="projekt-kopf">
          <i className="kuerzel">{org.kurz}</i>
          <div style={{ minWidth: 200 }}>
            <h3>
              <Feldtext
                wert={org.name}
                aendern={ich.darf.bearbeiten}
                speichern={async (name) => {
                  await aendern(`/organisationen/${org.id}/`, { name });
                  neuLaden();
                }}
              />
            </h3>
            <div className="unter">
              <Feldtext
                wert={org.typ}
                platzhalter="Typ …"
                aendern={ich.darf.bearbeiten}
                speichern={async (typ) => {
                  await aendern(`/organisationen/${org.id}/`, { typ });
                  neuLaden();
                }}
              />
              {` · ${org.kontakte.length} ${org.kontakte.length === 1 ? "Person" : "Personen"}`}
              {` · zuletzt ${alsDatum(letzterKontakt(org))}`}
            </div>
          </div>

          <div className="kopf-aktionen">
            {ich.darf.bearbeiten && (
              <select
                className="feld"
                value={org.stufe}
                onChange={async (e) => {
                  await aendern(`/organisationen/${org.id}/`, { stufe: e.target.value });
                  neuLaden();
                }}
                aria-label={`Stufe von ${org.name}`}
              >
                {STUFEN.map((s) => (
                  <option key={s.wert} value={s.wert}>
                    {s.titel}
                  </option>
                ))}
              </select>
            )}
            {ich.darf.loeschen && (
              <button
                type="button"
                className="knopf-still"
                onClick={() =>
                  zumLoeschen({
                    pfad: `/organisationen/${org.id}/`,
                    name: org.name,
                    was: "Die Organisation",
                    danach: zurueck,
                  })
                }
              >
                <Zeichen name="korb" />
                Entfernen
              </button>
            )}
          </div>
        </div>

        <span className="beschriftung-klein">Was bringt uns dieser Kontakt?</span>
        <div className="org-nutzen">
          <Feldtext
            wert={org.nutzen}
            mehrzeilig
            platzhalter="Was bringt uns dieser Kontakt?"
            aendern={ich.darf.bearbeiten}
            speichern={async (nutzen) => {
              await aendern(`/organisationen/${org.id}/`, { nutzen });
              neuLaden();
            }}
          />
        </div>
      </div>

      <Personenkarte
        kontakte={org.kontakte}
        organisationen={organisationen}
        gehoertZu={org.id}
        ich={ich}
        neuLaden={neuLaden}
        zumLoeschen={zumLoeschen}
      />

      <Verlaufskarte
        zeilen={verlaufDerOrganisation(org)}
        kontakte={org.kontakte}
        andasHaus={org.id}
        ich={ich}
        neuLaden={neuLaden}
      />
    </>
  );
}

/* --- Personen ohne Organisation ------------------------------------------- */

function LoseSeite({
  kontakte,
  organisationen,
  ich,
  neuLaden,
  zurueck,
  zumLoeschen,
}: {
  kontakte: Kontakt[];
  organisationen: Organisation[];
  ich: Ich;
  neuLaden: () => void;
  zurueck: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  return (
    <>
      <Zurueck name="Lose Kontakte" zurueck={zurueck} />

      <div className="karte">
        <div className="projekt-kopf">
          <i className="kuerzel kuerzel-leer">—</i>
          <div>
            <h3>Lose Kontakte</h3>
            <div className="unter">
              Personen ohne Organisation. Über „Gehört zu“ ordnet man eine einer Organisation zu.
            </div>
          </div>
        </div>
      </div>

      <Personenkarte
        kontakte={kontakte}
        organisationen={organisationen}
        gehoertZu={null}
        ich={ich}
        neuLaden={neuLaden}
        zumLoeschen={zumLoeschen}
      />

      <Verlaufskarte
        zeilen={verlaufDerPersonen(kontakte)}
        kontakte={kontakte}
        andasHaus={null}
        ich={ich}
        neuLaden={neuLaden}
      />
    </>
  );
}

function Zurueck({ name, zurueck }: { name: string; zurueck: () => void }) {
  return (
    <div className="zurueckzeile">
      <button type="button" className="knopf-still" onClick={zurueck}>
        <Zeichen name="zeiger" klasse="zeiger-zurueck" />
        Alle Organisationen
      </button>
      <span className="brotkrume">Kontakte · {name}</span>
    </div>
  );
}

/* --- Die Personenkacheln --------------------------------------------------- */

function Personenkarte({
  kontakte,
  organisationen,
  gehoertZu,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  kontakte: Kontakt[];
  organisationen: Organisation[];
  /** Die Organisation, in der wir gerade stehen — `null` bei den losen. */
  gehoertZu: number | null;
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  const [neue, setNeue] = useState({ name: "", funktion: "" });
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!neue.name.trim()) return setFehler("Ohne Namen lässt sich die Person später nicht zuordnen.");
    setFehler("");
    await hole("/kontakte/", {
      method: "POST",
      body: JSON.stringify({
        name: neue.name.trim(),
        funktion: neue.funktion.trim(),
        organisation: gehoertZu,
      }),
    });
    setNeue({ name: "", funktion: "" });
    neuLaden();
  }

  return (
    <div className="karte">
      <h2>Personen</h2>

      {kontakte.length === 0 ? (
        <Leerstelle
          was="Noch keine Person"
          satz={
            ich.darf.bearbeiten
              ? "Wer sitzt dort, mit wem redet man? Ohne Namen ist der Verlauf später nicht zuzuordnen."
              : "Personen legt ein Bearbeiter oder Admin an."
          }
        />
      ) : (
        <div className="raster raster-3">
          {kontakte.map((k) => (
            <Personenkachel
              key={k.id}
              kontakt={k}
              organisationen={organisationen}
              imHaus={gehoertZu !== null}
              ich={ich}
              neuLaden={neuLaden}
              zumLoeschen={zumLoeschen}
            />
          ))}
        </div>
      )}

      {ich.darf.bearbeiten && (
        <div className="nachtrag">
          <div className="feld-reihe">
            <input
              className="feld"
              placeholder="Name der Person"
              value={neue.name}
              onChange={(e) => setNeue({ ...neue, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <input
              className="feld"
              placeholder="Rolle"
              value={neue.funktion}
              onChange={(e) => setNeue({ ...neue, funktion: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <button type="button" className="knopf-still" onClick={anlegen}>
              <Zeichen name="plus" />
              Person
            </button>
          </div>
          <Fehlerzeile text={fehler} />
        </div>
      )}
    </div>
  );
}

function Personenkachel({
  kontakt,
  organisationen,
  imHaus,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  kontakt: Kontakt;
  organisationen: Organisation[];
  /** Ob wir gerade in einer Organisation stehen — bei den losen nicht. */
  imHaus: boolean;
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  // Bei den losen Personen ist „wohin gehört die?" die Hauptsache und steht
  // offen da. In einer Organisation stünde in jeder Kachel dieselbe Antwort —
  // dreimal dasselbe Feld ist Rauschen, und umgehängt wird selten. Dort liegt
  // es hinter einem Knopf.
  const [haus, setHaus] = useState(!imHaus);

  const speichern = async (daten: Record<string, unknown>) => {
    await aendern(`/kontakte/${kontakt.id}/`, daten);
    neuLaden();
  };

  return (
    <div className="person">
      <div className="person-kopf">
        <div style={{ minWidth: 0 }}>
          <div className="person-name">
            <Feldtext
              wert={kontakt.name}
              aendern={ich.darf.bearbeiten}
              speichern={(name) => speichern({ name })}
            />
          </div>
          <div className="person-rolle">
            <Feldtext
              wert={kontakt.funktion}
              platzhalter="Rolle …"
              aendern={ich.darf.bearbeiten}
              speichern={(funktion) => speichern({ funktion })}
            />
          </div>
        </div>

        {ich.darf.bearbeiten ? (
          <select
            className="ball-wahl"
            data-ball={kontakt.ball}
            value={kontakt.ball}
            onChange={(e) => speichern({ ball: e.target.value })}
            aria-label={`Am Zug bei ${kontakt.name}`}
          >
            <option value="uns">bei uns</option>
            <option value="ihnen">bei ihnen</option>
          </select>
        ) : (
          <span className={`ball ball-${kontakt.ball}`}>
            {kontakt.ball === "uns" ? "bei uns" : "bei ihnen"}
          </span>
        )}
      </div>

      <div className="person-punkt">
        <span className="beschriftung-klein">Offener Punkt</span>
        <Feldtext
          wert={kontakt.offener_punkt}
          platzhalter="Was steht als Nächstes an?"
          aendern={ich.darf.bearbeiten}
          speichern={(offener_punkt) => speichern({ offener_punkt })}
        />
      </div>

      {ich.darf.bearbeiten && haus && (
        <label className="person-haus">
          <span className="beschriftung-klein">Gehört zu</span>
          <select
            className="feld feld-klein"
            value={kontakt.organisation ?? ""}
            onChange={(e) =>
              speichern({ organisation: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Keine Organisation</option>
            {organisationen.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="person-fuss">
        <span>
          Zuletzt <span className="zahl">{alsDatum(kontakt.letzter_kontakt)}</span>
        </span>
        {ich.darf.bearbeiten && imHaus && !haus && (
          <button type="button" className="mini" onClick={() => setHaus(true)}>
            Umhängen
          </button>
        )}
        {ich.darf.loeschen && (
          <button
            type="button"
            className="mini"
            aria-label={`„${kontakt.name}“ entfernen`}
            onClick={() =>
              zumLoeschen({
                pfad: `/kontakte/${kontakt.id}/`,
                name: kontakt.name,
                was: "Die Person mit ihrem Verlauf",
              })
            }
          >
            <Zeichen name="korb" />
          </button>
        )}
      </div>
    </div>
  );
}

/* --- Der Verlauf ---------------------------------------------------------- */

function Verlaufskarte({
  zeilen,
  kontakte,
  andasHaus,
  ich,
  neuLaden,
}: {
  zeilen: Verlaufszeile[];
  kontakte: Kontakt[];
  /** Die Organisation, an die ein Eintrag ohne Person geht — `null` bei den losen. */
  andasHaus: number | null;
  ich: Ich;
  neuLaden: () => void;
}) {
  const [eintrag, setEintrag] = useState(() => ({
    art: "call",
    ziel: andasHaus === null ? String(kontakte[0]?.id ?? "") : "haus",
    datum: heuteAlsDatum(),
    titel: "",
    text: "",
  }));

  // Ohne Ziel kann nichts eingetragen werden: An das Haus geht es nur, wenn es
  // eines gibt; an eine Person nur, wenn eine da ist.
  const kannEintragen = eintrag.ziel === "haus" ? andasHaus !== null : Boolean(eintrag.ziel);
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!kannEintragen)
      return setFehler("Es gibt niemanden, an den der Eintrag gehen könnte — leg zuerst eine Person an.");
    if (!eintrag.titel.trim())
      return setFehler("Trag ein, worum es ging. Ein Eintrag ohne Anlass hilft in einem halben Jahr niemandem.");
    setFehler("");
    await hole("/verlauf/", {
      method: "POST",
      body: JSON.stringify({
        // Genau eines von beiden — das prüft auch der Serializer.
        organisation: eintrag.ziel === "haus" ? andasHaus : null,
        kontakt: eintrag.ziel === "haus" ? null : Number(eintrag.ziel),
        art: eintrag.art,
        datum: eintrag.datum,
        titel: eintrag.titel.trim(),
        text: eintrag.text.trim(),
      }),
    });
    setEintrag({ ...eintrag, titel: "", text: "", datum: heuteAlsDatum() });
    neuLaden();
  }

  return (
    <div className="karte">
      <h2>
        Verlauf
        <Hilfe text="Gespräche mit den Personen und Post an das Haus stehen in einem Faden — sonst sieht man den Verlauf nur halb. Wer angesprochen war, steht unter jedem Eintrag." />
      </h2>

      {ich.darf.bearbeiten && (
        <div className="nachbuchen">
          <div className="feld-reihe">
            <select
              className="feld"
              style={{ flex: "0 1 130px" }}
              value={eintrag.art}
              onChange={(e) => setEintrag({ ...eintrag, art: e.target.value })}
              aria-label="Art"
            >
              {VERLAUFSARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.text}
                </option>
              ))}
            </select>
            <select
              className="feld"
              style={{ flex: "0 1 230px" }}
              value={eintrag.ziel}
              onChange={(e) => setEintrag({ ...eintrag, ziel: e.target.value })}
              aria-label="Mit wem"
            >
              {andasHaus !== null && <option value="haus">An die Organisation</option>}
              {kontakte.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="feld"
              style={{ flex: "0 1 170px" }}
              value={eintrag.datum}
              onChange={(e) => setEintrag({ ...eintrag, datum: e.target.value })}
              aria-label="Datum"
            />
            <input
              className="feld"
              style={{ flex: "1 1 220px" }}
              placeholder="Worum ging es?"
              value={eintrag.titel}
              onChange={(e) => setEintrag({ ...eintrag, titel: e.target.value })}
            />
            <input
              className="feld"
              style={{ flex: "1 1 260px" }}
              placeholder="Ergebnis, nächster Schritt …"
              value={eintrag.text}
              onChange={(e) => setEintrag({ ...eintrag, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            {/* Nicht stillgelegt: Ein grauer Knopf sagt nicht, was fehlt. Er
                nimmt den Klick an und antwortet in der Zeile darunter. */}
            <button type="button" className="knopf" onClick={anlegen}>
              <Zeichen name="plus" />
              Eintragen
            </button>
          </div>
          <Fehlerzeile text={fehler} />
        </div>
      )}

      {zeilen.length === 0 ? (
        <Leerstelle
          was="Noch kein Verlauf"
          satz="Halte hier fest, was besprochen wurde — in einem halben Jahr weiß es sonst niemand mehr."
        />
      ) : (
        <ul className="verlauf">
          {zeilen.map((z) => (
            <li key={z.id}>
              <span className="zahl datum">{alsDatum(z.datum)}</span>
              <div style={{ flex: 1 }}>
                <b>{z.titel}</b>
                {z.text && <p>{z.text}</p>}
                <span className="verlauf-fuss">
                  {artText(z.art)} · {z.wem || "an die Organisation"}
                  {/* Woher der Eintrag kommt. Ohne das steht auf der
                      Kontaktseite ein Gespräch ohne Anlass. */}
                  {z.event_titel && ` · auf ${z.event_titel}`}
                  {z.wer_name && ` · notiert von ${z.wer_name}`}
                </span>
              </div>
              {ich.darf.loeschen && (
                <button
                  type="button"
                  className="mini"
                  aria-label="Eintrag entfernen"
                  onClick={async () => {
                    await hole(`/verlauf/${z.id}/`, { method: "DELETE" });
                    neuLaden();
                  }}
                >
                  <Zeichen name="kreuz" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
