/**
 * Die Tafel — Spalten nebeneinander, in jeder eine Liste.
 *
 * **Was sie bewusst nicht kann:** kein Fälligkeitsdatum, keine Beschreibung,
 * keine Zuordnung zu einem Arbeitspaket, kein Verschieben zwischen Spalten per
 * Ziehen. Wer einen Punkt woanders braucht, hakt ihn ab und schreibt ihn dort
 * neu — zwei Sekunden, und dafür gibt es keine zweite Projektansicht neben der
 * Projektansicht.
 *
 * Drei Griffe, und jeder ist genau ein Tipp: schreiben und Enter, auf die
 * Priorität tippen, den Haken setzen.
 *
 * Wer eine Spalte nicht ständig braucht, klappt sie zu einem schmalen Streifen
 * zusammen. **Das merkt sich der Browser, nicht der Server:** Es ist keine
 * Auskunft über die Aufgaben, sondern darüber, wie einer von dreien gerade
 * sitzt — und am Server wäre es eine Einstellung, die alle drei teilen.
 */

import { useEffect, useState } from "react";

import { hole } from "../basis/api";
import { naechstePrioritaet, prioritaetstext, spalten, type Spalte } from "../basis/aufgaben";
import { useAufgaben, useNeuLaden, useTeam, type Aufgabe, type Ich } from "../basis/daten";
import { Zustand } from "../basis/Zustand";
import { Feldtext } from "../bausteine/Feldtext";
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

export function Aufgaben({ ich }: { ich: Ich }) {
  const liste = useAufgaben();
  const team = useTeam();
  const neuLaden = useNeuLaden();
  const [zugeklappt, setZugeklappt] = useState<string[]>(zugeklappteLesen);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPEICHER, JSON.stringify(zugeklappt));
    } catch {
      /* Siehe oben: nicht speichern zu können ändert nichts an der Tafel. */
    }
  }, [zugeklappt]);

  // Hinter der Prüfung auf die Daten selbst — nicht hinter isLoading oder
  // isError. Siehe basis/Zustand.tsx.
  if (!liste.data) return <Zustand abfrage={liste} erneut={() => liste.refetch()} />;
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;

  const alle = spalten(liste.data, team.data, ich.id);
  const istZu = (s: Spalte) => zugeklappt.includes(String(s.person));
  // Zugeklapptes wandert ans Ende — sonst stünde der schmale Streifen mitten
  // zwischen den Spalten, die man täglich braucht.
  const geordnet = [...alle.filter((s) => !istZu(s)), ...alle.filter(istZu)];

  function klappen(spalte: Spalte) {
    const schluessel = String(spalte.person);
    setZugeklappt((zu) =>
      zu.includes(schluessel) ? zu.filter((s) => s !== schluessel) : [...zu, schluessel],
    );
  }

  async function anlegen(text: string, person: number | null) {
    await hole("/aufgaben/", { method: "POST", body: JSON.stringify({ text, person }) });
    neuLaden();
  }

  async function speichern(aufgabe: Aufgabe, daten: Partial<Aufgabe>) {
    await hole(`/aufgaben/${aufgabe.id}/`, { method: "PATCH", body: JSON.stringify(daten) });
    neuLaden();
  }

  return (
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
  anlegen: (text: string, person: number | null) => Promise<void>;
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

      {darfSchreiben && <Neuzeile person={spalte.person} anlegen={anlegen} />}

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
 */
function Neuzeile({
  person,
  anlegen,
}: {
  person: number | null;
  anlegen: (text: string, person: number | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || laeuft) return;
    setLaeuft(true);
    try {
      await anlegen(text.trim(), person);
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
        placeholder="Was ist zu tun?"
        aria-label="Neue Aufgabe"
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        className="mini"
        disabled={!text.trim() || laeuft}
        aria-label="Aufgabe hinzufügen"
      >
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
      <Feldtext
        wert={aufgabe.text}
        aendern={darfSchreiben && !aufgabe.erledigt}
        klasse="aufgabe-text"
        speichern={(neu) => speichern(aufgabe, { text: neu })}
      />

      <button
        type="button"
        className="aufgabe-haken"
        disabled={!darfSchreiben}
        aria-pressed={aufgabe.erledigt}
        aria-label={aufgabe.erledigt ? "Wieder offen" : "Erledigt"}
        title={aufgabe.erledigt ? "Wieder auf die Liste" : "Erledigt"}
        onClick={() => speichern(aufgabe, { erledigt: !aufgabe.erledigt })}
      >
        <Zeichen name="haken" />
      </button>
    </li>
  );
}
