/**
 * Module · Runway-Planung: was in den nächsten Monaten herein- und hinausgeht
 * und wie lange das Geld damit reicht.
 *
 * Abgelöst hat das Modul einen eigenständigen HTML-Planer, dessen Daten im
 * Browser lagen. **Gerechnet wird am Server** (`socos/services/runway.py`):
 * die Seite zeichnet, was von dort kommt, und schreibt Posten über
 * `/planposten/` und `/runwayplaene/`.
 *
 * **Was die Seite beantwortet, von oben nach unten:** Reicht das Geld (Lage
 * in einem Satz, vier Kennzahlen)? Wie verläuft der Kontostand (Linie, ein
 * Monat zum Nachsehen)? Was muss nachgeschossen werden (Abrufe)? Und darunter
 * die Posten selbst, nach Art in Registern, an Ort und Stelle zu ändern.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import {
  useNeuLaden,
  useRunway,
  type Ich,
  type Planposten,
  type Postenart,
  type Runwayplan,
  type Runwayrechnung,
  type Szenario,
} from "../basis/daten";
import { alsProzent } from "../basis/foerderungen";
import { melden } from "../basis/meldungen";
import { betragAusEingabe } from "../basis/module";
import {
  ARTEN,
  RHYTHMEN,
  SZENARIEN,
  achse,
  artInfo,
  euro,
  euroKurz,
  euroMitVorzeichen,
  lage,
  monatKurz,
  monatLang,
  monatsabstand,
  monatsende,
  runwayText,
  sortiert,
  tagText,
  vorschlaege,
} from "../basis/runway";
import { Zustand } from "../basis/Zustand";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Feldtext } from "../bausteine/Feldtext";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";
import { Betragsfeld } from "./Foerderungen";

/** Speichern, danach alles neu holen — jede Zahl auf der Seite rechnet der Server neu. */
function useSpeichern() {
  const neuLaden = useNeuLaden();
  return async (pfad: string, daten: Record<string, unknown> | null, methode: "PATCH" | "POST" | "DELETE" = "PATCH") => {
    await hole(pfad, { method: methode, body: daten === null ? undefined : JSON.stringify(daten) });
    neuLaden();
  };
}

const heuteTag = () => new Date().toISOString().slice(0, 10);

export function Runway({ ich }: { ich: Ich }) {
  const [szenario, setSzenario] = useState<Szenario>("basis");
  const abfrage = useRunway(szenario);
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const { plan, posten, rechnung } = abfrage.data;
  if (!plan || !rechnung) return <OhnePlan darf={ich.darf.finanzen_eintragen} />;
  return (
    <div className="spalte rw-seite">
      <Kopfleiste plan={plan} rechnung={rechnung} szenario={szenario} setSzenario={setSzenario} />
      <Lagekarte plan={plan} rechnung={rechnung} />
      <Kennzahlen plan={plan} rechnung={rechnung} />
      <Verlauf plan={plan} rechnung={rechnung} />
      {rechnung.abrufe.length > 0 && <Ueberbrueckung plan={plan} rechnung={rechnung} darf={ich.darf.finanzen_eintragen} />}
      <Posten plan={plan} posten={posten} rechnung={rechnung} ich={ich} />
      <Monatstabelle rechnung={rechnung} />
    </div>
  );
}

function OhnePlan({ darf }: { darf: boolean }) {
  const speichern = useSpeichern();
  return (
    <div className="karte">
      <Leerstelle
        was="Noch kein Plan"
        satz={
          darf
            ? "Ein Plan beginnt mit einem Monat und einem Kontostand. Förderungen, Team und Kosten kommen danach."
            : "Den Plan legt ein Admin an. Danach steht hier, wie lange das Geld reicht."
        }
        aktion={
          darf
            ? { text: "Plan ab diesem Monat anlegen", tun: () => void speichern("/runwayplaene/", { beginn: heuteTag() }, "POST") }
            : undefined
        }
      />
    </div>
  );
}

/* --- Kopf: Szenario und Zeitraum -------------------------------------------- */

function Kopfleiste({
  plan,
  rechnung,
  szenario,
  setSzenario,
}: {
  plan: Runwayplan;
  rechnung: Runwayrechnung;
  szenario: Szenario;
  setSzenario: (s: Szenario) => void;
}) {
  const erster = rechnung.monate[0].monat;
  const letzter = rechnung.monate[rechnung.monate.length - 1].monat;
  const ist = rechnung.kennzahlen.letzter_ist;
  return (
    <div className="zeitraumleiste rw-kopf">
      <span className="beschriftung">Szenario</span>
      <div className="spannenwahl" role="group" aria-label="Szenario">
        {SZENARIEN.map((s) => (
          <button key={s.wert} type="button" aria-pressed={szenario === s.wert} onClick={() => setSzenario(s.wert)}>
            {s.text}
          </button>
        ))}
      </div>
      <span className="zahl spanne-datum">
        {monatKurz(erster)} – {monatKurz(letzter)} · {plan.monate} Monate
      </span>
      {ist && <span className="spanne-datum spanne-hinweis">ab Kontostand vom {tagText(ist)}</span>}
    </div>
  );
}

/* --- Lage und Kennzahlen ---------------------------------------------------- */

function Lagekarte({ plan, rechnung }: { plan: Runwayplan; rechnung: Runwayrechnung }) {
  const l = lage(rechnung, plan);
  return (
    <section className={`karte rw-lage ${l.art === "gut" ? "" : "karte-achtung"}`} data-lage={l.art}>
      <h2>{l.titel}</h2>
      <p>{l.satz}</p>
    </section>
  );
}

function Kennzahlen({ plan, rechnung }: { plan: Runwayplan; rechnung: Runwayrechnung }) {
  const k = rechnung.kennzahlen;
  const runway = runwayText(rechnung);
  const tief = Number(k.tiefster_stand);
  const abrufe = rechnung.abrufe.length;
  return (
    <div className="raster raster-4">
      <div className="karte kennzahl" data-lage={k.minus_ab ? "luecke" : undefined}>
        <div className="beschriftung">Runway</div>
        <div className="wert">{runway.wert}</div>
        <div className="hinweis">{runway.hinweis}</div>
      </div>
      <div className="karte kennzahl" data-lage={tief < 0 ? "luecke" : tief < Number(plan.puffer) ? "puffer" : undefined}>
        <div className="beschriftung">Tiefster Stand</div>
        <div className="wert">{euro(k.tiefster_stand)}</div>
        <div className="hinweis">im {monatLang(k.tiefster_monat)}</div>
      </div>
      <div className="karte kennzahl" data-lage={abrufe ? "luecke" : undefined}>
        <div className="beschriftung">Überbrückung</div>
        <div className="wert">{euro(k.ueberbrueckung)}</div>
        <div className="hinweis">
          {abrufe ? `${abrufe} ${abrufe === 1 ? "Abruf" : "Abrufe"}, erster ${monatKurz(rechnung.abrufe[0].monat)}` : "kein Bedarf"}
          {Number(k.darlehen_summe) > 0 && ` · ${euro(k.darlehen_summe)} schon eingeplant`}
        </div>
      </div>
      <div className="karte kennzahl">
        <div className="beschriftung">Ausgaben je Monat</div>
        <div className="wert">{euro(k.burn)}</div>
        <div className="hinweis">Personal und Kosten, Schnitt ab {monatKurz(k.burn_ab)}</div>
      </div>
    </div>
  );
}

/* --- Die Linie --------------------------------------------------------------- */

const BREITE = 1000;
const HOEHE = 220;

/**
 * Der Kontostand am Monatsende über den ganzen Plan, dazu gestrichelt der
 * Verlauf ohne Gesellschafterdarlehen. Darunter steht ein Monat ausgeschrieben
 * — der laufende, bis man mit der Maus über einen anderen fährt oder ihn
 * antippt.
 *
 * Selbst gezeichnet wie die Kontostandlinie auf dem Dashboard, aus denselben
 * Gründen: `preserveAspectRatio="none"` mit `non-scaling-stroke`, keine
 * Kreise, Beschriftung als HTML daneben (siehe bausteine/Kontostandlinie.tsx).
 */
function Verlauf({ plan, rechnung }: { plan: Runwayplan; rechnung: Runwayrechnung }) {
  const monate = rechnung.monate;
  const n = monate.length;
  const jetzt = Math.min(n - 1, Math.max(0, monatsabstand(monate[0].monat, rechnung.kennzahlen.burn_ab)));
  const [gewaehlt, setGewaehlt] = useState(jetzt);
  const i = Math.min(gewaehlt, n - 1);

  const mitDarlehen = Number(rechnung.kennzahlen.darlehen_summe) > 0;
  const puffer = Number(plan.puffer);
  const staende = monate.map((m) => Number(m.stand));
  const ohne = monate.map((m) => Number(m.ohne_darlehen));
  const a = achse(mitDarlehen ? [...staende, ...ohne] : staende, puffer);
  const x = (k: number) => ((k + 0.5) / n) * BREITE;
  const y = (v: number) => ((a.oben - v) / (a.oben - a.unten)) * HOEHE;
  const pfad = (werte: number[]) => werte.map((v, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const linien: number[] = [];
  for (let w = a.unten; w <= a.oben; w += a.schritt) linien.push(w);
  // Unter dem Jahr jeder dritte Monat, am Handy jeder sechste (CSS blendet
  // die mit `data-neben` aus). Jeder Monat wäre bei zwei Jahren ein Brei.
  const jeder = n > 12 ? 3 : 1;

  return (
    <section className="karte rw-verlauf">
      <div className="kartenkopf">
        <h2>Kontostand am Monatsende</h2>
        <div className="rw-legende">
          <span data-muster="plan">mit allem</span>
          {mitDarlehen && <span data-muster="ohne">ohne Gesellschafterdarlehen</span>}
          {puffer > 0 && <span data-muster="puffer">unter dem Puffer</span>}
        </div>
      </div>

      <div className="rw-flaeche">
        <div className="rw-y" aria-hidden="true">
          {linien.map((w) => (
            <span key={w} className="zahl" style={{ top: `${(y(w) / HOEHE) * 100}%` }}>
              {euroKurz(w)}
            </span>
          ))}
        </div>
        <div className="rw-bild">
          <svg viewBox={`0 0 ${BREITE} ${HOEHE}`} preserveAspectRatio="none" aria-hidden="true">
            {puffer > 0 && <rect className="rw-zone-puffer" x={0} width={BREITE} y={y(puffer)} height={Math.max(0, y(0) - y(puffer))} />}
            {a.unten < 0 && <rect className="rw-zone-minus" x={0} width={BREITE} y={y(0)} height={HOEHE - y(0)} />}
            {linien.map((w) => (
              <path key={w} className={w === 0 ? "rw-null" : "rw-raster"} d={`M0,${y(w).toFixed(1)} L${BREITE},${y(w).toFixed(1)}`} />
            ))}
            <path className="rw-heute" d={`M${x(jetzt).toFixed(1)},0 L${x(jetzt).toFixed(1)},${HOEHE}`} />
            <path className="rw-gewaehlt" d={`M${x(i).toFixed(1)},0 L${x(i).toFixed(1)},${HOEHE}`} />
            {mitDarlehen && <path className="rw-linie-ohne" d={pfad(ohne)} />}
            <path className="rw-linie" d={pfad(staende)} />
          </svg>
          {/* Die Trefferflächen liegen als Streifen über dem Bild — einer je
              Monat. Für Tastatur und Vorleser steht dasselbe in der Tabelle
              „Monat für Monat" darunter; 24 Tabstopps hier hülfen niemandem. */}
          <div className="rw-treffer" aria-hidden="true">
            {monate.map((m, k) => (
              <button
                key={m.monat}
                type="button"
                tabIndex={-1}
                data-gewaehlt={k === i || undefined}
                onMouseEnter={() => setGewaehlt(k)}
                onClick={() => setGewaehlt(k)}
              />
            ))}
          </div>
        </div>
        <div className="rw-x" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {monate.map((m, k) => (
            <span key={m.monat} className="zahl" data-neben={(k / jeder) % 2 === 1 || undefined}>
              {k % jeder === 0 ? monatKurz(m.monat) : ""}
            </span>
          ))}
        </div>
      </div>

      <Monatsblick rechnung={rechnung} i={i} />
    </section>
  );
}

/** Ein Monat ausgeschrieben: Stand, was herein- und hinausgeht, was passiert. */
function Monatsblick({ rechnung, i }: { rechnung: Runwayrechnung; i: number }) {
  const m = rechnung.monate[i];
  return (
    <div className="rw-monat" aria-live="polite">
      <div className="rw-monatkopf">
        <b>{monatLang(m.monat)}</b>
        <span className="zahl" data-negativ={Number(m.stand) < 0 || undefined}>
          {euro(m.stand)}
        </span>
        {m.ist_datum && m.ist !== null && (
          <em>
            Kontostand am {tagText(m.ist_datum)}: <span className="zahl">{euro(m.ist)}</span>
          </em>
        )}
      </div>
      <dl className="rw-monatzahlen">
        <div>
          <dt>herein</dt>
          <dd className="zahl">{euro(m.ein)}</dd>
        </div>
        <div>
          <dt>hinaus</dt>
          <dd className="zahl">{euro(m.aus)}</dd>
        </div>
        <div>
          <dt>davon Personal</dt>
          <dd className="zahl">{euro(m.personal)}</dd>
        </div>
        <div>
          <dt>davon Kosten</dt>
          <dd className="zahl">{euro(m.kosten)}</dd>
        </div>
      </dl>
      {m.ereignisse.length > 0 && (
        <ul className="rw-ereignisse">
          {m.ereignisse.map((e, k) => (
            <li key={k}>
              <span>{e.text}</span>
              <span className="zahl">{euroMitVorzeichen(e.betrag)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --- Überbrückung ------------------------------------------------------------- */

/**
 * Wann wie viel nachgeschossen werden muss, damit der Puffer hält — und auf
 * Knopfdruck als Gesellschafterdarlehen im Plan. Danach rechnet der Server
 * neu, und die Abrufe sind weg, weil sie gedeckt sind.
 */
function Ueberbrueckung({ plan, rechnung, darf }: { plan: Runwayplan; rechnung: Runwayrechnung; darf: boolean }) {
  const neuLaden = useNeuLaden();
  const [laeuft, setLaeuft] = useState(false);

  async function uebernehmen() {
    setLaeuft(true);
    try {
      // Einer nach dem anderen und erst danach neu laden: Zwischendurch
      // neu gerechnet, sähe die Liste der Abrufe halb übernommen aus.
      for (const a of rechnung.abrufe)
        await hole("/planposten/", {
          method: "POST",
          body: JSON.stringify({ art: "darlehen", name: `Überbrückung ${monatKurz(a.monat)}`, betrag: a.betrag, von: `${a.monat}-01` }),
        });
    } catch {
      // `hole` hat den Grund gemeldet; was schon angelegt ist, zeigt das Neuladen.
    } finally {
      setLaeuft(false);
      neuLaden();
    }
  }

  return (
    <section className="karte rw-abrufe">
      <div className="kartenkopf">
        <h2>Überbrückung</h2>
        <span className="dazu">
          deckt je {plan.abruf_monate} {plan.abruf_monate === 1 ? "Monat" : "Monate"}, auf 5.000 € gerundet
        </span>
      </div>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Monat</th>
            <th className="rechts">Stand vorher</th>
            <th className="rechts">Abruf</th>
          </tr>
        </thead>
        <tbody>
          {rechnung.abrufe.map((a) => (
            <tr key={a.monat}>
              <td data-spalte="Monat">{monatLang(a.monat)}</td>
              <td data-spalte="Stand vorher" className="zahl rechts" data-negativ={Number(a.vorher) < 0 || undefined}>
                {euro(a.vorher)}
              </td>
              <td data-spalte="Abruf" className="zahl rechts">
                <b>{euro(a.betrag)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {darf && (
        <div className="rw-knoepfe">
          <button type="button" className="knopf" disabled={laeuft} onClick={uebernehmen}>
            Als Gesellschafterdarlehen übernehmen
          </button>
        </div>
      )}
    </section>
  );
}

/* --- Die Posten ---------------------------------------------------------------- */

type Register = Postenart | "plan";

function Posten({ plan, posten, rechnung, ich }: { plan: Runwayplan; posten: Planposten[]; rechnung: Runwayrechnung; ich: Ich }) {
  const [register, setRegister] = useState<Register>("foerderung");
  const zahl = (art: Postenart) => posten.filter((p) => p.art === art).length;
  return (
    <section className="karte rw-posten">
      <div className="spannenwahl rw-register" role="group" aria-label="Was bearbeiten">
        {ARTEN.map((a) => (
          <button key={a.art} type="button" aria-pressed={register === a.art} onClick={() => setRegister(a.art)}>
            {a.titel} <span className="zahl">{zahl(a.art)}</span>
          </button>
        ))}
        <button type="button" aria-pressed={register === "plan"} onClick={() => setRegister("plan")}>
          Einstellungen
        </button>
      </div>
      {register === "plan" ? (
        <Planfelder plan={plan} darf={ich.darf.finanzen_eintragen} />
      ) : (
        <Postenliste key={register} art={register} plan={plan} posten={posten} rechnung={rechnung} ich={ich} />
      )}
    </section>
  );
}

type Spalte = {
  feld: keyof Planposten | "summe";
  titel: string;
  typ: "text" | "betrag" | "datum" | "rhythmus" | "status" | "prozent" | "summe";
  rechts?: boolean;
};

/**
 * Welche Spalten jede Art hat. Die Beschriftung am Handy (`data-spalte`) kommt
 * aus derselben Liste wie der Tabellenkopf — eine Liste, damit das nächste
 * Feld nicht nur am Rechner dasteht.
 */
function spalten(art: Postenart, plan: Runwayplan): Spalte[] {
  const info = artInfo(art);
  const name: Spalte = { feld: "name", titel: { foerderung: "Förderung", person: "Name" }[art as string] ?? "Bezeichnung", typ: "text" };
  const gruppe: Spalte[] = info.gruppe ? [{ feld: "gruppe", titel: info.gruppe, typ: "text" }] : [];
  const von: Spalte = { feld: "von", titel: info.von, typ: "datum" };
  const bis: Spalte[] = info.bis ? [{ feld: "bis", titel: info.bis, typ: "datum" }] : [];
  const summe: Spalte = { feld: "summe", titel: "Im Plan", typ: "summe", rechts: true };
  switch (art) {
    case "foerderung":
      return [name, ...gruppe, von, { feld: "betrag", titel: "Betrag", typ: "betrag", rechts: true }, { feld: "status", titel: "Status", typ: "status" }, { feld: "notiz", titel: "Notiz", typ: "text" }];
    case "umsatz":
      return [name, { feld: "betrag", titel: "Betrag netto", typ: "betrag", rechts: true }, { feld: "rhythmus", titel: "Rhythmus", typ: "rhythmus" }, von, ...bis, { feld: "wahrscheinlichkeit", titel: "Wahrsch.", typ: "prozent", rechts: true }, summe];
    case "person":
      return [name, ...gruppe, { feld: "betrag", titel: "Brutto / Monat", typ: "betrag", rechts: true }, von, ...bis, { feld: "lohnnebenkosten", titel: `LNK (sonst ${alsProzent(plan.lohnnebenkosten)})`, typ: "prozent", rechts: true }, summe];
    case "kosten":
      return [name, ...gruppe, { feld: "betrag", titel: "Betrag netto", typ: "betrag", rechts: true }, { feld: "rhythmus", titel: "Rhythmus", typ: "rhythmus" }, von, ...bis, summe];
    case "darlehen":
      return [name, { feld: "betrag", titel: "Betrag", typ: "betrag", rechts: true }, von, ...bis, { feld: "zins", titel: "Zins p. a.", typ: "prozent", rechts: true }];
  }
}

function Postenliste({
  art,
  plan,
  posten,
  rechnung,
  ich,
}: {
  art: Postenart;
  plan: Runwayplan;
  posten: Planposten[];
  rechnung: Runwayrechnung;
  ich: Ich;
}) {
  const speichern = useSpeichern();
  const darf = ich.darf.finanzen_eintragen;
  const info = artInfo(art);
  const liste = sortiert(posten, art);
  const sp = spalten(art, plan);
  const [entfernen, setEntfernen] = useState<Planposten | null>(null);
  const beenden = entfernen && entfernen.rhythmus !== "einmalig" && !entfernen.bis;

  return (
    <div className="rw-liste">
      {liste.length === 0 ? (
        <Leerstelle
          was={`Noch keine ${info.titel === "Team" ? "Person im Team" : info.titel}`}
          satz={darf ? "Unten eintragen — der Verlauf rechnet sofort mit." : "Hier stünde, was ein Admin eingetragen hat."}
        />
      ) : (
        <table className="tabelle rw-tabelle" data-art={art}>
          <thead>
            <tr>
              {sp.map((s) => (
                <th key={s.feld} className={s.rechts ? "rechts" : undefined}>
                  {s.titel}
                </th>
              ))}
              {ich.darf.loeschen && <th aria-label="Entfernen" />}
            </tr>
          </thead>
          <tbody>
            {liste.map((p) => (
              <tr key={p.id}>
                {sp.map((s) => (
                  <td key={s.feld} data-spalte={s.titel} className={s.rechts ? "rechts" : undefined}>
                    <Zelle spalte={s} p={p} plan={plan} rechnung={rechnung} darf={darf} />
                  </td>
                ))}
                {ich.darf.loeschen && (
                  <td className="zeilen-aktionen">
                    <button type="button" className="knopf-still rw-klein" aria-label={`${p.name} entfernen`} onClick={() => setEntfernen(p)}>
                      <Zeichen name="korb" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {darf && <Neuzeile art={art} plan={plan} posten={posten} rechnung={rechnung} />}

      {entfernen && (
        <Loeschdialog
          name={entfernen.name}
          was={`Die ${info.einzahl}`}
          milder={
            beenden
              ? {
                  text: "Zum Monatsende beenden",
                  tun: async () => {
                    await speichern(`/planposten/${entfernen.id}/`, { bis: monatsende(rechnung.heute) }).catch(() => undefined);
                    setEntfernen(null);
                  },
                }
              : undefined
          }
          abbrechen={() => setEntfernen(null)}
          loeschen={async () => {
            await speichern(`/planposten/${entfernen.id}/`, null, "DELETE").catch(() => undefined);
            setEntfernen(null);
          }}
        />
      )}
    </div>
  );
}

/** Eine Zelle, die weiß, wie ihr Feld geändert wird. */
function Zelle({ spalte, p, plan, rechnung, darf }: { spalte: Spalte; p: Planposten; plan: Runwayplan; rechnung: Runwayrechnung; darf: boolean }) {
  const speichern = useSpeichern();
  const aendern = (daten: Record<string, unknown>) => speichern(`/planposten/${p.id}/`, daten);
  const feld = spalte.feld;

  switch (spalte.typ) {
    case "text":
      return (
        <Feldtext
          wert={String(p[feld as keyof Planposten] ?? "")}
          aendern={darf}
          platzhalter={feld === "notiz" ? "—" : undefined}
          speichern={(neu) => speichern(`/planposten/${p.id}/`, { [feld]: neu })}
        />
      );
    case "betrag":
      return <Betragsfeld betrag={p.betrag} aendern={darf} leer="—" speichern={(b) => aendern({ betrag: b ?? "0" })} />;
    case "prozent": {
      const wert = p[feld as "wahrscheinlichkeit" | "lohnnebenkosten" | "zins"];
      return (
        <Betragsfeld
          betrag={wert === null ? null : String(wert)}
          aendern={darf}
          leer={feld === "lohnnebenkosten" ? alsProzent(plan.lohnnebenkosten) : "—"}
          anzeigen={alsProzent}
          beschriftung={spalte.titel}
          // Leer heißt beim Satz einer Person „wie im Plan", sonst null.
          speichern={(b) => aendern({ [feld]: b ?? (feld === "lohnnebenkosten" ? null : "0") })}
        />
      );
    }
    case "datum": {
      // Bei „einmalig" gibt es kein Ende — ein Feld dafür wäre eine Frage ohne Bedeutung.
      if (feld === "bis" && p.rhythmus === "einmalig" && p.art !== "darlehen") return <span className="rw-leise">—</span>;
      return (
        <Datumsfeld
          wert={p[feld as "von" | "bis"]}
          beschriftung={`${spalte.titel} ${p.name}`}
          darf={darf}
          speichern={(neu) => {
            if (feld === "von" && neu === null) return void melden("fehler", "Ohne Anfang weiß der Plan nicht, wann.");
            return aendern({ [feld]: neu });
          }}
        />
      );
    }
    case "rhythmus":
      return (
        <select
          className="feld"
          value={p.rhythmus}
          disabled={!darf}
          aria-label={`Rhythmus ${p.name}`}
          // Wer auf „einmalig" stellt, meint kein Ende mehr — sonst stünde ein
          // unsichtbares Datum im Posten, das beim Zurückstellen wieder auftaucht.
          onChange={(e) => aendern(e.target.value === "einmalig" ? { rhythmus: e.target.value, bis: null } : { rhythmus: e.target.value })}
        >
          {RHYTHMEN.map((r) => (
            <option key={r.wert} value={r.wert}>
              {r.text}
            </option>
          ))}
        </select>
      );
    case "status":
      return (
        <select className="feld" value={p.status} disabled={!darf} aria-label={`Status ${p.name}`} onChange={(e) => aendern({ status: e.target.value })}>
          <option value="geplant">geplant</option>
          <option value="zugesagt">zugesagt</option>
          <option value="erhalten">erhalten</option>
        </select>
      );
    case "summe": {
      const summe = rechnung.je_posten[String(p.id)];
      return <span className="zahl rw-leise">{summe ? euro(summe) : "—"}</span>;
    }
  }
}

/**
 * Ein neuer Posten: Bezeichnung, Betrag, Datum — der Rest bekommt, was bei
 * dieser Art üblich ist, und wird danach in der Zeile geändert. Ein Formular
 * mit allen acht Feldern vorne wäre für den häufigsten Fall sieben zu viel.
 */
function Neuzeile({ art, plan, posten, rechnung }: { art: Postenart; plan: Runwayplan; posten: Planposten[]; rechnung: Runwayrechnung }) {
  const speichern = useSpeichern();
  const info = artInfo(art);
  // Ein neuer Posten fängt heute an — oder mit dem Plan, wenn der noch nicht läuft.
  const start = rechnung.heute < plan.beginn ? plan.beginn : rechnung.heute;
  const [name, setName] = useState("");
  const [betrag, setBetrag] = useState("");
  const [von, setVon] = useState(start);
  const namen = art === "foerderung" ? vorschlaege(posten, art, "name") : [];

  async function dazu() {
    const zahl = betragAusEingabe(betrag);
    if (!name.trim() || !zahl) return void melden("fehler", "Bezeichnung und Betrag, bitte.");
    if (!von) return void melden("fehler", "Ein Datum, bitte.");
    // Eine weitere Tranche einer Förderung bekommt deren Fördergeber mit.
    const geber = art === "foerderung" ? posten.find((p) => p.art === art && p.name === name.trim())?.gruppe ?? "" : "";
    try {
      await speichern("/planposten/", { art, name: name.trim(), betrag: zahl, von, rhythmus: info.rhythmus, gruppe: geber }, "POST");
      setName("");
      setBetrag("");
    } catch {
      // `hole` hat den Grund schon gemeldet; die Eingabe bleibt stehen.
    }
  }

  return (
    <form
      className="rw-neu"
      onSubmit={(e) => {
        e.preventDefault();
        void dazu();
      }}
    >
      <input
        className="feld"
        value={name}
        placeholder={info.neu}
        aria-label={`Bezeichnung der neuen ${info.einzahl}`}
        list={namen.length ? "rw-namen" : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {namen.length > 0 && (
        <datalist id="rw-namen">
          {namen.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      <input
        className="feld zahl"
        inputMode="decimal"
        value={betrag}
        placeholder={art === "person" ? "Brutto / Monat" : "Betrag"}
        aria-label="Betrag"
        onChange={(e) => setBetrag(e.target.value)}
      />
      <input className="feld" type="date" value={von} aria-label={info.von} onChange={(e) => setVon(e.target.value)} />
      <button type="submit" className="knopf-still" disabled={!name.trim() || !betrag.trim()}>
        <Zeichen name="plus" />
        {info.einzahl}
      </button>
    </form>
  );
}

/* --- Einstellungen ----------------------------------------------------------- */

function Planfelder({ plan, darf }: { plan: Runwayplan; darf: boolean }) {
  const speichern = useSpeichern();
  const aendern = (daten: Record<string, unknown>) => speichern(`/runwayplaene/${plan.id}/`, daten);
  return (
    <div className="rw-einstellungen">
      <label className="profilfeld">
        <span className="beschriftung-klein">Erster Monat</span>
        <input
          key={plan.beginn}
          className="feld"
          type="month"
          defaultValue={plan.beginn.slice(0, 7)}
          disabled={!darf}
          onBlur={(e) => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}$/.test(v) && `${v}-01` !== plan.beginn) void aendern({ beginn: `${v}-01` });
          }}
        />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Monate</span>
        <Betragsfeld
          betrag={String(plan.monate)}
          aendern={darf}
          leer="—"
          anzeigen={(w) => `${Number(w)} Monate`}
          beschriftung="Monate im Plan, 6 bis 72"
          speichern={(b) => aendern({ monate: b === null ? 24 : Math.round(Number(b)) })}
        />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Kontostand zu Beginn</span>
        <Betragsfeld betrag={plan.startkontostand} aendern={darf} leer="—" speichern={(b) => aendern({ startkontostand: b ?? "0" })} />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Mindestpuffer</span>
        <Betragsfeld betrag={plan.puffer} aendern={darf} leer="—" speichern={(b) => aendern({ puffer: b ?? "0" })} />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Lohnnebenkosten</span>
        <Betragsfeld
          betrag={plan.lohnnebenkosten}
          aendern={darf}
          leer="—"
          anzeigen={alsProzent}
          beschriftung="Lohnnebenkosten in Prozent"
          speichern={(b) => aendern({ lohnnebenkosten: b ?? "0" })}
        />
      </label>
      <label className="profilfeld">
        <span className="beschriftung-klein">Ein Abruf deckt</span>
        <select className="feld" value={plan.abruf_monate} disabled={!darf} onChange={(e) => aendern({ abruf_monate: Number(e.target.value) })}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? "Monat" : "Monate"}
            </option>
          ))}
        </select>
      </label>
      <label className="rw-haken">
        <input type="checkbox" checked={plan.vierzehn_gehaelter} disabled={!darf} onChange={(e) => aendern({ vierzehn_gehaelter: e.target.checked })} />
        14 Gehälter (doppelt im Juni und November)
      </label>
    </div>
  );
}

/* --- Monat für Monat ---------------------------------------------------------- */

/**
 * Die genauen Beträge, zugeklappt — gebraucht, wenn jemand einen Monat
 * nachschlägt, und das ist nicht der Grund, warum man die Seite aufmacht
 * (dieselbe Entscheidung wie beim Kontostand auf dem Dashboard).
 */
function Monatstabelle({ rechnung }: { rechnung: Runwayrechnung }) {
  return (
    <details className="karte klappkarte rw-monate">
      <summary>
        <Zeichen name="zeiger" klasse="zeiger-klapp" />
        <span className="klapptitel">Monat für Monat</span>
      </summary>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Monat</th>
            <th className="rechts">Förderungen</th>
            <th className="rechts">Umsätze</th>
            <th className="rechts">Darlehen</th>
            <th className="rechts">Personal</th>
            <th className="rechts">Kosten</th>
            <th className="rechts">Netto</th>
            <th className="rechts">Stand</th>
            <th>Was passiert</th>
          </tr>
        </thead>
        <tbody>
          {rechnung.monate.map((m) => (
            <tr key={m.monat}>
              <td data-spalte="Monat">{monatLang(m.monat)}</td>
              <td data-spalte="Förderungen" className="zahl rechts">{Number(m.foerderung) ? euro(m.foerderung) : "–"}</td>
              <td data-spalte="Umsätze" className="zahl rechts">{Number(m.umsatz) ? euro(m.umsatz) : "–"}</td>
              <td data-spalte="Darlehen" className="zahl rechts">
                {Number(m.darlehen) - Number(m.rueckzahlung) ? euro(Number(m.darlehen) - Number(m.rueckzahlung)) : "–"}
              </td>
              <td data-spalte="Personal" className="zahl rechts">{Number(m.personal) ? euro(-Number(m.personal)) : "–"}</td>
              <td data-spalte="Kosten" className="zahl rechts">{Number(m.kosten) ? euro(-Number(m.kosten)) : "–"}</td>
              <td data-spalte="Netto" className="zahl rechts">{euro(m.netto)}</td>
              <td data-spalte="Stand" className="zahl rechts" data-negativ={Number(m.stand) < 0 || undefined}>
                <b>{euro(m.stand)}</b>
                {m.ist_datum && <span className="rw-ist" title={`Kontostand am ${tagText(m.ist_datum)}`}> · Ist</span>}
              </td>
              <td data-spalte="Was passiert" className="rw-was">
                {m.ereignisse.map((e) => e.text).join(" · ") || "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
