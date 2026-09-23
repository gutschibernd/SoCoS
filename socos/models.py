"""
Grundmodelle: Nutzer, weiches Löschen, Änderungsprotokoll.

Fachmodelle (Projekt, Projektphase, Arbeitspaket, Zeitbuchung, Kontakte, Finanzen)
kommen in eigenen Dateien und werden hier importiert.
"""

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from socos import aktueller_nutzer


# --- Nutzer -----------------------------------------------------------------


class NutzerVerwaltung(BaseUserManager):
    """
    Legt Konten **ohne** Passwort an. Gesetzt wird es danach in einem eigenen
    Schritt — kein Befehl nimmt ein Passwort als Argument entgegen, das stünde
    sonst in der Shell-Historie und in der Prozessliste des Servers.
    """

    use_in_migrations = True

    def create_user(self, email, name="", **felder):
        if not email:
            raise ValueError("Ein Konto braucht eine E-Mail-Adresse.")
        felder.setdefault("neuigkeiten_bis", self._neueste_version())
        nutzer = self.model(email=self.normalize_email(email), name=name, **felder)
        nutzer.set_unusable_password()
        nutzer.save(using=self._db)
        return nutzer

    @staticmethod
    def _neueste_version():
        """
        Ein neues Konto startet auf dem aktuellen Stand der Änderungen.

        Sonst liefe jemand, der heute dazukommt, beim ersten Anmelden durch die
        Neuigkeiten der Monate davor — für ihn ist nichts davon neu, es ist
        einfach die Anwendung. Was er braucht, ist die Doku.

        Der Import steht hier drin und nicht oben: Der Manager läuft in
        Migrationen (`use_in_migrations`), und ein Modul auf Modulebene, das es
        in einer alten Migration noch nicht gab, wäre dort eine Zeitbombe.
        """
        from socos import aenderungen

        return aenderungen.NEUESTE

    def create_superuser(self, email, name="", password=None, **felder):
        felder.setdefault("is_staff", True)
        felder.setdefault("is_superuser", True)
        felder.setdefault("neuigkeiten_bis", self._neueste_version())
        nutzer = self.model(email=self.normalize_email(email), name=name, **felder)
        if password:
            nutzer.set_password(password)
        else:
            nutzer.set_unusable_password()
        nutzer.save(using=self._db)
        return nutzer


class Nutzer(AbstractBaseUser, PermissionsMixin):
    """
    Ein Konto. Angemeldet wird mit der E-Mail-Adresse.

    **Nutzer werden nicht gelöscht, sondern stillgelegt** (`is_active = False`).
    Das weiche Löschen der Fachmodelle gilt hier bewusst nicht: Django hat mit
    `is_active` bereits genau diesen Schalter, und ein zweiter daneben wäre ein
    zweiter Mechanismus, den man beim nächsten Mal verwechselt.
    """

    email = models.EmailField("E-Mail", unique=True)
    name = models.CharField("Name", max_length=120)
    initialen = models.CharField("Initialen", max_length=4, blank=True)
    farbe = models.CharField("Farbe", max_length=7, default="#BFD9CE")

    # Stammdaten aus dem Profil. Adresse und Geburtsdatum sieht nur der Nutzer
    # selbst und ein Admin — durchgesetzt wird das im Serializer, nicht hier.
    funktion = models.CharField("Funktion", max_length=120, blank=True)
    telefon = models.CharField("Telefon", max_length=40, blank=True)
    strasse = models.CharField("Straße", max_length=160, blank=True)
    ort = models.CharField("Ort", max_length=120, blank=True)
    geburtsdatum = models.DateField("Geburtsdatum", null=True, blank=True)

    is_active = models.BooleanField("aktiv", default=True)
    is_staff = models.BooleanField("Admin-Zugang", default=False)
    beigetreten_am = models.DateTimeField("beigetreten am", default=timezone.now)

    # Bis zu welcher Version die Neuigkeiten gesehen wurden (siehe
    # socos/aenderungen.py). Eine Zeichenkette und kein Zeitstempel: Verglichen
    # wird mit der Version, nicht mit dem Moment des Ansehens — sonst
    # entschiede die Uhr des Servers darüber, ob jemand eine Änderung schon
    # kennt, die vor seinem letzten Besuch veröffentlicht wurde.
    neuigkeiten_bis = models.CharField("Neuigkeiten gesehen bis", max_length=20, blank=True)

    objects = NutzerVerwaltung()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        verbose_name = "Nutzer"
        verbose_name_plural = "Nutzer"
        ordering = ["name"]

    def __str__(self):
        return self.name or self.email

    def save(self, *args, **kwargs):
        if not self.initialen and self.name:
            self.initialen = self.initialen_aus_name(self.name)
        super().save(*args, **kwargs)

    @staticmethod
    def initialen_aus_name(name):
        teile = [t for t in name.strip().split() if t]
        return "".join(t[0] for t in teile[:2]).upper() or "NN"


# --- Weiches Löschen --------------------------------------------------------


class AktiveAbfrage(models.QuerySet):
    def delete(self):
        """
        Auch ein `queryset.delete()` löscht weich. Sonst gäbe es einen zweiten,
        stillen Weg an der Regel vorbei — und genau der wird benutzt, wenn es
        schnell gehen muss.

        Bewusst Zeile für Zeile statt als ein `update()`: Nur so greift die
        Prüfung auf geschützte Verweise. Ein Sammel-Update wäre schneller und
        risse dabei Beziehungen auf, die `on_delete=PROTECT` gerade verhindern
        soll. Bei drei Nutzern ist die Geschwindigkeit den Preis nicht wert.
        """
        anzahl = 0
        for objekt in self:
            objekt.delete()
            anzahl += 1
        return anzahl, {self.model._meta.label: anzahl}

    def hart_loeschen(self):
        """Nur für Tests und den Wiedereinspieler einer Sicherung."""
        return super().delete()


class AktiveVerwaltung(models.Manager.from_queryset(AktiveAbfrage)):
    def get_queryset(self):
        return super().get_queryset().filter(geloescht_am__isnull=True)


class Basismodell(models.Model):
    """
    Gemeinsame Grundlage aller Fachmodelle.

    `objects` zeigt nur, was nicht gelöscht ist. `alle_objekte` zeigt alles —
    gebraucht wird das vom Admin, vom Wiederherstellen und von der Sicherung.

    **Achtung:** Über eine Beziehung (`paket.buchungen.all()`) greift Django auf
    den Basis-Manager zu und sieht auch Gelöschtes. Wo das zählt, wird ausdrücklich
    gefiltert.
    """

    erstellt_am = models.DateTimeField("erstellt am", auto_now_add=True)
    geaendert_am = models.DateTimeField("geändert am", auto_now=True)
    geloescht_am = models.DateTimeField("gelöscht am", null=True, blank=True, db_index=True)

    objects = AktiveVerwaltung()
    alle_objekte = models.Manager.from_queryset(AktiveAbfrage)()

    class Meta:
        abstract = True
        # Damit Beziehungen und der Admin nicht über den gefilterten Manager
        # gehen und dabei Gelöschtes unsichtbar machen, wo es gebraucht wird.
        base_manager_name = "alle_objekte"

    @property
    def ist_geloescht(self):
        return self.geloescht_am is not None

    def geschuetzte_verweise(self):
        """
        Was noch auf dieses Objekt zeigt und mit `on_delete=PROTECT` hängt.

        **Warum das von Hand geprüft wird:** `PROTECT` greift nur beim echten
        Löschen. Weiches Löschen ist für die Datenbank ein `UPDATE` — der
        Schutz läuft dabei ins Leere, und ein Projekt ließe sich entfernen,
        obwohl Zeitbuchungen daran hängen. Die wären danach Waisen: in keiner
        Liste mehr sichtbar, aber weiter in der Datenbank und im Nachweis.
        """
        treffer = []
        for beziehung in self._meta.related_objects:
            if beziehung.on_delete is not models.PROTECT:
                continue
            menge = beziehung.related_model._base_manager.filter(
                **{beziehung.field.name: self}
            )
            if hasattr(beziehung.related_model, "geloescht_am"):
                menge = menge.filter(geloescht_am__isnull=True)
            treffer.extend(menge[:5])
        return treffer

    def delete(self, *args, **kwargs):
        """
        Weiches Löschen. Ein hartes gibt es in dieser Anwendung nicht.

        Wirft `ProtectedError`, wenn noch etwas daran hängt — die zentrale
        Fehlerübersetzung macht daraus eine 409 samt Aufzählung dessen, was
        im Weg steht.
        """
        haengt_dran = self.geschuetzte_verweise()
        if haengt_dran:
            raise models.ProtectedError(
                f"„{self}“ wird noch verwendet.", haengt_dran
            )
        self.geloescht_am = timezone.now()
        self.save(update_fields=["geloescht_am", "geaendert_am"])

    def hart_loeschen(self, *args, **kwargs):
        """Nur für Tests und den Wiedereinspieler einer Sicherung."""
        return super().delete(*args, **kwargs)

    def wiederherstellen(self):
        self.geloescht_am = None
        self.save(update_fields=["geloescht_am", "geaendert_am"])


# --- Änderungsprotokoll -----------------------------------------------------


class Protokolleintrag(models.Model):
    """
    Wer, wann, was, alt → neu.

    Protokolleinträge werden nie gelöscht und nie geändert. Sie erben deshalb
    nicht von `Basismodell` — ein weich gelöschter Protokolleintrag wäre ein
    Widerspruch in sich.
    """

    class Aktion(models.TextChoices):
        ANGELEGT = "angelegt", "angelegt"
        GEAENDERT = "geaendert", "geändert"
        GELOESCHT = "geloescht", "gelöscht"
        WIEDERHERGESTELLT = "wiederhergestellt", "wiederhergestellt"

    zeitpunkt = models.DateTimeField("Zeitpunkt", default=timezone.now, db_index=True)
    nutzer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Nutzer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="protokolleintraege",
    )
    # Der Name bleibt lesbar, auch wenn das Objekt später verschwindet oder
    # umbenannt wird. Ein Protokoll, das auf ein gelöschtes Objekt zeigt und
    # dessen Namen nicht mehr kennt, beantwortet keine Frage.
    nutzer_text = models.CharField("Nutzer (Text)", max_length=160, blank=True)

    modell = models.CharField("Modell", max_length=80, db_index=True)
    objekt_id = models.CharField("Objekt", max_length=40, db_index=True)
    objekt_text = models.CharField("Objekt (Text)", max_length=250, blank=True)

    aktion = models.CharField("Aktion", max_length=20, choices=Aktion.choices)
    aenderungen = models.JSONField("Änderungen", default=dict, blank=True)

    class Meta:
        verbose_name = "Protokolleintrag"
        verbose_name_plural = "Änderungsprotokoll"
        ordering = ["-zeitpunkt", "-id"]
        indexes = [models.Index(fields=["modell", "objekt_id", "-zeitpunkt"])]

    def __str__(self):
        return f"{self.zeitpunkt:%d.%m.%Y %H:%M} · {self.modell} {self.objekt_id} · {self.aktion}"

    @classmethod
    def schreiben(cls, instanz, aktion, aenderungen=None):
        nutzer = aktueller_nutzer.holen()
        return cls.objects.create(
            nutzer=nutzer,
            nutzer_text=str(nutzer) if nutzer else "",
            modell=instanz._meta.label,
            objekt_id=str(instanz.pk),
            objekt_text=str(instanz)[:250],
            aktion=aktion,
            aenderungen=aenderungen or {},
        )


# --- Projektstruktur --------------------------------------------------------
#
# Projekt → Projektphase → Arbeitspaket → Unteraufgabe. Vier Ebenen, mehr nicht.
#
# Die mittlere Ebene hieß bis 2026-09-18 „Bereich". Sie heißt jetzt
# Projektphase, weil sie genau das ist: ein Abschnitt, der einen Anfang, ein
# Ende und ein Stundenpensum hat und auf den der nächste folgt. „Bereich"
# klang nach einem Fach im Regal und ließ offen, ob zwei davon nebeneinander
# oder nacheinander laufen.


class Projekt(Basismodell):
    titel = models.CharField("Titel", max_length=160)
    untertitel = models.CharField("Untertitel", max_length=200, blank=True)
    farbe = models.CharField("Farbe", max_length=7, default="#14595F")
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Projekt"
        verbose_name_plural = "Projekte"
        ordering = ["reihenfolge", "titel"]

    def __str__(self):
        return self.titel


class Phasenart(models.TextChoices):
    DEV = "dev", "Entwicklung"
    FIN = "fin", "Finanzierung"
    ZIEL = "ziel", "Ziele"


class Phasenstand(models.TextChoices):
    """
    Drei Werte, nicht ein Ja/Nein. Bis 2026-09-18 gab es nur `abgeschlossen`;
    ob eine Phase erst ansteht oder gerade läuft, war daraus nicht zu sehen —
    und genau das entscheidet auf der Projektseite, was aufgeklappt ist.
    """

    OFFEN = "offen", "offen"
    LAEUFT = "laeuft", "läuft"
    ABGESCHLOSSEN = "abgeschlossen", "abgeschlossen"


class Projektphase(Basismodell):
    projekt = models.ForeignKey(
        Projekt, verbose_name="Projekt", on_delete=models.PROTECT, related_name="phasen"
    )
    titel = models.CharField("Titel", max_length=160)
    art = models.CharField("Art", max_length=8, choices=Phasenart.choices)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    # Die Laufzeit. Beide Felder dürfen leer bleiben: Eine Phase, die erst in
    # zwei Jahren ansteht, hat noch kein Datum, und ein erfundenes wäre
    # schlimmer als keines — es stünde in jeder Hochrechnung.
    von = models.DateField("Beginn", null=True, blank=True)
    bis = models.DateField("Ende", null=True, blank=True)

    # Eine abgeschlossene Phase nimmt keine Zeit mehr an (siehe
    # `grund_gegen_buchung` am Arbeitspaket).
    #
    # **Warum ein eigenes Merkmal und nicht „bis liegt in der Vergangenheit":**
    # Eine Phase läuft regelmäßig über ihr geplantes Ende hinaus. Wäre das
    # Datum die Sperre, fiele die Uhr an einem willkürlichen Morgen aus, ohne
    # dass jemand etwas entschieden hätte.
    stand = models.CharField(
        "Stand", max_length=14, choices=Phasenstand.choices, default=Phasenstand.OFFEN
    )

    @property
    def abgeschlossen(self):
        return self.stand == Phasenstand.ABGESCHLOSSEN

    class Meta(Basismodell.Meta):
        verbose_name = "Projektphase"
        verbose_name_plural = "Projektphasen"
        ordering = ["projekt", "reihenfolge", "titel"]

    def __str__(self):
        return f"{self.projekt.titel} · {self.titel}"


class Paketstatus(models.TextChoices):
    """
    Sieben Werte, nicht fünf. „eingereicht" und „zugesagt" sind bei einem
    Förderantrag die entscheidenden Zwischenzustände — genau die, die man
    wissen will.
    """

    OFFEN = "offen", "offen"
    LAEUFT = "laeuft", "läuft"
    EINGEREICHT = "eingereicht", "eingereicht"
    ZUGESAGT = "zugesagt", "zugesagt"
    FERTIG = "fertig", "fertig"
    VERWORFEN = "verworfen", "verworfen"
    OFFENE_FRAGE = "offene_frage", "offene Frage"


#: Auf diese Stände darf die Uhr laufen.
#:
#: „fertig" und „verworfen" fehlen mit Absicht: Wer ein abgeschlossenes Paket
#: in der Liste sieht, bucht früher oder später darauf — und dann steht die
#: Zeit im Nachweis an einem Paket, das seit Monaten zu ist.
#:
#: **Die Liste stand bis 2026-09-18 nur im Frontend** (`basis/start.ts`). Dort
#: ist sie eine Empfehlung: Sie räumt das Auswahlfeld auf, hält aber nichts
#: auf, was an ihr vorbei kommt — ein `POST /api/zeiten/` mit der Paketnummer
#: ging durch. Die Regel steht jetzt hier und wird serverseitig durchgesetzt;
#: das Frontend liest sie weiter, damit gar nicht erst angeboten wird, was
#: hinterher abgelehnt würde.
BUCHBARE_STAENDE = (
    Paketstatus.OFFEN,
    Paketstatus.LAEUFT,
    Paketstatus.EINGEREICHT,
    Paketstatus.ZUGESAGT,
    Paketstatus.OFFENE_FRAGE,
)


class Arbeitspaket(Basismodell):
    phase = models.ForeignKey(
        Projektphase, verbose_name="Projektphase", on_delete=models.PROTECT, related_name="pakete"
    )
    titel = models.CharField("Titel", max_length=250)
    # Hieß bis 2026-09-18 „notiz". Umbenannt, weil das Feld inzwischen den
    # Absatz trägt, der das Paket erklärt — was darin steht, ist die Sache
    # selbst und keine Randbemerkung dazu.
    beschreibung = models.TextField("Beschreibung", blank=True)
    status = models.CharField(
        "Status", max_length=14, choices=Paketstatus.choices, default=Paketstatus.OFFEN
    )
    # Bis 2026-09-18 trug das Paket eine Stufenleiste (Konzept · Umsetzung ·
    # Test · Abschluss, mit Monaten je Stufe), aus der ein Fortschritt
    # gerechnet wurde. Weg, weil sie nichts gemessen hat: Der Stand war eine
    # Schätzung per Klick, und die Monate stammten aus einer Vorlage, die für
    # kein Paket je gestimmt hat. Der Fortschritt kommt jetzt aus den
    # gebuchten Stunden gegen das Pensum (siehe `Pensum` und
    # `auswertung.fortschritt`) — das wird gerechnet, nicht geschätzt.
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    # Hier landet Zeit, die ohne Paketwahl gestartet wurde (siehe
    # `auffangpaket()` unter dieser Klasse). Genau ein Paket trägt das Merkmal.
    #
    # **Warum ein Merkmal am Paket und nicht ein Blick auf den Titel
    # „Overhead":** Ein Titel wird umbenannt, und danach legte der nächste
    # Klick still ein zweites Overhead-Projekt an — zwei Töpfe mit demselben
    # Namen, und in keiner Auswertung fiele das auf. Das Merkmal überlebt jede
    # Umbenennung.
    ist_auffang = models.BooleanField("Auffangpaket", default=False)

    class Meta(Basismodell.Meta):
        verbose_name = "Arbeitspaket"
        verbose_name_plural = "Arbeitspakete"
        ordering = ["phase", "reihenfolge", "titel"]

    def __str__(self):
        return self.titel

    def grund_gegen_buchung(self):
        """
        Warum auf dieses Paket keine Zeit laufen darf — oder `None`.

        Ein Satz und kein Wahrheitswert: Die Antwort wird dem Nutzer gezeigt,
        und „nicht buchbar" sagt ihm nicht, was er stattdessen tun soll.
        Gerufen wird das überall dort, wo ein Paket als **Ziel** gewählt
        wird — nicht beim Beenden einer laufenden Buchung: Wird eine Phase
        geschlossen, während die Uhr läuft, muss man sie noch stoppen können.
        """
        if self.geloescht_am is not None:
            return "Dieses Arbeitspaket gibt es nicht mehr."
        if self.phase.abgeschlossen:
            return (
                f"Die Projektphase „{self.phase.titel}“ ist abgeschlossen. "
                "Auf ihre Arbeitspakete wird keine Zeit mehr gebucht."
            )
        if self.status not in BUCHBARE_STAENDE:
            return (
                f"Das Arbeitspaket „{self.titel}“ steht auf "
                f"„{self.get_status_display()}“ und nimmt keine Zeit mehr an."
            )
        return None

#: Wie das Projekt heißt, das beim ersten Start ohne Paketwahl entsteht.
AUFFANG_PROJEKT = "Overhead"
# Was hineinfällt, steht im Untertitel — damit niemand ein eigenes Paket
# „Networking" anlegt, das dann neben dem Auffangpaket steht.
AUFFANG_UNTERTITEL = "Networking, Meetings, Gespräche — alles, was zu keinem Paket gehört"
AUFFANG_PHASE = "Laufendes"
AUFFANG_PAKET = "Allgemein"


def auffangpaket():
    """
    Das Paket, auf das die Uhr läuft, wenn niemand ein Paket gewählt hat.

    **Warum es überhaupt eines gibt:** Zeit soll sich aufzeichnen lassen, bevor
    man weiß, wohin sie gehört. Der naheliegende Weg wäre eine Buchung ohne
    Paket (`paket = null`) — genau den gibt es nicht: Dann gäbe es zwei Arten
    von Buchungen, und jede Auswertung, jeder Nachweis und jede Summe müsste
    beide kennen. Stattdessen landet solche Zeit auf einem ganz normalen Paket
    in einem ganz normalen Projekt; beim Clock-out oder später in der Zeitliste
    wird sie umgebucht, wenn sie woanders hingehört.

    **Warum es angelegt wird und nicht eingerichtet werden muss:** Ein Knopf,
    der erst funktioniert, nachdem jemand in der Projektansicht ein Paket
    angelegt und irgendwo als Auffang markiert hat, ist kein Knopf, sondern
    eine Fehlermeldung. Angelegt wird beim ersten Griff, nicht in einer
    Migration — eine Migration legte es auch dort an, wo nie jemand den Knopf
    drückt.

    Gibt es schon ein Projekt „Overhead", wird das benutzt statt ein zweites
    daneben zu stellen.
    """
    paket = Arbeitspaket.objects.filter(ist_auffang=True).order_by("pk").first()
    if paket is not None:
        return paket

    projekt = Projekt.objects.filter(titel__iexact=AUFFANG_PROJEKT).order_by("pk").first()
    if projekt is None:
        projekt = Projekt.objects.create(
            titel=AUFFANG_PROJEKT,
            untertitel=AUFFANG_UNTERTITEL,
            # Hinten in den Auswahllisten: Overhead ist das, was nebenher
            # läuft. Die Projektseite stellt es trotzdem nach oben — quer über
            # die Projekte, weil es zu allen gehört (`ist_auffang` am Projekt).
            reihenfolge=900,
        )
    phase = projekt.phasen.filter(geloescht_am__isnull=True).order_by("pk").first()
    if phase is None:
        phase = Projektphase.objects.create(
            projekt=projekt, titel=AUFFANG_PHASE, art=Phasenart.DEV
        )
    return Arbeitspaket.objects.create(
        phase=phase,
        titel=AUFFANG_PAKET,
        status=Paketstatus.LAEUFT,
        ist_auffang=True,
    )


class Pensum(Basismodell):
    """
    Wie viele Stunden **eine bestimmte Person** für **ein Paket** vorgesehen
    sind. Im Arbeitsplan steht das so: AP02 — BG 270 h, FD 140 h.

    **Warum je Person und nicht eine Zahl am Paket:** „410 Stunden für AP02"
    beantwortet nicht die Frage, die jemand am Morgen wirklich hat — nämlich
    wie viel davon *er selbst* noch offen hat. Eine Gesamtzahl ließe sich
    zwar durch die Zahl der Beteiligten teilen, aber genau das stimmt hier
    nie: Der eine trägt 270 Stunden, der andere 140.

    **Warum ein eigenes Modell und keine JSON-Liste am Paket:** Die Zahl wird
    gegen die gebuchte Zeit derselben Person gerechnet. Das ist eine
    Verknüpfung zum Nutzer, und die gehört in einen Fremdschlüssel — eine
    Nummer in einem JSON-Feld hält niemand davon ab, auf ein gelöschtes Konto
    zu zeigen.

    Es gibt **höchstens einen** Eintrag je Paket und Person. Zwei wären zwei
    Pensen für dieselbe Arbeit, und keine Anzeige könnte entscheiden, welches
    gilt.
    """

    paket = models.ForeignKey(
        Arbeitspaket,
        verbose_name="Arbeitspaket",
        on_delete=models.PROTECT,
        related_name="pensen",
    )
    person = models.ForeignKey(
        "Nutzer", verbose_name="Person", on_delete=models.PROTECT, related_name="pensen"
    )
    # Decimal, nicht Float: Stunden werden über ein Projekt summiert, und in
    # Gleitkomma ist 0.1 + 0.2 nicht 0.3 (CLAUDE.md). Eine Viertelstunde ist
    # die kleinste Einheit, die im Arbeitsplan vorkommt — zwei Nachkommastellen
    # tragen sie.
    stunden = models.DecimalField("Stunden", max_digits=7, decimal_places=2)

    class Meta(Basismodell.Meta):
        verbose_name = "Pensum"
        verbose_name_plural = "Pensen"
        ordering = ["paket", "person"]
        constraints = [
            models.UniqueConstraint(
                fields=["paket", "person"],
                condition=models.Q(geloescht_am__isnull=True),
                name="ein_pensum_je_paket_und_person",
            )
        ]

    def __str__(self):
        return f"{self.paket.titel} · {self.person.name}: {self.stunden} h"


class Unteraufgabe(Basismodell):
    """
    Eine Ebene unter dem Paket. **Ohne eigene Zeitbuchungen** — gebucht wird
    aufs Paket, sonst zerfällt jede Auswertung in zwei Töpfe.
    """

    paket = models.ForeignKey(
        Arbeitspaket,
        verbose_name="Arbeitspaket",
        on_delete=models.PROTECT,
        related_name="unteraufgaben",
    )
    titel = models.CharField("Titel", max_length=250)
    erledigt = models.BooleanField("erledigt", default=False)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Unteraufgabe"
        verbose_name_plural = "Unteraufgaben"
        ordering = ["paket", "reihenfolge", "titel"]

    def __str__(self):
        return self.titel


# --- Zeit -------------------------------------------------------------------


class Zeitbuchung(Basismodell):
    """
    Eine gebuchte Zeitspanne auf einem Arbeitspaket.

    Start und Ende werden **sekundengenau** gespeichert. Gerundet wird erst in
    der Auswertung (`socos/services/zeit.py`) — wer beim Erfassen rundet, kann
    die Rundung nicht mehr zurücknehmen, wenn die Regel sich ändert.

    `ende is None` heißt: läuft gerade. Je Person kann höchstens eine laufen;
    dafür sorgt die Bedingung unten in der Datenbank, nicht nur der Code.
    """

    person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Person",
        on_delete=models.PROTECT,
        related_name="zeitbuchungen",
    )
    paket = models.ForeignKey(
        Arbeitspaket,
        verbose_name="Arbeitspaket",
        on_delete=models.PROTECT,
        related_name="zeitbuchungen",
    )
    start = models.DateTimeField("Start")
    ende = models.DateTimeField("Ende", null=True, blank=True)
    notiz = models.TextField("Notiz", blank=True)

    # Gesetzt, wenn die Buchung nicht sauber beendet wurde, sondern am
    # Tagesende abgeschnitten werden musste. Sie zählt dann in **keiner**
    # Auswertung mit, bis jemand sie bestätigt hat.
    #
    # Warum sichtbar unfertig statt still korrigiert: Eine 14-Stunden-Buchung,
    # die echt aussieht, fällt niemandem auf.
    ist_entwurf = models.BooleanField("Entwurf", default=False)

    class Meta(Basismodell.Meta):
        verbose_name = "Zeitbuchung"
        verbose_name_plural = "Zeitbuchungen"
        ordering = ["-start"]
        constraints = [
            models.UniqueConstraint(
                fields=["person"],
                condition=models.Q(ende__isnull=True, geloescht_am__isnull=True),
                name="hoechstens_eine_laufende_buchung_je_person",
            ),
            models.CheckConstraint(
                condition=models.Q(ende__isnull=True) | models.Q(ende__gt=models.F("start")),
                name="ende_liegt_nach_start",
            ),
        ]
        indexes = [models.Index(fields=["person", "-start"])]

    def __str__(self):
        return f"{self.person} · {self.paket} · {self.start:%d.%m.%Y %H:%M}"

    @property
    def laeuft(self):
        return self.ende is None

    @property
    def sekunden(self):
        """Dauer in Sekunden. Eine laufende Buchung zählt bis jetzt."""
        bis = self.ende or timezone.now()
        return max(0, int((bis - self.start).total_seconds()))


# --- Kontakte ---------------------------------------------------------------


class Organisationsstufe(models.TextChoices):
    """
    Wie nah wir einer Organisation sind — eine Leiter, keine Schubladen.

    Vorher standen hier drei Kategorien, und eine davon (`antrag`) war ein
    Vorgang, kein Verhältnis: Ein Haus, das man gut kennt und mit dem gerade
    kein Antrag läuft, fiel damit auf „Erstkontakt" zurück. Jetzt beschreiben
    alle Stufen dasselbe — wie weit die Beziehung ist —, und dadurch ist
    „weiter oben" eine Aussage.

    **Die Reihenfolge ist die Skala.** Wer eine Stufe einschiebt, schiebt sie
    an die Stelle, an die sie gehört; die Anzeige zählt die Punkte davor.
    """

    ERSTKONTAKT = "erstkontakt", "Erstkontakt"
    KENNENGELERNT = "kennengelernt", "Kennengelernt"
    AUSTAUSCH = "austausch", "Im Austausch"
    ANGEBAHNT = "angebahnt", "Angebahnt"
    PARTNER = "partner", "Partner"


class Prioritaet(models.TextChoices):
    """
    Was für uns drinsteckt — das Verwertungspotential einer Organisation.

    **Nicht dasselbe wie die Stufe.** Die Stufe sagt, wie nah wir uns sind;
    die Priorität, wie viel es bringt, näher zu kommen. Eine Förderstelle, mit
    der wir noch nie geredet haben, kann das Wichtigste auf der Liste sein —
    und ein alter Partner, an dem nichts mehr hängt, das Unwichtigste. Wären
    es Stufen derselben Leiter, ließe sich genau das nicht mehr sagen.

    `OFFEN` ist die Vorgabe und ein eigener Wert, kein leeres Feld: „noch
    nicht eingeschätzt" ist eine Auskunft, „" wäre keine. In der Sortierung
    steht es hinter `GERING` — was niemand angesehen hat, gehört nicht nach
    oben.
    """

    HOCH = "hoch", "Hoch"
    MITTEL = "mittel", "Mittel"
    GERING = "gering", "Gering"
    OFFEN = "offen", "Noch offen"


class Organisation(Basismodell):
    name = models.CharField("Name", max_length=200)
    kurz = models.CharField("Kürzel", max_length=8, blank=True)
    typ = models.CharField("Typ", max_length=80, blank=True)
    stufe = models.CharField(
        "Stufe",
        max_length=14,
        choices=Organisationsstufe.choices,
        default=Organisationsstufe.ERSTKONTAKT,
    )
    prioritaet = models.CharField(
        "Priorität",
        max_length=6,
        choices=Prioritaet.choices,
        default=Prioritaet.OFFEN,
    )
    nutzen = models.TextField("Nutzen und Interesse", blank=True)

    class Meta(Basismodell.Meta):
        verbose_name = "Organisation"
        verbose_name_plural = "Organisationen"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.kurz and self.name:
            self.kurz = self.name.split()[0][:3].upper()
        super().save(*args, **kwargs)


class Ball(models.TextChoices):
    """
    Wer am Zug ist. `uns` heißt: wir schulden etwas.

    `nichts` ist der dritte Fall: Der Kontakt läuft, aber gerade steht nichts
    an — kein Rückstand bei uns, und wir warten auch auf nichts. Ohne ihn
    landeten diese Personen unter „bei ihnen", und der Filter „Wir warten"
    zeigte Leute, auf die niemand wartet. Der Wert ist absichtlich kein
    Weglassen (leer): Er ist eine Aussage, und ein leeres Feld wäre von
    „noch nie eingetragen" nicht zu unterscheiden.
    """

    UNS = "uns", "bei uns"
    IHNEN = "ihnen", "bei ihnen"
    NICHTS = "nichts", "nichts offen"


class Anrede(models.TextChoices):
    """
    Wie eine Person in einem Brief angesprochen wird.

    **Warum ein Feld und nicht aus dem Vornamen geraten:** Eine Liste von
    Vornamen trifft bei Kurzformen, bei Namen aus anderen Sprachen und bei
    allen, die in keine der beiden Schubladen passen, das Falsche — und zwar
    in der Anrede einer Mail, also genau dort, wo es auffällt und beleidigt.
    Lieber leer lassen als raten.

    Leer ist deshalb ein gültiger Zustand und kein halb ausgefülltes Feld:
    Der Mailentwurf beginnt dann mit „Guten Tag Anna Muster," — richtig für
    jede Person, nur weniger förmlich.
    """

    HERR = "herr", "Herr"
    FRAU = "frau", "Frau"


class Kontakt(Basismodell):
    """Eine Person außerhalb des Teams. Ohne Organisation ist sie ein loser Kontakt."""

    organisation = models.ForeignKey(
        Organisation,
        verbose_name="Organisation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="kontakte",
    )
    name = models.CharField("Name", max_length=160)
    anrede = models.CharField("Anrede", max_length=4, choices=Anrede.choices, blank=True)
    funktion = models.CharField("Rolle", max_length=160, blank=True)
    email = models.EmailField("E-Mail", blank=True)
    # Als Text und nicht zerlegt in Vorwahl und Nummer: Was auf einer
    # Visitenkarte steht, ist mal „+43 664 …", mal „0664 …", mal eine
    # Durchwahl mit Klammer. Ein Format zu erzwingen hieße, dass jemand die
    # Nummer gar nicht einträgt.
    telefon = models.CharField("Telefon", max_length=60, blank=True)
    ball = models.CharField("Am Zug", max_length=6, choices=Ball.choices, default=Ball.UNS)
    offener_punkt = models.CharField("Offener Punkt", max_length=250, blank=True)
    # Wo diese Person hergekommen ist.
    #
    # **Warum ein Feld und nicht aus dem Verlauf gerechnet:** Der früheste
    # Verlaufseintrag mit einem Event wäre die naheliegende Ableitung — und
    # sie ist falsch, sobald man jemanden, den man längst kennt, auf einer
    # Tagung wiedertrifft. Dann stünde bei einem Kontakt aus dem Jahr davor
    # plötzlich „kennengelernt auf dem FFG Forum". Woher jemand kommt, ist
    # eine Tatsache und keine Rechnung; sie wird beim Anlegen festgehalten.
    #
    # Leer heißt: nicht auf einem Event kennengelernt (oder von Hand angelegt,
    # bevor es das Feld gab). Kein Ersatzwert, der beides vermischt.
    kennengelernt_auf = models.ForeignKey(
        "Event",
        verbose_name="Kennengelernt auf",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="kennengelernte",
    )

    class Meta(Basismodell.Meta):
        verbose_name = "Kontakt"
        verbose_name_plural = "Kontakte"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Verlaufsart(models.TextChoices):
    MEETING = "meeting", "Meeting"
    MAIL = "mail", "Mail"
    CALL = "call", "Call"
    EVENT = "event", "Event"


class Verlaufseintrag(Basismodell):
    """
    Ein Eintrag im Verlauf — an einem Kontakt **oder** an einer Organisation.

    Beides zugleich wäre möglich, ist aber nie gemeint: Ein Gespräch führt man
    mit einer Person; eine Notiz zur Organisation gehört an die Organisation.
    """

    kontakt = models.ForeignKey(
        Kontakt,
        verbose_name="Kontakt",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verlauf",
    )
    organisation = models.ForeignKey(
        Organisation,
        verbose_name="Organisation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verlauf",
    )
    # Auf welchem Event der Eintrag entstanden ist. Nullbar: Die meisten
    # Gespräche gehören zu keinem Event, und ein Eintrag darf nicht davon
    # abhängen, dass vorher jemand ein Event angelegt hat.
    #
    # **Warum ein Feld und keine zweite Verlaufssorte:** Ein Gespräch auf einer
    # Tagung ist dasselbe Ereignis wie ein Gespräch am Telefon — nur an einem
    # anderen Ort. Zwei Listen nebeneinander liefen beim Lesen des Verlaufs
    # auseinander, und die Frage „was ist mit diesem Haus zuletzt passiert?"
    # hätte wieder zwei Antworten.
    event = models.ForeignKey(
        "Event",
        verbose_name="Event",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verlauf",
    )
    datum = models.DateField("Datum", default=timezone.localdate)
    art = models.CharField("Art", max_length=10, choices=Verlaufsart.choices)
    titel = models.CharField("Titel", max_length=200)
    text = models.TextField("Text", blank=True)
    wer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Wer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verlaufseintraege",
    )

    class Meta(Basismodell.Meta):
        verbose_name = "Verlaufseintrag"
        verbose_name_plural = "Verlauf"
        ordering = ["-datum", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(kontakt__isnull=False, organisation__isnull=True)
                    | models.Q(kontakt__isnull=True, organisation__isnull=False)
                ),
                name="verlauf_haengt_an_genau_einem",
            )
        ]

    def __str__(self):
        return f"{self.datum:%d.%m.%Y} · {self.titel}"


# --- Events -----------------------------------------------------------------


class Event(Basismodell):
    """
    Eine Tagung, ein Kongress, ein Messetag — ein Anlass, bei dem man Leute
    trifft.

    Ein Event ist **kein Termin**: Es gibt keine Uhrzeit, keine Erinnerung und
    keinen Kalender dahinter. Was es gibt, ist die Vorbereitung (wen wollen wir
    dort ansprechen) und das Ergebnis (mit wem haben wir geredet, was kam
    dabei heraus). Termine und Aufgaben sind bewusst zurückgestellt — siehe
    MEMORY.md.
    """

    titel = models.CharField("Titel", max_length=200)
    ort = models.CharField("Ort", max_length=160, blank=True)
    von = models.DateField("Von")
    # Leer heißt eintägig. Ein zweites Datum, das beim eintägigen Event
    # dasselbe wie `von` enthielte, müsste man beim Verschieben doppelt
    # pflegen — und genau das vergisst man.
    bis = models.DateField("Bis", null=True, blank=True)
    notiz = models.TextField("Notiz", blank=True)
    # Wer von uns hinfährt. Ohne `through`: An der Zuordnung selbst hängt
    # nichts weiter — kein Datum, keine Rolle, kein Status.
    teilnehmer = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        verbose_name="Teilnehmer",
        blank=True,
        related_name="events",
    )

    class Meta(Basismodell.Meta):
        verbose_name = "Event"
        verbose_name_plural = "Events"
        # Das nächste zuerst — und Vergangenes rutscht von selbst nach unten.
        ordering = ["-von", "titel"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(bis__isnull=True) | models.Q(bis__gte=models.F("von")),
                name="event_endet_nicht_vor_seinem_anfang",
            )
        ]

    def __str__(self):
        return self.titel

    @property
    def letzter_tag(self):
        """Der Tag, an dem das Event vorbei ist — bei eintägigen `von`."""
        return self.bis or self.von


class Zielstand(models.TextChoices):
    """
    Drei Werte, nicht fünf. Vor dem Event ist alles offen; danach ist die
    einzige Frage, ob man die Person erwischt hat.
    """

    OFFEN = "offen", "offen"
    GETROFFEN = "getroffen", "getroffen"
    VERPASST = "verpasst", "verpasst"


class Eventziel(Basismodell):
    """
    Eine Zeile auf der Hitlist: wen wollen wir auf diesem Event ansprechen.

    Sie zeigt auf **genau eines** — eine Organisation oder eine Person. Dieselbe
    Regel wie beim Verlaufseintrag, und aus demselben Grund: „Mit dem Institut
    reden, egal mit wem" und „mit Frau Berger reden" sind zwei verschiedene
    Vorhaben. Beides zugleich einzutragen hieße, dass beim Abhaken niemand
    weiß, was nun erledigt ist.

    Was auf dem Event tatsächlich besprochen wurde, steht **nicht** hier,
    sondern als Verlaufseintrag mit `event` — sonst gäbe es zwei Orte für
    dieselbe Auskunft.
    """

    event = models.ForeignKey(
        Event, verbose_name="Event", on_delete=models.PROTECT, related_name="ziele"
    )
    organisation = models.ForeignKey(
        Organisation,
        verbose_name="Organisation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="eventziele",
    )
    kontakt = models.ForeignKey(
        Kontakt,
        verbose_name="Kontakt",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="eventziele",
    )
    anliegen = models.CharField("Anliegen", max_length=250, blank=True)
    stand = models.CharField(
        "Stand", max_length=10, choices=Zielstand.choices, default=Zielstand.OFFEN
    )
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Eventziel"
        verbose_name_plural = "Hitlist"
        ordering = ["event", "reihenfolge", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(kontakt__isnull=False, organisation__isnull=True)
                    | models.Q(kontakt__isnull=True, organisation__isnull=False)
                ),
                name="eventziel_zeigt_auf_genau_eines",
            ),
            # Zweimal dieselbe Organisation auf einer Liste ist kein zweites
            # Vorhaben, sondern ein Doppelklick. Dass die Datenbank das abweist
            # und nicht nur die Oberfläche, ist der Punkt: Die Oberfläche ist
            # nicht der einzige Weg herein.
            models.UniqueConstraint(
                fields=["event", "organisation"],
                condition=models.Q(organisation__isnull=False, geloescht_am__isnull=True),
                name="eine_organisation_nur_einmal_je_event",
            ),
            models.UniqueConstraint(
                fields=["event", "kontakt"],
                condition=models.Q(kontakt__isnull=False, geloescht_am__isnull=True),
                name="eine_person_nur_einmal_je_event",
            ),
        ]

    def __str__(self):
        return f"{self.event.titel} · {self.wen}"

    @property
    def wen(self):
        return str(self.kontakt or self.organisation)


# --- Meetings ---------------------------------------------------------------


class Meeting(Basismodell):
    """
    Eine Besprechung: vorher geplant, während des Termins mitgeschrieben,
    danach als Protokoll gegliedert.

    **Ein Meeting hängt an nichts.** Es lässt sich anlegen, bevor feststeht,
    wer dabei ist — genau so entsteht es ja: zuerst der Termin, dann die
    Namen. Personen und Häuser sind deshalb beide optional und beide als Menge
    angehängt; keines von beiden ist der Besitzer. *Nachgetragen* gehören sie
    trotzdem, sonst findet das Meeting später niemand mehr über den Kontakt —
    danach fragt die Oberfläche, nicht die Datenbank.

    Drei Texte mit drei verschiedenen Leben:

    - `vorbereitung`   vorher, in Ruhe: was wir aus dem Termin holen wollen.
    - `mitschrift`     währenddessen, schnell: Stichworte, halbe Sätze.
    - die Abschnitte   danach: das lesbare Protokoll (`Meetingabschnitt`).

    **Warum die Mitschrift nicht einfach das Protokoll ist:** Wer mitschreibt,
    hat keine Hand frei zum Gliedern. Und wer danach gliedert, will das Rohe
    danebenliegen haben statt es überschrieben zu bekommen — es ist die einzige
    Stelle, an der nachzulesen wäre, ob beim Aufräumen etwas verrutscht ist.
    """

    titel = models.CharField("Titel", max_length=200)
    datum = models.DateField("Datum", default=timezone.localdate)
    # Ohne Uhrzeit ist es trotzdem ein Meeting — SoCoS ist kein Kalender und
    # erinnert an nichts (siehe MEMORY.md). Sie steht hier, weil „Dienstag
    # 14:00" das ist, was man einander sagt.
    uhrzeit = models.TimeField("Uhrzeit", null=True, blank=True)
    ort = models.CharField("Ort", max_length=160, blank=True)

    # Wer von außen dabei war und aus welchen Häusern. Beide als Menge und
    # beide leer erlaubt: Ein Termin mit einem Haus, dessen Ansprechpartner
    # noch niemand kennt, ist der Normalfall der ersten Runde.
    #
    # **Kein `through`:** An der Zuordnung hängt nichts weiter — keine Rolle,
    # kein Status, kein Datum. Und kein PROTECT-Schutz, weil ein M2M keinen
    # kennt: Wird eine Person weich gelöscht, bleibt sie im Protokoll des
    # Meetings stehen, an dem sie teilgenommen hat. Das ist richtig so — sie
    # war dort, und ein Protokoll, das seine Teilnehmer im Nachhinein
    # verliert, ist keines mehr.
    kontakte = models.ManyToManyField(
        "Kontakt", verbose_name="Personen", blank=True, related_name="meetings"
    )
    organisationen = models.ManyToManyField(
        "Organisation", verbose_name="Organisationen", blank=True, related_name="meetings"
    )
    teilnehmer = models.ManyToManyField(
        settings.AUTH_USER_MODEL, verbose_name="Von uns", blank=True, related_name="meetings"
    )

    vorbereitung = models.TextField("Vorbereitung", blank=True)
    mitschrift = models.TextField("Mitschrift", blank=True)

    # **Diese beiden Felder stehen nicht im Änderungsprotokoll.** Sie speichern
    # sich beim Tippen von selbst; jede Pause von zwei Sekunden schriebe sonst
    # einen Eintrag mit dem alten *und* dem neuen Text nebeneinander. Nach
    # einer Stunde Mitschreiben wären das hunderte Einträge, in denen jeder
    # echte Vorgang untergeht — und das Protokoll ist dafür da, gelesen zu
    # werden. Was nachträglich am *Protokoll* geändert wird, steht vollständig
    # drin: Das sind die Abschnitte, und die schreibt niemand im Sekundentakt.
    protokoll_ohne = ("vorbereitung", "mitschrift")

    class Meta(Basismodell.Meta):
        verbose_name = "Meeting"
        verbose_name_plural = "Meetings"
        # Das Jüngste zuerst, und am selben Tag das spätere oben. Ein Meeting
        # ohne Uhrzeit steht hinter denen mit — sonst stünde „irgendwann am
        # Dienstag" über „Dienstag 16:00".
        ordering = ["-datum", models.F("uhrzeit").desc(nulls_last=True), "titel"]

    def __str__(self):
        return f"{self.datum:%d.%m.%Y} · {self.titel}"

    def delete(self, *args, **kwargs):
        """
        Abschnitte und Anhänge gehen mit.

        **Warum das hier von Hand steht:** Weiches Löschen ist für die
        Datenbank ein UPDATE — `on_delete=CASCADE` löst dabei nie aus. Ohne
        diese Zeilen bliebe das Protokoll eines entfernten Meetings als Satz
        Abschnitte zurück, die auf nichts Sichtbares mehr zeigen.

        Erst das Meeting, dann was daran hängt: Wehrt sich das Meeting gegen
        das Löschen, bleibt alles unangetastet. Die Dateien der Anhänge bleiben
        auf der Platte — weich gelöscht heißt wiederherstellbar.
        """
        super().delete(*args, **kwargs)
        for abschnitt in self.abschnitte.filter(geloescht_am__isnull=True):
            abschnitt.delete()
        for anhang in self.anhaenge.filter(geloescht_am__isnull=True):
            anhang.delete()


class Meetingabschnitt(Basismodell):
    """
    Ein Stück Protokoll: eine Überschrift und ein Text.

    **Warum das Protokoll zerlegt ist und nicht in einem Feld steht:** Nach dem
    Termin wird nachgebessert — ein Name richtiggestellt, ein Ergebnis
    präzisiert. In einem einzigen langen Feld heißt das, den ganzen Text
    aufzumachen; hier ändert man den einen Absatz, um den es geht. Und das
    Änderungsprotokoll sagt dann auch, welcher Absatz es war.

    `CASCADE` und nicht `PROTECT` wie sonst überall: Ein Abschnitt hat außerhalb
    seines Meetings kein Leben. Ein Meeting, das sich nicht entfernen ließe,
    solange sein Protokoll daran hängt, wäre die falsche Nachfrage — das
    Protokoll ist der Inhalt, nicht ein fremder Verweis darauf. Beim weichen
    Löschen greift CASCADE ohnehin nicht; das erledigt `Meeting.delete()`.
    """

    meeting = models.ForeignKey(
        Meeting, verbose_name="Meeting", on_delete=models.CASCADE, related_name="abschnitte"
    )
    ueberschrift = models.CharField("Überschrift", max_length=200, blank=True)
    text = models.TextField("Text", blank=True)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Protokollabschnitt"
        verbose_name_plural = "Protokollabschnitte"
        ordering = ["meeting", "reihenfolge", "id"]

    def __str__(self):
        return self.ueberschrift or (self.text[:40] or "Abschnitt")


class Anhangart(models.TextChoices):
    EMAIL = "email", "E-Mail"
    DATEI = "datei", "Datei"


class Meetinganhang(Basismodell):
    """
    Eine Datei am Meeting — meist die E-Mail, die zum Termin geführt hat.

    **Die Datei liegt unter `MEDIA_ROOT`** und wandert damit in die Sicherung.
    Ausgeliefert wird sie nur über `/api/meetinganhaenge/<id>/datei/`, hinter
    der Anmeldung: `/medien/` bedient am Server niemand, und das soll so
    bleiben — in einer Mail an den Steuerberater hängen Ausweiskopien.

    **Bei einer E-Mail steht ihr Text daneben** (`text`: Absender, Datum,
    Betreff, Inhalt, die Namen ihrer Anhänge). Ausgelesen wird einmal beim
    Hochladen, nicht bei jedem Anzeigen: Der Text geht in den Auftrag an das
    LLM und in die Suche, und beides läuft über die Liste aller Meetings. Eine
    Mail je Meeting bei jedem Laden neu zu zerlegen, hieße, für eine Liste
    Anhänge von zwanzig Megabyte zu lesen, um drei Zeilen zu zeigen.

    Andere Dateien (PDF, Bilder) werden nur abgelegt. Ihren Text auszulesen
    bräuchte eine Bibliothek je Format; das kommt, wenn es jemand vermisst.
    """

    meeting = models.ForeignKey(
        Meeting, verbose_name="Meeting", on_delete=models.CASCADE, related_name="anhaenge"
    )
    datei = models.FileField("Datei", upload_to="meetings/%Y/%m/", max_length=300)
    # Der Name, unter dem die Datei hochkam. Der Dateiname auf der Platte ist
    # davon abgeleitet, aber nicht derselbe: Django hängt bei Gleichnamigem
    # Zeichen an, und die will beim Herunterladen niemand sehen.
    name = models.CharField("Name", max_length=255)
    groesse = models.PositiveBigIntegerField("Größe in Byte", default=0)
    art = models.CharField("Art", max_length=10, choices=Anhangart.choices, default=Anhangart.DATEI)
    text = models.TextField("Ausgelesener Text", blank=True)

    class Meta(Basismodell.Meta):
        verbose_name = "Meetinganhang"
        verbose_name_plural = "Meetinganhänge"
        ordering = ["meeting", "erstellt_am", "id"]

    def __str__(self):
        return self.name


# --- Finanzen ---------------------------------------------------------------
#
# Geld ist Decimal, immer. JSON kennt nur Gleitkomma, und dort ist 0.1 + 0.2
# nicht 0.3. In der API gehen diese Werte als Zeichenkette hinaus.


class Kontostand(Basismodell):
    """Ein Stichtagswert. Beliebig viele; jeder gehört über sein Datum zu einem Monat."""

    datum = models.DateField("Stichtag", unique=True)
    betrag = models.DecimalField("Kontostand", max_digits=12, decimal_places=2)

    class Meta(Basismodell.Meta):
        verbose_name = "Kontostand"
        verbose_name_plural = "Kontostände"
        ordering = ["-datum"]

    def __str__(self):
        return f"{self.datum:%d.%m.%Y}: {self.betrag} €"


class Fixkosten(Basismodell):
    """Der wiederkehrende Monatsbetrag. Gilt ab einem Datum bis zum nächsten Eintrag."""

    gueltig_ab = models.DateField("gültig ab", unique=True)
    betrag = models.DecimalField("Betrag je Monat", max_digits=12, decimal_places=2)

    class Meta(Basismodell.Meta):
        verbose_name = "Fixkosten"
        verbose_name_plural = "Fixkosten"
        ordering = ["-gueltig_ab"]

    def __str__(self):
        return f"ab {self.gueltig_ab:%d.%m.%Y}: {self.betrag} €/Monat"


class Monatskosten(Basismodell):
    """Was in einem Monat tatsächlich angefallen ist — inklusive Einmaligem."""

    monat = models.DateField("Monat", unique=True, help_text="Der Erste des Monats.")
    betrag = models.DecimalField("Betrag", max_digits=12, decimal_places=2)

    class Meta(Basismodell.Meta):
        verbose_name = "Monatskosten"
        verbose_name_plural = "Monatskosten"
        ordering = ["-monat"]

    def __str__(self):
        return f"{self.monat:%m/%Y}: {self.betrag} €"

    def save(self, *args, **kwargs):
        # Immer auf den Ersten normieren. Sonst gäbe es denselben Monat
        # mehrfach, und `unique` fiele nicht darüber.
        if self.monat:
            self.monat = self.monat.replace(day=1)
        super().save(*args, **kwargs)


# --- Wünsche und Fehlermeldungen --------------------------------------------


class Rueckmeldungsart(models.TextChoices):
    WUNSCH = "wunsch", "Wunsch"
    FEHLER = "fehler", "Fehler"


class Rueckmeldungsstand(models.TextChoices):
    """
    Der Weg einer Rückmeldung. Bewusst kurz: fünf Stände, und jeder sagt einem
    Melder etwas anderes darüber, ob er noch etwas tun muss.

    „abgelehnt" steht neben „erledigt", weil beides ein Ende ist. Ein Wunsch,
    der nicht kommt, muss das sagen dürfen — sonst steht er für immer auf
    „neu", und niemand traut der Liste mehr.
    """

    NEU = "neu", "neu"
    ANGENOMMEN = "angenommen", "angenommen"
    IN_ARBEIT = "in_arbeit", "in Arbeit"
    ERLEDIGT = "erledigt", "erledigt"
    ABGELEHNT = "abgelehnt", "abgelehnt"


class Rueckmeldung(Basismodell):
    """
    Ein Wunsch oder ein Fehler, gemeldet aus der Anwendung heraus.

    **Melden darf jeder, den Stand setzt nur ein Admin** — durchgesetzt in
    `socos/berechtigung.py`, nicht hier. Hier steht nur, was eine Rückmeldung
    ist.

    `erledigt_in` trägt die Version aus `socos/aenderungen.py`, in der die Sache
    drin ist. **Warum eine Zeichenkette und kein Verweis:** Die Versionen stehen
    im Quelltext, nicht in der Datenbank — ein Fremdschlüssel bräuchte eine
    zweite Liste daneben, und die liefe beim nächsten Eintrag auseinander. Wer
    hier eine Version liest, findet sie in der Doku unter „Änderungen" wieder.
    """

    art = models.CharField(
        "Art", max_length=10, choices=Rueckmeldungsart.choices, default=Rueckmeldungsart.WUNSCH
    )
    titel = models.CharField("Titel", max_length=200)
    text = models.TextField("Beschreibung", blank=True)

    melder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Gemeldet von",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rueckmeldungen",
    )

    stand = models.CharField(
        "Stand", max_length=12, choices=Rueckmeldungsstand.choices,
        default=Rueckmeldungsstand.NEU, db_index=True,
    )
    # Die Antwort des Admins — warum abgelehnt, was stattdessen, ab wann.
    # Ein Feld und kein Kommentarfaden: Bei drei Nutzern ist die Rückfrage ein
    # Zuruf über den Tisch, und ein Faden wäre eine zweite Anwendung im Fenster.
    antwort = models.TextField("Antwort", blank=True)
    erledigt_in = models.CharField("Erledigt in Version", max_length=20, blank=True)

    class Meta(Basismodell.Meta):
        verbose_name = "Rückmeldung"
        verbose_name_plural = "Wünsche und Fehler"
        # Offenes zuerst wäre eine Sortierung mit eingebauter Meinung; die
        # Ansicht gruppiert selbst. Hier gilt: das Neueste oben.
        ordering = ["-erstellt_am", "-id"]

    def __str__(self):
        return f"{self.get_art_display()}: {self.titel}"


# --- Aufgaben ---------------------------------------------------------------


class Aufgabenprioritaet(models.TextChoices):
    """
    Drei Stufen, nicht vier: Die Priorität wird hier **mit einem Klick**
    weitergedreht, und ein Rundlauf über vier Werte ist einer zu viel, um ihn
    im Vorbeigehen zu treffen.

    Deshalb gibt es hier auch kein „offen" wie bei der Organisation: Wer eine
    Aufgabe aufschreibt, hat sie schon eingeschätzt — im Zweifel als „mittel",
    und genau das ist die Vorgabe.
    """

    HOCH = "hoch", "hoch"
    MITTEL = "mittel", "mittel"
    GERING = "gering", "gering"


class Aufgabe(Basismodell):
    """
    Ein Punkt auf der Tafel unter „Intern · Aufgaben". Eine Zeile Text, eine
    Priorität, ein Haken — mehr ist es nicht, und mehr soll es nicht werden.

    **Nicht zu verwechseln mit `Unteraufgabe`.** Die hängt an einem
    Arbeitspaket und beschreibt ein Stück Projektarbeit. Eine `Aufgabe` hängt
    an niemandem und an nichts: Sie ist der Zettel, der sonst am Bildschirmrand
    klebt. Es gibt bewusst **keinen** Verweis auf ein Paket — sonst wäre es die
    dritte Stelle, an der Projektarbeit steht, und die Tafel wäre keine Tafel
    mehr, sondern eine zweite Projektansicht.

    **`person = None` heißt „Allgemein"** — die Spalte, die niemandem gehört.
    Ein eigenes Feld „ist_allgemein" daneben wäre ein zweiter Zustand für
    dieselbe Auskunft, und beide könnten sich widersprechen.

    Beschreibung, Anhänge, wer es abgehakt hat: alles bewusst nicht. Wer wann
    was geändert hat, steht ohnehin im Änderungsprotokoll — dafür braucht die
    Tafel kein eigenes Feld.

    **Die Frist ist freiwillig und die Ausnahme.** Sie kam mit den Abgaben
    des Business Plan Lite: Ein Termin, den ein Dritter setzt, gehört auf die
    Tafel, und ohne Datum stünde dort „Version 1 abgeben" neben „Version 2
    abgeben", und keiner sähe, welche drängt. Die meisten Zettel haben keine.

    **`ist_idee` macht aus derselben Zeile einen Punkt der Ideenliste.** Kein
    eigenes Modell `Idee` daneben: Eine Idee ist genau das, was eine Aufgabe
    ist, solange niemand entschieden hat, dass sie getan wird — Text,
    Einschätzung, ein Haken. Mit einem zweiten Modell wäre „das machen wir"
    ein Löschen samt Abtippen, mit dem Kennzeichen ist es ein Klick. Und die
    Sicherung, das Änderungsprotokoll und die Berechtigung gelten ohne Zutun
    weiter — ein neues Modell müsste in allen dreien nachgetragen werden.
    """

    text = models.CharField("Aufgabe", max_length=250)
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Für",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="aufgaben",
        help_text="Leer heißt: allgemein, für niemanden bestimmten.",
    )
    prioritaet = models.CharField(
        "Priorität",
        max_length=8,
        choices=Aufgabenprioritaet.choices,
        default=Aufgabenprioritaet.MITTEL,
    )
    erledigt = models.BooleanField("erledigt", default=False)
    frist = models.DateField("Frist", null=True, blank=True)
    ist_idee = models.BooleanField(
        "Idee",
        default=False,
        help_text="Steht auf der Ideenliste statt auf der Tafel — noch nicht entschieden.",
    )

    class Meta(Basismodell.Meta):
        verbose_name = "Aufgabe"
        verbose_name_plural = "Aufgaben"
        # Das Neueste oben. **Nicht nach Priorität**: In der Datenbank wären
        # „gering", „hoch", „mittel" alphabetisch sortiert, und das ist genau
        # die falsche Reihenfolge. Sortiert wird in `basis/aufgaben.ts`, wo
        # der Rang der Stufen steht und geprüft ist.
        ordering = ["-erstellt_am", "-id"]

    def __str__(self):
        return self.text


# --- Module -----------------------------------------------------------------
#
# Zusätzliche Werkzeuge, die mit Projekt und Zeit nichts zu tun haben und
# deshalb unter „Intern · Module" stehen statt in einer eigenen Rubrik. Sie
# werden selten gebraucht — die Leiste klappt sie nur auf, wenn man drin ist.
#
# Das erste Modul ist die **SPG Academy**: Die Workshops dort werden hier
# ausgearbeitet, jeder Workshop an einem Vorhaben. Heute gibt es genau einen,
# das Lean Model Canvas.


class Canvasfeld(models.TextChoices):
    """
    Die neun Felder des Lean Model Canvas — **in der Reihenfolge der SPG
    Academy**, und so werden sie auch durchnummeriert.

    Die Namen bleiben englisch, wie im Workshop-Material. Übersetzt hieße
    „Unfair Advantage" hier etwas anderes als auf der Folie, und dann redet man
    im Workshop über zwei Felder, die dasselbe sind.

    Die Reihenfolge dieser Liste ist die Nummerierung. Wer sie ändert, ändert
    die Nummern auf der Leinwand und im PDF mit.
    """

    PROBLEM = "problem", "The Problem"
    KUNDEN = "kunden", "Customer Segments"
    NUTZEN = "nutzen", "Unique Value Propositions"
    LOESUNG = "loesung", "The Solution"
    VORTEIL = "vorteil", "Unfair Advantage"
    KANAELE = "kanaele", "Channels"
    EINNAHMEN = "einnahmen", "Revenue Streams"
    KENNZAHLEN = "kennzahlen", "Key Metrics"
    KOSTEN = "kosten", "Cost Structure"


# Die Fragen aus dem Workshop, je Feld. Sie stehen im leeren Feld und über den
# Punkten, solange man daran schreibt. **Hier und nicht in der Oberfläche,**
# weil die Leinwand sie sonst an einer zweiten Stelle neben den Feldnamen
# führte — die Oberfläche holt beides über `/api/vorhaben/felder/`.
#
# „Key Metrics" hat im Workshop keine eigene Frage; die eine hier ist ergänzt,
# damit das Feld nicht als einziges stumm dasteht.
LEITFRAGEN = {
    Canvasfeld.PROBLEM: [
        "What is the customer’s problem you want to solve?",
        "Who are your competitors and what solutions do they offer?",
    ],
    Canvasfeld.KUNDEN: [
        "Who are your target customers?",
        "How big is your target market and what’s its growth rate?",
        "How big is the market potential?",
    ],
    Canvasfeld.NUTZEN: [
        "What are the benefits and the value for the customer?",
    ],
    Canvasfeld.LOESUNG: [
        "What solution to this problem do you offer?",
    ],
    Canvasfeld.VORTEIL: [
        "What is your USP compared to your competitors?",
        "Which resources, partners and know-how will you need to develop your solution?",
        "What expertise do you need in your team to deliver your project?",
    ],
    Canvasfeld.KANAELE: [
        "How do you want to reach your customers and which customer channels will you need?",
        "How will you go to market?",
    ],
    Canvasfeld.EINNAHMEN: [
        "What will be your revenue streams?",
    ],
    Canvasfeld.KENNZAHLEN: [
        "How will you measure that it works?",
    ],
    Canvasfeld.KOSTEN: [
        "What will be your costs?",
        "How do you finance the development of your product or service?",
    ],
}


# Was im Feld verlangt ist — aus den Vorbereitungsvideos der SPG Academy
# mitgeschrieben. Die Leitfragen sagen, *worüber* man nachdenkt; die Aufgabe
# sagt, *wie* das Ergebnis aussehen soll („höchstens drei Probleme"). Ein Feld
# ohne Eintrag hier hat in den Videos keine eigene Vorgabe.
AUFGABEN = {
    Canvasfeld.PROBLEM: [
        "Focus on no more than three problems of your key customers.",
    ],
    Canvasfeld.KUNDEN: [
        "Don’t build a product for everyone — define a clear, small group of target customers.",
        "Distinguish between the user and the customer.",
        "Create a persona: a fictional person with specific needs. Check every design against "
        "it — would it work for the persona?",
    ],
    Canvasfeld.NUTZEN: [
        "One short, clear, concise statement describing the value your solution creates.",
        "A strong value proposition answers only one question: why should a customer choose "
        "your solution over what is already available?",
        "Keep it short, clear and customer-focused.",
    ],
    Canvasfeld.LOESUNG: [
        "Describe how your product solves the problem — focus on its key elements.",
        "Identify the MVP: what you need to build the first prototype.",
        "Plan how you get customer feedback on it.",
    ],
    Canvasfeld.VORTEIL: [
        "Something your competitors cannot copy: what protects your business from them?",
        "Examples: IP and patents, strategic partnerships, data sources.",
        "Consider what makes your startup unique — team expertise, connections and partnerships.",
    ],
    Canvasfeld.KANAELE: [
        "Consider online and offline, direct and indirect channels (e.g. retailers).",
        "Where do your customers already spend time — and would come across your product "
        "along the way?",
        "Design the complete customer journey.",
        "Start early enough.",
    ],
}


class Planabschnitt(models.TextChoices):
    """
    Die Abschnitte des Business Plan Lite — der zweite Workshop der SPG
    Academy, in der Reihenfolge der Lektionen und so durchnummeriert.

    „Tips & Tricks" ist kein Kapitel eines Businessplans, sondern die letzte
    Lektion. Es steht trotzdem hier: Was dort gesagt wird, soll man beim
    Schreiben neben sich haben, und dafür braucht es einen Ort.
    """

    SUMMARY = "summary", "Executive Summary"
    PRODUKTE = "produkte", "Products & Services"
    MARKT = "markt", "Market Research & Analysis"
    VERTRIEB = "vertrieb", "Marketing & Sales"
    FIRMA = "firma", "Company Structure & Management"
    SDG = "sdg", "Sustainable Development Goals"
    FINANZEN = "finanzen", "Financial Planning"
    TIPPS = "tipps", "Tips & Tricks"


class Abschnittstand(models.TextChoices):
    """
    Wo ein Abschnitt des Business Plan Lite steht. Geschrieben wird der Plan
    **nicht** in SoCoS, sondern im Dokument, das abgegeben wird — hier steht
    nur, was hineingehört und wie weit es ist.

    Drei Stufen wie bei der Priorität einer Aufgabe, und aus demselben Grund:
    Sie werden mit einem Klick weitergedreht.
    """

    OFFEN = "offen", "offen"
    ENTWURF = "entwurf", "Entwurf"
    FERTIG = "fertig", "fertig"


# Die Workshops der SPG Academy und ihre Felder. Der Schlüssel steht im Weg der
# Schnittstelle (`/api/vorhaben/felder/?workshop=…`).
WORKSHOPS = {"canvas": Canvasfeld, "businessplan": Planabschnitt}

# Was in jeden Abschnitt des Business Plan Lite gehört — kurz gefasst aus der
# Vorlage der SPG („Structure example & guidelines", sieben Seiten). Bewusst
# nur Stichworte: Die Vorlage liegt beim Schreiben ohnehin daneben, und hier
# soll man mit einem Blick sehen, was ein Abschnitt abdecken muss.
LEITFRAGEN.update({
    Planabschnitt.SUMMARY: [
        "Key points of all chapters — clear, concise, strong language",
        "Goal: convince investors and funding bodies to provide capital",
        "Write it last",
    ],
    Planabschnitt.PRODUKTE: [
        "Products and services, modules if any",
        "USP vs. competition — and competitive disadvantages",
        "IP strategy: patents, copyrights, trademarks",
        "Status (idea – POC – prototype – MVP – market-ready), TRL 0–9",
        "Timeline to market, pricing",
        "Focus on the customer need and the benefits",
    ],
    Planabschnitt.MARKT: [
        "Market size: TAM, SAM, SOM — growth (CAGR) and trends",
        "Target groups: B2C or B2B, segmented",
        "Competitors, direct and indirect: price, USP, size, location, market share",
        "Market entry barriers",
        "Positioning (positioning cross)",
    ],
    Planabschnitt.VERTRIEB: [
        "Price: model, margin, what competitors charge",
        "Place: where it is sold, share of sales per place",
        "Promotion: website, SEO, social media — and the budget",
        "Sales channels: direct or via partners",
        "Sales goals: start of sales, cash flow needed",
    ],
    Planabschnitt.FIRMA: [
        "Name, (planned) founding date, legal form, who holds which shares",
        "Headquarters, external partners with pros and cons",
        "Team: expertise, roles, responsibilities per business area",
        "Missing know-how and how to close the gap",
        "Mentors, advisors, investors",
    ],
    Planabschnitt.SDG: [
        "Which SDGs, how — with targets and indicators",
        "Any negative impact on an SDG?",
        "Contribution through own operations, where it matters most",
    ],
    Planabschnitt.FINANZEN: [
        "Costs and revenues for five years (SPG Startup Budget File)",
        "One-time start-up costs and investments, incl. legal and tax advice",
        "Ongoing costs: staff, marketing, infrastructure, development",
        "Capital requirement with a buffer",
        "Financing strategy and funding programmes",
    ],
    Planabschnitt.TIPPS: [
        "Readable for non-experts: clear structure, graphics, e.g. pitch-deck design",
        "Decisive language — no subjunctive",
        "Reader's shoes: is there a common thread?",
        "Market research: \"X market size pdf\", Statista (free in the TU Graz WLAN), Google Trends",
    ],
})

# Wie lang ein Abschnitt laut Vorlage sein soll. Steht neben dem Titel.
UMFANG = {
    Planabschnitt.SUMMARY: "1 page",
    Planabschnitt.PRODUKTE: "1–2 pages",
    Planabschnitt.MARKT: "2 pages",
    Planabschnitt.VERTRIEB: "1–2 pages",
    Planabschnitt.FIRMA: "1 page",
    Planabschnitt.SDG: "1 page",
    Planabschnitt.FINANZEN: "1–2 pages",
}


class Vorhaben(Basismodell):
    """
    Die Idee, an der ein Workshop der SPG Academy ausgearbeitet wird.

    **Es hängt an keinem Projekt.** Ein Vorhaben ist oft genau das, was noch
    keines ist: eine Idee, über die man im Workshop nachdenkt, bevor
    irgendwer Stunden darauf bucht. Ein Verweis auf ein Projekt zwänge dazu,
    zuerst eines anzulegen — und die Projektliste füllte sich mit Einträgen,
    auf die nie jemand bucht.

    Das Vorhaben ist mit Absicht vom Workshop getrennt: Kommt ein zweiter
    Workshop dazu (Pitch, Finanzplan), hängt er am selben Vorhaben, statt dass
    dieselbe Idee zweimal angelegt wird.

    **`planstand` ist ein JSON-Feld und kein eigenes Modell:** acht Wörter
    „offen/Entwurf/fertig" an einem Vorhaben. Ein Modell dafür hieße Sicherung,
    Löschweitergabe und Abgleich für acht Wörter; so wandern sie mit dem
    Vorhaben mit, und das Protokoll zeigt alt → neu wie bei jedem Feld.
    """

    titel = models.CharField("Titel", max_length=160)
    planstand = models.JSONField(
        "Stand des Business Plan Lite",
        default=dict,
        blank=True,
        help_text="Je Abschnitt offen, Entwurf oder fertig. Was fehlt, ist offen.",
    )

    class Meta(Basismodell.Meta):
        verbose_name = "Vorhaben"
        verbose_name_plural = "Vorhaben"
        ordering = ["titel", "id"]

    def __str__(self):
        return self.titel

    def delete(self, *args, **kwargs):
        """
        Die Punkte gehen mit — aus demselben Grund wie die Abschnitte eines
        Meetings: Weiches Löschen ist ein UPDATE, und `CASCADE` löst dabei nie
        aus. Erst das Vorhaben, dann die Punkte.
        """
        super().delete(*args, **kwargs)
        for punkt in self.canvaspunkte.filter(geloescht_am__isnull=True):
            punkt.delete()
        for persona in self.personas.filter(geloescht_am__isnull=True):
            persona.delete()


class Canvaspunkt(Basismodell):
    """
    Ein Stichpunkt in einem Feld eines Workshops — des Lean Model Canvas oder
    eines Abschnitts des Business Plan Lite.

    **Der Name stammt vom ersten Workshop** und ist geblieben: Beide Workshops
    sind dieselbe Sache — Felder mit Punkten an einem Vorhaben —, und ein
    zweites Modell daneben hieße ein zweites Mal Sicherung, Protokoll, Abgleich
    und Fenster. Welcher Workshop es ist, sagt das Feld.

    **Warum Punkte und nicht ein Text je Feld:** Auf der Leinwand stehen
    Stichpunkte, und nachgebessert wird einer davon — nicht das ganze Feld.
    Das Änderungsprotokoll sagt dann, welcher Punkt es war, statt den ganzen
    alten neben den ganzen neuen Text zu stellen.

    `CASCADE` statt `PROTECT` aus demselben Grund wie beim Protokollabschnitt:
    Ein Punkt hat außerhalb seines Vorhabens kein Leben.
    """

    vorhaben = models.ForeignKey(
        Vorhaben, verbose_name="Vorhaben", on_delete=models.CASCADE, related_name="canvaspunkte"
    )
    feld = models.CharField(
        "Feld", max_length=12, choices=Canvasfeld.choices + Planabschnitt.choices
    )
    text = models.TextField("Text")
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Canvas-Punkt"
        verbose_name_plural = "Canvas-Punkte"
        ordering = ["vorhaben", "feld", "reihenfolge", "id"]

    def __str__(self):
        return self.text[:60]


class Personarolle(models.TextChoices):
    """
    Die Aufgabe zu Customer Segments verlangt, Nutzer und Kunde zu
    unterscheiden — beim Arzneimittelspender ist das selten dieselbe Person:
    Die Patientin nimmt ein, der Pflegedienst oder die Kasse zahlt.
    """

    NUTZER = "nutzer", "Nutzer"
    KUNDE = "kunde", "Kunde"
    BEIDES = "beides", "Nutzer und Kunde"


class Persona(Basismodell):
    """
    Ein Steckbrief: eine erfundene Person mit bestimmten Bedürfnissen, gegen
    die man jeden Entwurf prüft („würde es für sie funktionieren?"). Gehört zu
    Customer Segments des Lean Model Canvas.

    **Erfunden, nicht erhoben.** Hier steht niemand, den es gibt — deshalb
    fällt das nicht unter die Regel, dass Personendaten aus `daten/` kommen.
    Wer eine echte Person einträgt, gehört in die Kontakte.

    Alter und Einkommen sind Zahlen und kein Freitext, damit sie sich im
    Steckbrief gleich lesen. Das Einkommen ist `Decimal` wie jedes Geld in
    SoCoS, gemeint ist netto im Monat.
    """

    vorhaben = models.ForeignKey(
        Vorhaben, verbose_name="Vorhaben", on_delete=models.CASCADE, related_name="personas"
    )
    name = models.CharField("Name", max_length=120)
    rolle = models.CharField(
        "Rolle", max_length=8, choices=Personarolle.choices, default=Personarolle.BEIDES
    )
    alter = models.PositiveSmallIntegerField("Alter", null=True, blank=True)
    geschlecht = models.CharField("Geschlecht", max_length=40, blank=True)
    wohnort = models.CharField("Wohnort", max_length=120, blank=True)
    beruf = models.CharField("Beruf", max_length=120, blank=True)
    haushalt = models.CharField("Familie und Haushalt", max_length=160, blank=True)
    einkommen = models.DecimalField(
        "Einkommen netto im Monat", max_digits=10, decimal_places=2, null=True, blank=True
    )
    beduerfnisse = models.TextField("Bedürfnisse und Ziele", blank=True)
    probleme = models.TextField("Probleme und Frust", blank=True)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Persona"
        verbose_name_plural = "Personas"
        ordering = ["vorhaben", "reihenfolge", "id"]

    def __str__(self):
        return self.name
