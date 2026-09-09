"""
Die **einzige** Stelle, an der steht, wer was darf.

Kein zweiter Ort mit einer Rolle oder einer Schwelle — schon gar nicht im
Frontend. Eine im Frontend versteckte Seite ist nur eine ungenannte URL; wer sie
kennt, ruft sie auf.

Rollen sind Django-Gruppen. Die Zuordnung steht in MEMORY.md:

    Admin       Bernd, Florian   alles
    Bearbeiter  Anna             alles außer löschen, Finanzen eintragen,
                                 Nutzer verwalten
    Leser       (später)         nur sehen — aber alles sehen
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

ADMIN = "admin"
BEARBEITER = "bearbeiter"
LESER = "leser"

ALLE_ROLLEN = (ADMIN, BEARBEITER, LESER)


def rolle(nutzer):
    """Die Rolle eines Nutzers, oder None."""
    if not nutzer or not nutzer.is_authenticated:
        return None
    if nutzer.is_superuser:
        return ADMIN
    namen = {g.name for g in nutzer.groups.all()}
    for r in ALLE_ROLLEN:  # Reihenfolge = Rangfolge, die stärkste gewinnt
        if r in namen:
            return r
    return None


def ist_admin(nutzer):
    return rolle(nutzer) == ADMIN


def darf_sehen(nutzer):
    """Alle drei Rollen sehen alles — auch Kontostand, Runway und fremde Stunden."""
    return rolle(nutzer) in (ADMIN, BEARBEITER, LESER)


def darf_bearbeiten(nutzer):
    """Projekte, Bereiche, Pakete, Kontakte, Zeiten anlegen und ändern."""
    return rolle(nutzer) in (ADMIN, BEARBEITER)


def darf_loeschen(nutzer):
    return ist_admin(nutzer)


def darf_finanzen_eintragen(nutzer):
    """Kontostand, Fixkosten, Monatskosten. Sehen dürfen sie alle."""
    return ist_admin(nutzer)


def darf_nutzer_verwalten(nutzer):
    return ist_admin(nutzer)


def darf_sichern(nutzer):
    """
    Den gesamten Bestand ausgeben und einspielen.

    Eigenes Recht und nicht `darf_nutzer_verwalten` mitbenutzt, obwohl beide
    heute „Admin" heißen: Das Archiv enthält *alles* — auch Passwort-Hashes und
    fremde Stammdaten — und das Einspielen ersetzt den Bestand samt Konten.
    Käme je eine Rolle dazu, die Nutzer anlegen darf, soll sie nicht nebenbei
    die Datenbank tauschen können.
    """
    return ist_admin(nutzer)


def darf_fremde_zeiten_aendern(nutzer):
    """
    Admin und Bearbeiter dürfen fremde Buchungen ändern. Löschen nur der Admin —
    das fällt unter `darf_loeschen`.
    """
    return darf_bearbeiten(nutzer)


def darf_stammdaten_sehen(nutzer, anderer):
    """
    Adresse und Geburtsdatum sieht nur man selbst und der Admin. Name, Funktion,
    E-Mail und Telefon sehen alle.
    """
    if not nutzer or not nutzer.is_authenticated:
        return False
    return nutzer.pk == anderer.pk or ist_admin(nutzer)


# --- Für DRF ----------------------------------------------------------------


class SocosBerechtigung(BasePermission):
    """
    Die Regel für alle ViewSets: sehen darf jeder Angemeldete, schreiben der
    Bearbeiter, löschen nur der Admin.

    Ein ViewSet, das strenger sein muss, setzt `schreiben_nur_admin = True` —
    so wie das Finanz-ViewSet. Die Entscheidung bleibt damit in dieser Datei.
    """

    def has_permission(self, request, view):
        nutzer = request.user
        if not nutzer or not nutzer.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return darf_sehen(nutzer)

        if request.method == "DELETE":
            return darf_loeschen(nutzer)

        if getattr(view, "schreiben_nur_admin", False):
            return ist_admin(nutzer)

        return darf_bearbeiten(nutzer)
