"""
Praktikanten: Stränge am Pensum, die sonstigen Ideen werden To-Dos.

Bernd, 2026-11-19: „Die sonstigen Ideen kann man löschen, das fällt jetzt
unter To-Do-Ideen." Gelöscht wird trotzdem nichts — jede Idee zieht als
To-Do um, mit Titel und dem, was an ihr stand, und das Thema wird weich
gelöscht. Eine Idee, die nur verschwindet, fiele erst auf, wenn jemand sie
sucht.

**Der Umfang heißt danach „Größer".** Ein To-Do braucht eine Stufe, und eine
Idee hatte keine. „Größer" ist die Stufe, unter der man nachsieht, wenn man
nicht weiß, wie groß etwas ist — eine erfundene kleinere stünde zwischen den
Vormittagen und sähe nach einer Schätzung aus.
"""

from django.db import migrations, models
from django.utils import timezone


def ideen_umziehen(apps, schema_editor):
    Thema = apps.get_model("socos", "Praktikumsthema")
    Nebenaufgabe = apps.get_model("socos", "Nebenaufgabe")
    jetzt = timezone.now()
    for idee in Thema._base_manager.filter(art="idee", geloescht_am__isnull=True):
        teile = [idee.kurzbeschreibung.strip(), idee.punkte.strip()]
        Nebenaufgabe._base_manager.create(
            titel=idee.titel,
            beschreibung="\n\n".join(t for t in teile if t),
            umfang="gross",
            # Eine archivierte Idee war nicht mehr dran — als To-Do heißt das: erledigt.
            erledigt_am=idee.archiviert_am,
        )
        idee.geloescht_am = jetzt
        idee.save(update_fields=["geloescht_am"])


class Migration(migrations.Migration):

    dependencies = [
        ("socos", "0062_mailtexte_neu"),
    ]

    operations = [
        migrations.RunPython(ideen_umziehen, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="praktikumsthema",
            name="art",
        ),
        migrations.AddField(
            model_name="pensum",
            name="strang",
            field=models.CharField(
                blank=True,
                choices=[("", "kein Strang"), ("haupt", "Hauptstrang"), ("neben", "Nebenstrang")],
                default="",
                max_length=5,
                verbose_name="Strang",
            ),
        ),
    ]
