"""Die Schnittstelle unter /api/."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from socos import api

router = DefaultRouter()
router.register("projekte", api.ProjektViewSet, basename="projekt")
router.register("bereiche", api.BereichViewSet, basename="bereich")
router.register("pakete", api.ArbeitspaketViewSet, basename="paket")
router.register("unteraufgaben", api.UnteraufgabeViewSet, basename="unteraufgabe")
router.register("zeiten", api.ZeitbuchungViewSet, basename="zeit")
router.register("organisationen", api.OrganisationViewSet, basename="organisation")
router.register("kontakte", api.KontaktViewSet, basename="kontakt")
router.register("verlauf", api.VerlaufViewSet, basename="verlauf")
router.register("events", api.EventViewSet, basename="event")
router.register("eventziele", api.EventzielViewSet, basename="eventziel")
router.register("kontostaende", api.KontostandViewSet, basename="kontostand")
router.register("fixkosten", api.FixkostenViewSet, basename="fixkosten")
router.register("monatskosten", api.MonatskostenViewSet, basename="monatskosten")
router.register("nutzer", api.NutzerViewSet, basename="nutzer")
router.register("protokoll", api.ProtokollViewSet, basename="protokoll")

urlpatterns = [
    path("ich/", api.ich, name="ich"),
    path("dashboard/", api.dashboard, name="dashboard"),
    path("zeitnachweis/", api.zeitnachweis, name="zeitnachweis"),
    path("", include(router.urls)),
]
