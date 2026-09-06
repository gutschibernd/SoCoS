"""Die Schnittstelle unter /api/."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from socos import berechtigung


@api_view(["GET"])
def ich(request):
    """
    Wer bin ich und was darf ich.

    Das Frontend darf hieraus **nichts** ableiten, was es nicht auch ohne dürfte:
    Die Antwort sagt, was anzuzeigen ist — entschieden wird jede einzelne Anfrage
    trotzdem serverseitig neu.
    """
    nutzer = request.user
    return Response(
        {
            "id": nutzer.pk,
            "name": nutzer.name,
            "email": nutzer.email,
            "initialen": nutzer.initialen,
            "farbe": nutzer.farbe,
            "funktion": nutzer.funktion,
            "rolle": berechtigung.rolle(nutzer),
            "darf": {
                "bearbeiten": berechtigung.darf_bearbeiten(nutzer),
                "loeschen": berechtigung.darf_loeschen(nutzer),
                "finanzen_eintragen": berechtigung.darf_finanzen_eintragen(nutzer),
                "nutzer_verwalten": berechtigung.darf_nutzer_verwalten(nutzer),
            },
        }
    )
