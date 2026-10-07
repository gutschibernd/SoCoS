/**
 * Die Förderauslastung: alle Anträge der gewählten Stände übereinander — wann
 * welches Paket läuft und wer in welchem Monat wie viele Stunden hat, gegen
 * die Kapazität hinter dem Zahnrad.
 *
 * Entwürfe lassen sich dazuschalten, damit man einen neuen Antrag um das
 * herum plant, was schon feststeht: Mit ‹ › wandert sein Beginn um einen
 * Monat, und Balken und Wärmekarte rechnen mit. Gespeichert wird das in den
 * geplanten Beginn des Antrags — derselbe Wert wie auf der Antragsseite, kein
 * zweiter daneben.
 *
 * Gerechnet wird am Server (`services/foerderung.auslastung`). Die Seite
 * zeichnet nur und summiert nichts selbst.
 */

import { useEffect, useRef, useState } from "react";

import {
  useFoerderauslastung,
  useFoerderkapazitaeten,
  useTeam,
  type Antragsstand,
  type Auslastungsperson,
  type Foerderauslastung as Auslastung,
  type Ich,
} from "../basis/daten";
import {
  ANFANGSSTAENDE,
  AUSLASTUNGSSTAENDE,
  beginnVerschieben,
  ganzeStunden,
  istJahresanfang,
  istPlanbarerBeginn,
  monatskurz,
  prozentVon,
  stapelhoehe,
  standUmschalten,
  tonVon,
  waermestufe,
} from "../basis/foerderauslastung";
import { alsStunden, antragsstandText } from "../basis/foerderungen";
import type { Seite } from "../basis/router";
import { Zustand } from "../basis/Zustand";
import { Leerstelle } from "../bausteine/Leerstelle";
import { Zeichen } from "../bausteine/Zeichen";
import { Betragsfeld, useAendern } from "./Foerderungen";

type Wechseln = (seite: Seite, unter?: string | null) => void;
type Antrag = Auslastung["antraege"][number];

const antragsweg = (a: { geber: number; programm: number; id: number }) => `foerderungen/${a.geber}/${a.programm}/${a.id}`;

export function Foerderauslastung({ ich, wechseln }: { ich: Ich; wechseln: Wechseln }) {
  const [staende, setStaende] = useState<Antragsstand[]>(ANFANGSSTAENDE);
  const [zahnrad, setZahnrad] = useState(false);
  const [monat, setMonat] = useState<string | null>(null);
  const auslastung = useFoerderauslastung(staende);
  // Hinter der Prüfung auf die Daten selbst — siehe basis/Zustand.tsx.
  if (!auslastung.data) return <Zustand abfrage={auslastung} erneut={() => auslastung.refetch()} />;
  const daten = auslastung.data;
  const leer = daten.monate.length === 0 && daten.ohne_termin.length === 0;

  return (
    <div className="fa-seite">
      <section className="karte fa-kopf">
        <div className="fa-kopfzeile">
          <div className="spannenwahl fa-standwahl" role="group" aria-label="Welche Anträge">
            {AUSLASTUNGSSTAENDE.map((s) => (
              <button
                key={s.wert}
                type="button"
                aria-pressed={staende.includes(s.wert)}
                onClick={() => setStaende(standUmschalten(staende, s.wert))}
              >
                {/* Das Muster, mit dem der Stand unten gezeichnet wird — die Legende ist der Schalter. */}
                <i className="fa-muster" data-stand={s.wert} aria-hidden />
                {s.text}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="knopf-still fa-zahnrad"
            aria-expanded={zahnrad}
            aria-label="Kapazität je Person"
            title="Kapazität je Person"
            onClick={() => setZahnrad(!zahnrad)}
          >
            <Zeichen name="zahnrad" />
            {daten.kapazitaet !== null && <span className="zahl">{alsStunden(daten.kapazitaet)}</span>}
          </button>
        </div>
        {zahnrad && <Kapazitaeten ich={ich} />}
      </section>

      {staende.length === 0 ? (
        <div className="karte">
          <Leerstelle
            was="Kein Stand gewählt"
            satz="Oben wählst du, welche Anträge übereinanderliegen — bewilligte, eingereichte und zum Planen die Entwürfe."
          />
        </div>
      ) : leer ? (
        <div className="karte">
          <Leerstelle
            was="Keine Anträge in diesen Ständen"
            satz="Schalte oben weitere Stände dazu, oder lege unter einem Programm einen Antrag an."
            aktion={{ text: "Zu den Fördergebern", tun: () => wechseln("module", "foerderungen") }}
          />
        </div>
      ) : (
        <>
          {daten.monate.length > 0 && (
            <Achse daten={daten} ich={ich} monat={monat} waehlen={(m) => setMonat(m === monat ? null : m)} wechseln={wechseln} />
          )}
          {monat && daten.monate.includes(monat) && (
            <Monatsdetail daten={daten} monat={monat} schliessen={() => setMonat(null)} />
          )}
          {daten.ohne_termin.length > 0 && <OhneTermin daten={daten} ich={ich} wechseln={wechseln} />}
        </>
      )}
    </div>
  );
}

/* --- Die Achse ------------------------------------------------------------- */

/**
 * Ein Raster für alles: Monate als Spalten, darüber der Balkenstapel, darunter
 * die Anträge mit ihren Paketen und die Personen als Wärmekarte. Jede Zeile hat
 * dieselben Spalten, damit ein Monat oben und unten an derselben Stelle steht.
 * Bei vielen Monaten rollt das Raster in seiner Karte, die Namen bleiben links.
 */
function Achse({
  daten,
  ich,
  monat,
  waehlen,
  wechseln,
}: {
  daten: Auslastung;
  ich: Ich;
  monat: string | null;
  waehlen: (monat: string) => void;
  wechseln: Wechseln;
}) {
  const hoehe = stapelhoehe(daten.je_monat, daten.kapazitaet);
  const kapazitaet = daten.kapazitaet === null ? null : Number(daten.kapazitaet);

  return (
    <section className="karte fa-achse">
      <div className="fa-rollbar">
        <div className="fa-raster" style={{ ["--n" as string]: daten.monate.length }}>
          <div className="fa-zeile fa-monatskopf">
            <span className="fa-etikett beschriftung-klein">Monat</span>
            {daten.monate.map((m, i) => (
              <button
                key={m}
                type="button"
                className="fa-monat"
                data-jahr={istJahresanfang(m) || undefined}
                aria-current={m === daten.heute ? "date" : undefined}
                aria-pressed={monat === m}
                onClick={() => waehlen(m)}
              >
                {monatskurz(m).slice(0, 3)}
                <small className="zahl">{istJahresanfang(m) || i === 0 ? m.slice(2, 4) : ""}</small>
              </button>
            ))}
          </div>

          <div className="fa-zeile fa-stapelzeile">
            <span className="fa-etikett">
              <span className="beschriftung-klein">Stunden je Monat</span>
              {kapazitaet !== null && <span className="fa-leise fa-kapazitaet-legende">Linie: Kapazität</span>}
            </span>
            {daten.monate.map((m) => (
              <button
                key={m}
                type="button"
                className="fa-saeule"
                data-jahr={istJahresanfang(m) || undefined}
                aria-pressed={monat === m}
                aria-label={`${monatskurz(m)}: ${alsStunden(daten.je_monat[m] ?? "0")}`}
                onClick={() => waehlen(m)}
              >
                {daten.antraege
                  .filter((a) => a.je_monat[m])
                  .map((a) => (
                    <i
                      key={a.id}
                      className={`fa-teil fa-ton-${tonVon(a.id)}`}
                      data-stand={a.stand}
                      style={{ ["--h" as string]: `${prozentVon(a.je_monat[m], hoehe)}%` }}
                    />
                  ))}
                {kapazitaet !== null && (
                  <span className="fa-kapazitaetslinie" style={{ ["--h" as string]: `${prozentVon(kapazitaet, hoehe)}%` }} />
                )}
              </button>
            ))}
          </div>

          <div className="fa-zeile fa-summenzeile">
            <span className="fa-etikett beschriftung-klein">
              Summe{kapazitaet !== null && <span className="fa-leise"> · Kapazität {ganzeStunden(String(kapazitaet))} h</span>}
            </span>
            {daten.monate.map((m) => {
              const summe = daten.je_monat[m];
              return (
                <span
                  key={m}
                  className="zahl"
                  data-jahr={istJahresanfang(m) || undefined}
                  data-ueber={(summe && kapazitaet !== null && Number(summe) > kapazitaet) || undefined}
                >
                  {summe ? ganzeStunden(summe) : "·"}
                </span>
              );
            })}
          </div>

          <div className="fa-zwischentitel">
            <span className="beschriftung-klein">Anträge</span>
          </div>
          {daten.antraege.map((a) => (
            <Antragsspur key={a.id} antrag={a} monate={daten.monate} ich={ich} wechseln={wechseln} />
          ))}

          <div className="fa-zwischentitel">
            <span className="beschriftung-klein">Personen</span>
          </div>
          {daten.personen.length === 0 ? (
            <div className="fa-ohne-personen">
              <span className="fa-leise">
                In diesen Anträgen sind noch keine Stunden eingetragen — das geht im aufgeklappten Paket eines Antrags.
              </span>
            </div>
          ) : (
            daten.personen.map((p) => (
              <Personenzeile key={p.schluessel} person={p} monate={daten.monate} monat={monat} waehlen={waehlen} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Ein Antrag als Spur: links Name und Stand, rechts eine Zeile je Paket. Beim
 * Drittleister zeigt eine Raute am Paketende, dass dort etwas geliefert wird.
 */
function Antragsspur({ antrag, monate, ich, wechseln }: { antrag: Antrag; monate: string[]; ich: Ich; wechseln: Wechseln }) {
  const speichern = useAendern();
  const zeilen = Math.max(1, antrag.pakete.length);
  const spalte = (m: string) => monate.indexOf(m) + 2;
  // Ein bewilligter Antrag hat seinen Beginn. Verschoben wird, was noch geplant ist.
  const schiebbar = ich.darf.bearbeiten && antrag.stand !== "bewilligt" && antrag.beginn !== null;

  return (
    <div className={`fa-spur fa-ton-${tonVon(antrag.id)}`} data-stand={antrag.stand}>
      <div className="fa-etikett fa-antragsetikett" style={{ gridRow: `1 / span ${zeilen}` }}>
        <a
          href={`/module/${antragsweg(antrag)}`}
          onClick={(e) => {
            e.preventDefault();
            wechseln("module", antragsweg(antrag));
          }}
        >
          <span className="fa-leise">{antrag.geber_name} · {antrag.programm_name}</span>
          <b>{antrag.titel}</b>
        </a>
        <span className="fa-merkmale">
          <i className="fa-muster" data-stand={antrag.stand} aria-hidden />
          {antragsstandText(antrag.stand)}
          {antrag.rolle === "drittleister" && " · Drittleister"}
          {Number(antrag.stunden) > 0 && <span className="zahl"> · {alsStunden(antrag.stunden)}</span>}
        </span>
        {schiebbar && (
          <span className="fa-schieben">
            <button
              type="button"
              className="knopf-still"
              aria-label={`${antrag.titel} einen Monat früher`}
              onClick={() => speichern(`/foerderantraege/${antrag.id}/`, { beginn: beginnVerschieben(antrag.beginn!, -1) })}
            >
              <Zeichen name="zeiger" klasse="zeiger-zurueck" />
            </button>
            <span className="zahl">
              <span className="fa-ab">ab </span>
              {monatskurz(antrag.beginn!.slice(0, 7))}
            </span>
            <button
              type="button"
              className="knopf-still"
              aria-label={`${antrag.titel} einen Monat später`}
              onClick={() => speichern(`/foerderantraege/${antrag.id}/`, { beginn: beginnVerschieben(antrag.beginn!, 1) })}
            >
              <Zeichen name="zeiger" />
            </button>
          </span>
        )}
      </div>
      {antrag.pakete.length === 0 && (
        <span className="fa-leise fa-ohne-pakete" style={{ gridRow: 1, gridColumn: "2 / -1" }}>
          Noch keine Arbeitspakete.
        </span>
      )}
      {antrag.pakete.map((p, i) => (
        <div
          key={p.id}
          className="fa-paket"
          style={{ gridRow: i + 1, gridColumn: `${spalte(p.von)} / ${spalte(p.bis) + 1}` }}
          title={`${p.titel} · ${monatskurz(p.von)}${p.bis !== p.von ? ` – ${monatskurz(p.bis)}` : ""}${
            Number(p.stunden) > 0 ? ` · ${alsStunden(p.stunden)}` : ""
          }${p.ergebnis ? ` · ${p.ergebnis}` : ""}`}
        >
          <span>{p.titel}</span>
          {antrag.rolle === "drittleister" && p.ergebnis && <i className="fa-lieferung" aria-label={`Lieferung: ${p.ergebnis}`} />}
        </div>
      ))}
    </div>
  );
}

/** Eine Person als Zeile der Wärmekarte — Stunden je Monat, die Fläche zeigt den Anteil an der Kapazität. */
function Personenzeile({
  person,
  monate,
  monat,
  waehlen,
}: {
  person: Auslastungsperson;
  monate: string[];
  monat: string | null;
  waehlen: (monat: string) => void;
}) {
  return (
    <div className="fa-zeile fa-personzeile">
      <span className="fa-etikett" title={person.voller_name}>
        <b>{person.name}</b>
        <span className="fa-leise zahl">{person.kapazitaet ? `${ganzeStunden(person.kapazitaet)} h` : "—"}</span>
      </span>
      {monate.map((m) => {
        const zelle = person.je_monat[m];
        return (
          <button
            key={m}
            type="button"
            className="fa-zelle zahl"
            data-jahr={istJahresanfang(m) || undefined}
            data-stufe={waermestufe(zelle?.stunden, zelle?.anteil)}
            aria-pressed={monat === m}
            aria-label={`${person.voller_name}, ${monatskurz(m)}: ${zelle ? alsStunden(zelle.stunden) : "nichts"}${
              zelle?.anteil ? `, ${zelle.anteil} % der Kapazität` : ""
            }`}
            onClick={() => waehlen(m)}
          >
            {zelle ? ganzeStunden(zelle.stunden) : ""}
          </button>
        );
      })}
    </div>
  );
}

/* --- Ein Monat aufgeschlüsselt --------------------------------------------- */

/** Wer in diesem Monat woran arbeitet, und was in ihm fertig wird. */
function Monatsdetail({ daten, monat, schliessen }: { daten: Auslastung; monat: string; schliessen: () => void }) {
  const karte = useRef<HTMLElement>(null);
  // Am Handy steht die Karte unter einer langen Achse — ohne das sähe man nach
  // dem Antippen nichts passieren. In geschweiften Klammern: Neuere Browser
  // geben hier ein Promise zurück, und React hielte es für die Aufräumfunktion.
  useEffect(() => {
    karte.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [monat]);

  const antraege = new Map(daten.antraege.map((a) => [a.id, a]));
  const pakete = new Map(daten.antraege.flatMap((a) => a.pakete.map((p) => [p.id, p] as const)));
  const zeilen = daten.verteilung.filter((z) => z.monat === monat);
  const personen = daten.personen.filter((p) => p.je_monat[monat]);
  const enden = daten.antraege.flatMap((a) => a.pakete.filter((p) => p.bis === monat).map((p) => ({ antrag: a, paket: p })));
  const summe = daten.je_monat[monat];

  return (
    <section className="karte fa-monatsdetail" ref={karte} aria-label={`Aufschlüsselung ${monatskurz(monat)}`}>
      <header className="fa-detailkopf">
        <h2>{monatskurz(monat)}</h2>
        <span className="zahl">
          {summe ? alsStunden(summe) : "keine Stunden"}
          {daten.kapazitaet !== null && <span className="fa-leise"> von {alsStunden(daten.kapazitaet)}</span>}
        </span>
        <button type="button" className="knopf-still fa-klein" aria-label="Schließen" onClick={schliessen}>
          <Zeichen name="kreuz" />
        </button>
      </header>

      {personen.length === 0 && <p className="fa-leise">In diesem Monat sind keine Stunden geplant.</p>}
      {personen.map((p) => {
        const zelle = p.je_monat[monat];
        return (
          <div key={p.schluessel} className="fa-detailperson">
            <div className="fa-detailzeile">
              <b>{p.voller_name}</b>
              <span className="zahl" data-ueber={waermestufe(zelle.stunden, zelle.anteil) === 4 || undefined}>
                {alsStunden(zelle.stunden)}
                {zelle.anteil && ` · ${zelle.anteil} %`}
              </span>
            </div>
            <ul>
              {zeilen
                .filter((z) => z.person === p.schluessel)
                .map((z) => {
                  const a = antraege.get(z.antrag)!;
                  return (
                    <li key={`${z.antrag}-${z.paket}`} className={`fa-ton-${tonVon(a.id)}`}>
                      <i className="fa-muster" data-stand={a.stand} aria-hidden />
                      <span>
                        {a.titel} · {pakete.get(z.paket)?.titel}
                      </span>
                      <span className="zahl">{alsStunden(z.stunden)}</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}

      {enden.length > 0 && (
        <div className="fa-detailperson">
          <div className="fa-detailzeile">
            <b>Endet in diesem Monat</b>
          </div>
          <ul>
            {enden.map(({ antrag, paket }) => (
              <li key={paket.id} className={`fa-ton-${tonVon(antrag.id)}`}>
                <i className="fa-muster" data-stand={antrag.stand} aria-hidden />
                <span>
                  {paket.titel}
                  {paket.ergebnis && <span className="fa-leise"> — {paket.ergebnis}</span>}
                </span>
                <span className="fa-leise">{antrag.geber_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* --- Anträge ohne Beginn --------------------------------------------------- */

/** Ohne Beginn kein Platz auf der Achse. Wer einen vermuteten einträgt, holt den Antrag herein. */
function OhneTermin({ daten, ich, wechseln }: { daten: Auslastung; ich: Ich; wechseln: Wechseln }) {
  const speichern = useAendern();
  return (
    <section className="karte fa-ohnetermin">
      <h2>Ohne Termin</h2>
      {daten.ohne_termin.map((a) => (
        <div key={a.id} className="fa-ohnezeile">
          <a
            href={`/module/${antragsweg(a)}`}
            onClick={(e) => {
              e.preventDefault();
              wechseln("module", antragsweg(a));
            }}
          >
            <span className="fa-leise">{a.geber_name} · {a.programm_name}</span>
            <b>{a.titel}</b>
          </a>
          <span className="fa-leise">
            {antragsstandText(a.stand)}
            {a.laufzeit > 0 && ` · ${a.laufzeit} Monate`}
            {Number(a.stunden) > 0 && <span className="zahl"> · {alsStunden(a.stunden)}</span>}
          </span>
          {ich.darf.bearbeiten && (
            <label className="fa-beginnfeld">
              <span className="beschriftung-klein">Vermuteter Beginn</span>
              {/* Beim Verlassen und nicht bei jeder Änderung: Chrome meldet das Feld
                  schon nach der ersten Ziffer der Jahreszahl als gültig — „0002-04-01" —,
                  und gespeichert wäre ein Antrag im Jahr 2. */}
              <input
                type="date"
                className="feld"
                defaultValue=""
                onBlur={(e) =>
                  istPlanbarerBeginn(e.target.value) && speichern(`/foerderantraege/${a.id}/`, { beginn: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </label>
          )}
        </div>
      ))}
    </section>
  );
}

/* --- Die Kapazität hinter dem Zahnrad -------------------------------------- */

/**
 * Wie viele Stunden im Monat jemand für Förderprojekte hat. Leer heißt: kein
 * Maßstab — dann zeigt die Wärmekarte nur die Zahl. Leeren ist Entfernen, und
 * ob das jemand darf, sagt der Server.
 */
function Kapazitaeten({ ich }: { ich: Ich }) {
  const team = useTeam();
  const kapazitaeten = useFoerderkapazitaeten();
  const speichern = useAendern();
  if (!team.data) return <Zustand abfrage={team} erneut={() => team.refetch()} />;
  if (!kapazitaeten.data) return <Zustand abfrage={kapazitaeten} erneut={() => kapazitaeten.refetch()} />;
  const vorhanden = new Map(kapazitaeten.data.map((k) => [k.nutzer, k]));

  return (
    <div className="fa-kapazitaeten">
      <span className="beschriftung-klein">Stunden je Monat für Förderprojekte</span>
      {team.data
        .filter((n) => n.is_active)
        .map((n) => {
          const k = vorhanden.get(n.id);
          return (
            <div key={n.id} className="fa-kapzeile">
              <span>
                <b>{n.initialen}</b> {n.name}
              </span>
              <Betragsfeld
                betrag={k?.stunden_je_monat ?? null}
                aendern={ich.darf.bearbeiten}
                leer="—"
                anzeigen={alsStunden}
                beschriftung={`Stunden je Monat für ${n.name}`}
                speichern={async (stunden) => {
                  if (stunden === null) return k && speichern(`/foerderkapazitaeten/${k.id}/`, null, "DELETE");
                  if (k) return speichern(`/foerderkapazitaeten/${k.id}/`, { stunden_je_monat: stunden });
                  return speichern("/foerderkapazitaeten/", { nutzer: n.id, stunden_je_monat: stunden }, "POST");
                }}
              />
            </div>
          );
        })}
    </div>
  );
}
