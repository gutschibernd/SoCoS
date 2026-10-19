/**
 * Das eine Formular zum Anlegen.
 *
 * Vorher baute jede Liste ihr eigenes: Events und Meetings stellten es
 * dauerhaft über die Liste — fünf Felder ohne Beschriftung, deren Bedeutung
 * nur im Platzhalter stand und mit dem ersten Buchstaben verschwand —, die
 * Kontakte legten es hinter einen Knopf, die Förderungen hinter einen
 * anderen, ohne Abbrechen. Enter legte in manchen Feldern an, in anderen
 * nicht (im Datumsfeld nie), und ein Doppelklick auf „Anlegen" ergab zwei.
 *
 * Jetzt überall dasselbe:
 *
 * - **Hinter einem Knopf** in der Werkzeugleiste der Liste („Neues Event").
 *   Anlegen ist selten, Suchen häufig — das Seltene steht nicht dauerhaft
 *   über dem Häufigen. Nur eine leere Liste zeigt es gleich offen.
 * - **Beschriftung über jedem Feld**, kein Platzhalter als Beschriftung.
 * - **Ein `<form>`**: Enter legt an, aus jedem Feld; Esc bricht ab.
 * - **Gesperrt, solange der Server arbeitet** — kein Doppel durch Doppelklick.
 * - **Der Knopf sagt, was entsteht** („Event anlegen"), nicht bloß „Anlegen".
 *
 * Die Kupferkante links unterscheidet es von der Suche (Rückmeldung Bernd,
 * 2026-10-06: wer im oberen von zwei gleichen Feldern suchte und Enter
 * drückte, hatte etwas angelegt).
 */

import { useState, type ReactNode } from "react";

import { Fehlerzeile } from "./Fehlerzeile";
import { Zeichen } from "./Zeichen";

export function Anlegekarte({
  titel,
  knopf,
  anlegen,
  abbrechen,
  fehler,
  unten,
  eingebettet,
  children,
}: {
  /** Fehlt nur eingebettet, wenn die umgebende Karte schon sagt, worum es geht. */
  titel?: string;
  /**
   * In einer Karte statt als eigene — „Neue Person" unter den Personen,
   * „Verlauf eintragen" über dem Verlauf. Ohne Rahmen, und die Knöpfe stehen
   * in der Reihe der Felder, solange dort Platz ist.
   */
  eingebettet?: boolean;
  /** Was der Knopf sagt — „Event anlegen". */
  knopf: string;
  /** Wirft sie, bleibt alles stehen; `hole` hat den Grund dann schon gemeldet. */
  anlegen: () => Promise<void> | void;
  /** Fehlt bei einer leeren Liste: Dort ist Anlegen das Einzige, was es zu tun gibt. */
  abbrechen?: () => void;
  fehler?: string;
  /** Unter den Feldern, über den Knöpfen — etwa „Gibt es schon: …". */
  unten?: ReactNode;
  children: ReactNode;
}) {
  const [laeuft, setLaeuft] = useState(false);

  return (
    <form
      className={eingebettet ? "anlegekarte-eingebettet" : "karte anlegekarte"}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (laeuft) return;
        setLaeuft(true);
        try {
          await anlegen();
        } catch {
          // `hole` hat den Grund schon gemeldet; die Eingaben bleiben stehen.
        } finally {
          setLaeuft(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abbrechen) {
          e.preventDefault();
          abbrechen();
        }
      }}
    >
      {titel && (eingebettet ? <h3 className="anlegetitel">{titel}</h3> : <h2>{titel}</h2>)}
      <div className="anlegefelder">{children}</div>
      {unten}
      <Fehlerzeile text={fehler ?? ""} />
      <div className="anlegeknoepfe">
        <button type="submit" className="knopf" disabled={laeuft}>
          <Zeichen name="plus" />
          {knopf}
        </button>
        {abbrechen && (
          <button type="button" className="knopf-still" onClick={abbrechen}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Der Knopf in der Werkzeugleiste, der die Anlegekarte öffnet.
 *
 * Am Handy schrumpft er auf ein „+" neben dem Suchfeld (das Wort bleibt für
 * Vorlesesoftware und als Tooltip da): Mit dem vollen Wort in eigener Zeile
 * standen über den Kontakten vier Zeilen Bedienelemente, und die erste
 * Organisation begann unter der Hälfte des Bildschirms.
 */
export function Neuknopf({ text, oeffnen }: { text: string; oeffnen: () => void }) {
  return (
    <button type="button" className="knopf neuknopf" title={text} onClick={oeffnen}>
      <Zeichen name="plus" />
      <span className="neuknopf-text">{text}</span>
    </button>
  );
}

/**
 * Ein Feld mit seiner Beschriftung darüber. `breit` nimmt mehr vom Platz der
 * Reihe — für den Titel, neben dem Ort und Datum kürzer sein dürfen.
 */
export function Beschriftet({
  text,
  art,
  children,
}: {
  text: string;
  art?: "breit" | "tag" | "uhrzeit";
  children: ReactNode;
}) {
  return (
    <label className={art ? `feldblock feldblock-${art}` : "feldblock"}>
      <span className="beschriftung-klein">{text}</span>
      {children}
    </label>
  );
}
