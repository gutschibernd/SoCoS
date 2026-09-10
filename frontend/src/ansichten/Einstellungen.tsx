/**
 * Was hinter dem Zahnrad liegt: Konten, Änderungsprotokoll, Sicherung.
 *
 * Eine Seite mit einem Untermenü und kein Dialog. Der Dialog, der hier vorher
 * stand, konnte genau eine Sache — und alles Weitere hätte ihn in eine zweite
 * Anwendung im Fenster verwandelt. Auf einer Seite hat jede Rubrik einen Weg,
 * ein Lesezeichen und die Zurück-Geste des Geräts.
 *
 * **Die Rechte kommen aus `/api/ich/`, nicht aus einer Liste hier.** Was
 * jemand nicht darf, steht gar nicht erst im Untermenü — und der Server prüft
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
  { rubrik: "protokoll", titel: "Änderungsprotokoll", wer: () => true },
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
      <div className="karte">
        <h2>Einstellungen</h2>
        <p className="sicherung-hinweis">
          Hier gibt es für dich nichts einzustellen. Deine Stammdaten stehen im Profil.
        </p>
      </div>
    );
  }

  return (
    <div className="einstellungen">
      <nav className="untermenue" aria-label="Einstellungen">
        {offen.map((r) => (
          <a
            key={r.rubrik}
            href={`/einstellungen/${r.rubrik}`}
            aria-current={r.rubrik === gewaehlt.rubrik ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              wechseln("einstellungen", r.rubrik);
            }}
          >
            {r.titel}
          </a>
        ))}
      </nav>

      <div className="spalte">
        {gewaehlt.rubrik === "konten" && <Team ich={ich} />}
        {gewaehlt.rubrik === "protokoll" && <Protokoll />}
        {gewaehlt.rubrik === "sicherung" && <Sicherung />}
      </div>
    </div>
  );
}
