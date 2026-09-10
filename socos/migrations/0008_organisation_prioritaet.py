"""
Das Verwertungspotential einer Organisation.

Alle bestehenden Häuser bekommen `offen` — „noch nicht eingeschätzt". Ein
Rateversuch (etwa: Partner = hoch) stünde danach als Einschätzung da, die
niemand getroffen hat.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0007_organisationsstufe_als_skala'),
    ]

    operations = [
        migrations.AddField(
            model_name='organisation',
            name='prioritaet',
            field=models.CharField(choices=[('hoch', 'Hoch'), ('mittel', 'Mittel'), ('gering', 'Gering'), ('offen', 'Nicht eingeschätzt')], default='offen', max_length=6, verbose_name='Priorität'),
        ),
    ]
