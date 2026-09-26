/**
 * Module · Praktikantenstellen: die Haupt-Aufgabenstellungen.
 *
 * Ein Thema ist Titel, Kurzbeschreibung und ein paar Punkte — so, wie wir es
 * intern notieren. Daraus wird über ein LLM eine Ausschreibung, und aus der
 * ein Aushang auf einer Seite.
 *
 * **Der Weg über das LLM geht über die Zwischenablage**, wie bei den Meetings:
 * SoCoS schickt nichts irgendwohin. Den Auftrag schreibt der Server
 * (`socos/services/ausschreibung.py`), weil dort auch der Parser steht, der
 * die Antwort für das PDF zerlegt.
 */

import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, usePraktikumsthemen, type Ich, type Praktikumsthema } from "../basis/daten";
import { melden } from "../basis/meldungen";
import { punkteAusText } from "../basis/module";
import { Zustand } from "../basis/Zustand";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

export function Praktikum({ ich }: { ich: Ich }) {
  const themen = usePraktikumsthemen();
  // `null` = kein Fenster, „neu" = ein neues Thema, sonst das offene.
  const [fenster, setFenster] = useState<Praktikumsthema | "neu" | null>(null);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!themen.data) return <Zustand abfrage={themen} erneut={() => themen.refetch()} />;

  const neu = ich.darf.bearbeiten && (
    <button type="button" className="knopf" onClick={() => setFenster("neu")}>
      <Zeichen name="plus" />
      Thema
    </button>
  );

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>Haupt-Aufgabenstellungen</b>
          <span>
            {themen.data.length} {themen.data.length === 1 ? "Thema" : "Themen"}
          </span>
        </div>
        {themen.data.length > 0 && <div className="vorhaben-aktionen">{neu}</div>}
      </div>

      {themen.data.length === 0 ? (
        <div className="karte leerstelle">
          <b>Noch kein Thema</b>
          <p>Ein Titel, zwei Sätze, ein paar Punkte — daraus wird die Ausschreibung.</p>
          {neu}
        </div>
      ) : (
        themen.data.map((t) => (
          <Themenkarte
            key={t.id}
            thema={t}
            darfBearbeiten={ich.darf.bearbeiten}
            bearbeiten={() => setFenster(t)}
          />
        ))
      )}

      {fenster !== null && (
        <Themenfenster
          thema={fenster === "neu" ? null : fenster}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setFenster(null)}
        />
      )}
    </div>
  );
}

/* --- Ein Thema ------------------------------------------------------------ */

function Themenkarte({
  thema,
  darfBearbeiten,
  bearbeiten,
}: {
  thema: Praktikumsthema;
  darfBearbeiten: boolean;
  bearbeiten: () => void;
}) {
  const punkte = punkteAusText(thema.punkte);
  return (
    <article className="karte thema">
      <div className="thema-kopf">
        <h2>{thema.titel}</h2>
        {darfBearbeiten && (
          <button type="button" className="knopf-still" onClick={bearbeiten}>
            <Zeichen name="stift" />
            Bearbeiten
          </button>
        )}
      </div>
      {thema.kurzbeschreibung.trim() && <p className="thema-text">{thema.kurzbeschreibung}</p>}
      {punkte.length > 0 && (
        <ul className="thema-punkte">
          {punkte.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      <details className="klappkarte thema-ausschreibung">
        <summary>
          <Zeichen name="zeiger" klasse="zeiger-klapp" />
          <span className="klapptitel">Ausschreibung</span>
          <span className={`stand ${thema.ausschreibung.trim() ? "stand-offen" : "stand-leer"}`}>
            {thema.ausschreibung.trim() ? "eingefügt" : "noch keine"}
          </span>
        </summary>
        <Ausschreibung
          // Ein neuer Schlüssel je gespeichertem Stand: Nach dem Speichern
          // beginnt das Feld mit dem, was jetzt gilt.
          key={thema.geaendert_am}
          thema={thema}
          darfBearbeiten={darfBearbeiten}
        />
      </details>
    </article>
  );
}

/**
 * Hinaus mit dem Auftrag, herein mit der Antwort, daraus das PDF.
 *
 * Der eingefügte Text wird gespeichert und nicht bloß durchgereicht: Man
 * bessert ihn nach — ein Wort, ein Punkt weniger —, ohne das LLM noch einmal
 * zu fragen. Ob er auf eine Seite passt, sagt der Server beim Speichern.
 */
function Ausschreibung({ thema, darfBearbeiten }: { thema: Praktikumsthema; darfBearbeiten: boolean }) {
  const neuLaden = useNeuLaden();
  const [text, setText] = useState(thema.ausschreibung);
  const [auftragOffen, setAuftragOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const geaendert = text.trim() !== thema.ausschreibung.trim();
  const gespeichert = thema.ausschreibung.trim() !== "";

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(thema.auftrag);
      melden("gut", "Der Auftrag samt Thema ist in der Zwischenablage.");
    } catch {
      // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Dann
      // steht der Text eben da und wird von Hand markiert.
      setAuftragOffen(true);
      melden("fehler", "Der Browser lässt das Kopieren nicht zu — der Auftrag steht jetzt unten.");
    }
  }

  async function speichern() {
    setLaeuft(true);
    try {
      await hole(`/praktikumsthemen/${thema.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ ausschreibung: text.trim() }),
      });
      neuLaden();
      melden("gut", `Die Ausschreibung zu „${thema.titel}“ ist gespeichert.`);
    } catch {
      // `hole` hat den Grund schon gemeldet — meist: passt nicht auf eine
      // Seite. Der Text bleibt stehen, damit man ihn kürzen kann.
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="aufbereitung">
      <div className="feld-reihe">
        <button type="button" className="knopf-still" onClick={kopieren}>
          <Zeichen name="pdf" />
          Für ein LLM kopieren
        </button>
        <button
          type="button"
          className="knopf-still"
          onClick={() => setAuftragOffen((o) => !o)}
          aria-expanded={auftragOffen}
        >
          {auftragOffen ? "Auftrag verbergen" : "Auftrag ansehen"}
        </button>
      </div>

      {auftragOffen && <textarea className="feld auftragsfeld" rows={10} readOnly value={thema.auftrag} />}

      <textarea
        className="feld"
        rows={10}
        aria-label="Ausschreibung"
        placeholder="Die Antwort des LLM hier einfügen …"
        value={text}
        readOnly={!darfBearbeiten}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="feld-reihe">
        {darfBearbeiten && (
          <button type="button" className="knopf" onClick={speichern} disabled={laeuft || !geaendert}>
            <Zeichen name="haken" />
            Speichern
          </button>
        )}
        {/* Ein Link und kein fetch: Das PDF soll im Download-Ordner landen.
            Solange etwas nicht gespeichert ist, gäbe er den alten Stand —
            dann steht an seiner Stelle ein Knopf, der nichts tut. */}
        {gespeichert && !geaendert ? (
          <a className="knopf-still" href={`/api/praktikumsthemen/${thema.id}/pdf/`}>
            <Zeichen name="pdf" />
            PDF
          </a>
        ) : (
          <button type="button" className="knopf-still" disabled>
            <Zeichen name="pdf" />
            PDF
          </button>
        )}
        {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
      </div>
    </div>
  );
}

/* --- Anlegen und bearbeiten ------------------------------------------------ */

type Entwurf = { titel: string; kurzbeschreibung: string; punkte: string };

/**
 * Titel, Kurzbeschreibung, Punkte — in einem Fenster, mit einem Speichern.
 *
 * Die Punkte sind ein Textfeld mit einer Zeile je Punkt und keine Liste von
 * Zeilen wie beim Canvas: Sie sind Rohstoff für das LLM, nicht das Ergebnis.
 */
function Themenfenster({
  thema,
  darfLoeschen,
  schliessen,
}: {
  thema: Praktikumsthema | null;
  darfLoeschen: boolean;
  schliessen: () => void;
}) {
  const neuLaden = useNeuLaden();
  const anfang: Entwurf = {
    titel: thema?.titel ?? "",
    kurzbeschreibung: thema?.kurzbeschreibung ?? "",
    punkte: thema?.punkte ?? "",
  };
  const [entwurf, setEntwurf] = useState<Entwurf>(anfang);
  const [laeuft, setLaeuft] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  const setze = (teil: Partial<Entwurf>) => setEntwurf((alt) => ({ ...alt, ...teil }));
  const geaendert = (Object.keys(anfang) as (keyof Entwurf)[]).some((k) => anfang[k] !== entwurf[k]);
  const bereit = entwurf.titel.trim() !== "" && geaendert;

  async function speichern() {
    if (!bereit) return;
    setLaeuft(true);
    const daten = {
      titel: entwurf.titel.trim(),
      kurzbeschreibung: entwurf.kurzbeschreibung.trim(),
      punkte: entwurf.punkte.trim(),
    };
    try {
      await hole(thema ? `/praktikumsthemen/${thema.id}/` : "/praktikumsthemen/", {
        method: thema ? "PATCH" : "POST",
        body: JSON.stringify(daten),
      });
      neuLaden();
      melden("gut", `„${daten.titel}“ ist gespeichert.`);
      schliessen();
    } catch {
      // Das Fenster bleibt offen — sonst wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!thema) return;
    setLaeuft(true);
    try {
      await hole(`/praktikumsthemen/${thema.id}/`, { method: "DELETE" });
      neuLaden();
      schliessen();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  const zurueck = () => (geaendert ? setFragtVerwerfen(true) : schliessen());

  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || fragtLoeschen) return;
      if (fragtVerwerfen) setFragtVerwerfen(false);
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });

  return (
    <>
      <div className="dialog-grund" role="dialog" aria-modal="true" aria-label="Thema" onClick={zurueck}>
        <div className="dialog dialog-arbeit" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>{thema ? thema.titel : "Neues Thema"}</h2>
              {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button type="button" className="knopf" onClick={speichern} disabled={laeuft || !bereit}>
                Speichern
              </button>
            </div>
          </div>

          <div className="dialog-koerper thema-felder">
            <label className="profilfeld">
              <span className="beschriftung-klein">Titel</span>
              <input
                className="feld"
                value={entwurf.titel}
                maxLength={160}
                autoFocus={!thema}
                placeholder="z. B. Usability-Tests am Spender"
                onChange={(e) => setze({ titel: e.target.value })}
              />
            </label>
            <label className="profilfeld">
              <span className="beschriftung-klein">Kurzbeschreibung</span>
              <textarea
                className="feld"
                rows={3}
                value={entwurf.kurzbeschreibung}
                placeholder="Worum geht es, und wozu brauchen wir es?"
                onChange={(e) => setze({ kurzbeschreibung: e.target.value })}
              />
            </label>
            <label className="profilfeld">
              <span className="beschriftung-klein">Punkte</span>
              <textarea
                className="feld"
                rows={7}
                value={entwurf.punkte}
                placeholder={"Ein Punkt je Zeile\nAufgaben, Voraussetzungen, Dauer, Beginn …"}
                onChange={(e) => setze({ punkte: e.target.value })}
              />
            </label>

            {thema && darfLoeschen && (
              <div className="persona-fuss">
                <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
                  <Zeichen name="korb" />
                  Thema entfernen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {fragtLoeschen && thema && (
        <Loeschdialog
          name={thema.titel}
          was="Das Thema samt seiner Ausschreibung"
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>Am Thema ist etwas geändert. Wer jetzt schließt, hat wieder den Stand von vorher.</p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(false)}>
                Weiter bearbeiten
              </button>
              <button type="button" className="knopf-still" onClick={schliessen}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft || !bereit}
                onClick={() => {
                  setFragtVerwerfen(false);
                  speichern();
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
