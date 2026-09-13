import type { Kontostand } from "../basis/daten";
import { erfasstePunkte, fortschreibung, type Punkt } from "../basis/finanzen";

/**
 * Der Kontostand als Linie — durchgezogen über die erfassten Stichtage, dann
 * gestrichelt fortgeschrieben.
 *
 * Gerechnet wird in basis/finanzen.ts — was rechnet, gehört dorthin und wird
 * getestet. Hier steht nur, wie aus Punkten Pfade werden.
 *
 * Selbst gezeichnet, kein Diagrammpaket: Dieselbe Begründung wie bei den
 * Zeichen. Ein Paket brächte Achsen, Legenden, Tooltips und einen eigenen
 * Strich mit, von denen hier eine Linie und eine Nulllinie gebraucht werden.
 *
 * **`preserveAspectRatio="none"` mit `vector-effect: non-scaling-stroke`:**
 * Die Fläche ist breiter als hoch und soll sich der Karte anpassen, ohne oben
 * und unten Luft zu lassen. Ohne `non-scaling-stroke` würde dabei die
 * Linienstärke waagrecht mitgezogen — die Linie wäre an flachen Stellen dünner
 * als an steilen. Aus demselben Grund gibt es hier keine Kreise: Ein Punkt
 * würde zur Ellipse. Der Übergang von „erfasst" zu „fortgeschrieben" ist
 * deshalb eine senkrechte Marke, kein Punkt.
 */

const BREITE = 1000;
const HOEHE = 170;

const EURO = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const MONAT = new Intl.DateTimeFormat("de-AT", { month: "2-digit", year: "numeric" });

export function Kontostandlinie({
  verlauf,
  monatskosten,
}: {
  verlauf: Kontostand[];
  monatskosten: string | null;
}) {
  const erfasst = erfasstePunkte(verlauf);
  /* Die Leerstelle zeigt das Dashboard, bevor es hierher kommt — aber der
     Baustein muss auch allein stehen können, sonst ist der nächste Aufruf von
     woanders ein Absturz auf `letzter.v`. */
  if (erfasst.length === 0) return null;

  const letzter = erfasst[erfasst.length - 1];
  const kosten = monatskosten === null ? 0 : Number(monatskosten);
  const prognose = fortschreibung(letzter, kosten);
  const alle: Punkt[] = [...erfasst, ...prognose];

  /* Ein einziger Stichtag ohne Fortschreibung ergibt keine Linie. Statt einer
     Fläche mit einem Punkt darin steht dann der Wert selbst da — das ist
     alles, was es zu sagen gibt. */
  if (alle.length < 2) {
    return (
      <p className="linie-einzeln">
        Ein Stichtag erfasst: <b className="zahl">{EURO.format(letzter.v)}</b> am{" "}
        <span className="zahl">{MONAT.format(new Date(letzter.t))}</span>. Eine Linie entsteht ab
        dem zweiten Eintrag.
      </p>
    );
  }

  const t0 = alle[0].t;
  const t1 = alle[alle.length - 1].t;
  const hoechst = Math.max(...alle.map((p) => p.v), 1);

  const x = (t: number) => ((t - t0) / (t1 - t0)) * BREITE;
  const y = (v: number) => (1 - v / hoechst) * HOEHE;
  const pfad = (ps: Punkt[]) =>
    ps.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  const heuteX = x(letzter.t);
  const flaeche = `${pfad(erfasst)} L${heuteX.toFixed(1)},${HOEHE} L${x(erfasst[0].t).toFixed(1)},${HOEHE} Z`;

  return (
    <div className="kontostandlinie">
      <svg viewBox={`0 0 ${BREITE} ${HOEHE}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="linie-flaeche" d={flaeche} />
        <path className="linie-null" d={`M0,${HOEHE} L${BREITE},${HOEHE}`} />
        {prognose.length > 0 && (
          <path className="linie-heute" d={`M${heuteX.toFixed(1)},0 L${heuteX.toFixed(1)},${HOEHE}`} />
        )}
        <path className="linie-erfasst" d={pfad(erfasst)} />
        {prognose.length > 0 && (
          <path className="linie-prognose" d={pfad([letzter, ...prognose])} />
        )}
      </svg>

      {/*
        Die Beschriftung steht als Text daneben und nicht im SVG: Text in einem
        mit `preserveAspectRatio="none"` gezogenen SVG wird mitverzerrt.
      */}
      <div className="linie-fuss" style={{ gridTemplateColumns: `${(100 * heuteX) / BREITE}% 1fr` }}>
        <div className="linie-abschnitt linie-abschnitt-erfasst">
          <span>
            <b className="zahl">{MONAT.format(new Date(erfasst[0].t))}</b>
            <em className="zahl">{EURO.format(erfasst[0].v)}</em>
          </span>
          <span className="rechts">
            <b className="zahl">heute · {MONAT.format(new Date(letzter.t))}</b>
            <em className="zahl">{EURO.format(letzter.v)}</em>
          </span>
        </div>
        {prognose.length > 0 && (
          <div className="linie-abschnitt linie-abschnitt-prognose">
            <span className="rechts">
              <b className="zahl">
                Runway-Ende · {MONAT.format(new Date(prognose[prognose.length - 1].t))}
              </b>
              <em className="zahl">bei {EURO.format(kosten)} / Monat</em>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
