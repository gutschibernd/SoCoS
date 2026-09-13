/**
 * Was sich geändert hat — einmal nach der Anmeldung, dann nie wieder.
 *
 * **Warum ein Fenster und kein Banner:** Ein Banner über der Seite wird
 * weggeklickt, ohne gelesen zu werden, und steht beim nächsten Mal wieder da.
 * Dieses Fenster kommt genau einmal je Änderung und ist danach erledigt — das
 * ist der Preis dafür, dass es überhaupt im Weg stehen darf.
 *
 * **Warum Seiten und kein Fließtext:** Drei Punkte als Absätze hintereinander
 * liest niemand zu Ende. Eine Sache je Seite, ein Knopf weiter, und der
 * Fortschritt ist sichtbar.
 *
 * Was hier steht, kommt aus `socos/aenderungen.py` (über `/api/ich/`). Es gibt
 * keine zweite Liste im Frontend — sonst zeigte das Fenster etwas anderes als
 * die Doku.
 */

import { useState } from "react";

import { hole } from "../basis/api";
import { useNeuLaden, type Neuigkeit } from "../basis/daten";
import { ausPfad, type Seite } from "../basis/router";
import { Zeichen } from "./Zeichen";

export function Neuigkeiten({
  punkte,
  wechseln,
}: {
  punkte: Neuigkeit[];
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const neuLaden = useNeuLaden();
  const [seite, setSeite] = useState(0);
  const [laeuft, setLaeuft] = useState(false);

  const punkt = punkte[seite];
  const letzte = seite === punkte.length - 1;

  /**
   * „Gesehen" gilt für **alles**, auch für die Seiten, die jemand überblättert
   * hat. Sonst stünde beim nächsten Anmelden dasselbe Fenster wieder da, und
   * die Zusage „einmal und nie wieder" wäre keine. Was jemand überspringt,
   * findet er in der Doku unter „Änderungen".
   */
  async function schliessen(dann?: () => void) {
    setLaeuft(true);
    try {
      await hole("/neuigkeiten/gesehen/", { method: "POST" });
      neuLaden();
      dann?.();
    } finally {
      setLaeuft(false);
    }
  }

  function hinschauen() {
    if (!punkt?.wo) return;
    const ort = ausPfad(`/${punkt.wo}`);
    schliessen(() => wechseln(ort.seite, ort.unter));
  }

  if (!punkt) return null;

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-label="Was ist neu">
      <div className="dialog neuigkeiten">
        <div className="neuigkeiten-kopf">
          <i className="doku-siegel">
            <Zeichen name="fahne" />
          </i>
          <div>
            <span className="beschriftung-klein">Neu in SoCoS</span>
            <span className="zahl neuigkeiten-version">{punkt.version}</span>
          </div>
        </div>

        <h2>{punkt.titel}</h2>
        <p>{punkt.text}</p>

        {/* Die Punkte zeigen, wie viel noch kommt. Ein Zähler „2 von 3" sagt
            dasselbe, aber die Punkte sagen es, ohne gelesen zu werden. */}
        <div className="neuigkeiten-punkte" aria-hidden="true">
          {punkte.map((_, i) => (
            <i key={i} data-hier={i === seite ? "ja" : "nein"} />
          ))}
        </div>

        <div className="dialog-knoepfe">
          <button
            type="button"
            className="knopf-still"
            onClick={() => schliessen()}
            disabled={laeuft}
          >
            {letzte ? "Schließen" : "Später lesen"}
          </button>

          {punkt.wo && (
            <button type="button" className="knopf-still" onClick={hinschauen} disabled={laeuft}>
              Ansehen
            </button>
          )}

          {letzte ? (
            <button
              type="button"
              className="knopf"
              onClick={() => schliessen()}
              disabled={laeuft}
            >
              Verstanden
            </button>
          ) : (
            <button type="button" className="knopf" onClick={() => setSeite((s) => s + 1)}>
              Weiter
              <Zeichen name="zeiger" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
