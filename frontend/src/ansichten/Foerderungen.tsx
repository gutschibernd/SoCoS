/**
 * Module · Förderungen: die Förderprogramme, je Programm seine Anträge, und
 * je Antrag eine eigene Seite.
 *
 * Drei Ebenen: `/module/foerderungen` zeigt die Programme als Kacheln,
 * `/module/foerderungen/1` ein Programm, `/module/foerderungen/1/3` einen
 * Antrag darin.
 *
 * **Die Programmseite beantwortet drei Fragen auf einen Blick:** Wie weit sind
 * die Anträge (Geld gegen die Grenze, Zeitleiste, Reife)? Was ist bei der
 * Förderstelle noch offen? Was sagt die Richtlinie? Alles darüber hinaus
 * steht auf der Seite des Antrags.
 *
 * **Die Antragsseite ist nach dem Antrag gebaut, nicht nach der Datenbank.**
 * Oben die Arbeitspakete als Zeitleiste — sie sind der Kern und das, woran
 * am meisten geschoben wird. Darunter die Felder in der Reihenfolge, in der
 * Formular und Richtlinie sie verlangen. Rechts steht immer, was noch fehlt
 * und wie viel Geld belegt ist; jeder Punkt springt an seine Stelle.
 *
 * Bearbeitet wird an Ort und Stelle: ein Klick auf einen Text, einen Betrag,
 * einen Balken. Kein Fenster mit „Speichern" — lange Texte speichern sich
 * beim Tippen, kurze beim Verlassen des Feldes.
 */

import { useEffect, useRef, useState, type PointerEvent as ZeigerEreignis } from "react";

import { hole } from "../basis/api";
import {
  useFoerderungen,
  useNeuLaden,
  type Foerderantrag,
  type Foerderfrage,
  type Foerderpaket,
  type Foerderprogramm,
  type Ich,
} from "../basis/daten";
import {
  STAENDE,
  antragsstandText,
  bedarfDazu,
  bedarfUmschalten,
  bedarfspunkte,
  fragenSortiert,
  fragenStand,
  geldlage,
  gezogen,
  istOffen,
  monatsanzahl,
  monatsname,
  neuePaketmonate,
  reifezahl,
  spanne,
  steckbriefpunkte,
  type Griff,
} from "../basis/foerderungen";
import { melden } from "../basis/meldungen";
import { alsEuro, betragAusEingabe, betragZumBearbeiten } from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Entwurfsfeld } from "../bausteine/Entwurfsfeld";
import { Feldtext } from "../bausteine/Feldtext";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

const WEG = "foerderungen";

/** Speichern und danach alles neu holen (`neuLaden`) — die Summen und die Reife rechnet der Server. */
function useAendern() {
  const neuLaden = useNeuLaden();
  return async (pfad: string, daten: Record<string, unknown>, methode: "PATCH" | "POST" = "PATCH"): Promise<void> => {
    await hole(pfad, { method: methode, body: JSON.stringify(daten) });
    neuLaden();
  };
}

/* --- Die Übersicht der Programme -------------------------------------------- */

/**
 * Jedes Förderprogramm als Kachel — heute nur eines, morgen mehrere. Die
 * Kachel sagt, wie viel ein Antrag höchstens bekommt, welche Anträge darin
 * laufen und was bei der Förderstelle noch offen ist; ein Klick öffnet das
 * Programm.
 */
export function Foerderungen({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const programme = useFoerderungen();
  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!programme.data) return <Zustand abfrage={programme} erneut={() => programme.refetch()} />;

  if (programme.data.length === 0)
    return (
      <div className="karte">
        <Leerstelle
          was="Noch kein Förderprogramm"
          satz="Ein Programm hält die Richtlinie in Kürze, die Fragen an die Förderstelle und die Anträge zusammen."
        />
        {ich.darf.bearbeiten && <NeuesProgramm wechseln={wechseln} />}
      </div>
    );

  return (
    <div className="fd-programme">
      {programme.data.map((p) => (
        <Programmkachel key={p.id} programm={p} wechseln={wechseln} />
      ))}
      {ich.darf.bearbeiten && <ProgrammDazu wechseln={wechseln} />}
    </div>
  );
}

/** Erst ein Knopf, erst nach dem Tippen darauf ein Feld — ein neues Programm ist selten. */
function ProgrammDazu({ wechseln }: { wechseln: Wechseln }) {
  const [offen, setOffen] = useState(false);
  if (!offen)
    return (
      <button type="button" className="fd-antrag-dazu" onClick={() => setOffen(true)}>
        <Zeichen name="plus" />
        Programm dazu
      </button>
    );
  return (
    <div className="karte fd-programm-neu">
      <h2>Neues Förderprogramm</h2>
      <NeuesProgramm wechseln={wechseln} autoFokus />
    </div>
  );
}

function Programmkachel({ programm, wechseln }: { programm: Foerderprogramm; wechseln: Wechseln }) {
  const offen = programm.fragen.filter(istOffen).length;
  return (
    <article className="fd-antragskarte fd-programmkachel">
      <div className="fd-antragskarte-kopf">
        <span className="modul-siegel">
          <Zeichen name="foerderung" />
        </span>
        {offen > 0 && (
          <span className="stand stand-offen">
            {offen} {offen === 1 ? "Frage" : "Fragen"} offen
          </span>
        )}
      </div>
      <h2>
        <a
          className="thema-kachel-link"
          href={`/module/${WEG}/${programm.id}`}
          onClick={(e) => {
            e.preventDefault();
            wechseln("module", `${WEG}/${programm.id}`);
          }}
        >
          {programm.name}
        </a>
      </h2>
      {programm.stelle && <p className="thema-kachel-text">{programm.stelle}</p>}
      <dl className="fd-kachelzahlen">
        <div>
          <dt>Höchstens je Antrag</dt>
          <dd className="zahl">{programm.max_foerderung ? alsEuro(programm.max_foerderung) : "—"}</dd>
        </div>
        <div>
          <dt>Laufzeit höchstens</dt>
          <dd className="zahl">{programm.max_monate ? `${programm.max_monate} Mon.` : "—"}</dd>
        </div>
      </dl>
      {programm.antraege.length > 0 && (
        <ul className="fd-kachelantraege">
          {programm.antraege.map((a) => (
            <li key={a.id}>
              <span className="zahl fd-nummer">{a.nummer}</span>
              <span className="fd-kachelantrag-titel">{a.titel}</span>
              <span className="stand" data-antrag={a.stand}>
                {antragsstandText(a.stand)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="thema-kachel-fuss">
        <span className="fd-kartenfuss zahl">
          {programm.antraege.length} {programm.antraege.length === 1 ? "Antrag" : "Anträge"}
        </span>
        <Zeichen name="zeiger" klasse="thema-kachel-zeiger" />
      </div>
    </article>
  );
}

function NeuesProgramm({ wechseln, autoFokus }: { wechseln: Wechseln; autoFokus?: boolean }) {
  const neuLaden = useNeuLaden();
  const [name, setName] = useState("");
  return (
    <form
      className="feld-reihe fd-neu"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const neu = await hole<Foerderprogramm>("/foerderprogramme/", {
          method: "POST",
          body: JSON.stringify({ name: name.trim() }),
        });
        neuLaden();
        wechseln("module", `${WEG}/${neu.id}`);
      }}
    >
      <input
        className="feld"
        value={name}
        placeholder="Name des Programms, z. B. Pflegeinnovation NÖ"
        autoFocus={autoFokus}
        aria-label="Name des Programms"
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="knopf" disabled={!name.trim()}>
        <Zeichen name="plus" />
        Anlegen
      </button>
    </form>
  );
}

/* --- Die Seite eines Programms ---------------------------------------------- */

export function Programmseite({ ich, id, wechseln }: { ich: Ich; id: number; wechseln: Wechseln }) {
  const programme = useFoerderungen();
  if (!programme.data) return <Zustand abfrage={programme} erneut={() => programme.refetch()} />;
  const programm = programme.data.find((p) => p.id === id);
  if (!programm)
    return (
      <div className="karte">
        <Leerstelle
          was="Dieses Förderprogramm gibt es nicht mehr"
          satz="Es wurde entfernt. Ein Admin kann es wiederherstellen."
          aktion={{ text: "Zu den Förderungen", tun: () => wechseln("module", WEG) }}
        />
      </div>
    );
  return (
    <div className="spalte">
      <Programm programm={programm} ich={ich} wechseln={wechseln} />
    </div>
  );
}

function Programm({ programm, ich, wechseln }: { programm: Foerderprogramm; ich: Ich; wechseln: Wechseln }) {
  const speichern = useAendern();
  const neuLaden = useNeuLaden();
  const darf = ich.darf.bearbeiten;
  const offen = programm.fragen.filter(istOffen).length;

  async function antragDazu() {
    const nummer = Math.max(0, ...programm.antraege.map((a) => a.nummer)) + 1;
    const neu = await hole<Foerderantrag>("/foerderantraege/", {
      method: "POST",
      body: JSON.stringify({ programm: programm.id, nummer, titel: `Antrag ${nummer}` }),
    });
    neuLaden();
    wechseln("module", `${WEG}/${programm.id}/${neu.id}`);
  }

  return (
    <>
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <Feldtext
            wert={programm.name}
            aendern={darf}
            klasse="fd-programmname"
            speichern={(name) => speichern(`/foerderprogramme/${programm.id}/`, { name })}
          />
          <Feldtext
            wert={programm.stelle}
            aendern={darf}
            klasse="fd-stelle"
            platzhalter="Förderstelle und Kontakt"
            speichern={(stelle) => speichern(`/foerderprogramme/${programm.id}/`, { stelle })}
          />
        </div>
        {programm.link && (
          <div className="vorhaben-aktionen">
            <a className="knopf-still" href={programm.link} target="_blank" rel="noreferrer noopener">
              Seite des Landes
              <Zeichen name="zeiger" />
            </a>
          </div>
        )}
      </div>

      <div className="fd-eckdaten">
        <Eckdatum beschriftung="Höchstens je Antrag">
          <Betragsfeld
            betrag={programm.max_foerderung}
            aendern={darf}
            leer="keine Grenze"
            speichern={(max_foerderung) => speichern(`/foerderprogramme/${programm.id}/`, { max_foerderung })}
          />
        </Eckdatum>
        <Eckdatum beschriftung="Laufzeit höchstens">
          <Zahlfeld
            wert={programm.max_monate}
            einheit="Monate"
            aendern={darf}
            speichern={(max_monate) => speichern(`/foerderprogramme/${programm.id}/`, { max_monate })}
          />
        </Eckdatum>
        <Eckdatum beschriftung="Anträge">
          <span className="fd-eckwert">{programm.antraege.length}</span>
        </Eckdatum>
        <Eckdatum beschriftung="Fragen offen" achtung={offen > 0}>
          <a className="fd-eckwert" href="#fd-fragen">
            {offen}
          </a>
        </Eckdatum>
      </div>

      <section aria-label="Anträge" className="fd-antraege">
        {programm.antraege.map((a) => (
          <Antragskarte key={a.id} antrag={a} programm={programm} wechseln={wechseln} />
        ))}
        {darf && (
          <button type="button" className="fd-antrag-dazu" onClick={antragDazu}>
            <Zeichen name="plus" />
            Antrag dazu
          </button>
        )}
      </section>

      <div className="fd-unten">
        <Fragenkarte programm={programm} darf={darf} darfLoeschen={ich.darf.loeschen} />
        <Richtlinienkarte programm={programm} darf={darf} />
      </div>
    </>
  );
}

function Eckdatum({
  beschriftung,
  achtung,
  children,
}: {
  beschriftung: string;
  achtung?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fd-eckdatum" data-achtung={achtung || undefined}>
      <span className="beschriftung-klein">{beschriftung}</span>
      {children}
    </div>
  );
}

/**
 * Ein Antrag als Kachel: wie viel Geld er belegt, wie seine Pakete in der Zeit
 * liegen, wie viel ihm noch fehlt. Die ganze Kachel führt zum Antrag.
 */
function Antragskarte({
  antrag,
  programm,
  wechseln,
}: {
  antrag: Foerderantrag;
  programm: Foerderprogramm;
  wechseln: Wechseln;
}) {
  const geld = geldlage(antrag.summe, programm.max_foerderung);
  const reife = reifezahl(antrag);
  const anzahl = monatsanzahl(antrag, programm);
  return (
    <article className="fd-antragskarte">
      <div className="fd-antragskarte-kopf">
        <span className="zahl fd-nummer">Antrag {antrag.nummer}</span>
        <span className="stand" data-antrag={antrag.stand}>
          {antragsstandText(antrag.stand)}
        </span>
      </div>
      <h2>
        <a
          className="thema-kachel-link"
          href={`/module/${WEG}/${programm.id}/${antrag.id}`}
          onClick={(e) => {
            e.preventDefault();
            wechseln("module", `${WEG}/${programm.id}/${antrag.id}`);
          }}
        >
          {antrag.titel}
        </a>
      </h2>

      <div className="fd-geldzeile">
        <span className="zahl">
          <b>{alsEuro(antrag.summe)}</b>
          {programm.max_foerderung && <> von {alsEuro(programm.max_foerderung)}</>}
        </span>
        {geld.ueber && <span className="fd-ueber">über der Grenze</span>}
      </div>
      {programm.max_foerderung && <Geldbalken anteil={geld.anteil} ueber={geld.ueber} />}

      {/* Die Zeitleiste im Kleinen: je Paket ein Strich. Sie ersetzt keine
          Zahl, sie zeigt die Form — was parallel läuft, wo Lücken sind. */}
      <div className="fd-mini" aria-hidden="true" style={{ ["--monate" as string]: anzahl }}>
        {antrag.pakete.map((p) => (
          <i key={p.id} style={{ ["--von" as string]: p.von, ["--bis" as string]: p.bis }} />
        ))}
      </div>

      <div className="thema-kachel-fuss">
        <span className="fd-kartenfuss zahl">
          {antrag.pakete.length} {antrag.pakete.length === 1 ? "Paket" : "Pakete"} · {antrag.laufzeit} Mon.
        </span>
        <span className="fd-reifezahl" data-fertig={reife.erfuellt === reife.von || undefined}>
          <Reifepunkte antrag={antrag} />
          {reife.erfuellt}/{reife.von}
        </span>
        <Zeichen name="zeiger" klasse="thema-kachel-zeiger" />
      </div>
    </article>
  );
}

function Reifepunkte({ antrag }: { antrag: Foerderantrag }) {
  return (
    <span className="fd-punkte">
      {antrag.reife.map((p) => (
        <i key={p.schluessel} data-erfuellt={p.erfuellt || undefined} title={p.text} />
      ))}
    </span>
  );
}

function Geldbalken({ anteil, ueber }: { anteil: number; ueber: boolean }) {
  return (
    <span className="fd-geldbalken" data-ueber={ueber || undefined}>
      <span style={{ width: `${anteil}%` }} />
    </span>
  );
}

/* --- Fragen an die Förderstelle --------------------------------------------- */

/**
 * Die Fragen, offene oben. Eine Frage klappt auf, wenn man sie antippt; dort
 * stehen Antwort und Quelle zum Eintragen. Eine neue Frage ist eine Zeile
 * unten — tippen, Enter.
 */
function Fragenkarte({ programm, darf, darfLoeschen }: { programm: Foerderprogramm; darf: boolean; darfLoeschen: boolean }) {
  const speichern = useAendern();
  const [offen, setOffen] = useState<number | null>(null);
  const [neu, setNeu] = useState("");
  const fragen = fragenSortiert(programm.fragen);

  async function dazu() {
    if (!neu.trim()) return;
    const reihenfolge = Math.max(0, ...programm.fragen.map((f) => f.reihenfolge)) + 1;
    await speichern("/foerderfragen/", { programm: programm.id, frage: neu.trim(), reihenfolge }, "POST");
    setNeu("");
  }

  return (
    <section className="karte fd-fragen" id="fd-fragen">
      <div className="fd-kartenkopf">
        <h2>Fragen an die Förderstelle</h2>
        <span className="zahl fd-leise">{fragenStand(programm.fragen)}</span>
      </div>
      {fragen.length === 0 && !darf && <p className="fd-leise">Noch keine Fragen.</p>}
      <ul className="fd-fragenliste">
        {fragen.map((f) => (
          <Fragezeile
            key={f.id}
            frage={f}
            offen={offen === f.id}
            umschalten={() => setOffen(offen === f.id ? null : f.id)}
            darf={darf}
            darfLoeschen={darfLoeschen}
          />
        ))}
      </ul>
      {darf && (
        <form
          className="feld-reihe fd-neu"
          onSubmit={(e) => {
            e.preventDefault();
            dazu();
          }}
        >
          <input
            className="feld"
            value={neu}
            placeholder="Neue Frage — Enter legt sie an"
            aria-label="Neue Frage an die Förderstelle"
            onChange={(e) => setNeu(e.target.value)}
          />
          <button type="submit" className="knopf-still" disabled={!neu.trim()}>
            <Zeichen name="plus" />
            Frage
          </button>
        </form>
      )}
    </section>
  );
}

function Fragezeile({
  frage,
  offen,
  umschalten,
  darf,
  darfLoeschen,
}: {
  frage: Foerderfrage;
  offen: boolean;
  umschalten: () => void;
  darf: boolean;
  darfLoeschen: boolean;
}) {
  const speichern = useAendern();
  const neuLaden = useNeuLaden();
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const beantwortet = !istOffen(frage);
  const pfad = `/foerderfragen/${frage.id}/`;

  return (
    <li className="fd-frage" data-beantwortet={beantwortet || undefined} data-offen={offen || undefined}>
      <div className="fd-frage-zeile">
        {/* Der Haken ist ein eigener Knopf neben dem Aufklappen — ein Knopf
            in einem Knopf ginge nicht, und abhaken soll nicht aufklappen. */}
        <button
          type="button"
          className="fd-frage-punkt"
          role="checkbox"
          aria-checked={beantwortet}
          aria-label={beantwortet ? "Wieder als offen führen" : "Als beantwortet abhaken"}
          title={beantwortet ? "Wieder als offen führen" : "Als beantwortet abhaken"}
          disabled={!darf}
          onClick={() => speichern(pfad, { beantwortet: !beantwortet })}
        >
          {beantwortet && <Zeichen name="haken" />}
        </button>
        <button type="button" className="fd-frage-kopf" aria-expanded={offen} onClick={umschalten}>
          <span className="fd-frage-text">{frage.frage}</span>
          <Zeichen name="zeiger" klasse="zeiger-klapp" />
        </button>
      </div>
      {!offen && frage.antwort.trim() && <p className="fd-antwort-kurz">{frage.antwort}</p>}
      {offen && (
        <div className="fd-frage-innen">
          {darf && (
            <label className="profilfeld">
              <span className="beschriftung-klein">Frage</span>
              <Feldtext wert={frage.frage} aendern mehrzeilig zeilen={2} speichern={(t) => speichern(pfad, { frage: t })} />
            </label>
          )}
          <label className="profilfeld">
            <span className="beschriftung-klein">Antwort</span>
            <Feldtext
              wert={frage.antwort}
              aendern={darf}
              mehrzeilig
              zeilen={4}
              platzhalter="Noch keine Antwort — hier eintragen, was die Förderstelle sagt."
              speichern={(antwort) => speichern(pfad, { antwort })}
            />
          </label>
          <label className="profilfeld">
            <span className="beschriftung-klein">Quelle</span>
            <Feldtext
              wert={frage.quelle}
              aendern={darf}
              platzhalter="Wer hat es gesagt, wo steht es?"
              speichern={(quelle) => speichern(pfad, { quelle })}
            />
          </label>
          {darfLoeschen && (
            <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
              <Zeichen name="korb" />
              Frage entfernen
            </button>
          )}
        </div>
      )}
      {fragtLoeschen && (
        <Loeschdialog
          name={frage.frage.length > 60 ? `${frage.frage.slice(0, 60)} …` : frage.frage}
          was="Die Frage samt Antwort"
          milder={
            beantwortet
              ? undefined
              : { text: "Als beantwortet abhaken", tun: async () => {
                  setFragtLoeschen(false);
                  await speichern(pfad, { beantwortet: true });
                } }
          }
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={async () => {
            await hole(pfad, { method: "DELETE" }).catch(() => undefined);
            setFragtLoeschen(false);
            neuLaden();
          }}
        />
      )}
    </li>
  );
}

/* --- Die Richtlinie in Kürze ------------------------------------------------ */

function Richtlinienkarte({ programm, darf }: { programm: Foerderprogramm; darf: boolean }) {
  const speichern = useAendern();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [text, setText] = useState(programm.steckbrief);
  const punkte = steckbriefpunkte(programm.steckbrief);

  return (
    <section className="karte fd-richtlinie">
      <div className="fd-kartenkopf">
        <h2>Richtlinie in Kürze</h2>
        {darf && !bearbeiten && (
          <button
            type="button"
            className="knopf-still fd-klein"
            onClick={() => {
              setText(programm.steckbrief);
              setBearbeiten(true);
            }}
          >
            <Zeichen name="stift" />
            Bearbeiten
          </button>
        )}
      </div>
      {bearbeiten ? (
        <>
          <textarea
            className="feld entwurfsfeld"
            rows={16}
            value={text}
            aria-label="Richtlinie in Kürze"
            placeholder={"Eine Zeile je Punkt: „Begriff: Erklärung“"}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="feld-reihe fd-knopfzeile">
            <button type="button" className="knopf-still" onClick={() => setBearbeiten(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="knopf"
              onClick={async () => {
                await speichern(`/foerderprogramme/${programm.id}/`, { steckbrief: text.trim() });
                setBearbeiten(false);
              }}
            >
              <Zeichen name="haken" />
              Speichern
            </button>
          </div>
        </>
      ) : punkte.length === 0 ? (
        <p className="fd-leise">Noch nichts eingetragen — eine Zeile je Punkt, „Begriff: Erklärung“.</p>
      ) : (
        <dl className="fd-steckbrief">
          {punkte.map((p, i) => (
            <div key={i}>
              {p.begriff && <dt>{p.begriff}</dt>}
              <dd>{p.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* --- Die Antragsseite ------------------------------------------------------- */

export function Antragsseite({ ich, id, wechseln }: { ich: Ich; id: number; wechseln: Wechseln }) {
  const programme = useFoerderungen();
  if (!programme.data) return <Zustand abfrage={programme} erneut={() => programme.refetch()} />;

  const programm = programme.data.find((p) => p.antraege.some((a) => a.id === id));
  const antrag = programm?.antraege.find((a) => a.id === id);
  if (!programm || !antrag)
    return (
      <div className="karte">
        <Leerstelle
          was="Diesen Antrag gibt es nicht mehr"
          satz="Er wurde entfernt. Ein Admin kann ihn wiederherstellen."
          aktion={{ text: "Zu den Förderungen", tun: () => wechseln("module", WEG) }}
        />
      </div>
    );

  return <Antrag key={antrag.id} antrag={antrag} programm={programm} ich={ich} wechseln={wechseln} />;
}

function Antrag({
  antrag,
  programm,
  ich,
  wechseln,
}: {
  antrag: Foerderantrag;
  programm: Foerderprogramm;
  ich: Ich;
  wechseln: Wechseln;
}) {
  const speichern = useAendern();
  const neuLaden = useNeuLaden();
  const darf = ich.darf.bearbeiten;
  const pfad = `/foerderantraege/${antrag.id}/`;
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const titelZeichen = antrag.titel.length;

  // Ein Text speichert sich selbst; danach wird neu geholt, damit die Reife
  // rechts mitkommt.
  const textSpeichern = (feld: keyof Foerderantrag) => async (text: string) => {
    await hole(pfad, { method: "PATCH", body: JSON.stringify({ [feld]: text }) });
    neuLaden();
  };

  return (
    <div className="fd-antragsseite">
      <div className="fd-hauptspalte">
        <section className="karte fd-antragskopf">
          <div className="fd-antragskopf-oben">
            <a
              className="fd-zurueck"
              href={`/module/${WEG}/${programm.id}`}
              onClick={(e) => {
                e.preventDefault();
                wechseln("module", `${WEG}/${programm.id}`);
              }}
            >
              {programm.name}
            </a>
            <span className="zahl fd-nummer">Antrag {antrag.nummer}</span>
          </div>
          <Feldtext
            wert={antrag.titel}
            aendern={darf}
            mehrzeilig
            zeilen={2}
            klasse="fd-antragstitel"
            speichern={(titel) => speichern(pfad, { titel })}
          />
          <span className="zeichenzahl" data-ueber={titelZeichen > antrag.zeichen.titel || undefined}>
            Kurzbezeichnung · {titelZeichen} / {antrag.zeichen.titel}
          </span>

          <div className="fd-kopfzeile">
            <div className="spannenwahl fd-standwahl" role="group" aria-label="Stand des Antrags">
              {STAENDE.map((s) => (
                <button
                  key={s.wert}
                  type="button"
                  aria-pressed={antrag.stand === s.wert}
                  disabled={!darf}
                  onClick={() => antrag.stand !== s.wert && speichern(pfad, { stand: s.wert })}
                >
                  {s.text}
                </button>
              ))}
            </div>
            <label className="fd-kopffeld">
              <span className="beschriftung-klein">Förderwerber</span>
              <Feldtext
                wert={antrag.foerderwerber}
                aendern={darf}
                platzhalter="Wer reicht ein?"
                speichern={(foerderwerber) => speichern(pfad, { foerderwerber })}
              />
            </label>
            <label className="fd-kopffeld">
              <span className="beschriftung-klein">Geplanter Beginn</span>
              <input
                type="date"
                className="feld"
                value={antrag.beginn ?? ""}
                disabled={!darf}
                onChange={(e) => speichern(pfad, { beginn: e.target.value || null })}
              />
            </label>
          </div>
        </section>

        <Zeitplan antrag={antrag} programm={programm} darf={darf} darfLoeschen={ich.darf.loeschen} />

        <section className="karte fd-abschnitt" id="fd-beschreibung">
          <h2>Beschreibung des Vorhabens</h2>
          <p className="fd-wozu">Steht so im Online-Formular — höchstens {antrag.zeichen.beschreibung} Zeichen.</p>
          <Entwurfsfeld
            wert={antrag.beschreibung}
            zeilen={5}
            aendern={darf}
            hoechstens={antrag.zeichen.beschreibung}
            platzhalter="Worum es geht, für wen, und was am Ende anders ist."
            speichern={textSpeichern("beschreibung")}
          />
        </section>

        <section className="karte fd-abschnitt">
          <h2>Projektbeschreibung</h2>
          <p className="fd-wozu">Beilage „inhaltliche Projektbeschreibung“, Richtlinie V.4 a–c.</p>
          {(
            [
              ["nutzen", "a · Nutzen für Pflege und Betreuung", "Was die Technologie in der täglichen Pflege- und Betreuungsarbeit leistet."],
              ["mehrwert", "b · Mehrwert gegenüber Bestehendem", "Was es heute gibt, und warum das nicht reicht."],
              ["wirkung", "c · Wirkungsziele und Kennzahlen", "Woran man den Erfolg misst — mit Zahl, Ausgangswert und Ziel."],
            ] as const
          ).map(([feld, titel, platzhalter]) => (
            <div key={feld} className="fd-teil" id={`fd-${feld}`}>
              <h3>{titel}</h3>
              <Entwurfsfeld
                wert={antrag[feld]}
                zeilen={6}
                aendern={darf}
                platzhalter={platzhalter}
                speichern={textSpeichern(feld)}
              />
            </div>
          ))}
        </section>

        <section className="karte fd-abschnitt" id="fd-regelbetrieb">
          <h2>Kostenprognose Regelbetrieb</h2>
          <p className="fd-wozu">Beilage „Finanzierungskonzept langfristig“, Richtlinie V.4.e.</p>
          <Entwurfsfeld
            wert={antrag.regelbetrieb}
            zeilen={5}
            aendern={darf}
            platzhalter="Was der dauernde Gebrauch kostet, und warum sich das ein Träger leisten kann."
            speichern={textSpeichern("regelbetrieb")}
          />
        </section>

        {ich.darf.loeschen && (
          <div className="fd-fussknopf">
            <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
              <Zeichen name="korb" />
              Antrag entfernen
            </button>
          </div>
        )}
      </div>

      <aside className="fd-seitenspalte">
        <Geldkarte antrag={antrag} programm={programm} />
        <Reifekarte antrag={antrag} />
        <Bedarfskarte antrag={antrag} darf={darf} />
        {programm.fragen.some(istOffen) && (
          <a
            className="karte fd-fragenhinweis"
            href={`/module/${WEG}/${programm.id}#fd-fragen`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", `${WEG}/${programm.id}`);
            }}
          >
            <Zeichen name="sprechblase" />
            <span>
              {fragenStand(programm.fragen)} bei der Förderstelle
            </span>
            <Zeichen name="zeiger" />
          </a>
        )}
      </aside>

      {fragtLoeschen && (
        <Loeschdialog
          name={antrag.titel}
          was="Der Antrag samt Arbeitspaketen"
          milder={
            antrag.stand === "abgelehnt"
              ? undefined
              : { text: "Als abgelehnt führen", tun: async () => {
                  setFragtLoeschen(false);
                  await speichern(pfad, { stand: "abgelehnt" });
                } }
          }
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={async () => {
            try {
              await hole(pfad, { method: "DELETE" });
              neuLaden();
              wechseln("module", `${WEG}/${programm.id}`);
            } catch {
              setFragtLoeschen(false);
            }
          }}
        />
      )}
    </div>
  );
}

/* --- Rechts: Geld, Reife, Bedarf -------------------------------------------- */

function Geldkarte({ antrag, programm }: { antrag: Foerderantrag; programm: Foerderprogramm }) {
  const geld = geldlage(antrag.summe, programm.max_foerderung);
  return (
    <section className="karte fd-geld" data-ueber={geld.ueber || undefined}>
      <span className="beschriftung-klein">Beantragte Fördersumme</span>
      <b className="zahl fd-summe">{alsEuro(antrag.summe)}</b>
      {programm.max_foerderung && (
        <>
          <Geldbalken anteil={geld.anteil} ueber={geld.ueber} />
          <span className="fd-geldtext">
            {geld.ueber
              ? `${alsEuro(geld.frei!.replace("-", ""))} über ${alsEuro(programm.max_foerderung)}`
              : `noch ${alsEuro(geld.frei!)} bis ${alsEuro(programm.max_foerderung)}`}
          </span>
        </>
      )}
      <span className="fd-geldtext">
        Laufzeit <b className="zahl">{antrag.laufzeit}</b>
        {programm.max_monate ? ` von ${programm.max_monate}` : ""} Monaten
      </span>
    </section>
  );
}

/** Was noch fehlt — jeder Punkt springt an die Stelle, an der man ihn erledigt. */
function Reifekarte({ antrag }: { antrag: Foerderantrag }) {
  const { erfuellt, von } = reifezahl(antrag);
  const ziel: Record<string, string> = {
    titel: "fd-oben",
    beschreibung: "fd-beschreibung",
    nutzen: "fd-nutzen",
    mehrwert: "fd-mehrwert",
    wirkung: "fd-wirkung",
    pakete: "fd-zeitplan",
    summe: "fd-zeitplan",
    laufzeit: "fd-zeitplan",
    regelbetrieb: "fd-regelbetrieb",
  };
  return (
    <section className="karte fd-reife">
      <div className="fd-kartenkopf">
        <h2>Antragsreife</h2>
        <span className="zahl fd-leise">
          {erfuellt} / {von}
        </span>
      </div>
      <ul>
        {antrag.reife.map((p) => (
          <li key={p.schluessel} data-erfuellt={p.erfuellt || undefined}>
            <button
              type="button"
              onClick={() => {
                const stelle = ziel[p.schluessel];
                const el = stelle === "fd-oben" ? null : document.getElementById(stelle);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                else window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <i aria-hidden="true">{p.erfuellt && <Zeichen name="haken" />}</i>
              <span>
                {p.text}
                {p.hinweis && <em>{p.hinweis}</em>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Was wir noch brauchen — abhaken mit einem Tipp, neu mit einer Zeile. */
function Bedarfskarte({ antrag, darf }: { antrag: Foerderantrag; darf: boolean }) {
  const speichern = useAendern();
  const [neu, setNeu] = useState("");
  const punkte = bedarfspunkte(antrag.datenbedarf);
  const pfad = `/foerderantraege/${antrag.id}/`;
  const offen = punkte.filter((p) => !p.da).length;

  return (
    <section className="karte fd-bedarf">
      <div className="fd-kartenkopf">
        <h2>Was wir noch brauchen</h2>
        <span className="zahl fd-leise">{punkte.length === 0 ? "" : offen === 0 ? "alles da" : `${offen} offen`}</span>
      </div>
      {punkte.length > 0 && (
        <ul>
          {punkte.map((p, i) => (
            <li key={`${i}-${p.text}`}>
              <label>
                <input
                  type="checkbox"
                  checked={p.da}
                  disabled={!darf}
                  onChange={() => speichern(pfad, { datenbedarf: bedarfUmschalten(antrag.datenbedarf, i) })}
                />
                <span>{p.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {darf && (
        <form
          className="fd-neu"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!neu.trim()) return;
            await speichern(pfad, { datenbedarf: bedarfDazu(antrag.datenbedarf, neu) });
            setNeu("");
          }}
        >
          <input
            className="feld"
            value={neu}
            placeholder="Was fehlt noch? Enter"
            aria-label="Neuer Punkt"
            onChange={(e) => setNeu(e.target.value)}
          />
        </form>
      )}
    </section>
  );
}

/* --- Die Zeitleiste --------------------------------------------------------- */

/** Ein Zug, solange der Zeiger unten ist: welches Paket, welcher Griff, wo er anfing. */
type Zug = { id: number; griff: Griff; x: number; breite: number; von: number; bis: number };

/**
 * Die Arbeitspakete als Zeitleiste. Je Paket eine Zeile: Nummer, Titel,
 * Balken, Betrag. Den Balken zieht man in der Mitte, um ihn zu verschieben,
 * an einem Rand, um ihn zu verlängern; mit der Tastatur tun ← und → dasselbe
 * (mit Umschalt: das Ende). Ein Tipp auf den Titel klappt das Paket auf.
 *
 * Während des Ziehens zeichnet die Seite den Balken selbst; gespeichert wird
 * beim Loslassen — jeder Monat dazwischen wäre sonst ein Protokolleintrag.
 */
function Zeitplan({
  antrag,
  programm,
  darf,
  darfLoeschen,
}: {
  antrag: Foerderantrag;
  programm: Foerderprogramm;
  darf: boolean;
  darfLoeschen: boolean;
}) {
  const speichern = useAendern();
  const anzahl = monatsanzahl(antrag, programm);
  const [aufgeklappt, setAufgeklappt] = useState<number | null>(null);
  const [zug, setZug] = useState<Zug | null>(null);
  const [vorschau, setVorschau] = useState<{ id: number; von: number; bis: number } | null>(null);
  const [neu, setNeu] = useState("");
  const monate = Array.from({ length: anzahl }, (_, i) => i + 1);
  // Bei vielen Monaten nicht jeden beschriften — sonst stehen die Namen
  // übereinander. Die Linien bleiben je Monat.
  const jede = anzahl > 18 ? 3 : anzahl > 12 ? 2 : 1;

  async function verschieben(paket: Foerderpaket, ziel: { von: number; bis: number }) {
    if (ziel.von === paket.von && ziel.bis === paket.bis) return;
    setVorschau({ id: paket.id, ...ziel });
    try {
      await speichern(`/foerderpakete/${paket.id}/`, ziel);
    } finally {
      setVorschau(null);
    }
  }

  function runter(e: ZeigerEreignis<HTMLElement>, paket: Foerderpaket) {
    if (!darf || e.button !== 0) return;
    const achse = (e.currentTarget.closest(".fd-achse") as HTMLElement | null)?.getBoundingClientRect();
    if (!achse) return;
    const griff = ((e.target as HTMLElement).dataset.griff ?? "mitte") as Griff;
    e.currentTarget.setPointerCapture(e.pointerId);
    setZug({ id: paket.id, griff, x: e.clientX, breite: achse.width / anzahl, von: paket.von, bis: paket.bis });
  }

  function bewegen(e: ZeigerEreignis<HTMLElement>) {
    if (!zug) return;
    const um = Math.round((e.clientX - zug.x) / zug.breite);
    setVorschau({ id: zug.id, ...gezogen(zug, zug.griff, um, anzahl) });
  }

  function los(paket: Foerderpaket) {
    if (!zug) return;
    const ziel = vorschau && vorschau.id === paket.id ? vorschau : null;
    setZug(null);
    if (ziel) verschieben(paket, ziel);
    else setVorschau(null);
  }

  function taste(e: React.KeyboardEvent, paket: Foerderpaket) {
    if (!darf || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const um = e.key === "ArrowLeft" ? -1 : 1;
    verschieben(paket, gezogen(paket, e.shiftKey ? "ende" : "mitte", um, anzahl));
  }

  async function dazu() {
    if (!neu.trim()) return;
    const reihenfolge = Math.max(0, ...antrag.pakete.map((p) => p.reihenfolge)) + 1;
    await speichern(
      "/foerderpakete/",
      { antrag: antrag.id, titel: neu.trim(), reihenfolge, ...neuePaketmonate(antrag, anzahl) },
      "POST",
    );
    setNeu("");
  }

  return (
    <section className="karte fd-zeitplan" id="fd-zeitplan" style={{ ["--monate" as string]: anzahl }}>
      <div className="fd-kartenkopf">
        <h2>Arbeitspakete und Zeitplan</h2>
        <span className="fd-leise">
          {darf ? "Balken ziehen verschiebt, Ränder ziehen verlängert" : `${antrag.pakete.length} Pakete`}
        </span>
      </div>

      <div className="fd-zeilen" role="list">
        <div className="fd-zeile fd-monatskopf" aria-hidden="true">
          <span />
          <span />
          <div className="fd-achse">
            {monate.map((m) => (
              <span
                key={m}
                className="fd-monat"
                data-ueber={(programm.max_monate !== null && m > programm.max_monate) || undefined}
              >
                {(m - 1) % jede === 0 ? monatsname(m, antrag.beginn) : ""}
              </span>
            ))}
          </div>
          <span className="fd-betragkopf">Betrag</span>
        </div>

        {antrag.pakete.map((p, i) => {
          const lage = vorschau?.id === p.id ? vorschau : p;
          const offen = aufgeklappt === p.id;
          return (
            <div key={p.id} role="listitem" className="fd-paket" data-offen={offen || undefined}>
              <div className="fd-zeile">
                <span className="zahl fd-apnr">{i + 1}</span>
                <button
                  type="button"
                  className="fd-aptitel"
                  aria-expanded={offen}
                  onClick={() => setAufgeklappt(offen ? null : p.id)}
                >
                  <span>{p.titel}</span>
                  <em className="zahl">{spanne(lage.von, lage.bis, antrag.beginn)}</em>
                </button>
                <div className="fd-achse">
                  <Raster anzahl={anzahl} />
                  <div
                    className="fd-balken"
                    role="slider"
                    tabIndex={darf ? 0 : -1}
                    aria-label={`${p.titel}: ${spanne(lage.von, lage.bis, antrag.beginn)}`}
                    aria-valuemin={1}
                    aria-valuemax={anzahl}
                    aria-valuenow={lage.von}
                    aria-valuetext={spanne(lage.von, lage.bis, antrag.beginn)}
                    data-zieht={zug?.id === p.id || undefined}
                    data-ueber={(programm.max_monate !== null && lage.bis > programm.max_monate) || undefined}
                    style={{ ["--von" as string]: lage.von, ["--bis" as string]: lage.bis }}
                    onPointerDown={(e) => runter(e, p)}
                    onPointerMove={bewegen}
                    onPointerUp={() => los(p)}
                    onPointerCancel={() => {
                      setZug(null);
                      setVorschau(null);
                    }}
                    onKeyDown={(e) => taste(e, p)}
                  >
                    {darf && <i data-griff="anfang" />}
                    {darf && <i data-griff="ende" />}
                  </div>
                </div>
                <Betragsfeld
                  betrag={p.betrag}
                  aendern={darf}
                  leer="—"
                  speichern={(betrag) => speichern(`/foerderpakete/${p.id}/`, { betrag })}
                />
              </div>
              {offen && (
                <Paketdetail
                  paket={p}
                  reihe={antrag.pakete}
                  anzahl={anzahl}
                  beginn={antrag.beginn}
                  darf={darf}
                  darfLoeschen={darfLoeschen}
                />
              )}
            </div>
          );
        })}

        {antrag.pakete.length === 0 && !darf && (
          <Leerstelle was="Noch kein Arbeitspaket" satz="Hier stehen die Pakete des Antrags mit Zeitraum und Betrag." />
        )}

        <div className="fd-zeile fd-summenzeile">
          <span />
          <span className="beschriftung-klein">Summe</span>
          <span className="fd-leise zahl">
            {antrag.laufzeit > 0 ? `${antrag.laufzeit} Monate` : ""}
          </span>
          <b className="zahl fd-betrag">{alsEuro(antrag.summe)}</b>
        </div>
      </div>

      {darf && (
        <form
          className="feld-reihe fd-neu"
          onSubmit={(e) => {
            e.preventDefault();
            dazu();
          }}
        >
          <input
            className="feld"
            value={neu}
            placeholder={antrag.pakete.length ? "Neues Arbeitspaket — Enter" : "Erstes Arbeitspaket, z. B. Anforderungserhebung"}
            aria-label="Neues Arbeitspaket"
            onChange={(e) => setNeu(e.target.value)}
          />
          <button type="submit" className="knopf-still" disabled={!neu.trim()}>
            <Zeichen name="plus" />
            Paket
          </button>
        </form>
      )}
    </section>
  );
}

/** Die Monatslinien hinter einem Balken. */
function Raster({ anzahl }: { anzahl: number }) {
  return (
    <span className="fd-raster" aria-hidden="true">
      {Array.from({ length: anzahl }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** Ein aufgeklapptes Paket: Inhalt, Ergebnis, Monate, Reihenfolge. */
function Paketdetail({
  paket,
  reihe,
  anzahl,
  beginn,
  darf,
  darfLoeschen,
}: {
  paket: Foerderpaket;
  /** Alle Pakete des Antrags in ihrer Reihenfolge. */
  reihe: Foerderpaket[];
  anzahl: number;
  beginn: string | null;
  darf: boolean;
  darfLoeschen: boolean;
}) {
  const speichern = useAendern();
  const neuLaden = useNeuLaden();
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const pfad = `/foerderpakete/${paket.id}/`;
  const monate = Array.from({ length: anzahl }, (_, i) => i + 1);

  /**
   * Tauscht den Platz mit dem Nachbarn. Danach wird die ganze Reihe neu
   * durchgezählt — zwei Pakete mit derselben Reihenfolge (aus dem Einspielen
   * oder zweimal schnell angelegt) tauschten sonst nichts.
   */
  async function tauschen(richtung: -1 | 1) {
    const i = reihe.findIndex((p) => p.id === paket.id);
    const neu = [...reihe];
    [neu[i], neu[i + richtung]] = [neu[i + richtung], neu[i]];
    for (const [stelle, p] of neu.entries())
      if (p.reihenfolge !== stelle)
        await hole(`/foerderpakete/${p.id}/`, { method: "PATCH", body: JSON.stringify({ reihenfolge: stelle }) });
    neuLaden();
  }

  return (
    <div className="fd-paketdetail">
      <label className="profilfeld fd-breit">
        <span className="beschriftung-klein">Titel</span>
        <Feldtext wert={paket.titel} aendern={darf} speichern={(titel) => speichern(pfad, { titel })} />
      </label>
      <label className="profilfeld fd-breit">
        <span className="beschriftung-klein">Ziel und Inhalt</span>
        <Feldtext
          wert={paket.ziel}
          aendern={darf}
          mehrzeilig
          zeilen={4}
          platzhalter="Was in diesem Paket passiert."
          speichern={(ziel) => speichern(pfad, { ziel })}
        />
      </label>
      <label className="profilfeld fd-breit">
        <span className="beschriftung-klein">Ergebnis</span>
        <Feldtext
          wert={paket.ergebnis}
          aendern={darf}
          platzhalter="Was am Ende vorliegt."
          speichern={(ergebnis) => speichern(pfad, { ergebnis })}
        />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Von</span>
        <select
          className="feld"
          value={paket.von}
          disabled={!darf}
          onChange={(e) => {
            const von = Number(e.target.value);
            speichern(pfad, { von, bis: Math.max(von, paket.bis) });
          }}
        >
          {monate.map((m) => (
            <option key={m} value={m}>
              {monatsname(m, beginn)}
            </option>
          ))}
        </select>
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Bis</span>
        <select
          className="feld"
          value={paket.bis}
          disabled={!darf}
          onChange={(e) => speichern(pfad, { bis: Number(e.target.value) })}
        >
          {monate
            .filter((m) => m >= paket.von)
            .map((m) => (
              <option key={m} value={m}>
                {monatsname(m, beginn)}
              </option>
            ))}
        </select>
      </label>
      {darf && (
        <div className="feld-reihe fd-breit fd-knopfzeile">
          <button type="button" className="knopf-still" disabled={reihe[0]?.id === paket.id} onClick={() => tauschen(-1)}>
            <Zeichen name="hoch" />
            Nach oben
          </button>
          <button type="button" className="knopf-still" disabled={reihe[reihe.length - 1]?.id === paket.id} onClick={() => tauschen(1)}>
            <Zeichen name="runter" />
            Nach unten
          </button>
          {darfLoeschen && (
            <button type="button" className="knopf-still fd-rechts" onClick={() => setFragtLoeschen(true)}>
              <Zeichen name="korb" />
              Paket entfernen
            </button>
          )}
        </div>
      )}
      {fragtLoeschen && (
        <Loeschdialog
          name={paket.titel}
          was="Das Arbeitspaket"
          milder={
            paket.betrag === null
              ? undefined
              : { text: "Nur den Betrag leeren", tun: async () => {
                  setFragtLoeschen(false);
                  await speichern(pfad, { betrag: null });
                } }
          }
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={async () => {
            await hole(pfad, { method: "DELETE" }).catch(() => undefined);
            setFragtLoeschen(false);
            neuLaden();
          }}
        />
      )}
    </div>
  );
}

/* --- Kleine Felder ---------------------------------------------------------- */

/**
 * Ein Betrag, den man antippt und ändert. Steht formatiert da („12.000 €"),
 * wird beim Antippen zur Zahl, gespeichert beim Verlassen oder mit Enter.
 */
function Betragsfeld({
  betrag,
  aendern,
  leer,
  speichern,
}: {
  betrag: string | null;
  aendern: boolean;
  leer: string;
  speichern: (betrag: string | null) => Promise<unknown>;
}) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(betragZumBearbeiten(betrag));
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => setText(betragZumBearbeiten(betrag)), [betrag]);
  useEffect(() => {
    if (offen) feld.current?.select();
  }, [offen]);

  const anzeige = betrag === null ? <span className="fd-leise">{leer}</span> : alsEuro(betrag);
  if (!aendern) return <span className="zahl fd-betrag">{anzeige}</span>;
  if (!offen)
    return (
      <button type="button" className="zahl fd-betrag inline-aendern" onClick={() => setOffen(true)} title="Betrag ändern">
        {anzeige}
      </button>
    );

  async function fertig() {
    const neu = betragAusEingabe(text);
    if (neu === undefined) {
      melden("fehler", `„${text}“ ist kein Betrag.`);
      return;
    }
    setOffen(false);
    if (neu === betrag) return;
    try {
      await speichern(neu);
    } catch {
      setText(betragZumBearbeiten(betrag));
    }
  }

  return (
    <input
      ref={feld}
      className="feld zahl fd-betragfeld"
      inputMode="decimal"
      value={text}
      aria-label="Betrag in Euro"
      onChange={(e) => setText(e.target.value)}
      onBlur={fertig}
      onKeyDown={(e) => {
        if (e.key === "Enter") fertig();
        if (e.key === "Escape") {
          setText(betragZumBearbeiten(betrag));
          setOffen(false);
        }
      }}
    />
  );
}

/** Eine ganze Zahl mit Einheit — die Höchstlaufzeit eines Programms. */
function Zahlfeld({
  wert,
  einheit,
  aendern,
  speichern,
}: {
  wert: number | null;
  einheit: string;
  aendern: boolean;
  speichern: (wert: number | null) => Promise<unknown>;
}) {
  return (
    <span className="fd-eckwert-mit">
      <Feldtext
        wert={wert === null ? "" : String(wert)}
        aendern={aendern}
        klasse="fd-eckwert"
        platzhalter="—"
        speichern={async (text) => {
          const zahl = text.trim() === "" ? null : Number(text.replace(/\D/g, ""));
          await speichern(zahl || null);
        }}
      />
      {wert !== null && <span className="fd-einheit">{einheit}</span>}
    </span>
  );
}
