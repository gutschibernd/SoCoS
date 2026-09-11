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
  ANREDEN,
  artText,
  ballText,
  mailentwurf,
  letzterKontakt,
  offenerPunkt,
  gesuchtePersonen,
  passtKontakt,
  passtOrganisation,
  sortiereOrganisationen,
  verlaufDerOrganisation,
  verlaufDerPersonen,
  prioritaetstext,
  stufenrang,
  stufentitel,
  wartenAufUns,
  zeigtLoseZeile,
  BAELLE,
  PRIORITAETEN,
  STUFEN,
  VERLAUFSARTEN,
  type Ballfilter,
  type Sortierung,
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

/** Der Weg zu den Personen ohne Organisation. Kein Name kann so heißen. */
const LOSE = "lose";

const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

const alsDatum = (iso: string | null) => (iso ? DATUM.format(new Date(`${iso}T00:00:00`)) : "—");

/**
 * Die Nähe als Leiter: so viele Marken gefüllt, wie die Stufe weit ist.
 *
 * Warum nicht mehr ein farbiger Chip je Kategorie: Drei Chips waren drei
 * Schubladen, und dass eine über der anderen steht, sah man ihnen nicht an.
 * Fünf Marken zeigen die Ordnung ohne ein Wort, und im Überfliegen einer
 * Liste sieht man, wo etwas erst anfängt und wo etwas trägt.
 *
 * Die Marken selbst sind für den Screenreader nichts — die Beschriftung
 * daneben sagt dasselbe in Worten, und „Punkt Punkt Punkt" sagt gar nichts.
 */
function Naehe({ stufe }: { stufe: Organisation["stufe"] }) {
  const rang = stufenrang(stufe);
  return (
    <span className="leiter">
      <span className="leiter-marken" aria-hidden="true">
        {STUFEN.map((s, i) => (
          <i key={s.wert} className={i < rang ? "voll" : ""} />
        ))}
      </span>
      <span className="leiter-text">{stufentitel(stufe)}</span>
    </span>
  );
}

/**
 * Ein Spaltenkopf, nach dem sich sortieren lässt.
 *
 * Ein Knopf im `<th>` und kein `onClick` auf dem `<th>` selbst: Ein Kopf mit
 * Klick erreicht niemand mit der Tastatur — derselbe Grund wie bei der
 * Zeilenüberschrift darunter. `aria-sort` sagt dem Screenreader, was gerade
 * gilt; das Zeichen daneben sagt es dem Auge.
 */
function Sortierkopf({
  titel,
  nach,
  sortierung,
  sortieren,
  children,
}: {
  titel: string;
  nach: Sortierung["nach"];
  sortierung: Sortierung;
  sortieren: (nach: Sortierung["nach"]) => void;
  children?: React.ReactNode;
}) {
  const aktiv = sortierung.nach === nach;
  return (
    <th aria-sort={aktiv ? (sortierung.auf ? "ascending" : "descending") : "none"}>
      <button type="button" className="sortierkopf" onClick={() => sortieren(nach)}>
        {titel}
        <Zeichen
          name={aktiv && !sortierung.auf ? "hoch" : "runter"}
          klasse={aktiv ? "sortierpfeil" : "sortierpfeil still"}
        />
      </button>
      {children}
    </th>
  );
}

/**
 * Das Verwertungspotential, in der Zeile änderbar.
 *
 * Ein Auswahlfeld und kein Weg über die Organisationsseite: Eine Liste
 * durchgehen und dabei einschätzen ist **ein** Vorgang — wer für jedes Haus
 * hinein- und wieder herausklicken muss, schätzt beim vierten nichts mehr ein.
 *
 * Gespeichert wird sofort, ohne Knopf daneben: Es ist ein Wert aus vier, und
 * ein falscher ist mit demselben Griff zurückgestellt.
 */
function Prio({
  organisation,
  ich,
  neuLaden,
}: {
  organisation: Organisation;
  ich: Ich;
  neuLaden: () => void;
}) {
  if (!ich.darf.bearbeiten)
    return <span className={`prio prio-${organisation.prioritaet}`}>{prioritaetstext(organisation.prioritaet)}</span>;

  return (
    <select
      className="prio-wahl"
      data-prio={organisation.prioritaet}
      value={organisation.prioritaet}
      aria-label={`Priorität von ${organisation.name}`}
      onChange={async (e) => {
        await aendern(`/organisationen/${organisation.id}/`, { prioritaet: e.target.value });
        neuLaden();
      }}
    >
      {PRIORITAETEN.map((p) => (
        <option key={p.wert} value={p.wert}>
          {p.text}
        </option>
      ))}
    </select>
  );
}

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

/**
 * Die Namen, auf die eine Suche in dieser Zeile zeigt.
 *
 * Sie stehen unter dem Organisationsnamen und nicht in einer eigenen Spalte:
 * Eine Spalte wäre bei jeder Suche da und sonst leer — und am Handy, wo aus
 * der Zeile eine Karte wird, hinge sie als Feld ohne Inhalt darunter.
 *
 * Kein eigener Klick je Name: Der führte auf dieselbe Organisationsseite wie
 * die Zeile darüber. Zwei Wege zum selben Ort sind einer zu viel.
 */
function Gefundene({ personen }: { personen: Kontakt[] }) {
  if (personen.length === 0) return null;
  return (
    <div className="gefundene">
      {personen.map((k) => (
        <span key={k.id} className="gefunden">
          {k.name}
          {k.funktion && <span className="gefunden-rolle"> · {k.funktion}</span>}
        </span>
      ))}
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
  // Nach Namen, wie die Liste vom Server kommt. Die Sortierung steht im
  // Zustand der Ansicht und nicht im Weg: Sie ist eine Blickrichtung auf
  // dieselbe Liste, kein anderer Ort — genau wie Suche und Ballfilter.
  const [sortierung, setSortierung] = useState<Sortierung>({ nach: "name", auf: true });

  /* Erneut auf dieselbe Spalte dreht die Richtung um; eine andere Spalte
     fängt bei ihrer natürlichen Richtung an — Namen von A an, Priorität mit
     dem Wichtigsten oben. */
  const sortieren = (nach: Sortierung["nach"]) =>
    setSortierung((s) => (s.nach === nach ? { nach, auf: !s.auf } : { nach, auf: true }));

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

  const gefiltert = sortiereOrganisationen(
    organisationen.filter((o) => passtOrganisation(o, suche, ball)),
    sortierung,
  );
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
            <option value="nichts">Nichts offen</option>
          </select>
          <Hilfe text="„Warten auf uns“ heißt: wir schulden etwas. „Wir warten“ heißt: der Ball liegt bei den anderen. „Nichts offen“ heißt: der Kontakt läuft, aber gerade steht nichts an. Der Ball hängt an den Personen — eine Organisation passt, wenn eine ihrer Personen passt." />

          {/*
            Dasselbe wie ein Klick auf den Spaltenkopf, nur am Handy: Dort wird
            aus der Tabelle eine Karte, und der Kopf — mit ihm die Sortierung —
            ist ausgeblendet. Beide schreiben in denselben Zustand; ein zweiter
            Sortierbegriff daneben wäre eine zweite Wahrheit.
          */}
          <select
            className="feld nur-handy"
            value={`${sortierung.nach}-${sortierung.auf ? "auf" : "ab"}`}
            onChange={(e) => {
              const [nach, richtung] = e.target.value.split("-");
              setSortierung({ nach: nach as Sortierung["nach"], auf: richtung === "auf" });
            }}
            aria-label="Sortierung"
          >
            <option value="name-auf">Name A–Z</option>
            <option value="name-ab">Name Z–A</option>
            <option value="prioritaet-auf">Prio — wichtig zuerst</option>
            <option value="prioritaet-ab">Prio — wichtig zuletzt</option>
          </select>
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
                <Sortierkopf titel="Organisation" nach="name" sortierung={sortierung} sortieren={sortieren} />
                <th>Typ</th>
                <th>Stufe</th>
                <Sortierkopf titel="Prio" nach="prioritaet" sortierung={sortierung} sortieren={sortieren}>
                  <Hilfe text="Wie viel für uns drinsteckt — das Verwertungspotential. Nicht dasselbe wie die Stufe: Die sagt, wie nah wir uns sind. Eine Förderstelle, mit der wir noch nie geredet haben, kann das Wichtigste auf der Liste sein." />
                </Sortierkopf>
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
                      <Gefundene personen={gesuchtePersonen(o.kontakte, suche)} />
                    </td>
                    <td data-spalte="Typ">{o.typ || "—"}</td>
                    <td data-spalte="Stufe">
                      <Naehe stufe={o.stufe} />
                    </td>
                    <td data-spalte="Prio">
                      <Prio organisation={o} ich={ich} neuLaden={neuLaden} />
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
                    <Gefundene personen={gesuchtePersonen(gefilterteLose, suche)} />
                  </td>
                  <td data-spalte="Typ">Personen ohne Organisation</td>
                  <td data-spalte="Stufe">—</td>
                  {/* Lose Kontakte sind keine Organisation und haben keine
                      Priorität — hier stünde sonst ein Auswahlfeld, das
                      nirgends hinschreibt. */}
                  <td data-spalte="Prio">—</td>
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

/**
 * Ein Ball für die ganze Organisation, obwohl er an den Personen hängt.
 *
 * Gezeigt wird der dringendste Stand: Eine Schuld von uns steht über einem
 * Warten, und beides steht über „nichts offen". Andersherum sähe eine Zeile
 * ruhig aus, in der eine Person seit Wochen auf uns wartet.
 */
function AmZug({ kontakte }: { kontakte: Kontakt[] }) {
  if (kontakte.length === 0) return <>—</>;
  const uns = wartenAufUns(kontakte);
  if (uns > 0) {
    return <span className="ball ball-uns">{uns === kontakte.length ? "bei uns" : `${uns} bei uns`}</span>;
  }
  const ball = kontakte.some((k) => k.ball === "ihnen") ? "ihnen" : "nichts";
  return <span className={`ball ball-${ball}`}>{ballText(ball)}</span>;
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
      <Brotkrume name={org.name} />

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
            {/* Wer nicht bearbeiten darf, sah die Stufe hier bisher gar nicht —
                sie hing an der Auswahlliste. Die Leiter sagt dasselbe, ohne
                etwas anzubieten, das ohnehin nicht geht. */}
            {ich.darf.bearbeiten ? (
              <>
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
                <Hilfe text="Wie weit die Beziehung ist, nicht was gerade läuft. Erstkontakt: einmal gesprochen. Kennengelernt: wir wissen, wer dort was macht. Im Austausch: es meldet sich auch jemand von dort. Angebahnt: eine Zusammenarbeit ist konkret unterwegs — ein Antrag, ein Termin, ein Vertrag. Partner: die Zusammenarbeit läuft." />
              </>
            ) : (
              <Naehe stufe={org.stufe} />
            )}
            {/* Dieselbe Auswahl wie in der Übersicht: Wer hier einschätzt,
                sucht sie nicht erst eine Ebene höher. */}
            <Prio organisation={org} ich={ich} neuLaden={neuLaden} />
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
  zumLoeschen,
}: {
  kontakte: Kontakt[];
  organisationen: Organisation[];
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  return (
    <>
      <Brotkrume name="Lose Kontakte" />

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

/**
 * Nur noch die Ortsangabe. Der Knopf „Alle Organisationen", der hier stand,
 * ist der Zurück-Knopf in der Titelzeile geworden — er tut dasselbe (eine
 * Ebene hoch, siehe basis/router.ts) und steht auf jeder Seite an derselben
 * Stelle, statt auf zweien von acht.
 */
function Brotkrume({ name }: { name: string }) {
  return (
    <div className="zurueckzeile">
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
  ich,
  neuLaden,
  zumLoeschen,
}: {
  kontakt: Kontakt;
  organisationen: Organisation[];
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
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
            {BAELLE.map((b) => (
              <option key={b.wert} value={b.wert}>
                {b.text}
              </option>
            ))}
          </select>
        ) : (
          <span className={`ball ball-${kontakt.ball}`}>{ballText(kontakt.ball)}</span>
        )}
      </div>

      {/* Mail und Telefon als Zeilen mit eigenem Zeichen statt mit
          Beschriftung: „E-Mail: …" daneben wäre in einer Kachel aus fünf
          Angaben die Hälfte der Zeile Rauschen. Wer nichts eingetragen hat,
          sieht den Platzhalter — und weiß damit, dass hier etwas hingehört. */}
      <div className="person-draht">
        <span className="draht-zeile">
          <Zeichen name="brief" klasse="draht-zeichen" />
          {kontakt.email && !ich.darf.bearbeiten ? (
            <a className="draht-verweis" href={`mailto:${kontakt.email}`}>
              {kontakt.email}
            </a>
          ) : (
            <Feldtext
              wert={kontakt.email}
              platzhalter="E-Mail …"
              aendern={ich.darf.bearbeiten}
              speichern={(email) => speichern({ email })}
            />
          )}
        </span>
        <span className="draht-zeile">
          <Zeichen name="hoerer" klasse="draht-zeichen" />
          {kontakt.telefon && !ich.darf.bearbeiten ? (
            <a className="draht-verweis zahl" href={`tel:${kontakt.telefon.replace(/[^+\d]/g, "")}`}>
              {kontakt.telefon}
            </a>
          ) : (
            <Feldtext
              wert={kontakt.telefon}
              platzhalter="Telefon …"
              klasse="zahl"
              aendern={ich.darf.bearbeiten}
              speichern={(telefon) => speichern({ telefon })}
            />
          )}
        </span>
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

      {/* Woher die Person kommt. Steht nur da, wenn sie auf einem Event
          angelegt wurde — eine Zeile „kennengelernt: —" bei allen anderen
          wäre eine Frage, die niemand gestellt hat. Nicht änderbar: Das ist
          eine Tatsache von damals, kein Feld zum Pflegen. */}
      {kontakt.kennengelernt_auf_titel && (
        <div className="person-herkunft">
          <Zeichen name="fahne" klasse="draht-zeichen" />
          Kennengelernt auf {kontakt.kennengelernt_auf_titel}
        </div>
      )}

      {/* „Gehört zu" steht offen da, auch innerhalb einer Organisation, wo in
          jeder Kachel dasselbe Haus steht. Hier stand ein Knopf „Umhängen",
          der das Feld erst aufklappte: ein Griff mehr für die Zuordnung, die
          das Auswählen ohnehin schon erledigt. Wer das Feld sieht, ordnet zu;
          wer erst raten muss, wo es steckt, tut es nicht.

          Die Anrede daneben ist kein Titel und keine Angabe über die Person,
          sondern das, was im Mailentwurf vor dem Namen steht — deshalb steht
          sie bei den Feldern und nicht beim Namen, und deshalb sieht sie nur,
          wer auch bearbeiten darf. */}
      {ich.darf.bearbeiten && (
        <div className="person-felder">
          <label className="person-anrede">
            <span className="beschriftung-klein">Anrede</span>
            <select
              className="feld feld-klein"
              value={kontakt.anrede}
              onChange={(e) => speichern({ anrede: e.target.value })}
            >
              {ANREDEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.text}
                </option>
              ))}
            </select>
          </label>
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
        </div>
      )}

      <div className="person-fuss">
        <span>
          Zuletzt <span className="zahl">{alsDatum(kontakt.letzter_kontakt)}</span>
        </span>
        {/* Öffnet das Mailprogramm mit fertiger Anrede. Ein Verweis und kein
            Knopf: `mailto:` ist eine Adresse, und der Browser weiß selbst, was
            er damit tut — ein `onClick` mit `location.href` wäre dasselbe,
            nur ohne Kontextmenü und ohne Tastaturbedienung. Ohne hinterlegte
            Adresse steht er gar nicht da; ein abgeblendeter Knopf, der nichts
            tut, ist eine Frage ohne Antwort. */}
        {kontakt.email && (
          <a className="mini" href={mailentwurf(kontakt)} aria-label={`Mail an ${kontakt.name}`}>
            <Zeichen name="brief" />
            Mail
          </a>
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
