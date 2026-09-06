"""
Ein Dienst, ein Ursprung: `/api/` ist die Schnittstelle, `/` liefert die gebaute
React-Anwendung. Kein CORS, weil es nichts zu überqueren gibt.
"""

from django.contrib import admin
from django.urls import include, path

from socos.views import healthz

urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    # Der Django-Admin bleibt der Notzugang.
    path("admin/", admin.site.urls),
    path("api/", include("socos.urls")),
]
