import { useState } from "react";

import { useDashboard, useProjekte, type Ich } from "../basis/daten";
import { achseUeber, heuteIso, monatsText, zeitraumText } from "../basis/gantt";
import { alsPfad, type Seite, type Wechselart } from "../basis/router";
import { alsDauer, heuteAlsDatum, uhrzeitAusZeitpunkt, wannKurz } from "../basis/zeit";
import { Kontostandlinie } from "../bausteine/Kontostandlinie";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Zustand } from "../basis/Zustand";
import { Finanzeingabe } from "../bausteine/Finanzeingabe";
import { Gantt, GanttBalken, GanttZeile } from "../bausteine/Gantt";

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const ZAHL1 = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Beträge kommen als Zeichenkette. Erst hier wird daraus eine Zahl — und nur
 * zum Anzeigen. Gerechnet wird serverseitig mit Decimal.
 */
function euro(betrag: string | null) {
  return betrag === null ? "—" : EURO.format(Number(betrag));
}

/**
 * Eine Dezimalzahl deutsch. Der Punkt aus dem Decimal des Servers wäre hier
 * schlicht falsch: „10.8 Monate" liest sich wie zehnkommaacht und sieht aus
 * wie ein Tausenderpunkt.
 */
function zahl(wert: string | null) {
  return wert === null ? "—" : ZAHL1.format(Number(wert));
}

/**
 * Die drei Zeiträume des Dashboards.
 *
 * Sie stehen ausdrücklich im Aufruf und nirgends still: Was gewählt ist, steht
 * als Datum daneben, und die Kennzahl darunter heißt dann „Monat Team" statt
 * „Woche Team". Eine Zahl, die plausibel aussieht und einen anderen Zeitraum
 * meint, ist die schlimmere Sorte Fehler.
 *
 * „woche" schickt gar nichts mit — ohne Angabe nimmt der Server die laufende
 * Woche und schreibt sie in die Antwort. Die Grenzen hier noch einmal
 * auszurechnen hieße, dieselbe Regel an zwei Stellen zu haben.
 */
const SPANNEN = ["woche", "monat", "jahr"] as const;
type Spanne = (typeof SPANNEN)[number];

const SPANNENTEXT: Record<Spanne, { knopf: string; kennzahl: string; dazu: string }> = {
  woche: { knopf: "Diese Woche", kennzahl: "Woche Team", dazu: "diese Woche" },
  monat: { knopf: "Dieser Monat", kennzahl: "Monat Team", dazu: "diesen Monat" },
  jahr: { knopf: "Dieses Jahr", kennzahl: "Jahr Team", dazu: "dieses Jahr" },
};

function spannenParameter(spanne: Spanne, heute = new Date()): Record<string, string> {
  if (spanne === "woche") return {};
  const jahr = heute.getFullYear();
  const von = spanne === "monat" ? new Date(jahr, heute.getMonth(), 1) : new Date(jahr, 0, 1);
  const bis =
    spanne === "monat" ? new Date(jahr, heute.getMonth() + 1, 0) : new Date(jahr, 11, 31);
  return { von: heuteAlsDatum(von), bis: heuteAlsDatum(bis) };
}

type Wechseln = (seite: Seite, unter?: string | null, art?: Wechselart) => void;

export function Dashboard({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const [spanne, setSpanne] = useState<Spanne>("woche");
  const abfrage = useDashboard(spannenParameter(spanne));
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const d = abfrage.data;

  const maxPerson = Math.max(1, ...d.team.map((p) => p.sekunden));

  return (
    <div className="spalte">
      {d.offene_entwuerfe.length > 0 && (
        <div className="karte karte-achtung">
          <h2>Bitte bestätigen</h2>
          <p style={{ margin: "0 0 10px", fontSize: 14 }}>
            {d.offene_entwuerfe.length === 1 ? "Eine Buchung wurde" : `${d.offene_entwuerfe.length} Buchungen wurden`}{" "}
            am Tagesende abgeschnitten, weil der Clock-out fehlte. Sie{" "}
            {d.offene_entwuerfe.length === 1 ? "zählt" : "zählen"} in keiner Summe mit,
            bis du{" "}
            {d.offene_entwuerfe.length === 1 ? "sie bestätigt" : "sie bestätigt"} hast.
          </p>
          <button type="button" className="knopf" onClick={() => wechseln("zeit")}>
            <Zeichen name="zeit" />
            In der Zeitliste ansehen
          </button>
        </div>
      )}

      {/*
        Der Zeitraum steht hier und nicht in der Kontextleiste über der Seite:
        Er ändert die vier Werte darunter und sonst nichts, und ein Filter
        gehört über das, was er filtert. Die gewählte Spanne steht ausgeschrieben
        daneben — geraten werden muss nichts.
      */}
      <div className="zeitraumleiste">
        <span className="beschriftung">Zeitraum</span>
        <div className="spannenwahl">
          {SPANNEN.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={spanne === s}
              onClick={() => setSpanne(s)}
            >
              {SPANNENTEXT[s].knopf}
            </button>
          ))}
        </div>
        <span className="zahl spanne-datum">
          {DATUM.format(new Date(d.zeitraum.von))} – {DATUM.format(new Date(d.zeitraum.bis))}
        </span>
        <span className="dazu spanne-hinweis">Gilt für die vier Werte darunter.</span>
      </div>

      <div className="raster raster-4">
        <div className="karte kennzahl">
          <div className="beschriftung">Kontostand</div>
          <div className="wert">{euro(d.finanzen.kontostand)}</div>
          <div className="hinweis">
            {d.finanzen.kontostand_stand
              ? `Stand ${DATUM.format(new Date(d.finanzen.kontostand_stand))}`
              : ich.darf.finanzen_eintragen
                ? "noch nichts eingetragen"
                : "noch nichts eingetragen"}
          </div>
        </div>

        <div className="karte kennzahl">
          <div className="beschriftung">Kosten / Monat</div>
          <div className="wert">{euro(d.finanzen.erwartete_monatskosten)}</div>
          <div className="hinweis">{d.finanzen.prognose_grundlage}</div>
        </div>

        <div className="karte kennzahl">
          <div className="beschriftung">Runway</div>
          <div className="wert">
            {d.finanzen.runway_monate ? `${zahl(d.finanzen.runway_monate)} Mon.` : "—"}
          </div>
          <div className="hinweis">
            {d.finanzen.runway_monate
              ? "Kontostand ÷ erwartete Kosten"
              : "Kontostand und Kosten fehlen"}
          </div>
        </div>

        <div className="karte kennzahl">
          <div className="beschriftung">{SPANNENTEXT[spanne].kennzahl}</div>
          <div className="wert">{alsDauer(d.team_sekunden)}</div>
          <div className="hinweis">
            {d.team.length === 1 ? "eine Person" : `${d.team.length} Personen`}
          </div>
        </div>
      </div>

      {/*
        Links, was zuletzt passiert ist; rechts das Team in einer Zeile je
        Person — wer eingestempelt ist und wie viel Zeit im gewählten Zeitraum
        zusammenkam. Beides stand einmal in drei Kacheln: eine Liste der
        Personen, daneben Säulen für dieselben Personen. Zweimal dieselben
        Namen nebeneinander ist Platz, der nichts Neues sagt.
      */}
      <div className="raster raster-2">
        <div className="karte">
          <h2>Zuletzt passiert</h2>
          {d.aktivitaet.length === 0 ? (
            <Leerstelle
              was="Noch nichts passiert"
              satz="Sobald jemand etwas anlegt, ändert oder bucht, steht es hier."
            />
          ) : (
            <ul className="aktivitaet">
              {d.aktivitaet.map((a) => (
                <li key={a.id}>
                  <i style={{ background: a.wer.farbe }}>{a.wer.initialen}</i>
                  <span className="satz">
                    <b>{a.wer.name}</b> {a.vor} {a.objekt && <b>{a.objekt}</b>} {a.nach}
                  </span>
                  <span className="zahl wann">{wannKurz(a.zeitpunkt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="karte">
          <h2>Team · {SPANNENTEXT[spanne].dazu}</h2>
          {d.team.length === 0 ? (
            <Leerstelle was="Noch niemand da" satz="Konten legt ein Administrator an." />
          ) : (
            <ul className="team">
              {d.team.map((p) => (
                <li key={p.id}>
                  <i style={{ background: p.farbe }}>{p.initialen}</i>
                  <span className="wer">
                    <span className="name">{p.name}</span>
                    {p.laeuft_seit ? (
                      <span className="anwesenheit" data-an="ja">
                        seit <span className="zahl">{uhrzeitAusZeitpunkt(p.laeuft_seit)}</span>
                        {p.laeuft_auf && <> · {p.laeuft_auf}</>}
                      </span>
                    ) : (
                      <span className="anwesenheit">
                        nicht eingestempelt{" "}
                        <small>
                          ({p.zuletzt_bis ? <>zuletzt <span className="zahl">{wannKurz(p.zuletzt_bis)}</span></> : "noch nie"})
                        </small>
                      </span>
                    )}
                  </span>
                  <span className="balken" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.round((100 * p.sekunden) / maxPerson)}%`,
                        background: p.farbe,
                      }}
                    />
                  </span>
                  <span className="zahl stunden">{alsDauer(p.sekunden)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Projektplan wechseln={wechseln} />

      {ich.darf.finanzen_eintragen && <Finanzeingabe />}

      <div className="karte">
        <div className="kartenkopf">
          <h2>Kontostand</h2>
          {d.kontostand_verlauf.length > 1 && (
            <div className="linie-legende">
              <span className="legende-erfasst">erfasst</span>
              <span className="legende-prognose">fortgeschrieben</span>
            </div>
          )}
        </div>
        {d.kontostand_verlauf.length === 0 ? (
          <Leerstelle
            was="Noch kein Kontostand erfasst"
            satz={
              ich.darf.finanzen_eintragen
                ? "Trag den Stand einmal im Monat ein — daraus entstehen Verlauf und Runway."
                : "Einen Kontostand trägt ein Administrator ein."
            }
          />
        ) : (
          <>
            <Kontostandlinie
              verlauf={d.kontostand_verlauf}
              monatskosten={d.finanzen.erwartete_monatskosten}
            />

            {/*
              Die Linie zeigt den Verlauf, die Liste die genauen Beträge. Sie
              steht zugeklappt darunter, statt daneben zu liegen: Gebraucht wird
              sie, wenn jemand einen einzelnen Stichtag nachschlägt — und das
              ist nicht der Grund, warum man auf das Dashboard geht.
            */}
            <details className="stichtage">
              <summary className="klapptitel">
                Alle Stichtage ({d.kontostand_verlauf.length})
              </summary>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Stichtag</th>
                    <th>Kontostand</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.kontostand_verlauf].reverse().map((k) => (
                    <tr key={k.id}>
                      <td data-spalte="Stichtag">{DATUM.format(new Date(k.datum))}</td>
                      <td data-spalte="Kontostand" className="zahl">
                        {euro(k.betrag)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Die Phasen aller Projekte auf einer Achse, mit dem Strich für heute — der
 * Gantt der Projektseite, nur zum Lesen. Gezogen wird auf der Projektseite:
 * Auf dem Dashboard verschöbe ein Wisch beim Blättern am Handy eine Phase.
 *
 * Nur Phasen mit Zeitraum. Die ohne (Finanzierung, Ziele) stünden als leere
 * Zeilen da, und „in die Zeile klicken" setzt hier keinen.
 */
function Projektplan({ wechseln }: { wechseln: Wechseln }) {
  const abfrage = useProjekte();
  const heute = heuteIso();
  const zurProjektseite = (
    <a
      className="knopf-still"
      href={alsPfad("projekt", null)}
      onClick={(e) => {
        e.preventDefault();
        wechseln("projekt");
      }}
    >
      <Zeichen name="gantt" />
      Projektseite
    </a>
  );
  const kopf = (
    <div className="kartenkopf">
      <h2>Projekte</h2>
      {zurProjektseite}
    </div>
  );
  if (!abfrage.data) {
    return (
      <div className="karte">
        {kopf}
        <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />
      </div>
    );
  }

  const projekte = abfrage.data.filter((pr) => !pr.ist_auffang);
  const zeilen = projekte.flatMap((pr) => pr.phasen.filter((ph) => ph.von && ph.bis).map((ph) => ({ pr, ph })));
  // Den Projektnamen nur nennen, wenn es mehr als eines ist.
  const mehrere = new Set(zeilen.map((z) => z.pr.id)).size > 1;

  return (
    <div className="karte">
      {kopf}
      {zeilen.length === 0 ? (
        <Leerstelle
          was="Noch keine Phase mit Zeitraum"
          satz="Auf der Projektseite in die Zeile einer Phase klicken gibt ihr einen."
          aktion={{ text: "Zur Projektseite", tun: () => wechseln("projekt") }}
        />
      ) : (
        <Gantt achse={achseUeber(zeilen.flatMap(({ ph }) => [ph.von, ph.bis]), heute)} heute={heute} etikett="Phase" rechts="Gebucht">
          {zeilen.map(({ pr, ph }) => {
            const weg = `planung/${ph.id}`;
            const planen = () => wechseln("module", weg, { ruecksprung: true });
            const gebucht = ph.pakete.reduce((summe, x) => summe + x.gebuchte_sekunden, 0);
            return (
              <GanttZeile
                key={ph.id}
                art="phase"
                etikett={
                  <a
                    className="gantt-wahl"
                    href={alsPfad("module", weg)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      planen();
                    }}
                  >
                    <b>{ph.titel}</b>
                    <em>
                      {mehrere ? `${pr.titel} · ` : ""}
                      {monatsText(ph.von, ph.bis)}
                    </em>
                  </a>
                }
                rechts={<span className="zahl">{gebucht > 0 ? alsDauer(gebucht) : "—"}</span>}
              >
                <GanttBalken
                  spanne={{ von: ph.von!, bis: ph.bis! }}
                  art="phase"
                  stand={ph.stand}
                  beschriftung={`${ph.titel}: ${zeitraumText(ph.von, ph.bis)}`}
                  darf={false}
                  klick={planen}
                >
                  {ph.titel}
                </GanttBalken>
              </GanttZeile>
            );
          })}
        </Gantt>
      )}
    </div>
  );
}
