/**
 * Eine Kalendereinladung (.ics, RFC 5545) lesen, um „Neues Event" damit
 * vorauszufüllen.
 *
 * **Gelesen wird im Browser, nicht am Server.** Die Datei wird nicht
 * gespeichert — sie füllt nur das Formular, und was davon übernommen wird,
 * sieht man vor dem Anlegen. Damit gibt es nichts, das in die Sicherung
 * müsste, und keinen Weg, auf dem eine fremde Datei am Server landet.
 *
 * **Nur das erste `VEVENT`.** Eine Einladung hat eines; eine Serie
 * (`RRULE`) ist für ein Event — eine Tagung, ein Messetag — nicht gemeint,
 * also bleibt es beim ersten Termin.
 *
 * **Zeiten werden in die Uhr des Rechners umgerechnet**, wie überall sonst in
 * der Oberfläche (basis/zeit.ts). Eine Einladung aus Outlook nennt ihre Zone
 * mit Windows-Namen („W. Europe Standard Time"), die der Browser nicht kennt;
 * die gängigen stehen unten in einer Tabelle. Eine Zone, die weder dort noch
 * im Browser bekannt ist, wird als Wanduhrzeit genommen — bei Einladungen aus
 * unserer eigenen Zone stimmt das, bei fremden steht die Uhrzeit sichtbar im
 * Formular und lässt sich dort korrigieren.
 */

export type IcsEvent = {
  titel: string;
  ort: string;
  /** `2026-11-10` */
  von: string;
  /** Leer heißt eintägig — wie am Event selbst. */
  bis: string;
  /** `09:00` oder leer, wenn ganztägig. */
  beginn: string;
  ende: string;
  notiz: string;
};

/**
 * Windows-Zonennamen, wie Outlook und Teams sie schreiben, auf die Namen, die
 * der Browser kennt. Nur die, mit denen wir tatsächlich Einladungen bekommen;
 * eine fehlende fällt auf die Wanduhrzeit zurück (siehe oben).
 */
const WINDOWS_ZONEN: Record<string, string> = {
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Helsinki",
  "GTB Standard Time": "Europe/Athens",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  UTC: "UTC",
};

/** Folgezeilen (beginnen mit Leerzeichen oder Tab) gehören an die Zeile davor. */
function entfaltet(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** `\n`, `\,`, `\;` und `\\` zurück in das, was gemeint war. */
function entmaskiert(wert: string): string {
  return wert.replace(/\\([\\;,nN])/g, (_, z: string) => (z === "n" || z === "N" ? "\n" : z));
}

type Zeile = { name: string; parameter: Record<string, string>; wert: string };

function zerlegt(zeile: string): Zeile | null {
  // Der Doppelpunkt nach dem Namen trennt — einer in Anführungszeichen
  // (`TZID="Wien: Ortszeit"`, `CN="Dr. X: Leitung"`) gehört zum Parameter.
  let inAnfuehrung = false;
  let trenner = -1;
  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i];
    if (z === '"') inAnfuehrung = !inAnfuehrung;
    else if (z === ":" && !inAnfuehrung) {
      trenner = i;
      break;
    }
  }
  if (trenner < 0) return null;
  const [name, ...teile] = zeile.slice(0, trenner).split(";");
  const parameter: Record<string, string> = {};
  for (const teil of teile) {
    const gleich = teil.indexOf("=");
    if (gleich > 0) parameter[teil.slice(0, gleich).toUpperCase()] = teil.slice(gleich + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), parameter, wert: zeile.slice(trenner + 1) };
}

const zwei = (n: number) => String(n).padStart(2, "0");
const alsTag = (d: Date) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
const alsUhrzeit = (d: Date) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;

/** Wie weit die Zone `zone` zum Zeitpunkt `ms` von UTC abweicht, in Millisekunden. */
function abweichung(zone: string, ms: number): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const t = (art: string) => Number(teile.find((p) => p.type === art)?.value);
  return Date.UTC(t("year"), t("month") - 1, t("day"), t("hour"), t("minute"), t("second")) - ms;
}

type Zeitpunkt = { tag: string; uhrzeit: string } | { tag: string; ganztags: true };

/**
 * `20261110`, `20261110T090000`, `20261110T080000Z` — mit oder ohne `TZID`.
 * Herauskommen Tag und Uhrzeit auf der Uhr des Rechners.
 */
function zeitpunkt(zeile: Zeile): Zeitpunkt | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(zeile.wert.trim());
  if (!m) return null;
  const [, j, mo, t, h, mi, s, utc] = m;
  if (h === undefined) return { tag: `${j}-${mo}-${t}`, ganztags: true };

  const wand = Date.UTC(+j, +mo - 1, +t, +h, +mi, +(s ?? 0));
  const tzid = zeile.parameter.TZID;
  const zone = utc ? "UTC" : tzid ? (WINDOWS_ZONEN[tzid] ?? tzid) : null;

  let ms: number | null = null;
  if (zone) {
    try {
      // Zweimal: Die Abweichung hängt am Zeitpunkt, und um die Umstellung
      // herum ist sie für die geschätzte Zeit eine andere als für die echte.
      const erste = wand - abweichung(zone, wand);
      ms = wand - abweichung(zone, erste);
    } catch {
      // Eine Zone, die der Browser nicht kennt: Wanduhrzeit, siehe oben.
    }
  }
  const d = ms === null ? new Date(+j, +mo - 1, +t, +h, +mi, +(s ?? 0)) : new Date(ms);
  return { tag: alsTag(d), uhrzeit: alsUhrzeit(d) };
}

function tagDavor(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  return alsTag(new Date(j, m - 1, t - 1));
}

/**
 * Das erste Event der Datei, oder `null`, wenn keines drin ist — dann ist es
 * keine Einladung, und der Aufrufer sagt das.
 */
export function eventAusIcs(text: string): IcsEvent | null {
  const zeilen = entfaltet(text);
  const anfang = zeilen.findIndex((z) => z.trim().toUpperCase() === "BEGIN:VEVENT");
  if (anfang < 0) return null;

  const felder = new Map<string, Zeile>();
  let tiefe = 0;
  for (const roh of zeilen.slice(anfang + 1)) {
    const z = roh.trim();
    const gross = z.toUpperCase();
    if (gross === "END:VEVENT" && tiefe === 0) break;
    // Ein `VALARM` im Event hat eigene DESCRIPTION und eigenes Ende —
    // „Erinnerung" stünde sonst als Notiz da.
    if (gross.startsWith("BEGIN:")) tiefe += 1;
    else if (gross.startsWith("END:")) tiefe -= 1;
    else if (tiefe === 0) {
      const zeile = zerlegt(z);
      if (zeile && !felder.has(zeile.name)) felder.set(zeile.name, zeile);
    }
  }

  const start = felder.get("DTSTART") ? zeitpunkt(felder.get("DTSTART")!) : null;
  if (!start) return null;
  const ende = felder.get("DTEND") ? zeitpunkt(felder.get("DTEND")!) : null;
  const wert = (name: string) => entmaskiert(felder.get(name)?.wert ?? "").trim();

  let bis = "";
  let beginn = "";
  let endeUhr = "";
  if ("ganztags" in start) {
    // Bei ganztägigen Terminen ist DTEND der Tag *danach* (RFC 5545, 3.6.1):
    // ein Messetag am 10. endet am 11. um Mitternacht.
    if (ende && "ganztags" in ende) {
      const letzter = tagDavor(ende.tag);
      if (letzter > start.tag) bis = letzter;
    }
  } else {
    beginn = start.uhrzeit;
    if (ende && !("ganztags" in ende)) {
      // Endet es um Mitternacht, war der letzte Tag der davor.
      const letzter = ende.uhrzeit === "00:00" ? tagDavor(ende.tag) : ende.tag;
      if (letzter > start.tag) bis = letzter;
      if (ende.uhrzeit !== "00:00") endeUhr = ende.uhrzeit;
    }
  }

  const beschreibung = wert("DESCRIPTION");
  const link = wert("URL");
  const notiz = [beschreibung, link && !beschreibung.includes(link) ? link : ""].filter(Boolean).join("\n\n");

  return {
    titel: wert("SUMMARY"),
    ort: wert("LOCATION"),
    von: start.tag,
    bis,
    beginn,
    ende: endeUhr,
    notiz,
  };
}

/** Am Namen oder am Typ — macOS gibt `.ics` manchmal ohne Typ heraus. */
export function istIcsdatei(datei: { name: string; type: string }): boolean {
  return datei.type === "text/calendar" || /\.(ics|ical|ifb|icalendar)$/i.test(datei.name);
}
