import { useState } from "react";

import { hole } from "../basis/api";
import {
  useBuchungen,
  useLaufend,
  useNeuLaden,
  useProjekte,
  useTeam,
  type Buchung,
  type Ich,
  type Projekt,
} from "../basis/daten";
import { paketgruppen } from "../basis/start";
import { Zustand } from "../basis/Zustand";
import { clockIn } from "../basis/uhr";
import { alsDauer, alsStunden } from "../basis/zeit";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Loeschdialog } from "../bausteine/Loeschdialog";

const TAG = new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
const UHRZEIT = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" });

/** Der Erste und der Letzte eines Monats als JJJJ-MM-TT. */
function monatsgrenzen(monat: string) {
  const [jahr, nr] = monat.split("-").map(Number);
  const letzter = new Date(jahr, nr, 0).getDate();
  return { von: `${monat}-01`, bis: `${monat}-${String(letzter).padStart(2, "0")}` };
}

function aktuellerMonat() {
  const jetzt = new Date();
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`;
}

/** Für datetime-local: lokale Zeit, nicht UTC — sonst springt die Anzeige. */
function fuerFeld(iso: string) {
  const d = new Date(iso);
  const versetzt = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return versetzt.toISOString().slice(0, 16);
}

export function Zeit({ ich }: { ich: Ich }) {
  const [monat, setMonat] = useState(aktuellerMonat);
  const [person, setPerson] = useState("alle");
  const [alleMonate, setAlleMonate] = useState(false);

  const grenzen = monatsgrenzen(monat);
  const filter: Record<string, string> = alleMonate ? {} : { von: grenzen.von, bis: grenzen.bis };
  if (person !== "alle") filter.person = person;

  const buchungen = useBuchungen(filter);
  const projekte = useProjekte();
  const team = useTeam();
  const laufend = useLaufend();
  const neuLaden = useNeuLaden();

  const [nachtragen, setNachtragen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Buchung | null>(null);
  const [loeschen, setLoeschen] = useState<Buchung | null>(null);

  if (!buchungen.data) return <Zustand abfrage={buchungen} erneut={() => buchungen.refetch()} />;

  const entwuerfe = buchungen.data.filter((b) => b.ist_entwurf);
  const echte = buchungen.data.filter((b) => !b.ist_entwurf);
  const gesamt = echte.reduce((s, b) => s + b.sekunden, 0);

  const nachweisPfad = (nurIch: boolean) =>
    `/api/zeitnachweis/?monat=${monat}${nurIch ? `&person=${ich.id}` : ""}`;

  async function ohnePaket() {
    await clockIn();
    neuLaden();
  }

  async function entfernen(b: Buchung) {
    await hole(`/zeiten/${b.id}/`, { method: "DELETE" });
    setLoeschen(null);
    neuLaden();
  }

  return (
    <div className="spalte">
      {entwuerfe.length > 0 && (
        <div className="karte karte-achtung">
          <h2>Bitte bestätigen</h2>
          {entwuerfe.map((b) => (
            <EntwurfZeile key={b.id} buchung={b} neuLaden={neuLaden} />
          ))}
        </div>
      )}

      <div className="karte">
        <div className="feld-reihe">
          <input
            className="feld"
            type="month"
            value={monat}
            disabled={alleMonate}
            onChange={(e) => setMonat(e.target.value)}
            aria-label="Monat"
          />
          <select className="feld" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="alle">Alle Personen</option>
            {(team.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="schalter">
            <input type="checkbox" checked={alleMonate} onChange={(e) => setAlleMonate(e.target.checked)} />
            Alle Monate
          </label>
        </div>

        <div className="summenzeile">
          <div>
            <span className="beschriftung">Gebucht{alleMonate ? " insgesamt" : ""}</span>
            <div className="wert zahl">
              {alsDauer(gesamt)}{" "}
              <span className="nebenwert">({alsStunden(gesamt)} h gerundet)</span>
            </div>
          </div>
          <div className="feld-reihe nachweis-knoepfe">
            {/* Nur, solange nichts läuft: Ein Start beendet die laufende
                Buchung, und ein Knopf, der das nebenbei tut, gehört nicht auf
                die Seite, auf der man Buchungen nachsieht. Läuft eine, steht
                der Clock-out ohnehin in der Leiste. */}
            {ich.darf.bearbeiten && !laufend.data?.laufend && (
              <button
                type="button"
                className="knopf-still"
                onClick={ohnePaket}
                title="Die Uhr läuft auf „Overhead“. Beim Clock-out kannst du sie umbuchen."
              >
                <Zeichen name="start" />
                Ohne Paket starten
              </button>
            )}
            {ich.darf.bearbeiten && (
              <button type="button" className="knopf-still" onClick={() => setNachtragen((n) => !n)}>
                <Zeichen name={nachtragen ? "kreuz" : "plus"} />
                {nachtragen ? "Schließen" : "Zeit nachtragen"}
              </button>
            )}
            <a className="knopf-still" href={nachweisPfad(true)}>
              <Zeichen name="pdf" />
              PDF · nur ich
            </a>
            <a className="knopf" href={nachweisPfad(false)}>
              <Zeichen name="pdf" />
              PDF · ganzes Team
            </a>
          </div>
        </div>
        <p className="nachweis-hinweis">
          Der Zeitnachweis nimmt immer den gewählten <b>Monat</b> ({monat.replace("-", "/")}),
          auch wenn oben „Alle Monate" steht. Nicht bestätigte Buchungen sind nicht enthalten;
          das PDF sagt es, wenn welche fehlen.
        </p>

        {nachtragen && projekte.data && (
          <Nachtragen
            projekte={projekte.data}
            fertig={() => {
              setNachtragen(false);
              neuLaden();
            }}
          />
        )}
      </div>

      <div className="karte">
        <h2>Buchungen</h2>
        {echte.length === 0 ? (
          <Leerstelle
            was={alleMonate ? "Noch keine Buchung" : "In diesem Monat keine Buchung"}
            satz="Die Uhr startet auf einem Arbeitspaket — oder oben ohne Paket, dann läuft sie auf „Overhead“. Vergessene Zeiten trägst du hier nach."
          />
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Person</th>
                <th>Projekt · Paket</th>
                <th>Von – bis</th>
                <th>Dauer</th>
                <th>Notiz</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {echte.map((b) => (
                <tr key={b.id}>
                  <td data-spalte="Tag">{TAG.format(new Date(b.start))}</td>
                  <td data-spalte="Person">{b.person_name}</td>
                  <td data-spalte="Projekt · Paket">
                    {b.projekt_titel} · {b.paket_titel}
                  </td>
                  <td data-spalte="Von – bis" className="zahl">
                    {UHRZEIT.format(new Date(b.start))} –{" "}
                    {b.ende ? UHRZEIT.format(new Date(b.ende)) : "läuft"}
                  </td>
                  <td data-spalte="Dauer" className="zahl">
                    {alsDauer(b.sekunden)}
                  </td>
                  <td data-spalte="Notiz">{b.notiz || "—"}</td>
                  <td data-spalte="" className="zeilen-aktionen">
                    {ich.darf.bearbeiten && (
                      <button type="button" className="mini" onClick={() => setBearbeiten(b)}>
                        <Zeichen name="stift" />
                        Ändern
                      </button>
                    )}
                    {ich.darf.loeschen && (
                      <button type="button" className="mini" onClick={() => setLoeschen(b)}>
                        <Zeichen name="korb" />
                        Entfernen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bearbeiten && (
        <BuchungAendern
          buchung={bearbeiten}
          projekte={projekte.data ?? []}
          schliessen={() => setBearbeiten(null)}
          fertig={() => {
            setBearbeiten(null);
            neuLaden();
          }}
        />
      )}

      {loeschen && (
        <Loeschdialog
          name={`${loeschen.paket_titel}, ${TAG.format(new Date(loeschen.start))}`}
          was="Die Buchung"
          abbrechen={() => setLoeschen(null)}
          loeschen={() => entfernen(loeschen)}
        />
      )}
    </div>
  );
}

/**
 * Eine Buchung ändern — Zeiten, Notiz **und das Arbeitspaket**.
 *
 * Das Paket war hier lange nur Text. Seit die Uhr auch ohne Paketwahl läuft,
 * ist das Umbuchen kein Sonderfall mehr, sondern der zweite Schritt des
 * gewöhnlichen Wegs: erst aufzeichnen, dann einsortieren. Und es gilt für
 * **jede** Buchung, nicht nur für die von Overhead — ein Fehlgriff beim Start
 * war vorher nur über Löschen und Nachtragen zu beheben.
 */
function BuchungAendern({
  buchung,
  projekte,
  schliessen,
  fertig,
}: {
  buchung: Buchung;
  projekte: Projekt[];
  schliessen: () => void;
  fertig: () => void;
}) {
  const [start, setStart] = useState(() => fuerFeld(buchung.start));
  const [ende, setEnde] = useState(() => (buchung.ende ? fuerFeld(buchung.ende) : ""));
  const [paket, setPaket] = useState(buchung.paket);
  const [notiz, setNotiz] = useState(buchung.notiz);
  const [fehler, setFehler] = useState("");

  // Das Paket der Buchung muss im Feld stehen bleiben, auch wenn es inzwischen
  // fertig oder verworfen ist — sonst schöbe das Speichern die Zeit still auf
  // das erstbeste andere.
  const gruppen = paketgruppen(projekte, [buchung.paket]);
  // Dasselbe wie im Notizdialog: Das Projekt steht im Feld nur als
  // Gruppenkopf und ist zugeklappt nicht zu sehen.
  const gewaehlt = gruppen.flatMap((g) => g.pakete).find((p) => p.id === paket);

  async function speichern() {
    setFehler("");
    if (ende && new Date(ende) <= new Date(start)) {
      return setFehler("Das Ende muss nach dem Beginn liegen.");
    }
    try {
      await hole(`/zeiten/${buchung.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          paket,
          start: new Date(start).toISOString(),
          ende: ende ? new Date(ende).toISOString() : null,
          notiz,
        }),
      });
      fertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das hat nicht geklappt.");
    }
  }

  return (
    <div className="dialog-grund" role="dialog" aria-modal="true" onClick={schliessen}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Buchung ändern</h2>
        <p>
          {gewaehlt ? `${gewaehlt.projekt} · ${gewaehlt.titel}` : buchung.paket_titel} ·{" "}
          {buchung.person_name}
          <br />
          Jede Änderung steht mit Zeitpunkt und Person im Änderungsprotokoll.
        </p>
        {gruppen.length > 0 && (
          <select
            className="feld"
            style={{ marginBottom: 8 }}
            value={paket}
            onChange={(e) => setPaket(Number(e.target.value))}
            aria-label="Arbeitspaket"
          >
            {gruppen.map((gruppe) => (
              <optgroup key={gruppe.projekt} label={gruppe.projekt}>
                {gruppe.pakete.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titel}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <div className="feld-reihe">
          <input className="feld" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Beginn" />
          <input className="feld" type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} aria-label="Ende" />
        </div>
        <input
          className="feld"
          style={{ marginTop: 8 }}
          value={notiz}
          placeholder="Notiz"
          onChange={(e) => setNotiz(e.target.value)}
        />
        <Fehlerzeile text={fehler} />
        <div className="dialog-knoepfe" style={{ marginTop: 14 }}>
          <button type="button" className="knopf-still" onClick={schliessen}>
            Abbrechen
          </button>
          <button type="button" className="knopf" onClick={speichern}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function EntwurfZeile({ buchung, neuLaden }: { buchung: Buchung; neuLaden: () => void }) {
  const [ende, setEnde] = useState(() => (buchung.ende ? fuerFeld(buchung.ende) : ""));
  const [fehler, setFehler] = useState("");

  async function bestaetigen() {
    // Ohne Prüfung warf `new Date("").toISOString()` einen RangeError: in der
    // Konsole ein Fehler, auf der Seite nichts. Genau der Fall, den niemand
    // meldet, weil es so aussieht, als hätte man danebengeklickt.
    if (!ende) return setFehler("Trag ein, bis wann du gearbeitet hast.");
    if (new Date(ende) <= new Date(buchung.start))
      return setFehler("Das Ende muss nach dem Beginn liegen.");
    setFehler("");
    await hole(`/zeiten/${buchung.id}/entwurf_bestaetigen/`, {
      method: "POST",
      body: JSON.stringify({ ende: new Date(ende).toISOString() }),
    });
    neuLaden();
  }

  return (
    <div className="feld-reihe" style={{ marginBottom: 10 }}>
      <div style={{ flex: "2 1 240px", fontSize: 14 }}>
        <b>{buchung.paket_titel}</b>
        <div style={{ color: "var(--text-leise)" }}>
          {TAG.format(new Date(buchung.start))}, ab {UHRZEIT.format(new Date(buchung.start))} — bis
          wann hast du gearbeitet?
        </div>
      </div>
      <input className="feld" type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} aria-label="Ende" />
      <button type="button" className="knopf" onClick={bestaetigen}>
        Bestätigen
      </button>
      <Fehlerzeile text={fehler} />
    </div>
  );
}

function Nachtragen({ projekte, fertig }: { projekte: Projekt[]; fertig: () => void }) {
  const pakete = projekte.flatMap((p) =>
    p.bereiche.flatMap((b) => b.pakete.map((k) => ({ ...k, wo: `${p.titel} · ${k.titel}` }))),
  );
  const [paket, setPaket] = useState(pakete[0]?.id ?? 0);
  const [start, setStart] = useState("");
  const [ende, setEnde] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState("");

  async function speichern() {
    setFehler("");
    if (!paket || !start || !ende) return setFehler("Paket, Beginn und Ende werden gebraucht.");
    if (new Date(ende) <= new Date(start)) return setFehler("Das Ende muss nach dem Beginn liegen.");
    try {
      await hole("/zeiten/", {
        method: "POST",
        body: JSON.stringify({
          paket,
          start: new Date(start).toISOString(),
          ende: new Date(ende).toISOString(),
          notiz,
        }),
      });
      fertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das hat nicht geklappt.");
    }
  }

  if (pakete.length === 0) {
    return (
      <Leerstelle
        was="Kein Arbeitspaket vorhanden"
        satz="Zeit hängt immer an einem Paket. Leg zuerst eines in der Projektansicht an."
      />
    );
  }

  return (
    <div className="nachtrag">
      <div className="feld-reihe">
        <select className="feld" value={paket} onChange={(e) => setPaket(Number(e.target.value))} aria-label="Arbeitspaket">
          {pakete.map((p) => (
            <option key={p.id} value={p.id}>
              {p.wo}
            </option>
          ))}
        </select>
        <input className="feld" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Beginn" />
        <input className="feld" type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} aria-label="Ende" />
      </div>
      <div className="feld-reihe" style={{ marginTop: 8 }}>
        <input className="feld" placeholder="Was hast du gemacht?" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        <button type="button" className="knopf" onClick={speichern}>
          Nachtragen
        </button>
      </div>
      <Fehlerzeile text={fehler} />
    </div>
  );
}
