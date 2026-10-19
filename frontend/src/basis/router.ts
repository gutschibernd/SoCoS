/**
 * Ein sehr kleiner Router.
 *
 * Kein react-router: Es gibt zehn Seiten und eine Ebene darunter. Ein
 * Rahmenwerk brächte hier mehr Begriffe mit, als die Anwendung Wege hat.
 *
 * „start" ist die Übersicht, die Wurzel und zugleich der Rückfall für einen
 * Pfad, den es nicht gibt — auch für `/dashboard`, das seit 2026-10-19 in ihr
 * aufgegangen ist. Ein altes Lesezeichen landet so dort, wo das Dashboard
 * jetzt steht.
 *
 * Warum die zweite Ebene überhaupt im Weg steht und nicht im Zustand der
 * Ansicht: Auf der Kontakteseite ist „zurück zur Liste" der häufigste Griff,
 * und am Handy nimmt man dafür die Zurück-Geste des Geräts. Läge die Auswahl
 * nur im Zustand, würfe diese Geste jemanden aus der Seite heraus, statt eine
 * Ebene hoch. Zwei Geschichten nebeneinander — eine im Browser, eine in der
 * Ansicht — wären der schlechtere Weg dorthin.
 */

import { useEffect, useState } from "react";

import { MODULWEGE, designAusWeg, foerderauslastungAusWeg, foerderungAusWeg, themaAusWeg } from "./module";

export const SEITEN = [
  "start",
  "projekt",
  "zeit",
  "aufgaben",
  "kontakte",
  "events",
  "meetings",
  "module",
  "profil",
  "einstellungen",
  "doku",
  "rueckmeldungen",
  "integrationen",
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
 * Die Rubriken der Doku. Wie die der Einstellungen im Weg und nicht im Zustand:
 * „Schick mir den Link zur Zeiterfassung" soll ein Link sein können.
 */
export const DOKUTEILE = [
  "ueberblick",
  "zeit",
  "aufgaben",
  "projekt",
  "kontakte",
  "events",
  "meetings",
  "module",
  "geld",
  "rechte",
  "aenderungen",
] as const;
export type Dokuteil = (typeof DOKUTEILE)[number];

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
  // „bearbeiten", oder die Nummer der Phase, die unter dem Gantt aufgeht.
  projekt: (unter) => unter === "bearbeiten" || /^\d+$/.test(unter),
  aufgaben: (unter) => unter === "ideen" || unter === "archiv",
  kontakte: (unter) => unter === "lose" || /^\d+$/.test(unter),
  events: (unter) => /^\d+$/.test(unter),
  meetings: (unter) => /^\d+$/.test(unter),
  // Ein Teil eines Moduls: `/module/praktikum`, `/module/thoughts`. Die
  // Liste steht in basis/module.ts und nicht ein zweites Mal hier. Dazu ein
  // einzelnes Praktikumsthema: `/module/praktikum/12`, `/module/praktikum-ideen/7`,
  // Fördergeber, Programm und Antrag: `/module/foerderungen/2`, `/2/1`, `/2/1/3`,
  // und die Auslastung daneben: `/module/foerderungen/auslastung`, eine
  // Designentscheidung: `/module/design/7`.
  module: (unter) =>
    MODULWEGE.includes(unter) ||
    themaAusWeg(unter) !== null ||
    foerderungAusWeg(unter) !== null ||
    foerderauslastungAusWeg(unter) !== null ||
    designAusWeg(unter) !== null,
  einstellungen: (unter) => (RUBRIKEN as readonly string[]).includes(unter),
  profil: (unter) => (PROFILTEILE as readonly string[]).includes(unter),
  doku: (unter) => (DOKUTEILE as readonly string[]).includes(unter),
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
export type Weggeschichte = { tiefe: number } | null;

const tiefe = () => (window.history.state as Weggeschichte)?.tiefe ?? 0;

/**
 * Wie ein Wechsel gemeint ist. `ersetzen`: Der neue Weg tritt an die Stelle
 * des alten, statt einen Eintrag in der Geschichte anzulegen. Für einen
 * Umschalter auf derselben Seite — die Reiter der Aufgaben, Bearbeiten und
 * Fertig, die Phase unter dem Projekt-Gantt — und für denselben Gegenstand
 * unter neuem Weg. Im Weg steht es trotzdem: Kommt man von einer anderen
 * Seite zurück, steht dieselbe Phase offen, und ein Lesezeichen behält sie.
 *
 * **Warum ein Umschalter keinen Eintrag anlegt:** Sonst führte „Zurück" durch
 * jede angeklickte Phase, statt auf die Seite, von der man kam — und nach
 * „Fertig" wieder hinein ins Bearbeiten. Ein Verweis dagegen (ein Kontakt,
 * ein Antrag, eine Rubrik der Doku) ist ein Ort und bekommt einen.
 */
export type Wechselart = { ersetzen?: boolean };

/**
 * Die Projektplanung ist seit 2026-10-19 Teil der Projektseite. Ein altes
 * Lesezeichen auf `/module/planung/28` führt zur selben Phase dort, statt auf
 * der Übersicht zu landen.
 */
function alterWeg(teile: string[]): string[] {
  if (teile[0] === "module" && teile[1] === "planung") return ["projekt", ...teile.slice(2)];
  return teile;
}

export function ausPfad(pfad: string): Ort {
  const teile = alterWeg(pfad.replace(/^\/+/, "").split("/").filter(Boolean));
  const seite = (SEITEN as readonly string[]).includes(teile[0]) ? (teile[0] as Seite) : "start";
  const erlaubt = UNTERWEG[seite];
  // Alles hinter der Seite, auch über mehrere Stufen — ob die Stufen dort
  // stehen dürfen, entscheidet die Prüfung und nicht das Zerlegen.
  const unter = teile.slice(1).join("/");
  return { seite, unter: erlaubt?.(unter) ? unter : null };
}

/** Die Stufe über einem Unterweg: `praktikum/12` → `praktikum`, `12` → keine. */
export function darueber(unter: string): string | null {
  const ende = unter.lastIndexOf("/");
  return ende > 0 ? unter.slice(0, ende) : null;
}

export function alsPfad(seite: Seite, unter: string | null): string {
  return unter ? `/${seite}/${unter}` : `/${seite}`;
}

/**
 * Wohin „Zurück" führt. Drei Fälle, in dieser Reihenfolge:
 *
 * 1. Gibt es eine Geschichte in SoCoS, **dorthin, woher man kam** — auch aus
 *    einer Unterseite heraus. Vom Förderantrag, den man im Projekt angeklickt
 *    hat, also zurück ins Projekt, nicht zum Förderprogramm darüber.
 * 2. Sonst (Lesezeichen, Link aus einer Mail) eine Ebene hoch: von
 *    `/module/praktikum/12` zu `/module/praktikum`.
 * 3. Sonst zur Startseite. Von dort führt jeder weitere Weg mit einem Klick
 *    weiter — anders als aus einem Lesezeichen heraus, wo „zurück" den
 *    Browser aus der Anwendung trüge.
 *
 * **Warum nicht mehr zuerst eine Ebene hoch:** So war es bis 2026-10-19 — mit
 * der Begründung, wer von einem Kontakt zu einem Event springt, wolle danach
 * zur Eventliste. Im Gebrauch war es umgekehrt (Bernd: „wenn ich im Projekt
 * auf eine Förderung klicke und dann zurück will, dann soll ich wieder zurück
 * in das Projekt"). Wer eine Ebene höher will, hat dafür einen Verweis auf
 * der Seite selbst (den Programmnamen über dem Antrag) oder das Menü.
 */
export function wohinZurueck(ort: Ort, eintrag: Weggeschichte): "geschichte" | Ort | null {
  if ((eintrag?.tiefe ?? 0) > 0) return "geschichte";
  // Ein Modul steht seit 2026-10-19 im Menü wie jede andere Seite. Seine
  // oberste Stufe (`/module/thoughts`) hat deshalb nichts mehr darüber — die
  // Übersicht aller Module war ein Weg, den niemand mehr geht.
  const oben = ort.seite === "module" && ort.unter !== null && darueber(ort.unter) === null;
  if (ort.unter && !oben) return { seite: ort.seite, unter: darueber(ort.unter) };
  return ort.seite !== "start" ? { seite: "start", unter: null } : null;
}

export type Weg = {
  ort: Ort;
  wechseln: (seite: Seite, unter?: string | null, art?: Wechselart) => void;
  /** Dorthin, woher man kam; ohne Geschichte eine Ebene hoch, sonst zur Startseite. */
  zurueck: () => void;
  /** Ob es überhaupt ein Zurück gibt — auf der Startseite beim ersten Aufruf nicht. */
  kannZurueck: boolean;
};

/** Der Wechsel, wie ihn die Ansichten bekommen. */
export type Wechseln = Weg["wechseln"];

export function useSeite(): Weg {
  const [ort, setOrt] = useState<Ort>(() => ausPfad(window.location.pathname));

  useEffect(() => {
    const beiZurueck = () => setOrt(ausPfad(window.location.pathname));
    window.addEventListener("popstate", beiZurueck);
    return () => window.removeEventListener("popstate", beiZurueck);
  }, []);

  const wechseln = (seite: Seite, unter: string | null = null, art: Wechselart = {}) => {
    const pfad = alsPfad(seite, unter);
    // Derselbe Ort noch einmal (ein zweiter Klick auf „Projekt" im Menü) legt
    // keinen Eintrag an — sonst täte das nächste Zurück scheinbar nichts.
    const gleich = pfad === window.location.pathname;
    if (art.ersetzen || gleich) {
      window.history.replaceState({ tiefe: tiefe() } satisfies Weggeschichte, "", pfad);
    } else {
      window.history.pushState({ tiefe: tiefe() + 1 } satisfies Weggeschichte, "", pfad);
      // Eine neue Seite beginnt oben. Beim Zurück stellt der Browser die alte
      // Stelle selbst wieder her.
      window.scrollTo(0, 0);
    }
    setOrt({ seite, unter });
  };

  const zurueck = () => {
    const ziel = wohinZurueck(ort, window.history.state as Weggeschichte);
    if (ziel === "geschichte") return window.history.back();
    // Ohne Geschichte ersetzt der Schritt den Eintrag. Legte er einen an,
    // führte das nächste Zurück wieder auf die Seite, die man gerade
    // verlassen hat — hin und her, statt weiter nach oben.
    if (ziel) wechseln(ziel.seite, ziel.unter, { ersetzen: true });
  };

  const kannZurueck = wohinZurueck(ort, window.history.state as Weggeschichte) !== null;

  return { ort, wechseln, zurueck, kannZurueck };
}
