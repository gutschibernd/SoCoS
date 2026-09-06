"""
Setzt das Passwort eines Kontos. Fragt es interaktiv ab — nie als Argument.
"""

from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from socos.models import Nutzer


class Command(BaseCommand):
    help = "Setzt das Passwort eines Kontos (interaktive Eingabe)."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **optionen):
        email = optionen["email"].strip().lower()
        nutzer = Nutzer.objects.filter(email=email).first()
        if nutzer is None:
            raise CommandError(f"Kein Konto mit {email}.")

        erstes = getpass(f"Neues Passwort für {nutzer.name}: ")
        zweites = getpass("Noch einmal: ")
        if erstes != zweites:
            raise CommandError("Die beiden Eingaben stimmen nicht überein.")

        try:
            validate_password(erstes, nutzer)
        except ValidationError as fehler:
            raise CommandError("\n".join(fehler.messages))

        nutzer.set_password(erstes)
        nutzer.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS(f"Passwort für {nutzer.email} gesetzt."))
