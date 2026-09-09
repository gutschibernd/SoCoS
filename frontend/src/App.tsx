import { useIch } from "./basis/daten";
import { fuehrtZurAnmeldung, zurAnmeldung } from "./basis/anmeldung";
import { useSeite, type Seite } from "./basis/router";
import { Zustand } from "./basis/Zustand";
import { Kopf } from "./bausteine/Kopf";
import { Meldungen } from "./bausteine/Meldungen";
import { Dashboard } from "./ansichten/Dashboard";
import { Kontakte } from "./ansichten/Kontakte";
import { Profil } from "./ansichten/Profil";
import { Projekt } from "./ansichten/Projekt";
import { Zeit } from "./ansichten/Zeit";

const TITEL: Record<Seite, { titel: string; unter: string }> = {
  dashboard: { titel: "Dashboard", unter: "Woche, Geld, Fortschritt" },
  projekt: { titel: "Projekt", unter: "Bereiche, Arbeitspakete, Stufen" },
  zeit: { titel: "Zeit", unter: "Buchungen und Nachträge" },
  kontakte: { titel: "Kontakte", unter: "Organisationen und Personen" },
  profil: { titel: "Profil", unter: "Deine Stammdaten" },
};

/* Die einzige Unterseite bekommt ihre eigene Zeile, statt sie aus dem Namen
   zusammenzusetzen — bei einer Ausnahme ist die Ausnahme kürzer als die Regel. */
const PROJEKT_BEARBEITEN = { titel: "Projekt bearbeiten", unter: "Gliedern, umordnen, entfernen" };

export function App() {
  const ich = useIch();
  const [ort, wechseln] = useSeite();

  // Wer nicht angemeldet ist, gehört zur Anmeldung — nicht auf eine
  // Fehlerseite, von der aus es keinen Weg weitergibt.
  if (fuehrtZurAnmeldung(ich.error)) {
    zurAnmeldung();
    return null;
  }

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!ich.data) return <Zustand abfrage={ich} erneut={() => ich.refetch()} />;

  const bearbeiten = ort.seite === "projekt" && ort.unter === "bearbeiten";
  const kopfzeile = bearbeiten ? PROJEKT_BEARBEITEN : TITEL[ort.seite];

  return (
    <>
      <Kopf ich={ich.data} seite={ort.seite} wechseln={wechseln} />
      <Meldungen />
      <main className="seite">
        <div className="titelzeile">
          <h1>{kopfzeile.titel}</h1>
          <div className="unter">{kopfzeile.unter}</div>
        </div>

        {ort.seite === "dashboard" && <Dashboard ich={ich.data} wechseln={wechseln} />}
        {ort.seite === "projekt" && (
          <Projekt ich={ich.data} bearbeiten={bearbeiten} wechseln={wechseln} />
        )}
        {ort.seite === "zeit" && <Zeit ich={ich.data} />}
        {ort.seite === "kontakte" && (
          <Kontakte ich={ich.data} unter={ort.unter} wechseln={wechseln} />
        )}
        {ort.seite === "profil" && <Profil ich={ich.data} />}
      </main>
    </>
  );
}
