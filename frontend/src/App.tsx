import { useIch } from "./basis/daten";
import { fuehrtZurAnmeldung, zurAnmeldung } from "./basis/anmeldung";
import { useSeite, type Seite } from "./basis/router";
import { Zustand } from "./basis/Zustand";
import { Kopf } from "./bausteine/Kopf";
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

export function App() {
  const ich = useIch();
  const [seite, wechseln] = useSeite();

  // Wer nicht angemeldet ist, gehört zur Anmeldung — nicht auf eine
  // Fehlerseite, von der aus es keinen Weg weitergibt.
  if (fuehrtZurAnmeldung(ich.error)) {
    zurAnmeldung();
    return null;
  }

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!ich.data) return <Zustand abfrage={ich} erneut={() => ich.refetch()} />;

  return (
    <>
      <Kopf ich={ich.data} seite={seite} wechseln={wechseln} />
      <main className="seite">
        <div className="titelzeile">
          <h1>{TITEL[seite].titel}</h1>
          <div className="unter">{TITEL[seite].unter}</div>
        </div>

        {seite === "dashboard" && <Dashboard ich={ich.data} wechseln={wechseln} />}
        {seite === "projekt" && <Projekt ich={ich.data} />}
        {seite === "zeit" && <Zeit ich={ich.data} />}
        {seite === "kontakte" && <Kontakte ich={ich.data} />}
        {seite === "profil" && <Profil ich={ich.data} />}
      </main>
    </>
  );
}
