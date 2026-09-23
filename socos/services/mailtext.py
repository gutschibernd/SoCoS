"""
Aus einer E-Mail (.eml) den Text machen, der am Meeting daneben steht.

**Warum hier gelesen wird und nicht im Browser:** Eine .eml ist MIME — Base64,
quoted-printable, Zeichensätze je Teil, HTML statt Text. Pythons `email` kann
das alles; im Browser müsste man es nachbauen. Und der Text wird einmal beim
Hochladen gebraucht, nicht bei jedem Anzeigen.

Was herauskommt, ist zum Lesen und für den Auftrag an ein LLM gedacht, nicht
zum Weiterverarbeiten: ein Kopf (Von, An, Datum, Betreff), der Inhalt, und die
Namen der Anhänge — **nur die Namen**. Was in einer PDF im Anhang steht, geht
niemanden an, der bloß das Protokoll liest; in der Mail an den Steuerberater
hingen Ausweiskopien.
"""

import html
import re
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime

from django.utils import timezone

# Ein Mailverlauf mit zwanzig Zitaten ist schnell 200 000 Zeichen. So viel
# liest kein Mensch am Meeting, und im Auftrag an ein LLM verdrängte es die
# Mitschrift.
HOECHSTENS = 40_000


class KeineMail(ValueError):
    """Die Datei lässt sich nicht als E-Mail lesen."""


def ist_mail(name, inhalt_anfang):
    """
    Eine .eml erkennt man am Namen — oder an den Kopfzeilen, wenn sie ohne
    Endung kommt (manche Mailprogramme speichern so).
    """
    if name.lower().endswith(".eml"):
        return True
    kopf = inhalt_anfang[:4000].decode("latin-1", errors="replace")
    return bool(re.search(r"^From:", kopf, re.M) and re.search(r"^(Subject|Date):", kopf, re.M))


def _lesen(roh):
    try:
        nachricht = BytesParser(policy=policy.default).parsebytes(roh)
    except Exception as fehler:  # noqa: BLE001 — jede Art Kaputt heißt dasselbe
        raise KeineMail(str(fehler))
    if not (nachricht.get("From") or nachricht.get("Subject")):
        raise KeineMail("Weder Absender noch Betreff — das ist keine E-Mail.")
    return nachricht


def _ist_anhang(teil):
    """
    Alles, was einen Dateinamen trägt und kein Teil des Textes ist — auch das
    Logo in der Signatur (`inline` mit Namen). Es wegzulassen kostet nichts
    Lesbares und macht die Mail oft um die Hälfte kleiner.
    """
    if teil.is_multipart():
        return False
    return teil.is_attachment() or bool(teil.get_filename())


def ohne_anhaenge(roh: bytes) -> tuple[bytes, list[str]]:
    """
    Dieselbe Mail ohne ihre Anhänge — und die Namen dessen, was wegfiel.

    **Warum das am Server passiert und nicht im Mailprogramm:** Wer eine Mail
    aus Apple Mail herauszieht, bekommt sie ganz. Die Frage „Anhänge mit?"
    stellt sich erst hier, beim Ablegen — und ein Ausweis im Anhang soll
    gar nicht erst auf die Platte, auch nicht für einen Augenblick.

    Kopf und Text bleiben unangetastet; nur die Teile mit Dateinamen fallen
    aus ihren Behältern.
    """
    nachricht = _lesen(roh)
    weg = []

    def ausduennen(teil):
        if not teil.is_multipart():
            return
        bleiben = []
        for kind in teil.get_payload():
            if _ist_anhang(kind):
                weg.append(kind.get_filename() or kind.get_content_type())
            else:
                ausduennen(kind)
                bleiben.append(kind)
        teil.set_payload(bleiben)

    ausduennen(nachricht)
    return nachricht.as_bytes(), weg


def mailtext(roh: bytes, weggelassen=()) -> str:
    nachricht = _lesen(roh)

    zeilen = []
    for kopf, beschriftung in (("From", "Von"), ("To", "An"), ("Cc", "Cc")):
        if wert := _kopf(nachricht, kopf):
            zeilen.append(f"{beschriftung}: {wert}")
    if datum := _datum(nachricht.get("Date")):
        zeilen.append(f"Datum: {datum}")
    zeilen.append(f"Betreff: {_kopf(nachricht, 'Subject') or '(ohne Betreff)'}")

    anhaenge = [
        teil.get_filename()
        for teil in nachricht.iter_attachments()
        if teil.get_filename()
    ]
    if anhaenge:
        zeilen.append(f"Anhänge: {', '.join(anhaenge)}")
    if weggelassen:
        # Dass es sie gab, gehört zur Mail — „siehe Anhang" im Text liest sich
        # sonst wie ein Versehen des Absenders.
        zeilen.append(f"Anhänge (nicht mit abgelegt): {', '.join(weggelassen)}")

    text = f"{chr(10).join(zeilen)}\n\n{_inhalt(nachricht)}".strip()
    if len(text) > HOECHSTENS:
        text = text[:HOECHSTENS].rstrip() + "\n\n[… gekürzt]"
    return text


def _kopf(nachricht, name):
    wert = nachricht.get(name)
    # Gefaltete Kopfzeilen kommen mit Zeilenumbruch und Einrückung.
    return re.sub(r"\s+", " ", str(wert)).strip() if wert else ""


def _datum(wert):
    if not wert:
        return ""
    try:
        zeitpunkt = parsedate_to_datetime(str(wert))
    except (TypeError, ValueError):
        return str(wert)
    if timezone.is_naive(zeitpunkt):
        return f"{zeitpunkt:%d.%m.%Y %H:%M}"
    return f"{timezone.localtime(zeitpunkt):%d.%m.%Y %H:%M}"


def _inhalt(nachricht):
    """Der Text der Mail: der Klartextteil, sonst das HTML ohne Auszeichnung."""
    teil = nachricht.get_body(preferencelist=("plain", "html"))
    if teil is None:
        return ""
    try:
        inhalt = teil.get_content()
    except (LookupError, UnicodeError):
        inhalt = (teil.get_payload(decode=True) or b"").decode("utf-8", errors="replace")
    if teil.get_content_type() == "text/html":
        inhalt = html_zu_text(inhalt)
    return _aufgeraeumt(inhalt)


def html_zu_text(quelle):
    """
    Grob, aber verlässlich: Absätze und Zeilen bleiben Zeilen, der Rest fällt.

    Kein HTML-Parser mit Baum: Mails aus Outlook sind kein gültiges HTML, und
    was hier gebraucht wird, ist der lesbare Text — nicht die Gliederung.
    """
    text = re.sub(r"(?is)<(head|style|script)\b.*?</\1\s*>", "", quelle)
    text = re.sub(r"(?is)<!--.*?-->", "", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)<li\b[^>]*>", "\n- ", text)
    text = re.sub(r"(?i)</(p|div|li|tr|h[1-6]|table|blockquote)\s*>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", "", text)
    return html.unescape(text)


def _aufgeraeumt(text):
    text = text.replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    zeilen = [re.sub(r"[ \t]+", " ", z).strip() for z in text.split("\n")]
    text = "\n".join(zeilen)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Outlook setzt in jedes <li> noch ein <p> — ohne diese Zeile stünde
    # zwischen zwei Punkten einer Aufzählung jedesmal eine Leerzeile.
    return re.sub(r"\n\n+(?=- )", "\n", text).strip()
