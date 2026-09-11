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
    sichern: boolean;
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
  /** „herr" oder „frau" — leer heißt: nicht bekannt, nicht geraten. */
  anrede: "" | "herr" | "frau";
  funktion: string;
  email: string;
  telefon: string;
  organisation: number | null;
  organisation_name: string;
  /** Das Event, auf dem die Person kennengelernt wurde — meistens keines. */
  kennengelernt_auf: number | null;
  kennengelernt_auf_titel: string;
  ball: "uns" | "ihnen" | "nichts";
  offener_punkt: string;
  letzter_kontakt: string | null;
  verlauf: Verlaufseintrag[];
};
export type Verlaufseintrag = {
  id: number;
  kontakt: number | null;
  kontakt_name: string;
  organisation: number | null;
  organisation_name: string;
  /** Auf welchem Event der Eintrag entstanden ist — meistens auf keinem. */
  event: number | null;
  event_titel: string;
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
  stufe: "erstkontakt" | "kennengelernt" | "austausch" | "angebahnt" | "partner";
  prioritaet: "hoch" | "mittel" | "gering" | "offen";
  nutzen: string;
  kontakte: Kontakt[];
  verlauf: Verlaufseintrag[];
};

/**
 * Eine Zeile der Hitlist. Sie zeigt auf **genau eines** — eine Organisation
 * oder eine Person; dieselbe Regel wie beim Verlaufseintrag.
 */
export type Eventziel = {
  id: number;
  event: number;
  organisation: number | null;
  organisation_name: string;
  kontakt: number | null;
  kontakt_name: string;
  /** Zu welchem Haus die Person gehört — leer bei einem losen Kontakt. */
  kontakt_organisation: string;
  anliegen: string;
  stand: "offen" | "getroffen" | "verpasst";
  reihenfolge: number;
};

/**
 * Der Name verdeckt in Modulen, die ihn einführen, den DOM-Typ `Event`. Das
 * ist hier ungefährlich — angefasst werden dort nur React-Ereignisse, deren
 * Typ aus dem Handler kommt — und ein zweites Wort für dieselbe Sache
 * („Veranstaltung") wäre der teurere Preis.
 */
export type Event = {
  id: number;
  titel: string;
  ort: string;
  von: string;
  /** Leer heißt eintägig. */
  bis: string | null;
  notiz: string;
  teilnehmer: number[];
  teilnehmer_namen: string[];
  ziele: Eventziel[];
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

export type Teammitglied = {
  id: number;
  name: string;
  initialen: string;
  farbe: string;
  funktion: string;
  email: string;
  is_active: boolean;
  rolle: "admin" | "bearbeiter" | "leser" | null;
};

export const useTeam = () =>
  useQuery({ queryKey: ["team"], queryFn: () => hole<Teammitglied[]>("/nutzer/") });

export const useOrganisationen = () =>
  useQuery({ queryKey: ["organisationen"], queryFn: () => hole<Organisation[]>("/organisationen/") });

export const useKontakte = () =>
  useQuery({ queryKey: ["kontakte"], queryFn: () => hole<Kontakt[]>("/kontakte/") });

export const useEvents = () =>
  useQuery({ queryKey: ["events"], queryFn: () => hole<Event[]>("/events/") });

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
    for (const schluessel of [
      "dashboard", "projekte", "zeiten", "laufend", "kontakte", "organisationen",
      "events", "team", "ich", "protokoll",
    ]) {
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
