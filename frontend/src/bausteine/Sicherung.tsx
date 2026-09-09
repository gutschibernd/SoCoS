/**
 * Der ganze Bestand hinaus und wieder herein — hinter dem Zahnrad rechts oben.
 *
 * Dasselbe wie `sicherung_erstellen` und `sicherung_einspielen` am Server, nur
 * ohne SSH. Das Zahnrad ist klein und steht am Rand: Es ist nichts, was man im
 * Tagesbetrieb braucht.
 *
 * **Die Nachfrage vor dem Einspielen ist der eigentliche Inhalt dieser Datei.**
 * Ein Klick ersetzt hier Projekte, Zeiten, Kontakte *und* alle Konten samt
 * Passwörtern. Deshalb: erst die Datei wählen, dann eine zweite Seite, die den
 * Dateinamen nennt und sagt, was verschwindet — und der mildere Weg (erst
 * sichern) steht daneben.
 */

import { useState } from "react";

import { csrfWert } from "../basis/api";
import { ANMELDESEITE } from "../basis/anmeldung";
import { melden } from "../basis/meldungen";
import { Zeichen } from "./Zeichen";

type Stand = "ruhig" | "fragt" | "laeuft";

export function Sicherungsdialog({ schliessen }: { schliessen: () => void }) {
  const [datei, setDatei] = useState<File | null>(null);
  const [stand, setStand] = useState<Stand>("ruhig");

  async function einspielen() {
    if (!datei) return;
    setStand("laeuft");

    const inhalt = new FormData();
    inhalt.append("archiv", datei);
    inhalt.append("bestaetigung", "bestand-ersetzen");

    // Bewusst ohne `hole`: Nach einem erfolgreichen Einspielen ist die eigene
    // Sitzung beendet, und die Antwort darauf ist nicht „Fehler melden",
    // sondern „zur Anmeldung". Der Fehlerfall wird hier eigens gelesen, weil
    // die Meldung des Servers („Das Archiv enthält kein datenbank.json") das
    // Einzige ist, was beim Einspielen wirklich weiterhilft.
    const antwort = await fetch("/api/sicherung/einspielen/", {
      method: "POST",
      body: inhalt,
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-CSRFToken": csrfWert() },
    });

    if (antwort.ok) {
      window.location.assign(ANMELDESEITE);
      return;
    }

    const daten = await antwort.json().catch(() => null);
    const grund =
      (daten?.archiv?.[0] as string) ??
      (daten?.detail as string) ??
      `Das Einspielen ist gescheitert (Fehler ${antwort.status}).`;
    melden("fehler", grund);
    setStand("ruhig");
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" onClick={schliessen}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {stand === "fragt" && datei ? (
          <>
            <h2>Bestand durch „{datei.name}“ ersetzen?</h2>
            <p>
              <b>Alles</b> wird ersetzt: Projekte, Zeiten, Kontakte, Finanzen, das
              Änderungsprotokoll — und alle Konten samt Passwörtern. Was heute in SoCoS
              steht und nicht im Archiv ist, ist danach weg. Du wirst abgemeldet und
              meldest dich mit einem Konto aus dem Archiv wieder an.
            </p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setStand("ruhig")}>
                Abbrechen
              </button>
              <a className="knopf-still" href="/api/sicherung/">
                Vorher das Heutige sichern
              </a>
              <button
                type="button"
                className="knopf"
                onClick={einspielen}
                disabled={stand !== "fragt"}
              >
                Ersetzen
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Sicherung</h2>
            <p>
              Der gesamte Bestand in einer Datei: Datenbank und hochgeladene Dateien.
              Sie enthält auch die Konten — sie gehört nicht in eine E-Mail und nicht in
              eine Cloud, die nicht uns gehört.
            </p>

            <div className="sicherung-teil">
              <h3>Herunterladen</h3>
              {/* Ein gewöhnlicher Link, wie beim Zeitnachweis: Der Browser lädt
                  das Archiv selbst, ohne dass es erst durch JavaScript wandert. */}
              <a className="knopf" href="/api/sicherung/" onClick={() => schliessen()}>
                <Zeichen name="runter" />
                Sicherung herunterladen
              </a>
            </div>

            <div className="sicherung-teil">
              <h3>Wiederherstellen</h3>
              <input
                className="feld"
                type="file"
                accept=".gz,.tgz,application/gzip,application/x-gzip"
                onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
              />
              <p className="sicherung-hinweis">
                Ersetzt den gesamten Bestand durch die gewählte Datei. Erwartet wird ein
                Archiv aus „Sicherung herunterladen“ (<code>socos-….tar.gz</code>).
              </p>
              <div className="dialog-knoepfe">
                <button type="button" className="knopf-still" onClick={schliessen}>
                  Schließen
                </button>
                <button
                  type="button"
                  className="knopf"
                  onClick={() => setStand("fragt")}
                  disabled={!datei || stand === "laeuft"}
                >
                  {stand === "laeuft" ? "Wird eingespielt …" : "Bestand ersetzen"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Der kleine Knopf rechts oben. Nur für den Admin — entschieden wird das am Server. */
export function Zahnrad({ oeffnen }: { oeffnen: () => void }) {
  return (
    <button
      type="button"
      className="kopf-knopf"
      onClick={oeffnen}
      aria-label="Sicherung"
      title="Sicherung: herunterladen und wiederherstellen"
    >
      <Zeichen name="zahnrad" />
    </button>
  );
}
