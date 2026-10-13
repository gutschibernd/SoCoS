import { useState } from "react";

import { ApiFehler, hole, lesbarerGrund } from "../basis/api";
import {
  useNeuLaden,
  useProjekte,
  type Projektphase,
  type Ich,
  type Paket,
  type Projekt as ProjektTyp,
} from "../basis/daten";
import { alsPfad, type Seite } from "../basis/router";
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

const STATUS: { wert: string; text: string }[] = [
  { wert: "offen", text: "offen" },
  { wert: "laeuft", text: "läuft" },
  { wert: "eingereicht", text: "eingereicht" },
  { wert: "zugesagt", text: "zugesagt" },
  { wert: "fertig", text: "fertig" },
  { wert: "verworfen", text: "verworfen" },
  { wert: "offene_frage", text: "offene Frage" },
];

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

  Bewusst dieselben Komponenten mit einem Schalter statt einer zweiten Ansicht:
  Die zweite Ansicht wird beim nächsten neuen Feld vergessen, und dann steht in
  der Übersicht etwas, das im Bearbeiten fehlt — oder umgekehrt.
*/

/**
 * Ein Pensum als Zahl: „270.00" → „270", „12.50" → „12,5". Die Nachkommastellen
 * kommen vom Decimal-Feld und sagen hier nichts — im Arbeitsplan steht 270 h.
 */
function alsPensum(stunden: string): string {
  return String(Number(stunden)).replace(".", ",");
}

/**
 * Der Balken: gebuchte Zeit gegen ein Pensum. Über 100 % läuft er voll und
 * wechselt die Farbe — ein überzogenes Paket soll auffallen, nicht bei 100
 * stehen bleiben. Ohne Pensum gibt es keinen Balken: 0 % hieße „nichts
 * geschafft", und das wäre eine Aussage über ein Paket, für das nie eine Zahl
 * vorgesehen war.
 */
function Fortschrittsbalken({ prozent }: { prozent: number | null }) {
  if (prozent === null) return null;
  return (
    <div className="balken" data-ueber={prozent > 100 ? "ja" : "nein"}>
      <i style={{ width: `${Math.min(100, prozent)}%` }} />
    </div>
  );
}

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
  wechseln: (seite: Seite, unter?: string | null) => void;
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
  wechseln,
}: {
  ich: Ich;
  bearbeiten: boolean;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const abfrage = useProjekte();
  const neuLaden = useNeuLaden();
  const [projektFilter, setProjektFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
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
      {ich.darf.bearbeiten && <Bearbeitungsschalter bearbeiten={bearbeiten} wechseln={wechseln} />}

      <div className="karte">
        <div className="feld-reihe">
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
          <select
            className="feld"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
          >
            <option value="alle">Alle Status</option>
            {STATUS.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
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
        </div>
        <Fehlerzeile text={projektFehler} />
      </div>

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
          statusFilter={statusFilter}
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
      </div>
      {ich.darf.bearbeiten && (
        <button
          type="button"
          className="knopf overhead-knopf"
          onClick={async () => {
            await clockIn();
            neuLaden();
          }}
        >
          <Zeichen name="start" />
          Clock-in auf Overhead
        </button>
      )}
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
  statusFilter,
  neuLaden,
  wechseln,
  zumLoeschen,
}: {
  projekt: ProjektTyp;
  projekte: ProjektTyp[];
  ich: Ich;
  bearbeiten: boolean;
  statusFilter: string;
  neuLaden: () => void;
  wechseln: (seite: Seite, unter?: string | null) => void;
  zumLoeschen: () => void;
}) {
  const [neuePhase, setNeuePhase] = useState({ titel: "", art: "dev" });
  const [phasenFehler, setPhasenFehler] = useState("");
  const heute = heuteIso();
  const [gewaehlt, setGewaehlt] = useState<number | null>(() => startphase(projekt.phasen, heute)?.id ?? null);
  // Ist die gewählte Phase weg (entfernt, in ein anderes Projekt gezogen),
  // steht wieder die da, mit der die Seite auch öffnet.
  const phase = projekt.phasen.find((p) => p.id === gewaehlt) ?? startphase(projekt.phasen, heute);
  const darf = ich.darf.bearbeiten;
  const achse = achseUeber(projekt.phasen.flatMap((p) => [p.von, p.bis]), heute);

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
              aendern={darf && bearbeiten}
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
              aendern={darf && bearbeiten}
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

      {projekt.phasen.length === 0 ? (
        <Leerstelle
          was="Noch keine Projektphase"
          satz={
            "Projektphasen gliedern das Projekt — Entwicklung, Finanzierung, Ziele — und folgen aufeinander." +
            (darf && !bearbeiten ? " Angelegt wird unter „Bearbeiten“." : "")
          }
        />
      ) : (
        <Gantt achse={achse} heute={heute} etikett="Phase" rechts="Gebucht">
          {projekt.phasen.map((p) => {
            const gebucht = p.pakete.reduce((summe, x) => summe + x.gebuchte_sekunden, 0);
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
                  <button type="button" className="gantt-wahl" aria-pressed={p.id === phase?.id} onClick={waehlen}>
                    <b>{p.titel}</b>
                    <em>
                      {p.art !== "dev" ? `${ART[p.art]} · ` : ""}
                      {p.von || p.bis ? monatsText(p.von, p.bis) : PHASENSTAND.find((s) => s.wert === p.stand)?.text}
                    </em>
                  </button>
                }
                rechts={
                  <>
                    <span className="zahl">{gebucht > 0 ? alsDauer(gebucht) : "—"}</span>
                    <em className="gantt-leise">
                      {p.pakete.length} {p.pakete.length === 1 ? "Paket" : "Pakete"}
                    </em>
                  </>
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

      {phase && (
        <Phasenblock
          key={phase.id}
          phase={phase}
          geschwister={projekt.phasen}
          stelle={projekt.phasen.indexOf(phase)}
          projekte={projekte}
          ich={ich}
          bearbeiten={bearbeiten}
          statusFilter={statusFilter}
          neuLaden={neuLaden}
          wechseln={wechseln}
        />
      )}

      {darf && bearbeiten && (
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
  );
}

/**
 * Die eine Phase, die im Gantt gewählt ist: Kopf, Zeitraum, Weg zur Planung
 * und ihre Pakete. Bis 2026-10-13 stand hier jede Phase als aufklappbarer
 * Block untereinander.
 */
function Phasenblock({
  phase,
  geschwister,
  stelle,
  projekte,
  ich,
  bearbeiten,
  statusFilter,
  neuLaden,
  wechseln,
}: {
  phase: Projektphase;
  geschwister: Projektphase[];
  stelle: number;
  projekte: ProjektTyp[];
  ich: Ich;
  bearbeiten: boolean;
  statusFilter: string;
  neuLaden: () => void;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const [neuesPaket, setNeuesPaket] = useState("");
  const [paketFehler, setPaketFehler] = useState("");
  const [loeschen, setLoeschen] = useState(false);
  const [fehler, setFehler] = useState("");
  const pakete = phase.pakete.filter((p) => statusFilter === "alle" || p.status === statusFilter);
  const gliedern = ich.darf.bearbeiten && bearbeiten;
  const planungsweg = `planung/${phase.id}`;
  // Wohin ein Paket ziehen kann: jede Phase jedes Projekts. Über Projekte
  // hinweg, weil genau das beim Zusammenlegen zweier Projekte gebraucht wird.
  const phasenwahl = projekte.flatMap((pr) =>
    pr.ist_auffang ? [] : pr.phasen.map((ph) => ({ id: ph.id, text: `${pr.titel} · ${ph.titel}` })),
  );

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

  async function paketAnlegen() {
    if (!neuesPaket.trim()) return setPaketFehler("Ohne Titel gibt es nichts anzulegen.");
    setPaketFehler("");
    await hole("/pakete/", {
      method: "POST",
      body: JSON.stringify({
        phase: phase.id,
        titel: neuesPaket.trim(),
        reihenfolge: Math.max(0, ...phase.pakete.map((p) => p.reihenfolge)) + 1,
      }),
    });
    setNeuesPaket("");
    neuLaden();
  }

  return (
    <section className="projektphase">
      <h4>
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
        {ART[phase.art].toLowerCase() !== phase.titel.trim().toLowerCase() && (
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
        <a
          className="knopf-still"
          href={alsPfad("module", planungsweg)}
          onClick={(e) => {
            e.preventDefault();
            wechseln("module", planungsweg);
          }}
        >
          <Zeichen name="gantt" />
          Planung
        </a>
      </h4>

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

      {pakete.length === 0 ? (
        <Leerstelle
          was={statusFilter === "alle" ? "Noch kein Arbeitspaket" : "Kein Paket in diesem Filter"}
          satz={
            statusFilter !== "alle"
              ? "Anderer Status oder Filter zurücksetzen."
              : "Auf ein Arbeitspaket wird Zeit gebucht — es ist die kleinste Einheit, die in Auswertungen auftaucht." +
                (ich.darf.bearbeiten && !bearbeiten ? " Angelegt wird unter „Bearbeiten“." : "")
          }
        />
      ) : (
        pakete.map((paket, i) => (
          <PaketZeile
            key={paket.id}
            paket={paket}
            geschwister={pakete}
            stelle={i}
            phasenwahl={phasenwahl}
            ich={ich}
            bearbeiten={bearbeiten}
            neuLaden={neuLaden}
          />
        ))
      )}

      {gliedern && statusFilter === "alle" && (
        <div className="feld-reihe" style={{ marginTop: 10 }}>
          <input
            className="feld"
            placeholder="Neues Arbeitspaket"
            value={neuesPaket}
            onChange={(e) => setNeuesPaket(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && paketAnlegen()}
          />
          <button type="button" className="knopf-still" onClick={paketAnlegen}>
            <Zeichen name="plus" />
            Paket anlegen
          </button>
          <Fehlerzeile text={paketFehler} />
        </div>
      )}
    </section>
  );
}

function PaketZeile({
  paket,
  geschwister,
  stelle,
  phasenwahl,
  ich,
  bearbeiten,
  neuLaden,
}: {
  paket: Paket;
  geschwister: Paket[];
  stelle: number;
  /** Wohin das Paket umziehen kann — nur im Bearbeiten. */
  phasenwahl: { id: number; text: string }[];
  ich: Ich;
  bearbeiten: boolean;
  neuLaden: () => void;
}) {
  // Aufgeklappt ist, woran gearbeitet wird: Zeit gebucht oder auf „läuft".
  // Die anderen sind eine Zeile — sonst stehen sieben Beschreibungen
  // untereinander, von denen sechs erst nächstes Jahr dran sind.
  const [offen, setOffen] = useState(paket.gebuchte_sekunden > 0 || paket.status === "laeuft");
  const [neueAufgabe, setNeueAufgabe] = useState("");
  const [aufgabeFehler, setAufgabeFehler] = useState("");
  const [loeschen, setLoeschen] = useState(false);
  const [fehler, setFehler] = useState("");
  const hatPensum = Number(paket.pensum_stunden) > 0;

  async function verschieben(richtung: -1 | 1) {
    const nachbar = geschwister[stelle + richtung];
    if (!nachbar) return;
    // Beide Nummern tauschen, nicht nur eine hochzählen: Sonst landen zwei
    // Pakete auf derselben Zahl und die Reihenfolge wird zufällig.
    await aendern(`/pakete/${paket.id}/`, { reihenfolge: stelle + richtung });
    await aendern(`/pakete/${nachbar.id}/`, { reihenfolge: stelle });
    neuLaden();
  }

  async function uhrStarten() {
    await clockIn(paket.id);
    neuLaden();
  }

  async function entfernen() {
    setFehler("");
    try {
      await hole(`/pakete/${paket.id}/`, { method: "DELETE" });
      setLoeschen(false);
      neuLaden();
    } catch (e) {
      // Der Server lässt ein Paket nicht entfernen, an dem Zeiten hängen. Das
      // ist kein Absturz, sondern die Auskunft, die man hier braucht.
      setFehler(
        e instanceof Error && "istInVerwendung" in e && (e as { istInVerwendung: boolean }).istInVerwendung
          ? "Auf dieses Paket sind Zeiten gebucht. Setz es auf „verworfen“ oder „fertig“ — die Buchungen sollen im Nachweis stehen bleiben."
          : "Das hat nicht geklappt.",
      );
    }
  }

  async function aufgabeAnlegen() {
    if (!neueAufgabe.trim()) return setAufgabeFehler("Ohne Titel gibt es nichts hinzuzufügen.");
    setAufgabeFehler("");
    await hole("/unteraufgaben/", {
      method: "POST",
      body: JSON.stringify({
        paket: paket.id,
        titel: neueAufgabe.trim(),
        reihenfolge: paket.unteraufgaben.length,
      }),
    });
    setNeueAufgabe("");
    neuLaden();
  }

  return (
    <article className="paket">
      <div className="paket-kopf">
        <button type="button" className="paket-aufklappen" onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
          <Zeichen name="zeiger" />
        </button>
        <span className="paket-titel">
          <Feldtext
            wert={paket.titel}
            aendern={ich.darf.bearbeiten && bearbeiten}
            speichern={async (titel) => {
              await aendern(`/pakete/${paket.id}/`, { titel });
              neuLaden();
            }}
          />
        </span>

        {ich.darf.bearbeiten ? (
          <select
            className={`status status-${paket.status}`}
            value={paket.status}
            onChange={async (e) => {
              await aendern(`/pakete/${paket.id}/`, { status: e.target.value });
              neuLaden();
            }}
            aria-label={`Status von ${paket.titel}`}
          >
            {STATUS.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        ) : (
          <span className={`status status-${paket.status}`}>
            {STATUS.find((s) => s.wert === paket.status)?.text}
          </span>
        )}

        {/* Gebucht gegen Pensum. Ohne Pensum nur die gebuchte Zeit — und die
            nur, wenn es eine gibt: „0:00" an jedem Förderantrag sagt nichts. */}
        {hatPensum ? (
          <span className="zahl fortschritt">
            {alsDauer(paket.gebuchte_sekunden)} / {alsPensum(paket.pensum_stunden)} h · {paket.fortschritt} %
          </span>
        ) : paket.gebuchte_sekunden > 0 ? (
          <span className="zahl fortschritt">{alsDauer(paket.gebuchte_sekunden)}</span>
        ) : null}

        {/* Clock-in ist Arbeiten, kein Gliedern — der Knopf bleibt in beiden Modi. */}
        {ich.darf.bearbeiten && (
          <button type="button" className="knopf-still" onClick={uhrStarten}>
            <Zeichen name="start" />
            Clock-in
          </button>
        )}

        {ich.darf.bearbeiten && bearbeiten && (
          <span className="ordnen">
            {/* Umziehen, auch in ein anderes Projekt. Gebuchte Zeit zieht mit —
                sie hängt am Paket, nicht an der Phase. */}
            <select
              className="feld paket-umzug"
              value={paket.phase}
              aria-label={`Phase von ${paket.titel}`}
              onChange={async (e) => {
                setFehler("");
                try {
                  await aendern(`/pakete/${paket.id}/`, { phase: Number(e.target.value) });
                  neuLaden();
                } catch (fehler) {
                  setFehler(fehler instanceof ApiFehler ? lesbarerGrund(fehler) : "Das hat nicht geklappt.");
                }
              }}
            >
              {phasenwahl.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.text}
                </option>
              ))}
            </select>
            <button type="button" className="mini" disabled={stelle === 0} onClick={() => verschieben(-1)} title="Nach oben" aria-label="Nach oben">
              <Zeichen name="hoch" />
            </button>
            <button type="button" className="mini" disabled={stelle === geschwister.length - 1} onClick={() => verschieben(1)} title="Nach unten" aria-label="Nach unten">
              <Zeichen name="runter" />
            </button>
            {ich.darf.loeschen && (
              <button
                type="button"
                className="mini"
                aria-label={`„${paket.titel}“ entfernen`}
                onClick={() => setLoeschen(true)}
              >
                <Zeichen name="kreuz" />
              </button>
            )}
          </span>
        )}
      </div>

      <Fortschrittsbalken prozent={paket.fortschritt} />

      <Fehlerzeile text={fehler} />

      {offen && (
        <div className="paket-tiefe">
          {/* Je Person gegen ihr Pensum — das ist die Frage, die jemand am
              Morgen hat: wie viel *ich* hier noch offen habe. Die Summe oben
              beantwortet sie nicht, wenn der eine 270 Stunden trägt und der
              andere 140. */}
          {paket.pensen.length > 0 && (
            <div className="pensen">
              <div className="tiefe-kopf">Pensum</div>
              {paket.pensen.map((pensum) => (
                <div className="pensum-zeile" key={pensum.id}>
                  <span className="pensum-person">{pensum.person_name}</span>
                  <Fortschrittsbalken
                    prozent={
                      Number(pensum.stunden) > 0
                        ? Math.round((100 * pensum.gebuchte_sekunden) / 3600 / Number(pensum.stunden))
                        : null
                    }
                  />
                  <span className="zahl pensum-zahl">
                    {alsDauer(pensum.gebuchte_sekunden)} / {alsPensum(pensum.stunden)} h
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="beschreibung">
            <Feldtext
              wert={paket.beschreibung}
              mehrzeilig
              platzhalter="Was in diesem Paket getan wird …"
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={async (beschreibung) => {
                await aendern(`/pakete/${paket.id}/`, { beschreibung });
                neuLaden();
              }}
            />
          </div>

          <ul className="unteraufgaben">
            {paket.unteraufgaben.map((u) => (
              <li key={u.id}>
                <input
                  type="checkbox"
                  checked={u.erledigt}
                  disabled={!ich.darf.bearbeiten}
                  aria-label={u.titel}
                  onChange={async (e) => {
                    await aendern(`/unteraufgaben/${u.id}/`, { erledigt: e.target.checked });
                    neuLaden();
                  }}
                />
                <span data-erledigt={u.erledigt ? "ja" : "nein"}>
                  <Feldtext
                    wert={u.titel}
                    aendern={ich.darf.bearbeiten && bearbeiten}
                    speichern={async (titel) => {
                      await aendern(`/unteraufgaben/${u.id}/`, { titel });
                      neuLaden();
                    }}
                  />
                </span>
                {ich.darf.loeschen && bearbeiten && (
                  <button
                    type="button"
                    className="mini"
                    title={`„${u.titel}“ entfernen`}
                    onClick={async () => {
                      await hole(`/unteraufgaben/${u.id}/`, { method: "DELETE" });
                      neuLaden();
                    }}
                  >
                    <Zeichen name="kreuz" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {ich.darf.bearbeiten && bearbeiten && (
            <div className="feld-reihe" style={{ marginTop: 8 }}>
              <input
                className="feld"
                placeholder="Neue Unteraufgabe"
                value={neueAufgabe}
                onChange={(e) => setNeueAufgabe(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aufgabeAnlegen()}
              />
              <button type="button" className="knopf-still" onClick={aufgabeAnlegen}>
                <Zeichen name="plus" />
                Hinzufügen
              </button>
            </div>
          )}
          <Fehlerzeile text={aufgabeFehler} />
        </div>
      )}

      {loeschen && bearbeiten && (
        <Loeschdialog
          name={paket.titel}
          was="Das Arbeitspaket mit seinen Unteraufgaben"
          milder={{
            text: "Auf „verworfen“ setzen",
            tun: async () => {
              await aendern(`/pakete/${paket.id}/`, { status: "verworfen" });
              setLoeschen(false);
              neuLaden();
            },
          }}
          abbrechen={() => setLoeschen(false)}
          loeschen={entfernen}
        />
      )}
    </article>
  );
}
