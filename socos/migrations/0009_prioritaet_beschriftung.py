"""
Nur die Beschriftung: „Nicht eingeschätzt" wird „Noch offen".

In der Zeile der Übersicht stehen die vier Werte in einem Auswahlfeld, und das
längste Wort bestimmt die Spaltenbreite — „Nicht eingeschätzt" wurde
abgeschnitten. An der Datenbank ändert sich nichts; `choices` steht nur im
Modell. Trotzdem eine eigene Migration statt einer Änderung an 0008: Gelaufene
Migrationen werden nicht bearbeitet.
"""

# Erzeugt von Django 5.2.7 am 2026-09-10 08:38

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0008_organisation_prioritaet'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organisation',
            name='prioritaet',
            field=models.CharField(choices=[('hoch', 'Hoch'), ('mittel', 'Mittel'), ('gering', 'Gering'), ('offen', 'Noch offen')], default='offen', max_length=6, verbose_name='Priorität'),
        ),
    ]
