/**
 * Runway-Planung: die Auswahl neben der Linie — welche Fixkosten und Ausgaben
 * mitrechnen. Geöffnet aus den Registern „Fixkosten“ und „Ausgaben“.
 *
 * **Warum neben der Linie und nicht im Register:** Wer eine Position abwählt,
 * will sehen, was die Linie dann tut. Im Register steht man eine Bildschirm-
 * höhe darunter (Bernd, 2026-11-16: „oben für die Grafik rechts daneben").
 *
 * Abgewählt heißt `aus: true` am Eintrag. Er bleibt im Plan, der Server
 * rechnet ihn nicht (`services/runway.berechnen`) — Linie, Kennzahlen und
 * Überbrückung gehen damit mit. Ein zweiter Weg, nur die Linie umzurechnen,
 * hätte Zahlen nebeneinander gestellt, die nicht zusammenpassen.
 */

import type { Planeintrag, Runwayplan } from "../basis/daten";
import { fmtE, istAusgabe, kategorieVon, num, quartalVon } from "../basis/runway";

const RHYTHMUS: Record<string, string> = { monatlich: "/M", quartal: "/Q", jaehrlich: "/J" };

export function Auswahl({
  S,
  darf,
  aendern,
  schliessen,
}: {
  S: Runwayplan;
  darf: boolean;
  aendern: (neu: Runwayplan) => void;
  schliessen: () => void;
}) {
  const fix = S.kosten.filter((k) => !istAusgabe(k));
  const qVon = (k: Planeintrag) => quartalVon(k.start) ?? quartalVon(S.settings.start)!;
  const ausgaben = S.kosten
    .filter(istAusgabe)
    .map((k) => ({ k, q: qVon(k) }))
    .sort((x, y) => x.q.jahr - y.q.jahr || x.q.q - y.q.q);
  const jahre = [...new Set(ausgaben.map((x) => x.q.jahr))];

  function setzen(ids: string[], mit: boolean) {
    aendern({
      ...S,
      kosten: S.kosten.map((k) => {
        if (!ids.includes(k.id)) return k;
        if (!mit) return { ...k, aus: true };
        // Wieder dabei heißt: das Feld fällt weg, statt als `false` stehen zu bleiben.
        const { aus: _, ...rest } = k;
        return rest as Planeintrag;
      }),
    });
  }

  const zeile = (k: Planeintrag, vorne: string, hinten: string) => (
    <label key={k.id} className="rw-auswahl-zeile" data-aus={k.aus ? "" : undefined} data-kat={kategorieVon(k.cat)} title={String(k.cat || "Ohne Kategorie")}>
      <input type="checkbox" checked={!k.aus} onChange={(e) => setzen([k.id], e.target.checked)} />
      <span className="rw-kat-punkt" />
      <span className="name">{String(k.name || "Ohne Namen")}</span>
      {vorne && <span className="wann">{vorne}</span>}
      <span className="zahl">{hinten}</span>
    </label>
  );

  const gruppe = (titel: string, eintraege: Planeintrag[], inhalt: React.ReactNode) => {
    const mit = eintraege.filter((k) => !k.aus).length;
    return (
      <div className="rw-auswahl-gruppe">
        <div className="rw-auswahl-kopf">
          <h3>{titel}</h3>
          <span className="rw-hint">
            {mit} von {eintraege.length}
          </span>
          {eintraege.length > 0 && (
            <span className="rw-auswahl-alle">
              <button type="button" disabled={mit === eintraege.length} onClick={() => setzen(eintraege.map((k) => k.id), true)}>
                alle
              </button>
              <button type="button" disabled={mit === 0} onClick={() => setzen(eintraege.map((k) => k.id), false)}>
                keine
              </button>
            </span>
          )}
        </div>
        {eintraege.length ? inhalt : <p className="rw-hint">Noch keine erfasst.</p>}
      </div>
    );
  };

  return (
    <aside className="rw-panel rw-auswahl" aria-label="Was mitrechnet">
      <div className="rw-panel-head">
        <h2>Was mitrechnet</h2>
        <button type="button" className="rw-x" aria-label="Auswahl schließen" title="Schließen" onClick={schliessen}>
          ×
        </button>
      </div>
      <fieldset className="rw-auswahl-liste" disabled={!darf}>
        {gruppe("Fixkosten", fix, fix.map((k) => zeile(k, "", `${fmtE(num(k.amount))}${RHYTHMUS[String(k.interval)] ?? ""}`)))}
        {gruppe(
          "Ausgaben",
          ausgaben.map((x) => x.k),
          jahre.map((y) => (
            <div key={y} className="rw-auswahl-jahr">
              <span className="rw-eyebrow">{y}</span>
              {ausgaben.filter((x) => x.q.jahr === y).map(({ k, q }) => zeile(k, `Q${q.q}`, fmtE(num(k.amount))))}
            </div>
          )),
        )}
      </fieldset>
    </aside>
  );
}
