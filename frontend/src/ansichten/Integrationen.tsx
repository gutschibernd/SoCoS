/**
 * Integrationen — was SoCoS nach draußen gibt. Bisher eines: das Kalender-Abo.
 *
 * **Die Anleitung steht hier und nicht in der Doku**, anders als sonst: Sie
 * wird genau einmal gebraucht, genau in dem Moment, in dem man den Link
 * kopiert — und sie gehört zu diesem Link, nicht zu einer Arbeitsweise.
 *
 * Wie die Datei gebaut ist und warum so wenig darin steht: socos/kalender.py.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { hole } from "../basis/api";
import { melden } from "../basis/meldungen";
import { Zustand } from "../basis/Zustand";

type Kalenderlink = { link: string };

export function Integrationen() {
  const abfrage = useQuery({
    queryKey: ["kalenderlink"],
    queryFn: () => hole<Kalenderlink>("/kalender/"),
  });
  const speicher = useQueryClient();
  const [fragtNeu, setFragtNeu] = useState(false);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { link } = abfrage.data;

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(link);
      melden("gut", "Der Link ist in der Zwischenablage.");
    } catch {
      // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Der Link
      // steht im Feld daneben und lässt sich von Hand markieren.
      melden("fehler", "Kopieren ging nicht — bitte den Link im Feld markieren.");
    }
  }

  async function neuErzeugen() {
    const neu = await hole<Kalenderlink>("/kalender/neu/", { method: "POST" });
    speicher.setQueryData(["kalenderlink"], neu);
    setFragtNeu(false);
    melden("gut", "Neuer Link erzeugt. Der alte funktioniert nicht mehr.");
  }

  return (
    <div className="spalte">
      <div className="karte">
        <h2>Kalender-Abo</h2>

        <div className="feld-reihe">
          <input
            className="feld integration-link"
            readOnly
            value={link}
            aria-label="Kalender-Link"
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="knopf" onClick={kopieren}>
            Link kopieren
          </button>
        </div>

        <h3 className="integration-titel">So kommt er in Proton Calendar</h3>
        <ol className="doku-schritte">
          <li>
            Oben auf <b>Link kopieren</b> klicken.
          </li>
          <li>
            <b>calendar.proton.me</b> im Browser öffnen — das Hinzufügen geht nur dort, nicht in
            der App am Handy.
          </li>
          <li>
            Neben <b>Meine Kalender</b> auf <b>+</b> klicken und das Hinzufügen über eine URL
            wählen (englisch: <i>Add calendar from URL</i>).
          </li>
          <li>
            Den Link einfügen und <b>Kalender hinzufügen</b> klicken. Danach erscheint er auch in
            der Proton-App am Handy.
          </li>
        </ol>

        <h3 className="integration-titel">Gut zu wissen</h3>
        <ul className="integration-merke">
          <li>
            <b>Proton holt nur alle 4 bis 16 Stunden neu ab.</b> Ein Event, das gerade angelegt
            wurde, steht erst danach im Kalender.
          </li>
          <li>
            <b>Nur in eine Richtung:</b> Was im Kalender verschoben wird, ändert in SoCoS nichts.
          </li>
          <li>
            Drin sind alle Events und Meetings mit Titel, Zeit und Ort — keine Notizen, keine
            Namen. Ein Meeting dauert im Kalender eine Stunde, ein Event ohne Uhrzeit den
            ganzen Tag.
          </li>
          <li>
            <b>Der Link ist wie ein Passwort:</b> Wer ihn hat, sieht die Termine. Nicht
            weitergeben.
          </li>
        </ul>
      </div>

      <div className="karte">
        <h2>Link erneuern</h2>
        {fragtNeu ? (
          <div className="feld-reihe integration-nachfrage">
            <span>
              Der jetzige Link hört sofort auf zu funktionieren. Im Kalender muss danach der neue
              eingetragen werden.
            </span>
            <button type="button" className="knopf" onClick={neuErzeugen}>
              Ja, neuen Link erzeugen
            </button>
            <button type="button" className="knopf-still" onClick={() => setFragtNeu(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="feld-reihe">
            <span className="integration-leise">
              Wenn der Link in falsche Hände geraten ist.
            </span>
            <button type="button" className="knopf-still" onClick={() => setFragtNeu(true)}>
              Neuen Link erzeugen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
