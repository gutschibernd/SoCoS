"""
Runway-Planung: Monat für Monat, was herein- und hinausgeht, und wie lange das
Geld damit reicht.

**Eine Übertragung der Rechnung des eigenständigen Runway-Planers** (Bernd,
2026-10-14: „1:1 wie im HTML"), Zeile für Zeile — `compute`, `nfCtx`,
`bridge`, die Kennzahlen aus `renderTop` und die Summen aus `renderYears`.
Die Namen der Töpfe (`foerd`, `ums`, `team` …) sind die des Planers, damit
man beide nebeneinander lesen kann.

Anders als im Planer, mit Absicht:

- **`Decimal` statt Gleitkomma.** Gerundet wird erst beim Ausgeben, auf den
  Cent; JSON kennt nur Gleitkomma, deshalb gehen Beträge als Zeichenkette
  hinaus (siehe CLAUDE.md).
- **Der Ist-Kontostand kommt aus `Kontostand`** — demselben, den das
  Dashboard zeigt — und gilt **ab seinem Tag**: Was im selben Monat danach
  fällig ist, kommt noch dazu. Ein Stichtag am Monatsletzten verhält sich
  genau wie die Ist-Zelle des Planers; ein Stichtag vom 1. ist kein
  Monatsende und wird nicht als solches genommen.
- **Wiederkehrendes zählt ab dem eigenen Beginn.** Der Planer begann eine
  Quartalszahlung, die vor dem Planstart anfing, beim Planstart neu zu zählen
  — August, November, Februar wurde dort zu Oktober, Jänner, April.
"""

import re
from calendar import monthrange
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal, InvalidOperation

from django.utils import timezone

SZENARIEN = ("konservativ", "basis", "optimistisch")

NULL = Decimal(0)
EINS = Decimal(1)
HUNDERT = Decimal(100)
CENT = Decimal("0.01")
ABRUF_STUFE = Decimal(5000)
DATUM = re.compile(r"^\d{4}-\d{2}")

#: Was hereinkommt und was hinausgeht — die Töpfe eines Monats.
EIN = ("foerd", "fp", "inv", "ums", "ustIn", "darl", "kredit", "uvaIn")
AUS = ("team", "kosten", "vst", "foerdBack", "tilg", "uvaOut")
WEITERE = ("neuf", "neufPot")

LISTEN = ("foerderungen", "investments", "umsaetze", "team", "kosten", "darlehen")


# --- Kleine Helfer (num, x0, idx … aus dem Planer) ------------------------------


def zahl(wert):
    """`num()` des Planers: eine Zahl, sonst 0."""
    if wert is None or wert == "" or isinstance(wert, bool):
        return NULL
    try:
        d = Decimal(str(wert).strip())
    except InvalidOperation:
        return NULL
    return d if d.is_finite() else NULL


def oder(wert, ersatz):
    """`x0()` des Planers: leer heißt Ersatzwert, 0 bleibt 0."""
    return Decimal(str(ersatz)) if wert in (None, "") else zahl(wert)


def _cent(wert):
    return wert.quantize(CENT, rounding=ROUND_HALF_UP)


def _tag(datum, ersatz=1):
    """Der Tag eines „JJJJ-MM-TT" — für den Abgleich mit einem Stichtag."""
    text = str(datum or "")
    return int(text[8:10]) if len(text) >= 10 and text[8:10].isdigit() else ersatz


class Achse:
    """Die Monatsachse ab dem Planstart — `base`, `idx`, `moy`, `yr` des Planers."""

    def __init__(self, start, monate):
        self.jahr = int(start[:4])
        self.monat = int(start[5:7])
        self.n = monate

    def idx(self, datum):
        text = str(datum or "")
        if not DATUM.match(text):
            return None
        return (int(text[:4]) - self.jahr) * 12 + (int(text[5:7]) - self.monat)

    def moy(self, i):
        """Monat im Jahr, 0 = Jänner."""
        return (self.monat - 1 + i) % 12

    def yr(self, i):
        return self.jahr + (self.monat - 1 + i) // 12

    def schluessel(self, i):
        return f"{self.yr(i)}-{self.moy(i) + 1:02d}"

    def erster(self, i):
        return date(self.yr(i), self.moy(i) + 1, 1)

    def drin(self, i):
        return i is not None and 0 <= i < self.n

    def spanne(self, start, ende):
        """`range()` des Planers: erster und letzter Monat im Plan."""
        a = self.idx(start)
        b = self.idx(ende)
        return max(0, a if a is not None else 0), min(self.n - 1, b if b is not None else self.n - 1)


def _schritt(rhythmus):
    return {"monatlich": 1, "quartal": 3, "jaehrlich": 12}.get(rhythmus, 1)


def _termine(achse, start, ende, rhythmus):
    """
    Die Monate eines wiederkehrenden Postens im Plan — gezählt ab seinem
    eigenen Beginn (siehe Kopf der Datei).
    """
    a, b = achse.spanne(start, ende)
    i0 = achse.idx(start)
    i = i0 if i0 is not None else 0
    schritt = _schritt(rhythmus)
    while i <= b:
        if i >= a:
            yield i
        i += schritt


# --- Leeres Dokument und Normalisieren ---------------------------------------------


def heute_monat(heute=None):
    heute = heute or timezone.localdate()
    return f"{heute.year}-{heute.month:02d}-01"


def leerer_plan(heute=None):
    """`emptyState()` des Planers."""
    return {
        "v": 2,
        "settings": {
            "company": "", "start": heute_monat(heute), "months": 36, "cash": 0, "buffer": 25000,
            "lnk": 30, "sonder": True, "raise": 0, "bridgeGroup": 3, "ust": True, "uva": "monat",
            "contingency": 0, "rebase": True,
        },
        "neufoeg": {"aktiv": False, "gruendung": "", "satz": 5.6, "check": {}},
        "fp": {"aktiv": False, "satz": 14, "monat": 9},
        "baseline": None,
        "notes": "",
        **{liste: [] for liste in LISTEN},
    }


def normalisieren(roh, heute=None):
    """
    `normalize()` des Planers: was immer ankommt, wird ein vollständiger Plan.
    Ist-Werte (`actuals`) fallen weg — sie stehen als `Kontostand`.
    """
    import secrets

    leer = leerer_plan(heute)
    if not isinstance(roh, dict):
        return leer
    # Ein Export des Planers trägt den Plan in einer Hülle.
    if roh.get("format") == "runway-planer" and isinstance(roh.get("plan"), dict):
        roh = roh["plan"]

    def kennung():
        return secrets.token_hex(4)

    s = {**leer["settings"], **(roh.get("settings") if isinstance(roh.get("settings"), dict) else {})}
    try:
        s["months"] = min(72, max(6, round(float(s.get("months") or 36))))
    except (TypeError, ValueError):
        s["months"] = 36
    if not DATUM.match(str(s.get("start") or "")):
        s["start"] = leer["settings"]["start"]
    s["start"] = f"{str(s['start'])[:7]}-01"

    def liste(name):
        werte = roh.get(name)
        if not isinstance(werte, list):
            return []
        return [{**x, "id": str(x.get("id") or kennung())} for x in werte if isinstance(x, dict)]

    plan = {
        "v": 2,
        "settings": s,
        "neufoeg": {**leer["neufoeg"], **(roh.get("neufoeg") if isinstance(roh.get("neufoeg"), dict) else {})},
        "fp": {**leer["fp"], **(roh.get("fp") if isinstance(roh.get("fp"), dict) else {})},
        "baseline": None,
        "notes": roh.get("notes") if isinstance(roh.get("notes"), str) else "",
        **{name: liste(name) for name in LISTEN},
    }
    if not isinstance(plan["neufoeg"].get("check"), dict):
        plan["neufoeg"]["check"] = {}
    b = roh.get("baseline")
    if isinstance(b, dict) and isinstance(b.get("keys"), list) and isinstance(b.get("cash"), list):
        plan["baseline"] = b
    for f in plan["foerderungen"]:
        tranchen = f.get("tranchen")
        f["tranchen"] = [
            {**t, "id": str(t.get("id") or kennung())} for t in (tranchen if isinstance(tranchen, list) else []) if isinstance(t, dict)
        ]
    return plan


def ist_leer(plan):
    """`isEmpty()` des Planers."""
    return not zahl(plan["settings"].get("cash")) and not any(plan[liste] for liste in LISTEN)


# --- NeuFöG --------------------------------------------------------------------------


class NeuFoeG:
    """`nfCtx()` des Planers."""

    def __init__(self, plan, achse):
        nfo = plan["neufoeg"]
        self.G = achse.idx(nfo.get("gruendung")) if DATUM.match(str(nfo.get("gruendung") or "")) else None
        waehlbar = []
        for k, p in enumerate(plan["team"]):
            s = achse.idx(p.get("start"))
            s = s if s is not None else 0
            if p.get("neufoeg") is not False and self.G is not None and s <= self.G + 35:
                waehlbar.append((s, k, p["id"]))
        waehlbar.sort()
        self.erste_drei = {kennung for _, _, kennung in waehlbar[:3]}

    def befreit(self, p, i, s0):
        G = self.G
        if G is None or p.get("neufoeg") is False or i < G or i > G + 35:
            return False
        if i <= G + 11:
            return True  # Jahr 1: alle Dienstnehmer:innen
        return p["id"] in self.erste_drei and i < s0 + 12  # Monat 13–36: erste drei, je 12 Monate ab Eintritt


# --- Rechnung ------------------------------------------------------------------------


def _bruttogehalt(plan, achse, p, i):
    s = plan["settings"]
    g = zahl(p.get("gross")) * (EINS + zahl(s.get("raise")) / HUNDERT) ** (achse.yr(i) - achse.yr(0))
    if s.get("sonder") and achse.moy(i) in (5, 10):
        g *= 2  # 13. und 14. Gehalt: Juni, November
    return g


def berechnen(plan, szenario, mit_gesellschafterdarlehen=True, ist=None):
    """
    `compute()` des Planers — ein Monat je Eintrag. `ist` ordnet einer
    Monatsnummer einen `Kontostand` zu.
    """
    s = plan["settings"]
    achse = Achse(s["start"], s["months"])
    n = achse.n
    M = [
        {"i": i, **{k: NULL for k in EIN + AUS + WEITERE}, "kostCat": {}, "head": 0, "ev": [], "_zahlungen": []}
        for i in range(n)
    ]

    def buchen(i, topf, betrag, ereignis=None, tag=1):
        if achse.drin(i) and betrag:
            M[i][topf] += betrag
            M[i]["_zahlungen"].append((tag, betrag if topf in EIN else -betrag))
            if ereignis:
                M[i]["ev"].append(ereignis)

    def zaehlt(status):
        return szenario != "konservativ" or status in ("zugesagt", "erhalten")

    ust_an = bool(s.get("ust"))
    ust_schuld = [NULL] * n
    vorsteuer = [NULL] * n
    fp_basis = {}

    def fp_dazu(i, betrag):
        if achse.drin(i) and betrag:
            fp_basis[achse.yr(i)] = fp_basis.get(achse.yr(i), NULL) + betrag

    for f in plan["foerderungen"]:
        name = f.get("name") or "Förderung"
        for t in f["tranchen"]:
            v, i = zahl(t.get("amount")), achse.idx(t.get("date"))
            if t.get("art") == "rueckzahlung":
                buchen(i, "foerdBack", v, {"t": f"{name} · Rückzahlung", "v": -v}, _tag(t.get("date")))
            elif zaehlt(t.get("status")):
                buchen(i, "foerd", v, {"t": f"{name} · Tranche", "v": v}, _tag(t.get("date")))

    for x in plan["investments"]:
        if zaehlt(x.get("status")):
            v = zahl(x.get("amount"))
            buchen(achse.idx(x.get("date")), "inv", v, {"t": x.get("name") or "Investment", "v": v}, _tag(x.get("date")))

    for u in plan["umsaetze"]:
        p = min(HUNDERT, max(NULL, oder(u.get("prob"), 100))) / HUNDERT
        faktor = EINS if szenario == "optimistisch" else p / 2 if szenario == "konservativ" else p
        v = zahl(u.get("amount")) * faktor
        if not v:
            continue
        verschiebung = int((max(NULL, zahl(u.get("ziel"))) / 30).quantize(EINS, rounding=ROUND_HALF_UP))
        satz = oder(u.get("ust"), 20) / HUNDERT if ust_an else NULL
        tag = _tag(u.get("start"))

        def umsatz(i, ereignis=None):
            buchen(i + verschiebung, "ums", v, ereignis, tag)
            buchen(i + verschiebung, "ustIn", v * satz, None, tag)
            if achse.drin(i):
                ust_schuld[i] += v * satz

        if u.get("interval") == "einmalig":
            i = achse.idx(u.get("start"))
            umsatz(i if i is not None else 0, {"t": u.get("name") or "Umsatz", "v": v})
        else:
            for i in _termine(achse, u.get("start"), u.get("end"), u.get("interval")):
                umsatz(i)

    nf = NeuFoeG(plan, achse)
    nf_an = bool(plan["neufoeg"].get("aktiv"))
    nf_satz = zahl(plan["neufoeg"].get("satz"))
    for p in plan["team"]:
        s0 = achse.idx(p.get("start"))
        s0 = s0 if s0 is not None else 0
        a, b = achse.spanne(p.get("start"), p.get("end"))
        lnk = oder(p.get("lnk"), zahl(s.get("lnk"))) / HUNDERT
        for i in range(a, b + 1):
            g = _bruttogehalt(plan, achse, p, i)
            moeglich = g * nf_satz / HUNDERT if nf.befreit(p, i, s0) else NULL
            gespart = moeglich if nf_an else NULL
            kosten = g * (EINS + lnk) - gespart
            # Das Gehalt geht am Monatsende hinaus.
            M[i]["team"] += kosten
            M[i]["_zahlungen"].append((31, -kosten))
            M[i]["neuf"] += gespart
            M[i]["neufPot"] += moeglich
            M[i]["head"] += 1
            fp_dazu(i, kosten * zahl(p.get("fe")) / HUNDERT)
        if achse.drin(s0):
            M[s0]["ev"].append({"t": f"Eintritt {p.get('name') or 'Mitarbeiter:in'}", "v": -zahl(p.get("gross")) * (EINS + lnk)})

    zuschlag = EINS + zahl(s.get("contingency")) / HUNDERT
    for k in plan["kosten"]:
        netto = zahl(k.get("amount"))
        v = netto * zuschlag
        if not v:
            continue
        satz = oder(k.get("ust"), 20) / HUNDERT if ust_an else NULL
        kategorie = str(k.get("cat") or "").strip() or "Ohne Kategorie"
        tag = _tag(k.get("start"))

        def ausgabe(i, ereignis=None):
            if not achse.drin(i):
                return
            buchen(i, "kosten", v, ereignis, tag)
            M[i]["kostCat"][kategorie] = M[i]["kostCat"].get(kategorie, NULL) + v
            buchen(i, "vst", v * satz, None, tag)
            vorsteuer[i] += v * satz
            if k.get("fe"):
                fp_dazu(i, netto)

        if k.get("interval") == "einmalig":
            i = achse.idx(k.get("start"))
            ausgabe(i if i is not None else 0, {"t": k.get("name") or "Ausgabe", "v": -v})
        else:
            for i in _termine(achse, k.get("start"), k.get("end"), k.get("interval")):
                ausgabe(i)

    for d in plan["darlehen"]:
        gd = (d.get("typ") or "gesellschafter") == "gesellschafter"
        if gd and not mit_gesellschafterdarlehen:
            continue
        a, betrag, zins = achse.idx(d.get("date")), zahl(d.get("amount")), zahl(d.get("zins")) / HUNDERT
        if a is None or not betrag:
            continue
        name = d.get("name") or ("Gesellschafterdarlehen" if gd else "Kredit")
        buchen(a, "darl" if gd else "kredit", betrag, {"t": f"{name} · Auszahlung", "v": betrag}, _tag(d.get("date")))
        if d.get("tilgung") == "raten":
            try:
                raten = max(1, round(float(zahl(d.get("raten")) or 12)))
            except (TypeError, ValueError):
                raten = 12
            ts = achse.idx(d.get("tilgStart"))
            ts = ts if ts is not None else a + 1
            tag = _tag(d.get("tilgStart"), _tag(d.get("date")))
            offen = betrag
            rate = betrag / raten
            i = a + 1
            while i < n and offen > CENT:
                tilgung = rate if ts <= i < ts + raten else NULL
                buchen(i, "tilg", offen * zins / 12 + tilgung, None, tag)
                offen -= tilgung
                i += 1
            if achse.drin(ts):
                M[ts]["ev"].append({"t": f"{name} · Tilgungsbeginn", "v": -rate})
        else:
            r = achse.idx(d.get("repay"))
            if r is not None and r > a:
                zurueck = betrag * (EINS + zins * (r - a) / 12)
                buchen(r, "tilg", zurueck, {"t": f"{name} · Rückzahlung", "v": -zurueck}, _tag(d.get("repay")))

    if ust_an:
        # Fällig am 15. des zweitfolgenden Monats — nach dem Monat, bei
        # vierteljährlicher UVA nach dem Quartal.
        faellig = {}
        for i in range(n):
            ende = i + (2 - achse.moy(i) % 3) if s.get("uva") == "quartal" else i
            faellig[ende + 2] = faellig.get(ende + 2, NULL) + ust_schuld[i] - vorsteuer[i]
        for i, saldo in sorted(faellig.items()):
            if abs(saldo) < Decimal("0.5"):
                continue
            if saldo > 0:
                buchen(i, "uvaOut", saldo, {"t": "UVA-Zahlung ans Finanzamt", "v": -saldo}, 15)
            else:
                buchen(i, "uvaIn", -saldo, {"t": "UVA-Gutschrift (Vorsteuerüberhang)", "v": -saldo}, 15)

    if plan["fp"].get("aktiv"):
        auszahlung = int(zahl(plan["fp"].get("monat")) or 9)
        for jahr, basis in sorted(fp_basis.items()):
            betrag = basis * zahl(plan["fp"].get("satz")) / HUNDERT
            buchen(achse.idx(f"{jahr + 1}-{auszahlung:02d}"), "fp", betrag, {"t": f"Forschungsprämie {jahr}", "v": betrag})

    stand = zahl(s.get("cash"))
    ist = ist or {}
    for m in M:
        m["inSum"] = sum((m[k] for k in EIN), NULL)
        m["outSum"] = sum((m[k] for k in AUS), NULL)
        m["net"] = m["inSum"] - m["outSum"]
        m["open"] = stand
        stand += m["net"]
        m["planCash"] = stand
        k = ist.get(m["i"])
        m["ist"] = k.betrag if k else None
        m["ist_datum"] = k.datum if k else None
        if k is not None and s.get("rebase") is not False:
            stand = k.betrag + sum((v for tag, v in m["_zahlungen"] if tag > k.datum.day), NULL)
        m["cash"] = stand
    return M, fp_basis


def ueberbrueckung(M, puffer, gruppe):
    """`bridge()` des Planers: Abrufe, damit der Stand nie unter den Puffer fällt."""
    gruppe = max(1, gruppe)
    nachgeschossen = NULL
    abrufe = []
    for i in range(len(M)):
        if M[i]["cash"] + nachgeschossen < puffer - Decimal("0.5"):
            tiefster = min(m["cash"] for m in M[i : i + gruppe]) + nachgeschossen
            betrag = ((puffer - tiefster) / ABRUF_STUFE).to_integral_value(rounding=ROUND_CEILING) * ABRUF_STUFE
            abrufe.append({"i": i, "amount": betrag, "before": M[i]["cash"] + nachgeschossen})
            nachgeschossen += betrag
    return abrufe


# --- Was die Seite außerdem zeigt --------------------------------------------------


def _kennzahlen(plan, A, Z, abrufe):
    """Die Zahlen hinter Status und Kennzahlen (`renderTop` des Planers)."""
    puffer = zahl(plan["settings"].get("buffer"))
    erster = lambda reihe, bedingung: next((m["i"] for m in reihe if bedingung(m)), None)  # noqa: E731
    tief = 0
    for i, m in enumerate(A):
        if m["cash"] < A[tief]["cash"]:
            tief = i
    vorne = A[:6]
    gd = [d for d in plan["darlehen"] if (d.get("typ") or "gesellschafter") == "gesellschafter"]
    return {
        "neg": erster(A, lambda m: m["cash"] < 0),
        "low": erster(A, lambda m: m["cash"] < puffer),
        "negZ": erster(Z, lambda m: m["cash"] < 0),
        "need": sum((a["amount"] for a in abrufe), NULL),
        "mi": tief,
        "burn": sum((m["team"] + m["kosten"] - m["ums"] for m in vorne), NULL) / max(1, len(vorne)),
        "be": erster(A, lambda m: m["ums"] > 0 and m["ums"] >= m["team"] + m["kosten"]),
        "gdSum": sum((zahl(d.get("amount")) for d in gd), NULL),
        "gdN": len(gd),
        "hasGD": bool(gd),
    }


def _jahre(achse, A):
    """Die Summen je Kalenderjahr (`renderYears` des Planers)."""
    jahre = []
    for jahr in sorted({achse.yr(m["i"]) for m in A}):
        ms = [m for m in A if achse.yr(m["i"]) == jahr]
        summe = {k: sum((m[k] for m in ms), NULL) for k in EIN + AUS + WEITERE + ("net",)}
        kategorien = {}
        for m in ms:
            for k, v in m["kostCat"].items():
                kategorien[k] = kategorien.get(k, NULL) + v
        jahre.append(
            {
                "y": jahr,
                "von": achse.moy(ms[0]["i"]),
                "bis": achse.moy(ms[-1]["i"]),
                "monate": len(ms),
                "sum": summe,
                "cat": kategorien,
                "end": ms[-1]["cash"],
                "head": ms[-1]["head"],
                "vat": summe["ustIn"] + summe["uvaIn"] - summe["vst"] - summe["uvaOut"],
            }
        )
    return jahre


def _neufoeg_personen(plan, achse):
    """Je Person die befreiten Monate und die Ersparnis (`renderAnsprueche`)."""
    nf = NeuFoeG(plan, achse)
    if nf.G is None:
        return {"G": None, "personen": []}
    satz = zahl(plan["neufoeg"].get("satz"))
    personen = []
    for p in plan["team"]:
        s0 = achse.idx(p.get("start"))
        s0 = s0 if s0 is not None else 0
        ende = achse.idx(p.get("end"))
        monate, summe = 0, NULL
        for i in range(max(0, s0), achse.n):
            if ende is not None and i > ende:
                break
            if nf.befreit(p, i, s0):
                monate += 1
                summe += _bruttogehalt(plan, achse, p, i) * satz / HUNDERT
        personen.append({"id": p["id"], "mo": monate, "sum": summe, "first": p["id"] in nf.erste_drei})
    return {"G": nf.G, "personen": personen}


def _abgeleitet(plan):
    """Die Werte, die im Planer neben den Feldern stehen (`updateDerived`)."""
    s = plan["settings"]
    lnk = lambda p: EINS + oder(p.get("lnk"), zahl(s.get("lnk"))) / HUNDERT  # noqa: E731
    return {
        "foerderung": {
            f["id"]: sum(((-1 if t.get("art") == "rueckzahlung" else 1) * zahl(t.get("amount")) for t in f["tranchen"]), NULL)
            for f in plan["foerderungen"]
        },
        "agKosten": {p["id"]: zahl(p.get("gross")) * lnk(p) for p in plan["team"]},
        "teamJahr": sum((zahl(p.get("gross")) * lnk(p) * (14 if s.get("sonder") else 12) for p in plan["team"]), NULL),
    }


def _ausgeben(wert):
    """Für JSON: Geld auf den Cent, alles andere, wie es ist."""
    if isinstance(wert, Decimal):
        return _cent(wert)
    if isinstance(wert, dict):
        return {str(k): _ausgeben(v) for k, v in wert.items() if not str(k).startswith("_")}
    if isinstance(wert, list):
        return [_ausgeben(v) for v in wert]
    return wert


def iststaende(achse):
    """Je Monat der letzte `Kontostand` darin — die Ist-Zeile der Monatsübersicht."""
    from socos.models import Kontostand

    bis = date(achse.yr(achse.n - 1), achse.moy(achse.n - 1) + 1, 1)
    bis = bis.replace(day=monthrange(bis.year, bis.month)[1])
    staende = {}
    for k in Kontostand.objects.filter(datum__gte=achse.erster(0), datum__lte=bis).order_by("datum", "id"):
        staende[achse.idx(k.datum.isoformat())] = k
    return staende


def rechnen(plan, szenario="basis"):
    """Alles, was die Seite zeichnet, für ein Szenario."""
    if szenario not in SZENARIEN:
        raise ValueError(f"Unbekanntes Szenario: {szenario}")
    achse = Achse(plan["settings"]["start"], plan["settings"]["months"])
    ist = iststaende(achse)
    A, fp_basis = berechnen(plan, szenario, True, ist)
    Z, _ = berechnen(plan, szenario, False, ist)
    abrufe = ueberbrueckung(A, zahl(plan["settings"].get("buffer")), int(zahl(plan["settings"].get("bridgeGroup")) or 3))
    for m in A:
        m["key"] = achse.schluessel(m["i"])
    return _ausgeben(
        {
            "szenario": szenario,
            "leer": ist_leer(plan),
            "A": A,
            "Z": [m["cash"] for m in Z],
            "sug": abrufe,
            "fpBase": {str(k): v for k, v in fp_basis.items()},
            "kpi": _kennzahlen(plan, A, Z, abrufe),
            "jahre": _jahre(achse, A),
            "neufoeg": _neufoeg_personen(plan, achse),
            "abgeleitet": _abgeleitet(plan),
        }
    )


# --- Protokoll -------------------------------------------------------------------------


def unterschiede(alt, neu):
    """
    Was sich zwischen zwei Ständen des Plans geändert hat — Pfad, alt, neu —
    für das Änderungsprotokoll. Posten werden an ihrer Kennung erkannt und mit
    ihrem Namen genannt; ein Pfad wie `kosten[Overhead].amount` liest sich in
    zwei Jahren noch.
    """
    alt = alt or {}
    ergebnis = {}

    def merken(pfad, a, b):
        if a != b:
            ergebnis[pfad] = {"alt": a, "neu": b}

    for teil in ("settings", "neufoeg", "fp"):
        a, b = alt.get(teil) or {}, neu.get(teil) or {}
        for k in sorted(set(a) | set(b)):
            merken(f"{teil}.{k}", a.get(k), b.get(k))
    # Die Notizen fehlen mit Absicht: Sie speichern sich beim Tippen, und jede
    # Pause schriebe den ganzen alten und neuen Text ins Protokoll — dieselbe
    # Ausnahme wie bei der Mitschrift eines Meetings (`protokoll_ohne`).
    merken(
        "baseline",
        (alt.get("baseline") or {}).get("savedAt"),
        (neu.get("baseline") or {}).get("savedAt"),
    )

    def posten(pfad, a_liste, b_liste):
        a_map = {x.get("id"): x for x in a_liste or []}
        b_map = {x.get("id"): x for x in b_liste or []}
        for kennung in list(a_map) + [k for k in b_map if k not in a_map]:
            x, y = a_map.get(kennung), b_map.get(kennung)
            name = (y or x).get("name") or (y or x).get("date") or kennung
            ort = f"{pfad}[{name}]"
            if x is None:
                merken(ort, None, {k: v for k, v in y.items() if k != "tranchen"})
            elif y is None:
                merken(ort, {k: v for k, v in x.items() if k != "tranchen"}, None)
            else:
                for k in sorted((set(x) | set(y)) - {"id", "tranchen"}):
                    merken(f"{ort}.{k}", x.get(k), y.get(k))
            if pfad == "foerderungen":
                posten(f"{ort}.tranchen", (x or {}).get("tranchen"), (y or {}).get("tranchen"))

    for liste in LISTEN:
        posten(liste, alt.get(liste), neu.get(liste))
    return ergebnis
