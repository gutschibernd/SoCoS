"""
Das eine Vorhaben der SPG Academy.

Es gibt genau eines — „Sopharmis Arzneimittelspender" —, und die Oberfläche
wählt keines aus, sie zeigt es. Angelegt wird es nur, wenn noch keines da ist:
Wurde es schon von Hand angelegt, bleibt es, wie es ist, samt seinen Punkten.
"""

from django.db import migrations


def anlegen(apps, schema_editor):
    Vorhaben = apps.get_model("socos", "Vorhaben")
    if not Vorhaben.objects.filter(geloescht_am__isnull=True).exists():
        Vorhaben.objects.create(titel="Sopharmis Arzneimittelspender")


class Migration(migrations.Migration):
    dependencies = [("socos", "0021_module_spg_academy")]

    # Rückwärts nichts: Das Vorhaben kann inzwischen Punkte tragen, und ein
    # Zurückrollen, das sie still mitnimmt, wäre schlimmer als eine Zeile, die
    # stehen bleibt.
    operations = [migrations.RunPython(anlegen, migrations.RunPython.noop)]
