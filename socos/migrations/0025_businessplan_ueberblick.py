"""
Business Plan Lite als Überblick: eine Frist an der Aufgabe, der Stand je
Abschnitt am Vorhaben — und die drei Abgaben als Aufgaben auf der Tafel.

Die Termine stehen hier als Zahlen und nicht aus `basis/module.ts` geholt: Eine
Migration hält fest, was an dem Tag galt. Verschiebt die SPG Academy eine
Abgabe, wird die Aufgabe auf der Tafel geändert, nicht diese Datei.
"""

import datetime

from django.db import migrations, models

ABGABEN = [
    ("Business Plan Lite: Version 1 abgeben", datetime.date(2026, 10, 12)),
    ("Business Plan Lite: Version 2 abgeben", datetime.date(2026, 10, 27)),
    ("Business Plan Lite: finale Fassung abgeben", datetime.date(2026, 11, 19)),
]


def anlegen(apps, schema_editor):
    Aufgabe = apps.get_model("socos", "Aufgabe")
    for text, frist in ABGABEN:
        # Nur, wenn es sie noch nicht gibt — wer sie schon von Hand
        # aufgeschrieben hat, bekommt sie nicht ein zweites Mal.
        if not Aufgabe.objects.filter(text=text, geloescht_am__isnull=True).exists():
            Aufgabe.objects.create(text=text, frist=frist, prioritaet="hoch")


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0024_personas'),
    ]

    operations = [
        migrations.AddField(
            model_name='aufgabe',
            name='frist',
            field=models.DateField(blank=True, null=True, verbose_name='Frist'),
        ),
        migrations.AddField(
            model_name='vorhaben',
            name='planstand',
            field=models.JSONField(blank=True, default=dict, help_text='Je Abschnitt offen, Entwurf oder fertig. Was fehlt, ist offen.', verbose_name='Stand des Business Plan Lite'),
        ),
        # Rückwärts nichts: Die Aufgaben können inzwischen abgehakt sein, und
        # ein Zurückrollen, das sie still mitnimmt, wäre schlimmer als drei
        # Zeilen, die stehen bleiben.
        migrations.RunPython(anlegen, migrations.RunPython.noop),
    ]
