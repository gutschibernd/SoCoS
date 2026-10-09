"""
Die SPG Academy ist entfernt — Lean Model Canvas, Business Plan Lite und Vision
Statement wurden nicht genutzt.

Die Tabellen gehen mit, samt Inhalt. Das ist das eine harte Löschen, das es in
SoCoS gibt, und es ist eines aus Absicht: Ein Modul, das es nicht mehr gibt,
hat keine Oberfläche mehr, über die man ein weich Gelöschtes wiederholen
könnte. Was darin stand, liegt in jeder Sicherung von vor diesem Tag.

Die drei Abgaben, die Migration 0025 als Aufgaben auf die Tafel gelegt hat,
bleiben stehen: Sie sind seitdem gewöhnliche Aufgaben, vielleicht abgehakt oder
umgeschrieben, und wer sie nicht mehr braucht, entfernt sie dort.

Ältere Archive mit diesen Modellen lassen sich weiter einspielen; siehe
`ENTFERNTE_MODELLE` in socos/sicherung.py.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0046_foerderstunden_nutzer_oder_name'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='persona',
            name='vorhaben',
        ),
        migrations.DeleteModel(
            name='Canvaspunkt',
        ),
        migrations.DeleteModel(
            name='Persona',
        ),
        migrations.DeleteModel(
            name='Vorhaben',
        ),
    ]
