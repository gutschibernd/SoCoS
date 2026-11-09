import { describe, expect, it } from "vitest";

import { eventAusIcs, istIcsdatei } from "./ics";
import { tagAusZeitpunkt, uhrzeitAusZeitpunkt } from "./zeit";

/** Eine Datei, wie sie ein Kalender schickt — mit CRLF. */
const ics = (...zeilen: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", ...zeilen, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

// Die Tests laufen in der Zone des Rechners, auf dem sie laufen. Erwartet wird
// darum, was derselbe Zeitpunkt auf dessen Uhr ist — nicht fest „09:00".
const uhr = (iso: string) => uhrzeitAusZeitpunkt(iso);
const tag = (iso: string) => tagAusZeitpunkt(iso);

describe("eventAusIcs", () => {
  it("liest Titel, Ort und eine Zeit in UTC", () => {
    const e = eventAusIcs(
      ics("SUMMARY:MedTech Summit", "LOCATION:Messe Wien\\, Halle A", "DTSTART:20261110T080000Z", "DTEND:20261110T160000Z"),
    )!;
    expect(e.titel).toBe("MedTech Summit");
    expect(e.ort).toBe("Messe Wien, Halle A");
    expect(e.von).toBe(tag("2026-11-10T08:00:00Z"));
    expect(e.beginn).toBe(uhr("2026-11-10T08:00:00Z"));
    expect(e.ende).toBe(uhr("2026-11-10T16:00:00Z"));
  });

  it("rechnet eine benannte Zone um — auch den Windows-Namen aus Outlook", () => {
    // 1. Juli, Sommerzeit: 09:00 in Berlin ist 07:00 UTC.
    for (const tzid of ["Europe/Berlin", "W. Europe Standard Time", '"W. Europe Standard Time"']) {
      const e = eventAusIcs(ics("SUMMARY:x", `DTSTART;TZID=${tzid}:20260701T090000`))!;
      expect(e.beginn).toBe(uhr("2026-07-01T07:00:00Z"));
    }
    // November, Winterzeit: 09:00 in Wien ist 08:00 UTC.
    const e = eventAusIcs(ics("SUMMARY:x", "DTSTART;TZID=Europe/Vienna:20261110T090000"))!;
    expect(e.beginn).toBe(uhr("2026-11-10T08:00:00Z"));
  });

  it("nimmt eine unbekannte Zone und eine ohne Angabe als Wanduhrzeit", () => {
    expect(eventAusIcs(ics("SUMMARY:x", "DTSTART;TZID=Irgendwo:20261110T093000"))!.beginn).toBe("09:30");
    expect(eventAusIcs(ics("SUMMARY:x", "DTSTART:20261110T093000"))!.beginn).toBe("09:30");
  });

  it("ganztägig: das Ende ist der Tag danach, eintägig bleibt ohne bis", () => {
    const ein = eventAusIcs(ics("SUMMARY:x", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261111"))!;
    expect(ein).toMatchObject({ von: "2026-11-10", bis: "", beginn: "", ende: "" });

    const drei = eventAusIcs(ics("SUMMARY:x", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261113"))!;
    expect(drei).toMatchObject({ von: "2026-11-10", bis: "2026-11-12", beginn: "" });
  });

  it("mehrtägig mit Uhrzeit: letzter Tag und Ende-Uhrzeit", () => {
    const e = eventAusIcs(ics("SUMMARY:x", "DTSTART:20261110T090000", "DTEND:20261112T170000"))!;
    expect(e).toMatchObject({ von: "2026-11-10", bis: "2026-11-12", beginn: "09:00", ende: "17:00" });
  });

  it("ein Ende um Mitternacht gehört zum Tag davor und hat keine Uhrzeit", () => {
    const e = eventAusIcs(ics("SUMMARY:x", "DTSTART:20261110T180000", "DTEND:20261111T000000"))!;
    expect(e).toMatchObject({ von: "2026-11-10", bis: "", beginn: "18:00", ende: "" });
  });

  it("fügt gefaltete Zeilen zusammen und entmaskiert die Beschreibung", () => {
    const e = eventAusIcs(
      ics(
        "SUMMARY:Ein sehr langer",
        "  Titel",
        "DESCRIPTION:Erste Zeile\\nZweite\\; mit Semikolon",
        "URL:https://example.org/kongress",
        "DTSTART:20261110T090000",
      ),
    )!;
    expect(e.titel).toBe("Ein sehr langer Titel");
    expect(e.notiz).toBe("Erste Zeile\nZweite; mit Semikolon\n\nhttps://example.org/kongress");
  });

  it("ignoriert, was in einem VALARM steht", () => {
    const e = eventAusIcs(
      ics(
        "DTSTART:20261110T090000",
        "BEGIN:VALARM",
        "DESCRIPTION:Erinnerung",
        "SUMMARY:Alarm",
        "END:VALARM",
        "SUMMARY:Kongress",
      ),
    )!;
    expect(e.titel).toBe("Kongress");
    expect(e.notiz).toBe("");
  });

  it("ein Doppelpunkt in Anführungszeichen trennt nicht", () => {
    const e = eventAusIcs(ics('ORGANIZER;CN="Dr. X: Leitung":mailto:x@example.org', "SUMMARY:Ok", "DTSTART:20261110"))!;
    expect(e.titel).toBe("Ok");
  });

  it("ohne VEVENT oder ohne Beginn: null", () => {
    expect(eventAusIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBeNull();
    expect(eventAusIcs(ics("SUMMARY:ohne Zeit"))).toBeNull();
    expect(eventAusIcs("Das ist keine Einladung.")).toBeNull();
  });
});

describe("istIcsdatei", () => {
  it("erkennt am Typ oder an der Endung", () => {
    expect(istIcsdatei({ name: "invite.ics", type: "" })).toBe(true);
    expect(istIcsdatei({ name: "einladung", type: "text/calendar" })).toBe(true);
    expect(istIcsdatei({ name: "programm.pdf", type: "application/pdf" })).toBe(false);
  });
});
