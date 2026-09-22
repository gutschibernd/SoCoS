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
  { teil: "aufgaben", titel: "Aufgaben" },
  { teil: "projekt", titel: "Projekt & Fortschritt" },
  { teil: "kontakte", titel: "Kontakte" },
  { teil: "events", titel: "Events" },
  { teil: "meetings", titel: "Meetings" },
  { teil: "module", titel: "Module" },
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
        {gewaehlt === "aufgaben" && <AufgabenDoku />}
        {gewaehlt === "projekt" && <ProjektDoku />}
        {gewaehlt === "kontakte" && <KontakteDoku />}
        {gewaehlt === "events" && <EventsDoku />}
        {gewaehlt === "meetings" && <MeetingsDoku />}
        {gewaehlt === "module" && <ModuleDoku />}
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
              text: "Vier Ebenen. Der Fortschritt ist gebuchte Zeit gegen das Pensum — gerechnet, nicht geschätzt.",
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
            { seite: "projekt" as const, zeichen: "projekt" as const, titel: "Projekt", text: "Der Baum, die Pakete, das Pensum." },
            { seite: "zeit" as const, zeichen: "zeit" as const, titel: "Zeit", text: "Buchungen, Nachträge, Zeitnachweis." },
            { seite: "aufgaben" as const, zeichen: "aufgaben" as const, titel: "Aufgaben", text: "Die gemeinsame Tafel: was ansteht, je Person." },
            { seite: "module" as const, zeichen: "module" as const, titel: "Module", text: "Zusätzliche Werkzeuge, z. B. die SPG Academy." },
            { seite: "kontakte" as const, zeichen: "kontakte" as const, titel: "Kontakte", text: "Organisationen, Personen, Verlauf." },
            { seite: "events" as const, zeichen: "event" as const, titel: "Events", text: "Hitlist vorher, Verlauf nachher." },
            { seite: "meetings" as const, zeichen: "meeting" as const, titel: "Meetings", text: "Vorbereiten, mitschreiben, Protokoll." },
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
        zeichen="start"
        titel="„Ohne Paket“ — erst aufzeichnen, dann einsortieren"
        vorspann="Den Knopf gibt es dreimal: in der Leiste unten, auf der Startseite und über der Buchungsliste. Er startet die Uhr, ohne vorher nach dem Paket zu fragen."
      >
        <Schritte
          schritte={[
            "„Ohne Paket starten“ drücken. Die Zeit läuft auf das Projekt „Overhead“ — ein ganz normales Projekt im Baum, kein Sonderfall.",
            "Beim Clock-out steht das Arbeitspaket im selben Fenster wie die Notiz. Wer dort ein anderes wählt, bucht die Zeit dorthin um.",
            "Wer nichts ändert, lässt sie auf Overhead stehen. Das ist kein Versehen, sondern die richtige Antwort für alles, was zu keinem Paket gehört.",
          ]}
        />
        <Merke>
          Eine Buchung ohne Paket gibt es nicht. Sonst gäbe es zwei Arten von Zeit, und
          jede Summe und jeder Nachweis müsste beide kennen.
        </Merke>
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
        zeichen="plus"
        titel="Zeit nachtragen"
        vorspann="Was ohne Uhr gearbeitet wurde, wird eingetragen: ein Paket, ein Tag, zwei Uhrzeiten."
      >
        <Schritte
          schritte={[
            "„Zeit nachtragen“ auf der Zeitseite. Vorgewählt ist das Paket, auf das du zuletzt gebucht hast.",
            "Ins Paketfeld tippen filtert die Liste — Projekt und Paket, die Wörter in beliebiger Reihenfolge. Return nimmt den ersten Treffer.",
            "Tag eintragen, „von“ eintragen, dann entweder „bis“ tippen oder einen der Dauerknöpfe drücken. Darunter steht, wie lang die Buchung wird.",
            "Unter „Für wen“ anhaken, wer dabei war. Jede angehakte Person bekommt ihre eigene Buchung über dieselbe Zeit.",
          ]}
        />
        <Begriffe
          paare={[
            {
              begriff: "Über Mitternacht",
              text: "Liegt „bis“ vor „von“, ist der Folgetag gemeint — 22:00 bis 01:00 sind drei Stunden. Welcher Tag das Ende trägt, steht im Satz unter den Feldern.",
            },
            {
              begriff: "Für andere buchen",
              text: "Admin und Bearbeiter dürfen das. Es steht mit Zeitpunkt und Person im Änderungsprotokoll — die Person sieht die Buchung in ihrer eigenen Liste.",
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="pdf"
        titel="Filtern und nachweisen"
        vorspann="Welche Zeiten angezeigt werden — und was davon ins PDF geht."
      >
        <Begriffe
          paare={[
            {
              begriff: "Zeitraum",
              text: "„Von“ und „bis“ stehen über den Zahlen. Ohne Angabe kommt alles — es gibt keinen Filter auf den laufenden Monat.",
            },
            {
              begriff: "Arbeitspaket ändern",
              text: "„Ändern“ an einer Buchung öffnet auch das Arbeitspaket — für jede Buchung, nicht nur für die von Overhead. Ein Fehlgriff beim Start ist damit eine Auswahl und kein Löschen.",
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

function AufgabenDoku() {
  return (
    <>
      <Abschnitt
        zeichen="aufgaben"
        titel="Eine Tafel, drei Griffe"
        vorspann="Spalten nebeneinander: „Allgemein“ für das, was niemandem bestimmt gehört, und eine je Person. Alle sehen alles, und jeder darf in jede Spalte schreiben — das ist der Zweck."
      >
        <Schritte
          schritte={[
            "Oben in die Zeile schreiben und Enter drücken. Fertig — es gibt kein Formular und keinen „Speichern“-Knopf.",
            "Auf die Priorität tippen dreht sie weiter: Mittel → Hoch → Gering → Mittel. Die Liste ordnet sich sofort neu.",
            "Der Haken rechts legt die Zeile ins Erledigte am Fuß der Spalte. Ein zweiter Tipp dort holt sie zurück.",
          ]}
        />
        <Begriffe
          paare={[
            {
              begriff: "Frist",
              text: "Manche Aufgaben tragen ein Datum darunter, etwa die Abgaben des Business Plan Lite. In der letzten Woche wird es dunkel, danach rot. Bei gleicher Priorität steht die frühere Frist oben. Auf der Tafel selbst setzt man keine Frist.",
            },
          ]}
        />
        <p className="doku-text">
          Den Text ändert man, indem man hineintippt und woanders hinklickt — die Zeile
          <b> ist</b> das Eingabefeld.
        </p>
      </Abschnitt>

      <Abschnitt
        zeichen="mehr"
        titel="Spalten, die man selten braucht"
        vorspann="Jede Spalte lässt sich zu einem schmalen Streifen am rechten Rand zusammenklappen."
      >
        <p className="doku-text">
          Das merkt sich <b>der Browser, nicht das Konto</b>: Wer am eigenen Rechner eine
          Spalte zuklappt, klappt sie nicht für die anderen zu. An einem anderen Gerät
          steht sie wieder offen.
        </p>
      </Abschnitt>

      <Abschnitt
        zeichen="idee"
        titel="Die Ideenliste"
        vorspann="Eine Ebene unter der Tafel, über den Knopf „Ideenliste“ rechts oben. Dort steht, was möglich wäre und noch nicht entschieden ist — damit es die Tafel nicht zuwächst."
      >
        <Schritte
          schritte={[
            "Hineinschreiben und Enter, genau wie auf der Tafel. Die Priorität sagt hier, wie gut die Idee ist, nicht wie dringend.",
            "„Auf die Tafel“ macht aus der Idee eine Aufgabe unter „Allgemein“ — dieselbe Zeile, derselbe Text. Wer sie übernimmt, schreibt sie sich von dort in die eigene Spalte.",
            "Der Haken legt sie unter „Vom Tisch“ am Fuß der Liste. Ein zweiter Tipp dort holt sie zurück — nichts ist weg.",
          ]}
        />
        <p className="doku-text">
          Die Zahl neben dem Knopf auf der Tafel ist die Zahl der <b>offenen</b> Ideen.
          Wer wann etwas auf die Tafel geholt hat, steht im Änderungsprotokoll.
        </p>
      </Abschnitt>

      <Abschnitt
        zeichen="achtung"
        titel="Was die Tafel bewusst nicht kann"
        vorspann="Sie ist ein Zettel am Bildschirmrand, keine zweite Projektansicht."
      >
        <Begriffe
          paare={[
            {
              begriff: "Kein Datum",
              text: "Kein „fällig am“. Was dringend ist, steht auf Hoch und damit oben.",
            },
            {
              begriff: "Kein Arbeitspaket",
              text: "Eine Aufgabe hängt an keinem Paket. Projektarbeit steht unter Projekt — sonst stünde sie an zwei Orten verschieden.",
            },
            {
              begriff: "Kein Verschieben",
              text: "Eine Zeile wandert nicht in eine andere Spalte. Abhaken und drüben neu schreiben dauert zwei Sekunden. Die einzige Ausnahme ist der Weg von der Ideenliste auf die Tafel — und der endet immer bei „Allgemein“.",
            },
            {
              begriff: "Kein Wer-war-das",
              text: "Es gibt kein Feld dafür. Wer eine Zeile angelegt oder geändert hat, steht ohnehin im Änderungsprotokoll.",
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
                <b>Projektphase</b>
                <em>Ein Abschnitt mit Anfang, Ende und Pensum — auf ihn folgt der nächste.</em>
                <ul>
                  <li>
                    <b>Arbeitspaket</b>
                    <em>Hierauf läuft die Uhr. Hat Status und ein Pensum je Person.</em>
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
        titel="Pensum und Fortschritt"
        vorspann="Ein Arbeitspaket weiß, wie viele Stunden für wen vorgesehen sind. Der Balken zeigt, wie viel davon schon gebucht ist."
      >
        <p className="doku-text">
          Der Fortschritt ist <b>gebuchte Zeit gegen das Pensum</b>, sonst nichts.
          Läuft ein Paket über sein Pensum hinaus, bleibt der Balken nicht bei 100 %
          stehen, sondern wechselt die Farbe. Ein Paket ohne Pensum — ein
          Förderantrag, ein Ziel — hat keinen Balken, nur die gebuchte Zeit.
        </p>
        <Schritte
          schritte={[
            "In der Paketzeile steht die Summe über alle Personen: gebucht / Pensum · Prozent.",
            "Aufgeklappt steht das Pensum je Person — wie viel du selbst hier noch offen hast.",
            "Das Pensum selbst kommt aus dem Arbeitsplan und wird mit den Projektdaten eingespielt.",
          ]}
        />
        <Merke>
          Bis September 2026 hatte jedes Paket eine Stufenleiste (Konzept · Umsetzung ·
          Test · Abschluss). Sie ist weg: Ein Stand per Klick hat nichts gemessen.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="projekt"
        titel="Phasen auf- und zuklappen"
        vorspann="Eine Phase ist offen, läuft oder ist abgeschlossen. Aufgeklappt ist, was läuft — die anderen sagen in der Zeile, was drin ist."
      >
        <p className="doku-text">
          Den Stand stellst du unter <b>Bearbeiten</b> um. Eine abgeschlossene Phase
          nimmt keine Zeit mehr an. Pakete klappen von selbst nur auf, wenn Zeit darauf
          gebucht ist oder sie auf „läuft“ stehen.
        </p>
        <p className="doku-text">
          Das Overhead-Projekt steht <b>quer über den anderen</b>. Dort landet alles,
          was zu keinem Paket gehört: Networking, Meetings, Gespräche mit Personen. Es
          ist ein gewöhnliches Projekt — nur eines, das zu allen gehört.
        </p>
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

function MeetingsDoku() {
  return (
    <>
      <Abschnitt
        zeichen="meeting"
        titel="Eine Seite je Besprechung — vorher, währenddessen, danach"
        vorspann="Vorbereitung, Mitschrift und Protokoll stehen untereinander auf derselben Seite, in der Reihenfolge, in der sie entstehen."
      >
        <Schritte
          schritte={[
            "Meeting anlegen, sobald der Termin steht — Titel, Tag, Uhrzeit. Personen und Häuser kannst du später nachtragen.",
            "In „Vorbereitung“ eintragen, was wir aus dem Termin holen wollen. Das bleibt danach stehen: Daran misst sich, ob wir es bekommen haben.",
            "Während des Meetings in „Mitschrift“ tippen. Stichworte reichen — das Feld speichert sich von selbst, es gibt keinen Knopf dafür.",
            "Danach „Für ein LLM kopieren“ drücken, den Text bei einem Sprachmodell einfügen, das Ergebnis zurück in das Feld darunter und „Als Protokoll übernehmen“.",
            "Das Protokoll steht dann oben, in Abschnitten; Vorbereitung und Mitschrift klappen darunter zu. Jede Überschrift und jeder Text ist einzeln änderbar, Abschnitte lassen sich verschieben und ergänzen.",
            "„Verwerfen“ am Protokoll macht das Übernehmen rückgängig: Die Abschnitte gehen weg, Mitschrift und Vorbereitung stehen wieder oben, und du kannst neu aufbereiten.",
          ]}
        />
        <Merke>
          Das Feld speichert nach einer kurzen Schreibpause, beim Wegklicken und wenn du die App
          wechselst. Unter dem Feld steht, wann zuletzt gespeichert wurde. Schließt du den Tab,
          während etwas offen ist, fragt der Browser nach.
        </Merke>
      </Abschnitt>

      <Abschnitt
        zeichen="buch"
        titel="Der Weg über ein Sprachmodell"
        vorspann="SoCoS schickt nichts irgendwohin. Kopiert wird in die Zwischenablage — wohin du es einfügst, entscheidest du."
      >
        <Begriffe
          paare={[
            {
              begriff: "Was mitkopiert wird",
              text: "Die Mitschrift, die Vorbereitung, der Rahmen (Titel, Tag, wer dabei war) und der Auftrag samt Regeln: nichts erfinden, nichts weglassen, Unklares unklar lassen, keine Einleitung. Mit „Auftrag ansehen“ kannst du nachlesen, was da steht.",
            },
            {
              begriff: "Die Vorbereitung ist als Plan gekennzeichnet",
              text: "Sie steht in einem eigenen Block, und der Auftrag sagt dem Modell: Das ist der Plan, nicht das Gespräch. Daraus wird nichts „besprochen“ oder „zugesagt“, was nicht in der Mitschrift steht. Was geplant war und nicht zur Sprache kam, landet als Stichwort in einem letzten Abschnitt „Nicht zur Sprache gekommen“ — daran siehst du, ob ihr bekommen habt, wofür ihr hingegangen seid.",
            },
            {
              begriff: "Wie zerlegt wird",
              text: "An den Überschriften: Jede Zeile, die mit ## beginnt, fängt einen neuen Abschnitt an. Was vor der ersten Überschrift steht, wird ein Abschnitt ohne Titel — verloren geht nichts.",
            },
            {
              begriff: "Ein zweiter Durchlauf",
              text: "Übernimmst du noch einmal, ersetzt das neue Protokoll das alte vollständig. Vorher wird gefragt. Die Mitschrift bleibt in jedem Fall stehen — sie ist die Quelle, in der man nachsieht, wenn ein Satz zu glatt klingt.",
            },
            {
              begriff: "Verwerfen",
              text: "Der Knopf oben am Protokoll nimmt alle Abschnitte weg — auch was daran von Hand geändert wurde — und stellt die Seite so hin wie vor dem Übernehmen. Für einen einzelnen falschen Satz ist das der falsche Weg: Den änderst du im Abschnitt selbst.",
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="kontakte"
        titel="Personen nachtragen"
        vorspann="Ein Meeting hängt an nichts — es lässt sich anlegen, bevor feststeht, wer kommt."
      >
        <Begriffe
          paare={[
            {
              begriff: "Warum trotzdem eintragen",
              text: "Nur über die eingetragenen Personen und Häuser taucht das Meeting im Verlauf eines Kontakts auf. Wer es nicht nachträgt, findet das Protokoll später nur über die Meetingliste.",
            },
            {
              begriff: "Wie eintragen",
              text: "Unter „Mit wem“ in das Feld tippen — Name, Haus oder Funktion. Darunter stehen die drei besten Treffer; wer mit dem Namen anfängt, steht vor dem, der ihn nur enthält. Enter nimmt den ersten, ein Klick jeden anderen. Häuser wählst du weiter aus der Liste daneben.",
            },
            {
              begriff: "Im Verlauf",
              text: "Bei der Person und bei ihrem Haus steht das Meeting in derselben Liste wie Mails und Telefonate — mit einem Pfeil daneben, der hierher zurückführt. Geändert wird es nur hier.",
            },
            {
              begriff: "Kurze Notiz statt Meeting",
              text: "Für ein Telefonat von drei Sätzen ist ein Meeting zu viel. Das bleibt ein Verlaufseintrag beim Kontakt.",
            },
          ]}
        />
      </Abschnitt>
    </>
  );
}

function ModuleDoku() {
  return (
    <>
      <Abschnitt
        zeichen="module"
        titel="Module — was nicht zu Projekt und Zeit gehört"
        vorspann="Zusätzliche Werkzeuge stehen unter Intern · Module. Die Leiste klappt sie nur auf, solange du in einem Modul bist."
      >
        <Begriffe
          paare={[
            {
              begriff: "Die Übersicht",
              text: "Ein Klick auf „Module“ zeigt jedes Modul als Kachel: wofür es da ist, welche Teile es hat und wie weit sie sind.",
            },
            {
              begriff: "Ein Modul fehlt",
              text: "Module entstehen im Code, nicht in der Oberfläche. Wer eines braucht, meldet es unter Wünsche & Fehler.",
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt
        zeichen="akademie"
        titel="SPG Academy: Lean Model Canvas und Business Plan Lite"
        vorspann="Hier kommen die Ergebnisse aus dem Workshop hin: neun Felder, nummeriert wie in der SPG Academy, für das Vorhaben Sopharmis Arzneimittelspender."
      >
        <Schritte
          schritte={[
            "Auf ein Feld klicken. Oben steht die Aufgabe aus den Vorbereitungsvideos — was im Feld verlangt ist —, darunter die Fragen aus dem Workshop und dann deine Punkte.",
            "Enter beginnt den nächsten Punkt, Umschalt+Enter bricht innerhalb eines Punktes um. Rückschritt in einer leeren Zeile nimmt sie weg; mit Alt+↑ und Alt+↓ verschiebst du einen Punkt.",
            "Mit den Knöpfen unten im Fenster gehst du zum vorigen oder nächsten Feld. Was offen ist, wird dabei gespeichert.",
            "„PDF“ gibt die Leinwand als eine Seite A4 quer aus — zum Mitnehmen in den Workshop.",
          ]}
        />
        <Merke>
          Gespeichert wird mit „Speichern“ oder beim Weiterblättern, nicht beim Tippen. Schließt du
          das Fenster mit offenen Änderungen, wird nachgefragt.
        </Merke>
        <Begriffe
          paare={[
            {
              begriff: "Wer was darf",
              text: "Sehen dürfen alle. Punkte schreiben und streichen dürfen Admin und Bearbeiter; ein Leser sieht die Leinwand ohne Stift.",
            },
            {
              begriff: "Ein Vorhaben",
              text: "In der SPG Academy gibt es genau eines: Sopharmis Arzneimittelspender. Es hängt an keinem Projekt, und die Seite zeigt immer seine Leinwand.",
            },
            {
              begriff: "Personas",
              text: "Im Fenster zu Customer Segments, unter den Punkten: „+ Persona“ legt einen Steckbrief an — eine erfundene Person mit Alter, Geschlecht, Einkommen, Beruf, Wohnort, Haushalt, Bedürfnissen und Problemen, dazu ob sie Nutzer, Kunde oder beides ist. Ein Klick auf eine Persona öffnet ihren Steckbrief. Sie wird für sich gespeichert, unabhängig von den Punkten. Entfernen darf sie nur der Admin.",
            },
            {
              begriff: "Product und Market",
              text: "Die gestrichelte Linie in der Mitte teilt die Leinwand: links, was das Produkt betrifft, rechts den Markt. Die Zeile darunter sagt es noch einmal.",
            },
            {
              begriff: "Business Plan Lite",
              text: "Der zweite Workshop, oben umzuschalten. Geschrieben wird der Plan nicht hier, sondern im Dokument, das abgegeben wird. SoCoS zeigt oben die drei Abgaben — Version 1 am 12.10., Version 2 am 27.10., die finale Fassung am 19.11. — und darunter je Abschnitt die Fragen, die er beantworten muss.",
            },
            {
              begriff: "Stand eines Abschnitts",
              text: "Rechts neben dem Titel: offen, Entwurf oder fertig. Ein Tipp dreht weiter. Oben zählt SoCoS, wie viele Abschnitte fertig sind.",
            },
            {
              begriff: "Die Abgaben",
              text: "Sie stehen außerdem als Aufgaben mit Frist unter „Allgemein“ auf der Tafel. Abgehakt wird dort.",
            },
            {
              begriff: "Ein volles Feld im PDF",
              text: "Was nicht in seinen Kasten passt, wird kleiner gesetzt. Reicht das nicht, steht am Ende des Feldes, wie viele Punkte fehlen.",
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
