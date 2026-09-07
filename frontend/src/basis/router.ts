/**
 * Ein sehr kleiner Router.
 *
 * Kein react-router: Es gibt fünf Seiten ohne verschachtelte Wege. Ein
 * Rahmenwerk brächte hier mehr Begriffe mit, als die Anwendung Seiten hat.
 */

import { useEffect, useState } from "react";

export const SEITEN = ["dashboard", "projekt", "zeit", "kontakte", "profil"] as const;
export type Seite = (typeof SEITEN)[number];

function ausPfad(pfad: string): Seite {
  const erstes = pfad.replace(/^\/+/, "").split("/")[0];
  return (SEITEN as readonly string[]).includes(erstes) ? (erstes as Seite) : "dashboard";
}

export function useSeite(): [Seite, (s: Seite) => void] {
  const [seite, setSeite] = useState<Seite>(() => ausPfad(window.location.pathname));

  useEffect(() => {
    const beiZurueck = () => setSeite(ausPfad(window.location.pathname));
    window.addEventListener("popstate", beiZurueck);
    return () => window.removeEventListener("popstate", beiZurueck);
  }, []);

  const wechseln = (ziel: Seite) => {
    window.history.pushState(null, "", `/${ziel}`);
    setSeite(ziel);
  };

  return [seite, wechseln];
}
