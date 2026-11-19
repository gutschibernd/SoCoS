/**
 * Was hinter dem Zahnrad liegt: Konten, Änderungsprotokoll, Sicherung.
 *
 * Eine Seite mit Rubriken und kein Dialog. Der Dialog, der hier vorher
 * stand, konnte genau eine Sache — und alles Weitere hätte ihn in eine zweite
 * Anwendung im Fenster verwandelt. Auf einer Seite hat jede Rubrik einen Weg,
 * ein Lesezeichen und die Zurück-Geste des Geräts.
 *
 * **Die Rubriken stehen oben als Umschalter, nicht als Leiste links**
 * (2026-11-19). Die Leiste nahm 200 px Breite für drei Wörter, und gerade
 * Konten und Protokoll sind Tabellen, die die Breite brauchen. Oben sieht die
 * Seite aus wie Praktikanten und Module: Umschalter, darunter die Leiste mit
 * Name, Zahl und Griffen, darunter die Liste.
 *
 * **Die Rechte kommen aus `/api/ich/`, nicht aus einer Liste hier.** Was
 * jemand nicht darf, steht gar nicht erst im Umschalter — und der Server prüft
 * es bei jedem Aufruf noch einmal selbst. Eine im Frontend versteckte Rubrik
 * wäre nur eine ungenannte URL.
 */

import type { Ich } from "../basis/daten";
import type { Rubrik, Seite } from "../basis/router";
import { Protokoll } from "../bausteine/Protokoll";
import { Sicherung } from "../bausteine/Sicherung";
import { Team } from "../bausteine/Team";

const RUBRIKEN: { rubrik: Rubrik; titel: string; wer: (ich: Ich) => boolean }[] = [
  { rubrik: "konten", titel: "Konten", wer: (ich) => ich.darf.nutzer_verwalten },
  // Das Protokoll sehen alle drei Rollen. „Wer hat diese Zeit nachträglich
  // geändert" ist keine Admin-Frage.
  // „Protokoll" und nicht „Änderungsprotokoll": Das lange Wort zerfiel am
  // Handy im Umschalter in zwei Silben. Der volle Name steht in der Leiste.
  { rubrik: "protokoll", titel: "Protokoll", wer: () => true },
  { rubrik: "sicherung", titel: "Sicherung", wer: (ich) => ich.darf.sichern },
];

/** Ob jemand überhaupt etwas hinter dem Zahnrad findet — der Kopf fragt hier. */
export function hatEinstellungen(ich: Ich): boolean {
  return RUBRIKEN.some((r) => r.wer(ich));
}

export function Einstellungen({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const offen = RUBRIKEN.filter((r) => r.wer(ich));

  // Ohne Rubrik im Weg — und ebenso bei einer, die diese Rolle nicht sehen
  // darf — steht die erste offene da. Kein Redirect: Der Weg ohne Rubrik ist
  // gültig und soll es bleiben, damit „/einstellungen" ein Lesezeichen sein
  // kann, das auch nach einer Rechteänderung noch irgendwo hinführt.
  const gewaehlt = offen.find((r) => r.rubrik === unter) ?? offen[0];

  if (!gewaehlt) {
    return (
      <div className="karte leerstelle">
        <b>Hier gibt es für dich nichts einzustellen</b>
        <p>Deine Stammdaten stehen im Profil.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("profil")}>
          Zum Profil
        </button>
      </div>
    );
  }

  // Eine einzige Rubrik braucht keinen Umschalter — er hätte nur einen
  // gedrückten Knopf, der nirgends hinführt.
  const umschalter = offen.length > 1 && (
    <div className="spannenwahl workshopwahl" role="group" aria-label="Einstellungen">
      {offen.map((r) => (
        <button
          key={r.rubrik}
          type="button"
          aria-pressed={r.rubrik === gewaehlt.rubrik}
          onClick={() => wechseln("einstellungen", r.rubrik)}
        >
          {r.titel}
        </button>
      ))}
    </div>
  );

  return (
    <div className="spalte">
      {umschalter}
      {gewaehlt.rubrik === "konten" && <Team ich={ich} />}
      {gewaehlt.rubrik === "protokoll" && <Protokoll />}
      {gewaehlt.rubrik === "sicherung" && <Sicherung />}
    </div>
  );
}
