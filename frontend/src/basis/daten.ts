/**
 * Die Abrufe. Ein Ort, damit Schlüssel und Pfade nicht an fünf Stellen
 * auseinanderlaufen.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { hole } from "./api";

export type Ich = {
  id: number;
  name: string;
  email: string;
  initialen: string;
  farbe: string;
  funktion: string;
  rolle: "admin" | "bearbeiter" | "leser" | null;
  darf: {
    bearbeiten: boolean;
    loeschen: boolean;
    finanzen_eintragen: boolean;
    nutzer_verwalten: boolean;
  };
};

export type Stufe = { name: string; monate: number };
export type Unteraufgabe = { id: number; paket: number; titel: string; erledigt: boolean };
export type Paket = {
  id: number;
  bereich: number;
  projekt: number;
  titel: string;
  notiz: string;
  status: string;
  stufenstand: number;
  stufen: Stufe[];
  fortschritt: number;
  unteraufgaben: Unteraufgabe[];
};
export type Bereich = {
  id: number;
  projekt: number;
  titel: string;
  art: "dev" | "fin" | "ziel";
  stufen: Stufe[];
  pakete: Paket[];
};
export type Projekt = {
  id: number;
  titel: string;
  untertitel: string;
  farbe: string;
  bereiche: Bereich[];
  gebuchte_sekunden: number;
};

export type Buchung = {
  id: number;
  person: number;
  person_name: string;
  paket: number;
  paket_titel: string;
  projekt: number;
  projekt_titel: string;
  start: string;
  ende: string | null;
  notiz: string;
  ist_entwurf: boolean;
  sekunden: number;
  laeuft: boolean;
};

export type Dashboard = {
  zeitraum: { von: string; bis: string };
  finanzen: {
    kontostand: string | null;
    kontostand_stand: string | null;
    fixkosten: string | null;
    erwartete_monatskosten: string | null;
    prognose_grundlage: string;
    runway_monate: string | null;
  };
  kontostand_verlauf: { id: number; datum: string; betrag: string }[];
  team: {
    id: number;
    name: string;
    initialen: string;
    farbe: string;
    sekunden: number;
    laeuft_auf: string | null;
    laeuft_seit: string | null;
  }[];
  team_sekunden: number;
  projekte: { id: number; titel: string; untertitel: string; farbe: string; sekunden: number }[];
  offene_entwuerfe: Buchung[];
};

export type Kontakt = {
  id: number;
  name: string;
  funktion: string;
  organisation: number | null;
  organisation_name: string;
  ball: "uns" | "ihnen";
  offener_punkt: string;
  letzter_kontakt: string | null;
  verlauf: Verlaufseintrag[];
};
export type Verlaufseintrag = {
  id: number;
  datum: string;
  art: string;
  titel: string;
  text: string;
  wer_name: string;
};
export type Organisation = {
  id: number;
  name: string;
  kurz: string;
  typ: string;
  stufe: "erstkontakt" | "antrag" | "partner";
  nutzen: string;
  kontakte: Kontakt[];
  verlauf: Verlaufseintrag[];
};

export const useIch = () => useQuery({ queryKey: ["ich"], queryFn: () => hole<Ich>("/ich/") });

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => hole<Dashboard>("/dashboard/") });

export const useProjekte = () =>
  useQuery({ queryKey: ["projekte"], queryFn: () => hole<Projekt[]>("/projekte/") });

export const useLaufend = () =>
  useQuery({
    queryKey: ["laufend"],
    queryFn: () => hole<{ laufend: Buchung | null }>("/zeiten/laufend/"),
    // Die Uhr im Kopf muss auch stimmen, wenn woanders gestartet wurde.
    refetchInterval: 60_000,
  });

export const useBuchungen = (parameter: Record<string, string> = {}) => {
  const frage = new URLSearchParams(parameter).toString();
  return useQuery({
    queryKey: ["zeiten", parameter],
    queryFn: () => hole<Buchung[]>(`/zeiten/${frage ? `?${frage}` : ""}`),
  });
};

export const useOrganisationen = () =>
  useQuery({ queryKey: ["organisationen"], queryFn: () => hole<Organisation[]>("/organisationen/") });

export const useKontakte = () =>
  useQuery({ queryKey: ["kontakte"], queryFn: () => hole<Kontakt[]>("/kontakte/") });

/**
 * Nach jeder Änderung werden **alle** betroffenen Abrufe verworfen.
 *
 * Gezielt einzelne Einträge im Zwischenspeicher zu ändern wäre schneller und
 * eine zweite Stelle, an der steht, was eine Buchung mit einer Projektsumme
 * macht. Die beiden laufen auseinander.
 */
export function useNeuLaden() {
  const speicher = useQueryClient();
  return () => {
    for (const schluessel of ["dashboard", "projekte", "zeiten", "laufend", "kontakte", "organisationen"]) {
      speicher.invalidateQueries({ queryKey: [schluessel] });
    }
  };
}

export function useSchreiben<T = unknown>(
  pfad: (argument: never) => string,
  methode: "POST" | "PATCH" | "DELETE" = "POST",
) {
  const neuLaden = useNeuLaden();
  return useMutation({
    mutationFn: ({ daten, ...rest }: { daten?: unknown } & Record<string, unknown>) =>
      hole<T>(pfad(rest as never), {
        method: methode,
        body: daten === undefined ? undefined : JSON.stringify(daten),
      }),
    onSuccess: neuLaden,
  });
}
