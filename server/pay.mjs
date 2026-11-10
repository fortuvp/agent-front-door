// x402 v1, scheme "exact", on Arbitrum Sepolia test USDC (EIP-3009 transferWithAuthorization).
// The server is its own facilitator: it checks the signed authorization, then submits it from the
// payer/gas wallet and waits for one confirmation. PAY_MODE=ledger (or no wallet file / no RPC)
// keeps the same 402 and signature flow but records the settlement on a local test ledger.
// Private keys are read from files and never printed, logged or sent anywhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseSignature, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

export const NETWORK = "arbitrum-sepolia";
export const CHAIN_ID = 421614;
export const USDC = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
export const USDC_DECIMALS = 6;
export const DOMAIN_NAME = "USD Coin";
export const DOMAIN_VERSION = "2";
export const EXPLORER_TX = "https://sepolia.arbiscan.io/tx/";
export const MAX_TIMEOUT_SECONDS = 300;
export const DEFAULT_WALLET_FILE = join(homedir(), "Library/Mobile Documents/com~apple~CloudDocs/Kleros/Agent_005/wallet/sepolia-wallet.json");
export const DEFAULT_RPC = "https://sepolia-rollup.arbitrum.io/rpc";
export const MODE_LABEL = { testnet: "Arbitrum Sepolia test network", ledger: "local test ledger" };

export const AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
export const DOMAIN = { name: DOMAIN_NAME, version: DOMAIN_VERSION, chainId: CHAIN_ID, verifyingContract: USDC };

const USDC_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
];

export const toAtomic = (cents) => BigInt(Math.round(cents)) * 10n ** BigInt(USDC_DECIMALS - 2); // cents -> 6 decimals
export const atomicToUsdc = (atomic) => Number(BigInt(atomic)) / 10 ** USDC_DECIMALS;
export const explorerUrl = (hash) => (hash && hash.startsWith("0x") ? `${EXPLORER_TX}${hash}` : null);
export const short = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

// ---------- wallets ----------

export function walletFilePath() {
  return process.env.WALLET_FILE || DEFAULT_WALLET_FILE;
}

// Reads a JSON wallet file with { address, privateKey }. Returns a viem account or null.
export function loadAccount(file = walletFilePath()) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    if (typeof j.privateKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(j.privateKey)) return null;
    return privateKeyToAccount(j.privateKey);
  } catch {
    return null;
  }
}

// The shop wallet (payTo). Generated on first run into .secrets/shop-wallet.json.
export function loadOrCreateShopAccount(root) {
  const file = join(root, ".secrets", "shop-wallet.json");
  if (existsSync(file)) {
    const acc = loadAccount(file);
    if (acc) return { account: acc, file, created: false };
    throw new Error(`${file} exists but has no valid privateKey; move it away to create a new shop wallet`);
  }
  mkdirSync(dirname(file), { recursive: true });
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  writeFileSync(file, JSON.stringify({ note: "Harbour Line demo shop wallet, Arbitrum Sepolia test network only", network: NETWORK, address: account.address, privateKey, createdAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
  return { account, file, created: true };
}

// ---------- client side (the ferry CLI) ----------

const randomNonce = () => {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return `0x${Buffer.from(b).toString("hex")}`;
};

// Signs an EIP-3009 authorization for one x402 "exact" requirement and returns the X-PAYMENT value.
export async function createPaymentHeader(account, req) {
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: getAddress(req.payTo),
    value: String(req.maxAmountRequired),
    validAfter: String(now - 600),
    validBefore: String(now + Number(req.maxTimeoutSeconds || MAX_TIMEOUT_SECONDS)),
    nonce: randomNonce(),
  };
  const domain = { name: req.extra?.name || DOMAIN_NAME, version: req.extra?.version || DOMAIN_VERSION, chainId: CHAIN_ID, verifyingContract: getAddress(req.asset) };
  const signature = await account.signTypedData({
    domain,
    types: AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  const payload = { x402Version: 1, scheme: "exact", network: req.network || NETWORK, payload: { signature, authorization } };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodePaymentResponse(header) {
  try {
    return JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// ---------- server side ----------

const state = {
  mode: "ledger",
  reason: "not started",
  rpcUrl: process.env.RPC_URL || DEFAULT_RPC,
  shop: null, // viem account (payTo)
  gas: null, // viem account (payer / gas wallet)
  publicClient: null,
  walletClient: null,
  ledger: null, // { next(): "ledger-<n>", usedNonces: Set, save() }
  log: console.log,
};

function withTimeout(promise, ms, what) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);
}

// ledger: { next():string, nonceUsed(key):bool, markNonce(key) }
export async function initPay({ root, ledger, log = console.log }) {
  state.log = log;
  state.ledger = ledger;
  const shop = loadOrCreateShopAccount(root);
  state.shop = shop.account;
  if (shop.created) log(`[pay] created the shop wallet ${shop.account.address} in .secrets/shop-wallet.json`);
  const wanted = (process.env.PAY_MODE || "testnet").toLowerCase();
  if (wanted === "ledger") {
    state.mode = "ledger";
    state.reason = "PAY_MODE=ledger";
  } else {
    const gas = loadAccount();
    if (!gas) {
      state.mode = "ledger";
      state.reason = `no readable wallet file (WALLET_FILE ${walletFilePath()})`;
    } else {
      state.gas = gas;
      state.publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(state.rpcUrl, { timeout: 15_000, retryCount: 1 }) });
      state.walletClient = createWalletClient({ account: gas, chain: arbitrumSepolia, transport: http(state.rpcUrl, { timeout: 20_000, retryCount: 1 }) });
      try {
        const id = await withTimeout(state.publicClient.getChainId(), 6000, "RPC");
        if (id !== CHAIN_ID) throw new Error(`RPC is chain ${id}, expected ${CHAIN_ID}`);
        state.mode = "testnet";
        state.reason = "wallet file and RPC reachable";
      } catch (e) {
        state.mode = "ledger";
        state.reason = `RPC unreachable (${e.shortMessage || e.message})`;
      }
    }
  }
  if (!state.gas) state.gas = loadAccount(); // ledger mode may still know the payer address
  log(`[pay] mode: ${state.mode} (${MODE_LABEL[state.mode]}): ${state.reason}`);
  log(`[pay] shop wallet (payTo): ${state.shop.address}${state.gas ? ` · payer/gas wallet: ${state.gas.address}` : ""}`);
  return payStatus();
}

export function payStatus() {
  return {
    mode: state.mode,
    modeLabel: MODE_LABEL[state.mode],
    reason: state.reason,
    network: NETWORK,
    chainId: CHAIN_ID,
    asset: USDC,
    payTo: state.shop?.address ?? null,
    payer: state.gas?.address ?? null,
  };
}

export async function balances() {
  if (state.mode !== "testnet") return null;
  const read = (a) => state.publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [a] });
  const [shopUsdc, payerUsdc, payerEth] = await Promise.all([read(state.shop.address), read(state.gas.address), state.publicClient.getBalance({ address: state.gas.address })]);
  return { shopUsdc: atomicToUsdc(shopUsdc), payerUsdc: atomicToUsdc(payerUsdc), payerEth: Number(payerEth) / 1e18 };
}

export function shopAddress() {
  return state.shop.address;
}

export function paymentRequirements({ amountAtomic, resource, description }) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: String(amountAtomic),
    resource,
    description,
    mimeType: "application/json",
    payTo: state.shop.address,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    asset: USDC,
    extra: { name: DOMAIN_NAME, version: DOMAIN_VERSION },
  };
}

export function paymentRequiredBody(req, error = "payment required") {
  return { x402Version: 1, error, accepts: [req], mode: state.mode, modeLabel: MODE_LABEL[state.mode] };
}

class PayError extends Error {}

function decodePayment(header) {
  let p;
  try {
    p = JSON.parse(Buffer.from(String(header).trim(), "base64").toString("utf8"));
  } catch {
    throw new PayError("X-PAYMENT is not base64 JSON");
  }
  if (p?.x402Version !== 1) throw new PayError("x402Version must be 1");
  if (p.scheme !== "exact") throw new PayError('scheme must be "exact"');
  if (p.network !== NETWORK) throw new PayError(`network must be "${NETWORK}"`);
  const a = p.payload?.authorization;
  const sig = p.payload?.signature;
  if (!a || typeof sig !== "string" || !/^0x[0-9a-fA-F]+$/.test(sig)) throw new PayError("payload needs signature and authorization");
  for (const k of ["from", "to"]) if (!isAddress(String(a[k]))) throw new PayError(`authorization.${k} is not an address`);
  for (const k of ["value", "validAfter", "validBefore"]) if (!/^\d+$/.test(String(a[k]))) throw new PayError(`authorization.${k} must be a whole number`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(a.nonce))) throw new PayError("authorization.nonce must be 32 bytes hex");
  return {
    signature: sig,
    auth: { from: getAddress(a.from), to: getAddress(a.to), value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce.toLowerCase() },
  };
}

async function verify({ signature, auth }, req) {
  if (auth.to !== getAddress(req.payTo)) throw new PayError("authorization.to is not the shop wallet");
  if (auth.value < BigInt(req.maxAmountRequired)) throw new PayError(`authorization.value is below the price (${req.maxAmountRequired})`);
  if (auth.value > BigInt(req.maxAmountRequired)) throw new PayError("authorization.value is above the price; sign the exact amount");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (auth.validAfter > now) throw new PayError("authorization is not valid yet");
  if (auth.validBefore <= now + 5n) throw new PayError("authorization has expired");
  const ok = await verifyTypedData({ address: auth.from, domain: DOMAIN, types: AUTH_TYPES, primaryType: "TransferWithAuthorization", message: auth, signature });
  if (!ok) throw new PayError("signature does not match authorization.from");
  const key = `${auth.from.toLowerCase()}:${auth.nonce}`;
  if (state.ledger.nonceUsed(key)) throw new PayError("this authorization was already used");
  return key;
}

function splitSig(signature) {
  const s = parseSignature(signature);
  const v = s.v !== undefined ? Number(s.v) : Number(s.yParity) + 27;
  return { v, r: s.r, s: s.s };
}

const isNetworkError = (e) => /fetch failed|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|HTTP request failed/i.test(`${e?.name} ${e?.shortMessage} ${e?.message}`);

// Submits a signed authorization from the gas wallet; waits for 1 confirmation.
async function submit(sigAuth) {
  const { auth, signature } = sigAuth;
  const { v, r, s } = splitSig(signature);
  const args = [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v, r, s];
  const [balance, used] = await Promise.all([
    state.publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [auth.from] }),
    state.publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: "authorizationState", args: [auth.from, auth.nonce] }),
  ]);
  if (used) throw new PayError("this authorization was already used on chain");
  if (balance < auth.value) throw new PayError(`the payer has ${atomicToUsdc(balance)} test USDC, not enough`);
  const { request } = await state.publicClient.simulateContract({ account: state.gas, address: USDC, abi: USDC_ABI, functionName: "transferWithAuthorization", args });
  const hash = await state.walletClient.writeContract(request);
  let confirmed = false;
  try {
    const rc = await state.publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
    if (rc.status !== "success") throw new PayError(`transaction reverted: ${hash}`);
    confirmed = true;
  } catch (e) {
    if (e instanceof PayError) throw e;
    state.log(`[pay] sent ${hash} but no confirmation yet (${e.shortMessage || e.message})`);
  }
  return { txHash: hash, confirmed };
}

function ledgerSettle() {
  return { txHash: state.ledger.next(), confirmed: true };
}

// Verifies X-PAYMENT against the requirement and settles it.
// Returns { ok:true, txHash, explorerUrl, mode, modeLabel, payer, amountAtomic, confirmed } or { ok:false, error }.
export async function verifyAndSettle(header, req) {
  let decoded;
  let key;
  try {
    decoded = decodePayment(header);
    key = await verify(decoded, req);
  } catch (e) {
    return { ok: false, error: e instanceof PayError ? e.message : `could not verify the payment: ${e.message}` };
  }
  let mode = state.mode;
  let result;
  let fallbackReason;
  try {
    if (mode === "testnet") {
      try {
        result = await submit(decoded);
      } catch (e) {
        if (e instanceof PayError || !isNetworkError(e) || process.env.PAY_FALLBACK === "off") throw e;
        fallbackReason = `test network unreachable (${e.shortMessage || e.message})`;
        state.log(`[pay] ${fallbackReason}; settling on the local test ledger instead`);
        mode = "ledger";
        result = ledgerSettle();
      }
    } else {
      result = ledgerSettle();
    }
  } catch (e) {
    return { ok: false, error: e instanceof PayError ? e.message : `settlement failed: ${e.shortMessage || e.message}` };
  }
  state.ledger.markNonce(key);
  return {
    ok: true,
    txHash: result.txHash,
    explorerUrl: explorerUrl(result.txHash),
    confirmed: result.confirmed,
    mode,
    modeLabel: MODE_LABEL[mode],
    payer: decoded.auth.from,
    payTo: decoded.auth.to,
    amountAtomic: decoded.auth.value.toString(),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

export function paymentResponseHeader(settled) {
  return Buffer.from(JSON.stringify({ success: true, transaction: settled.txHash, network: NETWORK, payer: settled.payer })).toString("base64");
}

// Refund: the shop signs an authorization back to the payer; the gas wallet submits it.
// mode = the mode the payment was settled in (a ledger payment gets a ledger refund).
export async function refund({ to, amountAtomic, mode }) {
  if (mode !== "testnet") {
    return { txHash: state.ledger.next(), explorerUrl: null, mode: "ledger", modeLabel: MODE_LABEL.ledger, confirmed: true };
  }
  if (state.mode !== "testnet" || !state.publicClient) {
    // a real test-network payment must get a real refund, never a ledger entry
    throw new Error(`this order was paid on the test network, but the server is on the local test ledger now (${state.reason}). Restart it without PAY_MODE=ledger to send the refund`);
  }
  const now = Math.floor(Date.now() / 1000);
  const auth = {
    from: state.shop.address,
    to: getAddress(to),
    value: BigInt(amountAtomic),
    validAfter: BigInt(now - 600),
    validBefore: BigInt(now + 900),
    nonce: randomNonce(),
  };
  const signature = await state.shop.signTypedData({ domain: DOMAIN, types: AUTH_TYPES, primaryType: "TransferWithAuthorization", message: auth });
  const r = await submit({ auth, signature });
  return { txHash: r.txHash, explorerUrl: explorerUrl(r.txHash), mode: "testnet", modeLabel: MODE_LABEL.testnet, confirmed: r.confirmed };
}
