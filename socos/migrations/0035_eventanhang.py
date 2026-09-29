"""
Anhänge am Event — PDF, Bilder, E-Mails. Gebaut wie der Meetinganhang: die
Datei unter MEDIA_ROOT/events/, der Text einer Mail daneben in `text`.
"""

import django.db.models.deletion
import django.db.models.manager
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('socos', '0034_thoughts_namen'),
    ]

    operations = [
        migrations.CreateModel(
            name='Eventanhang',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('erstellt_am', models.DateTimeField(auto_now_add=True, verbose_name='erstellt am')),
                ('geaendert_am', models.DateTimeField(auto_now=True, verbose_name='geändert am')),
                ('geloescht_am', models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='gelöscht am')),
                ('datei', models.FileField(max_length=300, upload_to='events/%Y/%m/', verbose_name='Datei')),
                ('name', models.CharField(max_length=255, verbose_name='Name')),
                ('groesse', models.PositiveBigIntegerField(default=0, verbose_name='Größe in Byte')),
                ('art', models.CharField(choices=[('email', 'E-Mail'), ('datei', 'Datei')], default='datei', max_length=10, verbose_name='Art')),
                ('text', models.TextField(blank=True, verbose_name='Ausgelesener Text')),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='anhaenge', to='socos.event', verbose_name='Event')),
            ],
            options={
                'verbose_name': 'Eventanhang',
                'verbose_name_plural': 'Eventanhänge',
                'ordering': ['event', 'erstellt_am', 'id'],
                'abstract': False,
                'base_manager_name': 'alle_objekte',
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('alle_objekte', django.db.models.manager.Manager()),
            ],
        ),
    ]
