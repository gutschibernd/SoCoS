/**
 * Module: zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben.
 *
 * `/module` ist die Übersicht aller Module, `/module/spg` die SPG Academy mit
 * ihren Workshops (`/module/spg-businessplan`, `/module/spg-vision`).
 *
 * **Die Leinwand ist das Ergebnis, nicht die Werkstatt.** Auf ihr steht, was
 * im Workshop herausgekommen ist — Stichpunkte je Feld. Bearbeitet wird ein
 * Feld im Fenster; die Leinwand selbst bleibt dabei ruhig und lesbar, auch
 * für einen Leser, der gar nichts ändern darf.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { hole } from "../basis/api";
import {
  useCanvasfelder,
  useNeuLaden,
  useVorhaben,
  type Canvasfeld,
  type Ich,
  type Persona,
  type Vorhaben,
} from "../basis/daten";
import { fristText } from "../basis/aufgaben";
import { melden } from "../basis/meldungen";
import {
  MODULE,
  STAENDE,
  abgaben,
  fertigeAbschnitte,
  naechsterStand,
  ohneSatzende,
  standVon,
  alsEntwuerfe,
  ausgefuellt,
  istGeaendert,
  neuerSchluessel,
  ROLLEN,
  betragAusEingabe,
  betragZumBearbeiten,
  personaKurz,
  punkteIn,
  zuletztText,
  workshopZuWeg,
  zumSenden,
  type Modul,
  type Punktentwurf,
  type Workshop,
} from "../basis/module";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Wechseln = (seite: Seite, unter?: string | null) => void;

export function Module({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: Wechseln;
}) {
  const treffer = workshopZuWeg(unter);
  if (treffer)
    return (
      <SpgAcademy
        // Ein neuer Schlüssel je Workshop: Ein offenes Feldfenster gehört zu
        // einem Workshop und darf beim Umschalten nicht mitwandern.
        key={treffer.teil.weg}
        ich={ich}
        modul={treffer.modul}
        teil={treffer.teil}
        wechseln={wechseln}
      />
    );
  return <Uebersicht wechseln={wechseln} />;
}

/* --- Die Übersicht -------------------------------------------------------- */

function Uebersicht({ wechseln }: { wechseln: Wechseln }) {
  // Die Übersicht wartet nicht auf die Vorhaben: Die Kacheln stehen sofort,
  // nur der Stand darin kommt nach. Eine Seite mit einem Werkzeug darf nicht
  // „Wird geladen …" sagen, bloß weil eine Zahl fehlt.
  const vorhaben = useVorhaben();
  const eines = vorhaben.data?.[0] ?? null;

  return (
    <div className="modul-kacheln">
      {/* Die Kachel selbst ist kein Link mehr, seit ein Modul zwei Teile hat:
          Jede Zeile führt zu ihrem Workshop, und ein Link in einem Link geht
          nicht. Der Kopf führt zum ersten. */}
      {MODULE.map((m) => (
        <div key={m.weg} className="modul-kachel">
          <a
            className="modul-kopf"
            href={`/module/${m.weg}`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", m.weg);
            }}
          >
            <i className="modul-siegel">
              <Zeichen name={m.zeichen} />
            </i>
            <span>
              <b>{m.titel}</b>
              <em>{m.wozu}</em>
            </span>
          </a>
          <ul className="modul-teile">
            {m.teile.map((teil, i) => (
              <Teilzeile key={teil.weg} teil={teil} stelle={i} vorhaben={eines} wechseln={wechseln} />
            ))}
          </ul>
          <div className="modul-fuss">
            <span>{eines ? `zuletzt ${zuletztText(eines.zuletzt)}` : ""}</span>
          </div>
        </div>
      ))}

      {/* Neue Module entstehen im Code, nicht in der Oberfläche. Die Kachel
          sagt, wo man eines bestellt — sonst steht neben einem einzigen
          Werkzeug eine leere Fläche, die nach einem Fehler aussieht. */}
      <div className="modul-wunsch">
        <b>Fehlt ein Werkzeug?</b>
        <p>Neue Module entstehen auf Zuruf.</p>
        <button type="button" className="knopf-still" onClick={() => wechseln("rueckmeldungen")}>
          Unter Wünsche &amp; Fehler melden
        </button>
      </div>
    </div>
  );
}

/** Eine Zeile der Kachel: der Workshop, sein Stand, der Weg dorthin. */
function Teilzeile({
  teil,
  stelle,
  vorhaben,
  wechseln,
}: {
  teil: Workshop;
  stelle: number;
  vorhaben: Vorhaben | null;
  wechseln: Wechseln;
}) {
  const felder = useCanvasfelder(teil.schluessel);
  const stand =
    vorhaben && felder.data
      ? `${zaehlen(teil, vorhaben, felder.data)} / ${felder.data.length} ${teil.einheit}`
      : "";

  return (
    <li>
      <a
        href={`/module/${teil.weg}`}
        onClick={(e) => {
          e.preventDefault();
          wechseln("module", teil.weg);
        }}
      >
        <span className="zahl">{String(stelle + 1).padStart(2, "0")}</span>
        {teil.titel}
        <span className="modul-stand">{stand}</span>
        <Zeichen name="zeiger" klasse="modul-zeiger" />
      </a>
    </li>
  );
}

/**
 * Was ein Workshop als erledigt zählt: beim Canvas ein Feld mit Punkten, beim
 * Business Plan Lite ein Abschnitt, der auf „fertig" steht — geschrieben wird
 * der Plan ja nicht hier.
 */
function zaehlen(teil: Workshop, vorhaben: Vorhaben, felder: Canvasfeld[]): number {
  const namen = felder.map((f) => f.feld);
  return teil.schluessel === "businessplan"
    ? fertigeAbschnitte(vorhaben, namen)
    : ausgefuellt(vorhaben, namen);
}

/* --- SPG Academy ---------------------------------------------------------- */

/**
 * Ein Workshop des einen Vorhabens: das Lean Model Canvas als Leinwand, der
 * Business Plan Lite als Überblick über Abgaben und Stand. Oben schaltet man zwischen den Workshops um.
 *
 * **Es gibt genau ein Vorhaben** — „Sopharmis Arzneimittelspender", angelegt
 * von der Migration 0022. Die Seite wählt deshalb nichts aus, sie zeigt es.
 * Das Modell bleibt trotzdem getrennt von den Punkten: Kommt je ein zweites
 * Vorhaben, ist es eine Auswahl in der Oberfläche und kein Umbau der Daten.
 */
function SpgAcademy({
  ich,
  modul,
  teil,
  wechseln,
}: {
  ich: Ich;
  modul: Modul;
  teil: Workshop;
  wechseln: Wechseln;
}) {
  const vorhaben = useVorhaben();
  const felder = useCanvasfelder(teil.schluessel);
  const [offenesFeld, setOffenesFeld] = useState<string | null>(null);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!vorhaben.data) return <Zustand abfrage={vorhaben} erneut={() => vorhaben.refetch()} />;
  if (!felder.data) return <Zustand abfrage={felder} erneut={() => felder.refetch()} />;

  const eines = vorhaben.data[0] ?? null;
  const art =
    teil.schluessel === "canvas" ? "leinwand" : teil.schluessel === "businessplan" ? "plan" : "vision";

  // Die Workshops als Umschalter — dieselbe Form wie die Zeitraumwahl: ein
  // Zustand, mehrere Werte, einer gilt.
  const umschalter = (
    <div className="spannenwahl workshopwahl" role="group" aria-label="Workshop">
      {modul.teile.map((t, i) => (
        <button
          key={t.weg}
          type="button"
          aria-pressed={t.weg === teil.weg}
          onClick={() => wechseln("module", t.weg)}
        >
          <span className="zahl">{String(i + 1).padStart(2, "0")}</span>
          {t.titel}
        </button>
      ))}
    </div>
  );

  // Fehlt es — weil es jemand am Server entfernt hat —, stehen die Felder
  // trotzdem da, mit allen Fragen, nur ohne Stift. Wiederherstellen kann es
  // ein Admin; aus der Oberfläche heraus legt niemand ein zweites an.
  if (!eines) {
    return (
      <div className="spalte">
        {umschalter}
        <div className="vorhabenleiste">
          <div className="vorhaben-kopf">
            <b>Das Vorhaben fehlt</b>
            <span>Es wurde entfernt. Ein Admin kann es wiederherstellen.</span>
          </div>
        </div>
        {art === "plan" ? (
          <Planueberblick vorhaben={LEER} abschnitte={felder.data} darfSetzen={false} />
        ) : art === "vision" ? (
          <Visionsatz vorhaben={LEER} teile={felder.data} darfBearbeiten={false} />
        ) : (
          <Leinwand vorhaben={LEER} felder={felder.data} oeffnen={null} />
        )}
      </div>
    );
  }

  const zahl = zaehlen(teil, eines, felder.data);

  return (
    <div className="spalte">
      {umschalter}
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{eines.titel}</b>
          <span className="vorhaben-stand">
            <span>
              <b className="zahl">
                {zahl} / {felder.data.length}
              </b>{" "}
              {teil.einheit}
              {art === "plan" && " fertig"}
            </span>
            <span className="balken" aria-hidden="true">
              <i style={{ width: `${(zahl / felder.data.length) * 100}%` }} />
            </span>
            <span className="vorhaben-zuletzt">zuletzt {zuletztText(eines.zuletzt)}</span>
          </span>
        </div>
        {/* Nur das Canvas hat ein PDF. Der Plan wird im Dokument
            geschrieben, das abgegeben wird — das ist sein PDF. */}
        {art === "leinwand" && (
          <div className="vorhaben-aktionen">
            {/* Ein Link und kein fetch: Das PDF soll im Download-Ordner landen,
                und genau das tut der Browser mit einem `attachment` von selbst. */}
            <a className="knopf-still" href={`/api/vorhaben/${eines.id}/pdf/`}>
              <Zeichen name="pdf" />
              PDF
            </a>
          </div>
        )}
      </div>

      {art === "plan" ? (
        <Planueberblick vorhaben={eines} abschnitte={felder.data} darfSetzen={ich.darf.bearbeiten} />
      ) : art === "vision" ? (
        <Visionsatz vorhaben={eines} teile={felder.data} darfBearbeiten={ich.darf.bearbeiten} />
      ) : (
        <Leinwand
          vorhaben={eines}
          felder={felder.data}
          oeffnen={ich.darf.bearbeiten ? setOffenesFeld : null}
        />
      )}

      {offenesFeld && (
        <Feldfenster
          // Ein neuer Schlüssel je Feld: Beim Weiterblättern beginnt das
          // Fenster mit den Punkten des nächsten Feldes, statt die des
          // vorigen im Zustand festzuhalten.
          key={offenesFeld}
          vorhaben={eines}
          felder={felder.data}
          feld={offenesFeld}
          oeffnen={setOffenesFeld}
          darfLoeschen={ich.darf.loeschen}
        />
      )}
    </div>
  );
}

/** Das Vorhaben, solange es fehlt: alle Felder da, nichts eingetragen. */
const LEER: Vorhaben = { id: 0, titel: "", punkte: [], personas: [], planstand: {}, zuletzt: "" };

/* --- Business Plan Lite ---------------------------------------------------- */

/**
 * Der Business Plan Lite als Überblick: die drei Abgaben, darunter je
 * Abschnitt, was laut Vorlage der SPG hineingehört, wie lang er sein soll und
 * wie weit er ist.
 *
 * **Geschrieben wird der Plan nicht hier**, sondern im Dokument, das
 * abgegeben wird. Ein zweiter Ort für denselben Text liefe dem Dokument
 * hinterher, und beim Abgeben gälte doch nur das Dokument. Hier steht nur,
 * was der Plan braucht und wo er steht.
 *
 * Der Stand dreht sich mit einem Tipp weiter wie die Priorität einer Aufgabe:
 * offen → Entwurf → fertig. Abgehakt werden die Abgaben auf der Tafel.
 */
function Planueberblick({
  vorhaben,
  abschnitte,
  darfSetzen,
}: {
  vorhaben: Vorhaben;
  abschnitte: Canvasfeld[];
  darfSetzen: boolean;
}) {
  const neuLaden = useNeuLaden();

  async function weiterdrehen(abschnitt: string) {
    try {
      await hole(`/vorhaben/${vorhaben.id}/stand/`, {
        method: "POST",
        body: JSON.stringify({ abschnitt, stand: naechsterStand(standVon(vorhaben, abschnitt)) }),
      });
      neuLaden();
    } catch {
      // `hole` hat den Grund schon gemeldet; der Stand bleibt, wie er war.
    }
  }

  return (
    <>
      <ol className="abgaben" aria-label="Abgaben">
        {abgaben().map((a) => (
          <li key={a.titel} data-lage={a.lage}>
            <b>{a.titel}</b>
            <span className="zahl">{fristText(a.frist).text}</span>
          </li>
        ))}
      </ol>

      <div className="plan">
        {abschnitte.map((f) => {
          const stand = standVon(vorhaben, f.feld);
          const text = STAENDE.find((s) => s.wert === stand)?.text ?? stand;
          // Punkte aus der Zeit, als der Plan noch hier geschrieben wurde.
          // Sie bleiben sichtbar, statt still zu verschwinden.
          const punkte = punkteIn(vorhaben, f.feld);
          return (
            <section key={f.feld} className="leinwand-feld" data-feld={f.feld} data-stand={stand}>
              <h3 className="leinwand-kopf">
                <span className="leinwand-nummer">{f.nummer}</span>
                {f.titel}
                {f.umfang && <span className="plan-umfang">{f.umfang}</span>}
                <button
                  type="button"
                  className="planstand"
                  data-stand={stand}
                  disabled={!darfSetzen}
                  title={darfSetzen ? "Tippen dreht weiter: offen → Entwurf → fertig" : undefined}
                  aria-label={`${f.titel}: ${text}${darfSetzen ? " — tippen zum Ändern" : ""}`}
                  onClick={() => weiterdrehen(f.feld)}
                >
                  {text}
                </button>
              </h3>
              {/* Was hinein muss, kurz aus der Vorlage der SPG — Stichworte,
                  keine Fragen, deshalb mit Strich und nicht mit „?". */}
              <ul className="leinwand-punkte plan-ziele">
                {f.leitfragen.map((ziel) => (
                  <li key={ziel}>{ziel}</li>
                ))}
              </ul>
              {punkte.length > 0 && (
                <ul className="leinwand-punkte plan-notizen">
                  {punkte.map((p) => (
                    <li key={p.id}>{p.text}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/* --- Vision Statement ------------------------------------------------------ */

/**
 * Das Vision Statement: **ein** Satz mit drei Lücken — „Our Vision is …,
 * hereby we want to help … by building …".
 *
 * Gelesen wird er als Satz, nicht als drei Kästen: Ob die Teile
 * zusammenpassen, sieht man nur, wenn sie hintereinander stehen. Die festen
 * Stücke sind die Titel der Teile vom Server, die Einträge stehen fett
 * dazwischen, eine offene Lücke als Strich.
 *
 * Bearbeitet wird an Ort und Stelle und nicht im Fenster wie beim Canvas:
 * Drei Felder brauchen kein Weiterblättern, und so steht der Lückentext genau
 * da, wo nachher der Satz steht. Die Vision bekommt eine eigene Zeile, weil sie
 * der längste Teil ist; „wem" ist eine Lücke im Satz, „womit" wieder ein Kasten.
 */
function Visionsatz({
  vorhaben,
  teile,
  darfBearbeiten,
}: {
  vorhaben: Vorhaben;
  teile: Canvasfeld[];
  darfBearbeiten: boolean;
}) {
  const neuLaden = useNeuLaden();
  const gespeichert = teile.map((t) => punkteIn(vorhaben, t.feld)[0] ?? null);
  // `null` heißt: Es wird gerade nicht bearbeitet.
  const [entwurf, setEntwurf] = useState<string[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);

  const [vision, wem, womit] = teile;
  const geaendert =
    entwurf !== null && entwurf.some((text, i) => text.trim() !== (gespeichert[i]?.text ?? ""));
  const setze = (i: number, text: string) =>
    setEntwurf((alt) => alt && alt.map((t, j) => (j === i ? text : t)));

  async function speichern() {
    if (!entwurf) return;
    setLaeuft(true);
    try {
      // Jeder Teil über denselben Weg wie ein Feld des Canvas, und nur, was
      // sich geändert hat — sonst stünde ein unberührter Teil als bearbeitet
      // im Protokoll. Mit seiner `id`, damit dort alt → neu steht.
      for (const [i, t] of teile.entries()) {
        const text = entwurf[i].trim();
        const alt = gespeichert[i];
        if (text === (alt?.text ?? "")) continue;
        const punkte = text ? [alt ? { id: alt.id, text } : { text }] : [];
        await hole(`/vorhaben/${vorhaben.id}/feld/`, {
          method: "POST",
          body: JSON.stringify({ feld: t.feld, punkte }),
        });
      }
      melden("gut", "Das Vision Statement ist gespeichert.");
      setEntwurf(null);
    } catch {
      // `hole` hat den Grund schon gemeldet. Der Entwurf bleibt stehen — ein
      // Teil davon kann schon gespeichert sein, der Rest ist nicht verloren.
    } finally {
      setLaeuft(false);
      neuLaden();
    }
  }

  const texte = gespeichert.map((p) => (p ? ohneSatzende(p.text) : ""));
  const luecke = (text: string) =>
    text ? <b>{text}</b> : <span className="vision-luecke" aria-label="noch offen" role="img" />;

  return (
    <section className="vision">
      {entwurf === null ? (
        <>
          <p className="vision-satz">
            {vision.titel} {luecke(texte[0])}, {wem.titel} {luecke(texte[1])} {womit.titel}{" "}
            {luecke(texte[2])}.
          </p>
          {darfBearbeiten && (
            <div className="vision-knoepfe">
              <button
                type="button"
                className="knopf-still"
                onClick={() => setEntwurf(gespeichert.map((p) => p?.text ?? ""))}
              >
                <Zeichen name="stift" />
                Bearbeiten
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="vision-bearbeiten">
          <div className="vision-teil">
            <span className="vision-fest">{vision.titel} …</span>
            <Wachsfeld
              wert={entwurf[0]}
              platzhalter="the future you want to create"
              beschriftung={vision.titel}
              festhalten={() => {}}
              aendern={(text) => setze(0, text)}
              taste={() => {}}
            />
          </div>
          <div className="vision-luecken">
            <span className="vision-fest">{wem.titel}</span>
            <input
              className="feld"
              value={entwurf[1]}
              placeholder="whom — your customers"
              aria-label={wem.titel}
              maxLength={2000}
              onChange={(e) => setze(1, e.target.value)}
            />
            <span className="vision-fest">{womit.titel}</span>
          </div>
          <Wachsfeld
            wert={entwurf[2]}
            platzhalter="what you build — product or service"
            beschriftung={womit.titel}
            festhalten={() => {}}
            aendern={(text) => setze(2, text)}
            taste={() => {}}
          />
          <div className="vision-knoepfe">
            {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
            <button
              type="button"
              className="knopf-still"
              disabled={laeuft}
              onClick={() => (geaendert ? setFragtVerwerfen(true) : setEntwurf(null))}
            >
              Abbrechen
            </button>
            <button type="button" className="knopf" disabled={laeuft || !geaendert} onClick={speichern}>
              Speichern
            </button>
          </div>
        </div>
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>Am Vision Statement ist etwas geändert. Wer jetzt abbricht, hat wieder den Stand von vorher.</p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(false)}>
                Weiter bearbeiten
              </button>
              <button
                type="button"
                className="knopf-still"
                onClick={() => {
                  setFragtVerwerfen(false);
                  setEntwurf(null);
                }}
              >
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
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
    </section>
  );
}

/* --- Die Leinwand --------------------------------------------------------- */

/**
 * Die neun Felder in der klassischen Anordnung — wo welches steht, sagt
 * `bausteine.css` über `data-feld`, nicht diese Liste. Die Nummern kommen vom
 * Server und folgen der Reihenfolge der SPG Academy.
 *
 * Wer bearbeiten darf, trifft das ganze Feld: Der Knopf sitzt auf der
 * Überschrift und spannt sich über den Kasten. Ein Knopf *um* das Feld herum
 * ginge nicht — darin stünden eine Überschrift und eine Liste, und das darf
 * in einem Knopf nicht stehen.
 */
function Leinwand({
  vorhaben,
  felder,
  oeffnen,
}: {
  vorhaben: Vorhaben;
  felder: Canvasfeld[];
  oeffnen: ((feld: string) => void) | null;
}) {
  const raster = (
    <div className="leinwand">
      {felder.map((f) => {
        const punkte = punkteIn(vorhaben, f.feld);
        // Die Personas gehören zu Customer Segments und stehen dort unter den
        // Punkten — mit Namen und dem Nötigsten, der Steckbrief ist im Fenster.
        const personas = f.feld === "kunden" ? vorhaben.personas : [];
        const leer = punkte.length === 0 && personas.length === 0;
        return (
          <section
            key={f.feld}
            className="leinwand-feld"
            data-feld={f.feld}
            data-leer={leer ? "ja" : "nein"}
          >
            <h3 className="leinwand-kopf">
              <span className="leinwand-nummer">{f.nummer}</span>
              {oeffnen ? (
                <button type="button" className="leinwand-griff" onClick={() => oeffnen(f.feld)}>
                  {f.titel}
                </button>
              ) : (
                f.titel
              )}
              {oeffnen && <Zeichen name="stift" klasse="leinwand-stift" />}
            </h3>
            {leer ? (
              <ul className="leinwand-fragen">
                {f.leitfragen.map((frage) => (
                  <li key={frage}>{frage}</li>
                ))}
              </ul>
            ) : (
              <>
                {punkte.length > 0 && (
                  <ul className="leinwand-punkte">
                    {punkte.map((p) => (
                      <li key={p.id}>{p.text}</li>
                    ))}
                  </ul>
                )}
                {personas.length > 0 && (
                  <ul className="leinwand-personas">
                    {personas.map((p) => (
                      <li key={p.id}>
                        <Zeichen name="kontakte" />
                        <span>
                          <b>{p.name}</b>
                          {personaKurz(p) && <em>{personaKurz(p)}</em>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );

  // Unter der Leinwand, mit etwas Abstand, die Zeile, die sagt, was die
  // Mittellinie teilt: links das Produkt, rechts der Markt. Am Handy, wo die
  // Felder untereinander stehen, gibt es keine Mitte — dort fällt sie weg.
  return (
    <div className="leinwand-block">
      {raster}
      <div className="leinwand-achse" aria-hidden="true">
        <span>Product</span>
        <span>Market</span>
      </div>
    </div>
  );
}

/* --- Ein Feld bearbeiten -------------------------------------------------- */

/**
 * Das Fenster zu einem Feld: oben die Leitfragen, darunter die Punkte als
 * Liste von Zeilen.
 *
 * Getippt wird wie in einer Aufzählung: **Enter** beginnt den nächsten Punkt,
 * **Rückschritt** in einer leeren Zeile nimmt sie weg. Umschalt+Enter bricht
 * innerhalb eines Punktes um. Gespeichert wird erst mit „Speichern" oder beim
 * Weiterblättern — nicht beim Tippen: Jede Pause schriebe sonst einen Eintrag
 * ins Änderungsprotokoll, und das soll lesbar bleiben.
 */
function Feldfenster({
  vorhaben,
  felder,
  feld,
  oeffnen,
  darfLoeschen,
}: {
  vorhaben: Vorhaben;
  felder: Canvasfeld[];
  feld: string;
  oeffnen: (feld: string | null) => void;
  /** Für den Steckbrief einer Persona: Entfernen darf nur der Admin. */
  darfLoeschen: boolean;
}) {
  const neuLaden = useNeuLaden();
  const [persona, setPersona] = useState<Persona | "neu" | null>(null);
  const gespeichert = punkteIn(vorhaben, feld);
  const [entwuerfe, setEntwuerfe] = useState<Punktentwurf[]>(() => alsEntwuerfe(gespeichert));
  const [laeuft, setLaeuft] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const zeilen = useRef(new Map<string, HTMLTextAreaElement>());
  const fokus = useRef<{ schluessel: string; ende: boolean } | null>({
    schluessel: entwuerfe[entwuerfe.length - 1].schluessel,
    ende: true,
  });

  const stelle = felder.findIndex((f) => f.feld === feld);
  const dieses = felder[stelle];
  const vorher = felder[stelle - 1] ?? null;
  const nachher = felder[stelle + 1] ?? null;
  const geaendert = istGeaendert(gespeichert, entwuerfe);

  // Nach jedem Einfügen oder Entfernen die richtige Zeile in den Fokus — erst
  // nach dem Zeichnen, vorher gibt es die neue Zeile noch nicht.
  useLayoutEffect(() => {
    const ziel = fokus.current;
    if (!ziel) return;
    const zeile = zeilen.current.get(ziel.schluessel);
    if (!zeile) return;
    zeile.focus();
    const ort = ziel.ende ? zeile.value.length : 0;
    zeile.setSelectionRange(ort, ort);
    fokus.current = null;
  });

  function setzen(schluessel: string, text: string) {
    setEntwuerfe((alt) => alt.map((e) => (e.schluessel === schluessel ? { ...e, text } : e)));
  }

  function einfuegenNach(stelleNeu: number) {
    const neu = { schluessel: neuerSchluessel(), id: null, text: "" };
    setEntwuerfe((alt) => [...alt.slice(0, stelleNeu + 1), neu, ...alt.slice(stelleNeu + 1)]);
    fokus.current = { schluessel: neu.schluessel, ende: true };
  }

  function entfernen(i: number) {
    setEntwuerfe((alt) => {
      if (alt.length === 1) {
        // Die letzte Zeile bleibt als leere stehen — ein Feld ohne jede Zeile
        // hätte keinen Ort mehr, an dem man zu tippen beginnt.
        fokus.current = { schluessel: alt[0].schluessel, ende: true };
        return [{ ...alt[0], id: null, text: "" }];
      }
      const rest = alt.filter((_, j) => j !== i);
      fokus.current = { schluessel: rest[Math.max(0, i - 1)].schluessel, ende: true };
      return rest;
    });
  }

  function verschieben(i: number, um: -1 | 1) {
    const ziel = i + um;
    if (ziel < 0 || ziel >= entwuerfe.length) return;
    setEntwuerfe((alt) => {
      const neu = [...alt];
      [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
      return neu;
    });
    fokus.current = { schluessel: entwuerfe[i].schluessel, ende: true };
  }

  function beiTaste(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      einfuegenNach(i);
    } else if (e.key === "Backspace" && entwuerfe[i].text === "" && entwuerfe.length > 1) {
      e.preventDefault();
      entfernen(i);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      verschieben(i, e.key === "ArrowUp" ? -1 : 1);
    }
  }

  /** Speichert, wenn etwas offen ist, und geht dann zu `weiter` (null = schließen). */
  async function speichernUnd(weiter: string | null) {
    if (!geaendert) return oeffnen(weiter);
    setLaeuft(true);
    try {
      await hole(`/vorhaben/${vorhaben.id}/feld/`, {
        method: "POST",
        body: JSON.stringify({ feld, punkte: zumSenden(entwuerfe) }),
      });
      neuLaden();
      melden("gut", `„${dieses.titel}“ ist gespeichert.`);
      oeffnen(weiter);
    } catch {
      // `hole` hat den Grund schon gemeldet. Das Fenster bleibt offen — sonst
      // wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  // Hinausklicken, Abbrechen und Escape gehen denselben Weg: Steht etwas
  // Ungespeichertes da, wird gefragt, sonst schließt es sofort.
  const zurueck = () => (geaendert ? setFragtVerwerfen(true) : oeffnen(null));

  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Steht der Steckbrief darüber, gehört das Escape ihm.
      if (persona !== null) return;
      if (fragtVerwerfen) setFragtVerwerfen(false);
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });

  return (
    <>
      <div
        className="dialog-grund"
        role="dialog"
        aria-modal="true"
        aria-label={dieses.titel}
        onClick={zurueck}
      >
        <div className="dialog dialog-arbeit feldfenster" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>
                <span className="leinwand-nummer">{dieses.nummer}</span>
                {dieses.titel}
              </h2>
              {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button
                type="button"
                className="knopf"
                onClick={() => speichernUnd(null)}
                disabled={laeuft || !geaendert}
              >
                Speichern
              </button>
            </div>
          </div>

          <div className="dialog-koerper">
            {/* Erst, wie das Ergebnis aussehen soll, dann, worüber man
                nachdenkt. Die Aufgabe steht über den Fragen, weil sie das
                Maß ist, an dem man die Punkte am Ende misst. */}
            {dieses.aufgabe.length > 0 && (
              <div className="feld-aufgabe">
                <span className="beschriftung-klein">Aufgabe</span>
                <ul>
                  {dieses.aufgabe.map((satz) => (
                    <li key={satz}>{satz}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="feld-leitfragen">
              {dieses.leitfragen.map((frage) => (
                <li key={frage}>{frage}</li>
              ))}
            </ul>

            <ol className="punkt-liste">
              {entwuerfe.map((e, i) => (
                <li key={e.schluessel} className="punkt-zeile">
                  <Wachsfeld
                    wert={e.text}
                    platzhalter={i === 0 ? "Erster Punkt …" : "Nächster Punkt …"}
                    beschriftung={`Punkt ${i + 1}`}
                    festhalten={(el) => {
                      if (el) zeilen.current.set(e.schluessel, el);
                      else zeilen.current.delete(e.schluessel);
                    }}
                    aendern={(text) => setzen(e.schluessel, text)}
                    taste={(ev) => beiTaste(ev, i)}
                  />
                  <span className="punkt-griffe">
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Nach oben"
                      title="Nach oben (Alt+↑)"
                      disabled={i === 0}
                      onClick={() => verschieben(i, -1)}
                    >
                      <Zeichen name="hoch" />
                    </button>
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Nach unten"
                      title="Nach unten (Alt+↓)"
                      disabled={i === entwuerfe.length - 1}
                      onClick={() => verschieben(i, 1)}
                    >
                      <Zeichen name="runter" />
                    </button>
                    <button
                      type="button"
                      className="punkt-griff"
                      aria-label="Punkt streichen"
                      title="Punkt streichen"
                      onClick={() => entfernen(i)}
                    >
                      <Zeichen name="kreuz" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="knopf-still punkt-neu"
              onClick={() => einfuegenNach(entwuerfe.length - 1)}
            >
              <Zeichen name="plus" />
              Punkt
            </button>

            {/* Die Personas stehen nur bei Customer Segments. Sie werden für
                sich gespeichert, im Steckbrief — unabhängig von den Punkten
                darüber, die erst mit „Speichern" gehen. */}
            {feld === "kunden" && (
              <div className="persona-bereich">
                <div className="persona-kopf">
                  <span className="beschriftung-klein">Personas</span>
                  <button type="button" className="knopf-still" onClick={() => setPersona("neu")}>
                    <Zeichen name="plus" />
                    Persona
                  </button>
                </div>
                {vorhaben.personas.length === 0 ? (
                  <p className="persona-leer">
                    Noch keine Persona. Ein Steckbrief ist eine erfundene Person mit Alter,
                    Einkommen und Bedürfnissen, gegen die ihr jeden Entwurf prüft.
                  </p>
                ) : (
                  <ul className="persona-liste">
                    {vorhaben.personas.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="persona-karte" onClick={() => setPersona(p)}>
                          <Zeichen name="kontakte" />
                          <span>
                            <b>{p.name}</b>
                            <em>{personaKurz(p) || "Steckbrief ergänzen"}</em>
                          </span>
                          <span className="persona-rolle">
                            {ROLLEN.find((r) => r.wert === p.rolle)?.text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Weiterblättern speichert, was offen ist. Wer die neun Felder
                der Reihe nach durchgeht, soll nicht vor jedem Feld „Speichern"
                drücken müssen — und nicht bei jedem gefragt werden. */}
            <div className="feld-blaettern">
              {vorher ? (
                <button
                  type="button"
                  className="knopf-still"
                  disabled={laeuft}
                  onClick={() => speichernUnd(vorher.feld)}
                >
                  <Zeichen name="zeiger" klasse="zeiger-zurueck" />
                  {vorher.nummer} {vorher.titel}
                </button>
              ) : (
                <span />
              )}
              {nachher && (
                <button
                  type="button"
                  className="knopf-still"
                  disabled={laeuft}
                  onClick={() => speichernUnd(nachher.feld)}
                >
                  {nachher.nummer} {nachher.titel}
                  <Zeichen name="zeiger" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {persona !== null && (
        <Personafenster
          vorhaben={vorhaben}
          persona={persona === "neu" ? null : persona}
          darfLoeschen={darfLoeschen}
          schliessen={() => setPersona(null)}
        />
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>
              An „{dieses.titel}“ ist etwas geändert und noch nicht gespeichert. Wer jetzt schließt,
              hat wieder den Stand von vorher.
            </p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(false)}>
                Weiter bearbeiten
              </button>
              <button type="button" className="knopf-still" onClick={() => oeffnen(null)}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() => {
                  setFragtVerwerfen(false);
                  speichernUnd(null);
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

/**
 * Ein Textfeld, das mit seinem Inhalt wächst. Ein Punkt ist meist eine Zeile,
 * manchmal drei — ein festes Maß wäre für das eine zu groß und für das andere
 * zu klein, und ein Rollbalken in einem Stichpunkt versteckt genau den Teil,
 * den man gerade umschreibt.
 *
 * Die Höhe wird gesetzt und nicht über `field-sizing: content` erledigt:
 * Das kann Safari auf den Geräten, die hier im Einsatz sind, noch nicht.
 */
function Wachsfeld({
  wert,
  platzhalter,
  beschriftung,
  festhalten,
  aendern,
  taste,
}: {
  wert: string;
  platzhalter: string;
  beschriftung: string;
  festhalten: (el: HTMLTextAreaElement | null) => void;
  aendern: (text: string) => void;
  taste: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const anpassen = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };

  useLayoutEffect(anpassen, [wert]);

  // Auch wenn sich die Breite ändert — Fenster schmaler, Handy gedreht —,
  // bricht der Text anders um. Ohne das stünde ein Punkt nach dem Drehen
  // halb abgeschnitten da, bis jemand hineintippt.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let breite = el.clientWidth;
    const beobachter = new ResizeObserver(() => {
      if (el.clientWidth === breite) return;
      breite = el.clientWidth;
      anpassen();
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        festhalten(el);
      }}
      className="feld punkt-eingabe"
      rows={1}
      value={wert}
      placeholder={platzhalter}
      aria-label={beschriftung}
      onChange={(e) => aendern(e.target.value)}
      onKeyDown={taste}
    />
  );
}

/* --- Eine Persona --------------------------------------------------------- */

type Steckbrief = {
  name: string;
  rolle: Persona["rolle"];
  alter: string;
  geschlecht: string;
  wohnort: string;
  beruf: string;
  haushalt: string;
  einkommen: string;
  beduerfnisse: string;
  probleme: string;
};

function alsSteckbrief(p: Persona | null): Steckbrief {
  return {
    name: p?.name ?? "",
    rolle: p?.rolle ?? "beides",
    alter: p?.alter != null ? String(p.alter) : "",
    geschlecht: p?.geschlecht ?? "",
    wohnort: p?.wohnort ?? "",
    beruf: p?.beruf ?? "",
    haushalt: p?.haushalt ?? "",
    einkommen: betragZumBearbeiten(p?.einkommen ?? null),
    beduerfnisse: p?.beduerfnisse ?? "",
    probleme: p?.probleme ?? "",
  };
}

/**
 * Der Steckbrief einer Persona — eine erfundene Person, für die das Produkt
 * gedacht ist. Ein Fenster über dem Feldfenster, mit eigenem Speichern: Eine
 * Persona ist ein Datensatz für sich, kein Punkt im Feld.
 *
 * Alter und Einkommen werden hier geprüft und nicht erst am Server, damit
 * „achtzig" nicht als Fehlermeldung von oben kommt, sondern am Feld steht.
 */
function Personafenster({
  vorhaben,
  persona,
  darfLoeschen,
  schliessen,
}: {
  vorhaben: Vorhaben;
  persona: Persona | null;
  darfLoeschen: boolean;
  schliessen: () => void;
}) {
  const neuLaden = useNeuLaden();
  const anfang = alsSteckbrief(persona);
  const [brief, setBrief] = useState<Steckbrief>(anfang);
  const [laeuft, setLaeuft] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);

  const setze = (teil: Partial<Steckbrief>) => setBrief((alt) => ({ ...alt, ...teil }));
  const geaendert = (Object.keys(anfang) as (keyof Steckbrief)[]).some((k) => anfang[k] !== brief[k]);

  const alter = brief.alter.trim() === "" ? null : Number(brief.alter);
  const alterFalsch = alter !== null && (!Number.isInteger(alter) || alter < 0 || alter > 120);
  const einkommen = betragAusEingabe(brief.einkommen);
  const einkommenFalsch = einkommen === undefined;
  const bereit = brief.name.trim() !== "" && !alterFalsch && !einkommenFalsch && geaendert;

  async function speichern() {
    if (!bereit) return;
    setLaeuft(true);
    const daten = {
      vorhaben: vorhaben.id,
      name: brief.name.trim(),
      rolle: brief.rolle,
      alter,
      geschlecht: brief.geschlecht.trim(),
      wohnort: brief.wohnort.trim(),
      beruf: brief.beruf.trim(),
      haushalt: brief.haushalt.trim(),
      einkommen,
      beduerfnisse: brief.beduerfnisse.trim(),
      probleme: brief.probleme.trim(),
    };
    try {
      await hole(persona ? `/personas/${persona.id}/` : "/personas/", {
        method: persona ? "PATCH" : "POST",
        body: JSON.stringify(persona ? daten : { ...daten, reihenfolge: vorhaben.personas.length }),
      });
      neuLaden();
      melden("gut", `Die Persona „${daten.name}“ ist gespeichert.`);
      schliessen();
    } catch {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!persona) return;
    setLaeuft(true);
    try {
      await hole(`/personas/${persona.id}/`, { method: "DELETE" });
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

  const feld = (
    name: keyof Steckbrief,
    beschriftung: string,
    weiteres: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="profilfeld">
      <span className="beschriftung-klein">{beschriftung}</span>
      <input
        className="feld"
        value={brief[name]}
        onChange={(e) => setze({ [name]: e.target.value } as Partial<Steckbrief>)}
        {...weiteres}
      />
    </label>
  );

  return (
    <>
      <div
        className="dialog-grund"
        role="dialog"
        aria-modal="true"
        aria-label="Persona"
        onClick={zurueck}
      >
        <div className="dialog dialog-arbeit personafenster" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>{persona ? persona.name : "Neue Persona"}</h2>
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

          <div className="dialog-koerper">
            <div className="persona-felder">
              {feld("name", "Name", { autoFocus: !persona, placeholder: "z. B. Maria Huber", maxLength: 120 })}
              <label className="profilfeld">
                <span className="beschriftung-klein">Rolle</span>
                <select
                  className="feld"
                  value={brief.rolle}
                  onChange={(e) => setze({ rolle: e.target.value as Persona["rolle"] })}
                >
                  {ROLLEN.map((r) => (
                    <option key={r.wert} value={r.wert}>
                      {r.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="profilfeld">
                <span className="beschriftung-klein">Alter</span>
                <input
                  className="feld"
                  inputMode="numeric"
                  value={brief.alter}
                  placeholder="Jahre"
                  aria-invalid={alterFalsch}
                  onChange={(e) => setze({ alter: e.target.value })}
                />
                {alterFalsch && <span className="feldhinweis feld-falsch">Eine ganze Zahl zwischen 0 und 120.</span>}
              </label>
              {feld("geschlecht", "Geschlecht", { placeholder: "z. B. weiblich", maxLength: 40 })}
              {feld("wohnort", "Wohnort", { placeholder: "z. B. Graz, eigene Wohnung", maxLength: 120 })}
              {feld("beruf", "Beruf", { placeholder: "z. B. Pensionistin", maxLength: 120 })}
              {feld("haushalt", "Familie und Haushalt", { placeholder: "z. B. verwitwet, Tochter im Ort", maxLength: 160 })}
              <label className="profilfeld">
                <span className="beschriftung-klein">Einkommen netto im Monat</span>
                <input
                  className="feld"
                  inputMode="decimal"
                  value={brief.einkommen}
                  placeholder="€"
                  aria-invalid={einkommenFalsch}
                  onChange={(e) => setze({ einkommen: e.target.value })}
                />
                {einkommenFalsch && <span className="feldhinweis feld-falsch">Ein Betrag in Euro, z. B. 1.450.</span>}
              </label>
              <label className="profilfeld persona-breit">
                <span className="beschriftung-klein">Bedürfnisse und Ziele</span>
                <textarea
                  className="feld"
                  rows={3}
                  value={brief.beduerfnisse}
                  placeholder="Was will sie erreichen? Was ist ihr wichtig?"
                  onChange={(e) => setze({ beduerfnisse: e.target.value })}
                />
              </label>
              <label className="profilfeld persona-breit">
                <span className="beschriftung-klein">Probleme und Frust</span>
                <textarea
                  className="feld"
                  rows={3}
                  value={brief.probleme}
                  placeholder="Was hält sie auf? Woran scheitert sie heute?"
                  onChange={(e) => setze({ probleme: e.target.value })}
                />
              </label>
            </div>

            {persona && darfLoeschen && (
              <div className="persona-fuss">
                <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
                  <Zeichen name="korb" />
                  Persona entfernen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {fragtLoeschen && persona && (
        <Loeschdialog
          name={persona.name}
          was="Die Persona"
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>Am Steckbrief ist etwas geändert. Wer jetzt schließt, hat wieder den Stand von vorher.</p>
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
