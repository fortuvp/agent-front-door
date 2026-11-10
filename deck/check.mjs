// Opens the built deck in headless Chrome, walks every slide and every build step (and opens the
// overview and the A panel), and reports console errors, warnings and uncaught exceptions.
//   node check.mjs                                   the local file deck/index.html
//   node check.mjs --base http://127.0.0.1:4900/deck/  the deck as the server serves it (live slides)
//   node check.mjs --static                          walk with ?static=1
//   node check.mjs --slide fd-race                   one slide only
// Exit code 1 when there is an error or an uncaught exception. Builds nothing: run node build.mjs first.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = opt("--base") ?? pathToFileURL(join(HERE, "index.html")).href;
const ONLY = opt("--slide");
const STATIC = args.includes("--static");
const DWELL = Number(opt("--dwell") ?? 350);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (BASE.startsWith("file:") && !existsSync(fileURLToPath(BASE.split("?")[0]))) { console.error("No index.html: run node build.mjs first"); process.exit(1); }
const profile = await mkdtemp(join(tmpdir(), "deck-check-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1920,1080", "about:blank"], { stdio: "ignore" });
const cleanup = async () => { try { chrome.kill(); } catch { /* gone */ } await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {}); };
const fail = async (text) => { console.error(text); await cleanup(); process.exit(1); };
const timeout = setTimeout(() => fail("check timed out after 180 s"), 180_000);

let port = null;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0].trim(); } catch { /* not yet */ }
}
if (!port) await fail("Chrome did not start (no DevToolsActivePort)");
let target = null;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not yet */ }
  if (!target) await sleep(100);
}
if (!target) await fail("no page target in Chrome");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
const listeners = [];
const where = { slide: "(loading)", step: 0 };
const problems = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); return; }
  for (const fn of listeners) fn(msg);
  const at = `${where.slide} step ${where.step}`;
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(msg.params.type)) {
    problems.push({ level: msg.params.type === "warning" ? "warning" : "error", at, text: msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ") });
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    problems.push({ level: "error", at, text: `${d.exception?.description ?? d.text}${d.url ? ` (${d.url.split("/").pop()}:${d.lineNumber + 1})` : ""}` });
  }
  if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) {
    const e = msg.params.entry;
    problems.push({ level: e.level, at, text: `${e.text}${e.url ? ` ${e.url}` : ""}` });
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
const loaded = new Promise((resolve) => listeners.push((m) => { if (m.method === "Page.loadEventFired") resolve(); }));
// norace=1: stepping through fd-race must not start a real race (and lane 1) on a live server
const url = `${BASE}${BASE.includes("?") ? "&" : "?"}norace=1${STATIC ? "&static=1" : ""}`;
await send("Page.navigate", { url });
await loaded;
await sleep(800);

const list = await evaluate(`window.DECK ? window.DECK.slides.map((s) => ({ id: s.dataset.id, max: Math.max(0, ...[...s.querySelectorAll("[data-step]")].map((el) => Number(el.dataset.step) || 0)) })) : null`);
if (!list) await fail("window.DECK is missing: the engine did not start (see the errors above)");
let shown = 0;
for (const [i, s] of list.entries()) {
  if (ONLY && s.id !== ONLY) continue;
  for (let step = 0; step <= s.max; step++) {
    where.slide = s.id; where.step = step;
    await evaluate(`window.DECK.go(${i}, ${step})`);
    await sleep(DWELL);
    shown++;
  }
}
if (!ONLY) {
  where.slide = "overview (O)"; where.step = 0;
  await evaluate(`dispatchEvent(new KeyboardEvent("keydown", { key: "o" }))`); await sleep(400);
  await evaluate(`dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  where.slide = "looks panel (A)";
  await evaluate(`dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))`); await sleep(400);
  await evaluate(`dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(200);
}

clearTimeout(timeout);
ws.close();
await cleanup();
const errors = problems.filter((p) => p.level === "error");
const warnings = problems.filter((p) => p.level === "warning");
for (const p of problems) console.log(`${p.level.toUpperCase().padEnd(7)} ${p.at}: ${p.text.split("\n")[0].slice(0, 300)}`);
console.log(`${list.length} slides, ${shown} slide steps walked${STATIC ? " (static)" : ""} · ${errors.length} error${errors.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"} · ${url}`);
process.exit(errors.length ? 1 : 0);
