// Race board. One state, one event handler for every source:
//   live    GET /race/state, then SSE /events (default)
//   replay  ?replay=race-<id>.jsonl (or race-latest.json): a recorded race at recorded timing
//   sim     ?sim=1: a synthetic race for testing, always badged "Simulation"
// Keys: S start, R reset, F full screen, D results. ?embed=1 hides the header.
// postMessage in: {type:"race.start"} | {type:"race.reset"} | {type:"results", show}
// postMessage out (to parent): {type:"race.results", lanes:[…]} when every lane is done.

import { simEvents, simOrder } from '/board/sim.js';

const P = new URLSearchParams(location.search);
const flag = (k) => P.has(k) && P.get(k) !== '0' && P.get(k) !== 'false';
const basename = (f) => String(f || '').split('/').pop();
const numParam = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const SIM = flag('sim');
const REPLAY_FILE = !SIM && P.get('replay') ? basename(P.get('replay')) : null;
const MODE = SIM ? 'sim' : REPLAY_FILE ? 'replay' : 'live';
const EMBED = flag('embed');
const LANE2_FILE = basename(P.get('lane2') || 'lane2-ferry.json');
// lane 2 plays a recording; when the file is not there (live mode), it is left out of "all done"
let lane2Missing = false;
const LANE2_MISSING_STATUS = 'No recording for this lane yet';
const AT = numParam(P.get('simAt') ?? P.get('at'));
const AUTOPLAY = flag('autoplay');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const stage = $('#stage');
const laneEl = { 1: $('#lane-1'), 2: $('#lane-2'), 3: $('#lane-3') };

// The website's seven stages, as the human door asks for them (SPEC "Human website").
const STEPS7 = [
  { k: 'cookies', label: 'Cookies' },
  { k: 'account', label: 'Account' },
  { k: 'trip', label: 'Trip' },
  { k: 'passengers', label: 'Passengers' },
  { k: 'review', label: 'Review' },
  { k: 'pay', label: 'Pay' },
  { k: 'ticket', label: 'Ticket' },
];
const STEP_MATCH = [ // tested in this order
  [6, /ticket|booked|success|thank|done|complete/],
  [5, /pay|card|checkout/],
  [4, /review|summary/],
  [3, /passeng|traveller|people|seat|class|boarding|assist|details/],
  [2, /trip|route|date|depart|search|journey/],
  [1, /auth|sign|account|login|register|code|verify|otp|email/],
  [0, /cookie|consent|banner|home|landing|start/],
];
function stepIndex(step) {
  if (step == null) return -1;
  const s = String(step).toLowerCase();
  if (/^\d+$/.test(s)) { const n = Number(s); return n >= 1 && n <= 7 ? n - 1 : -1; }
  for (const [i, re] of STEP_MATCH) if (re.test(s)) return i;
  return -1;
}

// ------------------------------------------------------------ format ---
const pad = (n, w = 2) => String(n).padStart(w, '0');
function fmtClock(ms) {
  ms = Math.max(0, ms || 0);
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600), s = Math.floor((tenths % 600) / 10), d = tenths % 10;
  return `${pad(m)}:${pad(s)}.${d}`;
}
function fmtShort(ms) {
  ms = Math.max(0, ms || 0);
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600), s = Math.floor((tenths % 600) / 10), d = tenths % 10;
  return `${m}:${pad(s)}.${d}`;
}
function fmtDur(ms) { // "21.4 s" or "2 min 03 s"
  ms = Math.max(0, ms || 0);
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
}
const fmtBytes = (b) => (b == null || b === '' ? '' : b < 1000 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtK = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : fmtInt(n));
const money = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : String(v ?? ''); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s) => (s && s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h || '');
const now = () => Date.now();

// ------------------------------------------------------------- state ---
let S = fresh();
let seen = new Set();
let playTimers = [];
let lastSPress = 0;
let framesReloadedAt = 0;
let resultsTimer = 0;
let momentTimer = 0;
let connected = MODE !== 'live';
let replayData = null;
let bootSynced = false; // the first /race/state after load has been applied

function fresh() {
  return {
    t0: null, running: false, replayName: null,
    l1: {
      doneMs: null, stopMs: null, stepsFinal: null, tools: 0, reqLines: 0, reqs: 0, status: 'Ready',
      feed: [], track: { discover: null, price: null, permission: null, pay: null },
      order: null, orderEvents: [], awaitAt: null, decideAt: null, decision: null,
      paidAt: null, paidWall: 0, receipt: null, refunded: null, quoteTotal: null, payReq: null, agentOk: null,
    },
    w: { 2: webFresh(2), 3: webFresh(3) },
    usage: {},
    outside: { n: 0, last: '' },
    results: false, resultsForced: null, resultsPosted: false,
  };
}
function webFresh(lane) {
  const status = lane === 2 && lane2Missing ? LANE2_MISSING_STATUS : 'Ready';
  return { doneMs: null, stepsFinal: null, steps: 0, errors: 0, idx: -1, status, lastField: null, ref: null, sessionId: null };
}
const rel = (t) => (S.t0 ? Math.max(0, (t || now()) - S.t0) : 0);
const steps1 = () => S.l1.stepsFinal ?? (S.l1.tools || S.l1.reqLines);
const stepsW = (w) => w.stepsFinal ?? w.steps;
const lane1End = () => S.l1.doneMs ?? S.l1.stopMs;
const allDone = () => S.t0 && lane1End() != null && (lane2Missing || S.w[2].doneMs != null) && S.w[3].doneMs != null;

// ------------------------------------------------------- the handler ---
function apply(ev, opt = {}) {
  if (!ev || typeof ev !== 'object' || !ev.type) return;
  const key = JSON.stringify(ev);
  if (seen.has(key)) return;
  seen.add(key);
  const type = String(ev.type);
  const lane = ev.lane == null ? '' : String(ev.lane);

  if (type === 'race.reset') { resetAll({ reloadFrames: !opt.fromState }); return; }
  if (type === 'race.start') { startRace(ev, opt); return; }

  if (lane === 'x') { outsideEvent(ev); return; }
  if (!S.t0) return; // nothing belongs to a lane before a race starts

  if (type === 'lane.done') { laneDone(ev); schedule(); return; }
  if (type === 'agent.usage') {
    S.usage[lane || '1'] = { in: Number(ev.inputTokens || 0), out: Number(ev.outputTokens || 0), turns: ev.turns ?? null };
    schedule(); return;
  }
  if (type.startsWith('web.')) { webEvent(ev, lane); schedule(); return; }
  if (type.startsWith('agent.')) { if (lane === '1' || lane === '' || lane === 'sys') agentEvent(ev, opt); schedule(); return; }
  if (type.startsWith('order.')) { orderEvent(ev, lane, opt); schedule(); return; }
}

function startRace(ev, opt) {
  clearTimeout(resultsTimer);
  const keepSeen = seen;
  S = fresh();
  seen = keepSeen;
  S.t0 = Number(ev.t0 || ev.t || now());
  S.running = true;
  S.replayName = ev.replay || null;
  S.l1.status = 'Starting the agent';
  S.w[2].status = lane2Missing ? LANE2_MISSING_STATUS : 'Starting the recorded run';
  S.w[3].status = 'Your turn: start with the cookie banner';
  clearLaneDom();
  if (MODE === 'live' && opt.fromState && !bootSynced) {
    // the board reloaded mid-race: tell the recorded lane where the race is
    whenFrameReady(2).then(() => postToFrame(2, { type: 'race.start', t0: S.t0, seek: now() - S.t0 }));
  }
  schedule();
}

function resetAll({ reloadFrames = true } = {}) {
  clearTimeout(resultsTimer);
  S = fresh();
  seen = new Set();
  clearLaneDom();
  if (reloadFrames) reloadSites();
  postToFrame('phone', { type: 'race.reset' });
  schedule();
}

function laneDone(ev) {
  const l = String(ev.lane);
  const ms = ev.ms != null ? Number(ev.ms) : rel(ev.t);
  if (l === '1') {
    S.l1.doneMs = ms;
    if (typeof ev.steps === 'number') S.l1.stepsFinal = ev.steps;
  } else if (S.w[l]) {
    S.w[l].doneMs = ms;
    if (typeof ev.steps === 'number') S.w[l].stepsFinal = ev.steps;
    if (S.w[l].idx < 6) S.w[l].idx = 6;
  }
  maybeResults();
}

function outsideEvent(ev) {
  if (ev.type !== 'agent.request') return;
  S.outside.n += 1;
  S.outside.last = ev.summary || `${ev.method || 'GET'} ${ev.path || ''}`;
  schedule();
}

// ---- lane 1: the agent on the agent door
function markTrack(k, t) {
  const T = S.l1.track;
  if (T[k] == null) T[k] = t;
  const order = ['discover', 'price', 'permission', 'pay'];
  const i = order.indexOf(k);
  for (let j = 0; j < i; j++) if (T[order[j]] == null) T[order[j]] = t;
}
function pushFeed(item) {
  const f = S.l1.feed;
  const last = f[f.length - 1];
  if (item.kind === 'req' && last && last.kind === 'req' && last.method === item.method && last.path === item.path && last.status === item.status) {
    last.n += 1; last.t = item.t; last.dirty = true;
    return;
  }
  if (item.kind === 'req') S.l1.reqLines += 1;
  item.n = 1;
  item.id = f.length;
  f.push(item);
}
function toolCommand(ev) {
  const inp = ev.input;
  let cmd = typeof inp === 'string' ? inp : inp && (inp.command || inp.cmd || inp.url || inp.description) || '';
  if (!cmd && inp) { try { cmd = JSON.stringify(inp); } catch { cmd = ''; } }
  // display only: drop the agent's leading `cd <folder>;` (the home folder) and a trailing `; echo "exit=$?"`
  cmd = String(cmd || ev.name || '').replace(/^\s*cd\s+("[^"]*"|'[^']*'|\S+)\s*(?:;|&&)\s*/, '').replace(/\s*;\s*echo\s+"?exit=\$\?"?\s*$/, '');
  cmd = cmd.replace(/https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?/g, '').replace(/(?:\.|\/[^\s'";|&]*)?\/bin\/ferry\b|\bbin\/ferry\b/g, 'ferry').replace(/\/(?:Users|home)\/[^\/\s'"]+/g, '~').replace(/\s+/g, ' ').trim();
  return cmd;
}
function toolStatus(cmd, name) {
  const m = cmd.match(/\bferry\s+([a-z]+)/);
  if (m) return ({ routes: 'Listing the routes', departures: 'Asking for departures', quote: 'Asking for a quote', book: 'Placing the order', wait: 'Waiting for your answer', status: 'Checking the order', refund: 'Asking for a refund' })[m[1]] || `Running ferry ${m[1]}`;
  if (/\bcurl\b/.test(cmd)) { const p = cmd.match(/\s(\/[^\s'";|&]*)/); return p ? `Fetching ${p[1]}` : 'Fetching a page'; }
  return name ? `Using ${name}` : 'Working';
}
function agentEvent(ev, opt) {
  const L = S.l1;
  const t = rel(ev.t);
  switch (ev.type) {
    case 'agent.request': {
      L.reqs += 1;
      const status = Number(ev.status) || ev.status;
      pushFeed({ kind: 'req', t, method: String(ev.method || 'GET').toUpperCase(), path: ev.path || '', status, bytes: ev.bytes, summary: ev.summary || '' });
      markTrack('discover', t);
      if (/\/quote\b/.test(ev.path || '')) markTrack('price', t);
      if (status === 402) markTrack('pay', t);
      if (L.order && !L.decision && L.doneMs == null) L.status = 'Waiting for your yes';
      else if (ev.summary) L.status = capFirst(ev.summary);
      break;
    }
    case 'agent.tool': {
      L.tools += 1;
      const cmd = toolCommand(ev);
      pushFeed({ kind: 'tool', t, cmd: cmd || ev.name || 'tool' });
      if (!L.receipt && !(L.order && !L.decision)) L.status = toolStatus(cmd, ev.name);
      break;
    }
    case 'agent.say':
      // Markdown markers (**, __, backticks, list dashes) would show as is on the TV
      if (ev.text) pushFeed({ kind: 'say', t, text: String(ev.text).replace(/\*\*|__|`/g, '').replace(/^\s*-\s+/gm, '') });
      break;
    case 'agent.done':
      L.agentOk = ev.ok !== false;
      if (L.doneMs == null) {
        L.stopMs = t;
        L.status = L.decision === 'no' ? 'Stopped: you said not now. Nothing was paid.' : ev.ok === false ? 'The agent stopped before paying' : 'The agent finished without paying';
        maybeResults();
      }
      break;
  }
}
function isLane1Order(ev, lane) {
  if (lane === '1') return true;
  if (lane === '2' || lane === '3' || lane === 'x') return false;
  const L = S.l1;
  if (L.order && ev.orderId && ev.orderId === L.order.orderId) return true;
  if (ev.type === 'order.quoted' && !L.order) return true;
  if (ev.type === 'order.awaiting_approval' && !L.order) return true;
  return false;
}
function orderEvent(ev, lane, opt) {
  if (!isLane1Order(ev, lane)) return;
  const L = S.l1;
  const t = rel(ev.t);
  if (L.order && (!ev.orderId || ev.orderId === L.order.orderId)) {
    L.orderEvents.push(ev);
    if (!opt.instant) postToFrame('phone', { type: 'event', event: ev });
  }
  switch (ev.type) {
    case 'order.quoted':
      markTrack('price', t);
      L.quoteTotal = ev.total;
      L.status = `Got a quote: ${money(ev.total)} USDC`;
      break;
    case 'order.awaiting_approval':
      if (L.order && L.order.orderId === ev.orderId) break;
      L.order = { orderId: ev.orderId, total: ev.total, approveUrl: ev.approveUrl, quote: ev.quote || null };
      L.orderEvents = [ev];
      markTrack('permission', t);
      L.awaitAt = t; L.decision = null; L.decideAt = null;
      L.status = 'Waiting for your yes';
      setPhone();
      break;
    case 'order.approved':
      if (!L.decision) { L.decision = 'yes'; L.decideAt = t; }
      L.status = 'You said yes. The agent pays with x402.';
      break;
    case 'order.declined':
      if (!L.decision) { L.decision = 'no'; L.decideAt = t; }
      L.status = 'You said not now. Nothing was paid.';
      break;
    case 'order.payment_required':
      markTrack('pay', t);
      L.payReq = ev;
      L.status = `The shop asked for ${money(ev.amount)} ${ev.asset || 'USDC'} (HTTP 402). The agent signs.`;
      break;
    case 'order.paid':
      markTrack('pay', t);
      L.receipt = { ...ev };
      L.paidAt = t;
      L.paidWall = opt.instant ? 0 : now();
      if (!L.decision) { L.decision = 'yes'; L.decideAt = t; }
      L.status = `Paid ${money(ev.amount ?? L.order?.total)} USDC. The agent has a receipt.`;
      if (!opt.instant) { clearTimeout(momentTimer); momentTimer = setTimeout(schedule, 2000); }
      break;
    case 'order.refunded':
      L.refunded = ev.txHash || true;
      L.status = 'Refunded to the same wallet';
      break;
  }
}

// ---- lanes 2 and 3: the human door
function webEvent(ev, lane) {
  const W = S.w[lane];
  if (!W) return;
  if (String(lane) === '2' && lane2Missing) return; // no recording: the page only reports that it opened
  if (ev.sessionId) W.sessionId = ev.sessionId;
  const idx = stepIndex(ev.step);
  const label = ev.label ? String(ev.label) : '';
  switch (ev.type) {
    case 'web.view':
      // a page opened after the lane finished (board reload) does not undo the finished track
      if (W.doneMs == null) { if (idx >= 0) W.idx = idx; else if (W.idx < 0) W.idx = 0; }
      if (W.doneMs == null) W.status = label ? (/^opened\b/i.test(label) ? capFirst(label) : `Opened ${lowerFirst(label)}`) : 'Opened the website';
      break;
    case 'web.step':
      if (idx >= 0) W.idx = idx;
      W.lastField = null;
      if (W.doneMs == null) W.status = `On ${lowerFirst(label || STEPS7[W.idx]?.label || String(ev.step || 'the next page'))}`;
      break;
    case 'web.field':
      if (idx >= 0) W.idx = Math.max(W.idx, idx);
      if (ev.field !== W.lastField) { W.steps += 1; W.lastField = ev.field; }
      if (W.doneMs == null) W.status = `Filling in ${lowerFirst(label || String(ev.field || 'a field'))}`;
      break;
    case 'web.click':
      if (idx >= 0) W.idx = Math.max(W.idx, idx);
      W.steps += 1; W.lastField = null;
      if (W.doneMs == null) W.status = label ? `Clicked ${lowerFirst(label)}` : 'Clicked';
      break;
    case 'web.submit':
      W.steps += 1; W.lastField = null;
      if (W.doneMs == null) W.status = label ? `Sent: ${lowerFirst(label)}` : 'Sent the form';
      break;
    case 'web.error':
      W.errors += 1;
      if (W.doneMs == null) W.status = `Error: ${lowerFirst(label || 'something was not accepted')}`;
      break;
    case 'web.done':
      W.idx = 6;
      W.ref = ev.ref || W.ref;
      W.status = W.ref ? `Booked. Reference ${W.ref}` : 'Booked';
      break;
  }
}

function maybeResults() {
  if (!allDone() || S.results) return;
  clearTimeout(resultsTimer);
  resultsTimer = setTimeout(() => { S.results = true; S.running = false; schedule(); postResults(); }, 1500);
}
function postResults() {
  if (S.resultsPosted || !allDone()) return;
  S.resultsPosted = true;
  const u = (l) => S.usage[l] ? S.usage[l].in + S.usage[l].out : null;
  const lanes = [
    { lane: '1', ms: lane1End(), steps: steps1(), tokens: u('1'), waitMs: S.l1.awaitAt != null && S.l1.decideAt != null ? S.l1.decideAt - S.l1.awaitAt : null, paid: !!S.l1.receipt },
    { lane: '2', ms: S.w[2].doneMs, steps: stepsW(S.w[2]), tokens: u('2'), errors: S.w[2].errors },
    { lane: '3', ms: S.w[3].doneMs, steps: stepsW(S.w[3]), tokens: u('3'), errors: S.w[3].errors },
  ];
  try { if (parent !== window) parent.postMessage({ type: 'race.results', mode: MODE, t0: S.t0, lanes }, '*'); } catch {}
}

// ------------------------------------------------------------ render ---
let dirty = false;
function schedule() { if (!dirty) { dirty = true; requestAnimationFrame(() => { dirty = false; render(); }); } }

function clearLaneDom() {
  $('#feed-list').innerHTML = '<li class="feed-empty no-anim">Nothing yet. The agent starts at the door.</li>';
  feedDom.clear();
  $('#receipt').classList.remove('is-on');
  $('#receipt').innerHTML = '';
  $('#moment').classList.remove('is-on');
  $('#feed').style.paddingBottom = '';
  phoneOrderId = null;
  for (const l of [2, 3]) { const d = $('[data-done]', laneEl[l]); d.classList.remove('is-on'); d.innerHTML = ''; }
}

function laneState(l) {
  if (!S.t0) return 'idle';
  if (l === 1) {
    if (S.l1.doneMs != null) return 'done';
    if (S.l1.stopMs != null) return 'stopped';
    if (S.l1.order && !S.l1.decision) return 'waiting';
    return 'running';
  }
  return S.w[l].doneMs != null ? 'done' : 'running';
}
function setLaneClass(l) {
  const el = laneEl[l];
  const st = laneState(l);
  for (const c of ['idle', 'running', 'waiting', 'done', 'stopped']) el.classList.toggle(`is-${c}`, c === st || (c === 'running' && st === 'waiting'));
}
function setStat(el, name, value, opts = {}) {
  const s = $(`[data-stat="${name}"]`, el);
  if (!s) return;
  $('b', s).textContent = value;
  s.classList.toggle('is-zero', !value || value === '0');
  if (opts.err) s.classList.toggle('is-err', Number(value) > 0);
}
function setStatus(el, text) {
  const s = $('[data-status] span', el);
  if (s.textContent !== text) s.textContent = text;
}

function render() {
  // header
  const ob = $('#outside');
  if (S.outside.n > 0) { ob.hidden = false; ob.textContent = `Agents in the room: ${S.outside.n} ${S.outside.n === 1 ? 'request' : 'requests'}, last one ${S.outside.last}`; } else ob.hidden = true;
  renderBadge();

  // lane 1
  const L = S.l1, e1 = laneEl[1];
  setLaneClass(1);
  setStat(e1, 'steps', String(steps1()));
  setStatus(e1, L.status);
  renderTrack4();
  renderTokens();
  renderFeed();
  renderMoment();
  renderReceipt();

  // lanes 2 and 3
  for (const l of [2, 3]) {
    const W = S.w[l], el = laneEl[l];
    setLaneClass(l);
    setStat(el, 'steps', String(stepsW(W)));
    setStat(el, 'errors', String(W.errors), { err: true });
    setStatus(el, W.status);
    $$('[data-track7] li', el).forEach((li, i) => {
      li.classList.toggle('is-on', i <= W.idx);
      li.classList.toggle('is-now', i === W.idx && W.doneMs == null && !!S.t0);
    });
    const d = $('[data-done]', el);
    if (W.doneMs != null && !d.classList.contains('is-on')) {
      d.innerHTML = `<b>Booked</b>${W.ref ? ` · reference ${esc(W.ref)}` : ''}<span>${fmtShort(W.doneMs)}</span>`;
      d.classList.add('is-on');
    }
  }

  renderResults();
  tick(true);
}

function renderBadge() {
  const b = $('#mode-badge');
  let cls = 'is-live', text = 'Live';
  if (MODE === 'sim') { cls = 'is-sim'; text = 'Simulation, not a real run'; }
  else if (MODE === 'replay') {
    cls = 'is-replay';
    const t = replayData?.t0 ? new Date(replayData.t0) : null;
    text = t ? `Recorded race, ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Recorded race';
  } else if (!connected) { cls = 'is-down'; text = 'Server not reachable'; }
  b.className = `mode-badge ${cls}${S.running ? ' is-on' : ''}`;
  if (b.textContent !== text) b.textContent = text;
  const eb = $('#embed-badge');
  if (eb) {
    eb.className = `mode-badge embed-badge ${cls}`; eb.textContent = text; eb.hidden = MODE === 'live' && connected;
    if (document.body.classList.contains('has-badge') === eb.hidden) { document.body.classList.toggle('has-badge', !eb.hidden); requestAnimationFrame(() => { layoutSites(); schedule(); }); }
  }
}

function renderTrack4() {
  const T = S.l1.track, L = S.l1;
  const keys = ['discover', 'price', 'permission', 'pay'];
  let last = -1;
  keys.forEach((k, i) => { if (T[k] != null) last = i; });
  const waiting = L.order && !L.decision && L.doneMs == null;
  $$('#track4 li[data-k]').forEach((li, i) => {
    const k = keys[i];
    const on = T[k] != null;
    li.classList.toggle('is-on', on && !(k === 'permission' && waiting));
    li.classList.toggle('is-wait', k === 'permission' && !!waiting);
    li.classList.toggle('is-now', on && i === last && L.doneMs == null && L.stopMs == null && !(k === 'permission' && waiting));
    let at = on ? fmtShort(T[k]) : '';
    if (k === 'price' && on && L.quoteTotal != null) at = `${money(L.quoteTotal)} USDC`;
    if (k === 'permission' && waiting) at = 'waiting';
    if (k === 'permission' && L.decision === 'no') at = 'not now';
    if (k === 'pay' && L.receipt) at = fmtShort(L.paidAt);
    else if (k === 'pay' && on) at = '402, signing';
    $('.at', li).textContent = at;
  });
  const frac = last <= 0 ? 0 : last / 3;
  const done = L.receipt ? 1 : frac;
  $('#track4 .rail i').style.width = `${done * 100}%`;
}

function renderTokens() {
  const u = S.usage['1'];
  const el = $('#tokens');
  if (!u) { el.classList.add('is-empty'); $('.t-num', el).textContent = S.t0 ? 'none reported yet' : 'none yet'; $('.t-bar .in', el).style.width = '0'; $('.t-bar .out', el).style.width = '0'; return; }
  el.classList.remove('is-empty');
  const total = u.in + u.out || 1;
  $('.t-bar .in', el).style.width = `${(u.in / total) * 100}%`;
  $('.t-bar .out', el).style.width = `${(u.out / total) * 100}%`;
  $('.t-num', el).innerHTML = `<b>${fmtInt(u.in + u.out)}</b> &nbsp;in ${fmtInt(u.in)} · out ${fmtInt(u.out)}${u.turns != null ? ` · ${u.turns} turns` : ''}`;
}

const feedDom = new Map();
function feedLi(item) {
  const li = document.createElement('li');
  li.className = `f-${item.kind}`;
  fillFeedLi(li, item);
  return li;
}
function fillFeedLi(li, item) {
  const t = `<span class="f-t">${fmtShort(item.t)}</span>`;
  if (item.kind === 'req') {
    const s = Number(item.status);
    const sc = s === 402 ? 's402' : s >= 500 ? 's5' : s >= 400 ? 's4' : 's2';
    const n = item.n > 1 ? ` <span class="f-b">×${item.n}</span>` : '';
    li.innerHTML = `<div class="f-line">${t}<span class="f-m">${esc(item.method)}</span><span class="f-p">${esc(item.path)}</span>${n}<span class="f-s ${sc}">${esc(item.status)}</span><span class="f-b">${esc(fmtBytes(item.bytes))}</span></div>${item.summary ? `<div class="f-sum">${esc(item.summary)}</div>` : ''}`;
  } else if (item.kind === 'tool') {
    li.innerHTML = `<div class="f-line">${t}<span class="f-cmd">${esc(item.cmd)}</span></div>`;
  } else {
    li.innerHTML = `<div class="f-line">${t}<span class="f-text">${esc(item.text)}</span></div>`;
  }
}
function renderFeed() {
  const list = $('#feed-list');
  const f = S.l1.feed;
  if (!f.length) return;
  const empty = $('.feed-empty', list);
  if (empty) empty.remove();
  const fresh = f.filter((it) => !feedDom.has(it.id));
  const instant = fresh.length > 3;
  for (const it of fresh) {
    const li = feedLi(it);
    if (instant) li.classList.add('no-anim');
    list.appendChild(li);
    feedDom.set(it.id, li);
  }
  for (const it of f) if (it.dirty) { const li = feedDom.get(it.id); if (li) fillFeedLi(li, it); it.dirty = false; }
  while (list.children.length > 26) { const first = list.firstElementChild; for (const [k, v] of feedDom) if (v === first) feedDom.delete(k); first.remove(); }
  const reqs = S.l1.reqs, tools = S.l1.tools;
  $('#feed-count').textContent = `${reqs} ${reqs === 1 ? 'request' : 'requests'}${tools ? ` · ${tools} ${tools === 1 ? 'command' : 'commands'}` : ''}`;
}

let phoneOrderId = null;
function phoneSrc(o) {
  const id = encodeURIComponent(o.orderId || '');
  if (MODE === 'sim') return `/approve/?sim=1&frame=1&order=${id}`;
  if (MODE === 'replay') return `/approve/?frame=1&state=pending&order=${id}`;
  return `/approve/?frame=1&order=${id}`;
}
function setPhone() {
  const o = S.l1.order;
  if (!o || phoneOrderId === o.orderId) return;
  phoneOrderId = o.orderId;
  const fr = $('#phone-frame');
  frameReady.phone = false;
  fr.onload = () => {
    frameReady.phone = true;
    if (MODE === 'sim') postToFrame('phone', { type: 'yescard.order', order: simOrder() });
    else if (MODE === 'replay') postToFrame('phone', { type: 'yescard.order', order: { orderId: o.orderId, total: o.total, approveUrl: o.approveUrl, status: 'awaiting_approval', lane: '1', quote: o.quote } });
    for (const ev of S.l1.orderEvents) postToFrame('phone', { type: 'event', event: ev });
  };
  fr.src = phoneSrc(o);
  // the path only: the laptop's address stays off the TV
  $('#wait-url').textContent = `/approve/?order=${o.orderId}`;
}
function renderMoment() {
  const L = S.l1;
  const m = $('#moment');
  let on = !!L.order && L.decision !== 'no' && L.stopMs == null;
  if (L.receipt) on = L.paidWall && now() - L.paidWall < 1800;
  m.classList.toggle('is-on', !!on);
  if (L.order) setPhone();
  // phone scale to fit the lane body
  const body = m.parentElement;
  const ps = Math.max(0.4, Math.min((body.offsetHeight - 28) / 844, (body.offsetWidth * 0.5 - 16) / 390));
  $('#phone').style.setProperty('--ps', ps.toFixed(3));
  const h3 = $('#wait h3');
  const line = $('#wait-line');
  if (L.decision === 'yes') {
    h3.textContent = 'You said yes';
    line.innerHTML = `Answered in <b>${fmtDur(L.decideAt - L.awaitAt)}</b>. The agent is paying now.`;
  } else {
    h3.textContent = 'Waiting for your yes';
    line.innerHTML = `The agent asked before paying <b>${money(L.order?.total ?? L.quoteTotal)} USDC</b>. It sent the order to your phone and stopped.`;
  }
}

function renderReceipt() {
  const L = S.l1;
  const r = $('#receipt');
  const feed = $('#feed');
  let html = '';
  if (L.receipt) {
    const R = L.receipt;
    const ledger = R.mode === 'ledger' || /^ledger-/.test(R.txHash || '');
    const net = ledger ? 'Local test ledger' : 'Arbitrum Sepolia, test network';
    const amount = money(R.amount ?? L.order?.total);
    const txText = ledger ? esc(R.txHash || 'ledger entry') : esc(shortHash(R.txHash));
    const link = !ledger && R.explorerUrl ? `<a href="${esc(R.explorerUrl)}" target="_blank" rel="noopener">${esc(R.explorerUrl.replace(/^https?:\/\//, '').replace(/(\/tx\/0x[0-9a-fA-F]{6})[0-9a-fA-F]+([0-9a-fA-F]{4})$/, '$1…$2'))}</a>` : (MODE === 'sim' ? '<span style="color:var(--ink-4)">no transaction in a simulation</span>' : '');
    const tickets = R.tickets?.length || L.order?.quote?.booking?.passengers?.length || null;
    html = `<div class="r-top"><span class="r-k">Paid${L.refunded ? ', then refunded' : ''}</span><span class="r-net">${net}</span></div>
      <div class="r-amount"><b>${amount} USDC</b><span>to Harbour Line</span></div>
      <dl class="r-rows">
        ${R.ref ? `<dt>Reference</dt><dd>${esc(R.ref)}${tickets ? ` · ${tickets} tickets` : ''}</dd>` : ''}
        <dt>Transaction</dt><dd class="mono">${txText}</dd>
        ${link ? `<dt>Explorer</dt><dd>${link}</dd>` : ''}
        <dt>Paid at</dt><dd>${fmtShort(L.paidAt)} after the start${L.decideAt != null ? (L.paidAt - L.decideAt < 150 ? ', right after your yes' : `, ${fmtDur(L.paidAt - L.decideAt)} after your yes`) : ''}</dd>
      </dl>`;
    r.classList.remove('r-declined');
  } else if (L.decision === 'no') {
    html = `<div class="r-top"><span class="r-k">Not paid</span><span class="r-net">Nothing left the wallet</span></div>
      <div class="r-amount"><b>0.00 USDC</b><span>You said not now</span></div>
      <dl class="r-rows"><dt>Answered</dt><dd>${fmtDur(L.decideAt - L.awaitAt)} after the agent asked</dd></dl>`;
    r.classList.add('r-declined');
  }
  if (html) {
    if (r.dataset.html !== html) { r.innerHTML = html; r.dataset.html = html; }
    r.classList.add('is-on');
    feed.style.paddingBottom = `${r.offsetHeight + 10}px`;
  } else {
    r.classList.remove('is-on');
    r.dataset.html = '';
    feed.style.paddingBottom = '';
  }
}

function renderResults() {
  const el = $('#results');
  const show = S.resultsForced ?? S.results;
  el.classList.toggle('is-on', !!show);
  if (!show) return;
  const L = S.l1;
  const lanes = [
    { l: 1, c: 'var(--lane-1)', who: 'Agent', door: 'agent door', ms: lane1End(), steps: steps1(), stepsNote: L.tools ? 'commands' : 'requests', usage: S.usage['1'], na: 'not reported', stopped: L.doneMs == null && L.stopMs != null },
    { l: 2, c: 'var(--lane-2)', who: 'Agent', door: 'human door', ms: S.w[2].doneMs, steps: stepsW(S.w[2]), stepsNote: S.w[2].errors ? `${S.w[2].errors} ${S.w[2].errors === 1 ? 'error' : 'errors'}` : 'clicks and fields', usage: S.usage['2'], na: 'not recorded', missing: lane2Missing },
    { l: 3, c: 'var(--lane-3)', who: 'You', door: 'human door', ms: S.w[3].doneMs, steps: stepsW(S.w[3]), stepsNote: S.w[3].errors ? `${S.w[3].errors} ${S.w[3].errors === 1 ? 'error' : 'errors'}` : 'clicks and fields', usage: S.usage['3'], na: 'none, a person' },
  ];
  const finished = lanes.filter((x) => x.ms != null && !x.stopped);
  const max = Math.max(1, ...lanes.map((x) => (x.ms != null ? x.ms : S.t0 && !x.missing ? rel() : 0)));
  const best = finished.length ? Math.min(...finished.map((x) => x.ms)) : null;
  let rows = '';
  lanes.forEach((x, i) => {
    const lastc = i === lanes.length - 1 ? ' last' : '';
    const ms = x.ms != null ? x.ms : S.t0 && !x.missing ? rel() : null;
    const w = ms != null ? (ms / max) * 100 : 0;
    let bar;
    let split = '';
    if (x.l === 1 && L.awaitAt != null) {
      const work = L.awaitAt, waitEnd = L.decideAt ?? (ms ?? L.awaitAt);
      const wait = Math.max(0, waitEnd - L.awaitAt);
      const rest = ms != null ? Math.max(0, ms - waitEnd) : 0;
      bar = `<i class="seg-work" style="width:${(work / max) * 100}%"></i><i class="seg-wait" style="left:${(work / max) * 100}%;width:${(wait / max) * 100}%"></i>${rest ? `<i class="seg-pay" style="left:${(waitEnd / max) * 100}%;width:${(rest / max) * 100}%"></i>` : ''}`;
      split = `<div class="res-split"><span class="k-work">Agent working <b>${fmtDur(work + rest)}</b></span><span class="k-wait">Waiting for your yes <b>${fmtDur(wait)}</b></span></div>`;
    } else {
      bar = `<i class="seg-work" style="width:${w}%"></i>`;
    }
    const time = x.ms == null ? `<div class="c res-time is-na${lastc}">${x.missing ? 'no recording' : S.t0 ? 'still going' : 'not run'}</div>` : `<div class="c res-time${x.ms === best ? ' is-best' : ''}${lastc}">${fmtClock(x.ms)}</div>`;
    const tokens = x.usage ? `<div class="c res-tokens${lastc}">${fmtK(x.usage.in + x.usage.out)}<small>in ${fmtInt(x.usage.in)} · out ${fmtInt(x.usage.out)}</small></div>` : `<div class="c res-tokens is-na${lastc}">${x.na}</div>`;
    rows += `<div class="c${lastc}" style="--c:${x.c}"><div class="res-name"><i></i>${x.who}<span>· ${x.door}</span></div></div>
      <div class="c${lastc}" style="--c:${x.c}"><div class="res-bar">${bar}</div>${split}</div>
      ${time}
      <div class="c res-steps${lastc}">${x.steps}<small>${x.stepsNote}</small></div>
      ${tokens}`;
  });
  const html = `<div class="res-head"><h2>Result</h2><span>Times from the start of the race. Lane 1 includes the wait for your yes.</span></div>
    <div class="res-grid"><div class="h">Lane</div><div class="h">Time, on one scale</div><div class="h r">Time</div><div class="h r">Steps</div><div class="h r">Tokens</div>${rows}</div>`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}

// timers: every frame, text only
let lastTick = '';
function tick(force) {
  const t = S.t0 ? rel() : 0;
  const parts = [];
  const tl1 = !S.t0 ? 0 : lane1End() ?? t;
  const tl2 = !S.t0 || lane2Missing ? 0 : S.w[2].doneMs ?? t;
  const tl3 = !S.t0 ? 0 : S.w[3].doneMs ?? t;
  const global = allDone() ? Math.max(lane1End(), S.w[2].doneMs, S.w[3].doneMs) : t;
  parts.push(fmtClock(tl1), fmtClock(tl2), fmtClock(tl3), fmtClock(global));
  const L = S.l1;
  let wait = 0;
  if (L.awaitAt != null) wait = (L.decideAt ?? (lane1End() ?? t)) - L.awaitAt;
  parts.push(fmtClock(wait));
  const sig = parts.join('|') + (L.decision || '');
  if (!force && sig === lastTick) return;
  lastTick = sig;
  $('[data-timer]', laneEl[1]).textContent = parts[0];
  $('[data-timer]', laneEl[2]).textContent = parts[1];
  $('[data-timer]', laneEl[3]).textContent = parts[2];
  $('#clock-num').textContent = parts[3];
  $('#clock').classList.toggle('is-done', !!allDone());
  const wt = $('#wait-timer');
  wt.textContent = parts[4];
  wt.classList.toggle('is-done', !!L.decision);
  if (L.receipt && L.paidWall && now() - L.paidWall >= 1800 && $('#moment').classList.contains('is-on')) schedule();
}
function loop() { tick(false); requestAnimationFrame(loop); }

// ------------------------------------------------------------ frames ---
const frameReady = { 2: false, 3: false, phone: false };
const frameWaiters = { 2: [], 3: [] };
function frameEl(k) { return k === 'phone' ? $('#phone-frame') : $(`#frame-${k}`); }
function whenFrameReady(k) { return frameReady[k] ? Promise.resolve() : new Promise((r) => frameWaiters[k].push(r)); }
function postToFrame(k, msg) {
  if (!frameReady[k]) return;
  try { frameEl(k).contentWindow.postMessage(msg, '*'); } catch {}
}
function postToSites(msg) { postToFrame(2, msg); postToFrame(3, msg); }

function siteSrc(l) {
  if (l === 2) {
    const rec = MODE === 'replay' && replayData?.replay;
    const file = rec && rec !== 'sim' && !/^race-/.test(rec) && !P.get('lane2') ? basename(rec) : LANE2_FILE;
    return `/ferry/?lane=2&replay=${encodeURIComponent(file)}`;
  }
  if (MODE === 'replay' && replayData?.lane3Session) return `/ferry/?lane=3&replay=${encodeURIComponent(`session-${replayData.lane3Session}.jsonl`)}`;
  return '/ferry/?lane=3';
}
function loadSite(l) {
  const fr = frameEl(l);
  frameReady[l] = false;
  fr.onload = () => {
    if (fr.src === 'about:blank' || fr.getAttribute('src') === 'about:blank') return;
    frameReady[l] = true;
    const w = frameWaiters[l]; frameWaiters[l] = []; w.forEach((r) => r());
  };
  const src = siteSrc(l);
  fr.src = src;
  $('[data-url]', laneEl[l]).textContent = `${location.host || 'localhost'}${src.replace(/&replay=.*$/, '')}`;
}
function reloadSites() {
  if (now() - framesReloadedAt < 1500) return;
  framesReloadedAt = now();
  loadSite(2); loadSite(3);
}
function layoutSites() {
  for (const l of [2, 3]) {
    const view = $('[data-view]', laneEl[l]);
    const fr = frameEl(l);
    const W = view.offsetWidth, H = view.offsetHeight;
    const logical = l === 2 ? 600 : Math.max(640, W);
    const s = W / logical;
    fr.style.width = `${logical}px`;
    fr.style.height = `${Math.ceil(H / s)}px`;
    fr.style.transform = `scale(${s})`;
  }
}

// ------------------------------------------------------------ control ---
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('is-on'), ms);
}
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json().catch(() => ({}));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startPressed() {
  if (MODE === 'sim') { runTimeline(simEvents, 0); return; }
  if (MODE === 'replay') { if (replayData) runTimeline(() => replayData.events, 0, replayData.t0); else toast('The recording is not loaded yet'); return; }
  const finished = S.t0 && (allDone() || S.results);
  const running = S.t0 && !finished;
  if (running && now() - lastSPress > 1600) { lastSPress = now(); toast('A race is running. Press S again to restart it.'); return; }
  lastSPress = 0;
  try {
    if (S.t0) {
      toast('Resetting, then starting', 2200);
      await post('/race/reset');
      resetAll({ reloadFrames: true });
      await Promise.race([Promise.all([whenFrameReady(2), whenFrameReady(3)]), sleep(3000)]);
      await sleep(500);
    }
    await post('/race/start', { replay: LANE2_FILE });
  } catch (e) {
    toast('Could not reach the server to start the race');
  }
}
async function resetPressed() {
  if (MODE !== 'live') { stopTimeline(); resetAll({ reloadFrames: true }); return; }
  try { await post('/race/reset'); } catch { toast('Server not reachable. Reset on this screen only.'); }
  resetAll({ reloadFrames: true });
}
function toggleResults() {
  const cur = S.resultsForced ?? S.results;
  S.resultsForced = !cur;
  schedule();
}
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); startPressed(); }
  else if (k === 'r') { e.preventDefault(); resetPressed(); }
  else if (k === 'f') { e.preventDefault(); fullscreen(); }
  else if (k === 'd') { e.preventDefault(); toggleResults(); }
});
addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  // only the parent page (the deck) may drive the board
  if (e.source !== parent || parent === window) return;
  if (d.type === 'race.start') startPressed();
  else if (d.type === 'race.reset') resetPressed();
  else if (d.type === 'results') { S.resultsForced = d.show == null ? !(S.resultsForced ?? S.results) : !!d.show; schedule(); }
});

// ------------------------------------------------ timelines (sim, replay) ---
function stopTimeline() { playTimers.forEach(clearTimeout); playTimers = []; }
function runTimeline(makeEvents, atSec = 0, sourceT0 = null) {
  stopTimeline();
  const localT0 = now() - atSec * 1000;
  let evs = makeEvents(localT0);
  if (sourceT0 != null) {
    evs = evs.map((e) => {
      const x = { ...e, t: e.t - sourceT0 + localT0 };
      if (x.type === 'race.start') x.t0 = localT0;
      return x;
    });
    if (!evs.some((e) => e.type === 'race.start')) evs.unshift({ type: 'race.start', lane: 'sys', t: localT0, t0: localT0 });
  }
  seen = new Set();
  const due = [];
  for (const ev of evs) {
    const delay = ev.t - now();
    if (delay <= 0) due.push(ev);
    else playTimers.push(setTimeout(() => apply(ev), delay));
  }
  for (const ev of due) apply(ev, { instant: true });
  // a recorded race also restarts the recorded websites (lane 2, and lane 3 when its session is known)
  // (wait for each frame: a message sent before the page has loaded is lost; t0 lets a late page catch up)
  if (MODE === 'replay') [2, 3].forEach((k) => whenFrameReady(k).then(() => postToFrame(k, { type: 'race.start', t0: localT0, seek: now() - localT0 })));
  schedule();
}

async function loadReplay(file) {
  const r = await fetch(`/race/recordings/${encodeURIComponent(file)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`recording ${r.status}`);
  const text = (await r.text()).trim();
  let events = [], t0 = null, whole = null;
  try { whole = JSON.parse(text); } catch { whole = null; }
  if (Array.isArray(whole)) events = whole;
  else if (whole && Array.isArray(whole.events)) { events = whole.events; t0 = whole.t0 || null; }
  else if (whole && whole.type) events = [whole];
  else {
    for (const line of text.split('\n')) { const s = line.trim(); if (!s) continue; try { events.push(JSON.parse(s)); } catch {} }
  }
  events = events.filter((e) => e && e.type && typeof e.t === 'number').sort((a, b) => a.t - b.t);
  const startIdx = events.findLastIndex ? events.findLastIndex((e) => e.type === 'race.start') : -1;
  if (startIdx > 0) events = events.slice(startIdx);
  const st = events.find((e) => e.type === 'race.start');
  t0 = Number(st?.t0 || t0 || events[0]?.t || now());
  events = events.filter((e) => e.type !== 'race.reset');
  const l3 = events.find((e) => String(e.lane) === '3' && e.sessionId);
  return { events, t0, lane3Session: l3 ? l3.sessionId : null, replay: st?.replay || null };
}

// --------------------------------------------------------------- live ---
async function fetchState() {
  const r = await fetch('/race/state', { cache: 'no-store' });
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json();
}
function rebuild(st) {
  S = fresh();
  seen = new Set();
  clearLaneDom();
  if (st && st.t0) {
    const evs = (st.events || []).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
    if (!evs.some((e) => e.type === 'race.start')) apply({ type: 'race.start', lane: 'sys', t: st.t0, t0: st.t0 }, { instant: true, fromState: true });
    for (const ev of evs) apply(ev, { instant: true, fromState: true });
    if (st.running === false && !allDone() && lane1End() == null && !S.w[2].doneMs && !S.w[3].doneMs) S.running = false;
  }
  schedule();
}
function connectLive() {
  let buffer = null;
  let es;
  const open = () => {
    es = new EventSource('/events');
    buffer = [];
    es.onmessage = (m) => {
      let ev;
      try { ev = JSON.parse(m.data); } catch { return; }
      if (buffer) buffer.push(ev); else apply(ev);
    };
    es.onopen = async () => {
      connected = true;
      buffer = buffer || [];
      try { rebuild(await fetchState()); } catch {}
      bootSynced = true;
      const b = buffer; buffer = null;
      for (const ev of b) apply(ev);
      schedule();
    };
    es.onerror = () => {
      connected = false;
      buffer = buffer || [];
      schedule();
      if (es.readyState === EventSource.CLOSED) { setTimeout(open, 2000); }
    };
  };
  open();
}

// --------------------------------------------------------------- boot ---
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.setProperty('--scale', String(s));
}
function buildTracks() {
  for (const l of [2, 3]) {
    $('[data-track7]', laneEl[l]).innerHTML = STEPS7.map((s) => `<li><span class="bar"></span><span class="lbl">${s.label}</span></li>`).join('');
  }
}

function boot() {
  if (EMBED) {
    document.body.classList.add('is-embed');
    $('#head').hidden = true;
    const b = document.createElement('span');
    b.id = 'embed-badge';
    b.hidden = true;
    stage.appendChild(b);
  }
  buildTracks();
  fit();
  addEventListener('resize', () => { fit(); layoutSites(); schedule(); });
  layoutSites();
  loadSite(2);
  loadSite(3);
  render();
  requestAnimationFrame(loop);
  if (document.fonts) document.fonts.ready.then(() => { layoutSites(); schedule(); });

  if (MODE === 'sim') {
    // a simulation starts by itself; ?simAt=<seconds> jumps into it
    setTimeout(() => runTimeline(simEvents, AT ?? 0), AT != null ? 0 : 1200);
  } else if (MODE === 'replay') {
    loadReplay(REPLAY_FILE).then((d) => {
      replayData = d;
      if (d.replay && !/^race-/.test(d.replay) && !P.get('lane2') && basename(d.replay) !== LANE2_FILE) loadSite(2);
      if (d.lane3Session) loadSite(3);
      // A race recorded without lane 2: say so instead of running its clock for ever.
      const has2 = (d.events || []).some((e) => String(e.lane) === '2' && (e.type === 'lane.done' || (/^web\./.test(e.type) && e.type !== 'web.view')));
      if (!has2) checkLane2(d.replay && !/^race-/.test(d.replay) && !P.get('lane2') ? basename(d.replay) : LANE2_FILE);
      schedule();
      if (AUTOPLAY || AT != null) runTimeline(() => d.events, AT ?? 0, d.t0);
    }).catch(() => { toast(`Could not load the recording ${REPLAY_FILE}`, 6000); });
  } else {
    connectLive();
    checkLane2(LANE2_FILE);
  }
}
// Lane 2 plays a recording. When the file is not there, the lane says so and is left out of "all done".
function checkLane2(file) {
  fetch(`/race/recordings/${encodeURIComponent(file)}`, { cache: 'no-store' }).then(async (r) => {
    if (r.ok) {
      // Say when the recording was made, from its own first event.
      try {
        const line = (await r.text()).split('\n').find((l) => l.trim());
        const first = line ? JSON.parse(line) : null;
        const t = first && first.t ? new Date(first.t) : null;
        const tag = document.querySelector('#lane-2 .lane-tag.is-rec');
        if (tag && t && !isNaN(t)) tag.textContent = `Recorded ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, real speed`;
      } catch { /* keep the default tag */ }
      return;
    }
    lane2Missing = true;
    S.w[2].status = LANE2_MISSING_STATUS;
    // Do not claim a recording that is not there.
    const tag = document.querySelector('#lane-2 .lane-tag.is-rec');
    if (tag) tag.textContent = 'No recording yet';
    schedule();
  }).catch(() => {});
}
boot();
