/**
 * Der ganze Bestand hinaus und wieder herein — die Rubrik „Sicherung" der
 * Einstellungen.
 *
 * Dasselbe wie `sicherung_erstellen` und `sicherung_einspielen` am Server, nur
 * ohne SSH.
 *
 * **Die Nachfrage vor dem Einspielen ist der eigentliche Inhalt dieser Datei.**
 * Ein Klick ersetzt hier Projekte, Zeiten, Kontakte *und* alle Konten samt
 * Passwörtern. Deshalb: erst die Datei wählen, dann eine Nachfrage, die den
 * Dateinamen nennt und sagt, was verschwindet — und der mildere Weg (erst
 * sichern) steht daneben.
 *
 * **Herunterladen ist der Griff in der Leiste, Wiederherstellen eine eigene
 * Karte darunter** (2026-11-19). Herunterladen ist das, was man hier
 * meistens tut; Ersetzen das, was man fast nie tut und dann nicht aus
 * Versehen. Vorher standen beide gleich laut untereinander in einer Karte.
 *
 * Die Nachfrage bleibt ein Dialog, obwohl die Rubrik selbst eine Seite ist:
 * Sie soll den Blick festhalten und nur zwei Wege offen lassen. Ein Abschnitt
 * weiter unten auf derselben Seite wäre wegscrollbar.
 */

import { useState } from "react";

import { csrfWert } from "../basis/api";
import { ANMELDESEITE } from "../basis/anmeldung";
import { melden } from "../basis/meldungen";
import { Hinweis } from "./Hinweis";
import { Zeichen } from "./Zeichen";

type Stand = "ruhig" | "fragt" | "laeuft";

export function Sicherung() {
  const [datei, setDatei] = useState<File | null>(null);
  const [stand, setStand] = useState<Stand>("ruhig");

  async function einspielen() {
    if (!datei) return melden("fehler", "Wähl zuerst das Archiv, das eingespielt werden soll.");
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
    <>
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>
            Sicherung{" "}
            <Hinweis
              worum="Was in der Sicherung steckt"
              text="Der ganze Bestand in einer Datei: Datenbank und hochgeladene Dateien, samt aller Konten. Sie gehört nicht in eine E-Mail und nicht in eine Cloud, die nicht uns gehört."
            />
          </b>
          <span>Datenbank und Dateien als ein Archiv</span>
        </div>
        <div className="vorhaben-aktionen">
          {/* Ein gewöhnlicher Link, wie beim Zeitnachweis: Der Browser lädt
              das Archiv selbst, ohne dass es erst durch JavaScript wandert. */}
          <a className="knopf" href="/api/sicherung/">
            <Zeichen name="herunter" />
            Sicherung herunterladen
          </a>
        </div>
      </div>

      <div className="karte sicherung-ersetzen">
        <h2>
          Wiederherstellen{" "}
          <Hinweis
            worum="Was Wiederherstellen tut"
            text="Ersetzt den gesamten Bestand durch das gewählte Archiv aus „Sicherung herunterladen“ (socos-….tar.gz). Vorher kommt eine Nachfrage."
          />
        </h2>
        <div className="feld-reihe">
          {/* Das Dateifeld liegt in einem Etikett, das wie ein Knopf aussieht:
              Das System zeichnet sein eigenes, und im dunklen Thema war es
              ein weißer Fleck. Der Name der Datei steht daneben. */}
          <label className="knopf-still sicherung-wahl">
            <Zeichen name="archiv" />
            {datei ? "Anderes Archiv" : "Archiv wählen"}
            <input
              type="file"
              accept=".gz,.tgz,application/gzip,application/x-gzip"
              onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className={datei ? "sicherung-datei" : "sicherung-datei leer"}>
            {datei ? datei.name : "noch keine Datei gewählt"}
          </span>
          {/* Ohne Datei gesperrt statt mit einer Fehlermeldung danach: Der
              Knopf sagt selbst, dass erst etwas fehlt. */}
          <button
            type="button"
            className="knopf"
            onClick={() => setStand("fragt")}
            disabled={!datei || stand === "laeuft"}
          >
            {stand === "laeuft" ? "Wird eingespielt …" : "Bestand ersetzen …"}
          </button>
        </div>
      </div>

      {stand === "fragt" && datei && (
        <div
          className="dialog-grund"
          role="dialog"
          aria-modal="true"
          onClick={() => setStand("ruhig")}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
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
              <button type="button" className="knopf" onClick={einspielen}>
                Ersetzen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
