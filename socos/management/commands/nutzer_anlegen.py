"""
Legt ein Konto an — **ohne** Passwort. Gesetzt wird es danach mit
`nutzer_passwort`.

**Warum kein `--passwort`:** Ein Passwort als Befehlsargument steht in der
Shell-Historie und, solange der Befehl läuft, in der Prozessliste des Servers.
Beides überlebt die Sitzung.
"""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

from socos import berechtigung
from socos.models import Nutzer


class Command(BaseCommand):
    help = "Legt ein Nutzerkonto ohne Passwort an."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("name")
        parser.add_argument(
            "--rolle",
            choices=berechtigung.ALLE_ROLLEN,
            required=True,
            help="admin · bearbeiter · leser",
        )
        parser.add_argument("--farbe", default="#BFD9CE")

    def handle(self, *args, **optionen):
        email = optionen["email"].strip().lower()
        if Nutzer.objects.filter(email=email).exists():
            raise CommandError(f"{email} gibt es schon.")

        nutzer = Nutzer.objects.create_user(
            email=email, name=optionen["name"], farbe=optionen["farbe"]
        )
        # Der Admin braucht den Django-Admin als Notzugang.
        if optionen["rolle"] == berechtigung.ADMIN:
            nutzer.is_staff = True
            nutzer.save(update_fields=["is_staff"])

        nutzer.groups.add(Group.objects.get(name=optionen["rolle"]))

        self.stdout.write(self.style.SUCCESS(
            f"{nutzer.name} <{nutzer.email}> als {optionen['rolle']} angelegt."
        ))
        self.stdout.write(
            f"Passwort setzen mit:  python manage.py nutzer_passwort {nutzer.email}"
        )
