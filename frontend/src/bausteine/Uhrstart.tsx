import { useState } from "react";

import { useLaufend, useNeuLaden, type Projekt } from "../basis/daten";
import { letztePakete, paketgruppen } from "../basis/start";
import { clockIn, clockOut } from "../basis/uhr";
import { alsDauer } from "../basis/zeit";
import { Fehlerzeile } from "./Fehlerzeile";
import { Notizdialog } from "./Notizdialog";
import { Paketwahl } from "./Paketwahl";
import { Uhr } from "./Uhr";
import { Zeichen } from "./Zeichen";

/**
 * Die Uhr starten — **eine** Zeile, wie die Zeitleiste in Toggl oder Clockify:
 * Paket wählen, Start. Steht auf der Zeitseite und im Baustein „Zeit buchen"
 * der Übersicht, in beiden gleich.
 *
 * Vorher waren es drei Knöpfe nebeneinander — „Uhr starten" (der ohne
 * Paketwahl eine Fehlermeldung zeigte), „Ohne Paket" und daneben noch
 * „Ohne Paket starten" auf der Zeitseite. Wer nur loslegen wollte, musste erst
 * verstehen, welcher der drei gemeint ist. Jetzt ist es ein Knopf, und seine
 * Beschriftung sagt, was er gleich tut: ohne gewähltes Paket „Ohne Paket
 * starten" (die Zeit läuft auf Overhead und wird beim Clock-out einsortiert),
 * mit Paket „Start", und läuft schon etwas, „Wechseln".
 *
 * Die zuletzt bebuchten Pakete stehen darunter als ▶ — der Ein-Klick-Weg für
 * den Alltag, der in Toggl „Continue" heißt.
 *
 * **Läuft eine Buchung, steht sie hier mit ihrem Clock-out**, obwohl sie auch
 * in der Leiste steht: Auf dieser Zeile sieht man nach, was gerade läuft, und
 * ein Stopp, der woanders liegt, wird hier gesucht.
 */
export function Uhrstart({
  projekte,
  meine,
}: {
  projekte: Projekt[];
  /** Die eigenen Buchungen, aus denen „zuletzt" gerechnet wird. */
  meine: { paket: number; start: string }[];
}) {
  const laufend = useLaufend();
  const neuLaden = useNeuLaden();
  const [paket, setPaket] = useState(0);
  const [fehler, setFehler] = useState("");
  const [schickt, setSchickt] = useState(false);
  const [fragtNotiz, setFragtNotiz] = useState(false);

  const buchung = laufend.data?.laufend ?? null;
  const gruppen = paketgruppen(projekte);
  const zuletzt = letztePakete(meine, projekte, 3).filter((p) => p.id !== buchung?.paket);

  async function starten(id?: number) {
    setFehler("");
    setSchickt(true);
    try {
      await clockIn(id || undefined);
      setPaket(0);
      neuLaden();
    } catch {
      setFehler("Das hat nicht geklappt. Läuft die Verbindung noch?");
    } finally {
      setSchickt(false);
    }
  }

  async function beenden(notiz: string, ziel: number) {
    await clockOut(notiz, ziel !== buchung?.paket ? ziel : undefined);
    setFragtNotiz(false);
    neuLaden();
  }

  const beschriftung = buchung ? "Wechseln" : paket ? "Start" : "Ohne Paket starten";

  return (
    <div className="uhrstart">
      {buchung && (
        <div className="uhrstart-laeuft">
          <i className="punkt" />
          <span className="uhrstart-dauer">
            <Uhr seit={buchung.start} />
          </span>
          <span className="uhrstart-wo">
            <b>{buchung.paket_titel}</b>
            <em>{buchung.projekt_titel}</em>
          </span>
          <button type="button" className="knopf" onClick={() => setFragtNotiz(true)}>
            <Zeichen name="stopp" />
            Clock-out
          </button>
        </div>
      )}

      <div className="uhrstart-zeile">
        <Paketwahl
          gruppen={gruppen}
          wert={paket}
          setzen={setPaket}
          zuletzt={zuletzt.map((p) => p.id)}
          beschriftung={buchung ? "Anderes Arbeitspaket" : "Arbeitspaket"}
        />
        <button
          type="button"
          className={buchung ? "knopf-still" : "knopf"}
          disabled={schickt}
          onClick={() => starten(paket)}
          title={paket ? undefined : "Die Uhr läuft auf „Overhead“. Beim Clock-out sortierst du sie ein."}
        >
          <Zeichen name="start" />
          {beschriftung}
        </button>
      </div>

      {zuletzt.length > 0 && (
        <div className="uhrstart-zuletzt" aria-label="Zuletzt gebucht">
          {zuletzt.map((p) => (
            <button key={p.id} type="button" disabled={schickt} onClick={() => starten(p.id)}>
              <Zeichen name="start" />
              <span>
                <b>{p.titel}</b>
                <em>{p.projekt}</em>
              </span>
            </button>
          ))}
        </div>
      )}
      <Fehlerzeile text={fehler} />

      {fragtNotiz && buchung && (
        <Notizdialog
          wo={`${buchung.projekt_titel} · ${buchung.paket_titel}`}
          dauer={alsDauer(Math.floor((Date.now() - new Date(buchung.start).getTime()) / 1000))}
          paket={buchung.paket}
          gruppen={paketgruppen(projekte, [buchung.paket])}
          speichern={beenden}
          abbrechen={() => setFragtNotiz(false)}
        />
      )}
    </div>
  );
}
