/**
 * Meetings: erst die Liste, dann eine Besprechung ganz.
 *
 * Eine Seite je Meeting, und auf ihr der ganze Ablauf in der Reihenfolge, in
 * der er stattfindet:
 *
 * 1. **Vorbereitung** — vorher, in Ruhe: was wir aus dem Termin holen wollen.
 * 2. **Mitschrift** — währenddessen, schnell: ein langes Feld, das sich selbst
 *    speichert. Niemand drückt während eines Gesprächs auf „Speichern".
 * 3. **Protokoll** — danach: Mitschrift und Vorbereitung gehen mit einem
 *    Auftrag an ein LLM, das Ergebnis kommt zurück und wird an seinen
 *    Überschriften in Abschnitte zerlegt. Jeder Abschnitt ist danach für sich
 *    änderbar.
 *
 * **Sobald ein Protokoll steht, rückt es nach oben**, und Vorbereitung wie
 * Mitschrift klappen zugeklappt ans Ende — in der Reihenfolge, in der sie
 * entstanden sind. Danach ist das Protokoll das, was gelesen wird; die beiden
 * anderen sind nur noch die Quellen, in denen man nachsieht, wenn ein Satz zu
 * glatt klingt. „Verwerfen" am Protokoll dreht das um: Die Abschnitte gehen
 * (weich) weg, und die Seite steht wieder so da wie vor dem Übernehmen.
 *
 * **Ein Meeting hängt an nichts** (siehe `Meeting` in socos/models.py): Es
 * lässt sich anlegen, bevor feststeht, wer kommt. Personen und Häuser werden
 * nachgetragen — die Karte fragt danach, solange keines eingetragen ist, denn
 * ohne sie findet das Meeting später niemand mehr über den Kontakt.
 *
 * Das gewählte Meeting steht im Weg (`/meetings/3`), nicht im Zustand dieser
 * Ansicht — aus demselben Grund wie bei Kontakten und Events (siehe
 * basis/router.ts).
 */

import { useEffect, useRef, useState } from "react";

import { hole } from "../basis/api";
import {
  useKontakte,
  useMeetings,
  useNeuLaden,
  useOrganisationen,
  useTeam,
  type Ich,
  type Kontakt,
  type Meeting,
  type Meetingabschnitt,
  type Organisation,
  type Teammitglied,
} from "../basis/daten";
import { standText, useEntwurf } from "../basis/entwurf";
import {
  abschnitteAusText,
  auftragFuerLLM,
  besteTreffer,
  passtMeeting,
  teileNachZeit,
  wann,
} from "../basis/meetings";
import { melden } from "../basis/meldungen";
import type { Seite } from "../basis/router";
import { heuteAlsDatum } from "../basis/zeit";
import { Zustand } from "../basis/Zustand";
import { Feldtext } from "../bausteine/Feldtext";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

async function aendern(pfad: string, daten: Record<string, unknown>): Promise<void> {
  await hole(pfad, { method: "PATCH", body: JSON.stringify(daten) });
}

type Loeschauftrag = { pfad: string; name: string; was: string; danach?: () => void };

/** Was auf einen Blick über den Stand eines Meetings zu sagen ist. */
function stand(meeting: Meeting): { text: string; klasse: string } {
  if (meeting.abschnitte.length > 0)
    return { text: "Protokoll", klasse: "stand stand-getroffen" };
  if (meeting.mitschrift.trim()) return { text: "Mitschrift", klasse: "stand stand-offen" };
  if (meeting.vorbereitung.trim()) return { text: "vorbereitet", klasse: "stand stand-offen" };
  return { text: "leer", klasse: "stand stand-leer" };
}

export function Meetings({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const meetings = useMeetings();
  const kontakte = useKontakte();
  const organisationen = useOrganisationen();
  const team = useTeam();
  const neuLaden = useNeuLaden();

  const [loeschen, setLoeschen] = useState<Loeschauftrag | null>(null);
  const [fehler, setFehler] = useState("");

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!meetings.data) return <Zustand abfrage={meetings} erneut={() => meetings.refetch()} />;
  if (!kontakte.data) return <Zustand abfrage={kontakte} erneut={() => kontakte.refetch()} />;
  if (!organisationen.data)
    return <Zustand abfrage={organisationen} erneut={() => organisationen.refetch()} />;
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  async function entfernen() {
    if (!loeschen) return;
    setFehler("");
    try {
      await hole(loeschen.pfad, { method: "DELETE" });
      loeschen.danach?.();
      setLoeschen(null);
      neuLaden();
    } catch {
      setFehler("Das hat nicht geklappt.");
      setLoeschen(null);
    }
  }

  // Ein Weg ins Leere — ein Meeting, das inzwischen weg ist, oder ein altes
  // Lesezeichen — zeigt die Liste.
  const gewaehlt = meetings.data.find((m) => String(m.id) === unter) ?? null;

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
        <Meetingseite
          /* Der Schlüssel baut die Seite beim Wechsel neu auf. Ohne ihn trüge
             das Entwurfsfeld die Mitschrift des vorigen Meetings weiter — und
             speicherte sie beim nächsten Tastendruck am falschen Ort. */
          key={gewaehlt.id}
          meeting={gewaehlt}
          kontakte={kontakte.data}
          organisationen={organisationen.data}
          team={team.data}
          ich={ich}
          neuLaden={neuLaden}
          zurueck={() => wechseln("meetings")}
          zumKontakt={(id) => wechseln("kontakte", String(id))}
          zumLoeschen={setLoeschen}
        />
      ) : (
        <Uebersicht
          meetings={meetings.data}
          ich={ich}
          neuLaden={neuLaden}
          oeffnen={(id) => wechseln("meetings", String(id))}
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
  meetings,
  ich,
  neuLaden,
  oeffnen,
}: {
  meetings: Meeting[];
  ich: Ich;
  neuLaden: () => void;
  oeffnen: (id: number) => void;
}) {
  const [suche, setSuche] = useState("");
  const [neues, setNeues] = useState({ titel: "", datum: heuteAlsDatum(), uhrzeit: "", ort: "" });
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    if (!neues.titel.trim())
      return setFehler("Worum geht es? Ohne Titel steht das Meeting später namenlos in der Liste.");
    if (!neues.datum) return setFehler("Wann ist das? Ohne Datum steht es nirgends in der Zeit.");
    setFehler("");
    const angelegt = await hole<Meeting>("/meetings/", {
      method: "POST",
      body: JSON.stringify({
        titel: neues.titel.trim(),
        datum: neues.datum,
        // Leer heißt: nur der Tag ist bekannt.
        uhrzeit: neues.uhrzeit || null,
        ort: neues.ort.trim(),
      }),
    });
    setNeues({ titel: "", datum: heuteAlsDatum(), uhrzeit: "", ort: "" });
    neuLaden();
    // Gleich hinein: Wer ein Meeting anlegt, will als Nächstes aufschreiben,
    // was er dort erreichen will.
    oeffnen(angelegt.id);
  }

  const anlegezeile = ich.darf.bearbeiten && (
    <div className="karte">
      <h2>Neues Meeting</h2>
      <div className="feld-reihe">
        <input
          className="feld"
          placeholder="Worum geht es?"
          value={neues.titel}
          onChange={(e) => setNeues({ ...neues, titel: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
        <input
          type="date"
          className="feld datumsfeld"
          style={{ flex: "0 1 170px" }}
          value={neues.datum}
          onChange={(e) => setNeues({ ...neues, datum: e.target.value })}
          aria-label="Datum"
        />
        <input
          type="time"
          className="feld datumsfeld"
          style={{ flex: "0 1 120px" }}
          value={neues.uhrzeit}
          onChange={(e) => setNeues({ ...neues, uhrzeit: e.target.value })}
          aria-label="Uhrzeit (kann leer bleiben)"
        />
        <input
          className="feld"
          placeholder="Ort oder Link"
          value={neues.ort}
          onChange={(e) => setNeues({ ...neues, ort: e.target.value })}
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

  if (meetings.length === 0)
    return (
      <>
        {anlegezeile}
        <div className="karte">
          <Leerstelle
            was="Noch kein Meeting"
            satz={
              ich.darf.bearbeiten
                ? "Leg den Termin an, bevor er stattfindet: Dann steht die Vorbereitung schon da, wenn es losgeht, und die Mitschrift landet an derselben Stelle."
                : "Meetings legt ein Bearbeiter oder Admin an."
            }
          />
        </div>
      </>
    );

  const gefiltert = meetings.filter((m) => passtMeeting(m, suche));
  const { kommend, vergangen } = teileNachZeit(gefiltert, heuteAlsDatum());

  return (
    <>
      {anlegezeile}

      <div className="karte">
        <div className="feld-reihe">
          <input
            className="feld"
            placeholder="Suchen — Titel, Person, Haus, auch im Protokoll …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            aria-label="Suchen"
          />
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was="Nichts gefunden"
            satz="Kein Meeting passt zur Suche — auch nicht im Protokoll."
            aktion={{ text: "Suche zurücksetzen", tun: () => setSuche("") }}
          />
        </div>
      ) : (
        <>
          <Meetingtabelle
            titel="Kommend"
            hinweis="Das Nächste zuerst. Der heutige Tag steht hier, bis er vorbei ist."
            meetings={kommend}
            leer="Nichts steht an. Was war, steht unten."
            oeffnen={oeffnen}
          />
          {vergangen.length > 0 && (
            <Meetingtabelle
              titel="Gewesen"
              hinweis="Das Letzte zuerst."
              meetings={vergangen}
              leer=""
              oeffnen={oeffnen}
            />
          )}
        </>
      )}
    </>
  );
}

function Meetingtabelle({
  titel,
  hinweis,
  meetings,
  leer,
  oeffnen,
}: {
  titel: string;
  hinweis: string;
  meetings: Meeting[];
  leer: string;
  oeffnen: (id: number) => void;
}) {
  return (
    <div className="karte">
      <h2>{titel}</h2>
      {meetings.length === 0 ? (
        <Leerstelle was="Nichts hier" satz={leer} />
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Wann</th>
              <th>Meeting</th>
              <th>Mit wem</th>
              <th>Von uns</th>
              <th>Stand</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => {
              const s = stand(m);
              const mitWem = [...m.personen.map((p) => p.name), ...m.haeuser.map((h) => h.name)];
              return (
                <tr key={m.id}>
                  <td data-spalte="Wann" className="zahl">
                    {wann(m)}
                  </td>
                  <td data-spalte="Meeting">
                    <button type="button" className="zeilen-titel" onClick={() => oeffnen(m.id)}>
                      {m.titel}
                    </button>
                    {m.ort && <div className="unterzeile">{m.ort}</div>}
                  </td>
                  {/* Leer ist hier kein Gedankenstrich, sondern eine Aufgabe:
                      Wer nicht nachgetragen ist, findet das Meeting später
                      nicht über seinen Kontakt. */}
                  <td data-spalte="Mit wem">
                    {mitWem.length > 0 ? (
                      mitWem.join(", ")
                    ) : (
                      <span className="leer">niemand eingetragen</span>
                    )}
                  </td>
                  <td data-spalte="Von uns">{m.teilnehmer_namen.join(", ") || "—"}</td>
                  <td data-spalte="Stand">
                    <span className={s.klasse}>{s.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {meetings.length > 0 && <p className="tabellen-hinweis">{hinweis}</p>}
    </div>
  );
}

/* --- Ein Meeting ---------------------------------------------------------- */

function Meetingseite({
  meeting,
  kontakte,
  organisationen,
  team,
  ich,
  neuLaden,
  zurueck,
  zumKontakt,
  zumLoeschen,
}: {
  meeting: Meeting;
  kontakte: Kontakt[];
  organisationen: Organisation[];
  team: Teammitglied[];
  ich: Ich;
  neuLaden: () => void;
  zurueck: () => void;
  zumKontakt: (id: number) => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  const speichern = async (daten: Record<string, unknown>) => {
    await aendern(`/meetings/${meeting.id}/`, daten);
    neuLaden();
  };

  const hatProtokoll = meeting.abschnitte.length > 0;

  // Vorbereitung und Mitschrift bleiben in ihrer Reihenfolge — ob oben oder
  // zugeklappt unter dem Protokoll.
  const quellen = (
    <>
      <Vorbereitungskarte
        meeting={meeting}
        ich={ich}
        neuLaden={neuLaden}
        zugeklappt={hatProtokoll}
      />
      <Mitschriftkarte meeting={meeting} ich={ich} neuLaden={neuLaden} zugeklappt={hatProtokoll} />
    </>
  );

  return (
    <>
      <div className="zurueckzeile">
        <span className="brotkrume">Meetings · {meeting.titel}</span>
      </div>

      <div className="karte">
        <div className="projekt-kopf">
          <div style={{ minWidth: 200 }}>
            <h3>
              <Feldtext
                wert={meeting.titel}
                aendern={ich.darf.bearbeiten}
                speichern={(titel) => speichern({ titel })}
              />
            </h3>
            <div className="unter">
              {wann(meeting)}
              {" · "}
              <Feldtext
                wert={meeting.ort}
                platzhalter="Ort oder Link …"
                aendern={ich.darf.bearbeiten}
                speichern={(ort) => speichern({ ort })}
              />
            </div>
          </div>

          <div className="kopf-aktionen">
            {ich.darf.loeschen && (
              <button
                type="button"
                className="knopf-still"
                onClick={() =>
                  zumLoeschen({
                    pfad: `/meetings/${meeting.id}/`,
                    name: meeting.titel,
                    was: "Das Meeting mit Vorbereitung, Mitschrift und Protokoll",
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
          <div className="feld-reihe">
            <label className="datumsfeld">
              <span className="beschriftung-klein">Tag</span>
              <input
                type="date"
                className="feld"
                value={meeting.datum}
                onChange={(e) => e.target.value && speichern({ datum: e.target.value })}
              />
            </label>
            <label className="datumsfeld">
              <span className="beschriftung-klein">Uhrzeit</span>
              {/* Leer ist erlaubt: „irgendwann am Dienstag" ist eine Angabe. */}
              <input
                type="time"
                className="feld"
                value={meeting.uhrzeit ? meeting.uhrzeit.slice(0, 5) : ""}
                onChange={(e) => speichern({ uhrzeit: e.target.value || null })}
              />
            </label>
          </div>
        )}

        <span className="beschriftung-klein">Wer von uns ist dabei?</span>
        <Teamwahl
          team={team}
          gewaehlt={meeting.teilnehmer}
          aendern={ich.darf.bearbeiten}
          setzen={(teilnehmer) => speichern({ teilnehmer })}
        />

        <Beteiligte
          meeting={meeting}
          kontakte={kontakte}
          organisationen={organisationen}
          ich={ich}
          speichern={speichern}
          zumKontakt={zumKontakt}
        />
      </div>

      {/* Steht ein Protokoll, ist es das, was gelesen wird — dann rückt es
          über Vorbereitung und Mitschrift, und die klappen darunter zu. */}
      {hatProtokoll ? (
        <>
          <Protokollkarte
            meeting={meeting}
            ich={ich}
            neuLaden={neuLaden}
            zumLoeschen={zumLoeschen}
          />
          {quellen}
        </>
      ) : (
        quellen
      )}
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
              setzen(e.target.checked ? [...gewaehlt, m.id] : gewaehlt.filter((id) => id !== m.id))
            }
          />
          {m.name}
        </label>
      ))}
    </div>
  );
}

/**
 * Wer von außen dabei war — Personen und Häuser.
 *
 * **Beides darf leer bleiben.** Ein Meeting entsteht als Termin, und wer genau
 * kommt, steht oft erst danach fest. Solange nichts eingetragen ist, steht
 * hier deshalb kein Gedankenstrich, sondern die Bitte, es nachzutragen: Über
 * den Kontakt gefunden wird das Protokoll nur darüber.
 */
function Beteiligte({
  meeting,
  kontakte,
  organisationen,
  ich,
  speichern,
  zumKontakt,
}: {
  meeting: Meeting;
  kontakte: Kontakt[];
  organisationen: Organisation[];
  ich: Ich;
  speichern: (daten: Record<string, unknown>) => Promise<void>;
  zumKontakt: (id: number) => void;
}) {
  const offeneKontakte = kontakte.filter((k) => !meeting.kontakte.includes(k.id));
  const offeneHaeuser = organisationen.filter((o) => !meeting.organisationen.includes(o.id));
  const leer = meeting.personen.length === 0 && meeting.haeuser.length === 0;

  return (
    <>
      <span className="beschriftung-klein">Mit wem</span>

      {leer && (
        <p className="org-nutzen">
          Noch niemand eingetragen. Trag die Person oder das Haus nach — sonst steht dieses
          Protokoll später bei niemandem im Verlauf.
        </p>
      )}

      <div className="beteiligte">
        {meeting.personen.map((p) => (
          <span key={`k${p.id}`} className="beteiligt">
            <button
              type="button"
              className="beteiligt-name"
              onClick={() => zumKontakt(p.id)}
              title="Zum Kontakt"
            >
              {/* Name und Haus als zwei Teile, nicht als ein Textfluss: Am
                  Handy rutscht das Haus sonst nicht als Ganzes in die zweite
                  Zeile, sondern der Name bricht mitten entzwei. */}
              <span>{p.name}</span>
              {p.organisation_name && <em>· {p.organisation_name}</em>}
            </button>
            {ich.darf.bearbeiten && (
              <button
                type="button"
                className="mini"
                aria-label={`${p.name} entfernen`}
                onClick={() =>
                  speichern({ kontakte: meeting.kontakte.filter((id) => id !== p.id) })
                }
              >
                <Zeichen name="kreuz" />
              </button>
            )}
          </span>
        ))}

        {meeting.haeuser.map((h) => (
          <span key={`o${h.id}`} className="beteiligt">
            <span className="beteiligt-name beteiligt-haus">{h.name}</span>
            {ich.darf.bearbeiten && (
              <button
                type="button"
                className="mini"
                aria-label={`${h.name} entfernen`}
                onClick={() =>
                  speichern({
                    organisationen: meeting.organisationen.filter((id) => id !== h.id),
                  })
                }
              >
                <Zeichen name="kreuz" />
              </button>
            )}
          </span>
        ))}
      </div>

      {ich.darf.bearbeiten && (
        <div className="feld-reihe">
          <Personensuche
            kontakte={offeneKontakte}
            hinzufuegen={(id) => speichern({ kontakte: [...meeting.kontakte, id] })}
          />

          {/* Der Wert springt nach dem Hinzufügen zurück auf "" — das Feld ist
              ein Griff, keine Anzeige dessen, was eingetragen ist. Das steht
              als Liste darüber. */}
          <select
            className="feld"
            value=""
            aria-label="Organisation hinzufügen"
            disabled={offeneHaeuser.length === 0}
            onChange={(e) =>
              e.target.value &&
              speichern({ organisationen: [...meeting.organisationen, Number(e.target.value)] })
            }
          >
            <option value="">
              {offeneHaeuser.length === 0 ? "Alle Häuser sind eingetragen" : "Organisation hinzufügen …"}
            </option>
            {offeneHaeuser.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

/**
 * Eine Person finden statt sie aus einer Liste zu ziehen.
 *
 * **Kein `<select>` und keine Überlagerung**: Die Treffer stehen als Knöpfe
 * unter dem Feld, höchstens drei — das ist eine Antwort auf das Getippte,
 * kein Verzeichnis. Bei dreißig Kontakten ist ein Aufklappmenü noch zu
 * überblicken, bei dreihundert nicht mehr, und die Reihung (siehe
 * `besteTreffer`) sagt schon nach zwei Buchstaben, wer gemeint ist.
 *
 * Enter nimmt den ersten Treffer; der ist deshalb auch so gezeichnet. Nach dem
 * Eintragen bleibt der Fokus im Feld: Meist kommt gleich die nächste Person.
 */
function Personensuche({
  kontakte,
  hinzufuegen,
}: {
  kontakte: Kontakt[];
  hinzufuegen: (id: number) => Promise<void>;
}) {
  const [suche, setSuche] = useState("");
  const feld = useRef<HTMLInputElement>(null);
  const treffer = besteTreffer(kontakte, suche);

  async function nehmen(k: Kontakt) {
    setSuche("");
    await hinzufuegen(k.id);
    feld.current?.focus();
  }

  if (kontakte.length === 0)
    return <p className="tabellen-hinweis personensuche">Alle Personen sind eingetragen.</p>;

  return (
    <div className="personensuche">
      <input
        ref={feld}
        type="text"
        className="feld"
        aria-label="Person hinzufügen"
        placeholder="Person hinzufügen — Name, Haus oder Funktion tippen …"
        autoComplete="off"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && treffer[0]) {
            e.preventDefault();
            nehmen(treffer[0]);
          }
          if (e.key === "Escape") setSuche("");
        }}
      />
      {suche.trim() && (
        <div className="treffer" aria-live="polite">
          {treffer.length === 0 ? (
            <span className="tabellen-hinweis">Niemand passt zu „{suche.trim()}“.</span>
          ) : (
            treffer.map((k, i) => (
              <button
                type="button"
                key={k.id}
                className={i === 0 ? "treffer-knopf treffer-erster" : "treffer-knopf"}
                onClick={() => nehmen(k)}
              >
                <Zeichen name="plus" />
                <span>{k.name}</span>
                {k.organisation_name && <em>· {k.organisation_name}</em>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* --- Die drei Texte ------------------------------------------------------- */

/**
 * Ein Feld, das sich beim Tippen selbst speichert, mit seinem Stand darunter.
 *
 * Der Stand steht immer da, auch wenn alles gespeichert ist: Wer mitschreibt,
 * soll nicht raten müssen, ob er raten muss.
 */
function Entwurfsfeld({
  wert,
  speichern,
  platzhalter,
  zeilen,
  aendern,
  klasse,
}: {
  wert: string;
  speichern: (text: string) => Promise<unknown>;
  platzhalter: string;
  zeilen: number;
  aendern: boolean;
  klasse?: string;
}) {
  // Der Haken muss über der Verzweigung stehen: Ein Leser sieht kein Feld,
  // aber Haken werden bei jedem Zeichnen in derselben Reihenfolge gerufen.
  const entwurf = useEntwurf(wert, speichern);

  if (!aendern)
    return <p className={`vorgelesen ${klasse ?? ""}`}>{wert || "Noch nichts eingetragen."}</p>;

  return (
    <>
      <textarea
        className={`feld entwurfsfeld ${klasse ?? ""}`}
        rows={zeilen}
        value={entwurf.text}
        placeholder={platzhalter}
        onChange={(e) => entwurf.setzen(e.target.value)}
        /* Wer wegklickt, hat aufgehört zu tippen — dann muss niemand auf die
           Pause warten. */
        onBlur={entwurf.jetztSichern}
      />
      <div className="entwurfsstand" data-stand={entwurf.stand}>
        {entwurf.stand === "fehler" && <Zeichen name="achtung" />}
        {standText(entwurf.stand, entwurf.zuletzt)}
      </div>
    </>
  );
}

/** Zugeklappt, sobald ein Protokoll steht — wie die Mitschrift. */
function Vorbereitungskarte({
  meeting,
  ich,
  neuLaden,
  zugeklappt,
}: {
  meeting: Meeting;
  ich: Ich;
  neuLaden: () => void;
  zugeklappt: boolean;
}) {
  const inhalt = (
    <>
      <Entwurfsfeld
        wert={meeting.vorbereitung}
        zeilen={6}
        platzhalter="Was wollen wir aus dem Termin holen? Welche Fragen sind offen, was muss gesagt werden?"
        aendern={ich.darf.bearbeiten}
        speichern={async (vorbereitung) => {
          await aendern(`/meetings/${meeting.id}/`, { vorbereitung });
          neuLaden();
        }}
      />
      <p className="tabellen-hinweis">
        Steht vor dem Termin fest und bleibt danach stehen — daran misst sich, ob wir bekommen
        haben, wofür wir hingegangen sind. Geht beim Aufbereiten mit, als Plan gekennzeichnet.
      </p>
    </>
  );

  if (!zugeklappt)
    return (
      <div className="karte">
        <h2>Vorbereitung</h2>
        {inhalt}
      </div>
    );

  return (
    <details className="karte klappkarte">
      <summary>
        <Zeichen name="zeiger" klasse="zeiger-klapp" />
        <span className="klapptitel">Vorbereitung</span>
        <span className="stand stand-leer">Der Plan vor dem Termin</span>
      </summary>
      {inhalt}
    </details>
  );
}

/**
 * Die Mitschrift und der Weg über ein LLM — eine Karte, weil beides dasselbe
 * Stück Arbeit ist: das Rohe hinein, das Lesbare heraus.
 *
 * Zugeklappt, sobald ein Protokoll steht (siehe oben).
 */
function Mitschriftkarte({
  meeting,
  ich,
  neuLaden,
  zugeklappt,
}: {
  meeting: Meeting;
  ich: Ich;
  neuLaden: () => void;
  zugeklappt: boolean;
}) {
  const inhalt = (
    <>
      <Entwurfsfeld
        wert={meeting.mitschrift}
        zeilen={zugeklappt ? 8 : 16}
        platzhalter={
          "Mitschreiben — Stichworte reichen. Wird beim Tippen gespeichert.\n\n" +
          "Wer sagt was, was wird zugesagt, was bleibt offen."
        }
        aendern={ich.darf.bearbeiten}
        speichern={async (mitschrift) => {
          await aendern(`/meetings/${meeting.id}/`, { mitschrift });
          neuLaden();
        }}
      />
      {ich.darf.bearbeiten && <Aufbereitung meeting={meeting} neuLaden={neuLaden} />}
    </>
  );

  if (!zugeklappt)
    return (
      <div className="karte">
        <h2>Mitschrift</h2>
        {inhalt}
      </div>
    );

  return (
    <details className="karte klappkarte">
      <summary>
        <Zeichen name="zeiger" klasse="zeiger-klapp" />
        <span className="klapptitel">Mitschrift & Aufbereitung</span>
        <span className="stand stand-leer">Quelle des Protokolls</span>
      </summary>
      {inhalt}
    </details>
  );
}

/**
 * Der Weg über ein Sprachmodell: hinaus mit dem Auftrag, herein mit dem
 * Ergebnis.
 *
 * **Kein eingebauter LLM-Aufruf.** SoCoS schickt nichts irgendwohin — was in
 * einer Mitschrift steht, geht kein Dienst etwas an, den wir nicht selbst
 * gewählt haben. Der Weg über die Zwischenablage lässt die Entscheidung bei
 * dem, der kopiert: Er sieht, was er einfügt, und wohin.
 */
function Aufbereitung({ meeting, neuLaden }: { meeting: Meeting; neuLaden: () => void }) {
  const [eingefuegt, setEingefuegt] = useState("");
  const [auftragOffen, setAuftragOffen] = useState(false);
  const [fragtErsetzen, setFragtErsetzen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const auftrag = auftragFuerLLM(meeting);
  const entwuerfe = abschnitteAusText(eingefuegt);
  const hatMitschrift = Boolean(meeting.mitschrift.trim());

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(auftrag);
      melden("gut", "Auftrag, Mitschrift und Vorbereitung liegen in der Zwischenablage.");
    } catch {
      // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Dann
      // steht der Text eben da und wird von Hand markiert — besser als ein
      // Knopf, der nichts tut und nichts sagt.
      setAuftragOffen(true);
      melden("fehler", "Der Browser lässt das Kopieren nicht zu — der Text steht jetzt unten.");
    }
  }

  async function uebernehmen() {
    if (entwuerfe.length === 0) return;
    if (meeting.abschnitte.length > 0 && !fragtErsetzen) return setFragtErsetzen(true);
    setLaeuft(true);
    try {
      await hole(`/meetings/${meeting.id}/protokoll/`, {
        method: "POST",
        body: JSON.stringify({ abschnitte: entwuerfe }),
      });
      setEingefuegt("");
      setFragtErsetzen(false);
      neuLaden();
      melden("gut", `${entwuerfe.length} Abschnitte übernommen.`);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="aufbereitung">
      <span className="beschriftung-klein">Aus der Mitschrift ein Protokoll machen</span>
      <p className="tabellen-hinweis" style={{ marginTop: 0 }}>
        Der Knopf legt Mitschrift und Vorbereitung samt Auftrag in die Zwischenablage — die Regeln
        darin sagen dem Modell, dass es nichts erfinden und nichts weglassen darf und dass der
        Plan kein Gesprächsinhalt ist. Das Ergebnis kommt in das Feld darunter; SoCoS zerlegt es
        an den Überschriften in Abschnitte, die danach einzeln änderbar sind.
      </p>

      <div className="feld-reihe">
        <button type="button" className="knopf-still" onClick={kopieren} disabled={!hatMitschrift}>
          <Zeichen name="pdf" />
          Für ein LLM kopieren
        </button>
        <button
          type="button"
          className="knopf-still"
          onClick={() => setAuftragOffen((o) => !o)}
          aria-expanded={auftragOffen}
        >
          {auftragOffen ? "Auftrag verbergen" : "Auftrag ansehen"}
        </button>
      </div>

      {!hatMitschrift && (
        <p className="tabellen-hinweis">Noch keine Mitschrift — es gäbe nichts zu kopieren.</p>
      )}

      {auftragOffen && (
        <textarea className="feld auftragsfeld" rows={10} readOnly value={auftrag} />
      )}

      <textarea
        className="feld"
        rows={6}
        placeholder="Das aufbereitete Protokoll hier einfügen …"
        value={eingefuegt}
        onChange={(e) => setEingefuegt(e.target.value)}
      />

      <div className="feld-reihe">
        <button
          type="button"
          className="knopf"
          onClick={uebernehmen}
          disabled={entwuerfe.length === 0 || laeuft}
        >
          <Zeichen name="haken" />
          Als Protokoll übernehmen
        </button>
        <span className="tabellen-hinweis" style={{ margin: 0 }}>
          {eingefuegt.trim()
            ? `${entwuerfe.length} ${entwuerfe.length === 1 ? "Abschnitt" : "Abschnitte"} erkannt`
            : "Überschriften mit ## trennen die Abschnitte."}
        </span>
      </div>

      {fragtErsetzen && (
        <div className="dialog-grund" role="dialog" aria-modal="true" onClick={() => setFragtErsetzen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Das Protokoll ersetzen?</h2>
            <p>
              Es stehen schon {meeting.abschnitte.length}{" "}
              {meeting.abschnitte.length === 1 ? "Abschnitt" : "Abschnitte"} da. Die neuen{" "}
              {entwuerfe.length} treten an ihre Stelle — was seither von Hand geändert wurde, ist
              danach weg. Die Mitschrift bleibt.
            </p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtErsetzen(false)}>
                Behalten
              </button>
              <button type="button" className="knopf" onClick={uebernehmen} disabled={laeuft}>
                Ersetzen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Das Protokoll bearbeiten ---------------------------------------------- */

type Abschnittsentwurf = { id: number; ueberschrift: string; text: string };

/**
 * Das ganze Protokoll in einem Fenster ändern.
 *
 * **Warum hier nicht an Ort und Stelle wie sonst** (`Feldtext`): Ein Protokoll
 * wird nicht an einem Wort nachgebessert, sondern am Stück durchgegangen —
 * dabei springt man zwischen Abschnitten hin und her. Ein Feld, das beim
 * Verlassen speichert, schickt bei jedem Sprung eine Anfrage und schreibt
 * jeden Zwischenstand ins Änderungsprotokoll. Hier gibt es **einen** Stand,
 * den man ganz übernimmt oder ganz verwirft.
 *
 * Und deshalb gibt es die Nachfrage beim Hinausklicken: Wo nicht von selbst
 * gespeichert wird, ist ein Klick daneben sonst ein stiller Verlust.
 *
 * Gespeichert wird nur, was sich geändert hat. Ein PATCH je Abschnitt schriebe
 * sonst zehn Protokolleinträge für einen geänderten Satz.
 */
function Protokolldialog({
  meeting,
  neuLaden,
  schliessen,
}: {
  meeting: Meeting;
  neuLaden: () => void;
  schliessen: () => void;
}) {
  const [entwuerfe, setEntwuerfe] = useState<Abschnittsentwurf[]>(() =>
    meeting.abschnitte.map((a) => ({ id: a.id, ueberschrift: a.ueberschrift, text: a.text })),
  );
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  // Verglichen wird über die id, nicht über die Position: Die Liste im Prop
  // kann sich zwischendurch neu sortiert haben, und dann verglichen sich zwei
  // fremde Abschnitte.
  const vorher = new Map(meeting.abschnitte.map((a) => [a.id, a]));
  const offen = entwuerfe.filter((e) => {
    const a = vorher.get(e.id);
    return !a || a.ueberschrift !== e.ueberschrift || a.text !== e.text;
  });

  const setzen = (id: number, teil: Partial<Abschnittsentwurf>) =>
    setEntwuerfe((alt) => alt.map((e) => (e.id === id ? { ...e, ...teil } : e)));

  async function speichern() {
    setLaeuft(true);
    try {
      for (const e of offen) {
        await aendern(`/meetingabschnitte/${e.id}/`, {
          ueberschrift: e.ueberschrift.trim(),
          text: e.text.trim(),
        });
      }
      neuLaden();
      schliessen();
      melden(
        "gut",
        offen.length === 1
          ? "Der geänderte Abschnitt ist gespeichert."
          : `${offen.length} geänderte Abschnitte sind gespeichert.`,
      );
    } catch {
      // `hole` hat den Grund schon gemeldet. Das Fenster bleibt offen — sonst
      // wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  // Hinausklicken, Abbrechen und Escape gehen denselben Weg: Steht etwas
  // Ungespeichertes da, wird gefragt, sonst schließt es sofort.
  const zurueck = () => (offen.length > 0 ? setFragtVerwerfen(true) : schliessen());

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fragtVerwerfen) setFragtVerwerfen(false);
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  });

  return (
    <>
      <div
        className="dialog-grund"
        role="dialog"
        aria-modal="true"
        aria-label="Protokoll bearbeiten"
        onClick={zurueck}
      >
        <div className="dialog dialog-arbeit" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>Protokoll bearbeiten</h2>
              {offen.length > 0 && (
                <span className="dialog-offen">
                  {offen.length === 1
                    ? "1 Abschnitt geändert"
                    : `${offen.length} Abschnitte geändert`}
                </span>
              )}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button
                type="button"
                className="knopf"
                onClick={speichern}
                disabled={laeuft || offen.length === 0}
              >
                Speichern
              </button>
            </div>
          </div>

          <div className="dialog-koerper">
            {entwuerfe.map((e, i) => (
              <div className="abschnitt-eingabe" key={e.id}>
                <input
                  className="feld"
                  value={e.ueberschrift}
                  placeholder="Ohne Überschrift"
                  autoFocus={i === 0}
                  onChange={(ev) => setzen(e.id, { ueberschrift: ev.target.value })}
                />
                <textarea
                  className="feld"
                  rows={Math.min(20, Math.max(4, e.text.split("\n").length + 1))}
                  value={e.text}
                  placeholder="Was in diesem Abschnitt steht …"
                  onChange={(ev) => setzen(e.id, { text: ev.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>
              {offen.length === 1 ? "Ein Abschnitt ist" : `${offen.length} Abschnitte sind`} geändert
              und noch nicht gespeichert. Wer jetzt schließt, hat wieder den Stand von vorher.
            </p>
            <div className="dialog-knoepfe">
              <button
                type="button"
                className="knopf-still"
                onClick={() => setFragtVerwerfen(false)}
              >
                Weiter bearbeiten
              </button>
              <button type="button" className="knopf-still" onClick={schliessen}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                onClick={() => {
                  setFragtVerwerfen(false);
                  speichern();
                }}
                disabled={laeuft}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* --- Das Protokoll -------------------------------------------------------- */

function Protokollkarte({
  meeting,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  meeting: Meeting;
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: Loeschauftrag) => void;
}) {
  async function anfuegen() {
    await hole("/meetingabschnitte/", {
      method: "POST",
      body: JSON.stringify({
        meeting: meeting.id,
        ueberschrift: "",
        text: "",
        reihenfolge: meeting.abschnitte.length,
      }),
    });
    neuLaden();
  }

  async function verschieben(abschnitt: Meetingabschnitt, richtung: "hoch" | "runter") {
    await hole(`/meetingabschnitte/${abschnitt.id}/verschieben/`, {
      method: "POST",
      body: JSON.stringify({ richtung }),
    });
    neuLaden();
  }

  // Das Übernehmen rückgängig: dasselbe Ersetzen wie beim Übernehmen, nur
  // durch nichts. Darf, wer übernehmen darf — es ist kein Löschen im Sinn der
  // Rollen, sondern der Rückweg aus dem eigenen Schritt. Die Abschnitte sind
  // danach weich gelöscht und stehen im Änderungsprotokoll.
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const [bearbeitet, setBearbeitet] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const anzahl = meeting.abschnitte.length;

  async function verwerfen() {
    setLaeuft(true);
    try {
      await hole(`/meetings/${meeting.id}/protokoll/`, {
        method: "POST",
        body: JSON.stringify({ abschnitte: [] }),
      });
      setFragtVerwerfen(false);
      neuLaden();
      melden("gut", "Das Protokoll ist verworfen — Mitschrift und Vorbereitung stehen wieder oben.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="karte">
      <div className="kartenkopf">
        <h2>Protokoll</h2>
        {ich.darf.bearbeiten && (
          <>
            {anzahl > 0 && (
              <button type="button" className="knopf-still" onClick={() => setBearbeitet(true)}>
                <Zeichen name="stift" />
                Bearbeiten
              </button>
            )}
            <button type="button" className="knopf-still" onClick={anfuegen}>
              <Zeichen name="plus" />
              Abschnitt
            </button>
            <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(true)}>
              <Zeichen name="kreuz" />
              Verwerfen
            </button>
          </>
        )}
      </div>

      {fragtVerwerfen && (
        <div
          className="dialog-grund"
          role="dialog"
          aria-modal="true"
          onClick={() => setFragtVerwerfen(false)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Das Protokoll verwerfen?</h2>
            <p>
              {anzahl === 1 ? "Der eine Abschnitt geht" : `Alle ${anzahl} Abschnitte gehen`} weg,
              auch was daran von Hand geändert wurde. Mitschrift und Vorbereitung bleiben und
              stehen danach wieder oben — du kannst neu aufbereiten. Wer nur einen Absatz
              richtigstellen will, ändert ihn im Abschnitt selbst.
            </p>
            <div className="dialog-knoepfe">
              <button
                type="button"
                className="knopf-still"
                onClick={() => setFragtVerwerfen(false)}
              >
                Behalten
              </button>
              <button type="button" className="knopf" onClick={verwerfen} disabled={laeuft}>
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      )}

      {bearbeitet && (
        <Protokolldialog
          meeting={meeting}
          neuLaden={neuLaden}
          schliessen={() => setBearbeitet(false)}
        />
      )}

      {meeting.abschnitte.map((a, i) => (
        <div className="abschnitt" key={a.id}>
          <div className="abschnitt-kopf">
            {/* Gelesen wird hier, geändert im Fenster hinter dem Stift — deshalb
                steht der Text hier schlicht da und nicht in einem Feld, das auf
                einen Klick wartet. */}
            <h3>{a.ueberschrift || <span className="leer">Ohne Überschrift</span>}</h3>
            {ich.darf.bearbeiten && (
              <div className="abschnitt-knoepfe">
                <button
                  type="button"
                  className="mini"
                  aria-label="Abschnitt nach oben"
                  disabled={i === 0}
                  onClick={() => verschieben(a, "hoch")}
                >
                  <Zeichen name="hoch" />
                </button>
                <button
                  type="button"
                  className="mini"
                  aria-label="Abschnitt nach unten"
                  disabled={i === meeting.abschnitte.length - 1}
                  onClick={() => verschieben(a, "runter")}
                >
                  <Zeichen name="runter" />
                </button>
                {ich.darf.loeschen && (
                  <button
                    type="button"
                    className="mini"
                    aria-label="Abschnitt entfernen"
                    onClick={() =>
                      zumLoeschen({
                        pfad: `/meetingabschnitte/${a.id}/`,
                        name: a.ueberschrift || "Abschnitt ohne Überschrift",
                        was: "Der Abschnitt",
                      })
                    }
                  >
                    <Zeichen name="kreuz" />
                  </button>
                )}
              </div>
            )}
          </div>
          <span className="abschnitt-text">
            {a.text || <span className="leer">Noch nichts geschrieben</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
