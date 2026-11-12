/**
 * Bestellungen: Sammelbestellungen je Lieferant (Bernd, 2026-11-12).
 *
 * `/module/bestellungen` ist die Liste der Lieferanten, `/module/bestellungen/3`
 * die Seite eines Lieferanten: der Korb, das Sortiment, die Mails mit dem
 * Hersteller und das Archiv dessen, was schon bestellt ist.
 *
 * **Ein Feld für Link oder Name.** Wer einen Link einfügt, bekommt den Namen
 * vorgeschlagen (vom Server, socos/services/produktlink.py); wer keinen hat —
 * die Pumpe beim Händler —, tippt den Namen. Zwei Felder hätten bei jedem
 * Hineinlegen gefragt, welches man nimmt.
 *
 * **Der Korb ist die Seite**, nicht ein Fenster darüber: Hineinlegen, Menge
 * ändern und herausnehmen gehen an Ort und Stelle. Das Sortiment steht
 * daneben, ein Klick legt ein Stück mehr hinein.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { hole } from "../basis/api";
import { datumIn } from "../basis/aufgaben";
import {
  BESTELLWEGE,
  bestellwegVon,
  gleicherLink,
  istLink,
  kurzerLink,
  sortiment,
  tagText,
  zeilenZahl,
  zusammenfassung,
  zusammenfassungsKnopf,
} from "../basis/bestellungen";
import {
  useLieferant,
  useLieferanten,
  useNeuLaden,
  type Bestellartikel,
  type Bestellposition,
  type Bestellung,
  type Bestellweg,
  type Ich,
  type Lieferant,
  type Lieferantenseite,
} from "../basis/daten";
import { melden } from "../basis/meldungen";
import type { Wechseln } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Anhangkarte } from "../bausteine/Anhangkarte";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Hinweis } from "../bausteine/Hinweis";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

const WEG = "bestellungen";

/* --- Die Liste der Lieferanten ------------------------------------------- */

export function Lieferantenliste({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const lieferanten = useLieferanten();
  const [neu, setNeu] = useState(false);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!lieferanten.data) return <Zustand abfrage={lieferanten} erneut={() => lieferanten.refetch()} />;
  const liste = lieferanten.data;
  const darf = ich.darf.bearbeiten;
  const oeffnen = (id: number) => wechseln("module", `${WEG}/${id}`);

  const anlegen = darf && (
    <button type="button" className="knopf" onClick={() => setNeu(true)}>
      <Zeichen name="plus" />
      Lieferant
    </button>
  );

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>Lieferanten</b>
          <span>
            {liste.length === 1 ? "1 Lieferant" : `${liste.length} Lieferanten`}
            {liste.some((l) => l.im_korb > 0) &&
              ` · bei ${liste.filter((l) => l.im_korb > 0).length} liegt etwas im Korb`}
          </span>
        </div>
        {liste.length > 0 && <div className="vorhaben-aktionen">{anlegen}</div>}
      </div>

      {liste.length === 0 ? (
        <div className="karte leerstelle">
          <b>Noch kein Lieferant</b>
          <p>Ein Onlineshop wie Bambu Lab, eine Plattform wie Alibaba oder ein Händler, bei dem ihr ein Angebot anfragt.</p>
          {anlegen}
        </div>
      ) : (
        <div className="karte">
          <table className="tabelle lieferanten">
            <thead>
              <tr>
                <th>Lieferant</th>
                <th>Bestellweg</th>
                <th>Im Korb</th>
                <th>Zuletzt bestellt</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.id}>
                  <td data-spalte="Lieferant">
                    <a
                      className="lieferant-name"
                      href={`/module/${WEG}/${l.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        oeffnen(l.id);
                      }}
                    >
                      <b>{l.name}</b>
                      {l.link && <span className="unterzeile">{kurzerLink(l.link)}</span>}
                    </a>
                  </td>
                  <td data-spalte="Bestellweg">{bestellwegVon(l.art).titel}</td>
                  <td data-spalte="Im Korb">
                    {l.im_korb > 0 ? <span className="status status-laeuft">{zeilenZahl(l.im_korb)}</span> : "leer"}
                  </td>
                  <td data-spalte="Zuletzt bestellt" className="zahl">
                    {l.zuletzt_bestellt ? tagText(l.zuletzt_bestellt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {neu && (
        <Lieferantfenster
          lieferant={null}
          darfLoeschen={false}
          schliessen={() => setNeu(false)}
          angelegt={(id) => oeffnen(id)}
        />
      )}
    </div>
  );
}

/* --- Die Seite eines Lieferanten ----------------------------------------- */

export function Lieferantenseite({
  ich,
  id,
  zurueck,
}: {
  ich: Ich;
  id: number;
  /** Nach dem Entfernen: dorthin, woher man kam. */
  zurueck: () => void;
}) {
  const seite = useLieferant(id);
  const neuLaden = useNeuLaden();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [zuEntfernen, setZuEntfernen] = useState<{ pfad: string; name: string; was: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  if (!seite.data) return <Zustand abfrage={seite} erneut={() => seite.refetch()} />;
  const l = seite.data;

  async function entfernen() {
    if (!zuEntfernen) return;
    setLaeuft(true);
    try {
      await hole(zuEntfernen.pfad, { method: "DELETE" });
      neuLaden();
    } catch {
      // `hole` hat den Grund gemeldet.
    }
    setLaeuft(false);
    setZuEntfernen(null);
  }

  return (
    <div className="spalte">
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{l.name}</b>
          <span>
            {bestellwegVon(l.art).titel}
            {l.link && (
              <>
                {" · "}
                <a className="lieferant-link" href={l.link} target="_blank" rel="noopener noreferrer">
                  {kurzerLink(l.link)}
                </a>
              </>
            )}
          </span>
          {l.notiz.trim() && <span className="lieferant-notiz">{l.notiz}</span>}
        </div>
        {ich.darf.bearbeiten && (
          <div className="vorhaben-aktionen">
            <button type="button" className="knopf-still" onClick={() => setBearbeiten(true)}>
              <Zeichen name="stift" />
              Bearbeiten
            </button>
          </div>
        )}
      </div>

      <div className="bestell-raster">
        <div className="spalte">
          <Korbkarte lieferant={l} ich={ich} entfernen={setZuEntfernen} />
          {l.artikel.length > 0 && <Sortimentkarte lieferant={l} ich={ich} />}
        </div>
        <div className="spalte">
          <Anhangkarte
            titel="Mails und Angebote"
            anhaenge={l.anhaenge}
            pfad="/lieferantenanhaenge/"
            besitzer={{ feld: "lieferant", id: l.id }}
            woran="am Lieferanten"
            leer="Mails mit dem Hersteller als .eml hierher ziehen — Anfrage, Angebot, Auftragsbestätigung. So steht der Stand der Dinge beim Lieferanten."
            ich={ich}
            neuLaden={neuLaden}
            zumLoeschen={setZuEntfernen}
          />
          {l.bestellungen.length > 0 && <Archivkarte bestellungen={l.bestellungen} />}
        </div>
      </div>

      {bearbeiten && (
        <Lieferantfenster
          lieferant={l}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setBearbeiten(false)}
          entfernt={zurueck}
        />
      )}

      {zuEntfernen && (
        <Loeschdialog
          name={zuEntfernen.name}
          was={zuEntfernen.was}
          folgen="Es bleibt im Änderungsprotokoll — ein Admin kann das Entfernen rückgängig machen."
          laeuft={laeuft}
          abbrechen={() => setZuEntfernen(null)}
          loeschen={entfernen}
        />
      )}
    </div>
  );
}

/* --- Der Korb ------------------------------------------------------------- */

type Entfernen = (auftrag: { pfad: string; name: string; was: string }) => void;

function Korbkarte({ lieferant, ich, entfernen }: { lieferant: Lieferantenseite; ich: Ich; entfernen: Entfernen }) {
  const [bestellt, setBestellt] = useState(false);
  const [zumKopieren, setZumKopieren] = useState<string | null>(null);
  const korb = lieferant.korb;

  useEffect(() => {
    if (zumKopieren === null) return;
    const beiEscape = (e: KeyboardEvent) => e.key === "Escape" && setZumKopieren(null);
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  }, [zumKopieren]);

  async function kopieren() {
    const text = zusammenfassung(lieferant, korb, ich.name, datumIn(0));
    try {
      await navigator.clipboard.writeText(text);
      melden(
        "gut",
        lieferant.art === "haendler"
          ? "Die Anfrage ist in der Zwischenablage."
          : "Die Zusammenfassung ist in der Zwischenablage — im Chat an Claude geben.",
      );
    } catch {
      // Ohne HTTPS oder ohne Erlaubnis gibt es keine Zwischenablage. Dann
      // steht der Text in einem Fenster zum Markieren.
      setZumKopieren(text);
    }
  }

  return (
    <section className="karte korbkarte">
      <div className="kartenkopf">
        <h2>
          Korb {korb.length > 0 && <span className="zahl korb-zahl">{zeilenZahl(korb.length)}</span>}
        </h2>
      </div>

      {ich.darf.bearbeiten && <Hineinlegen lieferant={lieferant} />}

      {korb.length === 0 ? (
        <p className="korb-leer">
          Der Korb ist leer.{" "}
          {ich.darf.bearbeiten &&
            (lieferant.artikel.length > 0
              ? "Einen Link einfügen oder unten aus dem Sortiment wählen."
              : "Einen Link einfügen — oder, ohne Link, den Namen tippen.")}
        </p>
      ) : (
        <>
          <ul className="korb-liste">
            {korb.map((p) => (
              <Korbzeile key={p.id} position={p} ich={ich} entfernen={entfernen} />
            ))}
          </ul>
          {/* Unter der Liste und nicht im Kopf: Erst sieht man nach, was im
              Korb liegt, dann gibt man es weiter. */}
          <div className="korb-knoepfe">
            {ich.darf.bearbeiten && (
              <button type="button" className="knopf-still" onClick={() => setBestellt(true)}>
                <Zeichen name="haken" />
                Als bestellt markieren
              </button>
            )}
            <button type="button" className="knopf" onClick={kopieren}>
              <Zeichen name="kopie" />
              {zusammenfassungsKnopf(lieferant.art)}
            </button>
          </div>
        </>
      )}

      {bestellt && <Bestelltfenster lieferant={lieferant} schliessen={() => setBestellt(false)} />}

      {zumKopieren !== null && (
        <div className="dialog-grund" role="dialog" aria-modal="true" onClick={() => setZumKopieren(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Zum Kopieren</h2>
            <p>Die Zwischenablage ging nicht — der Text steht hier zum Markieren.</p>
            <textarea className="feld korb-text" readOnly rows={12} value={zumKopieren} onFocus={(e) => e.target.select()} />
            <div className="dialog-knoepfe">
              <button type="button" className="knopf" onClick={() => setZumKopieren(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Das Feld oben im Korb: Link oder Name, dazu Beschreibung und Menge.
 *
 * Ein eingefügter Link, der schon im Sortiment steht, legt den vorhandenen
 * Artikel hinein, statt ihn ein zweites Mal anzulegen.
 */
function Hineinlegen({ lieferant }: { lieferant: Lieferantenseite }) {
  const neuLaden = useNeuLaden();
  const [eingabe, setEingabe] = useState("");
  const [name, setName] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [menge, setMenge] = useState("1");
  const [sucht, setSucht] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  // Der Name, der zuletzt vorgeschlagen wurde. Hat ihn jemand überschrieben,
  // ersetzt ein späterer Vorschlag das Getippte nicht.
  const vorgeschlagen = useRef("");
  const gefragt = useRef("");

  const link = istLink(eingabe) ? eingabe.trim() : "";
  const vorhanden = link ? lieferant.artikel.find((a) => gleicherLink(a.link, link)) : undefined;
  const offen = eingabe.trim() !== "";

  async function vorschlagen(text: string) {
    const neuerLink = istLink(text) ? text.trim() : "";
    if (!neuerLink || neuerLink === gefragt.current) return;
    if (lieferant.artikel.some((a) => gleicherLink(a.link, neuerLink))) return;
    gefragt.current = neuerLink;
    setSucht(true);
    try {
      const { name: vorschlag } = await hole<{ name: string }>("/artikelvorschlag/", {
        method: "POST",
        body: JSON.stringify({ link: neuerLink }),
      });
      setName((jetzt) => (jetzt === "" || jetzt === vorgeschlagen.current ? vorschlag : jetzt));
      vorgeschlagen.current = vorschlag;
    } catch {
      // Gemeldet hat `hole`; der Name bleibt zum Tippen.
    } finally {
      setSucht(false);
    }
  }

  function leeren() {
    setEingabe("");
    setName("");
    setBeschreibung("");
    setMenge("1");
    vorgeschlagen.current = "";
    gefragt.current = "";
  }

  const anzahl = Number(menge);
  const mengeGut = Number.isInteger(anzahl) && anzahl >= 1;
  const titel = vorhanden ? vorhanden.name : link ? name.trim() : eingabe.trim();
  const bereit = offen && titel !== "" && mengeGut && !laeuft;

  async function hinein(e: FormEvent) {
    e.preventDefault();
    if (!bereit) return;
    setLaeuft(true);
    try {
      const artikel =
        vorhanden ??
        (await hole<Bestellartikel>("/bestellartikel/", {
          method: "POST",
          body: JSON.stringify({ lieferant: lieferant.id, name: titel, link, beschreibung: beschreibung.trim() }),
        }));
      await hole("/bestellpositionen/", {
        method: "POST",
        body: JSON.stringify({ artikel: artikel.id, menge: anzahl }),
      });
      melden("gut", `${anzahl} × „${artikel.name}“ liegt im Korb.`);
      leeren();
      neuLaden();
    } catch {
      // Die Felder bleiben stehen — sonst wäre mit der Meldung auch der Link weg.
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="korb-neu" onSubmit={hinein} noValidate>
      <div className="feld-reihe">
        <input
          className="feld korb-eingabe"
          value={eingabe}
          placeholder="Link einfügen oder Namen tippen"
          aria-label="Link oder Name"
          inputMode="url"
          onChange={(e) => setEingabe(e.target.value)}
          onPaste={(e) => vorschlagen(e.clipboardData.getData("text"))}
          onBlur={(e) => vorschlagen(e.target.value)}
        />
      </div>

      {offen && (
        <div className="korb-neu-felder">
          {vorhanden ? (
            <p className="korb-schon">
              Steht schon im Sortiment: <b>{vorhanden.name}</b>
              {vorhanden.beschreibung && ` — ${vorhanden.beschreibung}`}
            </p>
          ) : (
            link && (
              <label className="profilfeld">
                <span className="beschriftung-klein">Name {sucht && <em className="korb-sucht">wird gesucht …</em>}</span>
                <input
                  className="feld"
                  value={name}
                  maxLength={200}
                  placeholder={sucht ? "" : "Wie heißt der Artikel?"}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )
          )}
          <div className="feld-reihe korb-neu-reihe">
            {!vorhanden && (
              <input
                className="feld"
                value={beschreibung}
                maxLength={300}
                placeholder="Farbe, Größe, Variante"
                aria-label="Beschreibung"
                onChange={(e) => setBeschreibung(e.target.value)}
              />
            )}
            <input
              className="feld korb-menge"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={menge}
              aria-label="Menge"
              onChange={(e) => setMenge(e.target.value)}
            />
            <button type="submit" className="knopf-still" disabled={!bereit}>
              <Zeichen name="plus" />
              In den Korb
            </button>
            <button type="button" className="knopf-still" onClick={leeren}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function Korbzeile({ position, ich, entfernen }: { position: Bestellposition; ich: Ich; entfernen: Entfernen }) {
  const neuLaden = useNeuLaden();
  const [menge, setMenge] = useState(String(position.menge));
  useEffect(() => setMenge(String(position.menge)), [position.menge]);

  async function speichern() {
    const neu = Number(menge);
    if (!Number.isInteger(neu) || neu < 1) return setMenge(String(position.menge));
    if (neu === position.menge) return;
    try {
      await hole(`/bestellpositionen/${position.id}/`, { method: "PATCH", body: JSON.stringify({ menge: neu }) });
      neuLaden();
    } catch {
      setMenge(String(position.menge));
    }
  }

  return (
    <li className="korbzeile">
      {ich.darf.bearbeiten ? (
        <input
          className="feld korb-menge"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={menge}
          aria-label={`Menge von ${position.name}`}
          onChange={(e) => setMenge(e.target.value)}
          onBlur={speichern}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      ) : (
        <span className="korb-menge-text zahl">{position.menge} ×</span>
      )}
      <Artikeltext name={position.name} link={position.link} beschreibung={position.beschreibung} />
      {position.von_initialen && (
        <span className="korb-von" title="hineingelegt von">
          {position.von_initialen}
        </span>
      )}
      {ich.darf.loeschen && (
        <button
          type="button"
          className="mini korb-weg"
          aria-label={`${position.name} aus dem Korb nehmen`}
          onClick={() =>
            entfernen({ pfad: `/bestellpositionen/${position.id}/`, name: position.name, was: "Die Zeile im Korb" })
          }
        >
          <Zeichen name="kreuz" />
        </button>
      )}
    </li>
  );
}

/** Name als Verweis auf die Seite des Artikels, darunter Beschreibung und Shop. */
function Artikeltext({ name, link, beschreibung, mehr }: { name: string; link: string; beschreibung: string; mehr?: string }) {
  const unter = [beschreibung.trim(), link ? kurzerLink(link) : "", mehr ?? ""].filter(Boolean).join(" · ");
  return (
    <span className="artikeltext">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer">
          {name}
        </a>
      ) : (
        <b>{name}</b>
      )}
      {unter && <span className="unterzeile">{unter}</span>}
    </span>
  );
}

/* --- Das Sortiment -------------------------------------------------------- */

function Sortimentkarte({ lieferant, ich }: { lieferant: Lieferantenseite; ich: Ich }) {
  const neuLaden = useNeuLaden();
  const [bearbeitet, setBearbeitet] = useState<Bestellartikel | null>(null);
  const [laeuft, setLaeuft] = useState<number | null>(null);

  const imKorb = (id: number) =>
    lieferant.korb.filter((p) => p.artikel === id).reduce((summe, p) => summe + p.menge, 0);

  async function einsMehr(a: Bestellartikel) {
    setLaeuft(a.id);
    try {
      await hole("/bestellpositionen/", { method: "POST", body: JSON.stringify({ artikel: a.id, menge: 1 }) });
      neuLaden();
    } catch {
      // `hole` hat den Grund gemeldet.
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <section className="karte">
      <div className="kartenkopf">
        <h2>
          Sortiment{" "}
          <Hinweis
            worum="Sortiment"
            text="Was einmal im Korb lag, bleibt hier. Oben steht, was am häufigsten bestellt wurde; ein Klick auf + legt ein Stück mehr in den Korb."
          />
        </h2>
      </div>
      <ul className="sortiment-liste">
        {sortiment(lieferant.artikel).map((a) => {
          const drin = imKorb(a.id);
          const mal = a.bestellt_mal > 0 ? `${a.bestellt_mal}× bestellt` : "";
          return (
            <li key={a.id}>
              <Artikeltext name={a.name} link={a.link} beschreibung={a.beschreibung} mehr={mal} />
              {drin > 0 && <span className="status status-laeuft">{drin} im Korb</span>}
              {ich.darf.bearbeiten && (
                <>
                  <button
                    type="button"
                    className="mini"
                    aria-label={`${a.name} bearbeiten`}
                    title="Bearbeiten"
                    onClick={() => setBearbeitet(a)}
                  >
                    <Zeichen name="stift" />
                  </button>
                  <button
                    type="button"
                    className="knopf-still sortiment-plus"
                    disabled={laeuft === a.id}
                    aria-label={`Ein Stück ${a.name} in den Korb`}
                    title="Ein Stück in den Korb"
                    onClick={() => einsMehr(a)}
                  >
                    <Zeichen name="plus" />
                    <Zeichen name="wagen" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {bearbeitet && (
        <Artikelfenster artikel={bearbeitet} darfLoeschen={ich.darf.loeschen} schliessen={() => setBearbeitet(null)} />
      )}
    </section>
  );
}

/* --- Das Archiv ------------------------------------------------------------ */

const ARCHIV_ZUERST = 5;

function Archivkarte({ bestellungen }: { bestellungen: Bestellung[] }) {
  const [alle, setAlle] = useState(false);
  const gezeigt = alle ? bestellungen : bestellungen.slice(0, ARCHIV_ZUERST);
  return (
    <section className="karte">
      <div className="kartenkopf">
        <h2>
          Archiv <span className="zahl korb-zahl">{bestellungen.length}</span>
        </h2>
      </div>
      <ul className="archiv-liste">
        {gezeigt.map((b) => (
          <li key={b.id}>
            <b className="zahl">{tagText(b.bestellt_am)}</b>
            <span className="unterzeile">{[b.von_name, b.notiz].filter(Boolean).join(" · ")}</span>
            <span className="archiv-zeilen">
              {b.positionen.map((p) => `${p.menge} × ${p.name}${p.beschreibung ? ` (${p.beschreibung})` : ""}`).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      {bestellungen.length > ARCHIV_ZUERST && (
        <button type="button" className="knopf-still archiv-mehr" onClick={() => setAlle((a) => !a)}>
          {alle ? "Nur die letzten zeigen" : `Alle ${bestellungen.length} zeigen`}
        </button>
      )}
    </section>
  );
}

/* --- Fenster -------------------------------------------------------------- */

/** Ein Fenster mit Kopf, Abbrechen/Speichern und Esc — wie die anderen Bearbeitungsfenster. */
function Fenster({
  titel,
  offen,
  bereit,
  laeuft,
  speichern,
  schliessen,
  knopf = "Speichern",
  children,
}: {
  titel: string;
  offen: boolean;
  bereit: boolean;
  laeuft: boolean;
  speichern: () => void;
  schliessen: () => void;
  knopf?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => e.key === "Escape" && !laeuft && !offen && schliessen();
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });
  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-label={titel} onClick={() => !laeuft && schliessen()}>
      <form
        className="dialog dialog-arbeit"
        noValidate
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (bereit && !laeuft) speichern();
        }}
      >
        <div className="dialog-kopf">
          <div className="dialog-kopf-text">
            <h2>{titel}</h2>
          </div>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf-still" onClick={schliessen} disabled={laeuft}>
              Abbrechen
            </button>
            <button type="submit" className="knopf" disabled={laeuft || !bereit}>
              {knopf}
            </button>
          </div>
        </div>
        <div className="dialog-koerper thema-felder">{children}</div>
      </form>
    </div>
  );
}

function Lieferantfenster({
  lieferant,
  darfLoeschen,
  schliessen,
  angelegt,
  entfernt,
}: {
  lieferant: Lieferant | null;
  darfLoeschen: boolean;
  schliessen: () => void;
  angelegt?: (id: number) => void;
  entfernt?: () => void;
}) {
  const neuLaden = useNeuLaden();
  const [name, setName] = useState(lieferant?.name ?? "");
  // Kein Vorgabewert — siehe `Bestellweg` in socos/models.py.
  const [art, setArt] = useState<Bestellweg | null>(lieferant?.art ?? null);
  const [link, setLink] = useState(lieferant?.link ?? "");
  const [notiz, setNotiz] = useState(lieferant?.notiz ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  const linkGut = link.trim() === "" || istLink(link);
  const bereit = name.trim() !== "" && art !== null && linkGut;

  async function speichern() {
    setLaeuft(true);
    const daten = { name: name.trim(), art, link: link.trim(), notiz: notiz.trim() };
    try {
      const gespeichert = await hole<Lieferant>(lieferant ? `/lieferanten/${lieferant.id}/` : "/lieferanten/", {
        method: lieferant ? "PATCH" : "POST",
        body: JSON.stringify(daten),
      });
      neuLaden();
      melden("gut", `„${gespeichert.name}“ ist gespeichert.`);
      schliessen();
      if (!lieferant) angelegt?.(gespeichert.id);
    } catch {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!lieferant) return;
    setLaeuft(true);
    try {
      await hole(`/lieferanten/${lieferant.id}/`, { method: "DELETE" });
      neuLaden();
      schliessen();
      entfernt?.();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  return (
    <>
      <Fenster
        titel={lieferant ? lieferant.name : "Neuer Lieferant"}
        offen={fragtLoeschen}
        bereit={bereit}
        laeuft={laeuft}
        speichern={speichern}
        schliessen={schliessen}
      >
        <label className="profilfeld">
          <span className="beschriftung-klein">Name</span>
          <input
            className="feld"
            value={name}
            maxLength={120}
            autoFocus={!lieferant}
            placeholder="z. B. Bambu Lab"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="profilfeld">
          <span className="beschriftung-klein" id="lieferant-art">
            Bestellweg
          </span>
          <div className="bestellwegwahl" role="radiogroup" aria-labelledby="lieferant-art">
            {BESTELLWEGE.map((w) => (
              <button key={w.wert} type="button" role="radio" aria-checked={art === w.wert} onClick={() => setArt(w.wert)}>
                <b>{w.titel}</b>
                <span>{w.wozu}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="profilfeld">
          <span className="beschriftung-klein">Link zum Shop oder zur Seite</span>
          <input
            className="feld"
            value={link}
            inputMode="url"
            placeholder="https://"
            onChange={(e) => setLink(e.target.value)}
          />
          <Fehlerzeile text={linkGut ? "" : "Ein Link beginnt mit https://"} />
        </label>
        <label className="profilfeld">
          <span className="beschriftung-klein">Notiz</span>
          <textarea
            className="feld"
            rows={3}
            value={notiz}
            placeholder="Ansprechpartner, Versandkosten, Mindestmenge, Lieferzeit"
            onChange={(e) => setNotiz(e.target.value)}
          />
        </label>
        {lieferant && darfLoeschen && (
          <div className="persona-fuss">
            <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
              <Zeichen name="korb" />
              Lieferant entfernen
            </button>
          </div>
        )}
      </Fenster>

      {fragtLoeschen && lieferant && (
        <Loeschdialog
          name={lieferant.name}
          was="Der Lieferant samt Sortiment, Korb und Mails"
          folgen="Hat er schon Bestellungen im Archiv, bleibt er stehen — sein Verlauf soll nicht verschwinden. Alles steht im Änderungsprotokoll."
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}
    </>
  );
}

function Artikelfenster({
  artikel,
  darfLoeschen,
  schliessen,
}: {
  artikel: Bestellartikel;
  darfLoeschen: boolean;
  schliessen: () => void;
}) {
  const neuLaden = useNeuLaden();
  const [name, setName] = useState(artikel.name);
  const [link, setLink] = useState(artikel.link);
  const [beschreibung, setBeschreibung] = useState(artikel.beschreibung);
  const [laeuft, setLaeuft] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  const linkGut = link.trim() === "" || istLink(link);
  const bereit = name.trim() !== "" && linkGut;

  async function speichern() {
    setLaeuft(true);
    try {
      await hole(`/bestellartikel/${artikel.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), link: link.trim(), beschreibung: beschreibung.trim() }),
      });
      neuLaden();
      schliessen();
    } catch {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    setLaeuft(true);
    try {
      await hole(`/bestellartikel/${artikel.id}/`, { method: "DELETE" });
      neuLaden();
      schliessen();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  return (
    <>
      <Fenster
        titel={artikel.name}
        offen={fragtLoeschen}
        bereit={bereit}
        laeuft={laeuft}
        speichern={speichern}
        schliessen={schliessen}
      >
        <label className="profilfeld">
          <span className="beschriftung-klein">Name</span>
          <input className="feld" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="profilfeld">
          <span className="beschriftung-klein">Link</span>
          <input className="feld" value={link} inputMode="url" placeholder="https://" onChange={(e) => setLink(e.target.value)} />
          <Fehlerzeile text={linkGut ? "" : "Ein Link beginnt mit https://"} />
        </label>
        <label className="profilfeld">
          <span className="beschriftung-klein">Beschreibung</span>
          <input
            className="feld"
            value={beschreibung}
            maxLength={300}
            placeholder="Farbe, Größe, Variante"
            onChange={(e) => setBeschreibung(e.target.value)}
          />
        </label>
        {darfLoeschen && (
          <div className="persona-fuss">
            <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
              <Zeichen name="korb" />
              Aus dem Sortiment nehmen
            </button>
          </div>
        )}
      </Fenster>

      {fragtLoeschen && (
        <Loeschdialog
          name={artikel.name}
          was="Der Artikel"
          folgen="Aus dem Korb fällt er mit heraus; im Archiv bleibt er stehen, und das Änderungsprotokoll behält alles."
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}
    </>
  );
}

/**
 * „Als bestellt markieren": Datum (heute vorgewählt) und eine Notiz für die
 * Bestellnummer. Danach steht der Korb im Archiv.
 */
function Bestelltfenster({ lieferant, schliessen }: { lieferant: Lieferantenseite; schliessen: () => void }) {
  const neuLaden = useNeuLaden();
  const [tag, setTag] = useState(datumIn(0));
  const [notiz, setNotiz] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function speichern() {
    setLaeuft(true);
    try {
      await hole(`/lieferanten/${lieferant.id}/bestellt/`, {
        method: "POST",
        body: JSON.stringify({ bestellt_am: tag, notiz: notiz.trim() }),
      });
      neuLaden();
      melden("gut", `Die Bestellung bei ${lieferant.name} steht im Archiv.`);
      schliessen();
    } catch {
      setLaeuft(false);
    }
  }

  return (
    <Fenster
      titel="Als bestellt markieren"
      offen={false}
      bereit={/^\d{4}-\d{2}-\d{2}$/.test(tag)}
      laeuft={laeuft}
      speichern={speichern}
      schliessen={schliessen}
      knopf="Bestellt"
    >
      <p className="fenster-satz">
        {zeilenZahl(lieferant.korb.length)} aus dem Korb wandern ins Archiv. Der Korb ist danach leer für die nächste
        Sammelbestellung.
      </p>
      <label className="profilfeld">
        <span className="beschriftung-klein">Bestellt am</span>
        <input className="feld" type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Notiz</span>
        <input
          className="feld"
          value={notiz}
          maxLength={300}
          placeholder="Bestellnummer, Lieferzeit"
          onChange={(e) => setNotiz(e.target.value)}
        />
      </label>
    </Fenster>
  );
}
