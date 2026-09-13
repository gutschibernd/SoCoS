/**
 * Wünsche und Fehler — was uns an der Software auffällt.
 *
 * **Melden darf jeder, den Stand setzt ein Admin.** Beides entscheidet der
 * Server (`socos/berechtigung.py`); hier wird nur ausgeblendet, was ohnehin
 * abgewiesen würde — ein Auswahlfeld, das bei jedem Klick eine rote Meldung
 * bringt, ist schlechter als keines.
 *
 * Die Liste ist nach Abschnitten gebündelt: erst das Offene, dann das
 * Erledigte **je Version**. Was die Bündelung soll, steht in
 * `basis/rueckmeldungen.ts` — die Frage hier ist „was kam mit dem letzten
 * Update", und die beantwortet eine Liste mit Versionen an den Zeilen erst,
 * wenn man sie im Kopf sortiert.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, useRueckmeldungen, type Ich, type Rueckmeldung } from "../basis/daten";
import { melden } from "../basis/meldungen";
import {
  abschnitte,
  ARTEN,
  artText,
  STAENDE,
  standKlasse,
  standText,
} from "../basis/rueckmeldungen";
import { Zustand } from "../basis/Zustand";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

/* Die Klassen heißen „zettel" und nicht „meldung": `.meldung` ist im Stil
   schon vergeben — das ist der kurze Hinweis, der oben rechts aufgeht. Zwei
   Bedeutungen an einem Klassennamen laufen beim nächsten Anfassen auseinander. */

const TAG = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function Rueckmeldungen({ ich }: { ich: Ich }) {
  const liste = useRueckmeldungen();
  const neuLaden = useNeuLaden();
  const [entfernen, setEntfernen] = useState<Rueckmeldung | null>(null);

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  const gruppen = abschnitte(liste.data);
  // Aus /api/ich/ und nicht aus der Rolle: Die Schwelle steht an genau einer
  // Stelle, und die ist socos/berechtigung.py.
  const darfVerwalten = ich.darf.rueckmeldungen_verwalten;

  async function aendern(id: number, daten: Partial<Rueckmeldung>) {
    await hole(`/rueckmeldungen/${id}/`, { method: "PATCH", body: JSON.stringify(daten) });
    neuLaden();
  }

  async function wirklichEntfernen(eintrag: Rueckmeldung) {
    await hole(`/rueckmeldungen/${eintrag.id}/`, { method: "DELETE" });
    setEntfernen(null);
    melden("gut", "Eintrag entfernt.");
    neuLaden();
  }

  return (
    <div className="spalte">
      <Melden />

      {gruppen.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was="Noch nichts gemeldet"
            satz="Was fehlt oder stört, gehört hier herein — auch Kleinigkeiten. Wer es aufschreibt, muss es nicht merken."
          />
        </div>
      ) : (
        gruppen.map((gruppe) => (
          <div key={gruppe.titel} className="karte">
            <div className="kartenkopf">
              <h2>{gruppe.titel}</h2>
              <span className="beschriftung-klein">{gruppe.eintraege.length}</span>
            </div>

            <ul className="zettelliste">
              {gruppe.eintraege.map((eintrag) => (
                <Zeile
                  key={eintrag.id}
                  eintrag={eintrag}
                  ich={ich}
                  darfVerwalten={darfVerwalten}
                  aendern={aendern}
                  entfernen={() => setEntfernen(eintrag)}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      {entfernen && (
        <Loeschdialog
          name={entfernen.titel}
          was="Die Meldung"
          milder={{
            text: "Lieber ablehnen",
            tun: async () => {
              await aendern(entfernen.id, { stand: "abgelehnt" });
              setEntfernen(null);
            },
          }}
          abbrechen={() => setEntfernen(null)}
          loeschen={() => wirklichEntfernen(entfernen)}
        />
      )}
    </div>
  );
}

/**
 * Das Formular steht oben und immer offen — nicht hinter einem „Neu"-Knopf.
 *
 * Wer einen Fehler melden will, hat ihn gerade gesehen und will ihn loswerden,
 * bevor er ihn vergisst. Ein Klick mehr ist an dieser Stelle der Unterschied
 * zwischen „aufgeschrieben" und „ist mir später wieder eingefallen".
 */
function Melden() {
  const neuLaden = useNeuLaden();
  const [art, setArt] = useState<Rueckmeldung["art"]>("fehler");
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setLaeuft(true);
    try {
      await hole("/rueckmeldungen/", {
        method: "POST",
        body: JSON.stringify({ art, titel: titel.trim(), text: text.trim() }),
      });
      setTitel("");
      setText("");
      melden("gut", "Danke — steht in der Liste.");
      neuLaden();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="karte" onSubmit={abschicken}>
      <h2>Etwas melden</h2>

      <div className="zettel-arten" role="group" aria-label="Art">
        {ARTEN.map((a) => (
          <button
            key={a.wert}
            type="button"
            className="knopf-still"
            aria-pressed={art === a.wert}
            onClick={() => setArt(a.wert)}
          >
            {a.text}
          </button>
        ))}
      </div>

      <label className="profilfeld">
        <span className="beschriftung-klein">Worum geht es?</span>
        <input
          className="feld"
          value={titel}
          maxLength={200}
          onChange={(e) => setTitel(e.target.value)}
          placeholder={
            art === "fehler" ? "Die Uhr zählt nach dem Clock-out weiter" : "Zeiten als CSV ausgeben"
          }
        />
      </label>

      <label className="profilfeld">
        <span className="beschriftung-klein">Was genau passiert — und was erwartet wäre</span>
        <textarea
          className="feld"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Wo war das, was hast du gedrückt, was kam heraus?"
        />
      </label>

      <button type="submit" className="knopf" disabled={laeuft || !titel.trim()}>
        <Zeichen name="sprechblase" />
        Abschicken
      </button>
    </form>
  );
}

function Zeile({
  eintrag,
  ich,
  darfVerwalten,
  aendern,
  entfernen,
}: {
  eintrag: Rueckmeldung;
  ich: Ich;
  darfVerwalten: boolean;
  aendern: (id: number, daten: Partial<Rueckmeldung>) => Promise<void>;
  entfernen: () => void;
}) {
  const [antwort, setAntwort] = useState(eintrag.antwort);
  const [offen, setOffen] = useState(false);

  return (
    <li className="zettel" data-art={eintrag.art}>
      <div className="zettel-kopf">
        <span className="zettel-art">{artText(eintrag.art)}</span>
        <b className="zettel-titel">{eintrag.titel}</b>
        <span className={`status ${standKlasse(eintrag.stand)}`}>
          {standText(eintrag.stand)}
          {eintrag.erledigt_in && ` · ${eintrag.erledigt_in}`}
        </span>
      </div>

      {eintrag.text && <p className="zettel-text">{eintrag.text}</p>}

      <div className="zettel-fuss">
        <span>
          {eintrag.melder_name || "unbekannt"}
          {eintrag.melder === ich.id && <span className="team-du">du</span>} ·{" "}
          {TAG.format(new Date(eintrag.erstellt_am))}
        </span>

        {darfVerwalten && (
          <button type="button" className="mini" onClick={() => setOffen((o) => !o)}>
            <Zeichen name="stift" />
            {offen ? "Fertig" : "Stand ändern"}
          </button>
        )}
      </div>

      {eintrag.antwort && !offen && (
        <p className="zettel-antwort">
          <b>Antwort:</b> {eintrag.antwort}
        </p>
      )}

      {/* Nur für den Admin, und nur aufgeklappt: Die Liste ist zum Lesen da.
          Die Werkzeuge stehen dahinter, wo sie beim Überfliegen nicht im Weg
          sind. */}
      {darfVerwalten && offen && (
        <div className="zettel-werkzeug">
          <div className="feld-reihe">
            <select
              className="feld"
              value={eintrag.stand}
              aria-label="Stand"
              onChange={(e) =>
                aendern(eintrag.id, {
                  stand: e.target.value as Rueckmeldung["stand"],
                  // „Erledigt" ohne Version ist eine halbe Auskunft. Die
                  // Version steht daneben und kann von Hand geändert werden.
                  ...(e.target.value === "erledigt" && !eintrag.erledigt_in
                    ? { erledigt_in: heute() }
                    : {}),
                })
              }
            >
              {STAENDE.map((s) => (
                <option key={s.wert} value={s.wert}>
                  {s.text}
                </option>
              ))}
            </select>

            <input
              className="feld"
              value={eintrag.erledigt_in}
              placeholder="Version, z. B. 2026-09-13"
              aria-label="Erledigt in Version"
              onChange={(e) => aendern(eintrag.id, { erledigt_in: e.target.value })}
            />

            <button type="button" className="mini" onClick={entfernen}>
              <Zeichen name="korb" />
              Entfernen
            </button>
          </div>

          <div className="feld-reihe">
            <textarea
              className="feld"
              rows={2}
              value={antwort}
              placeholder="Antwort an den Melder — warum abgelehnt, was stattdessen, ab wann."
              onChange={(e) => setAntwort(e.target.value)}
              onBlur={() => antwort !== eintrag.antwort && aendern(eintrag.id, { antwort })}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/** Heute als `JJJJ-MM-TT` — dieselbe Form wie eine Version in aenderungen.py. */
function heute(): string {
  const jetzt = new Date();
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}
