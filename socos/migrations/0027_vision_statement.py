"""
Vision Statement, der dritte Workshop der SPG Academy: drei weitere Werte für
`Canvaspunkt.feld`. Nur die Auswahl ändert sich, die Spalte nicht.

Dazu die Vision, wie sie am 2026-09-25 feststand. „Our vision is" steht nicht
im Text — das ist das feste Stück Satz davor (der Titel des Teils).
"""

from django.db import migrations, models

VISION = (
    "a world where medication at home is safe, effortless, and transparent — "
    "giving patients independence and families peace of mind"
)


def eintragen(apps, schema_editor):
    Vorhaben = apps.get_model("socos", "Vorhaben")
    Canvaspunkt = apps.get_model("socos", "Canvaspunkt")
    vorhaben = Vorhaben.objects.filter(geloescht_am__isnull=True).order_by("id").first()
    if vorhaben is None:
        return
    # Nur in eine leere Lücke — wer schon eine Vision eingetragen hat,
    # bekommt sie nicht überschrieben.
    if not Canvaspunkt.objects.filter(
        vorhaben=vorhaben, feld="vision", geloescht_am__isnull=True
    ).exists():
        Canvaspunkt.objects.create(vorhaben=vorhaben, feld="vision", text=VISION, reihenfolge=0)


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0026_meetinganhang'),
    ]

    operations = [
        migrations.AlterField(
            model_name='canvaspunkt',
            name='feld',
            field=models.CharField(choices=[('problem', 'The Problem'), ('kunden', 'Customer Segments'), ('nutzen', 'Unique Value Propositions'), ('loesung', 'The Solution'), ('vorteil', 'Unfair Advantage'), ('kanaele', 'Channels'), ('einnahmen', 'Revenue Streams'), ('kennzahlen', 'Key Metrics'), ('kosten', 'Cost Structure'), ('summary', 'Executive Summary'), ('produkte', 'Products & Services'), ('markt', 'Market Research & Analysis'), ('vertrieb', 'Marketing & Sales'), ('firma', 'Company Structure & Management'), ('sdg', 'Sustainable Development Goals'), ('finanzen', 'Financial Planning'), ('tipps', 'Tips & Tricks'), ('vision', 'Our Vision is'), ('wem', 'hereby we want to help'), ('womit', 'by building')], max_length=12, verbose_name='Feld'),
        ),
        # Rückwärts nichts: Die Vision kann inzwischen umgeschrieben sein, und
        # ein Zurückrollen, das sie still mitnimmt, wäre schlimmer als ein
        # Punkt, der stehen bleibt.
        migrations.RunPython(eintragen, migrations.RunPython.noop),
    ]
