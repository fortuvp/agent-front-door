// The one server for the talk: deck, race board, yes card, the talk's door, and the Harbour Line
// shop (human door + agent door + API + x402 payments). Node 22, ESM, only dependency: viem.
//   PORT=4900 (default) · HOST=0.0.0.0 · PAY_MODE=ledger|testnet · LANE1=auto · PUBLIC_URL=http://<lan-ip>:4900
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as shop from "../shop/data.mjs";
import * as pay from "./pay.mjs";
import { createStore, randomId } from "./store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4900);
const HOST = process.env.HOST || "0.0.0.0";
const REC_DIR = join(ROOT, "race", "recordings");
const RACE_LANES = (process.env.RACE_LANES || "1,2,3").split(",").map((s) => s.trim()).filter(Boolean);
const LINK_FERRY = '</ferry/llms.txt>; rel="llms-txt", </ferry/SKILL.md>; rel="agent-skill"';
const LINK_TALK = '</talk/llms.txt>; rel="llms-txt", </talk.md>; rel="alternate"; type="text/markdown"';

const DIRS = {
  deck: join(ROOT, "deck"),
  board: join(ROOT, "race", "board"),
  approve: join(ROOT, "race", "approve"),
  door: join(ROOT, "door"),
  web: join(ROOT, "web", "ferry"),
  shopDoor: join(ROOT, "shop", "door"),
  shop: join(ROOT, "shop"),
};

function lanAddress() {
  const ifs = os.networkInterfaces();
  const names = Object.keys(ifs).sort((a, b) => (/^en\d/.test(a) ? 0 : 1) - (/^en\d/.test(b) ? 0 : 1) || a.localeCompare(b));
  for (const name of names) {
    if (/^(utun|awdl|llw|bridge|vmnet|docker|lo)/.test(name)) continue;
    for (const a of ifs[name] || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}
const LAN = lanAddress();
const LOCAL_BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC_BASE = (process.env.PUBLIC_URL || `http://${LAN || "127.0.0.1"}:${PORT}`).replace(/\/$/, "");

const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB", { hour12: false }), ...a);
// One state file per port, so test servers on other ports never overwrite the stage server's orders.
const STORE_FILE = process.env.STORE_FILE || join(ROOT, "server", "state", PORT === 4900 ? "store.json" : `store-${PORT}.json`);
const store = createStore(STORE_FILE);

// ---------------------------------------------------------------- events, SSE, race

const clients = new Set();
const race = { t0: null, replay: null, events: [], file: null, done: {}, finished: false, lane1: null };
let pendingSince = 0;

function emit(type, lane, data = {}) {
  const { t, ...rest } = data;
  const ev = { t: Number.isFinite(t) && Math.abs(t - Date.now()) < 86_400_000 ? t : Date.now(), lane: String(lane), type, ...rest };
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) {
    try {
      c.write(line);
    } catch {
      clients.delete(c);
    }
  }
  if (race.t0) {
    race.events.push(ev);
    try {
      appendFileSync(race.file, `${JSON.stringify(ev)}\n`);
    } catch (e) {
      log(`[race] could not write ${race.file}: ${e.message}`);
    }
    afterRaceEvent(ev);
  }
  return ev;
}

function laneSteps(lane) {
  const evs = race.events.filter((e) => e.lane === lane);
  if (lane === "1") {
    const tools = evs.filter((e) => e.type === "agent.tool").length;
    const requests = evs.filter((e) => e.type === "agent.request").length;
    return { steps: tools || requests, tools, requests };
  }
  const seen = new Set();
  let steps = 0;
  // Count one page only: a second open board would replay lane 2 again and double the count.
  const first = evs.find((e) => /^web\./.test(e.type) && e.sessionId);
  const sid = first ? first.sessionId : null;
  for (const e of evs) {
    if (sid && e.sessionId && e.sessionId !== sid) continue;
    if (e.type === "web.click" || e.type === "web.submit") steps++;
    else if (e.type === "web.field") {
      const k = `${e.step}|${e.field}`;
      if (!seen.has(k)) {
        seen.add(k);
        steps++;
      }
    }
  }
  return { steps };
}

function laneDone(lane, ev, extra = {}) {
  if (!race.t0 || race.done[lane]) return;
  const counted = laneSteps(lane);
  const steps = Number.isFinite(extra.steps) ? extra.steps : counted.steps;
  race.done[lane] = { ms: ev.t - race.t0, steps };
  // the event's own lane is the lane that finished
  emit("lane.done", lane, { ms: ev.t - race.t0, steps, ...(lane === "1" ? { tools: counted.tools, requests: counted.requests } : {}) });
  if (raceLanes().every((l) => race.done[l])) finishRace();
}

function afterRaceEvent(ev) {
  if (ev.type === "order.paid" && ev.lane === "1") laneDone("1", ev);
  if (ev.type === "web.done" && (ev.lane === "2" || ev.lane === "3")) laneDone(ev.lane, ev, { steps: Number(ev.steps) });
}

function finishRace() {
  if (!race.t0 || race.finished) return;
  race.finished = true;
  writeLatest();
  log(`[race] finished: ${Object.entries(race.done).map(([l, d]) => `lane ${l} ${(d.ms / 1000).toFixed(1)} s`).join(", ")}`);
}

function writeLatest() {
  try {
    writeFileSync(join(REC_DIR, "race-latest.json"), JSON.stringify({ t0: race.t0, replay: race.replay, finished: race.finished, done: race.done, file: race.file ? race.file.split(sep).pop() : null, events: race.events }, null, 0));
  } catch (e) {
    log(`[race] could not write race-latest.json: ${e.message}`);
  }
}

// Lane 2 plays a recording (race.start's `replay`, default lane2-ferry.json). When that file is not
// in race/recordings/, lane 2 cannot finish, so the race finishes without it.
function raceLanes() {
  const file = race.replay && !/^race-/.test(race.replay) ? race.replay : "lane2-ferry.json";
  return RACE_LANES.filter((l) => l !== "2" || existsSync(join(REC_DIR, file)));
}

function startRace(replay) {
  if (race.t0) clearRace();
  mkdirSync(REC_DIR, { recursive: true });
  const t0 = Date.now();
  Object.assign(race, { t0, replay: replay || null, events: [], file: join(REC_DIR, `race-${t0}.jsonl`), done: {}, finished: false });
  emit("race.start", "sys", { t: t0, t0, ...(replay ? { replay } : {}) });
  if ((process.env.LANE1 || "auto").toLowerCase() === "auto") spawnLane1();
  log(`[race] start t0=${t0}${replay ? ` replay=${replay}` : ""} · recording ${race.file.split(sep).pop()}`);
  return t0;
}

function clearRace() {
  killLane1();
  if (race.finished) writeLatest(); // keep events that came after the finish (a refund, say)
  Object.assign(race, { t0: null, replay: null, events: [], file: null, done: {}, finished: false });
}

// Keep the test wallet topped up with no terminal step: every paid agent order on the test network is
// refunded by itself on a race reset and at server start (never during a race). AUTO_REFUND=0 turns it off.
let refunding = false;
async function autoRefundPaid(why) {
  if (process.env.AUTO_REFUND === "0" || refunding) return;
  refunding = true;
  try {
    const due = store.listOrders().map(refreshOrder).filter((o) => o && o.channel === "agent" && o.status === "paid" && o.receipt && o.receipt.mode === "testnet" && !o.refund);
    for (const o0 of due) {
      await withLock(o0.orderId, async () => {
        const o = refreshOrder(store.getOrder(o0.orderId));
        if (!o || o.status !== "paid") return;
        try {
          const r = await pay.refund({ to: o.receipt.payer, amountAtomic: o.receipt.amountAtomic, mode: o.receipt.mode });
          o.status = "refunded";
          o.refund = { ...r, amount: o.total, amountText: o.totalText, to: o.receipt.payer || null, refundedAt: nowIso(), auto: true };
          store.putOrder(o);
          log(`[pay] ${o.orderId} refunded by itself (${why}) ${o.totalText} USDC · ${r.txHash}`);
        } catch (e) {
          log(`[pay] auto refund failed for ${o.orderId}: ${e.shortMessage || e.message} (refund by hand: ./bin/ferry refund ${o.orderId})`);
        }
      });
    }
  } finally {
    refunding = false;
  }
}

function resetRace() {
  emit("race.reset", "sys", {});
  clearRace();
  pendingSince = Date.now();
  log("[race] reset");
  autoRefundPaid("race reset");
}

function spawnLane1() {
  killLane1();
  const script = join(ROOT, "race", "lane1.mjs");
  if (!existsSync(script)) {
    log("[lane1] race/lane1.mjs is missing; lane 1 not started");
    return;
  }
  const child = spawn(process.execPath, [script, "--server", LOCAL_BASE], { cwd: ROOT, env: { ...process.env, FERRY_SHOP: `${LOCAL_BASE}/ferry` }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const pipe = (stream) => stream.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => log(`[lane1] ${l}`)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code, signal) => {
    log(`[lane1] exited (${signal || code})`);
    if (race.lane1 === child) race.lane1 = null;
  });
  race.lane1 = child;
  log(`[lane1] started (pid ${child.pid})`);
}

function killLane1() {
  const child = race.lane1;
  race.lane1 = null;
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

function openSse(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 2000\n: connected\n\n");
  clients.add(res);
  req.socket.setTimeout(0);
  req.on("close", () => clients.delete(res));
}
setInterval(() => {
  for (const c of clients) {
    try {
      c.write(": ping\n\n");
    } catch {
      clients.delete(c);
    }
  }
}, 15_000).unref();

// ---------------------------------------------------------------- http helpers

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};
const typeFor = (file) => TYPES[extname(file).toLowerCase()] || "application/octet-stream";

function sendJson(res, status, obj, headers = {}) {
  const body = Buffer.from(JSON.stringify(obj, null, 2));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store", ...headers });
  res.end(body);
}
function sendText(res, status, text, type = "text/plain; charset=utf-8", headers = {}) {
  const body = Buffer.from(text);
  res.writeHead(status, { "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-store", ...headers });
  res.end(body);
}
const notFound = (res, msg, headers) => sendText(res, 404, `${msg}\n`, "text/plain; charset=utf-8", headers);
function redirect(res, status, location) {
  res.writeHead(status, { Location: location, "Content-Length": 0 });
  res.end();
}

function safeJoin(base, rel) {
  const parts = decodeURIComponent(rel).split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p.startsWith(".") || p === "node_modules")) return null;
  const full = normalize(join(base, ...parts));
  return full === base || full.startsWith(base + sep) ? full : null;
}

function fileAt(path) {
  try {
    let st = statSync(path);
    if (st.isDirectory()) {
      path = join(path, "index.html");
      st = statSync(path);
    }
    return st.isFile() ? path : null;
  } catch {
    return null;
  }
}

function serveFile(res, file, headers = {}) {
  const body = readFileSync(file);
  res.writeHead(200, { "Content-Type": typeFor(file), "Content-Length": body.length, "Cache-Control": "no-store", ...headers });
  res.end(body);
}

// Static folder; a missing folder or file is a plain 404, never a crash.
function serveStatic(res, base, rel, what, headers = {}) {
  const full = safeJoin(base, rel);
  let file = null;
  try {
    file = full && fileAt(full);
  } catch {
    file = null;
  }
  if (!file) {
    const urlPath = (res.req?.url || "").split("?")[0];
    const where = `${base.slice(ROOT.length + 1) || "."}/${rel}`.replace(/\/$/, "/index.html");
    return notFound(res, `Not found: ${urlPath}\n${what.trim()}: nothing at ${where} yet.`, headers);
  }
  try {
    serveFile(res, file, headers);
  } catch (e) {
    sendText(res, 500, `Could not read ${file.slice(ROOT.length + 1)}: ${e.message}\n`);
  }
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJson(req) {
  const text = await readBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Body is not valid JSON"), { status: 400 });
  }
}

function parseAccept(header) {
  return String(header || "")
    .split(",")
    .map((part, index) => {
      const [type, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { type: type.trim(), q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((x) => x.type);
}
// Markdown when Accept lists text/markdown before text/html (or with a higher q), or ?format=md.
function wantsMarkdown(req, url) {
  const f = (url.searchParams.get("format") || "").toLowerCase();
  if (f === "md" || f === "markdown") return true;
  if (f === "html") return false;
  const items = parseAccept(req.headers.accept);
  const md = items.find((i) => i.type === "text/markdown" || i.type === "text/x-markdown");
  if (!md || md.q === 0) return false;
  const html = items.find((i) => i.type === "text/html");
  if (!html || html.q === 0) return true;
  if (md.q !== html.q) return md.q > html.q;
  return md.index < html.index;
}

// A person's browser (the website, the board, the phone). Node's fetch sends Sec-Fetch-* headers
// too, so the test is the User-Agent: a browser engine, and no agent, tool or library name.
const isBrowser = (req) => {
  const ua = String(req.headers["user-agent"] || "");
  if (!/Mozilla\//.test(ua) || !/(AppleWebKit|Gecko|Firefox|Chrome|Safari)\//.test(ua)) return false;
  return !/(ferry-cli|bot\b|bot\/|crawl|spider|Claude|GPT|OpenAI|Perplexity|python|curl|wget|node|axios|undici|got\/)/i.test(ua);
};

function laneFromUrl(text) {
  try {
    const l = new URL(text, "http://x").searchParams.get("lane");
    return ["1", "2", "3"].includes(l) ? l : null;
  } catch {
    return null;
  }
}
// The presenter's laptop itself (127.0.0.1). A request to the laptop's LAN address counts as outside,
// even when the laptop sends it: open the deck and the board at 127.0.0.1.
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
function requestLane(req, url) {
  if (!isLocal(req)) return "x"; // outside devices cannot speak for lane 1, 2 or 3
  const h = String(req.headers["x-lane"] || "").trim();
  if (["1", "2", "3", "x"].includes(h)) return h;
  if (/^ferry-cli\//i.test(String(req.headers["user-agent"] || ""))) return "1";
  if (isBrowser(req)) return url.searchParams.get("lane") && laneFromUrl(url.href) ? laneFromUrl(url.href) : laneFromUrl(req.headers.referer || "") || "3";
  return "x";
}

const fmtBytes = (n) => (n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`);

// Every agent-door hit (a non-browser client on /ferry/ or /talk) becomes an agent.request event.
function trackAgentRequest(req, res, url, lane) {
  const started = performance.now();
  let bytes = 0;
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  res.write = (chunk, ...a) => {
    if (chunk) bytes += Buffer.byteLength(chunk);
    return write(chunk, ...a);
  };
  res.end = (chunk, ...a) => {
    if (chunk && typeof chunk !== "function") bytes += Buffer.byteLength(chunk);
    return end(chunk, ...a);
  };
  res.on("finish", () => {
    const ms = Math.round(performance.now() - started);
    let summary = typeof res.summary === "function" ? res.summary(bytes) : res.summary;
    if (!summary) summary = `${req.method} ${url.pathname}: ${res.statusCode}`;
    emit("agent.request", lane, { method: req.method, path: url.pathname + url.search, status: res.statusCode, bytes, ms, accept: req.headers.accept || "", summary });
  });
}

// ---------------------------------------------------------------- shop logic

const nowIso = () => new Date().toISOString();
const ref = () => `HL-${randomId("", 6).toUpperCase()}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const waiters = new Map(); // orderId -> Set<fn>

function notifyOrder(id) {
  const set = waiters.get(id);
  if (!set) return;
  waiters.delete(id);
  for (const fn of set) fn();
}
function waitForOrderChange(id, ms) {
  return new Promise((done) => {
    const set = waiters.get(id) || new Set();
    waiters.set(id, set);
    const fn = () => {
      clearTimeout(timer);
      set.delete(fn);
      done();
    };
    const timer = setTimeout(fn, ms);
    set.add(fn);
  });
}

function refreshOrder(o) {
  if (o && o.status === "awaiting_approval" && Date.parse(o.expiresAt) < Date.now()) {
    o.status = "declined";
    o.reason = "expired";
    o.decidedAt = nowIso();
    store.putOrder(o);
    emit("order.declined", o.lane, { orderId: o.orderId, reason: "expired" });
    notifyOrder(o.orderId);
  }
  return o;
}

function pendingOrders() {
  return store
    .listOrders()
    .map(refreshOrder)
    .filter((o) => o.status === "awaiting_approval" && Date.parse(o.createdAt) >= pendingSince)
    .map(publicOrder);
}

// The order as the yes card and the board need it: the quote is embedded as it stands for this
// order (its lines, total and alternatives; expiresAt = the order's own expiry, the time the yes is open).
function quoteForOrder(o) {
  const q = store.getQuote(o.quoteId);
  return {
    quoteId: o.quoteId,
    booking: o.booking,
    lines: o.lines,
    total: o.total,
    totalText: o.totalText,
    currency: o.currency || shop.CURRENCY,
    inrApprox: o.inrApprox,
    expiresAt: o.expiresAt,
    quoteExpiresAt: q?.expiresAt ?? null,
    alternatives: o.alternatives || [],
    summary: o.summary,
    checks: o.checks,
    cancellation: o.cancellation,
    network: o.network,
  };
}

function publicOrder(o) {
  const { totalCents, payment, ...rest } = o;
  return { ...rest, quote: quoteForOrder(o) };
}

function makeQuote(booking, lane) {
  const { lines, totalCents } = shop.priceBooking(booking);
  const quoteId = randomId("q-");
  const alternatives = shop.alternativesFor(booking);
  const now = Date.now();
  return {
    quoteId,
    booking,
    lines,
    total: shop.usdc(totalCents),
    totalText: shop.formatUsdc(totalCents),
    currency: shop.CURRENCY,
    inrApprox: shop.inrApprox(totalCents),
    inrNote: `approx. ${shop.inrApprox(totalCents)} INR at 1 USDC = ${shop.INR_PER_USDC} INR`,
    expiresAt: new Date(now + shop.QUOTE_MINUTES * 60_000).toISOString(),
    alternatives,
    summary: shop.describeBooking(booking),
    checks: shop.checkMission(booking),
    cancellation: shop.cancellationFor(booking.date),
    network: pay.NETWORK,
    createdAt: new Date(now).toISOString(),
    lane,
    totalCents,
  };
}
const publicQuote = ({ totalCents, ...q }) => q;

function shortSlot(b) {
  const cls = shop.getSeatClass(b.seatClass);
  return `${(cls?.label || b.seatClass).toLowerCase()} at ${b.departure}`;
}

function receiptFor(o, settled) {
  return {
    orderId: o.orderId,
    ref: o.ref,
    paidAt: nowIso(),
    amount: o.total,
    amountText: o.totalText,
    asset: "USDC",
    network: pay.NETWORK,
    mode: settled.mode,
    modeLabel: settled.modeLabel,
    txHash: settled.txHash,
    explorerUrl: settled.explorerUrl,
    confirmed: settled.confirmed,
    payer: settled.payer,
    payTo: settled.payTo,
    amountAtomic: settled.amountAtomic,
    tickets: shop.assignSeats(o.booking, o.orderId),
    summary: o.summary,
    cancellation: o.cancellation,
    ...(settled.fallbackReason ? { fallbackReason: settled.fallbackReason } : {}),
  };
}

const locks = new Map();
async function withLock(key, fn) {
  while (locks.has(key)) await locks.get(key).catch(() => {});
  const p = fn();
  locks.set(key, p);
  try {
    return await p;
  } finally {
    locks.delete(key);
  }
}

// ---------------------------------------------------------------- API routes

async function handleApi(req, res, url, lane, agentClient) {
  const p = url.pathname.replace(/^\/ferry\/api/, "").replace(/\/+$/, "") || "/";
  const m = req.method;

  if (m === "GET" && p === "/routes") {
    res.summary = "asked for the routes and prices";
    return sendJson(res, 200, shop.routesCatalogue());
  }

  if (m === "GET" && p === "/departures") {
    const route = url.searchParams.get("route") || "gateway-elephanta";
    const date = url.searchParams.get("date") || shop.DEMO_DATE;
    const out = shop.listDepartures(route, date);
    if (out.error) {
      res.summary = `asked for departures: ${out.error}`;
      return sendJson(res, 400, out);
    }
    res.summary = `asked for departures on ${shop.formatDateShort(date)}`;
    return sendJson(res, 200, out);
  }

  if (m === "GET" && p === "/status") {
    let balances = null;
    try {
      balances = await Promise.race([pay.balances(), new Promise((r) => setTimeout(() => r(null), 5000))]);
    } catch {
      balances = null;
    }
    res.summary = "asked for the shop status";
    return sendJson(res, 200, { operator: shop.OPERATOR.name, pay: pay.payStatus(), balances, publicUrl: PUBLIC_BASE, race: { t0: race.t0, running: !!race.t0 && !race.finished } });
  }

  if (m === "POST" && p === "/quote") {
    const body = await readJson(req);
    const raw = body.booking && typeof body.booking === "object" ? body.booking : body;
    const errors = shop.validateBooking(raw);
    if (errors.length) {
      const seats = errors.some((e) => /sold out|seats left/.test(e.message));
      res.summary = `quote refused: ${errors[0].message}`;
      return sendJson(res, seats ? 409 : 400, { error: errors.map((e) => e.message).join("; "), errors });
    }
    const booking = shop.normaliseBooking(raw);
    const q = store.putQuote(makeQuote(booking, lane));
    const n = booking.passengers.length;
    res.summary = `got a quote: ${q.totalText} USDC for ${plural(n, "person", "people")}, ${shortSlot(booking)}`;
    if (agentClient) emit("order.quoted", lane, { quoteId: q.quoteId, total: q.total, totalText: q.totalText, summary: q.summary });
    return sendJson(res, 200, publicQuote(q));
  }

  const qm = p.match(/^\/quotes\/([A-Za-z0-9_-]{1,40})$/);
  if (m === "GET" && qm) {
    const q = store.getQuote(qm[1]);
    res.summary = q ? `checked quote ${qm[1]}` : `asked for quote ${qm[1]}: not found`;
    return q ? sendJson(res, 200, publicQuote(q)) : sendJson(res, 404, { error: `No quote "${qm[1]}"` });
  }

  if (m === "GET" && p === "/orders") {
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
    const list = store
      .listOrders()
      .map(refreshOrder)
      .filter((o) => !status || o.status === status)
      .slice(0, limit)
      .map(publicOrder);
    res.summary = "listed orders";
    return sendJson(res, 200, { orders: list });
  }

  if (m === "POST" && p === "/orders") {
    const body = await readJson(req);
    const q = store.getQuote(String(body.quoteId || ""));
    if (!q) {
      res.summary = `booking refused: no quote ${body.quoteId ?? ""}`.trim();
      return sendJson(res, 404, { error: `No quote "${body.quoteId ?? ""}". Get a quote first: POST /ferry/api/quote` });
    }
    if (Date.parse(q.expiresAt) < Date.now()) {
      res.summary = "booking refused: the quote expired";
      return sendJson(res, 410, { error: "This quote has expired. Get a new quote." });
    }
    const channel = body.channel === "web" ? "web" : body.channel === "agent" || body.channel == null ? "agent" : null;
    if (!channel) return sendJson(res, 400, { error: 'channel must be "agent" or "web"' });
    if (channel === "agent") {
      // Booking the same quote again while its order still waits for a yes gives back that order,
      // so an agent that retries `ferry book` does not put a second yes card in front of the human.
      const open = store.listOrders().map(refreshOrder).find((x) => x.channel === "agent" && x.quoteId === q.quoteId && x.status === "awaiting_approval");
      if (open) {
        res.summary = `booked again: still waiting for the human's yes (${open.totalText} USDC)`;
        return sendJson(res, 202, { orderId: open.orderId, status: open.status, approveUrl: open.approveUrl, total: open.total, totalText: open.totalText, expiresAt: open.expiresAt, next: `Your human approves at the link. Then pay: POST /ferry/api/orders/${open.orderId}/pay (or: ferry wait ${open.orderId})` });
      }
    }
    const orderId = randomId("o-");
    const now = Date.now();
    const o = {
      orderId,
      quoteId: q.quoteId,
      channel,
      lane: channel === "agent" ? lane : requestLane(req, url),
      status: "awaiting_approval",
      total: q.total,
      totalText: q.totalText,
      totalCents: q.totalCents,
      currency: q.currency,
      inrApprox: q.inrApprox,
      approveUrl: `${PUBLIC_BASE}/approve/?order=${orderId}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + shop.ORDER_MINUTES * 60_000).toISOString(),
      agent: body.agent && typeof body.agent === "object" ? { name: String(body.agent.name || "an agent").slice(0, 80) } : channel === "agent" ? { name: "an agent" } : null,
      booking: q.booking,
      summary: q.summary,
      lines: q.lines,
      checks: q.checks,
      alternatives: q.alternatives,
      cancellation: q.cancellation,
      covers: `This order only, expires in ${shop.ORDER_MINUTES} minutes`,
      payTo: pay.shopAddress(),
      network: pay.NETWORK,
      asset: "USDC",
      alternativeId: null,
      decidedAt: null,
      ref: ref(),
      receipt: null,
      refund: null,
    };
    if (channel === "web") {
      const last4 = String(body.card?.last4 || "").replace(/\D/g, "");
      if (last4 !== "4242") {
        return sendJson(res, 402, { error: "card_declined", message: "Your card was declined. This shop only takes the test card 4242 4242 4242 4242." });
      }
      o.status = "paid";
      o.decidedAt = o.createdAt;
      o.receipt = { orderId, ref: o.ref, paidAt: o.createdAt, amount: o.total, amountText: o.totalText, asset: "USDC", network: null, mode: "test-card", modeLabel: "test card, no chain", txHash: null, explorerUrl: null, card: { last4 }, tickets: shop.assignSeats(o.booking, orderId), summary: o.summary };
      store.putOrder(o);
      return sendJson(res, 201, { orderId, status: "paid", ref: o.ref, receipt: o.receipt });
    }
    store.putOrder(o);
    res.summary = `booked: waiting for the human's yes (${o.totalText} USDC)`;
    scheduleAutoYes(orderId);
    emit("order.awaiting_approval", o.lane, { orderId, total: o.total, totalText: o.totalText, approveUrl: o.approveUrl, summary: o.summary, agent: o.agent, expiresAt: o.expiresAt, quote: quoteForOrder(o) });
    return sendJson(res, 202, { orderId, status: o.status, approveUrl: o.approveUrl, total: o.total, totalText: o.totalText, expiresAt: o.expiresAt, next: `Your human approves at the link. Then pay: POST /ferry/api/orders/${orderId}/pay (or: ferry wait ${orderId})` });
  }

  const om = p.match(/^\/orders\/([A-Za-z0-9_-]{1,40})(?:\/(approve|pay|refund))?$/);
  if (om) {
    const [, id, action] = om;
    let o = refreshOrder(store.getOrder(id));
    if (!o) {
      res.summary = `asked for order ${id}: not found`;
      return sendJson(res, 404, { error: `No order "${id}"` });
    }

    if (!action && m === "GET") {
      const wait = Math.min(Math.max(Number(url.searchParams.get("wait")) || 0, 0), 60);
      const started = Date.now();
      if (wait > 0 && o.status === "awaiting_approval") {
        await waitForOrderChange(id, wait * 1000);
        o = refreshOrder(store.getOrder(id));
      }
      const waited = (Date.now() - started) / 1000;
      const words = { awaiting_approval: "still waiting for a yes", approved: "approved", declined: "declined", paid: "paid", refunded: "refunded" }[o.status] || o.status;
      res.summary = wait > 0 ? `waited ${waited.toFixed(1)} s for the human's yes: ${words}` : `checked the order: ${words}`;
      return sendJson(res, 200, publicOrder(o));
    }

    if (action === "approve" && m === "POST") {
      // The yes is the human's. The agent's own tools (the ferry CLI, and lane 1's curl, which
      // sends X-Lane: 1) cannot give it; the yes card, the presenter's terminal and the deck can.
      const fromAgent = String(req.headers["x-lane"] || "").trim() === "1" || /^ferry-cli\//i.test(String(req.headers["user-agent"] || ""));
      if (fromAgent) {
        res.summary = "tried to say yes for the human: refused";
        return sendJson(res, 403, { error: "Only your human can say yes, on the yes card. Send them the approve link and wait.", approveUrl: o.approveUrl });
      }
      const body = await readJson(req);
      const d = String(body.decision || "").toLowerCase();
      const decision = ["yes", "approve", "approved", "true"].includes(d) ? "yes" : ["no", "decline", "declined", "false", "not now"].includes(d) ? "no" : null;
      if (!decision) return sendJson(res, 400, { error: 'decision must be "yes" or "no"' });
      return withLock(id, async () => {
        o = refreshOrder(store.getOrder(id));
        if (o.status !== "awaiting_approval") {
          res.summary = `tried to answer an order that is ${o.status}`;
          return sendJson(res, o.reason === "expired" ? 410 : 409, { error: o.reason === "expired" ? "This order expired. Ask for a new one." : `This order is already ${o.status}`, order: publicOrder(o) });
        }
        if (decision === "no") {
          o.status = "declined";
          o.reason = "declined";
          o.decidedAt = nowIso();
          store.putOrder(o);
          res.summary = "said no to the order";
          emit("order.declined", o.lane, { orderId: id, reason: "declined" });
          notifyOrder(id);
          return sendJson(res, 200, publicOrder(o));
        }
        if (body.alternativeId) {
          const alt = (o.alternatives || []).find((a) => a.id === body.alternativeId);
          if (!alt) return sendJson(res, 400, { error: `No alternative "${body.alternativeId}". Choices: ${(o.alternatives || []).map((a) => a.id).join(", ")}` });
          const priced = shop.priceBooking(alt.booking);
          Object.assign(o, {
            alternativeId: alt.id,
            chosen: alt.label,
            booking: alt.booking,
            lines: priced.lines,
            totalCents: priced.totalCents,
            total: shop.usdc(priced.totalCents),
            totalText: shop.formatUsdc(priced.totalCents),
            inrApprox: shop.inrApprox(priced.totalCents),
            summary: shop.describeBooking(alt.booking),
            checks: shop.checkMission(alt.booking),
          });
        }
        o.status = "approved";
        o.decidedAt = nowIso();
        store.putOrder(o);
        res.summary = `said yes to the order${o.alternativeId ? ` (chose: ${o.chosen})` : ""}`;
        emit("order.approved", o.lane, { orderId: id, total: o.total, totalText: o.totalText, ...(o.alternativeId ? { alternativeId: o.alternativeId, label: o.chosen } : {}) });
        notifyOrder(id);
        return sendJson(res, 200, publicOrder(o));
      });
    }

    if (action === "pay" && m === "POST") {
      const header = req.headers["x-payment"];
      return withLock(id, async () => {
        o = refreshOrder(store.getOrder(id));
        if (o.status === "paid" || o.status === "refunded") {
          res.summary = `asked to pay again: already ${o.status}`;
          return sendJson(res, 200, { receipt: o.receipt, status: o.status, already: true });
        }
        if (o.channel !== "agent") return sendJson(res, 409, { error: "This order was paid by card on the website" });
        if (o.status === "awaiting_approval") {
          res.summary = "tried to pay before the human's yes: refused";
          return sendJson(res, 409, { error: "Waiting for your human's yes. Nothing can be paid before it.", status: o.status, approveUrl: o.approveUrl });
        }
        if (o.status === "declined") {
          res.summary = "tried to pay a declined order: refused";
          return sendJson(res, 409, { error: o.reason === "expired" ? "This order expired before a yes. Nothing was paid." : "Your human said no. Nothing was paid.", status: o.status });
        }
        const route = shop.getRoute(o.booking.route);
        const requirement = pay.paymentRequirements({
          amountAtomic: pay.toAtomic(o.totalCents),
          resource: `http://${req.headers.host || `127.0.0.1:${PORT}`}/ferry/api/orders/${id}/pay`,
          description: `Harbour Line order ${id}: ${plural(o.booking.passengers.length, "ticket", "tickets")}, ${route.from} to ${route.to}, ${shop.formatDateShort(o.booking.date)}`,
        });
        if (!header) {
          res.summary = `got the price: 402, ${o.totalText} USDC`;
          emit("order.payment_required", o.lane, { orderId: id, amount: o.total, amountText: o.totalText, amountAtomic: requirement.maxAmountRequired, asset: "USDC", assetAddress: requirement.asset, network: requirement.network, payTo: requirement.payTo, mode: pay.payStatus().mode });
          return sendJson(res, 402, pay.paymentRequiredBody(requirement));
        }
        const settled = await pay.verifyAndSettle(header, requirement);
        if (!settled.ok) {
          res.summary = `payment refused: ${settled.error}`;
          log(`[pay] refused for ${id}: ${settled.error}`);
          return sendJson(res, 402, pay.paymentRequiredBody(requirement, settled.error));
        }
        o.status = "paid";
        o.receipt = receiptFor(o, settled);
        store.putOrder(o);
        log(`[pay] ${id} paid ${o.totalText} USDC · ${settled.mode} · ${settled.txHash}`);
        res.summary = settled.mode === "testnet" ? `paid ${o.totalText} USDC: tx ${settled.txHash.slice(0, 10)}…` : `paid ${o.totalText} USDC on the local test ledger (${settled.txHash})`;
        emit("order.paid", o.lane, { orderId: id, ref: o.ref, txHash: settled.txHash, explorerUrl: settled.explorerUrl, amount: o.total, amountText: o.totalText, mode: settled.mode, modeLabel: settled.modeLabel });
        notifyOrder(id);
        return sendJson(res, 200, { receipt: o.receipt }, { "X-PAYMENT-RESPONSE": pay.paymentResponseHeader(settled) });
      });
    }

    if (action === "refund" && m === "POST") {
      return withLock(id, async () => {
        o = refreshOrder(store.getOrder(id));
        if (o.status === "refunded") {
          res.summary = "asked for a refund: already refunded";
          return sendJson(res, 200, { orderId: id, status: o.status, refund: o.refund, already: true });
        }
        if (o.status !== "paid") {
          res.summary = `asked for a refund: order is ${o.status}`;
          return sendJson(res, 409, { error: `Only a paid order can be refunded. This order is ${o.status}.`, status: o.status });
        }
        let r;
        if (o.receipt.mode === "test-card") r = { txHash: null, explorerUrl: null, mode: "test-card", modeLabel: "test card, no chain" };
        else {
          try {
            r = await pay.refund({ to: o.receipt.payer, amountAtomic: o.receipt.amountAtomic, mode: o.receipt.mode });
          } catch (e) {
            res.summary = `refund failed: ${e.shortMessage || e.message}`;
            log(`[pay] refund failed for ${id}: ${e.shortMessage || e.message}`);
            return sendJson(res, 502, { error: `Refund failed: ${e.shortMessage || e.message}` });
          }
        }
        o.status = "refunded";
        o.refund = { ...r, amount: o.total, amountText: o.totalText, to: o.receipt.payer || null, refundedAt: nowIso() };
        store.putOrder(o);
        log(`[pay] ${id} refunded ${o.totalText} USDC · ${r.mode} · ${r.txHash}`);
        res.summary = r.mode === "testnet" ? `refunded ${o.totalText} USDC: tx ${r.txHash.slice(0, 10)}…` : `refunded ${o.totalText} USDC (${r.modeLabel})`;
        emit("order.refunded", o.lane, { orderId: id, txHash: r.txHash, explorerUrl: r.explorerUrl, amount: o.total, amountText: o.totalText, mode: r.mode });
        notifyOrder(id);
        return sendJson(res, 200, { orderId: id, status: o.status, refund: o.refund });
      });
    }
    return sendJson(res, 405, { error: `${m} is not allowed here` });
  }

  res.summary = `asked for ${url.pathname}: not found`;
  return sendJson(res, 404, { error: `No API route ${m} ${url.pathname}. See /ferry/llms.txt` });
}

// ---------------------------------------------------------------- router

// Demo: the human's yes comes by itself AUTO_YES_MS after the agent asks (default 7 s, the time a
// person takes to read the card). AUTO_YES_MS=0 turns it off: then the yes card, or a curl, says yes.
const AUTO_YES_MS = process.env.AUTO_YES_MS === undefined ? 7000 : Number(process.env.AUTO_YES_MS) || 0;
function scheduleAutoYes(id) {
  if (!AUTO_YES_MS) return;
  setTimeout(() => withLock(id, async () => {
    const o = refreshOrder(store.getOrder(id));
    if (!o || o.status !== "awaiting_approval") return;
    o.status = "approved";
    o.decidedAt = nowIso();
    o.autoYes = true;
    store.putOrder(o);
    log(`[yes] ${id} approved by itself after ${(AUTO_YES_MS / 1000).toFixed(0)} s (AUTO_YES_MS)`);
    emit("order.approved", o.lane, { orderId: id, total: o.total, totalText: o.totalText, auto: true });
    notifyOrder(id);
  }).catch((e) => log(`[yes] auto yes failed for ${id}: ${e.message}`)), AUTO_YES_MS);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;
  const m = req.method === "HEAD" ? "GET" : req.method;

  res.setHeader("Vary", "Accept");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE, Link, Content-Length, Content-Type");
  if (m === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "Content-Type, X-PAYMENT, X-Lane, Accept", "Access-Control-Max-Age": "600" });
    return res.end();
  }

  // Only the presenter's laptop runs the race and sees the deck, the board and the recordings.
  // Other devices keep the yes card (/approve/), /events, /race/state, the shop and the talk's door.
  if (!isLocal(req)) {
    if (m === "POST" && path === "/rec") {
      req.resume(); // a visitor's website: nothing recorded, and a 2xx so it does not retry
      res.writeHead(204);
      return res.end();
    }
    if (m === "POST" && (["/race/start", "/race/reset", "/race/finish", "/lane1/event"].includes(path) || /^\/ferry\/api\/orders\/[^/]+\/refund\/*$/.test(path))) {
      return sendJson(res, 403, { error: "Only on the presenter's laptop" });
    }
    if (m === "GET" && path === "/") return redirect(res, 302, "/talk");
    if (/^\/(deck|board|race\/recordings)(\/|$)/.test(path)) return notFound(res, `Not found: ${path}`);
  }

  const doorPath = path === "/ferry" || path.startsWith("/ferry/") || path === "/talk" || path.startsWith("/talk/") || path === "/talk.md" || path === "/llms.txt";
  const agentClient = doorPath && !isBrowser(req);
  const lane = requestLane(req, url);
  // a yes given from a plain terminal (the presenter's fallback) is the human's, not an outside agent's
  const humanYes = lane !== "1" && /^\/ferry\/api\/orders\/[^/]+\/approve\/?$/.test(path);
  if (agentClient && !humanYes) trackAgentRequest(req, res, url, lane);

  if (m === "GET" && path === "/") return redirect(res, 302, "/deck/");
  if (m === "GET" && path === "/health") return sendJson(res, 200, { ok: true, port: PORT, pay: pay.payStatus().mode });

  // static apps
  for (const [prefix, dir, what] of [
    ["/deck", DIRS.deck, "The deck (build it with: npm run deck)"],
    ["/board", DIRS.board, "The race board"],
    ["/approve", DIRS.approve, "The yes card"],
  ]) {
    if (path === prefix && m === "GET") return redirect(res, 301, `${prefix}/${url.search}`);
    if (path.startsWith(`${prefix}/`) && m === "GET") return serveStatic(res, dir, path.slice(prefix.length + 1), what);
  }

  // the talk's own door
  if (m === "GET" && (path === "/talk" || path === "/talk/")) {
    const md = wantsMarkdown(req, url);
    res.summary = (bytes) => `read the talk's door as ${md ? "Markdown" : "HTML"} (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.door, md ? "talk.md" : "index.html", "The talk's door", { Link: LINK_TALK });
  }
  if (m === "GET" && path === "/talk.md") {
    res.summary = (bytes) => `read the talk's Markdown (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.door, "talk.md", "The talk's Markdown", { Link: LINK_TALK });
  }
  if (m === "GET" && (path === "/talk/llms.txt" || path === "/llms.txt")) {
    res.summary = "read the talk's llms.txt";
    return serveStatic(res, DIRS.door, "llms.txt", "The talk's llms.txt", { Link: LINK_TALK });
  }
  if (m === "GET" && path.startsWith("/talk/")) return serveStatic(res, DIRS.door, path.slice("/talk/".length), "The talk's door");

  // Harbour Line
  if (path === "/ferry" && m === "GET") {
    res.summary = "was sent on to /ferry/";
    return redirect(res, 301, `/ferry/${url.search}`);
  }
  if (path.startsWith("/ferry/api/") || path === "/ferry/api") return handleApi(req, res, url, lane, agentClient);
  if (m === "GET" && (path === "/ferry/" || path === "/ferry/index.html")) {
    const md = path === "/ferry/" && wantsMarkdown(req, url);
    res.summary = (bytes) => (md ? `read the Markdown door (${fmtBytes(bytes)})` : `read the website as HTML (${fmtBytes(bytes)})`);
    if (md) return serveStatic(res, DIRS.shopDoor, "index.md", "The agent door", { Link: LINK_FERRY });
    return serveStatic(res, DIRS.web, "index.html", "The Harbour Line website", { Link: LINK_FERRY });
  }
  if (m === "GET" && path === "/ferry/llms.txt") {
    res.summary = (bytes) => `read llms.txt (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.shopDoor, "llms.txt", "The agent door", { Link: LINK_FERRY });
  }
  if (m === "GET" && (path === "/ferry/SKILL.md" || path === "/ferry/skill.md")) {
    res.summary = (bytes) => `read the skill file (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.shopDoor, "SKILL.md", "The agent door", { Link: LINK_FERRY });
  }
  if (m === "GET" && path === "/ferry/index.md") {
    res.summary = (bytes) => `read the Markdown door (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.shopDoor, "index.md", "The agent door", { Link: LINK_FERRY });
  }
  if (m === "GET" && path === "/ferry/data.mjs" && !fileAt(join(DIRS.web, "data.mjs"))) {
    res.summary = (bytes) => `fetched data.mjs (${fmtBytes(bytes)})`;
    return serveStatic(res, DIRS.shop, "data.mjs", "The catalogue");
  }
  if (m === "GET" && path.startsWith("/ferry/")) {
    const rel = path.slice("/ferry/".length);
    res.summary = (bytes) => `fetched ${rel} (${fmtBytes(bytes)})`;
    const headers = extname(rel) === ".html" || rel.endsWith("/") ? { Link: LINK_FERRY } : {};
    return serveStatic(res, DIRS.web, rel, "The Harbour Line website", headers);
  }
  if (m === "GET" && path === "/shop/data.mjs") return serveStatic(res, DIRS.shop, "data.mjs", "The catalogue");

  // live events and the race
  if (m === "GET" && path === "/events") return openSse(req, res);

  if (m === "POST" && path === "/rec") {
    const body = await readJson(req);
    const recLane = ["1", "2", "3", "x"].includes(String(body.lane)) ? String(body.lane) : laneFromUrl(url.href) || "3";
    const sessionId = String(body.sessionId || "unknown").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown";
    const events = Array.isArray(body.events) ? body.events.filter((e) => e && typeof e.type === "string" && e.type.startsWith("web.")) : [];
    if (events.length) {
      try {
        mkdirSync(REC_DIR, { recursive: true });
        appendFileSync(join(REC_DIR, `session-${sessionId}.jsonl`), events.map((e) => JSON.stringify({ ...e, lane: recLane, sessionId })).join("\n") + "\n");
      } catch (e) {
        log(`[rec] could not write session-${sessionId}.jsonl: ${e.message}`);
      }
      for (const e of events) {
        // values and the typing timeline stay in the session file; the live stream gets the shape only
        const { type, lane: _l, value, keys: _k, ...rest } = e;
        // web.done carries the booking reference as `value`; the board reads it as `ref`
        if (type === "web.done" && value != null && rest.ref == null) rest.ref = String(value).slice(0, 40);
        emit(type, recLane, { ...rest, sessionId });
      }
    }
    return sendJson(res, 200, { ok: true, n: events.length });
  }

  if (m === "POST" && path === "/race/start") {
    const body = await readJson(req);
    const replay = typeof body.replay === "string" ? body.replay.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 120) : null;
    const t0 = startRace(replay);
    return sendJson(res, 200, { ok: true, t0, lane1: race.lane1 ? "started" : (process.env.LANE1 || "auto").toLowerCase() === "auto" ? "not started" : "manual" });
  }
  if (m === "POST" && path === "/race/reset") {
    resetRace();
    return sendJson(res, 200, { ok: true });
  }
  if (m === "POST" && path === "/race/finish") {
    if (!race.t0) return sendJson(res, 409, { error: "No race is running" });
    finishRace();
    return sendJson(res, 200, { ok: true, t0: race.t0, done: race.done });
  }
  if (m === "GET" && path === "/race/state") {
    return sendJson(res, 200, {
      t0: race.t0,
      running: !!race.t0 && !race.finished,
      finished: race.finished,
      replay: race.replay,
      done: race.done,
      mission: shop.MISSION,
      pay: { mode: pay.payStatus().mode, modeLabel: pay.payStatus().modeLabel },
      events: race.events,
      pending: pendingOrders(),
    });
  }

  if (m === "POST" && path === "/lane1/event") {
    const body = await readJson(req);
    const list = Array.isArray(body.events) ? body.events : [body];
    let n = 0;
    for (const e of list) {
      if (!e || typeof e.type !== "string" || !e.type.startsWith("agent.")) continue;
      const { type, lane: _l, ...rest } = e;
      emit(type, "1", rest);
      n++;
    }
    return sendJson(res, n ? 200 : 400, n ? { ok: true, n } : { error: 'Send {type:"agent.say"|"agent.tool"|"agent.usage"|"agent.done", ...}' });
  }

  if (m === "GET" && (path === "/race/recordings" || path === "/race/recordings/")) {
    let files = [];
    try {
      files = readdirSync(REC_DIR)
        .filter((f) => /\.(jsonl|json)$/.test(f))
        .map((f) => ({ file: f, bytes: statSync(join(REC_DIR, f)).size, modified: statSync(join(REC_DIR, f)).mtime.toISOString() }))
        .sort((a, b) => (a.modified < b.modified ? 1 : -1));
    } catch {}
    return sendJson(res, 200, { files });
  }
  if (m === "GET" && path.startsWith("/race/recordings/")) {
    const name = path.slice("/race/recordings/".length);
    if (!/^[A-Za-z0-9_.-]+\.(jsonl|json)$/.test(name)) return notFound(res, `Not a recording name: ${name}`);
    return serveStatic(res, REC_DIR, name, "Recordings");
  }

  return notFound(res, `Not found: ${path}`);
}

// ---------------------------------------------------------------- start

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) log(`[error] ${req.method} ${req.url}: ${e.stack || e.message}`);
    if (!res.headersSent) sendJson(res, status, { error: e.message || "server error" });
    else
      try {
        res.end();
      } catch {}
  }
});
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // long polls and SSE
server.headersTimeout = 66_000;

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Stop the other server or run with PORT=<another port>.`);
  else console.error(`Server error: ${e.message}`);
  process.exit(1);
});

const payInfo = await pay.initPay({ root: ROOT, ledger: store.ledger, log });

server.listen(PORT, HOST, () => {
  setTimeout(() => autoRefundPaid("server start"), 3000);
  const local = LOCAL_BASE;
  console.log(
    [
      "",
      "Harbour Line demo server",
      `  Deck        ${local}/deck/`,
      `  Race board  ${local}/board/`,
      `  Website     ${local}/ferry/          (agent door: same link with Accept: text/markdown)`,
      `  Talk door   ${local}/talk`,
      `  Phone       ${PUBLIC_BASE}/approve/   (same Wi-Fi)`,
      `  Payments    ${payInfo.mode}: ${payInfo.modeLabel} (${payInfo.reason})`,
      `  Yes card    ${AUTO_YES_MS ? `says yes by itself after ${(AUTO_YES_MS / 1000).toFixed(0)} s (AUTO_YES_MS=0 to answer by hand)` : "answered by hand (yes card or curl)"}`,
      `  Lane 1      ${(process.env.LANE1 || "auto").toLowerCase() === "auto" ? "starts on race start (LANE1=auto)" : "manual (set LANE1=auto to start it with the race)"}`,
      "",
    ].join("\n"),
  );
});

function shutdown() {
  killLane1();
  store.flush();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
