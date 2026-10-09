/**
 * Module: zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben.
 *
 * `/module` ist die Übersicht aller Module, `/module/praktikum` die
 * Praktikantenstellen (in `Praktikum.tsx`), `/module/thoughts` und
 * `/module/foerderungen` je eine eigene Seite.
 */

import { useFoerderungen, useLagekarte, usePraktikumsthemen, type Ich } from "../basis/daten";
import {
  MODULE,
  themenZahl,
  teilZuWeg,
  themaAusWeg,
  foerderauslastungAusWeg,
  foerderungAusWeg,
  type Foerderteil,
  type Kartenteil,
  type Modul,
  type Teil,
  type Themenliste,
} from "../basis/module";
import type { Seite } from "../basis/router";
import { Zeichen } from "../bausteine/Zeichen";
import { Thoughts } from "./Thoughts";
import { Praktikum, Themenseite } from "./Praktikum";
import { Foerderauslastung } from "./Foerderauslastung";
import { Antragsseite, Foerderungen, Geberseite, Programmseite } from "./Foerderungen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

export function Module({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: Wechseln;
}) {
  const thema = themaAusWeg(unter);
  if (thema) return <Themenseite key={thema.id} ich={ich} id={thema.id} teil={thema.teil} wechseln={wechseln} />;
  if (foerderauslastungAusWeg(unter)) return <Foerderauslastung ich={ich} wechseln={wechseln} />;
  const foerderung = foerderungAusWeg(unter);
  if (foerderung?.antrag)
    return <Antragsseite key={foerderung.antrag} ich={ich} id={foerderung.antrag} wechseln={wechseln} />;
  if (foerderung?.programm)
    return <Programmseite key={foerderung.programm} ich={ich} id={foerderung.programm} wechseln={wechseln} />;
  if (foerderung) return <Geberseite key={foerderung.geber} ich={ich} id={foerderung.geber} wechseln={wechseln} />;
  const treffer = teilZuWeg(unter);
  if (!treffer) return <Uebersicht wechseln={wechseln} />;
  const { modul, teil } = treffer;
  if (teil.schluessel === "thoughts") return <Thoughts ich={ich} wechseln={wechseln} />;
  if (teil.schluessel === "foerderung") return <Foerderungen ich={ich} wechseln={wechseln} />;
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
              ) : teil.schluessel === "thoughts" ? (
                <Kartenzeile key={teil.weg} teil={teil} stelle={i} wechseln={wechseln} />
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
  const zahl = themen.data?.filter((t) => t.art === teil.art).length;
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
