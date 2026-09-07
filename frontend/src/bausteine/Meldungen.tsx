import { useEffect, useState } from "react";

import { schliessen, zuhoeren, type Meldung } from "../basis/meldungen";

export function Meldungen() {
  const [offen, setOffen] = useState<Meldung[]>([]);
  useEffect(() => zuhoeren(setOffen), []);

  if (offen.length === 0) return null;

  return (
    <div className="meldungen" role="status" aria-live="polite">
      {offen.map((m) => (
        <div key={m.id} className={`meldung meldung-${m.art}`}>
          <span>{m.text}</span>
          <button type="button" onClick={() => schliessen(m.id)} aria-label="Meldung schließen">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
