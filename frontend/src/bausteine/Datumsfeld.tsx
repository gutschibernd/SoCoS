import { istGanzesDatum } from "../basis/gantt";

/**
 * Ein Datum, das beim Verlassen speichert — nicht bei jeder Änderung: Chrome
 * meldet das Feld schon nach der ersten Ziffer der Jahreszahl als gültig.
 *
 * Leeren heißt `null`. Ein halbes Datum wird nicht gespeichert; das Feld
 * springt dann auf den gespeicherten Wert zurück, statt etwas anderes zu
 * behaupten.
 */
export function Datumsfeld({
  wert,
  speichern,
  beschriftung,
  darf,
}: {
  wert: string | null;
  speichern: (neu: string | null) => void | Promise<void>;
  beschriftung: string;
  darf: boolean;
}) {
  return (
    <input
      // Der Schlüssel setzt das Feld zurück, sobald ein neuer Wert vom Server
      // kommt — etwa nach dem Ziehen im Gantt.
      key={wert ?? ""}
      type="date"
      className="feld"
      aria-label={beschriftung}
      defaultValue={wert ?? ""}
      disabled={!darf}
      onBlur={(e) => {
        const neu = e.target.value;
        if (neu === (wert ?? "")) return;
        if (neu === "") return void speichern(null);
        if (istGanzesDatum(neu)) return void speichern(neu);
        e.target.value = wert ?? "";
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
