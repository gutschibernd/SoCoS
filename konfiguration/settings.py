"""
Django-Einstellungen für SoCoS.

Die Namen der Einstellungen gibt Django vor und bleiben englisch. Alles andere in
dieser Datei — Kommentare, eigene Konstanten — ist deutsch.
"""

from pathlib import Path

import environ

WURZEL = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, []),
    DJANGO_CSRF_TRUSTED_ORIGINS=(list, []),
)
environ.Env.read_env(WURZEL / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = env("DJANGO_CSRF_TRUSTED_ORIGINS")


# --- Anwendungen ------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "axes",
    "socos",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Hinterlegt den angemeldeten Nutzer für das Änderungsprotokoll. Muss
    # nach der AuthenticationMiddleware stehen, sonst gibt es noch keinen.
    "socos.aktueller_nutzer.HandelnderMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Muss ganz unten stehen: axes braucht den angemeldeten Nutzer aus der
    # AuthenticationMiddleware und will als Letztes über die Antwort schauen.
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "konfiguration.urls"
WSGI_APPLICATION = "konfiguration.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [WURZEL / "vorlagen"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# --- Datenbank --------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --- Anmeldung --------------------------------------------------------------

AUTH_USER_MODEL = "socos.Nutzer"

AUTHENTICATION_BACKENDS = [
    # axes zuerst: der Backend gibt eine gesperrte Anmeldung ab, bevor der
    # ModelBackend das Passwort überhaupt prüft.
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

LOGIN_URL = "/anmelden/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/anmelden/"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# --- axes: Sperre gegen Rateversuche ---------------------------------------
#
# Gesperrt wird die Kombination aus Nutzername und IP, nicht eines von beidem
# allein: eine reine Nutzersperre lässt sich von außen missbrauchen, um jemanden
# gezielt auszusperren, eine reine IP-Sperre trifft hinter einem Anschluss alle.

AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 1  # Stunden
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True

# Die echte Client-Adresse steht hinter dem Proxy im X-Forwarded-For.
AXES_IPWARE_META_PRECEDENCE_ORDER = ("HTTP_X_FORWARDED_FOR", "REMOTE_ADDR")

# Die Zahl ist 0, weil hier die Adressen *im Header* gezählt werden, nicht die
# Proxys davor. Caddy schreibt genau eine Adresse hinein — die des Anrufers.
AXES_IPWARE_PROXY_COUNT = 0

# Siehe SERVER.md: Im Caddyfile steht bewusst kein `header_up X-Forwarded-For`.
# Caddy steht direkt am Internet, verwirft einen mitgeschickten Header und setzt
# nur die echte Adresse. Diese drei Punkte hält socos/tests/test_axes.py fest.


# --- REST Framework ---------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Übersetzt ProtectedError zu 409 und hängt der 403 ein `code` an, das
    # not_authenticated von permission_denied unterscheidet. Siehe socos/fehler.py.
    "EXCEPTION_HANDLER": "socos.fehler.fehler_behandeln",
    # Geld und Zeit sind Decimal und gehen als Zeichenkette hinaus. JSON kennt
    # nur Gleitkomma, und dort ist 0.1 + 0.2 nicht 0.3.
    "COERCE_DECIMAL_TO_STRING": True,
}


# --- Sprache und Zeit -------------------------------------------------------

LANGUAGE_CODE = "de-at"
TIME_ZONE = "Europe/Vienna"
USE_I18N = True
USE_TZ = True


# --- Statische Dateien und Medien ------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = WURZEL / "statisch_gesammelt"
# Ohne das Verzeichnis warnt WhiteNoise bei jeder Anfrage. Eine Warnung, die
# immer dasteht, erzieht dazu, Warnungen nicht mehr zu lesen.
STATIC_ROOT.mkdir(exist_ok=True)
STATICFILES_DIRS = [d for d in [WURZEL / "frontend" / "dist"] if d.exists()]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

MEDIA_URL = "/medien/"
MEDIA_ROOT = WURZEL / "medien"


# --- Sicherheit in Produktion ----------------------------------------------
#
# Nur wenn DEBUG aus ist. Lokal läuft nichts über HTTPS, und ein SSL-Redirect
# im Entwicklungsserver macht die Anwendung schlicht unerreichbar.

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True

# Das CSRF-Cookie muss für JavaScript lesbar sein: das Frontend schickt seinen
# Wert als X-CSRFToken zurück. Es ist kein Geheimnis — es beweist nur, dass die
# Anfrage aus der eigenen Seite kommt.
CSRF_COOKIE_HTTPONLY = False

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31_536_000  # ein Jahr
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    # Der Healthcheck fragt von innen und bekäme sonst eine 301 — der Dienst
    # gälte damit dauerhaft als krank. Der Wert ist ein Regex ohne führenden /.
    SECURE_REDIRECT_EXEMPT = [r"^healthz/$"]
