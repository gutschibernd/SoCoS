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
        """
        return self.update(geloescht_am=timezone.now())

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

    def delete(self, *args, **kwargs):
        """Weiches Löschen. Ein hartes gibt es in dieser Anwendung nicht."""
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
