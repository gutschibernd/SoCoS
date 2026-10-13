/**
 * Module · Projektplanung: eine Projektphase mit ihren Paketen und Aufgaben im
 * Gantt — und, wenn die Phase aus einem Förderantrag bezahlt wird, der Antrag
 * als Maßstab daneben.
 *
 * `/module/planung` listet die Phasen, `/module/planung/28` plant eine. Von der
 * Projektseite führt der Knopf „Planung" an jeder Phase hierher.
 *
 * **Was die Seite beantwortet, von oben nach unten:** Wo stehen wir (Soll aus
 * dem Antrag, gebucht, was bis heute gearbeitet sein sollte)? Was ist als
 * Nächstes dran? Wie liegt der Plan in der Zeit? Und je Paket: was der Antrag
 * verspricht, wer wie viel gebucht hat, welche Aufgaben es gibt.
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
  type Antragspaket,
  type Ich,
  type Planung,
  type Planungsaufgabe,
  type Planungspaket,
} from "../basis/daten";
import { antragsstandText } from "../basis/foerderungen";
import { monatsText, plusTage, zeitraumText } from "../basis/gantt";
import { aufgabenImPlan, alsH, lageText, standGegenPlan, startOffen, stundenAusEingabe } from "../basis/planung";
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

/** Speichern, danach alles neu holen — Soll, Lage und „Als Nächstes" rechnet der Server. */
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

function Planungsinhalt({ planung, ich, wechseln }: { planung: Planung; ich: Ich; wechseln: Wechseln }) {
  const antragspakete = new Map((planung.antrag?.pakete ?? []).map((p) => [p.id, p]));
  // Aufgeklappt heißt: im Gantt mit seinen Aufgaben und unten mit seiner
  // Karte. Ein Zustand für beide — sonst sucht man unten die Karte zu dem
  // Paket, das man oben gerade aufgemacht hat.
  const [offen, setOffen] = useState<Set<number>>(() => startOffen(planung.pakete, antragspakete, planung.heute));
  const umschalten = (paket: number) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(paket)) neu.delete(paket);
      else neu.add(paket);
      return neu;
    });

  return (
    <div className="pl-seite">
      <Kopf planung={planung} ich={ich} wechseln={wechseln} />
      <Naechstes planung={planung} darf={ich.darf.bearbeiten} />
      <Plan planung={planung} darf={ich.darf.bearbeiten} offen={offen} umschalten={umschalten} setOffen={setOffen} />
      {planung.pakete.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was="Diese Phase hat noch keine Arbeitspakete"
            satz="Pakete legt man auf der Projektseite unter „Bearbeiten“ an — hier bekommen sie dann Aufgaben."
            aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt", "bearbeiten") }}
          />
        </div>
      ) : (
        // Alle Pakete, zugeklappte als eine Zeile: Stünden nur die offenen
        // hier, fehlten genau die, die erst anfangen — und mit ihnen das Feld
        // für ihre erste Aufgabe.
        planung.pakete.map((p, i) => (
          <Paketkarte
            key={p.id}
            paket={p}
            nummer={i + 1}
            planung={planung}
            antragspaket={p.foerderpaket === null ? undefined : antragspakete.get(p.foerderpaket)}
            ich={ich}
            offen={offen.has(p.id)}
            umschalten={() => umschalten(p.id)}
          />
        ))
      )}
      {planung.antrag && <Ziele planung={planung} />}
    </div>
  );
}

/* --- Kopf: Phase, Antrag, Kennzahlen ---------------------------------------- */

function Kopf({ planung, ich, wechseln }: { planung: Planung; ich: Ich; wechseln: Wechseln }) {
  const { phase, antrag, summen } = planung;
  const speichern = useSpeichern();
  const programme = useFoerderungen();
  const [fehler, setFehler] = useState("");
  const antragsweg = antrag && `foerderungen/${antrag.geber}/${antrag.programm}/${antrag.id}`;
  const stand = standGegenPlan(summen.gebucht, summen.soll_bis_heute);
  const anteil = Number(summen.soll) > 0 ? Math.round((100 * Number(summen.gebucht)) / Number(summen.soll)) : null;

  return (
    <section className="karte pl-kopf">
      <div className="pl-kopfzeile">
        <div>
          <h2>{phase.titel}</h2>
          <div className="pl-leise">
            <a
              href={alsPfad("projekt", null)}
              onClick={(e) => {
                e.preventDefault();
                wechseln("projekt");
              }}
            >
              {phase.projekt_titel}
            </a>
            {" · "}
            <span className="zahl">{zeitraumText(phase.von, phase.bis)}</span>
          </div>
        </div>
        <div className="pl-antrag">
          <span className="beschriftung-klein">Bezahlt aus</span>
          {ich.darf.bearbeiten ? (
            <select
              className="feld"
              value={phase.foerderantrag ?? ""}
              aria-label="Förderantrag der Phase"
              onChange={async (e) => {
                setFehler("");
                try {
                  await speichern(`/phasen/${phase.id}/`, {
                    foerderantrag: e.target.value === "" ? null : Number(e.target.value),
                  });
                } catch (err) {
                  setFehler(fehlertext(err));
                }
              }}
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
          {antrag && antragsweg && (
            <a
              className="pl-leise"
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
          <Fehlerzeile text={fehler} />
        </div>
      </div>

      <div className="pl-kennzahlen">
        <div className="kennzahl">
          <div className="beschriftung">{antrag ? "Laut Antrag" : "Pensum"}</div>
          <div className="wert">{alsH(summen.soll, 0)}</div>
          <div className="hinweis">so viel wird auf die Pakete gebucht</div>
        </div>
        <div className="kennzahl">
          <div className="beschriftung">Gebucht</div>
          <div className="wert">{alsH(summen.gebucht, 0)}</div>
          <div className="hinweis">{anteil === null ? "ohne Soll" : `${anteil} % des Solls`}</div>
        </div>
        <div className="kennzahl">
          <div className="beschriftung">Soll bis heute</div>
          <div className="wert">{alsH(summen.soll_bis_heute, 0)}</div>
          <div className="hinweis">{stand ?? "braucht Monate aus dem Antrag"}</div>
        </div>
        <div className="kennzahl">
          <div className="beschriftung">Aufgaben</div>
          <div className="wert">
            {summen.erledigt}/{summen.aufgaben}
          </div>
          <div className="hinweis">
            {alsH(summen.aufgaben_stunden, 0)} geplant
            {summen.ohne_termin > 0 && ` · ${summen.ohne_termin} ohne Termin`}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --- Als Nächstes ----------------------------------------------------------- */

function Naechstes({ planung, darf }: { planung: Planung; darf: boolean }) {
  const speichern = useSpeichern();
  const aufgaben = new Map(planung.pakete.flatMap((p, i) => p.aufgaben.map((a) => [a.id, { a, p, nr: i + 1 }] as const)));
  const reihe = planung.naechste.map((id) => aufgaben.get(id)).filter((x) => x !== undefined);

  return (
    <section className="karte pl-naechstes">
      <h2>Als Nächstes</h2>
      {reihe.length === 0 ? (
        <Leerstelle
          was={planung.summen.aufgaben === 0 ? "Noch keine Aufgaben geplant" : "Nichts mit Termin offen"}
          satz={
            planung.summen.aufgaben === 0
              ? "Ein Paket aufklappen und darin Aufgaben anlegen — mit Zeitraum stehen sie hier, sobald sie dran sind."
              : planung.summen.ohne_termin > 0
                ? `${planung.summen.ohne_termin} Aufgaben haben noch keinen Zeitraum. Im Gantt in ihre Zeile klicken setzt einen.`
                : "Alles mit Termin ist erledigt."
          }
        />
      ) : (
        <ul>
          {reihe.map(({ a, p, nr }) => (
            <li key={a.id} data-lage={a.lage}>
              <input
                type="checkbox"
                checked={a.erledigt}
                disabled={!darf}
                aria-label={`„${a.titel}“ erledigt`}
                onChange={(e) => speichern(`/unteraufgaben/${a.id}/`, { erledigt: e.target.checked })}
              />
              <span className="pl-naechstes-text">
                <b>{a.titel}</b>
                <em>
                  {String(nr).padStart(2, "0")} · {p.titel}
                </em>
              </span>
              {a.verantwortlich_name && <span className="pl-person">{a.verantwortlich_name}</span>}
              <span className="pl-lage zahl">{lageText(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --- Der Gantt ---------------------------------------------------------------- */

function Plan({
  planung,
  darf,
  offen,
  umschalten,
  setOffen,
}: {
  planung: Planung;
  darf: boolean;
  offen: Set<number>;
  umschalten: (paket: number) => void;
  setOffen: (offen: Set<number>) => void;
}) {
  const speichern = useSpeichern();
  const antragspakete = new Map((planung.antrag?.pakete ?? []).map((p) => [p.id, p]));
  const alleOffen = planung.pakete.length > 0 && planung.pakete.every((p) => offen.has(p.id));

  if (planung.pakete.length === 0) return null;
  return (
    <section className="karte pl-plan">
      <div className="pl-kartenkopf">
        <h2>Plan</h2>
        <span className="pl-leise">
          {darf ? "Aufgaben ziehen verschiebt, Ränder ziehen verlängert" : `${planung.pakete.length} Pakete`}
        </span>
        <button
          type="button"
          className="knopf-still"
          onClick={() => setOffen(new Set(alleOffen ? [] : planung.pakete.map((p) => p.id)))}
        >
          {alleOffen ? "Alle zuklappen" : "Alle aufklappen"}
        </button>
      </div>
      <Gantt achse={planung.achse} heute={planung.heute} etikett="Paket und Aufgabe" rechts="Stunden">
        {planung.pakete.map((p, i) => {
          const ap = p.foerderpaket === null ? undefined : antragspakete.get(p.foerderpaket);
          const istOffen = offen.has(p.id);
          return [
            <GanttZeile
              key={`p${p.id}`}
              art="paket"
              gewaehlt={istOffen}
              etikett={
                <button type="button" className="gantt-wahl" aria-expanded={istOffen} onClick={() => umschalten(p.id)}>
                  <b>
                    <span className="zahl pl-nr">{String(i + 1).padStart(2, "0")}</span> {p.titel}
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
            ...(istOffen
              ? aufgabenImPlan(p.aufgaben).map((a) => (
                  <Aufgabenzeile key={`a${a.id}`} aufgabe={a} darf={darf} speichern={speichern} />
                ))
              : []),
          ];
        })}
      </Gantt>
      <ul className="legende pl-legende" aria-label="Legende">
        <li>
          <i data-muster="antrag" /> laut Antrag
        </li>
        <li>
          <i data-muster="plan" /> Aufgaben eines Pakets
        </li>
        <li>
          <i data-muster="ueberfaellig" /> überfällig
        </li>
        <li>
          <i data-muster="erledigt" /> erledigt
        </li>
      </ul>
    </section>
  );
}

function Aufgabenzeile({
  aufgabe,
  darf,
  speichern,
}: {
  aufgabe: Planungsaufgabe;
  darf: boolean;
  speichern: (pfad: string, daten: Record<string, unknown>) => Promise<void>;
}) {
  const a = aufgabe;
  return (
    <GanttZeile
      art="aufgabe"
      setzen={
        darf && !a.von
          ? (tag) => speichern(`/unteraufgaben/${a.id}/`, { von: tag, bis: plusTage(tag, NEUE_AUFGABE_TAGE - 1) })
          : undefined
      }
      etikett={
        <label className="pl-aufgabe" data-erledigt={a.erledigt || undefined}>
          <input
            type="checkbox"
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
      rechts={<span className="zahl pl-leise">{a.stunden === null ? "" : alsH(a.stunden)}</span>}
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

/**
 * Gebucht gegen Soll, mit einem Strich, wo man laut Antrag heute stehen
 * sollte. Über 100 % läuft der Balken voll und wechselt die Farbe, wie auf
 * der Projektseite.
 */
function Stundenstand({ gebucht, soll, sollBisHeute }: { gebucht: string; soll: string; sollBisHeute: string | null }) {
  const s = Number(soll);
  const anteil = s > 0 ? (100 * Number(gebucht)) / s : null;
  return (
    <>
      <span className="zahl">
        {Number(gebucht).toLocaleString("de-AT", { maximumFractionDigits: 0 })} / {alsH(soll)}
      </span>
      {anteil !== null && (
        <span className="balken pl-balken" data-ueber={anteil > 100 ? "ja" : "nein"}>
          <i style={{ width: `${Math.min(100, anteil)}%` }} />
          {sollBisHeute !== null && (
            <b
              className="pl-sollstrich"
              style={{ left: `${Math.min(100, (100 * Number(sollBisHeute)) / s)}%` }}
              title={`Soll bis heute: ${alsH(sollBisHeute)}`}
            />
          )}
        </span>
      )}
    </>
  );
}

/* --- Ein Paket im Einzelnen ------------------------------------------------- */

function Paketkarte({
  paket,
  nummer,
  planung,
  antragspaket,
  ich,
  offen,
  umschalten,
}: {
  paket: Planungspaket;
  nummer: number;
  planung: Planung;
  antragspaket: Antragspaket | undefined;
  ich: Ich;
  offen: boolean;
  umschalten: () => void;
}) {
  const speichern = useSpeichern();
  const team = useTeam();
  const darf = ich.darf.bearbeiten;
  const [neu, setNeu] = useState("");
  const [fehler, setFehler] = useState("");
  const [loeschen, setLoeschen] = useState<Planungsaufgabe | null>(null);
  const aktive = (team.data ?? []).filter((t) => t.is_active);

  async function versuchen(tun: () => Promise<void>) {
    setFehler("");
    try {
      await tun();
    } catch (e) {
      setFehler(fehlertext(e));
    }
  }

  async function dazu() {
    const titel = neu.trim();
    if (!titel) return;
    // Sofort leeren, nicht erst nach dem Speichern: Wer gleich die nächste
    // Aufgabe tippt, schriebe sonst hinter die erste, und beide landeten als
    // eine auf dem Server.
    setNeu("");
    setFehler("");
    try {
      await speichern(
        "/unteraufgaben/",
        { paket: paket.id, titel, reihenfolge: Math.max(0, ...paket.aufgaben.map((a) => a.reihenfolge)) + 1 },
        "POST",
      );
    } catch (e) {
      setNeu(titel);
      setFehler(fehlertext(e));
    }
  }

  const kopf = (
    <div className="pl-kartenkopf">
      <h2>
        <span className="zahl pl-nr">{String(nummer).padStart(2, "0")}</span> {paket.titel}
      </h2>
      {!offen && (
        <span className="pl-leise">
          {paket.aufgaben.length} {paket.aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"}
        </span>
      )}
      <button type="button" className="knopf-still" aria-expanded={offen} onClick={umschalten}>
        {offen ? "Zuklappen" : "Aufklappen"}
      </button>
    </div>
  );

  if (!offen) {
    return (
      <section className="karte pl-paket" id={`pl-paket-${paket.id}`} data-zu="">
        {kopf}
      </section>
    );
  }

  return (
    <section className="karte pl-paket" id={`pl-paket-${paket.id}`}>
      {kopf}

      <div className="pl-paketraster">
        <div className="pl-antragsteil">
          <span className="beschriftung-klein">Im Antrag</span>
          {planung.antrag && darf ? (
            <select
              className="feld"
              value={paket.foerderpaket ?? ""}
              aria-label={`Antragspaket von ${paket.titel}`}
              onChange={(e) =>
                versuchen(() =>
                  speichern(`/pakete/${paket.id}/`, {
                    foerderpaket: e.target.value === "" ? null : Number(e.target.value),
                  }),
                )
              }
            >
              <option value="">keinem Antragspaket</option>
              {planung.antrag.pakete.map((ap) => (
                <option key={ap.id} value={ap.id}>
                  {String(ap.nummer).padStart(2, "0")} · {ap.titel}
                </option>
              ))}
            </select>
          ) : (
            <span>{antragspaket ? antragspaket.titel : planung.antrag ? "keinem Antragspaket" : "kein Antrag an der Phase"}</span>
          )}
          {antragspaket && (
            <dl className="pl-ziel">
              <div>
                <dt className="beschriftung-klein">Zeitraum</dt>
                <dd className="zahl">
                  M{antragspaket.monat_von}–M{antragspaket.monat_bis}
                  {antragspaket.von && ` · ${zeitraumText(antragspaket.von, antragspaket.bis)}`}
                </dd>
              </div>
              {antragspaket.ziel && (
                <div>
                  <dt className="beschriftung-klein">Ziel und Inhalt</dt>
                  <dd>{antragspaket.ziel}</dd>
                </div>
              )}
              {antragspaket.ergebnis && (
                <div>
                  <dt className="beschriftung-klein">Ergebnis</dt>
                  <dd>{antragspaket.ergebnis}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="pl-stundenteil">
          <span className="beschriftung-klein">
            Stunden · Soll aus {paket.soll_quelle === "antrag" ? "dem Antrag" : "dem Pensum"}
          </span>
          {paket.personen.length === 0 ? (
            <p className="pl-leise">Weder Soll noch gebuchte Zeit.</p>
          ) : (
            paket.personen.map((person) => (
              <div className="pensum-zeile" key={`${person.nutzer ?? person.name}`}>
                <span className="pensum-person">{person.name}</span>
                {person.soll !== null && Number(person.soll) > 0 ? (
                  <span className="balken" data-ueber={Number(person.gebucht) > Number(person.soll) ? "ja" : "nein"}>
                    <i style={{ width: `${Math.min(100, (100 * Number(person.gebucht)) / Number(person.soll))}%` }} />
                  </span>
                ) : (
                  <span className="pl-leise">{person.soll === null ? "nicht im Soll" : ""}</span>
                )}
                <span className="zahl pensum-zahl">
                  {alsH(person.gebucht)} / {alsH(person.soll)}
                </span>
              </div>
            ))
          )}
          <p className="pl-leise zahl">
            Aufgaben zusammen {alsH(paket.aufgaben_stunden)} von {alsH(paket.soll)}
          </p>
        </div>
      </div>

      <div className="pl-aufgaben" role="list" aria-label={`Aufgaben von ${paket.titel}`}>
        {aufgabenImPlan(paket.aufgaben).map((a) => (
          <div key={a.id} className="pl-aufgabenzeile" role="listitem" data-lage={a.lage}>
            <input
              type="checkbox"
              checked={a.erledigt}
              disabled={!darf}
              aria-label={`„${a.titel}“ erledigt`}
              onChange={(e) => versuchen(() => speichern(`/unteraufgaben/${a.id}/`, { erledigt: e.target.checked }))}
            />
            <span className="pl-aufgabentitel" data-feld="Aufgabe">
              <Feldtext
                wert={a.titel}
                aendern={darf}
                speichern={(titel) => versuchen(() => speichern(`/unteraufgaben/${a.id}/`, { titel }))}
              />
            </span>
            <span data-feld="Beginn">
              <Datumsfeld
                wert={a.von}
                darf={darf}
                beschriftung={`Beginn von ${a.titel}`}
                // Ein Beginn ohne Ende wird ein Tag; ein Beginn nach dem Ende
                // nimmt das Ende mit. Geleert wird beides — halb gibt es nicht.
                speichern={(von) =>
                  versuchen(() =>
                    speichern(
                      `/unteraufgaben/${a.id}/`,
                      von === null ? { von: null, bis: null } : { von, bis: !a.bis || a.bis < von ? von : a.bis },
                    ),
                  )
                }
              />
            </span>
            <span data-feld="Ende">
              <Datumsfeld
                wert={a.bis}
                darf={darf}
                beschriftung={`Ende von ${a.titel}`}
                speichern={(bis) =>
                  versuchen(() =>
                    speichern(
                      `/unteraufgaben/${a.id}/`,
                      bis === null ? { von: null, bis: null } : { bis, von: !a.von || a.von > bis ? bis : a.von },
                    ),
                  )
                }
              />
            </span>
            <span data-feld="Stunden">
              <Stundenfeld
                wert={a.stunden}
                darf={darf}
                titel={a.titel}
                speichern={(stunden) => versuchen(() => speichern(`/unteraufgaben/${a.id}/`, { stunden }))}
              />
            </span>
            <span data-feld="Wer">
              <select
                className="feld"
                value={a.verantwortlich ?? ""}
                disabled={!darf}
                aria-label={`Wer macht „${a.titel}“`}
                onChange={(e) =>
                  versuchen(() =>
                    speichern(`/unteraufgaben/${a.id}/`, {
                      verantwortlich: e.target.value === "" ? null : Number(e.target.value),
                    }),
                  )
                }
              >
                <option value="">—</option>
                {aktive.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.initialen || t.name}
                  </option>
                ))}
              </select>
            </span>
            {ich.darf.loeschen ? (
              <button type="button" className="mini" aria-label={`„${a.titel}“ entfernen`} onClick={() => setLoeschen(a)}>
                <Zeichen name="kreuz" />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {paket.aufgaben.length === 0 && !darf && (
          <Leerstelle was="Noch keine Aufgaben" satz="Aufgaben legt ein Bearbeiter oder Admin hier an." />
        )}
      </div>

      {darf && (
        <form
          className="feld-reihe pl-neu"
          onSubmit={(e) => {
            e.preventDefault();
            dazu();
          }}
        >
          <input
            className="feld"
            value={neu}
            placeholder={paket.aufgaben.length ? "Neue Aufgabe — Enter" : "Erste Aufgabe, z. B. Greifer konstruieren"}
            aria-label={`Neue Aufgabe in ${paket.titel}`}
            onChange={(e) => setNeu(e.target.value)}
          />
          <button type="submit" className="knopf-still" disabled={!neu.trim()}>
            <Zeichen name="plus" />
            Aufgabe
          </button>
        </form>
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
    </section>
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

/* --- Ziele laut Antrag ------------------------------------------------------ */

/**
 * Was eingereicht wurde: je Antragspaket das Ergebnis, sein Termin und ob das
 * Arbeitspaket dazu fertig ist. Darunter die Texte des Antrags, zugeklappt —
 * nachzulesen, nicht täglich zu lesen.
 */
function Ziele({ planung }: { planung: Planung }) {
  const antrag = planung.antrag!;
  const arbeit = new Map(planung.pakete.filter((p) => p.foerderpaket !== null).map((p) => [p.foerderpaket!, p]));
  return (
    <section className="karte pl-ziele">
      <h2>Ziele und Ergebnisse laut Antrag</h2>
      {antrag.pakete.length === 0 ? (
        <Leerstelle was="Der Antrag hat keine Pakete" satz="Pakete, Ziele und Ergebnisse stehen im Antrag unter Förderungen." />
      ) : (
        <ol>
          {antrag.pakete.map((ap) => {
            const p = arbeit.get(ap.id);
            const fertig = p?.status === "fertig";
            return (
              <li key={ap.id} data-fertig={fertig || undefined}>
                <span className="zahl pl-nr">{String(ap.nummer).padStart(2, "0")}</span>
                <span className="pl-zieltext">
                  <b>{ap.ergebnis || ap.titel}</b>
                  <em>
                    {ap.titel}
                    {p ? "" : " · keinem Arbeitspaket zugeordnet"}
                  </em>
                </span>
                <span className="zahl pl-leise">{ap.bis ? `bis ${zeitraumText(ap.bis, ap.bis)}` : `M${ap.monat_bis}`}</span>
                <span className={`status status-${p ? p.status : "offen"}`}>{fertig ? "erreicht" : p ? "offen" : "—"}</span>
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
