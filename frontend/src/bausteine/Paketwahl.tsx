import { useEffect, useRef, useState } from "react";

import { paketeSuchen, type Paketgruppe } from "../basis/start";
import { Zeichen } from "./Zeichen";

/**
 * Das Arbeitspaket wählen — ein Feld mit Suche statt eines Auswahlmenüs.
 *
 * **Warum kein `<select>` mehr:** Zugeklappt zeigt es genau eine Zeile, und
 * die heißt bei vielen Paketen „Allgemein". Zu welchem Projekt das gehört,
 * steht im Gruppenkopf — und den sieht man nur aufgeklappt. Aufgeklappt wird
 * die Liste dafür so lang wie der ganze Projektbaum, ohne jede Möglichkeit,
 * darin zu suchen; am Handy übernimmt das Betriebssystem und zeigt ein Rad,
 * in dem Projekt und Paket erst recht nicht nebeneinander stehen.
 *
 * Hier steht beides immer nebeneinander, die zuletzt bebuchten Pakete stehen
 * oben, und drei getippte Buchstaben führen hin. Dieselbe Wahl gibt es an drei
 * Stellen (nachtragen, ändern, Clock-out) — deshalb hier und nicht dreimal.
 */
export function Paketwahl({
  gruppen,
  wert,
  setzen,
  zuletzt = [],
  beschriftung = "Arbeitspaket",
}: {
  gruppen: Paketgruppe[];
  wert: number;
  setzen: (id: number) => void;
  /** Paketnummern der letzten Buchungen, neueste zuerst. Stehen oben. */
  zuletzt?: number[];
  beschriftung?: string;
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const eingabe = useRef<HTMLInputElement>(null);

  // Das Suchfeld gibt es erst, wenn die Liste offen ist — `autoFocus` allein
  // zöge den Blick beim ersten Zeichnen der Seite an sich.
  useEffect(() => {
    if (offen) eingabe.current?.focus();
  }, [offen]);

  const treffer = paketeSuchen(gruppen, suche, zuletzt);
  const gewaehlt = gruppen.flatMap((g) => g.pakete).find((p) => p.id === wert);

  function waehlen(id: number) {
    setzen(id);
    setSuche("");
    setOffen(false);
  }

  return (
    <div className="paketwahl">
      <button
        type="button"
        className="wahlfeld"
        aria-haspopup="listbox"
        aria-expanded={offen}
        aria-label={beschriftung}
        onClick={() => {
          // Jedes Aufmachen fängt bei der vollen Liste an: Ein Suchwort von
          // vorgestern ließe das Feld leer aussehen, obwohl Pakete da sind.
          setSuche("");
          setOffen((o) => !o);
        }}
      >
        <span className="wahlfeld-text">
          {gewaehlt ? (
            <>
              <b>{gewaehlt.titel}</b>
              <em>{gewaehlt.projekt}</em>
            </>
          ) : (
            <b className="wahlfeld-leer">Arbeitspaket wählen</b>
          )}
        </span>
        <Zeichen name="runter" />
      </button>

      {offen && (
        <>
          {/* Fängt den Klick daneben ab — auch am Handy, wo es kein „außerhalb
              des Feldes" gibt, auf das man zielen könnte. */}
          <div className="wahl-grund" onClick={() => setOffen(false)} />
          <div className="wahlliste">
            <input
              ref={eingabe}
              className="feld"
              value={suche}
              placeholder="Suchen — Projekt oder Paket"
              aria-label="Paket suchen"
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOffen(false);
                // Tippen und Return — der schnellste Weg, wenn man weiß, wie
                // das Paket heißt.
                if (e.key === "Enter" && treffer[0]) waehlen(treffer[0].id);
              }}
            />
            <div className="wahl-treffer" role="listbox" aria-label={beschriftung}>
              {treffer.length === 0 ? (
                <p className="wahl-nichts">Kein Paket passt dazu.</p>
              ) : (
                treffer.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={p.id === wert}
                    className="wahl-eintrag"
                    onClick={() => waehlen(p.id)}
                  >
                    <b>{p.titel}</b>
                    <em>{p.projekt}</em>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
