/**
 * Module · Designentscheidungen: die begründeten Entscheidungen für die
 * technische Dokumentation (ISO 13485, Designlenkung).
 *
 * Eine Liste, je Entscheidung eine Seite (`/module/design/7`), bearbeitet
 * wird in einem Fenster. Das PDF zeichnet der Server
 * (`socos/services/designentscheidung.py`) — einzeln für jede Entscheidung,
 * gesamt für die Akte, dort ohne Entwürfe.
 *
 * **Eine ersetzte Entscheidung bleibt in der Liste**, grau. Sie ist kein
 * Archivstück, sondern Teil der Begründungskette: Wer fragt, warum DE-012
 * so ist, will auch DE-004 sehen, die sie abgelöst hat.
 */

import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import { datumIn } from "../basis/aufgaben";
import {
  useDesignentscheidungen,
  useNeuLaden,
  type Designentscheidung,
  type Entscheidungsstand,
  type Ich,
} from "../basis/daten";
import { melden } from "../basis/meldungen";
import { entscheidungsZahl, punkteAusText } from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

const WEG = "design";

const STAENDE: { wert: Entscheidungsstand; text: string; klasse: string }[] = [
  { wert: "entwurf", text: "Entwurf", klasse: "stand-offen" },
  { wert: "entschieden", text: "Entschieden", klasse: "stand-getroffen" },
  { wert: "ersetzt", text: "Ersetzt", klasse: "stand-leer" },
];

/** Die Abschnitte in der Reihenfolge des PDF — dort steht dieselbe Liste. */
const ABSCHNITTE: { feld: Textfeld; titel: string; frage: string }[] = [
  { feld: "ausgangslage", titel: "Ausgangslage", frage: "Welches Problem, welche Anforderung, welcher Befund?" },
  { feld: "alternativen", titel: "Betrachtete Alternativen", frage: "Welche Wege standen zur Wahl? Einer je Zeile mit - davor." },
  { feld: "entscheidung", titel: "Entscheidung", frage: "Was wird so gemacht?" },
  { feld: "begruendung", titel: "Begründung", frage: "Warum dieser Weg und nicht die anderen?" },
  {
    feld: "sicherheit",
    titel: "Auswirkung auf die Sicherheit",
    frage: "Welches Risiko sinkt, welches entsteht? Auch „keine, weil …“ ist eine Antwort.",
  },
];

type Textfeld = "ausgangslage" | "alternativen" | "entscheidung" | "begruendung" | "sicherheit";

const tagText = (d: string) => d.split("-").map(Number).reverse().join(".");
const stand = (wert: Entscheidungsstand) => STAENDE.find((s) => s.wert === wert) ?? STAENDE[0];

function Standmarke({ wert }: { wert: Entscheidungsstand }) {
  const s = stand(wert);
  return <span className={`stand ${s.klasse}`}>{s.text}</span>;
}

/* --- Die Liste -------------------------------------------------------------- */

export function Designliste({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const liste = useDesignentscheidungen();
  const [neu, setNeu] = useState(false);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  const alle = liste.data;
  const oeffnen = (e: Designentscheidung) => wechseln("module", `${WEG}/${e.id}`);

  const neuKnopf = ich.darf.bearbeiten && (
    <button type="button" className="knopf" onClick={() => setNeu(true)}>
      <Zeichen name="plus" />
      Entscheidung
    </button>
  );

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>Designentscheidungen</b>
          <span>{entscheidungsZahl(alle.length)}</span>
        </div>
        {alle.length > 0 && (
          <div className="vorhaben-aktionen">
            {/* Ein Link und kein fetch: Das PDF soll im Download-Ordner
                landen. Ohne eine entschiedene gäbe es nichts für die Akte. */}
            {alle.some((e) => e.stand !== "entwurf") ? (
              <a className="knopf-still" href="/api/designentscheidungen/gesamt/">
                <Zeichen name="pdf" />
                PDF für die Akte
              </a>
            ) : (
              <button type="button" className="knopf-still" disabled>
                <Zeichen name="pdf" />
                PDF für die Akte
              </button>
            )}
            {neuKnopf}
          </div>
        )}
      </div>

      {alle.length === 0 ? (
        <div className="karte leerstelle">
          <b>Noch keine Entscheidung</b>
          <p>Ein Titel genügt für den Anfang. Entschieden ist sie, wenn Begründung und Sicherheit dastehen.</p>
          {neuKnopf}
        </div>
      ) : (
        <ul className="karte entscheidungen">
          {alle.map((e) => (
            <li key={e.id} data-stand={e.stand}>
              <a
                className="entscheidung-link"
                href={`/module/${WEG}/${e.id}`}
                onClick={(ev) => {
                  ev.preventDefault();
                  oeffnen(e);
                }}
              >
                <span className="entscheidung-kennung">{e.kennung}</span>
                <span className="entscheidung-titel">
                  <b>{e.titel}</b>
                  {e.entschieden_am && (
                    <span>
                      {tagText(e.entschieden_am)}
                      {e.entschieden_von && ` · ${e.entschieden_von}`}
                    </span>
                  )}
                </span>
                <Standmarke wert={e.stand} />
              </a>
            </li>
          ))}
        </ul>
      )}

      {neu && (
        <Entscheidungsfenster
          entscheidung={null}
          darfLoeschen={false}
          schliessen={() => setNeu(false)}
          angelegt={oeffnen}
        />
      )}
    </div>
  );
}

/* --- Die Seite einer Entscheidung ------------------------------------------ */

export function Entscheidungsseite({ ich, id, wechseln }: { ich: Ich; id: number; wechseln: Wechseln }) {
  const liste = useDesignentscheidungen();
  const [bearbeiten, setBearbeiten] = useState(false);

  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  const e = liste.data.find((x) => x.id === id);
  if (!e) {
    return (
      <div className="karte leerstelle">
        <b>Diese Entscheidung gibt es nicht mehr</b>
        <p>Sie wurde entfernt. Ein Admin kann sie wiederherstellen.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("module", WEG)}>
          Zu den Designentscheidungen
        </button>
      </div>
    );
  }

  const verweise = punkteAusText(e.verweise);

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b className="thema-titel">
            <span className="entscheidung-kennung">{e.kennung}</span> {e.titel}
          </b>
          <span>
            {stand(e.stand).text}
            {e.entschieden_am && ` · entschieden am ${tagText(e.entschieden_am)}`}
            {e.entschieden_von && ` von ${e.entschieden_von}`}
          </span>
        </div>
        <div className="vorhaben-aktionen">
          <a className="knopf-still" href={`/api/designentscheidungen/${e.id}/pdf/`}>
            <Zeichen name="pdf" />
            PDF
          </a>
          {ich.darf.bearbeiten && (
            <button type="button" className="knopf-still" onClick={() => setBearbeiten(true)}>
              <Zeichen name="stift" />
              Bearbeiten
            </button>
          )}
        </div>
      </div>

      <section className="karte thema">
        {ABSCHNITTE.map((a, i) => (
          <div key={a.feld}>
            <h2 className={i === 0 ? "beschriftung-klein" : "beschriftung-klein thema-zwischentitel"}>{a.titel}</h2>
            {e[a.feld].trim() ? <p className="thema-text">{e[a.feld]}</p> : <p className="thema-leer">Noch nichts.</p>}
          </div>
        ))}
        <h2 className="beschriftung-klein thema-zwischentitel">Verweise</h2>
        {verweise.length > 0 ? (
          <ul className="thema-punkte">
            {verweise.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : (
          <p className="thema-leer">Noch keine.</p>
        )}
      </section>

      {bearbeiten && (
        <Entscheidungsfenster
          entscheidung={e}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setBearbeiten(false)}
          nachLoeschen={() => wechseln("module", WEG)}
        />
      )}
    </div>
  );
}

/* --- Anlegen und bearbeiten -------------------------------------------------- */

type Entwurf = Pick<
  Designentscheidung,
  "titel" | "stand" | "entschieden_von" | "verweise" | Textfeld
> & { entschieden_am: string };

function anfangVon(e: Designentscheidung | null): Entwurf {
  return {
    titel: e?.titel ?? "",
    stand: e?.stand ?? "entwurf",
    entschieden_am: e?.entschieden_am ?? "",
    entschieden_von: e?.entschieden_von ?? "",
    ausgangslage: e?.ausgangslage ?? "",
    alternativen: e?.alternativen ?? "",
    entscheidung: e?.entscheidung ?? "",
    begruendung: e?.begruendung ?? "",
    sicherheit: e?.sicherheit ?? "",
    verweise: e?.verweise ?? "",
  };
}

/**
 * Alle Felder in einem Fenster, mit einem Speichern. Was zu „entschieden"
 * fehlt, sagt der Server beim Speichern — dort steht die Regel, und das
 * Fenster bleibt dann offen, damit nichts verloren geht.
 */
function Entscheidungsfenster({
  entscheidung,
  darfLoeschen,
  schliessen,
  angelegt,
  nachLoeschen,
}: {
  entscheidung: Designentscheidung | null;
  darfLoeschen: boolean;
  schliessen: () => void;
  /** Nach dem Anlegen: auf die Seite der neuen Entscheidung. */
  angelegt?: (e: Designentscheidung) => void;
  /** Auf der Seite der Entscheidung: wohin danach, denn die Seite gibt es dann nicht mehr. */
  nachLoeschen?: () => void;
}) {
  const neuLaden = useNeuLaden();
  const anfang = anfangVon(entscheidung);
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
      ...Object.fromEntries(Object.entries(entwurf).map(([k, v]) => [k, v.trim()])),
      entschieden_am: entwurf.entschieden_am || null,
    };
    try {
      const antwort = await hole<Designentscheidung>(
        entscheidung ? `/designentscheidungen/${entscheidung.id}/` : "/designentscheidungen/",
        { method: entscheidung ? "PATCH" : "POST", body: JSON.stringify(daten) },
      );
      neuLaden();
      melden("gut", `${antwort.kennung} „${antwort.titel}“ ist gespeichert.`);
      schliessen();
      if (!entscheidung) angelegt?.(antwort);
    } catch {
      // Das Fenster bleibt offen — sonst wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!entscheidung) return;
    setLaeuft(true);
    try {
      await hole(`/designentscheidungen/${entscheidung.id}/`, { method: "DELETE" });
      neuLaden();
      schliessen();
      nachLoeschen?.();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  async function alsErsetzt() {
    if (!entscheidung) return;
    setLaeuft(true);
    try {
      await hole(`/designentscheidungen/${entscheidung.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ stand: "ersetzt" }),
      });
      neuLaden();
      melden("gut", `${entscheidung.kennung} steht jetzt als ersetzt da.`);
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
      <div className="dialog-grund" role="dialog" aria-modal="true" aria-label="Designentscheidung" onClick={zurueck}>
        <div className="dialog dialog-arbeit" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>{entscheidung ? `${entscheidung.kennung} ${entscheidung.titel}` : "Neue Entscheidung"}</h2>
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
                maxLength={200}
                autoFocus={!entscheidung}
                placeholder="z. B. Dosierkammer aus PP statt PET"
                onChange={(e) => setze({ titel: e.target.value })}
              />
            </label>

            <div className="profilfeld">
              <span className="beschriftung-klein">Stand</span>
              <div className="spannenwahl" role="group" aria-label="Stand">
                {STAENDE.map((s) => (
                  <button
                    key={s.wert}
                    type="button"
                    aria-pressed={entwurf.stand === s.wert}
                    onClick={() =>
                      setze({
                        stand: s.wert,
                        // Wer auf „entschieden" stellt, hat meist heute entschieden.
                        ...(s.wert !== "entwurf" && !entwurf.entschieden_am ? { entschieden_am: datumIn(0) } : {}),
                      })
                    }
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>

            <div className="entscheidung-felder-reihe">
              <label className="profilfeld">
                <span className="beschriftung-klein">Entschieden am</span>
                <input
                  type="date"
                  className="feld"
                  value={entwurf.entschieden_am}
                  onChange={(e) => setze({ entschieden_am: e.target.value })}
                />
              </label>
              <label className="profilfeld">
                <span className="beschriftung-klein">Entschieden von</span>
                <input
                  className="feld"
                  value={entwurf.entschieden_von}
                  maxLength={200}
                  placeholder="Namen, auch ohne Konto"
                  onChange={(e) => setze({ entschieden_von: e.target.value })}
                />
              </label>
            </div>

            {ABSCHNITTE.map((a) => (
              <label key={a.feld} className="profilfeld">
                <span className="beschriftung-klein">{a.titel}</span>
                <textarea
                  className="feld"
                  rows={a.feld === "entscheidung" ? 3 : 4}
                  value={entwurf[a.feld]}
                  placeholder={a.frage}
                  onChange={(e) => setze({ [a.feld]: e.target.value })}
                />
              </label>
            ))}

            <label className="profilfeld">
              <span className="beschriftung-klein">Verweise</span>
              <textarea
                className="feld"
                rows={3}
                value={entwurf.verweise}
                placeholder={"Einer je Zeile\nRisiko R-12, Anforderung A-3, ISO 14971, Prüfbericht …"}
                onChange={(e) => setze({ verweise: e.target.value })}
              />
            </label>

            {entscheidung && darfLoeschen && (
              <div className="persona-fuss">
                <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
                  <Zeichen name="korb" />
                  Entscheidung entfernen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {fragtLoeschen && entscheidung && (
        <Loeschdialog
          name={`${entscheidung.kennung} ${entscheidung.titel}`}
          was="Die Entscheidung samt ihrer Begründung"
          // Der mildere Weg: Eine überholte Entscheidung ist nicht falsch,
          // sondern abgelöst — und die Akte soll zeigen, wovon.
          milder={entscheidung.stand === "entschieden" ? { text: "Als ersetzt führen", tun: alsErsetzt } : undefined}
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>An der Entscheidung ist etwas geändert. Wer jetzt schließt, hat wieder den Stand von vorher.</p>
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
