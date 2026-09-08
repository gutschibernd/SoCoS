import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import {
  useNeuLaden,
  useProjekte,
  type Bereich,
  type Ich,
  type Paket,
  type Projekt as ProjektTyp,
  type Stufe,
} from "../basis/daten";
import { alsPfad, type Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { alsDauer } from "../basis/zeit";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Feldtext } from "../bausteine/Feldtext";
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

/*
  Zwei Modi, eine Ansicht.

  Die Übersicht ist zum Arbeiten: Status setzen, Stufen klicken, Notiz
  schreiben, Haken setzen, Uhr starten. Die Gliederung — anlegen, umordnen,
  entfernen — steht unter /projekt/bearbeiten und nur dort.

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
  const [loeschen, setLoeschen] = useState<{ id: number; name: string } | null>(null);

  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const projekte = abfrage.data;

  async function anlegen() {
    if (!neuesProjekt.trim()) return;
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
                  ? "Ein Projekt bekommt Bereiche (Entwicklung, Finanzierung, Ziele) und darin die Arbeitspakete, auf die Zeit gebucht wird."
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
      </div>

      {/* Nebeneinander, sobald der Platz für zwei Spalten reicht — am Laptop
          stehen die beiden Projekte sonst untereinander und man scrollt an
          einer halbleeren Seite vorbei. */}
      <div className="projekt-raster">
        {sichtbar.map((projekt) => (
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
          was="Das Projekt mit allen Bereichen und Paketen"
          abbrechen={() => setLoeschen(null)}
          loeschen={() => projektEntfernen(loeschen.id)}
        />
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
  const [neuerBereich, setNeuerBereich] = useState({ titel: "", art: "dev" });

  async function bereichAnlegen() {
    if (!neuerBereich.titel.trim()) return;
    await hole("/bereiche/", {
      method: "POST",
      body: JSON.stringify({
        projekt: projekt.id,
        titel: neuerBereich.titel.trim(),
        art: neuerBereich.art,
      }),
    });
    setNeuerBereich({ titel: "", art: "dev" });
    neuLaden();
  }

  return (
    <div className="karte" style={{ borderTop: `3px solid ${projekt.farbe}` }}>
      <div className="projekt-kopf">
        <div style={{ minWidth: 200 }}>
          <h3>
            <Feldtext
              wert={projekt.titel}
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={(titel) => aendern(`/projekte/${projekt.id}/`, { titel })}
            />
          </h3>
          <div className="unter">
            <Feldtext
              wert={projekt.untertitel}
              platzhalter="Untertitel …"
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={(untertitel) => aendern(`/projekte/${projekt.id}/`, { untertitel })}
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

      {projekt.bereiche.length === 0 ? (
        <Leerstelle
          was="Noch kein Bereich"
          satz={
            "Bereiche gliedern das Projekt — Entwicklung, Finanzierung, Ziele. Jeder bringt seine eigene Stufenleiste mit." +
            (ich.darf.bearbeiten && !bearbeiten ? " Angelegt wird unter „Bearbeiten“." : "")
          }
        />
      ) : (
        projekt.bereiche.map((bereich, i) => (
          <BereichBlock
            key={bereich.id}
            bereich={bereich}
            geschwister={projekt.bereiche}
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
            placeholder="Neuer Bereich"
            value={neuerBereich.titel}
            onChange={(e) => setNeuerBereich({ ...neuerBereich, titel: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && bereichAnlegen()}
          />
          <select
            className="feld"
            value={neuerBereich.art}
            onChange={(e) => setNeuerBereich({ ...neuerBereich, art: e.target.value })}
            aria-label="Art des Bereichs"
          >
            {Object.entries(ART).map(([wert, text]) => (
              <option key={wert} value={wert}>
                {text}
              </option>
            ))}
          </select>
          <button type="button" className="knopf-still" onClick={bereichAnlegen}>
            <Zeichen name="plus" />
            Bereich anlegen
          </button>
        </div>
      )}
    </div>
  );
}

function BereichBlock({
  bereich,
  geschwister,
  stelle,
  ich,
  bearbeiten,
  statusFilter,
  neuLaden,
}: {
  bereich: Bereich;
  geschwister: Bereich[];
  stelle: number;
  ich: Ich;
  bearbeiten: boolean;
  statusFilter: string;
  neuLaden: () => void;
}) {
  const [neuesPaket, setNeuesPaket] = useState("");
  const [loeschen, setLoeschen] = useState(false);
  const pakete = bereich.pakete.filter((p) => statusFilter === "alle" || p.status === statusFilter);

  async function verschieben(richtung: -1 | 1) {
    const nachbar = geschwister[stelle + richtung];
    if (!nachbar) return;
    // Beide Nummern tauschen, nicht nur eine hochzählen: Sonst wandern zwei
    // Einträge auf dieselbe Zahl und die Reihenfolge wird zufällig.
    await aendern(`/bereiche/${bereich.id}/`, { reihenfolge: stelle + richtung });
    await aendern(`/bereiche/${nachbar.id}/`, { reihenfolge: stelle });
    neuLaden();
  }

  async function entfernen() {
    await hole(`/bereiche/${bereich.id}/`, { method: "DELETE" });
    setLoeschen(false);
    neuLaden();
  }

  async function paketAnlegen() {
    if (!neuesPaket.trim()) return;
    await hole("/pakete/", {
      method: "POST",
      body: JSON.stringify({ bereich: bereich.id, titel: neuesPaket.trim() }),
    });
    setNeuesPaket("");
    neuLaden();
  }

  return (
    <section className="bereich">
      <h4>
        <Feldtext
          wert={bereich.titel}
          aendern={ich.darf.bearbeiten && bearbeiten}
          speichern={async (titel) => {
            await aendern(`/bereiche/${bereich.id}/`, { titel });
            neuLaden();
          }}
        />
        {/* Die Art nur zeigen, wenn sie etwas hinzufügt. „Entwicklung
            Entwicklung" ist Rauschen, das man beim Lesen jedes Mal aussortiert. */}
        {ART[bereich.art].toLowerCase() !== bereich.titel.trim().toLowerCase() && (
          <span className="art">{ART[bereich.art]}</span>
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
          name={bereich.titel}
          was="Der Bereich mit allen Arbeitspaketen darin"
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
            ich={ich}
            bearbeiten={bearbeiten}
            neuLaden={neuLaden}
          />
        ))
      )}

      {ich.darf.bearbeiten && bearbeiten && statusFilter === "alle" && (
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
        </div>
      )}
    </section>
  );
}

/**
 * Die Stufenleiste eines Pakets ändern: Vorlage übernehmen, Namen und Dauern
 * eintragen, Stufen hinzunehmen oder streichen.
 *
 * Gespeichert wird immer die **ganze Liste**, nie eine einzelne Stufe. Eine
 * Stufe hat keine eigene Kennung — sie ist eine Stelle in einer Liste. Einzeln
 * zu speichern hieße, sich diese Stelle zu merken, und beim Streichen liefe
 * das auseinander.
 *
 * Die Vorlagen kommen nicht von hier: Der Aufruf schickt nur ihren Namen, den
 * Inhalt kennt allein der Server. Sonst stünden die Stufen an zwei Stellen.
 */
function Stufenbearbeitung({ paket, neuLaden }: { paket: Paket; neuLaden: () => void }) {
  const [entwurf, setEntwurf] = useState<Stufe[]>(paket.stufen);

  // Was der Server schickt, gilt — nach einer Vorlage oder einer Änderung von
  // einem zweiten Gerät. Verglichen wird der Inhalt, nicht die Kennung des
  // Feldes: Jeder Abruf liefert ein neues Feld mit denselben Werten.
  const vomServer = JSON.stringify(paket.stufen);
  useEffect(() => setEntwurf(JSON.parse(vomServer) as Stufe[]), [vomServer]);

  async function speichern(stufen: Stufe[]) {
    setEntwurf(stufen);
    await aendern(`/pakete/${paket.id}/`, { stufen });
    neuLaden();
  }

  async function vorlageUebernehmen(vorlage: string) {
    await hole(`/pakete/${paket.id}/vorlage/`, {
      method: "POST",
      body: JSON.stringify({ vorlage }),
    });
    neuLaden();
  }

  const geaendert = (i: number, teil: Partial<Stufe>) =>
    setEntwurf(entwurf.map((s, j) => (j === i ? { ...s, ...teil } : s)));

  return (
    <div className="stufen-bearbeiten">
      <div className="stufen-vorlage">
        <select
          className="feld feld-klein"
          value=""
          aria-label="Vorlage für die Stufen übernehmen"
          onChange={(e) => {
            const gewaehlt = e.target.value;
            e.target.value = "";
            if (gewaehlt) vorlageUebernehmen(gewaehlt);
          }}
        >
          <option value="">Vorlage übernehmen …</option>
          {Object.entries(ART).map(([wert, text]) => (
            <option key={wert} value={wert}>
              {text}
            </option>
          ))}
        </select>
        <Hilfe text="Eine Vorlage ersetzt die ganze Leiste und setzt den Stand auf null — „Stufe 3“ heißt in einer anderen Leiste etwas anderes." />
      </div>

      <ul className="stufen-liste">
        {entwurf.map((stufe, i) => (
          // Der Index als Schlüssel: Eine Stufe hat keine Kennung, und die
          // Liste wird nur am Ende länger oder um eine Stelle kürzer.
          <li key={i}>
            <input
              className="feld"
              value={stufe.name}
              aria-label={`Name der ${i + 1}. Stufe`}
              onChange={(e) => geaendert(i, { name: e.target.value })}
              onBlur={() => speichern(entwurf)}
            />
            <input
              className="feld feld-monate"
              type="number"
              min={0}
              max={120}
              value={stufe.monate}
              aria-label={`Dauer der ${i + 1}. Stufe in Monaten`}
              onChange={(e) => geaendert(i, { monate: Number(e.target.value) })}
              onBlur={() => speichern(entwurf)}
            />
            <span className="einheit">Mon.</span>
            <button
              type="button"
              className="mini"
              aria-label={`Stufe „${stufe.name}“ entfernen`}
              onClick={() => speichern(entwurf.filter((_, j) => j !== i))}
            >
              <Zeichen name="kreuz" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="knopf-still"
        onClick={() => speichern([...entwurf, { name: "Neue Stufe", monate: 1 }])}
      >
        <Zeichen name="plus" />
        Stufe hinzufügen
      </button>
    </div>
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
  const [offen, setOffen] = useState(false);
  const [neueAufgabe, setNeueAufgabe] = useState("");
  const [loeschen, setLoeschen] = useState(false);
  const [fehler, setFehler] = useState("");
  const gesamtMonate = paket.stufen.reduce((s, x) => s + x.monate, 0) || 1;

  async function stufeSetzen(stand: number) {
    // Ein zweiter Klick auf dieselbe Stufe nimmt sie zurück — sonst käme man
    // von einem Fehlgriff nur über den Umweg der Nachbarstufe wieder weg.
    const ziel = paket.stufenstand === stand ? stand - 1 : stand;
    await hole(`/pakete/${paket.id}/stufe/`, {
      method: "POST",
      body: JSON.stringify({ stufenstand: Math.max(0, ziel) }),
    });
    neuLaden();
  }

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
    await hole("/zeiten/clock_in/", { method: "POST", body: JSON.stringify({ paket: paket.id }) });
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
    if (!neueAufgabe.trim()) return;
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

        <span className="zahl fortschritt">{paket.fortschritt} %</span>

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

      <div className="balken">
        <i style={{ width: `${paket.fortschritt}%` }} />
      </div>

      {fehler && <p className="rueckmeldung schlecht">{fehler}</p>}

      {offen && (
        <div className="paket-tiefe">
          <div className="stufen-kopf">
            <span>Stufen</span>
            <Hilfe text="Der Fortschritt rechnet über die Monate, nicht über die Anzahl: „Umsetzung“ mit drei Monaten neben „Konzept“ mit einem ist die Hälfte des Weges, nicht ein Viertel. Ein Klick setzt den Stand, ein zweiter auf dieselbe Stufe nimmt ihn zurück." />
          </div>
          <div className="stufen">
            {paket.stufen.map((stufe, i) => (
              <button
                key={stufe.name}
                type="button"
                className="stufe"
                data-erledigt={i < paket.stufenstand ? "ja" : "nein"}
                style={{ ["--anteil" as string]: stufe.monate / gesamtMonate }}
                disabled={!ich.darf.bearbeiten}
                onClick={() => stufeSetzen(i + 1)}
              >
                <span>{stufe.name}</span>
                <span className="monate">{stufe.monate} Mon.</span>
              </button>
            ))}
          </div>

          {ich.darf.bearbeiten && bearbeiten && (
            <Stufenbearbeitung paket={paket} neuLaden={neuLaden} />
          )}

          <div className="notiz">
            <Feldtext
              wert={paket.notiz}
              mehrzeilig
              platzhalter="Notiz zum Paket …"
              aendern={ich.darf.bearbeiten && bearbeiten}
              speichern={async (notiz) => {
                await aendern(`/pakete/${paket.id}/`, { notiz });
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
