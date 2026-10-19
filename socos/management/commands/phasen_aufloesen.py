"""
Löst Projektphasen auf: ihre gebuchte Zeit geht auf Overhead, danach werden
Aufgaben, Pensen, Pakete und die Phase selbst weich entfernt.

Anlass (Bernd, 2026-10-19): Finanzierung, Ziele, Claire@home und Entwicklung
standen ohne Zeitraum unter den echten Phasen, liefen „immer parallel bissl
mit" und machten den Gantt unlesbar. Auf ihren Paketen liegt aber schon
gebuchte Zeit — und die darf nicht verschwinden, sonst fehlt sie im
Zeitnachweis. Deshalb wird sie zuerst umgebucht, nicht mitgelöscht.

**Warum ein Befehl und keine Migration:** Welche Phasen gemeint sind, ist eine
Entscheidung über diese eine Datenbank, keine Schemaänderung. In einer
Migration stünde sie für jede Datenbank, auch für jede Sicherung, die je
eingespielt wird.

**Warum kein Knopf in der Oberfläche:** Ein Mal, drei Nutzer. Der Weg in der
Oberfläche wäre: jede Buchung einzeln umbuchen, jedes Paket entfernen, dann
die Phase. Ein Knopf, der das in einem Zug tut, wäre ein zweiter Löschweg
neben dem gewöhnlichen — genau das, was CLAUDE.md ausschließt.

Ohne `--ausfuehren` sagt der Befehl nur, was er täte. Jede Änderung steht im
Änderungsprotokoll, unter der Person aus `--als`.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from socos import aktueller_nutzer
from socos.models import Nutzer, Projektphase, Zeitbuchung, auffangpaket


def _stunden(buchungen):
    return sum(b.sekunden for b in buchungen) / 3600


class Command(BaseCommand):
    help = "Bucht die Zeit von Projektphasen auf Overhead um und entfernt die Phasen weich."

    def add_arguments(self, parser):
        parser.add_argument("phasen", nargs="+", help="Nummer oder genauer Titel je Phase.")
        parser.add_argument("--als", required=True, help="E-Mail der Person, unter der das Protokoll steht.")
        parser.add_argument("--ausfuehren", action="store_true", help="Wirklich ändern. Ohne: nur anzeigen.")

    def _phase(self, angabe):
        if angabe.isdigit():
            treffer = list(Projektphase.objects.filter(pk=int(angabe)))
        else:
            treffer = list(Projektphase.objects.filter(titel=angabe))
        if not treffer:
            raise CommandError(f"Keine Phase „{angabe}“.")
        if len(treffer) > 1:
            namen = ", ".join(f"{p.pk} ({p.projekt.titel})" for p in treffer)
            raise CommandError(f"„{angabe}“ gibt es mehrmals: {namen}. Bitte die Nummer angeben.")
        return treffer[0]

    def handle(self, *args, **optionen):
        try:
            nutzer = Nutzer.objects.get(email=optionen["als"])
        except Nutzer.DoesNotExist:
            raise CommandError(f"Kein Konto mit {optionen['als']}.")

        phasen = [self._phase(a) for a in optionen["phasen"]]
        for phase in phasen:
            if phase.pakete.filter(ist_auffang=True).exists():
                raise CommandError(f"„{phase.titel}“ trägt das Auffangpaket (Overhead) und bleibt.")

        for phase in phasen:
            pakete = list(phase.pakete.filter(geloescht_am__isnull=True))
            buchungen = list(Zeitbuchung.objects.filter(paket__in=pakete))
            self.stdout.write(
                f"{phase.pk} {phase.projekt.titel} · {phase.titel}: {len(pakete)} Pakete, "
                f"{len(buchungen)} Buchungen ({_stunden(buchungen):.2f} h) → Overhead"
            )

        if not optionen["ausfuehren"]:
            self.stdout.write("Nichts geändert. Mit --ausfuehren wird es gemacht.")
            return

        token = aktueller_nutzer.setzen(nutzer)
        try:
            with transaction.atomic():
                ziel = auffangpaket()
                for phase in phasen:
                    pakete = list(phase.pakete.filter(geloescht_am__isnull=True))
                    # Gelöschte Buchungen mit: Sie hängen weiter am Paket, und
                    # ein Wiederherstellen fände sonst ein Paket, das es nicht
                    # mehr gibt.
                    for buchung in Zeitbuchung.alle_objekte.filter(paket__in=pakete):
                        buchung.paket = ziel
                        buchung.save()
                    for paket in pakete:
                        for aufgabe in paket.unteraufgaben.filter(geloescht_am__isnull=True):
                            aufgabe.delete()
                        for pensum in paket.pensen.filter(geloescht_am__isnull=True):
                            pensum.delete()
                        paket.delete()
                    phase.delete()
        finally:
            aktueller_nutzer.zuruecksetzen(token)
        self.stdout.write(self.style.SUCCESS(f"{len(phasen)} Phasen aufgelöst."))
