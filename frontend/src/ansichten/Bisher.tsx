/**
 * Was Sopharmis bisher bekommen hat — die Seite hinter dem Diamanten unten
 * rechts auf der Förderungsseite, erst nach dem PIN.
 *
 * Die Beträge holt erst der richtige PIN vom Server (`socos/bisher.py`) — im
 * Bundle stehen sie nicht, und sonst nirgends in SoCoS. Wer die Seite
 * verlässt und wiederkommt, gibt den PIN neu ein: Gemerkt wird er nirgends.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { hole } from "../basis/api";
import { alsEuro } from "../basis/module";

type Aufstellung = { posten: { von: string; wofuer: string; betrag: string }[]; summe: string };

export function Bisherseite() {
  const [daten, setDaten] = useState<Aufstellung | null>(null);
  return daten ? <Tabelle daten={daten} /> : <Pinfeld offen={setDaten} />;
}

function Pinfeld({ offen }: { offen: (d: Aufstellung) => void }) {
  const [pin, setPin] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => feld.current?.focus(), []);

  async function pruefen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    try {
      offen(await hole<Aufstellung>("/bisher/", { method: "POST", body: JSON.stringify({ pin }) }));
    } catch {
      // „Der PIN stimmt nicht." meldet `hole` selbst oben rechts, wie jeden
      // gescheiterten Schreibaufruf — hier nur das Feld frei machen.
      setPin("");
      feld.current?.focus();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="karte bisher bisher-pin" onSubmit={pruefen}>
      <label>
        PIN
        <input
          ref={feld}
          className="feld"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </label>
      <button type="submit" className="knopf" disabled={laeuft || !pin.trim()}>
        Öffnen
      </button>
    </form>
  );
}

function Tabelle({ daten }: { daten: Aufstellung }) {
  return (
    <div className="karte bisher">
      <p className="bisher-satz">
        Diese Zahlen stehen nur hier — in keiner Auswertung, keiner Planung und nirgends sonst in SoCoS.
      </p>
      <table className="tabelle bisher-tabelle">
        <thead>
          <tr>
            <th>Von</th>
            <th className="bisher-betrag">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {daten.posten.map((p, i) => (
            <tr key={i}>
              <td>
                <b>{p.von}</b>
                {p.wofuer && <span className="bisher-wofuer">{p.wofuer}</span>}
              </td>
              <td data-spalte="Betrag" className="zahl bisher-betrag">
                {alsEuro(p.betrag)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bisher-summe">
        Zusammen <b className="zahl">{alsEuro(daten.summe)}</b>
      </p>
    </div>
  );
}
