/**
 * Die Tafel — Spalten nebeneinander, in jeder eine Liste. Und eine Ebene
 * darunter die **Ideenliste**.
 *
 * **Was die Tafel bewusst nicht kann:** keine Beschreibung, keine Zuordnung zu einem Arbeitspaket, kein Verschieben
 * zwischen Spalten per Ziehen. Wer einen Punkt woanders braucht, hakt ihn ab
 * und schreibt ihn dort neu — zwei Sekunden, und dafür gibt es keine zweite
 * Projektansicht neben der Projektansicht.
 *
 * Drei Griffe, und jeder ist genau ein Tipp: schreiben und Enter, auf die
 * Priorität tippen, den Haken setzen.
 *
 * **Warum die Ideenliste eine Unterseite ist und keine vierte Spalte:** Auf
 * der Tafel steht, was jetzt zu tun ist. Eine Spalte „Ideen" daneben stünde
 * jeden Tag im Blick und würde mit der Zeit länger als alle anderen zusammen —
 * und dann sieht man die Tafel nicht mehr. Sie ist dieselbe Zeile in einem
 * anderen Zustand (`ist_idee`): „Das machen wir" ist ein Klick, kein Abtippen.
 *
 * Wer eine Spalte nicht ständig braucht, klappt sie zu einem schmalen Streifen
 * zusammen. **Das merkt sich der Browser, nicht der Server:** Es ist keine
 * Auskunft über die Aufgaben, sondern darüber, wie einer von dreien gerade
 * sitzt — und am Server wäre es eine Einstellung, die alle drei teilen.
 */

import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import {
  fristText,
  ideen,
  naechstePrioritaet,
  prioritaetstext,
  spalten,
  type Spalte,
} from "../basis/aufgaben";
import type { Seite } from "../basis/router";
import { useAufgaben, useNeuLaden, useTeam, type Aufgabe, type Ich } from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";

/** Welche Spalten zugeklappt sind — je Browser, nicht je Konto. */
const SPEICHER = "socos.aufgaben.zugeklappt";

function zugeklappteLesen(): string[] {
  try {
    const roh = window.localStorage.getItem(SPEICHER);
    return roh ? (JSON.parse(roh) as string[]) : [];
  } catch {
    // Ein privates Fenster oder abgeschaltete Speicherung. Dann steht die
    // Tafel eben offen da — das ist kein Fehler, über den jemand lesen muss.
    return [];
  }
}

/** Was eine neue Zeile außer dem Text mitbekommt — Spalte oder Ideenliste. */
type Neufelder = Partial<Pick<Aufgabe, "person" | "ist_idee">>;

export function Aufgaben({
  ich,
  unter,
  wechseln,
}: {
  ich: Ich;
  unter: string | null;
  wechseln: (seite: Seite, unter?: string | null) => void;
}) {
  const liste = useAufgaben();
  const neuLaden = useNeuLaden();

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;

  /* Tafel und Ideenliste schreiben über dieselben zwei Funktionen. Der
     Unterschied steckt einzig in den Feldern, die mitgehen — nicht in einem
     zweiten Weg zum Server. */
  async function anlegen(text: string, felder: Neufelder) {
    await hole("/aufgaben/", { method: "POST", body: JSON.stringify({ text, ...felder }) });
    neuLaden();
  }

  async function speichern(aufgabe: Aufgabe, daten: Partial<Aufgabe>) {
    await hole(`/aufgaben/${aufgabe.id}/`, { method: "PATCH", body: JSON.stringify(daten) });
    neuLaden();
  }

  if (unter === "ideen")
    return (
      <Ideenliste
        aufgaben={liste.data}
        darfSchreiben={ich.darf.bearbeiten}
        anlegen={anlegen}
        speichern={speichern}
      />
    );

  return (
    <Tafel
      ich={ich}
      aufgaben={liste.data}
      wechseln={wechseln}
      anlegen={anlegen}
      speichern={speichern}
    />
  );
}

function Tafel({
  ich,
  aufgaben,
  wechseln,
  anlegen,
  speichern,
}: {
  ich: Ich;
  aufgaben: Aufgabe[];
  wechseln: (seite: Seite, unter?: string | null) => void;
  anlegen: (text: string, felder: Neufelder) => Promise<void>;
  speichern: (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
}) {
  const team = useTeam();
  const [zugeklappt, setZugeklappt] = useState<string[]>(zugeklappteLesen);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPEICHER, JSON.stringify(zugeklappt));
    } catch {
      /* Siehe oben: nicht speichern zu können ändert nichts an der Tafel. */
    }
  }, [zugeklappt]);

  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  const alle = spalten(aufgaben, team.data, ich.id);
  const istZu = (s: Spalte) => zugeklappt.includes(String(s.person));
  // Zugeklapptes wandert ans Ende — sonst stünde der schmale Streifen mitten
  // zwischen den Spalten, die man täglich braucht.
  const geordnet = [...alle.filter((s) => !istZu(s)), ...alle.filter(istZu)];
  const offeneIdeen = ideen(aufgaben).offen.length;

  function klappen(spalte: Spalte) {
    const schluessel = String(spalte.person);
    setZugeklappt((zu) =>
      zu.includes(schluessel) ? zu.filter((s) => s !== schluessel) : [...zu, schluessel],
    );
  }

  return (
    <>
      {/* Der Weg zur Ideenliste steht über der Tafel und nicht im Menü: Sie
          gehört zu den Aufgaben, und ein eigener Menüeintrag machte aus einer
          Ebene darunter eine zweite Seite daneben. Die Zahl steht dabei —
          ohne sie wäre es ein Link, hinter dem man nachsehen muss, ob sich
          das Nachsehen lohnt. */}
      <div className="tafel-wege">
        <button
          type="button"
          className="knopf-still"
          onClick={() => wechseln("aufgaben", "ideen")}
        >
          <Zeichen name="idee" />
          Ideenliste
          <span className="tafel-zahl">{offeneIdeen}</span>
        </button>
      </div>

      <div className="tafel">
        {geordnet.map((spalte) => (
          <Spaltenkarte
            key={String(spalte.person)}
            spalte={spalte}
            zu={istZu(spalte)}
            klappen={() => klappen(spalte)}
            darfSchreiben={ich.darf.bearbeiten}
            anlegen={anlegen}
            speichern={speichern}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Die Ideenliste: **eine** Liste, keine Spalten.
 *
 * Eine Idee gehört niemandem — wer sie macht, ist ja gerade die Frage, die
 * noch offen ist. Spalten je Person hießen, sie schon beantwortet zu haben.
 *
 * Zwei Knöpfe am Ende jeder Zeile, und beide beantworten dieselbe Frage:
 * „Auf die Tafel" heißt ja, der Haken heißt nein. Was auf die Tafel wandert,
 * landet in „Allgemein" — wer sie übernimmt, schreibt sie sich von dort in
 * seine Spalte, genau wie bei jeder anderen Aufgabe auch. Eine Personenauswahl
 * an dieser Stelle wäre der einzige Ort in der Anwendung, an dem eine Aufgabe
 * doch die Spalte wechselt.
 */
function Ideenliste({
  aufgaben,
  darfSchreiben,
  anlegen,
  speichern,
}: {
  aufgaben: Aufgabe[];
  darfSchreiben: boolean;
  anlegen: (text: string, felder: Neufelder) => Promise<void>;
  speichern: (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
}) {
  const { offen, vomTisch } = ideen(aufgaben);

  return (
    <div className="ideenliste">
      <section className="karte">
        {darfSchreiben && (
          <Neuzeile
            anlegen={(text) => anlegen(text, { ist_idee: true })}
            platzhalter="Was wäre möglich?"
            beschriftung="Neue Idee"
          />
        )}

        {offen.length === 0 ? (
          <Leerstelle
            was="Noch keine Idee aufgeschrieben"
            satz={
              darfSchreiben
                ? "Hier steht, was uns eingefallen ist und noch nicht entschieden. Oben hineinschreiben und Enter drücken."
                : "Hier steht, was uns eingefallen ist und noch nicht entschieden ist."
            }
          />
        ) : (
          <ul className="aufgabenliste">
            {offen.map((idee) => (
              <Zeile
                key={idee.id}
                aufgabe={idee}
                darfSchreiben={darfSchreiben}
                speichern={speichern}
              />
            ))}
          </ul>
        )}

        {vomTisch.length > 0 && (
          <details className="klappkarte tafel-erledigt">
            <summary>
              <Zeichen name="zeiger" klasse="zeiger-klapp" />
              <span className="klapptitel">Vom Tisch</span>
              <span className="tafel-zahl">{vomTisch.length}</span>
            </summary>
            <ul className="aufgabenliste">
              {vomTisch.map((idee) => (
                <Zeile
                  key={idee.id}
                  aufgabe={idee}
                  darfSchreiben={darfSchreiben}
                  speichern={speichern}
                />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function Spaltenkarte({
  spalte,
  zu,
  klappen,
  darfSchreiben,
  anlegen,
  speichern,
}: {
  spalte: Spalte;
  zu: boolean;
  klappen: () => void;
  darfSchreiben: boolean;
  anlegen: (text: string, felder: Neufelder) => Promise<void>;
  speichern: (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
}) {
  /* Der Vorname reicht: In der Spaltenüberschrift steht daneben das Kürzel in
     der Farbe der Person, und drei Leute verwechselt niemand. Der volle Name
     bräuchte die Breite, die die Aufgaben brauchen. */
  const kurz = spalte.person === null ? spalte.titel : spalte.titel.split(" ")[0];

  if (zu) {
    return (
      <button
        type="button"
        className="tafel-streifen"
        onClick={klappen}
        aria-expanded={false}
        title={`${spalte.titel} aufklappen`}
      >
        {spalte.initialen ? (
          <i className="kuerzel" style={{ background: spalte.farbe }}>
            {spalte.initialen}
          </i>
        ) : (
          <i className="kuerzel kuerzel-leer">∙</i>
        )}
        <span className="tafel-streifen-name">{kurz}</span>
        <span className="tafel-zahl">{spalte.offen.length}</span>
      </button>
    );
  }

  return (
    <section className="karte tafel-spalte">
      <div className="tafel-kopf">
        {spalte.initialen && (
          <i className="kuerzel" style={{ background: spalte.farbe }}>
            {spalte.initialen}
          </i>
        )}
        <h2>{kurz}</h2>
        <span className="tafel-zahl">{spalte.offen.length}</span>
        <button
          type="button"
          className="mini tafel-klappen"
          onClick={klappen}
          aria-expanded
          aria-label={`${spalte.titel} zuklappen`}
          title="Zuklappen — bleibt so, bis du sie wieder aufklappst"
        >
          <Zeichen name="zeiger" />
        </button>
      </div>

      {darfSchreiben && (
        <Neuzeile
          anlegen={(text) => anlegen(text, { person: spalte.person })}
          platzhalter="Was ist zu tun?"
          beschriftung="Neue Aufgabe"
        />
      )}

      {spalte.offen.length === 0 ? (
        <Leerstelle
          was="Nichts offen"
          satz={
            darfSchreiben
              ? "Oben hineinschreiben und Enter drücken."
              : "Hier steht nichts an."
          }
        />
      ) : (
        <ul className="aufgabenliste">
          {spalte.offen.map((aufgabe) => (
            <Zeile
              key={aufgabe.id}
              aufgabe={aufgabe}
              darfSchreiben={darfSchreiben}
              speichern={speichern}
            />
          ))}
        </ul>
      )}

      {spalte.erledigt.length > 0 && (
        <details className="klappkarte tafel-erledigt">
          <summary>
            <Zeichen name="zeiger" klasse="zeiger-klapp" />
            <span className="klapptitel">Erledigt</span>
            <span className="tafel-zahl">{spalte.erledigt.length}</span>
          </summary>
          <ul className="aufgabenliste">
            {spalte.erledigt.map((aufgabe) => (
              <Zeile
                key={aufgabe.id}
                aufgabe={aufgabe}
                darfSchreiben={darfSchreiben}
                speichern={speichern}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Das Feld zum Schreiben — oben, immer offen, ohne „Neu"-Knopf davor.
 *
 * Nach dem Enter bleibt der Griff im Feld: Wer eine Sache aufschreibt, hat
 * meistens gleich die zweite im Kopf.
 *
 * Was außer dem Text mitgeht (Spalte oder `ist_idee`), bindet der Aufrufer —
 * das Feld selbst kennt nur Text und Enter.
 */
function Neuzeile({
  anlegen,
  platzhalter,
  beschriftung,
}: {
  anlegen: (text: string) => Promise<void>;
  platzhalter: string;
  beschriftung: string;
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || laeuft) return;
    setLaeuft(true);
    try {
      await anlegen(text.trim());
      setText("");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="tafel-neu" onSubmit={abschicken}>
      <input
        className="feld"
        value={text}
        maxLength={250}
        placeholder={platzhalter}
        aria-label={beschriftung}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="mini" disabled={!text.trim() || laeuft} aria-label={beschriftung}>
        <Zeichen name="plus" />
      </button>
    </form>
  );
}

function Zeile({
  aufgabe,
  darfSchreiben,
  speichern,
}: {
  aufgabe: Aufgabe;
  darfSchreiben: boolean;
  speichern: (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
}) {
  /* Eine Zeile für beide Listen — sie liest am `ist_idee` der Aufgabe selbst
     ab, wo sie steht. Eine zweite Zeilenkomponente daneben ginge beim nächsten
     neuen Feld auseinander, und auffallen würde es an der selteneren der
     beiden Listen zuerst nicht. */
  const [bearbeiten, setBearbeiten] = useState(false);
  const haken = aufgabe.ist_idee
    ? { zurueck: "Wieder auf die Liste", weg: "Vom Tisch" }
    : { zurueck: "Wieder offen", weg: "Erledigt" };

  return (
    <li className="aufgabe" data-erledigt={aufgabe.erledigt ? "ja" : "nein"}>
      {/* Ein Tipp dreht die Priorität weiter — kein Auswahlfeld, das erst
          aufgeht. Als Knopf mit Wort und nicht als farbiger Punkt: Was eine
          Farbe bedeutet, müsste man lernen, und zu zweit lernt man es
          verschieden. */}
      <button
        type="button"
        /* Dieselben Klassen wie die Prioritätsmarke in der Kontakteliste —
           `prio-hoch`, `prio-mittel`, `prio-gering`. Ein eigenes
           `[data-prio]`-Regelwerk daneben wäre ein zweiter Satz Farben für
           dieselbe Aussage; genau der hat hier zuerst gefehlt, und der Knopf
           stand still in der Vorgabefarbe des Browsers. */
        className={`prio prio-${aufgabe.prioritaet} aufgabe-prio`}
        disabled={!darfSchreiben || aufgabe.erledigt}
        title="Tippen ändert die Priorität"
        aria-label={`Priorität ${prioritaetstext(aufgabe.prioritaet)} — tippen zum Ändern`}
        onClick={() => speichern(aufgabe, { prioritaet: naechstePrioritaet(aufgabe.prioritaet) })}
      >
        {prioritaetstext(aufgabe.prioritaet)}
      </button>

      {/* Derselbe Baustein wie überall sonst, wo an Ort und Stelle geändert
          wird — kein zweites Eingabefeld mit eigenem Verhalten daneben. Im
          Ruhezustand ist es ein Text, der **umbricht**: In einer Spalte von
          280 px ist eine Zeile, die nach 30 Zeichen abgeschnitten wird, keine
          Aufgabe mehr, sondern ein Rätsel. */}
      <div className="aufgabe-mitte">
        {/* Ein Tipp auf den Text öffnet ein kleines Fenster mit Text und
            Frist. Anlegen bleibt eine Zeile und Enter — wer eine Frist
            braucht, tippt danach auf die Aufgabe. So bleibt der schnelle Weg
            schnell, und das seltene Feld steht nicht jedem im Weg. */}
        {darfSchreiben && !aufgabe.erledigt ? (
          <button
            type="button"
            className="inline-aendern aufgabe-text"
            title="Zum Bearbeiten tippen"
            onClick={() => setBearbeiten(true)}
          >
            {aufgabe.text}
          </button>
        ) : (
          <span className="aufgabe-text">{aufgabe.text}</span>
        )}
        {/* Die Frist steht nur da, wo es eine gibt — und nur, solange die
            Aufgabe offen ist: „3 Tage drüber" an etwas Erledigtem wäre ein
            Alarm, der nichts mehr bedeutet. */}
        {aufgabe.frist && !aufgabe.erledigt && <Frist frist={aufgabe.frist} />}
      </div>

      {bearbeiten && (
        <Aufgabendialog
          aufgabe={aufgabe}
          speichern={speichern}
          schliessen={() => setBearbeiten(false)}
        />
      )}

      {/* Nur auf der Ideenliste, und nur solange die Idee offen ist: derselbe
          Datensatz zieht auf die Tafel um. Kein Abtippen, keine neue Kennung —
          und damit bleibt im Änderungsprotokoll stehen, wer das entschieden
          hat. */}
      {aufgabe.ist_idee && !aufgabe.erledigt && (
        <button
          type="button"
          className="mini idee-uebernehmen"
          disabled={!darfSchreiben}
          title="Wandert als Aufgabe nach „Allgemein“ auf die Tafel"
          onClick={() => speichern(aufgabe, { ist_idee: false })}
        >
          Auf die Tafel
          <Zeichen name="zeiger" />
        </button>
      )}

      <button
        type="button"
        className="aufgabe-haken"
        disabled={!darfSchreiben}
        aria-pressed={aufgabe.erledigt}
        aria-label={aufgabe.erledigt ? haken.zurueck : haken.weg}
        title={aufgabe.erledigt ? haken.zurueck : haken.weg}
        onClick={() => speichern(aufgabe, { erledigt: !aufgabe.erledigt })}
      >
        <Zeichen name="haken" />
      </button>
    </li>
  );
}

function Frist({ frist }: { frist: string }) {
  const { text, drueber, bald } = fristText(frist);
  return (
    <span className="aufgabe-frist" data-lage={drueber ? "drueber" : bald ? "bald" : "spaeter"}>
      <Zeichen name="zeit" />
      {text}
    </span>
  );
}

/**
 * Das kleine Fenster zu einer Aufgabe: Text und Frist.
 *
 * Die Frist nur auf der Tafel, nicht auf der Ideenliste — eine Idee, die bis
 * zu einem Tag entschieden sein muss, ist schon eine Aufgabe.
 */
function Aufgabendialog({
  aufgabe,
  speichern,
  schliessen,
}: {
  aufgabe: Aufgabe;
  speichern: (aufgabe: Aufgabe, daten: Partial<Aufgabe>) => Promise<void>;
  schliessen: () => void;
}) {
  const [text, setText] = useState(aufgabe.text);
  const [frist, setFrist] = useState(aufgabe.frist ?? "");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [schliessen]);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || laeuft) return;
    setLaeuft(true);
    try {
      await speichern(aufgabe, {
        text: text.trim(),
        ...(aufgabe.ist_idee ? {} : { frist: frist || null }),
      });
      schliessen();
    } catch {
      // `hole` hat den Grund schon gemeldet. Das Fenster bleibt offen, damit
      // das Getippte nicht verloren geht.
      setLaeuft(false);
    }
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" onClick={schliessen}>
      <form className="dialog aufgabendialog" onClick={(e) => e.stopPropagation()} onSubmit={abschicken}>
        <h2>{aufgabe.ist_idee ? "Idee bearbeiten" : "Aufgabe bearbeiten"}</h2>
        <label className="profilfeld">
          <span className="beschriftung-klein">{aufgabe.ist_idee ? "Idee" : "Aufgabe"}</span>
          <input
            className="feld"
            value={text}
            maxLength={250}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {!aufgabe.ist_idee && (
          <label className="profilfeld">
            <span className="beschriftung-klein">Frist</span>
            <span className="aufgabendialog-frist">
              <input
                type="date"
                className="feld"
                value={frist}
                onChange={(e) => setFrist(e.target.value)}
              />
              {/* Am iPhone hat das Datumsfeld kein Kreuz zum Leeren. */}
              {frist && (
                <button type="button" className="knopf-still" onClick={() => setFrist("")}>
                  Ohne Frist
                </button>
              )}
            </span>
          </label>
        )}
        <div className="dialog-knoepfe">
          <button type="button" className="knopf-still" onClick={schliessen}>
            Abbrechen
          </button>
          <button type="submit" className="knopf" disabled={!text.trim() || laeuft}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
