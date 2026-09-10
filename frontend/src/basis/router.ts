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
 * Die Teile des Profils — dieselbe Bauart wie die Rubriken der Einstellungen,
 * nur mit der Leiste auf der anderen Seite. Auch sie stehen im Weg und nicht
 * im Zustand der Ansicht: Sonst würfe die Zurück-Geste des Geräts jemanden aus
 * dem Profil heraus, statt vom Teil zum Profil zurück.
 */
export const PROFILTEILE = ["person", "kontakt", "adresse", "konto"] as const;
export type Profilteil = (typeof PROFILTEILE)[number];

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
  profil: (unter) => (PROFILTEILE as readonly string[]).includes(unter),
};

export type Ort = { seite: Seite; unter: string | null };

/**
 * Wie tief die Anwendung in der Geschichte des Browsers steht — mitgeschrieben
 * in `history.state`.
 *
 * **Warum überhaupt gezählt wird:** Ein „Zurück", das blind `history.back()`
 * ruft, führt bei einer direkt aufgerufenen Seite aus SoCoS heraus — auf die
 * Seite davor im Browser, also irgendwohin. Der Zähler steht im Zustand des
 * Eintrags und nicht in einer Variablen, weil er sonst beim Vor und Zurück
 * auseinanderliefe: Der Browser gibt den Zustand des Eintrags zurück, eine
 * Variable zählt nur hoch.
 */
type Weggeschichte = { tiefe: number } | null;

const tiefe = () => (window.history.state as Weggeschichte)?.tiefe ?? 0;

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

export type Weg = {
  ort: Ort;
  wechseln: (seite: Seite, unter?: string | null) => void;
  /** Eine Ebene hoch, sonst in der Geschichte zurück, sonst zur Startseite. */
  zurueck: () => void;
  /** Ob es überhaupt ein Zurück gibt — auf der Startseite beim ersten Aufruf nicht. */
  kannZurueck: boolean;
};

export function useSeite(): Weg {
  const [ort, setOrt] = useState<Ort>(() => ausPfad(window.location.pathname));

  useEffect(() => {
    const beiZurueck = () => setOrt(ausPfad(window.location.pathname));
    window.addEventListener("popstate", beiZurueck);
    return () => window.removeEventListener("popstate", beiZurueck);
  }, []);

  const wechseln = (seite: Seite, unter: string | null = null) => {
    window.history.pushState({ tiefe: tiefe() + 1 }, "", alsPfad(seite, unter));
    setOrt({ seite, unter });
  };

  /**
   * Drei Fälle, in dieser Reihenfolge:
   *
   * 1. Steht etwas hinter der Seite (ein Kontakt, ein Event, „bearbeiten"),
   *    geht es **eine Ebene hoch** — nicht in der Geschichte zurück. Wer über
   *    einen Verlaufseintrag von einem Kontakt zu einem Event gesprungen ist,
   *    will von dort zur Eventliste und nicht wieder zum Kontakt.
   * 2. Sonst zurück in der Geschichte, solange sie in SoCoS bleibt.
   * 3. Sonst zur Startseite. Von dort führt jeder weitere Weg mit einem Klick
   *    weiter — anders als aus einem Lesezeichen heraus, wo „zurück" den
   *    Browser aus der Anwendung trüge.
   */
  const zurueck = () => {
    if (ort.unter) return wechseln(ort.seite, null);
    if (tiefe() > 0) return window.history.back();
    if (ort.seite !== "start") return wechseln("start");
  };

  const kannZurueck = ort.unter !== null || tiefe() > 0 || ort.seite !== "start";

  return { ort, wechseln, zurueck, kannZurueck };
}
