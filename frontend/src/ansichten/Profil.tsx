/**
 * Die eigenen Stammdaten, in vier Teilen: Person, Kontakt, Adresse, Konto.
 *
 * Vorher standen sieben Felder in einer Spalte untereinander — Name, Rolle,
 * E-Mail, Telefon, Adresse, Ort, Geburtsdatum —, und darunter noch Team und
 * Protokoll. Das war eine Liste, kein Aufbau: Man sah nicht, was zusammen
 * gehört, und musste an allem vorbei, was man gerade nicht suchte.
 *
 * Die Leiste steht **rechts**, anders als in den Einstellungen. Der Grund ist
 * nicht Geschmack: Hier wird geschrieben, nicht nachgeschlagen. Das Formular
 * beginnt links am selben Rand wie jede andere Seite, und die Leiste ist die
 * Übersicht daneben — nicht das Erste, woran der Blick hängen bleibt.
 *
 * **Gespeichert wird immer alles, was sich geändert hat**, nicht nur der
 * gerade offene Teil. Sonst verlöre ein Wechsel von „Person" zu „Adresse" die
 * angefangene Zeile — und das an einer Stelle, die aussieht, als hätte man
 * bloß umgeblättert.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, type Ich } from "../basis/daten";
import { melden } from "../basis/meldungen";
import type { Profilteil, Seite } from "../basis/router";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";

type Feld = { schluessel: string; titel: string; typ?: string; hinweis?: string };

const TEILE: { teil: Profilteil; titel: string; felder: Feld[] }[] = [
  {
    teil: "person",
    titel: "Person",
    felder: [
      { schluessel: "name", titel: "Name", hinweis: "Steht im Team, im Zeitnachweis und an jeder Buchung." },
      { schluessel: "funktion", titel: "Rolle", hinweis: "Was du hier tust — nicht die Berechtigung." },
      { schluessel: "geburtsdatum", titel: "Geburtsdatum", typ: "date" },
    ],
  },
  {
    teil: "kontakt",
    titel: "Kontakt",
    felder: [
      { schluessel: "email", titel: "E-Mail", typ: "email", hinweis: "Damit meldest du dich an." },
      { schluessel: "telefon", titel: "Telefon", typ: "tel" },
    ],
  },
  {
    teil: "adresse",
    titel: "Adresse",
    felder: [
      { schluessel: "strasse", titel: "Straße" },
      { schluessel: "ort", titel: "Ort" },
    ],
  },
  { teil: "konto", titel: "Konto", felder: [] },
];

const ROLLENTEXT: Record<string, string> = {
  admin: "Admin — darf alles",
  bearbeiter: "Bearbeiter — alles außer löschen und Finanzen",
  leser: "Leser — sieht alles, ändert nichts",
};

const alsText = (ich: Ich, schluessel: string) =>
  (ich as unknown as Record<string, string | null>)[schluessel] ?? "";

export function Profil({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const neuLaden = useNeuLaden();
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      TEILE.flatMap((t) => t.felder).map((f) => [f.schluessel, alsText(ich, f.schluessel)]),
    ),
  );
  const [fehler, setFehler] = useState("");

  const offen = TEILE.find((t) => t.teil === unter) ?? TEILE[0];

  // Nur das Geänderte geht hinaus — über alle vier Teile, nicht nur über den
  // offenen. Ein PATCH mit unveränderten Feldern schriebe außerdem Zeilen ins
  // Änderungsprotokoll, in denen alt und neu dasselbe sind.
  const geaendert = Object.entries(werte).filter(([k, v]) => v !== alsText(ich, k));

  async function speichern() {
    if (!werte.name?.trim())
      return setFehler("Ohne Namen steht im Team und im Zeitnachweis eine leere Zeile.");
    setFehler("");
    if (geaendert.length === 0) return melden("gut", "Nichts zu speichern — alles steht schon so.");
    await hole(`/nutzer/${ich.id}/`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(geaendert)),
    });
    melden("gut", "Profil gespeichert.");
    neuLaden();
  }

  return (
    <div className="profilseite">
      <nav className="untermenue" aria-label="Profil">
        {TEILE.map((t) => (
          <a
            key={t.teil}
            href={`/profil/${t.teil}`}
            aria-current={t.teil === offen.teil ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              wechseln("profil", t.teil);
            }}
          >
            {t.titel}
          </a>
        ))}
      </nav>

      <div className="spalte">
        <div className="karte">
          <h2>{offen.titel}</h2>

          {offen.teil === "konto" ? (
            <Konto ich={ich} />
          ) : (
            <>
              {offen.felder.map((feld) => (
                <label key={feld.schluessel} className="profilfeld">
                  <span className="beschriftung-klein">{feld.titel}</span>
                  <input
                    className="feld"
                    type={feld.typ ?? "text"}
                    value={werte[feld.schluessel] ?? ""}
                    onChange={(e) => {
                      setWerte({ ...werte, [feld.schluessel]: e.target.value });
                      setFehler("");
                    }}
                  />
                  {feld.hinweis && <span className="feldhinweis">{feld.hinweis}</span>}
                </label>
              ))}

              {offen.teil === "adresse" && (
                <p className="feldhinweis">
                  Adresse und Geburtsdatum sehen nur du und ein Administrator.
                </p>
              )}

              <div className="feld-reihe" style={{ marginTop: 16 }}>
                <button type="button" className="knopf" onClick={speichern}>
                  Speichern
                </button>
                {geaendert.length > 0 && (
                  <span className="feldhinweis">
                    {geaendert.length === 1
                      ? "Eine Änderung ist noch nicht gespeichert."
                      : `${geaendert.length} Änderungen sind noch nicht gespeichert.`}
                  </span>
                )}
                <Fehlerzeile text={fehler} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Was zum Konto gehört, ändert man nicht selbst: Die Rolle setzt ein Admin,
 * das Passwort geht über die Kommandozeile. Beides steht hier trotzdem — die
 * häufigste Frage an dieser Stelle ist „was darf ich eigentlich", und die
 * zweithäufigste „wie ändere ich mein Passwort".
 */
function Konto({ ich }: { ich: Ich }) {
  return (
    <>
      <div className="kontozeile">
        <i className="kuerzel" style={{ background: ich.farbe }}>
          {ich.initialen}
        </i>
        <div>
          <b>{ich.name}</b>
          <div className="feldhinweis">{ich.email}</div>
        </div>
      </div>

      <span className="beschriftung-klein">Berechtigung</span>
      <p className="profilwert">
        {(ich.rolle && ROLLENTEXT[ich.rolle]) || "Keine Rolle — melde dich bei einem Admin."}
      </p>
      <p className="feldhinweis">
        Die Rolle setzt ein Admin unter Einstellungen · Konten. Kürzel und Farbe kommen
        vom Konto und stehen in der Kopfleiste und im Team.
      </p>

      <span className="beschriftung-klein">Passwort</span>
      <p className="feldhinweis">
        Das Passwort setzt ein Admin am Server (<code>nutzer_passwort</code>). In ein
        Formular im Browser getippt, stünde es im Verlauf und im Passwortspeicher.
      </p>
    </>
  );
}
