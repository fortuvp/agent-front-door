#!/usr/bin/env node
// Lane 1 of the race: an agent on the agent door. Runs the Claude Code CLI with the mission,
// lets it use only curl and ./bin/ferry, and reports what it says, which tools it calls and how
// many tokens it uses to the server (POST /lane1/event), which shows them on the board.
//
//   node race/lane1.mjs              run now
//   node race/lane1.mjs --wait-start run on every race.start from the server (and stop on race.reset)
//   node race/lane1.mjs --dry        print the command, run nothing
// Options: --server <url> (default SERVER_URL or http://127.0.0.1:4900) · --model <name> (or LANE1_MODEL)
//          --timeout <s> (default 480) · --claude <path> (or CLAUDE_BIN)
// Env: LANE1_SAFE_MODE=0 keeps the user's CLAUDE.md, skills, hooks and plugins (default: off, a clean agent)
//      LANE1_EXTRA_ARGS="..." adds CLI flags (space separated)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { MISSION } from "../shop/data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAUDE_DIR = join(homedir(), "Library/Application Support/Claude/claude-code");
const PINNED_CLAUDE = join(CLAUDE_DIR, "2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude");
// The Claude app updates itself and may remove old versions: if the pinned one is gone, use the newest installed.
function newestClaude() {
  const num = (v) => v.split(".").map((n) => Number(n) || 0);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  try {
    for (const v of readdirSync(CLAUDE_DIR).filter((d) => /^\d+\.\d+\.\d+$/.test(d)).sort(newer).reverse()) {
      for (const h of readdirSync(join(CLAUDE_DIR, v))) {
        const bin = join(CLAUDE_DIR, v, h, "claude.app/Contents/MacOS/claude");
        if (existsSync(bin)) return bin;
      }
    }
  } catch {}
  return null;
}
const DEFAULT_CLAUDE = existsSync(PINNED_CLAUDE) ? PINNED_CLAUDE : newestClaude() || PINNED_CLAUDE;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (["dry", "wait-start", "help"].includes(k)) out[k] = true;
    else out[k] = v !== undefined ? v : argv[++i];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readmeLines());
  process.exit(0);
}
function readmeLines() {
  return "node race/lane1.mjs [--dry] [--wait-start] [--server URL] [--model NAME] [--timeout S] [--claude PATH]";
}

const SERVER = String(args.server || process.env.SERVER_URL || "http://127.0.0.1:4900").replace(/\/+$/, "");
const CLAUDE = args.claude || process.env.CLAUDE_BIN || DEFAULT_CLAUDE;
const MODEL = args.model || process.env.LANE1_MODEL || "";
const TIMEOUT_S = Number(args.timeout || process.env.LANE1_TIMEOUT || 480);
const SAFE_MODE = process.env.LANE1_SAFE_MODE !== "0";

const PROMPT = `${MISSION} The Harbour Line agent door is ${SERVER}/ferry/. You can use curl and the ferry CLI at ./bin/ferry.`;
// In -p mode nobody reads the chat until the end, so the agent is told how its human is reached.
// LANE1_HINT=0 leaves it out.
const HINT =
  "You are running unattended: nobody reads this chat until you finish, so do not stop to ask questions here. " +
  "Your human answers payment requests on their phone, on the shop's yes card, and you wait for that answer before you pay. " +
  "Your shell allows only these commands: curl, ./bin/ferry (FERRY_SHOP is already set: do not prefix it), echo, printf, cd, sleep, cat, head, tail, jq, grep, wc. " +
  "No python, node, timeout, loops, variables or command substitution, and write no files. " +
  "To wait for your human's yes, run ./bin/ferry wait <orderId> --timeout 100, and run it again if it exits 3.";
const USE_HINT = process.env.LANE1_HINT !== "0";

function claudeArgs() {
  const list = [
    "-p",
    PROMPT,
    "--output-format",
    "stream-json",
    "--verbose",
    "--tools",
    "Bash",
    "--allowedTools",
    "Bash(curl:*)",
    "Bash(./bin/ferry:*)",
    "Bash(curl *)",
    "Bash(./bin/ferry *)",
    // the same CLI written without ./ or as an absolute path
    "Bash(bin/ferry:*)",
    "Bash(bin/ferry *)",
    `Bash(${ROOT}/bin/ferry:*)`,
    `Bash(${ROOT}/bin/ferry *)`,
    // Harmless helpers agents chain onto their commands (`; echo "exit=$?"`, `| head`, `| jq`). Without
    // them dontAsk mode refuses the whole command line, and the agent stops before it pays (rehearsal, 4 Nov).
    ...["echo", "printf", "cd", "sleep", "cat", "head", "tail", "jq", "grep", "wc"].flatMap((c) => [`Bash(${c}:*)`, `Bash(${c} *)`]),
    "--permission-mode",
    "dontAsk",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  if (SAFE_MODE) list.push("--safe-mode");
  if (USE_HINT) list.push("--append-system-prompt", HINT);
  if (MODEL) list.push("--model", MODEL);
  if (process.env.LANE1_EXTRA_ARGS) list.push(...process.env.LANE1_EXTRA_ARGS.split(/\s+/).filter(Boolean));
  return list;
}

// curl reads $CURL_HOME/.curlrc: every curl the agent runs then says it is lane 1.
function curlHome() {
  const dir = join(tmpdir(), "harbour-line-lane1-curl");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".curlrc"), 'header = "X-Lane: 1"\n');
  return dir;
}

// If the server was started from inside a Claude Code session, that session's variables (its
// socket, session ids, "simple" mode, a local API proxy) would leak into the lane-1 agent and can
// break its sign-in. The agent gets a clean copy. LANE1_KEEP_ENV=1 passes everything through.
function cleanEnv(env) {
  if (process.env.LANE1_KEEP_ENV === "1") return { ...env };
  const hosted = !!(env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDE_CODE_SESSION_ID);
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_PREVIEW_|MCP_)/.test(k)) continue;
    if (hosted && k === "ANTHROPIC_BASE_URL") continue;
    out[k] = v;
  }
  return out;
}

function childEnv() {
  return { ...cleanEnv(process.env), FERRY_SHOP: `${SERVER}/ferry`, FERRY_AGENT_NAME: "Claude Code (lane 1)", CURL_HOME: curlHome() };
}

const q = (s) => (/^[A-Za-z0-9_\/.:=@%+,-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

if (args.dry) {
  const env = childEnv();
  console.log("Lane 1 would run, in", ROOT);
  console.log(`  FERRY_SHOP=${q(env.FERRY_SHOP)} FERRY_AGENT_NAME=${q(env.FERRY_AGENT_NAME)} CURL_HOME=${q(env.CURL_HOME)} \\`);
  console.log(`  ${q(CLAUDE)} \\\n    ${claudeArgs().map(q).join(" \\\n    ")}`);
  const removed = Object.keys(process.env).filter((k) => !(k in env));
  console.log(`Environment: ${removed.length ? `${removed.length} variables of the calling Claude Code session left out (${removed.slice(0, 4).join(", ")}${removed.length > 4 ? ", ..." : ""})` : "passed through as is"}`);
  console.log(`Reports to ${SERVER}/lane1/event · timeout ${TIMEOUT_S} s${args["wait-start"] ? " · waits for race.start" : ""}`);
  process.exit(0);
}

// ---------- reporting ----------
let chain = Promise.resolve();
function report(type, data = {}) {
  const body = JSON.stringify({ type, t: Date.now(), ...data });
  chain = chain.then(() =>
    fetch(`${SERVER}/lane1/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => (r.ok ? null : console.error(`[lane1] server answered ${r.status} to ${type}`)))
      .catch((e) => console.error(`[lane1] could not report ${type}: ${e.cause?.code || e.message}`)),
  );
  return chain;
}
const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const print = (line) => console.log(`${stamp()} ${line}`);

// ---------- one run ----------
let current = null;

function run() {
  return new Promise((done) => {
    const started = Date.now();
    const usageById = new Map();
    let finished = false;
    let lastUsageKey = "";
    print(`lane 1: starting Claude Code${MODEL ? ` (${MODEL})` : ""}`);
    report("agent.say", { text: "Starting. Mission received." }).catch(() => {});

    let child;
    try {
      child = spawn(CLAUDE, claudeArgs(), { cwd: ROOT, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      report("agent.done", { ok: false, error: `could not start Claude Code: ${e.message}` });
      return done(false);
    }
    current = child;
    const timer = setTimeout(() => {
      print(`lane 1: no result after ${TIMEOUT_S} s, stopping`);
      end(false, `stopped after ${TIMEOUT_S} s`);
      child.kill("SIGTERM");
    }, TIMEOUT_S * 1000);

    function totals() {
      let input = 0;
      let output = 0;
      let cached = 0;
      for (const u of usageById.values()) {
        input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        cached += u.cache_read_input_tokens || 0;
        output += u.output_tokens || 0;
      }
      return { inputTokens: input, outputTokens: output, cachedTokens: cached, turns: usageById.size };
    }

    function end(ok, error, extra = {}) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (current === child) current = null;
      report("agent.done", { ok, ms: Date.now() - started, ...(error ? { error } : {}), ...extra }).then(() => done(ok));
    }

    createInterface({ input: child.stdout }).on("line", (line) => {
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        return;
      }
      if (j.type === "system" && j.subtype === "init") {
        print(`lane 1: session ${j.session_id || ""} model ${j.model || "?"} tools ${(j.tools || []).join(",")}`);
        return;
      }
      if (j.type === "assistant" && j.message) {
        const msg = j.message;
        for (const block of msg.content || []) {
          if (block.type === "text" && block.text?.trim()) {
            print(`says: ${block.text.trim().replace(/\s+/g, " ").slice(0, 200)}`);
            report("agent.say", { text: block.text.trim() });
          } else if (block.type === "tool_use") {
            print(`tool: ${block.name} ${block.input?.command || JSON.stringify(block.input).slice(0, 200)}`);
            report("agent.tool", { name: block.name, input: block.input, id: block.id });
          }
        }
        if (msg.usage) {
          const id = msg.id || `m${usageById.size}`;
          const prev = usageById.get(id) || {};
          usageById.set(id, { ...prev, ...msg.usage, output_tokens: Math.max(prev.output_tokens || 0, msg.usage.output_tokens || 0) });
          const t = totals();
          const key = `${t.inputTokens}/${t.outputTokens}/${t.turns}`;
          if (key !== lastUsageKey) {
            lastUsageKey = key;
            report("agent.usage", t);
          }
        }
        return;
      }
      if (j.type === "user" && j.message?.content) {
        for (const block of j.message.content) {
          if (block.type !== "tool_result") continue;
          const text = Array.isArray(block.content) ? block.content.map((c) => c.text || "").join(" ") : String(block.content || "");
          print(`${block.is_error ? "tool error" : "tool result"}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
        }
        return;
      }
      if (j.type === "result") {
        const u = j.usage || {};
        const t = totals();
        const final = {
          inputTokens: Math.max(t.inputTokens, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)),
          outputTokens: Math.max(t.outputTokens, u.output_tokens || 0),
          cachedTokens: Math.max(t.cachedTokens, u.cache_read_input_tokens || 0),
          turns: j.num_turns || t.turns,
          ...(typeof j.total_cost_usd === "number" ? { costUsd: j.total_cost_usd } : {}),
        };
        report("agent.usage", final);
        const ok = j.subtype === "success" && !j.is_error;
        print(`lane 1: ${ok ? "done" : "stopped"} in ${((Date.now() - started) / 1000).toFixed(1)} s, ${final.turns} turns, ${final.inputTokens} in / ${final.outputTokens} out tokens`);
        if (j.result) print(`result: ${String(j.result).replace(/\s+/g, " ").slice(0, 300)}`);
        end(ok, ok ? null : j.subtype || "error", { turns: final.turns, result: String(j.result || "").slice(0, 1000) });
      }
    });
    createInterface({ input: child.stderr }).on("line", (line) => line.trim() && print(`claude: ${line.slice(0, 300)}`));
    child.on("error", (e) => {
      print(`lane 1: could not start ${CLAUDE}: ${e.message}`);
      end(false, `could not start Claude Code: ${e.code || e.message}`);
    });
    child.on("exit", (code, signal) => {
      if (!finished) end(false, `Claude Code exited (${signal || code}) without a result`);
    });
  });
}

function stop() {
  if (current) {
    try {
      current.kill("SIGTERM");
    } catch {}
  }
}
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

// ---------- follow the race (--wait-start) ----------
async function follow() {
  print(`lane 1: waiting for race.start on ${SERVER}/events`);
  for (;;) {
    try {
      const res = await fetch(`${SERVER}/events`);
      const dec = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split("\n").find((l) => l.startsWith("data: "));
          if (!data) continue;
          let ev;
          try {
            ev = JSON.parse(data.slice(6));
          } catch {
            continue;
          }
          if (ev.type === "race.start") {
            stop();
            run();
          } else if (ev.type === "race.reset") {
            if (current) print("lane 1: race reset, stopping the agent");
            stop();
          }
        }
      }
    } catch (e) {
      print(`lane 1: lost the server (${e.cause?.code || e.message}), retrying`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

if (args["wait-start"]) await follow();
else process.exit((await run()) ? 0 : 1);
