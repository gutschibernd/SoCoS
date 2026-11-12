"""
Aus einem Produktlink einen Namen vorschlagen — für das Feld, in das man beim
Hineinlegen in den Korb einen Link einfügt.

Zwei Quellen, in dieser Reihenfolge:

1. **Die Seite selbst** — ihr `og:title`. Den setzen Shops auf Produktseiten
   (Bambu Lab, jeder Shopify-Laden), und er ist der Produktname ohne den
   Namen des Shops dahinter.
2. **Der Link** — der sprechende Teil des Pfades: `/products/pla-basic-filament`
   oder bei Amazon das Stück vor `/dp/`. Amazon und Alibaba lassen einen
   Server aus einem Rechenzentrum oft gar nicht erst auf die Seite; der Link
   trägt den Namen dann trotzdem.

Erst danach der `<title>` der Seite: Bei einer Sperrseite heißt er „Robot
Check" oder „Amazon.de" und wäre schlechter als der Link.

**Der Server ruft hier eine Adresse auf, die ein Nutzer eingetippt hat.**
Deshalb nur `http`/`https` auf 80 und 443, und jede Adresse — auch die nach
einer Weiterleitung — muss ins öffentliche Netz zeigen. Sonst ließe sich über
das Feld fragen, was im Docker-Netz neben der Anwendung steht. Zurück geht
nur ein Titel von höchstens 200 Zeichen, nie die Seite. Dass ein Name beim
Abruf auf eine andere Adresse zeigen kann als bei der Prüfung (DNS-Rebinding),
ist bekannt und hingenommen: Mehr als dieser Titel käme auch dann nicht heraus.
"""

import html
import http.client
import ipaddress
import re
import socket
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

#: Sekunden, die auf die Seite gewartet wird. Wer einen Link einfügt, wartet
#: auf das Feld daneben — länger als ein paar Sekunden ist dann zu lang, und
#: der Link allein liefert ja auch einen Namen.
WARTEZEIT = 4

#: So viel der Seite wird gelesen. `og:title` steht im Kopf; eine Produktseite
#: von Amazon ist zwei Megabyte groß, und der Rest wäre umsonst geladen.
HOECHSTENS = 400_000

#: Länger wird der Vorschlag nicht — so lang ist auch das Feld am Artikel.
NAME_HOECHSTENS = 200

KENNUNG = "SoCoS/1.0 (Linkvorschau)"


class KeinLink(ValueError):
    """Der Text ist kein Link, den der Server aufrufen darf."""


def _oeffentlich(host, port):
    if not host or port not in (None, 80, 443):
        return False
    try:
        adressen = {eintrag[4][0] for eintrag in socket.getaddrinfo(host, port or 443)}
    except (socket.gaierror, UnicodeError):
        return False
    # Alle, nicht eine: Ein Name mit einer öffentlichen und einer internen
    # Adresse käme sonst durch.
    return bool(adressen) and all(ipaddress.ip_address(a.split("%")[0]).is_global for a in adressen)


def pruefen(link):
    """Wirft `KeinLink`, wenn der Server diesen Link nicht aufrufen darf."""
    teile = urlsplit(link.strip())
    if teile.scheme not in ("http", "https") or not teile.hostname:
        raise KeinLink("Nur Links mit http:// oder https://.")
    try:
        port = teile.port
    except ValueError:
        raise KeinLink("Der Port im Link ist keine Zahl.")
    if not _oeffentlich(teile.hostname, port):
        raise KeinLink("Dieser Link zeigt nicht ins öffentliche Netz.")
    return teile


class _Weiterleitung(HTTPRedirectHandler):
    """Folgt einer Weiterleitung nur, wenn auch ihr Ziel geprüft ist."""

    max_redirections = 4

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        pruefen(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def seite_holen(link):
    """Der Anfang der Seite als Text — oder `""`, wenn keine HTML-Seite kam."""
    pruefen(link)
    anfrage = Request(
        link,
        headers={
            "User-Agent": KENNUNG,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "de,en;q=0.8",
        },
    )
    with build_opener(_Weiterleitung).open(anfrage, timeout=WARTEZEIT) as antwort:
        if "html" not in (antwort.headers.get_content_type() or ""):
            return ""
        roh = antwort.read(HOECHSTENS)
        zeichensatz = antwort.headers.get_content_charset() or "utf-8"
    return roh.decode(zeichensatz, errors="replace")


def _meta(quelle, name):
    """Der Inhalt von `<meta property|name="…" content="…">`, egal in welcher Reihenfolge."""
    for tag in re.finditer(r"<meta\b[^>]*>", quelle, re.I):
        text = tag.group(0)
        if re.search(rf"""(?:property|name)\s*=\s*["']{re.escape(name)}["']""", text, re.I):
            inhalt = re.search(r"""content\s*=\s*(["'])(.*?)\1""", text, re.I | re.S)
            if inhalt:
                return inhalt.group(2)
    return ""


def titel_aus_seite(quelle):
    """`og:title`, sonst `twitter:title` — der Produktname, wie der Shop ihn nennt."""
    return _meta(quelle, "og:title") or _meta(quelle, "twitter:title")


def kopftitel_aus_seite(quelle):
    treffer = re.search(r"<title\b[^>]*>(.*?)</title>", quelle, re.I | re.S)
    return treffer.group(1) if treffer else ""


# Wegstücke, die nie ein Name sind.
_NIE_NAME = {
    "dp", "gp", "p", "product", "products", "produkt", "produkte", "product-detail",
    "productdetail", "item", "items", "artikel", "shop", "store", "collections",
    "de", "en", "eu", "at", "de-de", "de-at", "en-us", "en-gb", "www",
}


def name_aus_link(link):
    """
    Der sprechende Teil des Pfades, mit Leerzeichen statt Bindestrichen.

    Genommen wird das Stück mit den meisten Buchstaben: Bei Amazon steht der
    Name vor `/dp/B0…`, bei Alibaba vor der Angebotsnummer, bei Shopify hinter
    `/products/`. Nummern, Sprachkürzel und die ASIN fallen weg.
    """
    try:
        pfad = urlsplit(link.strip()).path
    except ValueError:
        return ""
    bester, buchstaben_bester = "", 0
    for stueck in pfad.split("/"):
        stueck = unquote(stueck)
        stueck = re.sub(r"\.(html?|php|aspx?)$", "", stueck, flags=re.I)
        stueck = re.sub(r"[_-]\d{5,}$", "", stueck)  # die Angebotsnummer bei Alibaba
        if stueck.lower() in _NIE_NAME or re.fullmatch(r"B0[A-Z0-9]{8}", stueck):
            continue
        buchstaben = sum(z.isalpha() for z in stueck)
        if buchstaben >= 3 and buchstaben > buchstaben_bester:
            bester, buchstaben_bester = stueck, buchstaben
    text = re.sub(r"[-_+]+", " ", bester).strip()
    return text[:1].upper() + text[1:]


def aufgeraeumt(titel):
    """Ohne HTML-Zeichen, ohne doppelte Leerzeichen, ohne den Shop hinter dem Strich."""
    text = " ".join(html.unescape(titel or "").split())
    # „PLA Basic – Bambu Lab EU Store", „Kabel | Mouser". Ein einfacher
    # Bindestrich bleibt: Er steht oft im Produktnamen selbst.
    for trenner in (" | ", " – ", " — "):
        vorne = text.split(trenner)[0].strip()
        if len(vorne) >= 3:
            text = vorne
    return text[:NAME_HOECHSTENS].strip()


def vorschlag(link, holen=None):
    """
    Der Name, der im Feld vorgeschlagen wird — oder `""`. Wirft `KeinLink`,
    wenn der Text kein Link ist, den der Server aufrufen darf.

    Dass die Seite nicht antwortet, ist kein Fehler: Dann kommt der Name aus
    dem Link, und wenn der keinen trägt, bleibt das Feld leer zum Tippen.
    """
    pruefen(link)
    try:
        seite = (holen or seite_holen)(link)
    except (OSError, ValueError, LookupError, http.client.HTTPException):
        # OSError deckt Zeitüberschreitung, URLError und HTTPError ab,
        # ValueError auch `KeinLink` nach einer Weiterleitung, LookupError
        # einen Zeichensatz, den Python nicht kennt.
        seite = ""
    for kandidat in (titel_aus_seite(seite), name_aus_link(link), kopftitel_aus_seite(seite)):
        if name := aufgeraeumt(kandidat):
            return name
    return ""
