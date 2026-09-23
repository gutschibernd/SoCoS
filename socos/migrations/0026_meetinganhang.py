"""
Anhänge am Meeting — Dateien, allen voran die E-Mail, die zum Termin geführt
hat. Die Datei liegt unter MEDIA_ROOT/meetings/, der Text einer Mail steht
daneben in `text`.
"""

import django.db.models.deletion
import django.db.models.manager
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0025_businessplan_ueberblick'),
    ]

    operations = [
        migrations.CreateModel(
            name='Meetinganhang',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('erstellt_am', models.DateTimeField(auto_now_add=True, verbose_name='erstellt am')),
                ('geaendert_am', models.DateTimeField(auto_now=True, verbose_name='geändert am')),
                ('geloescht_am', models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='gelöscht am')),
                ('datei', models.FileField(max_length=300, upload_to='meetings/%Y/%m/', verbose_name='Datei')),
                ('name', models.CharField(max_length=255, verbose_name='Name')),
                ('groesse', models.PositiveBigIntegerField(default=0, verbose_name='Größe in Byte')),
                ('art', models.CharField(choices=[('email', 'E-Mail'), ('datei', 'Datei')], default='datei', max_length=10, verbose_name='Art')),
                ('text', models.TextField(blank=True, verbose_name='Ausgelesener Text')),
                ('meeting', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='anhaenge', to='socos.meeting', verbose_name='Meeting')),
            ],
            options={
                'verbose_name': 'Meetinganhang',
                'verbose_name_plural': 'Meetinganhänge',
                'ordering': ['meeting', 'erstellt_am', 'id'],
                'abstract': False,
                'base_manager_name': 'alle_objekte',
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('alle_objekte', django.db.models.manager.Manager()),
            ],
        ),
    ]
