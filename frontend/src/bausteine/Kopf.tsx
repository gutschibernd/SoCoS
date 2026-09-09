import { useState } from "react";

import { csrfWert, hole } from "../basis/api";
import { useLaufend, useNeuLaden, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { alsDauer } from "../basis/zeit";
import { Notizdialog } from "./Notizdialog";
import { Sicherungsdialog, Zahnrad } from "./Sicherung";
import { Uhr } from "./Uhr";
import { Zeichen, type ZeichenName } from "./Zeichen";

const MENUE: { seite: Seite; titel: string; zeichen: ZeichenName }[] = [
  { seite: "dashboard", titel: "Dashboard", zeichen: "dashboard" },
  { seite: "projekt", titel: "Projekt", zeichen: "projekt" },
  { seite: "zeit", titel: "Zeit", zeichen: "zeit" },
  { seite: "kontakte", titel: "Kontakte", zeichen: "kontakte" },
  { seite: "events", titel: "Events", zeichen: "event" },
];

export function Kopf({
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
  const [zeigtSicherung, setZeigtSicherung] = useState(false);
  const buchung = laufend.data?.laufend ?? null;

  async function clockOut(notiz: string) {
    await hole("/zeiten/clock_out/", { method: "POST", body: JSON.stringify({ notiz }) });
    setFragtNotiz(false);
    neuLaden();
  }

  return (
    <header className="kopf">
      <div className="kopf-innen">
        {/*
          Signet und Name, sonst nichts. Der Zusatz darunter stand hier nur,
          weil auf der Anmeldeseite Platz dafür ist — in der Kopfleiste hat er
          rund achtzig Pixel gekostet und die Zeile bei 1280 px gesprengt.
          Groß und zweifarbig steht die Wortmarke weiterhin beim Anmelden.

          Das Signet ist dieselbe Datei wie das Favicon. Nachgezeichnet wäre
          es beim ersten Nachbessern falsch.

          Der Weg zur Startseite führt nur hierüber: Sie hat keinen eigenen
          Eintrag im Menü, weil sie nichts zeigt, was die fünf Seiten nicht
          auch zeigen — sie ist die kurze Abzweigung dorthin.
        */}
        <button
          type="button"
          className="marke"
          onClick={() => wechseln("start")}
          title="Zur Startseite"
        >
          <img src="/static/favicon.svg" alt="" width="22" height="22" />
          <b>SoCoS</b>
        </button>

        <nav className="navigation">
          {MENUE.map((eintrag) => (
            <a
              key={eintrag.seite}
              href={`/${eintrag.seite}`}
              aria-current={seite === eintrag.seite ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                wechseln(eintrag.seite);
              }}
            >
              <Zeichen name={eintrag.zeichen} />
              {eintrag.titel}
            </a>
          ))}
        </nav>

        <div className="kopf-rechts">
          <div className="uhr-chip" data-laeuft={buchung ? "ja" : "nein"}>
            <i className="punkt" />
            {buchung ? (
              <>
                <Uhr seit={buchung.start} />
                <span className="wo">{buchung.paket_titel}</span>
                <button type="button" className="uhr-knopf" onClick={() => setFragtNotiz(true)}>
                  <Zeichen name="stopp" />
                  Clock-out
                </button>
              </>
            ) : (
              <>
                <span className="zahl">00:00:00</span>
                <span className="wo">keine Buchung läuft</span>
                <button
                  type="button"
                  className="uhr-knopf"
                  onClick={() => wechseln("projekt")}
                  title="Die Uhr startet auf einem Arbeitspaket."
                >
                  Paket wählen
                </button>
              </>
            )}
          </div>

          <button type="button" className="profil" onClick={() => wechseln("profil")}>
            <i style={{ background: ich.farbe }}>{ich.initialen}</i>
            <span>{ich.name}</span>
          </button>

          {/* Ganz außen und klein: Sichern und Wiederherstellen ist nichts,
              was im Tagesbetrieb gebraucht wird. Ob es tatsächlich geht,
              entscheidet der Server bei jedem der beiden Aufrufe neu. */}
          {ich.darf.sichern && <Zahnrad oeffnen={() => setZeigtSicherung(true)} />}

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
            <button type="submit" className="kopf-knopf" title="Abmelden" aria-label="Abmelden">
              <Zeichen name="abmelden" />
            </button>
          </form>
        </div>
      </div>

      {zeigtSicherung && <Sicherungsdialog schliessen={() => setZeigtSicherung(false)} />}

      {fragtNotiz && buchung && (
        <Notizdialog
          wo={`${buchung.projekt_titel} · ${buchung.paket_titel}`}
          dauer={alsDauer(Math.floor((Date.now() - new Date(buchung.start).getTime()) / 1000))}
          speichern={clockOut}
          abbrechen={() => setFragtNotiz(false)}
        />
      )}
    </header>
  );
}
