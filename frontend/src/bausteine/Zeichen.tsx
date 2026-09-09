/**
 * Die Zeichen der Oberfläche — selbst gezeichnet, keine Bibliothek.
 *
 * Eine Icon-Bibliothek brächte tausend Zeichen für die fünfzehn, die hier
 * gebraucht werden, und diktierte nebenbei ihren Strich. Stattdessen: **ein**
 * Raster (24), **eine** Strichstärke, Farbe immer `currentColor` — die Regeln
 * dafür stehen in stil/bausteine.css, damit sie nicht je Zeichen abweichen
 * können.
 *
 * Die Zeichen sind `aria-hidden`. Sie stehen entweder neben ihrer Beschriftung
 * — dann läse ein Screenreader sie doppelt — oder allein in einem Knopf, und
 * der trägt dann ein `aria-label`. Ein Zeichen ohne beides gibt es nicht.
 *
 * Das Signet der Marke ist **kein** Zeichen aus dieser Datei: Es ist farbig,
 * fest, und steht als Bild in statisch/favicon.svg.
 */

export type ZeichenName =
  | "dashboard"
  | "projekt"
  | "zeit"
  | "kontakte"
  | "event"
  | "plus"
  | "kreuz"
  | "hoch"
  | "runter"
  | "zeiger"
  | "stift"
  | "korb"
  | "start"
  | "stopp"
  | "pdf"
  | "haken"
  | "achtung"
  | "zahnrad";

/**
 * Alles liegt zwischen 4 und 20, damit der halbe Strich (1) an keiner Kante
 * abgeschnitten wird.
 *
 * `projekt` ist mit Absicht die Abstufung aus dem Signet: vier Ebenen,
 * Projekt · Bereich · Arbeitspaket · Unteraufgabe. Wer die Marke kennt,
 * erkennt in der Navigation dasselbe Bild wieder.
 */
const PFADE: Record<ZeichenName, string> = {
  dashboard: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  projekt: "M4 5h16M4 10h12M4 15h8M4 20h4",
  zeit: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 12V6.5M12 12h4.5",
  kontakte: "M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M4.5 20.5c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5",
  // Ein Blatt mit Kopfzeile und zwei Reitern — kein Kalender mit Gitter: Bei
  // 18 px zerfällt ein Gitter zu Grau. Die Kopfzeile allein trägt das Bild.
  event: "M4 6.5h16v14H4zM4 11h16M8.5 3.5v5M15.5 3.5v5",
  plus: "M12 5v14M5 12h14",
  kreuz: "M6 6l12 12M18 6L6 18",
  hoch: "M12 20V4M5 11l7-7 7 7",
  runter: "M12 4v16M5 13l7 7 7-7",
  zeiger: "M9 4l8 8-8 8",
  stift: "M4 20h4L20 8l-4-4L4 16v4zM14 6l4 4",
  korb: "M4 6.5h16M9 6.5V3.5h6v3M6.5 6.5l1 14h9l1-14",
  start: "M8 5l11 7-11 7z",
  stopp: "M6.5 6.5h11v11h-11z",
  pdf: "M14 3H6.5v18h11V6.5L14 3zM14 3v3.5h3.5M12 11.5v5M9.5 14l2.5 2.5 2.5-2.5",
  haken: "M4 12.5l5.5 5.5L20 7",
  achtung: "M12 3.5L22 20.5H2zM12 10v4.5M12 17.6v1.2",
  // Ring, Nabe und acht Zähne — alle Zähne gleich lang, damit das Zeichen bei
  // 16 px nicht ausfranst. Ein nachgezeichnetes Zahnrad mit Kontur hätte bei
  // dieser Größe nur noch Grau ergeben.
  zahnrad:
    "M18.5 12a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M12 5.5V4M12 18.5V20M5.5 12H4M18.5 12H20M16.6 7.4l1.06-1.06M7.4 16.6l-1.06 1.06M7.4 7.4L6.34 6.34M16.6 16.6l1.06 1.06",
};

export function Zeichen({ name, klasse }: { name: ZeichenName; klasse?: string }) {
  return (
    <svg
      className={klasse ? `zeichen ${klasse}` : "zeichen"}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PFADE[name]} />
    </svg>
  );
}
