import { useDashboard, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { alsDauer } from "../basis/zeit";
import { Hilfe } from "../bausteine/Hilfe";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zustand } from "../basis/Zustand";
import { Finanzeingabe } from "../bausteine/Finanzeingabe";

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const DATUM = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Beträge kommen als Zeichenkette. Erst hier wird daraus eine Zahl — zum Anzeigen. */
function euro(betrag: string | null) {
  return betrag === null ? "—" : EURO.format(Number(betrag));
}

export function Dashboard({ ich, wechseln }: { ich: Ich; wechseln: (s: Seite) => void }) {
  const abfrage = useDashboard();
  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;
  const d = abfrage.data;

  const gesamtWoche = d.team.reduce((s, p) => s + p.sekunden, 0);
  const maxPerson = Math.max(1, ...d.team.map((p) => p.sekunden));
  const gesamtProjekte = d.projekte.reduce((s, p) => s + p.sekunden, 0);

  return (
    <div className="spalte">
      {d.offene_entwuerfe.length > 0 && (
        <div className="karte" style={{ borderTop: "3px solid var(--warnung)" }}>
          <h2>Bitte bestätigen</h2>
          <p style={{ margin: "0 0 10px", fontSize: 14 }}>
            {d.offene_entwuerfe.length === 1 ? "Eine Buchung wurde" : `${d.offene_entwuerfe.length} Buchungen wurden`}{" "}
            am Tagesende abgeschnitten, weil der Clock-out fehlte. Sie{" "}
            {d.offene_entwuerfe.length === 1 ? "zählt" : "zählen"} in keiner Summe mit,
            bis du{" "}
            {d.offene_entwuerfe.length === 1 ? "sie bestätigt" : "sie bestätigt"} hast.
          </p>
          <button type="button" className="knopf" onClick={() => wechseln("zeit")}>
            In der Zeitliste ansehen
          </button>
        </div>
      )}

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

        <div className="karte kennzahl" style={{ borderTopColor: "var(--akzent)" }}>
          <div className="beschriftung">
            Kosten / Monat <Hilfe text="Erwartete Kosten. Sobald drei Monate erfasst sind, ist es deren Durchschnitt — sonst der Fixkostenbetrag." />
          </div>
          <div className="wert">{euro(d.finanzen.erwartete_monatskosten)}</div>
          <div className="hinweis">{d.finanzen.prognose_grundlage}</div>
        </div>

        <div className="karte kennzahl" style={{ borderTopColor: "var(--gut)" }}>
          <div className="beschriftung">Runway</div>
          <div className="wert">
            {d.finanzen.runway_monate ? `${d.finanzen.runway_monate} Mon.` : "—"}
          </div>
          <div className="hinweis">
            {d.finanzen.runway_monate
              ? "Kontostand ÷ erwartete Kosten"
              : "Kontostand und Kosten fehlen"}
          </div>
        </div>

        <div className="karte kennzahl" style={{ borderTopColor: "var(--text-sehr-leise)" }}>
          <div className="beschriftung">Woche Team</div>
          <div className="wert">{alsDauer(d.team_sekunden)}</div>
          <div className="hinweis">
            {DATUM.format(new Date(d.zeitraum.von))} – {DATUM.format(new Date(d.zeitraum.bis))}
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
          <h2>Stunden pro Person · diese Woche</h2>
          {gesamtWoche === 0 ? (
            <Leerstelle
              was="Diese Woche noch keine Zeit gebucht"
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
        <h2>Verteilung auf Projekte · diese Woche</h2>
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
        <h2>Kontostand-Verlauf</h2>
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
        )}
      </div>
    </div>
  );
}
