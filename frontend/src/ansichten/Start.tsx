/**
 * Die Startseite: große Kacheln als Abkürzungen.
 *
 * Sie steht in keinem Menü — hin kommt man über das Logo links oben. Sie
 * erfindet keine eigenen Daten, sondern führt auf die fünf Seiten, die es
 * ohnehin gibt. Die einzige Ausnahme ist das Buchen ganz oben: Die Uhr zu
 * starten ist der häufigste Griff des Tages, und dafür einmal über die
 * Projektseite zu gehen und dort das Paket zu suchen sind drei Wege zu viel.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import {
  useBuchungen,
  useLaufend,
  useNeuLaden,
  useProjekte,
  type Ich,
} from "../basis/daten";
import type { Seite } from "../basis/router";
import { BUCHBAR, letztePakete } from "../basis/start";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen, type ZeichenName } from "../bausteine/Zeichen";

type Kachel = {
  titel: string;
  satz: string;
  zeichen: ZeichenName;
  seite: Seite;
  unter?: string;
  /** Kacheln, die zum Anlegen führen, sieht nur, wer auch anlegen darf. */
  nurBearbeiter?: boolean;
};

const KACHELN: Kachel[] = [
  {
    titel: "Zeit nachtragen",
    satz: "Eine Buchung von Hand eintragen oder eine bestehende korrigieren.",
    zeichen: "zeit",
    seite: "zeit",
    nurBearbeiter: true,
  },
  {
    titel: "Organisation erfassen",
    satz: "Neue Organisation anlegen — die Personen hängen darunter.",
    zeichen: "kontakte",
    seite: "kontakte",
    nurBearbeiter: true,
  },
  {
    titel: "Person ohne Organisation",
    satz: "Wen du kennst, aber noch nirgends einsortiert hast.",
    zeichen: "kontakte",
    seite: "kontakte",
    unter: "lose",
  },
  {
    titel: "Event anlegen",
    satz: "Tagung eintragen und die Hitlist dazu aufbauen.",
    zeichen: "event",
    seite: "events",
    nurBearbeiter: true,
  },
  {
    titel: "Projekt & Pakete",
    satz: "Bereiche, Arbeitspakete, Stufen — der ganze Baum.",
    zeichen: "projekt",
    seite: "projekt",
  },
  {
    titel: "Zahlen & Runway",
    satz: "Woche, Geld, Fortschritt auf einen Blick.",
    zeichen: "dashboard",
    seite: "dashboard",
  },
];

/** Der Tag vor 30 Tagen als JJJJ-MM-TT — die Grundlage für „zuletzt gebucht". */
function vorDreissigTagen() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function Start({
  ich,
  wechseln,
}: {
  ich: Ich;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  return (
    <div className="spalte">
      {ich.darf.bearbeiten && <Buchen ich={ich} wechseln={wechseln} />}

      <div className="kacheln">
        {KACHELN.filter((k) => !k.nurBearbeiter || ich.darf.bearbeiten).map((k) => (
          <button
            key={`${k.seite}/${k.unter ?? ""}`}
            type="button"
            className="kachel"
            onClick={() => wechseln(k.seite, k.unter ?? null)}
          >
            <Zeichen name={k.zeichen} />
            <b>{k.titel}</b>
            <span>{k.satz}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Die Uhr starten, ohne die Seite zu wechseln.
 *
 * Zwei Wege nebeneinander und nicht einer: Die vier zuletzt gebuchten Pakete
 * decken den Alltag mit einem Klick ab, die Auswahl darunter alles andere.
 * Ohne die Auswahl käme man an ein Paket, auf das noch nie gebucht wurde,
 * überhaupt nicht heran.
 */
function Buchen({
  ich,
  wechseln,
}: {
  ich: Ich;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const projekte = useProjekte();
  const laufend = useLaufend();
  const neuLaden = useNeuLaden();
  // Ausdrücklicher Zeitraum, kein stiller Filter: „zuletzt" heißt hier die
  // letzten dreißig Tage, und das steht auch in der Überschrift.
  const meine = useBuchungen({ person: String(ich.id), von: vorDreissigTagen() });

  const [paket, setPaket] = useState("");
  const [fehler, setFehler] = useState("");

  const buchung = laufend.data?.laufend ?? null;

  async function starten(id: number) {
    if (!id) return setFehler("Wähl zuerst das Arbeitspaket, auf das die Uhr laufen soll.");
    setFehler("");
    try {
      await hole("/zeiten/clock_in/", { method: "POST", body: JSON.stringify({ paket: id }) });
      setPaket("");
      neuLaden();
    } catch {
      setFehler("Das hat nicht geklappt. Läuft die Verbindung noch?");
    }
  }

  const alle = projekte.data ?? [];
  const zuletzt = letztePakete(meine.data ?? [], alle);

  return (
    <div className="karte start-buchen">
      <h2>
        Zeit buchen
        <Hilfe text="Läuft schon eine Buchung, wird sie beim Start der neuen beendet — ohne Notiz. Wer eine Notiz mitgeben will, macht den Clock-out oben in der Kopfleiste." />
      </h2>

      {buchung && (
        <p className="start-laeuft">
          Es läuft gerade „{buchung.paket_titel}“. Ein Start hier beendet diese Buchung.
        </p>
      )}

      {zuletzt.length > 0 && (
        <div className="start-beschriftung">Zuletzt gebucht — ein Klick startet die Uhr</div>
      )}
      {zuletzt.length > 0 && (
        <div className="start-zuletzt">
          {zuletzt.map((p) => (
            <button key={p.id} type="button" onClick={() => starten(p.id)}>
              <Zeichen name="start" />
              {p.titel}
              <em>{p.projekt}</em>
            </button>
          ))}
        </div>
      )}

      <div className="feld-reihe">
        <select
          className="feld"
          value={paket}
          onChange={(e) => setPaket(e.target.value)}
          aria-label="Arbeitspaket"
        >
          <option value="">Anderes Arbeitspaket wählen …</option>
          {alle.map((projekt) => (
            <optgroup key={projekt.id} label={projekt.titel}>
              {projekt.bereiche.flatMap((bereich) =>
                bereich.pakete
                  .filter((p) => BUCHBAR.includes(p.status))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {bereich.titel} · {p.titel}
                    </option>
                  )),
              )}
            </optgroup>
          ))}
        </select>
        {/* Nicht stillgelegt: Ein grauer Knopf sagt nicht, was fehlt. Er nimmt
            den Klick an und antwortet in der Zeile darunter. */}
        <button type="button" className="knopf" onClick={() => starten(Number(paket))}>
          <Zeichen name="start" />
          Uhr starten
        </button>
      </div>

      <Fehlerzeile text={fehler} />

      {projekte.data && alle.length === 0 && (
        <Leerstelle
          was="Noch kein Projekt"
          satz="Ohne Projekt gibt es kein Arbeitspaket, auf das die Uhr laufen könnte."
          aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt") }}
        />
      )}
    </div>
  );
}
