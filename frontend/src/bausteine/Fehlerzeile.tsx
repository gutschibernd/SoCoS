/**
 * Was nach einem Klick fehlt — direkt unter der Feldreihe, nicht als Banner.
 *
 * **Warum nicht über `melden`:** Die Meldungen oben rechts sind für das, was
 * der Server sagt. Ein fehlendes Pflichtfeld gehört neben das Feld, sonst
 * sucht man am anderen Ende des Bildschirms nach dem Satz.
 *
 * `role="alert"` steht hier und nicht an den zwölf Aufrufstellen: Eine
 * Vorlesesoftware muss den Satz hören, und an zwölf Stellen wird er vergessen.
 */
export function Fehlerzeile({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="rueckmeldung schlecht" role="alert">
      {text}
    </p>
  );
}
