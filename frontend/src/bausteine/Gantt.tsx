/**
 * Der Gantt — **ein** Baustein für die Phasen auf der Projektseite und für
 * Pakete und Aufgaben in der Planung einer Phase.
 *
 * Zwei Gantts nebeneinander liefen beim ersten Nachbessern auseinander: Der
 * eine bekäme die Heute-Linie, der andere die Tastatur. Deshalb stehen Achse,
 * Monate, Heute, Ziehen und Tastatur hier, und die Seiten sagen nur, was in
 * einer Zeile steht und was beim Loslassen gespeichert wird.
 *
 * Aufbau: `Gantt` legt die Achse fest und zeichnet die Monatsköpfe,
 * `GanttZeile` ist eine Zeile mit Etikett links, Spur in der Mitte und einer
 * Zahl rechts, `GanttBalken` liegt in der Spur. Die Rechnung steht in
 * basis/gantt.ts.
 *
 * Gespeichert wird **beim Loslassen**, nicht während des Ziehens — jeder Tag
 * dazwischen wäre ein Eintrag im Änderungsprotokoll. Bis die neue Lage vom
 * Server zurück ist, bleibt die Vorschau stehen; sonst spränge der Balken
 * kurz an seinen alten Platz.
 */

import { createContext, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  ausTagnummer,
  gezogen,
  lageAuf,
  monateDer,
  tage,
  tagnummer,
  type Achse,
  type Griff,
  type Monat,
  type Spanne,
} from "../basis/gantt";

type Rahmen = { achse: Achse; tage: number; heute: number | null; monate: Monat[] };

const GanttRahmen = createContext<Rahmen | null>(null);

function useRahmen(): Rahmen {
  const rahmen = useContext(GanttRahmen);
  if (!rahmen) throw new Error("GanttZeile und GanttBalken stehen nur in einem Gantt.");
  return rahmen;
}

/** Lage auf der Achse als CSS-Werte: `--a` der Anfangstag, `--l` die Länge in Tagen. */
const lage = (anfang: number, laenge = 1) => ({ ["--a" as string]: anfang, ["--l" as string]: laenge });

export function Gantt({
  achse,
  heute,
  etikett,
  rechts,
  children,
}: {
  achse: Achse;
  heute: string;
  /** Überschrift der Etikettspalte, z. B. „Phase". */
  etikett: string;
  /** Überschrift der Zahlenspalte rechts. */
  rechts: string;
  children: ReactNode;
}) {
  const anzahl = tage(achse);
  const tag = tagnummer(heute) - tagnummer(achse.von);
  const rahmen: Rahmen = {
    achse,
    tage: anzahl,
    heute: tag >= 0 && tag < anzahl ? tag : null,
    monate: monateDer(achse),
  };
  return (
    <GanttRahmen.Provider value={rahmen}>
      {/* Am Handy rollt die Achse in ihrer Karte, das Etikett bleibt links
          stehen — eine zweite, gedrehte Ansicht wäre ein zweites Markup. */}
      <div className="gantt-rollbar">
        <div className="gantt" style={{ ["--tage" as string]: anzahl }}>
          <div className="gantt-zeile gantt-kopf" aria-hidden="true">
            <span className="gantt-etikett beschriftung-klein">{etikett}</span>
            <div className="gantt-spur">
              {rahmen.monate.map((m, i) => (
                <span key={`${m.jahr}-${m.name}`} className="gantt-monat" style={lage(m.anfang, m.laenge)} data-jahr={m.name === "Jan" || undefined}>
                  {m.beschriftet ? (m.name === "Jan" || i === 0 ? `${m.name} ${String(m.jahr).slice(2)}` : m.name) : ""}
                </span>
              ))}
              {rahmen.heute !== null && (
                <span className="gantt-heute-marke" style={lage(rahmen.heute)}>
                  heute
                </span>
              )}
            </div>
            <span className="gantt-rechts beschriftung-klein">{rechts}</span>
          </div>
          {children}
        </div>
      </div>
    </GanttRahmen.Provider>
  );
}

export function GanttZeile({
  etikett,
  rechts,
  children,
  gewaehlt,
  art,
  setzen,
}: {
  etikett: ReactNode;
  rechts?: ReactNode;
  children?: ReactNode;
  gewaehlt?: boolean;
  /** Für die Gestalt der Zeile: „phase", „paket", „aufgabe". */
  art: string;
  /**
   * Ein Klick in die leere Spur setzt einen Zeitraum ab diesem Tag — für
   * Zeilen, die noch keinen haben. Ohne die Möglichkeit weiß man vor einem
   * leeren Gantt nicht, wo man anfangen soll.
   */
  setzen?: (tag: string) => void;
}) {
  const rahmen = useRahmen();

  function klick(e: React.MouseEvent<HTMLDivElement>) {
    if (!setzen || e.target !== e.currentTarget) return;
    const box = e.currentTarget.getBoundingClientRect();
    const tag = Math.min(rahmen.tage - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * rahmen.tage)));
    setzen(ausTagnummer(tagnummer(rahmen.achse.von) + tag));
  }

  return (
    <div className="gantt-zeile" data-art={art} data-gewaehlt={gewaehlt || undefined}>
      <div className="gantt-etikett">{etikett}</div>
      <div className="gantt-spur" onClick={klick} data-setzbar={setzen ? "ja" : undefined}>
        {rahmen.monate.map((m) => (
          <i key={`${m.jahr}-${m.name}`} className="gantt-linie" style={lage(m.anfang)} data-jahr={m.name === "Jan" || undefined} />
        ))}
        {rahmen.heute !== null && <i className="gantt-heute" style={lage(rahmen.heute)} />}
        {setzen && <span className="gantt-hinweis">ohne Zeitraum — in die Zeile klicken</span>}
        {children}
      </div>
      <div className="gantt-rechts">{rechts}</div>
    </div>
  );
}

type Zug = { griff: Griff; x: number; breite: number; bewegt: boolean };

export function GanttBalken({
  spanne,
  beschriftung,
  art,
  stand,
  darf,
  aendern,
  klick,
  schritt = 1,
  children,
}: {
  spanne: Spanne;
  /** Was ein Screenreader nennt — Name und Zeitraum. */
  beschriftung: string;
  /** Gestalt: „phase", „antrag", „plan", „aufgabe". */
  art: string;
  /** Feinere Gestalt, z. B. der Stand einer Phase oder die Lage einer Aufgabe. */
  stand?: string;
  /** Ob gezogen werden darf. Ohne `aendern` geht es ohnehin nicht. */
  darf: boolean;
  aendern?: (spanne: Spanne) => Promise<void>;
  /** Ein Klick ohne Ziehen. */
  klick?: () => void;
  /** Um wie viele Tage ← → verschieben — eine Woche bei Phasen, ein Tag bei Aufgaben. */
  schritt?: number;
  children?: ReactNode;
}) {
  const rahmen = useRahmen();
  // Der Zug steht in einer Referenz und nicht im Zustand: Ein schnelles
  // Ziehen schickt Bewegung und Loslassen, bevor React neu gezeichnet hat —
  // aus dem Zustand gelesen wäre der Zug dann noch gar nicht begonnen.
  const zug = useRef<Zug | null>(null);
  const [zieht, setZieht] = useState(false);
  const [vorschau, setVorschau] = useState<Spanne | null>(null);
  const letzte = useRef<Spanne | null>(null);
  // Die Vorschau geht, sobald die gespeicherte Lage ankommt.
  useEffect(() => setVorschau(null), [spanne.von, spanne.bis]);
  const ziehbar = darf && !!aendern;
  const gezeigt = vorschau ?? spanne;
  const { anfang, laenge } = lageAuf(rahmen.achse, gezeigt);

  async function speichern(ziel: Spanne) {
    if (ziel.von === spanne.von && ziel.bis === spanne.bis) return setVorschau(null);
    setVorschau(ziel);
    try {
      await aendern!(ziel);
    } catch {
      setVorschau(null);
    }
  }

  function runter(e: PointerEvent<HTMLDivElement>) {
    if ((!ziehbar && !klick) || e.button !== 0) return;
    const spur = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!spur) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const griff = ((e.target as HTMLElement).dataset.griff ?? "mitte") as Griff;
    zug.current = { griff, x: e.clientX, breite: spur.width / rahmen.tage, bewegt: false };
    letzte.current = null;
  }

  function bewegen(e: PointerEvent<HTMLDivElement>) {
    const z = zug.current;
    if (!z) return;
    const weg = e.clientX - z.x;
    // Erst ab ein paar Pixeln ist es ein Ziehen — sonst verrutscht ein Klick
    // um einen Tag, wenn die Hand zittert.
    if (!z.bewegt && Math.abs(weg) < 4) return;
    if (!z.bewegt) {
      z.bewegt = true;
      setZieht(true);
    }
    if (!ziehbar) return;
    letzte.current = gezogen(spanne, z.griff, Math.round(weg / z.breite), rahmen.achse);
    setVorschau(letzte.current);
  }

  function los(e: PointerEvent<HTMLDivElement>) {
    const z = zug.current;
    if (!z) return;
    // Das Loslassen trägt die letzte Lage selbst — auch wenn keine
    // Bewegung dazwischen gemeldet wurde.
    bewegen(e);
    zug.current = null;
    setZieht(false);
    if (!z.bewegt) return klick?.();
    if (ziehbar && letzte.current) speichern(letzte.current);
  }

  function taste(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && klick) {
      e.preventDefault();
      return klick();
    }
    if (!ziehbar || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const um = e.key === "ArrowLeft" ? -schritt : schritt;
    speichern(gezogen(vorschau ?? spanne, e.shiftKey ? "ende" : "mitte", um, rahmen.achse));
  }

  return (
    <div
      className="gantt-balken"
      data-art={art}
      data-stand={stand}
      data-ziehbar={ziehbar || undefined}
      data-zieht={zieht || undefined}
      style={lage(anfang, laenge)}
      role={ziehbar ? "slider" : klick ? "button" : undefined}
      tabIndex={ziehbar || klick ? 0 : undefined}
      aria-label={beschriftung}
      aria-valuetext={ziehbar ? beschriftung : undefined}
      title={beschriftung}
      onPointerDown={runter}
      onPointerMove={bewegen}
      onPointerUp={los}
      onPointerCancel={() => {
        zug.current = null;
        setZieht(false);
        setVorschau(null);
      }}
      onKeyDown={taste}
    >
      {children && <span className="gantt-balkentext">{children}</span>}
      {ziehbar && <i data-griff="anfang" />}
      {ziehbar && <i data-griff="ende" />}
    </div>
  );
}
