import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { hole } from "../basis/api";
import { Zustand } from "../basis/Zustand";
import { Hinweis } from "./Hinweis";
import { Suchfeld } from "./Suchfeld";

type Eintrag = {
  id: number;
  zeitpunkt: string;
  nutzer_text: string;
  modell: string;
  objekt_text: string;
  aktion: string;
  aenderungen: Record<string, { alt: unknown; neu: unknown }>;
};

const UHRZEIT = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" });
const TAG = new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

const AKTION: Record<string, string> = {
  angelegt: "angelegt",
  geaendert: "geändert",
  geloescht: "entfernt",
  wiederhergestellt: "wiederhergestellt",
};

/** Wie viele Einträge auf einmal dazukommen. */
const SCHRITT = 50;

/** socos.Arbeitspaket → Arbeitspaket */
const kurz = (modell: string) => modell.split(".").pop() ?? modell;

const ZEITPUNKT = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** Ein Wert, wie ihn ein Mensch liest: „19.11.2026, 12:45" statt ISO, „ja" statt true. */
export function wert(v: unknown): string {
  if (v === null || v === "") return "leer";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "object") return JSON.stringify(v);
  const text = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return ZEITPUNKT.format(d);
  }
  const tag = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return tag ? `${tag[3]}.${tag[2]}.${tag[1]}` : text;
}

/** Der Kalendertag in Ortszeit — der Server liefert UTC. */
const tagSchluessel = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function tagTitel(d: Date): string {
  const heute = new Date();
  const gestern = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - 1);
  if (tagSchluessel(d) === tagSchluessel(heute)) return "Heute";
  if (tagSchluessel(d) === tagSchluessel(gestern)) return "Gestern";
  return TAG.format(d);
}

/** Alles, wonach jemand sucht: wer, welches Ding, welches Feld, welcher Wert. */
const suchtext = (e: Eintrag) =>
  [
    e.nutzer_text || "System",
    kurz(e.modell),
    e.objekt_text,
    AKTION[e.aktion] ?? e.aktion,
    ...Object.entries(e.aenderungen).flatMap(([feld, v]) => [feld, wert(v.alt), wert(v.neu)]),
  ]
    .join(" ")
    .toLowerCase();

/**
 * Das Änderungsprotokoll zum Nachschlagen.
 *
 * In einem MedTech-Umfeld ist „wer hat diese Zeit nachträglich geändert" keine
 * Neugier. Das Protokoll gibt es seit dem ersten Modell — hier wird es
 * lesbar, ohne dass jemand den Django-Admin öffnen muss.
 *
 * **Nach Tagen gegliedert, nicht als Tabelle mit fünf Spalten** (2026-11-19).
 * Die Frage ist fast immer „was war gestern" oder „wer hat X geändert". In der
 * Tabelle stand bei jeder Zeile das volle Datum, und die Änderung selbst —
 * das, worum es geht — drängte sich in die schmalste Spalte. Jetzt trägt der
 * Tag die Überschrift, die Zeile nur die Uhrzeit, und die Felder haben die
 * Breite. Die Suche geht über alles, auch über alte und neue Werte.
 */
export function Protokoll() {
  const [suche, setSuche] = useState("");
  const [menge, setMenge] = useState(SCHRITT);
  const abfrage = useQuery({
    queryKey: ["protokoll"],
    queryFn: () => hole<Eintrag[]>("/protokoll/"),
  });

  if (!abfrage.data) return <Zustand abfrage={abfrage} erneut={() => abfrage.refetch()} />;

  const alle = abfrage.data;
  const worte = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const treffer = worte.length ? alle.filter((e) => worte.every((w) => suchtext(e).includes(w))) : alle;
  const gezeigt = treffer.slice(0, menge);

  const tage: { schluessel: string; titel: string; eintraege: Eintrag[] }[] = [];
  for (const e of gezeigt) {
    const d = new Date(e.zeitpunkt);
    const schluessel = tagSchluessel(d);
    const letzter = tage[tage.length - 1];
    if (letzter?.schluessel === schluessel) letzter.eintraege.push(e);
    else tage.push({ schluessel, titel: tagTitel(d), eintraege: [e] });
  }

  return (
    <>
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>
            Änderungsprotokoll{" "}
            <Hinweis
              worum="Was im Protokoll steht"
              text="Wer, wann, was — alt → neu je Feld. Es lässt sich nur lesen: Ein Protokoll, das man ändern kann, beantwortet die Frage nicht mehr, für die es da ist."
            />
          </b>
          <span>{alle.length === 1 ? "1 Eintrag" : `${alle.length} Einträge`}</span>
        </div>
        {alle.length > 0 && (
          <Suchfeld
            klasse="vorhaben-suche"
            wert={suche}
            setzen={(w) => {
              setSuche(w);
              setMenge(SCHRITT);
            }}
            platzhalter="Wer, Paket, Feld, Wert …"
            treffer={{ gezeigt: treffer.length, von: alle.length }}
          />
        )}
      </div>

      {alle.length === 0 ? (
        <div className="karte leerstelle">
          <b>Noch keine Einträge</b>
          <p>Sobald etwas angelegt oder geändert wird, steht es hier.</p>
        </div>
      ) : treffer.length === 0 ? (
        <div className="karte leerstelle">
          <b>Nichts gefunden</b>
          <p>Gesucht wird in Namen, Dingen, Feldern und Werten.</p>
          <button type="button" className="knopf-still" onClick={() => setSuche("")}>
            Suche leeren
          </button>
        </div>
      ) : (
        <div className="karte protokoll">
          {tage.map((t) => (
            <section key={t.schluessel} className="protokoll-tag">
              <h3>{t.titel}</h3>
              <ol>
                {t.eintraege.map((e) => (
                  <Zeile key={e.id} eintrag={e} />
                ))}
              </ol>
            </section>
          ))}

          {treffer.length > gezeigt.length && (
            <button type="button" className="knopf-still protokoll-mehr" onClick={() => setMenge((m) => m + SCHRITT)}>
              Weitere {Math.min(SCHRITT, treffer.length - gezeigt.length)} von{" "}
              <span className="zahl">{treffer.length - gezeigt.length}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Zeile({ eintrag: e }: { eintrag: Eintrag }) {
  const felder = Object.entries(e.aenderungen);
  // Beim Anlegen ist jedes „alt" leer — „leer → 12" sagte nur Rauschen.
  const mitAlt = e.aktion !== "angelegt";
  return (
    <li className="protokoll-zeile" data-aktion={e.aktion}>
      <span className="protokoll-zeit zahl">{UHRZEIT.format(new Date(e.zeitpunkt))}</span>
      <span className="protokoll-wer">{e.nutzer_text || "System"}</span>
      <div className="protokoll-was">
        <p>
          <span className="protokoll-modell">{kurz(e.modell)}</span>
          <b>{e.objekt_text || "—"}</b> <span className="protokoll-aktion">{AKTION[e.aktion] ?? e.aktion}</span>
        </p>
        {felder.length > 0 && (
          <ul className="protokoll-felder">
            {felder.map(([feld, v]) => (
              <li key={feld}>
                <span className="protokoll-feld">{feld}</span>
                {mitAlt && (
                  <>
                    <s>{wert(v.alt)}</s>
                    <span aria-hidden="true">→</span>
                  </>
                )}
                <span>{wert(v.neu)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
