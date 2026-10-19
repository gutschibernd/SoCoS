import { useEffect, useRef } from "react";

/**
 * Die Nachfrage vor dem Löschen.
 *
 * Kein `window.confirm`. Wichtiger als die Rückfrage ist, **was darin steht**:
 * Sie nennt den Namen und schlägt den milderen Weg vor. Bei einem
 * Zeiterfassungssystem ist „wer hat wann woran gearbeitet" über Jahre die
 * häufigere Frage als „weg damit".
 *
 * Der Fokus steht auf „Behalten", und Esc schließt: Wer aus Versehen hier
 * landet und Enter drückt, behält — er entfernt nicht. Vorher stand der Fokus
 * auf dem Knopf, der das Fenster geöffnet hatte, und Esc tat nichts.
 */
export function Loeschdialog({
  name,
  was,
  milder,
  abbrechen,
  loeschen,
  laeuft,
}: {
  name: string;
  was: string;
  milder?: { text: string; tun: () => void };
  abbrechen: () => void;
  loeschen: () => void;
  laeuft?: boolean;
}) {
  const behalten = useRef<HTMLButtonElement>(null);
  // Über einen Verweis, nicht als Abhängigkeit: `abbrechen` kommt meist als
  // neue Pfeilfunktion je Zeichnen, und der Fokus spränge sonst bei jedem
  // Neuzeichnen zurück auf „Behalten" — auch während man „Entfernen" ansteuert.
  const zu = useRef(abbrechen);
  zu.current = abbrechen;
  useEffect(() => {
    behalten.current?.focus();
    const taste = (e: KeyboardEvent) => e.key === "Escape" && zu.current();
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-labelledby="loeschdialog-titel" onClick={abbrechen}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 id="loeschdialog-titel">„{name}“ entfernen?</h2>
        <p>
          {was} verschwindet aus allen Listen. Gebuchte Zeiten und der Verlauf bleiben
          erhalten und stehen weiter im Änderungsprotokoll — ein Admin kann das
          Entfernen rückgängig machen.
        </p>
        <div className="dialog-knoepfe">
          <button ref={behalten} type="button" className="knopf-still" onClick={abbrechen}>
            Behalten
          </button>
          {milder && (
            <button type="button" className="knopf-still" onClick={milder.tun}>
              {milder.text}
            </button>
          )}
          <button type="button" className="knopf" onClick={loeschen} disabled={laeuft}>
            Entfernen
          </button>
        </div>
      </div>
    </div>
  );
}
