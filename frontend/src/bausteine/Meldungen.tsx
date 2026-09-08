import { useEffect, useState } from "react";

import { schliessen, zuhoeren, type Meldung } from "../basis/meldungen";
import { Zeichen } from "./Zeichen";

export function Meldungen() {
  const [offen, setOffen] = useState<Meldung[]>([]);
  useEffect(() => zuhoeren(setOffen), []);

  if (offen.length === 0) return null;

  return (
    <div className="meldungen" role="status" aria-live="polite">
      {offen.map((m) => (
        <div key={m.id} className={`meldung meldung-${m.art}`}>
          <Zeichen name={m.art === "gut" ? "haken" : "achtung"} />
          <span>{m.text}</span>
          <button type="button" onClick={() => schliessen(m.id)} aria-label="Meldung schließen">
            <Zeichen name="kreuz" />
          </button>
        </div>
      ))}
    </div>
  );
}
