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
 * es aus, als hätte das Feld die Eingabe weggeworfen.
 *
 * **Scheitert das Speichern, bleibt das Feld offen und der Entwurf darin.**
 * Bis 2026-11-04 ging er auf `wert` zurück, damit kein Text dasteht, den der
 * Server nicht hat — nur war damit alles weg, was jemand gerade geschrieben
 * hatte, und die Warnung daneben erklärte, warum. Ein offenes Feld sagt
 * dasselbe („noch nicht gespeichert"), ohne den Text zu nehmen. Escape nimmt
 * ihn zurück, wer das will.
 *
 * `hoechstens` ist die Länge des Feldes am Server. Ohne sie tippt man über die
 * Grenze hinaus und erfährt es erst beim Speichern.
 */
export function Feldtext({
  wert,
  speichern,
  aendern,
  mehrzeilig,
  zeilen,
  platzhalter,
  klasse,
  hoechstens,
}: {
  wert: string;
  /** Wirft oder liefert `false`, wenn nicht gespeichert wurde — beides hält den Entwurf im Feld. */
  speichern: (neu: string) => void | boolean | Promise<void | boolean>;
  aendern: boolean;
  mehrzeilig?: boolean;
  /** Wie hoch das aufgeklappte Feld ist. Drei Zeilen reichen für eine Notiz,
      nicht für einen Protokollabschnitt — der wäre sonst ein Guckloch. */
  zeilen?: number;
  platzhalter?: string;
  klasse?: string;
  hoechstens?: number;
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
    let geklappt = true;
    try {
      geklappt = (await speichern(neu)) !== false;
    } catch {
      geklappt = false; // `hole` hat den Grund schon gemeldet.
    }
    if (!geklappt) setOffen(true);
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
      rows={zeilen ?? 3}
      maxLength={hoechstens}
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
      maxLength={hoechstens}
      value={entwurf}
      placeholder={platzhalter}
      onChange={(e) => setEntwurf(e.target.value)}
      onBlur={fertig}
      onKeyDown={beiTaste}
    />
  );
}
