import { useState } from "react";

/**
 * Die Nachfrage beim Clock-out: „Was hast du gemacht?"
 *
 * Überspringen ist erlaubt — aber mit einer Rückfrage. Eine erzwungene Notiz
 * führt dazu, dass „x" eingetragen wird, und dann steht überall „x".
 */
export function Notizdialog({
  wo,
  dauer,
  speichern,
  abbrechen,
}: {
  wo: string;
  dauer: string;
  speichern: (notiz: string) => void;
  abbrechen: () => void;
}) {
  const [notiz, setNotiz] = useState("");
  const [fragtNach, setFragtNach] = useState(false);

  if (fragtNach) {
    return (
      <div className="dialog-grund" role="dialog" aria-modal="true">
        <div className="dialog">
          <h2>Wirklich ohne Notiz?</h2>
          <p>
            Die Buchung wird gespeichert. In drei Monaten steht in der Liste dann nur
            die Uhrzeit — woran du gearbeitet hast, weiß dann niemand mehr.
          </p>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf-still" onClick={() => setFragtNach(false)}>
              Zurück, ich schreibe was
            </button>
            <button type="button" className="knopf" onClick={() => speichern("")}>
              Trotzdem überspringen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true">
      <div className="dialog">
        <h2>Was hast du gemacht?</h2>
        <p>
          {wo} · {dauer}
        </p>
        <textarea
          className="feld"
          rows={3}
          autoFocus
          value={notiz}
          placeholder="Ein Satz reicht."
          onChange={(e) => setNotiz(e.target.value)}
        />
        <div className="dialog-knoepfe" style={{ marginTop: 14 }}>
          <button type="button" className="knopf-still" onClick={abbrechen}>
            Abbrechen
          </button>
          <button
            type="button"
            className="knopf-still"
            onClick={() => (notiz.trim() ? speichern(notiz) : setFragtNach(true))}
          >
            Überspringen
          </button>
          <button type="button" className="knopf" onClick={() => speichern(notiz)}>
            Speichern und Clock-out
          </button>
        </div>
      </div>
    </div>
  );
}
