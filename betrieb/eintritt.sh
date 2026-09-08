#!/bin/sh
#
# Was beim Start des Containers passiert.

set -eu

# Migrationen laufen beim Start, nicht im Bau: Im Bau gibt es keine Datenbank.
# Ein Fehlschlag lässt den Container sterben statt mit altem Schema
# weiterzulaufen — deploy.sh sieht das am Healthcheck und zeigt das Protokoll.
python manage.py migrate --noinput

# 0.0.0.0 ist hier nicht das offene Netz: Der Stack veröffentlicht keinen Port,
# erreichbar ist gunicorn nur über das Docker-Netz, an dem der Proxy hängt.
# Genau darauf beruht auch SECURE_PROXY_SSL_HEADER — wäre der Port
# veröffentlicht, könnte jeder X-Forwarded-Proto: https selbst mitschicken.
exec gunicorn konfiguration.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile - \
    --capture-output
