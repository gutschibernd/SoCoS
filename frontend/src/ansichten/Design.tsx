/**
 * Module · Designentscheidungen: die begründeten Entscheidungen für die
 * technische Dokumentation (ISO 13485, Designlenkung).
 *
 * Eine Liste, je Entscheidung eine Seite (`/module/design/7`). Das PDF
 * zeichnet der Server (`socos/services/designentscheidung.py`) — einzeln für
 * jede Entscheidung, gesamt für die Akte, dort ohne Entwürfe.
 *
 * **Eigene Optik wie die Projektplanung** (`.pl`, Farben `--rw-*`; Bernd,
 * 2026-10-15: weg vom Werkbank-Stil, wo er die Arbeit schlechter macht).
 * Daraus folgt mehr als die Farbe:
 *
 * - **Bearbeitet wird an Ort und Stelle**, nicht in einem Fenster. Eine
 *   Begründung wächst über Wochen, Satz für Satz — wer für jeden Satz ein
 *   Fenster mit zehn Feldern öffnet, schreibt ihn irgendwann nicht mehr hin.
 * - **Was zu „entschieden" fehlt, steht neben dem Stand**, bevor man umstellt.
 *   Die Liste kommt vom Server (`fehlt`), aus derselben Regel, mit der er
 *   abweist.
 * - **Eine neue Entscheidung entsteht in der Liste**: Titel tippen, Enter —
 *   und man steht auf ihrer Seite.
 *
 * **Eine ersetzte Entscheidung bleibt in der Liste.** Sie ist kein
 * Archivstück, sondern Teil der Begründungskette: Wer fragt, warum DE-012
 * so ist, will auch DE-004 sehen, die sie abgelöst hat.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import { datumIn } from "../basis/aufgaben";
import {
  useDesignentscheidungen,
  useNeuLaden,
  type Designentscheidung,
  type Entscheidungsstand,
  type Ich,
} from "../basis/daten";
import { ABSCHNITTE, kiAbgleich, kiAntwortLesen, kiBefehl } from "../basis/designtext";
import { melden } from "../basis/meldungen";
import { entscheidungsZahl } from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Feldtext } from "../bausteine/Feldtext";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

const WEG = "design";

const STAENDE: { wert: Entscheidungsstand; text: string; mehrzahl: string }[] = [
  { wert: "entwurf", text: "Entwurf", mehrzahl: "Entwürfe" },
  { wert: "entschieden", text: "Entschieden", mehrzahl: "Entschieden" },
  { wert: "ersetzt", text: "Ersetzt", mehrzahl: "Ersetzt" },
];

/** Wie ein fehlendes Pflichtfeld in der Liste daneben heißt. Die Regel selbst steht am Server. */
const PFLICHTNAME: Record<string, string> = {
  entschieden_am: "Datum der Entscheidung",
  entscheidung: "Entscheidung",
  begruendung: "Begründung",
  sicherheit: "Auswirkung auf die Sicherheit",
};

/**
 * Was zum Entscheiden noch fehlt, ohne das Datum: Das setzt „Entschieden"
 * selbst auf heute. Liste und Seite zählen damit dasselbe.
 */
const offenZumEntscheiden = (e: Designentscheidung) =>
  e.stand === "entwurf" ? e.fehlt.filter((f) => f !== "entschieden_am") : [];

const tagText = (d: string) => d.split("-").map(Number).reverse().join(".");
const standText = (wert: Entscheidungsstand) => STAENDE.find((s) => s.wert === wert)?.text ?? wert;

function Standpille({ wert }: { wert: Entscheidungsstand }) {
  return (
    <span className="de-stand" data-stand={wert}>
      {standText(wert)}
    </span>
  );
}

/** Speichert einen Teil einer Entscheidung. Wirft, wenn der Server ablehnt — `Feldtext` setzt dann zurück. */
function useSpeichern(e: Designentscheidung) {
  const neuLaden = useNeuLaden();
  return async (teil: Partial<Designentscheidung>) => {
    await hole(`/designentscheidungen/${e.id}/`, { method: "PATCH", body: JSON.stringify(teil) });
    neuLaden();
  };
}

/* --- Die Liste -------------------------------------------------------------- */

type Filter = "alle" | Entscheidungsstand;

/** Findet in Kennung, Titel und allen Texten — wer „R-12" sucht, findet jede Entscheidung, die darauf verweist. */
function passt(e: Designentscheidung, suche: string) {
  const s = suche.trim().toLowerCase();
  if (!s) return true;
  return [e.kennung, e.titel, ...ABSCHNITTE.map((a) => e[a.feld])].some((t) => t.toLowerCase().includes(s));
}

export function Designliste({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const liste = useDesignentscheidungen();
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  const alle = liste.data;
  const zahl = (f: Filter) => (f === "alle" ? alle.length : alle.filter((e) => e.stand === f).length);
  const gezeigt = alle.filter((e) => (filter === "alle" || e.stand === filter) && passt(e, suche));
  const entwuerfe = zahl("entwurf");
  const fuerAkte = alle.length - entwuerfe;
  const oeffnen = (e: { id: number }) => wechseln("module", `${WEG}/${e.id}`);

  return (
    <div className="pl de">
      <header className="pl-kopf">
        <div className="pl-marke">
          <span className="pl-eyebrow">Technische Dokumentation</span>
          <h1 className="pl-titel">Designentscheidungen</h1>
          <span className="pl-sub">
            {entscheidungsZahl(alle.length)}
            {entwuerfe > 0 && ` · ${entwuerfe} ${entwuerfe === 1 ? "Entwurf" : "Entwürfe"}`}
          </span>
        </div>
        {/* Ein Link und kein fetch: Das PDF soll im Download-Ordner landen.
            Ohne eine entschiedene gäbe es nichts für die Akte. */}
        {fuerAkte > 0 ? (
          <a className="pl-knopf" href="/api/designentscheidungen/gesamt/">
            <Zeichen name="pdf" />
            PDF für die Akte
          </a>
        ) : (
          alle.length > 0 && (
            <button type="button" className="pl-knopf" disabled title="Noch keine Entscheidung ist entschieden.">
              <Zeichen name="pdf" />
              PDF für die Akte
            </button>
          )
        )}
      </header>

      <section className="pl-tafel">
        {alle.length > 0 && (
          <div className="pl-leiste">
            <div className="pl-seg pl-seg-klein" role="group" aria-label="Stand">
              {(["alle", ...STAENDE.map((s) => s.wert)] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "alle" ? "Alle" : STAENDE.find((s) => s.wert === f)?.mehrzahl}{" "}
                  <span className="zahl">{zahl(f)}</span>
                </button>
              ))}
            </div>
            <label className="de-suche">
              <Zeichen name="lupe" />
              <input
                type="search"
                value={suche}
                placeholder="Suchen, auch in den Texten"
                aria-label="Suchen"
                onChange={(ev) => setSuche(ev.target.value)}
              />
            </label>
          </div>
        )}

        {alle.length === 0 ? (
          <p className="pl-leer">Noch keine Entscheidung. Ein Titel genügt für den Anfang.</p>
        ) : gezeigt.length === 0 ? (
          <p className="pl-leer">
            Nichts gefunden.{" "}
            <button
              type="button"
              className="de-textknopf"
              onClick={() => {
                setFilter("alle");
                setSuche("");
              }}
            >
              Alle zeigen
            </button>
          </p>
        ) : (
          <ul className="de-liste">
            {gezeigt.map((e) => (
              <li key={e.id}>
                <a
                  className="de-zeile"
                  data-stand={e.stand}
                  href={`/module/${WEG}/${e.id}`}
                  onClick={(ev) => {
                    ev.preventDefault();
                    oeffnen(e);
                  }}
                >
                  <span className="pl-nr">{e.kennung}</span>
                  <span className="de-zeilentitel">
                    <b>{e.titel}</b>
                    <span>
                      {e.entscheidung.trim()
                        ? e.entscheidung.trim().split("\n")[0]
                        : "Noch keine Entscheidung eingetragen"}
                    </span>
                  </span>
                  <span className="de-zeilenstand">
                    <Standpille wert={e.stand} />
                    <span className="de-zeilendatum">
                      {e.entschieden_am
                        ? tagText(e.entschieden_am)
                        : offenZumEntscheiden(e).length > 0 && `noch ${offenZumEntscheiden(e).length} offen`}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {ich.darf.bearbeiten && <NeueEntscheidung angelegt={oeffnen} />}
      </section>
    </div>
  );
}

/** Die letzte Zeile der Liste: Titel tippen, Enter — und man steht auf der neuen Seite. */
function NeueEntscheidung({ angelegt }: { angelegt: (e: Designentscheidung) => void }) {
  const neuLaden = useNeuLaden();
  const [titel, setTitel] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function anlegen() {
    const t = titel.trim();
    if (!t || laeuft) return;
    setLaeuft(true);
    try {
      const neu = await hole<Designentscheidung>("/designentscheidungen/", {
        method: "POST",
        body: JSON.stringify({ titel: t }),
      });
      neuLaden();
      melden("gut", `${neu.kennung} „${neu.titel}“ ist angelegt.`);
      angelegt(neu);
    } catch {
      // `hole` hat den Grund schon gemeldet; der Titel bleibt stehen.
      setLaeuft(false);
    }
  }

  return (
    <form
      className="pl-neu"
      onSubmit={(ev) => {
        ev.preventDefault();
        anlegen();
      }}
    >
      <Zeichen name="plus" />
      <input
        value={titel}
        maxLength={200}
        placeholder="Neue Entscheidung: Titel eintippen, Enter"
        aria-label="Titel einer neuen Entscheidung"
        disabled={laeuft}
        onChange={(ev) => setTitel(ev.target.value)}
      />
    </form>
  );
}

/* --- Die Seite einer Entscheidung ------------------------------------------ */

export function Entscheidungsseite({ ich, id, wechseln }: { ich: Ich; id: number; wechseln: Wechseln }) {
  const liste = useDesignentscheidungen();

  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  const e = liste.data.find((x) => x.id === id);
  if (!e) {
    return (
      <div className="pl de">
        <section className="pl-tafel">
          <h2>Diese Entscheidung gibt es nicht mehr</h2>
          <p className="pl-leer">Sie wurde entfernt. Ein Admin kann sie wiederherstellen.</p>
          <button type="button" className="pl-knopf-leise" onClick={() => wechseln("module", WEG)}>
            Zu den Designentscheidungen
          </button>
        </section>
      </div>
    );
  }

  return <Entscheidung key={e.id} e={e} ich={ich} wechseln={wechseln} />;
}

function Entscheidung({ e, ich, wechseln }: { e: Designentscheidung; ich: Ich; wechseln: Wechseln }) {
  const speichern = useSpeichern(e);
  const darf = ich.darf.bearbeiten;
  const [kiOffen, setKiOffen] = useState(false);

  async function fuerKiKopieren() {
    try {
      await navigator.clipboard.writeText(kiBefehl(e));
      melden("gut", "Kopiert. In die KI einfügen, ihre Antwort unten zurück.");
      setKiOffen(true);
    } catch {
      melden("fehler", "Der Browser hat das Kopieren nicht erlaubt.");
    }
  }

  return (
    <div className="pl de">
      <header className="pl-kopf">
        <div className="pl-marke">
          <a
            className="pl-eyebrow"
            href={`/module/${WEG}`}
            onClick={(ev) => {
              ev.preventDefault();
              wechseln("module", WEG);
            }}
          >
            Designentscheidungen
          </a>
          <h1 className="pl-titel de-titel">
            <span className="de-kennung">{e.kennung}</span>
            <Feldtext wert={e.titel} aendern={darf} speichern={(titel) => speichern({ titel })} />
          </h1>
          <span className="pl-sub de-kopfstand">
            <Standpille wert={e.stand} />
            Zuletzt geändert {new Date(e.geaendert_am).toLocaleDateString("de-AT")}
          </span>
        </div>
        <div className="de-kopfknoepfe">
          {darf && (
            <button type="button" className="pl-knopf-leise" onClick={fuerKiKopieren}>
              <Zeichen name="kopie" />
              Mit KI überarbeiten
            </button>
          )}
          <a className="pl-knopf-leise" href={`/api/designentscheidungen/${e.id}/pdf/`}>
            <Zeichen name="pdf" />
            PDF
          </a>
        </div>
      </header>

      <div className="de-raster">
        <Standtafel e={e} ich={ich} wechseln={wechseln} />

        <section className="pl-tafel de-haupt">
          {kiOffen && <KiAntwort e={e} erneutKopieren={fuerKiKopieren} schliessen={() => setKiOffen(false)} />}
          {ABSCHNITTE.map((a) => (
            <div key={a.feld} id={`de-${a.feld}`} className="de-abschnitt" data-feld={a.feld}>
              <h2>{a.titel}</h2>
              <Feldtext
                wert={e[a.feld]}
                aendern={darf}
                mehrzeilig
                zeilen={a.feld === "verweise" ? 4 : 7}
                platzhalter={a.frage}
                klasse="de-text"
                speichern={(text) => speichern({ [a.feld]: text } as Partial<Designentscheidung>)}
              />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/**
 * Das Feld für die Antwort der KI. Was es erkennt, steht darunter, bevor
 * man übernimmt — eine KI, die einen Trenner verschluckt hat, soll man sehen,
 * nicht erst im PDF. Übernommen wird in **einem** PATCH: Im Änderungsprotokoll
 * steht damit ein Eintrag mit alt → neu je Feld, und wer zurück will, findet
 * den alten Text dort.
 */
function KiAntwort({
  e,
  erneutKopieren,
  schliessen,
}: {
  e: Designentscheidung;
  erneutKopieren: () => void;
  schliessen: () => void;
}) {
  const neuLaden = useNeuLaden();
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const { felder, unbekannt } = kiAntwortLesen(text);
  const abgleich = kiAbgleich(e, felder);
  const geaendert = abgleich.filter((z) => z.geaendert);

  async function uebernehmen() {
    if (geaendert.length === 0 || laeuft) return;
    setLaeuft(true);
    try {
      await hole(`/designentscheidungen/${e.id}/`, {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(geaendert.map((z) => [z.feld, z.neu]))),
      });
      neuLaden();
      melden("gut", geaendert.length === 1 ? "Ein Feld übernommen." : `${geaendert.length} Felder übernommen.`);
      schliessen();
    } catch {
      // `hole` hat den Grund gemeldet; der Text bleibt zum Nachbessern stehen.
      setLaeuft(false);
    }
  }

  return (
    <div className="de-ki">
      <div className="de-ki-kopf">
        <h2>Antwort der KI</h2>
        <button type="button" className="de-textknopf" onClick={erneutKopieren}>
          Nochmal kopieren
        </button>
      </div>
      <textarea
        className="feld"
        rows={8}
        value={text}
        autoFocus
        placeholder="Antwort der KI hier einfügen, samt der Zeilen mit ==="
        aria-label="Antwort der KI"
        onChange={(ev) => setText(ev.target.value)}
      />
      {text.trim() && (
        <ul className="de-ki-felder">
          {abgleich.length === 0 && (
            <li data-ton="schlecht">Keine Abschnitte erkannt. Die Zeilen mit === müssen in der Antwort stehen.</li>
          )}
          {abgleich.map((z) => (
            <li key={z.feld} data-ton={z.geaendert ? "neu" : undefined}>
              {z.titel}
              <span>{z.geaendert ? "wird ersetzt" : "unverändert"}</span>
            </li>
          ))}
          {unbekannt.map((n) => (
            <li key={n} data-ton="schlecht">
              {n}
              <span>gibt es nicht, bleibt weg</span>
            </li>
          ))}
        </ul>
      )}
      <div className="de-ki-knoepfe">
        <button type="button" className="pl-knopf" disabled={geaendert.length === 0 || laeuft} onClick={uebernehmen}>
          <Zeichen name="haken" />
          {geaendert.length > 1 ? `${geaendert.length} Felder übernehmen` : "Übernehmen"}
        </button>
        <button type="button" className="pl-knopf-leise" onClick={schliessen}>
          Schließen
        </button>
      </div>
    </div>
  );
}

/**
 * Stand, Datum, wer — und was zu „entschieden" noch fehlt. Steht am Rand,
 * damit man beim Schreiben sieht, wie weit die Entscheidung ist.
 */
function Standtafel({ e, ich, wechseln }: { e: Designentscheidung; ich: Ich; wechseln: Wechseln }) {
  const speichern = useSpeichern(e);
  const neuLaden = useNeuLaden();
  const darf = ich.darf.bearbeiten;
  const [laeuft, setLaeuft] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  async function standSetzen(stand: Entscheidungsstand) {
    if (stand === e.stand || laeuft) return;
    setLaeuft(true);
    try {
      // Wer auf „entschieden" stellt, hat meist heute entschieden.
      await speichern({ stand, ...(stand !== "entwurf" && !e.entschieden_am ? { entschieden_am: datumIn(0) } : {}) });
      melden("gut", `${e.kennung} steht jetzt auf „${standText(stand)}“.`);
    } catch {
      // `hole` hat gesagt, was fehlt; die Liste darunter zeigt es auch.
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    setLaeuft(true);
    try {
      await hole(`/designentscheidungen/${e.id}/`, { method: "DELETE" });
      neuLaden();
      wechseln("module", WEG);
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  // Eine entschiedene kann nichts mehr fehlen — der Server hätte sie nicht angenommen.
  const fehlt = offenZumEntscheiden(e);

  return (
    <aside className="pl-tafel de-seite">
      <h2>Stand</h2>
      <div className="pl-seg de-standwahl" role="group" aria-label="Stand">
        {STAENDE.map((s) => (
          <button
            key={s.wert}
            type="button"
            aria-pressed={e.stand === s.wert}
            data-stand={s.wert}
            disabled={!darf || laeuft}
            onClick={() => standSetzen(s.wert)}
          >
            {s.text}
          </button>
        ))}
      </div>

      {e.stand === "entwurf" && (
        <div className="de-pruefliste">
          {fehlt.length === 0 ? (
            <p className="de-bereit">
              <Zeichen name="haken" />
              Alles da, um sie zu entscheiden.
            </p>
          ) : (
            <>
              <span className="pl-eyebrow">Fehlt zum Entscheiden</span>
              <ul>
                {fehlt.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById(`de-${f}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      {PFLICHTNAME[f] ?? f}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <label className="de-feld">
        <span className="pl-eyebrow">Entschieden am</span>
        <Datumsfeld
          wert={e.entschieden_am}
          beschriftung="Entschieden am"
          darf={darf}
          speichern={async (entschieden_am) => {
            try {
              await speichern({ entschieden_am });
            } catch {
              // Gemeldet hat `hole`; das Feld springt mit dem nächsten Laden zurück.
            }
          }}
        />
      </label>
      <div className="de-feld">
        <span className="pl-eyebrow">Entschieden von</span>
        <Feldtext
          wert={e.entschieden_von}
          aendern={darf}
          platzhalter="Namen, auch ohne Konto"
          speichern={(entschieden_von) => speichern({ entschieden_von })}
        />
      </div>

      {ich.darf.loeschen && (
        <button type="button" className="pl-knopf-leise de-entfernen" data-ton="schlecht" onClick={() => setFragtLoeschen(true)}>
          <Zeichen name="korb" />
          Entfernen
        </button>
      )}

      {fragtLoeschen && (
        <Loeschdialog
          name={`${e.kennung} ${e.titel}`}
          was="Die Entscheidung samt ihrer Begründung"
          // Der mildere Weg: Eine überholte Entscheidung ist nicht falsch,
          // sondern abgelöst — und die Akte soll zeigen, wovon.
          milder={
            e.stand === "entschieden"
              ? {
                  text: "Als ersetzt führen",
                  tun: async () => {
                    await standSetzen("ersetzt");
                    setFragtLoeschen(false);
                  },
                }
              : undefined
          }
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}
    </aside>
  );
}
