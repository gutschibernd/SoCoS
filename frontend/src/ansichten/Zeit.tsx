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
  type Teammitglied,
} from "../basis/daten";
import { letztePakete, paketgruppen } from "../basis/start";
import { Zustand } from "../basis/Zustand";
import { clockIn } from "../basis/uhr";
import {
  alsDauer,
  alsStunden,
  alsZeitpunkt,
  heuteAlsDatum,
  plusMinuten,
  spanne,
  tagAusZeitpunkt,
  uhrzeitAusZeitpunkt,
} from "../basis/zeit";
import { Fehlerzeile } from "../bausteine/Fehlerzeile";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Paketwahl } from "../bausteine/Paketwahl";
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

const TAG_LANG = new Intl.DateTimeFormat("de-AT", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Die Felder einer Zeitspanne: ein Tag, zwei Uhrzeiten. */
type Spannenfelder = { tag: string; von: string; bis: string };

/** Aus einer bestehenden Buchung in die Felder. */
function ausBuchung(buchung: Buchung): Spannenfelder {
  return {
    tag: tagAusZeitpunkt(buchung.start),
    von: uhrzeitAusZeitpunkt(buchung.start),
    bis: buchung.ende ? uhrzeitAusZeitpunkt(buchung.ende) : "",
  };
}

/**
 * Die Dauern, die ein Klick einträgt. Sie ersetzen das Kopfrechnen beim Ende:
 * Wer um 9:02 angefangen hat und zwei Stunden gearbeitet hat, soll nicht
 * 11:02 ausrechnen müssen.
 */
const DAUERN = [15, 30, 60, 120, 480];

function dauername(minuten: number) {
  return minuten < 60 ? `${minuten} min` : `${minuten / 60} h`;
}

/**
 * Tag, Von, Bis — und daneben die Dauer, die dabei herauskommt.
 *
 * **Warum nicht mehr zwei `datetime-local`:** Dort steht der Tag zweimal, und
 * beide müssen stimmen; wer das Datum nur im ersten Feld ändert, bucht eine
 * Spanne über Wochen, ohne dass es auffällt. Der Tag gehört einmal hin, die
 * Uhrzeiten sind vier Zeichen — und die Dauer, um die es eigentlich geht,
 * stand vorher nirgends.
 *
 * Ein Ende vor dem Beginn meint den Folgetag (`spanne`); der Satz darunter
 * schreibt diesen Tag ausdrücklich hin.
 */
function Zeitfelder({
  felder,
  setzen,
  offenesEnde = false,
}: {
  felder: Spannenfelder;
  setzen: (felder: Spannenfelder) => void;
  /** Bei der laufenden Buchung darf „Bis" leer bleiben. */
  offenesEnde?: boolean;
}) {
  const gespannt = spanne(felder.tag, felder.von, felder.bis);

  return (
    <div className="zeitfelder">
      <label className="feldblock feldblock-tag">
        <span className="beschriftung-klein">Tag</span>
        <input
          className="feld"
          type="date"
          value={felder.tag}
          onChange={(e) => setzen({ ...felder, tag: e.target.value })}
        />
      </label>
      <label className="feldblock feldblock-uhrzeit">
        <span className="beschriftung-klein">Von</span>
        <input
          className="feld zahl"
          type="time"
          value={felder.von}
          onChange={(e) => setzen({ ...felder, von: e.target.value })}
        />
      </label>
      <label className="feldblock feldblock-uhrzeit">
        <span className="beschriftung-klein">Bis</span>
        <input
          className="feld zahl"
          type="time"
          value={felder.bis}
          onChange={(e) => setzen({ ...felder, bis: e.target.value })}
        />
      </label>
      <div className="feldblock feldblock-dauern">
        <span className="beschriftung-klein">Oder Dauer</span>
        <div className="dauern">
          {DAUERN.map((minuten) => (
            <button
              key={minuten}
              type="button"
              className="mini"
              // Ohne Beginn gibt es nichts, worauf sich die Dauer legen ließe.
              disabled={!felder.von}
              onClick={() => setzen({ ...felder, bis: plusMinuten(felder.von, minuten) })}
            >
              {dauername(minuten)}
            </button>
          ))}
        </div>
      </div>
      <p className="spannen-satz">
        {gespannt ? (
          <>
            <b className="zahl">
              {alsDauer((gespannt.ende.getTime() - gespannt.start.getTime()) / 1000)} h
            </b>
            {" am "}
            {TAG_LANG.format(gespannt.start)}
            {gespannt.ueberNacht && ` — das Ende liegt am ${TAG_LANG.format(gespannt.ende)}`}
          </>
        ) : offenesEnde && felder.tag && felder.von ? (
          "Ohne „Bis“ läuft die Buchung weiter."
        ) : (
          "Trag ein, von wann bis wann."
        )}
      </p>
    </div>
  );
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

  // Wo **ich** zuletzt gebucht habe. Das Nachtragen wählt das oberste davon
  // vor und stellt die Liste im Suchfeld voran; fremde Buchungen sagen darüber
  // nichts, auch wenn sie gerade mit in der Tabelle stehen.
  const zuletztGebucht = letztePakete(
    echte.filter((b) => b.person === ich.id),
    projekte.data ?? [],
    6,
  ).map((p) => p.id);

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
            team={team.data ?? []}
            ich={ich}
            zuletzt={zuletztGebucht}
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
  const [felder, setFelder] = useState<Spannenfelder>(() => ausBuchung(buchung));
  const [paket, setPaket] = useState(buchung.paket);
  const [notiz, setNotiz] = useState(buchung.notiz);
  const [fehler, setFehler] = useState("");

  // Das Paket der Buchung muss im Feld stehen bleiben, auch wenn es inzwischen
  // fertig oder verworfen ist — sonst schöbe das Speichern die Zeit still auf
  // das erstbeste andere.
  const gruppen = paketgruppen(projekte, [buchung.paket]);
  // Für die Kopfzeile: Sie nennt das **gewählte** Paket, nicht das gebuchte —
  // sonst widerspräche sie dem Feld, sobald jemand umbucht.
  const gewaehlt = gruppen.flatMap((g) => g.pakete).find((p) => p.id === paket);

  async function speichern() {
    setFehler("");
    if (!felder.tag || !felder.von) return setFehler("Tag und Beginn werden gebraucht.");
    const gespannt = spanne(felder.tag, felder.von, felder.bis);
    // Ohne „Bis" bleibt die Buchung offen — sie läuft dann weiter. Das gilt
    // nur für die laufende; bei jeder anderen wäre es ein zweiter Weg, die Uhr
    // zu starten.
    if (!gespannt && !buchung.laeuft) return setFehler("Trag ein, bis wann gearbeitet wurde.");
    try {
      await hole(`/zeiten/${buchung.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          paket,
          start: (gespannt?.start ?? alsZeitpunkt(felder.tag, felder.von)).toISOString(),
          ende: gespannt ? gespannt.ende.toISOString() : null,
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
          <div className="feldblock">
            <span className="beschriftung-klein">Arbeitspaket</span>
            <Paketwahl gruppen={gruppen} wert={paket} setzen={setPaket} />
          </div>
        )}
        <Zeitfelder felder={felder} setzen={setFelder} offenesEnde={buchung.laeuft} />
        <input
          className="feld"
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

/**
 * Ein abgeschnittener Clock-out, der bestätigt werden will.
 *
 * Gefragt ist **nur die Uhrzeit**: Der Tag steht fest, es ist der des Beginns.
 * Ein volles Datumsfeld daneben wäre ein zweiter Wert, der falsch sein kann,
 * ohne dass er je richtig sein müsste. Wer bis nach Mitternacht gearbeitet
 * hat, trägt die Uhrzeit nach Mitternacht ein — `spanne` legt sie dann auf den
 * Folgetag.
 */
function EntwurfZeile({ buchung, neuLaden }: { buchung: Buchung; neuLaden: () => void }) {
  const tag = tagAusZeitpunkt(buchung.start);
  const von = uhrzeitAusZeitpunkt(buchung.start);
  const [bis, setBis] = useState(() => (buchung.ende ? uhrzeitAusZeitpunkt(buchung.ende) : ""));
  const [fehler, setFehler] = useState("");

  const gespannt = spanne(tag, von, bis);

  async function bestaetigen() {
    // Ohne Prüfung warf `new Date("").toISOString()` einen RangeError: in der
    // Konsole ein Fehler, auf der Seite nichts. Genau der Fall, den niemand
    // meldet, weil es so aussieht, als hätte man danebengeklickt.
    if (!gespannt) return setFehler("Trag ein, bis wann du gearbeitet hast.");
    setFehler("");
    await hole(`/zeiten/${buchung.id}/entwurf_bestaetigen/`, {
      method: "POST",
      body: JSON.stringify({ ende: gespannt.ende.toISOString() }),
    });
    neuLaden();
  }

  return (
    <div className="feld-reihe entwurfzeile">
      <div className="entwurf-wer">
        <b>{buchung.paket_titel}</b>
        <div>
          {TAG.format(new Date(buchung.start))}, ab <span className="zahl">{von}</span> — bis wann
          hast du gearbeitet?
        </div>
      </div>
      <label className="feldblock feldblock-uhrzeit">
        <span className="beschriftung-klein">Bis</span>
        <input
          className="feld zahl"
          type="time"
          value={bis}
          onChange={(e) => setBis(e.target.value)}
        />
      </label>
      <button type="button" className="knopf" onClick={bestaetigen}>
        <Zeichen name="haken" />
        {gespannt
          ? `${alsDauer((gespannt.ende.getTime() - gespannt.start.getTime()) / 1000)} h bestätigen`
          : "Bestätigen"}
      </button>
      <Fehlerzeile text={fehler} />
    </div>
  );
}

/**
 * Wer die Zeit bekommt. Die eigene Person steht vorgewählt da — man bucht fast
 * immer für sich.
 *
 * **Mehrere sind ausdrücklich erlaubt:** An einem Meeting sitzen zwei oder
 * drei, und dieselbe Stunde dreimal einzeln nachzutragen ist dreimal dieselbe
 * Tipparbeit — mit drei Gelegenheiten, sich zu vertippen.
 */
function Personenwahl({
  team,
  ich,
  gewaehlt,
  setzen,
}: {
  team: Teammitglied[];
  ich: Ich;
  gewaehlt: number[];
  setzen: (ids: number[]) => void;
}) {
  return (
    <div className="feldblock nachtrag-wer">
      <span className="beschriftung-klein">Für wen</span>
      <div className="teamwahl">
        {team.map((m) => (
          <label key={m.id} className="schalter">
            <input
              type="checkbox"
              checked={gewaehlt.includes(m.id)}
              onChange={(e) =>
                setzen(
                  e.target.checked ? [...gewaehlt, m.id] : gewaehlt.filter((id) => id !== m.id),
                )
              }
            />
            {m.name}
            {m.id === ich.id && <span className="team-du">du</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

/** „für dich und Florian" — damit vor dem Klick dasteht, was gleich entsteht. */
function fuerWen(gewaehlt: number[], team: Teammitglied[], ich: Ich) {
  const namen = gewaehlt.map((id) =>
    id === ich.id ? "dich" : (team.find((m) => m.id === id)?.name ?? "jemanden"),
  );
  if (namen.length === 0) return "für niemanden";
  if (namen.length === 1) return `für ${namen[0]}`;
  return `für ${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/**
 * Zeit nachtragen — der Weg ohne Uhr.
 *
 * Die Person ging bis zur Fassung vom 15.09.2026 **nicht** mit: Der Server
 * verlangte sie als Pflichtfeld, und jedes Nachtragen endete mit „Dieses Feld
 * ist zwingend erforderlich" über einem Feld, das es im Formular gar nicht gab
 * (siehe `ZeitbuchungSerializer`).
 */
function Nachtragen({
  projekte,
  team,
  ich,
  zuletzt,
  fertig,
}: {
  projekte: Projekt[];
  team: Teammitglied[];
  ich: Ich;
  /** Paketnummern der letzten eigenen Buchungen, neueste zuerst. */
  zuletzt: number[];
  fertig: () => void;
}) {
  const gruppen = paketgruppen(projekte);
  const alle = gruppen.flatMap((g) => g.pakete);
  // Vorgewählt ist das zuletzt bebuchte Paket: Man bucht fast immer wieder
  // dorthin, wo man gestern gebucht hat.
  const [paket, setPaket] = useState(() => zuletzt[0] ?? alle[0]?.id ?? 0);
  const [felder, setFelder] = useState<Spannenfelder>(() => ({
    tag: heuteAlsDatum(),
    von: "",
    bis: "",
  }));
  const [personen, setPersonen] = useState<number[]>([ich.id]);
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState("");
  const [schickt, setSchickt] = useState(false);

  // Stillgelegte Konten stehen nicht zur Wahl: Auf sie zu buchen hieße, Zeit
  // an einer Person zu führen, die nicht mehr da ist.
  const aktive = team.filter((m) => m.is_active);
  const gespannt = spanne(felder.tag, felder.von, felder.bis);

  async function speichern() {
    setFehler("");
    if (!paket) return setFehler("Wähl ein Arbeitspaket.");
    if (!gespannt) return setFehler("Tag, Von und Bis werden gebraucht.");
    if (personen.length === 0) return setFehler("Für wen soll die Zeit gebucht werden?");

    setSchickt(true);
    try {
      // Eine Anfrage je Person, nacheinander — kein Sammelaufruf am Server.
      // Paket und Spanne sind für alle dieselben; was schiefgehen kann (Paket
      // weg, Spanne verdreht, Recht fehlt), trifft deshalb entweder alle oder
      // keinen. Ein zweiter Weg, auf dem Buchungen entstehen, wäre ein zweiter
      // Weg, den man beim nächsten Feld vergisst.
      for (const person of personen) {
        await hole("/zeiten/", {
          method: "POST",
          body: JSON.stringify({
            person,
            paket,
            start: gespannt.start.toISOString(),
            ende: gespannt.ende.toISOString(),
            notiz,
          }),
        });
      }
      fertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das hat nicht geklappt.");
    } finally {
      setSchickt(false);
    }
  }

  if (alle.length === 0) {
    return (
      <Leerstelle
        was="Kein Arbeitspaket vorhanden"
        satz="Zeit hängt immer an einem Paket. Leg zuerst eines in der Projektansicht an."
      />
    );
  }

  return (
    <div className="nachtrag">
      <div className="feldblock nachtrag-paket">
        <span className="beschriftung-klein">Arbeitspaket</span>
        <Paketwahl gruppen={gruppen} wert={paket} setzen={setPaket} zuletzt={zuletzt} />
      </div>

      <Zeitfelder felder={felder} setzen={setFelder} />

      {aktive.length > 1 && (
        <Personenwahl team={aktive} ich={ich} gewaehlt={personen} setzen={setPersonen} />
      )}

      <div className="feld-reihe nachtrag-abschluss">
        <input
          className="feld"
          placeholder="Was hast du gemacht?"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          aria-label="Notiz"
        />
        <button type="button" className="knopf" onClick={speichern} disabled={schickt}>
          <Zeichen name="plus" />
          {personen.length > 1 ? `${personen.length}× nachtragen` : "Nachtragen"}
        </button>
      </div>
      {aktive.length > 1 && (
        <p className="nachtrag-satz">Wird gebucht {fuerWen(personen, aktive, ich)}.</p>
      )}
      <Fehlerzeile text={fehler} />
    </div>
  );
}
