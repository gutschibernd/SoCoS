import { useState } from "react";

import { hole } from "../basis/api";
import {
  useNeuLaden,
  useProjekte,
  type Bereich,
  type Ich,
  type Paket,
  type Projekt as ProjektTyp,
} from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { alsDauer } from "../basis/zeit";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
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

export function Projekt({ ich }: { ich: Ich }) {
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

  const sichtbar = projekte.filter((p) => projektFilter === "alle" || String(p.id) === projektFilter);

  if (projekte.length === 0) {
    return (
      <div className="karte">
        <Leerstelle
          was="Noch kein Projekt angelegt"
          satz={
            ich.darf.bearbeiten
              ? "Ein Projekt bekommt Bereiche (Entwicklung, Finanzierung, Ziele) und darin die Arbeitspakete, auf die Zeit gebucht wird."
              : "Projekte legt ein Bearbeiter oder Admin an."
          }
        />
        {ich.darf.bearbeiten && (
          <div className="feld-reihe" style={{ maxWidth: 520, margin: "0 auto" }}>
            <input
              className="feld"
              placeholder="Titel des Projekts"
              value={neuesProjekt}
              onChange={(e) => setNeuesProjekt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <button type="button" className="knopf" onClick={anlegen}>
              Projekt anlegen
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="spalte">
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
          {ich.darf.bearbeiten && (
            <>
              <input
                className="feld"
                placeholder="Neues Projekt"
                value={neuesProjekt}
                onChange={(e) => setNeuesProjekt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anlegen()}
              />
              <button type="button" className="knopf" onClick={anlegen}>
                Anlegen
              </button>
            </>
          )}
        </div>
      </div>

      {sichtbar.map((projekt) => (
        <ProjektKarte
          key={projekt.id}
          projekt={projekt}
          ich={ich}
          statusFilter={statusFilter}
          neuLaden={neuLaden}
          zumLoeschen={() => setLoeschen({ id: projekt.id, name: projekt.titel })}
        />
      ))}

      {loeschen && (
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
  statusFilter,
  neuLaden,
  zumLoeschen,
}: {
  projekt: ProjektTyp;
  ich: Ich;
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
        <div>
          <h3>{projekt.titel}</h3>
          {projekt.untertitel && <div className="unter">{projekt.untertitel}</div>}
        </div>
        <span className="zahl gebucht">{alsDauer(projekt.gebuchte_sekunden)} gebucht</span>
        {ich.darf.loeschen && (
          <button type="button" className="knopf-still" onClick={zumLoeschen}>
            Entfernen
          </button>
        )}
      </div>

      {projekt.bereiche.length === 0 ? (
        <Leerstelle
          was="Noch kein Bereich"
          satz="Bereiche gliedern das Projekt — Entwicklung, Finanzierung, Ziele. Jeder bringt seine eigene Stufenleiste mit."
        />
      ) : (
        projekt.bereiche.map((bereich) => (
          <BereichBlock
            key={bereich.id}
            bereich={bereich}
            ich={ich}
            statusFilter={statusFilter}
            neuLaden={neuLaden}
          />
        ))
      )}

      {ich.darf.bearbeiten && (
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
            Bereich anlegen
          </button>
        </div>
      )}
    </div>
  );
}

function BereichBlock({
  bereich,
  ich,
  statusFilter,
  neuLaden,
}: {
  bereich: Bereich;
  ich: Ich;
  statusFilter: string;
  neuLaden: () => void;
}) {
  const [neuesPaket, setNeuesPaket] = useState("");
  const pakete = bereich.pakete.filter((p) => statusFilter === "alle" || p.status === statusFilter);

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
        {bereich.titel}
        {/* Die Art nur zeigen, wenn sie etwas hinzufügt. „Entwicklung
            Entwicklung" ist Rauschen, das man beim Lesen jedes Mal aussortiert. */}
        {ART[bereich.art].toLowerCase() !== bereich.titel.trim().toLowerCase() && (
          <span className="art">{ART[bereich.art]}</span>
        )}
        <Hilfe
          text={`Stufen dieses Bereichs: ${bereich.stufen
            .map((s) => `${s.name} (${s.monate} Mon.)`)
            .join(" · ")}. Der Fortschritt rechnet über die Monate, nicht über die Anzahl.`}
        />
      </h4>

      {pakete.length === 0 ? (
        <Leerstelle
          was={statusFilter === "alle" ? "Noch kein Arbeitspaket" : "Kein Paket in diesem Filter"}
          satz={
            statusFilter === "alle"
              ? "Auf ein Arbeitspaket wird Zeit gebucht — es ist die kleinste Einheit, die in Auswertungen auftaucht."
              : "Anderer Status oder Filter zurücksetzen."
          }
        />
      ) : (
        pakete.map((paket) => (
          <PaketZeile key={paket.id} paket={paket} ich={ich} neuLaden={neuLaden} />
        ))
      )}

      {ich.darf.bearbeiten && statusFilter === "alle" && (
        <div className="feld-reihe" style={{ marginTop: 10 }}>
          <input
            className="feld"
            placeholder="Neues Arbeitspaket"
            value={neuesPaket}
            onChange={(e) => setNeuesPaket(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && paketAnlegen()}
          />
          <button type="button" className="knopf-still" onClick={paketAnlegen}>
            Paket anlegen
          </button>
        </div>
      )}
    </section>
  );
}

function PaketZeile({
  paket,
  ich,
  neuLaden,
}: {
  paket: Paket;
  ich: Ich;
  neuLaden: () => void;
}) {
  const [offen, setOffen] = useState(false);
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

  async function statusSetzen(status: string) {
    await hole(`/pakete/${paket.id}/`, { method: "PATCH", body: JSON.stringify({ status }) });
    neuLaden();
  }

  async function uhrStarten() {
    await hole("/zeiten/clock_in/", { method: "POST", body: JSON.stringify({ paket: paket.id }) });
    neuLaden();
  }

  return (
    <article className="paket">
      <div className="paket-kopf">
        <button type="button" className="paket-titel" onClick={() => setOffen((o) => !o)}>
          <span aria-hidden>{offen ? "▾" : "▸"}</span>
          {paket.titel}
        </button>

        {ich.darf.bearbeiten ? (
          <select
            className={`status status-${paket.status}`}
            value={paket.status}
            onChange={(e) => statusSetzen(e.target.value)}
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

        {ich.darf.bearbeiten && (
          <button type="button" className="knopf-still" onClick={uhrStarten}>
            Clock-in
          </button>
        )}
      </div>

      <div className="balken">
        <i style={{ width: `${paket.fortschritt}%` }} />
      </div>

      {offen && (
        <div className="paket-tiefe">
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

          {paket.notiz && <p className="notiz">{paket.notiz}</p>}

          {paket.unteraufgaben.length > 0 && (
            <ul className="unteraufgaben">
              {paket.unteraufgaben.map((u) => (
                <li key={u.id}>
                  <input type="checkbox" checked={u.erledigt} readOnly />
                  <span data-erledigt={u.erledigt ? "ja" : "nein"}>{u.titel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
