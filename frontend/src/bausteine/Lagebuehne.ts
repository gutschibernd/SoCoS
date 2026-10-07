/**
 * Die Bühne von Thoughts — die Lagekarte: eine unendliche Fläche mit Kacheln und Pfeilen,
 * die man schwenkt, zoomt und auf der man zieht.
 *
 * **Warum das kein React ist:** Beim Zoomen und Ziehen gleiten alle Kacheln
 * und Pfeile sechzigmal in der Sekunde an einen neuen Platz. Über React liefe
 * jeder dieser Schritte durch einen Abgleich des ganzen Baums; hier setzt ein
 * Takt nur `left`/`top` und zeichnet die Pfeile neu. Die Kacheln selbst
 * werden nur gebaut, wenn sich die Daten ändern. Werkzeugleisten und
 * Seitenspalte sind React (`ansichten/Thoughts.tsx`) — dort ändert sich
 * nichts im Takt.
 *
 * **Die Bühne speichert nichts.** Jede Handlung geht als Ereignis hinaus, die
 * Ansicht schreibt an den Server und reicht den neuen Stand mit
 * `setzeDaten` herein. Die Bühne hält nur, was zwischen zwei Ständen liegt:
 * die Lage einer Kachel, während sie gezogen wird, und einen neuen Gedanken,
 * solange er noch keinen Titel hat — der Server nimmt keinen ohne.
 *
 * Was sich ohne Bildschirm rechnen lässt — „wartet", Stränge, Pfeilführung,
 * Platzsuche —, steht in `basis/lagekarte.ts` und ist dort geprüft.
 */

import { fristText } from "../basis/aufgaben";
import type { Karte, Lageschritt, Lagethema, Lageverbindung } from "../basis/daten";
import {
  MITTE,
  ORDNUNG,
  alsSchritt,
  anordnen,
  alsThema,
  aufRaster,
  belegt,
  fortschritt,
  freieFarbe,
  fuehre,
  frei,
  gesperrt,
  graph,
  hubZeilen,
  istSchritt,
  istThema,
  klemme,
  kreuzSperre,
  nabeVon,
  nummer,
  platzFuer,
  platzFuerThema,
  straenge,
  verbindungsHindernis,
  type Graph,
  type P,
  type Rechteck,
  type Schluessel,
} from "../basis/lagekarte";

export type Auswahl = { art: "schritt" | "thema" | "verbindung"; id: number } | null;
export type Stufe = "lage" | "karte" | "detail";
export type Ansicht = "stern" | "straenge";

export type Ereignisse = {
  /** Jemand hat auf der Bühne etwas gewählt (oder nichts). */
  auswahl: (a: Auswahl) => void;
  /** Die Tiefe hat sich durch Zoomen geändert. */
  stufe: (s: Stufe) => void;
  /** Kacheln wurden verschoben — auf der Sternkarte gespeichert, damit sie dort bleiben. */
  verschieben: (lage: { themen: { id: number; x: number; y: number }[]; schritte: { id: number; x: number; y: number }[] }) => void;
  /** Ein Schritt wurde auf ein Thema (oder die Mitte) gezogen. */
  zuordnen: (id: number, thema: number | null, p: P) => void;
  umschalten: (id: number) => void;
  verbinden: (von: number, nach: number) => Promise<number | null>;
  umhaengen: (verbindung: number, von: number, nach: number) => void;
  /** Ein neuer Schritt hat seinen Titel bekommen. Zurück kommt seine Nummer. */
  anlegen: (s: { titel: string; thema: number | null; x: number; y: number; haengt_an: number | null }) => Promise<number | null>;
  themaAnlegen: (t: { name: string; farbe: number; x: number; y: number }) => Promise<number | null>;
  umbenennen: (a: { art: "schritt" | "thema"; id: number }, text: string) => void;
  beschriften: (verbindung: number, text: string) => void;
  loesen: (verbindung: number) => void;
  /** Entf auf einer Auswahl — die Ansicht fragt nach, die Bühne nicht. */
  entfernen: (a: Exclude<Auswahl, null>) => void;
};

export type Rechte = { bearbeiten: boolean; loeschen: boolean };

/** Die Nummer eines Entwurfs, solange er noch nicht am Server ist. */
const NEU = -1;

/** Unterhalb dieser Breite wird die Seitenspalte zum Blatt von unten — dieselbe Grenze wie die Schublade. */
export const SCHMAL = 900;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Fläche und Ton eines Themas als Werte für die Kachel — die Farben selbst stehen in farben.css. */
const farbStil = (t: Lagethema | undefined) =>
  t ? `--f:var(--f${t.farbe});--t:var(--t${t.farbe})` : "--f:var(--flaeche);--t:var(--text-sehr-leise)";

type Linie = {
  a: Schluessel;
  b: Schluessel;
  art: "stamm" | "ast" | "folgt" | "erfuellt" | "kreuz";
  /** Thementon für Stamm und Ast; 0 = lose. */
  ton?: number;
  verbindung?: number;
  text?: string;
  pfeil?: boolean;
  pts?: P[] | null;
};

type Modus =
  | { art: "pan"; x0: number; y0: number; cx: number; cy: number; bewegt: boolean }
  | { art: "pinch"; d: number; mx: number; my: number }
  | {
      art: "knoten";
      id: Schluessel;
      x0: number;
      y0: number;
      bewegt: boolean;
      punkt: boolean;
      start: { x: number; y: number; kinder: [Lageschritt, number, number][] };
      ziel?: Schluessel;
    }
  | { art: "verbinden"; von: number; x0: number; y0: number; px?: number; py?: number; ziel?: number | null }
  | {
      art: "umhaengen";
      verbindung: number;
      ende: "von" | "nach";
      x0: number;
      y0: number;
      bewegt: boolean;
      px?: number;
      py?: number;
      ziel?: number | null;
    };

export class Lagebuehne {
  private server: Karte = { themen: [], schritte: [], verbindungen: [] };
  private D: Karte = this.server;
  private g: Graph = graph(this.D);
  private B = straenge(this.g);
  private wartend: Karte | null = null;
  private entwurf: { schritt?: Lageschritt; verbindung?: Lageverbindung; thema?: Lagethema } | null = null;

  private ansicht: Ansicht;
  private stufe: Stufe = "lage";
  private sel: Schluessel | null = null;
  /** Gerade angelegt, aber noch nicht vom Server zurück — die Auswahl bleibt, bis er da ist. */
  private erwartet: Schluessel | null = null;
  private hinflug = false;
  private selKante: number | null = null;
  private etikettOffen = false;
  private etikettFokus = false;
  private schwebt: Schluessel | null = null;
  private modus: Modus | null = null;
  private bearbeitet = false;

  private cam = { x: 0, y: 0, k: 0.3 };
  private camZiel: { x: number; y: number; k: number } | null = null;
  private lageM = 0.5;
  private cur: Record<Schluessel, P> = {};
  private groesse: Record<Schluessel, { w: number; h: number }> = {};
  private el: Record<Schluessel, HTMLElement> = {};
  private mitten: Record<number, P> = {};
  private dirty = true;
  private routenKey = "";
  private routenFein: Map<string, P[] | null> | null = null;
  private kleinMass: { x0: number; y0: number; s: number; ox: number; oy: number } | null = null;
  private zeiger = new Map<number, P>();
  private takt = 0;
  private meldeUhr = 0;
  private aufraeumen: (() => void)[] = [];

  private raster: HTMLElement;
  private welt: HTMLElement;
  private baender: HTMLElement;
  private linien: SVGSVGElement;
  private schicht: HTMLElement;
  private klein: HTMLElement;
  private etikett: HTMLElement;
  private etikettFeld: HTMLInputElement;
  private meldung: HTMLElement;

  constructor(
    private buehne: HTMLElement,
    host: HTMLElement,
    private e: Ereignisse,
    ansicht: Ansicht,
    private darf: Rechte,
  ) {
    this.ansicht = ansicht;
    host.innerHTML = `<div class="lk-raster"></div>
      <div class="lk-welt"><div class="lk-baender"></div><svg class="lk-linien"></svg><div class="lk-schicht"></div></div>
      <div class="lk-klein" aria-label="Übersicht"></div>
      <div class="lk-etikett" hidden><input placeholder="Beschriftung …" maxlength="40" aria-label="Beschriftung des Pfeils"></div>
      <div class="lk-meldung" role="status"></div>`;
    const $ = <T extends Element>(s: string) => host.querySelector(s) as T;
    this.raster = $(".lk-raster");
    this.welt = $(".lk-welt");
    this.baender = $(".lk-baender");
    this.linien = $(".lk-linien");
    this.schicht = $(".lk-schicht");
    this.klein = $(".lk-klein");
    this.etikett = $(".lk-etikett");
    this.etikettFeld = $(".lk-etikett input");
    this.meldung = $(".lk-meldung");
    buehne.dataset.ansicht = ansicht;
    buehne.dataset.stufe = this.stufe;
    this.lauschen();
  }

  /* ------------------------------------------------------------ von außen */

  /**
   * Ein neuer Stand vom Server. Während gezogen oder ein Titel geschrieben
   * wird, wartet er: Sonst risse ein Neuladen im Hintergrund die Kachel unter
   * dem Zeiger weg, oder das Feld, in dem gerade getippt wird.
   */
  setzeDaten(karte: Karte, anflug = false) {
    if (this.bearbeitet || (this.modus && this.modus.art !== "pan" && this.modus.art !== "pinch")) {
      this.wartend = karte;
      return;
    }
    this.wartend = null;
    this.server = karte;
    this.aktualisiere();
    if (anflug) this.anflug();
  }

  setzeRechte(darf: Rechte) {
    this.darf = darf;
  }

  /** Die Ansicht wählt etwas aus (Seitenspalte, Fangfeld). Die Bühne meldet es nicht zurück. */
  waehle(a: Auswahl, hinfliegen = false) {
    this.selKante = a?.art === "verbindung" ? a.id : null;
    this.etikettOffen = false;
    this.sel = a?.art === "schritt" ? alsSchritt(a.id) : a?.art === "thema" ? alsThema(a.id) : null;
    // Eben erst angelegt (Fangfeld): Hingeflogen wird, sobald er da ist.
    if (this.sel && !this.objekt(this.sel)) {
      this.erwartet = this.sel;
      this.hinflug = hinfliegen;
    } else if (hinfliegen && this.sel) this.fliegeZu(this.sel, Math.max(this.cam.k, 0.85));
    this.dirty = true;
  }

  setzeAnsicht(ansicht: Ansicht) {
    if (ansicht === this.ansicht) return;
    this.ansicht = ansicht;
    this.buehne.dataset.ansicht = ansicht;
    // Die Kacheln fliegen von ihrem alten an den neuen Platz; die Kamera folgt.
    if (this.stufe === "lage") this.zurLage();
    else if (this.sel) this.fliegeZu(this.sel);
    else this.blende(this.alleIds(), 0.62, 1, 60);
    this.dirty = true;
  }

  zurLage(sofort = false) {
    const { r, oben, unten } = this.rahmen();
    const ids = [MITTE, ...this.D.themen.map((t) => alsThema(t.id))];
    // Unter k = lageM ist das Bild maßstabsfrei (siehe lageF/lageG): Abstände
    // sind p·lageM, Kacheln w·1,6·lageM. Passt es nicht, wird lageM kleiner.
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id of ids) {
      const p = this.ansicht === "straenge" ? this.B.lage[id] : this.grundPos(id);
      const g = this.groesse[id] ?? { w: 220, h: 90 };
      x0 = Math.min(x0, p.x - g.w * 0.8);
      x1 = Math.max(x1, p.x + g.w * 0.8);
      y0 = Math.min(y0, p.y - g.h * 0.8);
      y1 = Math.max(y1, p.y + g.h * 0.8);
    }
    this.lageM = klemme(Math.min((r.width - 24) / (x1 - x0), (r.height - oben - unten) / (y1 - y0)), 0.22, 0.5);
    const k = this.lageM * 0.9;
    const z = {
      k,
      x: r.width / 2 - ((x0 + x1) / 2) * this.lageM,
      y: oben + (r.height - oben - unten) / 2 - ((y0 + y1) / 2) * this.lageM,
    };
    if (sofort) Object.assign(this.cam, z);
    else this.camZiel = z;
  }

  zurKarte() {
    if (this.sel) return this.fliegeZu(this.sel, 0.8);
    this.blende(this.alleIds(), 0.62, 1, 60);
  }

  detail() {
    if (this.sel) this.fliegeZu(this.sel, 1.3);
    else this.zoomMitte(1.3 / this.cam.k);
  }

  zoomMitte(f: number) {
    const r = this.flaeche();
    const k2 = klemme(this.cam.k * f, 0.12, 2.4);
    this.camZiel = {
      k: k2,
      x: r.width / 2 - (r.width / 2 - this.cam.x) * (k2 / this.cam.k),
      y: r.height / 2 - (r.height / 2 - this.cam.y) * (k2 / this.cam.k),
    };
  }

  themaFokus(id: number) {
    const k = alsThema(id);
    this.blende([k, ...this.D.schritte.filter((s) => s.thema === id).map((s) => alsSchritt(s.id))], 0.62, 1.1, 70);
    this.sel = k;
    this.selKante = null;
    this.dirty = true;
    this.e.auswahl({ art: "thema", id });
  }

  /**
   * Ein neuer Gedanke, gleich mit Schreibmarke im Titel. Hinter `nach`
   * (und daran gehängt), in `thema`, oder lose um die Mitte.
   */
  neuerSchritt({ thema = null, nach = null, bei = null }: { thema?: number | null; nach?: number | null; bei?: P | null }) {
    if (!this.darf.bearbeiten) return;
    this.verwirfEntwurf();
    const vorgaenger = nach !== null ? this.g.schritt(nach) : undefined;
    const th = vorgaenger ? vorgaenger.thema : thema;
    const p = bei ?? platzFuer(this.D, { thema: th, nach: vorgaenger });
    const schritt: Lageschritt = {
      id: NEU, thema: th, titel: "", art: "schritt", status: "offen", frist: null, notiz: "", x: p.x, y: p.y,
    };
    this.entwurf = {
      schritt,
      verbindung: vorgaenger ? { id: NEU, von: vorgaenger.id, nach: NEU, text: "" } : undefined,
    };
    const quelle = vorgaenger ? alsSchritt(vorgaenger.id) : th !== null ? alsThema(th) : MITTE;
    const k = alsSchritt(NEU);
    if (this.cur[quelle]) this.cur[k] = { ...this.cur[quelle] };
    this.sel = k;
    this.selKante = null;
    this.aktualisiere();
    this.el[k]?.classList.add("lk-neu");
    const warten = this.stufe === "lage";
    if (warten) this.fliegeZu(k, 0.85);
    else this.insBild(k);
    window.setTimeout(() => this.bearbeite(k), warten ? 450 : 30);
  }

  neuesThema() {
    if (!this.darf.bearbeiten) return;
    this.verwirfEntwurf();
    const p = platzFuerThema(this.D);
    this.entwurf = { thema: { id: NEU, name: "", farbe: freieFarbe(this.D.themen), x: p.x, y: p.y } };
    const k = alsThema(NEU);
    this.cur[k] = { ...(this.cur[MITTE] ?? { x: 0, y: 0 }) };
    this.sel = k;
    this.aktualisiere();
    if (this.stufe !== "lage") this.insBild(k);
    window.setTimeout(() => this.bearbeite(k), 60);
  }

  /**
   * Räumt die Sternkarte auf (`anordnen` in basis/lagekarte.ts) und
   * speichert, was sich dabei bewegt hat. Der Zeilenabstand richtet sich nach
   * der höchsten Kachel, wie sie gerade gezeichnet ist — in den Details mit
   * Notizen also weiter als auf der Karte.
   */
  ordne() {
    if (!this.darf.bearbeiten || this.ansicht !== "stern") return;
    this.verwirfEntwurf();
    const hoch = Math.max(0, ...this.D.schritte.map((s) => this.groesse[alsSchritt(s.id)]?.h ?? 0));
    const neu = anordnen(this.g, Math.max(ORDNUNG.zeile, Math.ceil((hoch + 48) / 24) * 24));
    const bewegt = <T extends { x: number; y: number }>(o: T | undefined, p: { x: number; y: number }) => {
      if (!o || (o.x === p.x && o.y === p.y)) return false;
      o.x = p.x;
      o.y = p.y;
      return true;
    };
    const lageNeu = {
      themen: neu.themen.filter((t) => bewegt(this.g.thema(t.id), t)),
      schritte: neu.schritte.filter((s) => bewegt(this.g.schritt(s.id), s)),
    };
    if (!lageNeu.themen.length && !lageNeu.schritte.length) return this.melde("Ist schon aufgeräumt");
    this.e.verschieben(lageNeu);
    // Die Kacheln gleiten an ihren neuen Platz; die Kamera nimmt alles ins Bild.
    if (this.stufe === "lage") this.zurLage();
    else this.blende(this.alleIds(), 0.62, 1, 60);
    this.dirty = true;
    this.melde("Neu angeordnet");
  }

  /** Der Titel direkt an der Kachel — wie Doppelklick oder Enter. */
  bearbeiteAuswahl() {
    if (this.sel) this.bearbeite(this.sel);
  }

  melde(text: string) {
    this.meldung.textContent = text;
    this.meldung.classList.add("lk-an");
    window.clearTimeout(this.meldeUhr);
    this.meldeUhr = window.setTimeout(() => this.meldung.classList.remove("lk-an"), 2400);
  }

  zerstoere() {
    cancelAnimationFrame(this.takt);
    window.clearTimeout(this.meldeUhr);
    this.aufraeumen.forEach((f) => f());
  }

  /* --------------------------------------------------------------- Stand */

  private verwirfEntwurf() {
    if (!this.entwurf) return;
    const k = this.entwurf.thema ? alsThema(NEU) : alsSchritt(NEU);
    this.entwurf = null;
    delete this.cur[k];
    if (this.sel === k) this.sel = null;
  }

  private aktualisiere() {
    const s = this.server;
    const d = this.entwurf;
    // Eine Arbeitskopie: Beim Ziehen wird die Lage an ihr verändert, und der
    // Stand der Ansicht bleibt unberührt, bis der Server geantwortet hat.
    this.D = {
      themen: [...s.themen, ...(d?.thema ? [d.thema] : [])].map((t) => ({ ...t })),
      schritte: [...s.schritte, ...(d?.schritt ? [d.schritt] : [])].map((x) => ({ ...x })),
      verbindungen: [...s.verbindungen, ...(d?.verbindung ? [d.verbindung] : [])],
    };
    this.g = graph(this.D);
    this.B = straenge(this.g);
    if (this.erwartet && this.objekt(this.erwartet)) {
      if (this.hinflug && this.sel === this.erwartet) this.fliegeZu(this.sel, Math.max(this.cam.k, 0.85));
      this.erwartet = null;
      this.hinflug = false;
    }
    if (this.sel && !this.objekt(this.sel) && this.sel !== this.erwartet) this.sel = null;
    if (this.selKante !== null && !this.kante(this.selKante)) {
      this.selKante = null;
      this.etikettOffen = false;
    }
    this.baue();
  }

  private objekt(k: Schluessel): Lagethema | Lageschritt | undefined {
    if (istThema(k)) return this.g.thema(nummer(k));
    if (istSchritt(k)) return this.g.schritt(nummer(k));
    return undefined;
  }

  private kante(id: number) {
    return this.D.verbindungen.find((v) => v.id === id);
  }

  private alleIds(): Schluessel[] {
    return [MITTE, ...this.D.themen.map((t) => alsThema(t.id)), ...this.D.schritte.map((s) => alsSchritt(s.id))];
  }

  /* --------------------------------------------------------------- Lage */

  private grundPos(id: Schluessel): P {
    if (this.ansicht === "straenge") return this.B.pos[id] ?? { x: 0, y: 0 };
    if (id === MITTE) return { x: 0, y: 0 };
    const o = this.objekt(id);
    return o ? { x: o.x, y: o.y } : { x: 0, y: 0 };
  }

  /* In der Lage bleibt das Bild unter k = 0,5 gleich groß: die Themen rücken
     auseinander und wachsen mit, statt zu Briefmarken zu schrumpfen. */
  private lageF = () => Math.max(1, this.lageM / this.cam.k);
  private lageG = () => klemme((1.6 * this.lageM) / this.cam.k, 1, 4);

  private zielPos(id: Schluessel): P {
    if (this.stufe !== "lage") return this.grundPos(id);
    if (istSchritt(id)) {
      const s = this.g.schritt(nummer(id));
      return this.zielPos(s ? nabeVon(s) : MITTE);
    }
    const p = this.ansicht === "straenge" ? (this.B.lage[id] ?? { x: 0, y: 0 }) : this.grundPos(id);
    const f = this.lageF();
    return { x: p.x * f, y: p.y * f };
  }

  private skal(id: Schluessel) {
    if (id === MITTE || istThema(id)) return this.stufe === "lage" ? this.lageG() : klemme(0.8 / this.cam.k, 1, 1.35);
    return 1;
  }

  /* -------------------------------------------------------------- Aufbau */

  private hubHtml(t: Lagethema) {
    const f = fortschritt(this.D, t.id);
    const zeilen = hubZeilen(this.g, t)
      .map((z) => `<li data-s="${z.art}"${z.art === "leer" ? ' class="lk-leer"' : ""}>${esc(z.text)}</li>`)
      .join("");
    return `<div class="lk-hub-kopf"><span class="lk-hub-name">${esc(t.name)}</span><span class="lk-hub-zahl">${f.fertig}/${f.alle}</span></div>
      <div class="lk-hub-balken">${f.status.map((s) => `<i data-s="${s}"></i>`).join("")}</div>
      <ul class="lk-hub-lage">${zeilen}</ul>`;
  }

  private knotenHtml(s: Lageschritt) {
    const meta: string[] = [];
    if (s.frist) {
      const f = fristText(s.frist);
      meta.push(f.drueber ? `<span class="lk-ueber">${esc(f.text)}</span>` : esc(f.text));
    }
    const ks = s.status === "offen" ? kreuzSperre(this.g, s) : [];
    if (ks.length) {
      const name = ks[0].thema !== null ? this.g.thema(ks[0].thema)?.name : "einem losen Gedanken";
      meta.push(`hängt an <b>${esc(name)}</b>`);
    }
    const art = { entscheidung: "Entscheidung", termin: "Termin", warten: "Warten auf", schritt: "" }[s.art];
    const punkt = this.darf.bearbeiten
      ? `<button type="button" class="lk-k-punkt" aria-label="${s.status === "erledigt" ? "Wieder öffnen" : "Abhaken"}"></button>`
      : `<span class="lk-k-punkt"></span>`;
    return `${punkt}${art ? `<span class="lk-k-art">${art}</span>` : ""}<span class="lk-k-titel">${esc(s.titel)}</span>
      <span class="lk-k-meta">${meta.join(" · ")}</span>${s.notiz ? `<span class="lk-k-notiz">${esc(s.notiz)}</span>` : ""}
      ${this.darf.bearbeiten ? `<span class="lk-k-griff" title="Ziehen, um zu verbinden"></span>` : ""}`;
  }

  private baue() {
    this.schicht.innerHTML = "";
    this.el = {};
    const neu = (id: Schluessel, klasse: string, html: string, stil?: string) => {
      const e = document.createElement("div");
      e.className = klasse;
      e.dataset.id = id;
      if (stil) e.setAttribute("style", stil);
      e.innerHTML = html;
      this.schicht.append(e);
      this.el[id] = e;
      return e;
    };
    const lose = this.D.schritte.filter((s) => s.thema === null).length;
    neu(
      MITTE,
      "lk-mitte",
      `<img src="/static/favicon.svg" alt=""><span>Sopharmis${lose ? `<small>${lose} lose ${lose === 1 ? "Gedanke" : "Gedanken"}</small>` : ""}</span>`,
    );
    for (const t of this.D.themen) neu(alsThema(t.id), "lk-hub", this.hubHtml(t), farbStil(t));
    for (const s of this.D.schritte) {
      const e = neu(alsSchritt(s.id), "lk-k", this.knotenHtml(s), farbStil(s.thema !== null ? this.g.thema(s.thema) : undefined));
      e.dataset.status = s.status;
      e.dataset.art = s.art;
      if (gesperrt(this.g, s)) e.classList.add("lk-gesperrt");
      if (frei(this.g, s)) e.classList.add("lk-frei");
    }
    this.baender.innerHTML = this.B.baender
      .map(
        (b) =>
          `<div class="lk-band" style="left:${b.x0}px;top:${b.y}px;width:${b.x1 - b.x0}px;height:${b.h}px;${farbStil(
            b.thema !== null ? this.g.thema(b.thema) : undefined,
          )}">${b.thema === null ? "<span>Ohne Thema</span>" : ""}</div>`,
      )
      .join("");
    for (const id of this.alleIds()) if (!this.cur[id]) this.cur[id] = { ...this.zielPos(id) };
    this.messen();
    this.dirty = true;
  }

  private messen() {
    for (const id in this.el) this.groesse[id] = { w: this.el[id].offsetWidth, h: this.el[id].offsetHeight };
  }

  /* ------------------------------------------------------------ Zeichnen */

  private randPunkt(id: Schluessel, ux: number, uy: number): P {
    const c = this.cur[id];
    const g = this.groesse[id] ?? { w: 10, h: 10 };
    const s = this.skal(id);
    const hw = (g.w * s) / 2 + 5;
    const hh = (g.h * s) / 2 + 5;
    const t = Math.min(ux ? hw / Math.abs(ux) : 1e9, uy ? hh / Math.abs(uy) : 1e9);
    return { x: c.x + ux * t, y: c.y + uy * t };
  }

  private linienListe(): Linie[] {
    const L: Linie[] = this.D.themen.map((t) => ({ a: MITTE, b: alsThema(t.id), art: "stamm", ton: t.farbe }));
    if (this.stufe === "lage") {
      // In der Lage gibt es keine Schritte — nur, welches Thema welches aufhält.
      const paare = new Map<string, Linie>();
      for (const v of this.D.verbindungen) {
        const a = this.g.schritt(v.von);
        const b = this.g.schritt(v.nach);
        if (a && b && a.thema !== null && b.thema !== null && a.thema !== b.thema && a.status !== "erledigt")
          paare.set(`${a.thema}>${b.thema}`, {
            a: alsThema(a.thema), b: alsThema(b.thema), art: "kreuz", pfeil: true, text: "hält auf",
          });
      }
      return L.concat([...paare.values()]);
    }
    for (const s of this.D.schritte) {
      if (!this.g.vor(s.id).some((v) => this.g.schritt(v)?.thema === s.thema))
        L.push({ a: nabeVon(s), b: alsSchritt(s.id), art: "ast", ton: s.thema !== null ? this.g.thema(s.thema)?.farbe : 0 });
    }
    for (const v of this.D.verbindungen) {
      const a = this.g.schritt(v.von);
      const b = this.g.schritt(v.nach);
      if (!a || !b) continue;
      L.push({
        a: alsSchritt(v.von),
        b: alsSchritt(v.nach),
        verbindung: v.id,
        art: a.status === "erledigt" ? "erfuellt" : a.thema !== b.thema ? "kreuz" : "folgt",
        text: v.text,
        pfeil: true,
      });
    }
    return L;
  }

  private rechteck(id: Schluessel): Rechteck | null {
    const c = this.cur[id];
    const g = this.groesse[id];
    if (!c || !g) return null;
    const s = this.skal(id);
    return { x: c.x, y: c.y, w: (g.w * s) / 2, h: (g.h * s) / 2 };
  }

  /**
   * Bewegt sich etwas, gilt die schnelle Führung, und der nächste Takt sieht
   * nach, ob es ruht. Ruht es, rechnet der Wegsucher einmal und merkt sich
   * das Ergebnis, bis sich wieder etwas bewegt.
   */
  private fuehreLinien(liste: Linie[]) {
    const kacheln: Record<string, Rechteck> = {};
    const hindernisse: Rechteck[] = [];
    for (const id of this.alleIds()) {
      if (this.stufe === "lage" && istSchritt(id)) continue;
      const r = this.rechteck(id);
      if (!r) continue;
      kacheln[id] = r;
      hindernisse.push(r);
    }
    const kennung = (L: Linie) => `${L.a}>${L.b}`;
    const key =
      Object.entries(kacheln)
        .map(([id, r]) => `${id}${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`)
        .join(";") +
      "|" +
      liste.map(kennung).join();
    const ruht = key === this.routenKey;
    this.routenKey = key;
    if (ruht && this.routenFein) {
      for (const L of liste) L.pts = this.routenFein.get(kennung(L)) ?? null;
      return;
    }
    const pfeile = liste.map((L) => ({ a: L.a, b: L.b }));
    if (!ruht) {
      this.routenFein = null;
      fuehre(pfeile, kacheln).forEach((pts, i) => (liste[i].pts = pts));
      this.dirty = true;
      return;
    }
    fuehre(pfeile, kacheln, true, hindernisse).forEach((pts, i) => (liste[i].pts = pts));
    this.routenFein = new Map(liste.map((L) => [kennung(L), L.pts ?? null]));
  }

  private pfad(L: Linie, fokus: Set<Schluessel> | null) {
    const pts = L.pts;
    if (!pts || pts.length < 2) return "";
    const k = this.cam.k;
    const p1 = pts[0];
    const p2 = pts[pts.length - 1];
    const vorl = pts[pts.length - 2];
    const tl = Math.hypot(p2.x - vorl.x, p2.y - vorl.y) || 1;
    const tan = { x: (p2.x - vorl.x) / tl, y: (p2.y - vorl.y) / tl };
    // Die Beschriftung sitzt auf dem längsten Stück.
    let m1 = pts[0];
    let m2 = pts[1];
    for (let i = 1; i < pts.length - 1; i++)
      if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) > Math.hypot(m2.x - m1.x, m2.y - m1.y)) {
        m1 = pts[i];
        m2 = pts[i + 1];
      }
    const mid = { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 };
    const d = "M" + pts.map((q) => `${q.x},${q.y}`).join("L");
    const gew = L.verbindung !== undefined && L.verbindung === this.selKante ? " lk-gewaehlt" : "";
    const leise = !gew && fokus && !(fokus.has(L.a) && fokus.has(L.b)) ? " lk-leise" : "";
    const stil = L.ton !== undefined ? ` style="--t:${L.ton ? `var(--t${L.ton})` : "var(--text-sehr-leise)"}"` : "";
    let s = `<path class="lk-l lk-l-${L.art}${leise}${gew}"${stil} d="${d}"/>`;
    if (L.pfeil) {
      const a = klemme((gew ? 11 : 9) / k, 6, 34);
      const nx = -tan.y;
      const ny = tan.x;
      const bx = p2.x - tan.x * a;
      const by = p2.y - tan.y * a;
      s += `<path class="lk-lp-${L.art}${leise}${gew}" d="M${p2.x},${p2.y}L${bx + nx * a * 0.5},${by + ny * a * 0.5}L${bx - nx * a * 0.5},${by - ny * a * 0.5}Z"/>`;
    }
    if (L.verbindung !== undefined && L.verbindung !== NEU) {
      this.mitten[L.verbindung] = mid;
      s += `<path class="lk-l-treffer" data-kante="${L.verbindung}" d="${d}"/>`;
      if (gew && this.darf.bearbeiten) {
        const rr = klemme(7 / k, 5, 24);
        s += `<circle class="lk-l-ende" data-ende="von" cx="${p1.x}" cy="${p1.y}" r="${rr}"/><circle class="lk-l-ende" data-ende="nach" cx="${p2.x}" cy="${p2.y}" r="${rr}"/>`;
      }
    }
    const fs = klemme(11.5 / k, 11, 40);
    // Beschriftung nur, wo sie zwischen die Kacheln passt — sonst liegt sie auf einer.
    if (L.text && !(gew && this.etikettOffen) && (gew || Math.hypot(m2.x - m1.x, m2.y - m1.y) > L.text.length * fs * 0.62 + 16))
      s += `<text class="lk-lt${L.art === "kreuz" ? " lk-lt-kreuz" : ""}${leise}" x="${mid.x}" y="${mid.y - fs * 0.5}" font-size="${fs}" stroke-width="${fs * 0.35}" text-anchor="middle">${esc(L.text)}</text>`;
    return s;
  }

  /** Was beim Wählen hell bleibt: die ganze Kette davor und danach, samt ihren Themen. */
  private kette(id: Schluessel | null): Set<Schluessel> | null {
    if (!id || id === MITTE || this.stufe === "lage" || !this.objekt(id)) return null;
    const s = new Set<Schluessel>([id, MITTE]);
    if (istThema(id)) {
      const th = nummer(id);
      this.D.schritte.filter((x) => x.thema === th).forEach((x) => s.add(alsSchritt(x.id)));
      return s;
    }
    for (const f of [this.g.vor, this.g.nach]) {
      const stapel = [nummer(id)];
      const gesehen = new Set<number>();
      while (stapel.length)
        for (const v of f(stapel.pop()!))
          if (!gesehen.has(v)) {
            gesehen.add(v);
            s.add(alsSchritt(v));
            stapel.push(v);
          }
    }
    for (const x of [...s]) {
      const o = istSchritt(x) ? this.g.schritt(nummer(x)) : undefined;
      if (o) s.add(nabeVon(o));
    }
    return s;
  }

  private zeichne() {
    const { cam } = this;
    this.welt.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.k})`;
    let r = 24;
    while (r * cam.k < 16) r *= 2;
    this.raster.style.backgroundSize = `${r * cam.k}px ${r * cam.k}px`;
    this.raster.style.backgroundPosition = `${cam.x}px ${cam.y}px`;

    const kg = this.selKante !== null && this.stufe !== "lage" ? this.kante(this.selKante) : undefined;
    const fokus = kg
      ? new Set<Schluessel>([
          alsSchritt(kg.von), alsSchritt(kg.nach), MITTE,
          ...[this.g.schritt(kg.von), this.g.schritt(kg.nach)].filter((x): x is Lageschritt => !!x).map(nabeVon),
        ])
      : this.kette(this.sel ?? this.schwebt);
    for (const id in this.el) {
      const e = this.el[id];
      const c = this.cur[id];
      if (!c) continue;
      e.style.left = c.x + "px";
      e.style.top = c.y + "px";
      if (id === MITTE || istThema(id)) e.style.setProperty("--g", String(this.skal(id)));
      e.classList.toggle("lk-leise", !!fokus && !fokus.has(id));
      e.classList.toggle("lk-gewaehlt", id === this.sel);
    }
    const m = this.modus;
    const umh = m?.art === "umhaengen" && m.bewegt ? m : null;
    const liste = this.linienListe().filter((L) => !(umh && L.verbindung === umh.verbindung));
    this.fuehreLinien(liste);
    let svg = liste.map((L) => this.pfad(L, fokus)).join("");

    if (umh && umh.px !== undefined && umh.py !== undefined) {
      // Das feste Ende bleibt, das gegriffene folgt dem Zeiger.
      const v = this.kante(umh.verbindung)!;
      const fest = alsSchritt(umh.ende === "nach" ? v.von : v.nach);
      const c = this.cur[fest];
      const dx = umh.px - c.x;
      const dy = umh.py - c.y;
      const l = Math.hypot(dx, dy) || 1;
      const p = this.randPunkt(fest, dx / l, dy / l);
      const zeiger = { x: umh.px, y: umh.py };
      const [a, b] = umh.ende === "nach" ? [p, zeiger] : [zeiger, p];
      const lab = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tx = (b.x - a.x) / lab;
      const ty = (b.y - a.y) / lab;
      const s2 = klemme(11 / cam.k, 6, 34);
      svg += `<path class="lk-l lk-l-neu" d="M${a.x},${a.y}L${b.x},${b.y}"/><path class="lk-lp-neu" d="M${b.x},${b.y}L${b.x - tx * s2 - ty * s2 * 0.5},${b.y - ty * s2 + tx * s2 * 0.5}L${b.x - tx * s2 + ty * s2 * 0.5},${b.y - ty * s2 - tx * s2 * 0.5}Z"/>`;
    }
    if (m?.art === "verbinden" && m.px !== undefined && m.py !== undefined) {
      const von = alsSchritt(m.von);
      const c = this.cur[von];
      const dx = m.px - c.x;
      const dy = m.py - c.y;
      const l = Math.hypot(dx, dy) || 1;
      const p = this.randPunkt(von, dx / l, dy / l);
      svg += `<path class="lk-l lk-l-neu" d="M${p.x},${p.y}L${m.px},${m.py}"/>`;
    }
    this.linien.innerHTML = svg;

    const mitte = this.selKante !== null ? this.mitten[this.selKante] : undefined;
    const zeigen = this.etikettOffen && !!mitte && !!kg && !umh;
    this.etikett.hidden = !zeigen;
    if (zeigen && mitte) {
      // Am Pfeil, aber nie halb aus der Bühne hinaus.
      const r2 = this.flaeche();
      const hw = this.etikett.offsetWidth / 2 + 8;
      const hh = this.etikett.offsetHeight / 2 + 8;
      this.etikett.style.left = klemme(mitte.x * cam.k + cam.x, hw, r2.width - hw) + "px";
      this.etikett.style.top = klemme(mitte.y * cam.k + cam.y, hh + 56, r2.height - hh) + "px";
      if (this.etikettFokus) {
        this.etikettFokus = false;
        this.etikettFeld.focus();
        this.etikettFeld.select();
      }
    }
    this.zeichneKlein();
  }

  private zeichneKlein() {
    const klein = this.klein;
    if (klein.offsetParent === null) return;
    const ids = this.alleIds().filter((id) => this.stufe !== "lage" || !istSchritt(id));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id of ids) {
      const r = this.rechteck(id);
      if (!r) continue;
      x0 = Math.min(x0, r.x - r.w);
      x1 = Math.max(x1, r.x + r.w);
      y0 = Math.min(y0, r.y - r.h);
      y1 = Math.max(y1, r.y + r.h);
    }
    const rand = 120;
    x0 -= rand; y0 -= rand; x1 += rand; y1 += rand;
    const W = klein.clientWidth;
    const H = klein.clientHeight;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0));
    this.kleinMass = { x0, y0, s, ox: (W - (x1 - x0) * s) / 2, oy: (H - (y1 - y0) * s) / 2 };
    const b = this.buehne.getBoundingClientRect();
    const { cam } = this;
    const teile = ids
      .map((id) => {
        const r = this.rechteck(id);
        if (!r) return "";
        const ton = (th: number | null | undefined) => (th != null ? this.g.thema(th)?.farbe : undefined);
        const f =
          id === MITTE
            ? "var(--kopf-grund)"
            : istThema(id)
              ? `var(--t${ton(nummer(id))})`
              : ton(this.g.schritt(nummer(id))?.thema)
                ? `var(--t${ton(this.g.schritt(nummer(id))?.thema)})`
                : "var(--rand-stark)";
        return `<rect x="${r.x - r.w}" y="${r.y - r.h}" width="${r.w * 2}" height="${r.h * 2}" fill="${f}" opacity="${istSchritt(id) ? 0.55 : 1}"/>`;
      })
      .join("");
    const km = this.kleinMass;
    klein.innerHTML = `<svg viewBox="${x0 - km.ox / s} ${y0 - km.oy / s} ${W / s} ${H / s}">${teile}<rect class="lk-fenster" x="${-cam.x / cam.k}" y="${-cam.y / cam.k}" width="${b.width / cam.k}" height="${b.height / cam.k}"/></svg>`;
  }

  /** Ein Takt: Kamera gleitet, Kacheln gleiten, gezeichnet wird nur bei Bedarf. */
  private schritt = () => {
    const { cam } = this;
    if (this.camZiel) {
      const a = 0.16;
      const z = this.camZiel;
      cam.x += (z.x - cam.x) * a;
      cam.y += (z.y - cam.y) * a;
      cam.k += (z.k - cam.k) * a;
      if (Math.abs(z.x - cam.x) < 0.5 && Math.abs(z.y - cam.y) < 0.5 && Math.abs(z.k - cam.k) < 0.001) {
        Object.assign(cam, z);
        this.camZiel = null;
      }
      this.dirty = true;
    }
    const s: Stufe = cam.k < 0.6 ? "lage" : cam.k < 1.15 ? "karte" : "detail";
    if (s !== this.stufe) {
      this.stufe = s;
      this.buehne.dataset.stufe = s;
      this.messen();
      this.dirty = true;
      this.e.stufe(s);
    }
    for (const id of this.alleIds()) {
      const z = this.zielPos(id);
      const c = this.cur[id] ?? (this.cur[id] = { ...z });
      const dx = z.x - c.x;
      const dy = z.y - c.y;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        c.x += dx * 0.17;
        c.y += dy * 0.17;
        this.dirty = true;
      } else {
        c.x = z.x;
        c.y = z.y;
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.zeichne();
    }
    this.takt = requestAnimationFrame(this.schritt);
  };

  /** Beim ersten Stand: erst weit draußen, dann gleitet die Lage herein. */
  private anflug() {
    this.zurLage(true);
    const ziel = { ...this.cam };
    const r = this.flaeche();
    this.cam.k = ziel.k * 0.55;
    this.cam.x = r.width / 2 - (r.width / 2 - ziel.x) * 0.55;
    this.cam.y = r.height / 2 - (r.height / 2 - ziel.y) * 0.55;
    this.camZiel = ziel;
    for (const id of this.alleIds()) this.cur[id] = { ...this.zielPos(id) };
    cancelAnimationFrame(this.takt);
    this.takt = requestAnimationFrame(this.schritt);
  }

  /* -------------------------------------------------------------- Kamera */

  private flaeche() {
    return this.buehne.getBoundingClientRect();
  }

  private zoomUm(sx: number, sy: number, f: number) {
    const { cam } = this;
    const k2 = klemme(cam.k * f, 0.12, 2.4);
    cam.x = sx - (sx - cam.x) * (k2 / cam.k);
    cam.y = sy - (sy - cam.y) * (k2 / cam.k);
    cam.k = k2;
    this.dirty = true;
  }

  /**
   * Was oben und unten von den Werkzeugleisten belegt ist — gemessen, nicht
   * angenommen: Am Handy steht das Fangfeld in einer eigenen Zeile, und unten
   * liegt zusätzlich das Blatt der Seitenspalte.
   */
  private rahmen() {
    const r = this.flaeche();
    const oben = this.buehne.querySelector(".lk-oben")?.getBoundingClientRect();
    const unten = this.buehne.querySelector(".lk-unten")?.getBoundingClientRect();
    return {
      r,
      oben: oben && oben.height ? oben.bottom - r.top + 8 : 64,
      unten: unten && unten.height ? r.bottom - unten.top + 8 : 64,
    };
  }

  private blende(ids: Schluessel[], kMin: number, kMax: number, rand = 80) {
    const { r, oben, unten } = this.rahmen();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id of ids) {
      const p = this.grundPos(id);
      const g = this.groesse[id] ?? { w: 200, h: 60 };
      x0 = Math.min(x0, p.x - g.w / 2);
      x1 = Math.max(x1, p.x + g.w / 2);
      y0 = Math.min(y0, p.y - g.h / 2);
      y1 = Math.max(y1, p.y + g.h / 2);
    }
    const hoehe = r.height - oben - unten;
    const k = klemme(Math.min((r.width - 2 * rand) / (x1 - x0), (hoehe - rand) / (y1 - y0)), kMin, kMax);
    this.camZiel = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: oben + hoehe / 2 - ((y0 + y1) / 2) * k };
  }

  private fliegeZu(id: Schluessel, k?: number) {
    const { r, oben, unten } = this.rahmen();
    const p = this.grundPos(id);
    const kk = k ?? Math.max(this.cam.k, 0.8);
    this.camZiel = { k: kk, x: r.width / 2 - p.x * kk, y: oben + (r.height - oben - unten) / 2 - p.y * kk };
  }

  /** Nur hinfliegen, wenn die Kachel am Rand oder draußen liegt. */
  private insBild(id: Schluessel) {
    const r = this.flaeche();
    const q = this.grundPos(id);
    const sx = q.x * this.cam.k + this.cam.x;
    const sy = q.y * this.cam.k + this.cam.y;
    if (sx < 60 || sy < 90 || sx > r.width - 60 || sy > r.height - 90) this.fliegeZu(id);
  }

  /* ---------------------------------------------------------- Handlungen */

  private waehleIntern(id: Schluessel | null) {
    this.selKante = null;
    this.etikettOffen = false;
    this.sel = id === MITTE ? null : id;
    this.dirty = true;
    this.e.auswahl(this.auswahlVon(this.sel));
  }

  private auswahlVon(k: Schluessel | null): Auswahl {
    if (!k || nummer(k) === NEU) return null;
    return istThema(k) ? { art: "thema", id: nummer(k) } : istSchritt(k) ? { art: "schritt", id: nummer(k) } : null;
  }

  private waehleKante(id: number, etikett: boolean) {
    this.selKante = id;
    this.sel = null;
    this.etikettOffen = etikett && this.darf.bearbeiten;
    this.etikettFeld.value = this.kante(id)?.text ?? "";
    this.etikettFokus = this.etikettOffen;
    this.dirty = true;
    this.e.auswahl({ art: "verbindung", id });
  }

  private schliesseEtikett(speichern: boolean) {
    if (!this.etikettOffen) return;
    this.etikettOffen = false;
    const v = this.selKante !== null ? this.kante(this.selKante) : undefined;
    const text = this.etikettFeld.value.trim();
    if (speichern && v && text !== v.text) this.e.beschriften(v.id, text);
    this.etikettFeld.blur();
    this.dirty = true;
  }

  private umschalten(id: number) {
    const s = this.g.schritt(id);
    if (!s) return;
    this.e.umschalten(id);
    this.melde(`${s.titel}: ${s.status === "erledigt" ? "wieder offen" : "erledigt"}`);
  }

  private naechsterSchritt(k: Schluessel | null) {
    if (!k || k === MITTE) return this.neuerSchritt({});
    if (istThema(k)) return this.neuerSchritt({ thema: nummer(k) });
    this.neuerSchritt({ nach: nummer(k) });
  }

  private async verbinde(von: number, nach: number) {
    const hindernis = verbindungsHindernis(this.g, von, nach);
    if (hindernis) return this.melde(hindernis);
    const id = await this.e.verbinden(von, nach);
    // Gleich beschriften können — leer lassen geht auch.
    if (id !== null) this.waehleKante(id, true);
    const a = this.g.schritt(von);
    const b = this.g.schritt(nach);
    if (id !== null && a && b) this.melde(`„${b.titel}“ hängt jetzt an „${a.titel}“`);
  }

  private haengeUm(verbindung: number, ende: "von" | "nach", ziel: number) {
    const v = this.kante(verbindung);
    if (!v) return;
    const [von, nach] = ende === "nach" ? [v.von, ziel] : [ziel, v.nach];
    const hindernis = verbindungsHindernis(this.g, von, nach, verbindung);
    if (hindernis) return this.melde(hindernis);
    this.e.umhaengen(verbindung, von, nach);
    const a = this.g.schritt(von);
    const b = this.g.schritt(nach);
    if (a && b) this.melde(`„${b.titel}“ hängt jetzt an „${a.titel}“`);
  }

  private ordneZu(id: number, ziel: Schluessel) {
    const s = this.g.schritt(id);
    if (!s) return;
    const th = ziel === MITTE ? null : nummer(ziel);
    if (s.thema === th) {
      this.e.verschieben({ themen: [], schritte: [{ id, x: s.x, y: s.y }] });
      return;
    }
    const p = platzFuer({ ...this.D, schritte: this.D.schritte.filter((x) => x.id !== id) }, { thema: th });
    s.thema = th;
    s.x = p.x;
    s.y = p.y;
    this.e.zuordnen(id, th, p);
    this.melde(th !== null ? `Zu „${this.g.thema(th)?.name}“ gelegt` : "Wieder lose");
  }

  /** Der Titel direkt an der Kachel. Ein neuer Gedanke ohne Titel verschwindet wieder. */
  private bearbeite(k: Schluessel) {
    if (!this.darf.bearbeiten) return;
    const e = this.el[k];
    const t = e?.querySelector<HTMLElement>(".lk-k-titel, .lk-hub-name");
    if (!t) return;
    this.bearbeitet = true;
    t.contentEditable = "true";
    t.focus();
    const bereich = document.createRange();
    bereich.selectNodeContents(t);
    const auswahl = getSelection();
    auswahl?.removeAllRanges();
    auswahl?.addRange(bereich);
    let fertig = false;

    const ende = async (ok: boolean, weiter = false) => {
      if (fertig) return;
      fertig = true;
      t.contentEditable = "false";
      this.bearbeitet = false;
      const text = (t.textContent ?? "").trim();
      const id = nummer(k);
      const thema = istThema(k);

      if (id === NEU) {
        const entwurf = this.entwurf;
        if (!ok || !text || !entwurf) {
          this.verwirfEntwurf();
          return this.nachholen();
        }
        const neueId = thema
          ? await this.e.themaAnlegen({ name: text, farbe: entwurf.thema!.farbe, x: entwurf.thema!.x, y: entwurf.thema!.y })
          : await this.e.anlegen({
              titel: text,
              thema: entwurf.schritt!.thema,
              x: entwurf.schritt!.x,
              y: entwurf.schritt!.y,
              haengt_an: entwurf.verbindung?.von ?? null,
            });
        if (this.entwurf === entwurf) {
          const alt = this.cur[k];
          this.verwirfEntwurf();
          if (neueId !== null) {
            const nk = thema ? alsThema(neueId) : alsSchritt(neueId);
            if (alt) this.cur[nk] = alt;
            this.sel = nk;
            this.erwartet = nk;
            this.e.auswahl(this.auswahlVon(nk));
          }
        }
        this.nachholen();
        if (weiter && neueId !== null) this.naechsterSchritt(thema ? alsThema(neueId) : alsSchritt(neueId));
        return;
      }

      const o = this.objekt(k);
      const alt = o ? ("name" in o ? o.name : o.titel) : "";
      if (ok && text && text !== alt) this.e.umbenennen({ art: thema ? "thema" : "schritt", id }, text);
      else t.textContent = alt;
      this.nachholen();
      if (weiter) this.naechsterSchritt(k);
    };

    t.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        void ende(true);
      } else if (ev.key === "Escape") void ende(false);
      else if (ev.key === "Tab") {
        ev.preventDefault();
        void ende(true, true);
      }
    });
    t.addEventListener("input", () => {
      this.messen();
      this.dirty = true;
    });
    t.addEventListener("blur", () => void ende(true), { once: true });
  }

  /** Was während des Ziehens oder Schreibens vom Server kam, jetzt einlesen. */
  private nachholen() {
    const w = this.wartend;
    this.wartend = null;
    if (w) this.server = w;
    this.aktualisiere();
  }

  /* -------------------------------------------------------------- Zeiger */

  private weltPunkt(ev: { clientX: number; clientY: number }): P {
    const r = this.flaeche();
    return { x: (ev.clientX - r.left - this.cam.x) / this.cam.k, y: (ev.clientY - r.top - this.cam.y) / this.cam.k };
  }

  private lauschen() {
    const b = this.buehne;
    const an = <K extends keyof HTMLElementEventMap>(
      ziel: HTMLElement | Document | Window,
      art: K,
      f: (ev: HTMLElementEventMap[K]) => void,
      opt?: AddEventListenerOptions,
    ) => {
      ziel.addEventListener(art, f as EventListener, opt);
      this.aufraeumen.push(() => ziel.removeEventListener(art, f as EventListener, opt));
    };
    const ausserhalb = (t: EventTarget | null) =>
      !(t instanceof Element) || !!t.closest(".lk-schwebe, .lk-klein, .lk-etikett") || (t as HTMLElement).isContentEditable;

    an(b, "pointerdown", (ev) => {
      if (ausserhalb(ev.target)) return;
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      try {
        b.setPointerCapture(ev.pointerId);
      } catch {
        /* Zeiger schon weg */
      }
      this.zeiger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.zeiger.size === 2) {
        const [p, q] = [...this.zeiger.values()];
        b.querySelectorAll(".lk-gezogen").forEach((x) => x.classList.remove("lk-gezogen"));
        this.modus = { art: "pinch", d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
        return;
      }
      this.camZiel = null;
      const t = ev.target as Element;
      const id = t.closest<HTMLElement>("[data-id]")?.dataset.id;
      const ende = t.closest<SVGElement>("[data-ende]");
      const treffer = t.closest<SVGElement>("[data-kante]");
      if (ende && this.selKante !== null) {
        this.modus = { art: "umhaengen", verbindung: this.selKante, ende: ende.dataset.ende as "von" | "nach", x0: ev.clientX, y0: ev.clientY, bewegt: false };
        return;
      }
      if (treffer) {
        // Wer den Pfeil greift, greift das Ende, dem er näher ist.
        const v = this.kante(Number(treffer.dataset.kante));
        if (!v) return;
        const w = this.weltPunkt(ev);
        const cv = this.cur[alsSchritt(v.von)];
        const cn = this.cur[alsSchritt(v.nach)];
        const naeher = Math.hypot(w.x - cv.x, w.y - cv.y) < Math.hypot(w.x - cn.x, w.y - cn.y) ? "von" : "nach";
        this.modus = { art: "umhaengen", verbindung: v.id, ende: naeher, x0: ev.clientX, y0: ev.clientY, bewegt: false };
        return;
      }
      if (id && istSchritt(id) && t.closest(".lk-k-griff") && this.darf.bearbeiten) {
        this.modus = { art: "verbinden", von: nummer(id), x0: ev.clientX, y0: ev.clientY };
        return;
      }
      if (id && id !== MITTE) {
        const o = this.objekt(id);
        if (!o) return;
        this.modus = {
          art: "knoten", id, x0: ev.clientX, y0: ev.clientY, bewegt: false,
          punkt: !!t.closest(".lk-k-punkt"),
          start: {
            x: o.x, y: o.y,
            kinder: istThema(id) ? this.D.schritte.filter((s) => s.thema === o.id).map((s) => [s, s.x, s.y]) : [],
          },
        };
        return;
      }
      this.modus = { art: "pan", x0: ev.clientX, y0: ev.clientY, cx: this.cam.x, cy: this.cam.y, bewegt: false };
      b.classList.add("lk-zieht");
    });

    an(b, "pointermove", (ev) => {
      if (!this.zeiger.has(ev.pointerId)) {
        const h = (ev.target as Element).closest?.<HTMLElement>(".lk-k")?.dataset.id ?? null;
        if (h !== this.schwebt) {
          this.schwebt = h;
          this.dirty = true;
        }
        return;
      }
      this.zeiger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const m = this.modus;
      if (!m) return;
      const r = this.flaeche();
      if (m.art === "pinch") {
        if (this.zeiger.size < 2) return;
        const [p, q] = [...this.zeiger.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        this.zoomUm(mx - r.left, my - r.top, d / m.d);
        this.cam.x += mx - m.mx;
        this.cam.y += my - m.my;
        Object.assign(m, { d, mx, my });
        return;
      }
      const dx = ev.clientX - m.x0;
      const dy = ev.clientY - m.y0;
      if (m.art !== "verbinden") {
        if (!m.bewegt && Math.hypot(dx, dy) > 4) m.bewegt = true;
        if (!m.bewegt) return;
      }
      // In den Strängen ordnet die Karte selbst; wer nicht schreiben darf,
      // verschiebt nichts — in beiden Fällen schwenkt das Ziehen.
      if (m.art === "knoten" && (this.ansicht !== "stern" || !this.darf.bearbeiten)) {
        this.modus = { art: "pan", x0: ev.clientX, y0: ev.clientY, cx: this.cam.x, cy: this.cam.y, bewegt: true };
        b.classList.add("lk-zieht");
        return;
      }
      if (m.art === "umhaengen" && !this.darf.bearbeiten) return;
      if (m.art === "pan") {
        this.cam.x = m.cx + dx;
        this.cam.y = m.cy + dy;
        this.dirty = true;
      } else if (m.art === "knoten") {
        const o = this.objekt(m.id);
        if (!o) return;
        // Einrasten: liegen zwei Kacheln auf derselben Rasterzeile, läuft der Pfeil gerade.
        const rx = aufRaster(m.start.x + dx / this.cam.k) - m.start.x;
        const ry = aufRaster(m.start.y + dy / this.cam.k) - m.start.y;
        o.x = m.start.x + rx;
        o.y = m.start.y + ry;
        for (const [s, x, y] of m.start.kinder) {
          s.x = x + rx;
          s.y = y + ry;
          this.cur[alsSchritt(s.id)] = this.zielPos(alsSchritt(s.id));
        }
        this.cur[m.id] = this.zielPos(m.id);
        if (istSchritt(m.id)) {
          this.el[m.id]?.classList.add("lk-gezogen");
          const u = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".lk-hub, .lk-mitte");
          b.querySelectorAll(".lk-ziel").forEach((x) => x !== u && x.classList.remove("lk-ziel"));
          u?.classList.add("lk-ziel");
          m.ziel = u?.dataset.id;
        }
        this.dirty = true;
      } else if (m.art === "umhaengen" || m.art === "verbinden") {
        const v = m.art === "umhaengen" ? this.kante(m.verbindung) : undefined;
        if (m.art === "umhaengen" && !v) return;
        if (m.art === "umhaengen" && this.selKante !== m.verbindung) this.waehleKante(m.verbindung, false);
        const w = this.weltPunkt(ev);
        m.px = w.x;
        m.py = w.y;
        const fest = m.art === "umhaengen" ? (m.ende === "nach" ? v!.von : v!.nach) : m.von;
        const u = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".lk-k");
        const z = u && u.dataset.id && nummer(u.dataset.id) !== fest && nummer(u.dataset.id) !== NEU ? nummer(u.dataset.id) : null;
        b.querySelectorAll(".lk-k.lk-ziel").forEach((x) => (x as HTMLElement).dataset.id !== (z !== null ? alsSchritt(z) : "") && x.classList.remove("lk-ziel"));
        if (z !== null) this.el[alsSchritt(z)]?.classList.add("lk-ziel");
        m.ziel = z;
        this.dirty = true;
      }
    });

    const zeigerEnde = (ev: PointerEvent) => {
      this.zeiger.delete(ev.pointerId);
      b.classList.remove("lk-zieht");
      const m = this.modus;
      if (!m) return;
      this.modus = null;
      b.querySelectorAll(".lk-ziel, .lk-gezogen").forEach((x) => x.classList.remove("lk-ziel", "lk-gezogen"));
      if (m.art === "pan" && !m.bewegt) this.waehleIntern(null);
      else if (m.art === "knoten") {
        if (!m.bewegt) {
          if (m.punkt && istSchritt(m.id) && this.darf.bearbeiten) this.umschalten(nummer(m.id));
          else if (istThema(m.id) && this.stufe === "lage") this.themaFokus(nummer(m.id));
          else this.waehleIntern(m.id);
        } else if (nummer(m.id) === NEU) {
          // Ein Entwurf ohne Titel wird nicht gespeichert — auch nicht seine Lage.
        } else if (istSchritt(m.id) && m.ziel) this.ordneZu(nummer(m.id), m.ziel);
        else {
          const o = this.objekt(m.id)!;
          this.e.verschieben(
            istThema(m.id)
              ? { themen: [{ id: o.id, x: o.x, y: o.y }], schritte: m.start.kinder.map(([s]) => ({ id: s.id, x: s.x, y: s.y })) }
              : { themen: [], schritte: [{ id: o.id, x: o.x, y: o.y }] },
          );
        }
      } else if (m.art === "umhaengen") {
        const v = this.kante(m.verbindung);
        if (!m.bewegt) this.waehleKante(m.verbindung, true);
        else if (v && m.ziel != null && m.ziel !== (m.ende === "nach" ? v.nach : v.von)) this.haengeUm(m.verbindung, m.ende, m.ziel);
      } else if (m.art === "verbinden" && m.ziel != null) void this.verbinde(m.von, m.ziel);
      this.dirty = true;
      if (this.wartend) this.nachholen();
    };
    an(b, "pointerup", zeigerEnde);
    an(b, "pointercancel", zeigerEnde);

    an(b, "dblclick", (ev) => {
      if (!this.darf.bearbeiten) return;
      const t = ev.target as Element;
      if (ausserhalb(t) || t.closest("[data-kante], [data-ende]")) return;
      const id = t.closest<HTMLElement>("[data-id]")?.dataset.id;
      if (id && id !== MITTE) return this.bearbeite(id);
      if (this.ansicht !== "stern" || this.stufe === "lage") return this.neuerSchritt({});
      const p = this.weltPunkt(ev);
      const q = { x: Math.round(p.x), y: Math.round(p.y) };
      // Das nächste Thema in Reichweite nimmt den Gedanken auf; sonst bleibt er lose.
      let th: number | null = null;
      let best = 700;
      for (const x of this.D.themen) {
        const d = Math.hypot(x.x - q.x, x.y - q.y);
        if (d < best) {
          best = d;
          th = x.id;
        }
      }
      this.neuerSchritt({ thema: th, bei: belegt(this.D, q) ? null : q });
    });

    an(
      b,
      "wheel",
      (ev) => {
        if (ausserhalb(ev.target) && !(ev.target as Element).closest?.(".lk-klein")) return;
        ev.preventDefault();
        this.camZiel = null;
        const r = this.flaeche();
        // Senkrecht zoomt immer, auch ohne Taste. Ein Mausrad am Mac liefert
        // geglättete Pixel wie ein Trackpad; die Unterscheidung daran riet oft
        // falsch, und dann rollte die Karte weg, statt zu zoomen. Geschwenkt
        // wird durch Ziehen auf der Fläche; waagrecht (Trackpad) schwenkt.
        const zeilen = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? r.height : 1;
        const tempo = ev.ctrlKey || ev.metaKey ? 0.01 : 0.0016;
        if (ev.deltaY) this.zoomUm(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * zeilen * tempo));
        if (ev.deltaX && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
          this.cam.x -= ev.deltaX * zeilen;
          this.dirty = true;
        }
      },
      { passive: false },
    );

    an(this.klein, "pointerdown", (ev) => {
      if (!this.kleinMass) return;
      const rr = this.klein.getBoundingClientRect();
      const m = this.kleinMass;
      const wx = (ev.clientX - rr.left - m.ox) / m.s + m.x0;
      const wy = (ev.clientY - rr.top - m.oy) / m.s + m.y0;
      const r = this.flaeche();
      this.camZiel = { k: this.cam.k, x: r.width / 2 - wx * this.cam.k, y: r.height / 2 - wy * this.cam.k };
    });

    an(this.etikettFeld, "keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.schliesseEtikett(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this.schliesseEtikett(false);
      }
    });
    an(this.etikettFeld, "blur", () => this.schliesseEtikett(true));

    an(document, "keydown", (ev) => {
      const t = ev.target as Element | null;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".dialog-grund")) return;
      const k = ev.key;
      // Tiefe und Zoom gelten überall — auch gleich nach einem Klick auf „Stränge".
      if (k === "1") return this.zurLage();
      if (k === "2") return this.zurKarte();
      if (k === "3") return this.detail();
      if (k === "+" || k === "=") return this.zoomMitte(1.25);
      if (k === "-") return this.zoomMitte(0.8);
      if (k === "Escape") return this.waehleIntern(null);
      // Tab, Enter, Leertaste und Entf nur, wenn kein Knopf und kein Link den
      // Fokus hat: Sonst nähme Tab der Seitenspalte das Weiterspringen, und
      // Enter auf „Stränge" hakte stattdessen den gewählten Schritt ab.
      const aufKnopf = !!t?.closest?.("button, a");
      if (!(t === document.body || (t && b.contains(t) && !aufKnopf))) return;
      if (k === "Tab" && this.darf.bearbeiten) {
        ev.preventDefault();
        this.naechsterSchritt(this.sel);
      } else if (k === "Enter" && this.sel) {
        ev.preventDefault();
        this.bearbeite(this.sel);
      } else if (k === " " && this.sel && istSchritt(this.sel) && this.darf.bearbeiten) {
        ev.preventDefault();
        this.umschalten(nummer(this.sel));
      } else if ((k === "Backspace" || k === "Delete") && this.selKante !== null && this.darf.loeschen) {
        ev.preventDefault();
        this.e.loesen(this.selKante);
      } else if (k === "Enter" && this.selKante !== null) {
        ev.preventDefault();
        this.waehleKante(this.selKante, true);
      } else if ((k === "Backspace" || k === "Delete") && this.sel && this.darf.loeschen) {
        ev.preventDefault();
        const a = this.auswahlVon(this.sel);
        if (a) this.e.entfernen(a);
      }
    });

    const beobachter = new ResizeObserver(() => (this.dirty = true));
    beobachter.observe(b);
    this.aufraeumen.push(() => beobachter.disconnect());
    this.takt = requestAnimationFrame(this.schritt);
  }
}
