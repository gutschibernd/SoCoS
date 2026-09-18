import { useState } from "react";

import { hole } from "../basis/api";
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
  Haken setzen, Uhr starten. Die Gliederung — anlegen, umordnen,
  entfernen — steht unter /projekt/bearbeiten und nur dort.

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

      {/* Nebeneinander, sobald der Platz für zwei Spalten reicht — am Laptop
          stehen die beiden Projekte sonst untereinander und man scrollt an
          einer halbleeren Seite vorbei. */}
      <div className="projekt-raster">
        {uebrige.map((projekt) => (
          <ProjektKarte
            key={projekt.id}
            projekt={projekt}
            ich={ich}
            bearbeiten={bearbeiten}
            statusFilter={statusFilter}
            neuLaden={neuLaden}
            zumLoeschen={() => setLoeschen({ id: projekt.id, name: projekt.titel })}
          />
        ))}
      </div>

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

function ProjektKarte({
  projekt,
  ich,
  bearbeiten,
  statusFilter,
  neuLaden,
  zumLoeschen,
}: {
  projekt: ProjektTyp;
  ich: Ich;
  bearbeiten: boolean;
  statusFilter: string;
  neuLaden: () => void;
  zumLoeschen: () => void;
}) {
  const [neuePhase, setNeuePhase] = useState({ titel: "", art: "dev" });
  const [phasenFehler, setPhasenFehler] = useState("");

  async function phaseAnlegen() {
    if (!neuePhase.titel.trim()) return setPhasenFehler("Ohne Titel gibt es nichts anzulegen.");
    setPhasenFehler("");
    await hole("/phasen/", {
      method: "POST",
      body: JSON.stringify({
        projekt: projekt.id,
        titel: neuePhase.titel.trim(),
        art: neuePhase.art,
      }),
    });
    setNeuePhase({ titel: "", art: "dev" });
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
            (ich.darf.bearbeiten && !bearbeiten ? " Angelegt wird unter „Bearbeiten“." : "")
          }
        />
      ) : (
        projekt.phasen.map((phase, i) => (
          <Phasenblock
            key={phase.id}
            phase={phase}
            geschwister={projekt.phasen}
            stelle={i}
            ich={ich}
            bearbeiten={bearbeiten}
            statusFilter={statusFilter}
            neuLaden={neuLaden}
          />
        ))
      )}

      {ich.darf.bearbeiten && bearbeiten && (
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

function Phasenblock({
  phase,
  geschwister,
  stelle,
  ich,
  bearbeiten,
  statusFilter,
  neuLaden,
}: {
  phase: Projektphase;
  geschwister: Projektphase[];
  stelle: number;
  ich: Ich;
  bearbeiten: boolean;
  statusFilter: string;
  neuLaden: () => void;
}) {
  const [neuesPaket, setNeuesPaket] = useState("");
  const [paketFehler, setPaketFehler] = useState("");
  const [loeschen, setLoeschen] = useState(false);
  // Aufgeklappt ist, was läuft. Eine abgeschlossene Phase und eine, die erst
  // ansteht, sind zugeklappt — bei acht Phasen in einer Kette wäre die Seite
  // sonst eine Wand aus Leerstellen, und die zwei Pakete, an denen gerade
  // gearbeitet wird, stünden irgendwo in der Mitte.
  const [offen, setOffen] = useState(phase.stand === "laeuft");
  const pakete = phase.pakete.filter((p) => statusFilter === "alle" || p.status === statusFilter);
  const gebucht = phase.pakete.reduce((summe, p) => summe + p.gebuchte_sekunden, 0);

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
    await hole(`/phasen/${phase.id}/`, { method: "DELETE" });
    setLoeschen(false);
    neuLaden();
  }

  async function paketAnlegen() {
    if (!neuesPaket.trim()) return setPaketFehler("Ohne Titel gibt es nichts anzulegen.");
    setPaketFehler("");
    await hole("/pakete/", {
      method: "POST",
      body: JSON.stringify({ phase: phase.id, titel: neuesPaket.trim() }),
    });
    setNeuesPaket("");
    neuLaden();
  }

  return (
    <section className="projektphase" data-offen={offen ? "ja" : "nein"}>
      <h4>
        <button
          type="button"
          className="paket-aufklappen"
          onClick={() => setOffen((o) => !o)}
          aria-expanded={offen}
          aria-label={`${phase.titel} ${offen ? "zuklappen" : "aufklappen"}`}
        >
          <Zeichen name="zeiger" />
        </button>
        <Feldtext
          wert={phase.titel}
          aendern={ich.darf.bearbeiten && bearbeiten}
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
        {/* Der Stand: im Bearbeiten ein Auswahlfeld, sonst nur eine Marke —
            und die nur für „abgeschlossen": „läuft" sieht man daran, dass die
            Phase aufgeklappt ist, und „offen" ist der Normalfall. */}
        {ich.darf.bearbeiten && bearbeiten ? (
          <select
            // Dieselben Töne wie am Paket: abgeschlossen ist grün wie „fertig".
            className={`status status-${phase.stand === "abgeschlossen" ? "fertig" : phase.stand}`}
            value={phase.stand}
            aria-label={`Stand von ${phase.titel}`}
            onChange={async (e) => {
              await aendern(`/phasen/${phase.id}/`, { stand: e.target.value });
              neuLaden();
            }}
          >
            {PHASENSTAND.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        ) : (
          phase.stand === "abgeschlossen" && <span className="art abgeschlossen">abgeschlossen</span>
        )}
        {/* Zugeklappt sagt die Zeile, was drin ist — sonst müsste man jede
            Phase aufklappen, um zu sehen, ob sich das lohnt. Eine leere Phase
            sagt nichts: Dass sie noch aussteht, sieht man ihr an. */}
        {!offen && phase.pakete.length > 0 && (
          <span className="phase-summe">
            {`${phase.pakete.length} ${phase.pakete.length === 1 ? "Paket" : "Pakete"}` +
              (gebucht > 0 ? ` · ${alsDauer(gebucht)}` : "")}
          </span>
        )}
        {ich.darf.bearbeiten && bearbeiten && (
          <span className="ordnen">
            <button type="button" className="mini" disabled={stelle === 0} onClick={() => verschieben(-1)} title="Nach oben" aria-label="Nach oben">
              <Zeichen name="hoch" />
            </button>
            <button type="button" className="mini" disabled={stelle === geschwister.length - 1} onClick={() => verschieben(1)} title="Nach unten" aria-label="Nach unten">
              <Zeichen name="runter" />
            </button>
            {ich.darf.loeschen && (
              <button type="button" className="mini" onClick={() => setLoeschen(true)}>
                <Zeichen name="korb" />
                Entfernen
              </button>
            )}
          </span>
        )}
      </h4>

      {loeschen && bearbeiten && (
        <Loeschdialog
          name={phase.titel}
          was="Die Projektphase mit allen Arbeitspaketen darin"
          abbrechen={() => setLoeschen(false)}
          loeschen={entfernen}
        />
      )}

      {!offen ? null : pakete.length === 0 ? (
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
            ich={ich}
            bearbeiten={bearbeiten}
            neuLaden={neuLaden}
          />
        ))
      )}

      {offen && ich.darf.bearbeiten && bearbeiten && statusFilter === "alle" && (
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
  ich,
  bearbeiten,
  neuLaden,
}: {
  paket: Paket;
  geschwister: Paket[];
  stelle: number;
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
