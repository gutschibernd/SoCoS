import { useQuery } from "@tanstack/react-query";

import { hole } from "./basis/api";
import { Zustand } from "./basis/Zustand";

type Ich = {
  name: string;
  initialen: string;
  rolle: string | null;
  darf: Record<string, boolean>;
};

export function App() {
  const ich = useQuery({ queryKey: ["ich"], queryFn: () => hole<Ich>("/ich/") });

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!ich.data) return <Zustand abfrage={ich} erneut={() => ich.refetch()} />;

  return (
    <main>
      <h1>SoCoS</h1>
      <p>
        Angemeldet als {ich.data.name} ({ich.data.rolle}).
      </p>
    </main>
  );
}
