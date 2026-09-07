import { useQuery } from "@tanstack/react-query";

import { hole } from "./basis/api";
import { fuehrtZurAnmeldung, zurAnmeldung } from "./basis/anmeldung";
import { Zustand } from "./basis/Zustand";

type Ich = {
  name: string;
  initialen: string;
  rolle: string | null;
  darf: Record<string, boolean>;
};

export function App() {
  const ich = useQuery({ queryKey: ["ich"], queryFn: () => hole<Ich>("/ich/") });

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
    <main>
      <h1>SoCoS</h1>
      <p>
        Angemeldet als {ich.data.name} ({ich.data.rolle}).{" "}
        <a href="/abmelden/">Abmelden</a>
      </p>
    </main>
  );
}
