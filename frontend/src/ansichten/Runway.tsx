/**
 * Module · Runway-Planung — der Runway-Planer, aus dem das Modul stammt, als
 * Seite in SoCoS (Bernd, 2026-10-14: „1:1 wie im HTML, aber schöner").
 *
 * Von oben nach unten wie dort: Szenario und Daten, Lage in einem Satz,
 * sechs Kennzahlen, Kontostand und Zeitachse auf einer Monatsachse,
 * Überbrückung, die Register zum Eintragen, Jahres- und Monatsübersicht.
 *
 * Anders als dort liegt der Plan am Server (`Runwayplan`), gerechnet wird am
 * Server (`socos/services/runway.py`), und der Ist-Kontostand ist derselbe wie
 * auf dem Dashboard. Gespeichert wird von selbst (basis/runwaydokument.ts).
 */

import { useEffect, useRef, useState } from "react";

import { useRunway, type Ich, type Runwayplan, type Szenario } from "../basis/daten";
import { anbieten, slug, stempel, uid, zusammenfassung } from "../basis/runway";
import { useRunwayDokument } from "../basis/runwaydokument";
import { Zustand } from "../basis/Zustand";
import { Editor } from "./RunwayEditor";
import { Kopf, Lage } from "./RunwayKopf";
import { Jahre, Monate, Ueberbrueckung } from "./RunwayTabellen";
import { Verlauf } from "./RunwayVerlauf";

/* Szenario und Register merkt sich der Browser — das ist eine Ansicht, kein Plan. */
const MERKEN = "socos-runway";
function gemerkt(): { szenario: Szenario; tab: string } {
  try {
    return { szenario: "basis", tab: "foerderungen", ...JSON.parse(localStorage.getItem(MERKEN) || "{}") };
  } catch {
    return { szenario: "basis", tab: "foerderungen" };
  }
}

type Import = { name: string; wann: string | null; plan: unknown; satz: string };

export function Runway(_: { ich: Ich }) {
  const [ansicht, setAnsicht] = useState(gemerkt);
  const abfrage = useRunway(ansicht.szenario);
  const dok = useRunwayDokument(ansicht.szenario, abfrage.data);
  const [toast, setToast] = useState<{ text: string; vorher?: Runwayplan } | null>(null);
  const toastUhr = useRef<number | undefined>(undefined);
  const [importFrage, setImportFrage] = useState<Import | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const datei = useRef<HTMLInputElement>(null);

  function merken(teil: Partial<typeof ansicht>) {
    const neu = { ...ansicht, ...teil };
    setAnsicht(neu);
    try {
      localStorage.setItem(MERKEN, JSON.stringify(neu));
    } catch {
      /* ohne Speicher im Browser geht es auch */
    }
  }

  function melde(text: string, vorher?: Runwayplan) {
    window.clearTimeout(toastUhr.current);
    setToast({ text, vorher });
    toastUhr.current = window.setTimeout(() => setToast(null), vorher ? 7000 : 2500);
  }

  async function lesen(f: File | undefined) {
    if (!f || !dok.darf) return;
    let roh: Record<string, unknown>;
    try {
      roh = JSON.parse(await f.text());
    } catch {
      return melde("Die Datei ist kein gültiges JSON.");
    }
    const plan = (roh?.format === "runway-planer" ? roh.plan : roh) as Record<string, unknown> | undefined;
    if (!plan || typeof plan !== "object" || !plan.settings) return melde("Die Datei enthält keinen Runway-Plan (Export aus „Daten exportieren“).");
    const listen = { foerderungen: [], investments: [], umsaetze: [], team: [], kosten: [], darlehen: [] };
    const wann = typeof roh.exportedAt === "string" ? new Date(roh.exportedAt).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" }) : null;
    setImportFrage({ name: f.name, wann, plan, satz: zusammenfassung({ ...listen, ...plan } as unknown as Runwayplan) });
  }

  // Eine Datei auf die Seite ziehen lädt sie — wie im Planer.
  const lesenRef = useRef(lesen);
  lesenRef.current = lesen;
  useEffect(() => {
    if (!dok.darf) return;
    let tiefe = 0;
    const hatDatei = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const rein = (e: DragEvent) => {
      if (!hatDatei(e)) return;
      e.preventDefault();
      tiefe++;
      setZiehen(true);
    };
    const drueber = (e: DragEvent) => {
      if (hatDatei(e)) e.preventDefault();
    };
    const raus = (e: DragEvent) => {
      if (!hatDatei(e)) return;
      if (--tiefe <= 0) {
        tiefe = 0;
        setZiehen(false);
      }
    };
    const ab = (e: DragEvent) => {
      if (!hatDatei(e)) return;
      e.preventDefault();
      tiefe = 0;
      setZiehen(false);
      void lesenRef.current(e.dataTransfer?.files[0]);
    };
    document.addEventListener("dragenter", rein);
    document.addEventListener("dragover", drueber);
    document.addEventListener("dragleave", raus);
    document.addEventListener("drop", ab);
    return () => {
      document.removeEventListener("dragenter", rein);
      document.removeEventListener("dragover", drueber);
      document.removeEventListener("dragleave", raus);
      document.removeEventListener("drop", ab);
    };
  }, [dok.darf]);

  if (!abfrage.data || !dok.S) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const S = dok.S;
  const r = abfrage.data.rechnung;

  const exportieren = () =>
    anbieten(
      `runway-${slug(S.settings.company || "plan")}-${stempel()}.json`,
      JSON.stringify({ format: "runway-planer", formatVersion: 2, exportedAt: new Date().toISOString(), plan: S }, null, 2),
    );
  const importieren = () => datei.current?.click();
  const mitRueckgaengig = (neu: Runwayplan, text: string) => {
    const vorher = S;
    dok.aendern(neu);
    melde(text, vorher);
  };

  return (
    <div className="rw">
      <Kopf
        S={S}
        szenario={ansicht.szenario}
        setSzenario={(szenario) => merken({ szenario })}
        speicher={dok.speicher}
        darf={dok.darf}
        exportieren={exportieren}
        importieren={importieren}
      />
      {importFrage && (
        <div className="rw-import-confirm">
          <p>
            <strong>{importFrage.name}</strong>
            {importFrage.wann && ` · exportiert am ${importFrage.wann}`}
            <br />
            <span className="rw-hint">{importFrage.satz}. Der aktuelle Plan wird ersetzt; Ist-Werte aus der Datei werden nicht übernommen.</span>
          </p>
          <button
            type="button"
            className="rw-btn primary"
            onClick={() => {
              const vorher = S;
              void dok.ersetzen(importFrage.plan).then(() => melde("Plan importiert", vorher));
              setImportFrage(null);
            }}
          >
            Plan laden
          </button>
          <button type="button" className="rw-btn" onClick={() => setImportFrage(null)}>
            Abbrechen
          </button>
        </div>
      )}

      <Lage S={S} r={r} szenario={ansicht.szenario} />
      <Verlauf
        S={S}
        r={r}
        darf={dok.darf}
        merken={() => {
          dok.aendern({
            ...S,
            baseline: {
              savedAt: new Date().toISOString(),
              scenario: { konservativ: "Konservativ", basis: "Basis", optimistisch: "Optimistisch" }[ansicht.szenario],
              keys: r.A.map((m) => m.key),
              cash: r.A.map((m) => Math.round(Number(m.cash))),
            },
          });
          melde("Aktueller Stand als Vergleich gemerkt");
        }}
        vergessen={() => dok.aendern({ ...S, baseline: null })}
      />
      <Ueberbrueckung
        S={S}
        r={r}
        darf={dok.darf}
        gruppeSetzen={(bridgeGroup) => dok.aendern({ ...S, settings: { ...S.settings, bridgeGroup } })}
        uebernehmen={() =>
          mitRueckgaengig(
            {
              ...S,
              darlehen: [
                ...S.darlehen,
                ...r.sug.map((s) => ({
                  id: uid(), name: "Überbrückung", typ: "gesellschafter", amount: Number(s.amount), date: `${r.A[s.i].key}-01`,
                  tilgung: "endfaellig", repay: "", tilgStart: "", raten: 24, zins: 0,
                })),
              ],
            },
            "Darlehen übernommen",
          )
        }
      />
      <Editor
        key={dok.version}
        S={S}
        r={r}
        darf={dok.darf}
        tab={ansicht.tab}
        setTab={(tab) => merken({ tab })}
        aendern={dok.aendern}
        entfernen={mitRueckgaengig}
        exportieren={exportieren}
        importieren={importieren}
        allesLoeschen={() => {
          const vorher = S;
          void dok.ersetzen({ settings: { start: S.settings.start }, notes: "" }).then(() => melde("Alle Daten gelöscht", vorher));
        }}
      />
      <Jahre S={S} r={r} szenario={ansicht.szenario} />
      <Monate S={S} r={r} szenario={ansicht.szenario} darf={dok.darf} ist={dok.ist} />

      <footer className="rw-footer">
        <p>
          Beträge in Euro. Förderungen, Investments und Darlehen sind umsatzsteuerfrei; Umsätze und Kosten werden netto erfasst, die
          Umsatzsteuer läuft über eigene Zeilen und die UVA (Fälligkeit am 15. des zweitfolgenden Monats). Zahlungen werden dem Monat
          ihres Datums zugeordnet; was vor dem Planungsstart liegt, steckt bereits im Kontostand zum Start.
        </p>
        <p>
          Personalkosten = Bruttogehalt × (1 + Lohnnebenkosten-Satz) abzüglich NeuFöG-Befreiung. NeuFöG, Forschungsprämie und
          Umsatzsteuer sind vereinfacht abgebildet; Sätze und Anspruch bitte mit der Steuerberatung abstimmen.
        </p>
      </footer>

      <input
        ref={datei}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void lesen(f);
        }}
      />
      {toast && (
        <div className="rw-toast" role="status">
          <span>{toast.text}</span>
          {toast.vorher && (
            <button
              type="button"
              onClick={() => {
                const vorher = toast.vorher!;
                setToast(null);
                void dok.ersetzen(vorher);
              }}
            >
              Rückgängig
            </button>
          )}
        </div>
      )}
      {ziehen && <div className="rw-drop-veil">JSON-Datei hier ablegen zum Importieren</div>}
    </div>
  );
}
