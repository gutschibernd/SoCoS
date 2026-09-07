/**
 * Die Nachfrage vor dem Löschen.
 *
 * Kein `window.confirm`. Wichtiger als die Rückfrage ist, **was darin steht**:
 * Sie nennt den Namen und schlägt den milderen Weg vor. Bei einem
 * Zeiterfassungssystem ist „wer hat wann woran gearbeitet" über Jahre die
 * häufigere Frage als „weg damit".
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
  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" onClick={abbrechen}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>„{name}“ entfernen?</h2>
        <p>
          {was} verschwindet aus allen Listen. Gebuchte Zeiten und der Verlauf bleiben
          erhalten und stehen weiter im Änderungsprotokoll — ein Admin kann das
          Entfernen rückgängig machen.
        </p>
        <div className="dialog-knoepfe">
          <button type="button" className="knopf-still" onClick={abbrechen}>
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
