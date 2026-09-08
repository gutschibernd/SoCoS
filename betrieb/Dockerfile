# syntax=docker/dockerfile:1
#
# Ein Abbild, zwei Stufen: erst die Oberfläche bauen, dann die Anwendung.
# Node landet dadurch nicht im laufenden Abbild.

# --- Stufe 1: die Oberfläche bauen ------------------------------------------

FROM node:22-alpine AS oberflaeche
WORKDIR /bau

# Erst die Paketlisten, dann der Rest: Solange sich an ihnen nichts ändert,
# hebt Docker das `npm ci` aus dem Zwischenspeicher.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# --- Stufe 2: die Anwendung -------------------------------------------------

FROM python:3.12-slim AS anwendung

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /anwendung

# curl braucht der Healthcheck. Sonst nichts: reportlab ist reines Python,
# psycopg kommt als Binärrad — deshalb hier keine Compiler und keine
# libpq-Entwicklungspakete.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY manage.py ./
COPY konfiguration/ konfiguration/
COPY socos/ socos/
COPY vorlagen/ vorlagen/
COPY statisch/ statisch/
COPY betrieb/eintritt.sh betrieb/gesundheit.sh betrieb/
COPY --from=oberflaeche /bau/dist/ frontend/dist/

RUN chmod +x betrieb/eintritt.sh betrieb/gesundheit.sh

# Die Werte sind Attrappen und gelten nur für diese eine Zeile: settings.py
# liest sie beim Import, aber `collectstatic` verbindet sich mit nichts. Sie
# stehen bewusst nicht in einem ENV — sonst wären sie im laufenden Container
# gesetzt und gewönnen gegen die echte Umgebung.
#
# `collectstatic` gehört in den Bau, nicht in den Start: Die Ablage arbeitet mit
# einem Manifest, und ohne das findet die Oberfläche ihre eigenen Dateien nicht.
RUN DJANGO_SECRET_KEY=nur-fuer-den-bau \
    DJANGO_DEBUG=0 \
    POSTGRES_DB=bau POSTGRES_USER=bau POSTGRES_PASSWORD=bau \
    POSTGRES_HOST=bau POSTGRES_PORT=5432 \
    python manage.py collectstatic --noinput

# Die beiden Ordner werden zur Laufzeit zu Volumes. Sie müssen hier schon
# existieren und dem Nutzer gehören, der sie beschreibt: Docker legt ein
# fehlendes Ziel sonst als root an, und die Anwendung darf nicht hineinschreiben.
RUN useradd --system --create-home --uid 1000 socos \
 && mkdir -p medien sicherungen \
 && chown -R socos:socos /anwendung

USER socos

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["/anwendung/betrieb/gesundheit.sh"]

ENTRYPOINT ["/anwendung/betrieb/eintritt.sh"]
