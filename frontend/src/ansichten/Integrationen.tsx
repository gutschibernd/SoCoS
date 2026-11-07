/**
 * Integrationen — was SoCoS nach draußen gibt: das Kalender-Abo und den
 * Schlüssel für den Assistenten (Telegram-Bot, socos/assistent.py).
 *
 * **Die Anleitung steht hier und nicht in der Doku**, anders als sonst: Sie
 * wird genau einmal gebraucht, genau in dem Moment, in dem man den Link
 * kopiert — und sie gehört zu diesem Link, nicht zu einer Arbeitsweise.
 *
 * Wie die Datei gebaut ist und warum so wenig darin steht: socos/kalender.py.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { hole } from "../basis/api";
import { melden } from "../basis/meldungen";
import { Zustand } from "../basis/Zustand";

type Kalenderlink = { link: string };
type Assistent = { ausgegeben: boolean; schluessel?: string };

async function inZwischenablage(text: string, was: string) {
  try {
    await navigator.clipboard.writeText(text);
    melden("gut", `${was} ist in der Zwischenablage.`);
  } catch {
    // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Der Text
    // steht im Feld daneben und lässt sich von Hand markieren.
    melden("fehler", "Kopieren ging nicht — bitte im Feld markieren.");
  }
}

export function Integrationen() {
  const abfrage = useQuery({
    queryKey: ["kalenderlink"],
    queryFn: () => hole<Kalenderlink>("/kalender/"),
  });
  const speicher = useQueryClient();
  const [fragtNeu, setFragtNeu] = useState(false);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { link } = abfrage.data;

  const kopieren = () => inZwischenablage(link, "Der Link");

  async function neuErzeugen() {
    const neu = await hole<Kalenderlink>("/kalender/neu/", { method: "POST" });
    speicher.setQueryData(["kalenderlink"], neu);
    setFragtNeu(false);
    melden("gut", "Neuer Link erzeugt. Der alte funktioniert nicht mehr.");
  }

  return (
    <div className="spalte">
      <div className="karte">
        <h2>Kalender-Abo</h2>

        <div className="feld-reihe">
          <input
            className="feld integration-link"
            readOnly
            value={link}
            aria-label="Kalender-Link"
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="knopf" onClick={kopieren}>
            Link kopieren
          </button>
        </div>

        <h3 className="integration-titel">So kommt er in Proton Calendar</h3>
        <ol className="doku-schritte">
          <li>
            Oben auf <b>Link kopieren</b> klicken.
          </li>
          <li>
            <b>calendar.proton.me</b> im Browser öffnen — das Hinzufügen geht nur dort, nicht in
            der App am Handy.
          </li>
          <li>
            Neben <b>Meine Kalender</b> auf <b>+</b> klicken und das Hinzufügen über eine URL
            wählen (englisch: <i>Add calendar from URL</i>).
          </li>
          <li>
            Den Link einfügen und <b>Kalender hinzufügen</b> klicken. Danach erscheint er auch in
            der Proton-App am Handy.
          </li>
        </ol>

        <h3 className="integration-titel">Gut zu wissen</h3>
        <ul className="integration-merke">
          <li>
            <b>Proton holt nur alle 4 bis 16 Stunden neu ab.</b> Ein Event, das gerade angelegt
            wurde, steht erst danach im Kalender.
          </li>
          <li>
            <b>Nur in eine Richtung:</b> Was im Kalender verschoben wird, ändert in SoCoS nichts.
          </li>
          <li>
            Drin sind alle Events und Meetings mit Titel, Zeit und Ort — keine Notizen, keine
            Namen. Ein Meeting dauert im Kalender eine Stunde, ein Event ohne Uhrzeit den
            ganzen Tag.
          </li>
          <li>
            <b>Der Link ist wie ein Passwort:</b> Wer ihn hat, sieht die Termine. Nicht
            weitergeben.
          </li>
        </ul>
      </div>

      <div className="karte">
        <h2>Link erneuern</h2>
        {fragtNeu ? (
          <div className="feld-reihe integration-nachfrage">
            <span>
              Der jetzige Link hört sofort auf zu funktionieren. Im Kalender muss danach der neue
              eingetragen werden.
            </span>
            <button type="button" className="knopf" onClick={neuErzeugen}>
              Ja, neuen Link erzeugen
            </button>
            <button type="button" className="knopf-still" onClick={() => setFragtNeu(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="feld-reihe">
            <span className="integration-leise">
              Wenn der Link in falsche Hände geraten ist.
            </span>
            <button type="button" className="knopf-still" onClick={() => setFragtNeu(true)}>
              Neuen Link erzeugen
            </button>
          </div>
        )}
      </div>

      <AssistentKarte />
    </div>
  );
}

/**
 * Der Schlüssel für den Telegram-Bot. **Er wird genau einmal angezeigt** —
 * gespeichert ist nur sein Hash, weil er mit deinen Rechten schreibt. Was der
 * Bot darf, steht in socos/berechtigung.py (`ASSISTENT_DARF`).
 */
function AssistentKarte() {
  const abfrage = useQuery({
    queryKey: ["assistent"],
    queryFn: () => hole<Assistent>("/assistent/"),
  });
  const speicher = useQueryClient();
  const [frisch, setFrisch] = useState<string | null>(null);
  const [frage, setFrage] = useState<"neu" | "entziehen" | null>(null);

  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { ausgegeben } = abfrage.data;

  async function erzeugen() {
    const antwort = await hole<Assistent>("/assistent/neu/", { method: "POST" });
    speicher.setQueryData(["assistent"], { ausgegeben: true });
    setFrisch(antwort.schluessel ?? null);
    setFrage(null);
  }

  async function entziehen() {
    await hole<Assistent>("/assistent/entziehen/", { method: "POST" });
    speicher.setQueryData(["assistent"], { ausgegeben: false });
    setFrisch(null);
    setFrage(null);
    melden("gut", "Schlüssel entzogen. Der Assistent kommt nicht mehr hinein.");
  }

  return (
    <div className="karte">
      <h2>Assistent (Telegram)</h2>

      {frisch ? (
        <>
          <div className="feld-reihe">
            <input
              className="feld integration-link"
              readOnly
              value={frisch}
              aria-label="Schlüssel des Assistenten"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="knopf"
              onClick={() => inZwischenablage(frisch, "Der Schlüssel")}
            >
              Schlüssel kopieren
            </button>
          </div>
          <ul className="integration-merke integration-abstand">
            <li>
              <b>Wird nur jetzt angezeigt.</b> Gespeichert ist nur ein Fingerabdruck — verloren
              heißt: neuen erzeugen.
            </li>
            <li>
              Er gehört in die <b>.env</b> des Assistenten am Server, als{" "}
              <code>SOCOS_SCHLUESSEL</code>.
            </li>
          </ul>
        </>
      ) : (
        <p className="integration-leise integration-stand">
          {ausgegeben
            ? "Ein Schlüssel ist ausgegeben. Was der Assistent ändert, steht im Protokoll als „über Assistent“."
            : "Noch kein Schlüssel ausgegeben."}
        </p>
      )}

      {frage ? (
        <div className="feld-reihe integration-nachfrage">
          <span>
            {frage === "neu"
              ? "Der jetzige Schlüssel hört sofort auf zu funktionieren. Am Server muss danach der neue eingetragen werden."
              : "Der Assistent kommt danach nicht mehr in SoCoS. Milder: neuen Schlüssel erzeugen, wenn er nur in falsche Hände geraten ist."}
          </span>
          <button
            type="button"
            className="knopf"
            onClick={frage === "neu" ? erzeugen : entziehen}
          >
            {frage === "neu" ? "Ja, neuen Schlüssel erzeugen" : "Ja, Schlüssel entziehen"}
          </button>
          <button type="button" className="knopf-still" onClick={() => setFrage(null)}>
            Abbrechen
          </button>
        </div>
      ) : ausgegeben ? (
        <div className="feld-reihe">
          <span className="integration-leise">
            Darf nicht an Sicherung, Nutzer, Finanzen und Protokoll.
          </span>
          <button type="button" className="knopf-still" onClick={() => setFrage("neu")}>
            Neuen Schlüssel erzeugen
          </button>
          <button type="button" className="knopf-still" onClick={() => setFrage("entziehen")}>
            Schlüssel entziehen
          </button>
        </div>
      ) : (
        <div className="feld-reihe">
          <button type="button" className="knopf" onClick={erzeugen}>
            Schlüssel erzeugen
          </button>
        </div>
      )}
    </div>
  );
}
