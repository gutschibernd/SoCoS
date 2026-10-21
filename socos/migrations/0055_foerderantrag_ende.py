import calendar
from datetime import date, timedelta

from django.db import migrations, models


def _monate_dazu(tag, monate):
    # Abgeschrieben aus services/foerderung.monate_dazu und nicht von dort
    # geholt: Eine Migration muss rechnen wie am Tag, an dem sie lief, auch
    # wenn der Dienst sich später ändert.
    stelle = tag.year * 12 + tag.month - 1 + monate
    jahr, monat = divmod(stelle, 12)
    return date(jahr, monat + 1, min(tag.day, calendar.monthrange(jahr, monat + 1)[1]))


def zeitachse_als_ende(apps, schema_editor):
    """
    Die eingestellte Monatszahl wird zum Ende: so viele Projektmonate ab dem
    Beginn, bis zum Tag davor. Ohne Beginn bleibt das Ende leer — es gäbe
    keinen Tag, von dem aus zu zählen wäre.
    """
    Foerderantrag = apps.get_model("socos", "Foerderantrag")
    for antrag in Foerderantrag.objects.filter(zeitachse__isnull=False, beginn__isnull=False):
        antrag.ende = _monate_dazu(antrag.beginn, antrag.zeitachse) - timedelta(days=1)
        antrag.save(update_fields=["ende"])


class Migration(migrations.Migration):

    dependencies = [
        ("socos", "0054_nutzer_uebersicht"),
    ]

    operations = [
        migrations.AddField(
            model_name="foerderantrag",
            name="ende",
            field=models.DateField(blank=True, null=True, verbose_name="Geplantes Ende"),
        ),
        migrations.RunPython(zeitachse_als_ende, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="foerderantrag",
            name="zeitachse",
        ),
    ]
