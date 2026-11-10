/* Harbour Line website: session recorder.
   Listens to app events and POSTs batches to /rec:
     {lane, sessionId, replayOf?, events:[{t, type, step, field, label, value, valueLen, keys?}]}
   Keystrokes are not sent one by one: each committed web.field carries `keys`, the typing timeline
   [[t, valueSoFar], ...], so replay.js can show the characters at the recorded pace.
   Off with ?rec=0 and in ?demo= mode. In ?mock=1 mode it still tries /rec and ignores failures. */
(function () {
  'use strict';
  var HL = window.HL;
  if (!HL || !HL.app) return;
  var Q = new URLSearchParams(location.search);
  if (Q.has('demo') || Q.get('rec') === '0') return;

  var lane = Q.get('lane') || '3';
  var replayOf = Q.get('replay') || '';
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function makeId() {
    var d = new Date();
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
    var r = Math.random().toString(36).slice(2, 6);
    return 'l' + lane + (replayOf ? '-replay' : '') + '-' + stamp + '-' + r;
  }
  var sessionId = makeId();
  var queue = [], keys = {}, timer = null, inflight = false, failures = 0;
  var all = [];

  HL.app.on(function (e) {
    if (e.type === 'web.input') {
      (keys[e.field] = keys[e.field] || []).push([e.t, e.value]);
      return;
    }
    var rec = { t: e.t, type: e.type, step: e.step };
    if (e.field != null) rec.field = e.field;
    if (e.label != null) rec.label = e.label;
    if (e.value != null) { rec.value = e.value; rec.valueLen = String(e.value).length; }
    else if (e.valueLen != null) rec.valueLen = e.valueLen;
    if (e.type === 'web.field') {
      var k = keys[e.field];
      if (k && k.length) rec.keys = k;
      delete keys[e.field];
    }
    queue.push(rec);
    all.push(rec);
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'ferry.event', lane: lane, sessionId: sessionId, event: rec }, '*'); } catch (x) { /* ignore */ }
    schedule(e.type === 'web.done' || e.type === 'web.step' ? 0 : 350);
  });

  function schedule(ms) {
    if (timer) { if (ms > 0) return; clearTimeout(timer); }
    timer = setTimeout(function () { timer = null; flush(false); }, ms);
  }

  function flush(beacon) {
    if (!queue.length || (inflight && !beacon)) return;
    var events = queue.splice(0, 200);
    var batch = { lane: lane, sessionId: sessionId, events: events };
    if (replayOf) batch.replayOf = replayOf;
    var body = JSON.stringify(batch);
    if (beacon && navigator.sendBeacon) {
      try { navigator.sendBeacon('/rec', new Blob([body], { type: 'application/json' })); } catch (x) { /* ignore */ }
      return;
    }
    inflight = true;
    fetch('/rec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: body.length < 60000 })
      .then(function (res) {
        inflight = false;
        if (!res.ok) throw new Error('rec ' + res.status);
        failures = 0;
        if (queue.length) schedule(0);
      })
      .catch(function () {
        inflight = false;
        failures++;
        if (failures <= 3) { queue = events.concat(queue); schedule(1500 * failures); }
      });
  }

  window.addEventListener('pagehide', function () { flush(true); });

  HL.recorder = {
    sessionId: sessionId,
    lane: lane,
    file: 'session-' + sessionId + '.jsonl',
    events: function () { return all.slice(); },
    flush: function () { flush(false); }
  };
})();
