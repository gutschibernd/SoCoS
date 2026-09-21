/**
 * Module: zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben.
 *
 * `/module` ist die Übersicht aller Module, `/module/spg` die SPG Academy.
 *
 * **Die Leinwand ist das Ergebnis, nicht die Werkstatt.** Auf ihr steht, was
 * im Workshop herausgekommen ist — Stichpunkte je Feld. Bearbeitet wird ein
 * Feld im Fenster; die Leinwand selbst bleibt dabei ruhig und lesbar, auch
 * für einen Leser, der gar nichts ändern darf.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { hole } from "../basis/api";
import {
  useCanvasfelder,
  useNeuLaden,
  useVorhaben,
  type Canvasfeld,
  type Ich,
  type Vorhaben,
} from "../basis/daten";
import { melden } from "../basis/meldungen";
import {
  MODULE,
  alsEntwuerfe,
  ausgefuellt,
  istGeaendert,
  neuerSchluessel,
  punkteIn,
  zuletztText,
  zumSenden,
  type Punktentwurf,
} from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

export function Module({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: Wechseln;
}) {
  if (unter === "spg") return <SpgAcademy ich={ich} />;
  return <Uebersicht wechseln={wechseln} />;
}

/* --- Die Übersicht -------------------------------------------------------- */

function Uebersicht({ wechseln }: { wechseln: Wechseln }) {
  // Die Übersicht wartet nicht auf die Vorhaben: Die Kacheln stehen sofort,
  // nur der Stand darin kommt nach. Eine Seite mit einem Werkzeug darf nicht
  // „Wird geladen …" sagen, bloß weil eine Zahl fehlt.
  const vorhaben = useVorhaben();
  const eines = vorhaben.data?.[0] ?? null;

  return (
    <div className="modul-kacheln">
      {MODULE.map((m) => (
        <a
          key={m.weg}
          className="modul-kachel"
          href={`/module/${m.weg}`}
          onClick={(e) => {
            e.preventDefault();
            wechseln("module", m.weg);
          }}
        >
          <div className="modul-kopf">
            <i className="modul-siegel">
              <Zeichen name={m.zeichen} />
            </i>
            <span>
              <b>{m.titel}</b>
              <em>{m.wozu}</em>
            </span>
          </div>
          <ul className="modul-teile">
            {m.teile.map((teil, i) => (
              <li key={teil}>
                <span className="zahl">{String(i + 1).padStart(2, "0")}</span>
                {teil}
                <span className="modul-stand">
                  {eines ? `${ausgefuellt(eines)} / 9 Felder` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="modul-fuss">
            <span>{eines ? `zuletzt ${zuletztText(eines.zuletzt)}` : ""}</span>
            <span className="modul-oeffnen">
              Öffnen
              <Zeichen name="zeiger" />
            </span>
          </div>
        </a>
      ))}

      {/* Neue Module entstehen im Code, nicht in der Oberfläche. Die Kachel
          sagt, wo man eines bestellt — sonst steht neben einem einzigen
          Werkzeug eine leere Fläche, die nach einem Fehler aussieht. */}
      <div className="modul-wunsch">
        <b>Fehlt ein Werkzeug?</b>
        <p>Neue Module entstehen auf Zuruf.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("rueckmeldungen")}>
          Unter Wünsche &amp; Fehler melden
        </button>
      </div>
    </div>
  );
}

/* --- SPG Academy ---------------------------------------------------------- */

/**
 * Die Leinwand des einen Vorhabens.
 *
 * **Es gibt genau ein Vorhaben** — „Sopharmis Arzneimittelspender", angelegt
 * von der Migration 0022. Die Seite wählt deshalb nichts aus, sie zeigt es.
 * Das Modell bleibt trotzdem getrennt von den Punkten: Kommt je ein zweites
 * Vorhaben, ist es eine Auswahl in der Oberfläche und kein Umbau der Daten.
 */
function SpgAcademy({ ich }: { ich: Ich }) {
  const vorhaben = useVorhaben();
  const felder = useCanvasfelder();
  const [offenesFeld, setOffenesFeld] = useState<string | null>(null);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!vorhaben.data) return <Zustand abfrage={vorhaben} erneut={() => vorhaben.refetch()} />;
  if (!felder.data) return <Zustand abfrage={felder} erneut={() => felder.refetch()} />;

  const eines = vorhaben.data[0] ?? null;

  // Fehlt es — weil es jemand am Server entfernt hat —, steht die Leinwand
  // trotzdem da, mit allen Fragen, nur ohne Stift. Wiederherstellen kann es
  // ein Admin; aus der Oberfläche heraus legt niemand ein zweites an.
  if (!eines) {
    return (
      <div className="spalte">
        <div className="vorhabenleiste">
          <div className="vorhaben-kopf">
            <b>Das Vorhaben fehlt</b>
            <span>Es wurde entfernt. Ein Admin kann es wiederherstellen.</span>
          </div>
        </div>
        <Leinwand
          vorhaben={{ id: 0, titel: "", punkte: [], zuletzt: "" }}
          felder={felder.data}
          oeffnen={null}
        />
      </div>
    );
  }

  const zahl = ausgefuellt(eines);

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{eines.titel}</b>
          <span className="vorhaben-stand">
            <span>
              <b className="zahl">
                {zahl} / {felder.data.length}
              </b>{" "}
              Felder
            </span>
            <span className="balken" aria-hidden="true">
              <i style={{ width: `${(zahl / felder.data.length) * 100}%` }} />
            </span>
            <span className="vorhaben-zuletzt">zuletzt {zuletztText(eines.zuletzt)}</span>
          </span>
        </div>
        <div className="vorhaben-aktionen">
          {/* Ein Link und kein fetch: Das PDF soll im Download-Ordner landen,
              und genau das tut der Browser mit einem `attachment` von selbst. */}
          <a className="knopf-still" href={`/api/vorhaben/${eines.id}/pdf/`}>
            <Zeichen name="pdf" />
            PDF
          </a>
        </div>
      </div>

      <Leinwand
        vorhaben={eines}
        felder={felder.data}
        oeffnen={ich.darf.bearbeiten ? setOffenesFeld : null}
      />

      {offenesFeld && (
        <Feldfenster
          // Ein neuer Schlüssel je Feld: Beim Weiterblättern beginnt das
          // Fenster mit den Punkten des nächsten Feldes, statt die des
          // vorigen im Zustand festzuhalten.
          key={offenesFeld}
          vorhaben={eines}
          felder={felder.data}
          feld={offenesFeld}
          oeffnen={setOffenesFeld}
        />
      )}
    </div>
  );
}

/* --- Die Leinwand --------------------------------------------------------- */

/**
 * Die neun Felder in der klassischen Anordnung — wo welches steht, sagt
 * `bausteine.css` über `data-feld`, nicht diese Liste. Die Nummern kommen vom
 * Server und folgen der Reihenfolge der SPG Academy.
 *
 * Wer bearbeiten darf, trifft das ganze Feld: Der Knopf sitzt auf der
 * Überschrift und spannt sich über den Kasten. Ein Knopf *um* das Feld herum
 * ginge nicht — darin stünden eine Überschrift und eine Liste, und das darf
 * in einem Knopf nicht stehen.
 */
function Leinwand({
  vorhaben,
  felder,
  oeffnen,
}: {
  vorhaben: Vorhaben;
  felder: Canvasfeld[];
  oeffnen: ((feld: string) => void) | null;
}) {
  return (
    <div className="leinwand">
      {felder.map((f) => {
        const punkte = punkteIn(vorhaben, f.feld);
        return (
          <section
            key={f.feld}
            className="leinwand-feld"
            data-feld={f.feld}
            data-leer={punkte.length ? "nein" : "ja"}
          >
            <h3 className="leinwand-kopf">
              <span className="leinwand-nummer">{f.nummer}</span>
              {oeffnen ? (
                <button type="button" className="leinwand-griff" onClick={() => oeffnen(f.feld)}>
                  {f.titel}
                </button>
              ) : (
                f.titel
              )}
              {oeffnen && <Zeichen name="stift" klasse="leinwand-stift" />}
            </h3>
            {punkte.length > 0 ? (
              <ul className="leinwand-punkte">
                {punkte.map((p) => (
                  <li key={p.id}>{p.text}</li>
                ))}
              </ul>
            ) : (
              <ul className="leinwand-fragen">
                {f.leitfragen.map((frage) => (
                  <li key={frage}>{frage}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* --- Ein Feld bearbeiten -------------------------------------------------- */

/**
 * Das Fenster zu einem Feld: oben die Leitfragen, darunter die Punkte als
 * Liste von Zeilen.
 *
 * Getippt wird wie in einer Aufzählung: **Enter** beginnt den nächsten Punkt,
 * **Rückschritt** in einer leeren Zeile nimmt sie weg. Umschalt+Enter bricht
 * innerhalb eines Punktes um. Gespeichert wird erst mit „Speichern" oder beim
 * Weiterblättern — nicht beim Tippen: Jede Pause schriebe sonst einen Eintrag
 * ins Änderungsprotokoll, und das soll lesbar bleiben.
 */
function Feldfenster({
  vorhaben,
  felder,
  feld,
  oeffnen,
}: {
  vorhaben: Vorhaben;
  felder: Canvasfeld[];
  feld: string;
  oeffnen: (feld: string | null) => void;
}) {
  const neuLaden = useNeuLaden();
  const gespeichert = punkteIn(vorhaben, feld);
  const [entwuerfe, setEntwuerfe] = useState<Punktentwurf[]>(() => alsEntwuerfe(gespeichert));
  const [laeuft, setLaeuft] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const zeilen = useRef(new Map<string, HTMLTextAreaElement>());
  const fokus = useRef<{ schluessel: string; ende: boolean } | null>({
    schluessel: entwuerfe[entwuerfe.length - 1].schluessel,
    ende: true,
  });

  const stelle = felder.findIndex((f) => f.feld === feld);
  const dieses = felder[stelle];
  const vorher = felder[stelle - 1] ?? null;
  const nachher = felder[stelle + 1] ?? null;
  const geaendert = istGeaendert(gespeichert, entwuerfe);

  // Nach jedem Einfügen oder Entfernen die richtige Zeile in den Fokus — erst
  // nach dem Zeichnen, vorher gibt es die neue Zeile noch nicht.
  useLayoutEffect(() => {
    const ziel = fokus.current;
    if (!ziel) return;
    const zeile = zeilen.current.get(ziel.schluessel);
    if (!zeile) return;
    zeile.focus();
    const ort = ziel.ende ? zeile.value.length : 0;
    zeile.setSelectionRange(ort, ort);
    fokus.current = null;
  });

  function setzen(schluessel: string, text: string) {
    setEntwuerfe((alt) => alt.map((e) => (e.schluessel === schluessel ? { ...e, text } : e)));
  }

  function einfuegenNach(stelleNeu: number) {
    const neu = { schluessel: neuerSchluessel(), id: null, text: "" };
    setEntwuerfe((alt) => [...alt.slice(0, stelleNeu + 1), neu, ...alt.slice(stelleNeu + 1)]);
    fokus.current = { schluessel: neu.schluessel, ende: true };
  }

  function entfernen(i: number) {
    setEntwuerfe((alt) => {
      if (alt.length === 1) {
        // Die letzte Zeile bleibt als leere stehen — ein Feld ohne jede Zeile
        // hätte keinen Ort mehr, an dem man zu tippen beginnt.
        fokus.current = { schluessel: alt[0].schluessel, ende: true };
        return [{ ...alt[0], id: null, text: "" }];
      }
      const rest = alt.filter((_, j) => j !== i);
      fokus.current = { schluessel: rest[Math.max(0, i - 1)].schluessel, ende: true };
      return rest;
    });
  }

  function verschieben(i: number, um: -1 | 1) {
    const ziel = i + um;
    if (ziel < 0 || ziel >= entwuerfe.length) return;
    setEntwuerfe((alt) => {
      const neu = [...alt];
      [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
      return neu;
    });
    fokus.current = { schluessel: entwuerfe[i].schluessel, ende: true };
  }

  function beiTaste(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      einfuegenNach(i);
    } else if (e.key === "Backspace" && entwuerfe[i].text === "" && entwuerfe.length > 1) {
      e.preventDefault();
      entfernen(i);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      verschieben(i, e.key === "ArrowUp" ? -1 : 1);
    }
  }

  /** Speichert, wenn etwas offen ist, und geht dann zu `weiter` (null = schließen). */
  async function speichernUnd(weiter: string | null) {
    if (!geaendert) return oeffnen(weiter);
    setLaeuft(true);
    try {
      await hole(`/vorhaben/${vorhaben.id}/feld/`, {
        method: "POST",
        body: JSON.stringify({ feld, punkte: zumSenden(entwuerfe) }),
      });
      neuLaden();
      melden("gut", `„${dieses.titel}“ ist gespeichert.`);
      oeffnen(weiter);
    } catch {
      // `hole` hat den Grund schon gemeldet. Das Fenster bleibt offen — sonst
      // wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  // Hinausklicken, Abbrechen und Escape gehen denselben Weg: Steht etwas
  // Ungespeichertes da, wird gefragt, sonst schließt es sofort.
  const zurueck = () => (geaendert ? setFragtVerwerfen(true) : oeffnen(null));

  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fragtVerwerfen) setFragtVerwerfen(false);
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });

  return (
    <>
      <div
        className="dialog-grund"
        role="dialog"
        aria-modal="true"
        aria-label={dieses.titel}
        onClick={zurueck}
      >
        <div className="dialog dialog-arbeit feldfenster" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>
                <span className="leinwand-nummer">{dieses.nummer}</span>
                {dieses.titel}
              </h2>
              {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button
                type="button"
                className="knopf"
                onClick={() => speichernUnd(null)}
                disabled={laeuft || !geaendert}
              >
                Speichern
              </button>
            </div>
          </div>

          <div className="dialog-koerper">
            {/* Erst, wie das Ergebnis aussehen soll, dann, worüber man
                nachdenkt. Die Aufgabe steht über den Fragen, weil sie das
                Maß ist, an dem man die Punkte am Ende misst. */}
            {dieses.aufgabe.length > 0 && (
              <div className="feld-aufgabe">
                <span className="beschriftung-klein">Aufgabe</span>
                <ul>
                  {dieses.aufgabe.map((satz) => (
                    <li key={satz}>{satz}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="feld-leitfragen">
              {dieses.leitfragen.map((frage) => (
                <li key={frage}>{frage}</li>
              ))}
            </ul>

            <ol className="punkt-liste">
              {entwuerfe.map((e, i) => (
                <li key={e.schluessel} className="punkt-zeile">
                  <Wachsfeld
                    wert={e.text}
                    platzhalter={i === 0 ? "Erster Punkt …" : "Nächster Punkt …"}
                    beschriftung={`Punkt ${i + 1}`}
                    festhalten={(el) => {
                      if (el) zeilen.current.set(e.schluessel, el);
                      else zeilen.current.delete(e.schluessel);
                    }}
                    aendern={(text) => setzen(e.schluessel, text)}
                    taste={(ev) => beiTaste(ev, i)}
                  />
                  <span className="punkt-griffe">
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Nach oben"
                      title="Nach oben (Alt+↑)"
                      disabled={i === 0}
                      onClick={() => verschieben(i, -1)}
                    >
                      <Zeichen name="hoch" />
                    </button>
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Nach unten"
                      title="Nach unten (Alt+↓)"
                      disabled={i === entwuerfe.length - 1}
                      onClick={() => verschieben(i, 1)}
                    >
                      <Zeichen name="runter" />
                    </button>
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Punkt streichen"
                      title="Punkt streichen"
                      onClick={() => entfernen(i)}
                    >
                      <Zeichen name="kreuz" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="knopf-still punkt-neu"
              onClick={() => einfuegenNach(entwuerfe.length - 1)}
            >
              <Zeichen name="plus" />
              Punkt
            </button>

            {/* Weiterblättern speichert, was offen ist. Wer die neun Felder
                der Reihe nach durchgeht, soll nicht vor jedem Feld „Speichern"
                drücken müssen — und nicht bei jedem gefragt werden. */}
            <div className="feld-blaettern">
              {vorher ? (
                <button
                  type="button"
                  className="knopf-still"
                  disabled={laeuft}
                  onClick={() => speichernUnd(vorher.feld)}
                >
                  <Zeichen name="zeiger" klasse="zeiger-zurueck" />
                  {vorher.nummer} {vorher.titel}
                </button>
              ) : (
                <span />
              )}
              {nachher && (
                <button
                  type="button"
                  className="knopf-still"
                  disabled={laeuft}
                  onClick={() => speichernUnd(nachher.feld)}
                >
                  {nachher.nummer} {nachher.titel}
                  <Zeichen name="zeiger" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>
              An „{dieses.titel}“ ist etwas geändert und noch nicht gespeichert. Wer jetzt schließt,
              hat wieder den Stand von vorher.
            </p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(false)}>
                Weiter bearbeiten
              </button>
              <button type="button" className="knopf-still" onClick={() => oeffnen(null)}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => {
                  setFragtVerwerfen(false);
                  speichernUnd(null);
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Ein Textfeld, das mit seinem Inhalt wächst. Ein Punkt ist meist eine Zeile,
 * manchmal drei — ein festes Maß wäre für das eine zu groß und für das andere
 * zu klein, und ein Rollbalken in einem Stichpunkt versteckt genau den Teil,
 * den man gerade umschreibt.
 *
 * Die Höhe wird gesetzt und nicht über `field-sizing: content` erledigt:
 * Das kann Safari auf den Geräten, die hier im Einsatz sind, noch nicht.
 */
function Wachsfeld({
  wert,
  platzhalter,
  beschriftung,
  festhalten,
  aendern,
  taste,
}: {
  wert: string;
  platzhalter: string;
  beschriftung: string;
  festhalten: (el: HTMLTextAreaElement | null) => void;
  aendern: (text: string) => void;
  taste: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [wert]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        festhalten(el);
      }}
      className="feld punkt-eingabe"
      rows={1}
      value={wert}
      placeholder={platzhalter}
      aria-label={beschriftung}
      onChange={(e) => aendern(e.target.value)}
      onKeyDown={taste}
    />
  );
}
