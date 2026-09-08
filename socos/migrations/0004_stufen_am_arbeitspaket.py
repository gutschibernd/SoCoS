"""
Die Stufenleiste wandert vom Bereich ans Arbeitspaket.

Ein Bereich enthält Pakete verschiedenen Zuschnitts. Eine Leiste für alle
zeigt für die meisten einen Fortschritt, der so nie gemessen wurde.

Drei Schritte in einer Migration, weil sie nur zusammen einen gültigen Zustand
ergeben: Feld anlegen, Werte herüberholen, altes Feld entfernen. Zwischen
Schritt eins und zwei stünde sonst eine Datenbank, in der jedes Paket eine
leere Leiste hat.
"""

from django.db import migrations, models


def stufen_ans_paket(apps, schema_editor):
    """Jedes Paket bekommt eine **eigene Kopie** der Leiste seines Bereichs."""
    Arbeitspaket = apps.get_model("socos", "Arbeitspaket")
    zu_speichern = []
    for paket in Arbeitspaket.objects.select_related("bereich"):
        paket.stufen = [dict(s) for s in (paket.bereich.stufen or [])]
        zu_speichern.append(paket)
    Arbeitspaket.objects.bulk_update(zu_speichern, ["stufen"], batch_size=500)


def stufen_zurueck_an_den_bereich(apps, schema_editor):
    """
    Der Rückweg ist **verlustbehaftet** und kann es nicht anders sein: Aus n
    Leisten je Bereich wird wieder eine. Genommen wird die des ersten Pakets;
    die Abweichungen der übrigen sind dann weg.
    """
    Bereich = apps.get_model("socos", "Bereich")
    for bereich in Bereich.objects.all():
        erstes = bereich.pakete.order_by("reihenfolge", "titel").first()
        bereich.stufen = [dict(s) for s in (erstes.stufen or [])] if erstes else []
        bereich.save(update_fields=["stufen"])


class Migration(migrations.Migration):
    dependencies = [("socos", "0003_bereich_fixkosten_kontostand_monatskosten_and_more")]

    operations = [
        migrations.AddField(
            model_name="arbeitspaket",
            name="stufen",
            field=models.JSONField(blank=True, default=list, verbose_name="Stufen"),
        ),
        migrations.RunPython(stufen_ans_paket, stufen_zurueck_an_den_bereich),
        migrations.RemoveField(model_name="bereich", name="stufen"),
    ]
