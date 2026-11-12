"""
Den Text aller abgelegten Mails einmal neu auslesen.

Bis hierher hat `html_zu_text` die Zeilenumbrüche aus dem HTML-Quelltext
übernommen. Bei Outlook-Mails stand deshalb nach jeder Zeile eine Leerzeile,
und Sätze rissen mitten durch („Sehr geehrter" / „Herr Gutschi,"). Der Text
wird beim Hochladen einmal gerechnet und gespeichert — ohne diese Migration
blieben die alten Mails so, bis jemand sie neu hochlädt.

**Nur der Inhalt wird ersetzt, der Kopf bleibt.** Wer beim Hochladen „Ohne
Anhänge" gewählt hat, hat eine Datei ohne Anhänge abgelegt; die Zeile
„Anhänge (nicht mit abgelegt): …" im Kopf stammt aus dem Hochladen und ließe
sich aus der Datei nicht mehr gewinnen.
"""

from django.db import migrations

MODELLE = ("Eventanhang", "Meetinganhang", "Lieferantenanhang")


def neu_auslesen(apps, schema_editor):
    # Hier und nicht oben: Eine Migration, die beim Laden einen Dienst
    # importiert, bricht, sobald der Dienst einmal umzieht.
    from socos.services.mailtext import KeineMail, mailtext

    for name in MODELLE:
        Modell = apps.get_model("socos", name)
        for anhang in Modell._base_manager.filter(art="email").exclude(datei=""):
            try:
                with anhang.datei.open("rb") as f:
                    neu = mailtext(f.read())
            except (OSError, KeineMail):
                # Eine fehlende Datei hält das Deployment nicht auf; der alte
                # Text bleibt stehen.
                continue
            alt_kopf, _, _ = anhang.text.partition("\n\n")
            _, _, neu_inhalt = neu.partition("\n\n")
            text = f"{alt_kopf}\n\n{neu_inhalt}".strip()
            if text != anhang.text:
                Modell._base_manager.filter(pk=anhang.pk).update(text=text)


class Migration(migrations.Migration):
    dependencies = [("socos", "0061_bestellungen_staffel")]

    operations = [migrations.RunPython(neu_auslesen, migrations.RunPython.noop)]
