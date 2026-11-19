/**
 * Die eigenen Stammdaten: oben wer man ist, darunter ein Formular in drei
 * Gruppen — Person, Kontakt, Adresse —, darunter das Konto.
 *
 * **Eine Seite, keine vier Teile mehr** (2026-11-19). Vorher stand jede Gruppe
 * hinter einem eigenen Eintrag einer Leiste rechts — sieben Felder auf vier
 * Seiten, je zwei oder drei. Wer Telefon und Adresse nachtragen wollte, klickte
 * dreimal und sah nie, was sonst noch fehlt. Jetzt steht alles auf einen Blick,
 * die Gruppen nebeneinander, am Handy untereinander.
 *
 * Die Wege `/profil/adresse`, `/profil/konto` … bleiben gültig (basis/router.ts)
 * und springen zu ihrer Gruppe: Lesezeichen und verschickte Links führen
 * weiter dorthin, wo sie hinzeigten.
 *
 * **Gespeichert wird alles, was sich geändert hat, mit einem Knopf** — und nur
 * das. Ein PATCH mit unveränderten Feldern schriebe Zeilen ins
 * Änderungsprotokoll, in denen alt und neu dasselbe sind.
 */

import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, type Ich } from "../basis/daten";
import { melden } from "../basis/meldungen";
import type { Profilteil, Seite } from "../basis/router";
import { inZwischenablage, passwortBefehl } from "../basis/serverbefehl";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Hinweis } from "../bausteine/Hinweis";
import { Zeichen } from "../bausteine/Zeichen";

type Feld = { schluessel: string; titel: string; typ?: string; hinweis?: string; breit?: boolean };

const GRUPPEN: { teil: Exclude<Profilteil, "konto">; titel: string; hinweis?: string; felder: Feld[] }[] = [
  {
    teil: "person",
    titel: "Person",
    felder: [
      { schluessel: "name", titel: "Name", hinweis: "Steht im Team, im Zeitnachweis und an jeder Buchung.", breit: true },
      { schluessel: "funktion", titel: "Rolle im Team", hinweis: "Was du hier tust — nicht die Berechtigung." },
      { schluessel: "geburtsdatum", titel: "Geburtsdatum", typ: "date" },
    ],
  },
  {
    teil: "kontakt",
    titel: "Kontakt",
    felder: [
      { schluessel: "email", titel: "E-Mail", typ: "email", hinweis: "Damit meldest du dich an.", breit: true },
      { schluessel: "telefon", titel: "Telefon", typ: "tel", breit: true },
    ],
  },
  {
    teil: "adresse",
    titel: "Adresse",
    hinweis: "Adresse und Geburtsdatum sehen nur du und ein Admin.",
    felder: [
      { schluessel: "strasse", titel: "Straße", breit: true },
      { schluessel: "ort", titel: "Ort", breit: true },
    ],
  },
];

const ROLLENTEXT: Record<string, string> = {
  admin: "Admin — darf alles",
  bearbeiter: "Bearbeiter — alles außer löschen und Finanzen",
  leser: "Leser — sieht alles, ändert nichts",
};

const ROLLE_KURZ: Record<string, string> = { admin: "Admin", bearbeiter: "Bearbeiter", leser: "Leser" };

const alsText = (ich: Ich, schluessel: string) =>
  (ich as unknown as Record<string, string | null>)[schluessel] ?? "";

const anfang = (ich: Ich) =>
  Object.fromEntries(GRUPPEN.flatMap((g) => g.felder).map((f) => [f.schluessel, alsText(ich, f.schluessel)]));

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
  const [werte, setWerte] = useState<Record<string, string>>(() => anfang(ich));
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);

  // Ein alter Weg auf einen Teil springt zu seiner Gruppe. Die erste steht
  // ohnehin oben — dorthin zu rollen, hieße nur, den Kopf wegzuschieben.
  useEffect(() => {
    if (unter && unter !== "person") document.getElementById(`profil-${unter}`)?.scrollIntoView({ block: "start" });
  }, [unter]);

  const geaendert = Object.entries(werte).filter(([k, v]) => v !== alsText(ich, k));

  async function speichern() {
    if (!werte.name?.trim()) return setFehler("Ohne Namen steht im Team und im Zeitnachweis eine leere Zeile.");
    setFehler("");
    if (geaendert.length === 0) return;
    setSpeichert(true);
    try {
      await hole(`/nutzer/${ich.id}/`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(geaendert)) });
      melden("gut", "Profil gespeichert.");
      neuLaden();
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="spalte profilseite">
      <div className="vorhabenleiste profilkopf">
        {/* Die Farbe ist die des Kontos, wie in der Leiste — ein Datum, kein Ton der Palette. */}
        <i className="konto-kuerzel konto-kuerzel-gross" style={{ background: ich.farbe }}>
          {ich.initialen}
        </i>
        <div className="vorhaben-kopf">
          <b>{ich.name}</b>
          <span>{[ich.funktion, ich.email].filter(Boolean).join(" · ")}</span>
        </div>
        <span className="status status-laeuft">{(ich.rolle && ROLLE_KURZ[ich.rolle]) || "ohne Rolle"}</span>
      </div>

      <form
        className="karte profilformular"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        {GRUPPEN.map((g) => (
          <section key={g.teil} id={`profil-${g.teil}`} className="profilgruppe">
            <h2>
              {g.titel}
              {g.hinweis && (
                <>
                  {" "}
                  <Hinweis worum={`Wer ${g.titel} sieht`} text={g.hinweis} />
                </>
              )}
            </h2>
            <div className="profilfelder">
              {g.felder.map((feld) => (
                <div key={feld.schluessel} className={feld.breit ? "profilfeld profilfeld-breit" : "profilfeld"}>
                  <span className="beschriftung-klein">
                    <label htmlFor={`profil-feld-${feld.schluessel}`}>{feld.titel}</label>
                    {feld.hinweis && (
                      <>
                        {" "}
                        <Hinweis worum={`Was ${feld.titel} heißt`} text={feld.hinweis} />
                      </>
                    )}
                  </span>
                  <input
                    id={`profil-feld-${feld.schluessel}`}
                    className="feld"
                    type={feld.typ ?? "text"}
                    value={werte[feld.schluessel] ?? ""}
                    data-geaendert={werte[feld.schluessel] !== alsText(ich, feld.schluessel) ? "ja" : undefined}
                    onChange={(e) => {
                      setWerte({ ...werte, [feld.schluessel]: e.target.value });
                      setFehler("");
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="profilfuss">
          <span className="profilfuss-stand">
            {geaendert.length === 0
              ? "Alles gespeichert."
              : geaendert.length === 1
                ? "Eine Änderung ist noch nicht gespeichert."
                : `${geaendert.length} Änderungen sind noch nicht gespeichert.`}
          </span>
          {geaendert.length > 0 && (
            <button
              type="button"
              className="knopf-still"
              onClick={() => {
                setWerte(anfang(ich));
                setFehler("");
              }}
            >
              Verwerfen
            </button>
          )}
          <button type="submit" className="knopf" disabled={geaendert.length === 0 || speichert}>
            {speichert ? "Wird gespeichert …" : "Speichern"}
          </button>
          <Fehlerzeile text={fehler} />
        </div>
      </form>

      <Konto ich={ich} wechseln={wechseln} />
    </div>
  );
}

/**
 * Was zum Konto gehört, ändert man nicht selbst: Die Rolle setzt ein Admin,
 * das Passwort geht über die Konsole des Servers. Beides steht hier trotzdem —
 * die häufigste Frage an dieser Stelle ist „was darf ich eigentlich", und die
 * zweithäufigste „wie ändere ich mein Passwort".
 *
 * Wer selbst Admin ist, bekommt den Befehl zum Kopieren — derselbe Knopf wie
 * in Einstellungen · Konten, für das eigene Konto.
 */
function Konto({ ich, wechseln }: { ich: Ich; wechseln: (seite: Seite, unter?: string | null) => void }) {
  const [zumMarkieren, setZumMarkieren] = useState<string | null>(null);

  async function kopieren() {
    const befehl = passwortBefehl(ich.email);
    if (await inZwischenablage(befehl)) {
      setZumMarkieren(null);
      melden("gut", "Der Passwort-Befehl für dein Konto ist in der Zwischenablage.");
    } else setZumMarkieren(befehl);
  }

  return (
    <section id="profil-konto" className="karte">
      <h2>Konto</h2>
      <dl className="kontoangaben">
        <div>
          <dt>
            Berechtigung{" "}
            <Hinweis worum="Wer die Berechtigung setzt" text="Die Rolle setzt ein Admin unter Einstellungen · Konten." />
          </dt>
          <dd>
            {(ich.rolle && ROLLENTEXT[ich.rolle]) || "Keine Rolle — melde dich bei einem Admin."}
            {ich.darf.nutzer_verwalten && (
              <button type="button" className="mini" onClick={() => wechseln("einstellungen", "konten")}>
                Zu den Konten
                <Zeichen name="zeiger" />
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>
            Passwort{" "}
            <Hinweis
              worum="Warum das Passwort nicht hier geändert wird"
              text="In ein Formular im Browser getippt, stünde es im Verlauf und im Passwortspeicher. Darum setzt es ein Admin an der Konsole des Servers."
            />
          </dt>
          <dd>
            {ich.darf.nutzer_verwalten ? (
              <button type="button" className="mini" title={passwortBefehl(ich.email)} onClick={kopieren}>
                <Zeichen name="kopie" />
                Passwort-Befehl kopieren
              </button>
            ) : (
              "Setzt ein Admin am Server."
            )}
          </dd>
        </div>
      </dl>
      {zumMarkieren && (
        <div className="befehlkarte">
          <span className="beschriftung-klein">Der Browser lässt das Kopieren nicht zu — bitte markieren</span>
          <code>{zumMarkieren}</code>
        </div>
      )}
    </section>
  );
}
