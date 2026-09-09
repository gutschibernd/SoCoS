import { useEffect, useRef, useState } from "react";

/**
 * Text, den man an Ort und Stelle ändert.
 *
 * Kein eigener Bearbeitungsmodus mit Speichern-Knopf: Bei einer Liste aus
 * dreißig Paketen wäre das dreißigmal ein Dialog. Gespeichert wird beim
 * Verlassen des Feldes oder mit Return; Escape nimmt zurück.
 *
 * **Ohne Speichern-Knopf ist der neue Text selbst die Bestätigung.** Deshalb
 * steht nach dem Schließen der eigene Entwurf da und nicht `wert`: Der Prop
 * trägt noch den alten Stand, bis das Nachladen ankommt, und in der Lücke sah
 * es aus, als hätte das Feld die Eingabe weggeworfen. Scheitert das Speichern,
 * geht der Entwurf auf `wert` zurück — sonst stünde ein Text auf dem
 * Bildschirm, den der Server nicht hat.
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
        {entwurf || <span className="leer">{platzhalter ?? "—"}</span>}
      </button>
    );
  }

  const fertig = async () => {
    setOffen(false);
    const neu = entwurf.trim();
    setEntwurf(neu);
    if (neu === wert) return;
    try {
      await speichern(neu);
    } catch {
      // `hole` hat den Grund schon gemeldet. Hier bleibt nur, den Entwurf
      // wieder auf den Stand zu setzen, den der Server tatsächlich hat.
      setEntwurf(wert);
    }
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
