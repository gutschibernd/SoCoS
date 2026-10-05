import django.db.models.deletion
import django.db.models.manager
from django.db import migrations, models


def land_noe_eintragen(apps, schema_editor):
    """
    Bis hierher hing ein Programm an keinem Fördergeber. Das einzige, das es
    gab, ist das NÖ Pflegeinnovationsprogramm — es kommt unter das Land
    Niederösterreich. Ein öffentlicher Fördergeber ist kein Kundendatum und
    darf deshalb hier stehen.
    """
    Foerdergeber = apps.get_model("socos", "Foerdergeber")
    Foerderprogramm = apps.get_model("socos", "Foerderprogramm")
    ohne = Foerderprogramm.objects.filter(geber__isnull=True)
    if not ohne.exists():
        return
    land, _ = Foerdergeber.objects.get_or_create(
        name="Land Niederösterreich",
        defaults={"kurz": "NÖ", "link": "https://www.noe.gv.at/noe/Foerderungen/Foerderungen.html"},
    )
    ohne.update(geber=land)


class Migration(migrations.Migration):

    dependencies = [
        ("socos", "0039_foerderfrage_beantwortet"),
    ]

    operations = [
        migrations.CreateModel(
            name="Foerdergeber",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("erstellt_am", models.DateTimeField(auto_now_add=True, verbose_name="erstellt am")),
                ("geaendert_am", models.DateTimeField(auto_now=True, verbose_name="geändert am")),
                ("geloescht_am", models.DateTimeField(blank=True, db_index=True, null=True, verbose_name="gelöscht am")),
                ("name", models.CharField(max_length=160, verbose_name="Name")),
                ("kurz", models.CharField(blank=True, max_length=12, verbose_name="Kürzel")),
                ("link", models.URLField(blank=True, verbose_name="Link")),
                ("beschreibung", models.TextField(blank=True, verbose_name="Beschreibung")),
            ],
            options={
                "verbose_name": "Fördergeber",
                "verbose_name_plural": "Fördergeber",
                "ordering": ["name", "id"],
                "abstract": False,
                "base_manager_name": "alle_objekte",
            },
            managers=[
                ("objects", django.db.models.manager.Manager()),
                ("alle_objekte", django.db.models.manager.Manager()),
            ],
        ),
        migrations.AddField(
            model_name="foerderprogramm",
            name="geber",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="programme",
                to="socos.foerdergeber",
                verbose_name="Fördergeber",
            ),
        ),
        migrations.RunPython(land_noe_eintragen, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="foerderprogramm",
            name="geber",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="programme",
                to="socos.foerdergeber",
                verbose_name="Fördergeber",
            ),
        ),
    ]
