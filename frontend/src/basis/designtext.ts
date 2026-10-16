/**
 * Designentscheidungen: die Abschnitte — und der Weg über eine KI und zurück.
 *
 * „Mit KI überarbeiten" kopiert alle ausgefüllten Felder als einen Befehl,
 * den man in ein beliebiges Sprachmodell einfügt; dessen Antwort wird hier
 * wieder in die Felder zerlegt. **Bewusst über die Zwischenablage und nicht
 * über eine Anbindung am Server:** Dann verlässt kein Text SoCoS, ohne dass
 * jemand ihn selbst irgendwohin einfügt, und es gibt keinen Schlüssel und
 * keinen Dienst, den jemand pflegen muss.
 *
 * Getrennt wird an Zeilen wie `=== Begründung ===`. Die überleben eine KI
 * zuverlässiger als Markdown-Überschriften, die sie gern selbst umformatiert.
 */

import type { Designentscheidung } from "./daten";

export type Textfeld = "ausgangslage" | "alternativen" | "entscheidung" | "begruendung" | "sicherheit" | "verweise";

/**
 * Die Abschnitte in der Reihenfolge des PDF — dort steht dieselbe Folge. Die
 * Frage steht im leeren Feld: Sie sagt, was hineingehört, und verschwindet,
 * sobald etwas dasteht.
 */
export const ABSCHNITTE: { feld: Textfeld; titel: string; frage: string }[] = [
  { feld: "ausgangslage", titel: "Ausgangslage", frage: "Welches Problem, welche Anforderung, welcher Befund?" },
  { feld: "alternativen", titel: "Betrachtete Alternativen", frage: "Welche Wege standen zur Wahl? Einer je Zeile, mit - davor." },
  { feld: "entscheidung", titel: "Entscheidung", frage: "Was wird so gemacht?" },
  { feld: "begruendung", titel: "Begründung", frage: "Warum dieser Weg und nicht die anderen?" },
  {
    feld: "sicherheit",
    titel: "Auswirkung auf die Sicherheit",
    frage: "Welches Risiko sinkt, welches entsteht? Auch „keine, weil …“ ist eine Antwort.",
  },
  { feld: "verweise", titel: "Verweise", frage: "Einer je Zeile: Risiko R-12, Anforderung A-3, ISO 14971, Prüfbericht …" },
];

/** Was über die KI laufen kann: der Titel und die Abschnitte. */
export type KiFeld = "titel" | Textfeld;

const KI_FELDER: { feld: KiFeld; titel: string }[] = [{ feld: "titel", titel: "Titel" }, ...ABSCHNITTE];

const ENDE = "ENDE";

const BEFEHL = `Überarbeite die folgende Designentscheidung aus der technischen Dokumentation eines Medizinprodukts (ISO 13485).

- Korrigiere Rechtschreibung, Grammatik und Zeichensetzung.
- Formuliere klar, sachlich und knapp, im Stil einer technischen Dokumentation.
- Ändere nichts am fachlichen Inhalt: Erfinde keine Fakten, Zahlen, Risiken oder Gründe, und lass nichts weg.
- Kennungen, Normen und Verweise (etwa R-12, A-3, ISO 14971) bleiben genau so stehen.
- Zeilen mit einem - davor bleiben Aufzählungen, eine je Zeile.
- Kein Markdown: keine Überschriften, kein Fettdruck.

Antworte nur mit dem überarbeiteten Text, in genau diesem Format. Jede Zeile mit === bleibt unverändert stehen, auch die letzte. Nichts davor, nichts danach.`;

/** Der Befehl samt allen ausgefüllten Feldern, fertig zum Einfügen in eine KI. */
export function kiBefehl(e: Pick<Designentscheidung, KiFeld>): string {
  const teile = KI_FELDER.filter(({ feld }) => e[feld].trim()).map(
    ({ feld, titel }) => `=== ${titel} ===\n${e[feld].trim()}`,
  );
  return `${BEFEHL}\n\n${teile.join("\n\n")}\n\n=== ${ENDE} ===\n`;
}

/**
 * `**=== Begründung: ===**` → „begründung" — was eine KI um den Trenner herum
 * anstellt, fällt weg.
 *
 * **Gesucht wird überall, nicht nur am Zeilenanfang:** Die Chat-Oberflächen
 * zeigen die Antwort als Markdown, und dort ist ein einzelner Zeilenumbruch
 * kein Umbruch. Wer den angezeigten Text kopiert, bekommt
 * `=== Titel === Karussell …` in einer Zeile.
 */
const TRENNER = /[#*_>` \t]*={3,}[ \t]*([^=\n]*?)[ \t]*:?[ \t]*={3,}[*_`]*/g;
const ZAUN = /^\s*```[\w-]*\s*$/;

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Zerlegt die Antwort der KI wieder in Felder. Was vor dem ersten Trenner
 * und nach `=== ENDE ===` steht, ist Plauderei der KI und fällt weg;
 * Codezäune drumherum auch.
 *
 * **Ein leerer Abschnitt zählt nicht** — er leert kein Feld. Eine KI, die
 * einen Abschnitt verschluckt, soll keinen Text löschen, und bei einer
 * entschiedenen Entscheidung lehnte der Server das ohnehin ab.
 */
export function kiAntwortLesen(text: string): { felder: Partial<Record<KiFeld, string>>; unbekannt: string[] } {
  const nachName = new Map(KI_FELDER.map((f) => [normal(f.titel), f.feld]));
  const felder: Partial<Record<KiFeld, string>> = {};
  const unbekannt: string[] = [];
  const ohneZaun = text
    .split(/\r?\n/)
    .filter((zeile) => !ZAUN.test(zeile))
    .join("\n");

  // Zwischen zwei Trennern steht der Inhalt des ersten.
  const treffer = [...ohneZaun.matchAll(TRENNER)];
  for (const [i, t] of treffer.entries()) {
    const name = normal(t[1]);
    if (name === normal(ENDE)) break;
    const feld = nachName.get(name);
    if (!feld) {
      unbekannt.push(t[1]);
      continue;
    }
    const ende = treffer[i + 1]?.index ?? ohneZaun.length;
    const inhalt = ohneZaun.slice(t.index + t[0].length, ende).trim();
    if (inhalt) felder[feld] = inhalt;
  }

  return { felder, unbekannt };
}

/** Je erkanntem Feld: wie es heißt, was neu dasteht und ob es sich vom gespeicherten unterscheidet. */
export function kiAbgleich(e: Pick<Designentscheidung, KiFeld>, felder: Partial<Record<KiFeld, string>>) {
  return KI_FELDER.filter(({ feld }) => felder[feld] !== undefined).map(({ feld, titel }) => ({
    feld,
    titel,
    neu: felder[feld] as string,
    geaendert: felder[feld] !== e[feld].trim(),
  }));
}
