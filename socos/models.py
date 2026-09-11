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
