"""
Was eine Projektphase und ein Arbeitspaket ab jetzt tragen.

**`notiz` wird umbenannt, nicht ersetzt.** `makemigrations` schlägt hier von
sich aus ein Entfernen mit anschließendem Anlegen vor — das ginge durch, und
dabei wären die zehn Notizen an den Förderanträgen („National · FJG ALS 24–26"
und die anderen) still weg. Ein `RenameField` behält, was drinsteht.
"""


import django.db.models.deletion
import django.db.models.manager
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0017_projektphase'),
    ]

    operations = [
        migrations.RenameField(
            model_name='arbeitspaket',
            old_name='notiz',
            new_name='beschreibung',
        ),
        migrations.AlterField(
            model_name='arbeitspaket',
            name='beschreibung',
            field=models.TextField(blank=True, verbose_name='Beschreibung'),
        ),
        migrations.AddField(
            model_name='projektphase',
            name='abgeschlossen',
            field=models.BooleanField(default=False, verbose_name='abgeschlossen'),
        ),
        migrations.AddField(
            model_name='projektphase',
            name='bis',
            field=models.DateField(blank=True, null=True, verbose_name='Ende'),
        ),
        migrations.AddField(
            model_name='projektphase',
            name='von',
            field=models.DateField(blank=True, null=True, verbose_name='Beginn'),
        ),
        migrations.CreateModel(
            name='Pensum',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('erstellt_am', models.DateTimeField(auto_now_add=True, verbose_name='erstellt am')),
                ('geaendert_am', models.DateTimeField(auto_now=True, verbose_name='geändert am')),
                ('geloescht_am', models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='gelöscht am')),
                ('stunden', models.DecimalField(decimal_places=2, max_digits=7, verbose_name='Stunden')),
                ('paket', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='pensen', to='socos.arbeitspaket', verbose_name='Arbeitspaket')),
                ('person', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='pensen', to=settings.AUTH_USER_MODEL, verbose_name='Person')),
            ],
            options={
                'verbose_name': 'Pensum',
                'verbose_name_plural': 'Pensen',
                'ordering': ['paket', 'person'],
                'abstract': False,
                'base_manager_name': 'alle_objekte',
                'constraints': [models.UniqueConstraint(condition=models.Q(('geloescht_am__isnull', True)), fields=('paket', 'person'), name='ein_pensum_je_paket_und_person')],
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('alle_objekte', django.db.models.manager.Manager()),
            ],
        ),
    ]
