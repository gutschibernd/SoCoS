/**
 * Das eine Suchfeld der Anwendung.
 *
 * Vorher hatte jede Liste ihr eigenes: auf den Kontakten mit Lupe in einer
 * Karte mit der Überschrift „Suchen", auf Events und Meetings ein nacktes Feld
 * in einer eigenen Karte, bei den Designentscheidungen ein drittes mit eigener
 * Klasse. Keines ließ sich mit einem Griff leeren, keines sagte, wie viel es
 * gefunden hatte — man zählte die Zeilen selbst oder scrollte, um zu sehen, ob
 * die Suche überhaupt etwas tat.
 *
 * Jetzt überall dasselbe: Lupe vorn, ein Kreuz zum Leeren, sobald etwas
 * drinsteht, Esc leert ebenso, und rechts im Feld die Zahl der Treffer. Die
 * Taste „/" springt von überall auf der Seite hinein (`useSuchtaste`).
 */

import { useEffect, useRef } from "react";

import { Zeichen } from "./Zeichen";

export function Suchfeld({
  wert,
  setzen,
  platzhalter,
  treffer,
  klasse,
}: {
  wert: string;
  setzen: (wert: string) => void;
  platzhalter: string;
  /** „3 von 40" — nur gezeigt, solange gesucht wird. */
  treffer?: { gezeigt: number; von: number };
  klasse?: string;
}) {
  const feld = useRef<HTMLInputElement>(null);
  const sucht = wert.trim() !== "";

  return (
    <label className={klasse ? `suchfeld ${klasse}` : "suchfeld"}>
      <Zeichen name="lupe" />
      <input
        ref={feld}
        className="feld"
        type="search"
        value={wert}
        placeholder={platzhalter}
        aria-label="Suchen"
        // Das Feld, in das „/" springt — siehe useSuchtaste.
        data-suchfeld=""
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setzen(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && wert) {
            e.preventDefault();
            setzen("");
          }
        }}
      />
      {sucht && treffer && (
        <span className="suchfeld-treffer zahl" aria-live="polite">
          {treffer.gezeigt === 0 ? "nichts" : `${treffer.gezeigt} von ${treffer.von}`}
        </span>
      )}
      {wert ? (
        <button
          type="button"
          className="suchfeld-leeren"
          aria-label="Suche leeren"
          onClick={() => {
            setzen("");
            feld.current?.focus();
          }}
        >
          <Zeichen name="kreuz" />
        </button>
      ) : (
        // Nur ein Hinweis auf die Taste, kein Knopf — am Handy ohne Tastatur
        // blendet ihn das CSS aus.
        <kbd className="suchfeld-taste" aria-hidden="true">
          /
        </kbd>
      )}
    </label>
  );
}

/**
 * „/" springt ins Suchfeld der Seite — einmal in App.tsx eingehängt, nicht je
 * Feld: Stünden zwei Suchfelder auf einer Seite, zögen sonst beide am Fokus,
 * und das zuletzt eingehängte gewönne. So nimmt die Taste immer das erste.
 *
 * Nicht, solange in ein anderes Feld getippt wird — dort ist „/" ein Zeichen.
 */
export function useSuchtaste() {
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
      const feld = document.querySelector<HTMLInputElement>("[data-suchfeld]");
      if (!feld) return;
      e.preventDefault();
      feld.focus();
      feld.select();
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);
}
