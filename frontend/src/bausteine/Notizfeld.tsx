import { useRef, useState, type KeyboardEvent } from "react";

import { bloecke, listenartAn, umschalten, zeilenumbruch, type Aenderung, type Listenart } from "../basis/notiz";

/**
 * Ein Feld für Notizen mit Aufzählungen — zwei Knöpfe darüber, und Enter
 * setzt eine begonnene Liste fort. Geschrieben wird Klartext mit `- ` und
 * `1. ` (warum: basis/notiz.ts).
 *
 * Die Knöpfe nehmen dem Feld den Fokus nicht (`onMouseDown`): Sonst wäre die
 * Markierung weg, bevor der Knopf weiß, welche Zeilen er umwandeln soll.
 */
export function Notizfeld({
  id,
  wert,
  setzen,
  platzhalter,
  speichern,
}: {
  id: string;
  wert: string;
  setzen: (text: string) => void;
  platzhalter?: string;
  /** ⌘↵ / Strg+↵ — wer den Satz getippt hat, soll nicht zur Maus greifen müssen. */
  speichern?: () => void;
}) {
  const feld = useRef<HTMLTextAreaElement>(null);
  const [hier, setHier] = useState<Listenart | null>(null);

  const merken = () => {
    const f = feld.current;
    if (f) setHier(listenartAn(f.value, f.selectionStart));
  };

  function anwenden(a: Aenderung) {
    const f = feld.current;
    if (!f) return;
    f.focus();
    f.setSelectionRange(a.von, a.bis);
    // Über den Browser eingesetzt und nicht als neuer Wert: So bleibt der
    // Schritt im Rückgängig-Speicher, und ⌘Z nimmt genau den Punkt wieder
    // weg. Ein gesetzter Wert löschte den ganzen Rückgängig-Verlauf des
    // Feldes. `execCommand` ist veraltet, aber in allen Browsern da; wo nicht,
    // geht es ohne Rückgängig.
    const eingesetzt = a.ersatz
      ? document.execCommand("insertText", false, a.ersatz)
      : document.execCommand("delete");
    if (!eingesetzt) {
      f.setRangeText(a.ersatz, a.von, a.bis, "end");
      setzen(f.value);
    }
    f.setSelectionRange(...a.auswahl);
    merken();
  }

  function taste(e: KeyboardEvent<HTMLTextAreaElement>) {
    const f = e.currentTarget;
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      speichern?.();
      return;
    }
    if (e.shiftKey || f.selectionStart !== f.selectionEnd) return;
    const a = zeilenumbruch(f.value, f.selectionStart);
    if (!a) return;
    e.preventDefault();
    anwenden(a);
  }

  const knopf = (art: Listenart, marke: string, text: string) => (
    <button
      type="button"
      className="notiz-knopf"
      aria-pressed={hier === art}
      aria-controls={id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const f = feld.current;
        if (f) anwenden(umschalten(f.value, f.selectionStart, f.selectionEnd, art));
      }}
    >
      <span className="notiz-marke" aria-hidden="true">
        {marke}
      </span>
      {text}
    </button>
  );

  return (
    <div className="notizfeld">
      <div className="notiz-leiste" role="toolbar" aria-label="Aufzählung">
        {knopf("punkte", "•", "Aufzählung")}
        {knopf("nummern", "1.", "Nummeriert")}
      </div>
      <textarea
        ref={feld}
        id={id}
        className="feld"
        // Mit dem Text wächst das Feld, bis der Dialog scrollt — ein Feld,
        // das bei der fünften Zeile selbst scrollt, versteckt die erste.
        rows={Math.min(22, Math.max(9, wert.split("\n").length + 2))}
        value={wert}
        placeholder={platzhalter}
        onChange={(e) => {
          setzen(e.target.value);
          merken();
        }}
        onKeyDown={taste}
        onSelect={merken}
        onFocus={merken}
      />
    </div>
  );
}

/** Die Notiz gelesen: Absätze als Absätze, Punkte als echte Liste mit hängendem Einzug. */
export function Notiztext({ text }: { text: string }) {
  return (
    <div className="notiztext">
      {bloecke(text).map((b, i) =>
        b.art === "absatz" ? (
          <p key={i}>{b.text}</p>
        ) : b.art === "punkte" ? (
          <ul key={i}>
            {b.zeilen.map((z, j) => (
              <li key={j}>{z}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} start={b.start}>
            {b.zeilen.map((z, j) => (
              <li key={j}>{z}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
