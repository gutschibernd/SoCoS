/**
 * Module · Projektplanung: eine Projektphase mit ihren Paketen und Aufgaben —
 * und, wenn die Phase aus einem Förderantrag bezahlt wird, der Antrag als
 * Maßstab daneben.
 *
 * `/module/planung` listet die Phasen, `/module/planung/28` plant eine. Von der
 * Projektseite führt ein Klick auf eine Phase hierher.
 *
 * **Drei Ansichten statt einer langen Seite** (Bernd, 2026-10-15: „sehr
 * unübersichtlich … in der realen Welt ist vieles agil und nicht so wie im
 * Angebot"). Vorher standen die Pakete zweimal da — im Gantt und darunter als
 * Karten mit den Antragstexten —, und bearbeiten ließ sich eine Aufgabe nur in
 * der Karte, weit unter dem Gantt. Jetzt: „Aufgaben" ist die Arbeitsliste,
 * jede Zeile an Ort und Stelle änderbar; „Zeitplan" ist der Gantt;
 * „Stunden & Antrag" ist, was man nachschlägt. Pakete legt man hier an und
 * benennt sie um, Aufgaben schiebt man in ein anderes Paket — der Plan
 * ändert sich, und das Werkzeug soll das nicht schwerer machen als nötig.
 *
 * **Eigene Optik wie die Runway-Planung** (Bernd: vom Werkbank-Stil weg, wo
 * er hier im Weg steht). Alles unter `.pl`, die Farben sind die `--rw-*`
 * aus farben.css — zwei eigenständige Werkzeuge, eine Farbwelt.
 *
 * **Die Aufgaben dürfen vom Antrag abweichen, die Stunden nicht** (Bernd,
 * 2026-10-13): Gebucht wird aufs Arbeitspaket, und das Arbeitspaket zeigt auf
 * das Paket des Antrags, in das seine Stunden bei der Abrechnung gehören. Die
 * Stunden an einer Aufgabe sind ein Plan, gegen den nichts gebucht wird.
 *
 * Gerechnet wird am Server (`socos/services/planung.py`); hier wird gezeichnet.
 */

import { useState } from "react";

import { ApiFehler, hole, lesbarerGrund } from "../basis/api";
import {
  useFoerderungen,
  useNeuLaden,
  usePlanung,
  useProjekte,
  useTeam,
  type Ich,
  type Planung,
  type Planungsaufgabe,
  type Planungspaket,
} from "../basis/daten";
import { antragsstandText } from "../basis/foerderungen";
import { monatsText, plusTage, zeitraumText } from "../basis/gantt";
import {
  aufgabenImPlan,
  alsH,
  gefiltert,
  lageText,
  OHNE_FILTER,
  passt,
  personenMitAufgaben,
  standGegenPlan,
  stundenAusEingabe,
  type Filter,
  type Zeige,
} from "../basis/planung";
import { alsPfad, type Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Feldtext } from "../bausteine/Feldtext";
import { Gantt, GanttBalken, GanttZeile } from "../bausteine/Gantt";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

/** Wie lang eine Aufgabe wird, der man per Klick in die leere Zeile einen Zeitraum gibt: eine Woche. */
const NEUE_AUFGABE_TAGE = 7;

/** Speichern, danach alles neu holen — Soll, Lage und Summen rechnet der Server. */
function useSpeichern() {
  const neuLaden = useNeuLaden();
  return async (pfad: string, daten: Record<string, unknown> | null, methode: "PATCH" | "POST" | "DELETE" = "PATCH") => {
    await hole(pfad, { method: methode, body: daten === null ? undefined : JSON.stringify(daten) });
    neuLaden();
  };
}

const fehlertext = (e: unknown) => (e instanceof ApiFehler ? lesbarerGrund(e) : "Das hat nicht geklappt.");

/* --- Die Liste der Phasen --------------------------------------------------- */

/**
 * Die Phasen aller Projekte, die etwas zu planen haben — Pakete oder einen
 * Antrag. Die leeren stehen auf der Projektseite; hier wären sie nur Zeilen,
 * hinter denen nichts ist.
 */
export function Planungsliste({ wechseln }: { wechseln: Wechseln }) {
  const abfrage = useProjekte();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const projekte = abfrage.data
    .filter((p) => !p.ist_auffang)
    .map((p) => ({ ...p, phasen: p.phasen.filter((ph) => ph.pakete.length > 0 || ph.foerderantrag !== null) }))
    .filter((p) => p.phasen.length > 0);

  if (projekte.length === 0)
    return (
      <div className="karte">
        <Leerstelle
          was="Noch keine Phase mit Arbeitspaketen"
          satz="Geplant wird eine Projektphase mit ihren Paketen. Angelegt werden sie auf der Projektseite."
          aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt") }}
        />
      </div>
    );

  return (
    <div className="spalte">
      {projekte.map((projekt) => (
        <section key={projekt.id} className="karte pl-liste">
          <h2>{projekt.titel}</h2>
          <ul>
            {projekt.phasen.map((phase) => {
              const aufgaben = phase.pakete.reduce((n, p) => n + p.unteraufgaben.length, 0);
              const weg = `planung/${phase.id}`;
              return (
                <li key={phase.id}>
                  <a
                    href={alsPfad("module", weg)}
                    onClick={(e) => {
                      e.preventDefault();
                      wechseln("module", weg);
                    }}
                  >
                    <span className="pl-listentitel">
                      <b>{phase.titel}</b>
                      <em>{monatsText(phase.von, phase.bis)}</em>
                    </span>
                    {phase.foerderantrag !== null && <span className="art">Förderung</span>}
                    <span className="modul-stand">
                      {phase.pakete.length} {phase.pakete.length === 1 ? "Paket" : "Pakete"} · {aufgaben}{" "}
                      {aufgaben === 1 ? "Aufgabe" : "Aufgaben"}
                    </span>
                    <Zeichen name="zeiger" klasse="modul-zeiger" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* --- Die Planung einer Phase ------------------------------------------------ */

export function Planungsseite({ ich, id, wechseln }: { ich: Ich; id: number; wechseln: Wechseln }) {
  const abfrage = usePlanung(id);
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  return <Planungsinhalt key={id} planung={abfrage.data} ich={ich} wechseln={wechseln} />;
}

type Ansicht = "aufgaben" | "zeitplan" | "antrag";

const ANSICHTEN: { wert: Ansicht; text: string }[] = [
  { wert: "aufgaben", text: "Aufgaben" },
  { wert: "zeitplan", text: "Zeitplan" },
  { wert: "antrag", text: "Stunden & Antrag" },
];

/** Ansicht und Filter bleiben im Browser stehen — wer morgens „Jetzt dran" will, will es morgen wieder. */
const MERKEN = "socos-planung";
function gemerkt(): { ansicht: Ansicht; filter: Filter } {
  try {
    return { ansicht: "aufgaben", filter: OHNE_FILTER, ...JSON.parse(localStorage.getItem(MERKEN) || "{}") };
  } catch {
    return { ansicht: "aufgaben", filter: OHNE_FILTER };
  }
}

function Planungsinhalt({ planung, ich, wechseln }: { planung: Planung; ich: Ich; wechseln: Wechseln }) {
  const [stand, setStand] = useState(gemerkt);
  const merken = (teil: Partial<typeof stand>) => {
    const neu = { ...stand, ...teil };
    setStand(neu);
    try {
      localStorage.setItem(MERKEN, JSON.stringify(neu));
    } catch {
      /* ohne Speicher im Browser geht es auch */
    }
  };
  // Eine gemerkte Person, die in dieser Phase keine Aufgabe hat, filterte
  // alles weg — ohne dass man sähe, warum.
  const personen = personenMitAufgaben(planung.pakete);
  const filter =
    stand.filter.person !== null && !personen.some((p) => p.id === stand.filter.person)
      ? { ...stand.filter, person: null }
      : stand.filter;

  // Zugeklappt, nicht aufgeklappt: Neue Pakete sollen offen dastehen. Ein
  // Zustand für Liste und Zeitplan — sonst sucht man im einen das Paket,
  // das man im anderen gerade aufgemacht hat.
  const [zu, setZu] = useState<Set<number>>(new Set());
  const umschalten = (paket: number) =>
    setZu((alt) => {
      const neu = new Set(alt);
      if (neu.has(paket)) neu.delete(paket);
      else neu.add(paket);
      return neu;
    });

  return (
    <div className="pl">
      <Kopf planung={planung} ansicht={stand.ansicht} waehlen={(ansicht) => merken({ ansicht })} wechseln={wechseln} />
      <Kennzahlen planung={planung} jetztDran={() => merken({ ansicht: "aufgaben", filter: { ...filter, zeige: "jetzt" } })} />
      {stand.ansicht === "antrag" ? (
        <Antragsansicht planung={planung} ich={ich} wechseln={wechseln} />
      ) : planung.pakete.length === 0 && !ich.darf.bearbeiten ? (
        <section className="pl-tafel">
          <Leerstelle
            was="Diese Phase hat noch keine Arbeitspakete"
            satz="Pakete legt ein Bearbeiter oder Admin hier oder auf der Projektseite an."
          />
        </section>
      ) : (
        <section className="pl-tafel">
          <Filterleiste
            filter={filter}
            personen={personen}
            setzen={(f) => merken({ filter: f })}
            alleZu={planung.pakete.length > 0 && planung.pakete.every((p) => zu.has(p.id))}
            alleUmschalten={(schliessen) => setZu(new Set(schliessen ? planung.pakete.map((p) => p.id) : []))}
          />
          {stand.ansicht === "aufgaben" ? (
            <Aufgabenliste planung={planung} ich={ich} filter={filter} zu={zu} umschalten={umschalten} filterWeg={() => merken({ filter: OHNE_FILTER })} />
          ) : (
            <Zeitplan planung={planung} darf={ich.darf.bearbeiten} filter={filter} zu={zu} umschalten={umschalten} />
          )}
        </section>
      )}
    </div>
  );
}

/* --- Kopf und Kennzahlen ------------------------------------------------------ */

function Kopf({
  planung,
  ansicht,
  waehlen,
  wechseln,
}: {
  planung: Planung;
  ansicht: Ansicht;
  waehlen: (a: Ansicht) => void;
  wechseln: Wechseln;
}) {
  const { phase, antrag } = planung;
  return (
    <header className="pl-kopf">
      <div className="pl-marke">
        <a
          className="pl-eyebrow"
          href={alsPfad("projekt", null)}
          onClick={(e) => {
            e.preventDefault();
            wechseln("projekt");
          }}
        >
          {phase.projekt_titel}
        </a>
        <h1 className="pl-titel">{phase.titel}</h1>
        <span className="pl-sub">
          {zeitraumText(phase.von, phase.bis)}
          {antrag ? ` · bezahlt aus „${antrag.titel}“` : ""}
        </span>
      </div>
      <div className="pl-seg" role="group" aria-label="Ansicht">
        {ANSICHTEN.map((a) => (
          <button key={a.wert} type="button" aria-pressed={ansicht === a.wert} onClick={() => waehlen(a.wert)}>
            {a.text}
          </button>
        ))}
      </div>
    </header>
  );
}

function Kennzahlen({ planung, jetztDran }: { planung: Planung; jetztDran: () => void }) {
  const { summen, antrag } = planung;
  const alle = planung.pakete.flatMap((p) => p.aufgaben);
  const ueberfaellig = alle.filter((a) => a.lage === "ueberfaellig").length;
  const laeuft = alle.filter((a) => a.lage === "laeuft").length;
  const anteil = Number(summen.soll) > 0 ? Math.round((100 * Number(summen.gebucht)) / Number(summen.soll)) : null;
  const stand = standGegenPlan(summen.gebucht, summen.soll_bis_heute);

  return (
    <div className="pl-kennzahlen">
      <div className="pl-kennzahl">
        <span className="pl-eyebrow">Gebucht</span>
        <span className="pl-wert">{alsH(summen.gebucht, 0)}</span>
        <span className="pl-sub">
          von {alsH(summen.soll, 0)} {antrag ? "laut Antrag" : "Pensum"}
          {anteil !== null && ` · ${anteil} %`}
        </span>
      </div>
      <div className="pl-kennzahl">
        <span className="pl-eyebrow">Soll bis heute</span>
        <span className="pl-wert">{alsH(summen.soll_bis_heute, 0)}</span>
        <span className="pl-sub">{stand ?? "braucht Monate aus dem Antrag"}</span>
      </div>
      <div className="pl-kennzahl">
        <span className="pl-eyebrow">Aufgaben erledigt</span>
        <span className="pl-wert">
          {summen.erledigt} / {summen.aufgaben}
        </span>
        <span className="pl-sub">
          {alsH(summen.aufgaben_stunden, 0)} geplant
          {summen.ohne_termin > 0 && ` · ${summen.ohne_termin} ohne Termin`}
        </span>
      </div>
      <button type="button" className="pl-kennzahl" data-ton={ueberfaellig > 0 ? "schlecht" : undefined} onClick={jetztDran}>
        <span className="pl-eyebrow">Jetzt dran</span>
        <span className="pl-wert">{ueberfaellig + laeuft}</span>
        <span className="pl-sub">{ueberfaellig > 0 ? `davon ${ueberfaellig} überfällig` : "nichts überfällig"}</span>
      </button>
    </div>
  );
}

/* --- Filter --------------------------------------------------------------------- */

const ZEIGE: { wert: Zeige; text: string }[] = [
  { wert: "alle", text: "Alle" },
  { wert: "offen", text: "Offen" },
  { wert: "jetzt", text: "Jetzt dran" },
];

function Filterleiste({
  filter,
  personen,
  setzen,
  alleZu,
  alleUmschalten,
}: {
  filter: Filter;
  personen: { id: number; name: string }[];
  setzen: (f: Filter) => void;
  alleZu: boolean;
  alleUmschalten: (schliessen: boolean) => void;
}) {
  return (
    <div className="pl-leiste">
      <div className="pl-seg pl-seg-klein" role="group" aria-label="Welche Aufgaben">
        {ZEIGE.map((z) => (
          <button key={z.wert} type="button" aria-pressed={filter.zeige === z.wert} onClick={() => setzen({ ...filter, zeige: z.wert })}>
            {z.text}
          </button>
        ))}
      </div>
      {personen.length > 0 && (
        <select
          className="pl-wahl"
          value={filter.person ?? ""}
          aria-label="Wessen Aufgaben"
          onChange={(e) => setzen({ ...filter, person: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">Alle Personen</option>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="pl-knopf-leise" onClick={() => alleUmschalten(!alleZu)}>
        {alleZu ? "Alle aufklappen" : "Alle zuklappen"}
      </button>
    </div>
  );
}

/* --- Aufgaben: die Liste, nach Paketen ---------------------------------------- */

function Aufgabenliste({
  planung,
  ich,
  filter,
  zu,
  umschalten,
  filterWeg,
}: {
  planung: Planung;
  ich: Ich;
  filter: Filter;
  zu: Set<number>;
  umschalten: (paket: number) => void;
  filterWeg: () => void;
}) {
  // Gefiltert stehen nur Pakete da, in denen etwas passt — sonst wären es
  // sieben Überschriften über nichts.
  const pakete = planung.pakete
    .map((p, i) => ({ paket: p, nummer: i + 1, aufgaben: aufgabenImPlan(p.aufgaben).filter((a) => passt(a, filter)) }))
    .filter((g) => !gefiltert(filter) || g.aufgaben.length > 0);

  return (
    <>
      {pakete.length === 0 && planung.pakete.length > 0 && (
        <Leerstelle
          was="Keine Aufgabe passt zu diesem Filter"
          satz={filter.zeige === "jetzt" ? "Gerade läuft nichts und nichts ist überfällig." : "Mit allen Aufgaben siehst du wieder den ganzen Plan."}
          aktion={{ text: "Alle Aufgaben zeigen", tun: filterWeg }}
        />
      )}
      {pakete.map((g) => (
        <Paketgruppe
          key={g.paket.id}
          paket={g.paket}
          nummer={g.nummer}
          aufgaben={g.aufgaben}
          planung={planung}
          ich={ich}
          filter={filter}
          offen={!zu.has(g.paket.id)}
          umschalten={() => umschalten(g.paket.id)}
        />
      ))}
      {ich.darf.bearbeiten && !gefiltert(filter) && <NeuesPaket planung={planung} />}
    </>
  );
}

const PAKETSTATUS: { wert: string; text: string }[] = [
  { wert: "offen", text: "offen" },
  { wert: "laeuft", text: "läuft" },
  { wert: "eingereicht", text: "eingereicht" },
  { wert: "zugesagt", text: "zugesagt" },
  { wert: "fertig", text: "fertig" },
  { wert: "verworfen", text: "verworfen" },
  { wert: "offene_frage", text: "offene Frage" },
];

function Paketgruppe({
  paket,
  nummer,
  aufgaben,
  planung,
  ich,
  filter,
  offen,
  umschalten,
}: {
  paket: Planungspaket;
  nummer: number;
  aufgaben: Planungsaufgabe[];
  planung: Planung;
  ich: Ich;
  filter: Filter;
  offen: boolean;
  umschalten: () => void;
}) {
  const speichern = useSpeichern();
  const darf = ich.darf.bearbeiten;
  const [fehler, setFehler] = useState("");
  const [loeschen, setLoeschen] = useState<Planungsaufgabe | null>(null);
  const erledigt = paket.aufgaben.filter((a) => a.erledigt).length;

  async function versuchen(tun: () => Promise<void>) {
    setFehler("");
    try {
      await tun();
    } catch (e) {
      setFehler(fehlertext(e));
    }
  }

  return (
    <div className="pl-gruppe" data-offen={offen || undefined}>
      <div className="pl-gruppenkopf">
        <button type="button" className="pl-klappe" aria-expanded={offen} aria-label={`${paket.titel} ${offen ? "zuklappen" : "aufklappen"}`} onClick={umschalten}>
          <Zeichen name="zeiger" />
        </button>
        <span className="pl-nr">{String(nummer).padStart(2, "0")}</span>
        <span className="pl-pakettitel">
          <Feldtext wert={paket.titel} aendern={darf} speichern={(titel) => versuchen(() => speichern(`/pakete/${paket.id}/`, { titel }))} />
        </span>
        {darf ? (
          <select
            className="pl-paketstatus"
            data-status={paket.status}
            value={paket.status}
            aria-label={`Status von ${paket.titel}`}
            onChange={(e) => versuchen(() => speichern(`/pakete/${paket.id}/`, { status: e.target.value }))}
          >
            {PAKETSTATUS.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        ) : (
          <span className="pl-paketstatus" data-status={paket.status}>
            {PAKETSTATUS.find((s) => s.wert === paket.status)?.text ?? paket.status}
          </span>
        )}
        <span className="pl-zaehler" title="Aufgaben erledigt">
          {erledigt}/{paket.aufgaben.length}
        </span>
        <Stundenstand gebucht={paket.gebucht} soll={paket.soll} sollBisHeute={paket.soll_bis_heute} />
      </div>

      {offen && (
        <div className="pl-zeilen" role="list" aria-label={`Aufgaben von ${paket.titel}`}>
          {aufgaben.map((a) => (
            <Aufgabenzeile
              key={a.id}
              aufgabe={a}
              planung={planung}
              darf={darf}
              entfernen={ich.darf.loeschen ? () => setLoeschen(a) : undefined}
              versuchen={versuchen}
            />
          ))}
          {darf ? (
            <NeueAufgabe paket={paket} person={filter.person} versuchen={versuchen} />
          ) : (
            aufgaben.length === 0 && <p className="pl-leer">Noch keine Aufgaben.</p>
          )}
        </div>
      )}
      <Fehlerzeile text={fehler} />

      {loeschen && (
        <Loeschdialog
          name={loeschen.titel}
          was="Die Aufgabe"
          milder={
            loeschen.erledigt
              ? undefined
              : {
                  text: "Als erledigt abhaken",
                  tun: () => {
                    const a = loeschen;
                    setLoeschen(null);
                    versuchen(() => speichern(`/unteraufgaben/${a.id}/`, { erledigt: true }));
                  },
                }
          }
          abbrechen={() => setLoeschen(null)}
          loeschen={() => {
            const a = loeschen;
            setLoeschen(null);
            versuchen(() => speichern(`/unteraufgaben/${a.id}/`, null, "DELETE"));
          }}
        />
      )}
    </div>
  );
}

/**
 * Eine Aufgabe als Zeile, alles darin an Ort und Stelle änderbar. Am Handy
 * wird daraus eine Karte — aus demselben Markup, beschriftet über `data-feld`.
 * Was man selten braucht (in ein anderes Paket schieben, entfernen), liegt
 * hinter „…", damit die Zeile ruhig bleibt.
 */
function Aufgabenzeile({
  aufgabe: a,
  planung,
  darf,
  entfernen,
  versuchen,
}: {
  aufgabe: Planungsaufgabe;
  planung: Planung;
  darf: boolean;
  entfernen: (() => void) | undefined;
  versuchen: (tun: () => Promise<void>) => Promise<void>;
}) {
  const speichern = useSpeichern();
  const team = useTeam();
  const [mehr, setMehr] = useState(false);
  const aktive = (team.data ?? []).filter((t) => t.is_active || t.id === a.verantwortlich);
  const aendern = (daten: Record<string, unknown>) => versuchen(() => speichern(`/unteraufgaben/${a.id}/`, daten));

  return (
    <div className="pl-zeile" role="listitem" data-lage={a.lage}>
      <input
        type="checkbox"
        className="pl-haken"
        checked={a.erledigt}
        disabled={!darf}
        aria-label={`„${a.titel}“ erledigt`}
        onChange={(e) => aendern({ erledigt: e.target.checked })}
      />
      <span className="pl-aufgabentitel" data-feld="Aufgabe">
        <Feldtext
          wert={a.titel}
          aendern={darf}
          speichern={(titel) => versuchen(() => speichern(`/unteraufgaben/${a.id}/`, { titel }))}
        />
      </span>
      <span className="pl-lagefeld">
        <span className="pl-lage" data-lage={a.lage}>
          {lageText(a)}
        </span>
      </span>
      <span data-feld="Wer">
        <select
          className="pl-wer"
          value={a.verantwortlich ?? ""}
          disabled={!darf}
          aria-label={`Wer macht „${a.titel}“`}
          onChange={(e) => aendern({ verantwortlich: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">—</option>
          {aktive.map((t) => (
            <option key={t.id} value={t.id}>
              {t.initialen || t.name}
            </option>
          ))}
        </select>
      </span>
      <span data-feld="Beginn">
        <Datumsfeld
          wert={a.von}
          darf={darf}
          beschriftung={`Beginn von ${a.titel}`}
          // Ein Beginn ohne Ende wird ein Tag; ein Beginn nach dem Ende
          // nimmt das Ende mit. Geleert wird beides — halb gibt es nicht.
          speichern={(von) => aendern(von === null ? { von: null, bis: null } : { von, bis: !a.bis || a.bis < von ? von : a.bis })}
        />
      </span>
      <span data-feld="Ende">
        <Datumsfeld
          wert={a.bis}
          darf={darf}
          beschriftung={`Ende von ${a.titel}`}
          speichern={(bis) => aendern(bis === null ? { von: null, bis: null } : { bis, von: !a.von || a.von > bis ? bis : a.von })}
        />
      </span>
      <span data-feld="Stunden">
        <Stundenfeld wert={a.stunden} darf={darf} titel={a.titel} speichern={(stunden) => aendern({ stunden })} />
      </span>
      {darf ? (
        <button type="button" className="pl-mehrknopf" aria-expanded={mehr} aria-label={`Mehr zu „${a.titel}“`} onClick={() => setMehr(!mehr)}>
          <Zeichen name="punkte" />
        </button>
      ) : (
        <span />
      )}
      {mehr && (
        <div className="pl-mehr">
          <label>
            <span>In Paket</span>
            <select
              className="pl-wahl"
              value={a.paket}
              onChange={(e) => {
                setMehr(false);
                aendern({ paket: Number(e.target.value) });
              }}
            >
              {planung.pakete.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {String(i + 1).padStart(2, "0")} · {p.titel}
                </option>
              ))}
            </select>
          </label>
          {entfernen && (
            <button type="button" className="pl-knopf-leise" data-ton="schlecht" onClick={entfernen}>
              <Zeichen name="korb" />
              Entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Die letzte Zeile jedes Pakets: tippen, Enter, die nächste. Mit gewählter Person gehört sie gleich ihr. */
function NeueAufgabe({
  paket,
  person,
  versuchen,
}: {
  paket: Planungspaket;
  person: number | null;
  versuchen: (tun: () => Promise<void>) => Promise<void>;
}) {
  const speichern = useSpeichern();
  const [neu, setNeu] = useState("");

  async function dazu() {
    const titel = neu.trim();
    if (!titel) return;
    // Sofort leeren, nicht erst nach dem Speichern: Wer gleich die nächste
    // Aufgabe tippt, schriebe sonst hinter die erste, und beide landeten als
    // eine auf dem Server.
    setNeu("");
    await versuchen(async () => {
      try {
        await speichern(
          "/unteraufgaben/",
          {
            paket: paket.id,
            titel,
            reihenfolge: Math.max(0, ...paket.aufgaben.map((a) => a.reihenfolge)) + 1,
            ...(person === null ? {} : { verantwortlich: person }),
          },
          "POST",
        );
      } catch (e) {
        setNeu(titel);
        throw e;
      }
    });
  }

  return (
    <form
      className="pl-neu"
      onSubmit={(e) => {
        e.preventDefault();
        dazu();
      }}
    >
      <Zeichen name="plus" />
      <input
        value={neu}
        placeholder="Aufgabe hinzufügen …"
        aria-label={`Neue Aufgabe in ${paket.titel}`}
        onChange={(e) => setNeu(e.target.value)}
      />
      {neu.trim() && (
        <button type="submit" className="pl-knopf">
          Anlegen
        </button>
      )}
    </form>
  );
}

/** Ein Paket gleich hier anlegen — die Arbeit hält sich nicht an die Pakete aus dem Antrag. */
function NeuesPaket({ planung }: { planung: Planung }) {
  const speichern = useSpeichern();
  const [titel, setTitel] = useState("");
  const [fehler, setFehler] = useState("");

  async function anlegen() {
    const t = titel.trim();
    if (!t) return;
    setFehler("");
    try {
      await speichern("/pakete/", { phase: planung.phase.id, titel: t, reihenfolge: planung.pakete.length + 1 }, "POST");
      setTitel("");
    } catch (e) {
      setFehler(fehlertext(e));
    }
  }

  return (
    <form
      className="pl-neues-paket"
      onSubmit={(e) => {
        e.preventDefault();
        anlegen();
      }}
    >
      <input
        className="pl-wahl"
        value={titel}
        placeholder={planung.pakete.length ? "Neues Arbeitspaket …" : "Erstes Arbeitspaket, z. B. Greifer"}
        aria-label="Neues Arbeitspaket"
        onChange={(e) => setTitel(e.target.value)}
      />
      <button type="submit" className="pl-knopf" disabled={!titel.trim()}>
        <Zeichen name="plus" />
        Paket
      </button>
      <Fehlerzeile text={fehler} />
    </form>
  );
}

/** Geplante Stunden einer Aufgabe — gespeichert beim Verlassen, Unlesbares wird gemeldet. */
function Stundenfeld({
  wert,
  darf,
  titel,
  speichern,
}: {
  wert: string | null;
  darf: boolean;
  titel: string;
  speichern: (stunden: string | null) => Promise<void>;
}) {
  const [falsch, setFalsch] = useState(false);
  const anzeige = wert === null ? "" : String(Number(wert)).replace(".", ",");
  return (
    <input
      key={anzeige}
      className="feld zahl pl-stundenfeld"
      inputMode="decimal"
      defaultValue={anzeige}
      placeholder="h"
      disabled={!darf}
      aria-label={`Geplante Stunden für „${titel}“`}
      aria-invalid={falsch || undefined}
      onBlur={(e) => {
        const neu = stundenAusEingabe(e.target.value);
        setFalsch(neu === undefined);
        if (neu === undefined || neu === wert || (neu !== null && wert !== null && Number(neu) === Number(wert))) return;
        speichern(neu);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/**
 * Gebucht gegen Soll, mit einem Strich, wo man laut Antrag heute stehen
 * sollte. Über 100 % läuft der Balken voll und wechselt die Farbe.
 */
function Stundenstand({ gebucht, soll, sollBisHeute }: { gebucht: string; soll: string; sollBisHeute: string | null }) {
  const s = Number(soll);
  const anteil = s > 0 ? (100 * Number(gebucht)) / s : null;
  return (
    <span className="pl-stand">
      <span className="zahl">
        {Number(gebucht).toLocaleString("de-AT", { maximumFractionDigits: 0 })} / {alsH(soll, 0)}
      </span>
      {anteil !== null && (
        <span className="pl-balken" data-ueber={anteil > 100 || undefined}>
          <i style={{ width: `${Math.min(100, anteil)}%` }} />
          {sollBisHeute !== null && (
            <b
              style={{ left: `${Math.min(100, (100 * Number(sollBisHeute)) / s)}%` }}
              title={`Soll bis heute: ${alsH(sollBisHeute)}`}
            />
          )}
        </span>
      )}
    </span>
  );
}

/* --- Zeitplan: der Gantt ------------------------------------------------------- */

function Zeitplan({
  planung,
  darf,
  filter,
  zu,
  umschalten,
}: {
  planung: Planung;
  darf: boolean;
  filter: Filter;
  zu: Set<number>;
  umschalten: (paket: number) => void;
}) {
  const speichern = useSpeichern();
  const antragspakete = new Map((planung.antrag?.pakete ?? []).map((p) => [p.id, p]));
  const pakete = planung.pakete
    .map((p, i) => ({ p, nummer: i + 1, aufgaben: aufgabenImPlan(p.aufgaben).filter((a) => passt(a, filter)) }))
    .filter((g) => !gefiltert(filter) || g.aufgaben.length > 0);

  if (planung.pakete.length === 0)
    return <Leerstelle was="Noch keine Arbeitspakete" satz="Unter „Aufgaben“ legst du das erste Paket an." />;
  return (
    <>
      <Gantt achse={planung.achse} heute={planung.heute} etikett="Paket und Aufgabe" rechts="Stunden">
        {pakete.map(({ p, nummer, aufgaben }) => {
          const ap = p.foerderpaket === null ? undefined : antragspakete.get(p.foerderpaket);
          const offen = !zu.has(p.id);
          return [
            <GanttZeile
              key={`p${p.id}`}
              art="paket"
              gewaehlt={offen}
              etikett={
                <button type="button" className="gantt-wahl" aria-expanded={offen} onClick={() => umschalten(p.id)}>
                  <b>
                    <span className="pl-nr">{String(nummer).padStart(2, "0")}</span> {p.titel}
                  </b>
                  <em>
                    {ap ? `Antrag M${ap.monat_von}–M${ap.monat_bis}` : "ohne Antragspaket"} · {p.aufgaben.length}{" "}
                    {p.aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"}
                  </em>
                </button>
              }
              rechts={<Stundenstand gebucht={p.gebucht} soll={p.soll} sollBisHeute={p.soll_bis_heute} />}
            >
              {ap?.von && ap.bis && (
                <GanttBalken
                  spanne={{ von: ap.von, bis: ap.bis }}
                  art="antrag"
                  darf={false}
                  klick={() => umschalten(p.id)}
                  beschriftung={`Laut Antrag: ${zeitraumText(ap.von, ap.bis)}`}
                />
              )}
              {p.plan_von && p.plan_bis && (
                <GanttBalken
                  spanne={{ von: p.plan_von, bis: p.plan_bis }}
                  art="plan"
                  darf={false}
                  klick={() => umschalten(p.id)}
                  beschriftung={`Aufgaben: ${zeitraumText(p.plan_von, p.plan_bis)}`}
                />
              )}
            </GanttZeile>,
            ...(offen ? aufgaben.map((a) => <Ganttaufgabe key={`a${a.id}`} aufgabe={a} darf={darf} speichern={speichern} />) : []),
          ];
        })}
      </Gantt>
      <ul className="pl-legende" aria-label="Legende">
        <li>
          <i data-muster="antrag" /> laut Antrag
        </li>
        <li>
          <i data-muster="plan" /> Aufgaben eines Pakets
        </li>
        <li>
          <i data-muster="aufgabe" /> Aufgabe
        </li>
        <li>
          <i data-muster="ueberfaellig" /> überfällig
        </li>
        <li>
          <i data-muster="erledigt" /> erledigt
        </li>
      </ul>
    </>
  );
}

function Ganttaufgabe({
  aufgabe: a,
  darf,
  speichern,
}: {
  aufgabe: Planungsaufgabe;
  darf: boolean;
  speichern: (pfad: string, daten: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <GanttZeile
      art="aufgabe"
      setzen={
        darf && !a.von
          ? (tag) => speichern(`/unteraufgaben/${a.id}/`, { von: tag, bis: plusTage(tag, NEUE_AUFGABE_TAGE - 1) })
          : undefined
      }
      etikett={
        <label className="pl-ganttaufgabe" data-erledigt={a.erledigt || undefined}>
          <input
            type="checkbox"
            className="pl-haken"
            checked={a.erledigt}
            disabled={!darf}
            onChange={(e) => speichern(`/unteraufgaben/${a.id}/`, { erledigt: e.target.checked })}
          />
          <span>
            <b>{a.titel}</b>
            <em>{[a.verantwortlich_name, a.von ? zeitraumText(a.von, a.bis) : ""].filter(Boolean).join(" · ")}</em>
          </span>
        </label>
      }
      rechts={<span className="zahl pl-sub">{a.stunden === null ? "" : alsH(a.stunden)}</span>}
    >
      {a.von && a.bis && (
        <GanttBalken
          spanne={{ von: a.von, bis: a.bis }}
          art="aufgabe"
          stand={a.lage}
          darf={darf}
          beschriftung={`${a.titel}: ${zeitraumText(a.von, a.bis)}`}
          aendern={(spanne) => speichern(`/unteraufgaben/${a.id}/`, spanne)}
        >
          {a.titel}
        </GanttBalken>
      )}
    </GanttZeile>
  );
}

/* --- Stunden & Antrag ---------------------------------------------------------- */

/**
 * Alles, was man nachschlägt statt täglich liest: woraus die Phase bezahlt
 * wird, welches Arbeitspaket in welches Antragspaket abrechnet, wer wie viel
 * gebucht hat, und was eingereicht wurde.
 */
function Antragsansicht({ planung, ich, wechseln }: { planung: Planung; ich: Ich; wechseln: Wechseln }) {
  const { phase, antrag } = planung;
  const speichern = useSpeichern();
  const programme = useFoerderungen();
  const [fehler, setFehler] = useState("");
  const darf = ich.darf.bearbeiten;
  const antragspakete = new Map((antrag?.pakete ?? []).map((p) => [p.id, p]));
  const antragsweg = antrag && `foerderungen/${antrag.geber}/${antrag.programm}/${antrag.id}`;

  async function versuchen(tun: () => Promise<void>) {
    setFehler("");
    try {
      await tun();
    } catch (e) {
      setFehler(fehlertext(e));
    }
  }

  return (
    <>
      <section className="pl-tafel pl-bezahlt">
        <div>
          <h2>Bezahlt aus</h2>
          {antrag && antragsweg && (
            <a
              className="pl-sub"
              href={alsPfad("module", antragsweg)}
              onClick={(e) => {
                e.preventDefault();
                wechseln("module", antragsweg);
              }}
            >
              {antrag.geber_name} · {antrag.programm_name} · {antragsstandText(antrag.stand)}
              {antrag.beginn_aus_phase && " · Beginn aus der Phase"}
            </a>
          )}
        </div>
        {darf ? (
          <select
            className="pl-wahl"
            value={phase.foerderantrag ?? ""}
            aria-label="Förderantrag der Phase"
            onChange={(e) =>
              versuchen(() => speichern(`/phasen/${phase.id}/`, { foerderantrag: e.target.value === "" ? null : Number(e.target.value) }))
            }
          >
            <option value="">keinem Förderantrag</option>
            {(programme.data ?? []).map((pr) =>
              pr.antraege.length === 0 ? null : (
                <optgroup key={pr.id} label={pr.name}>
                  {pr.antraege.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.titel}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        ) : (
          <span>{antrag ? antrag.titel : "keinem Förderantrag"}</span>
        )}
        <Fehlerzeile text={fehler} />
      </section>

      <section className="pl-tafel">
        <h2>Stunden je Arbeitspaket</h2>
        {planung.pakete.length === 0 ? (
          <Leerstelle was="Noch keine Arbeitspakete" satz="Unter „Aufgaben“ legst du das erste Paket an." />
        ) : (
          <div className="pl-stundenliste">
            {planung.pakete.map((p, i) => {
              const ap = p.foerderpaket === null ? undefined : antragspakete.get(p.foerderpaket);
              return (
                <div key={p.id} className="pl-stundenpaket">
                  <div className="pl-stundenkopf">
                    <span className="pl-nr">{String(i + 1).padStart(2, "0")}</span>
                    <b>{p.titel}</b>
                    <Stundenstand gebucht={p.gebucht} soll={p.soll} sollBisHeute={p.soll_bis_heute} />
                  </div>
                  <div className="pl-stundenraster">
                    <div className="pl-antragsteil">
                      {antrag && darf ? (
                        <select
                          className="pl-wahl"
                          value={p.foerderpaket ?? ""}
                          aria-label={`Antragspaket von ${p.titel}`}
                          onChange={(e) =>
                            versuchen(() =>
                              speichern(`/pakete/${p.id}/`, { foerderpaket: e.target.value === "" ? null : Number(e.target.value) }),
                            )
                          }
                        >
                          <option value="">rechnet in kein Antragspaket ab</option>
                          {antrag.pakete.map((x) => (
                            <option key={x.id} value={x.id}>
                              Antrag {String(x.nummer).padStart(2, "0")} · {x.titel}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="pl-sub">
                          {ap ? `Antrag ${String(ap.nummer).padStart(2, "0")} · ${ap.titel}` : antrag ? "rechnet in kein Antragspaket ab" : "Soll aus dem Pensum"}
                        </span>
                      )}
                      {ap && (
                        <span className="pl-sub zahl">
                          M{ap.monat_von}–M{ap.monat_bis}
                          {ap.von && ` · ${zeitraumText(ap.von, ap.bis)}`}
                        </span>
                      )}
                      {ap?.ziel && (
                        <details className="pl-texte">
                          <summary>Ziel und Inhalt laut Antrag</summary>
                          <p>{ap.ziel}</p>
                        </details>
                      )}
                    </div>
                    <div className="pl-personen">
                      {p.personen.length === 0 ? (
                        <span className="pl-sub">Weder Soll noch gebuchte Zeit.</span>
                      ) : (
                        p.personen.map((person) => (
                          <div className="pl-person" key={`${person.nutzer ?? person.name}`}>
                            <span>{person.name}</span>
                            {person.soll !== null && Number(person.soll) > 0 ? (
                              <span className="pl-balken" data-ueber={Number(person.gebucht) > Number(person.soll) || undefined}>
                                <i style={{ width: `${Math.min(100, (100 * Number(person.gebucht)) / Number(person.soll))}%` }} />
                              </span>
                            ) : (
                              <span className="pl-sub">{person.soll === null ? "nicht im Soll" : ""}</span>
                            )}
                            <span className="zahl">
                              {alsH(person.gebucht)} / {alsH(person.soll)}
                            </span>
                          </div>
                        ))
                      )}
                      <span className="pl-sub zahl">
                        Aufgaben planen {alsH(p.aufgaben_stunden)} von {alsH(p.soll)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {antrag && <Ziele planung={planung} />}
    </>
  );
}

/**
 * Was eingereicht wurde: je Antragspaket das Ergebnis, sein Termin und ob das
 * Arbeitspaket dazu fertig ist. Darunter die Texte des Antrags, zugeklappt —
 * nachzulesen, nicht täglich zu lesen.
 */
function Ziele({ planung }: { planung: Planung }) {
  const antrag = planung.antrag!;
  const arbeit = new Map(planung.pakete.filter((p) => p.foerderpaket !== null).map((p) => [p.foerderpaket!, p]));
  return (
    <section className="pl-tafel pl-ziele">
      <h2>Ziele und Ergebnisse laut Antrag</h2>
      {antrag.pakete.length === 0 ? (
        <Leerstelle was="Der Antrag hat keine Pakete" satz="Pakete, Ziele und Ergebnisse stehen im Antrag unter Förderungen." />
      ) : (
        <ol>
          {antrag.pakete.map((ap) => {
            const p = arbeit.get(ap.id);
            const fertig = p?.status === "fertig";
            return (
              <li key={ap.id}>
                <span className="pl-nr">{String(ap.nummer).padStart(2, "0")}</span>
                <span className="pl-zieltext">
                  <b>{ap.ergebnis || ap.titel}</b>
                  <em>
                    {ap.titel}
                    {p ? "" : " · keinem Arbeitspaket zugeordnet"}
                  </em>
                </span>
                <span className="pl-sub zahl">{ap.bis ? `bis ${zeitraumText(ap.bis, ap.bis)}` : `M${ap.monat_bis}`}</span>
                <span className="pl-lage" data-lage={fertig ? "erledigt" : p ? "steht_an" : "ohne_termin"}>
                  {fertig ? "erreicht" : p ? "offen" : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {(antrag.beschreibung || antrag.abschnitte.length > 0) && (
        <details className="pl-texte">
          <summary>Texte aus dem Antrag</summary>
          {antrag.beschreibung && <p>{antrag.beschreibung}</p>}
          {antrag.abschnitte.map((ab) => (
            <div key={ab.titel}>
              <h3>{ab.titel}</h3>
              <p>{ab.text}</p>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
