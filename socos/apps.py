from django.apps import AppConfig


class SocosConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "socos"
    verbose_name = "SoCoS"

    def ready(self):
        # Das Änderungsprotokoll hängt sich an alle Fachmodelle. Erst hier, weil
        # vorher noch nicht alle Modelle geladen sind.
        from socos import protokoll

        protokoll.anhaengen()
