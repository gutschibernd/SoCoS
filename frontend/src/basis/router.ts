/**
 * Ein sehr kleiner Router.
 *
 * Kein react-router: Es gibt acht Seiten und eine Ebene darunter. Ein
 * Rahmenwerk brächte hier mehr Begriffe mit, als die Anwendung Wege hat.
 *
 * „start" ist die Wurzel und zugleich der Rückfall für einen Pfad, den es
 * nicht gibt. Sie steht in keinem Menü — hin kommt man über das Logo. Eine
 * Seite, die nur Abkürzungen auf die anderen fünf zeigt, wäre als sechster
 * Menüeintrag neben ihren eigenen Zielen bloß Verdopplung.
 *
 * Warum die zweite Ebene überhaupt im Weg steht und nicht im Zustand der
 * Ansicht: Auf der Kontakteseite ist „zurück zur Liste" der häufigste Griff,
 * und am Handy nimmt man dafür die Zurück-Geste des Geräts. Läge die Auswahl
 * nur im Zustand, würfe diese Geste jemanden aus der Seite heraus, statt eine
 * Ebene hoch. Zwei Geschichten nebeneinander — eine im Browser, eine in der
 * Ansicht — wären der schlechtere Weg dorthin.
 */

import { useEffect, useState } from "react";

export const SEITEN = [
  "start",
  "dashboard",
  "projekt",
  "zeit",
  "kontakte",
  "events",
  "profil",
  "einstellungen",
] as const;
export type Seite = (typeof SEITEN)[number];

/**
 * Die Rubriken der Einstellungen. Sie stehen hier und nicht in der Ansicht,
 * weil der Weg sie kennen muss: `/einstellungen/protokoll` soll ein Lesezeichen
 * sein dürfen und nach dem Neuladen dieselbe Rubrik zeigen.
 *
 * Wer eine Rubrik sehen darf, entscheidet die Ansicht anhand der Rechte aus
 * `/api/ich/` — und der Server bei jedem Aufruf noch einmal selbst.
 */
export const RUBRIKEN = ["konten", "protokoll", "sicherung"] as const;
export type Rubrik = (typeof RUBRIKEN)[number];

/**
 * Was hinter einer Seite stehen darf. Was hier nicht durchkommt, wird beim
 * Lesen des Pfades verworfen — sonst hinge an einer beliebigen erfundenen
 * zweiten Stufe eine Ansicht in einem Zustand, den niemand vorgesehen hat.
 *
 * Eine Prüfung statt einer Liste, weil die Fälle verschieden gebaut sind:
 * „projekt" hat einen einzigen festen Weg, „einstellungen" eine kurze feste
 * Liste, „kontakte" trägt dort eine Organisationsnummer, die man nicht
 * aufzählen kann. Ob es die Organisation noch gibt, weiß erst die Ansicht —
 * sie zeigt dann die Liste.
 */
const UNTERWEG: Partial<Record<Seite, (unter: string) => boolean>> = {
  projekt: (unter) => unter === "bearbeiten",
  kontakte: (unter) => unter === "lose" || /^\d+$/.test(unter),
  events: (unter) => /^\d+$/.test(unter),
  einstellungen: (unter) => (RUBRIKEN as readonly string[]).includes(unter),
};

export type Ort = { seite: Seite; unter: string | null };

export function ausPfad(pfad: string): Ort {
  const teile = pfad.replace(/^\/+/, "").split("/").filter(Boolean);
  const seite = (SEITEN as readonly string[]).includes(teile[0]) ? (teile[0] as Seite) : "start";
  const erlaubt = UNTERWEG[seite];
  const unter = teile[1] ?? "";
  return { seite, unter: erlaubt?.(unter) ? unter : null };
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
