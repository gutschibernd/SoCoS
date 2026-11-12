/**
 * Module: zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben.
 *
 * `/module` ist die Übersicht aller Module, `/module/praktikanten` der
 * Einstieg der Praktikanten mit einer Kachel je Teil — die Haupt-Aufgaben
 * und Ideen in `Praktikum.tsx`, die To-Dos in `Todos.tsx` —, `/module/thoughts`,
 * `/module/foerderungen` und `/module/design` je eine
 * eigene Seite.
 */

import {
  useDesignentscheidungen,
  useFoerderungen,
  useLagekarte,
  useLieferanten,
  useNebenaufgaben,
  usePraktikumsthemen,
  useRunway,
  type Ich,
} from "../basis/daten";
import {
  MODULE,
  designAusWeg,
  einstiegAusWeg,
  entscheidungsZahl,
  themenZahl,
  todoZahl,
  teilZuWeg,
  themaAusWeg,
  foerderauslastungAusWeg,
  foerderbisherAusWeg,
  foerderplanungAusWeg,
  foerderungAusWeg,
  lieferantAusWeg,
  type Bestellteil,
  type Designteil,
  type Foerderteil,
  type Runwayteil,
  type Kartenteil,
  type Modul,
  type Teil,
  type Themenliste,
  type Todoteil,
} from "../basis/module";
import type { Wechseln } from "../basis/router";
import { Zeichen } from "../bausteine/Zeichen";
import { Thoughts } from "./Thoughts";
import { Praktikum, Themenseite } from "./Praktikum";
import { Todos } from "./Todos";
import { Foerderauslastung } from "./Foerderauslastung";
import { Bisherseite } from "./Bisher";
import { Foerderplanung } from "./Foerderplanung";
import { Antragsseite, Foerderungen, Geberseite, Programmseite } from "./Foerderungen";
import { Runway } from "./Runway";
import { Designliste, Entscheidungsseite } from "./Design";
import { Lieferantenliste, Lieferantenseite } from "./Bestellungen";
import { Achse } from "../basis/runway";

export function Module({
  ich,
  unter,
  wechseln,
  zurueck,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: Wechseln;
  /** Nach dem Entfernen einer Einzelseite: dorthin, woher man kam. */
  zurueck: () => void;
}) {
  const thema = themaAusWeg(unter);
  if (thema) return <Themenseite key={thema.id} ich={ich} id={thema.id} teil={thema.teil} wechseln={wechseln} zurueck={zurueck} />;
  if (foerderauslastungAusWeg(unter)) return <Foerderauslastung ich={ich} wechseln={wechseln} />;
  if (foerderplanungAusWeg(unter)) return <Foerderplanung ich={ich} wechseln={wechseln} />;
  if (foerderbisherAusWeg(unter)) return <Bisherseite />;
  const entscheidung = designAusWeg(unter);
  if (entscheidung)
    return <Entscheidungsseite key={entscheidung.id} ich={ich} id={entscheidung.id} wechseln={wechseln} zurueck={zurueck} />;
  const lieferant = lieferantAusWeg(unter);
  if (lieferant) return <Lieferantenseite key={lieferant.id} ich={ich} id={lieferant.id} zurueck={zurueck} />;
  const foerderung = foerderungAusWeg(unter);
  if (foerderung?.antrag)
    return <Antragsseite key={foerderung.antrag} ich={ich} id={foerderung.antrag} wechseln={wechseln} zurueck={zurueck} />;
  if (foerderung?.programm)
    return <Programmseite key={foerderung.programm} ich={ich} id={foerderung.programm} wechseln={wechseln} />;
  if (foerderung) return <Geberseite key={foerderung.geber} ich={ich} id={foerderung.geber} wechseln={wechseln} />;
  const einstieg = einstiegAusWeg(unter);
  if (einstieg) return <Einstieg modul={einstieg.modul} wechseln={wechseln} />;
  const treffer = teilZuWeg(unter);
  if (!treffer) return <Uebersicht wechseln={wechseln} />;
  const { modul, teil } = treffer;
  if (teil.schluessel === "thoughts") return <Thoughts ich={ich} wechseln={wechseln} />;
  if (teil.schluessel === "foerderung") return <Foerderungen ich={ich} wechseln={wechseln} />;
  if (teil.schluessel === "runway") return <Runway ich={ich} />;
  if (teil.schluessel === "design") return <Designliste ich={ich} wechseln={wechseln} />;
  if (teil.schluessel === "bestellungen") return <Lieferantenliste ich={ich} wechseln={wechseln} />;
  if (teil.schluessel === "todos")
    return <Todos ich={ich} umschalter={<Teilwahl modul={modul} teil={teil} wechseln={wechseln} />} />;
  return (
    <Praktikum
      key={teil.weg}
      ich={ich}
      teil={teil}
      umschalter={<Teilwahl modul={modul} teil={teil} wechseln={wechseln} />}
      wechseln={wechseln}
    />
  );
}

/* --- Die Übersicht -------------------------------------------------------- */

function Uebersicht({ wechseln }: { wechseln: Wechseln }) {
  // Die Übersicht wartet auf nichts: Die Kacheln stehen sofort, nur der Stand
  // in den Zeilen kommt nach. Eine Seite mit Werkzeugen darf nicht „Wird
  // geladen …" sagen, bloß weil eine Zahl fehlt.
  return (
    <div className="modul-kacheln">
      {/* Die Kachel selbst ist kein Link, weil ein Modul mehrere Teile haben
          kann: Jede Zeile führt zu ihrem Teil, und ein Link in einem Link geht
          nicht. Der Kopf führt zum ersten. */}
      {MODULE.map((m) => (
        <div key={m.weg} className="modul-kachel">
          <a
            className="modul-kopf"
            href={`/module/${m.weg}`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", m.weg);
            }}
          >
            <i className="modul-siegel">
              <Zeichen name={m.zeichen} />
            </i>
            <span>
              <b>{m.titel}</b>
              <em>{m.wozu}</em>
            </span>
          </a>
          <ul className="modul-teile">
            {m.teile.map((teil, i) =>
              teil.schluessel === "praktikum" ? (
                <Themenzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : teil.schluessel === "todos" ? (
                <Todozeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : teil.schluessel === "thoughts" ? (
                <Kartenzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : teil.schluessel === "runway" ? (
                <Runwayzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : teil.schluessel === "design" ? (
                <Designzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : teil.schluessel === "bestellungen" ? (
                <Bestellzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ) : (
                <Foerderzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
              ),
            )}
          </ul>
        </div>
      ))}

      {/* Neue Module entstehen im Code, nicht in der Oberfläche. Die Kachel
          sagt, wo man eines bestellt — sonst steht neben einem einzigen
          Werkzeug eine leere Fläche, die nach einem Fehler aussieht. */}
      <div className="modul-wunsch">
        <b>Fehlt ein Werkzeug?</b>
        <p>Neue Module entstehen auf Zuruf.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("rueckmeldungen")}>
          Unter Wünsche &amp; Fehler melden
        </button>
      </div>
    </div>
  );
}

/* --- Der Einstieg eines Moduls mit mehreren Teilen ------------------------ */

/**
 * Eine große Kachel je Teil — die ganze Kachel ist der Link. Bernd,
 * 2026-11-09: „drei große Kacheln, die man auswählen kann". Wie die
 * Übersicht wartet der Einstieg auf nichts; nur die Zahl kommt nach.
 */
function Einstieg({ modul, wechseln }: { modul: Modul; wechseln: Wechseln }) {
  return (
    <div className="einstieg-kacheln">
      {modul.teile.map((teil) =>
        teil.schluessel === "praktikum" || teil.schluessel === "todos" ? (
          <a
            key={teil.weg}
            className="einstieg-kachel"
            href={`/module/${teil.weg}`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", teil.weg);
            }}
          >
            <i className="modul-siegel">
              <Zeichen name={teil.schluessel === "todos" ? "haken" : teil.art === "idee" ? "idee" : "mappe"} />
            </i>
            <b>{teil.titel}</b>
            <em>{teil.wozu}</em>
            <span className="einstieg-fuss">
              {teil.schluessel === "todos" ? <TodoStand /> : <ThemenStand teil={teil} />}
              <Zeichen name="zeiger" klasse="modul-zeiger" />
            </span>
          </a>
        ) : null,
      )}
    </div>
  );
}

function ThemenStand({ teil }: { teil: Themenliste }) {
  const themen = usePraktikumsthemen();
  const zahl = themen.data?.filter((t) => t.art === teil.art && !t.archiviert_am).length;
  return <span className="modul-stand">{zahl === undefined ? "" : themenZahl(zahl, teil.art)}</span>;
}

function TodoStand() {
  const todos = useNebenaufgaben();
  const zahl = todos.data?.filter((t) => !t.erledigt_am).length;
  return <span className="modul-stand">{zahl === undefined ? "" : `${todoZahl(zahl)} offen`}</span>;
}

/** Eine Zeile der Kachel für die To-Dos: wie viele noch offen sind. */
function Todozeile({ teil, stelle, wechseln }: { teil: Todoteil; stelle: number; wechseln: Wechseln }) {
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <TodoStand />
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/** Eine Zeile der Kachel für eine Themenliste: wie viele Themen es gibt. */
function Themenzeile({
  teil,
  stelle,
  wechseln,
}: {
  teil: Themenliste;
  stelle: number;
  wechseln: Wechseln;
}) {
  const themen = usePraktikumsthemen();
  const zahl = themen.data?.filter((t) => t.art === teil.art && !t.archiviert_am).length;
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">
          {zahl === undefined ? "" : themenZahl(zahl, teil.art)}
        </span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/** Eine Zeile der Kachel für Thoughts: wie viele Themen, wie viel noch offen ist. */
function Kartenzeile({ teil, stelle, wechseln }: { teil: Kartenteil; stelle: number; wechseln: Wechseln }) {
  const karte = useLagekarte();
  const stand = karte.data
    ? `${karte.data.themen.length} ${karte.data.themen.length === 1 ? "Thema" : "Themen"} · ${
        karte.data.schritte.filter((x) => x.status === "offen").length
      } offen`
    : "";
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/** Eine Zeile der Kachel für die Bestellungen: bei wie vielen Lieferanten etwas im Korb liegt. */
function Bestellzeile({ teil, stelle, wechseln }: { teil: Bestellteil; stelle: number; wechseln: Wechseln }) {
  const lieferanten = useLieferanten();
  const voll = lieferanten.data?.filter((l) => l.im_korb > 0).length;
  const stand =
    voll === undefined ? "" : voll === 0 ? "alle Körbe leer" : `${voll} ${voll === 1 ? "Korb" : "Körbe"} mit Inhalt`;
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/** Eine Zeile der Kachel für die Förderungen: wie viele Anträge, wie viele Fragen offen. */
function Foerderzeile({ teil, stelle, wechseln }: { teil: Foerderteil; stelle: number; wechseln: Wechseln }) {
  const programme = useFoerderungen();
  const antraege = programme.data?.reduce((n, p) => n + p.antraege.length, 0);
  const offen = programme.data?.reduce((n, p) => n + p.fragen.filter((f) => !f.beantwortet).length, 0);
  const stand =
    antraege === undefined
      ? ""
      : `${antraege} ${antraege === 1 ? "Antrag" : "Anträge"}${offen ? ` · ${offen} ${offen === 1 ? "Frage" : "Fragen"} offen` : ""}`;
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/**
 * Die Teile eines Moduls als Umschalter — dieselbe Form wie die Zeitraumwahl:
 * ein Zustand, mehrere Werte, einer gilt.
 */
function Teilwahl({ modul, teil, wechseln }: { modul: Modul; teil: Teil; wechseln: Wechseln }) {
  return (
    <div className="spannenwahl workshopwahl" role="group" aria-label={modul.titel}>
      {modul.teile.map((t, i) => (
        <button
          key={t.weg}
          type="button"
          aria-pressed={t.weg === teil.weg}
          onClick={() => wechseln("module", t.weg)}
        >
          <span className="zahl">{String(i + 1).padStart(2, "0")}</span>
          {t.titel}
        </button>
      ))}
    </div>
  );
}

/**
 * Eine Zeile der Kachel für die Runway-Planung: ab wann das Konto im Minus ist
 * — im Basis-Szenario, demselben, mit dem die Seite aufgeht.
 */
function Runwayzeile({ teil, stelle, wechseln }: { teil: Runwayteil; stelle: number; wechseln: Wechseln }) {
  const runway = useRunway("basis");
  const d = runway.data;
  const stand = !d
    ? ""
    : d.rechnung.leer
      ? "noch kein Plan"
      : d.rechnung.kpi.neg !== null
        ? `Minus ab ${new Achse(d.plan.settings.start).labL(d.rechnung.kpi.neg)}`
        : "durchfinanziert";
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/** Eine Zeile der Kachel für die Designentscheidungen: wie viele, wie viele davon Entwurf. */
function Designzeile({ teil, stelle, wechseln }: { teil: Designteil; stelle: number; wechseln: Wechseln }) {
  const liste = useDesignentscheidungen();
  const d = liste.data;
  const entwuerfe = d?.filter((e) => e.stand === "entwurf").length ?? 0;
  const stand = !d ? "" : `${entscheidungsZahl(d.length)}${entwuerfe ? ` · ${entwuerfe} ${entwuerfe === 1 ? "Entwurf" : "Entwürfe"}` : ""}`;
  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}
