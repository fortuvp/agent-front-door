// Quotes, orders and the local test ledger, kept in memory and saved to server/state/store.json
// so a restart does not lose an order (for example a paid test-network order that still needs a refund).
// Holds only demo data (fictional names and IDs). No keys.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function randomId(prefix, n = 6) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += ALPHABET[x % ALPHABET.length];
  return `${prefix}${s}`;
}

export function createStore(file) {
  let data = { quotes: {}, orders: {}, ledgerCount: 0, nonces: [] };
  try {
    if (existsSync(file)) data = { ...data, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch (e) {
    console.log(`[store] could not read ${file} (${e.message}); starting empty`);
  }
  const nonceSet = new Set(data.nonces);
  let timer = null;

  function saveNow() {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(dirname(file), { recursive: true });
      // keep the file small: last 300 quotes, last 300 orders, last 1000 nonces
      const trim = (obj, max) => Object.fromEntries(Object.entries(obj).sort((a, b) => (a[1].createdAt < b[1].createdAt ? -1 : 1)).slice(-max));
      data.quotes = trim(data.quotes, 300);
      data.orders = trim(data.orders, 300);
      data.nonces = [...nonceSet].slice(-1000);
      writeFileSync(`${file}.tmp`, JSON.stringify(data));
      renameSync(`${file}.tmp`, file);
    } catch (e) {
      console.log(`[store] could not save (${e.message})`);
    }
  }
  const save = () => {
    if (!timer) timer = setTimeout(saveNow, 150);
  };

  return {
    getQuote: (id) => data.quotes[id] || null,
    putQuote(q) {
      data.quotes[q.quoteId] = q;
      save();
      return q;
    },
    getOrder: (id) => data.orders[id] || null,
    putOrder(o) {
      data.orders[o.orderId] = o;
      save();
      return o;
    },
    listOrders: () => Object.values(data.orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    ledger: {
      next() {
        data.ledgerCount += 1;
        save();
        return `ledger-${data.ledgerCount}`;
      },
      nonceUsed: (key) => nonceSet.has(key),
      markNonce(key) {
        nonceSet.add(key);
        save();
      },
    },
    flush: saveNow,
  };
}
