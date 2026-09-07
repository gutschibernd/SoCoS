/**
 * Eine leere Liste ist kein Fehler.
 *
 * Sie sagt, **was fehlt** und **was der nächste Griff wäre**. Ein leerer Kasten
 * ohne Satz lässt jemanden raten, ob die Anwendung kaputt ist.
 */
export function Leerstelle({
  was,
  satz,
  aktion,
}: {
  was: string;
  satz: string;
  aktion?: { text: string; tun: () => void };
}) {
  return (
    <div className="leerstelle">
      <b>{was}</b>
      <p>{satz}</p>
      {aktion && (
        <button type="button" className="knopf-still" onClick={aktion.tun}>
          {aktion.text}
        </button>
      )}
    </div>
  );
}
