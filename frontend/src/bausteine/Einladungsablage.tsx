import { useState } from "react";

import { eventAusIcs, istIcsdatei, type IcsEvent } from "../basis/ics";
import { Fehlerzeile } from "./Fehlerzeile";
import { Zeichen } from "./Zeichen";

/**
 * Eine Kalendereinladung hineinziehen, und das Formular steht ausgefüllt da.
 *
 * Über „Neues Event" und „Neues Meeting". Was davon in welches Feld geht,
 * entscheidet das Formular in `uebernehmen` — die Ablage liest nur.
 *
 * Eine Fläche, die zugleich der Knopf zum Wählen ist: Am Handy gibt es kein
 * Ziehen, dort bleibt das Antippen. Die Datei wird nur gelesen, nicht
 * hochgeladen (siehe basis/ics.ts) — was übernommen wurde, steht in den
 * Feldern und wird dort geprüft, bevor der Knopf darunter etwas anlegt.
 */
export function Einladungsablage({ uebernehmen }: { uebernehmen: (ics: IcsEvent) => void }) {
  const [darueber, setDarueber] = useState(false);
  const [quelle, setQuelle] = useState("");
  const [fehler, setFehler] = useState("");

  async function lesen(liste: FileList | null) {
    const datei = liste?.[0];
    if (!datei) return;
    if (!istIcsdatei(datei)) return setFehler(`„${datei.name}“ ist keine Kalendereinladung (.ics).`);
    const ics = eventAusIcs(await datei.text());
    if (!ics) return setFehler(`In „${datei.name}“ steht kein Termin.`);
    setFehler("");
    setQuelle(datei.name);
    uebernehmen(ics);
  }

  return (
    <div className="einladungsablage-block">
      <label
        className={darueber ? "einladungsablage einladungsablage-darueber" : "einladungsablage"}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDarueber(true);
        }}
        onDragLeave={() => setDarueber(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDarueber(false);
          lesen(e.dataTransfer.files);
        }}
      >
        <Zeichen name="event" />
        <span>
          {quelle ? (
            <>
              Aus <strong>{quelle}</strong> übernommen — andere Einladung ziehen oder wählen
            </>
          ) : (
            "Einladung (.ics) hierher ziehen oder wählen"
          )}
        </span>
        <input
          type="file"
          accept=".ics,text/calendar"
          onChange={(e) => {
            lesen(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <Fehlerzeile text={fehler} />
    </div>
  );
}
