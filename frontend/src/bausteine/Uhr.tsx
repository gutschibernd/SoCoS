import { useEffect, useState } from "react";

import { alsUhr } from "../basis/zeit";

/**
 * Die laufende Uhr im Kopf.
 *
 * Zählt aus dem **Startzeitpunkt** hoch, nicht aus einem eigenen Zähler. Ein
 * Zähler, der bei 0 beginnt, zeigt nach einem Neuladen der Seite eine falsche
 * Dauer — und genau dann schaut jemand hin.
 */
export function Uhr({ seit }: { seit: string }) {
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    const takt = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(takt);
  }, []);

  return (
    <span className="zahl">{alsUhr(Math.floor((jetzt - new Date(seit).getTime()) / 1000))}</span>
  );
}
