/**
 * Die Förderplanung: alle Förderungen auf einer Zeitachse — wann wir den
 * Antrag schreiben, wann eingereicht wird, wann entschieden wird, wann das
 * Projekt liefe. Gebaut nach der Folie „Förderübersicht" (Bernd, 2026-11-06):
 * Folie 1 zeigte alle Möglichkeiten, Folie 2 „Fokus AMS — gereiht nach Prio".
 * Beides steht hier untereinander, auf derselben Achse.
 *
 * **Eine Zeile ist ein Antrag**, auch einer, von dem es erst den Namen gibt.
 * Ein Programm ohne Antrag steht unten und wird mit einem Griff eingeplant —
 * dann ist es ein Antrag im Entwurf, und alles, was man später darin
 * schreibt, gehört zur selben Zeile.
 *
 * Gezogen wird wie auf der Projektseite (derselbe Gantt-Baustein). Ein Balken
 * als Ganzes nimmt die ganze Zeile mit (`basis/foerderplanung.gezogeneDaten`).
 * Genau eintragen lässt sich alles in der Karte unter der Achse, die ein
 * Klick auf den Namen öffnet.
 */

import { useEffect, useRef, useState } from "react";

import { hole } from "../basis/api";
import { useFoerdergeber, useFoerderungen, useNeuLaden, type Foerderantrag, type Foerdergeber, type Foerderprogramm, type Ich } from "../basis/daten";
import {
  balken,
  datenDer,
  foerdername,
  gezogeneDaten,
  gruppiert,
  hintenAn,
  istVorbei,
  neueReihung,
  planzeilen,
  zeilengeld,
  type Planbalken,
  type Planzeile,
} from "../basis/foerderplanung";
import { STAENDE, alsProzent, antragsstandText } from "../basis/foerderungen";
import { achseUeber, heuteIso, kurzdatum, lageAuf, type Achse } from "../basis/gantt";
import { alsEuro } from "../basis/module";
import type { Wechseln } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Feldtext } from "../bausteine/Feldtext";
import { Gantt, GanttBalken, GanttZeile } from "../bausteine/Gantt";
import { Hinweis } from "../bausteine/Hinweis";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Betragsfeld, useAendern } from "./Foerderungen";

const antragsweg = (z: Planzeile) => `foerderungen/${z.programm.geber}/${z.programm.id}/${z.antrag.id}`;
const pfadVon = (a: Foerderantrag) => `/foerderantraege/${a.id}/`;

const ABSCHNITTSNAME: Record<Planbalken["art"], string> = {
  schreiben: "Antrag schreiben",
  pruefung: "Prüfung",
  laufzeit: "Laufzeit",
};

export function Foerderplanung({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const geber = useFoerdergeber();
  const programme = useFoerderungen();
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [vorbeiOffen, setVorbeiOffen] = useState(false);
  const detail = useRef<HTMLElement>(null);
  // Am Handy steht die Karte unter der Achse außer Sicht — dorthin, sobald man wählt.
  useEffect(() => {
    if (gewaehlt !== null) detail.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [gewaehlt]);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!geber.data) return <Zustand abfrage={geber} erneut={() => geber.refetch()} />;
  if (!programme.data) return <Zustand abfrage={programme} erneut={() => programme.refetch()} />;

  const zeilen = planzeilen(programme.data, geber.data);
  const { fokus, weitere, vorbei } = gruppiert(zeilen);
  const heute = heuteIso();
  // Eine Achse für alle Karten, damit ein Monat in jeder an derselben Stelle steht.
  const achse = achseUeber(zeilen.flatMap(datenDer), heute);
  const ohneAntrag = programme.data.filter((p) => p.antraege.length === 0);
  const wahl = zeilen.find((z) => z.antrag.id === gewaehlt) ?? null;
  const darf = ich.darf.bearbeiten;
  const waehlen = (id: number) => setGewaehlt(id === gewaehlt ? null : id);

  if (zeilen.length === 0 && ohneAntrag.length === 0)
    return (
      <div className="karte">
        <Leerstelle
          was="Noch nichts zu planen"
          satz="Die Planung zeigt die Anträge aller Programme. Lege zuerst einen Fördergeber und ein Programm an."
          aktion={{ text: "Zu den Fördergebern", tun: () => wechseln("module", "foerderungen") }}
        />
      </div>
    );

  const gemeinsam = { achse, heute, gewaehlt, waehlen, darf };

  return (
    <div className="fp-seite">
      <div className="fp-kopfzeile">
        <Legende />
        {/* Ein Link und kein fetch, wie bei den anderen PDFs: Die Datei soll im Download-Ordner landen. */}
        <a className="knopf-still" href="/api/foerderantraege/planung-pdf/">
          <Zeichen name="pdf" />
          PDF
        </a>
      </div>

      <section className="karte fp-gruppe">
        <h2>
          Fokus <span className="fp-zahl zahl">{fokus.length}</span>
          <Hinweis
            worum="Was der Fokus ist"
            text="Die Förderungen, auf die wir gerade setzen — gereiht nach Priorität, 1 zuerst. Hinein und heraus geht es in der Karte unter der Achse."
          />
        </h2>
        {fokus.length > 0 ? (
          <Planachse zeilen={fokus} fokus {...gemeinsam} />
        ) : (
          <Leerstelle
            was="Noch nichts im Fokus"
            satz="Wähle unten eine Förderung und nimm sie in den Fokus — dann steht sie hier, gereiht nach Priorität."
          />
        )}
      </section>

      <section className="karte fp-gruppe">
        <h2>
          Weitere Möglichkeiten <span className="fp-zahl zahl">{weitere.length}</span>
        </h2>
        {weitere.length > 0 ? (
          <Planachse zeilen={weitere} {...gemeinsam} />
        ) : (
          <Leerstelle was="Keine weiteren" satz="Jeder offene Antrag steht im Fokus. Unten lässt sich ein Programm einplanen." />
        )}
      </section>

      {wahl && (
        <section className="karte fp-detail" ref={detail} aria-label={`Planung: ${wahl.name}`}>
          <Plandetail
            key={wahl.antrag.id}
            zeile={wahl}
            fokus={fokus.map((z) => z.antrag)}
            darf={darf}
            wechseln={wechseln}
            schliessen={() => setGewaehlt(null)}
          />
        </section>
      )}

      {vorbei.length > 0 && (
        <section className="karte fp-gruppe">
          <h2>
            <button
              type="button"
              className="fp-aufklapper"
              aria-expanded={vorbeiOffen}
              onClick={() => setVorbeiOffen(!vorbeiOffen)}
            >
              <Zeichen name={vorbeiOffen ? "hinauf" : "herunter"} />
              Vorbei <span className="fp-zahl zahl">{vorbei.length}</span>
              <span className="fp-leise">abgelehnt oder nicht eingereicht</span>
            </button>
          </h2>
          {vorbeiOffen && <Planachse zeilen={vorbei} {...gemeinsam} />}
        </section>
      )}

      {ohneAntrag.length > 0 && <OhneAntrag programme={ohneAntrag} geber={geber.data} darf={darf} gewaehlt={setGewaehlt} />}
    </div>
  );
}

/** Was die Flächen und Zeichen bedeuten — die Legende der Folie, als eine Zeile. */
function Legende() {
  return (
    <div className="fp-legende" aria-label="Legende">
      <span>
        <i className="fp-muster" data-art="schreiben" /> Antrag schreiben
      </span>
      <span>
        <i className="fp-marke-muster" data-art="einreichung">!</i> Einreichung
      </span>
      <span>
        <i className="fp-muster" data-art="pruefung" /> Prüfung
      </span>
      <span>
        <i className="fp-marke-muster" data-art="entscheidung" /> Entscheidung
      </span>
      <span>
        <i className="fp-muster" data-art="laufzeit" /> Laufzeit
      </span>
      <span>
        <i className="fp-muster" data-art="laufzeit" data-angenommen /> Laufzeit angenommen
        <Hinweis
          worum="Was „angenommen“ heißt"
          text="Ohne Ende reicht die Laufzeit so weit, wie das Programm höchstens erlaubt — oder ein Jahr. Ein Ende im Antrag macht sie fest."
        />
      </span>
    </div>
  );
}

function Planachse({
  zeilen,
  achse,
  heute,
  gewaehlt,
  waehlen,
  darf,
  fokus,
}: {
  zeilen: Planzeile[];
  achse: Achse;
  heute: string;
  gewaehlt: number | null;
  waehlen: (id: number) => void;
  darf: boolean;
  fokus?: boolean;
}) {
  const speichern = useAendern();
  return (
    <Gantt achse={achse} heute={heute} etikett="Förderung" rechts="Förderung €">
      {zeilen.map((z) => {
        const a = z.antrag;
        const geld = zeilengeld(a, z.programm);
        return (
          <GanttZeile
            key={a.id}
            art="foerderung"
            gewaehlt={a.id === gewaehlt}
            etikett={
              <button
                type="button"
                className="gantt-wahl fp-name"
                aria-pressed={a.id === gewaehlt}
                onClick={() => waehlen(a.id)}
              >
                <b>
                  {fokus && a.prioritaet !== null && <span className="fp-platz zahl">{a.prioritaet}</span>}
                  {z.name}
                </b>
                <em>{a.vermerk || a.titel}</em>
              </button>
            }
            rechts={
              <>
                {geld && (
                  <span className={geld.bis ? "gantt-leise zahl" : "zahl"}>
                    {geld.bis && "bis "}
                    {alsEuro(geld.foerderung)}
                  </span>
                )}
                {geld?.quote && (
                  <span className="gantt-leise fp-quote zahl">
                    {alsProzent(geld.quote)}
                    {geld.gesamt && <> von {alsEuro(geld.gesamt)}</>}
                  </span>
                )}
                <span className="stand" data-antrag={a.stand}>
                  {antragsstandText(a.stand)}
                </span>
              </>
            }
          >
            {balken(a, z.programm).map((b) => (
              <GanttBalken
                key={b.art}
                art={`fp-${b.art}`}
                stand={b.angenommen ? "angenommen" : a.stand}
                spanne={b.spanne}
                beschriftung={`${z.name} · ${ABSCHNITTSNAME[b.art]} ${kurzdatum(b.spanne.von, true)} – ${kurzdatum(b.spanne.bis, true)}`}
                darf={darf}
                schritt={7}
                aendern={async (neu) => {
                  const daten = gezogeneDaten(a, b.art, b.spanne, neu);
                  if (Object.keys(daten).length > 0) await speichern(pfadVon(a), daten);
                }}
                klick={() => waehlen(a.id)}
              >
                {b.art === "laufzeit" ? ABSCHNITTSNAME.laufzeit : null}
              </GanttBalken>
            ))}
            {a.einreichung && <Marke achse={achse} tag={a.einreichung} art="einreichung" stand={a.stand} />}
            {a.entscheidung && <Marke achse={achse} tag={a.entscheidung} art="entscheidung" stand={a.stand} />}
          </GanttZeile>
        );
      })}
    </Gantt>
  );
}

/**
 * Ein Tag als Zeichen auf der Spur: „!" die Einreichung (die Frist, solange
 * der Antrag ein Entwurf ist), ein Punkt die Entscheidung — grün bewilligt,
 * rot abgelehnt, sonst wartend.
 */
function Marke({ achse, tag, art, stand }: { achse: Achse; tag: string; art: "einreichung" | "entscheidung"; stand: string }) {
  const { anfang } = lageAuf(achse, { von: tag, bis: tag });
  const name = art === "einreichung" ? (stand === "entwurf" ? "Einreichfrist" : "Eingereicht") : "Entscheidung";
  return (
    <i
      className="fp-marke"
      data-art={art}
      data-stand={stand}
      style={{ ["--a" as string]: anfang }}
      title={`${name} ${kurzdatum(tag, true)}`}
      aria-label={`${name} ${kurzdatum(tag, true)}`}
    >
      {art === "einreichung" ? "!" : null}
    </i>
  );
}

/**
 * Die Karte zur gewählten Zeile: alle Daten genau, Stand, Vermerk und der
 * Platz im Fokus. Bearbeitet wird an Ort und Stelle, wie auf der Antragsseite.
 */
function Plandetail({
  zeile,
  fokus,
  darf,
  wechseln,
  schliessen,
}: {
  zeile: Planzeile;
  fokus: Foerderantrag[];
  darf: boolean;
  wechseln: Wechseln;
  schliessen: () => void;
}) {
  const speichern = useAendern();
  const a = zeile.antrag;
  const pfad = pfadVon(a);
  const imFokus = fokus.some((f) => f.id === a.id);
  const platz = fokus.findIndex((f) => f.id === a.id);

  async function reihen(schritt: -1 | 1 | null) {
    for (const [id, prioritaet] of neueReihung(fokus, a.id, schritt))
      await speichern(`/foerderantraege/${id}/`, { prioritaet });
  }

  const datum = (feld: "schreiben_ab" | "einreichung" | "entscheidung" | "beginn" | "ende", text: string) => (
    <label className="fd-kopffeld fp-datum">
      <span className="beschriftung-klein">{text}</span>
      <Datumsfeld
        wert={a[feld]}
        beschriftung={text}
        // Ohne Beginn kein Ende — wer den Beginn leert, leert beides.
        darf={darf && (feld !== "ende" || !!a.beginn)}
        speichern={(neu) => speichern(pfad, feld === "beginn" && neu === null ? { beginn: null, ende: null } : { [feld]: neu })}
      />
    </label>
  );

  return (
    <>
      <div className="fp-detailkopf">
        <div className="fp-detailtitel">
          <h2>{zeile.name}</h2>
          <a
            className="fp-antragsverweis"
            href={`/module/${antragsweg(zeile)}`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", antragsweg(zeile));
            }}
          >
            {a.titel}
            <Zeichen name="zeiger" />
          </a>
        </div>
        <button type="button" className="knopf-still fp-schliessen" aria-label="Schließen" onClick={schliessen}>
          <Zeichen name="kreuz" />
        </button>
      </div>

      <div className="spannenwahl fp-standwahl" role="group" aria-label="Stand des Antrags">
        {STAENDE.map((s) => (
          <button
            key={s.wert}
            type="button"
            aria-pressed={a.stand === s.wert}
            disabled={!darf}
            onClick={() => a.stand !== s.wert && speichern(pfad, { stand: s.wert })}
          >
            {s.text}
          </button>
        ))}
      </div>

      <div className="fp-daten">
        {datum("schreiben_ab", "Antrag schreiben ab")}
        {datum("einreichung", a.stand === "entwurf" ? "Einreichfrist" : "Eingereicht am")}
        {datum("entscheidung", "Entscheidung")}
        {datum("beginn", "Laufzeit ab")}
        {datum("ende", "Laufzeit bis")}
        <label className="fd-kopffeld fp-datum">
          <span className="beschriftung-klein">Förderquote</span>
          <Betragsfeld
            betrag={a.foerderquote}
            aendern={darf}
            leer="—"
            anzeigen={alsProzent}
            beschriftung="Förderquote in Prozent"
            speichern={(foerderquote) => speichern(pfad, { foerderquote })}
          />
        </label>
      </div>

      <label className="fd-kopffeld fp-vermerk">
        <span className="beschriftung-klein">Vermerk</span>
        <Feldtext
          hoechstens={250}
          wert={a.vermerk}
          aendern={darf}
          platzhalter="Ein Satz neben dem Balken — „Stichtag 31.12.“, „abgelehnt: …“"
          speichern={(vermerk) => speichern(pfad, { vermerk })}
        />
      </label>

      <div className="fp-fusszeile">
        <span className="fp-geld">
          {Number(a.summe) > 0 && (
            <>
              Beantragt <b className="zahl">{alsEuro(a.summe)}</b>
              <span className="fp-leise">
                {" "}
                von <span className="zahl">{alsEuro(a.kosten.gesamt)}</span> Gesamtkosten
              </span>
            </>
          )}
          {zeile.programm.max_foerderung && (
            <span className="fp-leise">
              {Number(a.summe) > 0 ? " · " : ""}Programm bis {alsEuro(zeile.programm.max_foerderung)}
            </span>
          )}
        </span>
        {darf &&
          (imFokus ? (
            <span className="fp-fokusknoepfe">
              <span className="fp-leise">
                Im Fokus auf Platz <b className="zahl">{platz + 1}</b>
              </span>
              <button type="button" className="knopf-still" disabled={platz === 0} onClick={() => reihen(-1)} aria-label="Einen Platz höher">
                <Zeichen name="hoch" />
              </button>
              <button
                type="button"
                className="knopf-still"
                disabled={platz === fokus.length - 1}
                onClick={() => reihen(1)}
                aria-label="Einen Platz tiefer"
              >
                <Zeichen name="runter" />
              </button>
              <button type="button" className="knopf-still" onClick={() => reihen(null)}>
                Aus dem Fokus
              </button>
            </span>
          ) : (
            !istVorbei(a) && (
              <button type="button" className="knopf" onClick={() => speichern(pfad, { prioritaet: hintenAn(fokus) })}>
                <Zeichen name="plus" />
                In den Fokus
              </button>
            )
          ))}
      </div>
    </>
  );
}

/**
 * Programme, unter denen noch kein Antrag steht — die Möglichkeiten, die noch
 * keine Zeile haben. „Einplanen" legt einen Antrag im Entwurf an, der den
 * Namen des Programms trägt; umbenennen lässt er sich auf seiner Seite.
 */
function OhneAntrag({
  programme,
  geber,
  darf,
  gewaehlt,
}: {
  programme: Foerderprogramm[];
  geber: Foerdergeber[];
  darf: boolean;
  gewaehlt: (id: number) => void;
}) {
  const neuLaden = useNeuLaden();
  const nachId = new Map(geber.map((g) => [g.id, g]));
  return (
    <section className="karte fp-gruppe">
      <h2>
        Programme ohne Antrag <span className="fp-zahl zahl">{programme.length}</span>
      </h2>
      <ul className="fp-programme">
        {programme.map((p) => {
          const g = nachId.get(p.geber);
          return (
            <li key={p.id}>
              <span>
                <b>{foerdername(p, g)}</b>
                {p.max_foerderung && <span className="fp-leise zahl"> · bis {alsEuro(p.max_foerderung)}</span>}
              </span>
              {darf && (
                <button
                  type="button"
                  className="knopf-still"
                  onClick={async () => {
                    const neu = await hole<Foerderantrag>("/foerderantraege/", {
                      method: "POST",
                      body: JSON.stringify({ programm: p.id, titel: p.name }),
                    });
                    neuLaden();
                    gewaehlt(neu.id);
                  }}
                >
                  <Zeichen name="plus" />
                  Einplanen
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
