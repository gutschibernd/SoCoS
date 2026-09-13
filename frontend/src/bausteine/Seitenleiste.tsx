import { Fragment, useState } from "react";

import { csrfWert, hole } from "../basis/api";
import { useLaufend, useNeuLaden, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { alsDauer } from "../basis/zeit";
import { hatEinstellungen } from "../ansichten/Einstellungen";
import { Notizdialog } from "./Notizdialog";
import { Uhr } from "./Uhr";
import { Zeichen, type ZeichenName } from "./Zeichen";

type Eintrag = { seite: Seite; titel: string; zeichen: ZeichenName };

/**
 * Das Menü — **eine** Liste, aus der beide Größen leben.
 *
 * Start steht ungruppiert ganz oben: Sie ist keine der beiden Welten, sondern
 * der Weg hinein. Bis hierher war sie nur über das Logo erreichbar; mit einer
 * Seitenleiste gibt es kein Logo mehr, auf das zu klicken sich anbietet, also
 * braucht sie einen Eintrag.
 *
 * „Intern" und „Extern" statt „Arbeit" und „Leute": Die erste Einteilung
 * trennte nicht sauber — Zeit ist auch Leute, Events sind auch Arbeit. Intern
 * ist, was wir selbst tun; extern, mit wem wir reden.
 */
const GRUPPEN: { titel: string | null; eintraege: Eintrag[] }[] = [
  {
    titel: null,
    eintraege: [{ seite: "start", titel: "Start", zeichen: "zuhause" }],
  },
  {
    titel: "Intern",
    eintraege: [
      { seite: "dashboard", titel: "Dashboard", zeichen: "dashboard" },
      { seite: "projekt", titel: "Projekt", zeichen: "projekt" },
      { seite: "zeit", titel: "Zeit", zeichen: "zeit" },
    ],
  },
  {
    titel: "Extern",
    eintraege: [
      { seite: "kontakte", titel: "Kontakte", zeichen: "kontakte" },
      { seite: "events", titel: "Events", zeichen: "event" },
    ],
  },
  /*
    Die dritte Gruppe handelt nicht von der Arbeit, sondern vom Werkzeug —
    deshalb steht sie unten und heißt „Software". Hier stand bis dahin nichts:
    Erklärungen hingen als Fragezeichen neben einzelnen Beschriftungen, und
    was jemandem auffiel, blieb ein Zuruf über den Tisch.
  */
  {
    titel: "Software",
    eintraege: [
      { seite: "doku", titel: "Doku", zeichen: "buch" },
      { seite: "rueckmeldungen", titel: "Wünsche & Fehler", zeichen: "sprechblase" },
    ],
  },
];

const ALLE = GRUPPEN.flatMap((g) => g.eintraege);

/**
 * Die vier Abkürzungen in der Fußleiste am Handy — der fünfte Platz ist
 * „Mehr" und öffnet die Leiste als Schublade.
 *
 * Sie stehen als Seitennamen da und werden aus GRUPPEN herausgesucht, nicht
 * ein zweites Mal beschrieben: Sonst hätte ein umbenannter Eintrag am Handy
 * noch den alten Namen, und niemand sähe warum.
 *
 * Die Auswahl ist die des Alltags, nicht die der Vollständigkeit: buchen,
 * nachtragen, im Baum nachsehen, jemanden nachschlagen. Dashboard und Events
 * schaut man sich an, wenn man Zeit hat — die stehen hinter „Mehr".
 */
const FUSS: Seite[] = ["start", "zeit", "projekt", "kontakte"];

export function Seitenleiste({
  ich,
  seite,
  wechseln,
}: {
  ich: Ich;
  seite: Seite;
  wechseln: (s: Seite) => void;
}) {
  const laufend = useLaufend();
  const neuLaden = useNeuLaden();
  const [fragtNotiz, setFragtNotiz] = useState(false);
  const [offen, setOffen] = useState(false);
  const buchung = laufend.data?.laufend ?? null;

  async function clockOut(notiz: string) {
    await hole("/zeiten/clock_out/", { method: "POST", body: JSON.stringify({ notiz }) });
    setFragtNotiz(false);
    neuLaden();
  }

  /* Jeder Weg schließt die Schublade. Sonst steht sie nach dem Wechsel offen
     über der Seite, auf die sie gerade geführt hat. */
  function hin(s: Seite) {
    setOffen(false);
    wechseln(s);
  }

  const uhr = (
    <Uhrblock
      buchung={buchung}
      fragen={() => setFragtNotiz(true)}
      waehlen={() => hin("projekt")}
    />
  );

  return (
    <>
      <aside className="leiste" data-offen={offen ? "ja" : "nein"}>
        {/*
          Nur das Signet und der Name, kein Knopf. Bis hierher war das Logo der
          einzige Weg zur Startseite — jetzt steht sie als erster Eintrag im
          Menü direkt darunter. Beides wäre derselbe Weg zweimal.

          Das Signet ist dieselbe Datei wie das Favicon. Nachgezeichnet wäre es
          beim ersten Nachbessern falsch.
        */}
        <div className="leiste-marke">
          <img src="/static/favicon.svg" alt="" width="20" height="20" />
          <b>SoCoS</b>
        </div>

        <nav className="navigation">
          {GRUPPEN.map((gruppe, i) => (
            <Fragment key={gruppe.titel ?? `gruppe-${i}`}>
              {gruppe.titel && <div className="navigation-gruppe">{gruppe.titel}</div>}
              {gruppe.eintraege.map((eintrag) => (
                <a
                  key={eintrag.seite}
                  href={`/${eintrag.seite}`}
                  aria-current={seite === eintrag.seite ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    hin(eintrag.seite);
                  }}
                >
                  <Zeichen name={eintrag.zeichen} />
                  {eintrag.titel}
                </a>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="leiste-fuss">
          {uhr}

          <div className="leiste-konto">
            <button type="button" className="profil" onClick={() => hin("profil")}>
              <i style={{ background: ich.farbe }}>{ich.initialen}</i>
              {/* Darunter die Funktion, nicht die Rolle: „Geschäftsführung" sagt,
                  wer da sitzt, „admin" sagt nur, was er darf — und das steht
                  ausführlich im Profil. Wer keine Funktion eingetragen hat,
                  bekommt dort auch keine leere Zeile. */}
              <span>
                <b>{ich.name}</b>
                {ich.funktion && <em>{ich.funktion}</em>}
              </span>
            </button>

            {/* Konten, Protokoll und Sicherung sind nichts, was im Tagesbetrieb
                gebraucht wird — deshalb ein Zeichen am Fuß und kein eigener
                Menüeintrag. Was dahinter offen steht, hängt an der Rolle; wer
                nichts davon darf, sieht das Zahnrad nicht. Entschieden wird das
                ohnehin am Server. */}
            {hatEinstellungen(ich) && (
              <a
                className="leiste-knopf"
                href="/einstellungen"
                aria-current={seite === "einstellungen" ? "page" : undefined}
                aria-label="Einstellungen"
                title="Einstellungen: Konten, Protokoll, Sicherung"
                onClick={(e) => {
                  e.preventDefault();
                  hin("einstellungen");
                }}
              >
                <Zeichen name="zahnrad" />
              </a>
            )}

            {/*
              Ein Formular, kein Link: Djangos LogoutView nimmt seit 5.0 nur
              noch POST. Ein Anker auf denselben Pfad sieht richtig aus und
              liefert 405 — der Knopf, den es vorher auf der Profilseite gab,
              hat aus genau diesem Grund nie abgemeldet.

              Und keine fetch-Anfrage: Nach dem POST soll der Browser der
              Weiterleitung auf die Anmeldeseite folgen und dabei den ganzen
              Zustand im Speicher wegwerfen. Genau das tut ein Formular von
              selbst.
            */}
            <form className="abmelden" method="post" action="/abmelden/">
              <input type="hidden" name="csrfmiddlewaretoken" value={csrfWert()} />
              <button type="submit" className="leiste-knopf" title="Abmelden" aria-label="Abmelden">
                <Zeichen name="abmelden" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Der Schatten hinter der Schublade. Ein Knopf und kein div: Wer mit der
          Tastatur arbeitet, muss sie auch ohne Zeigegerät wieder zubekommen. */}
      {offen && (
        <button
          type="button"
          className="leiste-schatten"
          aria-label="Menü schließen"
          onClick={() => setOffen(false)}
        />
      )}

      {/* Am Handy: die Uhr über der Fußleiste, wo der Daumen liegt. Sie scrollt
          nie weg. Derselbe Baustein wie in der Leiste — nicht dasselbe Markup
          ein zweites Mal, sondern dieselbe Funktion an zwei Plätzen. */}
      <div className="uhr-handy">{uhr}</div>

      <nav className="fussleiste">
        {FUSS.map((s) => {
          const eintrag = ALLE.find((e) => e.seite === s);
          if (!eintrag) return null;
          return (
            <a
              key={s}
              href={`/${s}`}
              aria-current={seite === s ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                hin(s);
              }}
            >
              <Zeichen name={eintrag.zeichen} />
              {eintrag.titel}
            </a>
          );
        })}
        <button
          type="button"
          aria-expanded={offen}
          onClick={() => setOffen((o) => !o)}
          data-offen={offen ? "ja" : "nein"}
        >
          <Zeichen name="mehr" />
          Mehr
        </button>
      </nav>

      {fragtNotiz && buchung && (
        <Notizdialog
          wo={`${buchung.projekt_titel} · ${buchung.paket_titel}`}
          dauer={alsDauer(Math.floor((Date.now() - new Date(buchung.start).getTime()) / 1000))}
          speichern={clockOut}
          abbrechen={() => setFragtNotiz(false)}
        />
      )}
    </>
  );
}

/**
 * Die laufende Uhr. Steht am Fuß der Leiste und am Handy über der Fußleiste —
 * **ein** Baustein an zwei Plätzen, damit der zweite beim nächsten Feld nicht
 * vergessen wird.
 *
 * Sie hat hier mehr Platz als im alten Chip in der Kopfzeile, und deshalb
 * steht der Pakettitel vollständig da statt als erstes abgeschnitten zu werden.
 */
function Uhrblock({
  buchung,
  fragen,
  waehlen,
}: {
  buchung: { start: string; paket_titel: string; projekt_titel: string } | null;
  fragen: () => void;
  waehlen: () => void;
}) {
  return (
    <div className="uhrblock" data-laeuft={buchung ? "ja" : "nein"}>
      <div className="uhrblock-zeit">
        <i className="punkt" />
        {buchung ? <Uhr seit={buchung.start} /> : <span className="zahl">00:00:00</span>}
      </div>
      <div className="uhrblock-wo">
        {buchung ? `${buchung.projekt_titel} · ${buchung.paket_titel}` : "Keine Buchung läuft"}
      </div>
      {buchung ? (
        <button type="button" className="uhrblock-knopf" onClick={fragen}>
          <Zeichen name="stopp" />
          Clock-out
        </button>
      ) : (
        <button
          type="button"
          className="uhrblock-knopf"
          onClick={waehlen}
          title="Die Uhr startet auf einem Arbeitspaket."
        >
          Paket wählen
        </button>
      )}
    </div>
  );
}
