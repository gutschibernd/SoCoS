import { useState } from "react";

import type { Paketgruppe } from "../basis/start";

/**
 * Die Nachfrage beim Clock-out: „Was hast du gemacht?"
 *
 * Überspringen ist erlaubt — aber mit einer Rückfrage. Eine erzwungene Notiz
 * führt dazu, dass „x" eingetragen wird, und dann steht überall „x".
 *
 * **Das Paket steht hier als Auswahlfeld und nicht als Text.** Seit die Uhr
 * auch ohne Paketwahl laufen darf, ist der Clock-out der Moment, in dem man
 * weiß, woran man gearbeitet hat — beim Anfangen weiß man es oft noch nicht.
 * Wer nichts ändert, bucht dorthin, wo die Uhr gelaufen ist.
 */
export function Notizdialog({
  wo,
  dauer,
  paket,
  gruppen,
  speichern,
  abbrechen,
}: {
  wo: string;
  dauer: string;
  paket: number;
  gruppen: Paketgruppe[];
  speichern: (notiz: string, paket: number) => void;
  abbrechen: () => void;
}) {
  const [notiz, setNotiz] = useState("");
  const [ziel, setZiel] = useState(paket);
  const [fragtNach, setFragtNach] = useState(false);

  // Das Projekt steht im Auswahlfeld nur als Gruppenkopf und ist zugeklappt
  // nicht zu sehen — „Laufendes · Allgemein" sagt nicht, dass das Overhead
  // ist. Deshalb darüber, und zwar zum **gewählten** Paket: Sonst widerspräche
  // die Zeile dem Feld, sobald jemand umbucht.
  const gewaehlt = gruppen.flatMap((g) => g.pakete).find((p) => p.id === ziel);

  if (fragtNach) {
    return (
      <div className="dialog-grund" role="dialog" aria-modal="true">
        <div className="dialog">
          <h2>Wirklich ohne Notiz?</h2>
          <p>
            Die Buchung wird gespeichert. In drei Monaten steht in der Liste dann nur
            die Uhrzeit — woran du gearbeitet hast, weiß dann niemand mehr.
          </p>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf-still" onClick={() => setFragtNach(false)}>
              Zurück, ich schreibe was
            </button>
            <button type="button" className="knopf" onClick={() => speichern("", ziel)}>
              Trotzdem überspringen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true">
      <div className="dialog">
        <h2>Was hast du gemacht?</h2>
        {/* Solange der Projektbaum noch nicht da ist, steht hier der Text —
            ein leeres Auswahlfeld nähme sonst das Paket weg, auf dem die
            Buchung tatsächlich läuft. */}
        <p>{gewaehlt ? `${gewaehlt.projekt} · ${gewaehlt.titel}` : wo} · {dauer}</p>
        {gruppen.length > 0 && (
          <select
            className="feld"
            value={ziel}
            onChange={(e) => setZiel(Number(e.target.value))}
            aria-label="Arbeitspaket"
          >
            {gruppen.map((gruppe) => (
              <optgroup key={gruppe.projekt} label={gruppe.projekt}>
                {gruppe.pakete.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titel}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <textarea
          className="feld"
          style={{ marginTop: gruppen.length > 0 ? 8 : 0 }}
          rows={3}
          autoFocus
          value={notiz}
          placeholder="Ein Satz reicht."
          onChange={(e) => setNotiz(e.target.value)}
        />
        <div className="dialog-knoepfe" style={{ marginTop: 14 }}>
          <button type="button" className="knopf-still" onClick={abbrechen}>
            Abbrechen
          </button>
          <button
            type="button"
            className="knopf-still"
            onClick={() => (notiz.trim() ? speichern(notiz, ziel) : setFragtNach(true))}
          >
            Überspringen
          </button>
          <button type="button" className="knopf" onClick={() => speichern(notiz, ziel)}>
            Speichern und Clock-out
          </button>
        </div>
      </div>
    </div>
  );
}
