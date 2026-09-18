import { useIch } from "./basis/daten";
import { fuehrtZurAnmeldung, zurAnmeldung } from "./basis/anmeldung";
import { useSeite, type Seite } from "./basis/router";
import { Zustand } from "./basis/Zustand";
import { Zeichen } from "./bausteine/Zeichen";
import { Seitenleiste } from "./bausteine/Seitenleiste";
import { Meldungen } from "./bausteine/Meldungen";
import { Neuigkeiten } from "./bausteine/Neuigkeiten";
import { Aufgaben } from "./ansichten/Aufgaben";
import { Dashboard } from "./ansichten/Dashboard";
import { Doku } from "./ansichten/Doku";
import { Einstellungen } from "./ansichten/Einstellungen";
import { Events } from "./ansichten/Events";
import { Kontakte } from "./ansichten/Kontakte";
import { Meetings } from "./ansichten/Meetings";
import { Profil } from "./ansichten/Profil";
import { Projekt } from "./ansichten/Projekt";
import { Rueckmeldungen } from "./ansichten/Rueckmeldungen";
import { Start } from "./ansichten/Start";
import { Zeit } from "./ansichten/Zeit";

const TITEL: Record<Seite, { titel: string; unter: string }> = {
  // Die Startseite trägt in der Zeile eine Anrede statt ihres Namens — siehe
  // unten. Der Eintrag hier ist trotzdem nötig, damit der Record vollständig
  // bleibt und eine neue Seite ohne Zeile nicht durchrutscht.
  start: { titel: "Start", unter: "Womit geht's los?" },
  dashboard: { titel: "Dashboard", unter: "Woche, Geld, Fortschritt" },
  projekt: { titel: "Projekt", unter: "Projektphasen, Arbeitspakete, Pensum" },
  zeit: { titel: "Zeit", unter: "Buchungen und Nachträge" },
  aufgaben: { titel: "Aufgaben", unter: "Was ansteht — allgemein und je Person" },
  kontakte: { titel: "Kontakte", unter: "Organisationen und Personen" },
  events: { titel: "Events", unter: "Tagungen, Hitlist, wen wir getroffen haben" },
  meetings: { titel: "Meetings", unter: "Vorher planen, mitschreiben, Protokoll" },
  profil: { titel: "Profil", unter: "Deine Stammdaten" },
  einstellungen: { titel: "Einstellungen", unter: "Konten, Protokoll, Sicherung" },
  doku: { titel: "Doku", unter: "Wie SoCoS gemeint ist — kurz" },
  rueckmeldungen: { titel: "Wünsche & Fehler", unter: "Was fehlt, was stört, was erledigt ist" },
};

/* Die Unterseiten mit einer eigenen Zeile. Sie steht hier ausgeschrieben,
   statt aus Seitenname und Weg zusammengesetzt zu werden: „Aufgaben · ideen"
   wäre keine Zeile, sondern ein Pfad — und die Regel, die daraus „Ideenliste"
   machte, wäre länger als diese Liste.

   Alles, was kein Eintrag hat, trägt weiter die Zeile seiner Seite. */
const UNTERTITEL: Record<string, { titel: string; unter: string }> = {
  "projekt/bearbeiten": { titel: "Projekt bearbeiten", unter: "Gliedern, umordnen, entfernen" },
  "aufgaben/ideen": {
    titel: "Ideenliste",
    unter: "Was möglich wäre — noch nicht entschieden",
  },
};

export function App() {
  const ich = useIch();
  const { ort, wechseln, zurueck, kannZurueck } = useSeite();

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
  const kopfzeile =
    UNTERTITEL[`${ort.seite}/${ort.unter}`] ??
    (ort.seite === "start"
      ? { titel: `Hallo ${ich.data.name.split(" ")[0]}`, unter: TITEL.start.unter }
      : TITEL[ort.seite]);

  return (
    <div className="geruest">
      <Seitenleiste ich={ich.data} seite={ort.seite} wechseln={wechseln} />
      <Meldungen />

      {/* Was sich geändert hat — einmal je Änderung, gleich nach der
          Anmeldung. Die Liste kommt aus /api/ich/ und ist leer, sobald sie
          bestätigt wurde; es gibt hier nichts zu merken. */}
      {ich.data.neuigkeiten.length > 0 && (
        <Neuigkeiten punkte={ich.data.neuigkeiten} wechseln={wechseln} />
      )}
      <div className="inhalt">
        {/*
          Die Kontextleiste trägt, wo man ist — und sonst nichts. Zeitraum und
          Anlegeknöpfe standen im Entwurf einmal rechts darin und gehören nicht
          hierher: Ein Zeitraum ist ein Filter und steht über den Zahlen, die
          er ändert; eine seltene Handlung gehört an die Karte, um die es geht.

          Sie bleibt beim Scrollen stehen. Auf einer langen Buchungsliste ist
          die Überschrift sonst nach zwei Handbewegungen weg, und mit ihr der
          einzige Hinweis, welchen Monat man gerade ansieht.
        */}
        <div className="kontextleiste">
          {/*
            Der Zurück-Knopf steht hier und nicht in den einzelnen Ansichten.
            Er stand vorher in zweien von acht — auf den übrigen Seiten führte
            der einzige Weg zurück über die Kopfleiste, und auf dem Profil und
            in den Einstellungen, die dort keinen Eintrag haben, gar keiner.
            Ein Ort für alle: Was in acht Ansichten steht, weicht in der
            neunten ab.
          */}
          {kannZurueck && (
            <button type="button" className="zurueck" onClick={zurueck}>
              <Zeichen name="zeiger" klasse="zeiger-zurueck" />
              Zurück
            </button>
          )}
          <h1>{kopfzeile.titel}</h1>
          <i className="kontext-trenner" />
          <div className="unter">{kopfzeile.unter}</div>
        </div>

        <main className="seite">
          {ort.seite === "start" && <Start ich={ich.data} wechseln={wechseln} />}
          {ort.seite === "dashboard" && <Dashboard ich={ich.data} wechseln={wechseln} />}
          {ort.seite === "projekt" && (
            <Projekt ich={ich.data} bearbeiten={bearbeiten} wechseln={wechseln} />
          )}
          {ort.seite === "zeit" && <Zeit ich={ich.data} />}
          {ort.seite === "aufgaben" && (
            <Aufgaben ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "kontakte" && (
            <Kontakte ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "events" && (
            <Events ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "meetings" && (
            <Meetings ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "profil" && (
            <Profil ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "einstellungen" && (
            <Einstellungen ich={ich.data} unter={ort.unter} wechseln={wechseln} />
          )}
          {ort.seite === "doku" && <Doku unter={ort.unter} wechseln={wechseln} />}
          {ort.seite === "rueckmeldungen" && <Rueckmeldungen ich={ich.data} />}
        </main>
      </div>
    </div>
  );
}
