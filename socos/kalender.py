"""
Das Kalender-Abo: alle Events und Meetings als iCalendar-Datei (RFC 5545).

Ein Kalender (Proton, Apple, Google, Outlook) holt die Datei in eigenem Takt
ab — bei Proton alle 4 bis 16 Stunden. Es geht nur in eine Richtung: Was im
Kalender verschoben wird, ändert in SoCoS nichts.

**Von Hand geschrieben, ohne Bibliothek.** Gebraucht werden zwei Arten von
Einträgen und drei Regeln (Maskieren, Zeilen falten, CRLF). Eine Bibliothek
brächte dafür Zeitzonen-Objekte und einen Parser mit, die hier niemand braucht.

**Zeiten gehen in UTC hinaus** (`…Z`), nicht als Wiener Ortszeit. Ortszeit
bräuchte einen `VTIMEZONE`-Block mit den Sommerzeitregeln, und ein Kalender,
der ihn anders liest, verschöbe jeden Termin im März und Oktober um eine
Stunde — genau dann, wenn niemand hinsieht.

**Was drinsteht, ist bewusst wenig:** Titel, Zeit, Ort und ein Link zurück.
Keine Notizen, keine Vorbereitung, keine Namen von Kontakten. Die Datei liegt
danach auf den Servern des Kalenderanbieters, und dort gehört nicht hin, was
in SoCoS hinter der Anmeldung steht.
"""

import secrets
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.conf import settings
from django.http import Http404, HttpResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from socos import berechtigung
from socos.models import Event, Meeting, Nutzer

#: Wie lange ein Termin ohne Ende dauert. Eine Zahl für Events und Meetings.
DAUER = timedelta(hours=1)


def neuer_schluessel():
    """32 Byte Zufall — nicht zu erraten, und kurz genug für eine URL."""
    return secrets.token_urlsafe(32)


def schluessel_von(nutzer):
    """Der Schlüssel des Nutzers; beim ersten Mal wird er angelegt."""
    if not nutzer.kalenderschluessel:
        nutzer.kalenderschluessel = neuer_schluessel()
        nutzer.save(update_fields=["kalenderschluessel"])
    return nutzer.kalenderschluessel


def _maskiert(text):
    """Backslash, Semikolon, Komma und Zeilenumbruch haben in iCal Bedeutung."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _gefaltet(zeile):
    """
    Eine Zeile darf höchstens 75 **Byte** lang sein; die Fortsetzung beginnt
    mit einem Leerzeichen. Gezählt wird in Byte und nicht in Zeichen — ein
    Umlaut ist in UTF-8 zwei davon, und eine Zeile, die mitten in einem
    Zeichen umbricht, zeigt der Kalender als Kauderwelsch.
    """
    teile, aktuell, grenze = [], "", 75
    for zeichen in zeile:
        if len((aktuell + zeichen).encode("utf-8")) > grenze:
            teile.append(aktuell)
            aktuell, grenze = zeichen, 74  # das Leerzeichen davor zählt mit
        else:
            aktuell += zeichen
    teile.append(aktuell)
    return "\r\n ".join(teile)


def _utc(tag, uhrzeit):
    """Wiener Ortszeit → UTC, so wie sie im Kalender stehen soll."""
    ort = datetime.combine(tag, uhrzeit, tzinfo=ZoneInfo(settings.TIME_ZONE))
    return ort.astimezone(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _tag(tag):
    return tag.strftime("%Y%m%d")


def zeitraum_event(event):
    """
    Anfang und Ende als iCal-Zeilen.

    Ohne Beginn ist das Event ganztägig, vom ersten bis zum letzten Tag — das
    Ende ist in iCal der Tag *danach*. Mit Beginn fängt es am ersten Tag zu
    dieser Uhrzeit an und hört am letzten Tag zur Endzeit auf; fehlt die,
    eine Stunde nach der Beginnzeit am letzten Tag.
    """
    letzter = event.bis or event.von
    if event.beginn is None:
        return (
            f"DTSTART;VALUE=DATE:{_tag(event.von)}",
            f"DTEND;VALUE=DATE:{_tag(letzter + timedelta(days=1))}",
        )
    if event.ende is not None:
        ende = _utc(letzter, event.ende)
    else:
        ende = _utc_plus(letzter, event.beginn, DAUER)
    return f"DTSTART:{_utc(event.von, event.beginn)}", f"DTEND:{ende}"


def zeitraum_meeting(meeting):
    """Eine Stunde ab der Uhrzeit; ältere Meetings ohne Uhrzeit ganztägig."""
    if meeting.uhrzeit is None:
        return (
            f"DTSTART;VALUE=DATE:{_tag(meeting.datum)}",
            f"DTEND;VALUE=DATE:{_tag(meeting.datum + timedelta(days=1))}",
        )
    return (
        f"DTSTART:{_utc(meeting.datum, meeting.uhrzeit)}",
        f"DTEND:{_utc_plus(meeting.datum, meeting.uhrzeit, DAUER)}",
    )


def _utc_plus(tag, uhrzeit, dauer):
    """
    Eine Stunde nach einer Ortszeit — gerechnet in Ortszeit und erst dann nach
    UTC. So bleibt ein Meeting um 23:30 ein Meeting bis 00:30 am nächsten Tag.
    """
    beginn = datetime.combine(tag, uhrzeit) + dauer
    return _utc(beginn.date(), beginn.time())


def _eintrag(uid, zeitraum, titel, ort, link, geaendert):
    # Die letzte Änderung als Stempel: Daran erkennt ein Kalender, dass ein
    # Eintrag mit bekannter UID neu gelesen werden muss.
    stempel = geaendert.astimezone(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    zeilen = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stempel}",
        f"LAST-MODIFIED:{stempel}",
        *zeitraum,
        f"SUMMARY:{_maskiert(titel)}",
    ]
    if ort:
        zeilen.append(f"LOCATION:{_maskiert(ort)}")
    zeilen += [f"URL:{link}", f"DESCRIPTION:{_maskiert(link)}", "END:VEVENT"]
    return zeilen


def ics(basis):
    """
    Die ganze Datei. `basis` ist der Ursprung, auf den die Links zeigen
    (`https://socos.test.sopharmis.com`).

    Alles, was nicht gelöscht ist — kein Zeitfilter. Es sind ein paar Dutzend
    Einträge im Jahr, und ein Kalender, in dem das Meeting vom letzten Jahr
    fehlt, ist einer, dem man nicht mehr traut.
    """
    zeilen = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Sopharmis//SoCoS//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:SoCoS",
        # Ein Wunsch an den Kalender, kein Befehl — Proton etwa holt trotzdem
        # nur alle paar Stunden. Schadet aber nicht, und Apple hält sich daran.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for event in Event.objects.order_by("von", "id"):
        zeilen += _eintrag(
            f"event-{event.pk}@socos",
            zeitraum_event(event),
            event.titel,
            event.ort,
            f"{basis}/events/{event.pk}",
            event.geaendert_am,
        )
    for meeting in Meeting.objects.order_by("datum", "id"):
        zeilen += _eintrag(
            f"meeting-{meeting.pk}@socos",
            zeitraum_meeting(meeting),
            meeting.titel,
            meeting.ort,
            f"{basis}/meetings/{meeting.pk}",
            meeting.geaendert_am,
        )
    zeilen.append("END:VCALENDAR")
    return "".join(_gefaltet(z) + "\r\n" for z in zeilen)


@never_cache
@require_GET
def abo(request, schluessel):
    """
    Die Datei hinter dem Abo-Link — ohne Anmeldung, der Schlüssel ist sie.

    Ein unbekannter Schlüssel, ein stillgelegtes Konto und eines ohne Rolle
    bekommen dieselbe 404: Wer rät, soll nicht erfahren, dass er beinahe
    getroffen hat. Wird jemandem die Rolle genommen, versiegt sein Abo damit
    von selbst.
    """
    nutzer = Nutzer.objects.filter(kalenderschluessel=schluessel, is_active=True).first()
    if nutzer is None or not berechtigung.darf_sehen(nutzer):
        raise Http404
    basis = f"{request.scheme}://{request.get_host()}"
    return HttpResponse(ics(basis), content_type="text/calendar; charset=utf-8")


def abo_link(request, nutzer):
    return request.build_absolute_uri(f"/kalender/{schluessel_von(nutzer)}.ics")

