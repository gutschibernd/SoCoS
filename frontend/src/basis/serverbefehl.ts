/**
 * Die Befehle, die ein Admin an der Konsole des Servers tippt — zum Kopieren.
 *
 * **Warum SoCoS einen Befehl kopiert, statt das Passwort selbst zu setzen:**
 * Konten entstehen nur über `nutzer_anlegen`, Passwörter nur über
 * `nutzer_passwort`, das interaktiv fragt (siehe socos/management/commands/).
 * Ein Passwortfeld im Browser schriebe das Passwort in den Verlauf, in den
 * Passwortspeicher und in jedes Server-Protokoll dazwischen. Der kopierte
 * Befehl spart nur das Abtippen von Pfad und Adresse — das Passwort fragt
 * weiter die Konsole.
 *
 * Der Vorspann ist derselbe wie in betrieb/LIESMICH.md. Zieht die Anwendung
 * je um, ändert er sich dort und hier.
 */

const AM_SERVER = "cd /opt/socos && docker compose -f betrieb/anwendung.yml exec anwendung python manage.py";

export const passwortBefehl = (email: string) => `${AM_SERVER} nutzer_passwort ${email}`;

/** Mit Platzhaltern: Adresse, Name und Rolle stehen erst an der Konsole fest. */
export const anlegeBefehl = () =>
  `${AM_SERVER} nutzer_anlegen vorname@sopharmis.com "Vorname Nachname" --rolle bearbeiter`;

/**
 * Ob es geklappt hat — ohne HTTPS oder ohne Erlaubnis gibt es keine
 * Zwischenablage, und dann muss der Befehl sichtbar werden, statt dass der
 * Knopf still nichts tut.
 */
export async function inZwischenablage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
