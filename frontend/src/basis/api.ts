/**
 * Der Zugang zur Schnittstelle.
 *
 * Angemeldet wird über eine Django-Sitzung mit Cookie, nicht über ein Token.
 * Es liegt deshalb nichts im Browser-Speicher, was ein XSS abräumen könnte.
 * Das CSRF-Cookie ist für JavaScript lesbar und wird als X-CSRFToken
 * zurückgeschickt — es ist kein Geheimnis, es beweist nur, dass die Anfrage
 * aus der eigenen Seite kommt.
 */

export class ApiFehler extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly daten: unknown,
    text: string,
  ) {
    super(text);
    this.name = "ApiFehler";
  }

  /** Nicht angemeldet — zurück zur Anmeldung. */
  get istAbgemeldet() {
    return this.code === "not_authenticated";
  }

  /**
   * Angemeldet, aber nicht berechtigt. **Nicht** dasselbe wie abgemeldet: Wer
   * hier zur Anmeldung geschickt wird, verliert seine Sitzung für nichts.
   */
  get istVerwehrt() {
    return this.code === "permission_denied";
  }

  /** Der Datenzustand steht der Anfrage entgegen (409). */
  get istInVerwendung() {
    return this.status === 409;
  }
}

/**
 * Was der Nutzer lesen soll, wenn ein Schreibvorgang scheitert.
 *
 * Der technische Text aus der Antwort ist oft brauchbar („Ende muss nach dem
 * Start liegen"), manchmal aber nur ein Statuscode. Dann steht hier ein Satz,
 * der sagt, was zu tun ist.
 */
function lesbarerGrund(fehler: ApiFehler): string {
  if (fehler.istVerwehrt) return "Dafür fehlt dir die Berechtigung.";
  if (fehler.istInVerwendung) {
    const verwendet = (fehler.daten as { verwendet_von?: string[] })?.verwendet_von;
    return verwendet?.length
      ? `Wird noch verwendet: ${verwendet.slice(0, 3).join(", ")}.`
      : "Wird noch verwendet und kann darum nicht entfernt werden.";
  }
  if (fehler.status >= 500) return "Der Server hat einen Fehler gemeldet. Bitte noch einmal versuchen.";
  if (fehler.status === 404) return "Das gibt es nicht mehr. Die Seite neu laden.";

  // Feldfehler von DRF: { feld: ["Text"] } — den ersten Satz zeigen.
  const daten = fehler.daten as Record<string, unknown> | null;
  if (daten && typeof daten === "object") {
    for (const wert of Object.values(daten)) {
      if (Array.isArray(wert) && typeof wert[0] === "string") return wert[0];
      if (typeof wert === "string" && wert.length > 3) return wert;
    }
  }
  return fehler.message || "Das hat nicht geklappt.";
}

export function csrfWert(): string {
  const treffer = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return treffer ? decodeURIComponent(treffer[1]) : "";
}

export async function hole<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const schreibend = !["GET", "HEAD", "OPTIONS"].includes(
    (optionen.method ?? "GET").toUpperCase(),
  );

  const antwort = await fetch(`/api${pfad}`, {
    ...optionen,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(optionen.body ? { "Content-Type": "application/json" } : {}),
      ...(schreibend ? { "X-CSRFToken": csrfWert() } : {}),
      ...optionen.headers,
    },
  });

  if (antwort.status === 204) return undefined as T;

  const text = await antwort.text();
  const daten = text ? JSON.parse(text) : null;

  if (!antwort.ok) {
    const code = daten && typeof daten === "object" ? (daten.code ?? null) : null;
    const meldung =
      (daten && typeof daten === "object" && daten.detail) || `Fehler ${antwort.status}`;
    const fehler = new ApiFehler(antwort.status, code, daten, String(meldung));

    // Eine abgelaufene Sitzung führt immer zur Anmeldung — egal, wo sie
    // auffällt. Sonst klickt jemand weiter und wundert sich, warum nichts
    // gespeichert wird.
    if (fehler.istAbgemeldet) {
      const { zurAnmeldung } = await import("./anmeldung");
      zurAnmeldung();
      throw fehler;
    }

    // Schreibende Aufrufe melden sich sichtbar. Lesende haben ihren eigenen
    // Weg über `Zustand` — sonst stünde bei jedem Netzwackler ein Banner.
    if (schreibend) {
      const { melden } = await import("./meldungen");
      melden("fehler", lesbarerGrund(fehler));
    }

    throw fehler;
  }

  return daten as T;
}
