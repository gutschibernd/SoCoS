import { useState } from "react";

import { hole } from "../basis/api";
import { useLaufend, useNeuLaden, type Ich } from "../basis/daten";
import type { Seite } from "../basis/router";
import { alsDauer } from "../basis/zeit";
import { Notizdialog } from "./Notizdialog";
import { Uhr } from "./Uhr";

const MENUE: { seite: Seite; titel: string }[] = [
  { seite: "dashboard", titel: "Dashboard" },
  { seite: "projekt", titel: "Projekt" },
  { seite: "zeit", titel: "Zeit" },
  { seite: "kontakte", titel: "Kontakte" },
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
  const buchung = laufend.data?.laufend ?? null;

  async function clockOut(notiz: string) {
    await hole("/zeiten/clock_out/", { method: "POST", body: JSON.stringify({ notiz }) });
    setFragtNotiz(false);
    neuLaden();
  }

  return (
    <header className="kopf">
      <div className="kopf-innen">
        <button type="button" className="marke" onClick={() => wechseln("dashboard")}>
          <b>Sopharmis</b>
          <span>SoCoS</span>
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
        </div>
      </div>

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
