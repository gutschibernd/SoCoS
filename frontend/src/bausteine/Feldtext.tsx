import { useEffect, useRef, useState } from "react";

/**
 * Text, den man an Ort und Stelle ändert.
 *
 * Kein eigener Bearbeitungsmodus mit Speichern-Knopf: Bei einer Liste aus
 * dreißig Paketen wäre das dreißigmal ein Dialog. Gespeichert wird beim
 * Verlassen des Feldes oder mit Return; Escape nimmt zurück.
 */
export function Feldtext({
  wert,
  speichern,
  aendern,
  mehrzeilig,
  platzhalter,
  klasse,
}: {
  wert: string;
  speichern: (neu: string) => void | Promise<void>;
  aendern: boolean;
  mehrzeilig?: boolean;
  platzhalter?: string;
  klasse?: string;
}) {
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState(wert);
  const feld = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => setEntwurf(wert), [wert]);
  useEffect(() => {
    if (offen) feld.current?.focus();
  }, [offen]);

  // Im Lesemodus darf ein leerer Wert nicht wie ein gefüllter aussehen: Ein
  // schlicht gesetztes „Notiz zum Paket …" liest sich wie eine Notiz.
  if (!aendern) {
    if (wert) return <span className={klasse}>{wert}</span>;
    return <span className={klasse}><span className="leer">{platzhalter ?? "—"}</span></span>;
  }

  if (!offen) {
    return (
      <button
        type="button"
        className={`inline-aendern ${klasse ?? ""}`}
        onClick={() => setOffen(true)}
        title="Zum Ändern klicken"
      >
        {wert || <span className="leer">{platzhalter ?? "—"}</span>}
      </button>
    );
  }

  const fertig = () => {
    setOffen(false);
    if (entwurf.trim() !== wert) speichern(entwurf.trim());
  };

  const beiTaste = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEntwurf(wert);
      setOffen(false);
    }
    if (e.key === "Enter" && !mehrzeilig) {
      e.preventDefault();
      fertig();
    }
  };

  return mehrzeilig ? (
    <textarea
      ref={feld}
      className="feld"
      rows={3}
      value={entwurf}
      placeholder={platzhalter}
      onChange={(e) => setEntwurf(e.target.value)}
      onBlur={fertig}
      onKeyDown={beiTaste}
    />
  ) : (
    <input
      ref={feld}
      className="feld"
      value={entwurf}
      placeholder={platzhalter}
      onChange={(e) => setEntwurf(e.target.value)}
      onBlur={fertig}
      onKeyDown={beiTaste}
    />
  );
}
