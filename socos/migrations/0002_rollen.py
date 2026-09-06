"""
Die drei Rollen als Django-Gruppen.

Eine Datenmigration und keine Fixture: Ohne diese Gruppen darf niemand irgendetwas,
die Anwendung wäre also nicht lauffähig. Das ist Struktur, keine Nutzdaten — und
es stehen keine Personendaten drin.
"""

from django.db import migrations

ROLLEN = ["admin", "bearbeiter", "leser"]


def anlegen(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ROLLEN:
        Group.objects.get_or_create(name=name)


def entfernen(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=ROLLEN).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("socos", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [migrations.RunPython(anlegen, entfernen)]
