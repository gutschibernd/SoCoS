/**
 * Die Abrufe. Ein Ort, damit Schlüssel und Pfade nicht an fünf Stellen
 * auseinanderlaufen.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { hole } from "./api";

/**
 * Eine Seite im Fenster, das nach der Anmeldung aufgeht. Der Inhalt kommt aus
 * `socos/aenderungen.py` — es gibt keine zweite Liste im Frontend.
 */
export type Neuigkeit = {
  version: string;
  titel: string;
  text: string;
  /** Wohin der Knopf „Ansehen" führt — ein Weg wie „doku/aenderungen". Optional. */
  wo?: string;
};

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
    /** Stand, Antwort und Version an einer Rückmeldung setzen. */
    rueckmeldungen_verwalten: boolean;
  };
  /** Was dieser Nutzer noch nicht gesehen hat. Leer heißt: nichts Neues. */
  neuigkeiten: Neuigkeit[];
};

export type Aenderungsversion = {
  version: string;
  titel: string;
  punkte: { titel: string; text: string; wo?: string }[];
};

export type Rueckmeldung = {
  id: number;
  art: "wunsch" | "fehler";
  titel: string;
  text: string;
  stand: "neu" | "angenommen" | "in_arbeit" | "erledigt" | "abgelehnt";
  antwort: string;
  /** In welcher Version es drin ist — leer, solange nichts erledigt ist. */
  erledigt_in: string;
  melder: number | null;
  melder_name: string;
  melder_initialen: string;
  melder_farbe: string;
  erstellt_am: string;
  geaendert_am: string;
};

/**
 * Ein Punkt auf der Tafel unter „Intern · Aufgaben".
 *
 * `person: null` heißt **Allgemein** — die Spalte, die niemandem gehört. Kein
 * zweites Feld daneben, das dasselbe noch einmal sagt und ihm widersprechen
 * könnte.
 *
 * `ist_idee: true` heißt: Der Punkt steht auf der **Ideenliste** unter
 * `/aufgaben/ideen` und nicht auf der Tafel. Dieselbe Zeile, dieselbe
 * Kennung — „das machen wir" setzt nur dieses eine Feld um.
 */
export type Aufgabe = {
  id: number;
  text: string;
  /** Leer heißt „Allgemein". Mit zwei Personen steht sie bei beiden. */
  personen: number[];
  prioritaet: "hoch" | "mittel" | "gering";
  erledigt: boolean;
  /** "2026-10-12" oder null — die meisten Zettel haben keine. */
  frist: string | null;
  ist_idee: boolean;
  erstellt_am: string;
  geaendert_am: string;
};

export type Unteraufgabe = { id: number; paket: number; titel: string; erledigt: boolean };
export type Pensum = {
  id: number;
  paket: number;
  person: number;
  person_name: string;
  /** Zeichenkette, nicht Zahl — Stunden sind Decimal (siehe CLAUDE.md). */
  stunden: string;
  /** Was diese Person auf dieses Paket schon gebucht hat. */
  gebuchte_sekunden: number;
};
export type Paket = {
  id: number;
  phase: number;
  projekt: number;
  titel: string;
  beschreibung: string;
  status: string;
  gebuchte_sekunden: number;
  /** Summe der Pensen, Decimal als Zeichenkette; "0", wenn keines da ist. */
  pensum_stunden: string;
  /** Gebucht gegen Pensum in Prozent — null, wenn es kein Pensum gibt. Kann über 100 liegen. */
  fortschritt: number | null;
  unteraufgaben: Unteraufgabe[];
  pensen: Pensum[];
  /** Ob die Uhr hier laufen darf. Der Server entscheidet, nicht die Liste unten. */
  buchbar: boolean;
  /** Leer, wenn buchbar — sonst der Satz, der es erklärt. */
  grund_gegen_buchung: string;
};
export type Projektphase = {
  id: number;
  projekt: number;
  titel: string;
  art: "dev" | "fin" | "ziel";
  /** JJJJ-MM-TT oder null — eine Phase, die erst ansteht, hat noch kein Datum. */
  von: string | null;
  bis: string | null;
  /** Abgeschlossen nimmt keine Zeit mehr an; „läuft“ ist auf der Projektseite aufgeklappt. */
  stand: "offen" | "laeuft" | "abgeschlossen";
  pakete: Paket[];
};
export type Projekt = {
  id: number;
  titel: string;
  untertitel: string;
  farbe: string;
  phasen: Projektphase[];
  gebuchte_sekunden: number;
  /** Das Projekt mit dem Auffangpaket („Overhead") — steht auf der Projektseite quer über den anderen. */
  ist_auffang: boolean;
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

export type Kontostand = { id: number; datum: string; betrag: string };

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
  kontostand_verlauf: Kontostand[];
  team: {
    id: number;
    name: string;
    initialen: string;
    farbe: string;
    sekunden: number;
    laeuft_auf: string | null;
    laeuft_seit: string | null;
    /** Das Ende der letzten abgeschlossenen Buchung — `null`, wenn es keine gibt. */
    zuletzt_bis: string | null;
  }[];
  team_sekunden: number;
  projekte: { id: number; titel: string; untertitel: string; farbe: string; sekunden: number }[];
  offene_entwuerfe: Buchung[];
  /**
   * Die letzten Handgriffe aus dem Änderungsprotokoll, als Satz in drei
   * Teilen. `objekt` steht getrennt, damit es hervorgehoben werden kann.
   */
  aktivitaet: {
    id: number;
    zeitpunkt: string;
    wer: { name: string; initialen: string; farbe: string };
    vor: string;
    objekt: string | null;
    nach: string;
  }[];
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
  /** Werdegang, Rolle im Haus — was man vor dem ersten Gespräch wissen sollte. */
  hintergrund: string;
  /** Worüber man persönlich ins Gespräch kommt. */
  anknuepfen: string;
  /** Was man besser nicht anspricht. */
  meiden: string;
  letzter_kontakt: string | null;
  verlauf: Verlaufseintrag[];
  /** Besprechungen, bei denen diese Person eingetragen ist — kurz, ohne Texte. */
  meetings: Meetingzeile[];
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
  /** Nur die Meetings am Haus selbst — die der Personen stehen bei diesen. */
  meetings: Meetingzeile[];
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
  /** Uhrzeit am ersten Tag, „HH:MM:SS". Leer heißt ganztägig. */
  beginn: string | null;
  /** Uhrzeit am letzten Tag. Nur mit Beginn. */
  ende: string | null;
  notiz: string;
  teilnehmer: number[];
  teilnehmer_namen: string[];
  ziele: Eventziel[];
  verlauf: Verlaufseintrag[];
  anhaenge: Eventanhang[];
};

/**
 * Eine Besprechung: vorher geplant, während des Termins mitgeschrieben, danach
 * als Protokoll gegliedert.
 *
 * `kontakte`, `organisationen` und `teilnehmer` sind die Nummern — damit wird
 * geschrieben. `personen`, `haeuser` und `teilnehmer_namen` sind dieselben
 * Beteiligten mit Namen und nur lesbar; ohne sie zeigte die Liste Nummern.
 */
export type Meeting = {
  id: number;
  titel: string;
  datum: string;
  /** „14:30:00" — oder `null`, dann ist nur der Tag bekannt. */
  uhrzeit: string | null;
  ort: string;
  kontakte: number[];
  personen: { id: number; name: string; funktion: string; organisation_name: string }[];
  organisationen: number[];
  haeuser: { id: number; name: string }[];
  teilnehmer: number[];
  teilnehmer_namen: string[];
  vorbereitung: string;
  mitschrift: string;
  abschnitte: Meetingabschnitt[];
  anhaenge: Meetinganhang[];
};

/**
 * Eine Datei an einem Meeting oder Event. Bei einer E-Mail steht ihr Text
 * daneben (Kopf, Inhalt, Namen der Anhänge) — ausgelesen beim Hochladen, am
 * Server.
 */
export type Anhang = {
  id: number;
  name: string;
  groesse: number;
  art: "email" | "datei";
  text: string;
  erstellt_am: string;
};

export type Meetinganhang = Anhang & { meeting: number };
export type Eventanhang = Anhang & { event: number };

export type Meetingabschnitt = {
  id: number;
  meeting: number;
  ueberschrift: string;
  text: string;
  reihenfolge: number;
};

/** Wie ein Meeting im Verlauf einer Person oder eines Hauses erscheint. */
export type Meetingzeile = {
  id: number;
  titel: string;
  datum: string;
  hat_protokoll: boolean;
};

/** Ein Feld des Lean Model Canvas, wie es der Server beschreibt (`/api/vorhaben/felder/`). */
export type Canvasfeld = {
  feld: string;
  nummer: number;
  titel: string;
  /** Was im Feld verlangt ist, aus den Vorbereitungsvideos — oft leer. */
  aufgabe: string[];
  leitfragen: string[];
  /** Wie lang der Abschnitt laut Vorlage sein soll („1–2 pages") — beim Canvas leer. */
  umfang: string;
};

export type Abschnittstand = "offen" | "entwurf" | "fertig";

/** Die Workshops der SPG Academy, wie die Schnittstelle sie nennt. */
export type Workshopschluessel = "canvas" | "businessplan" | "vision";

export type Canvaspunkt = { id: number; feld: string; text: string; reihenfolge: number };

/** Ein Steckbrief zu Customer Segments — eine erfundene Person. */
export type Persona = {
  id: number;
  vorhaben: number;
  name: string;
  rolle: "nutzer" | "kunde" | "beides";
  alter: number | null;
  geschlecht: string;
  wohnort: string;
  beruf: string;
  haushalt: string;
  /** Netto im Monat, als Zeichenkette wie jedes Geld in der API. */
  einkommen: string | null;
  beduerfnisse: string;
  probleme: string;
  reihenfolge: number;
};

/** Ein Vorhaben der SPG Academy samt allen Punkten seiner Leinwand. */
export type Vorhaben = {
  id: number;
  titel: string;
  punkte: Canvaspunkt[];
  personas: Persona[];
  /** Stand je Abschnitt des Business Plan Lite. Was fehlt, ist offen. */
  planstand: Record<string, Abschnittstand>;
  /** Wann zuletzt daran gearbeitet wurde — gerechnet am Server. */
  zuletzt: string;
};

export const useIch = () => useQuery({ queryKey: ["ich"], queryFn: () => hole<Ich>("/ich/") });

/**
 * Der Zeitraum steht als `?von=&bis=` im Aufruf, nicht in einem stillen Filter.
 * Ohne Angabe nimmt der Server die laufende Woche und schreibt sie als
 * `zeitraum` in die Antwort — worauf sich die Zahlen beziehen, muss niemand
 * raten.
 */
export const useDashboard = (parameter: Record<string, string> = {}) => {
  const frage = new URLSearchParams(parameter).toString();
  return useQuery({
    queryKey: ["dashboard", parameter],
    queryFn: () => hole<Dashboard>(`/dashboard/${frage ? `?${frage}` : ""}`),
  });
};

export const useAenderungen = () =>
  useQuery({
    queryKey: ["aenderungen"],
    queryFn: () =>
      hole<{ neueste: string; versionen: Aenderungsversion[] }>("/aenderungen/"),
    // Die Liste steht im Quelltext und ändert sich nur mit einem Deploy.
    staleTime: Infinity,
  });

export const useRueckmeldungen = () =>
  useQuery({
    queryKey: ["rueckmeldungen"],
    queryFn: () => hole<Rueckmeldung[]>("/rueckmeldungen/"),
  });

/**
 * Die ganze Tafel — **ohne** `?erledigt=`, also samt Abgehaktem.
 *
 * Das Erledigte steht zugeklappt am Fuß jeder Spalte; es ein zweites Mal
 * abzurufen hieße, zwei Listen im Zwischenspeicher zu halten, die dieselbe
 * Tafel meinen. Bei drei Leuten und ein paar Dutzend Zeilen ist das die
 * kleinere Lösung.
 */
export const useAufgaben = () =>
  useQuery({ queryKey: ["aufgaben"], queryFn: () => hole<Aufgabe[]>("/aufgaben/") });

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

export const useMeetings = () =>
  useQuery({ queryKey: ["meetings"], queryFn: () => hole<Meeting[]>("/meetings/") });

export const useVorhaben = () =>
  useQuery({ queryKey: ["vorhaben"], queryFn: () => hole<Vorhaben[]>("/vorhaben/") });

/** Ein Thema für ein Praktikum — eine der Haupt-Aufgabenstellungen. */
/** Haupt-Aufgabenstellung oder sonstige Idee — dasselbe Thema, eine andere Liste. */
export type Themenart = "aufgabe" | "idee";

export type Praktikumsthema = {
  id: number;
  titel: string;
  art: Themenart;
  kurzbeschreibung: string;
  /** Ein Punkt je Zeile. */
  punkte: string;
  /** Der Text aus dem LLM, mit seinen `#`-Überschriften. */
  ausschreibung: string;
  /** Der Auftrag an das LLM — vom Server geschrieben, siehe services/ausschreibung.py. */
  auftrag: string;
  geaendert_am: string;
};

export const usePraktikumsthemen = () =>
  useQuery({
    queryKey: ["praktikumsthemen"],
    queryFn: () => hole<Praktikumsthema[]>("/praktikumsthemen/"),
  });

/* --- Thoughts (im Code: die Lagekarte) ----------------------------------- */

/** Ein Themenfeld in Thoughts. `farbe` ist einer der acht Thementöne (1–8). */
export type Lagethema = { id: number; name: string; farbe: number; x: number; y: number };

export type Schrittart = "schritt" | "warten" | "entscheidung" | "termin";

/**
 * Ein Schritt. Nur zwei Status — ob er wartet oder als Nächstes frei ist,
 * rechnet `basis/lagekarte.ts` aus den Verbindungen.
 */
export type Lageschritt = {
  id: number;
  thema: number | null;
  titel: string;
  art: Schrittart;
  status: "offen" | "erledigt";
  frist: string | null;
  notiz: string;
  x: number;
  y: number;
};

/** „`nach` hängt an `von`". */
export type Lageverbindung = { id: number; von: number; nach: number; text: string };

export type Karte = { themen: Lagethema[]; schritte: Lageschritt[]; verbindungen: Lageverbindung[] };

/* Eine Abfrage für die ganze Karte: Die drei Listen gehören zusammen, und ein
   Pfeil, der vor seinem Schritt ankommt, zeigte ins Leere. */
export const useLagekarte = () =>
  useQuery({
    queryKey: ["lagekarte"],
    queryFn: async (): Promise<Karte> => {
      const [themen, schritte, verbindungen] = await Promise.all([
        hole<Lagethema[]>("/lagethemen/"),
        hole<Lageschritt[]>("/lageschritte/"),
        hole<Lageverbindung[]>("/lageverbindungen/"),
      ]);
      return { themen, schritte, verbindungen };
    },
  });

/* --- Förderungen ------------------------------------------------------------ */

export type Antragsstand = "entwurf" | "eingereicht" | "bewilligt" | "abgelehnt";

/** Ein Arbeitspaket eines Antrags. Die Laufzeit in Projektmonaten (M1 …). */
export type Foerderpaket = {
  id: number;
  antrag: number;
  titel: string;
  ziel: string;
  ergebnis: string;
  von: number;
  bis: number;
  /** Pauschalbetrag als Zeichenkette, z. B. "12000.00" — oder keiner. */
  betrag: string | null;
  reihenfolge: number;
  stunden: Foerderstunden[];
  /** Gerechnet in socos/services/foerderung.py: Stunden mal Satz, Posten, Pauschale. */
  kosten: { stunden: string; personal: string; sach: string; gesamt: string };
};

/** Wie viele Stunden eine Person in einem Paket plant. Die Person ist ein Name. */
export type Foerderstunden = { id: number; paket: number; person: string; stunden: string };

/** Eine Sachposition eines Antrags — einem Paket zugeordnet oder nicht. */
export type Foerderposten = {
  id: number;
  antrag: number;
  paket: number | null;
  bezeichnung: string;
  betrag: string;
  reihenfolge: number;
};

/** Ein Textabschnitt eines Antrags — „Kostenprognose Regelbetrieb". */
export type Foerderabschnitt = { id: number; antrag: number; titel: string; text: string; reihenfolge: number };

/** Die Kalkulation eines Antrags, alles Geld als Zeichenkette. */
export type Antragskosten = {
  stunden: string;
  personal: string;
  sach: string;
  pauschal: string;
  direkt: string;
  gemeinkosten: string;
  gesamt: string;
  zuschuss: string;
  eigenmittel: string;
};

/** Ein Punkt der Antragsreife — gerechnet in socos/services/foerderung.py. */
export type Reifepunkt = { schluessel: string; text: string; erfuellt: boolean; hinweis: string };

export type Foerderantrag = {
  id: number;
  programm: number;
  nummer: number;
  titel: string;
  stand: Antragsstand;
  foerderwerber: string;
  /** Geplanter Beginn — rechnet Projektmonate in Kalendermonate um. */
  beginn: string | null;
  /** Monate im Zeitplan; leer heißt: wie das Programm (siehe monatsanzahl). */
  zeitachse: number | null;
  beschreibung: string;
  /** Die Texte, die das Programm verlangt — je Antrag frei angelegt, in ihrer Reihenfolge. */
  abschnitte: Foerderabschnitt[];
  /** Eine Zeile je Punkt; „✓ " davor heißt: ist da. */
  datenbedarf: string;
  /** Leer heißt: nicht gefragt (siehe socos/services/foerderung.py). */
  stundensatz: string | null;
  gemeinkosten: string | null;
  foerderquote: string | null;
  pakete: Foerderpaket[];
  posten: Foerderposten[];
  kosten: Antragskosten;
  summe: string;
  laufzeit: number;
  reife: Reifepunkt[];
  /** Was das Online-Formular höchstens nimmt. */
  zeichen: { titel: number; beschreibung: number };
  geaendert_am: string;
};

export type Foerderfrage = {
  id: number;
  programm: number;
  frage: string;
  antwort: string;
  /** Abgehakt — unabhängig davon, ob schon ein Antworttext dasteht. */
  beantwortet: boolean;
  quelle: string;
  reihenfolge: number;
  geaendert_am: string;
};

/** Wer fördert — FFG, aws, KWF, ein Land. */
export type Foerdergeber = {
  id: number;
  name: string;
  kurz: string;
  link: string;
  beschreibung: string;
  /** Dasselbe Haus unter Kontakte — dort stehen Personen und Verlauf. */
  organisation: number | null;
};

export type Foerderprogramm = {
  id: number;
  /** Der Fördergeber, unter dem das Programm steht. */
  geber: number;
  name: string;
  stelle: string;
  link: string;
  max_foerderung: string | null;
  max_monate: number | null;
  /** Eine Zeile je Punkt: „Begriff: Erklärung". */
  steckbrief: string;
  fragen: Foerderfrage[];
  antraege: Foerderantrag[];
};

/* Eine Abfrage für das ganze Modul: Programm, Fragen, Anträge, Pakete. */
export const useFoerderungen = () =>
  useQuery({ queryKey: ["foerderungen"], queryFn: () => hole<Foerderprogramm[]>("/foerderprogramme/") });

/* Unter demselben Schlüssel wie die Programme — `neuLaden` verwirft beide. */
export const useFoerdergeber = () =>
  useQuery({ queryKey: ["foerderungen", "geber"], queryFn: () => hole<Foerdergeber[]>("/foerdergeber/") });

/* Die Felder ändern sich nur mit einer neuen Version der Anwendung — sie
   werden deshalb nicht bei jedem Fensterwechsel neu geholt. */
export const useCanvasfelder = (workshop: Workshopschluessel = "canvas") =>
  useQuery({
    queryKey: ["canvasfelder", workshop],
    queryFn: () => hole<Canvasfeld[]>(`/vorhaben/felder/?workshop=${workshop}`),
    staleTime: Infinity,
  });

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
      "events", "meetings", "team", "ich", "protokoll", "rueckmeldungen", "aufgaben", "vorhaben",
      "praktikumsthemen", "lagekarte", "foerderungen",
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
