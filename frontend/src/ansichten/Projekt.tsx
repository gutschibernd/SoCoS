import { useState } from "react";

import { ApiFehler, hole, lesbarerGrund } from "../basis/api";
import {
  useNeuLaden,
  useProjekte,
  type Projektphase,
  type Ich,
  type Projekt as ProjektTyp,
} from "../basis/daten";
import { alsPfad, type Seite, type Wechselart } from "../basis/router";
import { buchbarePakete } from "../basis/start";
import { Zustand } from "../basis/Zustand";
import { clockIn } from "../basis/uhr";
import { alsDauer } from "../basis/zeit";
import { achseUeber, heuteIso, monatsText, plusTage, startphase, zeitraumText } from "../basis/gantt";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Gantt, GanttBalken, GanttZeile } from "../bausteine/Gantt";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Feldtext } from "../bausteine/Feldtext";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Phasenplanung, type Phasenwahl } from "./Planung";

const ART: Record<string, string> = { dev: "Entwicklung", fin: "Finanzierung", ziel: "Ziele" };

const PHASENSTAND: { wert: Projektphase["stand"]; text: string }[] = [
  { wert: "offen", text: "offen" },
  { wert: "laeuft", text: "läuft" },
  { wert: "abgeschlossen", text: "abgeschlossen" },
];

/*
  Zwei Modi, eine Ansicht.

  Die Übersicht ist zum Arbeiten: Status setzen, Beschreibung schreiben,
  Haken setzen, Uhr starten, Phasen im Gantt verschieben. Die Gliederung —
  anlegen, umordnen, umziehen, entfernen — steht unter /projekt/bearbeiten und
  nur dort.

  Seit 2026-10-13 steht je Projekt **ein Gantt der Phasen** oben und darunter
  nur die eine Phase, die man darin gewählt hat (Wunsch Bernd: weg von der
  langen Liste). Die Kette Anforderungen → Labor → Validierung → … liest sich
  als Zeitachse, nicht als acht Absätze untereinander.

  Seit 2026-10-19 ist **die Projektplanung hier drin** (ansichten/Planung.tsx):
  Die gewählte Phase zeigt je Paket Stunden je Person, Antragsmonate und
  Status, aufgeklappt die Aufgaben. Vorher gab es dieselben Pakete zweimal,
  hier mit Pensum und Clock-in, dort mit Aufgaben und Antrag (Bernd: „ich hab
  da massiv die Übersicht verloren").

  Der Gantt zeigt nur Phasen **mit Zeitraum**. Phasen ohne — Finanzierung,
  Ziele, „läuft immer bissl mit" — standen als leere Zeilen zwischen den
  echten; im Bearbeiten stehen sie weiter da, damit man ihnen per Klick einen
  Zeitraum geben kann.

  Bewusst dieselben Komponenten mit einem Schalter statt einer zweiten Ansicht:
  Die zweite Ansicht wird beim nächsten neuen Feld vergessen, und dann steht in
  der Übersicht etwas, das im Bearbeiten fehlt — oder umgekehrt.
*/

/** Ein PATCH auf eine Ressource. Das Neuladen entscheidet der Aufrufer. */
async function aendern(pfad: string, daten: Record<string, unknown>): Promise<void> {
  await hole(pfad, { method: "PATCH", body: JSON.stringify(daten) });
}

/**
 * Der Weg in den Bearbeitungsmodus und zurück — ein Knopf am rechten Rand.
 *
 * Kein Reiterpaar: Zwei Reiter behaupten zwei gleichrangige Ansichten. Es gibt
 * aber nur eine Ansicht und einen Sonderzustand, in den man selten geht.
 * Wer nicht bearbeiten darf, sieht den Knopf nicht.
 */
function Bearbeitungsschalter({
  bearbeiten,
  wechseln,
}: {
  bearbeiten: boolean;
  wechseln: (seite: Seite, unter?: string | null, art?: Wechselart) => void;
}) {
  return (
    <div className="ansicht-schalter">
      <a
        className={bearbeiten ? "knopf" : "knopf-still"}
        href={alsPfad("projekt", bearbeiten ? null : "bearbeiten")}
        onClick={(e) => {
          e.preventDefault();
          wechseln("projekt", bearbeiten ? null : "bearbeiten");
        }}
      >
        <Zeichen name={bearbeiten ? "haken" : "stift"} />
        {bearbeiten ? "Fertig" : "Bearbeiten"}
      </a>
    </div>
  );
}

export function Projekt({
  ich,
  bearbeiten,
  phase,
  wechseln,
}: {
  ich: Ich;
  bearbeiten: boolean;
  /** Die Phase aus dem Weg (`/projekt/28`) — die, die beim Öffnen aufgeht. */
  phase: number | null;
  wechseln: (seite: Seite, unter?: string | null, art?: Wechselart) => void;
}) {
  const abfrage = useProjekte();
  const neuLaden = useNeuLaden();
  const [projektFilter, setProjektFilter] = useState("alle");
  const [neuesProjekt, setNeuesProjekt] = useState("");
  const [projektFehler, setProjektFehler] = useState("");
  const [loeschen, setLoeschen] = useState<{ id: number; name: string } | null>(null);

  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const projekte = abfrage.data;

  async function anlegen() {
    if (!neuesProjekt.trim()) return setProjektFehler("Ohne Titel gibt es nichts anzulegen.");
    setProjektFehler("");
    await hole("/projekte/", { method: "POST", body: JSON.stringify({ titel: neuesProjekt.trim() }) });
    setNeuesProjekt("");
    neuLaden();
  }

  async function projektEntfernen(id: number) {
    await hole(`/projekte/${id}/`, { method: "DELETE" });
    setLoeschen(null);
    neuLaden();
  }

  const darfAnlegen = ich.darf.bearbeiten && bearbeiten;
  const sichtbar = projekte.filter((p) => projektFilter === "alle" || String(p.id) === projektFilter);
  // Das Overhead-Projekt steht quer über den anderen: Es gehört zu allen —
  // Networking, Meetings, Gespräche — und wäre in einer Spalte neben dem
  // Arzneimittelspender ein Projekt wie jedes andere. In den Auswahllisten
  // bleibt es hinten (`reihenfolge` 900); nur hier steht es vorn.
  const auffang = sichtbar.filter((p) => p.ist_auffang);
  const uebrige = sichtbar.filter((p) => !p.ist_auffang);

  if (projekte.length === 0) {
    return (
      <div className="spalte">
        {ich.darf.bearbeiten && <Bearbeitungsschalter bearbeiten={bearbeiten} wechseln={wechseln} />}
        <div className="karte">
          <Leerstelle
            was="Noch kein Projekt angelegt"
            satz={
              !ich.darf.bearbeiten
                ? "Projekte legt ein Bearbeiter oder Admin an."
                : bearbeiten
                  ? "Ein Projekt bekommt Projektphasen (Entwicklung, Finanzierung, Ziele) und darin die Arbeitspakete, auf die Zeit gebucht wird."
                  : "Angelegt wird unter „Bearbeiten“ — dort steht die Gliederung."
            }
            aktion={
              ich.darf.bearbeiten && !bearbeiten
                ? { text: "Zum Bearbeiten", tun: () => wechseln("projekt", "bearbeiten") }
                : undefined
            }
          />
          {darfAnlegen && (
            <div className="feld-reihe" style={{ maxWidth: 520, margin: "0 auto" }}>
              <input
                className="feld"
                placeholder="Titel des Projekts"
                value={neuesProjekt}
                onChange={(e) => setNeuesProjekt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anlegen()}
              />
              <button type="button" className="knopf" onClick={anlegen}>
                <Zeichen name="plus" />
                Projekt anlegen
              </button>
              <Fehlerzeile text={projektFehler} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="spalte">
      {/* Filter, Anlegen und „Bearbeiten“ in einer Zeile ohne Karte. Vorher
          stand „Bearbeiten“ allein in einer Zeile und darunter eine Karte
          mit zwei Auswahlfeldern über die volle Breite — zwei Zeilen Rahmen,
          bevor das erste Projekt kam. */}
      <div className="feld-reihe projekt-werkzeug">
        <select
          className="feld"
          value={projektFilter}
          onChange={(e) => setProjektFilter(e.target.value)}
          aria-label="Projekt"
        >
          <option value="alle">Alle Projekte</option>
          {projekte.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titel}
            </option>
          ))}
        </select>
        {darfAnlegen && (
          <>
            <input
              className="feld"
              placeholder="Neues Projekt"
              value={neuesProjekt}
              onChange={(e) => setNeuesProjekt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <button type="button" className="knopf" onClick={anlegen}>
              <Zeichen name="plus" />
              Anlegen
            </button>
          </>
        )}
        {ich.darf.bearbeiten && <Bearbeitungsschalter bearbeiten={bearbeiten} wechseln={wechseln} />}
      </div>
      <Fehlerzeile text={projektFehler} />

      {auffang.map((projekt) => (
        <OverheadKarte key={projekt.id} projekt={projekt} ich={ich} bearbeiten={bearbeiten} neuLaden={neuLaden} />
      ))}

      {/* Untereinander und über die ganze Breite: Ein Gantt braucht die
          Breite für seine Achse. Bis 2026-10-13 standen die Projekte am
          Laptop nebeneinander — als Listen. */}
      {uebrige.map((projekt) => (
        <ProjektKarte
          key={projekt.id}
          projekt={projekt}
          projekte={projekte}
          ich={ich}
          bearbeiten={bearbeiten}
          phaseAusWeg={phase}
          neuLaden={neuLaden}
          wechseln={wechseln}
          zumLoeschen={() => setLoeschen({ id: projekt.id, name: projekt.titel })}
        />
      ))}

      {loeschen && bearbeiten && (
        <Loeschdialog
          name={loeschen.name}
          was="Das Projekt mit allen Phasen und Paketen"
          abbrechen={() => setLoeschen(null)}
          loeschen={() => projektEntfernen(loeschen.id)}
        />
      )}
    </div>
  );
}

/**
 * Das Overhead-Projekt: ein Kopf und ein Knopf, kein Baum.
 *
 * Es hat eine Phase und ein Paket, weil jede Buchung eines braucht — aber
 * niemand gliedert Overhead. „Laufendes › Allgemein" aufzuklappen, um dann
 * auf Clock-in zu drücken, sind zwei Griffe für einen Gedanken. Die Uhr
 * startet hier ohne Paketnummer und landet von selbst auf dem Auffangpaket.
 */
function OverheadKarte({
  projekt,
  ich,
  bearbeiten,
  neuLaden,
}: {
  projekt: ProjektTyp;
  ich: Ich;
  bearbeiten: boolean;
  neuLaden: () => void;
}) {
  return (
    <div className="karte overhead" style={{ borderLeft: `3px solid ${projekt.farbe}` }}>
      <div className="projekt-kopf">
        <div style={{ minWidth: 200 }}>
          <h3>
            <Feldtext
              wert={projekt.titel}
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={async (titel) => {
                await aendern(`/projekte/${projekt.id}/`, { titel });
                neuLaden();
              }}
            />
          </h3>
          <div className="unter">
            <Feldtext
              wert={projekt.untertitel}
              platzhalter="Untertitel …"
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={async (untertitel) => {
                await aendern(`/projekte/${projekt.id}/`, { untertitel });
                neuLaden();
              }}
            />
          </div>
        </div>
        <span className="zahl gebucht">{alsDauer(projekt.gebuchte_sekunden)} gebucht</span>
        {/* Ein stiller Knopf in der Kopfzeile, kein kupferner Balken über die
            ganze Breite mehr: Der war das Lauteste auf der Projektseite, und
            gestartet wird seit 2026-10-19 vor allem oben auf der Zeitseite. */}
        {ich.darf.bearbeiten && (
          <button
            type="button"
            className="knopf-still"
            onClick={async () => {
              await clockIn();
              neuLaden();
            }}
          >
            <Zeichen name="start" />
            Start auf Overhead
          </button>
        )}
      </div>
    </div>
  );
}

/** Wie lang eine Phase wird, der man per Klick in die leere Zeile einen Zeitraum gibt: drei Monate. */
const NEUE_PHASE_TAGE = 90;

function ProjektKarte({
  projekt,
  projekte,
  ich,
  bearbeiten,
  phaseAusWeg,
  neuLaden,
  wechseln,
  zumLoeschen,
}: {
  projekt: ProjektTyp;
  projekte: ProjektTyp[];
  ich: Ich;
  bearbeiten: boolean;
  phaseAusWeg: number | null;
  neuLaden: () => void;
  wechseln: (seite: Seite, unter?: string | null, art?: Wechselart) => void;
  zumLoeschen: () => void;
}) {
  const [neuePhase, setNeuePhase] = useState({ titel: "", art: "dev" });
  const [phasenFehler, setPhasenFehler] = useState("");
  const heute = heuteIso();
  const darf = ich.darf.bearbeiten;
  const gliedern = darf && bearbeiten;
  // Ohne Zeitraum nur im Bearbeiten — siehe oben.
  const sichtbar = projekt.phasen.filter((p) => gliedern || (p.von && p.bis));
  const ohneZeitraum = projekt.phasen.length - sichtbar.length;
  const [gewaehlt, setGewaehlt] = useState<number | null>(
    () =>
      (phaseAusWeg !== null && projekt.phasen.some((p) => p.id === phaseAusWeg) ? phaseAusWeg : null) ??
      startphase(sichtbar, heute)?.id ??
      null,
  );
  // Ist die gewählte Phase weg (entfernt, in ein anderes Projekt gezogen),
  // steht wieder die da, mit der die Seite auch öffnet.
  const phase = sichtbar.find((p) => p.id === gewaehlt) ?? startphase(sichtbar, heute);
  const achse = achseUeber(sichtbar.flatMap((p) => [p.von, p.bis]), heute);

  async function phaseAnlegen() {
    if (!neuePhase.titel.trim()) return setPhasenFehler("Ohne Titel gibt es nichts anzulegen.");
    setPhasenFehler("");
    const neu = await hole<Projektphase>("/phasen/", {
      method: "POST",
      body: JSON.stringify({
        projekt: projekt.id,
        titel: neuePhase.titel.trim(),
        art: neuePhase.art,
        // Hinten anstellen — sonst landet die neue Phase auf 0 und vor allen.
        reihenfolge: Math.max(0, ...projekt.phasen.map((p) => p.reihenfolge)) + 1,
      }),
    });
    setNeuePhase({ titel: "", art: "dev" });
    setGewaehlt(neu.id);
    neuLaden();
  }

  return (
    <>
      <div className="karte" style={{ borderLeft: `3px solid ${projekt.farbe}` }}>
        <div className="projekt-kopf">
          <div style={{ minWidth: 200 }}>
            <h3>
              {/* `neuLaden` gehört zu jedem `aendern` dazu. Ohne das ging der
                  PATCH zwar durch, die Liste wurde aber nie neu geholt — auf dem
                  Bildschirm stand weiter der alte Titel, und es sah aus, als
                  hätte das Feld die Änderung verworfen. */}
              <Feldtext
                wert={projekt.titel}
                aendern={gliedern}
                speichern={async (titel) => {
                  await aendern(`/projekte/${projekt.id}/`, { titel });
                  neuLaden();
                }}
              />
            </h3>
            <div className="unter">
              <Feldtext
                wert={projekt.untertitel}
                platzhalter="Untertitel …"
                aendern={gliedern}
                speichern={async (untertitel) => {
                  await aendern(`/projekte/${projekt.id}/`, { untertitel });
                  neuLaden();
                }}
              />
            </div>
          </div>
          <span className="zahl gebucht">{alsDauer(projekt.gebuchte_sekunden)} gebucht</span>
          {ich.darf.loeschen && bearbeiten && (
            <button type="button" className="knopf-still" onClick={zumLoeschen}>
              <Zeichen name="korb" />
              Entfernen
            </button>
          )}
        </div>

        {sichtbar.length === 0 ? (
          <Leerstelle
            was={ohneZeitraum > 0 ? "Noch keine Phase mit Zeitraum" : "Noch keine Projektphase"}
            satz={
              "Projektphasen gliedern das Projekt und folgen aufeinander." +
              (darf && !bearbeiten ? " Angelegt und datiert wird unter „Bearbeiten“." : "")
            }
          />
        ) : (
          <Gantt achse={achse} heute={heute} etikett="Phase" rechts="Gebucht">
            {sichtbar.map((p) => {
              const gebucht = p.pakete.reduce((summe, x) => summe + x.gebuchte_sekunden, 0);
              // Ein Klick auf die Phase öffnet sie unter dem Gantt — bis
              // 2026-10-19 führte er auf eine eigene Planungsseite.
              const waehlen = () => setGewaehlt(p.id);
              return (
                <GanttZeile
                  key={p.id}
                  art="phase"
                  gewaehlt={p.id === phase?.id}
                  setzen={
                    darf && !p.von && !p.bis
                      ? async (tag) => {
                          await aendern(`/phasen/${p.id}/`, { von: tag, bis: plusTage(tag, NEUE_PHASE_TAGE - 1) });
                          setGewaehlt(p.id);
                          neuLaden();
                        }
                      : undefined
                  }
                  etikett={
                    <a
                      className="gantt-wahl"
                      href={alsPfad("projekt", String(p.id))}
                      aria-current={p.id === phase?.id ? "true" : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        waehlen();
                      }}
                    >
                      <b>{p.titel}</b>
                      <em>
                        {p.foerderantrag !== null ? "Förderung · " : ""}
                        {p.von || p.bis ? monatsText(p.von, p.bis) : "ohne Zeitraum"}
                      </em>
                    </a>
                  }
                  rechts={
                    <button
                      type="button"
                      className="gantt-pakete"
                      aria-pressed={p.id === phase?.id}
                      aria-label={`${p.titel} öffnen`}
                      onClick={waehlen}
                    >
                      <span className="zahl">{gebucht > 0 ? alsDauer(gebucht) : "—"}</span>
                      <em className="gantt-leise">
                        {p.pakete.length} {p.pakete.length === 1 ? "Paket" : "Pakete"}
                      </em>
                    </button>
                  }
                >
                  {p.von && p.bis && (
                    <GanttBalken
                      spanne={{ von: p.von, bis: p.bis }}
                      art="phase"
                      stand={p.stand}
                      beschriftung={`${p.titel}: ${zeitraumText(p.von, p.bis)}`}
                      darf={darf}
                      schritt={7}
                      klick={waehlen}
                      aendern={async (spanne) => {
                        await aendern(`/phasen/${p.id}/`, spanne);
                        neuLaden();
                      }}
                    >
                      {p.titel}
                    </GanttBalken>
                  )}
                </GanttZeile>
              );
            })}
          </Gantt>
        )}

        {gliedern && (
          <div className="feld-reihe" style={{ marginTop: 14 }}>
            <input
              className="feld"
              placeholder="Neue Projektphase"
              value={neuePhase.titel}
              onChange={(e) => setNeuePhase({ ...neuePhase, titel: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && phaseAnlegen()}
            />
            <select
              className="feld"
              value={neuePhase.art}
              onChange={(e) => setNeuePhase({ ...neuePhase, art: e.target.value })}
              aria-label="Art der Projektphase"
            >
              {Object.entries(ART).map(([wert, text]) => (
                <option key={wert} value={wert}>
                  {text}
                </option>
              ))}
            </select>
            <button type="button" className="knopf-still" onClick={phaseAnlegen}>
              <Zeichen name="plus" />
              Phase anlegen
            </button>
            <Fehlerzeile text={phasenFehler} />
          </div>
        )}
      </div>

      {/* Die gewählte Phase als eigene Karte unter dem Gantt und nicht in
          ihm: Mit Kennzahlen, Reitern und sieben Paketen wäre die Karte des
          Projekts sonst zwei Bildschirme lang, und der Gantt läge über einer
          Wand, die nicht mehr zu ihm zu gehören scheint. */}
      {phase && (
        <Phasenblock
          key={phase.id}
          phase={phase}
          geschwister={projekt.phasen}
          stelle={projekt.phasen.indexOf(phase)}
          projekte={projekte}
          ich={ich}
          bearbeiten={bearbeiten}
          neuLaden={neuLaden}
          wechseln={wechseln}
        />
      )}
    </>
  );
}

/**
 * Die eine Phase, die im Gantt gewählt ist: Kopf, im Bearbeiten das Gliedern,
 * darunter ihre Planung — Kennzahlen, Pakete mit Stunden und Aufgaben,
 * Zeitplan, Antrag (ansichten/Planung.tsx).
 */
function Phasenblock({
  phase,
  geschwister,
  stelle,
  projekte,
  ich,
  bearbeiten,
  neuLaden,
  wechseln,
}: {
  phase: Projektphase;
  geschwister: Projektphase[];
  stelle: number;
  projekte: ProjektTyp[];
  ich: Ich;
  bearbeiten: boolean;
  neuLaden: () => void;
  wechseln: (seite: Seite, unter?: string | null, art?: Wechselart) => void;
}) {
  const [loeschen, setLoeschen] = useState(false);
  const [fehler, setFehler] = useState("");
  const gliedern = ich.darf.bearbeiten && bearbeiten;
  // Wohin ein Paket ziehen kann: jede Phase jedes Projekts. Über Projekte
  // hinweg, weil genau das beim Zusammenlegen zweier Projekte gebraucht wird.
  const phasenwahl: Phasenwahl = projekte.flatMap((pr) =>
    pr.ist_auffang ? [] : pr.phasen.map((ph) => ({ id: ph.id, text: `${pr.titel} · ${ph.titel}` })),
  );
  const buchbar = new Set(buchbarePakete(projekte).keys());

  async function speichernMitFehler(daten: Record<string, unknown>) {
    setFehler("");
    try {
      await aendern(`/phasen/${phase.id}/`, daten);
      neuLaden();
    } catch (e) {
      setFehler(e instanceof ApiFehler ? lesbarerGrund(e) : "Das hat nicht geklappt.");
    }
  }

  async function verschieben(richtung: -1 | 1) {
    const nachbar = geschwister[stelle + richtung];
    if (!nachbar) return;
    // Beide Nummern tauschen, nicht nur eine hochzählen: Sonst wandern zwei
    // Einträge auf dieselbe Zahl und die Reihenfolge wird zufällig.
    await aendern(`/phasen/${phase.id}/`, { reihenfolge: stelle + richtung });
    await aendern(`/phasen/${nachbar.id}/`, { reihenfolge: stelle });
    neuLaden();
  }

  async function entfernen() {
    setFehler("");
    try {
      await hole(`/phasen/${phase.id}/`, { method: "DELETE" });
      setLoeschen(false);
      neuLaden();
    } catch (e) {
      setLoeschen(false);
      setFehler(
        e instanceof ApiFehler && e.istInVerwendung
          ? "An dieser Phase hängen noch Arbeitspakete. Zieh sie in eine andere Phase oder setz die Phase auf „abgeschlossen“."
          : "Das hat nicht geklappt.",
      );
    }
  }

  return (
    <section className="karte projektphase">
      <h2 className="phase-kopf">
        <Feldtext
          wert={phase.titel}
          aendern={gliedern}
          speichern={async (titel) => {
            await aendern(`/phasen/${phase.id}/`, { titel });
            neuLaden();
          }}
        />
        {/* Die Art nur zeigen, wenn sie etwas hinzufügt. „Entwicklung
            Entwicklung" ist Rauschen, das man beim Lesen jedes Mal aussortiert. */}
        {ART[phase.art].toLowerCase() !== phase.titel.trim().toLowerCase() && phase.art !== "dev" && (
          <span className="art">{ART[phase.art]}</span>
        )}
        {ich.darf.bearbeiten ? (
          <select
            // Dieselben Töne wie am Paket: abgeschlossen ist grün wie „fertig".
            className={`status status-${phase.stand === "abgeschlossen" ? "fertig" : phase.stand}`}
            value={phase.stand}
            aria-label={`Stand von ${phase.titel}`}
            onChange={(e) => speichernMitFehler({ stand: e.target.value })}
          >
            {PHASENSTAND.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        ) : (
          <span className={`status status-${phase.stand === "abgeschlossen" ? "fertig" : phase.stand}`}>
            {PHASENSTAND.find((s) => s.wert === phase.stand)?.text}
          </span>
        )}
        <span className="phase-summe">{zeitraumText(phase.von, phase.bis)}</span>
      </h2>

      {/* Gliedern: Zeitraum genau, umziehen, umordnen, entfernen. Gezogen
          wird der Zeitraum im Gantt in beiden Modi — eingetippt nur hier. */}
      {gliedern && (
        <div className="phase-gliedern">
          <label>
            <span className="beschriftung-klein">Beginn</span>
            <Datumsfeld wert={phase.von} beschriftung="Beginn der Phase" darf speichern={(von) => speichernMitFehler({ von })} />
          </label>
          <label>
            <span className="beschriftung-klein">Ende</span>
            <Datumsfeld wert={phase.bis} beschriftung="Ende der Phase" darf speichern={(bis) => speichernMitFehler({ bis })} />
          </label>
          <label>
            <span className="beschriftung-klein">Projekt</span>
            <select
              className="feld"
              value={phase.projekt}
              aria-label="Projekt der Phase"
              onChange={(e) =>
                speichernMitFehler({
                  projekt: Number(e.target.value),
                  // Im neuen Projekt hinten anstellen.
                  reihenfolge:
                    Math.max(0, ...(projekte.find((p) => p.id === Number(e.target.value))?.phasen ?? []).map((p) => p.reihenfolge)) + 1,
                })
              }
            >
              {projekte
                .filter((p) => !p.ist_auffang)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titel}
                  </option>
                ))}
            </select>
          </label>
          <span className="ordnen">
            <button type="button" className="mini" disabled={stelle === 0} onClick={() => verschieben(-1)} title="Im Gantt nach oben" aria-label="Im Gantt nach oben">
              <Zeichen name="hoch" />
            </button>
            <button type="button" className="mini" disabled={stelle === geschwister.length - 1} onClick={() => verschieben(1)} title="Im Gantt nach unten" aria-label="Im Gantt nach unten">
              <Zeichen name="runter" />
            </button>
            {ich.darf.loeschen && (
              <button type="button" className="mini" onClick={() => setLoeschen(true)}>
                <Zeichen name="korb" />
                Entfernen
              </button>
            )}
          </span>
        </div>
      )}
      <Fehlerzeile text={fehler} />

      {loeschen && bearbeiten && (
        <Loeschdialog
          name={phase.titel}
          was="Die Projektphase"
          milder={{
            text: "Auf „abgeschlossen“ setzen",
            tun: async () => {
              setLoeschen(false);
              await speichernMitFehler({ stand: "abgeschlossen" });
            },
          }}
          abbrechen={() => setLoeschen(false)}
          loeschen={entfernen}
        />
      )}

      <Phasenplanung
        phase={phase.id}
        ich={ich}
        bearbeiten={bearbeiten}
        phasenwahl={phasenwahl}
        buchbar={buchbar}
        wechseln={wechseln}
      />
    </section>
  );
}
