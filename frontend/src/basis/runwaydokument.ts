/**
 * Der Plan der Runway-Planung als Dokument, das man an Ort und Stelle ändert —
 * gespeichert wie im Runway-Planer, aus dem das Modul stammt: Jede Eingabe
 * ändert den Plan sofort auf der Seite, 0,8 s nach der letzten Eingabe geht
 * er an den Server, und mit der Antwort kommt die neue Rechnung.
 *
 * **Warum nicht über `useSchreiben`:** Das schreibt einzelne Felder und lädt
 * danach alles neu. Hier ist der Plan ein Ganzes; neu laden während des
 * Tippens setzte die Felder unter den Fingern zurück.
 *
 * `stand` ist der Stand des Servers, auf dem die Seite aufbaut. Hat jemand
 * anderes inzwischen gespeichert, antwortet der Server 409 — dann wird der
 * neue Stand geladen, statt ihn still zu überschreiben.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ApiFehler, hole } from "./api";
import type { Runway, Runwayplan, Szenario } from "./daten";

export type Speicherstand = "saved" | "pending" | "error" | "readonly";

export function useRunwayDokument(szenario: Szenario, daten: Runway | undefined) {
  const qc = useQueryClient();
  const [S, setS] = useState<Runwayplan | null>(null);
  // Zählt hoch, wenn der Plan von außen ersetzt wird (Laden, Import,
  // Rückgängig). Die Eingabefelder hängen daran und beginnen dann neu —
  // sonst stünde in ihnen weiter, was vorher getippt war.
  const [version, setVersion] = useState(0);
  const [speicher, setSpeicher] = useState<Speicherstand>("saved");
  const SRef = useRef<Runwayplan | null>(null);
  const stand = useRef<string | null | undefined>(undefined);
  const offen = useRef(false);
  const laeuft = useRef(false);
  const uhr = useRef<number | undefined>(undefined);
  const szRef = useRef(szenario);
  szRef.current = szenario;
  const darf = daten?.darf_schreiben ?? false;

  useEffect(() => {
    if (!daten || offen.current || laeuft.current) return;
    if (stand.current === undefined || daten.stand !== stand.current) {
      stand.current = daten.stand;
      SRef.current = daten.plan;
      setS(daten.plan);
      setVersion((v) => v + 1);
    }
    if (!daten.darf_schreiben) setSpeicher("readonly");
  }, [daten]);

  function ablegen(a: Runway, plan: Runwayplan) {
    stand.current = a.stand;
    qc.setQueryData(["runway", szRef.current], { ...a, plan });
    // Die anderen Szenarien rechnen beim nächsten Umschalten neu.
    void qc.invalidateQueries({ queryKey: ["runway"], predicate: (q) => q.queryKey[1] !== szRef.current, refetchType: "none" });
  }

  function veraltet(e: unknown) {
    if (e instanceof ApiFehler && e.code === "veraltet") {
      stand.current = "veraltet";
      offen.current = false;
      setSpeicher("saved");
      void qc.invalidateQueries({ queryKey: ["runway"] });
      return true;
    }
    return false;
  }

  async function senden(): Promise<void> {
    if (laeuft.current) {
      uhr.current = window.setTimeout(senden, 400);
      return;
    }
    if (!SRef.current) return;
    laeuft.current = true;
    offen.current = false;
    const plan = SRef.current;
    try {
      const a = await hole<Runway>(`/runway/?szenario=${szRef.current}`, {
        method: "PUT",
        body: JSON.stringify({ plan, stand: stand.current ?? null }),
      });
      ablegen(a, SRef.current);
      if (!offen.current) setSpeicher("saved");
    } catch (e) {
      if (!veraltet(e)) setSpeicher("error");
    } finally {
      laeuft.current = false;
    }
  }

  /** Eine Eingabe: der Plan ändert sich sofort, gespeichert wird gleich. */
  function aendern(neu: Runwayplan) {
    if (!darf) return;
    SRef.current = neu;
    setS(neu);
    offen.current = true;
    setSpeicher("pending");
    window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(senden, 800);
  }

  /**
   * Der ganze Plan wird ersetzt — Import, Rückgängig, alles löschen. Sofort
   * gespeichert; was zurückkommt, ist der Plan, wie der Server ihn
   * vervollständigt hat (fehlende Felder, Kennungen).
   */
  async function ersetzen(neu: unknown) {
    if (!darf) return;
    window.clearTimeout(uhr.current);
    while (laeuft.current) await new Promise((r) => setTimeout(r, 100));
    laeuft.current = true;
    offen.current = false;
    setSpeicher("pending");
    try {
      const a = await hole<Runway>(`/runway/?szenario=${szRef.current}`, {
        method: "PUT",
        body: JSON.stringify({ plan: neu, stand: stand.current ?? null }),
      });
      SRef.current = a.plan;
      setS(a.plan);
      setVersion((v) => v + 1);
      ablegen(a, a.plan);
      setSpeicher("saved");
    } catch (e) {
      if (!veraltet(e)) setSpeicher("error");
    } finally {
      laeuft.current = false;
    }
  }

  /** Die Ist-Zelle schreibt einen Kontostand — kein Teil des Plans. */
  async function ist(monat: string, betrag: number | null) {
    const a = await hole<Runway>(`/runway/ist/?szenario=${szRef.current}`, {
      method: "POST",
      body: JSON.stringify({ monat, betrag: betrag === null ? null : betrag.toFixed(2) }),
    });
    qc.setQueryData(["runway", szRef.current], { ...a, plan: SRef.current ?? a.plan });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  // Wer die Seite verlässt, während noch etwas offen ist, verliert es nicht.
  useEffect(
    () => () => {
      if (offen.current) {
        window.clearTimeout(uhr.current);
        void senden();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { S, version, speicher, darf, aendern, ersetzen, ist, aktuell: () => SRef.current };
}
