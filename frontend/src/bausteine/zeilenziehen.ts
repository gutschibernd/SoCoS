/**
 * Zeilen einer Liste am Griff verschieben — mit Maus, Finger und Pfeiltasten.
 *
 * **Warum Zeigerereignisse und nicht das Ziehen des Browsers (`draggable`):**
 * Das kennt am Handy keinen Finger, und es zieht ein durchscheinendes Bild
 * der Zeile statt der Zeile selbst. Hier rückt die gezogene Zeile mit, die
 * anderen machen Platz, und abgelegt wird erst beim Loslassen — vorher geht
 * nichts an den Server.
 *
 * Die Zeilen tragen `data-zeile` und stehen als Geschwister nebeneinander;
 * `ids` ist ihre Reihenfolge, wie sie gerade zu sehen ist (gefiltert oder
 * nicht). Abgelegt wird an der Kennung einer anderen Zeile, nicht an einer
 * Stelle — so bleibt, was der Filter ausblendet, wo es war.
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type Zug = { id: string; dy: number; ziel: number; hoehe: number };

export function useZeilenZiehen(ids: string[], ablegen: (id: string, zielId: string) => void) {
  const [zug, setZug] = useState<Zug | null>(null);
  const anfang = useRef<{ y: number; mitten: number[]; von: number; hoehe: number } | null>(null);

  function ende(abbrechen: boolean) {
    const a = anfang.current;
    anfang.current = null;
    if (!abbrechen && a && zug && zug.ziel !== a.von && ids[zug.ziel]) ablegen(zug.id, ids[zug.ziel]);
    setZug(null);
  }

  function griff(id: string) {
    return {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const zeile = e.currentTarget.closest<HTMLElement>("[data-zeile]");
        const zeilen = zeile?.parentElement ? [...zeile.parentElement.querySelectorAll<HTMLElement>(":scope > [data-zeile]")] : [];
        const von = zeile ? zeilen.indexOf(zeile) : -1;
        if (von < 0) return;
        const rahmen = zeilen.map((z) => z.getBoundingClientRect());
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        anfang.current = { y: e.clientY, mitten: rahmen.map((r) => r.top + r.height / 2), von, hoehe: rahmen[von].height };
        setZug({ id, dy: 0, ziel: von, hoehe: rahmen[von].height });
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const a = anfang.current;
        if (!a) return;
        const dy = e.clientY - a.y;
        const mitte = a.mitten[a.von] + dy;
        let ziel = a.von;
        while (ziel < a.mitten.length - 1 && mitte > a.mitten[ziel + 1]) ziel++;
        while (ziel > 0 && mitte < a.mitten[ziel - 1]) ziel--;
        setZug({ id, dy, ziel, hoehe: a.hoehe });
      },
      onPointerUp: () => ende(false),
      onPointerCancel: () => ende(true),
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const schritt = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (!schritt) return;
        e.preventDefault();
        const ziel = ids[ids.indexOf(id) + schritt];
        if (ziel) ablegen(id, ziel);
      },
    };
  }

  /** Wo eine Zeile gerade steht: die gezogene folgt dem Zeiger, die übersprungenen rücken um eine Höhe. */
  function lage(id: string): CSSProperties | undefined {
    if (!zug) return undefined;
    const i = ids.indexOf(id);
    const von = ids.indexOf(zug.id);
    if (id === zug.id) return { transform: `translateY(${zug.dy}px)` };
    if (von < zug.ziel && i > von && i <= zug.ziel) return { transform: `translateY(${-zug.hoehe}px)` };
    if (von > zug.ziel && i < von && i >= zug.ziel) return { transform: `translateY(${zug.hoehe}px)` };
    return undefined;
  }

  return { griff, lage, gezogen: zug?.id ?? null };
}
