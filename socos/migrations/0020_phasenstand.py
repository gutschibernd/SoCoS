"""
Aus dem Ja/Nein „abgeschlossen" wird der Stand einer Phase: offen · läuft ·
abgeschlossen.

Erst das neue Feld, dann umschreiben, dann das alte weg — nicht Entfernen und
Neuanlegen, sonst wäre jede abgeschlossene Phase danach wieder offen und
nähme Zeit an.

Was „läuft", stand nirgends: Eine Phase mit Paketen, die nicht abgeschlossen
ist, wird als laufend übernommen, eine leere als offen. Das ist eine Annahme —
aber die, die dem Bild auf der Projektseite entspricht; der Stand lässt sich
seitdem im Bearbeiten umstellen.
"""

from django.db import migrations, models


def stand_ableiten(apps, schema_editor):
    Projektphase = apps.get_model("socos", "Projektphase")
    for phase in Projektphase.objects.all():
        if phase.abgeschlossen:
            phase.stand = "abgeschlossen"
        elif phase.pakete.filter(geloescht_am__isnull=True).exists():
            phase.stand = "laeuft"
        else:
            phase.stand = "offen"
        phase.save(update_fields=["stand"])


def stand_zurueck(apps, schema_editor):
    Projektphase = apps.get_model("socos", "Projektphase")
    Projektphase.objects.filter(stand="abgeschlossen").update(abgeschlossen=True)


class Migration(migrations.Migration):

    dependencies = [
        ("socos", "0019_stufen_weg"),
    ]

    operations = [
        migrations.AddField(
            model_name="projektphase",
            name="stand",
            field=models.CharField(
                choices=[
                    ("offen", "offen"),
                    ("laeuft", "läuft"),
                    ("abgeschlossen", "abgeschlossen"),
                ],
                default="offen",
                max_length=14,
                verbose_name="Stand",
            ),
        ),
        migrations.RunPython(stand_ableiten, stand_zurueck),
        migrations.RemoveField(model_name="projektphase", name="abgeschlossen"),
    ]
