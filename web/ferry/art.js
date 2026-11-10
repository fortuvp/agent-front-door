/* Harbour Line website: SVG art and icons. No external assets. */
(function () {
  'use strict';

  var C = {
    deep: '#0A3C40', teal: '#11726F', sea: '#2A7C75', foam: '#FBF6EC', sand: '#EBCF9F',
    sandLight: '#F7E3BA', canopy: '#E9D4AE', canopyEdge: '#D2B27E', rust: '#B5462F', windowC: '#0E5E62'
  };

  function mark(size) {
    var s = size || 30;
    // a life ring: sand ring with four rust bands, on deep teal
    var segs = '';
    for (var i = 0; i < 4; i++) {
      var a0 = (i * 90 + 22) * Math.PI / 180, a1 = (i * 90 + 68) * Math.PI / 180;
      var r = 10.5;
      var x0 = 16 + r * Math.cos(a0), y0 = 16 + r * Math.sin(a0), x1 = 16 + r * Math.cos(a1), y1 = 16 + r * Math.sin(a1);
      segs += '<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + '" stroke="' + C.rust + '" stroke-width="6" fill="none"/>';
    }
    return '<svg class="mark" width="' + s + '" height="' + s + '" viewBox="0 0 32 32" aria-hidden="true">' +
      '<circle cx="16" cy="16" r="15.5" fill="' + C.deep + '"/>' +
      '<circle cx="16" cy="16" r="10.5" stroke="' + C.foam + '" stroke-width="6" fill="none"/>' + segs +
      '<circle cx="16" cy="16" r="13.6" stroke="' + C.foam + '" stroke-opacity=".35" stroke-width=".8" fill="none"/>' +
      '</svg>';
  }

  function scallops(x0, x1, y, r, fill) {
    var d = 'M' + x0 + ' ' + y;
    for (var x = x0; x < x1 - 0.1; x += 2 * r) d += ' a' + r + ' ' + r + ' 0 0 0 ' + (2 * r) + ' 0';
    d += ' Z';
    return '<path d="' + d + '" fill="' + fill + '"/>';
  }

  function ferry() {
    // local coordinates: stern at x=0, bow at x=312, waterline about y=104
    var win = '';
    for (var i = 0; i < 9; i++) win += '<rect x="' + (34 + i * 24) + '" y="49" width="15" height="12" rx="2" fill="' + C.windowC + '"/>';
    var rail = '<line x1="22" y1="22" x2="254" y2="22" stroke="' + C.foam + '" stroke-width="1.8"/>';
    for (var p = 22; p <= 254; p += 14.5) rail += '<line x1="' + p.toFixed(1) + '" y1="22" x2="' + p.toFixed(1) + '" y2="37" stroke="' + C.foam + '" stroke-width="1.2" stroke-opacity=".85"/>';
    var people = [[52, C.rust], [70, C.sand], [104, C.foam], [138, C.teal], [176, C.rust], [206, C.sand], [232, C.foam]];
    var ppl = people.map(function (q) {
      return '<rect x="' + (q[0] - 5) + '" y="27" width="10" height="11" rx="4" fill="' + q[1] + '"/>' +
        '<circle cx="' + q[0] + '" cy="22.5" r="4.2" fill="#3B2A22"/>';
    }).join('');
    return '<g class="ferry">' +
      // mast and flag
      '<line x1="262" y1="0" x2="262" y2="-34" stroke="' + C.deep + '" stroke-width="2"/>' +
      '<path class="flag" d="M262 -34 L290 -28 L262 -21 Z" fill="' + C.rust + '"/>' +
      // canopy posts and roof
      '<line x1="28" y1="6" x2="28" y2="37" stroke="' + C.deep + '" stroke-width="2.2"/>' +
      '<line x1="140" y1="6" x2="140" y2="37" stroke="' + C.deep + '" stroke-width="2.2"/>' +
      '<line x1="250" y1="6" x2="250" y2="37" stroke="' + C.deep + '" stroke-width="2.2"/>' +
      ppl + rail +
      '<rect x="14" y="-3" width="252" height="10" rx="2.5" fill="' + C.canopy + '"/>' +
      scallops(14, 266, 7, 4.5, C.canopyEdge) +
      // upper deck floor and lower cabin
      '<rect x="16" y="36" width="244" height="5" rx="1" fill="' + C.deep + '"/>' +
      '<rect x="24" y="41" width="226" height="33" rx="3" fill="#F2E8D6"/>' + win +
      // hull
      '<path d="M0 72 L248 72 Q288 70 314 58 L294 100 Q290 107 278 107 L20 107 Q9 107 5 99 Z" fill="' + C.foam + '"/>' +
      '<path d="M2 84 L304 84 L300 92 L4 92 Z" fill="' + C.teal + '"/>' +
      '<path d="M9 100 L291 100 Q288 107 278 107 L20 107 Q11 107 9 100 Z" fill="' + C.rust + '"/>' +
      '<text x="150" y="81.2" text-anchor="middle" font-family="Avenir Next, Avenir, Helvetica, sans-serif" font-size="7.2" font-weight="700" letter-spacing="2.6" fill="' + C.teal + '">HARBOUR LINE</text>' +
      // bow wave
      '<path d="M286 108 Q300 104 318 109 Q302 112 286 111 Z" fill="' + C.foam + '" opacity=".9"/>' +
      '</g>';
  }

  function heroDefs() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<linearGradient id="hl-sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0B4A4F"/><stop offset=".42" stop-color="#1D6C69"/>' +
      '<stop offset=".7" stop-color="#7FAE9F"/><stop offset=".9" stop-color="#E6C995"/><stop offset="1" stop-color="#F1D6A6"/></linearGradient>' +
      '<linearGradient id="hl-sea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2E8078"/><stop offset=".35" stop-color="#1A6461"/><stop offset="1" stop-color="#0A4145"/></linearGradient>' +
      '<radialGradient id="hl-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F7E3BA" stop-opacity=".55"/><stop offset="1" stop-color="#F7E3BA" stop-opacity="0"/></radialGradient>' +
      '</defs></svg>';
  }

  function waves(y, amp, len, opacity, cls) {
    var d = 'M-200 ' + y;
    for (var x = -200; x < 1400; x += len) d += ' q' + (len / 4) + ' ' + (-amp) + ' ' + (len / 2) + ' 0 t' + (len / 2) + ' 0';
    return '<path class="' + cls + '" d="' + d + '" fill="none" stroke="#FBF6EC" stroke-opacity="' + opacity + '" stroke-width="1.6" stroke-linecap="round"/>';
  }

  function hero(viewBox, extraClass) {
    var posts = '';
    for (var x = 12; x < 300; x += 34) posts += '<rect x="' + x + '" y="324" width="5" height="34" fill="' + C.deep + '"/>';
    var reflect = '';
    [[306, 120], [318, 86], [330, 58], [343, 36], [356, 20]].forEach(function (r) {
      reflect += '<rect x="' + (930 - r[1] / 2) + '" y="' + r[0] + '" width="' + r[1] + '" height="3" rx="1.5" fill="#F7E3BA" opacity=".55"/>';
    });
    return '<svg class="hero-svg ' + (extraClass || '') + '" viewBox="' + viewBox + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<rect x="0" y="0" width="1200" height="301" fill="url(#hl-sky)"/>' +
      '<circle cx="930" cy="214" r="120" fill="url(#hl-halo)"/>' +
      '<circle cx="930" cy="214" r="44" fill="#F7E3BA"/>' +
      '<g class="gulls" fill="none" stroke="#F4E6CC" stroke-width="2" stroke-linecap="round">' +
      '<path d="M650 120 q8 -8 16 0 q8 -8 16 0"/><path d="M700 146 q6 -6 12 0 q6 -6 12 0"/><path d="M1070 132 q6 -6 12 0 q6 -6 12 0"/></g>' +
      '<path d="M640 300 C700 268 760 238 830 236 C880 234 905 258 950 262 C1000 266 1030 240 1080 242 C1130 244 1170 270 1200 282 L1200 300 Z" fill="#4F8C85" opacity=".75"/>' +
      '<path d="M720 300 C770 284 806 264 858 263 C904 262 934 282 984 284 C1042 286 1090 268 1140 270 L1200 276 L1200 300 Z" fill="#2C6F6A"/>' +
      '<g transform="translate(1104 280)"><path d="M0 14 L22 14 L18 19 L4 19 Z" fill="#1D5C59"/><path d="M11 -4 L11 13 L22 13 Z" fill="#F4E6CC" opacity=".9"/></g>' +
      '<rect x="0" y="300" width="1200" height="160" fill="url(#hl-sea)"/>' +
      '<rect x="0" y="299" width="1200" height="2" fill="#F3DDB5" opacity=".55"/>' + reflect +
      '<g class="wave-a">' + waves(318, 3, 60, .22, '') + '</g>' +
      '<g class="wave-b">' + waves(338, 4, 90, .18, '') + '</g>' +
      // jetty
      '<rect x="0" y="316" width="300" height="9" fill="' + C.deep + '"/>' + posts +
      '<rect x="0" y="312" width="300" height="4" fill="#165257"/>' +
      '<g fill="' + C.deep + '"><rect x="40" y="288" width="4" height="28"/><rect x="200" y="288" width="4" height="28"/>' +
      '<circle cx="42" cy="286" r="5" fill="#F4E6CC"/><circle cx="202" cy="286" r="5" fill="#F4E6CC"/></g>' +
      // wake
      '<g class="wake" stroke="#FBF6EC" stroke-linecap="round" fill="none">' +
      '<path d="M560 378 C520 380 470 384 400 386" stroke-width="3" stroke-opacity=".55"/>' +
      '<path d="M556 386 C510 392 450 398 360 402" stroke-width="2" stroke-opacity=".35"/>' +
      '<path d="M570 370 C540 370 500 372 450 374" stroke-width="2" stroke-opacity=".3"/></g>' +
      '<g class="boat-bob"><g transform="translate(560 270)">' + ferry() + '</g></g>' +
      '<g class="wave-c">' + waves(400, 5, 120, .16, '') + '</g>' +
      '<g class="wave-a">' + waves(428, 5, 140, .12, '') + '</g>' +
      '</svg>';
  }

  function ribbon() {
    // compact route line for booking pages: jetty pin, sea path, boat, island pin
    return '<svg class="ribbon-svg" viewBox="0 0 320 44" aria-hidden="true">' +
      '<path d="M18 30 C70 18 110 38 160 26 S250 18 302 28" fill="none" stroke="#7FC2BA" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>' +
      '<circle cx="18" cy="30" r="6" fill="#FBF6EC"/><circle cx="18" cy="30" r="2.6" fill="#0A3C40"/>' +
      '<path d="M284 34 C290 20 298 16 304 16 C312 16 318 26 322 34 Z" fill="#7FC2BA" opacity=".9"/>' +
      '<g transform="translate(140 9) scale(.13)">' + ferry() + '</g>' +
      '</svg>';
  }

  function boatBadge() {
    return '<svg class="boat-badge" viewBox="-20 -50 360 180" aria-hidden="true">' +
      '<path d="M-20 112 Q20 104 60 112 T140 112 T220 112 T300 112 T380 112 L380 130 L-20 130 Z" fill="#CFE6E1"/>' +
      ferry() + '</svg>';
  }

  // decorative QR-like pattern from a seed string
  function qr(seed, size) {
    var n = 29, s = size || 168, cell = s / n;
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    function rnd() { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; }
    function finder(x, y) {
      return '<rect x="' + (x * cell) + '" y="' + (y * cell) + '" width="' + (7 * cell) + '" height="' + (7 * cell) + '" fill="#0A3C40"/>' +
        '<rect x="' + ((x + 1) * cell) + '" y="' + ((y + 1) * cell) + '" width="' + (5 * cell) + '" height="' + (5 * cell) + '" fill="#FFFDF8"/>' +
        '<rect x="' + ((x + 2) * cell) + '" y="' + ((y + 2) * cell) + '" width="' + (3 * cell) + '" height="' + (3 * cell) + '" fill="#0A3C40"/>';
    }
    function inFinder(x, y) {
      return (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    }
    var cells = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (rnd() > 0.52) cells += '<rect x="' + (x * cell).toFixed(2) + '" y="' + (y * cell).toFixed(2) + '" width="' + (cell + 0.3).toFixed(2) + '" height="' + (cell + 0.3).toFixed(2) + '"/>';
    }
    return '<svg class="qr" viewBox="0 0 ' + s + ' ' + s + '" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<rect width="' + s + '" height="' + s + '" fill="#FFFDF8"/><g fill="#0A3C40">' + cells + '</g>' +
      finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7) + '</svg>';
  }

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var icons = {
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.8 14.2c2.4.2 4 1.8 4.6 4.6"/>',
    ramp: '<path d="M3 19h18L3 11z"/><circle cx="16.5" cy="5.5" r="1.6"/>',
    steps: '<path d="M3 19h5v-4h5v-4h5V7h3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="M3 10h18M7 15h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    seat: '<path d="M7 4v9h9l2 7M7 13l-2 7M7 8h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    guide: '<circle cx="12" cy="6.5" r="2.5"/><path d="M8 21l1.5-7.5L12 11l2.5 2.5L16 21M9.5 13.5L7 16M14.5 13.5L17 12V8"/>',
    shelter: '<path d="M3 10l9-5 9 5M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    wave: '<path d="M2.5 14c2 0 2-2 4.75-2s2.75 2 4.75 2 2-2 4.75-2 2.75 2 4.75 2M2.5 18c2 0 2-2 4.75-2s2.75 2 4.75 2 2-2 4.75-2 2.75 2 4.75 2"/><path d="M12 3v6"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" ' + P + ' aria-hidden="true">' + (icons[name] || '') + '</svg>';
  }

  window.HLArt = { mark: mark, hero: hero, heroDefs: heroDefs, ribbon: ribbon, boatBadge: boatBadge, qr: qr, icon: icon, ferry: ferry };
})();
