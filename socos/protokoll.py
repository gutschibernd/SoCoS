"""
Das Änderungsprotokoll — wer, wann, was, alt → neu.

Angehängt über Signale, nicht über überschriebene `save()`-Methoden. **Warum:**
Ein `save()` je Modell zu überschreiben heißt, es beim nächsten Modell zu
vergessen. Hier wird beim Start einmal über alle betroffenen Modelle gelaufen;
ein neues Fachmodell ist damit automatisch erfasst, ohne dass jemand daran denken
muss.

Nicht protokolliert werden Felder, die nichts aussagen (`geaendert_am`) oder die
niemals in einem Protokoll stehen dürfen (`password`).
"""

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.signals import post_save, pre_save
import json

FELDER_OHNE_PROTOKOLL = {
    "geaendert_am",     # ändert sich bei jedem Speichern und sagt nichts aus
    "password",         # ein Passwort-Hash gehört in kein Protokoll
    "last_login",       # Rauschen
}


def _wert(instanz, feld):
    """Der Wert eines Feldes in einer Form, die als JSON haltbar ist."""
    if feld.is_relation:
        return getattr(instanz, feld.attname)  # die ID, nicht das Objekt
    return getattr(instanz, feld.attname)


def _lesbar(wert):
    try:
        json.dumps(wert, cls=DjangoJSONEncoder)
    except TypeError:
        return str(wert)
    return json.loads(json.dumps(wert, cls=DjangoJSONEncoder))


def _felder(modell):
    return [
        f for f in modell._meta.concrete_fields
        if f.name not in FELDER_OHNE_PROTOKOLL
    ]


def vor_speichern(sender, instance, raw=False, **kwargs):
    """Merkt sich den Stand aus der Datenbank, solange er noch da ist."""
    if raw:
        return
    if instance.pk is None:
        instance._protokoll_alt = None
        return
    alt = sender.objects.filter(pk=instance.pk).first()
    if alt is None:
        # Kommt vor, wenn ein Manager gefiltert ist (z. B. weich Gelöschtes).
        basis = getattr(sender, "alle_objekte", sender.objects)
        alt = basis.filter(pk=instance.pk).first()
    instance._protokoll_alt = (
        {f.attname: _wert(alt, f) for f in _felder(sender)} if alt else None
    )


def nach_speichern(sender, instance, created, raw=False, **kwargs):
    """
    `raw=True` heißt: Die Zeile kommt aus `loaddata`, also aus einer Sicherung.

    Ohne diese Ausnahme schriebe jedes Einspielen für jede Zeile einen frischen
    „angelegt"-Eintrag. Der wiederhergestellte Bestand wäre dann nicht mehr
    deckungsgleich mit dem Archiv — und ausgerechnet das Protokoll, das sagen
    soll, wer wann was getan hat, behauptete, ein Wiedereinspieler habe alles
    neu angelegt.
    """
    from socos.models import Protokolleintrag

    if raw:
        return

    alt = getattr(instance, "_protokoll_alt", None)
    instance._protokoll_alt = None

    if created or alt is None:
        Protokolleintrag.schreiben(instance, Protokolleintrag.Aktion.ANGELEGT)
        return

    aenderungen = {}
    for feld in _felder(sender):
        vorher, nachher = alt.get(feld.attname), _wert(instance, feld)
        if vorher != nachher:
            aenderungen[feld.name] = {"alt": _lesbar(vorher), "neu": _lesbar(nachher)}

    if not aenderungen:
        return

    # Ein weiches Löschen ist eine Änderung an genau einem Feld. Es soll aber
    # als das erscheinen, was es ist — sonst muss man beim Lesen des Protokolls
    # jedes Mal selbst übersetzen.
    if "geloescht_am" in aenderungen:
        if aenderungen["geloescht_am"]["neu"] is not None:
            aktion = Protokolleintrag.Aktion.GELOESCHT
        else:
            aktion = Protokolleintrag.Aktion.WIEDERHERGESTELLT
    else:
        aktion = Protokolleintrag.Aktion.GEAENDERT

    Protokolleintrag.schreiben(instance, aktion, aenderungen)


def anhaengen():
    """
    Hängt das Protokoll an alle Fachmodelle und an den Nutzer.

    Wird aus `SocosConfig.ready()` gerufen.
    """
    from django.apps import apps
    from socos.models import Basismodell, Nutzer, Protokolleintrag

    for modell in apps.get_models():
        if modell is Protokolleintrag:
            continue  # das Protokoll protokolliert sich nicht selbst
        if not (issubclass(modell, Basismodell) or modell is Nutzer):
            continue
        kennung = f"socos_protokoll_{modell._meta.label_lower}"
        pre_save.connect(vor_speichern, sender=modell, dispatch_uid=kennung)
        post_save.connect(nach_speichern, sender=modell, dispatch_uid=kennung)
