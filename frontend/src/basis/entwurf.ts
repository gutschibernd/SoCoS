/**
 * Ein Textfeld, das sich selbst speichert.
 *
 * **Wofür:** Während eines Meetings wird schnell mitgeschrieben. Niemand
 * drückt dabei auf „Speichern", und niemand soll es müssen — ein Protokoll,
 * das beim versehentlich geschlossenen Tab weg ist, schreibt beim nächsten Mal
 * wieder jemand in ein anderes Programm.
 *
 * Gespeichert wird nach einer kurzen Schreibpause, spätestens aber:
 *
 * - wenn das Fenster in den Hintergrund geht (`visibilitychange`) — am Handy
 *   passiert genau das, sobald jemand kurz in eine andere App wechselt,
 * - wenn die Seite verlassen wird (`pagehide`),
 * - wenn das Feld verschwindet, weil man woandershin geklickt hat.
 *
 * Und solange etwas offen ist, hält `beforeunload` den Browser an. Das ist die
 * einzige Stelle, an der wirklich etwas verlorengehen könnte: Ein Wechsel
 * innerhalb von SoCoS speichert beim Abbauen des Feldes, ein geschlossener Tab
 * kann das nicht mehr.
 *
 * **Warum der Server der Zwischenspeicher ist und nicht `localStorage`:** Ein
 * Entwurf im Browser liegt auf genau einem Gerät. Wer am Laptop mitschreibt
 * und danach am Handy nachsieht, fände dort nichts — und merkte es erst, wenn
 * er es braucht.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Entwurfsstand = "rein" | "offen" | "speichert" | "fehler";

export type Entwurf = {
  text: string;
  setzen: (neu: string) => void;
  stand: Entwurfsstand;
  /** Wann zuletzt erfolgreich gespeichert wurde — `null`, solange nichts lief. */
  zuletzt: Date | null;
  /** Sofort speichern, ohne auf die Pause zu warten (Feld verlassen, Knopf). */
  jetztSichern: () => void;
};

/** Was unter dem Feld steht. Hier und nicht im Markup, damit es prüfbar ist. */
export function standText(stand: Entwurfsstand, zuletzt: Date | null): string {
  if (stand === "speichert") return "Speichert …";
  if (stand === "offen") return "Nicht gespeichert";
  if (stand === "fehler") return "Konnte nicht gespeichert werden — der Text steht noch da.";
  if (zuletzt)
    return `Gespeichert ${zuletzt.toLocaleTimeString("de-AT", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  /* Vor dem ersten Speichern steht hier **nicht** „Gespeichert": Über einem
     leeren Feld wäre das eine Aussage über etwas, das nie passiert ist. Es
     steht das da, was gleich passieren wird. */
  return "Speichert von selbst";
}

export function useEntwurf(
  wert: string,
  speichern: (text: string) => Promise<unknown>,
  verzoegerung = 1500,
): Entwurf {
  const [text, setText] = useState(wert);
  const [stand, setStand] = useState<Entwurfsstand>("rein");
  const [zuletzt, setZuletzt] = useState<Date | null>(null);

  // Refs, weil die Ereignisse (Tab schließen, App wechseln, Abbauen) außerhalb
  // des Zeichnens zuschlagen und dort der Zustand von damals stünde.
  const textRef = useRef(text);
  const standRef = useRef(stand);
  const speichernRef = useRef(speichern);
  /** Was der Server hat. Danach entscheidet sich, ob etwas offen ist. */
  const gesichert = useRef(wert);
  const uhr = useRef<number | null>(null);

  textRef.current = text;
  standRef.current = stand;
  speichernRef.current = speichern;

  const sichern = useCallback(async () => {
    const jetzt = textRef.current;
    if (jetzt === gesichert.current) {
      setStand("rein");
      return;
    }
    setStand("speichert");
    try {
      await speichernRef.current(jetzt);
      gesichert.current = jetzt;
      setZuletzt(new Date());
      // Wer während des Speicherns weitergetippt hat, ist wieder offen — die
      // Pause dafür läuft schon.
      setStand(textRef.current === jetzt ? "rein" : "offen");
    } catch {
      setStand("fehler");
    }
  }, []);

  const setzen = useCallback(
    (neu: string) => {
      setText(neu);
      textRef.current = neu;
      setStand("offen");
      if (uhr.current) window.clearTimeout(uhr.current);
      uhr.current = window.setTimeout(() => void sichern(), verzoegerung);
    },
    [sichern, verzoegerung],
  );

  const jetztSichern = useCallback(() => {
    if (uhr.current) window.clearTimeout(uhr.current);
    void sichern();
  }, [sichern]);

  /**
   * Ein neuer Stand vom Server wird übernommen — aber nur, solange nichts
   * Eigenes offen ist. Sonst überschriebe das Nachladen nach dem Speichern
   * genau die Zeichen, die jemand gerade tippt.
   */
  useEffect(() => {
    if (wert !== gesichert.current && standRef.current === "rein") {
      gesichert.current = wert;
      setText(wert);
    }
  }, [wert]);

  useEffect(() => {
    const beimVerlassen = (e: BeforeUnloadEvent) => {
      if (standRef.current === "rein") return;
      // Beides: `preventDefault` ist der neue Weg, `returnValue` der, den
      // ältere Browser verlangen. Der Text darin ist nicht wählbar — der
      // Browser zeigt seinen eigenen.
      e.preventDefault();
      e.returnValue = "";
    };
    const beimVerstecken = () => {
      if (standRef.current === "offen" || standRef.current === "fehler") jetztSichern();
    };
    const beimWechsel = () => {
      if (document.visibilityState === "hidden") beimVerstecken();
    };

    window.addEventListener("beforeunload", beimVerlassen);
    window.addEventListener("pagehide", beimVerstecken);
    document.addEventListener("visibilitychange", beimWechsel);
    return () => {
      window.removeEventListener("beforeunload", beimVerlassen);
      window.removeEventListener("pagehide", beimVerstecken);
      document.removeEventListener("visibilitychange", beimWechsel);
    };
  }, [jetztSichern]);

  // Beim Abbauen: was offen ist, geht noch hinaus. Ohne Warten — die Antwort
  // interessiert niemanden mehr, das Feld ist weg.
  useEffect(
    () => () => {
      if (uhr.current) window.clearTimeout(uhr.current);
      if (textRef.current !== gesichert.current) void speichernRef.current(textRef.current);
    },
    [],
  );

  return { text, setzen, stand, zuletzt, jetztSichern };
}
