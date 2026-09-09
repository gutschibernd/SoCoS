"""
Grundmodelle: Nutzer, weiches Löschen, Änderungsprotokoll.

Fachmodelle (Projekt, Bereich, Arbeitspaket, Zeitbuchung, Kontakte, Finanzen)
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
        nutzer = self.model(email=self.normalize_email(email), name=name, **felder)
        nutzer.set_unusable_password()
        nutzer.save(using=self._db)
        return nutzer

    def create_superuser(self, email, name="", password=None, **felder):
        felder.setdefault("is_staff", True)
        felder.setdefault("is_superuser", True)
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
# Projekt → Bereich → Arbeitspaket → Unteraufgabe. Vier Ebenen, mehr nicht.


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


class Bereichsart(models.TextChoices):
    DEV = "dev", "Entwicklung"
    FIN = "fin", "Finanzierung"
    ZIEL = "ziel", "Ziele"


# Die drei Vorlagen für die Stufenleiste. Beim Anlegen eines **Arbeitspakets**
# **kopiert**, nicht verwiesen.
#
# Warum am Paket und nicht am Bereich: Ein Bereich enthält Pakete
# verschiedenen Zuschnitts — ein Antrag, ein Prototyp und eine Doku laufen
# nicht über dieselben Stufen und schon gar nicht über dieselben Dauern. Eine
# Leiste für alle Pakete eines Bereichs zeigt für die meisten einen
# Fortschritt, der so nie gemessen wurde.
#
# Warum kopieren: „je Paket anpassbar" wäre auch über eine Vererbungskette mit
# Überschreibungen zu haben. Die müsste man aber bei jeder Anzeige auflösen,
# und man sähe einem Paket nicht an, welche Stufen für es gelten. Eine
# kopierte Liste ist ein Wert, kein Verweis — sie ist beim Lesen fertig.
#
# Die Schlüssel sind die Bereichsarten: Ein neues Paket bekommt die Vorlage
# der Art seines Bereichs als Startpunkt und kann danach auf eine der beiden
# anderen umgestellt werden.
STUFENVORLAGEN = {
    Bereichsart.DEV: [
        {"name": "Konzept", "monate": 1},
        {"name": "Umsetzung", "monate": 3},
        {"name": "Test", "monate": 2},
        {"name": "Abschluss", "monate": 1},
    ],
    Bereichsart.FIN: [
        {"name": "Vorbereitung", "monate": 1},
        {"name": "Einreichung", "monate": 1},
        {"name": "Entscheidung", "monate": 2},
        {"name": "Abrechnung", "monate": 1},
    ],
    Bereichsart.ZIEL: [
        {"name": "Definition", "monate": 1},
        {"name": "Abstimmung", "monate": 1},
        {"name": "Verankert", "monate": 1},
    ],
}


def stufenvorlage(schluessel):
    """Eine frische Kopie einer Vorlage. Nie die Liste aus STUFENVORLAGEN
    selbst herausgeben — wer sie ändert, änderte sie für alle."""
    return [dict(s) for s in STUFENVORLAGEN.get(schluessel, [])]


class Bereich(Basismodell):
    projekt = models.ForeignKey(
        Projekt, verbose_name="Projekt", on_delete=models.PROTECT, related_name="bereiche"
    )
    titel = models.CharField("Titel", max_length=160)
    art = models.CharField("Art", max_length=8, choices=Bereichsart.choices)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Bereich"
        verbose_name_plural = "Bereiche"
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


class Arbeitspaket(Basismodell):
    bereich = models.ForeignKey(
        Bereich, verbose_name="Bereich", on_delete=models.PROTECT, related_name="pakete"
    )
    titel = models.CharField("Titel", max_length=250)
    notiz = models.TextField("Notiz", blank=True)
    status = models.CharField(
        "Status", max_length=14, choices=Paketstatus.choices, default=Paketstatus.OFFEN
    )
    # Liste aus {"name": …, "monate": …}. Beim Anlegen aus der Vorlage der
    # Bereichsart kopiert und danach frei änderbar — Namen wie Dauern.
    stufen = models.JSONField("Stufen", default=list, blank=True)
    # Wie viele der eigenen Stufen erledigt sind: 0 … len(stufen).
    stufenstand = models.IntegerField("Stufenstand", default=0)
    reihenfolge = models.IntegerField("Reihenfolge", default=0)

    class Meta(Basismodell.Meta):
        verbose_name = "Arbeitspaket"
        verbose_name_plural = "Arbeitspakete"
        ordering = ["bereich", "reihenfolge", "titel"]

    def __str__(self):
        return self.titel

    def save(self, *args, **kwargs):
        # Nur beim ersten Speichern füllen. Eine später geleerte Leiste ist
        # eine Entscheidung („dieses Paket hat keine Stufen"), keine Lücke —
        # sie hier stillschweigend wieder zu befüllen, nähme sie zurück.
        if not self.pk and not self.stufen:
            self.stufen = stufenvorlage(self.bereich.art)
        super().save(*args, **kwargs)


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
    ERSTKONTAKT = "erstkontakt", "Erstkontakt"
    ANTRAG = "antrag", "Antrag läuft"
    PARTNER = "partner", "Partner"


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
    """Wer am Zug ist. `uns` heißt: wir schulden etwas."""

    UNS = "uns", "bei uns"
    IHNEN = "ihnen", "bei ihnen"


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
    funktion = models.CharField("Rolle", max_length=160, blank=True)
    ball = models.CharField("Am Zug", max_length=6, choices=Ball.choices, default=Ball.UNS)
    offener_punkt = models.CharField("Offener Punkt", max_length=250, blank=True)

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
