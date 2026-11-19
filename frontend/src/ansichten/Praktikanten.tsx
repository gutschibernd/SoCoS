/**
 * Praktikanten · Meine Aufgaben: woran jeder Praktikant ist — sein
 * Hauptstrang, seine Nebenstränge, ihre To-Dos —, und die Uhr darauf.
 *
 * **Ein Strang ist ein Pensum mit `strang`** auf einem ganz gewöhnlichen
 * Arbeitspaket (siehe `basis/straenge.ts`). Gebucht wird damit genau so wie
 * überall, und die Stunden stehen auch auf der Projektseite und im
 * Zeitnachweis. Ein eigener Topf für Praktikumsstunden wäre der zweite, den
 * jede Auswertung kennen müsste.
 *
 * **Wer selbst Stränge hat, landet auf seiner eigenen Seite**; alle anderen —
 * Bernd, Florian — sehen zuerst, wen es gibt, und wählen (Bernd, 2026-11-19).
 * Sehen darf jeder jeden: Die Namen stehen oben als Reiter.
 *
 * `/module/praktikum-aufgaben` ist die Wahl, `/module/praktikum-aufgaben/7`
 * die Seite einer Person — ein Weg, damit „Zurück" und ein Lesezeichen
 * dorthin führen, wo man war.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { hole } from "../basis/api";
import { useLaufend, useNeuLaden, useProjekte, useTeam, type Ich, type Paket, type Projekt } from "../basis/daten";
import { melden } from "../basis/meldungen";
import type { Wechseln } from "../basis/router";
import { paketgruppen } from "../basis/start";
import {
  offenePhasen,
  praktikanten,
  stundenAnteil,
  stundenAusEingabe,
  stundenText,
  stundenZumBearbeiten,
  todoStand,
  straengeVon,
  type Praktikant,
  type Strang,
  type Strangart,
} from "../basis/straenge";
import { clockIn } from "../basis/uhr";
import { Zustand } from "../basis/Zustand";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Paketwahl } from "../bausteine/Paketwahl";
import { Zeichen } from "../bausteine/Zeichen";

const WEG = "praktikum-aufgaben";
const ARTNAME: Record<Strangart, string> = { haupt: "Hauptstrang", neben: "Nebenstrang" };

/** Das Fenster: zu, ein neuer Strang (für wen, wenn schon klar), oder ein bestehender. */
type Fenster = null | { neu: number | null } | Strang;

export function Praktikanten({
  ich,
  person,
  wechseln,
  umschalter,
}: {
  ich: Ich;
  /** Wessen Seite — `null` ist die Wahl. */
  person: number | null;
  wechseln: Wechseln;
  umschalter: ReactNode;
}) {
  const projekte = useProjekte();
  const team = useTeam();
  const [fenster, setFenster] = useState<Fenster>(null);

  const eigene = projekte.data ? straengeVon(projekte.data, ich.id).length > 0 : false;

  // Wer selbst Stränge hat, gehört auf seine Seite — ersetzt, nicht
  // dazugelegt: „Zurück" soll nicht auf die Wahl führen, die gleich wieder
  // hierher springt.
  useEffect(() => {
    if (person === null && eigene) wechseln("module", `${WEG}/${ich.id}`, { ersetzen: true });
  }, [person, eigene, ich.id, wechseln]);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!projekte.data) return <Zustand abfrage={projekte} erneut={() => projekte.refetch()} />;
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  const alle = praktikanten(projekte.data, team.data);
  const zu = (id: number | null) => wechseln("module", id === null ? WEG : `${WEG}/${id}`);
  const neu = (fuer: number | null) =>
    ich.darf.bearbeiten && (
      <button type="button" className="knopf" onClick={() => setFenster({ neu: fuer })}>
        <Zeichen name="plus" />
        Strang
      </button>
    );

  const fensterTeil = fenster !== null && (
    <Strangfenster
      projekte={projekte.data}
      team={team.data.filter((n) => n.is_active)}
      strang={"neu" in fenster ? null : fenster}
      fuer={"neu" in fenster ? fenster.neu : null}
      schliessen={() => setFenster(null)}
      danach={(id) => id !== person && zu(id)}
    />
  );

  /* --- Die Wahl: wen es gibt ---------------------------------------------- */
  if (person === null) {
    // Kurz, bis der Wechsel auf die eigene Seite greift — nichts zeichnen,
    // was gleich wieder verschwindet.
    if (eigene) return null;
    return (
      <div className="spalte">
        {umschalter}
        <div className="vorhabenleiste">
          <div className="vorhaben-kopf">
            <b>Wessen Aufgaben?</b>
            <span>{alle.length === 1 ? "1 Praktikant" : `${alle.length} Praktikanten`}</span>
          </div>
          {alle.length > 0 && <div className="vorhaben-aktionen">{neu(null)}</div>}
        </div>
        {alle.length === 0 ? (
          <div className="karte">
            <Leerstelle
              was="Noch niemand hat einen Strang"
              satz="Ein Strang ist ein Arbeitspaket mit einem Ziel, den To-Dos darunter und den Stunden dafür. Wer einen hat, steht hier."
            />
            {neu(null) && <div className="strang-leer-knopf">{neu(null)}</div>}
          </div>
        ) : (
          <div className="praktikanten-wahl">
            {alle.map((p) => (
              <Praktikantenkarte key={p.id} praktikant={p} oeffnen={() => zu(p.id)} />
            ))}
          </div>
        )}
        {fensterTeil}
      </div>
    );
  }

  /* --- Die Seite einer Person --------------------------------------------- */
  const wer = alle.find((p) => p.id === person);
  const name = wer?.name ?? team.data.find((n) => n.id === person)?.name;
  const selbst = person === ich.id;
  const straenge = wer?.straenge ?? [];
  const neben = straenge.filter((s) => s.art === "neben").length;
  const haupt = straenge.length - neben;

  return (
    <div className="spalte">
      {umschalter}
      {(alle.length > 1 || !eigene) && (
        <div className="spannenwahl personenwahl" role="group" aria-label="Wessen Aufgaben">
          {/* „Alle" nur für die, die selbst keinen Strang haben: Für einen
              Praktikanten führte die Wahl gleich wieder hierher. */}
          {!eigene && (
            <button type="button" aria-pressed={false} onClick={() => zu(null)}>
              Alle
            </button>
          )}
          {alle.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === person} onClick={() => zu(p.id)}>
              {p.id === ich.id ? "Ich" : p.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{selbst ? "Meine Aufgaben" : name ? `Aufgaben von ${name}` : "Unbekannt"}</b>
          <span>
            {haupt === 0 ? "kein Hauptstrang" : haupt === 1 ? "1 Hauptstrang" : `${haupt} Hauptstränge`}
            {" · "}
            {neben === 1 ? "1 Nebenstrang" : `${neben} Nebenstränge`}
          </span>
        </div>
        {straenge.length > 0 && name && <div className="vorhaben-aktionen">{neu(person)}</div>}
      </div>

      {!name ? (
        <div className="karte">
          <Leerstelle
            was="Dieses Konto gibt es nicht"
            satz="Vielleicht ist es stillgelegt. Die Wahl zeigt alle, die einen Strang haben."
            aktion={{ text: "Zur Wahl", tun: () => zu(null) }}
          />
        </div>
      ) : straenge.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was={selbst ? "Dir ist noch kein Strang zugeteilt" : `${name} hat noch keinen Strang`}
            satz="Ein Strang ist ein Arbeitspaket mit einem Ziel, den To-Dos darunter und den Stunden dafür."
          />
          {neu(person) && <div className="strang-leer-knopf">{neu(person)}</div>}
        </div>
      ) : (
        <>
          <section className="karte">
            <h2 className="beschriftung-klein">Überblick</h2>
            <Strangbild straenge={straenge} />
          </section>
          {straenge.map((s) => (
            <Strangkarte
              key={s.pensum.id}
              strang={s}
              person={person}
              selbst={selbst}
              darf={ich.darf.bearbeiten}
              bearbeiten={() => setFenster(s)}
            />
          ))}
        </>
      )}
      {fensterTeil}
    </div>
  );
}

/* --- Die Karte eines Praktikanten auf der Wahl ----------------------------- */

function Praktikantenkarte({ praktikant, oeffnen }: { praktikant: Praktikant; oeffnen: () => void }) {
  const haupt = praktikant.straenge.find((s) => s.art === "haupt");
  const offen = praktikant.straenge.reduce((n, s) => n + todoStand(s).gesamt - todoStand(s).erledigt, 0);
  return (
    <a
      className="karte praktikant-karte"
      href={`/module/${WEG}/${praktikant.id}`}
      onClick={(e) => {
        e.preventDefault();
        oeffnen();
      }}
    >
      <span className="praktikant-kopf">
        {/* Die Farbe ist die des Kontos, wie in der Leiste — ein Datum, kein Ton der Palette. */}
        <i className="praktikant-kuerzel" style={{ background: praktikant.farbe }}>
          {praktikant.initialen}
        </i>
        <span>
          <b>{praktikant.name}</b>
          <em>{haupt ? haupt.paket.titel : "noch kein Hauptstrang"}</em>
        </span>
        <span className="modul-stand">{offen === 1 ? "1 To-Do offen" : `${offen} To-Dos offen`}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </span>
      <Strangbild straenge={praktikant.straenge} knapp />
    </a>
  );
}

/* --- Das Bild: Haupt- und Nebenstränge als Linien -------------------------- */

/**
 * Jeder Strang eine Linie, jedes To-Do ein Halt darauf, am Ende das Ziel.
 * Der Hauptstrang ist breit und oben; die Nebenstränge zweigen von ihm ab.
 * Gefüllt ist, was erledigt ist — die Linie zeigt damit auf einen Blick, wo
 * jemand steht, ohne dass man die Liste darunter lesen muss.
 *
 * Selbst gezeichnet aus Kästchen und Kanten, kein Diagrammpaket (CLAUDE.md).
 * Die Halte sind keine Knöpfe: Abgehakt wird in der Liste darunter, wo der
 * Titel steht und der Finger trifft.
 */
export function Strangbild({ straenge, knapp = false }: { straenge: Strang[]; knapp?: boolean }) {
  return (
    <div className="strangbild" data-knapp={knapp ? "ja" : undefined}>
      {straenge.map((s, i) => {
        const stand = todoStand(s);
        const zweig = s.art === "neben" && straenge[0]?.art === "haupt";
        return (
          <div key={s.pensum.id} className="strangbild-zeile" data-art={s.art} data-zweig={zweig && i > 0 ? "ja" : undefined}>
            {!knapp && (
              <div className="strangbild-name">
                <b>{s.paket.titel}</b>
                <em>
                  {ARTNAME[s.art]} · {stand.gesamt === 0 ? "noch keine To-Dos" : `${stand.erledigt} von ${stand.gesamt} erledigt`}
                </em>
              </div>
            )}
            <div
              className="strangbild-bahn"
              role="img"
              aria-label={`${ARTNAME[s.art]} ${s.paket.titel}: ${stand.erledigt} von ${stand.gesamt} To-Dos erledigt`}
            >
              <i className="strangbild-halt strangbild-anfang" data-erledigt="ja" />
              {s.todos.map((t) => (
                <Halt key={t.id} titel={t.titel} erledigt={t.erledigt} />
              ))}
              <span className="strangbild-strecke" data-erledigt={stand.gesamt > 0 && stand.erledigt === stand.gesamt ? "ja" : undefined} />
              <Zeichen name="fahne" klasse="strangbild-ziel" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Halt({ titel, erledigt }: { titel: string; erledigt: boolean }) {
  const ja = erledigt ? "ja" : undefined;
  return (
    <>
      <span className="strangbild-strecke" data-erledigt={ja} />
      <i className="strangbild-halt" data-erledigt={ja} title={titel} />
    </>
  );
}

/* --- Ein Strang mit Ziel, Stunden und To-Dos ------------------------------- */

function Strangkarte({
  strang,
  person,
  selbst,
  darf,
  bearbeiten,
}: {
  strang: Strang;
  person: number;
  /** Die eigene Seite — nur dort läuft die Uhr, denn sie läuft für den, der angemeldet ist. */
  selbst: boolean;
  darf: boolean;
  bearbeiten: () => void;
}) {
  const stand = todoStand(strang);
  const anteil = stundenAnteil(strang);
  const ueber = strang.pensum.gebuchte_sekunden / 3600 > Number(strang.pensum.stunden) && anteil !== null;
  return (
    <section className="karte strang" data-art={strang.art}>
      <div className="strang-kopf">
        <span className="strang-art">{ARTNAME[strang.art]}</span>
        <h2>{strang.paket.titel}</h2>
        <span className="strang-wo">
          {strang.projekt.titel} · {strang.phase.titel}
        </span>
        <div className="strang-knoepfe">
          {selbst && darf && <Strangstart paket={strang.paket} />}
          {darf && (
            <button type="button" className="knopf-still" onClick={bearbeiten}>
              <Zeichen name="stift" />
              Bearbeiten
            </button>
          )}
        </div>
      </div>

      <h3 className="beschriftung-klein">Ziel</h3>
      {strang.paket.beschreibung.trim() ? (
        <p className="strang-ziel">{strang.paket.beschreibung}</p>
      ) : (
        <p className="thema-leer">Noch keines{darf ? " — unter „Bearbeiten“ eintragen." : "."}</p>
      )}

      <div className="strang-zahlen">
        <span>
          <b className="zahl">{stand.gesamt === 0 ? "—" : `${stand.erledigt}/${stand.gesamt}`}</b> To-Dos erledigt
        </span>
        <span className="strang-stunden">
          <b className="zahl">{stundenText(strang)}</b> gebucht
          {anteil !== null && (
            <span className="balken" data-ueber={ueber ? "ja" : undefined} aria-hidden="true">
              <i style={{ width: `${Math.round(anteil * 100)}%` }} />
            </span>
          )}
        </span>
      </div>
      {!strang.paket.buchbar && <p className="strang-gesperrt">{strang.paket.grund_gegen_buchung}</p>}

      <Todoliste strang={strang} person={person} darf={darf} />
    </section>
  );
}

/**
 * Die Uhr auf diesem Paket starten — oder zeigen, dass sie hier schon läuft.
 * Läuft sie woanders, wird gewechselt: Der Server beendet die alte Buchung.
 * Exportiert, weil die Übersicht dieselbe Zeile hat.
 */
export function Strangstart({ paket }: { paket: Paket }) {
  const laufend = useLaufend();
  const neuLaden = useNeuLaden();
  const [schickt, setSchickt] = useState(false);
  const buchung = laufend.data?.laufend ?? null;

  if (!paket.buchbar) return null;
  if (buchung?.paket === paket.id)
    return (
      <span className="strang-laeuft">
        <i className="punkt" />
        läuft
      </span>
    );
  return (
    <button
      type="button"
      className="knopf"
      disabled={schickt}
      onClick={async () => {
        setSchickt(true);
        try {
          await clockIn(paket.id);
          neuLaden();
          melden("gut", `Die Uhr läuft auf „${paket.titel}“.`);
        } catch {
          // `hole` hat den Grund schon gemeldet.
        } finally {
          setSchickt(false);
        }
      }}
    >
      <Zeichen name="start" />
      {buchung ? "Wechseln" : "Start"}
    </button>
  );
}

/**
 * Die To-Dos des Strangs: die Unteraufgaben des Pakets, die dieser Person
 * gehören oder niemandem. Abhaken und dazuschreiben an Ort und Stelle — ein
 * Fenster für eine Zeile Text wäre ein Klick zu viel. Umbenennen, planen und
 * entfernen geht auf der Projektseite, wo die Unteraufgaben zu Hause sind.
 */
function Todoliste({ strang, person, darf }: { strang: Strang; person: number; darf: boolean }) {
  const neuLaden = useNeuLaden();
  const [text, setText] = useState("");
  const [legtAn, setLegtAn] = useState(false);
  // Der Haken steht sofort, nicht erst, wenn die Projekte neu geladen sind —
  // das dauert, und ein Kästchen, das nach dem Klick zurückspringt, wird
  // ein zweites Mal geklickt. Was der Server bestätigt hat, fällt wieder heraus.
  const [gesetzt, setGesetzt] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setGesetzt((alt) => {
      const offen = Object.entries(alt).filter(([id, wert]) => strang.todos.find((t) => t.id === Number(id))?.erledigt !== wert);
      return offen.length === Object.keys(alt).length ? alt : Object.fromEntries(offen);
    });
  }, [strang.todos]);

  async function abhaken(id: number, erledigt: boolean) {
    setGesetzt((alt) => ({ ...alt, [id]: erledigt }));
    try {
      await hole(`/unteraufgaben/${id}/`, { method: "PATCH", body: JSON.stringify({ erledigt }) });
      neuLaden();
    } catch {
      // `hole` hat den Grund schon gemeldet; der Haken geht zurück.
      setGesetzt((alt) => {
        const { [id]: _, ...rest } = alt;
        return rest;
      });
    }
  }

  async function dazu(e: FormEvent) {
    e.preventDefault();
    const titel = text.trim();
    if (!titel || legtAn) return;
    setLegtAn(true);
    const hinten = Math.max(0, ...strang.paket.unteraufgaben.map((u) => u.reihenfolge)) + 1;
    try {
      await hole("/unteraufgaben/", {
        method: "POST",
        body: JSON.stringify({ paket: strang.paket.id, titel, verantwortlich: person, reihenfolge: hinten }),
      });
      setText("");
      neuLaden();
    } catch {
      // Der Text bleibt stehen — sonst wäre er mit der Fehlermeldung weg.
    } finally {
      setLegtAn(false);
    }
  }

  return (
    <>
      <h3 className="beschriftung-klein">To-Dos</h3>
      {strang.todos.length === 0 && !darf && <p className="thema-leer">Noch keine.</p>}
      {strang.todos.length > 0 && (
        <ul className="strang-todos">
          {strang.todos.map((t) => {
            const erledigt = gesetzt[t.id] ?? t.erledigt;
            return (
              <li key={t.id} data-erledigt={erledigt ? "ja" : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={erledigt}
                    disabled={!darf}
                    onChange={(e) => abhaken(t.id, e.target.checked)}
                  />
                  <span>{t.titel}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {darf && (
        <form className="strang-dazu" onSubmit={dazu}>
          <input
            className="feld"
            value={text}
            maxLength={250}
            placeholder="Neues To-Do"
            aria-label={`Neues To-Do für ${strang.paket.titel}`}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="knopf-still" disabled={!text.trim() || legtAn}>
            <Zeichen name="plus" />
            Dazu
          </button>
        </form>
      )}
    </>
  );
}

/* --- Anlegen und bearbeiten ------------------------------------------------ */

type Entwurf = {
  person: number;
  art: Strangart;
  quelle: "neu" | "bestehend";
  phase: number;
  paket: number;
  titel: string;
  ziel: string;
  stunden: string;
};

/**
 * Ein Strang entsteht aus einem Arbeitspaket — einem neuen oder einem, das
 * es schon gibt — und einem Pensum für die Person darauf.
 *
 * **Das neue Paket entsteht in einer Phase, die man wählt**, nicht in einem
 * eigenen Projekt „Praktikum", das hier still angelegt würde. Arbeitet ein
 * Praktikant an einem echten Paket mit, gehört seine Zeit dorthin — samt
 * Förderabrechnung. Wer ein eigenes Projekt für die Praktika will, legt es
 * auf der Projektseite an.
 *
 * Beim Bearbeiten ändern Titel und Ziel das Paket selbst: Es ist dasselbe,
 * das auf der Projektseite steht.
 */
function Strangfenster({
  projekte,
  team,
  strang,
  fuer,
  schliessen,
  danach,
}: {
  projekte: Projekt[];
  team: { id: number; name: string }[];
  strang: Strang | null;
  /** Für wen ein neuer Strang ist, wenn das schon feststeht. */
  fuer: number | null;
  schliessen: () => void;
  /** Nach dem Anlegen: auf die Seite dieser Person. */
  danach: (person: number) => void;
}) {
  const neuLaden = useNeuLaden();
  const phasen = offenePhasen(projekte);
  const hatHaupt = (p: number) => straengeVon(projekte, p).some((s) => s.art === "haupt");
  const [entwurf, setEntwurf] = useState<Entwurf>(() => ({
    person: strang?.pensum.person ?? fuer ?? 0,
    art: strang?.art ?? (fuer !== null && hatHaupt(fuer) ? "neben" : "haupt"),
    quelle: "neu",
    phase: 0,
    paket: 0,
    titel: strang?.paket.titel ?? "",
    ziel: strang?.paket.beschreibung ?? "",
    stunden: strang ? stundenZumBearbeiten(strang.pensum.stunden) : "",
  }));
  const [laeuft, setLaeuft] = useState(false);
  const setze = (teil: Partial<Entwurf>) => setEntwurf((alt) => ({ ...alt, ...teil }));

  const stunden = stundenAusEingabe(entwurf.stunden);
  const paketDa = strang ? true : entwurf.quelle === "neu" ? entwurf.phase > 0 && entwurf.titel.trim() !== "" : entwurf.paket > 0;
  const bereit = entwurf.person > 0 && paketDa && stunden !== null && (!strang || entwurf.titel.trim() !== "");

  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => e.key === "Escape" && !laeuft && schliessen();
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });

  async function speichern() {
    if (!bereit || laeuft) return;
    setLaeuft(true);
    try {
      if (strang) {
        const paketGeaendert =
          entwurf.titel.trim() !== strang.paket.titel || entwurf.ziel.trim() !== strang.paket.beschreibung;
        if (paketGeaendert)
          await hole(`/pakete/${strang.paket.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ titel: entwurf.titel.trim(), beschreibung: entwurf.ziel.trim() }),
          });
        await hole(`/pensen/${strang.pensum.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ strang: entwurf.art, stunden }),
        });
      } else {
        const paketId =
          entwurf.quelle === "neu"
            ? (
                await hole<Paket>("/pakete/", {
                  method: "POST",
                  body: JSON.stringify({ phase: entwurf.phase, titel: entwurf.titel.trim(), beschreibung: entwurf.ziel.trim() }),
                })
              ).id
            : entwurf.paket;
        // Hat die Person auf dem Paket schon ein Pensum, wird es zum Strang —
        // ein zweites daneben lässt die Datenbank nicht zu, und es wäre
        // dieselbe Arbeit zweimal.
        const vorhanden = projekte
          .flatMap((p) => p.phasen.flatMap((ph) => ph.pakete))
          .find((p) => p.id === paketId)
          ?.pensen.find((p) => p.person === entwurf.person);
        await hole(vorhanden ? `/pensen/${vorhanden.id}/` : "/pensen/", {
          method: vorhanden ? "PATCH" : "POST",
          body: JSON.stringify({ paket: paketId, person: entwurf.person, stunden, strang: entwurf.art }),
        });
      }
      neuLaden();
      melden("gut", strang ? `„${entwurf.titel.trim()}“ ist gespeichert.` : "Der Strang ist angelegt.");
      if (!strang) danach(entwurf.person);
      schliessen();
    } catch {
      // Das Fenster bleibt offen — sonst wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  /** Der mildere Weg statt Löschen: Das Paket und seine Stunden bleiben, nur der Strang ist weg. */
  async function loesen() {
    if (!strang) return;
    setLaeuft(true);
    try {
      await hole(`/pensen/${strang.pensum.id}/`, { method: "PATCH", body: JSON.stringify({ strang: "" }) });
      neuLaden();
      melden("gut", `„${strang.paket.titel}“ ist kein Strang mehr. Paket und Stunden bleiben.`);
      schliessen();
    } catch {
      setLaeuft(false);
    }
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-label="Strang" onClick={() => !laeuft && schliessen()}>
      <form
        className="dialog dialog-arbeit"
        noValidate
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="dialog-kopf">
          <div className="dialog-kopf-text">
            <h2>{strang ? strang.paket.titel : "Neuer Strang"}</h2>
          </div>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf-still" onClick={schliessen} disabled={laeuft}>
              Abbrechen
            </button>
            <button type="submit" className="knopf" disabled={laeuft || !bereit}>
              Speichern
            </button>
          </div>
        </div>

        <div className="dialog-koerper thema-felder">
          {!strang && (
            <label className="profilfeld">
              <span className="beschriftung-klein">Für wen</span>
              <select
                className="feld"
                value={entwurf.person}
                onChange={(e) => {
                  const p = Number(e.target.value);
                  setze({ person: p, art: p && hatHaupt(p) ? "neben" : "haupt" });
                }}
              >
                <option value={0}>Wählen …</option>
                {team.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="profilfeld">
            <span className="beschriftung-klein" id="strang-art">
              Art
            </span>
            <div className="spannenwahl strang-wahl" role="radiogroup" aria-labelledby="strang-art">
              {(["haupt", "neben"] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={entwurf.art === a} aria-pressed={entwurf.art === a} onClick={() => setze({ art: a })}>
                  {ARTNAME[a]}
                </button>
              ))}
            </div>
          </div>

          {!strang && (
            <div className="profilfeld">
              <span className="beschriftung-klein" id="strang-quelle">
                Arbeitspaket
              </span>
              <div className="spannenwahl strang-wahl" role="radiogroup" aria-labelledby="strang-quelle">
                <button type="button" role="radio" aria-checked={entwurf.quelle === "neu"} aria-pressed={entwurf.quelle === "neu"} onClick={() => setze({ quelle: "neu" })}>
                  Neues anlegen
                </button>
                <button type="button" role="radio" aria-checked={entwurf.quelle === "bestehend"} aria-pressed={entwurf.quelle === "bestehend"} onClick={() => setze({ quelle: "bestehend" })}>
                  Bestehendes wählen
                </button>
              </div>
            </div>
          )}

          {!strang && entwurf.quelle === "bestehend" && (
            <Paketwahl gruppen={paketgruppen(projekte)} wert={entwurf.paket} setzen={(paket) => setze({ paket })} />
          )}

          {!strang && entwurf.quelle === "neu" && (
            <label className="profilfeld">
              <span className="beschriftung-klein">In welcher Phase</span>
              <select className="feld" value={entwurf.phase} onChange={(e) => setze({ phase: Number(e.target.value) })}>
                <option value={0}>Wählen …</option>
                {phasen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titel}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(strang || entwurf.quelle === "neu") && (
            <>
              <label className="profilfeld">
                <span className="beschriftung-klein">Titel</span>
                <input
                  className="feld"
                  value={entwurf.titel}
                  maxLength={250}
                  placeholder="z. B. Usability-Tests am Spender"
                  onChange={(e) => setze({ titel: e.target.value })}
                />
              </label>
              <label className="profilfeld">
                <span className="beschriftung-klein">Ziel</span>
                <textarea
                  className="feld"
                  rows={3}
                  value={entwurf.ziel}
                  placeholder="Was am Ende dasteht — ein, zwei Sätze"
                  onChange={(e) => setze({ ziel: e.target.value })}
                />
              </label>
            </>
          )}

          <label className="profilfeld">
            <span className="beschriftung-klein">Stunden dafür</span>
            <input
              className="feld strang-stunden-feld"
              inputMode="decimal"
              value={entwurf.stunden}
              placeholder="z. B. 300"
              aria-invalid={stunden === null}
              onChange={(e) => setze({ stunden: e.target.value })}
            />
            {stunden === null && <span className="strang-feldfehler">Eine Zahl, z. B. 300 oder 12,5.</span>}
          </label>

          {strang && (
            <div className="persona-fuss">
              <button type="button" className="knopf-still" onClick={loesen} disabled={laeuft}>
                <Zeichen name="kreuz" />
                Kein Strang mehr
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
