/**
 * Ein sehr kleiner Router.
 *
 * Kein react-router: Es gibt fünf Seiten und eine einzige Unterseite. Ein
 * Rahmenwerk brächte hier mehr Begriffe mit, als die Anwendung Wege hat.
 */

import { useEffect, useState } from "react";

export const SEITEN = ["dashboard", "projekt", "zeit", "kontakte", "profil"] as const;
export type Seite = (typeof SEITEN)[number];

/**
 * Unterseiten je Seite. Derzeit hat nur „projekt" eine: das Bearbeiten der
 * Gliederung.
 *
 * Was hier nicht steht, wird beim Lesen des Pfades verworfen — sonst hinge an
 * einer beliebigen erfundenen zweiten Stufe eine Ansicht in einem Zustand, den
 * niemand vorgesehen hat.
 */
export const UNTERSEITEN: Partial<Record<Seite, readonly string[]>> = {
  projekt: ["bearbeiten"],
};

export type Ort = { seite: Seite; unter: string | null };

export function ausPfad(pfad: string): Ort {
  const teile = pfad.replace(/^\/+/, "").split("/");
  const seite = (SEITEN as readonly string[]).includes(teile[0]) ? (teile[0] as Seite) : "dashboard";
  const erlaubt = UNTERSEITEN[seite] ?? [];
  return { seite, unter: erlaubt.includes(teile[1]) ? teile[1] : null };
}

export function alsPfad(seite: Seite, unter: string | null): string {
  return unter ? `/${seite}/${unter}` : `/${seite}`;
}

export function useSeite(): [Ort, (seite: Seite, unter?: string | null) => void] {
  const [ort, setOrt] = useState<Ort>(() => ausPfad(window.location.pathname));

  useEffect(() => {
    const beiZurueck = () => setOrt(ausPfad(window.location.pathname));
    window.addEventListener("popstate", beiZurueck);
    return () => window.removeEventListener("popstate", beiZurueck);
  }, []);

  const wechseln = (seite: Seite, unter: string | null = null) => {
    window.history.pushState(null, "", alsPfad(seite, unter));
    setOrt({ seite, unter });
  };

  return [ort, wechseln];
}
