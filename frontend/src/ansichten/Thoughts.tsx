/**
 * Module · Thoughts: was in welchem Themenfeld ansteht, was frei ist und
 * worauf gewartet wird.
 *
 * Das Modul hieß zuerst Lagekarte, dann Stellwerk, jetzt Thoughts (Wunsch
 * von Bernd, 2026-09-28). Die Karte selbst heißt im Code weiter Lagekarte (`basis/lagekarte.ts`,
 * `Lagethema`, `/api/lageschritte/`): Die Modellnamen stehen in jeder
 * Sicherung, und ein Umbenennen machte vorhandene Archive uneinspielbar.
 *
 * Die Fläche mit Kacheln und Pfeilen ist `bausteine/Lagebuehne.ts` — dort
 * steht auch, warum sie kein React ist. Hier stehen die Werkzeugleisten, die
 * Seitenspalte und alles, was an den Server geht.
 *
 * **Geschrieben wird sofort und optimistisch:** Der neue Stand steht gleich im
 * Zwischenspeicher, damit eine abgehakte Kachel nicht erst nach der Antwort
 * grün wird; danach wird die Karte neu geholt. Scheitert die Anfrage, meldet
 * `hole` das selbst, und das Neuholen stellt den alten Stand wieder her.
 *
 * Grundsatz der Karte: **Die Fläche sagt, wohin etwas gehört, die Kante, wie
 * es steht.** Zwei Fragen, zwei Kanäle — sonst liest man die Farbe eines
 * Themas als „erledigt".
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { hole } from "../basis/api";
import { datumIn, fristText } from "../basis/aufgaben";
import { useLagekarte, type Ich, type Karte, type Lageschritt, type Lagethema, type Lageverbindung } from "../basis/daten";
import {
  ARTEN,
  fang,
  fortschritt,
  graph,
  lage,
  offeneKarte,
  platzFuer,
  verbindungsHindernis,
  type Graph,
} from "../basis/lagekarte";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Lagebuehne, SCHMAL, type Ansicht, type Auswahl, type Ereignisse, type Stufe } from "../bausteine/Lagebuehne";
import { Leerstelle } from "../bausteine/Leerstelle";

type Wechseln = (seite: Seite, unter?: string | null) => void;

export function Thoughts({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const karte = useLagekarte();
  // Abgeschlossene Themen stehen nur in der Seitenspalte; Bühne, Lage und
  // Fangfeld sehen sie nicht. Gemerkt, damit die Bühne nur bei neuen Daten neu baut.
  const offen = useMemo(() => karte.data && offeneKarte(karte.data), [karte.data]);
  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!karte.data || !offen) return <Zustand abfrage={karte} erneut={() => karte.refetch()} />;
  const abgeschlossen = karte.data.themen.filter((t) => t.abgeschlossen_am);
  return <Kartenseite ich={ich} daten={offen} abgeschlossen={abgeschlossen} wechseln={wechseln} />;
}

/* --- Schreiben ------------------------------------------------------------ */

function useKartenSchreiben() {
  const speicher = useQueryClient();
  const setze = (f: (k: Karte) => Karte) => speicher.setQueryData<Karte>(["lagekarte"], (alt) => (alt ? f(alt) : alt));

  const neuLaden = () => {
    speicher.invalidateQueries({ queryKey: ["lagekarte"] });
    speicher.invalidateQueries({ queryKey: ["protokoll"] });
  };

  async function schreibe<T>(
    pfad: string,
    methode: "POST" | "PATCH" | "DELETE",
    daten?: unknown,
    vorab?: (k: Karte) => Karte,
    danach: (() => void) | null = neuLaden,
  ) {
    if (vorab) setze(vorab);
    try {
      return await hole<T>(pfad, { method: methode, body: daten === undefined ? undefined : JSON.stringify(daten) });
    } catch {
      return null; // `hole` hat es schon gemeldet
    } finally {
      danach?.();
    }
  }

  const schritte = (k: Karte, id: number, f: Partial<Lageschritt>) => ({
    ...k,
    schritte: k.schritte.map((s) => (s.id === id ? { ...s, ...f } : s)),
  });

  return {
    schritt: (id: number, felder: Partial<Lageschritt>) =>
      schreibe(`/lageschritte/${id}/`, "PATCH", felder, (k) => schritte(k, id, felder)),
    thema: (id: number, felder: Partial<Lagethema>) =>
      schreibe(`/lagethemen/${id}/`, "PATCH", felder, (k) => ({
        ...k,
        themen: k.themen.map((t) => (t.id === id ? { ...t, ...felder } : t)),
      })),
    verbindung: (id: number, felder: Partial<Lageverbindung>) =>
      schreibe(`/lageverbindungen/${id}/`, "PATCH", felder, (k) => ({
        ...k,
        verbindungen: k.verbindungen.map((v) => (v.id === id ? { ...v, ...felder } : v)),
      })),
    async anlegen(s: { titel: string; thema: number | null; x: number; y: number; haengt_an: number | null }) {
      const neu = await schreibe<Lageschritt>("/lageschritte/", "POST", s);
      if (neu)
        setze((k) => ({
          ...k,
          schritte: [...k.schritte, neu],
          // Der Pfeil kommt beim Neuholen mit seiner Nummer; bis dahin steht er schon da.
          verbindungen: s.haengt_an !== null ? [...k.verbindungen, { id: -1, von: s.haengt_an, nach: neu.id, text: "" }] : k.verbindungen,
        }));
      return neu?.id ?? null;
    },
    async themaAnlegen(t: { name: string; farbe: number; x: number; y: number }) {
      const neu = await schreibe<Lagethema>("/lagethemen/", "POST", t);
      if (neu) setze((k) => ({ ...k, themen: [...k.themen, neu] }));
      return neu?.id ?? null;
    },
    async verbinden(von: number, nach: number) {
      const neu = await schreibe<Lageverbindung>("/lageverbindungen/", "POST", { von, nach });
      if (neu) setze((k) => ({ ...k, verbindungen: [...k.verbindungen, neu] }));
      return neu?.id ?? null;
    },
    loesen: (id: number) =>
      schreibe(`/lageverbindungen/${id}/`, "DELETE", undefined, (k) => ({
        ...k,
        verbindungen: k.verbindungen.filter((v) => v.id !== id),
      })),
    // Was dabei mitgeht, entscheidet der Server (api.py) — hier steht nur,
    // was bis zu seiner Antwort schon so aussehen soll.
    schrittEntfernen: (id: number) =>
      schreibe(`/lageschritte/${id}/`, "DELETE", undefined, (k) => ({
        ...k,
        schritte: k.schritte.filter((s) => s.id !== id),
        verbindungen: k.verbindungen.filter((v) => v.von !== id && v.nach !== id),
      })),
    themaAufloesen: (id: number) =>
      schreibe(`/lagethemen/${id}/`, "DELETE", undefined, (k) => ({
        ...k,
        themen: k.themen.filter((t) => t.id !== id),
        schritte: k.schritte.map((s) => (s.thema === id ? { ...s, thema: null } : s)),
      })),
    verschieben(lageNeu: { themen: { id: number; x: number; y: number }[]; schritte: { id: number; x: number; y: number }[] }) {
      const th = new Map(lageNeu.themen.map((t) => [t.id, t]));
      const sc = new Map(lageNeu.schritte.map((s) => [s.id, s]));
      setze((k) => ({
        ...k,
        themen: k.themen.map((t) => (th.has(t.id) ? { ...t, x: th.get(t.id)!.x, y: th.get(t.id)!.y } : t)),
        schritte: k.schritte.map((s) => (sc.has(s.id) ? { ...s, x: sc.get(s.id)!.x, y: sc.get(s.id)!.y } : s)),
      }));
      // Neu geladen wird erst, wenn alle zurück sind. Lüde jede Antwort für
      // sich neu, käme beim Neu-Anordnen ein halb geschriebener Stand vom
      // Server, und die Kacheln sprängen hin und her, bis der letzte da ist.
      return Promise.all([
        ...lageNeu.themen.map((t) => schreibe(`/lagethemen/${t.id}/`, "PATCH", { x: t.x, y: t.y }, undefined, null)),
        ...lageNeu.schritte.map((s) => schreibe(`/lageschritte/${s.id}/`, "PATCH", { x: s.x, y: s.y }, undefined, null)),
      ]).finally(neuLaden);
    },
  };
}

/* --- Die Seite ------------------------------------------------------------ */

function Kartenseite({
  ich,
  daten,
  abgeschlossen,
  wechseln,
}: {
  ich: Ich;
  daten: Karte;
  abgeschlossen: Lagethema[];
  wechseln: Wechseln;
}) {
  const buehneRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<Lagebuehne | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (window.innerWidth <= SCHMAL ? "straenge" : "stern"));
  const [stufe, setStufe] = useState<Stufe>("lage");
  const [auswahl, setAuswahl] = useState<Auswahl>(null);
  const [nachfrage, setNachfrage] = useState(false);
  const [blatt, setBlatt] = useState(false);
  const [fangText, setFangText] = useState("");
  const s = useKartenSchreiben();
  const g = useMemo(() => graph(daten), [daten]);
  const darf = { bearbeiten: ich.darf.bearbeiten, loeschen: ich.darf.loeschen };

  const waehle = (a: Auswahl) => {
    setAuswahl(a);
    setNachfrage(false);
    if (a && window.innerWidth <= SCHMAL) setBlatt(true);
  };

  // Die Bühne bekommt ihre Ereignisse über eine Weiterleitung: Sie wird
  // einmal gebaut und soll trotzdem immer die aktuellen Griffe rufen.
  const aktuell = useRef<Ereignisse>(null!);
  aktuell.current = {
    auswahl: waehle,
    stufe: setStufe,
    verschieben: (l) => void s.verschieben(l),
    zuordnen: (id, thema, p) => void s.schritt(id, { thema, x: p.x, y: p.y }),
    umschalten: (id) => {
      const x = g.schritt(id);
      if (x) void s.schritt(id, { status: x.status === "erledigt" ? "offen" : "erledigt" });
    },
    verbinden: s.verbinden,
    umhaengen: (id, von, nach) => void s.verbindung(id, { von, nach }),
    anlegen: s.anlegen,
    themaAnlegen: s.themaAnlegen,
    umbenennen: (a, text) => void (a.art === "thema" ? s.thema(a.id, { name: text }) : s.schritt(a.id, { titel: text })),
    beschriften: (id, text) => void s.verbindung(id, { text }),
    loesen: (id) => {
      void s.loesen(id);
      waehle(null);
      bRef.current?.melde("Verbindung gelöst");
    },
    entfernen: (a) => {
      waehle(a);
      setNachfrage(true);
    },
  };

  useEffect(() => {
    const weiter = new Proxy({} as Ereignisse, {
      get: (_, name) => (...args: unknown[]) => (aktuell.current[name as keyof Ereignisse] as (...a: unknown[]) => unknown)(...args),
    });
    const b = new Lagebuehne(buehneRef.current!, hostRef.current!, weiter, ansicht, darf);
    bRef.current = b;
    b.setzeDaten(daten, true);
    return () => {
      b.zerstoere();
      bRef.current = null;
    };
    // Einmal bauen; Daten, Ansicht und Rechte kommen unten nach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) {
      erstes.current = false;
      return;
    }
    bRef.current?.setzeDaten(daten);
  }, [daten]);

  useEffect(() => {
    bRef.current?.setzeRechte(darf);
  }, [darf.bearbeiten, darf.loeschen]);
  useEffect(() => {
    bRef.current?.setzeAnsicht(ansicht);
  }, [ansicht]);

  const zeige = (a: Auswahl) => {
    bRef.current?.waehle(a, true);
    waehle(a);
  };

  const festhalten = async () => {
    const { titel, thema } = fang(fangText, daten.themen);
    if (!titel) return;
    // Das Feld wird vor der Antwort geleert — wer gleich weitertippt, verlöre sonst seinen Text.
    setFangText("");
    const p = platzFuer(daten, { thema });
    const id = await s.anlegen({ titel, thema, x: p.x, y: p.y, haengt_an: null });
    if (id === null) return;
    bRef.current?.melde(thema !== null ? `In „${g.thema(thema)?.name}“ abgelegt` : "Als loser Gedanke um die Mitte gelegt");
    zeige({ art: "schritt", id });
  };

  const l = lage(g);
  const zahlen = `${l.wartet.length + l.haengt.length} warten · ${l.frei.length} frei`;

  return (
    <div className="thoughts">
      <main className="lk-buehne" ref={buehneRef}>
        <div className="lk-host" ref={hostRef} />

        <div className="lk-schwebe lk-oben">
          <div className="lk-gruppe" role="group" aria-label="Ansicht">
            <button type="button" aria-pressed={ansicht === "stern"} onClick={() => setAnsicht("stern")}>
              Sternkarte
            </button>
            <button type="button" aria-pressed={ansicht === "straenge"} onClick={() => setAnsicht("straenge")}>
              Stränge
            </button>
          </div>
          {darf.bearbeiten && (
            <label className="lk-fang">
              <span aria-hidden="true">+</span>
              <input
                value={fangText}
                onChange={(e) => setFangText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void festhalten();
                }}
                placeholder="Gedanke festhalten — „Gründung: Notar anrufen“ ⏎"
                aria-label="Gedanke festhalten"
                autoComplete="off"
              />
            </label>
          )}
          {darf.bearbeiten && (
            <div className="lk-gruppe lk-nur-gross">
              <button type="button" onClick={() => bRef.current?.neuesThema()}>
                + Thema
              </button>
              {ansicht === "stern" && (
                <button type="button" title="Themen und Schritte sauber auf ein Raster legen" onClick={() => bRef.current?.ordne()}>
                  Neu anordnen
                </button>
              )}
            </div>
          )}
        </div>

        <div className="lk-schwebe lk-unten">
          <div className="lk-gruppe" role="group" aria-label="Tiefe">
            <button type="button" aria-pressed={stufe === "lage"} title="Nur die Themen (1)" onClick={() => bRef.current?.zurLage()}>
              Lage
            </button>
            <button type="button" aria-pressed={stufe === "karte"} title="Schritte und Abhängigkeiten (2)" onClick={() => bRef.current?.zurKarte()}>
              Karte
            </button>
            <button type="button" aria-pressed={stufe === "detail"} title="Mit Notizen (3)" onClick={() => bRef.current?.detail()}>
              Details
            </button>
          </div>
          <div className="lk-gruppe">
            <button type="button" aria-label="Verkleinern" onClick={() => bRef.current?.zoomMitte(0.8)}>
              −
            </button>
            <button type="button" aria-label="Vergrößern" onClick={() => bRef.current?.zoomMitte(1.25)}>
              +
            </button>
          </div>
        </div>
      </main>

      <aside className="lk-seite" data-offen={blatt ? "ja" : undefined}>
        <button type="button" className="lk-seite-griff" onClick={() => setBlatt(!blatt)} aria-expanded={blatt}>
          Lage <span className="zahl">{zahlen}</span>
        </button>
        <div className="lk-seite-inhalt">
          <Seitenspalte
            g={g}
            abgeschlossen={abgeschlossen}
            auswahl={auswahl}
            darf={darf}
            nachfrage={nachfrage}
            setNachfrage={setNachfrage}
            zeige={zeige}
            s={s}
            b={bRef}
            wechseln={wechseln}
          />
        </div>
      </aside>
    </div>
  );
}

/* --- Die Seitenspalte ----------------------------------------------------- */

type Schreiben = ReturnType<typeof useKartenSchreiben>;
type Spaltenzeug = {
  g: Graph;
  abgeschlossen: Lagethema[];
  darf: { bearbeiten: boolean; loeschen: boolean };
  zeige: (a: Auswahl) => void;
  s: Schreiben;
  b: React.RefObject<Lagebuehne | null>;
  nachfrage: boolean;
  setNachfrage: (x: boolean) => void;
};

function Seitenspalte(p: Spaltenzeug & { auswahl: Auswahl; wechseln: Wechseln }) {
  const { g, auswahl } = p;
  if (auswahl?.art === "schritt") {
    const x = g.schritt(auswahl.id);
    if (x) return <Schrittblatt key={x.id} {...p} schritt={x} />;
  }
  if (auswahl?.art === "thema") {
    const t = g.thema(auswahl.id);
    if (t) return <Themenblatt key={t.id} {...p} thema={t} />;
  }
  if (auswahl?.art === "verbindung") {
    const v = g.karte.verbindungen.find((x) => x.id === auswahl.id);
    if (v && g.schritt(v.von) && g.schritt(v.nach)) return <Verbindungsblatt key={v.id} {...p} verbindung={v} />;
  }
  return <Lageblatt {...p} />;
}

const farbe = (t: Lagethema | undefined) => (t ? `lk-ton-${t.farbe}` : "lk-ton-0");
/** „9.10.2026" aus „2026-10-09". */
const tagText = (d: string) => d.split("-").map(Number).reverse().join(".");
const themaName = (g: Graph, x: Lageschritt) => (x.thema !== null ? (g.thema(x.thema)?.name ?? "") : "Ohne Thema");

function Frist({ frist }: { frist: string }) {
  const f = fristText(frist);
  return <span className={f.drueber ? "lk-ueber" : undefined}>{f.text}</span>;
}

/** Ein Schritt in einer Liste der Seitenspalte — ein Klick fliegt hin. */
function Posten({ g, x, zeige, children }: { g: Graph; x: Lageschritt; zeige: (a: Auswahl) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`lk-posten ${farbe(x.thema !== null ? g.thema(x.thema) : undefined)}`}
      onClick={() => zeige({ art: "schritt", id: x.id })}
    >
      <span className="lk-posten-titel">{x.titel}</span>
      <span className="lk-posten-unter">{children}</span>
    </button>
  );
}

function Abschnitt({ titel, zahl, children }: { titel: string; zahl?: number; children: ReactNode }) {
  return (
    <>
      <h3 className="lk-h3">
        {titel} {zahl !== undefined && <span className="zahl">{zahl}</span>}
      </h3>
      {children}
    </>
  );
}

function Lageblatt({ g, abgeschlossen, zeige, s, b, darf, wechseln }: Spaltenzeug & { wechseln: Wechseln }) {
  const l = lage(g);
  const tag = new Date().toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
  const leer = !g.karte.themen.length && !g.karte.schritte.length;
  return (
    <>
      <h2 className="lk-h2">
        Lage <span className="zahl">{tag}</span>
      </h2>
      {leer && (
        <Leerstelle
          was="Noch nichts auf der Karte."
          satz={darf.bearbeiten ? "Leg ein Thema an — oder halte oben einen ersten Gedanken fest." : "Sobald jemand ein Thema anlegt, steht es hier."}
          aktion={darf.bearbeiten ? { text: "+ Thema", tun: () => b.current?.neuesThema() } : undefined}
        />
      )}
      {g.karte.themen.map((t) => {
        const f = fortschritt(g.karte, t.id);
        return (
          <button key={t.id} type="button" className={`lk-themenzeile ${farbe(t)}`} onClick={() => b.current?.themaFokus(t.id)}>
            <i className="lk-farbe" />
            <span className="lk-tn">{t.name}</span>
            <span className="zahl">
              {f.fertig}/{f.alle}
            </span>
            <span className="lk-balken">
              {f.status.map((st, i) => (
                <i key={i} data-s={st} />
              ))}
            </span>
          </button>
        );
      })}
      {!leer && (
        <>
          <Abschnitt titel="Wartet" zahl={l.wartet.length + l.haengt.length}>
            {l.wartet.length + l.haengt.length === 0 && (
              <p className="lk-leer-satz">Nichts wartet gerade. Was von außen kommt, bekommt die Art „Warten auf“.</p>
            )}
            {l.wartet.map((x) => (
              <Posten key={x.id} g={g} x={x} zeige={zeige}>
                {themaName(g, x)} · {x.notiz || "von außen"}
              </Posten>
            ))}
            {l.haengt.map(({ schritt: x, an }) => (
              <Posten key={x.id} g={g} x={x} zeige={zeige}>
                {themaName(g, x)} · hängt an {themaName(g, an)}: {an.titel}
              </Posten>
            ))}
          </Abschnitt>
          <Abschnitt titel="Als Nächstes frei" zahl={l.frei.length}>
            {!l.frei.length && <p className="lk-leer-satz">Alles Offene hängt noch an etwas anderem.</p>}
            {l.frei.map((x) => (
              <Posten key={x.id} g={g} x={x} zeige={zeige}>
                {themaName(g, x)}
                {x.frist && (
                  <>
                    {" · "}
                    <Frist frist={x.frist} />
                  </>
                )}
              </Posten>
            ))}
          </Abschnitt>
          {l.lose.length > 0 && (
            <Abschnitt titel="Lose Gedanken" zahl={l.lose.length}>
              {l.lose.map((x) => (
                <Posten key={x.id} g={g} x={x} zeige={zeige}>
                  auf ein Thema ziehen, um es zuzuordnen
                </Posten>
              ))}
            </Abschnitt>
          )}
        </>
      )}
      {abgeschlossen.length > 0 && (
        <Abschnitt titel="Abgeschlossen" zahl={abgeschlossen.length}>
          {abgeschlossen.map((t) => (
            <div key={t.id} className={`lk-abgeschlossen ${farbe(t)}`}>
              <i className="lk-farbe" />
              <span className="lk-tn">{t.name}</span>
              <span className="zahl">{tagText(t.abgeschlossen_am!)}</span>
              {darf.bearbeiten && (
                <button
                  type="button"
                  className="knopf-still"
                  onClick={() => {
                    void s.thema(t.id, { abgeschlossen_am: null });
                    b.current?.melde(`„${t.name}“ wieder auf der Karte`);
                  }}
                >
                  Wieder aufnehmen
                </button>
              )}
            </div>
          ))}
        </Abschnitt>
      )}
      <button type="button" className="lk-doku" onClick={() => wechseln("doku", "module")}>
        Griffe und Kürzel in der Doku
      </button>
    </>
  );
}

function Zurueck({ zeige }: { zeige: (a: Auswahl) => void }) {
  return (
    <button type="button" className="lk-zurueck" onClick={() => zeige(null)}>
      ‹ Lage
    </button>
  );
}

/**
 * Ein Textfeld der Seitenspalte, das beim Verlassen speichert — nicht bei
 * jedem Tastendruck, sonst schriebe jeder Buchstabe einen Eintrag ins
 * Änderungsprotokoll.
 *
 * Nicht `bausteine/Feldtext`: Der ist ein Text, den man zum Ändern erst
 * anklickt — richtig in einer Liste aus dreißig Paketen. Das Blatt hier ist
 * ein Formular zu **einer** Kachel; ein Klick mehr je Feld hülfe niemandem.
 * Neu geladen wird in `useKartenSchreiben` nach jedem Schreiben.
 */
function Spaltenfeld({
  wert,
  speichern,
  zeilen = 1,
  klasse = "",
  einzeilig = false,
  ...rest
}: {
  wert: string;
  speichern: (text: string) => void;
  zeilen?: number;
  klasse?: string;
  einzeilig?: boolean;
  "aria-label"?: string;
  id?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const [text, setText] = useState(wert);
  useEffect(() => {
    setText(wert);
  }, [wert]);
  const fertig = () => {
    const neu = text.trim();
    if (neu === wert) return;
    // Ein Titel darf nicht leer werden — dann bleibt der alte.
    if (!neu && einzeilig) return setText(wert);
    speichern(neu);
  };
  return (
    <textarea
      {...rest}
      className={`lk-eingabe ${klasse}`}
      rows={zeilen}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={fertig}
      onKeyDown={(e) => {
        if (einzeilig && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setText(wert);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Die Nachfrage vor dem Entfernen. Sie steht unter dem Blatt und rollt sich
 * ins Bild — sonst drückt man „Löschen …" und sieht erst einmal nichts.
 */
function Nachfrage({ titel, children }: { titel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // In geschweiften Klammern: Neuere Browser geben aus scrollIntoView ein
  // Promise zurück, und React hielte das für die Aufräumfunktion.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} className="lk-nachfrage" role="alertdialog" aria-label={titel}>
      {children}
    </div>
  );
}

function Schrittblatt({ g, schritt: x, zeige, s, b, darf, nachfrage, setNachfrage }: Spaltenzeug & { schritt: Lageschritt }) {
  const bezug = (ids: number[], davor: boolean) =>
    ids.map((id) => {
      const y = g.schritt(id)!;
      const v = g.karte.verbindungen.find((k) => (davor ? k.von === id && k.nach === x.id : k.von === x.id && k.nach === id));
      return (
        <li key={id} className={farbe(y.thema !== null ? g.thema(y.thema) : undefined)}>
          <i />
          <button type="button" className="lk-bezug-name" onClick={() => zeige({ art: "schritt", id })}>
            {y.titel}
          </button>
          {darf.loeschen && v && v.id > 0 && (
            <button type="button" aria-label="Verbindung lösen" title="Verbindung lösen" onClick={() => void s.loesen(v.id)}>
              ×
            </button>
          )}
        </li>
      );
    });
  // Eigene Themen zuerst: Dort hängt fast immer, was man sucht.
  const kandidaten = g.karte.schritte
    .filter((y) => y.id !== x.id)
    .sort((a, c) => Number(c.thema === x.thema) - Number(a.thema === x.thema));
  const auswahl = (text: string, davor: boolean) => (
    <select
      className="lk-eingabe"
      value=""
      onChange={(e) => {
        const y = Number(e.target.value);
        if (!y) return;
        const [von, nach] = davor ? [y, x.id] : [x.id, y];
        const hindernis = verbindungsHindernis(g, von, nach);
        if (hindernis) return b.current?.melde(hindernis);
        void s.verbinden(von, nach);
      }}
    >
      <option value="">{text}</option>
      {kandidaten.map((y) => (
        <option key={y.id} value={y.id}>
          {y.titel} — {themaName(g, y)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Zurueck zeige={zeige} />
      <fieldset className="lk-felder" disabled={!darf.bearbeiten}>
        <div className="lk-feld">
          <Spaltenfeld
            wert={x.titel}
            zeilen={2}
            klasse="lk-i-titel"
            einzeilig
            aria-label="Titel"
            speichern={(titel) => void s.schritt(x.id, { titel })}
          />
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Status</span>
          <div className="lk-seg">
            {(["offen", "erledigt"] as const).map((st) => (
              <button key={st} type="button" data-status={st} aria-pressed={x.status === st} onClick={() => void s.schritt(x.id, { status: st })}>
                {st === "offen" ? "Offen" : "Erledigt"}
              </button>
            ))}
          </div>
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Thema</span>
          <div className="lk-chips">
            {[...g.karte.themen, null].map((t) => (
              <button
                key={t?.id ?? "lose"}
                type="button"
                className={`lk-chip ${t ? farbe(t) : ""}`}
                aria-pressed={x.thema === (t?.id ?? null)}
                onClick={() => {
                  const th = t?.id ?? null;
                  if (th === x.thema) return;
                  const ohne = { ...g.karte, schritte: g.karte.schritte.filter((y) => y.id !== x.id) };
                  const p = platzFuer(ohne, { thema: th });
                  void s.schritt(x.id, { thema: th, x: p.x, y: p.y });
                }}
              >
                {t ? t.name : "lose"}
              </button>
            ))}
          </div>
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Art</span>
          <div className="lk-seg">
            {ARTEN.map((a) => (
              <button key={a.wert} type="button" aria-pressed={x.art === a.wert} onClick={() => void s.schritt(x.id, { art: a.wert })}>
                {a.kurz}
              </button>
            ))}
          </div>
        </div>
        <div className="lk-feld">
          <label className="lk-etikettzeile" htmlFor="lk-frist">
            Frist
          </label>
          <input
            id="lk-frist"
            className="lk-eingabe"
            type="date"
            value={x.frist ?? ""}
            onChange={(e) => void s.schritt(x.id, { frist: e.target.value || null })}
          />
        </div>
        <div className="lk-feld">
          <label className="lk-etikettzeile" htmlFor="lk-notiz">
            Notiz
          </label>
          <Spaltenfeld id="lk-notiz" wert={x.notiz} zeilen={3} speichern={(notiz) => void s.schritt(x.id, { notiz })} />
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Hängt an</span>
          <ul className="lk-bezug">{bezug(g.vor(x.id), true)}</ul>
          {darf.bearbeiten && auswahl("+ hängt an …", true)}
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Danach</span>
          <ul className="lk-bezug">{bezug(g.nach(x.id), false)}</ul>
          {darf.bearbeiten && auswahl("+ danach kommt …", false)}
        </div>
      </fieldset>
      {darf.bearbeiten && (
        <div className="lk-aktionen">
          <button type="button" className="knopf" onClick={() => b.current?.neuerSchritt({ nach: x.id })}>
            Nächster Schritt <kbd>Tab</kbd>
          </button>
          {darf.loeschen && (
            <button type="button" className="knopf-still" onClick={() => setNachfrage(true)}>
              Löschen …
            </button>
          )}
        </div>
      )}
      {nachfrage && darf.loeschen && (
        <Nachfrage titel={`„${x.titel}“ löschen?`}>
          <p>
            „{x.titel}“ löschen? Milder: als erledigt führen — dann bleibt sichtbar, dass es gemacht wurde.
          </p>
          <div className="lk-aktionen">
            <button
              type="button"
              className="knopf"
              onClick={() => {
                void s.schritt(x.id, { status: "erledigt" });
                setNachfrage(false);
              }}
            >
              Als erledigt führen
            </button>
            <button
              type="button"
              className="knopf-still lk-gefahr"
              onClick={() => {
                void s.schrittEntfernen(x.id);
                zeige(null);
              }}
            >
              Löschen
            </button>
            <button type="button" className="knopf-still" onClick={() => setNachfrage(false)}>
              Behalten
            </button>
          </div>
        </Nachfrage>
      )}
    </>
  );
}

function Themenblatt({ g, thema: t, zeige, s, b, darf, nachfrage, setNachfrage }: Spaltenzeug & { thema: Lagethema }) {
  const ns = g.karte.schritte.filter((x) => x.thema === t.id);
  // Abschließen nur, was ganz erledigt ist — der Server prüft dasselbe.
  const fertig = ns.length > 0 && ns.every((x) => x.status === "erledigt");
  const abschliessen = () => {
    void s.thema(t.id, { abgeschlossen_am: datumIn(0) });
    zeige(null);
    b.current?.melde(`„${t.name}“ abgeschlossen`);
  };
  return (
    <>
      <Zurueck zeige={zeige} />
      <fieldset className="lk-felder" disabled={!darf.bearbeiten}>
        <div className="lk-feld">
          <Spaltenfeld
            wert={t.name}
            klasse="lk-i-titel"
            einzeilig
            aria-label="Name des Themas"
            placeholder="Name des Themas"
            speichern={(name) => void s.thema(t.id, { name })}
          />
        </div>
        <div className="lk-feld">
          <span className="lk-etikettzeile">Farbe</span>
          <div className="lk-farbwahl">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((f) => (
              <button
                key={f}
                type="button"
                className={`lk-ton-${f}`}
                aria-pressed={t.farbe === f}
                aria-label={`Farbe ${f}`}
                onClick={() => void s.thema(t.id, { farbe: f })}
              />
            ))}
          </div>
        </div>
      </fieldset>
      <Abschnitt titel="Schritte" zahl={ns.length}>
        {!ns.length && (
          <p className="lk-leer-satz">
            Noch kein Schritt.{darf.bearbeiten && <> <kbd>Tab</kbd> legt den ersten an.</>}
          </p>
        )}
        {ns.map((x) => (
          <Posten key={x.id} g={g} x={x} zeige={zeige}>
            {x.status === "erledigt" ? "Erledigt" : "Offen"}
            {x.frist && (
              <>
                {" · "}
                <Frist frist={x.frist} />
              </>
            )}
          </Posten>
        ))}
      </Abschnitt>
      {darf.bearbeiten && (
        <div className="lk-aktionen">
          {fertig && (
            <button type="button" className="knopf" title="Von der Karte nehmen — steht dann unter „Abgeschlossen“" onClick={abschliessen}>
              Abschließen
            </button>
          )}
          <button type="button" className={fertig ? "knopf-still" : "knopf"} onClick={() => b.current?.neuerSchritt({ thema: t.id })}>
            Schritt <kbd>Tab</kbd>
          </button>
          {darf.loeschen && (
            <button type="button" className="knopf-still" onClick={() => setNachfrage(true)}>
              Auflösen …
            </button>
          )}
        </div>
      )}
      {nachfrage && darf.loeschen && (
        <Nachfrage titel={`Thema „${t.name}“ auflösen?`}>
          <p>
            Thema „{t.name}“ auflösen? Die Schritte bleiben als lose Gedanken um die Mitte liegen.
            {fertig && " Milder: abschließen — dann ist es von der Karte und lässt sich wieder aufnehmen."}
          </p>
          <div className="lk-aktionen">
            {fertig && (
              <button type="button" className="knopf" onClick={abschliessen}>
                Abschließen
              </button>
            )}
            <button
              type="button"
              className="knopf-still lk-gefahr"
              onClick={() => {
                void s.themaAufloesen(t.id);
                zeige(null);
              }}
            >
              Auflösen
            </button>
            <button type="button" className="knopf-still" onClick={() => setNachfrage(false)}>
              Behalten
            </button>
          </div>
        </Nachfrage>
      )}
    </>
  );
}

function Verbindungsblatt({ g, verbindung: v, zeige, s, b, darf }: Spaltenzeug & { verbindung: Lageverbindung }) {
  const a = g.schritt(v.von)!;
  const c = g.schritt(v.nach)!;
  return (
    <>
      <Zurueck zeige={zeige} />
      <h2 className="lk-h2">Verbindung</h2>
      <div className="lk-verbindung">
        <Posten g={g} x={a} zeige={zeige}>
          {themaName(g, a)}
        </Posten>
        <span className="lk-pfeiltext">↓ {c.titel} hängt daran</span>
        <Posten g={g} x={c} zeige={zeige}>
          {themaName(g, c)}
        </Posten>
      </div>
      <fieldset className="lk-felder" disabled={!darf.bearbeiten}>
        <div className="lk-feld">
          <label className="lk-etikettzeile" htmlFor="lk-beschriftung">
            Beschriftung
          </label>
          <Spaltenfeld
            id="lk-beschriftung"
            wert={v.text}
            einzeilig
            maxLength={40}
            placeholder="z. B. Zusage, wenn geliefert"
            speichern={(text) => void s.verbindung(v.id, { text })}
          />
        </div>
      </fieldset>
      {darf.bearbeiten && (
        <div className="lk-aktionen">
          <button
            type="button"
            className="knopf-still"
            onClick={() => {
              const hindernis = verbindungsHindernis(g, v.nach, v.von, v.id);
              if (hindernis) return b.current?.melde(hindernis);
              void s.verbindung(v.id, { von: v.nach, nach: v.von });
            }}
          >
            Umdrehen
          </button>
          {darf.loeschen && (
            <button
              type="button"
              className="knopf-still"
              onClick={() => {
                void s.loesen(v.id);
                zeige(null);
                b.current?.melde("Verbindung gelöst");
              }}
            >
              Lösen
            </button>
          )}
        </div>
      )}
    </>
  );
}
