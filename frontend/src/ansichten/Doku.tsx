/**
 * Die Doku — was die Anwendung kann und wie sie gemeint ist.
 *
 * **Warum es diese Seite gibt:** Bis hierher hingen die Erklärungen als
 * Fragezeichen neben einzelnen Beschriftungen. Das ist die richtige Form für
 * „was heißt dieses Feld", aber die falsche für „wie arbeite ich damit": Wer
 * die Frage stellt, bevor er auf der Seite steht, findet die Antwort nicht,
 * und wer sie zweimal gelesen hat, überfährt sie nie wieder.
 *
 * Dieselbe Bauart wie die Einstellungen: eine Seite mit einem Untermenü, jede
 * Rubrik mit eigenem Weg und eigenem Lesezeichen.
 *
 * **Der Text steht hier und nicht in einer Datendatei.** Er ist Markup — Listen,
 * Zeichen, Statusfarben, der Baum —, und als Zeichenkette in einer Tabelle
 * verlöre er genau das, was ihn lesbar macht. Die einzige Ausnahme ist die
 * Rubrik „Änderungen": Die kommt aus `socos/aenderungen.py`, weil sie dieselbe
 * Liste ist, aus der das Fenster nach der Anmeldung lebt.
 */

import { useAenderungen } from "../basis/daten";
import { DOKUTEILE, type Dokuteil, type Seite } from "../basis/router";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen, type ZeichenName } from "../bausteine/Zeichen";
import { Zustand } from "../basis/Zustand";

const TEILE: { teil: Dokuteil; titel: string }[] = [
  { teil: "ueberblick", titel: "Überblick" },
  { teil: "zeit", titel: "Zeit buchen" },
  { teil: "projekt", titel: "Projekt & Fortschritt" },
  { teil: "kontakte", titel: "Kontakte" },
  { teil: "events", titel: "Events" },
  { teil: "geld", titel: "Geld & Runway" },
  { teil: "rechte", titel: "Rollen & Sicherung" },
  { teil: "aenderungen", titel: "Änderungen" },
];

export function Doku({
  unter,
  wechseln,
}: {
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const gewaehlt = (DOKUTEILE as readonly string[]).includes(unter ?? "")
    ? (unter as Dokuteil)
    : "ueberblick";

  return (
    <div className="einstellungen">
      <nav className="untermenue" aria-label="Doku">
        {TEILE.map((t) => (
          <a
            key={t.teil}
            href={`/doku/${t.teil}`}
            aria-current={t.teil === gewaehlt ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              wechseln("doku", t.teil);
            }}
          >
            {t.titel}
          </a>
        ))}
      </nav>

      <div className="spalte">
        {gewaehlt === "ueberblick" && <Ueberblick wechseln={wechseln} />}
        {gewaehlt === "zeit" && <ZeitDoku />}
        {gewaehlt === "projekt" && <ProjektDoku />}
        {gewaehlt === "kontakte" && <KontakteDoku />}
        {gewaehlt === "events" && <EventsDoku />}
        {gewaehlt === "geld" && <GeldDoku />}
        {gewaehlt === "rechte" && <RechteDoku />}
        {gewaehlt === "aenderungen" && <AenderungenDoku />}
      </div>
    </div>
  );
}

/* --- Die Bausteine der Doku ---------------------------------------------- */
/*
 * Fünf Formen, mehr nicht: Karte mit Vorspann, Begriffskacheln, nummerierte
 * Schritte, Baum, Merksatz. Jede weitere Form wäre eine Gestaltungsfrage mehr
 * beim nächsten Absatz — und die Doku würde davon nicht klarer.
 */

function Abschnitt({
  zeichen,
  titel,
  vorspann,
  children,
}: {
  zeichen: ZeichenName;
  titel: string;
  vorspann: string;
  children: React.ReactNode;
}) {
  return (
    <div className="karte doku-karte">
      <div className="doku-kopf">
        <i className="doku-siegel">
          <Zeichen name={zeichen} />
        </i>
        <div>
          <h2>{titel}</h2>
          <p className="doku-vorspann">{vorspann}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Begriffe({ paare }: { paare: { begriff: string; text: string }[] }) {
  return (
    <dl className="doku-begriffe">
      {paare.map((p) => (
        <div key={p.begriff} className="doku-begriff">
          <dt>{p.begriff}</dt>
          <dd>{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function Schritte({ schritte }: { schritte: string[] }) {
  return (
    <ol className="doku-schritte">
      {schritte.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

/** Ein Merksatz — das, was man beim dritten Mal noch wissen muss. */
function Merke({ children }: { children: React.ReactNode }) {
  return <p className="doku-merke">{children}</p>;
}

/* --- Die Rubriken --------------------------------------------------------- */

function Ueberblick({ wechseln }: { wechseln: (seite: Seite, unter?: string | null) => void }) {
  return (
    <>
      <Abschnitt
        zeichen="buch"
        titel="Was SoCoS ist"
        vorspann="Ein Werkzeug für drei Leute: wo die Zeit hingeht, wie weit die Projekte sind, mit wem wir reden und wie lange das Geld reicht."
      >
        <Begriffe
          paare={[
            {
              begriff: "Zeit",
              text: "Eine Uhr, die auf einem Arbeitspaket läuft. Was fehlt, wird nachgetragen.",
            },
            {
              begriff: "Projekt",
              text: "Vier Ebenen und eine Stufenleiste je Paket. Der Fortschritt wird gerechnet, nicht geschätzt.",
            },
            {
              begriff: "Kontakte & Events",
              text: "Wer wir kennen, wer am Zug ist, und wen wir auf welcher Tagung ansprechen wollen.",
            },
            {
              begriff: "Geld",
              text: "Kontostand, Kosten, und wie viele Monate das noch trägt.",
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="achtung"
        titel="Drei Dinge, die immer gelten"
        vorspann="Sie erklären das meiste von dem, was sonst überrascht."
      >
        <ol className="doku-schritte">
          <li>
            <b>Nichts verschwindet wirklich.</b> Entfernen heißt: aus den Listen genommen.
            Gebuchte Zeiten und der Verlauf bleiben, ein Admin kann es zurückholen.
          </li>
          <li>
            <b>Jede Änderung steht im Protokoll</b> — wer, wann, was, alt → neu. Auch
            das Entfernen. Nachzulesen unter Einstellungen · Änderungsprotokoll.
          </li>
          <li>
            <b>Es gibt keinen stillen Zeitfilter.</b> Ohne Zeitraum kommt alles. Was eine
            Zahl meint, steht über ihr — nie im Hintergrund.
          </li>
        </ol>
        <Merke>
          Zahlen, die plausibel aussehen und einen anderen Zeitraum meinen, sind die
          schlimmere Sorte Fehler. Deshalb steht der Zeitraum immer sichtbar da.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="mehr"
        titel="Wo was steht"
        vorspann="Die Seitenleiste hat drei Gruppen: was wir tun, mit wem wir reden, und das Werkzeug selbst."
      >
        <div className="doku-wege">
          {[
            { seite: "start" as const, zeichen: "zuhause" as const, titel: "Start", text: "Uhr starten, zuletzt gebucht, der schnelle Griff." },
            { seite: "dashboard" as const, zeichen: "dashboard" as const, titel: "Dashboard", text: "Woche, Geld, Fortschritt auf einen Blick." },
            { seite: "projekt" as const, zeichen: "projekt" as const, titel: "Projekt", text: "Der Baum, die Pakete, die Stufen." },
            { seite: "zeit" as const, zeichen: "zeit" as const, titel: "Zeit", text: "Buchungen, Nachträge, Zeitnachweis." },
            { seite: "kontakte" as const, zeichen: "kontakte" as const, titel: "Kontakte", text: "Organisationen, Personen, Verlauf." },
            { seite: "events" as const, zeichen: "event" as const, titel: "Events", text: "Hitlist vorher, Verlauf nachher." },
          ].map((w) => (
            <button key={w.seite} type="button" className="doku-weg" onClick={() => wechseln(w.seite)}>
              <Zeichen name={w.zeichen} />
              <span>
                <b>{w.titel}</b>
                <em>{w.text}</em>
              </span>
            </button>
          ))}
        </div>
      </Abschnitt>
    </>
  );
}

function ZeitDoku() {
  return (
    <>
      <Abschnitt
        zeichen="zeit"
        titel="Die Uhr läuft auf einem Paket"
        vorspann="Nicht auf einem Projekt und nicht auf einer Unteraufgabe — auf genau einer Ebene, damit jede Stunde eindeutig hängt."
      >
        <Schritte
          schritte={[
            "Auf der Startseite ein Paket wählen oder in der Leiste „Paket wählen“ drücken. Die Uhr unten links zählt.",
            "Beim Clock-out fragt SoCoS nach einer Notiz. Sie ist freiwillig und in einem halben Jahr das, was die Zeile erklärt.",
            "Startet man eine zweite Buchung, während eine läuft, wird die erste beendet — ohne Notiz. Wer eine mitgeben will, macht vorher den Clock-out.",
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="achtung"
        titel="Entwürfe: die vergessenen Clock-outs"
        vorspann="Eine Buchung, die über das Tagesende hinauslief, wird dort abgeschnitten und als Entwurf geführt."
      >
        <p className="doku-text">
          Ein Entwurf zählt <b>in keiner Summe und in keinem Zeitnachweis</b> mit, bis
          das Ende bestätigt ist. Er steht oben auf der Zeitseite, bis das erledigt ist.
        </p>
        <Merke>
          Lieber eine Zeile, die sichtbar fehlt, als eine Achtstundenbuchung, die still
          in eine Monatssumme läuft.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="pdf"
        titel="Nachtragen, filtern, nachweisen"
        vorspann="Was nicht gebucht wurde, wird eingetragen — mit Datum, Zeit und Paket."
      >
        <Begriffe
          paare={[
            {
              begriff: "Zeitraum",
              text: "„Von“ und „bis“ stehen über den Zahlen. Ohne Angabe kommt alles — es gibt keinen Filter auf den laufenden Monat.",
            },
            {
              begriff: "Fremde Buchungen",
              text: "Admin und Bearbeiter dürfen sie ändern. Entfernen darf nur ein Admin, und es steht im Protokoll.",
            },
            {
              begriff: "Zeitnachweis",
              text: "Ein Monat als PDF — für eine Person oder fürs ganze Team. Entwürfe bleiben draußen.",
            },
          ]}
        />
      </Abschnitt>
    </>
  );
}

function ProjektDoku() {
  return (
    <>
      <Abschnitt
        zeichen="projekt"
        titel="Vier Ebenen, mehr nicht"
        vorspann="Gebucht wird auf dem Arbeitspaket. Die Unteraufgabe ist eine Liste zum Abhaken, keine fünfte Buchungsebene."
      >
        <ul className="doku-baum">
          <li>
            <b>Projekt</b>
            <em>Die Sache selbst — „Arzneimittelspender“.</em>
            <ul>
              <li>
                <b>Bereich</b>
                <em>Entwicklung, Finanzierung, Ziel. Gliedert das Projekt.</em>
                <ul>
                  <li>
                    <b>Arbeitspaket</b>
                    <em>Hierauf läuft die Uhr. Hat Status und Stufenleiste.</em>
                    <ul>
                      <li>
                        <b>Unteraufgabe</b>
                        <em>Abhaken, sonst nichts.</em>
                      </li>
                    </ul>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </Abschnitt>

      <Abschnitt
        zeichen="haken"
        titel="Stufen und Fortschritt"
        vorspann="Jedes Paket hat eine Leiste aus Stufen, und jede Stufe hat eine Dauer in Monaten."
      >
        <p className="doku-text">
          Der Fortschritt rechnet <b>über die Monate, nicht über die Anzahl</b>:
          „Umsetzung“ mit drei Monaten neben „Konzept“ mit einem ist die Hälfte des
          Weges, nicht ein Viertel.
        </p>
        <Schritte
          schritte={[
            "Ein Klick auf eine Stufe setzt den Stand bis dorthin.",
            "Ein zweiter Klick auf dieselbe Stufe nimmt ihn wieder zurück.",
            "Eine Vorlage ersetzt die ganze Leiste und setzt den Stand auf null — „Stufe 3“ heißt in einer anderen Leiste etwas anderes.",
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="stift"
        titel="Umbauen"
        vorspann="Gliedern, umordnen, entfernen steht hinter dem Schalter „bearbeiten“ — nicht im Weg der täglichen Arbeit."
      >
        <Merke>
          Ein Paket, an dem Zeiten hängen, lässt sich nicht entfernen. SoCoS sagt dann,
          was im Weg steht — die Stunden wären sonst Waisen.
        </Merke>
      </Abschnitt>
    </>
  );
}

function KontakteDoku() {
  return (
    <>
      <Abschnitt
        zeichen="kontakte"
        titel="Erst das Haus, dann die Person"
        vorspann="Organisationen führen die Liste; die Personen hängen darin. Wer zu keinem Haus gehört, steht unter „lose Kontakte“."
      >
        <Begriffe
          paare={[
            {
              begriff: "Ball",
              text: "„Bei uns“ heißt: wir schulden etwas. „Bei ihnen“: wir warten. „Nichts offen“: läuft, aber gerade steht nichts an.",
            },
            {
              begriff: "Stufe",
              text: "Wie weit die Beziehung ist: Erstkontakt · kennengelernt · im Austausch · angebahnt · Partner.",
            },
            {
              begriff: "Priorität",
              text: "Was für uns drinsteckt. Nicht dasselbe wie die Stufe — eine Förderstelle ohne ein einziges Gespräch kann das Wichtigste auf der Liste sein.",
            },
            {
              begriff: "Verlauf",
              text: "Gespräche mit Personen und Post ans Haus stehen in einem Faden. Sonst sieht man den Verlauf nur halb.",
            },
          ]}
        />
        <Merke>
          Der Ball hängt an den Personen. Eine Organisation passt zum Filter, wenn eine
          ihrer Personen passt.
        </Merke>
      </Abschnitt>
    </>
  );
}

function EventsDoku() {
  return (
    <>
      <Abschnitt
        zeichen="event"
        titel="Vorher die Hitlist, nachher der Verlauf"
        vorspann="Ein Event ist kein Termin — keine Uhrzeit, keine Erinnerung. Es ist die Vorbereitung und das Ergebnis."
      >
        <Begriffe
          paare={[
            {
              begriff: "Hitlist",
              text: "Wen wollen wir dort ansprechen? Jede Zeile zeigt auf eine Organisation oder eine Person aus den Kontakten — nie auf einen frei getippten Namen.",
            },
            {
              begriff: "Verlauf",
              text: "Wen haben wir tatsächlich getroffen. Der Eintrag steht auch beim Kontakt — es ist derselbe.",
            },
            {
              begriff: "Angeboten wird jeder Kontakt",
              text: "Nicht nur die Hitlist: Wen man trifft, entscheidet der Gang über den Flur. Wer noch gar nicht in den Kontakten steht, wird dabei gleich angelegt.",
            },
            {
              begriff: "Suche",
              text: "Sie geht über die Hitlist mit: Wer den Namen einer Förderstelle eingibt, findet das Event, auf dem er sie treffen wollte.",
            },
          ]}
        />
      </Abschnitt>
    </>
  );
}

function GeldDoku() {
  return (
    <>
      <Abschnitt
        zeichen="dashboard"
        titel="Drei Zahlen, und was sie meinen"
        vorspann="Eingetragen werden sie unter Einstellungen; sehen darf sie jeder, eintragen nur ein Admin."
      >
        <Begriffe
          paare={[
            {
              begriff: "Kontostand",
              text: "Ein Stichtagswert. Beliebig viele — die Linie im Dashboard ist ihre Reihe.",
            },
            {
              begriff: "Fixkosten",
              text: "Der wiederkehrende Monatsbetrag. Gilt ab einem Datum bis zum nächsten Eintrag.",
            },
            {
              begriff: "Monatskosten",
              text: "Was in einem Monat tatsächlich angefallen ist, inklusive Einmaligem.",
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="achtung"
        titel="Erwartete Kosten und Runway"
        vorspann="Beides wird gerechnet und nirgends gespeichert — eine nachgetragene Zahl ändert die Prognose sofort."
      >
        <Schritte
          schritte={[
            "Solange weniger als drei Monate erfasst sind, gilt der Fixkostenbetrag als erwartete Monatskosten.",
            "Ab drei erfassten Monaten deren Durchschnitt — die Grundlage steht im Dashboard dabei.",
            "Der Runway ist der letzte Kontostand geteilt durch die erwarteten Monatskosten. Die gestrichelte Linie ist die Prognose, die durchgezogene das Erfasste.",
          ]}
        />
      </Abschnitt>
    </>
  );
}

function RechteDoku() {
  return (
    <>
      <Abschnitt
        zeichen="zahnrad"
        titel="Drei Rollen"
        vorspann="Wer was darf, entscheidet der Server bei jedem Aufruf. Eine versteckte Seite wäre nur eine ungenannte Adresse."
      >
        <table className="tabelle doku-tabelle">
            <thead>
              <tr>
                <th>Rolle</th>
                <th>Sehen</th>
                <th>Bearbeiten</th>
                <th>Entfernen</th>
                <th>Geld & Konten</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Admin", "alles", "ja", "ja", "ja"],
                ["Bearbeiter", "alles", "ja", "nein", "nein"],
                ["Leser", "alles", "nein", "nein", "nein"],
              ].map((zeile) => (
                <tr key={zeile[0]}>
                  <td data-spalte="Rolle">
                    <b>{zeile[0]}</b>
                  </td>
                  <td data-spalte="Sehen">{zeile[1]}</td>
                  <td data-spalte="Bearbeiten">{zeile[2]}</td>
                  <td data-spalte="Entfernen">{zeile[3]}</td>
                  <td data-spalte="Geld & Konten">{zeile[4]}</td>
                </tr>
              ))}
            </tbody>
        </table>
        <Merke>
          Auch ein Leser sieht Kontostand, Runway und fremde Stunden. Er ändert nur
          nichts — außer einem Wunsch oder einer Fehlermeldung.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="abmelden"
        titel="Konten"
        vorspann="Ein Konto legt ein Administrator an der Kommandozeile an; im Browser gibt es kein Anlegeformular."
      >
        <p className="doku-text">
          <code>nutzer_anlegen</code> legt das Konto an, <code>nutzer_passwort</code>{" "}
          setzt das Passwort — beides interaktiv. Sonst landete irgendwann ein Passwort
          im Browserverlauf oder in der Prozessliste des Servers.
        </p>
        <Merke>
          Konten werden nicht gelöscht, sondern stillgelegt. Das eigene Konto kann man
          nicht stilllegen.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="pdf"
        titel="Sicherung"
        vorspann="Ein Archiv enthält alles: Datenbank samt Konten und die hochgeladenen Dateien."
      >
        <p className="doku-text">
          Herunterladen und Einspielen stehen unter Einstellungen · Sicherung und sind
          einem Admin vorbehalten. <b>Das Einspielen ersetzt den gesamten Bestand</b> —
          danach meldet sich jeder neu an.
        </p>
      </Abschnitt>
    </>
  );
}

function AenderungenDoku() {
  const aenderungen = useAenderungen();

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!aenderungen.data) {
    return <Zustand abfrage={aenderungen} erneut={() => aenderungen.refetch()} />;
  }

  const versionen = aenderungen.data.versionen;

  return (
    <div className="karte doku-karte">
      <div className="doku-kopf">
        <i className="doku-siegel">
          <Zeichen name="fahne" />
        </i>
        <div>
          <h2>Was sich geändert hat</h2>
          <p className="doku-vorspann">
            Dieselbe Liste, die nach einer Änderung einmal als Fenster aufgeht. Hier
            steht sie vollständig — auch das, was man damals weggeklickt hat.
          </p>
        </div>
      </div>

      {!versionen.length && (
        <Leerstelle
          was="Noch nichts eingetragen"
          satz="Sobald sich etwas an SoCoS ändert, steht es hier."
        />
      )}

      {versionen.map((fassung) => (
        <section key={fassung.version} className="doku-version">
          <div className="doku-version-kopf">
            <span className="zahl">{fassung.version}</span>
            <h3>{fassung.titel}</h3>
          </div>
          <ul className="doku-punkte">
            {fassung.punkte.map((punkt) => (
              <li key={punkt.titel}>
                <b>{punkt.titel}</b>
                <span>{punkt.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
