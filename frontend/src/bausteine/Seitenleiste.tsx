import { Fragment, useState } from "react";

import { csrfWert } from "../basis/api";
import { useLaufend, useNeuLaden, useProjekte, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { paketgruppen } from "../basis/start";
import { clockIn, clockOut } from "../basis/uhr";
import { alsDauer } from "../basis/zeit";
import { hatEinstellungen } from "../ansichten/Einstellungen";
import { Notizdialog } from "./Notizdialog";
import { Uhr } from "./Uhr";
import { Zeichen, type ZeichenName } from "./Zeichen";

type Eintrag = { seite: Seite; titel: string; zeichen: ZeichenName };

/**
 * Das Menü — **eine** Liste, aus der beide Größen leben.
 *
 * **Start steht nicht darin: Dorthin führt das Logo.** Sie hatte eine Weile
 * einen eigenen Eintrag ganz oben, und er kostete eine Zeile in einer Leiste,
 * die mit jeder Rubrik länger wird. Ein Signet, das auf die Startseite führt,
 * ist außerdem das, was jeder ohnehin zuerst anklickt.
 *
 * Am Handy bleibt „Start" in der Fußleiste stehen (siehe FUSS): Dort ist das
 * Logo erst zu sehen, wenn die Schublade offen ist — der Weg dahin wäre sonst
 * zwei Griffe statt einem.
 *
 * „Intern" und „Extern" statt „Arbeit" und „Leute": Die erste Einteilung
 * trennte nicht sauber — Zeit ist auch Leute, Events sind auch Arbeit. Intern
 * ist, was wir selbst tun; extern, mit wem wir reden.
 */
const GRUPPEN: { titel: string | null; eintraege: Eintrag[] }[] = [
  {
    titel: "Intern",
    eintraege: [
      { seite: "dashboard", titel: "Dashboard", zeichen: "dashboard" },
      { seite: "projekt", titel: "Projekt", zeichen: "projekt" },
      { seite: "zeit", titel: "Zeit", zeichen: "zeit" },
      { seite: "aufgaben", titel: "Aufgaben", zeichen: "aufgaben" },
    ],
  },
  {
    titel: "Extern",
    eintraege: [
      { seite: "kontakte", titel: "Kontakte", zeichen: "kontakte" },
      { seite: "events", titel: "Events", zeichen: "event" },
      { seite: "meetings", titel: "Meetings", zeichen: "meeting" },
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

/* Start steht in keiner Gruppe (siehe oben), wird am Handy aber gebraucht —
   die Fußleiste sucht ihre Einträge aus dieser Liste heraus. */
const START: Eintrag = { seite: "start", titel: "Start", zeichen: "zuhause" };

const ALLE: Eintrag[] = [START, ...GRUPPEN.flatMap((g) => g.eintraege)];

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
  const projekte = useProjekte();
  const neuLaden = useNeuLaden();
  const [fragtNotiz, setFragtNotiz] = useState(false);
  const [offen, setOffen] = useState(false);
  const buchung = laufend.data?.laufend ?? null;

  async function beenden(notiz: string, paket: number) {
    await clockOut(notiz, paket !== buchung?.paket ? paket : undefined);
    setFragtNotiz(false);
    neuLaden();
  }

  async function ohnePaket() {
    await clockIn();
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
      ohnePaket={ich.darf.bearbeiten ? ohnePaket : null}
    />
  );

  return (
    <>
      <aside className="leiste" data-offen={offen ? "ja" : "nein"}>
        {/*
          Das Signet ist der Weg zur Startseite — deshalb ein Anker und kein
          div. Sie hatte daneben eine Weile einen eigenen Menüeintrag; der war
          derselbe Weg zweimal und kostete eine Zeile in einer Leiste, die mit
          jeder Rubrik länger wird.

          Das Signet ist dieselbe Datei wie das Favicon. Nachgezeichnet wäre es
          beim ersten Nachbessern falsch.
        */}
        <a
          className="leiste-marke"
          href="/start"
          aria-current={seite === "start" ? "page" : undefined}
          title="Zur Startseite"
          onClick={(e) => {
            e.preventDefault();
            hin("start");
          }}
        >
          <img src="/static/favicon.svg" alt="" width="20" height="20" />
          <b>SoCoS</b>
        </a>

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
          paket={buchung.paket}
          gruppen={paketgruppen(projekte.data ?? [], [buchung.paket])}
          speichern={beenden}
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
  ohnePaket,
}: {
  buchung: { start: string; paket_titel: string; projekt_titel: string } | null;
  fragen: () => void;
  waehlen: () => void;
  /** `null` für einen Leser: Er darf nicht buchen, und ein Knopf, der still
      eine 403 kassiert, ist schlimmer als keiner. */
  ohnePaket: (() => void) | null;
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
        /* Zwei Wege, weil der Alltag zwei kennt: Wer weiß, woran er arbeitet,
           wählt das Paket. Wer nur anfangen will, drückt „Ohne Paket" — die
           Zeit läuft auf Overhead und wird beim Clock-out umgebucht. */
        <div className="uhrblock-knoepfe">
          <button
            type="button"
            className="uhrblock-knopf"
            onClick={waehlen}
            title="Die Uhr startet auf einem Arbeitspaket."
          >
            Paket wählen
          </button>
          {ohnePaket && (
            <button
              type="button"
              className="uhrblock-knopf"
              onClick={ohnePaket}
              title="Die Uhr läuft auf „Overhead“. Beim Clock-out kannst du sie umbuchen."
            >
              Ohne Paket
            </button>
          )}
        </div>
      )}
    </div>
  );
}
