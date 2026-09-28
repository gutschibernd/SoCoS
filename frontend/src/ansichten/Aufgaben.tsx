/**
 * Die Aufgaben: **eine** Liste, nach Fälligkeit gruppiert, darüber ein Filter,
 * wessen Aufgaben. Daneben zwei Reiter: Ideen und Archiv.
 *
 * **Warum keine Spalten je Person mehr** (bis 2026-09-28): Überfälliges stand
 * irgendwo in einer fremden Spalte, wo es niemand sah, und eine Aufgabe, die
 * zwei gemeinsam machen, gab es nur zweimal abgetippt. Jetzt steht oben, was
 * drängt, und wem etwas gehört, beantwortet der Filter. Eine Aufgabe mit zwei
 * Personen steht bei beiden.
 *
 * **Das Erledigte hat einen eigenen Reiter.** Unten an der Liste wuchs es mit
 * jeder Woche, und wer das Letzte suchte, fand erst das Abgehakte.
 *
 * Anlegen bleibt eine Zeile und Enter. Wer ins Feld tippt, bekommt darunter
 * ein kleines Menü mit Frist und Personen — zugeklappt, solange niemand
 * schreibt, damit es die Liste nicht nach unten schiebt.
 *
 * Bearbeiten klappt **in der Zeile** auf, kein Fenster. Jeder Griff darin
 * gilt sofort; es gibt kein „Speichern", das man vergessen könnte.
 *
 * Der Filter merkt sich der Browser, nicht der Server: Er sagt nichts über die
 * Aufgaben, sondern darüber, wie einer von dreien gerade hinsieht.
 */

import { useEffect, useRef, useState } from "react";

import { hole } from "../basis/api";
import {
  archiv,
  datumIn,
  fristText,
  gehoertZu,
  ideen,
  leute,
  PRIORITAETEN,
  prioritaetstext,
  SCHNELLFRISTEN,
  tafel,
  type Filter,
} from "../basis/aufgaben";
import { melden } from "../basis/meldungen";
import type { Seite } from "../basis/router";
import { useAufgaben, useNeuLaden, useTeam, type Aufgabe, type Ich, type Teammitglied } from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";

const SPEICHER = "socos.aufgaben.filter";

function filterLesen(): Filter {
  try {
    const roh = window.localStorage.getItem(SPEICHER);
    if (roh === "ich" || roh === "alle" || roh === "allgemein") return roh;
    if (roh && /^\d+$/.test(roh)) return Number(roh);
  } catch {
    // Ein privates Fenster oder abgeschaltete Speicherung. Dann eben „Meine" —
    // das ist kein Fehler, über den jemand lesen muss.
  }
  return "ich";
}

type Speichern = (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
type Anlegen = (daten: Partial<Aufgabe>) => Promise<void>;

export function Aufgaben({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const liste = useAufgaben();
  const team = useTeam();
  const neuLaden = useNeuLaden();
  const [filter, setFilter] = useState<Filter>(filterLesen);
  const [offen, setOffen] = useState<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPEICHER, String(filter));
    } catch {
      /* Siehe oben: nicht speichern zu können ändert nichts an der Liste. */
    }
  }, [filter]);

  // Ein anderer Reiter oder Filter schließt die aufgeklappte Zeile — sie
  // stünde dort sonst offen, wo man sie nicht mehr sieht.
  useEffect(() => setOffen(null), [unter, filter]);

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  const aufgaben = liste.data;
  const personen = leute(aufgaben, team.data, ich.id);
  // Ein gemerkter Filter auf eine Person, die es nicht mehr gibt, fällt auf
  // „Meine" zurück — sonst stünde eine leere Liste da ohne gewählten Knopf.
  const wirksam: Filter =
    typeof filter === "number" && !personen.some((p) => p.id === filter) ? "ich" : filter;
  const darfSchreiben = ich.darf.bearbeiten;
  const ansicht = unter === "ideen" ? "ideen" : unter === "archiv" ? "archiv" : "tafel";

  /* Anlegen und Ändern laufen über dieselben zwei Funktionen, gleich in
     welchem Reiter. Der Unterschied steckt einzig in den Feldern, die
     mitgehen — nicht in einem zweiten Weg zum Server. */
  const anlegen: Anlegen = async (daten) => {
    await hole("/aufgaben/", { method: "POST", body: JSON.stringify(daten) });
    neuLaden();
  };
  const speichern: Speichern = async (aufgabe, daten) => {
    await hole(`/aufgaben/${aufgabe.id}/`, { method: "PATCH", body: JSON.stringify(daten) });
    neuLaden();
  };

  const zahlTafel = aufgaben.filter((a) => !a.ist_idee && !a.erledigt && gehoertZu(a, wirksam, ich.id)).length;
  const zahlIdeen = ideen(aufgaben).length;

  const gemeinsam = { ich, personen, darfSchreiben, speichern, offen, setOffen, filter: wirksam };

  return (
    <div className="aufgabenseite">
      <div className="aufgaben-kopf">
        <div className="spannenwahl" role="group" aria-label="Ansicht">
          <button type="button" aria-pressed={ansicht === "tafel"} onClick={() => wechseln("aufgaben", null)}>
            Tafel <span className="zahl">{zahlTafel}</span>
          </button>
          <button type="button" aria-pressed={ansicht === "ideen"} onClick={() => wechseln("aufgaben", "ideen")}>
            Ideen <span className="zahl">{zahlIdeen}</span>
          </button>
          <button type="button" aria-pressed={ansicht === "archiv"} onClick={() => wechseln("aufgaben", "archiv")}>
            Archiv
          </button>
        </div>

        {ansicht !== "ideen" && (
          <Filterleiste
            aufgaben={aufgaben}
            personen={personen}
            ich={ich.id}
            filter={wirksam}
            waehlen={setFilter}
            erledigte={ansicht === "archiv"}
          />
        )}
      </div>

      {darfSchreiben && ansicht !== "archiv" && (
        <Neuzeile
          key={`${ansicht}-${String(wirksam)}`}
          idee={ansicht === "ideen"}
          vorgabe={vorgabePersonen(wirksam, ich.id)}
          personen={personen}
          ich={ich.id}
          filter={wirksam}
          anlegen={anlegen}
        />
      )}

      {ansicht === "tafel" && <Tafelliste aufgaben={aufgaben} {...gemeinsam} />}
      {ansicht === "ideen" && <Ideenliste aufgaben={aufgaben} {...gemeinsam} />}
      {ansicht === "archiv" && <Archivliste aufgaben={aufgaben} {...gemeinsam} />}
    </div>
  );
}

/** Wem eine neue Aufgabe gehört, solange niemand etwas anderes wählt: dem, was gerade gefiltert ist. */
function vorgabePersonen(filter: Filter, ich: number): number[] {
  if (filter === "allgemein") return [];
  if (typeof filter === "number") return [filter];
  return [ich];
}

function Kuerzel({ person }: { person: Teammitglied | undefined }) {
  if (!person) return null;
  return (
    <i className="kuerzel" style={{ background: person.farbe }} title={person.name}>
      {person.initialen}
    </i>
  );
}

const vorname = (p: Teammitglied) => p.name.split(" ")[0];

function Filterleiste({
  aufgaben,
  personen,
  ich,
  filter,
  waehlen,
  erledigte,
}: {
  aufgaben: Aufgabe[];
  personen: Teammitglied[];
  ich: number;
  filter: Filter;
  waehlen: (f: Filter) => void;
  erledigte: boolean;
}) {
  /* Die Zahl neben jedem Knopf ist die Zahl dessen, was man dahinter
     findet — ohne sie wäre jeder Knopf einer, hinter dem man nachsehen muss,
     ob sich das Nachsehen lohnt. Im Archiv steht keine: „wie viel ist
     erledigt" fragt dort niemand. */
  const zahl = (f: Filter) =>
    aufgaben.filter((a) => !a.ist_idee && !a.erledigt && gehoertZu(a, f, ich)).length;
  const knopf = (f: Filter, inhalt: React.ReactNode) => (
    <button
      key={String(f)}
      type="button"
      className="aufgaben-chip"
      aria-pressed={filter === f}
      onClick={() => waehlen(f)}
    >
      {inhalt}
      {!erledigte && <span className="zahl">{zahl(f)}</span>}
    </button>
  );

  return (
    <div className="aufgaben-filter" role="group" aria-label="Wessen Aufgaben">
      {knopf("ich", "Meine")}
      {knopf("alle", "Alle")}
      <span className="aufgaben-trenner" aria-hidden="true" />
      {personen
        .filter((p) => p.id !== ich)
        .map((p) =>
          knopf(
            p.id,
            <>
              <Kuerzel person={p} />
              {vorname(p)}
            </>,
          ),
        )}
      {knopf("allgemein", "Allgemein")}
    </div>
  );
}

/**
 * Personenwahl mit mehreren Treffern: jeder Knopf schaltet eine Person an
 * oder ab, „Allgemein" leert die Auswahl. Dieselbe Wahl im Menü unter dem
 * Eingabefeld und in der aufgeklappten Zeile — eine zweite liefe beim
 * nächsten neuen Knopf auseinander.
 */
function Personenwahl({
  personen,
  ich,
  gewaehlt,
  aendern,
  gesperrt = false,
}: {
  personen: Teammitglied[];
  ich: number;
  gewaehlt: number[];
  aendern: (neu: number[]) => void;
  gesperrt?: boolean;
}) {
  return (
    <div className="aufgaben-knoepfe" role="group" aria-label="Für">
      {personen.map((p) => {
        const an = gewaehlt.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            className="aufgaben-chip"
            aria-pressed={an}
            disabled={gesperrt}
            onClick={() => aendern(an ? gewaehlt.filter((g) => g !== p.id) : [...gewaehlt, p.id])}
          >
            <Kuerzel person={p} />
            {p.id === ich ? "Ich" : vorname(p)}
          </button>
        );
      })}
      <button
        type="button"
        className="aufgaben-chip"
        aria-pressed={gewaehlt.length === 0}
        disabled={gesperrt}
        onClick={() => aendern([])}
      >
        Allgemein
      </button>
    </div>
  );
}

/** Die Schnellfristen als Knöpfe. Ein zweiter Tipp auf die gewählte nimmt sie wieder weg. */
function Fristwahl({
  frist,
  aendern,
  mitDatum,
  gesperrt = false,
}: {
  frist: string | null;
  aendern: (neu: string | null) => void;
  mitDatum: boolean;
  gesperrt?: boolean;
}) {
  return (
    <div className="aufgaben-knoepfe" role="group" aria-label="Frist">
      {SCHNELLFRISTEN.map(({ tage, text }) => {
        const datum = datumIn(tage);
        return (
          <button
            key={tage}
            type="button"
            className="aufgaben-chip"
            aria-pressed={frist === datum}
            disabled={gesperrt}
            onClick={() => aendern(frist === datum ? null : datum)}
          >
            {text}
          </button>
        );
      })}
      {mitDatum && (
        <>
          <input
            type="date"
            className="feld aufgaben-datum"
            value={frist ?? ""}
            aria-label="Anderes Datum"
            disabled={gesperrt}
            onChange={(e) => aendern(e.target.value || null)}
          />
          {/* Am iPhone hat das Datumsfeld kein Kreuz zum Leeren. */}
          <button
            type="button"
            className="aufgaben-chip"
            aria-pressed={frist === null}
            disabled={gesperrt}
            onClick={() => aendern(null)}
          >
            Ohne
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Das Feld zum Schreiben — oben, immer offen, ohne „Neu"-Knopf davor.
 *
 * Darunter das Menü mit Frist und Personen. Es geht auf, sobald jemand ins
 * Feld tippt, und wieder zu, wenn er es leer verlässt. Die Knöpfe darin
 * nehmen dem Feld den Griff nicht weg (`preventDefault` beim Drücken) — sonst
 * klappte das Menü zu, während man gerade darauf tippt, und am iPhone ginge
 * die Tastatur bei jedem Knopf zu und wieder auf.
 *
 * Nach dem Enter bleibt der Griff im Feld: Wer eine Sache aufschreibt, hat
 * meistens gleich die zweite im Kopf. Die Personen bleiben stehen, die Frist
 * nicht — die gehört fast immer nur zu der einen Zeile.
 */
function Neuzeile({
  idee,
  vorgabe,
  personen,
  ich,
  filter,
  anlegen,
}: {
  idee: boolean;
  vorgabe: number[];
  personen: Teammitglied[];
  ich: number;
  filter: Filter;
  anlegen: Anlegen;
}) {
  const [text, setText] = useState("");
  const [frist, setFrist] = useState<string | null>(null);
  const [fuer, setFuer] = useState<number[]>(vorgabe);
  const [menue, setMenue] = useState(false);
  const feld = useRef<HTMLInputElement>(null);

  // `N` springt ins Feld, solange nicht schon in einem anderen geschrieben wird.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "n") return;
      if (/INPUT|TEXTAREA|SELECT/.test(ziel.tagName) || ziel.isContentEditable) return;
      e.preventDefault();
      feld.current?.focus();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    const sauber = text.trim();
    if (!sauber) return;
    // Sofort leeren und nicht erst nach der Antwort: Wer gleich die nächste
    // Zeile tippt, schriebe sonst in ein Feld, das ihm gleich darauf unter
    // den Fingern geleert wird. Ein doppeltes Enter legt damit auch nichts
    // doppelt an — beim zweiten ist das Feld schon leer.
    setText("");
    setFrist(null);
    try {
      await anlegen(idee ? { text: sauber, ist_idee: true } : { text: sauber, personen: fuer, frist });
      // Wer für jemand anderen anlegt, als gerade gefiltert ist, sähe die
      // Zeile sonst einfach nicht erscheinen — und tippte sie ein zweites Mal.
      if (!idee && !gehoertZu({ personen: fuer } as Aufgabe, filter, ich)) {
        const namen = fuer.map((id) => personen.find((p) => p.id === id)).filter(Boolean) as Teammitglied[];
        melden("gut", `Angelegt für ${namen.length ? namen.map(vorname).join(" und ") : "Allgemein"}.`);
      }
    } catch {
      // `hole` hat den Grund schon gemeldet. Das Getippte kommt zurück,
      // sofern nicht schon Neues im Feld steht.
      setText((jetzt) => jetzt || sauber);
      setFrist((jetzt) => jetzt ?? frist);
    }
  }

  return (
    <form
      className="aufgaben-neu"
      data-offen={menue && !idee ? "ja" : "nein"}
      onSubmit={abschicken}
      onFocus={() => setMenue(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !text.trim()) setMenue(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setText("");
          setMenue(false);
          feld.current?.blur();
        }
      }}
    >
      <div className="aufgaben-neu-zeile">
        <Zeichen name="plus" />
        <input
          ref={feld}
          className="aufgaben-neu-feld"
          value={text}
          maxLength={250}
          placeholder={idee ? "Neue Idee …" : "Neue Aufgabe …"}
          aria-label={idee ? "Neue Idee" : "Neue Aufgabe"}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="knopf" disabled={!text.trim()}>
          Anlegen
        </button>
      </div>

      {menue && !idee && (
        <div className="aufgaben-neu-menue" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
          <div className="aufgaben-reihe">
            <span className="beschriftung-klein">Frist</span>
            <Fristwahl frist={frist} aendern={setFrist} mitDatum={false} />
          </div>
          <div className="aufgaben-reihe">
            <span className="beschriftung-klein">Für</span>
            <Personenwahl personen={personen} ich={ich} gewaehlt={fuer} aendern={setFuer} />
          </div>
        </div>
      )}
    </form>
  );
}

type Listenteile = {
  aufgaben: Aufgabe[];
  ich: Ich;
  personen: Teammitglied[];
  darfSchreiben: boolean;
  speichern: Speichern;
  offen: number | null;
  setOffen: (id: number | null) => void;
  filter: Filter;
};

function Tafelliste({ aufgaben, ...rest }: Listenteile) {
  const gruppen = tafel(aufgaben, rest.filter, rest.ich.id);

  if (gruppen.length === 0)
    return (
      <Leerstelle
        was="Nichts offen"
        satz={
          rest.darfSchreiben
            ? "Oben hineinschreiben und Enter drücken. Oder oben „Alle“ wählen."
            : "Hier steht nichts an. Oben „Alle“ zeigt, was die anderen offen haben."
        }
      />
    );

  return (
    <>
      {gruppen.map((g) => (
        <section key={g.art} className="aufgaben-gruppe">
          <h2 className="aufgaben-gruppenkopf" data-art={g.art}>
            {g.titel}
            <span className="zahl">{g.aufgaben.length}</span>
          </h2>
          <ul className="aufgabenliste">
            {g.aufgaben.map((a) => (
              <Zeile key={a.id} aufgabe={a} {...rest} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Die Ideen: **eine** Liste, ohne Filter. Eine Idee gehört niemandem — wer
 * sie macht, ist ja gerade die Frage, die noch offen ist.
 */
function Ideenliste({ aufgaben, ...rest }: Listenteile) {
  const liste = ideen(aufgaben);
  if (liste.length === 0)
    return (
      <Leerstelle
        was="Keine offene Idee"
        satz="Hier steht, was uns eingefallen ist und noch nicht entschieden. Oben hineinschreiben und Enter drücken."
      />
    );
  return (
    <ul className="aufgabenliste">
      {liste.map((a) => (
        <Zeile key={a.id} aufgabe={a} {...rest} />
      ))}
    </ul>
  );
}

/** Das Abgehakte, nach Monaten. Ein Tipp auf den Haken holt eine Zeile zurück. */
function Archivliste({ aufgaben, ...rest }: Listenteile) {
  const monate = archiv(aufgaben, rest.filter, rest.ich.id);
  if (monate.length === 0)
    return <Leerstelle was="Noch nichts abgehakt" satz="Was auf der Tafel oder den Ideen abgehakt wird, steht hier." />;
  return (
    <>
      {monate.map((m) => (
        <section key={m.monat} className="aufgaben-gruppe">
          <h2 className="aufgaben-gruppenkopf">
            {m.titel}
            <span className="zahl">{m.aufgaben.length}</span>
          </h2>
          <ul className="aufgabenliste">
            {m.aufgaben.map((a) => (
              <Zeile key={a.id} aufgabe={a} {...rest} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Eine Zeile für alle drei Reiter — sie liest an `ist_idee` und `erledigt`
 * ab, wo sie steht. Eine zweite Zeilenkomponente daneben ginge beim nächsten
 * neuen Feld auseinander.
 */
function Zeile({
  aufgabe,
  ich,
  personen,
  darfSchreiben,
  speichern,
  offen,
  setOffen,
  filter,
}: Omit<Listenteile, "aufgaben"> & { aufgabe: Aufgabe }) {
  const auf = offen === aufgabe.id;
  const haken = aufgabe.ist_idee
    ? { zurueck: "Wieder auf die Ideenliste", weg: "Vom Tisch" }
    : { zurueck: "Wieder offen", weg: "Erledigt" };

  /* Die Kürzel stehen nur dort, wo sie etwas sagen: bei „Alle" jede Person,
     sonst die, die **außer** der gefilterten noch dabei sind. Unter „Meine"
     stünde sonst an jeder Zeile das eigene Kürzel. */
  const gefiltert = filter === "ich" ? ich.id : typeof filter === "number" ? filter : null;
  const zeigen = aufgabe.personen
    .filter((id) => id !== gefiltert)
    .map((id) => personen.find((p) => p.id === id));

  async function abhaken() {
    await speichern(aufgabe, { erledigt: !aufgabe.erledigt });
    if (!aufgabe.erledigt) melden("gut", `„${aufgabe.text}“ steht jetzt im Archiv.`);
  }

  return (
    <>
      <li
        className="aufgabe"
        data-prio={aufgabe.prioritaet}
        data-erledigt={aufgabe.erledigt ? "ja" : "nein"}
        data-auf={auf ? "ja" : "nein"}
      >
        <button
          type="button"
          className="aufgabe-haken"
          disabled={!darfSchreiben}
          aria-pressed={aufgabe.erledigt}
          aria-label={`${aufgabe.erledigt ? haken.zurueck : haken.weg}: ${aufgabe.text}`}
          title={aufgabe.erledigt ? haken.zurueck : haken.weg}
          onClick={abhaken}
        >
          <i>
            <Zeichen name="haken" />
          </i>
        </button>

        {/* Die ganze Zeile ist der Griff zum Aufklappen, nicht nur der Text —
            am Daumen trifft man eine Zeile, kein Wort. Erledigtes klappt
            nicht auf: Wer daran etwas ändern will, holt es erst zurück. */}
        <button
          type="button"
          className="aufgabe-text"
          disabled={!darfSchreiben || aufgabe.erledigt}
          aria-expanded={auf}
          onClick={() => setOffen(auf ? null : aufgabe.id)}
        >
          <span className="aufgabe-wort">{aufgabe.text}</span>
          <span className="aufgabe-meta">
            {aufgabe.ist_idee && aufgabe.erledigt && <span className="aufgabe-marke">Idee</span>}
            {aufgabe.prioritaet !== "mittel" && (
              <span className="aufgabe-marke" data-prio={aufgabe.prioritaet}>
                {prioritaetstext(aufgabe.prioritaet)}
              </span>
            )}
            {/* Die Frist nur, solange die Aufgabe offen ist: „3 Tage drüber"
                an etwas Erledigtem wäre ein Alarm, der nichts mehr bedeutet. */}
            {aufgabe.frist && !aufgabe.erledigt && !aufgabe.ist_idee && <Frist frist={aufgabe.frist} />}
            {zeigen.map((p, i) => (
              <Kuerzel key={p?.id ?? i} person={p} />
            ))}
          </span>
        </button>

        {/* „Auf die Tafel": derselbe Datensatz zieht um. Kein Abtippen, keine
            neue Kennung — und im Änderungsprotokoll bleibt stehen, wer das
            entschieden hat. Er landet bei „Allgemein"; wer ihn übernimmt,
            trägt sich ein. */}
        {aufgabe.ist_idee && !aufgabe.erledigt && (
          <button
            type="button"
            className="mini idee-uebernehmen"
            disabled={!darfSchreiben}
            onClick={async () => {
              await speichern(aufgabe, { ist_idee: false, personen: [] });
              melden("gut", `„${aufgabe.text}“ steht jetzt auf der Tafel unter „Allgemein“.`);
            }}
          >
            Auf die Tafel
            <Zeichen name="zeiger" />
          </button>
        )}
      </li>

      {auf && (
        <Zeilenmenue
          aufgabe={aufgabe}
          ich={ich.id}
          personen={personen}
          filter={filter}
          speichern={speichern}
          schliessen={() => setOffen(null)}
        />
      )}
    </>
  );
}

function Frist({ frist }: { frist: string }) {
  const { text, drueber } = fristText(frist);
  const heute = frist === datumIn(0);
  return (
    <span className="aufgabe-frist" data-lage={drueber ? "drueber" : heute ? "heute" : "spaeter"}>
      {text}
    </span>
  );
}

/**
 * Die aufgeklappte Zeile: Text, Priorität, Personen, Frist. Jeder Knopf
 * speichert sofort. Der Text erst beim Verlassen des Feldes oder mit Enter —
 * jeder Buchstabe ein eigener Protokolleintrag wäre keiner mehr, den man liest.
 */
function Zeilenmenue({
  aufgabe,
  ich,
  personen,
  filter,
  speichern,
  schliessen,
}: {
  aufgabe: Aufgabe;
  ich: number;
  personen: Teammitglied[];
  filter: Filter;
  speichern: Speichern;
  schliessen: () => void;
}) {
  const [text, setText] = useState(aufgabe.text);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [schliessen]);

  function textSichern() {
    const sauber = text.trim();
    if (sauber && sauber !== aufgabe.text) void speichern(aufgabe, { text: sauber });
    if (!sauber) setText(aufgabe.text);
  }

  async function personenAendern(neu: number[]) {
    await speichern(aufgabe, { personen: neu });
    // Fällt die Zeile damit aus dem Filter, verschwindet sie aus der Liste.
    // Ohne Satz dazu sähe das aus wie verloren.
    if (!gehoertZu({ ...aufgabe, personen: neu }, filter, ich)) {
      schliessen();
      const namen = neu.map((id) => personen.find((p) => p.id === id)).filter(Boolean) as Teammitglied[];
      melden("gut", `„${aufgabe.text}“ steht jetzt bei ${namen.length ? namen.map(vorname).join(" und ") : "Allgemein"}.`);
    }
  }

  return (
    <li className="aufgabe-menue">
      <input
        className="feld aufgabe-menue-text"
        value={text}
        maxLength={250}
        aria-label={aufgabe.ist_idee ? "Idee" : "Aufgabe"}
        onChange={(e) => setText(e.target.value)}
        onBlur={textSichern}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            textSichern();
            schliessen();
          }
        }}
      />

      <div className="aufgaben-reihe">
        <span className="beschriftung-klein">Priorität</span>
        <div className="spannenwahl" role="group" aria-label="Priorität">
          {PRIORITAETEN.map((p) => (
            <button
              key={p.wert}
              type="button"
              aria-pressed={aufgabe.prioritaet === p.wert}
              onClick={() => speichern(aufgabe, { prioritaet: p.wert })}
            >
              {p.text}
            </button>
          ))}
        </div>
      </div>

      {/* Personen und Frist nur auf der Tafel. Eine Idee gehört niemandem,
          und eine Idee, die bis zu einem Tag entschieden sein muss, ist schon
          eine Aufgabe. */}
      {!aufgabe.ist_idee && (
        <>
          <div className="aufgaben-reihe">
            <span className="beschriftung-klein">Für</span>
            <Personenwahl personen={personen} ich={ich} gewaehlt={aufgabe.personen} aendern={personenAendern} />
          </div>
          <div className="aufgaben-reihe">
            <span className="beschriftung-klein">Frist</span>
            <Fristwahl frist={aufgabe.frist} aendern={(frist) => speichern(aufgabe, { frist })} mitDatum />
          </div>
        </>
      )}

      <div className="aufgabe-menue-fuss">
        {!aufgabe.ist_idee && (
          <button
            type="button"
            className="knopf-still"
            onClick={async () => {
              schliessen();
              await speichern(aufgabe, { ist_idee: true });
              melden("gut", `„${aufgabe.text}“ steht wieder auf der Ideenliste.`);
            }}
          >
            Zurück auf die Ideenliste
          </button>
        )}
        <button type="button" className="knopf" onClick={schliessen}>
          Fertig
        </button>
      </div>
    </li>
  );
}
