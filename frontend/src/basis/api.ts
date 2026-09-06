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
    throw new ApiFehler(antwort.status, code, daten, String(meldung));
  }

  return daten as T;
}
