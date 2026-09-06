"""
Der Django-Admin ist der **Notzugang** — nicht die Oberfläche für die tägliche
Arbeit. Deshalb steht hier nur, was man im Notfall braucht.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from socos.models import Nutzer, Protokolleintrag


@admin.register(Nutzer)
class NutzerAdmin(UserAdmin):
    ordering = ["name"]
    list_display = ["name", "email", "is_active", "is_staff"]
    list_filter = ["is_active", "is_staff", "groups"]
    search_fields = ["name", "email"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Person", {"fields": ("name", "initialen", "farbe", "funktion")}),
        ("Stammdaten", {"fields": ("telefon", "strasse", "ort", "geburtsdatum")}),
        ("Rechte", {"fields": ("is_active", "is_staff", "is_superuser", "groups")}),
        ("Zeiten", {"fields": ("last_login", "beigetreten_am")}),
    )
    add_fieldsets = (
        (None, {"fields": ("email", "name")}),
    )
    filter_horizontal = ["groups"]


@admin.register(Protokolleintrag)
class ProtokollAdmin(admin.ModelAdmin):
    """
    Nur lesen. Ein Änderungsprotokoll, das man ändern kann, beantwortet die
    Frage nicht mehr, für die es da ist.
    """

    list_display = ["zeitpunkt", "nutzer_text", "modell", "objekt_text", "aktion"]
    list_filter = ["aktion", "modell", "zeitpunkt"]
    search_fields = ["objekt_text", "nutzer_text", "objekt_id"]
    date_hierarchy = "zeitpunkt"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
