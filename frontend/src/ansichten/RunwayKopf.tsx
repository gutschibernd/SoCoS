/**
 * Runway-Planung, oben: Szenario, Daten, Speicherstand — darunter die Lage in
 * einem Satz und sechs Kennzahlen. Wie `renderTop` des Runway-Planers.
 */

import type { Runwayplan, Runwayrechnung, Szenario } from "../basis/daten";
import type { Speicherstand } from "../basis/runwaydokument";
import { Achse, fmtE, num } from "../basis/runway";

const SZENARIEN: { wert: Szenario; text: string; titel: string }[] = [
  { wert: "konservativ", text: "Konservativ", titel: "Nur zugesagte oder erhaltene Förderungen und Investments, Umsätze zu 50 % der Wahrscheinlichkeit" },
  { wert: "basis", text: "Basis", titel: "Alle geplanten Mittel, Umsätze gewichtet mit Wahrscheinlichkeit" },
  { wert: "optimistisch", text: "Optimistisch", titel: "Alle geplanten Mittel, Umsätze zu 100 %" },
];

const SPEICHER: Record<Speicherstand, string> = {
  saved: "Gespeichert",
  pending: "Änderungen …",
  error: "Speichern fehlgeschlagen",
  readonly: "Nur Lesezugriff",
};

export function Kopf({
  S,
  szenario,
  setSzenario,
  speicher,
  darf,
  exportieren,
  importieren,
}: {
  S: Runwayplan;
  szenario: Szenario;
  setSzenario: (s: Szenario) => void;
  speicher: Speicherstand;
  darf: boolean;
  exportieren: () => void;
  importieren: () => void;
}) {
  const a = new Achse(S.settings.start);
  const n = S.settings.months;
  return (
    <header className="rw-top">
      <div className="rw-brand">
        <span className="rw-eyebrow">Liquiditätsplanung</span>
        <span className="rw-brand-titel">{S.settings.company || "Runway-Planer"}</span>
        <span className="rw-brand-sub">
          {a.labL(0)} bis {a.labL(n - 1)} · {n} Monate
        </span>
      </div>
      <div className="rw-top-right">
        <div className="rw-seg" role="group" aria-label="Szenario">
          {SZENARIEN.map((s) => (
            <button key={s.wert} type="button" title={s.titel} aria-pressed={szenario === s.wert} onClick={() => setSzenario(s.wert)}>
              {s.text}
            </button>
          ))}
        </div>
        <button type="button" className="rw-btn" onClick={exportieren} title="Kompletten Plan als JSON-Datei sichern">
          Daten exportieren
        </button>
        {darf && (
          <button type="button" className="rw-btn" onClick={importieren} title="Gesicherte JSON-Datei laden (oder Datei auf die Seite ziehen)">
            Daten importieren
          </button>
        )}
        <span className="rw-save" data-s={speicher}>
          {SPEICHER[speicher]}
        </span>
      </div>
    </header>
  );
}

const NAMEN = ["Runway", "Tiefster Kontostand", "Überbrückungsbedarf", "Burn Ø 6 Monate", "Break-even", "Gesellschafterdarlehen"];

export function Lage({ S, r, szenario }: { S: Runwayplan; r: Runwayrechnung; szenario: Szenario }) {
  const a = new Achse(S.settings.start);
  const buf = num(S.settings.buffer);
  const n = r.A.length;
  const k = r.kpi;
  const need = num(k.need);

  if (r.leer)
    return (
      <>
        <section className="rw-status" data-s="empty" aria-live="polite">
          <span className="rw-pill empty">Keine Daten</span>
          <p>Sobald Kontostand, Förderungen und Kosten erfasst sind, siehst du hier, wie lange das Geld reicht.</p>
        </section>
        <section className="rw-kpis">
          {NAMEN.map((t) => (
            <div key={t} className="rw-kpi">
              <span className="rw-eyebrow">{t}</span>
              <span className="v">—</span>
              <span className="s">&nbsp;</span>
            </div>
          ))}
        </section>
      </>
    );

  const sc = { konservativ: "konservativen ", basis: "Basis-", optimistisch: "optimistischen " }[szenario];
  let status;
  if (k.neg !== null)
    status = (
      <section className="rw-status" data-s="bad" aria-live="polite">
        <span className="rw-pill bad">Liquiditätslücke</span>
        <p>
          Im {sc}Szenario ist das Konto ab <strong>{a.labL(k.neg)}</strong> im Minus. Um den Mindestpuffer von {fmtE(buf)} zu
          halten, fehlen insgesamt <strong>{fmtE(need)}</strong>, erstmals im {a.labL(r.sug[0]?.i ?? k.neg)}.
        </p>
      </section>
    );
  else if (k.low !== null)
    status = (
      <section className="rw-status" data-s="warn" aria-live="polite">
        <span className="rw-pill warn">Unter Puffer</span>
        <p>
          Im {sc}Szenario bleibt das Konto im Plus, unterschreitet aber ab <strong>{a.labL(k.low)}</strong> den Mindestpuffer von{" "}
          {fmtE(buf)}. Zum Auffüllen: {fmtE(need)}.
        </p>
      </section>
    );
  else
    status = (
      <section className="rw-status" data-s="ok" aria-live="polite">
        <span className="rw-pill ok">Durchfinanziert</span>
        <p>
          Im {sc}Szenario bleibt der Kontostand bis {a.labL(n - 1)} über dem Mindestpuffer von {fmtE(buf)}
          {k.gdN > 0 && k.negZ !== null && ` – dank der eingeplanten Gesellschafterdarlehen (ohne sie: Minus ab ${a.labL(k.negZ)})`}.
        </p>
      </section>
    );

  const tief = num(r.A[k.mi].cash);
  const burn = num(k.burn);
  const kp = [
    {
      v: k.neg === null ? `> ${n} Mon.` : `${k.neg} Mon.`,
      s: k.neg === null ? "gedeckt bis Planende" : `Minus ab ${a.labL(k.neg)}`,
      c: k.neg === null ? (k.low === null ? "ok" : "warn") : "bad",
    },
    { v: fmtE(tief), s: `im ${a.labL(k.mi)}`, c: tief < 0 ? "bad" : tief < buf ? "warn" : "" },
    {
      v: need ? fmtE(need) : "0 €",
      s: need ? `${r.sug.length} Abruf${r.sug.length > 1 ? "e" : ""}, erster ${a.lab(r.sug[0].i)}` : "kein Bedarf",
      c: need ? "bad" : "ok",
    },
    { v: burn > 0 ? fmtE(burn) : "positiv", s: burn > 0 ? "Kosten minus Umsatz pro Monat" : "Umsatz deckt die Kosten", c: "" },
    {
      v: k.be !== null ? a.lab(k.be) : "nicht im Plan",
      s: k.be !== null ? "Umsatz deckt Personal + Kosten" : "Umsatz < laufende Kosten",
      c: k.be !== null ? "ok" : "",
    },
    { v: fmtE(k.gdSum), s: k.gdN ? `${k.gdN} eingeplant` : "noch keine", c: "darl" },
  ];

  return (
    <>
      {status}
      <section className="rw-kpis">
        {kp.map((x, j) => (
          <div key={NAMEN[j]} className={`rw-kpi ${x.c}`}>
            <span className="rw-eyebrow">{NAMEN[j]}</span>
            <span className="v" title={x.v}>
              {x.v}
            </span>
            <span className="s">{x.s}</span>
          </div>
        ))}
      </section>
    </>
  );
}
