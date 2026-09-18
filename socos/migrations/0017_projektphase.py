"""
Aus dem „Bereich" wird die „Projektphase".

Eine reine Umbenennung — Tabelle, Fremdschlüssel, Bezeichner. Die Ebene lag
schon immer zwischen Projekt und Arbeitspaket; sie heißt jetzt nach dem, was
sie in der Sache ist: ein Abschnitt mit Anfang, Ende und Pensum, auf den der
nächste folgt.

`RenameModel` und `RenameField` und nicht neu anlegen und kopieren: Die Daten
bleiben liegen, wo sie sind, und die Zeitbuchungen behalten ihren Weg zum
Paket. Ein Neuanlegen hätte jede Verknüpfung neu knüpfen müssen — und die
erste, die dabei durchrutscht, fiele erst beim nächsten Zeitnachweis auf.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("socos", "0016_aufgabe_ist_idee")]

    operations = [
        migrations.RenameModel(old_name="Bereich", new_name="Projektphase"),
        migrations.RenameField(model_name="arbeitspaket", old_name="bereich", new_name="phase"),
        migrations.AlterModelOptions(
            name="projektphase",
            options={
                "base_manager_name": "alle_objekte",
                "ordering": ["projekt", "reihenfolge", "titel"],
                "verbose_name": "Projektphase",
                "verbose_name_plural": "Projektphasen",
            },
        ),
        migrations.AlterModelOptions(
            name="arbeitspaket",
            options={
                "base_manager_name": "alle_objekte",
                "ordering": ["phase", "reihenfolge", "titel"],
                "verbose_name": "Arbeitspaket",
                "verbose_name_plural": "Arbeitspakete",
            },
        ),
        migrations.AlterField(
            model_name="arbeitspaket",
            name="phase",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="pakete",
                to="socos.projektphase",
                verbose_name="Projektphase",
            ),
        ),
        migrations.AlterField(
            model_name="projektphase",
            name="projekt",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="phasen",
                to="socos.projekt",
                verbose_name="Projekt",
            ),
        ),
    ]
