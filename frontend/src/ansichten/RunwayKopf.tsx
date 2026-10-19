/**
 * Runway-Planung, oben: Szenario, Daten, Speicherstand — darunter die Lage in
 * einem Satz und sechs Kennzahlen. Wie `renderTop` des Runway-Planers.
 *
 * Seit 2026-10-19 mit weniger Worten (Bernd: „da ist einfach zu viel Text"):
 * Jede Kennzahl trägt ein Zeichen für das, was sie misst, und was sie meint,
 * steht hinter ihrem ⓘ statt als Zeile unter der Zahl. Unter der Zahl bleibt
 * nur, was sich mit dem Plan ändert (der Monat, die Zahl der Abrufe).
 */

import type { Runwayplan, Runwayrechnung, Szenario } from "../basis/daten";
import { Hinweis } from "../bausteine/Hinweis";
import { Zeichen, type ZeichenName } from "../bausteine/Zeichen";
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
        <Hinweis
          worum="Was die Szenarien rechnen"
          text={
            <>
              {SZENARIEN.map((s) => (
                <span key={s.wert} className="hinweis-zeile">
                  <b>{s.text}:</b> {s.titel}
                </span>
              ))}
            </>
          }
        />
        <button type="button" className="rw-btn" onClick={exportieren} title="Kompletten Plan als JSON-Datei sichern">
          <Zeichen name="herunter" />
          Export
        </button>
        {darf && (
          <button type="button" className="rw-btn" onClick={importieren} title="Gesicherte JSON-Datei laden (oder Datei auf die Seite ziehen)">
            <Zeichen name="hinauf" />
            Import
          </button>
        )}
        <span className="rw-save" data-s={speicher}>
          {SPEICHER[speicher]}
        </span>
      </div>
    </header>
  );
}

const KENNZAHLEN: { name: string; zeichen: ZeichenName; meint: string }[] = [
  { name: "Runway", zeichen: "event", meint: "Wie viele Monate das Konto im Plus bleibt." },
  { name: "Tiefster Stand", zeichen: "tief", meint: "Der niedrigste Stand an einem Monatsende im ganzen Planzeitraum." },
  {
    name: "Überbrückung",
    zeichen: "bruecke",
    meint: "Was zusätzlich hereinkommen muss, damit der Stand nie unter den Mindestpuffer fällt.",
  },
  { name: "Burn Ø 6 Monate", zeichen: "flamme", meint: "Personal und Kosten minus Umsatz je Monat, gemittelt über die ersten sechs Monate." },
  { name: "Break-even", zeichen: "waage", meint: "Der erste Monat, in dem der Umsatz Personal und laufende Kosten deckt." },
  // Abgekürzt: „Gesellschafterdarlehen" ist in Versalien breiter als eine
  // halbe Handybreite und lässt sich nicht sinnvoll trennen.
  { name: "Ges.-Darlehen", zeichen: "muenze", meint: "Was an Gesellschafterdarlehen eingeplant ist — von Hand oder aus der Überbrückung übernommen." },
];

function Kennzahlkopf({ k }: { k: (typeof KENNZAHLEN)[number] }) {
  return (
    <span className="rw-kpi-kopf">
      <Zeichen name={k.zeichen} />
      <span className="rw-eyebrow">{k.name}</span>
      <Hinweis worum={`Was „${k.name}“ meint`} text={k.meint} />
    </span>
  );
}

/**
 * Das Szenario steht nicht mehr im Satz: Es ist oben im Umschalter markiert,
 * und „Im Basis-Szenario …" vorneweg war das, was man beim zweiten Lesen
 * überspringt.
 */
export function Lage({ S, r }: { S: Runwayplan; r: Runwayrechnung }) {
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
          <p>Kontostand, Förderungen und Kosten eintragen — dann steht hier, wie lange das Geld reicht.</p>
        </section>
        <section className="rw-kpis">
          {KENNZAHLEN.map((t) => (
            <div key={t.name} className="rw-kpi">
              <Kennzahlkopf k={t} />
              <span className="v">—</span>
              <span className="s">&nbsp;</span>
            </div>
          ))}
        </section>
      </>
    );

  let status;
  if (k.neg !== null)
    status = (
      <section className="rw-status" data-s="bad" aria-live="polite">
        <span className="rw-pill bad"><Zeichen name="achtung" />Liquiditätslücke</span>
        <p>
          Ab <strong>{a.labL(k.neg)}</strong> im Minus. Für den Puffer von {fmtE(buf)} fehlen <strong>{fmtE(need)}</strong>,
          erstmals im {a.labL(r.sug[0]?.i ?? k.neg)}.
        </p>
      </section>
    );
  else if (k.low !== null)
    status = (
      <section className="rw-status" data-s="warn" aria-live="polite">
        <span className="rw-pill warn"><Zeichen name="achtung" />Unter Puffer</span>
        <p>
          Im Plus, aber ab <strong>{a.labL(k.low)}</strong> unter dem Puffer von {fmtE(buf)}. Zum Auffüllen: <strong>{fmtE(need)}</strong>.
        </p>
      </section>
    );
  else
    status = (
      <section className="rw-status" data-s="ok" aria-live="polite">
        <span className="rw-pill ok"><Zeichen name="haken" />Durchfinanziert</span>
        <p>
          Bis {a.labL(n - 1)} über dem Puffer von {fmtE(buf)}
          {k.gdN > 0 && k.negZ !== null && ` — mit den Gesellschafterdarlehen; ohne sie Minus ab ${a.labL(k.negZ)}`}.
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
    { v: burn > 0 ? fmtE(burn) : "positiv", s: burn > 0 ? "je Monat" : "Umsatz deckt die Kosten", c: "" },
    {
      v: k.be !== null ? a.lab(k.be) : "nicht im Plan",
      s: k.be !== null ? "\u00a0" : "Umsatz unter den Kosten",
      c: k.be !== null ? "ok" : "",
    },
    { v: fmtE(k.gdSum), s: k.gdN ? `${k.gdN} eingeplant` : "noch keine", c: "darl" },
  ];

  return (
    <>
      {status}
      <section className="rw-kpis">
        {kp.map((x, j) => (
          <div key={KENNZAHLEN[j].name} className={`rw-kpi ${x.c}`}>
            <Kennzahlkopf k={KENNZAHLEN[j]} />
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
