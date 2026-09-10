"""
Aus drei Kategorien wird eine Skala der Nähe.

`antrag` („Antrag läuft") war ein Vorgang und keine Stufe der Beziehung. Auf
der neuen Leiter entspricht ihm `angebahnt` — wer einen Antrag laufen hat, hat
eine Zusammenarbeit angebahnt. Umgekehrt fallen `kennengelernt` und
`austausch` beim Zurückwandern auf `erstkontakt`: Die alte Leiter kennt die
Zwischenstufen nicht, und sie zu `partner` zu machen wäre eine Behauptung.
"""

from django.db import migrations, models


def antrag_wird_angebahnt(apps, schema_editor):
    apps.get_model("socos", "Organisation").objects.filter(stufe="antrag").update(
        stufe="angebahnt"
    )


def angebahnt_wird_antrag(apps, schema_editor):
    Organisation = apps.get_model("socos", "Organisation")
    Organisation.objects.filter(stufe="angebahnt").update(stufe="antrag")
    Organisation.objects.filter(stufe__in=["kennengelernt", "austausch"]).update(
        stufe="erstkontakt"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0006_ball_nichts_offen'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organisation',
            name='stufe',
            field=models.CharField(choices=[('erstkontakt', 'Erstkontakt'), ('kennengelernt', 'Kennengelernt'), ('austausch', 'Im Austausch'), ('angebahnt', 'Angebahnt'), ('partner', 'Partner')], default='erstkontakt', max_length=14, verbose_name='Stufe'),
        ),
        migrations.RunPython(antrag_wird_angebahnt, angebahnt_wird_antrag),
    ]
