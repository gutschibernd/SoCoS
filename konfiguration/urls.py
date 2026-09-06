"""
Ein Dienst, ein Ursprung: `/api/` ist die Schnittstelle, `/` liefert die gebaute
React-Anwendung. Kein CORS, weil es nichts zu überqueren gibt.
"""

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, re_path

from socos.views import anwendung, healthz

urlpatterns = [
    # Fragt der Container-Healthcheck — ohne Sitzung, ohne Proxy, und vom
    # HTTPS-Redirect ausgenommen. Steht deshalb ganz oben.
    path("healthz/", healthz, name="healthz"),

    path(
        "anmelden/",
        auth_views.LoginView.as_view(
            template_name="anmelden.html", redirect_authenticated_user=True
        ),
        name="login",
    ),
    path("abmelden/", auth_views.LogoutView.as_view(), name="logout"),

    # Der Django-Admin bleibt der Notzugang.
    path("admin/", admin.site.urls),
    path("api/", include("socos.urls")),

    # Alles Übrige ist die React-Anwendung. Muss zuletzt stehen.
    re_path(r"^(?!api/|admin/|static/|medien/).*$", anwendung, name="anwendung"),
]
