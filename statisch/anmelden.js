/*
 * Das Raster im Hintergrund.
 *
 * Kein Rahmenwerk, keine Bibliothek: Die Seite muss stehen, bevor irgendetwas
 * gebaut ist (siehe Kopf der Datei). Also ein <canvas>, eine Schleife und
 * drei Zustandsgrößen — Zeiger, Wellen, Zeit.
 *
 * Die Farben werden **aus der Palette gelesen**, nicht hier notiert. Sonst
 * stünde ein vierter Satz Farbwerte in der Datei, und der wäre beim nächsten
 * Ändern der Palette als einziger falsch. Beim Wechsel hell/dunkel werden sie
 * neu gelesen.
 */
(function () {
  /* Zuerst die Klasse, dann alles andere: Sie schaltet den Auftritt der
     Karte frei (siehe .belebt im Stil). Ohne Skript bleibt er aus, und das
     Formular steht von Anfang an sichtbar da. */
  document.body.classList.add('belebt');

  var leinwand = document.querySelector('.hintergrund');
  if (!leinwand || !leinwand.getContext) return;
  var ctx = leinwand.getContext('2d');
  if (!ctx) return;

  var ruhe = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- Farben aus der Palette ------------------------------------------- */

  var farben = { grund: [201, 196, 183], marke: [20, 89, 95], akzent: [138, 86, 56] };

  function zerlegen(wert, ersatz) {
    var h = (wert || '').trim();
    if (h.charAt(0) !== '#' || (h.length !== 4 && h.length !== 7)) return ersatz;
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }

  function farbenLesen() {
    var s = getComputedStyle(document.documentElement);
    farben.grund = zerlegen(s.getPropertyValue('--rand-stark'), farben.grund);
    farben.marke = zerlegen(s.getPropertyValue('--marke'), farben.marke);
    farben.akzent = zerlegen(s.getPropertyValue('--wortmarke-o'), farben.akzent);
  }

  function mischen(a, b, k) {
    return 'rgb(' + ((a[0] + (b[0] - a[0]) * k) | 0) + ',' +
                    ((a[1] + (b[1] - a[1]) * k) | 0) + ',' +
                    ((a[2] + (b[2] - a[2]) * k) | 0) + ')';
  }

  /* --- Das Raster -------------------------------------------------------- */

  var zellen = [];
  var breite = 0, hoehe = 0;

  function aufbauen() {
    /* Gemessen wird die Leinwand selbst, nicht `window.innerWidth`. In einem
       Rahmen, der beim Laden noch keine Größe hat, ist innerWidth 0 — das
       Raster wäre dann leer und bliebe es, weil kein resize mehr käme. */
    breite = Math.round(leinwand.clientWidth || window.innerWidth || 0);
    hoehe = Math.round(leinwand.clientHeight || window.innerHeight || 0);
    zellen = [];
    if (breite < 2 || hoehe < 2) return;
    /* Am Handy weiter auseinander: gleich viele Punkte auf kleinerer Fläche
       wären ein Grau, kein Raster. */
    var abstand = breite < 700 ? 34 : 40;
    /* Zwei Pixel je Punkt reichen; mehr kostet am Handy Bilder pro Sekunde. */
    var dichte = Math.min(window.devicePixelRatio || 1, 2);

    leinwand.width = Math.round(breite * dichte);
    leinwand.height = Math.round(hoehe * dichte);
    ctx.setTransform(dichte, 0, 0, dichte, 0, 0);

    for (var x = abstand / 2; x < breite + abstand; x += abstand) {
      for (var y = abstand / 2; y < hoehe + abstand; y += abstand) {
        zellen.push({ x: x, y: y });
      }
    }
  }

  /* --- Zustand ----------------------------------------------------------- */

  var zeiger = { x: -999, y: -999, echt: false };
  var wellen = [];
  var REICHWEITE = 230;

  function welle(x, y, staerke) {
    /* Mehr als ein Dutzend gleichzeitig sieht niemand, kostet aber je Zelle
       eine Runde mehr. Die älteste fällt heraus. */
    if (wellen.length > 11) wellen.shift();
    wellen.push({ x: x, y: y, t0: performance.now() / 1000, staerke: staerke, leben: 2.2 });
  }

  function wellevon(el, staerke) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    welle(r.left + r.width / 2, r.top + r.height / 2, staerke);
  }

  /* --- Zeichnen ---------------------------------------------------------- */

  function bild(t) {
    ctx.clearRect(0, 0, breite, hoehe);

    /* Abgelaufene Wellen fallen weg, bevor über die Zellen gelaufen wird —
       nicht innerhalb der Schleife, sonst geschieht es tausendfach. */
    for (var w = wellen.length - 1; w >= 0; w--) {
      if (t - wellen[w].t0 > wellen[w].leben) wellen.splice(w, 1);
    }

    for (var i = 0; i < zellen.length; i++) {
      var z = zellen[i];

      /* Grundatmen: zwei langsame Wellen über die ganze Fläche, die sich
         überlagern. Eine allein zieht als sichtbarer Streifen durch; zwei
         schiefe ergeben ein Muster, das sich nicht erkennbar wiederholt.
         Was hier ausdrücklich **nicht** steht, ist ein Zufallswert je Zelle:
         damit zappelt jeder Punkt für sich, und aus der Welle wird Rauschen. */
      var e = 0.09
        + 0.075 * Math.sin(z.x * 0.0100 + z.y * 0.0130 - t * 0.50)
        + 0.055 * Math.sin(z.x * 0.0210 - z.y * 0.0080 + t * 0.33);

      var dx = zeiger.x - z.x, dy = zeiger.y - z.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      var zug = 0;
      if (d < REICHWEITE) {
        var f = 1 - d / REICHWEITE;
        f = f * f;
        e += f * 1.05;
        zug = f * 8;
      }

      for (var k = 0; k < wellen.length; k++) {
        var wl = wellen[k];
        var alter = t - wl.t0;
        var wx = wl.x - z.x, wy = wl.y - z.y;
        var wd = Math.sqrt(wx * wx + wy * wy);
        /* 340 Pixel je Sekunde: Bei 1280 Pixeln Breite braucht der Ring
           knapp zwei Sekunden bis zum Rand. Schneller gesehen ist er ein
           Zucken, langsamer ein Kriechen. */
        var band = Math.abs(wd - alter * 340);
        if (band < 100) {
          var g = 1 - band / 100;
          /* Die Wurzel hält den Ring länger auf Kraft und lässt ihn erst
             zum Schluss weg — linear abgezogen ist er nach einem Drittel
             des Weges schon kaum noch da. */
          e += g * g * wl.staerke * Math.sqrt(1 - alter / wl.leben);
        }
      }

      if (e < 0) e = 0; else if (e > 1.2) e = 1.2;

      var seite = 2.4 + e * 8;
      var farbe = e < 0.5
        ? mischen(farben.grund, farben.marke, e / 0.5)
        : mischen(farben.marke, farben.akzent, (e - 0.5) / 0.7);

      ctx.globalAlpha = 0.22 + Math.min(e, 1) * 0.6;
      ctx.fillStyle = farbe;
      /* Zum Zeiger hin gezogen, nicht weggedrückt: Das Raster folgt der Hand,
         statt vor ihr auszuweichen — die Seite wirkt dadurch zugewandt. */
      ctx.fillRect(
        z.x + (dx / d) * zug - seite / 2,
        z.y + (dy / d) * zug - seite / 2,
        seite, seite
      );
    }
    ctx.globalAlpha = 1;
  }

  /* --- Lauf -------------------------------------------------------------- */

  function standbild() {
    zeiger.x = -999; zeiger.y = -999;
    wellen = [];
    bild(0);
  }

  function schleife(jetzt) {
    var t = jetzt / 1000;
    if (!zeiger.echt) {
      /* Solange niemand die Maus bewegt hat — am Handy also immer — wandert
         ein gedachter Zeiger in einer weiten Acht über die Fläche. Ohne das
         stünde das Raster beim ersten Blick fast still. */
      zeiger.x = breite * (0.5 + 0.33 * Math.sin(t * 0.21));
      zeiger.y = hoehe * (0.5 + 0.30 * Math.sin(t * 0.34 + 1.1));
    }
    bild(t);
    requestAnimationFrame(schleife);
  }

  farbenLesen();
  aufbauen();

  var dunkel = window.matchMedia('(prefers-color-scheme: dark)');
  var beiWechsel = function () { farbenLesen(); if (ruhe.matches) standbild(); };
  if (dunkel.addEventListener) dunkel.addEventListener('change', beiWechsel);

  var zeitgeber;
  function neuVermessen() {
    /* Am Handy löst jedes Ein- und Ausblenden der Adressleiste eine Messung
       aus. Das Raster jedesmal neu aufzubauen ruckelt sichtbar. */
    clearTimeout(zeitgeber);
    zeitgeber = setTimeout(function () {
      aufbauen();
      if (ruhe.matches) standbild();
    }, 120);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(neuVermessen).observe(leinwand);
  } else {
    window.addEventListener('resize', neuVermessen);
  }

  if (ruhe.matches) {
    standbild();
    return;
  }

  requestAnimationFrame(schleife);

  window.addEventListener('pointermove', function (e) {
    zeiger.echt = true;
    zeiger.x = e.clientX;
    zeiger.y = e.clientY;
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    welle(e.clientX, e.clientY, 1.2);
  }, { passive: true });

  /* Jeder Anschlag im Formular schickt einen Ring los. Das ist der Punkt, an
     dem der Hintergrund aufhört, Zierde zu sein: Man tippt sein Passwort und
     sieht die Seite darauf antworten. Klein gehalten (0,5), sonst wird das
     Eintippen einer langen Adresse zum Gewitter. */
  var felder = document.querySelectorAll('.karte input[type=email], .karte input[type=password]');
  for (var n = 0; n < felder.length; n++) {
    felder[n].addEventListener('input', function () { wellevon(this, 0.5); }, { passive: true });
    felder[n].addEventListener('focus', function () { wellevon(this, 0.8); }, { passive: true });
  }

  var form = document.querySelector('.karte form');
  if (form) {
    form.addEventListener('submit', function () {
      wellevon(form.querySelector('button'), 1.9);
    });
  }

  /* Ein Ring beim Aufschlagen der Seite, gleich nachdem die Karte steht. */
  setTimeout(function () { wellevon(document.querySelector('.karte'), 1.15); }, 420);
})();
