/**
 * Die Startseite: große Kacheln als Abkürzungen.
 *
 * Sie steht in keinem Menü — hin kommt man über das Logo links oben. Sie
 * erfindet keine eigenen Daten, sondern führt auf Seiten, die es ohnehin
 * gibt. Die einzige Ausnahme ist das Buchen ganz oben: Die Uhr zu starten
 * ist der häufigste Griff des Tages, und dafür einmal über die Projektseite
 * zu gehen und dort das Paket zu suchen sind drei Wege zu viel.
 *
 * Hier steht nur, was man von hier aus *tut*. Zahlen nicht: Das Dashboard
 * hat sie, und eine Kachel, die bloß „Zahlen" heißt, ist derselbe Weg wie
 * der Menüeintrag daneben — nur länger.
 */

import { useState } from "react";

import {
  useBuchungen,
  useLaufend,
  useNeuLaden,
  useProjekte,
  type Ich,
} from "../basis/daten";
import type { Seite } from "../basis/router";
import { letztePakete, paketgruppen } from "../basis/start";
import { clockIn } from "../basis/uhr";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen, type ZeichenName } from "../bausteine/Zeichen";

type Ziel = {
  titel: string;
  satz: string;
  zeichen: ZeichenName;
  seite: Seite;
  unter?: string;
  /** Ziele, die zum Anlegen führen, sieht nur, wer auch anlegen darf. */
  nurBearbeiter?: boolean;
};

/*
 * Eine Kachel ist eine Gruppe von Zielen, nicht ein einzelnes.
 *
 * Organisation und lose Person sind derselbe Griff — „jemanden eintragen" —
 * und stehen deshalb geteilt in einer Kachel statt als zwei gleich große
 * Nachbarn, zwischen denen man erst lesen muss. Eine Gruppe mit einem Ziel
 * ist die gewöhnliche Kachel; ein zweiter Bauweg daneben wäre einer zu viel.
 *
 * Die geteilte Kachel steht zuletzt, und das ist keine Geschmacksfrage: Sie
 * ist zwei Spalten breit. Stünde sie in der Mitte, rutschte sie im schmaleren
 * Raster in die nächste Zeile und ließe neben sich ein leeres Feld stehen.
 */
const KACHELN: Ziel[][] = [
  [
    {
      titel: "Zeit nachtragen",
      satz: "Eine Buchung von Hand eintragen oder eine bestehende korrigieren.",
      zeichen: "zeit",
      seite: "zeit",
      nurBearbeiter: true,
    },
  ],
  [
    {
      titel: "Projekt & Pakete",
      satz: "Bereiche, Arbeitspakete, Stufen — der ganze Baum.",
      zeichen: "projekt",
      seite: "projekt",
    },
  ],
  [
    {
      titel: "Aufgaben",
      satz: "Die gemeinsame Tafel — allgemein und je Person.",
      zeichen: "aufgaben",
      seite: "aufgaben",
    },
  ],
  [
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
  ],
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
        {KACHELN.map((gruppe) => {
          const sichtbar = gruppe.filter((z) => !z.nurBearbeiter || ich.darf.bearbeiten);
          if (sichtbar.length === 0) return null;
          const schluessel = sichtbar.map((z) => `${z.seite}/${z.unter ?? ""}`).join("+");
          return (
            <div key={schluessel} className="kachel" data-teile={sichtbar.length}>
              {sichtbar.map((z) => (
                <button
                  key={`${z.seite}/${z.unter ?? ""}`}
                  type="button"
                  className="kachel-ziel"
                  onClick={() => wechseln(z.seite, z.unter ?? null)}
                >
                  <Zeichen name={z.zeichen} />
                  <b>{z.titel}</b>
                  <span>{z.satz}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Die Uhr starten, ohne die Seite zu wechseln.
 *
 * Drei Wege nebeneinander und nicht einer: Die vier zuletzt gebuchten Pakete
 * decken den Alltag mit einem Klick ab, die Auswahl darunter alles andere,
 * und „Ohne Paket" den Fall, in dem man noch gar nicht weiß, wohin die Zeit
 * gehört. Ohne die Auswahl käme man an ein Paket, auf das noch nie gebucht
 * wurde, überhaupt nicht heran.
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
      await clockIn(id);
      setPaket("");
      neuLaden();
    } catch {
      setFehler("Das hat nicht geklappt. Läuft die Verbindung noch?");
    }
  }

  /* Ohne Paketnummer: Der Server bucht auf „Overhead". Derselbe Weg wie oben,
     nur ohne Ziel — deshalb auch dieselbe Fehlerzeile. */
  async function ohnePaket() {
    setFehler("");
    try {
      await clockIn();
      neuLaden();
    } catch {
      setFehler("Das hat nicht geklappt. Läuft die Verbindung noch?");
    }
  }

  const alle = projekte.data ?? [];
  const zuletzt = letztePakete(meine.data ?? [], alle);
  const gruppen = paketgruppen(alle);

  return (
    <div className="karte start-buchen">
      <h2>Zeit buchen</h2>

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
          {gruppen.map((gruppe) => (
            <optgroup key={gruppe.projekt} label={gruppe.projekt}>
              {gruppe.pakete.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titel}
                </option>
              ))}
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

      {/* Der Knopf für den Fall, dass die Frage „auf welches Paket?" gerade
          die falsche ist. Still gestaltet und auf eigener Zeile: Er ist der
          zweite Weg, nicht der erste, und das Auswahlfeld darüber geht ihn
          nichts an. */}
      <div className="feld-reihe start-ohne-paket">
        <button
          type="button"
          className="knopf-still"
          onClick={ohnePaket}
          title="Die Uhr läuft auf „Overhead“. Beim Clock-out kannst du sie umbuchen."
        >
          <Zeichen name="start" />
          Ohne Paket starten
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
