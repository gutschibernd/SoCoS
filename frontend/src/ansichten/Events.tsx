/**
 * Events: erst die Liste, dann ein Event ganz.
 *
 * Ein Event ist der Anlass, bei dem man Leute trifft — eine Tagung, ein
 * Kongress, ein Messetag. Die Seite trägt zwei Dinge:
 *
 * - **Der Verlauf**: was besprochen wurde. Das sind gewöhnliche
 *   Verlaufseinträge mit einem Verweis auf das Event — dieselben Einträge, die
 *   auch auf der Kontakteseite stehen. Keine zweite Verlaufssorte.
 * - **Die Hitlist**: wen wollen wir dort ansprechen, und weshalb. Jede Zeile
 *   zeigt auf eine Organisation **oder** auf eine Person aus den Kontakten —
 *   nicht auf einen frei getippten Namen. Sonst stünde nach der Tagung eine
 *   Liste da, die mit den Kontakten nichts zu tun hat.
 *
 * **Der Verlauf steht oben, die Hitlist zugeklappt darunter.** Die Hitlist ist
 * die Vorbereitung; während des Events und danach ist der Verlauf das, was
 * gebraucht wird. Und **ein Verlaufseintrag hängt an keiner Hitlist-Zeile**:
 * Wen man trifft, entscheidet der Gang über den Flur, nicht der Plan von
 * vorher. Wer erst vor Ort kennengelernt wird, wird im Verlaufsformular
 * angelegt — samt seinem Haus, wenn SoCoS das noch nicht kennt.
 *
 * Das gewählte Event steht im Weg (`/events/3`), nicht im Zustand dieser
 * Ansicht — aus demselben Grund wie bei den Kontakten (siehe basis/router.ts).
 */

import { useState } from "react";

import { hole } from "../basis/api";
import {
  useEvents,
  useKontakte,
  useNeuLaden,
  useOrganisationen,
  useTeam,
  type Event,
  type Eventziel,
  type Ich,
  type Kontakt,
  type Organisation,
  type Teammitglied,
} from "../basis/daten";
import {
  alsAnfrage,
  letzterTag,
  nochOffen,
  passtEvent,
  teileNachZeit,
  wen,
  wenGetroffen,
  zaehlung,
  type Auswahl,
  type Zaehlung,
} from "../basis/events";
import { artText } from "../basis/kontakte";
import { melden } from "../basis/meldungen";
import type { Seite } from "../basis/router";
import { heuteAlsDatum } from "../basis/zeit";
import { Zustand } from "../basis/Zustand";
import { Feldtext } from "../bausteine/Feldtext";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Zeichen } from "../bausteine/Zeichen";

const STAENDE: { wert: Eventziel["stand"]; text: string }[] = [
  { wert: "offen", text: "offen" },
  { wert: "getroffen", text: "getroffen" },
  { wert: "verpasst", text: "verpasst" },
];

const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
const TAG_MONAT = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit" });

const alsTag = (iso: string) => DATUM.format(new Date(`${iso}T00:00:00`));
const alsDatum = (iso: string | null) => (iso ? alsTag(iso) : "—");

/** „14.10.2026" oder „14.10.–16.10.2026" — das Jahr nur einmal. */
function zeitraum(event: Event): string {
  if (!event.bis || event.bis === event.von) return alsTag(event.von);
  const von = new Date(`${event.von}T00:00:00`);
  const bis = new Date(`${event.bis}T00:00:00`);
  const anfang = von.getFullYear() === bis.getFullYear() ? TAG_MONAT.format(von) : DATUM.format(von);
  return `${anfang}–${DATUM.format(bis)}`;
}

async function aendern(pfad: string, daten: Record<string, unknown>): Promise<void> {
  await hole(pfad, { method: "PATCH", body: JSON.stringify(daten) });
}

type Loeschauftrag = { pfad: string; name: string; was: string; danach?: () => void };

export function Events({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const events = useEvents();
  const organisationen = useOrganisationen();
  const kontakte = useKontakte();
  const team = useTeam();
  const neuLaden = useNeuLaden();

  const [loeschen, setLoeschen] = useState<Loeschauftrag | null>(null);
  const [fehler, setFehler] = useState("");

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!events.data) return <Zustand abfrage={events} erneut={() => events.refetch()} />;
  if (!organisationen.data)
    return <Zustand abfrage={organisationen} erneut={() => organisationen.refetch()} />;
  if (!kontakte.data) return <Zustand abfrage={kontakte} erneut={() => kontakte.refetch()} />;
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

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
          ? "Daran hängen noch Hitlist-Zeilen oder Verlaufseinträge. Die zuerst entfernen."
          : "Das hat nicht geklappt.",
      );
      setLoeschen(null);
    }
  }

  // Ein Weg ins Leere — ein Event, das inzwischen weg ist, oder ein altes
  // Lesezeichen — zeigt die Liste. Der nächste Klick rückt auch den Weg wieder
  // gerade; ein Umleiten beim Zeichnen wäre der teurere Weg dorthin.
  const gewaehlt = events.data.find((e) => String(e.id) === unter) ?? null;

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
        <Eventseite
          event={gewaehlt}
          organisationen={organisationen.data}
          kontakte={kontakte.data}
          team={team.data}
          ich={ich}
          neuLaden={neuLaden}
          zurueck={() => wechseln("events")}
          zumLoeschen={setLoeschen}
        />
      ) : (
        <Uebersicht
          events={events.data}
          ich={ich}
          neuLaden={neuLaden}
          oeffnen={(id) => wechseln("events", String(id))}
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
  events,
  ich,
  neuLaden,
  oeffnen,
}: {
  events: Event[];
  ich: Ich;
  neuLaden: () => void;
  oeffnen: (id: number) => void;
}) {
  const [suche, setSuche] = useState("");
  const [neues, setNeues] = useState({ titel: "", ort: "", von: heuteAlsDatum() });
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!neues.titel.trim()) return setFehler("Ohne Titel gibt es nichts anzulegen.");
    if (!neues.von) return setFehler("Wann ist das? Ohne ersten Tag steht das Event nirgends in der Zeit.");
    setFehler("");
    const angelegt = await hole<Event>("/events/", {
      method: "POST",
      body: JSON.stringify({
        titel: neues.titel.trim(),
        ort: neues.ort.trim(),
        von: neues.von,
      }),
    });
    setNeues({ titel: "", ort: "", von: heuteAlsDatum() });
    neuLaden();
    // Gleich hinein: Wer ein Event anlegt, will als Nächstes die Hitlist füllen.
    oeffnen(angelegt.id);
  }

  const gefiltert = events.filter((e) => passtEvent(e, suche));
  const { kommend, vergangen } = teileNachZeit(gefiltert, heuteAlsDatum());

  if (events.length === 0)
    return (
      <>
        {ich.darf.bearbeiten && <NeuesEvent neues={neues} setNeues={setNeues} anlegen={anlegen} fehler={fehler} />}
        <div className="karte">
          <Leerstelle
            was="Noch kein Event"
            satz={
              ich.darf.bearbeiten
                ? "Eine Tagung, ein Kongress, ein Messetag: Vorher steht hier, wen wir ansprechen wollen, nachher, mit wem wir geredet haben."
                : "Events legt ein Bearbeiter oder Admin an."
            }
          />
        </div>
      </>
    );

  return (
    <>
      {ich.darf.bearbeiten && <NeuesEvent neues={neues} setNeues={setNeues} anlegen={anlegen} fehler={fehler} />}

      <div className="karte">
        <div className="feld-reihe">
          <input
            className="feld"
            placeholder="Suchen — Event, Ort, Name auf der Hitlist …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            aria-label="Suchen"
          />
          <Hilfe text="Die Suche geht auch über die Hitlist: Wer den Namen einer Förderstelle eingibt, findet das Event, auf dem er sie treffen wollte." />
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was="Nichts gefunden"
            satz="Kein Event passt zur Suche."
            aktion={{ text: "Suche zurücksetzen", tun: () => setSuche("") }}
          />
        </div>
      ) : (
        <>
          <Eventtabelle
            titel="Kommend"
            hinweis="Das Nächste zuerst."
            events={kommend}
            leer="Nichts steht an. Ein vergangenes Event steht unten."
            oeffnen={oeffnen}
          />
          {vergangen.length > 0 && (
            <Eventtabelle
              titel="Vergangen"
              hinweis="Das Letzte zuerst — hier steht, was nachzufassen ist."
              events={vergangen}
              leer=""
              oeffnen={oeffnen}
            />
          )}
        </>
      )}
    </>
  );
}

function NeuesEvent({
  neues,
  setNeues,
  anlegen,
  fehler,
}: {
  neues: { titel: string; ort: string; von: string };
  setNeues: (n: { titel: string; ort: string; von: string }) => void;
  anlegen: () => void;
  fehler: string;
}) {
  return (
    <div className="karte">
      <h2>Neues Event</h2>
      <div className="feld-reihe">
        <input
          className="feld"
          placeholder="Titel (Tagung, Kongress, Messe …)"
          value={neues.titel}
          onChange={(e) => setNeues({ ...neues, titel: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
        <input
          className="feld"
          placeholder="Ort"
          value={neues.ort}
          onChange={(e) => setNeues({ ...neues, ort: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
        <input
          type="date"
          className="feld"
          style={{ flex: "0 1 170px" }}
          value={neues.von}
          onChange={(e) => setNeues({ ...neues, von: e.target.value })}
          aria-label="Erster Tag"
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

function Eventtabelle({
  titel,
  hinweis,
  events,
  leer,
  oeffnen,
}: {
  titel: string;
  hinweis: string;
  events: Event[];
  leer: string;
  oeffnen: (id: number) => void;
}) {
  return (
    <div className="karte">
      <h2>{titel}</h2>
      {events.length === 0 ? (
        <Leerstelle was="Nichts hier" satz={leer} />
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Event</th>
              <th>Ort</th>
              <th>Wann</th>
              <th>Hitlist</th>
              <th>Wer fährt</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td data-spalte="Event">
                  <button type="button" className="zeilen-titel" onClick={() => oeffnen(e.id)}>
                    {e.titel}
                  </button>
                </td>
                <td data-spalte="Ort">{e.ort || "—"}</td>
                <td data-spalte="Wann" className="zahl">
                  {zeitraum(e)}
                </td>
                <td data-spalte="Hitlist">
                  <Standzahlen zahlen={zaehlung(e.ziele)} />
                </td>
                <td data-spalte="Wer fährt">{e.teilnehmer_namen.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {events.length > 0 && <p className="tabellen-hinweis">{hinweis}</p>}
    </div>
  );
}

/** Wie weit die Hitlist ist — nur die Zahlen, die nicht null sind. */
function Standzahlen({ zahlen }: { zahlen: Zaehlung }) {
  if (zahlen.gesamt === 0) return <span className="stand stand-leer">niemand</span>;
  return (
    <span className="standzahlen">
      {zahlen.offen > 0 && <span className="stand stand-offen">{zahlen.offen} offen</span>}
      {zahlen.getroffen > 0 && (
        <span className="stand stand-getroffen">{zahlen.getroffen} getroffen</span>
      )}
      {zahlen.verpasst > 0 && (
        <span className="stand stand-verpasst">{zahlen.verpasst} verpasst</span>
      )}
    </span>
  );
}

/* --- Ein Event ------------------------------------------------------------ */

function Eventseite({
  event,
  organisationen,
  kontakte,
  team,
  ich,
  neuLaden,
  zurueck,
  zumLoeschen,
}: {
  event: Event;
  organisationen: Organisation[];
  kontakte: Kontakt[];
  team: Teammitglied[];
  ich: Ich;
  neuLaden: () => void;
  zurueck: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  const speichern = async (daten: Record<string, unknown>) => {
    await aendern(`/events/${event.id}/`, daten);
    neuLaden();
  };

  return (
    <>
      {/* Nur die Ortsangabe: Der Knopf „Alle Events", der hier stand, ist der
          Zurück-Knopf in der Titelzeile geworden. */}
      <div className="zurueckzeile">
        <span className="brotkrume">Events · {event.titel}</span>
      </div>

      <div className="karte">
        <div className="projekt-kopf">
          <div style={{ minWidth: 200 }}>
            <h3>
              <Feldtext
                wert={event.titel}
                aendern={ich.darf.bearbeiten}
                speichern={(titel) => speichern({ titel })}
              />
            </h3>
            <div className="unter">
              <Feldtext
                wert={event.ort}
                platzhalter="Ort …"
                aendern={ich.darf.bearbeiten}
                speichern={(ort) => speichern({ ort })}
              />
              {` · ${zeitraum(event)}`}
            </div>
          </div>

          <div className="kopf-aktionen">
            {ich.darf.loeschen && (
              <button
                type="button"
                className="knopf-still"
                onClick={() =>
                  zumLoeschen({
                    pfad: `/events/${event.id}/`,
                    name: event.titel,
                    was: "Das Event mit seiner Hitlist",
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

        {ich.darf.bearbeiten && (
          <div className="feld-reihe eventdaten">
            <label className="datumsfeld">
              <span className="beschriftung-klein">Erster Tag</span>
              <input
                type="date"
                className="feld"
                value={event.von}
                onChange={(e) => e.target.value && speichern({ von: e.target.value })}
              />
            </label>
            <label className="datumsfeld">
              <span className="beschriftung-klein">Letzter Tag</span>
              {/* Leer heißt eintägig — deshalb geht auch der leere Wert
                  durch, anders als beim ersten Tag. */}
              <input
                type="date"
                className="feld"
                value={event.bis ?? ""}
                min={event.von}
                onChange={(e) => speichern({ bis: e.target.value || null })}
              />
            </label>
          </div>
        )}

        <span className="beschriftung-klein">Wer fährt hin?</span>
        <Teamwahl
          team={team}
          gewaehlt={event.teilnehmer}
          aendern={ich.darf.bearbeiten}
          setzen={(teilnehmer) => speichern({ teilnehmer })}
        />

        <span className="beschriftung-klein">Notiz</span>
        <div className="org-nutzen">
          <Feldtext
            wert={event.notiz}
            mehrzeilig
            platzhalter="Worum geht es dort, was wollen wir mitnehmen?"
            aendern={ich.darf.bearbeiten}
            speichern={(notiz) => speichern({ notiz })}
          />
        </div>
      </div>

      {/*
        Der Verlauf steht über der Hitlist, seit die Hitlist zugeklappt ist.
        Vorher lag die Planung von *vorher* über dem, was man *währenddessen*
        notiert — und wer auf einer Tagung schnell ein Gespräch festhalten
        wollte, scrollte erst an zwanzig Namen vorbei.
      */}
      <Verlaufskarte
        event={event}
        organisationen={organisationen}
        kontakte={kontakte}
        ich={ich}
        neuLaden={neuLaden}
      />

      <Hitlistkarte
        event={event}
        organisationen={organisationen}
        kontakte={kontakte}
        ich={ich}
        neuLaden={neuLaden}
        zumLoeschen={zumLoeschen}
      />
    </>
  );
}

function Teamwahl({
  team,
  gewaehlt,
  aendern,
  setzen,
}: {
  team: Teammitglied[];
  gewaehlt: number[];
  aendern: boolean;
  setzen: (ids: number[]) => void;
}) {
  if (!aendern)
    return (
      <p className="org-nutzen">
        {team
          .filter((m) => gewaehlt.includes(m.id))
          .map((m) => m.name)
          .join(", ") || "Noch niemand eingetragen."}
      </p>
    );

  return (
    <div className="teamwahl">
      {team.map((m) => (
        <label key={m.id} className="schalter">
          <input
            type="checkbox"
            checked={gewaehlt.includes(m.id)}
            onChange={(e) =>
              setzen(
                e.target.checked
                  ? [...gewaehlt, m.id]
                  : gewaehlt.filter((id) => id !== m.id),
              )
            }
          />
          {m.name}
        </label>
      ))}
    </div>
  );
}

/* --- Die Hitlist ---------------------------------------------------------- */

function Hitlistkarte({
  event,
  organisationen,
  kontakte,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  event: Event;
  organisationen: Organisation[];
  kontakte: Kontakt[];
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  const [zeile, setZeile] = useState({ ziel: "", anliegen: "" });
  const [fehler, setFehler] = useState("");

  const offen = nochOffen(organisationen, kontakte, event.ziele);
  const nichtsMehrDa = offen.organisationen.length === 0 && offen.personen.length === 0;

  async function aufDieListe() {
    const wohin = alsAnfrage(zeile.ziel);
    if (!wohin)
      return setFehler(
        nichtsMehrDa
          ? "Alle bekannten Organisationen und Personen stehen schon auf der Liste."
          : "Wähl aus, wen wir ansprechen wollen.",
      );
    setFehler("");
    await hole("/eventziele/", {
      method: "POST",
      body: JSON.stringify({ event: event.id, ...wohin, anliegen: zeile.anliegen.trim() }),
    });
    setZeile({ ziel: "", anliegen: "" });
    neuLaden();
  }

  /*
   * Zugeklappt, solange niemand sie aufmacht — und zwar bei jedem Aufruf neu.
   * Die Hitlist ist die Vorbereitung: Vor dem Event wird sie gefüllt, während
   * des Events braucht man den Verlauf darüber, danach schaut man einmal
   * hinein. Ein gemerkter Zustand („zuletzt war sie offen") hieße, dass sie
   * genau dann aufgeklappt ist, wenn man sie am wenigsten braucht.
   *
   * Der Stand steht in der Zeile — zugeklappt sieht man trotzdem, wie viele
   * offen sind.
   */
  return (
    <details className="karte klappkarte">
      <summary>
        <Zeichen name="zeiger" klasse="zeiger-klapp" />
        <span className="klapptitel">Hitlist</span>
        <Standzahlen zahlen={zaehlung(event.ziele)} />
        {/* Ein Klick im `?` darf die Karte nicht auf- und zuklappen — das tut
            in einem <summary> sonst jeder Klick. */}
        <span onClick={(e) => e.preventDefault()}>
          <Hilfe text="Wen wollen wir hier ansprechen? Jede Zeile zeigt auf eine Organisation oder auf eine Person aus den Kontakten — nie auf einen frei getippten Namen. Wen man tatsächlich getroffen hat, steht oben im Verlauf; dafür muss hier niemand stehen." />
        </span>
      </summary>

      {ich.darf.bearbeiten && (
        <div className="nachbuchen">
          <div className="feld-reihe">
            <select
              className="feld"
              style={{ flex: "1 1 260px" }}
              value={zeile.ziel}
              onChange={(e) => setZeile({ ...zeile, ziel: e.target.value })}
              aria-label="Wen ansprechen"
              disabled={nichtsMehrDa}
            >
              <option value="">
                {nichtsMehrDa ? "Alle stehen schon auf der Liste" : "Wen ansprechen?"}
              </option>
              {offen.organisationen.length > 0 && (
                <optgroup label="Organisationen">
                  {offen.organisationen.map((a) => (
                    <option key={a.wert} value={a.wert}>
                      {a.dazu ? `${a.name} (${a.dazu})` : a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {offen.personen.length > 0 && (
                <optgroup label="Personen">
                  {offen.personen.map((a) => (
                    <option key={a.wert} value={a.wert}>
                      {a.dazu ? `${a.name} — ${a.dazu}` : a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <input
              className="feld"
              style={{ flex: "1 1 260px" }}
              placeholder="Anliegen — was wollen wir von ihnen?"
              value={zeile.anliegen}
              onChange={(e) => setZeile({ ...zeile, anliegen: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && aufDieListe()}
            />
            {/* Nicht stillgelegt: Ein grauer Knopf sagt nicht, was fehlt. Er
                nimmt den Klick an und antwortet in der Zeile darunter. */}
            <button type="button" className="knopf" onClick={aufDieListe}>
              <Zeichen name="plus" />
              Auf die Liste
            </button>
          </div>
          <Fehlerzeile text={fehler} />
        </div>
      )}

      {event.ziele.length === 0 ? (
        <Leerstelle
          was="Noch niemand auf der Liste"
          satz={
            ich.darf.bearbeiten
              ? "Wen wollen wir dort erwischen? Drei Namen mit Anliegen sind mehr wert als zwanzig ohne."
              : "Die Hitlist füllt ein Bearbeiter oder Admin."
          }
        />
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Wen</th>
              <th>Anliegen</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {event.ziele.map((z) => (
              <Hitlistzeile
                key={z.id}
                ziel={z}
                ich={ich}
                neuLaden={neuLaden}
                zumLoeschen={zumLoeschen}
              />
            ))}
          </tbody>
        </table>
      )}

    </details>
  );
}

function Hitlistzeile({
  ziel,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  ziel: Eventziel;
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  const wer = wen(ziel);

  const speichern = async (daten: Record<string, unknown>) => {
    await aendern(`/eventziele/${ziel.id}/`, daten);
    neuLaden();
  };

  return (
    <tr>
      <td data-spalte="Wen">
        <b>{wer.name}</b>
        {wer.dazu && <span className="dazu">{wer.dazu}</span>}
      </td>
      <td data-spalte="Anliegen">
        <Feldtext
          wert={ziel.anliegen}
          platzhalter="Was wollen wir von ihnen?"
          aendern={ich.darf.bearbeiten}
          speichern={(anliegen) => speichern({ anliegen })}
        />
      </td>
      <td data-spalte="Stand">
        {ich.darf.bearbeiten ? (
          <select
            className="stand-wahl"
            data-stand={ziel.stand}
            value={ziel.stand}
            onChange={(e) => speichern({ stand: e.target.value })}
            aria-label={`Stand von ${wer.name}`}
          >
            {STAENDE.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        ) : (
          <span className={`stand stand-${ziel.stand}`}>{ziel.stand}</span>
        )}
      </td>
      <td data-spalte="Aktionen" className="zeilen-aktionen">
        {ich.darf.loeschen && (
          <button
            type="button"
            className="mini"
            aria-label={`„${wer.name}“ von der Liste nehmen`}
            onClick={() =>
              zumLoeschen({
                pfad: `/eventziele/${ziel.id}/`,
                name: wer.name,
                was: "Die Zeile der Hitlist",
              })
            }
          >
            <Zeichen name="kreuz" />
          </button>
        )}
      </td>
    </tr>
  );
}

/* --- Der Verlauf des Events ------------------------------------------------ */

function Verlaufskarte({
  event,
  organisationen,
  kontakte,
  ich,
  neuLaden,
}: {
  event: Event;
  organisationen: Organisation[];
  kontakte: Kontakt[];
  ich: Ich;
  neuLaden: () => void;
}) {
  const [eintrag, setEintrag] = useState(() => ({
    ziel: "",
    datum: event.von,
    titel: "",
    text: "",
  }));
  const [fehler, setFehler] = useState("");

  const wahl = wenGetroffen(organisationen, kontakte, event.ziele);

  async function anlegen() {
    const wohin = alsAnfrage(eintrag.ziel);
    if (!wohin) return setFehler("Wähl aus, mit wem geredet wurde.");
    if (!eintrag.titel.trim())
      return setFehler("Trag ein, worum es ging. Ein Eintrag ohne Anlass hilft später niemandem.");
    setFehler("");
    await hole("/verlauf/", {
      method: "POST",
      body: JSON.stringify({
        ...wohin,
        event: event.id,
        // Auf einem Event ist die Art „Event". Ein Auswahlfeld daneben fragte
        // nach etwas, das der Ort des Eintrags schon beantwortet.
        art: "event",
        datum: eintrag.datum,
        titel: eintrag.titel.trim(),
        text: eintrag.text.trim(),
      }),
    });
    setEintrag({ ...eintrag, titel: "", text: "" });
    neuLaden();
  }

  return (
    <div className="karte">
      <h2>
        Verlauf
        <Hilfe text="Was hier notiert wird, steht auch beim Kontakt — es ist derselbe Eintrag. Angeboten wird jeder Kontakt, nicht nur die Hitlist: Wen man trifft, entscheidet der Gang über den Flur. Wer noch gar nicht in den Kontakten steht, wird hier gleich angelegt." />
      </h2>

      {ich.darf.bearbeiten && (
        <div className="nachbuchen">
          <div className="feld-reihe">
            {/* Alle Kontakte, nicht nur die Hitlist: Wen man trifft,
                entscheidet der Gang über den Flur. Die geplanten Namen stehen
                trotzdem oben — sie sind die häufigste Wahl. */}
            <select
              className="feld"
              style={{ flex: "1 1 230px" }}
              value={eintrag.ziel}
              onChange={(e) => setEintrag({ ...eintrag, ziel: e.target.value })}
              aria-label="Mit wem"
            >
              <option value="">Mit wem?</option>
              <Zielgruppe titel="Von der Hitlist" auswahl={wahl.hitlist} />
              <Zielgruppe titel="Personen" auswahl={wahl.personen} />
              <Zielgruppe titel="Organisationen" auswahl={wahl.organisationen} />
            </select>
            <input
              type="date"
              className="feld"
              style={{ flex: "0 1 170px" }}
              value={eintrag.datum}
              min={event.von}
              max={letzterTag(event)}
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

          <Kennengelernt
            organisationen={organisationen}
            neuLaden={neuLaden}
            gewaehlt={(schluessel) => setEintrag({ ...eintrag, ziel: schluessel })}
          />
        </div>
      )}

      {event.verlauf.length === 0 ? (
        <Leerstelle
          was="Noch kein Verlauf"
          satz="Halte hier fest, was besprochen wurde — in einem halben Jahr weiß es sonst niemand mehr."
        />
      ) : (
        <ul className="verlauf">
          {event.verlauf.map((v) => (
            <li key={v.id}>
              <span className="zahl datum">{alsDatum(v.datum)}</span>
              <div style={{ flex: 1 }}>
                <b>{v.titel}</b>
                {v.text && <p>{v.text}</p>}
                <span className="verlauf-fuss">
                  {artText(v.art)} · {v.kontakt_name || v.organisation_name}
                  {v.wer_name && ` · notiert von ${v.wer_name}`}
                </span>
              </div>
              {ich.darf.loeschen && (
                <button
                  type="button"
                  className="mini"
                  aria-label="Eintrag entfernen"
                  onClick={async () => {
                    await hole(`/verlauf/${v.id}/`, { method: "DELETE" });
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

/**
 * Eine Gruppe im Auswahlfeld — leer wird sie gar nicht erst gezeichnet, sonst
 * stünde auf einem frischen Event eine Überschrift ohne Einträge darunter.
 */
function Zielgruppe({ titel, auswahl }: { titel: string; auswahl: Auswahl[] }) {
  if (auswahl.length === 0) return null;
  return (
    <optgroup label={titel}>
      {auswahl.map((a) => (
        <option key={a.wert} value={a.wert}>
          {a.dazu ? `${a.name} — ${a.dazu}` : a.name}
        </option>
      ))}
    </optgroup>
  );
}

/**
 * Vor Ort kennengelernt: Person anlegen, samt Haus, ohne die Seite zu
 * verlassen.
 *
 * **Warum die Organisation gleich mit angelegt wird:** Wer auf einer Tagung
 * jemanden von einem Haus trifft, das SoCoS noch nicht kennt, hätte sonst drei
 * Wege vor sich — Kontakte, Organisation anlegen, zurück, Person anlegen,
 * zurück zum Event. Nach der dritten Station notiert das niemand mehr, und das
 * Gespräch ist verloren.
 *
 * Zugeklappt, weil der Regelfall die Auswahl darüber ist: Die meisten, mit
 * denen man redet, stehen schon in den Kontakten.
 *
 * Die neue Person landet **nicht** auf der Hitlist. Die ist der Plan von
 * vorher; wen man tatsächlich getroffen hat, steht im Verlauf. Stattdessen ist
 * sie oben gleich ausgewählt — der nächste Griff ist der Eintrag.
 */
const NEUES_HAUS = "neu";

function Kennengelernt({
  organisationen,
  neuLaden,
  gewaehlt,
}: {
  organisationen: Organisation[];
  neuLaden: () => void;
  gewaehlt: (schluessel: string) => void;
}) {
  const leer = { name: "", funktion: "", organisation: "", haus: "" };
  const [offen, setOffen] = useState(false);
  const [person, setPerson] = useState(leer);
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!person.name.trim())
      return setFehler("Ohne Namen lässt sich die Person später nicht zuordnen.");
    if (person.organisation === NEUES_HAUS && !person.haus.trim())
      return setFehler("Wie heißt das Haus? Ohne Namen lässt es sich nicht anlegen.");
    setFehler("");

    let organisation: number | null =
      person.organisation && person.organisation !== NEUES_HAUS
        ? Number(person.organisation)
        : null;

    if (person.organisation === NEUES_HAUS) {
      const haus = await hole<Organisation>("/organisationen/", {
        method: "POST",
        body: JSON.stringify({ name: person.haus.trim() }),
      });
      organisation = haus.id;
    }

    const angelegt = await hole<Kontakt>("/kontakte/", {
      method: "POST",
      body: JSON.stringify({
        name: person.name.trim(),
        funktion: person.funktion.trim(),
        organisation,
      }),
    });

    setPerson(leer);
    setOffen(false);
    neuLaden();
    gewaehlt(`k${angelegt.id}`);
    melden("gut", `${angelegt.name} steht jetzt in den Kontakten und oben im Feld.`);
  }

  if (!offen)
    return (
      <button type="button" className="knopf-still nachtrag" onClick={() => setOffen(true)}>
        <Zeichen name="plus" />
        Steht noch nicht in den Kontakten
      </button>
    );

  return (
    <div className="nachtrag">
      <span className="beschriftung-klein">Vor Ort kennengelernt</span>
      <div className="feld-reihe">
        <input
          className="feld"
          placeholder="Name der Person"
          value={person.name}
          onChange={(e) => setPerson({ ...person, name: e.target.value })}
        />
        <input
          className="feld"
          placeholder="Rolle"
          value={person.funktion}
          onChange={(e) => setPerson({ ...person, funktion: e.target.value })}
        />
        <select
          className="feld"
          value={person.organisation}
          onChange={(e) => setPerson({ ...person, organisation: e.target.value })}
          aria-label="Gehört zu"
        >
          <option value="">Keine Organisation</option>
          <option value={NEUES_HAUS}>＋ Neue Organisation …</option>
          {organisationen.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {person.organisation === NEUES_HAUS && (
          <input
            className="feld"
            placeholder="Name der Organisation"
            value={person.haus}
            onChange={(e) => setPerson({ ...person, haus: e.target.value })}
            aria-label="Name der neuen Organisation"
          />
        )}
        <button type="button" className="knopf" onClick={anlegen}>
          <Zeichen name="plus" />
          Anlegen
        </button>
        <button
          type="button"
          className="knopf-still"
          onClick={() => {
            setPerson(leer);
            setFehler("");
            setOffen(false);
          }}
        >
          Abbrechen
        </button>
      </div>
      <Fehlerzeile text={fehler} />
    </div>
  );
}
