/**
 * Die Bausteine der Übersicht — je einer eine Antwort auf eine Frage, mit der
 * man die Anwendung aufmacht: Was ist meins? Wem schulden wir etwas? Wann
 * sehen wir wen?
 *
 * Jeder zeigt **wenige Zeilen und führt auf die Seite, wo alles steht**. Ein
 * Baustein, der seine Seite nachbaut, ist die zweite Ansicht derselben Daten,
 * und die wird beim nächsten neuen Feld vergessen. Rahmen, Überschrift und
 * „Alle" setzt die Übersicht selbst (siehe Uebersicht.tsx); hier steht nur
 * der Inhalt.
 *
 * Start und Dashboard waren vorher zwei Seiten. Das Meiste hier stammt von
 * dort: das Buchen von der Startseite, Team, Aktivität, Gantt und Geld vom
 * Dashboard.
 */

import { hole } from "../basis/api";
import { tafel, fristText } from "../basis/aufgaben";
import {
  useBuchungen,
  useDashboard,
  useEvents,
  useFoerderungen,
  useKontakte,
  useLagekarte,
  useMeetings,
  useNeuLaden,
  useProjekte,
  useAufgaben,
  type Ich,
} from "../basis/daten";
import { letzterTag } from "../basis/events";
import { AUSLASTUNGSSTAENDE } from "../basis/foerderauslastung";
import { achseUeber, heuteIso, monatsText, zeitraumText } from "../basis/gantt";
import { graph, lage, offeneKarte } from "../basis/lagekarte";
import { melden } from "../basis/meldungen";
import { alsPfad, type Seite, type Wechselart } from "../basis/router";
import type { Bausteinname } from "../basis/uebersicht";
import { alsDauer, uhrzeitAusZeitpunkt, wannKurz } from "../basis/zeit";
import { Zustand } from "../basis/Zustand";
import { Finanzeingabe } from "../bausteine/Finanzeingabe";
import { Gantt, GanttBalken, GanttZeile } from "../bausteine/Gantt";
import { Kontostandlinie } from "../bausteine/Kontostandlinie";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Uhrstart } from "../bausteine/Uhrstart";
import { Zeichen } from "../bausteine/Zeichen";

export type Wechseln = (seite: Seite, unter?: string | null, art?: Wechselart) => void;
type Teile = { ich: Ich; wechseln: Wechseln };

/** Wie viele Zeilen ein Baustein höchstens zeigt. Der Rest steht auf seiner Seite. */
const ZEILEN = 5;

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const ZAHL1 = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
const TAG = new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });

/** Beträge kommen als Zeichenkette (Decimal) — eine Zahl wird daraus erst zum Anzeigen. */
const euro = (betrag: string | null) => (betrag === null ? "—" : EURO.format(Number(betrag)));
const tag = (iso: string) => TAG.format(new Date(`${iso}T00:00:00`));

/** „und 3 weitere" unter einer gekürzten Liste — ein Satz statt einer Seitenzahl. */
function Weitere({ zahl, tun }: { zahl: number; tun: () => void }) {
  if (zahl <= 0) return null;
  return (
    <button type="button" className="ue-weitere" onClick={tun}>
      und {zahl} weitere
    </button>
  );
}

/* --- Meine Aufgaben -------------------------------------------------------- */

function Aufgaben({ ich, wechseln }: Teile) {
  const abfrage = useAufgaben();
  const neuLaden = useNeuLaden();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  // Dieselbe Tafel wie auf der Aufgabenseite, unter „Meine" — nach Fälligkeit.
  const meine = tafel(abfrage.data, "ich", ich.id).flatMap((g) => g.aufgaben);
  if (meine.length === 0) {
    return (
      <Leerstelle
        was="Nichts offen"
        satz="Dir ist gerade nichts zugeteilt."
        aktion={{ text: "Zur Tafel", tun: () => wechseln("aufgaben") }}
      />
    );
  }

  async function abhaken(id: number, text: string) {
    await hole(`/aufgaben/${id}/`, { method: "PATCH", body: JSON.stringify({ erledigt: true }) });
    melden("gut", `„${text}“ steht jetzt im Archiv.`);
    neuLaden();
  }

  return (
    <>
      <ul className="ue-liste">
        {meine.slice(0, ZEILEN).map((a) => {
          const frist = a.frist ? fristText(a.frist) : null;
          return (
            <li key={a.id} className="ue-aufgabe">
              {ich.darf.bearbeiten && (
                <button
                  type="button"
                  className="aufgabe-haken"
                  aria-label={`Erledigt: ${a.text}`}
                  title="Erledigt"
                  onClick={() => abhaken(a.id, a.text)}
                >
                  <i>
                    <Zeichen name="haken" />
                  </i>
                </button>
              )}
              <button type="button" className="ue-zeile" onClick={() => wechseln("aufgaben")}>
                <b>{a.text}</b>
              </button>
              {frist && (
                <span
                  className="aufgabe-frist zahl"
                  data-lage={frist.drueber ? "drueber" : frist.text.endsWith("heute") ? "heute" : undefined}
                >
                  {frist.text}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Weitere zahl={meine.length - ZEILEN} tun={() => wechseln("aufgaben")} />
    </>
  );
}

/* --- Wir sind am Zug ------------------------------------------------------- */

function Ball({ wechseln }: Teile) {
  const abfrage = useKontakte();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  // Wer am längsten wartet, zuerst — „noch nie" vor allem anderen.
  const bei_uns = abfrage.data
    .filter((k) => k.ball === "uns")
    .sort((a, b) => (a.letzter_kontakt ?? "").localeCompare(b.letzter_kontakt ?? ""));
  if (bei_uns.length === 0) {
    return <Leerstelle was="Niemand wartet" satz="Bei keinem Kontakt liegt der Ball gerade bei uns." />;
  }
  const zumKontakt = (organisation: number | null) =>
    wechseln("kontakte", organisation ? String(organisation) : "lose");

  return (
    <>
      <ul className="ue-liste">
        {bei_uns.slice(0, ZEILEN).map((k) => (
          <li key={k.id}>
            <button type="button" className="ue-zeile" onClick={() => zumKontakt(k.organisation)}>
              <b>{k.name}</b>
              <em>{[k.organisation_name, k.offener_punkt].filter(Boolean).join(" · ") || "Kein offener Punkt eingetragen"}</em>
            </button>
            <span className="ue-wann zahl">{k.letzter_kontakt ? DATUM.format(new Date(k.letzter_kontakt)) : "—"}</span>
          </li>
        ))}
      </ul>
      <Weitere zahl={bei_uns.length - ZEILEN} tun={() => wechseln("kontakte")} />
    </>
  );
}

/* --- Nächste Termine ------------------------------------------------------- */

function Termine({ wechseln }: Teile) {
  const meetings = useMeetings();
  const events = useEvents();
  if (!meetings.data) return <Zustand abfrage={meetings} erneut={() => meetings.refetch()} />;
  if (!events.data) return <Zustand abfrage={events} erneut={() => events.refetch()} />;

  const heute = heuteIso();
  const termine = [
    ...meetings.data
      .filter((m) => m.datum >= heute)
      .map((m) => ({
        schluessel: `m${m.id}`,
        sortiert: `${m.datum} ${m.uhrzeit ?? ""}`,
        wann: m.uhrzeit ? `${tag(m.datum)}, ${m.uhrzeit.slice(0, 5)}` : tag(m.datum),
        titel: m.titel,
        dazu: ["Meeting", m.ort].filter(Boolean).join(" · "),
        hin: () => wechseln("meetings", String(m.id)),
      })),
    ...events.data
      .filter((e) => letzterTag(e) >= heute)
      .map((e) => ({
        schluessel: `e${e.id}`,
        sortiert: `${e.von} ${e.beginn ?? ""}`,
        wann: e.bis ? `${tag(e.von)} – ${tag(e.bis)}` : tag(e.von),
        titel: e.titel,
        dazu: ["Event", e.ort].filter(Boolean).join(" · "),
        hin: () => wechseln("events", String(e.id)),
      })),
  ].sort((a, b) => a.sortiert.localeCompare(b.sortiert));

  if (termine.length === 0) {
    return <Leerstelle was="Nichts geplant" satz="Ab heute steht weder ein Meeting noch ein Event an." />;
  }
  return (
    <>
      <ul className="ue-liste">
        {termine.slice(0, ZEILEN).map((t) => (
          <li key={t.schluessel}>
            <span className="ue-datum zahl">{t.wann}</span>
            <button type="button" className="ue-zeile" onClick={t.hin}>
              <b>{t.titel}</b>
              <em>{t.dazu}</em>
            </button>
          </li>
        ))}
      </ul>
      <Weitere zahl={termine.length - ZEILEN} tun={() => wechseln("meetings")} />
    </>
  );
}

/* --- Thoughts -------------------------------------------------------------- */

function Thoughts({ wechseln }: Teile) {
  const abfrage = useLagekarte();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  // Abgeschlossene Themen zählen nicht — wie auf der Karte selbst.
  const g = graph(offeneKarte(abfrage.data));
  const { frei, wartet } = lage(g);
  const zur = () => wechseln("module", "thoughts");

  if (frei.length === 0 && wartet.length === 0) {
    return <Leerstelle was="Nichts offen" satz="Kein Schritt ist frei, und auf nichts wird gewartet." aktion={{ text: "Zu Thoughts", tun: zur }} />;
  }
  return (
    <>
      {wartet.length > 0 && (
        <p className="ue-satz">
          {wartet.length === 1 ? "Auf einen Schritt wird gewartet." : `Auf ${wartet.length} Schritte wird gewartet.`}
        </p>
      )}
      <ul className="ue-liste">
        {frei.slice(0, ZEILEN).map((s) => {
          const thema = s.thema !== null ? g.thema(s.thema) : undefined;
          return (
            <li key={s.id}>
              <i className={`ue-ton lk-ton-${thema?.farbe ?? 0}`} aria-hidden="true" />
              <button type="button" className="ue-zeile" onClick={zur}>
                <b>{s.titel}</b>
                <em>{thema?.name ?? "Ohne Thema"}</em>
              </button>
              {s.frist && <span className="ue-wann zahl">{fristText(s.frist).text}</span>}
            </li>
          );
        })}
      </ul>
      <Weitere zahl={frei.length - ZEILEN} tun={zur} />
    </>
  );
}

/* --- Anträge --------------------------------------------------------------- */

function Foerderungen({ wechseln }: Teile) {
  const abfrage = useFoerderungen();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  // Was noch Arbeit macht oder auf Antwort wartet; das zuletzt Angefasste oben.
  const antraege = abfrage.data
    .flatMap((programm) => programm.antraege.map((antrag) => ({ antrag, programm })))
    .filter(({ antrag }) => antrag.stand === "entwurf" || antrag.stand === "eingereicht")
    .sort((a, b) => b.antrag.geaendert_am.localeCompare(a.antrag.geaendert_am));

  const zuDen = () => wechseln("module", "foerderungen");
  if (antraege.length === 0) {
    return <Leerstelle was="Kein Antrag offen" satz="Gerade ist kein Antrag im Entwurf oder eingereicht." aktion={{ text: "Zu den Förderungen", tun: zuDen }} />;
  }
  return (
    <>
      <ul className="ue-liste">
        {antraege.slice(0, ZEILEN).map(({ antrag, programm }) => (
          <li key={antrag.id}>
            <button
              type="button"
              className="ue-zeile"
              onClick={() => wechseln("module", `foerderungen/${programm.geber}/${programm.id}/${antrag.id}`)}
            >
              <b>{antrag.titel || "Ohne Titel"}</b>
              <em>
                {programm.name} · {AUSLASTUNGSSTAENDE.find((s) => s.wert === antrag.stand)?.text ?? antrag.stand}
              </em>
            </button>
            <span className="ue-wann zahl">{euro(antrag.summe)}</span>
          </li>
        ))}
      </ul>
      <Weitere zahl={antraege.length - ZEILEN} tun={zuDen} />
    </>
  );
}

/* --- Projekte -------------------------------------------------------------- */

/**
 * Die Phasen aller Projekte auf einer Achse, mit dem Strich für heute — der
 * Gantt der Projektseite, nur zum Lesen. Gezogen wird auf der Projektseite:
 * Hier verschöbe ein Wisch beim Blättern am Handy eine Phase.
 *
 * Nur Phasen mit Zeitraum. Die ohne (Finanzierung, Ziele) stünden als leere
 * Zeilen da, und „in die Zeile klicken" setzt hier keinen.
 */
function Projekte({ wechseln }: Teile) {
  const abfrage = useProjekte();
  const heute = heuteIso();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  const projekte = abfrage.data.filter((pr) => !pr.ist_auffang);
  const zeilen = projekte.flatMap((pr) => pr.phasen.filter((ph) => ph.von && ph.bis).map((ph) => ({ pr, ph })));
  // Den Projektnamen nur nennen, wenn es mehr als eines ist.
  const mehrere = new Set(zeilen.map((z) => z.pr.id)).size > 1;

  if (zeilen.length === 0) {
    return (
      <Leerstelle
        was="Noch keine Phase mit Zeitraum"
        satz="Auf der Projektseite in die Zeile einer Phase klicken gibt ihr einen."
        aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt") }}
      />
    );
  }
  return (
    <Gantt achse={achseUeber(zeilen.flatMap(({ ph }) => [ph.von, ph.bis]), heute)} heute={heute} etikett="Phase" rechts="Gebucht">
      {zeilen.map(({ pr, ph }) => {
        const weg = `planung/${ph.id}`;
        const planen = () => wechseln("module", weg, { ruecksprung: true });
        const gebucht = ph.pakete.reduce((summe, x) => summe + x.gebuchte_sekunden, 0);
        return (
          <GanttZeile
            key={ph.id}
            art="phase"
            etikett={
              <a
                className="gantt-wahl"
                href={alsPfad("module", weg)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  planen();
                }}
              >
                <b>{ph.titel}</b>
                <em>
                  {mehrere ? `${pr.titel} · ` : ""}
                  {monatsText(ph.von, ph.bis)}
                </em>
              </a>
            }
            rechts={<span className="zahl">{gebucht > 0 ? alsDauer(gebucht) : "—"}</span>}
          >
            <GanttBalken
              spanne={{ von: ph.von!, bis: ph.bis! }}
              art="phase"
              stand={ph.stand}
              beschriftung={`${ph.titel}: ${zeitraumText(ph.von, ph.bis)}`}
              darf={false}
              klick={planen}
            >
              {ph.titel}
            </GanttBalken>
          </GanttZeile>
        );
      })}
    </Gantt>
  );
}

/* --- Zeit buchen ----------------------------------------------------------- */

/** Der Tag vor 30 Tagen als JJJJ-MM-TT — die Grundlage für „zuletzt gebucht". */
function vorDreissigTagen() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Die Uhr starten, ohne die Seite zu wechseln — dieselbe Zeile wie oben auf
 * der Zeitseite (bausteine/Uhrstart.tsx), damit Buchen an beiden Orten gleich
 * geht.
 */
function Zeit({ ich, wechseln }: Teile) {
  const projekte = useProjekte();
  // Ausdrücklicher Zeitraum, kein stiller Filter: „zuletzt" heißt die letzten dreißig Tage.
  const meine = useBuchungen({ person: String(ich.id), von: vorDreissigTagen() });

  if (!ich.darf.bearbeiten) {
    return <Leerstelle was="Nur zum Lesen" satz="Mit deiner Rolle läuft keine Uhr. Die Buchungen stehen auf der Zeitseite." />;
  }
  if (projekte.data && projekte.data.length === 0) {
    return (
      <Leerstelle
        was="Noch kein Projekt"
        satz="Ohne Projekt gibt es kein Arbeitspaket, auf das die Uhr laufen könnte."
        aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt") }}
      />
    );
  }
  return <Uhrstart projekte={projekte.data ?? []} meine={meine.data ?? []} />;
}

/* --- Team, Zuletzt passiert, Geld: aus der Auskunft des Dashboards --------- */

/** Wer eingestempelt ist und wie viel diese Woche zusammenkam. */
function Team(_: Teile) {
  const abfrage = useDashboard();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const d = abfrage.data;
  if (d.team.length === 0) return <Leerstelle was="Noch niemand da" satz="Konten legt ein Administrator an." />;
  const maxPerson = Math.max(1, ...d.team.map((p) => p.sekunden));

  return (
    <ul className="team">
      {d.team.map((p) => (
        <li key={p.id}>
          <i style={{ background: p.farbe }}>{p.initialen}</i>
          <span className="wer">
            <span className="name">{p.name}</span>
            {p.laeuft_seit ? (
              <span className="anwesenheit" data-an="ja">
                seit <span className="zahl">{uhrzeitAusZeitpunkt(p.laeuft_seit)}</span>
                {p.laeuft_auf && <> · {p.laeuft_auf}</>}
              </span>
            ) : (
              <span className="anwesenheit">
                nicht eingestempelt{" "}
                <small>
                  ({p.zuletzt_bis ? <>zuletzt <span className="zahl">{wannKurz(p.zuletzt_bis)}</span></> : "noch nie"})
                </small>
              </span>
            )}
          </span>
          <span className="balken" aria-hidden="true">
            <i style={{ width: `${Math.round((100 * p.sekunden) / maxPerson)}%`, background: p.farbe }} />
          </span>
          <span className="zahl stunden">{alsDauer(p.sekunden)}</span>
        </li>
      ))}
    </ul>
  );
}

function Aktivitaet(_: Teile) {
  const abfrage = useDashboard();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { aktivitaet } = abfrage.data;
  if (aktivitaet.length === 0) {
    return <Leerstelle was="Noch nichts passiert" satz="Sobald jemand etwas anlegt, ändert oder bucht, steht es hier." />;
  }
  return (
    <ul className="aktivitaet">
      {aktivitaet.map((a) => (
        <li key={a.id}>
          <i style={{ background: a.wer.farbe }}>{a.wer.initialen}</i>
          <span className="satz">
            <b>{a.wer.name}</b> {a.vor} {a.objekt && <b>{a.objekt}</b>} {a.nach}
          </span>
          <span className="zahl wann">{wannKurz(a.zeitpunkt)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Kontostand, Kosten und Runway mit dem Verlauf. Die genaue Planung steht in
 * der Runway-Planung; hier steht, was man auf einen Blick wissen will.
 */
function Geld({ ich }: Teile) {
  const abfrage = useDashboard();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { finanzen, kontostand_verlauf } = abfrage.data;

  return (
    <>
      <div className="ue-zahlen">
        <div>
          <span>Kontostand</span>
          <b className="zahl">{euro(finanzen.kontostand)}</b>
          <em>{finanzen.kontostand_stand ? `Stand ${DATUM.format(new Date(finanzen.kontostand_stand))}` : "noch nichts eingetragen"}</em>
        </div>
        <div>
          <span>Kosten / Monat</span>
          <b className="zahl">{euro(finanzen.erwartete_monatskosten)}</b>
          <em>{finanzen.prognose_grundlage}</em>
        </div>
        <div>
          <span>Runway</span>
          <b className="zahl">{finanzen.runway_monate ? `${ZAHL1.format(Number(finanzen.runway_monate))} Mon.` : "—"}</b>
          <em>{finanzen.runway_monate ? "Kontostand ÷ erwartete Kosten" : "Kontostand und Kosten fehlen"}</em>
        </div>
      </div>
      {kontostand_verlauf.length > 1 && (
        <Kontostandlinie verlauf={kontostand_verlauf} monatskosten={finanzen.erwartete_monatskosten} />
      )}
      {ich.darf.finanzen_eintragen && (
        <details className="ue-eintragen">
          <summary className="klapptitel">Finanzen eintragen</summary>
          <Finanzeingabe />
        </details>
      )}
    </>
  );
}

export const BAUSTEINE: Record<Bausteinname, (teile: Teile) => JSX.Element> = {
  aufgaben: Aufgaben,
  ball: Ball,
  termine: Termine,
  thoughts: Thoughts,
  foerderungen: Foerderungen,
  projekte: Projekte,
  zeit: Zeit,
  team: Team,
  geld: Geld,
  aktivitaet: Aktivitaet,
};

/** Wohin „Alle" im Kopf eines Bausteins führt — wo es fehlt, gibt es keine Seite dafür. */
export const ZIELE: Partial<Record<Bausteinname, { seite: Seite; unter?: string }>> = {
  aufgaben: { seite: "aufgaben" },
  ball: { seite: "kontakte" },
  termine: { seite: "meetings" },
  thoughts: { seite: "module", unter: "thoughts" },
  foerderungen: { seite: "module", unter: "foerderungen" },
  projekte: { seite: "projekt" },
  zeit: { seite: "zeit" },
  geld: { seite: "module", unter: "runway" },
};
