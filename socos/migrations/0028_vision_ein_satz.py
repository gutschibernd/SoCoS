"""
Das Vision Statement ist nur noch ein Satz: „Our Vision is …". Die Lücken
„hereby we want to help …" und „by building …" (`wem`, `womit`) fallen weg.

Was darin eingetragen war, wird **weich** gelöscht und nicht stehen gelassen:
Ein aktiver Punkt in einem Feld, das es nicht mehr gibt, zählte weiter bei
„zuletzt" mit und wäre in keiner Ansicht mehr zu sehen oder zu ändern.
Weich, damit er im Bestand bleibt und wiederherstellbar ist.
"""

from django.db import migrations, models
from django.utils import timezone


def luecken_entfernen(apps, schema_editor):
    Canvaspunkt = apps.get_model("socos", "Canvaspunkt")
    jetzt = timezone.now()
    Canvaspunkt.objects.filter(feld__in=["wem", "womit"], geloescht_am__isnull=True).update(
        geloescht_am=jetzt, geaendert_am=jetzt
    )


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0027_vision_statement'),
    ]

    operations = [
        migrations.AlterField(
            model_name='canvaspunkt',
            name='feld',
            field=models.CharField(choices=[('problem', 'The Problem'), ('kunden', 'Customer Segments'), ('nutzen', 'Unique Value Propositions'), ('loesung', 'The Solution'), ('vorteil', 'Unfair Advantage'), ('kanaele', 'Channels'), ('einnahmen', 'Revenue Streams'), ('kennzahlen', 'Key Metrics'), ('kosten', 'Cost Structure'), ('summary', 'Executive Summary'), ('produkte', 'Products & Services'), ('markt', 'Market Research & Analysis'), ('vertrieb', 'Marketing & Sales'), ('firma', 'Company Structure & Management'), ('sdg', 'Sustainable Development Goals'), ('finanzen', 'Financial Planning'), ('tipps', 'Tips & Tricks'), ('vision', 'Our Vision is')], max_length=12, verbose_name='Feld'),
        ),
        migrations.RunPython(luecken_entfernen, migrations.RunPython.noop),
    ]
