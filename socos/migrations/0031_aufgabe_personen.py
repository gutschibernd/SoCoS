"""
Eine Aufgabe kann mehreren gehören: aus `person` wird die Menge `personen`.

Die Menge kommt zuerst unter einem Übergangsnamen dazu, weil der alte
Verweis `related_name="aufgaben"` noch belegt. Dann wandert jede Zuordnung
hinüber, dann fällt das alte Feld, und erst danach bekommt die Menge den
Namen, den der Verweis hatte.
"""

from django.conf import settings
from django.db import migrations, models


def personen_uebernehmen(apps, schema_editor):
    Aufgabe = apps.get_model("socos", "Aufgabe")
    # `_base_manager` statt `objects`: Auch weich Gelöschtes behält seine
    # Person — wer es wiederherstellt, soll es dort finden, wo es stand.
    for aufgabe in Aufgabe._base_manager.exclude(person=None):
        aufgabe.personen_neu.add(aufgabe.person_id)


def personen_zurueck(apps, schema_editor):
    """Zurück geht nur die erste Person — ein Verweis fasst keine zweite."""
    Aufgabe = apps.get_model("socos", "Aufgabe")
    for aufgabe in Aufgabe._base_manager.all():
        erste = aufgabe.personen_neu.order_by("pk").first()
        if erste is not None:
            aufgabe.person = erste
            aufgabe.save(update_fields=["person"])


class Migration(migrations.Migration):
    dependencies = [
        ("socos", "0030_praktikumsthema_art"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="aufgabe",
            name="personen_neu",
            field=models.ManyToManyField(
                blank=True, related_name="+", to=settings.AUTH_USER_MODEL
            ),
        ),
        migrations.RunPython(personen_uebernehmen, personen_zurueck),
        migrations.RemoveField(model_name="aufgabe", name="person"),
        migrations.RenameField(model_name="aufgabe", old_name="personen_neu", new_name="personen"),
        migrations.AlterField(
            model_name="aufgabe",
            name="personen",
            field=models.ManyToManyField(
                blank=True,
                help_text="Leer heißt: allgemein, für niemanden bestimmten.",
                related_name="aufgaben",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Für",
            ),
        ),
    ]
