import { useEffect, useState } from "react";

import { Beschriftet } from "./Anlegekarte";
import { Fehlerzeile } from "./Fehlerzeile";
import { Hinweis } from "./Hinweis";
import { Loeschdialog } from "./Loeschdialog";
import { Notizfeld } from "./Notizfeld";
import { Zeichen } from "./Zeichen";

export type Verlaufswerte = { art: string; ziel: string; datum: string; titel: string; text: string };

/** Die Wahl „Mit wem" — in Gruppen, damit die Eventseite die Hitlist oben zeigen kann. */
export type Zielgruppe = { titel?: string; auswahl: { wert: string; name: string }[] };

/**
 * Ein Verlaufseintrag in einem Fenster — anlegen und bearbeiten, dasselbe
 * Fenster für Kontakte und Events.
 *
 * **Warum ein Fenster und nicht mehr die Zeile über dem Verlauf:** Dort war
 * das Ergebnis ein einzeiliges Feld. Was bei einem Telefonat herauskommt,
 * sind fünf Punkte, eine Zusage und eine offene Frage — in eine Zeile
 * geschrieben, liest es danach niemand mehr. Hier ist das Notizfeld so groß
 * wie der Text, und Aufzählungen gehen mit einem Knopf (Bernd, 2026-10-21:
 * „das feld ist extrem klein … und man kann es nicht bearbeiten").
 *
 * Gespeichert wird wie im Protokolldialog der Meetings am Stück, nicht beim
 * Tippen: Ein Eintrag wird einmal geschrieben und einmal durchgesehen, und
 * jeder Zwischenstand stünde sonst im Änderungsprotokoll. Deshalb die
 * Nachfrage, wenn jemand mit ungespeichertem Text hinausklickt.
 */
export function Verlaufsdialog({
  ueberschrift,
  anfang,
  arten,
  ziele,
  datumVon,
  datumBis,
  knopf,
  speichern,
  entfernen,
  schliessen,
}: {
  ueberschrift: string;
  anfang: Verlaufswerte;
  /** Fehlt, wo der Ort die Art schon sagt — auf einem Event ist sie „Event". */
  arten?: readonly { wert: string; text: string }[];
  ziele: Zielgruppe[];
  datumVon?: string;
  datumBis?: string;
  /** Was der Knopf sagt — „Eintragen" oder „Speichern". */
  knopf: string;
  /** Wirft sie, bleibt das Fenster offen; `hole` hat den Grund dann schon gemeldet. */
  speichern: (werte: Verlaufswerte) => Promise<void>;
  /** Nur beim Bearbeiten und nur für wen, der löschen darf. */
  entfernen?: () => Promise<void>;
  schliessen: () => void;
}) {
  const [werte, setWerte] = useState(anfang);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fragt, setFragt] = useState<"" | "verwerfen" | "entfernen">("");

  const setzen = (teil: Partial<Verlaufswerte>) => setWerte((alt) => ({ ...alt, ...teil }));
  const geaendert = (Object.keys(anfang) as (keyof Verlaufswerte)[]).some((k) => werte[k] !== anfang[k]);
  const niemand = ziele.every((g) => g.auswahl.length === 0);

  async function sichern() {
    if (niemand)
      return setFehler("Es gibt niemanden, an den der Eintrag gehen könnte — leg zuerst eine Person an.");
    if (!werte.ziel) return setFehler("Wähl aus, mit wem gesprochen wurde.");
    if (!werte.titel.trim())
      return setFehler("Trag ein, worum es ging. Ein Eintrag ohne Anlass hilft in einem halben Jahr niemandem.");
    setFehler("");
    setLaeuft(true);
    try {
      await speichern({ ...werte, titel: werte.titel.trim(), text: werte.text.trim() });
      schliessen();
    } catch {
      // Das Fenster bleibt offen — sonst wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  // Hinausklicken, Abbrechen und Escape gehen denselben Weg: Steht etwas
  // Ungespeichertes da, wird gefragt, sonst schließt es sofort.
  const zurueck = () => (geaendert ? setFragt("verwerfen") : schliessen());

  useEffect(() => {
    const beiTaste = (e: globalThis.KeyboardEvent) => {
      // Die Nachfrage zum Entfernen hört selbst auf Escape.
      if (e.key !== "Escape" || fragt === "entfernen") return;
      if (fragt === "verwerfen") setFragt("");
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  });

  return (
    <>
      <div className="dialog-grund" role="dialog" aria-modal="true" aria-label={ueberschrift} onClick={zurueck}>
        <div className="dialog dialog-arbeit verlaufsdialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>{ueberschrift}</h2>
              {geaendert && <span className="dialog-offen">Noch nicht gespeichert</span>}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button type="button" className="knopf" onClick={sichern} disabled={laeuft}>
                {knopf}
              </button>
            </div>
          </div>

          <div className="dialog-koerper verlaufsdialog-koerper">
            {arten && (
              <div className="spannenwahl verlauf-arten" role="group" aria-label="Art">
                {arten.map((a) => (
                  <button
                    key={a.wert}
                    type="button"
                    aria-pressed={werte.art === a.wert}
                    onClick={() => setzen({ art: a.wert })}
                  >
                    {a.text}
                  </button>
                ))}
              </div>
            )}

            <div className="verlauf-felder">
              <Beschriftet text="Mit wem">
                <select className="feld" value={werte.ziel} onChange={(e) => setzen({ ziel: e.target.value })}>
                  {!werte.ziel && <option value="">Bitte wählen …</option>}
                  {ziele.map((g, i) =>
                    g.auswahl.length === 0 ? null : g.titel ? (
                      <optgroup key={i} label={g.titel}>
                        {g.auswahl.map((a) => (
                          <option key={a.wert} value={a.wert}>
                            {a.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      g.auswahl.map((a) => (
                        <option key={a.wert} value={a.wert}>
                          {a.name}
                        </option>
                      ))
                    ),
                  )}
                </select>
              </Beschriftet>
              <Beschriftet text="Tag" art="tag">
                <input
                  type="date"
                  className="feld"
                  value={werte.datum}
                  min={datumVon}
                  max={datumBis}
                  onChange={(e) => setzen({ datum: e.target.value })}
                />
              </Beschriftet>
            </div>

            <Beschriftet text="Worum ging es?">
              <input
                className="feld"
                autoFocus
                value={werte.titel}
                onChange={(e) => setzen({ titel: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sichern();
                }}
              />
            </Beschriftet>

            <div className="feldblock">
              <span className="verlauf-notiz-kopf">
                <label className="beschriftung-klein" htmlFor="verlauf-notiz">
                  Notizen
                </label>
                <Hinweis
                  worum="Notizen"
                  text="Enter setzt eine Aufzählung fort, Enter in einem leeren Punkt beendet sie. ⌘↵ speichert."
                />
              </span>
              <Notizfeld
                id="verlauf-notiz"
                wert={werte.text}
                setzen={(text) => setzen({ text })}
                platzhalter="Was besprochen wurde, Zusagen, nächster Schritt, offene Fragen …"
                speichern={sichern}
              />
            </div>

            <Fehlerzeile text={fehler} />

            {entfernen && (
              <div className="verlauf-entfernen">
                <button type="button" className="knopf-still" onClick={() => setFragt("entfernen")}>
                  <Zeichen name="korb" />
                  Eintrag entfernen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {fragt === "verwerfen" && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>Der Eintrag ist geändert und noch nicht gespeichert. Wer jetzt schließt, verliert, was er geschrieben hat.</p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragt("")}>
                Weiter schreiben
              </button>
              <button type="button" className="knopf-still" onClick={schliessen}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => {
                  setFragt("");
                  sichern();
                }}
              >
                {knopf}
              </button>
            </div>
          </div>
        </div>
      )}

      {fragt === "entfernen" && entfernen && (
        <Loeschdialog
          name={anfang.titel}
          was="Der Eintrag"
          folgen="Er bleibt im Änderungsprotokoll, und ein Admin kann ihn zurückholen."
          laeuft={laeuft}
          abbrechen={() => setFragt("")}
          loeschen={async () => {
            setLaeuft(true);
            try {
              await entfernen();
              schliessen();
            } catch {
              setLaeuft(false);
            }
          }}
        />
      )}
    </>
  );
}
