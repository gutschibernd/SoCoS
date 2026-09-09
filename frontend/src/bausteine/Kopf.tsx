import { useState } from "react";

import { hole } from "../basis/api";
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
          Die Wortmarke klein: einfarbig, Figtree über einer Mono-Zeile — die
          Bauweise des Sopharmis-Logos, nicht dessen Schrift. Zweifarbig (die
          o im Kupfer) steht sie nur groß auf der Anmeldeseite; bei 16 px
          sähe man den Unterschied ohnehin nicht.

          Das Signet ist dieselbe Datei wie das Favicon. Nachgezeichnet wäre
          es beim ersten Nachbessern falsch.
        */}
        <button type="button" className="marke" onClick={() => wechseln("dashboard")}>
          <img src="/static/favicon.svg" alt="" width="22" height="22" />
          <b>SoCoS</b>
          <span>Sopharmis</span>
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
