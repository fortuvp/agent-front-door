# Your Next Customer Won't Click

Deck, demo shop and live race for the talk **"Your Next Customer Won't Click: Designing for Humans and
Agents"** by Fortunato Cinquepalmi (Product Lead, Kleros), Devcon 8, Agentic Hub, Mumbai,
Wed 4 Nov 2026, 15:00 IST.

> The agent's channel is getting wider. The human's is getting narrower. Design what crosses the narrow one.

## Just want the slides?

Download [`deck/offline.html`](deck/offline.html) and open it in Chrome. It is one file, works
without internet, and shows the rehearsal recording wherever the talk ran something live.

Keys: → / ← next and previous, F full screen, O overview, N notes, P presenter window, B black.

## What runs live

On stage everything ran from one Node server on the laptop:

- **Harbour Line**, a made-up ferry company (Gateway of India → Elephanta) with two doors:
  a website for people (`web/ferry/`) and a door for agents: Markdown, `llms.txt`, a skill file and a
  `ferry` CLI (`shop/`).
- **The race**: three lanes book the same trip at the same time. Lane 1 is an agent on the command line,
  lane 2 an agent clicking through the website, lane 3 a person typing. The board (`race/board/`) times
  them; the agent's payment waits for a yes on a small approval card (`race/approve/`).
- **Payment**: x402 with test USDC on the Arbitrum Sepolia test network (`server/pay.mjs`), refunded
  automatically when the race resets. Without a wallet it falls back to a local ledger, so the demo runs
  with no funds at all.
- **The deck** (`deck/`), served at `/deck/`, which embeds the live board and the `/talk` page.

## Run it

Node 22 or later.

```bash
git clone https://github.com/fortuvp/agent-front-door
cd agent-front-door
npm install
(cd deck && npm install)
npm start
```

Then open `http://127.0.0.1:4900/deck/`. The server prints every address it serves.

Lane 1 drives [Claude Code](https://claude.com/claude-code) from the command line, so it needs Claude
Code installed and signed in. It looks for the copy bundled with the Claude desktop app on macOS; point
`CLAUDE_BIN` at your `claude` binary otherwise. Set `LANE1=manual` to start that lane yourself.

| Variable | What it does |
|---|---|
| `PORT` | Server port, default `4900` |
| `PAY_MODE` | `testnet` (default) or `ledger` (no chain, no wallet) |
| `WALLET_FILE` | JSON file with the payer's test wallet. Missing → ledger mode |
| `RPC_URL` | Arbitrum Sepolia RPC |
| `LANE1` | `auto` (default) starts the CLI agent when the race starts; `manual` does not |
| `AUTO_YES_MS` | The approval card says yes by itself after this many ms (default `7000`; `0` turns it off) |
| `AUTO_REFUND` | `0` keeps test payments instead of refunding them on reset |

The shop's own wallet is created on first run in `.secrets/` (gitignored). Never commit keys.

## Rebuild the deck

```bash
cd deck
node build.mjs          # index.html, the talk copy (calls the server when it is there)
node make_offline.mjs   # offline.html, the shareable copy with the GitHub notice
```

Slide sources are in `deck/src/slides/`, the running order in `deck/src/narratives/front-door.json`.
`node check.mjs` walks every slide and step and reports errors.

## Files

| | |
|---|---|
| `SPEC.md` | The build contract: rules, layout, routes, slide list |
| `RUN-SHEET.md` | The checklist used on the day |
| `SPEAKER-GUIDE.md` | What to say on each slide, generated from the deck notes |
| `docs/INTEGRATION.md` | How the pieces connect, with test transactions |
| `race/recordings/` | Recordings of the rehearsal and talk-day races, used for replay |

The fact-check ledger the slides cite (`docs/CLAIMS.md`) is not published: it includes internal team
sources. Every number on a slide shows its public source in small type.

Harbour Line, its routes and every name in the race are made up.
