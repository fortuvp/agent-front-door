/* Harbour Line website: replay and race control.
   ?replay=<file>&lane=2 loads /race/recordings/<file> and re-applies its events through app.apply
   at the recorded timing. It starts on race.start (SSE /events, or postMessage {type:"race.start"}),
   or at once with &autoplay=1. If a race is already running when the page loads, it catches up.
   Options: &src=<lane> picks the lane to replay from a whole-race file, &speed=<n> (default 1),
   &from=first starts the clock at the first action instead of at page load.
   Every lane page (replay or live) reloads itself on race.reset. */
(function () {
  'use strict';
  var HL = window.HL;
  if (!HL || !HL.app) return;
  var app = HL.app;
  var Q = new URLSearchParams(location.search);
  var file = Q.get('replay');
  var mock = Q.has('mock') && Q.get('mock') !== '0';
  var started = false;

  // ---------- race control (all lanes) ----------
  function onRace(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'race.reset') { setTimeout(function () { location.reload(); }, 50); }
    if (msg.type === 'race.start' && file) start(msg.t0 ? Math.max(0, Date.now() - msg.t0) : 0);
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
    // the board sends t0 (same machine clock), so a page that loaded late catches up with the race
    if (d && (d.type === 'race.start' || d.type === 'race.reset')) onRace(d.type === 'race.start' && typeof d.t0 === 'number' ? { type: d.type, t0: d.t0 } : { type: d.type });
  });
  var inFrameOrLane = Q.has('lane') || file || (window.parent && window.parent !== window);
  if (!mock && inFrameOrLane && window.EventSource && !Q.has('demo')) {
    try {
      var es = new EventSource('/events');
      var handler = function (ev) {
        var d; try { d = JSON.parse(ev.data); } catch (x) { return; }
        if (d && (d.type === 'race.start' || d.type === 'race.reset')) onRace(d.type === 'race.start' ? { type: d.type } : d);
      };
      es.onmessage = handler;
      es.addEventListener('race.start', handler);
      es.addEventListener('race.reset', handler);
    } catch (x) { /* no server events: postMessage and autoplay still work */ }
  }

  if (!file) return;

  // ---------- replay ----------
  HL.flags.replaying = true;
  var speed = Number(Q.get('speed')) || 1;
  var timeline = null, base = 0, recordedAt = 0, loadError = '';

  var shield = document.createElement('div'); shield.className = 'rp-shield';
  var cursor = document.createElement('div'); cursor.className = 'rp-cursor';
  var tag = document.createElement('div'); tag.className = 'rp-tag wait';
  tag.innerHTML = '<span class="rp-dot"></span><span class="rp-text">Loading the recording</span>';
  function mount() { document.body.appendChild(shield); document.body.appendChild(cursor); document.body.appendChild(tag); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  function setTag(state, extra) {
    tag.className = 'rp-tag ' + state;
    var when = recordedAt ? fmtWhen(recordedAt) : '';
    var txt = loadError ? loadError : 'Recorded ' + when + ', ' + (speed === 1 ? 'real speed' : speed + 'x speed') + (extra ? ' · ' + extra : '');
    tag.querySelector('.rp-text').textContent = txt;
  }
  function fmtWhen(t) {
    var d = new Date(t), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getDate() + ' ' + M[d.getMonth()] + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function parse(text) {
    var out = [], t0 = 0;
    function take(x, lane) {
      if (!x) return;
      if (Array.isArray(x)) { x.forEach(function (y) { take(y, lane); }); return; }
      if (Array.isArray(x.events)) { if (x.t0 && !t0) t0 = x.t0; take(x.events, x.lane != null ? String(x.lane) : lane); return; }
      if (x.event && x.event.type) { take(x.event, x.lane != null ? String(x.lane) : lane); return; }
      if (x.type === 'race.start' && x.t0 && !t0) t0 = x.t0;
      if (x.type) { var e = Object.assign({}, x); if (e.lane == null && lane != null) e.lane = lane; out.push(e); }
    }
    var trimmed = text.trim();
    try { take(JSON.parse(trimmed)); }
    catch (e) {
      trimmed.split(/\r?\n/).forEach(function (line) {
        line = line.trim(); if (!line) return;
        try { take(JSON.parse(line.replace(/^data:\s*/, ''))); } catch (x) { /* skip a bad line */ }
      });
    }
    return { events: out, t0: t0 };
  }

  function build(parsed) {
    var evs = parsed.events.filter(function (e) { return /^web\./.test(e.type) && e.t; });
    var lanes = {};
    evs.forEach(function (e) { var l = e.lane != null ? String(e.lane) : '?'; (lanes[l] = lanes[l] || []).push(e); });
    var names = Object.keys(lanes);
    var pick = Q.get('src');
    if (!pick || !lanes[pick]) {
      if (names.length === 1) pick = names[0];
      else {
        var want = Q.get('lane') || '2';
        var withDone = names.filter(function (l) { return lanes[l].some(function (e) { return e.type === 'web.done'; }); });
        pick = lanes[want] ? want : (withDone[0] || names.sort(function (a, b) { return lanes[b].length - lanes[a].length; })[0]);
      }
    }
    var list = (lanes[pick] || []).slice().sort(function (a, b) { return a.t - b.t; });
    var causes = [];
    list.forEach(function (e) {
      if (e.type === 'web.click') causes.push({ at: e.t, ev: { type: 'web.click', field: e.field, value: e.value, label: e.label } });
      else if (e.type === 'web.input') causes.push({ at: e.t, ev: { type: 'web.input', field: e.field, value: e.value } });
      else if (e.type === 'web.field') {
        if (Array.isArray(e.keys)) e.keys.forEach(function (k) { if (k && k[0]) causes.push({ at: k[0], ev: { type: 'web.input', field: e.field, value: k[1] } }); });
        causes.push({ at: e.t, ev: { type: 'web.field', field: e.field, value: e.value } });
      }
    });
    causes.sort(function (a, b) { return a.at - b.at; });
    var view = list.filter(function (e) { return e.type === 'web.view'; })[0];
    var first = causes.length ? causes[0].at : (list[0] ? list[0].t : Date.now());
    recordedAt = (view && view.t) || first;
    if (Q.get('from') === 'first') base = first - 1500;
    else if (parsed.t0 && parsed.t0 <= first) base = parsed.t0;
    else if (view && view.t <= first) base = view.t;
    else base = first - 1500;
    if (first - base > 30000 && Q.get('from') !== 'view') base = first - 3000; // an idle page before the agent started
    return causes;
  }

  function target(ev) {
    var esc = function (v) { return String(v).replace(/["\\]/g, '\\$&'); };
    if (ev.type === 'web.click') {
      if (ev.field === 'popover.close') return null;
      var sel = '[data-act="' + esc(ev.field) + '"]' + (ev.value != null ? '[data-val="' + esc(ev.value) + '"]' : '');
      return document.querySelector('button' + sel) || document.querySelector(sel);
    }
    return document.querySelector('[data-field="' + esc(ev.field) + '"]');
  }
  var typingEl = null, typingTimer = null;
  function point(ev, tap) {
    var el = target(ev);
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 10) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    var x, y;
    if (ev.type === 'web.click') { x = r.left + Math.min(r.width / 2, 60); y = r.top + r.height / 2; }
    else { x = r.left + Math.min(r.width - 12, 22 + (el.value || '').length * 8); y = r.top + r.height / 2; }
    cursor.style.transform = 'translate(' + Math.round(x + window.scrollX) + 'px,' + Math.round(y + window.scrollY) + 'px)';
    cursor.classList.add('on');
    if (tap) { cursor.classList.remove('tap'); void cursor.offsetWidth; cursor.classList.add('tap'); }
  }
  function typing(ev) {
    var el = target(ev);
    if (typingEl && typingEl !== el) typingEl.classList.remove('rp-typing', 'rp-focus');
    if (!el) return;
    typingEl = el; el.classList.add('rp-typing', 'rp-focus');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { if (typingEl) typingEl.classList.remove('rp-typing', 'rp-focus'); }, 900);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms)); }); }

  function start(offset) {
    if (started) return;
    started = true;
    var go = function () { run(offset || 0); };
    if (timeline) app.ready.then(go);
    else loaded.then(function () { return app.ready; }).then(go);
  }

  function run(offset) {
    if (!timeline || !timeline.length) { setTag('done', 'nothing to replay'); return; }
    setTag('play');
    var t0 = performance.now() - offset / speed;
    var shift = 0, i = 0;
    function due(c) { return (c.at - base) / speed + shift; }
    function now() { return performance.now() - t0; }
    (function step() {
      if (i >= timeline.length) { setTimeout(function () { cursor.classList.remove('on'); }, 1200); setTag('done', 'finished'); return; }
      var c = timeline[i];
      var wait = due(c) - now();
      var pre = (c.ev.type === 'web.click' && wait > 380) ? sleep(wait - 320).then(function () { point(c.ev, false); }) : Promise.resolve();
      pre.then(function () { return sleep(due(c) - now()); }).then(function () {
        var w0 = performance.now();
        return app.idle().then(function () {
          var waited = performance.now() - w0;
          if (waited > 40) shift += waited;
        });
      }).then(function () {
        if (c.ev.type === 'web.click') point(c.ev, true);
        else if (c.ev.type === 'web.input') { typing(c.ev); point(c.ev, false); }
        try { app.apply(c.ev); } catch (x) { console.warn('replay', x); }
        i++;
        step();
      });
    })();
  }

  var loaded = fetch('/race/recordings/' + encodeURIComponent(file), { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
    .then(function (text) {
      timeline = build(parse(text));
      setTag('wait', Q.get('autoplay') === '1' ? '' : 'waiting for the start');
    })
    .catch(function (e) {
      loadError = 'Recording not found: ' + file;
      timeline = [];
      setTag('done');
      console.warn('replay load failed', e);
    });

  HL.replay = { start: start, timeline: function () { return timeline; } };

  if (Q.get('autoplay') === '1') start(0);
  else if (!mock) {
    // a race may already be running (page reloaded mid-race): catch up
    fetch('/race/state', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (st && st.running && st.t0) start(Math.max(0, Date.now() - st.t0));
    }).catch(function () { /* no server state */ });
  }
})();
