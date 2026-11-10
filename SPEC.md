# Build spec: "Your Next Customer Won't Click"

Devcon 8 · Agentic Hub (open booth, ~30 seats, one TV, one mic, silent headsets, wired 20 Mbps) ·
**Wed 4 Nov 2026, 15:00–15:40 IST** · Fortunato Cinquepalmi, Product Lead at Kleros.
Harish Kotra's demo "Can an Agent Buy From You? Find, Check, Pay, Get the Result" follows at 15:40.

Thesis: **"The agent's channel is getting wider. The human's is getting narrower. Design what crosses the narrow one."**

This file is the contract every builder follows. If you must change a contract, write the change
in `docs/CHANGES-TO-SPEC.md` and keep backwards compatibility. Integration status and the commands to run the demo: `docs/INTEGRATION.md`.

## Hard rules

- Plain, common English on screen and in notes. Titles short. Technical words only where they are the
  thing itself (CLI, API, Markdown, x402, USDC).
- No exclamation marks, no emoji, no hype, no "the website is dead", no unofficial forecasts, no
  invented numbers. Every number on a slide comes from `docs/CLAIMS.md` with its source shown small.
- Crypto is named plainly (wallet, USDC, x402, test network) but never "maxi": no token prices, no chains as heroes.
- Every brand in the demo is fictional ("Harbour Line" ferries). Never imitate a real company's look or name.
- Motion: presenter-controlled. Every beat on a click, moves of about 1–2 s, nothing important auto-plays fast.
- Everything runs on the laptop, offline except model calls and the test-network payment. Every live
  part has a fallback.
- Node 22, ESM, no build step for web pages (plain HTML/CSS/JS). Only dependency allowed in the
  server: `viem`. The deck keeps its own `deck/package.json` (fontsource + qrcode).
- Never commit secrets. `.secrets/`, `.env.local`, `node_modules/` are gitignored.

## Layout

```
agent-front-door/
  SPEC.md                 this file
  package.json            root: "start": "node server/index.mjs", deps: viem
  server/index.mjs        the one server (port 4900, 0.0.0.0) — routes below
  server/pay.mjs          x402 "exact" scheme on Arbitrum Sepolia test USDC (EIP-3009), ledger fallback
  shop/data.mjs           Harbour Line catalogue: routes, departures, classes, prices (the single source)
  shop/cli.mjs            the `ferry` CLI an agent uses (bin: ./bin/ferry)
  shop/door/              agent-door texts: index.md, llms.txt, SKILL.md
  web/ferry/              the human website (index.html, app.js, style.css, recorder.js, replay.js)
  race/board/             race board (index.html, board.js, board.css)
  race/approve/           the yes card for the phone (index.html)
  race/lane1.mjs          lane-1 runner: drives the Claude Code CLI and reports to the server
  race/recordings/        recorded sessions and races (jsonl / json)
  door/                   the talk's own agent door (index.html, talk.md, llms.txt) — publishable as static files
  deck/                   the slide deck (Chiang Mai engine, see "Deck")
  docs/CLAIMS.md          every number and quote, with source and status
  RUN-SHEET.md            how to run it on stage (written last)
```

## Server (`server/index.mjs`) — port 4900, binds 0.0.0.0, prints the LAN URL for the phone

| Route | What |
|---|---|
| `GET /` | 302 → `/deck/` |
| `GET /deck/` | `deck/index.html` (built) |
| `GET /board/…` | static `race/board/` |
| `GET /approve/…` | static `race/approve/` (phone yes card; `?order=<id>`, else latest pending) |
| `GET /talk` | the talk's door: HTML (`door/index.html`) for browsers, Markdown (`door/talk.md`) when the client asks for Markdown |
| `GET /talk.md`, `/talk/llms.txt` | the Markdown and llms.txt of the talk |
| `GET /ferry/` | **content negotiation**: Markdown (`shop/door/index.md`) if `Accept` lists `text/markdown` before `text/html` (or `?format=md`), else the website `web/ferry/index.html` |
| `GET /ferry/llms.txt`, `/ferry/SKILL.md` | agent-door files |
| `GET /ferry/<asset>` | static `web/ferry/` assets |
| `GET /ferry/api/routes` | routes, boarding points, seat classes, prices |
| `GET /ferry/api/departures?route=&date=YYYY-MM-DD` | departure slots with seats left and price per class |
| `POST /ferry/api/quote` | body = Booking (below) → Quote |
| `POST /ferry/api/orders` | `{quoteId, channel:"agent"|"web", agent?:{name}, card?:{last4}}` → agent: `202 {orderId,status:"awaiting_approval",approveUrl}`; web: `201 {orderId,status:"paid",ref}` (simulated test card, no chain) |
| `GET /ferry/api/orders/:id` | Order |
| `POST /ferry/api/orders/:id/approve` | `{decision:"yes"|"no", alternativeId?}` (from the yes card) |
| `POST /ferry/api/orders/:id/pay` | x402: without `X-PAYMENT` → `402` + PaymentRequirements; with it → verify, settle, `200 {receipt}` + `X-PAYMENT-RESPONSE` |
| `POST /ferry/api/orders/:id/refund` | refund on the test network (shop → payer), for undo and to recycle test funds |
| `GET /events` | Server-Sent Events, every event below, `data: <json>` |
| `POST /rec` | website recorder batch → re-broadcast + append to `race/recordings/session-<sessionId>.jsonl` |
| `POST /race/start` `{replay?: "<file>"}` | sets t0, emits `race.start`; if `LANE1=auto` spawns `race/lane1.mjs` |
| `POST /race/reset` | emits `race.reset`, clears race state |
| `POST /lane1/event` | lane-1 runner reports (`agent.say`, `agent.tool`, `agent.usage`, `agent.done`) → re-broadcast |
| `GET /race/recordings/<file>` | serve a recording |
| `GET /race/state` | `{t0, running, events:[…since race.start], pending:[orders awaiting approval]}` — the board and the yes card call it on load (so a reload mid-race recovers), then follow `/events` |

The server also writes every event of a race to `race/recordings/race-<t0>.jsonl` and keeps a copy
of the last finished race as `race/recordings/race-latest.json` (`{t0, events}`).

Every HTML response under `/ferry/` carries
`Link: </ferry/llms.txt>; rel="llms-txt", </ferry/SKILL.md>; rel="agent-skill"` and every response
carries `Vary: Accept`. CORS open (`*`) for GET/POST so the deck and board can call it.

Lane attribution: the CLI sends `X-Lane: 1` and `User-Agent: ferry-cli/1`; the website sends its
lane in recorder batches (`?lane=2` / `?lane=3` in its URL; default 3). Requests to `/ferry/` agent-door
paths from anything else count as lane `"x"` (an outside agent, e.g. someone in the room).

### Events (SSE `data:` JSON; all have `t` = epoch ms, `lane` = "1" | "2" | "3" | "x" | "sys", `type`)

- `agent.request` `{method, path, status, bytes, ms, accept, summary}` — every agent-door hit. `summary` is one plain line ("read the Markdown door", "asked for departures on Sat 7 Nov", "got the price: 402, 12.80 USDC").
- `web.view|web.step|web.field|web.click|web.error|web.submit|web.done` — from the website recorder (`step`, `field`, `label`, `valueLen`; `web.done` also has `ref`). Values stay in the session file, not on the stream.
- `order.quoted {quoteId,total}` · `order.awaiting_approval {orderId,total,approveUrl}` · `order.approved` · `order.declined` · `order.payment_required {amount,asset,network,payTo}` · `order.paid {orderId,txHash,explorerUrl,amount,mode}` · `order.refunded {txHash}`.
- `agent.say {text}` · `agent.tool {name, input}` · `agent.usage {inputTokens,outputTokens,turns}` · `agent.done {ok}` — from the lane-1 runner.
- `race.start {t0, replay?}` · `race.reset` · `lane.done {lane, ms, steps}` (server computes: lane 1 done = `order.paid` of a lane-1 order; lanes 2/3 done = `web.done`).

## Harbour Line catalogue (`shop/data.mjs`, single source for web, API, CLI, door texts)

- Operator: **Harbour Line** (fictional). Route `gateway-elephanta`: Gateway of India → Elephanta Island. Also `gateway-mandwa` (decoy).
- Date for the demo: **Saturday 7 November 2026** (the API accepts any date; Saturdays have more slots).
- Departures Gateway → Elephanta: 09:00, 09:30, 10:00, 10:30, 11:30 · returns from Elephanta: 12:30, 14:00, 15:30, 17:00. Seats left vary (09:30 upper deck: 6 left; 09:00 upper deck: sold out).
- Seat classes (price per person, return trip, in USDC; INR shown small for colour at 1 USDC = 88 INR, labelled "approx."): `economy` 2.60 · `upper-deck` 3.20 · `upper-deck-guide` 4.80.
- Boarding points: `jetty-1` (Gateway jetty 1), `jetty-4` (Gateway jetty 4, step-free access).
- Passenger: `{name, age, idType: "passport"|"aadhaar"|"driving-licence", idNumber}`; age < 5 travels free; ID required for 18+.
- Booking: `{route, date, departure, return, seatClass, boardingPoint, passengers:[…], assistance?: string}`.
- Quote: `{quoteId, booking, lines:[{label, qty, unit, amount}], total, currency:"USDC", inrApprox, expiresAt, alternatives:[{id, label, change, total}] }` — exactly two alternatives: one cheaper (economy), one later (10:30 upper deck).
- Order: `{orderId, quoteId, channel, status:"awaiting_approval"|"approved"|"declined"|"paid"|"refunded", total, approveUrl, receipt?}`.
- Receipt: `{orderId, ref, paidAt, amount, asset:"USDC", network:"arbitrum-sepolia", mode:"testnet"|"ledger", txHash, explorerUrl, tickets:[{passenger, seat}]}`.

## Demo mission (shown on the board header; lane 1 gets it as its prompt; lane 3 types it)

> Book Harbour Line ferry tickets for four: Gateway of India to Elephanta on Saturday 7 November,
> leaving between 9 and 10, back after 14:00, upper deck if it is under 4 USDC a person, boarding at
> the step-free jetty. Passengers: Asha Rao, 31, passport P4417702 · Leo Marin, 34, passport
> X9024416 · Mei Tan, 27, driving licence MH0220190045 · Sam Okoye, 40, passport A7781230.
> Sam uses a cane: ask for help boarding. Ask me before you pay.

All names and ID numbers are fictional.

## Payment (`server/pay.mjs`)

- x402 v1, scheme `exact`, network `arbitrum-sepolia` (chainId 421614), asset = Circle test USDC
  `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (6 decimals). EIP-712 domain: name **"USD Coin"**,
  version **"2"**, chainId 421614, verifyingContract = asset. Authorization = EIP-3009
  `TransferWithAuthorization(from,to,value,validAfter,validBefore,nonce)`.
- 402 body: `{x402Version:1, error:"payment required", accepts:[{scheme:"exact", network:"arbitrum-sepolia", maxAmountRequired:"<atomic>", resource:"<url>", description, mimeType:"application/json", payTo:"<shop>", maxTimeoutSeconds:300, asset:"<usdc>", extra:{name:"USD Coin", version:"2"}}]}`.
- `X-PAYMENT` = base64 JSON `{x402Version:1, scheme:"exact", network:"arbitrum-sepolia", payload:{signature, authorization:{from,to,value,validAfter,validBefore,nonce}}}`.
- Settlement: the server verifies the signature and amount, then submits `transferWithAuthorization`
  itself (it is its own facilitator) from the **payer/gas wallet** and waits for 1 confirmation.
  Explorer: `https://sepolia.arbiscan.io/tx/<hash>`.
- Wallets: payer/gas = Agent_005 test wallet, file at env `WALLET_FILE` (default
  `~/Library/Mobile Documents/com~apple~CloudDocs/Kleros/Agent_005/wallet/sepolia-wallet.json`, JSON with
  `address`, `privateKey`; holds ~0.041 test ETH and ~19.99 test USDC on 4 Nov). Shop (payTo) = a key
  generated on first run into `.secrets/shop-wallet.json`. Refund = shop signs an authorization back to
  the payer; the gas wallet submits it. **Never print or log private keys.**
- `PAY_MODE=ledger` (or automatically when the wallet file or RPC is unreachable): same 402 and
  signature flow, settlement recorded locally with id `ledger-<n>` and `mode:"ledger"`, labelled
  "local test ledger" everywhere it shows.
- RPC: env `RPC_URL`, default `https://sepolia-rollup.arbitrum.io/rpc`.

## The `ferry` CLI (`shop/cli.mjs`, `bin/ferry`)

Plain flags, JSON with `--json`, human-readable lines otherwise. Base URL from `--shop` or env
`FERRY_SHOP` (default `http://127.0.0.1:4900/ferry`). Sends `X-Lane: 1`.

```
ferry routes
ferry departures --route gateway-elephanta --date 2026-11-07
ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 \
  --class upper-deck --board jetty-4 \
  --passenger "Asha Rao,31,passport,P4417702" --passenger "…" --assist "Sam uses a cane: help boarding"
ferry book <quoteId>            # creates the order, prints the approve link, returns at once
ferry wait <orderId> [--timeout 100]   # blocks until approved/declined, then pays (x402) and prints the receipt
ferry status <orderId>
ferry refund <orderId>
```

`wait` handles x402 itself: POST pay → 402 → sign with `WALLET_FILE` → retry with `X-PAYMENT`.
Exit codes: 0 ok, 2 declined, 3 timeout (still waiting: run `wait` again), 1 error.

## Agent door texts (`shop/door/`)

- `index.md`: what Harbour Line sells, today's routes and prices table, "How to book as an agent" (CLI
  first, then raw API), the rules (ask your human before paying; price in USDC on a test network;
  free cancellation until Friday 18:00), links to SKILL.md and llms.txt. Under 2 KB.
- `llms.txt`: llms.txt format (title, summary, links).
- `SKILL.md`: an Agent Skill (frontmatter `name`, `description`) teaching the CLI flow step by step.

## Human website (`web/ferry/`) — Harbour Line, the human door

A believable, good-looking ferry operator site (not Kleros-styled, own palette: sea teal and sand),
responsive down to ~560 px wide (it is shown in a board lane). No external assets: SVG/CSS art only.
Deliberate, realistic friction, all custom widgets (nothing a browser can autofill):

1. Cookie banner (must pick "Only necessary" or "Accept all").
2. "Sign in to book": create an account (email, password twice, terms checkbox) → "We sent a code"
   then a fake message toast shows a 6-digit code after ~3 s → enter code.
3. Trip: route (custom dropdown), date (custom calendar), departure slot chips (with seats left,
   sold-out states), return slot chips.
4. Passengers: count stepper, then per passenger: name, age, ID type (custom select), ID number;
   seat class (cards); boarding point (cards); special assistance (textarea).
5. Review: summary, total in USDC with approx. INR, two alternatives shown side by side.
6. Pay: card form (number, expiry, CVC, name). Test card `4242 4242 4242 4242` only; anything else
   is declined. Uses `POST /ferry/api/orders` with `channel:"web"`.
7. Ticket: booking reference, QR-like SVG pattern (decorative), passengers.

Validation errors are realistic (age required, ID format, return after departure).
`recorder.js` posts batches to `/rec` (`{lane, sessionId, events:[{t, type, step, field, label, value, valueLen}]}`),
including full field values (all test data) so a session can be replayed.
`replay.js`: `?replay=<recording file>&lane=2` loads `/race/recordings/<file>` and re-applies the
events into the live page at recorded timing, starting when it receives `race.start` (SSE) or
`postMessage({type:"race.start"})`, or at once with `&autoplay=1`. A small corner tag reads
"Recorded <date time>, real speed". App code is a small state machine (`app.apply(event)`) so the
replay drives the same code paths as a person.

## Race board (`race/board/`) — 1920×1080, Luminous Data look (see Deck)

Header: "The race" + the mission in one line + a global clock since `race.start`.
Three lanes (widths ~560 / ~560 / ~760):

1. **Agent · agent door** — what the agent sees: a terminal-style feed of `agent.request` and
   `agent.tool` events (path, status, bytes, one plain summary line), a four-step track
   **Discover → Price → Permission → Pay** that lights as the order moves, a token meter from
   `agent.usage`, and when `order.awaiting_approval` arrives, the yes card in a phone frame
   ("Waiting for your yes" with a waiting timer). Shows the receipt with the explorer link on `order.paid`.
2. **Agent · human door** — iframe `/ferry/?lane=2&replay=<file>` scaled to fit, its own timer and a
   step counter from `web.*` events; tag "Recorded <date> <time>, real speed" (from the recording's first event).
3. **You · human door** — interactive iframe `/ferry/?lane=3` (the presenter types here), timer and step counter.

Each lane: big timer (mm:ss.s) that freezes on `lane.done`, steps count, status line in plain words.
Keys: `S` start (POST /race/start), `R` reset, `F` full screen. `?embed=1` hides the header for use
inside a deck slide; it also listens to `postMessage({type:"race.start"|"race.reset"})`.
`?replay=race-<id>.jsonl` replays a whole recorded race from the server (fallback).
After all lanes finish (or on key `D`), a result strip: time, steps, tokens per lane.

## Yes card (`race/approve/`) — the phone

Phone layout. Content (this is the slide's "what the human should see"):
picture (SVG illustration of the boat and route) · "Pay 12.80 USDC to Harbour Line" (test network badge) ·
the order in four lines · "This matches your request" with one line per mission point, and any
deviation flagged softly (a quiet dot, not a red X) · two alternatives side by side (cheaper, later) ·
how to undo ("Free cancellation until Fri 18:00, refund to the same wallet") · what this yes covers
("This order only, expires in 10 minutes") · buttons **Yes, pay** / **Not now**, and "Choose" on an alternative.
Polls or listens to `/events` for the latest `order.awaiting_approval`.

## Lane-1 runner (`race/lane1.mjs`)

Spawns the Claude Code CLI (`CLAUDE_BIN`, default
`~/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude`)
with `-p <mission + "The Harbour Line agent door is http://127.0.0.1:4900/ferry/. You can use curl and the ferry CLI at ./bin/ferry.">`,
`--output-format stream-json --verbose`, allowed tools limited to `Bash(curl:*)`, `Bash(./bin/ferry:*)`
(adapt exact syntax to the CLI's `--allowedTools`), cwd = the project root. Parses the stream and
POSTs `agent.say` / `agent.tool` / `agent.usage` / `agent.done` to `/lane1/event`. `--dry` prints the
command without running.

## Deck (`deck/`) — the Chiang Mai engine, ported

Copied from `/Users/mac45/dev/how-ai-agents-act/deck` (read its `build.mjs`, `src/deck.js`,
`src/deck.css`, `src/tokens.css` and any slide in `src/slides/` as reference). Conventions:

- One file per slide: `deck/src/slides/<id>.html` with `<section class="slide" data-id="<id>" data-title="…" data-chapter="…">`,
  optional `<style>` (always scoped to `.slide[data-id="<id>"]`) and `<script>` registering
  `window.DECK_SLIDE_HOOKS["<id>"] = (slide, step, entering, api) => {…}` or `{enter, step, leave}`.
- Stage is 1920×1080, absolute layout. Build steps: `<i data-step="n" hidden></i>` markers; the engine
  adds `.b1 … .bN` on the slide as steps advance (and `.is-shown` on `[data-step]` elements), `.is-in` on entry.
- Notes: `<aside class="notes"><p><b>[m:ss]</b></p><p>what to say, press by press</p><p>Careful: …</p></aside>`.
- Look: **Luminous Data · dark** (`data-look="curate"`): stage #02040B, blue aurora at the top,
  Urbanist 500 headlines (`var(--font-display)`), Geist text, `<em>` = lit gradient-blue accent word,
  data and diagrams as the hero. Use the tokens in `tokens.css`; do not hard-code new palettes.
- Narrative file `deck/src/narratives/front-door.json` (`id`, `name`, `pitch`, `ids`, `chapters`).
- Screenshot a slide headless: `deck/shot.sh <slide-id> [step]` → PNG (engine port provides it).

### Running order (ids, chapter, ~time) — the talk is ~19 minutes

Opening
1. `title` — "Your next customer won't click." / Designing for humans and agents · name, role, Devcon 8 · Agentic Hub. (0:30)
2. `fd-thesis` — two channels drawn as light: a wide band (the agent's), a narrow one (the human's). Line 1, press, line 2 "Design what crosses the narrow one." (1:00)

Then · You read the page
3. `fd-then` — split screen: what the human sees (a homepage: hero, menu, cookie banner, sign-up) vs what the agent sees (the same page as tag soup, with its size). "One door, built for eyes." (1:00)
4. `fd-twodoors` — LIVE: same link, two doors. Left: `/talk` in an iframe (human door). Right: a
   terminal pane that fetches `/talk` with `Accept: text/markdown` and prints status, headers, byte
   count and the Markdown. Under it: the size of each. Fallback when not on localhost: a recorded
   response embedded at build time. Source line: Cloudflare's own launch post went from 16,180 to
   3,150 tokens as Markdown. (1:30)

Now · Your agent reads the docs
5. `fd-laptop` — first person: "Of the 34 projects on my laptop, 32 started this year. 21 have a way in for agents. 13 have no screen at all." Tile grid of 34 projects coloured by surface. Then "134 of my 142 commits from 17 Oct to 3 Nov were co-written with an agent." (1:00)
6. `fd-docs` — "Agents come in through the docs." What I see: most integrations come in through our docs, not our homepage (no percentage). Public: Claude Code is one of the top readers of llms.txt files, and 97% of llms.txt files got no requests at all (Ahrefs, Jun 2026): today's agent customers are builders' agents. (1:00)
7. `fd-scout` — "I made Scout readable by agents": the response header `Link: </llms.txt>` and the Human/Agent toggle, as they are live on scout-app.kleros.io. (0:45)
8. `fd-format` — "For agents, the format changes the result." His public quote (Live stream, 9 Sep 2026): "If we are humans we do not care if the text is in a PDF, a doc or a PNG… for agents the difference is huge." Then the QR story: at my last talk the QR worked for people and failed for agents, so each case got a phone page and a .txt. (1:00)
9. `fd-agent-gets` — "What the agent should get": Discover → Price → Permission → Pay, each with the door piece: a Markdown page and a skill file · the price in the reply (HTTP 402) · a request the human can say yes to · a receipt it can show. Plus: a CLI takes flags, not forms. (1:15)
10. `fd-human-sees` — "What the human should see": the anatomy of the yes card (picture, total, what it matches, two alternatives side by side, how to undo, what the yes covers). Evidence small: side by side changes the winner (Hsee); agents take the first offer 60–100% of the time in Microsoft's simulated market, so show the options, not only the pick. (1:15)
11. `fd-race-intro` — "A race": three lanes (agent on the agent door · agent on the human door · me on the human door), the mission, "a form nothing can autofill". (0:30)
12. `fd-race` — LIVE: the race board embedded (`/board/?embed=1`), started by a press. Fallback: board in replay mode. (3:00)
13. `fd-race-result` — the result strip with tonight's real numbers (filled from the rehearsal recording; until then a clearly marked placeholder). "The agent was done in seconds. Then it waited for me." (0:45)
14. `fd-should` — "Powerful models can use your website. That doesn't mean they should." Line drawing: a robot in the driver's seat vs a car built to drive itself. One number under it: same task, a screen agent took 53 steps, 551k tokens and ~17 minutes and failed; an API agent took 8 calls, 12k tokens and 20 seconds (Reflex, Apr 2026). (1:00)

Already starting · The agent acts on its own
15. `fd-dial` — the dial: Ask → Approve → Set rules → On its own. At each notch the human pane shrinks to what still crosses. One story per notch: Approve — an AI juror wrote a verdict titled "Refund buyer", then cast the vote that pays the seller (check the action, not the explanation). Set rules — in my agent-shop prototype, permission has four settings: none, agent attestation, signed delegation, human confirmation; my tools only read until you pass `--execute`. On its own — trust is earned in steps: Watch closely, Check less, On its own (a colleague who runs an AI juror, about 30 cases in, no longer checks its votes; public stream 26 Aug). (2:00)
16. `fd-crossings` — "Three things cross the narrow channel": before — the mission and its fence; during — a yes, only where you want one; after — the receipt and a ruling in plain words. At full autonomy the middle one fades; the other two never do. (1:00)
17. `fd-after` — "After is where trust is earned." With a Visa card, today, there is no "my agent got it wrong" dispute reason (Visa Core Rules ch. 11), and under Visa's rules the cardholder answers for the agent's purchase "as if the Cardholder initiated" it. Kleros, one beat: 88 real disputes replayed with AI jurors: 48.9 hours became 9.8 minutes, 72 of 88 rulings matched; people stay as the expensive exit on appeal (being built). (1:15)
18. `fd-leave` — "Leave knowing": three columns — what the agent should get · what the human should see · where trust is earned. (0:45)
19. `fd-next` — hand-off: "Next: Harish Kotra · Can an agent buy from you?" + the talk's door: "Runs on this laptop during the talk. Find me after to try it." + the thesis line once more. (0:30)

Backup slides (after the running order): `fd-sources` (all sources), `fd-race-backup` (static result if the board fails).

## Simplified for the talk (4 Nov, 12:45 IST)

- `npm start` (no variables) runs everything: lane 1 starts with the race (`LANE1` defaults to `auto`).
- The human's yes on a lane-1 order comes by itself `AUTO_YES_MS` after the agent asks (default 7000;
  `AUTO_YES_MS=0` answers by hand). The event is `order.approved` with `auto: true`.
- Paid agent orders on the test network are refunded by themselves on `/race/reset` and at server start
  (`AUTO_REFUND=0` turns it off). Never during a race.
- The live website (not lane 2's replay) takes any name at sign-in and goes straight to the trip page
  (`?quick=0` restores the full sign-in with the emailed code).

