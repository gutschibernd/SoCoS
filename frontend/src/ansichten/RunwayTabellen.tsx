/**
 * Runway-Planung: Überbrückung, Jahres- und Monatsübersicht — wie
 * `renderBridge`, `renderYears` und `renderLedger` des Runway-Planers.
 * Die Summen kommen vom Server; hier wird nur gezeigt und als CSV ausgegeben.
 */

import { useRef, useState } from "react";

import type { Runwaymonat, Runwayplan, Runwayrechnung, Szenario } from "../basis/daten";
import { Achse, MON, anbieten, fmtE, num, parseDe, stempel, tabelleAlsCsv, zelle } from "../basis/runway";
import { Hinweis } from "../bausteine/Hinweis";
import { Zeichen } from "../bausteine/Zeichen";

/* --- Überbrückung ------------------------------------------------------------ */

export function Ueberbrueckung({
  S,
  r,
  darf,
  gruppeSetzen,
  uebernehmen,
}: {
  S: Runwayplan;
  r: Runwayrechnung;
  darf: boolean;
  gruppeSetzen: (monate: number) => void;
  uebernehmen: () => void;
}) {
  const a = new Achse(S.settings.start);
  const buf = num(S.settings.buffer);
  const need = num(r.kpi.need);
  const g = num(S.settings.bridgeGroup) || 3;
  const hatGD = S.darlehen.some((d) => (d.typ || "gesellschafter") === "gesellschafter");

  let text;
  if (r.leer) text = <p>Hier steht, wann und wie viel überbrückt werden muss.</p>;
  else if (!r.sug.length)
    text = (
      <>
        <p className="rw-ok-note"><Zeichen name="haken" />Kein Bedarf — der Stand bleibt über <strong>{fmtE(buf)}</strong>.</p>
        {hatGD && r.kpi.negZ !== null && <p>Ohne die eingeplanten Gesellschafterdarlehen: Minus ab {a.labL(r.kpi.negZ)}.</p>}
      </>
    );
  else
    text = (
      <>
        <p>
          <strong>{fmtE(need)}</strong> in {r.sug.length} Abruf{r.sug.length > 1 ? "en" : ""}, der erste im <strong>{a.labL(r.sug[0].i)}</strong> —
          damit der Stand nie unter {fmtE(buf)} fällt.
        </p>
        <div className="rw-bridge-ctrl">
          <label htmlFor="rw-bg" className="rw-hint">Ein Abruf deckt</label>
          <select className="rw-inp auto" id="rw-bg" value={g} disabled={!darf} onChange={(e) => gruppeSetzen(Number(e.target.value))}>
            {[1, 3, 6, 12].map((v) => (
              <option key={v} value={v}>{v} Monat{v > 1 ? "e" : ""}</option>
            ))}
          </select>
          <Hinweis
            worum="Wie ein Abruf gerechnet wird"
            text="Jeder Abruf deckt den tiefsten Stand der gewählten Monate ab und ist auf 5.000 € gerundet. Übernommen landen die Vorschläge als Gesellschafterdarlehen im Register „Darlehen & Kredite“ — dort Gesellschafter:in, Rückzahlung und Zins nachtragen."
          />
        </div>
        {darf && (
          <div className="rw-bridge-ctrl">
            <button type="button" className="rw-btn primary" onClick={uebernehmen}><Zeichen name="plus" />Als Gesellschafterdarlehen übernehmen</button>
          </div>
        )}
      </>
    );

  return (
    <section className="rw-panel">
      <div className="rw-panel-head"><h2 className="rw-mit-zeichen"><Zeichen name="bruecke" />Überbrückung</h2></div>
      <div className="rw-bridge-grid">
        <div className="rw-bridge-copy">{text}</div>
        <div>
          {!r.leer && r.sug.length > 0 && (
            <table className="rw-mini">
              <thead>
                <tr><th>Monat</th><th className="n">Kontostand vorher</th><th className="n">Abruf</th></tr>
              </thead>
              <tbody>
                {r.sug.map((s) => (
                  <tr key={s.i}>
                    <td>{a.labL(s.i)}</td>
                    <td className={`n ${num(s.before) < 0 ? "bad" : "warn"}`}>{fmtE(s.before)}</td>
                    <td className="n"><b>{fmtE(s.amount)}</b></td>
                  </tr>
                ))}
                <tr className="summe"><td><b>Summe</b></td><td /><td className="n"><b>{fmtE(need)}</b></td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

/* --- Gemeinsames für beide Übersichten ------------------------------------------ */

function CsvKnopf({ tabelle, name }: { tabelle: React.RefObject<HTMLTableElement | null>; name: string }) {
  return (
    <button
      type="button"
      className="rw-btn"
      onClick={() => tabelle.current && anbieten(`${name}-${stempel()}.csv`, `﻿${tabelleAlsCsv(tabelle.current)}`)}
    >
      CSV exportieren
    </button>
  );
}

function kategorien(A: Runwaymonat[]) {
  const alle = new Set<string>();
  A.forEach((m) => Object.keys(m.kostCat).forEach((k) => alle.add(k)));
  return [...alle].sort((x, y) => x.localeCompare(y, "de"));
}

/* --- Jahresübersicht ------------------------------------------------------------- */

export function Jahre({ S, r, szenario }: { S: Runwayplan; r: Runwayrechnung; szenario: Szenario }) {
  const tabelle = useRef<HTMLTableElement>(null);
  const buf = num(S.settings.buffer);
  const Y = r.jahre;
  const cats = kategorien(r.A);
  const s = (y: (typeof Y)[number], k: string) => num(y.sum[k]);
  type Zeile = [string, string, (y: (typeof Y)[number]) => number, string?, boolean?];
  const zeilen: Zeile[] = [
    ["sub", "Einzahlungen (ohne USt)", (y) => s(y, "foerd") + s(y, "fp") + s(y, "inv") + s(y, "ums") + s(y, "darl") + s(y, "kredit")],
    ["indent", "Förderungen", (y) => s(y, "foerd"), "foerd"],
    ["indent", "Forschungsprämie", (y) => s(y, "fp"), "foerd"],
    ["indent", "Investments", (y) => s(y, "inv"), "inv"],
    ["indent", "Umsätze (netto)", (y) => s(y, "ums"), "ums"],
    ["indent", "Gesellschafterdarlehen", (y) => s(y, "darl"), "darl"],
    ["indent", "Kredite & Förderdarlehen", (y) => s(y, "kredit"), "darl"],
    ["sub", "Auszahlungen (ohne USt)", (y) => s(y, "team") + s(y, "kosten") + s(y, "foerdBack") + s(y, "tilg")],
    ["indent", "Personal", (y) => s(y, "team"), "team"],
    ...(cats.length
      ? cats.map((c): Zeile => ["indent", c, (y) => num(y.cat[c]), "kost"])
      : [["indent", "Fixkosten & Ausgaben", (y: (typeof Y)[number]) => s(y, "kosten"), "kost"] as Zeile]),
    ["indent", "Förder-Rückzahlungen", (y) => s(y, "foerdBack"), "foerd"],
    ["indent", "Tilgung & Zinsen", (y) => s(y, "tilg"), "darl"],
    ["", "Umsatzsteuer-Saldo", (y) => num(y.vat), "tax"],
    ["", "Netto-Cashflow", (y) => s(y, "net")],
    ["end", "Kontostand Jahresende", (y) => num(y.end)],
    ["info", "NeuFöG-Ersparnis (im Personal enthalten)", (y) => s(y, "neuf")],
    ["", "Mitarbeiter:innen am Jahresende", (y) => y.head, undefined, true],
  ];
  return (
    <section className="rw-panel">
      <div className="rw-panel-head">
        <h2>Jahresübersicht</h2>
        <CsvKnopf tabelle={tabelle} name={`jahresuebersicht-${szenario}`} />
      </div>
      <div className="rw-table-scroll">
        <table className="rw-ledger" ref={tabelle}>
          <thead>
            <tr>
              <th className="rowh">Jahr</th>
              {Y.map((y) => (
                <th key={y.y} className="jan">{y.y}{y.monate < 12 ? ` (${MON[y.von]}–${MON[y.bis]})` : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map(([cls, label, fn, farbe, schlicht]) => {
              const werte = Y.map(fn);
              if ((cls === "indent" || cls === "info") && !werte.some((v) => Math.round(v))) return null;
              return (
                <tr key={label} className={cls}>
                  <th className="rowh">{farbe && <span className={`sw ${farbe}`} />}{label}</th>
                  {werte.map((v, j) => (
                    <td key={j} className={label.startsWith("Kontostand") ? (v < 0 ? "neg" : v < buf ? "low" : "") : !Math.round(v) ? "zero" : ""}>
                      {schlicht ? v || "–" : zelle(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --- Monatsübersicht --------------------------------------------------------------- */

const ZEILEN: { k: keyof Runwaymonat; t: string; farbe?: string; cls?: string; immer?: boolean; cats?: boolean }[] = [
  { k: "open", t: "Anfangsbestand", cls: "end", immer: true },
  { k: "foerd", t: "Förderungen", farbe: "foerd", cls: "indent", immer: true },
  { k: "fp", t: "Forschungsprämie", farbe: "foerd", cls: "indent" },
  { k: "inv", t: "Investments", farbe: "inv", cls: "indent", immer: true },
  { k: "ums", t: "Umsätze (netto)", farbe: "ums", cls: "indent", immer: true },
  { k: "ustIn", t: "USt auf Umsätze", farbe: "tax", cls: "indent" },
  { k: "darl", t: "Gesellschafterdarlehen", farbe: "darl", cls: "indent" },
  { k: "kredit", t: "Kredite & Förderdarlehen", farbe: "darl", cls: "indent" },
  { k: "uvaIn", t: "USt-Gutschrift Finanzamt", farbe: "tax", cls: "indent" },
  { k: "inSum", t: "Einzahlungen", cls: "sub", immer: true },
  { k: "team", t: "Personal", farbe: "team", cls: "indent", immer: true },
  { k: "kosten", t: "Fixkosten & Ausgaben (netto)", farbe: "kost", cls: "indent", immer: true, cats: true },
  { k: "vst", t: "Vorsteuer auf Kosten", farbe: "tax", cls: "indent" },
  { k: "foerdBack", t: "Förder-Rückzahlungen", farbe: "foerd", cls: "indent" },
  { k: "tilg", t: "Tilgung & Zinsen", farbe: "darl", cls: "indent" },
  { k: "uvaOut", t: "USt-Zahllast Finanzamt", farbe: "tax", cls: "indent" },
  { k: "outSum", t: "Auszahlungen", cls: "sub", immer: true },
  { k: "net", t: "Netto-Cashflow", immer: true },
  { k: "cash", t: "Endbestand", cls: "end", immer: true },
];

export function Monate({
  S,
  r,
  szenario,
  darf,
  ist,
}: {
  S: Runwayplan;
  r: Runwayrechnung;
  szenario: Szenario;
  darf: boolean;
  ist: (monat: string, betrag: number | null) => Promise<void>;
}) {
  const tabelle = useRef<HTMLTableElement>(null);
  const [falsch, setFalsch] = useState<Set<string>>(new Set());
  const a = new Achse(S.settings.start);
  const A = r.A;
  const buf = num(S.settings.buffer);
  const cats = kategorien(A);
  const hatIst = A.some((m) => m.ist !== null);

  function istSpeichern(key: string, text: string, vorher: string | null) {
    const v = parseDe(text);
    const markiert = new Set(falsch);
    if (Number.isNaN(v)) {
      markiert.add(key);
      setFalsch(markiert);
      return;
    }
    markiert.delete(key);
    setFalsch(markiert);
    if ((v === null && vorher === null) || (v !== null && vorher !== null && Math.abs(v - num(vorher)) < 0.005)) return;
    void ist(key, v).catch(() => undefined);
  }

  return (
    <section className="rw-panel">
      <div className="rw-panel-head">
        <h2>Monatsübersicht</h2>
        <CsvKnopf tabelle={tabelle} name={`liquiditaetsplan-${szenario}`} />
      </div>
      <div className="rw-table-scroll">
        <table className="rw-ledger" ref={tabelle}>
          <thead>
            <tr>
              <th className="rowh">Monat</th>
              {A.map((m, i) => <th key={m.key} className={a.moy(i) === 0 ? "jan" : ""}>{a.lab(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {ZEILEN.map((z) => {
              if (!z.immer && !A.some((m) => Math.round(num(m[z.k] as string)))) return null;
              return [
                <tr key={z.k} className={z.cls ?? ""}>
                  <th className="rowh">
                    {z.farbe && <span className={`sw ${z.farbe}`} />}
                    {z.t}
                    {z.k === "cash" && S.settings.rebase !== false && hatIst && <span className="rw-hint"> (ab Ist)</span>}
                  </th>
                  {A.map((m) => {
                    const v = num(m[z.k] as string);
                    const cls = z.k === "cash" || z.k === "open" ? (v < 0 ? "neg" : v < buf ? "low" : "") : !Math.round(v) ? "zero" : "";
                    return <td key={m.key} className={cls}>{zelle(v)}</td>;
                  })}
                </tr>,
                ...(z.cats && cats.length > 1
                  ? cats.map((c) => (
                      <tr key={`cat-${c}`} className="indent2">
                        <th className="rowh">{c}</th>
                        {A.map((m) => <td key={m.key}>{zelle(m.kostCat[c] ?? 0)}</td>)}
                      </tr>
                    ))
                  : []),
              ];
            })}
            {A.some((m) => num(m.neuf)) && (
              <tr className="info">
                <th className="rowh">NeuFöG-Ersparnis (im Personal enthalten)</th>
                {A.map((m) => <td key={m.key}>{zelle(m.neuf)}</td>)}
              </tr>
            )}
            <tr>
              <th className="rowh">Mitarbeiter:innen</th>
              {A.map((m) => <td key={m.key} className={m.head ? "" : "zero"}>{m.head || "–"}</td>)}
            </tr>
            <tr className="ist">
              <th className="rowh">
                Ist-Kontostand (Bank){" "}
                <Hinweis
                  worum="Was der Ist-Kontostand bewirkt"
                  text="Am Monatsende den echten Bankstand eintragen. Er steht dann auch im Baustein „Geld“ der Übersicht, und die Prognose rechnet ab dem letzten Ist-Wert weiter (abschaltbar in den Einstellungen)."
                />
              </th>
              {A.map((m, i) => (
                <td key={m.key} className="ist-cell">
                  <input
                    key={`${m.key}-${m.ist ?? ""}`}
                    className={`rw-ist-inp${falsch.has(m.key) ? " bad" : ""}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={m.ist !== null ? String(Math.round(num(m.ist) * 100) / 100) : ""}
                    placeholder="–"
                    disabled={!darf}
                    aria-label={`Ist-Kontostand ${a.labL(i)}`}
                    title={m.ist_datum ? `Kontostand vom ${new Date(`${m.ist_datum}T00:00:00`).toLocaleDateString("de-AT")}` : undefined}
                    onBlur={(e) => istSpeichern(m.key, e.target.value, m.ist)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </td>
              ))}
            </tr>
            {hatIst && (
              <tr>
                <th className="rowh">Abweichung Ist − Plan</th>
                {A.map((m) =>
                  m.ist === null ? (
                    <td key={m.key} className="zero">–</td>
                  ) : (
                    <td key={m.key} className={num(m.ist) - num(m.planCash) < 0 ? "neg" : "pos"}>{zelle(num(m.ist) - num(m.planCash))}</td>
                  ),
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
