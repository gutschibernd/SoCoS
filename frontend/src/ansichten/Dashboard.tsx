import { useState } from "react";

import { useDashboard, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { alsDauer, heuteAlsDatum } from "../basis/zeit";
import { Kontostandlinie } from "../bausteine/Kontostandlinie";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Zustand } from "../basis/Zustand";
import { Finanzeingabe } from "../bausteine/Finanzeingabe";

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

export function Dashboard({ ich, wechseln }: { ich: Ich; wechseln: (s: Seite) => void }) {
  const [spanne, setSpanne] = useState<Spanne>("woche");
  const abfrage = useDashboard(spannenParameter(spanne));
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const d = abfrage.data;

  const gesamtWoche = d.team.reduce((s, p) => s + p.sekunden, 0);
  const maxPerson = Math.max(1, ...d.team.map((p) => p.sekunden));
  const gesamtProjekte = d.projekte.reduce((s, p) => s + p.sekunden, 0);

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
          <div className="beschriftung">
            Kosten / Monat <Hilfe text="Erwartete Kosten. Sobald drei Monate erfasst sind, ist es deren Durchschnitt — sonst der Fixkostenbetrag." />
          </div>
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

      <div className="raster raster-2">
        <div className="karte">
          <h2>Team jetzt</h2>
          {d.team.length === 0 ? (
            <Leerstelle was="Noch niemand da" satz="Konten legt ein Administrator an." />
          ) : (
            <ul className="personen">
              {d.team.map((p) => (
                <li key={p.id}>
                  <i style={{ background: p.farbe }}>{p.initialen}</i>
                  <span className="name">{p.name}</span>
                  <span className="tun">{p.laeuft_auf ?? "—"}</span>
                  <span className="zahl">{alsDauer(p.sekunden)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="karte">
          <h2>Stunden pro Person · {SPANNENTEXT[spanne].dazu}</h2>
          {gesamtWoche === 0 ? (
            <Leerstelle
              was={`Noch keine Zeit gebucht (${SPANNENTEXT[spanne].dazu})`}
              satz="Die Uhr startet auf einem Arbeitspaket."
              aktion={{ text: "Zu den Projekten", tun: () => wechseln("projekt") }}
            />
          ) : (
            <div className="saeulen">
              {d.team.map((p) => (
                <div key={p.id} className="saeule">
                  <div className="stab">
                    <i
                      style={{
                        height: `${Math.round((100 * p.sekunden) / maxPerson)}%`,
                        background: p.farbe,
                      }}
                    />
                  </div>
                  <span className="zahl">{alsDauer(p.sekunden)}</span>
                  <span className="fuss">{p.initialen}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="karte">
        <h2>Verteilung auf Projekte · {SPANNENTEXT[spanne].dazu}</h2>
        {gesamtProjekte === 0 ? (
          <Leerstelle
            was="Noch keine Zeit auf Projekten"
            satz="Sobald gebucht wird, steht hier, worauf die Woche gegangen ist."
          />
        ) : (
          <>
            <div className="verteilung">
              {d.projekte
                .filter((p) => p.sekunden > 0)
                .map((p) => (
                  <i
                    key={p.id}
                    style={{
                      width: `${(100 * p.sekunden) / gesamtProjekte}%`,
                      background: p.farbe,
                    }}
                    title={`${p.titel}: ${alsDauer(p.sekunden)}`}
                  />
                ))}
            </div>
            <ul className="legende">
              {d.projekte
                .filter((p) => p.sekunden > 0)
                .map((p) => (
                  <li key={p.id}>
                    <i style={{ background: p.farbe }} />
                    {p.titel}
                    <span className="zahl">{alsDauer(p.sekunden)}</span>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>

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
