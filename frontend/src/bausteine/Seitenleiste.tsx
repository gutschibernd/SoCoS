import { Fragment, useState } from "react";

import { csrfWert } from "../basis/api";
import { useLaufend, useNeuLaden, useProjekte, type Ich } from "../basis/daten";
import {
  MODULE,
  designAusWeg,
  foerderauslastungAusWeg,
  foerderungAusWeg,
  teilZuWeg,
  themaAusWeg,
} from "../basis/module";
import { alsPfad, type Ort, type Seite } from "../basis/router";
import { paketgruppen } from "../basis/start";
import { clockOut } from "../basis/uhr";
import { alsDauer } from "../basis/zeit";
import { hatEinstellungen } from "../ansichten/Einstellungen";
import { Notizdialog } from "./Notizdialog";
import { Uhr } from "./Uhr";
import { Zeichen, type ZeichenName } from "./Zeichen";

/**
 * Ein Menüeintrag. `unter` steht nur bei einem Modul: Es lebt unter
 * `/module/<weg>`, steht im Menü aber wie jede andere Seite.
 */
type Eintrag = { seite: Seite; unter?: string; titel: string; zeichen: ZeichenName };

/** Ein Modul als Eintrag — Titel und Zeichen aus MODULE, nicht ein zweites Mal hier. */
function modul(weg: string): Eintrag {
  const m = MODULE.find((x) => x.weg === weg);
  if (!m) throw new Error(`Kein Modul ${weg}`);
  return { seite: "module", unter: m.weg, titel: m.titel, zeichen: m.zeichen };
}

/**
 * Das Menü — **eine** Liste, aus der beide Größen leben.
 *
 * Seit 2026-10-19 nach dem, was man tun will, und nach dem, was wirklich
 * benutzt wird (Änderungsprotokoll der Live-Seite, 14 Tage): Aufgaben an 12
 * von 14 Tagen, Thoughts an 10, Kontakte an jedem Tag, an dem Florian
 * arbeitete; Zeit drei Buchungen, Finanzen ein Kontostand. Vorher lagen
 * Thoughts und Förderungen in einem zugeklappten Zweig „Module", während
 * Zeit und Dashboard oben standen. Das Dashboard ist in der Übersicht
 * aufgegangen.
 *
 * **„Module" gibt es im Menü nicht mehr.** Der Name sagte, wie etwas gebaut
 * ist, nicht wozu es da ist — und wer Thoughts suchte, musste wissen, dass es
 * ein Modul ist. Die Wege bleiben `/module/…`, damit Lesezeichen weiter gehen.
 *
 * „Übersicht" steht wieder als Eintrag da, obwohl das Signet auch dorthin
 * führt: Dass ein Logo ein Weg ist, weiß man — dass es der *einzige* Weg zur
 * wichtigsten Seite ist, sah man nicht.
 *
 * Ablage und Software klappen ein, bis der Zeiger darüber steht: Man braucht
 * sie selten, und die Leiste wird mit jeder Rubrik länger.
 */
const GRUPPEN: { titel: string | null; eintraege: Eintrag[]; klappt?: true }[] = [
  { titel: null, eintraege: [{ seite: "start", titel: "Übersicht", zeichen: "zuhause" }] },
  {
    titel: "Arbeit",
    eintraege: [
      { seite: "aufgaben", titel: "Aufgaben", zeichen: "aufgaben" },
      modul("thoughts"),
      { seite: "projekt", titel: "Projekt", zeichen: "projekt" },
      { seite: "zeit", titel: "Zeit", zeichen: "zeit" },
    ],
  },
  {
    titel: "Extern",
    eintraege: [
      { seite: "kontakte", titel: "Kontakte", zeichen: "kontakte" },
      { seite: "meetings", titel: "Meetings", zeichen: "meeting" },
      { seite: "events", titel: "Events", zeichen: "event" },
    ],
  },
  { titel: "Geld", eintraege: [modul("foerderungen"), modul("runway")] },
  { titel: "Ablage", klappt: true, eintraege: [modul("design"), modul("praktikum")] },
  {
    titel: "Software",
    klappt: true,
    eintraege: [
      { seite: "doku", titel: "Doku", zeichen: "buch" },
      { seite: "rueckmeldungen", titel: "Wünsche & Fehler", zeichen: "sprechblase" },
      { seite: "integrationen", titel: "Integrationen", zeichen: "stecker" },
    ],
  },
];

const ALLE: Eintrag[] = GRUPPEN.flatMap((g) => g.eintraege);

/** Das Modul, in dem man gerade steht — auch tief darin (ein Antrag, eine Phase). */
function modulAm(unter: string | null) {
  return (
    teilZuWeg(unter) ??
    themaAusWeg(unter) ??
    designAusWeg(unter) ??
    foerderungAusWeg(unter) ??
    foerderauslastungAusWeg(unter)
  )?.modul;
}

/** Ob dieser Eintrag der Ort ist, an dem man steht. */
export function istHier(eintrag: Eintrag, ort: Ort): boolean {
  if (eintrag.seite !== ort.seite) return false;
  return eintrag.seite !== "module" || modulAm(ort.unter)?.weg === eintrag.unter;
}

/**
 * Die vier Abkürzungen in der Fußleiste am Handy — der fünfte Platz ist
 * „Mehr" und öffnet die Leiste als Schublade.
 *
 * Herausgesucht aus GRUPPEN, nicht ein zweites Mal beschrieben: Sonst hätte
 * ein umbenannter Eintrag am Handy noch den alten Namen.
 *
 * Die Auswahl ist die der Nutzung: Aufgaben und Kontakte brauchen beide, die
 * Thoughts Bernd fast täglich. Zeit stand hier, solange sie als der häufigste
 * Griff galt — gebucht wurde dreimal in zwei Wochen.
 */
const FUSS: { seite: Seite; unter?: string }[] = [
  { seite: "start" },
  { seite: "aufgaben" },
  { seite: "kontakte" },
  { seite: "module", unter: "thoughts" },
];

export function Seitenleiste({
  ich,
  ort,
  wechseln,
}: {
  ich: Ich;
  ort: Ort;
  wechseln: (s: Seite, unter?: string | null) => void;
}) {
  const seite = ort.seite;
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

  /* Jeder Weg schließt die Schublade. Sonst steht sie nach dem Wechsel offen
     über der Seite, auf die sie gerade geführt hat. */
  function hin(s: Seite, unter: string | null = null) {
    setOffen(false);
    wechseln(s, unter);
  }

  /* Die Uhr steht nur da, solange sie läuft. Vorher stand sie immer — mit
     „Paket wählen" und „Ohne Paket" —, und am Handy nahm sie jeder Seite eine
     Zeile über der Fußleiste. Gebucht wurde in zwei Wochen dreimal. Wer eine
     Buchung startet, tut das auf der Übersicht, der Zeit- oder der
     Projektseite; was dann läuft, steht hier. */
  const uhr = buchung && <Uhrblock buchung={buchung} fragen={() => setFragtNotiz(true)} />;

  const link = (eintrag: Eintrag) => {
    const weg = alsPfad(eintrag.seite, eintrag.unter ?? null);
    return (
      <a
        key={weg}
        href={weg}
        aria-current={istHier(eintrag, ort) ? "page" : undefined}
        onClick={(e) => {
          e.preventDefault();
          hin(eintrag.seite, eintrag.unter ?? null);
        }}
      >
        <Zeichen name={eintrag.zeichen} />
        {eintrag.titel}
      </a>
    );
  };

  return (
    <>
      <aside className="leiste" data-offen={offen ? "ja" : "nein"}>
        {/*
          Das Signet führt zur Übersicht — wie der Eintrag darunter. Zweimal
          derselbe Weg, mit Absicht: Das Signet klickt jeder zuerst an, den
          Eintrag findet, wer nicht weiß, dass ein Logo ein Weg ist.

          Das Signet ist dieselbe Datei wie das Favicon. Nachgezeichnet wäre es
          beim ersten Nachbessern falsch.
        */}
        <a
          className="leiste-marke"
          href="/start"
          title="Zur Übersicht"
          onClick={(e) => {
            e.preventDefault();
            hin("start");
          }}
        >
          <img src="/static/favicon.svg" alt="" width="20" height="20" />
          <b>SoCoS</b>
        </a>

        <nav className="navigation">
          {GRUPPEN.map((gruppe, i) => {
            const eintraege = gruppe.eintraege.map(link);
            if (gruppe.klappt) {
              /* Offen, wenn man auf einer ihrer Seiten steht — sonst wäre die
                 Markierung dessen, wo man ist, unsichtbar. Alles andere macht
                 das CSS (Zeiger, Tastaturfokus; am Handy gibt es kein Darüber
                 und damit auch kein Einklappen). */
              const drin = gruppe.eintraege.some((e) => istHier(e, ort));
              return (
                <div
                  key={gruppe.titel ?? `gruppe-${i}`}
                  className="navigation-klappgruppe"
                  data-offen={drin ? "ja" : "nein"}
                >
                  <div className="navigation-gruppe">
                    {gruppe.titel}
                    <Zeichen name="zeiger" klasse="navigation-klapp" />
                  </div>
                  <div className="navigation-klappinhalt">
                    <div>{eintraege}</div>
                  </div>
                </div>
              );
            }
            return (
              <Fragment key={gruppe.titel ?? `gruppe-${i}`}>
                {gruppe.titel && <div className="navigation-gruppe">{gruppe.titel}</div>}
                {eintraege}
              </Fragment>
            );
          })}
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

      {/* Am Handy: die laufende Uhr über der Fußleiste, wo der Daumen liegt.
          Sie scrollt nie weg. Derselbe Baustein wie in der Leiste — nicht
          dasselbe Markup ein zweites Mal, sondern dieselbe Funktion an zwei
          Plätzen. Läuft nichts, ist der Platz frei. */}
      {uhr && <div className="uhr-handy">{uhr}</div>}

      <nav className="fussleiste">
        {FUSS.map((ziel) => {
          const eintrag = ALLE.find((e) => e.seite === ziel.seite && e.unter === ziel.unter);
          return eintrag && link(eintrag);
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
}: {
  buchung: { start: string; paket_titel: string; projekt_titel: string };
  fragen: () => void;
}) {
  return (
    <div className="uhrblock" data-laeuft="ja">
      <div className="uhrblock-zeit">
        <i className="punkt" />
        <Uhr seit={buchung.start} />
      </div>
      <div className="uhrblock-wo">{`${buchung.projekt_titel} · ${buchung.paket_titel}`}</div>
      <button type="button" className="uhrblock-knopf" onClick={fragen}>
        <Zeichen name="stopp" />
        Clock-out
      </button>
    </div>
  );
}
