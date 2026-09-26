/**
 * Module · Praktikantenstellen: die Haupt-Aufgabenstellungen und die
 * sonstigen Ideen.
 *
 * Die Haupt-Aufgaben stehen als Kacheln, zwei je Zeile, mit den Griffen, die
 * man am häufigsten braucht — Auftrag kopieren, PDF, bearbeiten. Alles
 * andere steht auf der Seite des Themas (`/module/praktikum/12`). Die Ideen
 * sind eine schlichte Liste: Sie sind noch nicht so weit, dass sie eine
 * Kachel bräuchten, und werden mit einem Griff zur Haupt-Aufgabe.
 *
 * **Der Weg über das LLM geht über die Zwischenablage**, wie bei den Meetings:
 * SoCoS schickt nichts irgendwohin. Den Auftrag schreibt der Server
 * (`socos/services/ausschreibung.py`), weil dort auch der Parser steht, der
 * die Antwort für das PDF zerlegt.
 */

import { useEffect, useState, type ReactNode } from "react";

import { hole } from "../basis/api";
import {
  useNeuLaden,
  usePraktikumsthemen,
  type Ich,
  type Praktikumsthema,
  type Themenart,
} from "../basis/daten";
import { melden } from "../basis/meldungen";
import { listeFuer, punkteAusText, themenZahl, type Themenliste } from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

/** Das Fenster: zu, ein neues Thema dieser Art, oder ein bestehendes. */
type Fenster = null | { neu: Themenart } | Praktikumsthema;

const hatAusschreibung = (t: Praktikumsthema) => t.ausschreibung.trim() !== "";

/* --- Die Listen ----------------------------------------------------------- */

export function Praktikum({
  ich,
  teil,
  umschalter,
  wechseln,
}: {
  ich: Ich;
  teil: Themenliste;
  umschalter: ReactNode;
  wechseln: Wechseln;
}) {
  const themen = usePraktikumsthemen();
  const [fenster, setFenster] = useState<Fenster>(null);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!themen.data) return <Zustand abfrage={themen} erneut={() => themen.refetch()} />;

  const liste = themen.data.filter((t) => t.art === teil.art);
  const idee = teil.art === "idee";
  const oeffnen = (t: Praktikumsthema) => wechseln("module", `${teil.weg}/${t.id}`);

  const neu = ich.darf.bearbeiten && (
    <button type="button" className="knopf" onClick={() => setFenster({ neu: teil.art })}>
      <Zeichen name="plus" />
      {idee ? "Idee" : "Thema"}
    </button>
  );

  return (
    <div className="spalte">
      {umschalter}
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{teil.titel}</b>
          <span>{themenZahl(liste.length, teil.art)}</span>
        </div>
        {liste.length > 0 && <div className="vorhaben-aktionen">{neu}</div>}
      </div>

      {liste.length === 0 ? (
        <div className="karte leerstelle">
          <b>{idee ? "Noch keine Idee" : "Noch kein Thema"}</b>
          <p>
            {idee
              ? "Was man als Praktikum auch vergeben könnte — ein Titel genügt. Später wird eine Haupt-Aufgabe daraus."
              : "Ein Titel, zwei Sätze, ein paar Punkte — daraus wird die Ausschreibung."}
          </p>
          {neu}
        </div>
      ) : idee ? (
        <Ideenliste ideen={liste} darfBearbeiten={ich.darf.bearbeiten} oeffnen={oeffnen} />
      ) : (
        <div className="thema-kacheln">
          {liste.map((t) => (
            <Themenkachel
              key={t.id}
              thema={t}
              darfBearbeiten={ich.darf.bearbeiten}
              oeffnen={() => oeffnen(t)}
              bearbeiten={() => setFenster(t)}
            />
          ))}
        </div>
      )}

      {fenster !== null && (
        <Themenfenster
          thema={"neu" in fenster ? null : fenster}
          art={"neu" in fenster ? fenster.neu : fenster.art}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setFenster(null)}
        />
      )}
    </div>
  );
}

/**
 * Eine Haupt-Aufgabe als Kachel. Die ganze Kachel führt auf die Seite des
 * Themas — über einen Link im Titel, der sich über die Kachel legt. Die
 * Knöpfe liegen darüber: Ein Knopf in einem Link ginge nicht.
 */
function Themenkachel({
  thema,
  darfBearbeiten,
  oeffnen,
  bearbeiten,
}: {
  thema: Praktikumsthema;
  darfBearbeiten: boolean;
  oeffnen: () => void;
  bearbeiten: () => void;
}) {
  const punkte = punkteAusText(thema.punkte);
  return (
    <article className="thema-kachel">
      <div className="thema-kachel-kopf">
        <h2>
          <a
            className="thema-kachel-link"
            href={`/module/praktikum/${thema.id}`}
            onClick={(e) => {
              e.preventDefault();
              oeffnen();
            }}
          >
            {thema.titel}
          </a>
        </h2>
        <Ausschreibungsstand thema={thema} />
      </div>
      {thema.kurzbeschreibung.trim() && <p className="thema-kachel-text">{thema.kurzbeschreibung}</p>}
      <span className="thema-kachel-zahl">
        {punkte.length} {punkte.length === 1 ? "Punkt" : "Punkte"}
      </span>
      <div className="thema-kachel-fuss">
        <KopierKnopf thema={thema} />
        <PdfKnopf thema={thema} />
        {darfBearbeiten && (
          <button type="button" className="knopf-still" onClick={bearbeiten}>
            <Zeichen name="stift" />
            Bearbeiten
          </button>
        )}
        <Zeichen name="zeiger" klasse="thema-kachel-zeiger" />
      </div>
    </article>
  );
}

/**
 * Die sonstigen Ideen: eine Zeile je Idee, der Titel führt auf ihre Seite,
 * rechts der eine Griff, auf den es hier ankommt.
 */
function Ideenliste({
  ideen,
  darfBearbeiten,
  oeffnen,
}: {
  ideen: Praktikumsthema[];
  darfBearbeiten: boolean;
  oeffnen: (t: Praktikumsthema) => void;
}) {
  return (
    <ul className="karte themenideen">
      {ideen.map((t) => (
        <li key={t.id}>
          <a
            className="themenidee-link"
            href={`/module/praktikum-ideen/${t.id}`}
            onClick={(e) => {
              e.preventDefault();
              oeffnen(t);
            }}
          >
            <b>{t.titel}</b>
            {t.kurzbeschreibung.trim() && <span>{t.kurzbeschreibung}</span>}
          </a>
          {darfBearbeiten && <ArtKnopf thema={t} />}
        </li>
      ))}
    </ul>
  );
}

/* --- Die Seite eines Themas ----------------------------------------------- */

export function Themenseite({
  ich,
  id,
  teil,
  wechseln,
}: {
  ich: Ich;
  id: number;
  teil: Themenliste;
  wechseln: Wechseln;
}) {
  const themen = usePraktikumsthemen();
  const [bearbeiten, setBearbeiten] = useState(false);

  if (!themen.data) return <Zustand abfrage={themen} erneut={() => themen.refetch()} />;

  const thema = themen.data.find((t) => t.id === id);
  if (!thema) {
    return (
      <div className="karte leerstelle">
        <b>Dieses Thema gibt es nicht mehr</b>
        <p>Es wurde entfernt. Ein Admin kann es wiederherstellen.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("module", teil.weg)}>
          Zu den {teil.titel}
        </button>
      </div>
    );
  }

  const punkte = punkteAusText(thema.punkte);

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b className="thema-titel">{thema.titel}</b>
          <span>{thema.art === "idee" ? "Sonstige Idee" : "Haupt-Aufgabenstellung"}</span>
        </div>
        {ich.darf.bearbeiten && (
          <div className="vorhaben-aktionen">
            <ArtKnopf
              thema={thema}
              // Die Seite zieht mit in die andere Liste, damit „zurück"
              // dorthin führt, wo das Thema jetzt steht.
              danach={(neu) => wechseln("module", `${listeFuer(neu).weg}/${thema.id}`)}
            />
            <button type="button" className="knopf-still" onClick={() => setBearbeiten(true)}>
              <Zeichen name="stift" />
              Bearbeiten
            </button>
          </div>
        )}
      </div>

      <section className="karte thema">
        <h2 className="beschriftung-klein">Kurzbeschreibung</h2>
        {thema.kurzbeschreibung.trim() ? (
          <p className="thema-text">{thema.kurzbeschreibung}</p>
        ) : (
          <p className="thema-leer">Noch keine.</p>
        )}
        <h2 className="beschriftung-klein thema-zwischentitel">Punkte</h2>
        {punkte.length > 0 ? (
          <ul className="thema-punkte">
            {punkte.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="thema-leer">Noch keine.</p>
        )}
      </section>

      <section className="karte thema">
        <div className="thema-kopf">
          <h2>Ausschreibung</h2>
          <Ausschreibungsstand thema={thema} />
        </div>
        <Ausschreibung
          // Ein neuer Schlüssel je gespeichertem Stand: Nach dem Speichern
          // beginnt das Feld mit dem, was jetzt gilt.
          key={thema.geaendert_am}
          thema={thema}
          darfBearbeiten={ich.darf.bearbeiten}
        />
      </section>

      {bearbeiten && (
        <Themenfenster
          thema={thema}
          art={thema.art}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setBearbeiten(false)}
          nachLoeschen={() => wechseln("module", listeFuer(thema.art).weg)}
        />
      )}
    </div>
  );
}

/* --- Griffe, die Kachel und Seite teilen ---------------------------------- */

function Ausschreibungsstand({ thema }: { thema: Praktikumsthema }) {
  return (
    <span className={`stand ${hatAusschreibung(thema) ? "stand-offen" : "stand-leer"}`}>
      {hatAusschreibung(thema) ? "Ausschreibung da" : "keine Ausschreibung"}
    </span>
  );
}

/**
 * Den Auftrag in die Zwischenablage. Gibt zurück, ob es geklappt hat — ohne
 * HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage, und dann muss der
 * Text sichtbar werden, damit man ihn von Hand markiert.
 */
async function auftragKopieren(thema: Praktikumsthema): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(thema.auftrag);
    melden("gut", "Der Auftrag samt Thema ist in der Zwischenablage.");
    return true;
  } catch {
    return false;
  }
}

function KopierKnopf({ thema, sonst }: { thema: Praktikumsthema; sonst?: () => void }) {
  return (
    <button
      type="button"
      className="knopf-still"
      onClick={async () => {
        if (await auftragKopieren(thema)) return;
        if (sonst) {
          sonst();
          melden("fehler", "Der Browser lässt das Kopieren nicht zu — der Auftrag steht jetzt unten.");
        } else {
          melden("fehler", "Der Browser lässt das Kopieren nicht zu. Auf der Seite des Themas steht der Auftrag zum Markieren.");
        }
      }}
    >
      <Zeichen name="pdf" />
      Für ein LLM kopieren
    </button>
  );
}

/**
 * Ein Link und kein fetch: Das PDF soll im Download-Ordner landen. Ohne
 * gespeicherte Ausschreibung — oder solange eine Änderung daran nicht
 * gespeichert ist — gäbe er nichts oder den alten Stand; dann steht an seiner
 * Stelle ein Knopf, der nichts tut.
 */
function PdfKnopf({ thema, gesperrt = false }: { thema: Praktikumsthema; gesperrt?: boolean }) {
  if (!hatAusschreibung(thema) || gesperrt)
    return (
      <button type="button" className="knopf-still" disabled>
        <Zeichen name="pdf" />
        PDF
      </button>
    );
  return (
    <a className="knopf-still" href={`/api/praktikumsthemen/${thema.id}/pdf/`}>
      <Zeichen name="pdf" />
      PDF
    </a>
  );
}

/** Aus einer Idee eine Haupt-Aufgabe machen — oder zurück zu den Ideen. */
function ArtKnopf({ thema, danach }: { thema: Praktikumsthema; danach?: (art: Themenart) => void }) {
  const neuLaden = useNeuLaden();
  const [laeuft, setLaeuft] = useState(false);
  const neu: Themenart = thema.art === "idee" ? "aufgabe" : "idee";
  const beschriftung = neu === "aufgabe" ? "Zur Haupt-Aufgabe" : "Zu den Ideen";

  async function umstellen() {
    setLaeuft(true);
    try {
      await hole(`/praktikumsthemen/${thema.id}/`, { method: "PATCH", body: JSON.stringify({ art: neu }) });
      neuLaden();
      melden("gut", `„${thema.titel}“ steht jetzt unter ${listeFuer(neu).titel}.`);
      danach?.(neu);
    } catch {
      // `hole` hat den Grund schon gemeldet.
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <button
      type="button"
      className="knopf-still art-knopf"
      onClick={umstellen}
      disabled={laeuft}
      aria-label={beschriftung}
      title={beschriftung}
    >
      <Zeichen name={neu === "aufgabe" ? "hoch" : "idee"} />
      {/* In der Ideenliste am Handy nur der Pfeil — sonst bleibt vom Titel
          daneben ein Wort je Zeile. */}
      <span className="art-text">{beschriftung}</span>
    </button>
  );
}

/**
 * Hinaus mit dem Auftrag, herein mit der Antwort, daraus das PDF.
 *
 * Die Griffe stehen oben und offen; eingefügt wird in einem aufklappbaren
 * Teil darunter. Der eingefügte Text wird gespeichert und nicht bloß
 * durchgereicht: Man bessert ihn nach — ein Wort, ein Punkt weniger —, ohne
 * das LLM noch einmal zu fragen. Ob er auf eine Seite passt, sagt der Server
 * beim Speichern.
 */
function Ausschreibung({ thema, darfBearbeiten }: { thema: Praktikumsthema; darfBearbeiten: boolean }) {
  const neuLaden = useNeuLaden();
  const [text, setText] = useState(thema.ausschreibung);
  const [auftragOffen, setAuftragOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const geaendert = text.trim() !== thema.ausschreibung.trim();

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
        <KopierKnopf thema={thema} sonst={() => setAuftragOffen(true)} />
        <button
          type="button"
          className="knopf-still"
          onClick={() => setAuftragOffen((o) => !o)}
          aria-expanded={auftragOffen}
        >
          {auftragOffen ? "Auftrag verbergen" : "Auftrag ansehen"}
        </button>
        <PdfKnopf thema={thema} gesperrt={geaendert} />
      </div>

      {auftragOffen && <textarea className="feld auftragsfeld" rows={10} readOnly value={thema.auftrag} />}

      <details className="klappkarte thema-einfuegen" open={geaendert || undefined}>
        <summary>
          <Zeichen name="zeiger" klasse="zeiger-klapp" />
          <span className="klapptitel">
            {hatAusschreibung(thema) ? "Text der Ausschreibung" : "Antwort des LLM einfügen"}
          </span>
          {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
        </summary>
        <textarea
          className="feld"
          rows={12}
          aria-label="Ausschreibung"
          placeholder="Die Antwort des LLM hier einfügen …"
          value={text}
          readOnly={!darfBearbeiten}
          onChange={(e) => setText(e.target.value)}
        />
        {darfBearbeiten && (
          <div className="feld-reihe">
            <button type="button" className="knopf" onClick={speichern} disabled={laeuft || !geaendert}>
              <Zeichen name="haken" />
              Speichern
            </button>
          </div>
        )}
      </details>
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
  art,
  darfLoeschen,
  schliessen,
  nachLoeschen,
}: {
  thema: Praktikumsthema | null;
  /** Wohin ein neues Thema kommt — für ein bestehendes ohne Belang. */
  art: Themenart;
  darfLoeschen: boolean;
  schliessen: () => void;
  /** Auf der Seite des Themas: wohin danach, denn die Seite gibt es dann nicht mehr. */
  nachLoeschen?: () => void;
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
        body: JSON.stringify(thema ? daten : { ...daten, art }),
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
      nachLoeschen?.();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  async function zuDenIdeen() {
    if (!thema) return;
    setLaeuft(true);
    try {
      await hole(`/praktikumsthemen/${thema.id}/`, { method: "PATCH", body: JSON.stringify({ art: "idee" }) });
      neuLaden();
      melden("gut", `„${thema.titel}“ steht jetzt unter Sonstige Ideen.`);
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
              <h2>{thema ? thema.titel : art === "idee" ? "Neue Idee" : "Neues Thema"}</h2>
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
          // Der mildere Weg für eine Haupt-Aufgabe: Sie ist nicht falsch,
          // bloß gerade nicht dran — dann gehört sie zu den Ideen.
          milder={thema.art === "aufgabe" ? { text: "Zu den Ideen legen", tun: zuDenIdeen } : undefined}
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
