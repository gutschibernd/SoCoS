import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden } from "../basis/daten";
import { Hilfe } from "./Hilfe";

/**
 * Kontostand, Fixkosten und Monatskosten eintragen — nur für den Admin.
 *
 * Steht auf dem Dashboard und nicht auf einer eigenen Seite: Es ist eine
 * Monatsaufgabe von zwei Minuten. Eine eigene Seite dafür würde einmal im
 * Monat aufgesucht und den Rest der Zeit im Menü Platz wegnehmen.
 */
const HEUTE = () => new Date().toISOString().slice(0, 10);
const MONAT = () => new Date().toISOString().slice(0, 7);

type Art = "kontostand" | "fixkosten" | "monatskosten";

const ARTEN: { art: Art; titel: string; pfad: string; datumsfeld: string; typ: string; hilfe: string }[] = [
  {
    art: "kontostand",
    titel: "Kontostand",
    pfad: "/kontostaende/",
    datumsfeld: "datum",
    typ: "date",
    hilfe: "Ein Stichtagswert. Trag ihn einmal im Monat ein — daraus entstehen Verlauf und Runway.",
  },
  {
    art: "fixkosten",
    titel: "Fixkosten je Monat",
    pfad: "/fixkosten/",
    datumsfeld: "gueltig_ab",
    typ: "date",
    hilfe: "Der wiederkehrende Betrag. Gilt ab dem Datum bis zum nächsten Eintrag — alte Werte bleiben stehen, damit der Verlauf stimmt.",
  },
  {
    art: "monatskosten",
    titel: "Tatsächliche Kosten eines Monats",
    pfad: "/monatskosten/",
    datumsfeld: "monat",
    typ: "month",
    hilfe: "Was in dem Monat wirklich weg war, inklusive Einmaligem. Ab drei erfassten Monaten rechnet der Runway mit deren Durchschnitt statt mit den Fixkosten.",
  },
];

export function Finanzeingabe() {
  const neuLaden = useNeuLaden();
  const [art, setArt] = useState<Art>("kontostand");
  const [datum, setDatum] = useState(HEUTE);
  const [betrag, setBetrag] = useState("");
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");

  const gewaehlt = ARTEN.find((a) => a.art === art)!;

  function artWechseln(neu: Art) {
    setArt(neu);
    setDatum(ARTEN.find((a) => a.art === neu)!.typ === "month" ? MONAT() : HEUTE());
    setMeldung("");
    setFehler("");
  }

  async function speichern() {
    setFehler("");
    setMeldung("");
    // Deutsche Eingabe zulassen: 1.250,50 wie 1250.50.
    const zahl = betrag.replace(/\./g, "").replace(",", ".");
    if (!zahl || Number.isNaN(Number(zahl))) return setFehler("Bitte einen Betrag eintragen.");
    const wert = gewaehlt.typ === "month" ? `${datum}-01` : datum;

    try {
      await hole(gewaehlt.pfad, {
        method: "POST",
        body: JSON.stringify({ [gewaehlt.datumsfeld]: wert, betrag: Number(zahl).toFixed(2) }),
      });
      setBetrag("");
      setMeldung(`${gewaehlt.titel} eingetragen.`);
      neuLaden();
    } catch (e) {
      // Der häufigste Fall: Für diesen Tag gibt es schon einen Wert. Das ist
      // keine Panne, sondern eine Auskunft.
      const text = e instanceof Error ? e.message : "";
      setFehler(
        /existiert bereits|schon|unique/i.test(text)
          ? "Für diesen Zeitpunkt gibt es schon einen Wert. Ein anderes Datum wählen, oder den alten im Admin ändern."
          : text || "Das hat nicht geklappt.",
      );
    }
  }

  return (
    <div className="karte">
      <h2>
        Finanzen eintragen
        <Hilfe text={gewaehlt.hilfe} />
      </h2>
      <div className="feld-reihe">
        <select className="feld" value={art} onChange={(e) => artWechseln(e.target.value as Art)} aria-label="Was eintragen">
          {ARTEN.map((a) => (
            <option key={a.art} value={a.art}>
              {a.titel}
            </option>
          ))}
        </select>
        <input
          className="feld"
          type={gewaehlt.typ}
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          aria-label={gewaehlt.typ === "month" ? "Monat" : "Datum"}
        />
        <input
          className="feld"
          inputMode="decimal"
          placeholder="Betrag in €"
          value={betrag}
          onChange={(e) => setBetrag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && speichern()}
          aria-label="Betrag"
        />
        <button type="button" className="knopf" onClick={speichern}>
          Eintragen
        </button>
      </div>
      {meldung && <p className="rueckmeldung gut">{meldung}</p>}
      {fehler && <p className="rueckmeldung schlecht">{fehler}</p>}
    </div>
  );
}
