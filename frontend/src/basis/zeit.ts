/**
 * Rechnen mit Zeiten — die Anzeige-Seite.
 *
 * **Gerundet wird erst in der Auswertung, nie beim Speichern.** Gespeichert
 * werden Start und Ende sekundengenau; wer beim Erfassen rundet, kann die
 * Rundung nicht mehr zurücknehmen, wenn die Regel sich ändert.
 *
 * Die maßgebliche Rundung für Berichte steht serverseitig in
 * socos/services/zeit.py. Diese hier ist für die Anzeige und muss dasselbe
 * Ergebnis liefern — beide sind getestet.
 */

export const RUNDUNG_MINUTEN = 5;

/** Sekunden als laufende Uhr: 01:23:45 */
export function alsUhr(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(s / 3600))}:${zwei(Math.floor(s / 60) % 60)}:${zwei(s % 60)}`;
}

/** Sekunden als Dauer: 3:25 (Stunden:Minuten) */
export function alsDauer(sekunden: number): string {
  const minuten = Math.floor(Math.max(0, sekunden) / 60);
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")}`;
}

/**
 * Auf volle 5 Minuten, kaufmännisch. Genau 2,5 Minuten Rest gehen auf — sonst
 * verschwände in einer Woche eine Viertelstunde, die jemand gearbeitet hat.
 */
export function aufFuenfMinuten(sekunden: number): number {
  const schritt = RUNDUNG_MINUTEN * 60;
  return Math.round(Math.max(0, sekunden) / schritt) * schritt;
}

/** Erst summieren, dann runden. Andersherum summieren sich die Rundungsfehler. */
export function summeGerundet(einzelne: number[]): number {
  return aufFuenfMinuten(einzelne.reduce((a, b) => a + b, 0));
}

/** Dezimalstunden für den Zeitnachweis: 3,25 h */
export function alsStunden(sekunden: number): string {
  return (aufFuenfMinuten(sekunden) / 3600).toFixed(2).replace(".", ",");
}

/**
 * Heute als `2026-09-08` für ein `<input type="date">`.
 *
 * Nicht `toISOString().slice(0, 10)`: Das rechnet nach UTC, und westlich von
 * Greenwich — oder hier abends nach 22 Uhr Sommerzeit — steht dann der
 * falsche Tag im Feld. Gebraucht wird der Tag der Uhr an der Wand.
 */
export function heuteAlsDatum(jetzt = new Date()): string {
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

/** Der Tag eines Zeitpunkts als `2026-09-15` — für ein `<input type="date">`. */
export function tagAusZeitpunkt(iso: string): string {
  return heuteAlsDatum(new Date(iso));
}

/** Die Uhrzeit eines Zeitpunkts als `09:02` — für ein `<input type="time">`. */
export function uhrzeitAusZeitpunkt(iso: string): string {
  const d = new Date(iso);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/**
 * Tag und Uhrzeit zu einem Zeitpunkt — aus den Bestandteilen, nicht über
 * `new Date("2026-09-15T09:02")`.
 *
 * Der Zeichenkettenweg ist in alten Safari-Fassungen als UTC gelesen worden;
 * daraus wird im Sommer eine Buchung zwei Stunden daneben, und das fällt an
 * einer einzelnen Zeile niemandem auf.
 */
export function alsZeitpunkt(tag: string, uhrzeit: string): Date {
  const [jahr, monat, tagnr] = tag.split("-").map(Number);
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  return new Date(jahr, monat - 1, tagnr, stunde, minute, 0, 0);
}

export type Spanne = { start: Date; ende: Date; ueberNacht: boolean };

/**
 * Beginn und Ende aus einem Tag und zwei Uhrzeiten.
 *
 * **Ein Ende, das nicht nach dem Beginn liegt, meint den Folgetag** — 22:00
 * bis 01:00 sind drei Stunden, keine negativen einundzwanzig. Die Oberfläche
 * schreibt den Folgetag ausdrücklich hin; stillschweigend wäre es genau die
 * Sorte Zahl, die plausibel aussieht und um einen Tag danebenliegt.
 *
 * Fehlt etwas, kommt `null` — der Aufrufer sagt dann, was fehlt.
 */
export function spanne(tag: string, von: string, bis: string): Spanne | null {
  if (!tag || !von || !bis) return null;
  const start = alsZeitpunkt(tag, von);
  let ende = alsZeitpunkt(tag, bis);
  const ueberNacht = ende <= start;
  if (ueberNacht) ende = new Date(ende.getTime() + 24 * 60 * 60_000);
  return { start, ende, ueberNacht };
}

/**
 * Eine Uhrzeit plus Minuten, als `HH:MM`. Über Mitternacht hinaus fängt sie
 * wieder bei 00:00 an — welcher Tag gemeint ist, entscheidet `spanne`.
 */
export function plusMinuten(uhrzeit: string, minuten: number): string {
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  const gesamt = (((stunde * 60 + minute + minuten) % 1440) + 1440) % 1440;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(gesamt / 60))}:${zwei(gesamt % 60)}`;
}

/**
 * Ein Zeitpunkt so kurz, wie er am Dashboard gebraucht wird: „vor 4 Min.",
 * „14:05", „gestern 17:40", „25.09. 09:12".
 *
 * Verglichen wird der **Kalendertag** an der Wand, nicht „weniger als 24
 * Stunden her" — sonst hieße 23:50 von gestern um 08:00 noch „heute".
 */
export function wannKurz(iso: string, jetzt = new Date()): string {
  const d = new Date(iso);
  const minuten = Math.floor((jetzt.getTime() - d.getTime()) / 60_000);
  const tag = heuteAlsDatum(d);
  if (tag === heuteAlsDatum(jetzt)) {
    if (minuten < 1) return "gerade eben";
    if (minuten < 60) return `vor ${minuten} Min.`;
    return uhrzeitAusZeitpunkt(iso);
  }
  const gestern = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 1);
  if (tag === heuteAlsDatum(gestern)) return `gestern ${uhrzeitAusZeitpunkt(iso)}`;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}. ${uhrzeitAusZeitpunkt(iso)}`;
}

/** Ein Monat `2026-10` um `um` Monate verschoben — über Jahresgrenzen hinweg. */
export function monatVerschieben(monat: string, um: number): string {
  const [jahr, nr] = monat.split("-").map(Number);
  const d = new Date(jahr, nr - 1 + um, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Buchungen nach Kalendertag, neuester Tag zuerst, je Tag mit seiner Summe.
 *
 * Der Tag ist der des **Beginns** an der Wand: Wer um 23:30 anfängt und bis
 * 0:30 arbeitet, findet die Buchung an dem Abend, an dem er sich hingesetzt
 * hat — so steht sie auch im Zeitnachweis.
 *
 * Entwürfe zählen nicht mit (siehe `Zeitbuchung.ist_entwurf`); die Seite
 * führt sie ohnehin getrennt.
 */
export function nachTagen<T extends { start: string; sekunden: number; ist_entwurf: boolean }>(
  buchungen: T[],
): { tag: string; sekunden: number; buchungen: T[] }[] {
  const tage = new Map<string, T[]>();
  for (const b of buchungen) {
    if (b.ist_entwurf) continue;
    const tag = tagAusZeitpunkt(b.start);
    tage.set(tag, [...(tage.get(tag) ?? []), b]);
  }
  return [...tage.entries()]
    .sort(([a], [z]) => z.localeCompare(a))
    .map(([tag, liste]) => ({
      tag,
      sekunden: liste.reduce((s, b) => s + b.sekunden, 0),
      buchungen: [...liste].sort((a, z) => z.start.localeCompare(a.start)),
    }));
}

/**
 * Ab wie viel Gebuchtem ein Werktag im Kalender der Zeitseite voll ist.
 * Eine Anzeigeschwelle, keine Regel: Geprüft oder verlangt wird damit nichts.
 */
export const VOLLER_TAG_SEKUNDEN = 8 * 3600;

/**
 * `voll` ab acht Stunden, `teil` darunter, `leer` ohne Buchung. Ohne Stufe
 * bleiben Samstag und Sonntag, alles nach heute und heute selbst, solange er
 * leer ist — der Tag ist noch nicht vorbei, und Rot um neun Uhr früh hieße
 * nichts.
 */
export type Tagesstufe = "voll" | "teil" | "leer";

export type Kalendertag = {
  tag: string;
  nummer: number;
  sekunden: number;
  wochenende: boolean;
  heute: boolean;
  zukunft: boolean;
  stufe?: Tagesstufe;
};

/**
 * Die Wochen eines Monats, Montag zuerst; Tage aus dem Monat davor und
 * danach sind `null`, damit jede Woche sieben Felder hat.
 *
 * `mitStufen` ist aus, wenn die Liste mehrere Personen zeigt: Acht Stunden
 * des ganzen Teams sind kein voller Tag von irgendwem.
 */
export function monatskalender(
  monat: string,
  summen: Map<string, number>,
  heute: string,
  mitStufen = true,
): (Kalendertag | null)[][] {
  const [jahr, nr] = monat.split("-").map(Number);
  const letzter = new Date(jahr, nr, 0).getDate();
  // getDay(): Sonntag 0 — verschoben, damit Montag vorne steht.
  const vorne = (new Date(jahr, nr - 1, 1).getDay() + 6) % 7;
  const felder: (Kalendertag | null)[] = Array(vorne).fill(null);
  for (let nummer = 1; nummer <= letzter; nummer++) {
    const tag = `${monat}-${String(nummer).padStart(2, "0")}`;
    const wochentag = new Date(jahr, nr - 1, nummer).getDay();
    const sekunden = summen.get(tag) ?? 0;
    const k: Kalendertag = {
      tag,
      nummer,
      sekunden,
      wochenende: wochentag === 0 || wochentag === 6,
      heute: tag === heute,
      zukunft: tag > heute,
    };
    if (mitStufen && !k.wochenende && !k.zukunft) {
      if (sekunden >= VOLLER_TAG_SEKUNDEN) k.stufe = "voll";
      else if (sekunden > 0) k.stufe = "teil";
      else if (!k.heute) k.stufe = "leer";
    }
    felder.push(k);
  }
  while (felder.length % 7) felder.push(null);
  const wochen: (Kalendertag | null)[][] = [];
  for (let i = 0; i < felder.length; i += 7) wochen.push(felder.slice(i, i + 7));
  return wochen;
}

/**
 * „AP02" aus „AP02 Entwicklung der Sensorik für …" — für die halbe Breite der
 * Zeitliste, wo der ganze Titel drei Zeilen frisst. Ohne Nummer vorne bleibt
 * der Titel, wie er ist; die Liste schneidet ihn dann nach einer Zeile ab.
 */
export function paketkuerzel(titel: string): string {
  const treffer = /^\s*(AP\s?\d+(?:\.\d+)*)\b/i.exec(titel);
  return treffer ? treffer[1].replace(/\s/g, "").toUpperCase() : titel;
}
