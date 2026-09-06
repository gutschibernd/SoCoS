"""Die Schnittstelle unter /api/. Fachrouten kommen dazu, sobald die Modelle stehen."""

from django.urls import path

from socos import api

urlpatterns = [
    path("ich/", api.ich, name="ich"),
]
