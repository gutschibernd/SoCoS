import { useEffect, useRef, useState } from "react";

/**
 * Ein `?` neben der Beschriftung statt eines erklärenden Absatzes in der Seite.
 *
 * Am Rechner geht es beim Überfahren auf, am Handy beim Antippen. Ein Absatz
 * mitten in der Seite wird ab dem dritten Öffnen nicht mehr gelesen, muss aber
 * jedesmal überblättert werden und kostet am Handy den halben Bildschirm.
 */
export function Hilfe({ text }: { text: string }) {
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!offen) return;
    const daneben = (e: MouseEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", daneben);
    return () => document.removeEventListener("mousedown", daneben);
  }, [offen]);

  return (
    <span
      className="hilfe"
      ref={huelle}
      onMouseEnter={() => setOffen(true)}
      onMouseLeave={() => setOffen(false)}
    >
      <button
        type="button"
        aria-label="Erklärung"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
      >
        ?
      </button>
      {offen && <span className="hilfe-text">{text}</span>}
    </span>
  );
}
