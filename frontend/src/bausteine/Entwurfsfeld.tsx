import { standText, useEntwurf } from "../basis/entwurf";
import { Zeichen } from "./Zeichen";

/**
 * Ein Feld, das sich beim Tippen selbst speichert, mit seinem Stand darunter.
 *
 * Der Stand steht immer da, auch wenn alles gespeichert ist: Wer mitschreibt,
 * soll nicht raten müssen, ob er raten muss.
 */
export function Entwurfsfeld({
  wert,
  speichern,
  platzhalter,
  zeilen,
  aendern,
  klasse,
  hoechstens,
}: {
  wert: string;
  speichern: (text: string) => Promise<unknown>;
  platzhalter: string;
  zeilen: number;
  aendern: boolean;
  klasse?: string;
  /** Zählt mit, wenn ein Formular draußen nur so viele Zeichen nimmt. Ein
      Zeichen mehr wird nicht verhindert, nur gesagt. */
  hoechstens?: number;
}) {
  // Der Haken muss über der Verzweigung stehen: Ein Leser sieht kein Feld,
  // aber Haken werden bei jedem Zeichnen in derselben Reihenfolge gerufen.
  const entwurf = useEntwurf(wert, speichern);

  if (!aendern)
    return <p className={`vorgelesen ${klasse ?? ""}`}>{wert || "Noch nichts eingetragen."}</p>;

  return (
    <>
      <textarea
        className={`feld entwurfsfeld ${klasse ?? ""}`}
        rows={zeilen}
        value={entwurf.text}
        placeholder={platzhalter}
        onChange={(e) => entwurf.setzen(e.target.value)}
        /* Wer wegklickt, hat aufgehört zu tippen — dann muss niemand auf die
           Pause warten. */
        onBlur={entwurf.jetztSichern}
      />
      <div className="entwurfsstand" data-stand={entwurf.stand}>
        {entwurf.stand === "fehler" && <Zeichen name="achtung" />}
        {standText(entwurf.stand, entwurf.zuletzt)}
        {hoechstens !== undefined && (
          <span className="zeichenzahl" data-ueber={entwurf.text.trim().length > hoechstens || undefined}>
            {entwurf.text.trim().length} / {hoechstens}
          </span>
        )}
      </div>
    </>
  );
}
