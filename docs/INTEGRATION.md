# Integration status

Integration pass, Wed 4 Nov 2026, 08:20 to 08:45 IST, on port 4900. Everything below was run on
this laptop. The contract is `SPEC.md`; additions are in `docs/CHANGES-TO-SPEC.md`.

## What works (tested today)

| Part | How it was tested | Result |
|---|---|---|
| Every route in SPEC.md | curl on each route | All answer. `/` is a 302 to `/deck/`. `/talk` and `/ferry/` give HTML to browsers and Markdown when `Accept` lists `text/markdown` first (or `?format=md`). `/ferry/` carries the `Link` header (llms-txt, agent-skill) and `Vary: Accept`. `/race/state`, `/race/recordings/`, `/events`, `/rec`, `/lane1/event`, `/health`, `/ferry/api/status` all answer. |
| CLI as lane 1, local test ledger | `ferry routes`, `departures`, `quote` (the demo mission), `book`, `wait`, approve on the yes card, refund | 402, signed authorization, paid `ledger-14`, tickets U11 to U14, refund `ledger-15`. Booking the same quote twice returns the same order. |
| CLI as lane 1, test network (one real payment) | the same flow with the server in test-network mode | Paid 12.80 USDC on Arbitrum Sepolia 5.4 s after the yes: [0x5142a5f5…6d20](https://sepolia.arbiscan.io/tx/0x5142a5f5ab5e6675de87ab7fa5e0e0642a786495808de13a5c84083005c86d20). Refunded with `ferry refund` in 7.4 s: [0x281c1230…8b5a](https://sepolia.arbiscan.io/tx/0x281c123079ad19493fe2ae5afa67d162f2a9a2d8221d1931eaf19b4f0b6e8b5a). Payer back at 19.995 test USDC; gas used about 0.000004 test ETH (0.0411 left). |
| Board during the run | headless Chrome screenshots at each step (board reloaded each time, so recovery from `/race/state` was tested too) | Feed of requests with plain summaries, the Discover, Price, Permission, Pay track, the yes card in the phone frame with its waiting timer, then the receipt with the explorer link. |
| Yes card (`/approve/`) | clicked "Yes, pay" in headless Chrome, phone size | Approves, then shows the receipt (reference, network, transaction, Arbiscan link). With no order: "Nothing to approve". The yes card inside the board's phone frame is clickable too (laptop fallback, tested). |
| Alternatives | approve with the cheaper alternative | Charged 10.40 USDC, "Approved, with a change". |
| The agent cannot say yes | approve with `X-Lane: 1` | 403 with a plain message; the board shows "tried to say yes for the human: refused". |
| CLI exit codes | `wait --timeout 2`, a "no" from a plain curl, an unknown order | 3, 2, 1 as specified. |
| Lane attribution | curl without headers, CLI headers, lane-1 curl through its `.curlrc` | lane `x`, lane `1`, lane `1`. |
| Website, every step | `/ferry/?lane=3&demo=<step>` at 760x1000 for all 19 steps | All render, no console errors. Validation errors, the decline message and the ticket look right. |
| Website recorder | live `/ferry/?lane=3` driven in headless Chrome, `/events` followed with curl | Batches reach `/rec`; `web.*` events go out on the stream without values; the session file `race/recordings/session-l3-….jsonl` has values and the typing timeline. |
| Website replay | `/ferry/?lane=2&replay=<that session file>&autoplay=1` | Types the recorded email at the recorded pace; tag "Recorded 4 Nov 08:31, real speed". |
| Full race | race start, CLI lane 1, website lane 3 run through the whole booking by its own self-test script | `lane.done` for lanes 1 and 3, race finished by itself (lane 2 has no recording), `race-latest.json` written, result strip shown. |
| Board replay | `/board/?replay=race-1793761152153.jsonl&autoplay=1` | Plays the recorded race, including the yes card and the receipt. |
| Lane-1 runner | `node race/lane1.mjs --dry`, and the flags checked against `claude --help` (2.1.309) | Valid: `-p`, `--output-format stream-json`, `--verbose`, `--tools`, `--allowedTools`, `--permission-mode dontAsk`, `--strict-mcp-config`, `--no-session-persistence`, `--safe-mode`, `--append-system-prompt` all exist. The runner was also run against a stand-in that prints a Claude Code stream-json run (no model call): `agent.say`, `agent.tool`, `agent.usage`, `agent.done` all reach the board, and its curl is counted as lane 1. |
| Deck as served | `cd deck && node check.mjs --base http://127.0.0.1:4900/deck/` | 21 slides, 76 steps, no errors except the missing lane-2 recording (below). |

## What was fixed in this pass

Earlier in the night (listed in `docs/CHANGES-TO-SPEC.md`, "Integration pass"): web events on the
stream without values, `web.done` carries `ref`, `book` is idempotent per quote, a terminal yes is not
counted as an outside agent, lane 2 without a recording no longer blocks the end of a race, board
labels, lane-1 runner finds a newer Claude Code, CLI survives a closed pipe.

This pass, all in `race/board/board.js`, no contract change:

- Lane 2 without its recording no longer says "Recorded last night, real speed": the tag reads "No recording yet". This now also works when the board replays a recorded race (before, lane 2's clock ran for ever in a replay).
- The result strip shows lane 2 as "no recording" with an empty bar, and leaves it out of the time scale (before: "still going" with a full bar).
- A board reloaded after lane 3 finished keeps lane 3's step track at Ticket (before, the fresh page's `web.view` reset it to Cookies).

## What still fails or is not done

1. **No lane-2 recording.** `race/recordings/lane2-ferry.json` does not exist, so lane 2 shows "No recording yet" and the race ends when lanes 1 and 3 are done. To make one: open `http://127.0.0.1:4900/ferry/?lane=2` and let a browser agent book the mission there (for example Claude in Chrome). The page records itself to `race/recordings/session-l2-<time>-<id>.jsonl`. Copy that file to `race/recordings/lane2-ferry.json`. Only use a real agent run: the board labels it "Recorded last night, real speed".
2. **No real Claude run of lane 1 yet.** This pass used the CLI by hand, by design. Do one rehearsal run before the talk (commands below) and check that the agent asks before paying and waits on `ferry wait`.
3. **Result slide shows "Placeholder".** `race/recordings/race-latest.json` holds this pass's test race (lane 3 by script in 4.3 s), which the deck correctly ignores as a test. After the rehearsal race, rebuild the deck (`cd deck && node build.mjs`) so its built-in copy holds the rehearsal numbers too.
4. While lane 2 has no recording, the browser console shows a 404 for `lane2-ferry.json` (board and `deck/check.mjs`). Harmless; it goes away with item 1.
5. Reloading the board in the middle of a race reloads lane 3's page, so what you typed there is lost. Lane 1, the clock and the yes card recover. Do not reload during the race.
6. Cosmetic: the empty yes card ("Nothing to approve") shows the "Test network" badge even when the server runs on the local test ledger.
7. The phone address is the laptop's LAN address (printed at start, today `http://172.16.9.224:4900/approve/`). It changes with the Wi-Fi, and venue Wi-Fi may block phone-to-laptop traffic. Fallback: click "Yes, pay" in the phone frame on the board.

## Commands

Start (from the project root, `/Users/mac45/dev/agent-front-door`):

```sh
LANE1=auto node server/index.mjs                  # test-network payments, lane 1 (Claude Code) starts with the race
PAY_MODE=ledger LANE1=auto node server/index.mjs  # offline fallback: local test ledger, same flow
PAY_FALLBACK=off LANE1=auto node server/index.mjs # test network only, no silent switch to the ledger
```

The server prints the deck, board, website, talk door and phone addresses, and the payment mode.

| Open | Address |
|---|---|
| Deck (slide `fd-race` embeds the board) | `http://127.0.0.1:4900/deck/` |
| Board on its own (keys: S start, R reset, D results, F full screen) | `http://127.0.0.1:4900/board/` |
| Yes card on the phone | `http://<LAN address>:4900/approve/` (latest pending order) |
| Board fallbacks | `/board/?replay=race-<t0>.jsonl&autoplay=1` (a recorded race), `/board/?sim=1` (badged "Simulation") |

Lane 1 by hand (no Claude), in a second terminal:

```sh
./bin/ferry routes
./bin/ferry departures --route gateway-elephanta --date 2026-11-07
./bin/ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 \
  --class upper-deck --board jetty-4 \
  --passenger "Asha Rao,31,passport,P4417702" --passenger "Leo Marin,34,passport,X9024416" \
  --passenger "Mei Tan,27,driving-licence,MH0220190045" --passenger "Sam Okoye,40,passport,A7781230" \
  --assist "Sam uses a cane: help boarding"
./bin/ferry book <quoteId>
./bin/ferry wait <orderId>        # say yes on the phone or on the board; it then pays and prints the receipt
./bin/ferry refund <orderId>      # after each real payment, to get the test USDC back
```

Lane 1 with Claude Code without the race: `node race/lane1.mjs` (`--dry` prints the command;
`LANE1_MODEL`, `LANE1_TIMEOUT` as in `CHANGES-TO-SPEC.md`).

Checks:

```sh
curl -s http://127.0.0.1:4900/ferry/api/status     # payment mode and test-network balances
curl -s -XPOST http://127.0.0.1:4900/race/reset    # clean race state (do this after any test)
cd deck && node check.mjs --base http://127.0.0.1:4900/deck/
```

After any test race, reset (`R` on the board or the curl above): a running or finished race on
`/race/state` is what the result slide reads first.
