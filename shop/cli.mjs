#!/usr/bin/env node
// ferry: the Harbour Line CLI an agent uses. Plain flags in, plain lines out (JSON with --json).
//   ferry routes | departures | quote | book | wait | status | refund | help
// Shop: --shop <url> or FERRY_SHOP (default http://127.0.0.1:4900/ferry). Sends X-Lane: 1.
// Exit codes: 0 ok, 2 declined, 3 timeout (still waiting: run wait again), 1 error.
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { parsePassenger, formatDateShort } from "./data.mjs";
import { createPaymentHeader, decodePaymentResponse, loadAccount, walletFilePath, short, atomicToUsdc } from "../server/pay.mjs";

const HELP = `ferry: book Harbour Line ferries (a demo shop, USDC on a test network)

Commands
  ferry routes
  ferry departures --route gateway-elephanta --date 2026-11-07
  ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 \\
      --class upper-deck --board jetty-4 \\
      --passenger "Asha Rao,31,passport,P4417702" [--passenger ...] [--assist "help boarding"]
  ferry book <quoteId>                 creates the order, prints the approve link, returns at once
  ferry wait <orderId> [--timeout 100] waits for the yes, then pays (x402) and prints the receipt
  ferry status <orderId>
  ferry refund <orderId>

Options
  --json          print JSON
  --shop <url>    shop address (default: FERRY_SHOP or http://127.0.0.1:4900/ferry)

Passenger: "Full name,age,idType,idNumber". idType: passport | aadhaar | driving-licence.
ID needed from age 18. Under 5 travels free.
Exit codes: 0 ok, 2 declined, 3 still waiting (run wait again), 1 error.`;

// ---------- args ----------
const REPEAT = new Set(["passenger"]);
const BOOL = new Set(["json", "help", "verbose"]);
function parseArgs(argv) {
  const out = { _: [], passenger: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      let [k, v] = a.slice(2).split(/=(.*)/s);
      if (BOOL.has(k)) {
        out[k] = v === undefined ? true : v !== "false";
        continue;
      }
      if (v === undefined) {
        v = argv[i + 1];
        if (v === undefined || v.startsWith("--")) fail(`--${k} needs a value`);
        i++;
      }
      if (REPEAT.has(k)) out[k].push(v);
      else out[k] = v;
    } else out._.push(a);
  }
  return out;
}

const JSON_OUT = process.argv.slice(2).some((a) => a === "--json" || a === "--json=true");
const args = parseArgs(process.argv.slice(2));
const SHOP = String(args.shop || process.env.FERRY_SHOP || "http://127.0.0.1:4900/ferry").replace(/\/+$/, "");
const API = `${SHOP}/api`;

function fail(message, code = 1, extra = {}) {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(code);
}
// A closed pipe (for example `ferry wait <id> | head`) must not crash the CLI half way through a payment.
for (const stream of [process.stdout, process.stderr]) stream.on("error", (e) => { if (e.code !== "EPIPE") throw e; });
const say = (...lines) => {
  if (!JSON_OUT) for (const l of lines) console.log(l);
};
const out = (obj) => {
  if (JSON_OUT) console.log(JSON.stringify(obj, null, 2));
};

// ---------- http ----------
async function call(method, path, { body, headers = {}, okStatuses = [200, 201, 202] } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Accept: "application/json", "User-Agent": "ferry-cli/1", "X-Lane": "1", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`cannot reach the shop at ${SHOP} (${e.cause?.code || e.message}). Is the server running?`);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!okStatuses.includes(res.status)) {
    const msg = data.error || `${method} ${path} answered ${res.status}`;
    fail(msg, 1, { status: res.status, ...(data.errors ? { errors: data.errors } : {}) });
  }
  return { status: res.status, data, headers: res.headers };
}

const money = (n) => `${Number(n).toFixed(2)} USDC`;

// ---------- commands ----------
async function routes() {
  const { data } = await call("GET", "/routes");
  out(data);
  say(`${data.operator}: ${data.priceNote}`);
  for (const r of data.routes) {
    say(`  ${r.id}  ${r.from} to ${r.to}, ${r.minutes} min`);
    say(`      ${Object.entries(r.prices).map(([c, p]) => `${c} ${p.toFixed(2)}`).join(" · ")}`);
  }
  say(`Boarding points: ${data.boardingPoints.map((b) => `${b.id} (${b.label}${b.stepFree ? ", step-free" : ""})`).join(", ")}`);
  say(`Next: ferry departures --route gateway-elephanta --date 2026-11-07`);
}

async function departures() {
  const route = args.route || "gateway-elephanta";
  const date = args.date;
  if (!date) fail("--date is required, for example --date 2026-11-07");
  const { data } = await call("GET", `/departures?route=${encodeURIComponent(route)}&date=${encodeURIComponent(date)}`);
  out(data);
  const classes = Object.keys(data.departures[0]?.price || {});
  const row = (s) => `  ${s.time} (arrives ${s.arrives})  ${classes.map((c) => `${c} ${s.soldOut[c] ? "sold out" : `${s.seatsLeft[c]} left`}`).join(" · ")}`;
  say(`${data.from} to ${data.to}, ${formatDateShort(data.date)}. ${data.priceNote}: ${classes.map((c) => `${c} ${data.departures[0].price[c].toFixed(2)}`).join(" · ")} USDC`);
  say(`Departures from ${data.from}:`);
  data.departures.forEach((s) => say(row(s)));
  say(`Returns from ${data.to}:`);
  data.returns.forEach((s) => say(row(s)));
  say(`Next: ferry quote --route ${route} --date ${date} --depart <time> --return <time> --class <class> --board <jetty> --passenger "Name,age,idType,idNumber"`);
}

async function quote() {
  const missing = ["route", "date", "depart", "return", "class", "board"].filter((k) => !args[k]);
  if (missing.length) fail(`missing ${missing.map((k) => `--${k}`).join(", ")}. See: ferry help`);
  if (!args.passenger.length) fail('add at least one --passenger "Full name,age,idType,idNumber"');
  const booking = {
    route: args.route,
    date: args.date,
    departure: args.depart,
    return: args.return,
    seatClass: args.class,
    boardingPoint: args.board,
    passengers: args.passenger.map(parsePassenger),
    ...(args.assist ? { assistance: args.assist } : {}),
  };
  const { data: q } = await call("POST", "/quote", { body: booking });
  out(q);
  say(`Quote ${q.quoteId}: ${money(q.total)} (approx. ${q.inrApprox} INR), valid until ${new Date(q.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
  q.summary.forEach((l) => say(`  ${l}`));
  say("Lines:");
  q.lines.forEach((l) => say(`  ${l.qty} x ${l.label}: ${l.amount.toFixed(2)}`));
  say("Alternatives (your human can choose one on the yes card):");
  q.alternatives.forEach((a) => say(`  ${a.id}: ${a.label}, ${money(a.total)} (${a.change})`));
  say(q.cancellation?.text || "");
  say(`Next: ferry book ${q.quoteId}`);
}

async function book() {
  const quoteId = args._[1];
  if (!quoteId) fail("usage: ferry book <quoteId>");
  const name = process.env.FERRY_AGENT_NAME || args.name || "an agent (ferry CLI)";
  const { data } = await call("POST", "/orders", { body: { quoteId, channel: "agent", agent: { name } } });
  out(data);
  say(`Order ${data.orderId}: ${money(data.total)}, waiting for your human's yes.`);
  say(`Approve link (yes card): ${data.approveUrl}`);
  say(`It expires at ${new Date(data.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Nothing is paid until the yes.`);
  say(`Next: ferry wait ${data.orderId}`);
}

async function status() {
  const id = args._[1];
  if (!id) fail("usage: ferry status <orderId>");
  const { data: o } = await call("GET", `/orders/${encodeURIComponent(id)}`);
  out(o);
  say(`Order ${o.orderId}: ${o.status.replace("_", " ")}, ${money(o.total)}`);
  o.summary?.forEach((l) => say(`  ${l}`));
  if (o.status === "awaiting_approval") say(`Approve link: ${o.approveUrl}`, `Next: ferry wait ${o.orderId}`);
  if (o.receipt) printReceipt(o.receipt, { withSummary: false });
  if (o.refund) say(`Refunded ${money(o.refund.amount)}${o.refund.txHash ? `: ${o.refund.txHash}` : ""}${o.refund.explorerUrl ? ` ${o.refund.explorerUrl}` : ""}`);
}

function printReceipt(r, { withSummary = true } = {}) {
  say(`Paid ${money(r.amount)}. Booking reference ${r.ref}.`);
  if (r.mode === "testnet") say(`Transaction: ${r.txHash}`, `Explorer: ${r.explorerUrl}${r.confirmed === false ? " (sent, not yet confirmed)" : ""}`);
  else if (r.mode === "ledger") say(`Settled on the local test ledger (${r.txHash}). No chain transaction.`);
  else say(`Paid by ${r.modeLabel || r.mode}.`);
  if (r.tickets?.length) say(`Tickets: ${r.tickets.map((t) => `${t.passenger} ${t.seat}`).join(", ")}`);
  if (withSummary && r.summary?.length) r.summary.forEach((l) => say(`  ${l}`));
}

function signer(mode) {
  const acc = loadAccount();
  if (acc) return acc;
  if (mode === "ledger") {
    say(`No wallet file at ${walletFilePath()}: signing with a throwaway key (the shop is on the local test ledger).`);
    return privateKeyToAccount(generatePrivateKey());
  }
  fail(`no wallet file at ${walletFilePath()}. Set WALLET_FILE to a JSON file with address and privateKey.`);
}

async function payOrder(o) {
  // 1. ask to pay without a payment: the shop answers 402 with the price
  const first = await call("POST", `/orders/${encodeURIComponent(o.orderId)}/pay`, { okStatuses: [200, 402] });
  if (first.status === 200) return first.data.receipt;
  const req = first.data.accepts?.find((a) => a.scheme === "exact") || first.data.accepts?.[0];
  if (!req) fail("the shop answered 402 without payment requirements");
  const amount = atomicToUsdc(req.maxAmountRequired);
  // never pay more than the human approved
  if (Math.round(amount * 100) > Math.round(Number(o.total) * 100)) fail(`the shop asks ${money(amount)}, more than the approved ${money(o.total)}. Not paying.`);
  if (o.payTo && req.payTo.toLowerCase() !== o.payTo.toLowerCase()) fail("the payment address is not the shop's address on the order. Not paying.");
  say(`402 Payment Required: ${money(amount)} to ${short(req.payTo)} on ${req.network} (${first.data.modeLabel || req.network}).`);
  // 2. sign an EIP-3009 authorization and retry with X-PAYMENT
  const account = signer(first.data.mode);
  const header = await createPaymentHeader(account, req);
  say(`Signed a USDC transfer authorization from ${short(account.address)}. Paying...`);
  const second = await call("POST", `/orders/${encodeURIComponent(o.orderId)}/pay`, { headers: { "X-PAYMENT": header }, okStatuses: [200, 402] });
  if (second.status === 402) fail(`payment refused: ${second.data.error}`);
  const settle = decodePaymentResponse(second.headers.get("x-payment-response"));
  return { ...second.data.receipt, ...(settle ? { settlement: settle } : {}) };
}

async function wait() {
  const id = args._[1];
  if (!id) fail("usage: ferry wait <orderId> [--timeout 100]");
  const timeout = Math.max(1, Number(args.timeout || 100));
  const deadline = Date.now() + timeout * 1000;
  let o = (await call("GET", `/orders/${encodeURIComponent(id)}`)).data;
  if (o.status === "awaiting_approval") {
    say(`Waiting for your human's yes on order ${o.orderId} (${money(o.total)}).`, `Approve link: ${o.approveUrl}`);
    while (o.status === "awaiting_approval") {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) {
        out({ ok: false, status: "awaiting_approval", timeout: true, order: o });
        say(`Still waiting after ${timeout} s. Nothing was paid. Run again: ferry wait ${o.orderId}`);
        process.exit(3);
      }
      o = (await call("GET", `/orders/${encodeURIComponent(id)}?wait=${Math.min(25, left)}`)).data;
    }
  }
  if (o.status === "declined") {
    out({ ok: false, status: "declined", reason: o.reason, order: o });
    say(o.reason === "expired" ? "The order expired before a yes. Nothing was paid." : "Your human said no. Nothing was paid.");
    process.exit(2);
  }
  if (o.status === "paid" || o.status === "refunded") {
    out({ ok: true, status: o.status, receipt: o.receipt, order: o });
    say(`Already ${o.status}.`);
    printReceipt(o.receipt);
    return;
  }
  // approved
  say(o.alternativeId ? `Approved, with a change: your human chose "${o.chosen}" (${money(o.total)}).` : `Approved: ${money(o.total)}.`);
  const receipt = await payOrder(o);
  out({ ok: true, status: "paid", receipt });
  printReceipt(receipt);
}

async function refund() {
  const id = args._[1];
  if (!id) fail("usage: ferry refund <orderId>");
  const { data } = await call("POST", `/orders/${encodeURIComponent(id)}/refund`);
  out(data);
  const r = data.refund;
  say(`${data.already ? "Already refunded" : "Refunded"} ${money(r.amount)} to ${r.to ? short(r.to) : "the payer"}.`);
  if (r.mode === "testnet") say(`Transaction: ${r.txHash}`, `Explorer: ${r.explorerUrl}`);
  else if (r.mode === "ledger") say(`On the local test ledger (${r.txHash}).`);
}

const commands = { routes, departures, quote, book, wait, status, refund };
const cmd = args._[0];
if (!cmd || args.help || cmd === "help") {
  console.log(HELP);
  process.exit(0);
}
if (!commands[cmd]) fail(`unknown command "${cmd}". Commands: ${Object.keys(commands).join(", ")}. See: ferry help`);
try {
  await commands[cmd]();
} catch (e) {
  fail(e.shortMessage || e.message);
}
