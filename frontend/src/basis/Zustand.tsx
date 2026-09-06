/**
 * Der **eine** Helfer, der entscheidet, was statt der Seite dasteht, solange
 * die Daten fehlen.
 *
 * Gerufen wird er hinter der Prüfung auf die Daten selbst (`if (!x.data)`),
 * nicht hinter `isLoading` oder `isError`: Zwischen zwei Versuchen ist eine
 * Abfrage weder das eine noch das andere, und `data` ist trotzdem leer.
 *
 * Die Falle dahinter: React Query hält einen zweiten Versuch an, solange das
 * Fenster verdeckt ist (`focusManager.isFocused()`) — am Handy also jedesmal,
 * wenn jemand kurz die App wechselt. Der Zustand ist dann `pending`/`paused`,
 * `error` bleibt `null`. Eine Seite, die das als „wird geladen …" zeichnet,
 * lädt nie fertig. Deshalb wird `fetchStatus === "paused"` hier ausdrücklich
 * als eigener Fall behandelt.
 */

export type Abfragezustand = {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  error: unknown;
};

export type Anzeigefall = "laedt" | "keine_verbindung" | "gescheitert" | "leer";

export function anzeigefall(abfrage: Abfragezustand): Anzeigefall {
  // Zuerst: keine Verbindung. Sonst verschwindet dieser Fall hinter "laedt"
  // und die Seite lädt für immer.
  if (abfrage.fetchStatus === "paused") return "keine_verbindung";
  if (abfrage.status === "error") return "gescheitert";
  if (abfrage.status === "pending") return "laedt";
  return "leer";
}

const TEXTE: Record<Anzeigefall, { titel: string; satz: string }> = {
  laedt: { titel: "Wird geladen …", satz: "" },
  keine_verbindung: {
    titel: "Keine Verbindung",
    satz: "Sobald das Netz wieder da ist, wird von selbst neu geladen.",
  },
  gescheitert: {
    titel: "Das hat nicht geklappt",
    satz: "Die Daten konnten nicht geladen werden.",
  },
  leer: { titel: "", satz: "" },
};

export function Zustand({
  abfrage,
  erneut,
}: {
  abfrage: Abfragezustand;
  erneut?: () => void;
}) {
  const fall = anzeigefall(abfrage);
  const { titel, satz } = TEXTE[fall];

  return (
    <div className="zustand" role="status" aria-live="polite">
      <div className="zustand-titel">{titel}</div>
      {satz && <p className="zustand-satz">{satz}</p>}
      {fall === "gescheitert" && erneut && (
        <button type="button" onClick={erneut}>
          Noch einmal versuchen
        </button>
      )}
    </div>
  );
}
