import { useEffect, useRef, useState, type ReactNode } from "react";

import { Zeichen } from "./Zeichen";

/**
 * Ein kleines ⓘ, hinter dem die Erklärung steht — statt eines Absatzes in der
 * Seite.
 *
 * Bernd, 2026-10-19, zur Runway-Planung: „da ist einfach zu viel Text". Die
 * Sätze dort sind keine Anleitung, sondern sagen, was ein Feld oder eine Zahl
 * meint („Es zählt der Monat", „Lohnnebenkosten: rund 29–31 %"). Genau dafür
 * war das `?` die richtige Form (CLAUDE.md, Oberfläche) — es kommt hier
 * zurück, aber nur für solche Sätze. Wie man mit einer Seite arbeitet, steht
 * weiter in der Doku.
 *
 * **Mit der Maus reicht Überfahren, am Handy Antippen.** Ein Klick heftet die
 * Blase an, damit man sie auch lesen kann, wenn die Maus weiterzieht.
 *
 * Die Blase sitzt `fixed` und wird beim Öffnen an den Rand des Fensters
 * gerückt: In den Tabellen der Runway-Planung steht das Zeichen oft ganz rechts,
 * und eine Blase, die über den Rand hinausragt, ist am Handy abgeschnitten.
 */
export function Hinweis({ text, worum = "Erklärung" }: { text: ReactNode; worum?: string }) {
  const [offen, setOffen] = useState<"" | "schwebt" | "fest">("");
  const [ort, setOrt] = useState({ links: 0, oben: 0 });
  const knopf = useRef<HTMLButtonElement>(null);
  const huelle = useRef<HTMLSpanElement>(null);

  function platzieren() {
    const r = knopf.current?.getBoundingClientRect();
    if (!r) return;
    const breite = Math.min(300, window.innerWidth - 32);
    const links = Math.max(16, Math.min(r.left + r.width / 2 - breite / 2, window.innerWidth - 16 - breite));
    setOrt({ links, oben: r.bottom + 6 });
  }

  useEffect(() => {
    if (!offen) return;
    const daneben = (e: PointerEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen("");
    };
    const taste = (e: KeyboardEvent) => e.key === "Escape" && setOffen("");
    // Beim Rollen zu: Eine feste Blase bliebe stehen, während ihr Zeichen wegrollt.
    const rollen = () => setOffen("");
    document.addEventListener("pointerdown", daneben);
    document.addEventListener("keydown", taste);
    window.addEventListener("scroll", rollen, true);
    return () => {
      document.removeEventListener("pointerdown", daneben);
      document.removeEventListener("keydown", taste);
      window.removeEventListener("scroll", rollen, true);
    };
  }, [offen]);

  return (
    <span
      className="hinweis"
      ref={huelle}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || offen) return;
        platzieren();
        setOffen("schwebt");
      }}
      onPointerLeave={(e) => e.pointerType === "mouse" && offen === "schwebt" && setOffen("")}
    >
      <button
        ref={knopf}
        type="button"
        className="hinweis-knopf"
        aria-label={worum}
        aria-expanded={!!offen}
        onClick={() => {
          platzieren();
          setOffen((o) => (o === "fest" ? "" : "fest"));
        }}
      >
        <Zeichen name="info" />
      </button>
      {offen && (
        <span className="hinweis-blase" role="note" style={{ left: ort.links, top: ort.oben }}>
          {text}
        </span>
      )}
    </span>
  );
}
