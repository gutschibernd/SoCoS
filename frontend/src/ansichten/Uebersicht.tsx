/**
 * Die Übersicht — Startseite und Dashboard in einem, und jeder stellt sie sich
 * selbst zusammen.
 *
 * Vorher waren es zwei Seiten: Start mit „Zeit buchen" und vier Kacheln, die
 * das Menü wiederholten, und ein Dashboard mit Kontostand, Kosten und Runway
 * aus einem einzigen Kontostand und Wochenstunden aus drei Buchungen. Das
 * Änderungsprotokoll zeigte, dass beide am Alltag vorbeigingen: Gearbeitet
 * wurde in Aufgaben, Kontakten, Thoughts und den Förderungen.
 *
 * **Wer nie etwas umgestellt hat, sieht den Vorschlag aus der eigenen
 * Nutzung** (siehe socos/services/uebersicht.py). Ab dem ersten Verschieben
 * gilt das Gespeicherte.
 *
 * Anpassen ist ein eigener Zustand der Seite und kein Dauerzustand: Mit
 * Griffen, Pfeilen und Kreuzen an jedem Baustein wäre die Seite, die man zehnmal
 * am Tag aufmacht, für etwas eingerichtet, das man einmal im Monat tut.
 * Gezogen wird mit der Maus; am Handy gibt es kein Ziehen ohne Bibliothek,
 * dort tun die Pfeile dasselbe.
 */

import { useState } from "react";

import { useDashboard, useUebersichtSpeichern, type Ich } from "../basis/daten";
import {
  KATALOG,
  bekannte,
  breiteUmschalten,
  dazunehmen,
  entfernen,
  fehlende,
  titelVon,
  verschieben,
  type Platz,
} from "../basis/uebersicht";
import { alsPfad } from "../basis/router";
import { Zeichen } from "../bausteine/Zeichen";
import { BAUSTEINE, ZIELE, type Wechseln } from "./UebersichtBausteine";

export function Uebersicht({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const speichern = useUebersichtSpeichern();
  const [anpassen, setAnpassen] = useState(false);
  const [gezogen, setGezogen] = useState<number | null>(null);
  const [ziel, setZiel] = useState<number | null>(null);

  const plaetze = bekannte(ich.uebersicht.bausteine);
  const aendern = (neu: Platz[]) => speichern.mutate(neu);

  return (
    <div className="spalte">
      <Entwuerfe wechseln={wechseln} />

      <div className="ue-raster" data-anpassen={anpassen ? "ja" : undefined}>
        {plaetze.map((platz, i) => {
          const Inhalt = BAUSTEINE[platz.baustein];
          const hin = ZIELE[platz.baustein];
          const titel = titelVon(platz.baustein);
          return (
            <section
              key={platz.baustein}
              className="karte baustein"
              data-breit={platz.breit ? "ja" : undefined}
              data-ziel={ziel === i && gezogen !== i ? "ja" : undefined}
              data-gezogen={gezogen === i ? "ja" : undefined}
              draggable={anpassen}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                // Firefox zieht ohne Daten gar nicht los.
                e.dataTransfer.setData("text/plain", platz.baustein);
                setGezogen(i);
              }}
              onDragOver={(e) => {
                if (gezogen === null) return;
                e.preventDefault();
                setZiel(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (gezogen !== null) aendern(verschieben(plaetze, gezogen, i));
                setGezogen(null);
                setZiel(null);
              }}
              onDragEnd={() => {
                setGezogen(null);
                setZiel(null);
              }}
            >
              <div className="kartenkopf baustein-kopf">
                {anpassen && <Zeichen name="griff" klasse="baustein-griff" />}
                <h2>{titel}</h2>
                {anpassen ? (
                  <div className="baustein-knoepfe">
                    <button
                      type="button"
                      className="mini"
                      disabled={i === 0}
                      aria-label={`${titel} nach oben`}
                      onClick={() => aendern(verschieben(plaetze, i, i - 1))}
                    >
                      <Zeichen name="hoch" />
                    </button>
                    <button
                      type="button"
                      className="mini"
                      disabled={i === plaetze.length - 1}
                      aria-label={`${titel} nach unten`}
                      onClick={() => aendern(verschieben(plaetze, i, i + 1))}
                    >
                      <Zeichen name="runter" />
                    </button>
                    <button
                      type="button"
                      className="mini baustein-breite"
                      aria-pressed={platz.breit}
                      onClick={() => aendern(breiteUmschalten(plaetze, platz.baustein))}
                    >
                      {platz.breit ? "Schmal" : "Breit"}
                    </button>
                    {/* Den letzten nicht: Eine leere Übersicht fiele auf den
                        Vorschlag zurück, und der stünde dann unerwartet da. */}
                    <button
                      type="button"
                      className="mini"
                      disabled={plaetze.length === 1}
                      aria-label={`${titel} entfernen`}
                      onClick={() => aendern(entfernen(plaetze, platz.baustein))}
                    >
                      <Zeichen name="kreuz" />
                    </button>
                  </div>
                ) : (
                  hin && (
                    <a
                      className="baustein-alle"
                      href={alsPfad(hin.seite, hin.unter ?? null)}
                      onClick={(e) => {
                        e.preventDefault();
                        wechseln(hin.seite, hin.unter ?? null);
                      }}
                    >
                      Alle
                      <Zeichen name="zeiger" />
                    </a>
                  )
                )}
              </div>
              <div className="baustein-inhalt">
                <Inhalt ich={ich} wechseln={wechseln} />
              </div>
            </section>
          );
        })}
      </div>

      {/* Anpassen steht unter den Bausteinen und nicht darüber: Es ist der
          seltene Griff, und über allem kostete es jeden Tag eine Zeile, bevor
          der erste Baustein kam. Was beim Anpassen dazukommt, steht gleich
          daneben — dort, wo man gerade hinsieht. */}
      <div className="ue-werkzeug">
        {anpassen && (
          <>
            {ich.uebersicht.eigen && (
              <button type="button" className="knopf-still" onClick={() => aendern([])}>
                Vorschlag wiederherstellen
              </button>
            )}
            <span className="ue-stand" aria-live="polite">
              {speichern.isPending ? "Wird gespeichert …" : speichern.isError ? "Nicht gespeichert" : ""}
            </span>
          </>
        )}
        <button
          type="button"
          className={anpassen ? "knopf" : "knopf-still"}
          aria-pressed={anpassen}
          onClick={() => setAnpassen((a) => !a)}
        >
          {anpassen ? (
            <>
              <Zeichen name="haken" />
              Fertig
            </>
          ) : (
            <>
              <Zeichen name="stift" />
              Anpassen
            </>
          )}
        </button>
      </div>

      {anpassen && fehlende(plaetze).length > 0 && (
        <div className="karte ue-dazu">
          <h2>Dazunehmen</h2>
          <div className="ue-dazu-liste">
            {fehlende(plaetze).map((name) => {
              const eintrag = KATALOG.find((k) => k.name === name)!;
              return (
                <button key={name} type="button" onClick={() => aendern(dazunehmen(plaetze, name))}>
                  <Zeichen name="plus" />
                  <span>
                    <b>{eintrag.titel}</b>
                    <em>{eintrag.wozu}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Buchungen, deren Clock-out fehlte. Kein Baustein, den man wegnehmen kann:
 * Sie zählen in keiner Summe, bis jemand sie bestätigt — wer das übersieht,
 * hat später eine Lücke im Zeitnachweis.
 */
function Entwuerfe({ wechseln }: { wechseln: Wechseln }) {
  const abfrage = useDashboard();
  const offen = abfrage.data?.offene_entwuerfe.length ?? 0;
  if (offen === 0) return null;
  return (
    <div className="karte karte-achtung">
      <h2>Bitte bestätigen</h2>
      <p className="ue-satz">
        {offen === 1 ? "Eine Buchung wurde" : `${offen} Buchungen wurden`} am Tagesende abgeschnitten, weil der
        Clock-out fehlte. {offen === 1 ? "Sie zählt" : "Sie zählen"} in keiner Summe mit, bis du sie bestätigt hast.
      </p>
      <button type="button" className="knopf" onClick={() => wechseln("zeit")}>
        <Zeichen name="zeit" />
        In der Zeitliste ansehen
      </button>
    </div>
  );
}
