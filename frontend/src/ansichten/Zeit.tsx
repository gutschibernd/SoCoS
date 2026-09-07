import { useState } from "react";

import { hole } from "../basis/api";
import {
  useBuchungen,
  useNeuLaden,
  useProjekte,
  type Buchung,
  type Ich,
} from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { alsDauer, alsStunden } from "../basis/zeit";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";

const TAG = new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
const UHRZEIT = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" });

export function Zeit({ ich }: { ich: Ich }) {
  const buchungen = useBuchungen();
  const projekte = useProjekte();
  const neuLaden = useNeuLaden();
  const [nachtragen, setNachtragen] = useState(false);

  if (!buchungen.data) return <Zustand abfrage={buchungen} erneut={() => buchungen.refetch()} />;

  const entwuerfe = buchungen.data.filter((b) => b.ist_entwurf);
  const echte = buchungen.data.filter((b) => !b.ist_entwurf);
  const gesamt = echte.reduce((s, b) => s + b.sekunden, 0);

  return (
    <div className="spalte">
      {entwuerfe.length > 0 && (
        <div className="karte" style={{ borderTop: "3px solid var(--warnung)" }}>
          <h2>
            Bitte bestätigen
            <Hilfe text="Diese Buchungen liefen über das Tagesende hinaus, weil der Clock-out fehlte. Sie wurden dort abgeschnitten und zählen in keiner Summe mit, bis du das Ende bestätigst." />
          </h2>
          {entwuerfe.map((b) => (
            <EntwurfZeile key={b.id} buchung={b} neuLaden={neuLaden} />
          ))}
        </div>
      )}

      <div className="karte">
        <div className="feld-reihe">
          <div style={{ flex: 1 }}>
            <div className="beschriftung" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-sehr-leise)", fontWeight: 600 }}>
              Gebucht insgesamt
            </div>
            <div className="wert zahl" style={{ fontSize: 24 }}>
              {alsDauer(gesamt)} <span style={{ fontSize: 14, color: "var(--text-leise)" }}>({alsStunden(gesamt)} h gerundet)</span>
            </div>
          </div>
          {ich.darf.bearbeiten && (
            <button type="button" className="knopf" onClick={() => setNachtragen((n) => !n)}>
              {nachtragen ? "Nachtragen schließen" : "Zeit nachtragen"}
            </button>
          )}
        </div>

        {nachtragen && projekte.data && (
          <Nachtragen projekte={projekte.data} fertig={() => { setNachtragen(false); neuLaden(); }} />
        )}
      </div>

      <div className="karte">
        <h2>Buchungen</h2>
        {echte.length === 0 ? (
          <Leerstelle
            was="Noch keine Buchung"
            satz="Die Uhr startet auf einem Arbeitspaket in der Projektansicht. Vergessene Zeiten trägst du hier nach."
          />
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Person</th>
                <th>Projekt · Paket</th>
                <th>Von – bis</th>
                <th>Dauer</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {echte.map((b) => (
                <tr key={b.id}>
                  <td data-spalte="Tag">{TAG.format(new Date(b.start))}</td>
                  <td data-spalte="Person">{b.person_name}</td>
                  <td data-spalte="Projekt · Paket">
                    {b.projekt_titel} · {b.paket_titel}
                  </td>
                  <td data-spalte="Von – bis" className="zahl">
                    {UHRZEIT.format(new Date(b.start))} –{" "}
                    {b.ende ? UHRZEIT.format(new Date(b.ende)) : "läuft"}
                  </td>
                  <td data-spalte="Dauer" className="zahl">
                    {alsDauer(b.sekunden)}
                  </td>
                  <td data-spalte="Notiz">{b.notiz || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EntwurfZeile({ buchung, neuLaden }: { buchung: Buchung; neuLaden: () => void }) {
  const [ende, setEnde] = useState(() =>
    buchung.ende ? new Date(buchung.ende).toISOString().slice(0, 16) : "",
  );

  async function bestaetigen() {
    await hole(`/zeiten/${buchung.id}/entwurf_bestaetigen/`, {
      method: "POST",
      body: JSON.stringify({ ende: new Date(ende).toISOString() }),
    });
    neuLaden();
  }

  return (
    <div className="feld-reihe" style={{ marginBottom: 10 }}>
      <div style={{ flex: "2 1 240px", fontSize: 14 }}>
        <b>{buchung.paket_titel}</b>
        <div style={{ color: "var(--text-leise)" }}>
          {TAG.format(new Date(buchung.start))}, ab {UHRZEIT.format(new Date(buchung.start))} —
          bis wann hast du gearbeitet?
        </div>
      </div>
      <input
        className="feld"
        type="datetime-local"
        value={ende}
        onChange={(e) => setEnde(e.target.value)}
        aria-label="Ende"
      />
      <button type="button" className="knopf" onClick={bestaetigen}>
        Bestätigen
      </button>
    </div>
  );
}

function Nachtragen({
  projekte,
  fertig,
}: {
  projekte: import("../basis/daten").Projekt[];
  fertig: () => void;
}) {
  const pakete = projekte.flatMap((p) =>
    p.bereiche.flatMap((b) => b.pakete.map((k) => ({ ...k, wo: `${p.titel} · ${k.titel}` }))),
  );
  const [paket, setPaket] = useState(pakete[0]?.id ?? 0);
  const [start, setStart] = useState("");
  const [ende, setEnde] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState("");

  async function speichern() {
    setFehler("");
    if (!paket || !start || !ende) return setFehler("Paket, Beginn und Ende werden gebraucht.");
    if (new Date(ende) <= new Date(start)) return setFehler("Das Ende muss nach dem Beginn liegen.");
    try {
      await hole("/zeiten/", {
        method: "POST",
        body: JSON.stringify({
          paket,
          start: new Date(start).toISOString(),
          ende: new Date(ende).toISOString(),
          notiz,
        }),
      });
      fertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das hat nicht geklappt.");
    }
  }

  if (pakete.length === 0) {
    return (
      <Leerstelle
        was="Kein Arbeitspaket vorhanden"
        satz="Zeit hängt immer an einem Paket. Leg zuerst eines in der Projektansicht an."
      />
    );
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--rand)" }}>
      <div className="feld-reihe">
        <select className="feld" value={paket} onChange={(e) => setPaket(Number(e.target.value))} aria-label="Arbeitspaket">
          {pakete.map((p) => (
            <option key={p.id} value={p.id}>
              {p.wo}
            </option>
          ))}
        </select>
        <input className="feld" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Beginn" />
        <input className="feld" type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} aria-label="Ende" />
      </div>
      <div className="feld-reihe" style={{ marginTop: 8 }}>
        <input className="feld" placeholder="Was hast du gemacht?" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        <button type="button" className="knopf" onClick={speichern}>
          Nachtragen
        </button>
      </div>
      {fehler && <p style={{ color: "var(--warnung)", fontSize: 14, marginTop: 8 }}>{fehler}</p>}
    </div>
  );
}
