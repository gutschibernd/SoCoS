import { useEffect, useRef, useState, type DragEvent } from "react";

import { hole } from "../basis/api";
import type { Anhang, Ich } from "../basis/daten";
import { groesse, istMaildatei, mailHatAnhaenge, mailkopf, mailTeilen } from "../basis/meetings";
import { melden } from "../basis/meldungen";
import { Zeichen } from "./Zeichen";

/**
 * Dateien an einem Meeting oder Event — die Mail, die zum Termin geführt hat,
 * das Programm als PDF, ein Foto vom Stand.
 *
 * **Eine Karte für beide Orte**, wie am Server ein Weg (`AnhangViewSet`).
 * Zwei Kopien liefen beim ersten Nachbessern auseinander — und die Frage nach
 * den Anhängen einer Mail fehlte dann ausgerechnet an einem der beiden.
 *
 * **Eine E-Mail als .eml hochladen, nicht als PDF:** Nur dann kennt SoCoS
 * ihren Text, zeigt ihn im Fenster und legt ihn (am Meeting) beim
 * Aufbereiten als Unterlage bei. Aus Apple Mail oder Outlook lässt sich eine Mail einfach auf
 * die Karte ziehen; sie kommt dann als .eml.
 *
 * **Hat eine Mail Anhänge, wird vorher gefragt**, ob sie mit sollen. Die Mail
 * an den Steuerberater trug Ausweiskopien und wog 16 MB; ohne Anhänge sind es
 * 46 KB, und was darin hing, steht trotzdem im Text. Weggelassen wird am
 * Server, bevor etwas abgelegt ist.
 *
 * Heruntergeladen wird über die API, hinter der Anmeldung — nicht über einen
 * offenen Pfad unter `/medien/`.
 */
export function Anhangkarte({
  anhaenge,
  pfad,
  besitzer,
  woran,
  leer,
  ich,
  neuLaden,
  zumLoeschen,
}: {
  anhaenge: Anhang[];
  /** Der Weg in der API, etwa `/meetinganhaenge/`. */
  pfad: string;
  /** Woran die Datei hängt — `feld` ist zugleich der Name im Formular. */
  besitzer: { feld: string; id: number };
  /** „am Meeting", „am Event" — für die Meldung nach dem Hochladen. */
  woran: string;
  /** Der Satz, solange nichts angehängt ist (für wen hochladen darf). */
  leer: string;
  ich: Ich;
  neuLaden: () => void;
  zumLoeschen: (auftrag: { pfad: string; name: string; was: string }) => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [darueber, setDarueber] = useState(false);
  const [gezeigt, setGezeigt] = useState<Anhang | null>(null);
  const [frage, setFrage] = useState<{ dateien: File[]; mails: string[] } | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  async function hochladen(liste: FileList | null) {
    // Erst kopieren: Das Leeren des Feldes leert auch diese Liste.
    const dateien = Array.from(liste ?? []);
    if (eingabe.current) eingabe.current.value = "";
    if (dateien.length === 0 || !ich.darf.bearbeiten) return;

    const mitAnhang: string[] = [];
    for (const datei of dateien) {
      if (istMaildatei(datei) && mailHatAnhaenge(await datei.text())) mitAnhang.push(datei.name);
    }
    if (mitAnhang.length > 0) return setFrage({ dateien, mails: mitAnhang });
    senden(dateien, false);
  }

  async function senden(dateien: File[], ohneAnhaenge: boolean) {
    setFrage(null);
    setLaeuft(true);
    let angekommen = 0;
    try {
      for (const datei of dateien) {
        const inhalt = new FormData();
        inhalt.append(besitzer.feld, String(besitzer.id));
        inhalt.append("datei", datei);
        if (ohneAnhaenge) inhalt.append("anhaenge", "ohne");
        await hole(pfad, { method: "POST", body: inhalt });
        angekommen += 1;
      }
      melden(
        "gut",
        angekommen === 1
          ? `„${dateien[0].name}“ hängt ${woran}.`
          : `${angekommen} Dateien hängen ${woran}.`,
      );
    } catch {
      // `hole` hat den Grund schon gemeldet. Was bis dahin ankam, bleibt.
    } finally {
      setLaeuft(false);
      neuLaden();
    }
  }

  const ziehen = ich.darf.bearbeiten
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDarueber(true);
        },
        onDragLeave: () => setDarueber(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDarueber(false);
          hochladen(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <div className={darueber ? "karte anhangkarte anhangkarte-darueber" : "karte anhangkarte"} {...ziehen}>
      <div className="kartenkopf">
        <h2>Anhänge</h2>
        {ich.darf.bearbeiten && (
          <label className={laeuft ? "knopf-still anhang-waehlen laeuft" : "knopf-still anhang-waehlen"}>
            <Zeichen name="plus" />
            {laeuft ? "Lädt hoch …" : "Datei oder E-Mail"}
            <input
              ref={eingabe}
              type="file"
              multiple
              disabled={laeuft}
              onChange={(e) => hochladen(e.target.files)}
            />
          </label>
        )}
      </div>

      {anhaenge.length === 0 ? (
        <p className="tabellen-hinweis" style={{ margin: 0 }}>
          {ich.darf.bearbeiten ? leer : "Noch nichts angehängt."}
        </p>
      ) : (
        <ul className="anhaenge">
          {anhaenge.map((a) => {
            const kopf = a.art === "email" ? mailkopf(a.text) : null;
            const unter = kopf ? [kopf.von, kopf.datum].filter(Boolean).join(" · ") : "";
            const inhalt = (
              <>
                <span className="anhang-name">{kopf?.betreff || a.name}</span>
                <span className="unterzeile">
                  {unter && `${unter} · `}
                  <span className="zahl">{groesse(a.groesse)}</span>
                </span>
              </>
            );
            return (
              <li key={a.id} className="anhang">
                <Zeichen name={a.art === "email" ? "brief" : "pdf"} />
                {/* Eine Mail öffnet ihr Fenster, jede andere Datei lädt
                    herunter: Eine PDF zeigt der Rechner besser als wir. */}
                {a.art === "email" ? (
                  <button type="button" className="anhang-was" onClick={() => setGezeigt(a)}>
                    {inhalt}
                  </button>
                ) : (
                  <a className="anhang-was" href={`/api${pfad}${a.id}/datei/`}>
                    {inhalt}
                  </a>
                )}
                {ich.darf.loeschen && (
                  <button
                    type="button"
                    className="mini"
                    aria-label={`${a.name} entfernen`}
                    onClick={() =>
                      zumLoeschen({ pfad: `${pfad}${a.id}/`, name: a.name, was: "Der Anhang" })
                    }
                  >
                    <Zeichen name="kreuz" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {gezeigt && (
        <Maildialog anhang={gezeigt} pfad={pfad} schliessen={() => setGezeigt(null)} />
      )}

      {frage && (
        <div className="dialog-grund" role="dialog" aria-modal="true" onClick={() => setFrage(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Anhänge mitnehmen?</h2>
            <p>
              {frage.mails.length === 1
                ? `„${frage.mails[0]}“ hat Anhänge.`
                : `${frage.mails.length} der Mails haben Anhänge.`}{" "}
              Ohne sie wird nur die Mail mit ihrem Text abgelegt; welche Anhänge es gab, steht
              dann im Text.
            </p>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf-still" onClick={() => setFrage(null)}>
                Abbrechen
              </button>
              <button type="button" className="knopf-still" onClick={() => senden(frage.dateien, false)}>
                Mit Anhängen
              </button>
              <button type="button" className="knopf" onClick={() => senden(frage.dateien, true)}>
                Ohne Anhänge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Eine angehängte Mail zum Lesen: Kopf, Text, und der Weg zur Datei. */
function Maildialog({
  anhang,
  pfad,
  schliessen,
}: {
  anhang: Anhang;
  pfad: string;
  schliessen: () => void;
}) {
  const { kopf, inhalt } = mailTeilen(anhang.text);
  const betreff = kopf.find((k) => k.name === "Betreff")?.wert || anhang.name;

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [schliessen]);

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" aria-label={betreff} onClick={schliessen}>
      <div className="dialog dialog-arbeit" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-kopf">
          <div className="dialog-kopf-text">
            <h2>{betreff}</h2>
          </div>
          <div className="dialog-knoepfe">
            <a className="knopf-still" href={`/api${pfad}${anhang.id}/datei/`}>
              <Zeichen name="pdf" />
              Herunterladen
            </a>
            <button type="button" className="knopf" onClick={schliessen}>
              Schließen
            </button>
          </div>
        </div>
        <div className="dialog-koerper">
          <dl className="mailkopf">
            {kopf
              .filter((k) => k.name !== "Betreff")
              .map((k) => (
                <div key={k.name}>
                  <dt>{k.name}</dt>
                  <dd>{k.wert}</dd>
                </div>
              ))}
          </dl>
          <div className="mailinhalt">{inhalt || "Die Mail hat keinen Text."}</div>
        </div>
      </div>
    </div>
  );
}
