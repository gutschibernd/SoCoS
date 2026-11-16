/**
 * Runway-Planung: die Register zum Eintragen — Förderungen, Investments,
 * Umsätze, Team, Kosten, Darlehen, NeuFöG & Forschungsprämie, Einstellungen.
 * Wie `renderEditor` und `renderAnsprueche` des Runway-Planers: jedes Feld
 * gleich zum Tippen, gespeichert wird von selbst.
 *
 * Die Felder sind ungesteuert (`defaultValue`): Der Plan ändert sich bei jeder
 * Eingabe, das Feld behält, was getippt ist. Wird der Plan von außen ersetzt
 * (Laden, Import, Rückgängig), beginnt der ganze Editor neu (`key` in
 * Runway.tsx).
 */

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Planeintrag, Runwayplan, Runwayrechnung } from "../basis/daten";
import { Achse, KATEGORIEN, MON, MONL, fmtE, istAusgabe, kategorieVon, kfmt, neueTranche, neuerEintrag, num, planjahre, quartalVon, quartalsbeginn, vergangen, verschieben, x0 } from "../basis/runway";
import { Hinweis } from "../bausteine/Hinweis";
import { Zeichen } from "../bausteine/Zeichen";
import { useZeilenZiehen } from "../bausteine/zeilenziehen";

type Liste = "foerderungen" | "investments" | "umsaetze" | "team" | "kosten" | "darlehen";
// Fixkosten und Ausgaben sind zwei Register über **einer** Liste (`kosten`):
// Was einmalig ist, ist eine Ausgabe. Getrennt seit 2026-11-16 (Bernd: „dass
// wir Ausgaben besser übersehen können").
type Register = Exclude<Liste, "kosten"> | "fixkosten" | "ausgaben" | "ansprueche" | "settings";

export const REGISTER: { k: Register; t: string; farbe: string }[] = [
  { k: "foerderungen", t: "Förderungen", farbe: "foerd" },
  { k: "investments", t: "Investments", farbe: "inv" },
  { k: "umsaetze", t: "Umsätze", farbe: "ums" },
  { k: "team", t: "Team", farbe: "team" },
  { k: "fixkosten", t: "Fixkosten", farbe: "kost" },
  { k: "ausgaben", t: "Ausgaben", farbe: "kost" },
  { k: "darlehen", t: "Darlehen & Kredite", farbe: "darl" },
  { k: "ansprueche", t: "NeuFöG & Forschungsprämie", farbe: "tax" },
  { k: "settings", t: "Einstellungen", farbe: "faint" },
];

const STATUS = [["geplant", "geplant"], ["zugesagt", "zugesagt"], ["erhalten", "erhalten"]];
const TRANCHE_ART = [["auszahlung", "Auszahlung"], ["rueckzahlung", "Rückzahlung"]];
const INTERVAL_U = [["monatlich", "monatlich"], ["quartal", "quartalsweise"], ["einmalig", "einmalig"]];
const INTERVAL_F = [["monatlich", "monatlich"], ["quartal", "quartalsweise"], ["jaehrlich", "jährlich"]];
/** Fixkosten auf einen Monat gerechnet — für die Summe über dem Register. */
const JE_MONAT: Record<string, number> = { monatlich: 1, quartal: 3, jaehrlich: 12 };
const INV_ART = [["Eigenkapital", "Eigenkapital"], ["Wandeldarlehen", "Wandeldarlehen"], ["Sonstiges", "Sonstiges"]];
const UST = [["20", "20 %"], ["13", "13 %"], ["10", "10 %"], ["0", "0 %"]];
const DARL_TYP = [["gesellschafter", "Gesellschafterdarlehen"], ["bank", "Bankkredit"], ["foerder", "Förderdarlehen"]];
const TILG = [["endfaellig", "endfällig"], ["raten", "Monatsraten"]];
const NF_CHECK = [
  ["beratung", "Gründungsberatung bei der zuständigen Stelle (z. B. WKO-Gründerservice) durchgeführt"],
  ["formular", "Formular NeuFö 1 (Erklärung der Neugründung) bestätigt"],
  ["lohn", "Formular an Lohnverrechnung übergeben, Befreiung in der Abrechnung aktiv"],
  ["gf", "Mit Steuerberatung geklärt, wer als Dienstnehmer:in zählt (z. B. Gesellschafter-Geschäftsführer:innen)"],
];

const komma = (v: unknown) => String(num(v)).replace(".", ",");

/** Den Plan mit einem geänderten Feld — in einer Liste oder in einer Tranche. */
function mitFeld(S: Runwayplan, l: string, id: string, f: string, v: unknown, p?: string): Runwayplan {
  if (l === "tranchen")
    return { ...S, foerderungen: S.foerderungen.map((fo) => (fo.id !== p ? fo : { ...fo, tranchen: fo.tranchen.map((t) => (t.id !== id ? t : { ...t, [f]: v })) })) };
  return { ...S, [l]: (S[l as Liste] as Planeintrag[]).map((x) => (x.id !== id ? x : { ...x, [f]: v })) };
}

export function Editor({
  S,
  r,
  darf,
  tab,
  setTab,
  aendern,
  entfernen,
  exportieren,
  importieren,
  allesLoeschen,
  jahr,
  setJahr,
  auswahlOeffnen,
  stichtag,
  vergangeneZeigen,
  setVergangeneZeigen,
}: {
  S: Runwayplan;
  r: Runwayrechnung;
  darf: boolean;
  tab: string;
  setTab: (t: string) => void;
  jahr: number | undefined;
  setJahr: (j: number) => void;
  stichtag: string | null;
  vergangeneZeigen: boolean;
  setVergangeneZeigen: (an: boolean) => void;
  auswahlOeffnen: () => void;
  aendern: (neu: Runwayplan) => void;
  entfernen: (neu: Runwayplan, text: string) => void;
  exportieren: () => void;
  importieren: () => void;
  allesLoeschen: () => void;
}) {
  const ed = useRef<HTMLDivElement>(null);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const [quartal, setQuartal] = useState(0);
  // Ausgaben, deren Datum gerade bearbeitet wird, bleiben im Filter stehen:
  // Das Datumsfeld meldet beim Tippen Zwischenjahre (0002, 0020 …), und die
  // Zeile verschwände sonst unter dem Finger. Ein neuer Filter gibt sie frei.
  const [festgehalten, setFestgehalten] = useState<Set<string>>(() => new Set());
  const filtern = (q: number) => {
    setQuartal(q);
    setFestgehalten(new Set());
  };
  const a = new Achse(S.settings.start);
  const st = S.settings;
  const ustOn = !!st.ust;
  // „kosten" ist das Register von vor der Trennung, gemerkt im Browser.
  const t = (tab === "kosten" ? "fixkosten" : REGISTER.some((x) => x.k === tab) ? tab : "foerderungen") as Register;

  /* --- Fixkosten und Ausgaben: was zu sehen ist, und das Ziehen daran --- */
  // Was vor dem Ist-Kontostand lag, ist archiviert: Es steckt im Stand und
  // rechnet nicht mehr mit. Ein Haken holt es zurück in die Liste.
  const weg = (k: Planeintrag) => vergangen(k, stichtag, st.start);
  const da = (k: Planeintrag) => vergangeneZeigen || !weg(k);
  const fixkosten = S.kosten.filter((k) => !istAusgabe(k) && da(k));
  const alleAusgaben = S.kosten.filter((k) => istAusgabe(k) && da(k));
  const archiviert = S.kosten.filter((k) => weg(k) && (t === "ausgaben" ? istAusgabe(k) : !istAusgabe(k))).length;
  // Eine Ausgabe ohne Datum bucht der Server im ersten Planmonat — dort steht sie auch hier.
  const qVon = (k: Planeintrag) => quartalVon(k.start) ?? quartalVon(st.start)!;
  const jahre = planjahre(S);
  const diesesJahr = new Date().getFullYear();
  const j = jahr !== undefined && jahre.includes(jahr) ? jahr : jahre.includes(diesesJahr) ? diesesJahr : jahre[0];
  const imJahr = alleAusgaben.filter((k) => qVon(k).jahr === j);
  const ausgaben = alleAusgaben.filter((k) => festgehalten.has(k.id) || (qVon(k).jahr === j && (!quartal || qVon(k).q === quartal)));
  const summe = (l: Planeintrag[]) => l.reduce((s2, k) => s2 + (k.aus ? 0 : num(k.amount)), 0);
  const sichtbar = t === "fixkosten" ? fixkosten : t === "ausgaben" ? ausgaben : [];
  const ziehen = useZeilenZiehen(
    sichtbar.map((k) => k.id),
    (id, ziel) => aendern({ ...S, kosten: verschieben(S.kosten, id, ziel) }),
  );

  /* --- Feldbausteine (inp, sel, chk, sf … des Planers) --- */
  const zahlAus = (e: HTMLInputElement) => (e.value === "" ? "" : parseFloat(e.value));
  const inp = (l: string, it: Planeintrag, f: string, typ = "text", extra: Record<string, unknown> = {}, p?: string) => (
    <input
      className={`rw-inp${typ === "number" ? " n" : ""}`}
      type={typ}
      {...(typ === "number" ? { step: "any", inputMode: "decimal" as const } : {})}
      defaultValue={String(it[f] ?? "")}
      onChange={(e) => aendern(mitFeld(S, l, it.id, f, typ === "number" ? zahlAus(e.target) : e.target.value, p))}
      {...extra}
    />
  );
  const sel = (l: string, it: Planeintrag, f: string, liste: string[][], p?: string, dflt?: string) => (
    <select className="rw-inp" value={String(it[f] ?? dflt ?? "")} onChange={(e) => aendern(mitFeld(S, l, it.id, f, e.target.value, p))}>
      {liste.map(([w, txt]) => <option key={w} value={w}>{txt}</option>)}
    </select>
  );
  const chk = (l: string, it: Planeintrag, f: string, label: string, dflt = false) => (
    <label className="rw-check">
      <input type="checkbox" checked={it[f] === undefined ? dflt : !!it[f]} onChange={(e) => aendern(mitFeld(S, l, it.id, f, e.target.checked))} /> {label}
    </label>
  );
  const cell = (label: ReactNode, inhalt: ReactNode, cls = "") => (
    <div className={`rw-cell ${cls}`}>
      <span className="rw-cell-l">{label}</span>
      {inhalt}
    </div>
  );
  const xbtn = (l: string, id: string, p?: string) => (
    <button
      type="button"
      className="rw-x"
      aria-label="Eintrag löschen"
      title="Löschen"
      onClick={() =>
        entfernen(
          l === "tranchen"
            ? { ...S, foerderungen: S.foerderungen.map((f) => (f.id !== p ? f : { ...f, tranchen: f.tranchen.filter((x) => x.id !== id) })) }
            : { ...S, [l]: (S[l as Liste] as Planeintrag[]).filter((x) => x.id !== id) },
          "Eintrag gelöscht",
        )
      }
    >
      ×
    </button>
  );
  const tabelle = (cols: string, koepfe: (string | { t: string; r: true })[], zeilen: ReactNode, leer: string) => (
    <div className="rw-rows" style={{ "--cols": cols } as CSSProperties}>
      <div className="rw-row head">
        {koepfe.map((h, j) => (typeof h === "string" ? <span key={j}>{h}</span> : <span key={j} className="r">{h.t}</span>))}
        <span />
      </div>
      {zeilen && (Array.isArray(zeilen) ? zeilen.length > 0 : true) ? zeilen : <div className="rw-empty-rows">{leer}</div>}
    </div>
  );
  function dazu(l: Liste, p?: string) {
    if (l === "foerderungen" && p) {
      aendern({ ...S, foerderungen: S.foerderungen.map((f) => (f.id !== p ? f : { ...f, tranchen: [...f.tranchen, neueTranche()] })) });
    } else if (l === "kosten" && t === "ausgaben") {
      // Vorbelegt mit heute, wenn heute im gewählten Jahr bzw. Quartal liegt, sonst mit dessen erstem Tag.
      const d = new Date();
      const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hq = quartalVon(heute)!;
      const datum = hq.jahr === j && (!quartal || hq.q === quartal) ? heute : quartalsbeginn(j, quartal || 1);
      aendern({ ...S, kosten: [...S.kosten, { ...neuerEintrag(l, datum), interval: "einmalig", end: "" }] });
    } else {
      aendern({ ...S, [l]: [...(S[l] as Planeintrag[]), neuerEintrag(l, st.start)] });
    }
    // Das erste Feld der neuen Zeile bekommt den Cursor — wie im Planer.
    requestAnimationFrame(() => {
      const zeilen = ed.current?.querySelectorAll<HTMLElement>(p ? `[data-foerderung="${p}"] .rw-row:not(.head)` : l === "foerderungen" ? ".rw-card" : ".rw-row:not(.head)");
      zeilen?.[zeilen.length - 1]?.querySelector("input")?.focus();
    });
  }
  const addBtn = (l: Liste, text: string) => (
    <div><button type="button" className="rw-btn" onClick={() => dazu(l)}>+ {text}</button></div>
  );
  const sf = (bereich: "settings" | "neufoeg" | "fp", f: string, typ = "text", extra: Record<string, unknown> = {}) => (
    <input
      className={`rw-inp${typ === "number" ? " n" : ""}`}
      type={typ}
      {...(typ === "number" ? { step: "any", inputMode: "decimal" as const } : {})}
      defaultValue={String((S[bereich] as Record<string, unknown>)[f] ?? "")}
      onChange={(e) => {
        let v: unknown = typ === "number" ? zahlAus(e.target) : e.target.value;
        if (bereich === "settings" && f === "months") {
          if (v === "" || (v as number) < 6) return;
          v = Math.min(72, Math.round(v as number));
        }
        if (bereich === "settings" && f === "start" && !/^\d{4}-\d{2}/.test(String(v))) return;
        aendern({ ...S, [bereich]: { ...S[bereich], [f]: v } });
      }}
      {...extra}
    />
  );
  const sc = (bereich: "settings" | "neufoeg" | "fp", f: string, label: string) => (
    <label className="rw-check">
      <input
        type="checkbox"
        checked={!!(S[bereich] as Record<string, unknown>)[f]}
        onChange={(e) => aendern({ ...S, [bereich]: { ...S[bereich], [f]: e.target.checked } })}
      />{" "}
      {label}
    </label>
  );
  const ss = (bereich: "settings" | "fp", f: string, liste: string[][]) => (
    <select
      className="rw-inp"
      value={String((S[bereich] as Record<string, unknown>)[f] ?? "")}
      onChange={(e) => aendern({ ...S, [bereich]: { ...S[bereich], [f]: f === "monat" || f === "bridgeGroup" ? Number(e.target.value) : e.target.value } })}
    >
      {liste.map(([w, txt]) => <option key={w} value={w}>{txt}</option>)}
    </select>
  );

  /* --- Die Register --- */
  let inhalt: ReactNode = null;
  // Was das Register rechnet. Stand bis 2026-10-19 als Absatz über jedem
  // Register; jetzt hinter dem ⓘ rechts neben den Reitern (Bernd: „zu viel
  // Text"). Wer es einmal gelesen hat, muss es nicht jedesmal überfahren.
  let erklaerung: ReactNode = null;
  // Was über der Tabelle steht und nichts am Plan ändert (Jahr, Quartal,
  // Auswahl, Vergangenes). Es steht außerhalb des `fieldset`, das für Leser
  // alle Felder stilllegt — umschalten dürfen sie trotzdem.
  let oben: ReactNode = null;

  if (t === "foerderungen") erklaerung =
    "Jede Förderung mit ihren Tranchen und dem erwarteten Zahlungsdatum. Rückzahlungen (z. B. der Darlehensanteil einer FFG-Förderung) als Tranche der Art „Rückzahlung“. Konservativ zählen nur zugesagte und erhaltene Auszahlungen.";
  if (t === "foerderungen")
    inhalt = (
      <>
        {S.foerderungen.length === 0 && <div className="rw-rows"><div className="rw-empty-rows">Noch keine Förderung erfasst.</div></div>}
        {S.foerderungen.map((f) => (
          <div key={f.id} className="rw-card" data-foerderung={f.id}>
            <div className="rw-card-head">
              {cell("Förderung / Programm", inp("foerderungen", f, "name", "text", { placeholder: "z. B. aws Preseed" }))}
              {cell("Fördergeber", inp("foerderungen", f, "geber", "text", { placeholder: "aws, FFG, SFG …" }))}
              <span className="rw-sum" title="Saldo Auszahlungen minus Rückzahlungen">{fmtE(r.abgeleitet.foerderung[f.id] ?? 0)}</span>
              {xbtn("foerderungen", f.id)}
            </div>
            {tabelle(
              "minmax(132px,1fr) minmax(0,.9fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1.5fr) 30px",
              ["Zahlungsdatum", "Art", { t: "Betrag (€)", r: true }, "Status", "Notiz"],
              f.tranchen.map((x) => (
                <div key={x.id} className="rw-row">
                  {cell("Zahlungsdatum", inp("tranchen", x, "date", "date", {}, f.id), "first")}
                  {cell("Art", sel("tranchen", x, "art", TRANCHE_ART, f.id, "auszahlung"))}
                  {cell("Betrag (€)", inp("tranchen", x, "amount", "number", {}, f.id))}
                  {cell("Status", sel("tranchen", x, "status", STATUS, f.id))}
                  {cell("Notiz", inp("tranchen", x, "note", "text", { placeholder: "z. B. nach Zwischenbericht" }, f.id), "wide")}
                  {xbtn("tranchen", x.id, f.id)}
                </div>
              )),
              "Noch keine Tranche.",
            )}
            <div className="rw-card-foot"><button type="button" className="rw-btn ghost" onClick={() => dazu("foerderungen", f.id)}>+ Tranche</button></div>
          </div>
        ))}
        {addBtn("foerderungen", "Förderung hinzufügen")}
      </>
    );

  if (t === "investments") erklaerung = "Eigenkapital- und Wandeldarlehensrunden mit dem Datum, an dem das Geld am Konto ist.";
  if (t === "investments")
    inhalt = (
      <>
        {tabelle(
          "minmax(0,1.8fr) minmax(0,1fr) minmax(132px,1fr) minmax(0,1fr) minmax(0,.9fr) 30px",
          ["Investor / Runde", { t: "Betrag (€)", r: true }, "Datum", "Art", "Status"],
          S.investments.map((x) => (
            <div key={x.id} className="rw-row">
              {cell("Investor / Runde", inp("investments", x, "name", "text", { placeholder: "z. B. Business Angel" }), "wide")}
              {cell("Betrag (€)", inp("investments", x, "amount", "number"))}
              {cell("Datum", inp("investments", x, "date", "date"))}
              {cell("Art", sel("investments", x, "art", INV_ART))}
              {cell("Status", sel("investments", x, "status", STATUS))}
              {xbtn("investments", x.id)}
            </div>
          )),
          "Noch kein Investment geplant.",
        )}
        {addBtn("investments", "Investment hinzufügen")}
      </>
    );

  if (t === "umsaetze") erklaerung =
    "Netto mit Rechnungsdatum. Das Zahlungsziel verschiebt den Geldeingang (30 Tage ≈ 1 Monat), die Umsatzsteuer gilt ab dem Rechnungsmonat. Basis gewichtet mit der Wahrscheinlichkeit, Optimistisch rechnet 100 %, Konservativ zählt nur Umsätze mit 100 % Wahrscheinlichkeit — alles darunter mit 0 €.";
  if (t === "umsaetze")
    inhalt = (
      <>
        {tabelle(
          `minmax(0,1.4fr) minmax(0,.9fr) minmax(0,.9fr) minmax(132px,.95fr) minmax(132px,.95fr) minmax(0,.6fr)${ustOn ? " minmax(0,.6fr)" : ""} minmax(0,.6fr) 30px`,
          ["Umsatz", { t: "Betrag netto", r: true }, "Intervall", "Ab / am", "Bis", { t: "Ziel Tage", r: true }, ...(ustOn ? ["USt"] : []), { t: "Wahrsch. %", r: true }],
          S.umsaetze.map((x) => (
            <div key={x.id} className="rw-row">
              {cell("Umsatz", inp("umsaetze", x, "name", "text", { placeholder: "z. B. Pilotkunde" }), "wide")}
              {cell("Betrag netto (€)", inp("umsaetze", x, "amount", "number"))}
              {cell("Intervall", sel("umsaetze", x, "interval", INTERVAL_U))}
              {cell("Ab / am", inp("umsaetze", x, "start", "date"))}
              {cell("Bis", inp("umsaetze", x, "end", "date", { disabled: x.interval === "einmalig" }))}
              {cell("Zahlungsziel (Tage)", inp("umsaetze", x, "ziel", "number", { min: 0, placeholder: "0" }))}
              {ustOn && cell("USt-Satz", sel("umsaetze", x, "ust", UST, undefined, "20"))}
              {cell("Wahrscheinlichkeit %", inp("umsaetze", x, "prob", "number", { min: 0, max: 100 }))}
              {xbtn("umsaetze", x.id)}
            </div>
          )),
          "Noch keine Umsätze geplant.",
        )}
        {addBtn("umsaetze", "Umsatz hinzufügen")}
      </>
    );

  if (t === "team") {
    const nfSave = r.A.reduce((s, m) => s + num(m.neuf), 0);
    const nfPot = r.A.reduce((s, m) => s + num(m.neufPot), 0);
    erklaerung = (
      <>
        Bruttogehalt pro Monat. Arbeitgeberkosten = Brutto × (1 + {komma(st.lnk)} % Lohnnebenkosten)
        {st.sonder ? ", 14 Gehälter (Juni, November)" : ""}
        {num(st.raise) ? `, jährlich +${komma(st.raise)} % im Jänner` : ""}. Ein eigener Satz je Person überschreibt den Standard, z. B.
        für Gesellschafter-Geschäftsführer:innen. Der F&E-Anteil fließt in die Forschungsprämie.
      </>
    );
    inhalt = (
      <>
        {S.neufoeg.aktiv && nfSave > 0 && (
          <div className="rw-callout good"><p><strong>NeuFöG eingeplant:</strong> {fmtE(nfSave)} weniger Lohnnebenkosten im Planzeitraum.</p></div>
        )}
        {!S.neufoeg.aktiv && nfPot > 0 && (
          <div className="rw-callout">
            <p>
              <strong>Option NeuFöG:</strong> rund {fmtE(nfPot)} weniger Lohnnebenkosten im Planzeitraum.{" "}
              <button type="button" className="rw-btn sm" onClick={() => setTab("ansprueche")}>Ansehen</button>
            </p>
          </div>
        )}
        {tabelle(
          "minmax(0,1.3fr) minmax(0,1fr) minmax(0,.95fr) minmax(132px,.95fr) minmax(132px,.95fr) minmax(0,.6fr) minmax(0,.6fr) minmax(0,.75fr) minmax(0,.95fr) 30px",
          ["Name", "Rolle", { t: "Brutto / Monat", r: true }, "Eintritt", "Austritt", { t: "LNK %", r: true }, { t: "F&E %", r: true }, "NeuFöG", { t: "AG-Kosten / M", r: true }],
          S.team.map((x) => (
            <div key={x.id} className="rw-row">
              {cell("Name", inp("team", x, "name", "text", { placeholder: "Name oder Position" }), "first")}
              {cell("Rolle", inp("team", x, "role"))}
              {cell("Brutto / Monat (€)", inp("team", x, "gross", "number"))}
              {cell("Eintritt", inp("team", x, "start", "date"))}
              {cell("Austritt (optional)", inp("team", x, "end", "date"))}
              {cell("Lohnnebenkosten %", inp("team", x, "lnk", "number", { placeholder: komma(st.lnk), title: "Leer = Standard aus den Einstellungen" }))}
              {cell("F&E-Anteil %", inp("team", x, "fe", "number", { min: 0, max: 100, placeholder: "0" }))}
              {cell("NeuFöG", chk("team", x, "neufoeg", "Dienstnehmer:in", true))}
              {cell("AG-Kosten / Monat", <span className="rw-derived">{fmtE(r.abgeleitet.agKosten[x.id] ?? num(x.gross) * (1 + x0(x.lnk, num(st.lnk)) / 100))}</span>)}
              {xbtn("team", x.id)}
            </div>
          )),
          "Noch niemand im Team erfasst.",
        )}
        {S.team.length > 0 && <p className="rw-hint">Jahreskosten bei voller Besetzung (ohne NeuFöG): {fmtE(r.abgeleitet.teamJahr)}</p>}
        {addBtn("team", "Person hinzufügen")}
      </>
    );
  }

  const kostenErklaerung = (
    <>
      {ustOn && "Die Vorsteuer kommt über die UVA zurück; für Reverse Charge aus dem Ausland (viele Software-Abos) 0 % wählen. "}
      „F&E“ markiert Kosten für die Forschungsprämie.
      {num(st.contingency) ? ` Auf alle Positionen kommen ${komma(st.contingency)} % Sicherheitszuschlag.` : ""} Am Griff links lässt
      sich eine Zeile verschieben, auch mit den Pfeiltasten. „Auswahl“ zeigt neben der Linie, was mitrechnet.
    </>
  );
  const griff = (x: Planeintrag) => (
    <button type="button" className="rw-griff" aria-label={`„${String(x.name || "Position")}“ verschieben`} title="Ziehen zum Verschieben" {...ziehen.griff(x.id)}>
      <Zeichen name="griff" />
    </button>
  );
  const kostenZeile = (x: Planeintrag, felder: ReactNode) => (
    <div
      key={x.id}
      className="rw-row"
      data-zeile=""
      data-aus={x.aus ? "" : undefined}
      data-kat={kategorieVon(x.cat)}
      data-vergangen={weg(x) ? "" : undefined}
      data-gezogen={ziehen.gezogen === x.id ? "" : undefined}
      style={ziehen.lage(x.id)}
    >
      {felder}
    </div>
  );
  const name = (x: Planeintrag, beispiel: string) =>
    cell(
      "Position",
      <>
        {inp("kosten", x, "name", "text", { placeholder: beispiel })}
        {!!x.aus && <span className="rw-hint">rechnet nicht mit</span>}
        {weg(x) && <span className="rw-hint">im Kontostand vom {new Date(`${stichtag}T00:00:00`).toLocaleDateString("de-AT")}</span>}
      </>,
      "wide",
    );
  // Eine Auswahl statt eines freien Felds: Nur feste Kategorien haben eine Farbe.
  const kategorie = (x: Planeintrag) => {
    const wert = String(x.cat ?? "").trim();
    return cell(
      "Kategorie",
      <span className="rw-kat">
        <span className="rw-kat-punkt" />
        <select className="rw-inp" value={wert} onChange={(e) => aendern(mitFeld(S, "kosten", x.id, "cat", e.target.value))}>
          <option value="">– wählen –</option>
          {kategorieVon(wert) === "alt" && <option value={wert}>{wert} (alt)</option>}
          {KATEGORIEN.map((k) => <option key={k.kennung} value={k.name}>{k.name}</option>)}
        </select>
      </span>,
    );
  };
  const vergangeneHaken = (archiviert > 0 || vergangeneZeigen) && !!stichtag && (
    <label className="rw-check rw-vergangene" title={`Was vor dem Kontostand vom ${new Date(`${stichtag}T00:00:00`).toLocaleDateString("de-AT")} lag`}>
      <input type="checkbox" checked={vergangeneZeigen} onChange={(e) => setVergangeneZeigen(e.target.checked)} />
      Vergangene zeigen
      {archiviert > 0 && <span className="cnt">{archiviert}</span>}
    </label>
  );
  const auswahlKnopf = (
    <button type="button" className="rw-btn" onClick={auswahlOeffnen} aria-label="Auswahl neben der Linie öffnen">
      <Zeichen name="haken" />
      Auswahl
    </button>
  );

  if (t === "fixkosten") {
    erklaerung = <>Laufende Kosten netto. Quartals- und Jahreszahlungen fallen ab dem Startmonat im jeweiligen Rhythmus an. {kostenErklaerung}</>;
    const jeMonat = fixkosten.reduce((s2, k) => s2 + (k.aus ? 0 : num(k.amount) / (JE_MONAT[String(k.interval)] ?? 1)), 0);
    oben = (
      <div className="rw-reg-kopf">
        <span className="rw-reg-summe">
          <span className="zahl">{fmtE(jeMonat)}</span> je Monat
        </span>
        <span className="rw-reg-rechts">
          {vergangeneHaken}
          {auswahlKnopf}
        </span>
      </div>
    );
    inhalt = (
      <>
        {tabelle(
          `30px minmax(100px,1.4fr) minmax(140px,1.2fr) minmax(76px,.8fr) minmax(112px,.85fr) minmax(132px,.9fr) minmax(132px,.9fr)${ustOn ? " minmax(64px,.5fr)" : ""} minmax(36px,.35fr) 30px`,
          ["", "Position", "Kategorie", { t: "Betrag netto", r: true }, "Intervall", "Ab", "Bis", ...(ustOn ? ["USt"] : []), "F&E"],
          fixkosten.map((x) =>
            kostenZeile(
              x,
              <>
                {griff(x)}
                {name(x, "z. B. Büromiete")}
                {kategorie(x)}
                {cell("Betrag netto (€)", inp("kosten", x, "amount", "number"))}
                {cell("Intervall", sel("kosten", x, "interval", INTERVAL_F))}
                {cell("Ab", inp("kosten", x, "start", "date"))}
                {cell("Bis (optional)", inp("kosten", x, "end", "date"))}
                {ustOn && cell("USt-Satz", sel("kosten", x, "ust", UST, undefined, "20"))}
                {cell("F&E", chk("kosten", x, "fe", ""))}
                {xbtn("kosten", x.id)}
              </>,
            ),
          ),
          "Noch keine Fixkosten erfasst.",
        )}
        {addBtn("kosten", "Fixkosten hinzufügen")}
      </>
    );
  }

  if (t === "ausgaben") {
    erklaerung = <>Einmalige Ausgaben netto mit ihrem Zahlungsdatum. Jahr und Quartal oben filtern nur die Liste. {kostenErklaerung}</>;
    oben = (
      <>
        <div className="rw-reg-kopf">
          <div className="rw-wahl" role="group" aria-label="Jahr">
            {jahre.map((y) => {
              const im = alleAusgaben.filter((k) => qVon(k).jahr === y);
              return (
                <button key={y} type="button" aria-pressed={y === j} onClick={() => { setJahr(y); filtern(0); }}>
                  {y}
                  <span className="cnt">{im.length ? kfmt(summe(im)) : "–"}</span>
                </button>
              );
            })}
          </div>
          <span className="rw-reg-rechts">
            {vergangeneHaken}
            {auswahlKnopf}
          </span>
        </div>
        <div className="rw-wahl leise" role="group" aria-label={`Quartal ${j}`}>
          <button type="button" aria-pressed={!quartal} onClick={() => filtern(0)}>
            Ganzes Jahr<span className="cnt">{fmtE(summe(imJahr))}</span>
          </button>
          {[1, 2, 3, 4].map((q) => {
            const im = imJahr.filter((k) => qVon(k).q === q);
            return (
              <button key={q} type="button" aria-pressed={quartal === q} onClick={() => filtern(quartal === q ? 0 : q)}>
                Q{q}
                <span className="cnt">{im.length ? kfmt(summe(im)) : "–"}</span>
              </button>
            );
          })}
        </div>
      </>
    );
    inhalt = (
      <>
        {tabelle(
          `30px minmax(120px,1.6fr) minmax(160px,1.2fr) minmax(90px,.8fr) minmax(132px,.8fr)${ustOn ? " minmax(64px,.5fr)" : ""} minmax(36px,.35fr) 30px`,
          ["", "Position", "Kategorie", { t: "Betrag netto", r: true }, "Datum", ...(ustOn ? ["USt"] : []), "F&E"],
          ausgaben.map((x) => {
            return kostenZeile(
              x,
              <>
                {griff(x)}
                {name(x, "z. B. Messe, Prototyp, Notar")}
                {kategorie(x)}
                {cell("Betrag netto (€)", inp("kosten", x, "amount", "number"))}
                {cell(
                  "Datum",
                  <input
                    className="rw-inp"
                    type="date"
                    defaultValue={String(x.start ?? "")}
                    onChange={(e) => {
                      setFestgehalten((alt) => (alt.has(x.id) ? alt : new Set(alt).add(x.id)));
                      aendern(mitFeld(S, "kosten", x.id, "start", e.target.value));
                    }}
                  />,
                )}
                {ustOn && cell("USt-Satz", sel("kosten", x, "ust", UST, undefined, "20"))}
                {cell("F&E", chk("kosten", x, "fe", ""))}
                {xbtn("kosten", x.id)}
              </>,
            );
          }),
          (() => {
            const wo = quartal ? `im Q${quartal} ${j}` : String(j);
            const vorbei = S.kosten.some((k) => istAusgabe(k) && weg(k) && qVon(k).jahr === j && (!quartal || qVon(k).q === quartal));
            return vorbei && !vergangeneZeigen ? `Nichts mehr offen ${wo} — der Rest liegt vor dem Kontostand.` : `Keine Ausgabe ${wo} geplant.`;
          })(),
        )}
        {addBtn("kosten", quartal ? `Ausgabe im Q${quartal} ${j}` : `Ausgabe ${j}`)}
      </>
    );
  }

  if (t === "darlehen") erklaerung =
    "Endfällig: Rückzahlung samt Zinsen am Rückzahlungsdatum, ohne Datum bleibt das Darlehen stehen. Monatsraten: gleich hohe Tilgung ab Tilgungsbeginn, Zinsen monatlich auf den offenen Betrag. Die gestrichelte Linie im Chart ist der Verlauf ohne Gesellschafterdarlehen.";
  if (t === "darlehen")
    inhalt = (
      <>
        {tabelle(
          "minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,.9fr) minmax(132px,.95fr) minmax(0,.9fr) minmax(132px,.95fr) minmax(0,.55fr) minmax(0,.55fr) 30px",
          ["Bezeichnung", "Typ", { t: "Betrag (€)", r: true }, "Auszahlung", "Tilgung", "Rückzahlung / Beginn", { t: "Raten", r: true }, { t: "Zins %", r: true }],
          S.darlehen.map((x) => {
            const raten = x.tilgung === "raten";
            return (
              <div key={x.id} className="rw-row">
                {cell("Bezeichnung / Gesellschafter:in", inp("darlehen", x, "name", "text", { placeholder: "Name oder Bank" }), "wide")}
                {cell("Typ", sel("darlehen", x, "typ", DARL_TYP, undefined, "gesellschafter"))}
                {cell("Betrag (€)", inp("darlehen", x, "amount", "number"))}
                {cell("Auszahlung", inp("darlehen", x, "date", "date"))}
                {cell("Tilgung", sel("darlehen", x, "tilgung", TILG, undefined, "endfaellig"))}
                {cell(
                  raten ? "Tilgungsbeginn" : "Rückzahlung (optional)",
                  <span key={raten ? "ts" : "rp"}>{raten ? inp("darlehen", x, "tilgStart", "date") : inp("darlehen", x, "repay", "date")}</span>,
                )}
                {cell("Anzahl Raten", inp("darlehen", x, "raten", "number", raten ? { min: 1, step: 1 } : { disabled: true }))}
                {cell("Zins % p. a.", inp("darlehen", x, "zins", "number"))}
                {xbtn("darlehen", x.id)}
              </div>
            );
          }),
          "Noch kein Darlehen. Übernimm die Überbrückungs-Vorschläge oben oder füge eines hinzu.",
        )}
        {addBtn("darlehen", "Darlehen hinzufügen")}
      </>
    );

  if (t === "ansprueche") inhalt = <Ansprueche S={S} r={r} a={a} sf={sf} sc={sc} ss={ss} aendern={aendern} />;

  if (t === "settings")
    inhalt = (
      <>
        <div className="rw-section">
          <h3>Allgemein</h3>
          <div className="rw-settings-grid">
            {cell("Firma", sf("settings", "company", "text", { placeholder: "Firmenname" }))}
            {cell(<>Planungsstart <Hinweis text="Es zählt der Monat." /></>, sf("settings", "start", "date"))}
            {cell(<>Planungszeitraum (Monate) <Hinweis text="6 bis 72 Monate" /></>, sf("settings", "months", "number", { min: 6, max: 72, step: 1 }))}
            {cell("Kontostand zum Start (€)", sf("settings", "cash", "number"))}
            {cell(<>Mindestpuffer (€) <Hinweis text="Reserve, die nicht unterschritten werden soll, z. B. 2–3 Monate Burn" /></>, sf("settings", "buffer", "number"))}
            {cell(<>Sicherheitszuschlag Kosten (%) <Hinweis text="Für Unvorhergesehenes, üblich 5–10 %" /></>, sf("settings", "contingency", "number", { min: 0 }))}
            {cell("Ist-Werte", sc("settings", "rebase", "Prognose ab letztem Ist-Kontostand fortschreiben"))}
          </div>
        </div>
        <div className="rw-section">
          <h3>Personal</h3>
          <div className="rw-settings-grid">
            {cell(<>Lohnnebenkosten Arbeitgeber (%) <Hinweis text="Österreich: rund 29–31 % für Angestellte" /></>, sf("settings", "lnk", "number"))}
            {cell(<>Gehaltsanpassung pro Jahr (%) <Hinweis text="Wirkt jeweils ab Jänner (z. B. KV-Erhöhung)" /></>, sf("settings", "raise", "number"))}
            {cell("Gehaltsschema", sc("settings", "sonder", "14 Gehälter (Juni + November)"))}
          </div>
        </div>
        <div className="rw-section">
          <h3>Umsatzsteuer</h3>
          <div className="rw-settings-grid">
            {cell("Berechnung", sc("settings", "ust", "Umsatzsteuer und Vorsteuer im Cashflow abbilden"))}
            {cell(<>UVA-Zeitraum <Hinweis text="Zahlung bzw. Gutschrift am 15. des zweitfolgenden Monats" /></>, ss("settings", "uva", [["monat", "monatlich"], ["quartal", "vierteljährlich"]]))}
          </div>
        </div>
        <div className="rw-section">
          <h3>Annahmen & Notizen</h3>
          <textarea
            className="rw-inp"
            defaultValue={S.notes}
            placeholder="z. B. Annahmen zu Förderzusagen, offene Punkte für die Steuerberatung, Stand der Gespräche mit Investoren …"
            onChange={(e) => aendern({ ...S, notes: e.target.value })}
          />
        </div>
        <div className="rw-section">
          <h3>Daten</h3>
          <div className="rw-data-actions">
            <button type="button" className="rw-btn" onClick={exportieren}>Daten exportieren</button>
            {darf && <button type="button" className="rw-btn" onClick={importieren}>Daten importieren</button>}
            {darf &&
              (fragtLoeschen ? (
                <span className="rw-confirm">
                  Alle Einträge löschen?{" "}
                  <button type="button" className="rw-btn danger solid" onClick={() => { setFragtLoeschen(false); allesLoeschen(); }}>Ja, löschen</button>
                  <button type="button" className="rw-btn" onClick={() => setFragtLoeschen(false)}>Abbrechen</button>
                </span>
              ) : (
                <button type="button" className="rw-btn danger" onClick={() => setFragtLoeschen(true)}>Alle Daten löschen</button>
              ))}
          </div>
        </div>
      </>
    );

  const zaehler = (k: Register) => {
    if (k === "foerderungen") return S.foerderungen.reduce((s, f) => s + f.tranchen.length, 0);
    if (k === "ansprueche") {
      const aktiv = (S.neufoeg.aktiv ? 1 : 0) + (S.fp.aktiv ? 1 : 0);
      return aktiv ? `${aktiv} aktiv` : "";
    }
    if (k === "settings") return "";
    if (k === "fixkosten") return fixkosten.length;
    if (k === "ausgaben") return alleAusgaben.length;
    return (S[k] as Planeintrag[]).length;
  };

  return (
    <section className="rw-panel">
      <div className="rw-tabs-zeile">
        <nav className="rw-tabs" role="tablist" aria-label="Planungsbereiche">
          {REGISTER.map((x) => (
            <button key={x.k} type="button" role="tab" aria-selected={t === x.k} onClick={() => setTab(x.k)}>
              <span className={`sw ${x.farbe}`} />
              {x.t}
              {zaehler(x.k) !== "" && <span className="cnt">{zaehler(x.k)}</span>}
            </button>
          ))}
        </nav>
        {erklaerung && <Hinweis worum={`Was „${REGISTER.find((x) => x.k === t)!.t}“ rechnet`} text={erklaerung} />}
      </div>
      {oben && <div className="rw-reg-oben">{oben}</div>}
      {/* Ein Leser sieht alles, ändert nichts — ein `fieldset` legt alle Felder auf einmal still. */}
      <fieldset className="rw-editor" ref={ed as never} disabled={!darf}>
        {inhalt}
      </fieldset>
    </section>
  );
}

function Ansprueche({
  S,
  r,
  a,
  sf,
  sc,
  ss,
  aendern,
}: {
  S: Runwayplan;
  r: Runwayrechnung;
  a: Achse;
  sf: (b: "settings" | "neufoeg" | "fp", f: string, typ?: string, extra?: Record<string, unknown>) => ReactNode;
  sc: (b: "settings" | "neufoeg" | "fp", f: string, label: string) => ReactNode;
  ss: (b: "settings" | "fp", f: string, liste: string[][]) => ReactNode;
  aendern: (neu: Runwayplan) => void;
}) {
  const nfo = S.neufoeg;
  const G = r.neufoeg.G;
  const pot = r.A.reduce((s, m) => s + num(m.neufPot), 0);
  const fpb = r.fpBase;
  const jahre = Object.keys(fpb).sort();
  const monatFp = num(S.fp.monat) || 9;
  const cell = (label: ReactNode, inhalt: ReactNode) => (
    <div className="rw-cell">
      <span className="rw-cell-l">{label}</span>
      {inhalt}
    </div>
  );
  return (
    <>
      <div className="rw-section">
        <h3>
          NeuFöG – Lohnnebenkostenbefreiung{" "}
          <Hinweis
            worum="Was NeuFöG befreit"
            text={
              <>
                Für Dienstnehmer:innen neu gegründeter Betriebe entfallen DB, DZ, Wohnbauförderungs- und Unfallversicherungsbeitrag;
                Kommunalsteuer und übrige SV-Beiträge bleiben. In den ersten 12 Kalendermonaten ab Neugründung für alle, bis zum 36. Monat
                nur für die ersten drei, je 12 Monate ab Eintritt. Die einmaligen Gebührenbefreiungen bei der Gründung sind nicht
                liquiditätsrelevant und deshalb nicht abgebildet.
              </>
            }
          />
        </h3>
        <div className="rw-settings-grid">
          {cell("Anspruch", sc("neufoeg", "aktiv", "NeuFöG-Befreiung im Plan berücksichtigen"))}
          {cell(<>Kalendermonat der Neugründung <Hinweis text="Monat, in dem ihr erstmals werbend tätig wurdet" /></>, sf("neufoeg", "gruendung", "date"))}
          {cell(<>Befreiter Anteil vom Brutto (%) <Hinweis text="DB 3,7 % + DZ ca. 0,3–0,4 % (je Bundesland) + WBF 0,5 % + UV 1,1 %" /></>, sf("neufoeg", "satz", "number"))}
        </div>
        {G === null ? (
          <div className="rw-callout"><p>Mit dem Monat der Neugründung rechnet der Plan, für wen und wann die Befreiung greift.</p></div>
        ) : (
          <>
            <div className={`rw-callout${nfo.aktiv && pot ? " good" : ""}`}>
              <p>
                <strong>
                  {G + 35 < 0
                    ? "Der 36-Monats-Zeitraum ist bereits abgelaufen."
                    : nfo.aktiv
                      ? `Eingeplante Ersparnis im Planzeitraum: ${fmtE(pot)}`
                      : `Option: Mit NeuFöG würdet ihr im Planzeitraum rund ${fmtE(pot)} an Lohnnebenkosten sparen.`}
                </strong>
              </p>
              <ul>
                <li>Monat 1–12 (alle Dienstnehmer:innen): {a.labL(G)} bis {a.labL(G + 11)}</li>
                <li>Monat 13–36 (erste drei Dienstnehmer:innen, je 12 Monate ab Eintritt): {a.labL(G + 12)} bis {a.labL(G + 35)}</li>
              </ul>
            </div>
            {S.team.length > 0 && (
              <div className="rw-rows" style={{ "--cols": "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1fr)" } as CSSProperties}>
                <div className="rw-row head"><span>Person</span><span>Eintritt</span><span>Zählt zu den ersten 3</span><span className="r">Befreite Monate</span><span className="r">Ersparnis</span></div>
                {S.team.map((p) => {
                  const o = r.neufoeg.personen.find((x) => x.id === p.id);
                  return (
                    <div key={p.id} className="rw-row">
                      {cell("Person", <span>{String(p.name || "Mitarbeiter:in")}{p.neufoeg === false && <span className="rw-hint"> (nicht als Dienstnehmer:in markiert)</span>}</span>)}
                      {cell("Eintritt", <span>{p.start ? new Date(`${p.start}T00:00:00`).toLocaleDateString("de-AT") : "Planstart"}</span>)}
                      {cell("Erste drei", <span>{o?.first ? "ja" : "–"}</span>)}
                      {cell("Befreite Monate", <span className="rw-derived">{o?.mo ?? 0}</span>)}
                      {cell("Ersparnis", <span className="rw-derived">{fmtE(o?.sum ?? 0)}</span>)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="rw-checklist">
          <span className="rw-eyebrow">Voraussetzungen</span>
          {NF_CHECK.map(([k, l]) => (
            <label key={k} className="rw-check">
              <input
                type="checkbox"
                checked={!!nfo.check[k]}
                onChange={(e) => aendern({ ...S, neufoeg: { ...nfo, check: { ...nfo.check, [k]: e.target.checked } } })}
              />{" "}
              {l}
            </label>
          ))}
        </div>
      </div>

      <div className="rw-section">
        <h3>
          Forschungsprämie{" "}
          <Hinweis
            worum="Wie die Forschungsprämie gerechnet wird"
            text={
              <>
                {komma(S.fp.satz)} % der F&E-Aufwendungen eines Kalenderjahres, beantragt nach Jahresende über FinanzOnline mit
                Jahresgutachten der FFG. Grundlage hier: Personalkosten × F&E-Anteil (Register Team) plus als F&E markierte Kosten.
              </>
            }
          />
        </h3>
        <div className="rw-settings-grid">
          {cell("Anspruch", sc("fp", "aktiv", "Forschungsprämie im Plan berücksichtigen"))}
          {cell("Prämiensatz (%)", sf("fp", "satz", "number"))}
          {cell(<>Erwartete Auszahlung im Folgejahr <Hinweis text="Abhängig von Gutachten und Bescheid" /></>, ss("fp", "monat", MONL.map((m, i) => [String(i + 1), m])))}
        </div>
        {jahre.length ? (
          <table className="rw-mini">
            <thead><tr><th>Jahr</th><th className="n">Bemessungsgrundlage</th><th className="n">Prämie</th><th className="n">Auszahlung</th></tr></thead>
            <tbody>
              {jahre.map((y) => {
                const auszahlung = a.idx(`${Number(y) + 1}-${String(monatFp).padStart(2, "0")}`);
                return (
                  <tr key={y}>
                    <td>{y}{Number(y) === a.yr(0) && a.moy(0) > 0 && <span className="rw-hint"> (ab Planstart)</span>}</td>
                    <td className="n">{fmtE(fpb[y])}</td>
                    <td className="n">{fmtE((num(fpb[y]) * num(S.fp.satz)) / 100)}</td>
                    <td className="n">
                      {MON[monatFp - 1]} {Number(y) + 1}
                      {auszahlung !== null && auszahlung >= S.settings.months && <span className="rw-hint"> (nach Planende)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rw-callout"><p>Noch keine F&E-Aufwendungen — F&E-Anteil im Team oder Kosten als F&E markieren.</p></div>
        )}
      </div>
    </>
  );
}
