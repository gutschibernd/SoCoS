import { useEffect, useRef, useState } from "react";

import { Zeichen } from "./Zeichen";

/**
 * Die Firmendaten zum Kopieren — UID, Steuernummer, Anschrift, Firmenbuch.
 *
 * Nur, was ohnehin öffentlich ist und auf jedem Briefkopf steht. Darum steht
 * es hier im Code und nicht in `daten/` oder in der Datenbank: Es ändert sich
 * vielleicht einmal in Jahren, und dann ist das eine Zeile in einem Commit —
 * eine Einstellungsseite dafür wäre ein Formular für einen Fall, der nie kommt.
 *
 * Jede Zeile kopiert **einen** Wert, so wie ihn ein Formularfeld will. Wer die
 * ganze Anschrift oder die Firmenbuchzeile am Stück braucht (Mail, Brief),
 * nimmt den Knopf an der Gruppe.
 */
export type Firmengruppe = {
  titel: string;
  zeilen: { was: string; wert: string }[];
  /** Die Gruppe am Stück, wie sie in einem Brief steht. */
  ganz?: { was: string; wert: string };
};

const FIRMA = "Sopharmis Medical Solutions FlexCo";
const STRASSE = "Hermann-Findenegg Weg 7";
const ORT = "9500 Villach";
const LAND = "Österreich";
const FN = "FN 690473 b";
const GERICHT = "Landesgericht Klagenfurt";

export const FIRMENDATEN: Firmengruppe[] = [
  {
    titel: "Steuer",
    zeilen: [
      { was: "UID-Nummer", wert: "ATU83918619" },
      { was: "Steuernummer", wert: "613397991" },
    ],
  },
  {
    titel: "Anschrift",
    zeilen: [
      { was: "Firma", wert: FIRMA },
      { was: "Straße", wert: STRASSE },
      { was: "PLZ und Ort", wert: ORT },
      { was: "Land", wert: LAND },
    ],
    ganz: { was: "Ganze Anschrift", wert: [FIRMA, STRASSE, `${ORT}, ${LAND}`].join("\n") },
  },
  {
    titel: "Firmenbuch",
    zeilen: [
      { was: "Firmenbuchnummer", wert: FN },
      { was: "Firmenbuchgericht", wert: GERICHT },
    ],
    ganz: { was: "Ganze Zeile", wert: `${FN}, ${GERICHT}` },
  },
];

/**
 * Die Rechnungsadresse, wie ein Lieferant sie braucht: Firma, Anschrift und
 * UID. Die UID des Empfängers muss auf jeder Rechnung über 10.000 € brutto
 * und bei jeder Reverse-Charge-Rechnung aus dem EU-Ausland stehen, sonst ist
 * sie nicht vorsteuerabzugsfähig — sie gleich mitzuschicken erspart die
 * Korrekturrechnung. Firmenbuch und Steuernummer verlangt auf einer
 * Eingangsrechnung niemand.
 */
export const RECHNUNGSADRESSE = [FIRMA, STRASSE, `${ORT}, ${LAND}`, "UID: ATU83918619"].join("\n");
export const EINLEITUNG = "Unsere Rechnungsadresse lautet:";

/** Mit Einleitung für eine Mail; ohne für ein Formularfeld. */
export function rechnungsadresse(mitEinleitung: boolean) {
  return mitEinleitung ? `${EINLEITUNG}\n\n${RECHNUNGSADRESSE}` : RECHNUNGSADRESSE;
}

type Stand = { schluessel: string; gut: boolean } | null;

export function Firmendaten({ schliessen }: { schliessen: () => void }) {
  const [stand, setStand] = useState<Stand>(null);
  // Aus, wenn das Fenster aufgeht: Meist wandert die Adresse in ein Feld,
  // und dort stört der Satz davor.
  const [einleitung, setEinleitung] = useState(false);
  const zu = useRef(schliessen);
  zu.current = schliessen;
  const zurueck = useRef<number>();

  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && zu.current();
    window.addEventListener("keydown", taste);
    return () => {
      window.removeEventListener("keydown", taste);
      window.clearTimeout(zurueck.current);
    };
  }, []);

  // Die Rückmeldung steht an der Zeile selbst und nicht als Meldung am Rand:
  // Die läge unter dem abgedunkelten Grund, und man sähe nicht, *was* kopiert
  // wurde — bei zwei Neunstellern untereinander ist genau das die Frage.
  async function kopieren(schluessel: string, wert: string) {
    let gut = true;
    try {
      await navigator.clipboard.writeText(wert);
    } catch {
      // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Der Wert
      // steht daneben und lässt sich von Hand markieren.
      gut = false;
    }
    setStand({ schluessel, gut });
    window.clearTimeout(zurueck.current);
    zurueck.current = window.setTimeout(() => setStand(null), 1800);
  }

  const rueckmeldung = (schluessel: string) =>
    stand?.schluessel === schluessel ? (stand.gut ? "Kopiert" : "Bitte markieren") : null;

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-labelledby="firmendaten-titel" onClick={schliessen}>
      <div className="dialog dialog-arbeit firmendaten" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-kopf">
          <div className="dialog-kopf-text">
            <h2 id="firmendaten-titel">Firmendaten</h2>
          </div>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf-still" onClick={schliessen} autoFocus>
              Schließen
            </button>
          </div>
        </div>
        <div className="dialog-koerper">
          <section className="fi-gruppe">
            <div className="fi-gruppenkopf">
              <h3>Rechnungsadresse</h3>
              <label className="fi-einleitung">
                <input type="checkbox" checked={einleitung} onChange={(e) => setEinleitung(e.target.checked)} />
                Einleitung
              </label>
            </div>
            <button
              type="button"
              className="fi-zeile fi-block"
              data-stand={rueckmeldung("rechnung") ? (stand?.gut ? "gut" : "fehler") : undefined}
              aria-label="Rechnungsadresse kopieren"
              onClick={() => kopieren("rechnung", rechnungsadresse(einleitung))}
            >
              {/* Was hier steht, ist genau das, was kopiert wird — auch der
                  Satz davor, sobald der Haken sitzt. */}
              <span className="fi-wert">{rechnungsadresse(einleitung)}</span>
              <span className="fi-tun" aria-live="polite">
                {rueckmeldung("rechnung") && <span className="fi-meldung">{rueckmeldung("rechnung")}</span>}
                <Zeichen name={rueckmeldung("rechnung") && stand?.gut ? "haken" : "kopie"} />
              </span>
            </button>
          </section>
          {FIRMENDATEN.map((gruppe) => (
            <section key={gruppe.titel} className="fi-gruppe">
              <div className="fi-gruppenkopf">
                <h3>{gruppe.titel}</h3>
                {gruppe.ganz && (
                  <button
                    type="button"
                    className="mini fi-ganz"
                    data-stand={rueckmeldung(gruppe.titel) ? (stand?.gut ? "gut" : "fehler") : undefined}
                    onClick={() => kopieren(gruppe.titel, gruppe.ganz!.wert)}
                  >
                    <Zeichen name={rueckmeldung(gruppe.titel) && stand?.gut ? "haken" : "kopie"} />
                    {rueckmeldung(gruppe.titel) ?? gruppe.ganz.was}
                  </button>
                )}
              </div>
              {gruppe.zeilen.map((z) => {
                const schluessel = `${gruppe.titel}/${z.was}`;
                const meldung = rueckmeldung(schluessel);
                return (
                  <button
                    key={z.was}
                    type="button"
                    className="fi-zeile"
                    data-stand={meldung ? (stand?.gut ? "gut" : "fehler") : undefined}
                    aria-label={`${z.was} kopieren: ${z.wert}`}
                    onClick={() => kopieren(schluessel, z.wert)}
                  >
                    <span className="fi-was">{z.was}</span>
                    <span className="fi-wert">{z.wert}</span>
                    <span className="fi-tun" aria-live="polite">
                      {meldung && <span className="fi-meldung">{meldung}</span>}
                      <Zeichen name={meldung && stand?.gut ? "haken" : "kopie"} />
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
