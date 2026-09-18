"""
Die Stufenleiste am Arbeitspaket kommt weg.

Sie stand seit `0004` am Paket: eine Liste aus Name und Monaten, dazu ein
Stand, aus dem ein Fortschritt gerechnet wurde. Gemessen hat sie nichts — der
Stand war ein Klick, die Monate eine Vorlage, die für kein Paket gestimmt hat.
Der Fortschritt kommt jetzt aus gebuchter Zeit gegen das Pensum (`0018`).

Die Werte gehen verloren, und das ist in Ordnung: Kein Stand war je mehr als
eine Schätzung, und die Vorlagen stehen in der Versionsgeschichte.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("socos", "0018_pensum_phasenlaufzeit_beschreibung"),
    ]

    operations = [
        migrations.RemoveField(model_name="arbeitspaket", name="stufen"),
        migrations.RemoveField(model_name="arbeitspaket", name="stufenstand"),
    ]
