import { useEffect, useRef, useState } from "react";

import { Zeichen } from "./Zeichen";

/**
 * Die Firmendaten zum Kopieren — Rechnungsadresse, UID, Steuernummer, IBAN,
 * Anschrift, Firmenbuch.
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
  zeilen: { was: string; wert: string; kopie?: string }[];
  /** Die Gruppe am Stück, wie sie in einem Brief steht. */
  ganz?: { was: string; wert: string };
};

export type Sprache = "de" | "en";

const FIRMA = "Sopharmis Medical Solutions FlexCo";
const STRASSE = "Hermann-Findenegg Weg 7";
const ORT = "9500 Villach";
const UID = "ATU83918619";
const FN = "FN 690473 b";
/**
 * Angezeigt in Vierergruppen, wie sie auf Papier gelesen wird; kopiert ohne
 * Leerzeichen, weil manche Bankformulare die Lücken als ungültig abweisen —
 * keines weist die IBAN ohne sie ab.
 */
const IBAN = "AT41 2081 5000 4769 4104";

/**
 * Was sich je Sprache ändert. Firma, Straße, Nummern bleiben, wie sie sind —
 * ein Name wird nicht übersetzt. Die Bezeichnungen im Fenster bleiben
 * deutsch: Übersetzt wird, was hinausgeht, nicht, was man liest.
 */
const TEXTE = {
  de: {
    land: "Österreich",
    gericht: "Landesgericht Klagenfurt",
    uid: "UID",
    einleitung: "Unsere Rechnungsadresse lautet:",
    versand: "Versand bitte an:",
  },
  en: {
    land: "Austria",
    gericht: "Regional Court Klagenfurt",
    uid: "VAT ID",
    einleitung: "Our billing address is:",
    versand: "Please ship to:",
  },
} as const;

/**
 * Die Versandadresse — **die Ausnahme von der Regel, dass Personendaten nicht
 * ins Repository gehören** (CLAUDE.md, Daten). Bernd, 2026-11-16: Sie steht
 * hier, weil eine Ablage in der Datenbank samt Migration, Sicherung und
 * Protokoll für eine einzige Anschrift mehr kostet, als sie schützt.
 */
const VERSAND = { name: "Bernd Gutschi", strasse: "Antoniensteig 5a", ort: "9500 Villach" };

export function firmendaten(sprache: Sprache): Firmengruppe[] {
  const t = TEXTE[sprache];
  return [
    {
      titel: "Steuer",
      zeilen: [
        { was: "UID-Nummer", wert: UID },
        { was: "Steuernummer", wert: "613397991" },
        { was: "IBAN", wert: IBAN, kopie: IBAN.replace(/\s/g, "") },
      ],
    },
    {
      titel: "Anschrift",
      zeilen: [
        { was: "Firma", wert: FIRMA },
        { was: "Straße", wert: STRASSE },
        { was: "PLZ und Ort", wert: ORT },
        { was: "Land", wert: t.land },
      ],
      ganz: { was: "Ganze Anschrift", wert: [FIRMA, STRASSE, `${ORT}, ${t.land}`].join("\n") },
    },
    {
      titel: "Firmenbuch",
      zeilen: [
        { was: "Firmenbuchnummer", wert: FN },
        { was: "Firmenbuchgericht", wert: t.gericht },
      ],
      ganz: { was: "Ganze Zeile", wert: `${FN}, ${t.gericht}` },
    },
  ];
}

export type Wahl = { einleitung: boolean; versand: boolean };

/**
 * Die Rechnungsadresse, wie ein Lieferant sie braucht: Firma, Anschrift und
 * UID. Die UID des Empfängers muss auf jeder Rechnung über 10.000 € brutto
 * und bei jeder Reverse-Charge-Rechnung aus dem EU-Ausland stehen, sonst ist
 * sie nicht vorsteuerabzugsfähig — sie gleich mitzuschicken erspart die
 * Korrekturrechnung. Firmenbuch und Steuernummer verlangt auf einer
 * Eingangsrechnung niemand.
 *
 * Die Versandadresse trägt ihre Zeile „Versand bitte an:" auch ohne
 * Einleitung: Zwei Anschriften untereinander ohne Wort dazwischen liest ein
 * Lieferant als eine.
 */
export function rechnungsadresse({ einleitung, versand }: Wahl, sprache: Sprache) {
  const t = TEXTE[sprache];
  const rechnung = [FIRMA, STRASSE, `${ORT}, ${t.land}`, `${t.uid}: ${UID}`];
  if (einleitung) rechnung.unshift(t.einleitung);
  if (!versand) return rechnung.join("\n");
  const lieferung = [t.versand, VERSAND.name, VERSAND.strasse, VERSAND.ort, t.land];
  return `${rechnung.join("\n")}\n\n${lieferung.join("\n")}`;
}

type Stand = { schluessel: string; gut: boolean } | null;

export function Firmendaten({ schliessen }: { schliessen: () => void }) {
  const [stand, setStand] = useState<Stand>(null);
  // Alles aus und deutsch, wenn das Fenster aufgeht: Meist wandert die
  // Adresse in ein Feld, und dort stört jede Zeile zu viel.
  const [wahl, setWahl] = useState<Wahl>({ einleitung: false, versand: false });
  const [sprache, setSprache] = useState<Sprache>("de");
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
  const standVon = (schluessel: string) =>
    rueckmeldung(schluessel) ? (stand?.gut ? "gut" : "fehler") : undefined;
  const haken = (name: keyof Wahl, text: string) => (
    <label className="fi-haken">
      <input type="checkbox" checked={wahl[name]} onChange={(e) => setWahl({ ...wahl, [name]: e.target.checked })} />
      {text}
    </label>
  );
  const adresse = rechnungsadresse(wahl, sprache);

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-labelledby="firmendaten-titel" onClick={schliessen}>
      <div className="dialog dialog-arbeit firmendaten" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-kopf fi-kopf">
          <h2 id="firmendaten-titel">Firmendaten</h2>
          {/* Die Sprache gilt für alles, was kopiert wird — darum steht sie im
              Kopf über allen Gruppen und nicht an der Rechnungsadresse. */}
          <div className="fi-sprache" role="radiogroup" aria-label="Sprache der kopierten Texte">
            {(["de", "en"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sprache === s} onClick={() => setSprache(s)}>
                {s === "de" ? "Deutsch" : "English"}
              </button>
            ))}
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
            </div>
            <div className="fi-haken-reihe">
              {haken("einleitung", "Einleitung")}
              {haken("versand", "Versandadresse")}
            </div>
            <button
              type="button"
              className="fi-zeile fi-block"
              data-stand={standVon("rechnung")}
              aria-label="Rechnungsadresse kopieren"
              onClick={() => kopieren("rechnung", adresse)}
            >
              {/* Was hier steht, ist genau das, was kopiert wird — auch der
                  Satz davor und die Versandadresse, sobald ihr Haken sitzt. */}
              <span className="fi-wert">{adresse}</span>
              <span className="fi-tun" aria-live="polite">
                {rueckmeldung("rechnung") && <span className="fi-meldung">{rueckmeldung("rechnung")}</span>}
                <Zeichen name={rueckmeldung("rechnung") && stand?.gut ? "haken" : "kopie"} />
              </span>
            </button>
          </section>
          {firmendaten(sprache).map((gruppe) => (
            <section key={gruppe.titel} className="fi-gruppe">
              <div className="fi-gruppenkopf">
                <h3>{gruppe.titel}</h3>
                {gruppe.ganz && (
                  <button
                    type="button"
                    className="mini fi-ganz"
                    data-stand={standVon(gruppe.titel)}
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
                    data-stand={standVon(schluessel)}
                    aria-label={`${z.was} kopieren: ${z.wert}`}
                    onClick={() => kopieren(schluessel, z.kopie ?? z.wert)}
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
