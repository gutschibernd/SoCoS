/**
 * Runway-Planung: Kontostand und Zeitachse auf **einer** Monatsachse — oben
 * die Linie mit Puffer, Minusbereich und Netto je Monat, darunter Zeile für
 * Zeile, was wann fließt. Fährt man mit der Maus darüber (oder tippt), steht
 * der Monat im Tooltip. Wie `drawCharts` und `showTip` des Runway-Planers.
 *
 * Die Farben sind Verweise auf `--rw-*` aus farben.css, keine Werte.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { Runwayplan, Runwayrechnung } from "../basis/daten";
import { Achse, MON, fmtE, kfmt, lanes, niceStep, num, zusammenfassen, type Farbe } from "../basis/runway";

const FARBE: Record<Farbe, string> = {
  foerd: "var(--rw-c-foerd)", inv: "var(--rw-c-inv)", ums: "var(--rw-c-ums)", team: "var(--rw-c-team)",
  kost: "var(--rw-c-kost)", darl: "var(--rw-c-darl)", tax: "var(--rw-c-tax)", bad: "var(--rw-bad)",
};

export function Verlauf({
  S,
  r,
  darf,
  merken,
  vergessen,
}: {
  S: Runwayplan;
  r: Runwayrechnung;
  darf: boolean;
  merken: () => void;
  vergessen: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(900);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth || 900));
    ro.observe(el);
    setCw(el.clientWidth || 900);
    return () => ro.disconnect();
  }, [r.leer]);

  // Wer die Seite scrollt, ohne die Maus zu bewegen, ließe den Tooltip sonst
  // über einem Monat stehen, auf den er nicht mehr zeigt.
  useEffect(() => {
    if (!tip) return;
    const weg = () => setTip(null);
    window.addEventListener("scroll", weg, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", weg, { capture: true });
  }, [tip]);

  const a = new Achse(S.settings.start);
  const A = r.A;
  const n = A.length;
  const narrow = cw < 640;
  const L = narrow ? 104 : 176;
  const R = 18;
  const band = Math.max(narrow ? 13 : 11, (cw - L - R) / n);
  const W = Math.round(L + R + band * n);
  const xs = (i: number) => L + band * i;
  const xc = (i: number) => L + band * (i + 0.5);
  const buf = num(S.settings.buffer);
  const cash = A.map((m) => num(m.cash));
  const Z = r.Z.map(num);
  const hasGD = r.kpi.hasGD;
  const bl: (number | null)[] | null = (() => {
    const b = S.baseline;
    if (!b) return null;
    const out: (number | null)[] = new Array(n).fill(null);
    b.keys.forEach((k, j) => {
      const i = a.idx(k);
      if (i !== null && i >= 0 && i < n) out[i] = b.cash[j];
    });
    return out.some((v) => v !== null) ? out : null;
  })();
  const ist = A.filter((m) => m.ist !== null);

  const T = 26, H = narrow ? 220 : 280, G = 18, NB = 62, B = 26;
  const vals = [0, buf, num(S.settings.cash), ...cash, ...ist.map((m) => num(m.ist)), ...(hasGD ? Z : []), ...((bl ?? []).filter((v) => v !== null) as number[])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1000) {
    hi += 1000;
    lo -= 1000;
  }
  const stp = niceStep((hi - lo) / (narrow ? 4 : 5));
  lo = Math.floor(lo / stp) * stp;
  hi = Math.ceil(hi / stp) * stp;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * H;
  const y0 = y(0);
  const yb = y(buf);
  const CH = T + H + G + NB + B;
  const pts = (werte: number[]) => [`${xs(0)},${y(num(S.settings.cash))}`, ...werte.map((v, i) => `${xs(i + 1)},${y(v)}`)];
  const pA = pts(cash);
  const yFloor = y(Math.max(lo, Math.min(0, hi)));
  const heute = (() => {
    const d = new Date();
    const i = a.idx(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    return i !== null && i >= 0 && i < n ? i : null;
  })();

  const linien: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += stp) linien.push(v);
  const nt = T + H + G;
  const mx = Math.max(1, ...A.map((m) => Math.abs(num(m.net))));
  const ny = (v: number) => nt + NB / 2 - (v / mx) * (NB / 2 - 3);
  const every = band >= 34 ? 1 : band >= 18 ? 3 : 6;

  const rows = lanes(S, r);
  const RH = 34, LT = 10;
  const LH = rows.length ? LT + rows.length * RH + 8 : 0;

  function zeigen(e: React.PointerEvent) {
    const svg = box.current?.querySelector("svg");
    if (!svg) return;
    const i = Math.floor((e.clientX - svg.getBoundingClientRect().left - L) / band);
    setTip(i < 0 || i >= n ? null : { i, x: e.clientX, y: e.clientY });
  }

  return (
    <section className="rw-panel">
      <div className="rw-panel-head">
        <h2>Kontostand und Zeitachse</h2>
        {!r.leer && darf && (
          <div className="rw-panel-tools">
            {S.baseline ? (
              <>
                <span className="rw-chip">
                  Vergleich: Stand {new Date(S.baseline.savedAt).toLocaleDateString("de-AT")} · {S.baseline.scenario}
                  <button type="button" aria-label="Vergleichsstand entfernen" title="Vergleichsstand entfernen" onClick={vergessen}>
                    ×
                  </button>
                </span>
                <button type="button" className="rw-btn sm" onClick={merken}>
                  Neu merken
                </button>
              </>
            ) : (
              <button type="button" className="rw-btn sm" onClick={merken} title="Aktuellen Kontostandsverlauf als gestrichelte Vergleichslinie behalten">
                Aktuellen Stand als Vergleich merken
              </button>
            )}
          </div>
        )}
      </div>
      {!r.leer && (
        <div className="rw-legend">
          <span><i className="linie" />Kontostand (Plan)</span>
          {hasGD && <span><i className="dash" />ohne Gesellschafterdarlehen</span>}
          {bl && <span><i className="base" />Vergleichsstand</span>}
          {ist.length > 0 && <span><i className="sq" />Ist-Kontostand</span>}
          <span><i className="flaeche warn" />unter Mindestpuffer</span>
          <span><i className="flaeche bad" />im Minus</span>
          <span><i className="dot voll" />erhalten / zugesagt</span>
          <span><i className="dot leer" />geplant</span>
        </div>
      )}
      <div
        className="rw-chart-scroll"
        ref={box}
        hidden={r.leer}
        onPointerMove={zeigen}
        onPointerDown={zeigen}
        onPointerLeave={() => setTip(null)}
        onScroll={() => setTip(null)}
      >
        <svg width={W} height={CH} viewBox={`0 0 ${W} ${CH}`} role="img" aria-label="Kontostand pro Monat">
          <defs>
            <clipPath id="rw-cpA"><rect x={0} y={0} width={W} height={Math.max(0, y0)} /></clipPath>
            <clipPath id="rw-cpB"><rect x={0} y={y0} width={W} height={Math.max(0, CH - y0)} /></clipPath>
            <linearGradient id="rw-gA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rw-accent)" stopOpacity={0.24} />
              <stop offset="1" stopColor="var(--rw-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {y0 < T + H && <rect x={L} y={y0} width={band * n} height={T + H - y0} fill="var(--rw-bad-soft)" />}
          {buf > 0 && yb < y0 && (
            <rect x={L} y={Math.max(T, yb)} width={band * n} height={Math.min(y0, T + H) - Math.max(T, yb)} fill="var(--rw-warn-soft)" />
          )}
          {linien.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--rw-line-2)" />
              <text className="ax" x={L - 8} y={y(v) + 3.5} textAnchor="end">{kfmt(v)}</text>
            </g>
          ))}
          {A.map((m, i) =>
            a.moy(i) === 0 || i === 0 ? (
              <g key={m.key}>
                <line x1={xs(i)} x2={xs(i)} y1={T - 12} y2={T + H + G + NB} stroke="var(--rw-line)" strokeDasharray={i === 0 ? undefined : "2 3"} />
                <text className="jahr" x={xs(i) + 4} y={T - 6}>{a.yr(i)}</text>
              </g>
            ) : null,
          )}
          {heute !== null && (
            <g>
              <line x1={xc(heute)} x2={xc(heute)} y1={T} y2={T + H} stroke="var(--rw-accent)" strokeOpacity={0.45} strokeDasharray="3 3" />
              <text className="heute" x={xc(heute)} y={T + H + 12} textAnchor="middle">heute</text>
            </g>
          )}
          <line x1={L} x2={W - R} y1={y0} y2={y0} stroke="var(--rw-muted)" />
          {buf > 0 && (
            <g>
              <line x1={L} x2={W - R} y1={yb} y2={yb} stroke="var(--rw-warn)" strokeDasharray="5 4" />
              <text className="puffer" x={W - R - 2} y={yb - 5} textAnchor="end">Mindestpuffer {kfmt(buf)}</text>
            </g>
          )}
          <path d={`M${pA.join(" L")} L${xs(n)},${yFloor} L${xs(0)},${yFloor} Z`} fill="url(#rw-gA)" clipPath="url(#rw-cpA)" />
          {bl && (
            <path
              d={bl.reduce((d, v, i) => (v === null ? d : `${d}${d && bl[i - 1] !== null ? "L" : "M"}${xs(i + 1)},${y(v)} `), "")}
              fill="none" stroke="var(--rw-faint)" strokeWidth={1.6} strokeDasharray="1.5 3.5" strokeLinecap="round"
            />
          )}
          {hasGD && <path d={`M${pts(Z).join(" L")}`} fill="none" stroke="var(--rw-muted)" strokeWidth={1.5} strokeDasharray="5 4" />}
          <path d={`M${pA.join(" L")}`} fill="none" stroke="var(--rw-accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" clipPath="url(#rw-cpA)" />
          <path d={`M${pA.join(" L")}`} fill="none" stroke="var(--rw-bad)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" clipPath="url(#rw-cpB)" />
          {ist.map((m) => (
            <rect key={m.key} x={xs(m.i + 1) - 4} y={y(num(m.ist)) - 4} width={8} height={8} rx={1} fill="var(--rw-ink)">
              <title>Ist {a.labL(m.i)}: {fmtE(m.ist ?? 0)}</title>
            </rect>
          ))}
          {r.sug.map((s) => (
            <circle key={s.i} cx={xs(s.i + 1)} cy={y(cash[s.i])} r={4.5} fill="var(--rw-surface)" stroke="var(--rw-bad)" strokeWidth={2} />
          ))}
          <circle cx={xs(n)} cy={y(cash[n - 1])} r={4} fill={cash[n - 1] < 0 ? "var(--rw-bad)" : "var(--rw-accent)"} />
          <text className="lbl-sub" x={L - 8} y={T - 6} textAnchor="end">Kontostand</text>

          <text className="lbl-sub" x={L - 8} y={nt + NB / 2 - 4} textAnchor="end">Netto</text>
          <text className="lbl-sub" x={L - 8} y={nt + NB / 2 + 8} textAnchor="end">pro Monat</text>
          <line x1={L} x2={W - R} y1={ny(0)} y2={ny(0)} stroke="var(--rw-line)" />
          {A.map((m, i) => {
            const v = num(m.net);
            const bw = Math.max(2, band * 0.62);
            return (
              <rect
                key={m.key}
                x={xc(i) - bw / 2}
                y={v >= 0 ? ny(v) : ny(0)}
                width={bw}
                height={Math.max(0.5, Math.abs(ny(v) - ny(0)))}
                rx={1.5}
                fill={v >= 0 ? "var(--rw-ok)" : "var(--rw-c-kost)"}
                opacity={0.85}
              />
            );
          })}
          {A.map((m, i) =>
            a.moy(i) % every === 0 ? (
              <text key={m.key} className="ax" x={xc(i)} y={CH - 8} textAnchor="middle">{MON[a.moy(i)]}</text>
            ) : null,
          )}
          {tip && <rect x={xs(tip.i)} y={T} width={band} height={H + G + NB} fill="var(--rw-ink)" opacity={0.06} pointerEvents="none" />}
        </svg>

        {rows.length > 0 && (
          <svg width={W} height={LH} viewBox={`0 0 ${W} ${Math.max(1, LH)}`} role="img" aria-label="Zeitachse der geplanten Zahlungen">
            <line x1={0} x2={W} y1={2} y2={2} stroke="var(--rw-line)" />
            {A.map((m, i) => (a.moy(i) === 0 ? <line key={m.key} x1={xs(i)} x2={xs(i)} y1={2} y2={LH} stroke="var(--rw-line)" strokeDasharray="2 3" /> : null))}
            {rows.map((row, k) => {
              const cy = LT + k * RH + RH / 2 + 4;
              const farbe = FARBE[row.farbe];
              const maxCh = Math.floor((L - 26) / 6.6);
              const text = row.l.length > maxCh ? `${row.l.slice(0, maxCh - 1)}…` : row.l;
              const teile: ReactNode[] = [];
              if (k > 0 && rows[k - 1].g !== row.g)
                teile.push(<line key="trenner" x1={8} x2={W - R} y1={cy - RH / 2 - 4} y2={cy - RH / 2 - 4} stroke="var(--rw-line-2)" />);
              teile.push(<rect key="mark" x={10} y={cy - 5} width={4} height={10} rx={1} fill={farbe} />);
              teile.push(
                <text key="name" className="lbl" x={20} y={cy + 4}>
                  <title>{`${row.g}: ${row.l}`}</title>
                  {text}
                </text>,
              );
              if (row.rng && row.rng[1] >= row.rng[0]) {
                const x1 = xs(row.rng[0]) + 1;
                const w = xs(row.rng[1] + 1) - xs(row.rng[0]) - 2;
                teile.push(<rect key="balken" x={x1} y={cy - 7} width={w} height={14} rx={4} fill={farbe} opacity={row.op} />);
                if (w > 76) teile.push(<text key="btext" className="amt dunkel" x={x1 + 6} y={cy + 3.5}>{row.txt}</text>);
              }
              // Beschriftungen rechts neben dem Punkt, bei Platzmangel darüber, sonst nur im Tooltip.
              let endRight = -Infinity;
              let endTop = -Infinity;
              zusammenfassen(row.pts ?? [], n).forEach((p) => {
                const cx = xc(p.i);
                const voll = p.st === "erhalten" || p.st === "zugesagt";
                const fill = voll ? farbe : "var(--rw-surface)";
                const op = p.st === "zugesagt" ? 0.55 : 1;
                if (p.dia)
                  teile.push(
                    <rect key={`p${p.i}`} x={cx - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${cx} ${cy})`}
                      fill={p.v < 0 ? "var(--rw-surface)" : fill} fillOpacity={op} stroke={farbe} strokeWidth={2} />,
                  );
                else
                  teile.push(<circle key={`p${p.i}`} cx={cx} cy={cy} r={row.small ? 4 : 5.5} fill={fill} fillOpacity={op} stroke={farbe} strokeWidth={2} />);
                if ((p.cnt ?? 1) > 1)
                  teile.push(
                    <text key={`c${p.i}`} x={cx} y={cy + 3} textAnchor="middle" className="anzahl" fill={voll ? "var(--rw-surface)" : farbe}>{p.cnt}</text>,
                  );
                if (row.small) return;
                const t = `${p.v < 0 ? "−" : ""}${kfmt(Math.abs(p.v))}`;
                const tw = t.length * 6.2;
                if (cx + 9 > endRight + 4) {
                  teile.push(<text key={`a${p.i}`} className="amt" x={cx + 9} y={cy + 3.5}>{t}</text>);
                  endRight = cx + 9 + tw;
                } else if (cx - tw / 2 > endTop + 4) {
                  teile.push(<text key={`a${p.i}`} className="amt" x={cx} y={cy - 10} textAnchor="middle">{t}</text>);
                  endTop = cx + tw / 2;
                }
              });
              return <g key={`${row.g}-${row.l}-${k}`}>{teile}</g>;
            })}
            {tip && <rect x={xs(tip.i)} y={2} width={band} height={LH - 2} fill="var(--rw-ink)" opacity={0.06} pointerEvents="none" />}
          </svg>
        )}
      </div>
      {r.leer && (
        <div className="rw-chart-empty">
          <strong>Noch keine Planung erfasst</strong>
          Trage unter „Einstellungen“ den Kontostand zum Start ein und füge die erste Förderung, Person oder Fixkosten hinzu.
        </div>
      )}
      {tip && <Tooltip S={S} r={r} i={tip.i} x={tip.x} y={tip.y} />}
    </section>
  );
}

function Tooltip({ S, r, i, x, y }: { S: Runwayplan; r: Runwayrechnung; i: number; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: x + 16, top: y + 14 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let left = x + 16;
    let top = y + 14;
    if (left + el.offsetWidth > innerWidth - 8) left = x - el.offsetWidth - 16;
    if (top + el.offsetHeight > innerHeight - 8) top = innerHeight - el.offsetHeight - 8;
    setLage({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, i]);

  const a = new Achse(S.settings.start);
  const m = r.A[i];
  const buf = num(S.settings.buffer);
  const cash = num(m.cash);
  const z = num(r.Z[i]);
  const zeile = (links: ReactNode, rechts: ReactNode, klasse = "") => (
    <div className={`r ${klasse}`}>
      <span>{links}</span>
      <span>{rechts}</span>
    </div>
  );
  const ein: [string, string][] = [["Förderungen", m.foerd], ["Forschungsprämie", m.fp], ["Investments", m.inv], ["Umsätze netto", m.ums], ["USt auf Umsätze", m.ustIn], ["Gesellschafterdarlehen", m.darl], ["Kredite", m.kredit], ["USt-Gutschrift", m.uvaIn]];
  const aus: [string, string][] = [["Personal", m.team], ["Fixkosten & Ausgaben", m.kosten], ["Vorsteuer", m.vst], ["Förder-Rückzahlung", m.foerdBack], ["Tilgung & Zinsen", m.tilg], ["USt-Zahllast", m.uvaOut]];
  const sg = r.sug.find((s) => s.i === i);
  const ev = m.ev.filter((e) => e.t);

  return (
    <div className="rw-tip" ref={ref} style={lage}>
      <h4>{a.labL(i)}</h4>
      {zeile("Kontostand Monatsende", <b className={cash < 0 ? "bad" : cash < buf ? "warn" : ""}>{fmtE(cash)}</b>, "big")}
      {m.ist !== null && (
        <>
          {zeile("davon Ist (Bank)", fmtE(m.ist))}
          {zeile("Abweichung zum Plan", fmtE(num(m.ist) - num(m.planCash)))}
        </>
      )}
      {Math.round(z) !== Math.round(cash) && zeile("ohne Gesellschafterdarlehen", fmtE(z))}
      <div className="sep" />
      {ein.filter(([, v]) => num(v)).map(([t, v]) => <div key={t}>{zeile(`+ ${t}`, fmtE(v))}</div>)}
      {aus.filter(([, v]) => num(v)).map(([t, v]) => <div key={t}>{zeile(`− ${t}`, fmtE(v))}</div>)}
      {zeile("Netto", fmtE(m.net), "big")}
      {num(m.neuf) > 0 && <div className="ev">NeuFöG-Ersparnis in diesem Monat: {fmtE(m.neuf)}</div>}
      {sg && (
        <>
          <div className="sep" />
          {zeile(<span className="bad">Überbrückung nötig</span>, <span className="bad">{fmtE(sg.amount)}</span>)}
        </>
      )}
      {ev.length > 0 && (
        <>
          <div className="sep" />
          {ev.slice(0, 8).map((e, k) => (
            <div key={k} className="ev">
              {e.t} · {fmtE(e.v)}
            </div>
          ))}
          {ev.length > 8 && <div className="ev">… und {ev.length - 8} weitere</div>}
        </>
      )}
    </div>
  );
}
