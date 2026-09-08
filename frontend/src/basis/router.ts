/**
 * Ein sehr kleiner Router.
 *
 * Kein react-router: Es gibt fünf Seiten und **eine** Ebene darunter — die
 * gewählte Organisation auf der Kontakteseite. Ein Rahmenwerk brächte hier
 * mehr Begriffe mit, als die Anwendung Seiten hat.
 *
 * Warum die zweite Ebene überhaupt im Weg steht und nicht im Zustand der
 * Ansicht: Auf der Kontakteseite ist „zurück zur Liste" der häufigste Griff,
 * und am Handy nimmt man dafür die Zurück-Geste des Geräts. Läge die Auswahl
 * nur im Zustand, würfe diese Geste jemanden aus der Seite heraus, statt eine
 * Ebene hoch. Zwei Geschichten nebeneinander — eine im Browser, eine in der
 * Ansicht — wären der schlechtere Weg dorthin.
 */

import { useEffect, useState } from "react";

export const SEITEN = ["dashboard", "projekt", "zeit", "kontakte", "profil"] as const;
export type Seite = (typeof SEITEN)[number];

/** Wo wir sind: die Seite und, wenn es eine gibt, die Ebene darunter. */
export type Ort = { seite: Seite; unter: string };

export function ausPfad(pfad: string): Ort {
  const teile = pfad.replace(/^\/+/, "").split("/").filter(Boolean);
  const bekannt = (SEITEN as readonly string[]).includes(teile[0]);
  return {
    seite: bekannt ? (teile[0] as Seite) : "dashboard",
    // Nur hinter einer bekannten Seite: `/quatsch/12` landet auf dem
    // Dashboard, und dort hätte eine Unterebene keine Bedeutung.
    unter: bekannt ? decodeURIComponent(teile[1] ?? "") : "",
  };
}

export function alsPfad(seite: Seite, unter: string): string {
  return unter ? `/${seite}/${encodeURIComponent(unter)}` : `/${seite}`;
}

export function useSeite(): [Ort, (seite: Seite, unter?: string) => void] {
  const [ort, setOrt] = useState<Ort>(() => ausPfad(window.location.pathname));

  useEffect(() => {
    const beiZurueck = () => setOrt(ausPfad(window.location.pathname));
    window.addEventListener("popstate", beiZurueck);
    return () => window.removeEventListener("popstate", beiZurueck);
  }, []);

  const wechseln = (seite: Seite, unter = "") => {
    window.history.pushState(null, "", alsPfad(seite, unter));
    setOrt({ seite, unter });
  };

  return [ort, wechseln];
}
