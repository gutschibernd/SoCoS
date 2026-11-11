/**
 * Praktikanten · To-Dos: kleine Arbeitspakete, die wir jetzt aufschreiben,
 * damit sich Praktikanten später eines heraussuchen können, wenn ihre
 * Hauptaufgabe ruht. Getrennt von den Haupt-Aufgabenstellungen — eigenes
 * Modell, eigene Liste (`Nebenaufgabe` in socos/models.py).
 *
 * **Gruppiert nach Umfang, das Kleinste zuerst.** Wer ein To-Do heraussucht,
 * fragt zuerst, wie viel Zeit er hat. Die Gruppe trägt die Farbe ihrer Stufe
 * an der Kante und die Stufe als Balken; die Zahl der gefüllten Balken sagt
 * dasselbe ohne Farbe.
 *
 * **Erledigte stehen hinter dem Umschalter „Erledigt"**, wie das Archiv der
 * Themen: Zustand der Seite, kein Weg.
 */

import { useEffect, useState, type ReactNode } from "react";

import { hole } from "../basis/api";
import { datumIn } from "../basis/aufgaben";
import { useNebenaufgaben, useNeuLaden, type Ich, type Nebenaufgabe, type Umfang } from "../basis/daten";
import { melden } from "../basis/meldungen";
import { UMFAENGE, nachUmfang, todoZahl } from "../basis/module";
import { Zustand } from "../basis/Zustand";
import { Loeschdialog } from "../bausteine/Loeschdialog";
import { Zeichen } from "../bausteine/Zeichen";

type Fenster = null | "neu" | Nebenaufgabe;

const tagText = (d: string) => d.split("-").map(Number).reverse().join(".");

export function Todos({ ich, umschalter }: { ich: Ich; umschalter: ReactNode }) {
  const todos = useNebenaufgaben();
  const [fenster, setFenster] = useState<Fenster>(null);
  const [zeigeErledigt, setZeigeErledigt] = useState(false);

  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!todos.data) return <Zustand abfrage={todos} erneut={() => todos.refetch()} />;

  const offen = todos.data.filter((t) => !t.erledigt_am);
  const erledigt = todos.data.filter((t) => t.erledigt_am);
  const liste = zeigeErledigt ? erledigt : offen;
  const darf = ich.darf.bearbeiten;

  const neu = darf && (
    <button type="button" className="knopf" onClick={() => setFenster("neu")}>
      <Zeichen name="plus" />
      To-Do
    </button>
  );

  const erledigtKnopf = (zeigeErledigt || erledigt.length > 0) && (
    <button
      type="button"
      className="knopf-still"
      aria-pressed={zeigeErledigt}
      onClick={() => setZeigeErledigt((z) => !z)}
    >
      <Zeichen name="haken" />
      Erledigt <span className="zahl">{erledigt.length}</span>
    </button>
  );

  return (
    <div className="spalte">
      {umschalter}
      <div className="vorhabenleiste">
        <div className="vorhaben-kopf">
          <b>{zeigeErledigt ? "To-Dos · Erledigt" : "To-Dos"}</b>
          <span>{todoZahl(liste.length)}</span>
        </div>
        {(liste.length > 0 || erledigtKnopf) && (
          <div className="vorhaben-aktionen">
            {erledigtKnopf}
            {!zeigeErledigt && liste.length > 0 && neu}
          </div>
        )}
      </div>

      {liste.length === 0 && zeigeErledigt ? (
        <div className="karte leerstelle">
          <b>Noch nichts erledigt</b>
          <p>Abgehakt wird in der Liste, mit dem Haken rechts.</p>
          <button type="button" className="knopf-still" onClick={() => setZeigeErledigt(false)}>
            Zu den offenen To-Dos
          </button>
        </div>
      ) : liste.length === 0 ? (
        <div className="karte leerstelle">
          <b>Noch kein To-Do</b>
          <p>Was Praktikanten nebenbei erledigen könnten — ein Titel und wie groß es ist, genügt.</p>
          {neu}
        </div>
      ) : (
        nachUmfang(liste).map((gruppe) => (
          <section key={gruppe.umfang.wert} className="karte todo-gruppe" data-stufe={gruppe.umfang.stufe}>
            <h2 className="todo-gruppe-kopf">
              <Umfangsmass stufe={gruppe.umfang.stufe} />
              {gruppe.umfang.titel}
              <span className="zahl">{gruppe.todos.length}</span>
            </h2>
            <ul className="todo-liste">
              {gruppe.todos.map((t) => (
                <Todozeile key={t.id} todo={t} darf={darf} bearbeiten={() => setFenster(t)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {fenster !== null && (
        <Todofenster
          todo={fenster === "neu" ? null : fenster}
          darfLoeschen={ich.darf.loeschen}
          schliessen={() => setFenster(null)}
        />
      )}
    </div>
  );
}

/** Die Stufe als vier Balken, steigend wie bei einem Empfangszeichen. */
export function Umfangsmass({ stufe }: { stufe: 1 | 2 | 3 | 4 }) {
  return (
    <span className="umfang-mass" data-stufe={stufe} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Todozeile({ todo, darf, bearbeiten }: { todo: Nebenaufgabe; darf: boolean; bearbeiten: () => void }) {
  const text = (
    <>
      <b>{todo.titel}</b>
      {todo.beschreibung.trim() && <span>{todo.beschreibung}</span>}
      {todo.erledigt_am && <em>erledigt am {tagText(todo.erledigt_am)}</em>}
    </>
  );
  return (
    <li>
      {/* Ein Knopf, kein Link: Das To-Do hat keine eigene Seite — was es
          zu sagen hat, steht in der Zeile, und ein Klick öffnet es zum
          Bearbeiten. Wer nicht bearbeiten darf, liest nur. */}
      {darf ? (
        <button type="button" className="todo-text" onClick={bearbeiten}>
          {text}
        </button>
      ) : (
        <div className="todo-text">{text}</div>
      )}
      {darf && <ErledigtKnopf todo={todo} />}
    </li>
  );
}

/**
 * Abhaken oder wieder aufmachen. Gibt zurück, ob es geklappt hat; den Grund
 * eines Fehlers hat `hole` schon gemeldet.
 */
async function abhaken(todo: Nebenaufgabe, erledigt: boolean, neuLaden: () => void): Promise<boolean> {
  try {
    await hole(`/nebenaufgaben/${todo.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ erledigt_am: erledigt ? datumIn(0) : null }),
    });
    neuLaden();
    melden("gut", erledigt ? `„${todo.titel}“ ist erledigt.` : `„${todo.titel}“ ist wieder offen.`);
    return true;
  } catch {
    return false;
  }
}

function ErledigtKnopf({ todo }: { todo: Nebenaufgabe }) {
  const neuLaden = useNeuLaden();
  const [laeuft, setLaeuft] = useState(false);
  const erledigen = !todo.erledigt_am;
  const beschriftung = erledigen ? "Erledigt" : "Wieder offen";
  return (
    <button
      type="button"
      className="knopf-still todo-haken"
      disabled={laeuft}
      aria-label={`${beschriftung}: ${todo.titel}`}
      title={beschriftung}
      onClick={async () => {
        setLaeuft(true);
        await abhaken(todo, erledigen, neuLaden);
        setLaeuft(false);
      }}
    >
      <Zeichen name={erledigen ? "haken" : "hoch"} />
      <span className="art-text">{beschriftung}</span>
    </button>
  );
}

/* --- Anlegen und bearbeiten ------------------------------------------------ */

type Entwurf = { titel: string; umfang: Umfang | null; beschreibung: string };

/**
 * Titel, Umfang, Beschreibung — in einem Fenster, wie bei den Themen.
 *
 * **Der Umfang hat keine Vorgabe.** Eine vorgewählte Stufe würde beim
 * schnellen Aufschreiben einfach stehen bleiben, und dann stünde die Hälfte
 * der Liste unter „Ein Vormittag", ohne dass es jemand so gemeint hätte.
 */
function Todofenster({
  todo,
  darfLoeschen,
  schliessen,
}: {
  todo: Nebenaufgabe | null;
  darfLoeschen: boolean;
  schliessen: () => void;
}) {
  const neuLaden = useNeuLaden();
  const anfang: Entwurf = {
    titel: todo?.titel ?? "",
    umfang: todo?.umfang ?? null,
    beschreibung: todo?.beschreibung ?? "",
  };
  const [entwurf, setEntwurf] = useState<Entwurf>(anfang);
  const [laeuft, setLaeuft] = useState(false);
  const [fragtVerwerfen, setFragtVerwerfen] = useState(false);
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  const setze = (teil: Partial<Entwurf>) => setEntwurf((alt) => ({ ...alt, ...teil }));
  const geaendert = (Object.keys(anfang) as (keyof Entwurf)[]).some((k) => anfang[k] !== entwurf[k]);
  const bereit = entwurf.titel.trim() !== "" && entwurf.umfang !== null && geaendert;

  async function speichern() {
    if (!bereit || laeuft) return;
    setLaeuft(true);
    const daten = { titel: entwurf.titel.trim(), umfang: entwurf.umfang, beschreibung: entwurf.beschreibung.trim() };
    try {
      await hole(todo ? `/nebenaufgaben/${todo.id}/` : "/nebenaufgaben/", {
        method: todo ? "PATCH" : "POST",
        body: JSON.stringify(daten),
      });
      neuLaden();
      melden("gut", `„${daten.titel}“ ist gespeichert.`);
      schliessen();
    } catch {
      // Das Fenster bleibt offen — sonst wäre mit der Fehlermeldung auch der Text weg.
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!todo) return;
    setLaeuft(true);
    try {
      await hole(`/nebenaufgaben/${todo.id}/`, { method: "DELETE" });
      neuLaden();
      schliessen();
    } catch {
      setLaeuft(false);
      setFragtLoeschen(false);
    }
  }

  async function alsErledigt() {
    if (!todo) return;
    setLaeuft(true);
    if (await abhaken(todo, true, neuLaden)) return schliessen();
    setLaeuft(false);
    setFragtLoeschen(false);
  }

  const zurueck = () => (geaendert ? setFragtVerwerfen(true) : schliessen());

  useEffect(() => {
    const beiEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || fragtLoeschen) return;
      if (fragtVerwerfen) setFragtVerwerfen(false);
      else if (!laeuft) zurueck();
    };
    window.addEventListener("keydown", beiEscape);
    return () => window.removeEventListener("keydown", beiEscape);
  });

  return (
    <>
      <div className="dialog-grund" role="dialog" aria-modal="true" aria-label="To-Do" onClick={zurueck}>
        <form
          className="dialog dialog-arbeit"
          noValidate
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
        >
          <div className="dialog-kopf">
            <div className="dialog-kopf-text">
              <h2>{todo ? todo.titel : "Neues To-Do"}</h2>
              {geaendert && <span className="dialog-offen">Nicht gespeichert</span>}
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={zurueck} disabled={laeuft}>
                Abbrechen
              </button>
              <button type="submit" className="knopf" disabled={laeuft || !bereit}>
                Speichern
              </button>
            </div>
          </div>

          <div className="dialog-koerper thema-felder">
            <label className="profilfeld">
              <span className="beschriftung-klein">Titel</span>
              <input
                className="feld"
                value={entwurf.titel}
                maxLength={160}
                autoFocus={!todo}
                placeholder="z. B. LinkedIn-Seite anlegen"
                onChange={(e) => setze({ titel: e.target.value })}
              />
            </label>
            <div className="profilfeld">
              <span className="beschriftung-klein" id="todo-umfang">
                Umfang
              </span>
              <div className="umfangswahl" role="radiogroup" aria-labelledby="todo-umfang">
                {UMFAENGE.map((u) => (
                  <button
                    key={u.wert}
                    type="button"
                    role="radio"
                    aria-checked={entwurf.umfang === u.wert}
                    data-stufe={u.stufe}
                    onClick={() => setze({ umfang: u.wert })}
                  >
                    <Umfangsmass stufe={u.stufe} />
                    {u.titel}
                  </button>
                ))}
              </div>
            </div>
            <label className="profilfeld">
              <span className="beschriftung-klein">Beschreibung</span>
              <textarea
                className="feld"
                rows={4}
                value={entwurf.beschreibung}
                placeholder="Was ist zu tun, was gehört dazu?"
                onChange={(e) => setze({ beschreibung: e.target.value })}
              />
            </label>

            {todo && darfLoeschen && (
              <div className="persona-fuss">
                <button type="button" className="knopf-still" onClick={() => setFragtLoeschen(true)}>
                  <Zeichen name="korb" />
                  To-Do entfernen
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {fragtLoeschen && todo && (
        <Loeschdialog
          name={todo.titel}
          was="Das To-Do"
          folgen="Es bleibt im Änderungsprotokoll — ein Admin kann das Entfernen rückgängig machen."
          // Der mildere Weg: Ein To-Do ist selten falsch, meist bloß getan.
          milder={todo.erledigt_am ? undefined : { text: "Als erledigt abhaken", tun: alsErledigt }}
          laeuft={laeuft}
          abbrechen={() => setFragtLoeschen(false)}
          loeschen={loeschen}
        />
      )}

      {fragtVerwerfen && (
        <div className="dialog-grund" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2>Noch nicht gespeichert</h2>
            <p>Am To-Do ist etwas geändert. Wer jetzt schließt, hat wieder den Stand von vorher.</p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFragtVerwerfen(false)}>
                Weiter bearbeiten
              </button>
              <button type="button" className="knopf-still" onClick={schliessen}>
                Verwerfen
              </button>
              <button
                type="button"
                className="knopf"
                disabled={laeuft || !bereit}
                onClick={() => {
                  setFragtVerwerfen(false);
                  speichern();
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
