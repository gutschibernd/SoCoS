from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("socos", "0045_foerderauslastung_grundlagen"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="foerderstunden",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("nutzer__isnull", False), ("person", "")),
                    models.Q(("nutzer__isnull", True), models.Q(("person", ""), _negated=True)),
                    _connector="OR",
                ),
                name="foerderstunden_nutzer_oder_name",
            ),
        ),
    ]
