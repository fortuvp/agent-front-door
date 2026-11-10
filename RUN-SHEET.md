# Run sheet: Your Next Customer Won't Click

Devcon 8 · Agentic Hub, Jio World Centre Mumbai · Wed 4 Nov 2026, **15:00 to 15:40 IST** (talk about
19:30, the rest is room for questions). Harish Kotra follows at 15:40 ("Can an agent buy from you?").
Open booth, about 30 seats, one TV, one mic, Ethernet only (20/20 Mbps); no booth Wi-Fi.

Everything runs from this folder: `/Users/mac45/dev/agent-front-door`. The contract is `SPEC.md`;
test results are in `docs/INTEGRATION.md`; every number on a slide is in `docs/CLAIMS.md`.

## Before you leave for the venue

- [x] **Claude Code is signed in on this Mac** (done 4 Nov, 10:04). Check again before you go:
      `"/Users/mac45/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude" auth status`
      must say `"loggedIn": true`.
- [x] Rehearsal race, 4 Nov 10:08 IST: lane 1 paid 12.80 test USDC at 0:54.0 (35 s working, 18 s
      waiting for the yes, 78.4k tokens), lane 2 finished at 4:57.8, lane 3 not typed. Refunded.
      The deck's offline copy and the **L** replay use this race.
- [ ] Optional: rehearse once more and type lane 3 yourself, so the backup numbers include your
      own time. Afterwards: `cd deck && node build.mjs`.
- [ ] Test-network balance: `curl -s http://127.0.0.1:4900/ferry/api/status` shows `payerUsdc` of
      at least 12.80 and some `payerEth`. Today: 19.995 test USDC, 0.041 test ETH.
- [ ] Charge the laptop. Bring the HDMI adapter and an Ethernet adapter.

## At the booth (from 14:30): everything in one place

1. Plug in Ethernet and HDMI. Mirror or extend: the deck goes on the TV, the presenter view on the laptop.
2. Start the one server (one terminal, keep it open):
   ```sh
   cd /Users/mac45/dev/agent-front-door && npm start
   ```
   That is all it needs. It runs the deck, the race board, the website, the agent door and lane 1
   (Claude Code starts by itself when the race starts). The yes comes by itself 7 seconds after the
   agent asks (it prints `Yes card says yes by itself after 7 s`). Test payments are refunded by
   themselves when the race is reset and when the server starts, so the wallet stays topped up.
3. Open `http://127.0.0.1:4900/deck/` in Chrome. **F** full screen on the TV, **P** for the presenter
   window on the laptop. Always the 127.0.0.1 address: the deck and race control answer only on the
   laptop. No phone needed.
4. Go to slide 12 (`fd-race`) once to see the board load ("Ready. One press starts the race."), then
   back to slide 1 with **Home**.
5. Close the Claude app's browser pane and any other `/deck/` or `/board/` tab, so only Chrome's deck
   windows are connected.
6. At 14:58 reload the deck (**Cmd-R**) on slide 1. The race slide clears an old race on entry.

## During the talk

Keys: → / Space / PageDown next · ← previous · **N** notes · **O** overview · **B** black screen ·
**T** reset the timer · **F** full screen · **P** presenter window.

Running order (from the notes, 18:45 in all): title 0:30 · one picture 0:45 · Then 1:00 · two doors 1:15 ·
laptop 1:00 · docs 1:00 · format 1:00 · agent gets 1:00 · human sees 1:15 · race intro 0:45 ·
**race 2:15** · result 0:45 · should 1:00 · dial 1:45 · crossings 1:00 · after 1:15 · leave 0:45 · next 0:30.

**The race (slide 12).** One press starts it. Lane 1 (Claude Code on the agent door) starts by
itself, lane 2 (the recorded agent on the website) plays at real speed, lane 3 is you: type the
mission into the website in lane 3. The sign-in takes any name (or none): press Create account and
you are on the trip page. When lane 1 asks for a yes, the yes card shows in the phone frame for 7
seconds and then says yes by itself; read it out loud meanwhile. Lane 1 then pays 12.80 test USDC on
Arbitrum Sepolia and shows the receipt. If asked: in this demo the yes is simulated; in a real shop
it is your phone.
Time box: once lane 1 has its receipt, give your own lane about 20 seconds more, then move on even if
it is not done. Lane 2's recording takes 4 min 58 s, so it will still be going: that is the point.
The result slide (13) reads the live race and says so for any lane that did not finish (lane 2 also
shows how long its whole recorded run took).

**Restart the race** (no terminal needed):
- Race still running: click once on the board's top bar (the words "The race", not inside a lane's website), press **R** (everything back to Ready, lane 1 stops, the last test payment is refunded), then press **S** to start again.
- Race finished: press **←** then **→** on the race slide. A finished race is replaced by a new one.
- From the terminal, if you prefer: `curl -s -XPOST http://127.0.0.1:4900/race/reset`, then **Cmd-R** in Chrome and press **→**.

Do not reload the board during the race: lane 3's typing would be lost (lane 1 and the clock recover).

**The last slide (`fd-next`).** The talk's door box now says "Runs on this laptop during the talk.
Find me after to try it." There is no booth Wi-Fi, so do not invite people to send their agent to it
during the talk.

## When something breaks

| Problem | Do this |
|---|---|
| Lane 1 does not start or stops (sign-in, network) | Press **L** on the race slide: it replays the 10:08 rehearsal race with a "Recorded …, real speed" tag. Say it was recorded this morning. |
| Lane 1 says a command was refused | It runs Claude Code in "don't ask" mode with curl, `./bin/ferry` and a few harmless helpers allowed (`race/lane1.mjs`). The first rehearsal failed this way (`echo` was not allowed); fixed. If it happens again, press **L**. |
| No test network (RPC down) | The server switches to the local test ledger by itself and says so on the board. Same flow, no transaction link. To force it: `PAY_MODE=ledger npm start` |
| The yes does not come by itself | Click "Yes, pay" in the phone frame on the board. |
| Server will not start, or the deck runs from a file | `fd-race` shows "Not live here"; skip to the result slide, which shows the rehearsal numbers, or to `fd-race-backup` (backup 2, after the end). |
| Lost on the slides | **O** for the overview, click the slide. |

## After the talk

- Nothing to do for the wallet: the next race reset or server start refunds the test payment by itself.
  To check: `curl -s http://127.0.0.1:4900/ferry/api/status` (`payerUsdc` back to 19.995).
- Stop the server with Ctrl-C.

## Things to confirm before you say them

- The "Refund buyer" juror story on the dial slide (Kleros V2 testnet, court 8, dispute 76, Aug 2026):
  check it is told the way it happened. The notes say "a test case of mine".
- `fd-after`: the four dispute reasons (Fraud, Not received, Not as described, Charged twice) are
  everyday examples, not Visa's official list. Fine to keep if you are happy with that.
- `fd-laptop`: 34 / 32 / 21 / 13 leaves out this talk's own folder; counting it gives 35 / 33 / 22 / 13.
- `fd-then`: 28,237 bytes of HTML, 1,004 bytes of words, measured on the Harbour Line home page at
  06:55 IST today. If the website changes, measure again.

## Demo data (all made up, test only)

- Harbour Line is a fictional ferry company. Passengers, ID numbers and the sign-in code are made up.
- Lane 2's demo account on the website: `lane2.agent@harbour-line.test`, password `Ferry2026demo`
  (local demo server only). Test card: 4242 4242 4242 4242.
- Lane 3's demo account (you, on stage): `lane3.me@harbour-line.test`, same password as lane 2
  (`Ferry2026demo`). Type only this on stage: the recorder stores what is typed, and the TV shows it.
- Lane 2 recording: `race/recordings/lane2-ferry.json` (copy of `session-l2-20261104-094307-oj7z.jsonl`),
  Claude driving the website in the Claude desktop app's browser, 4 Nov 2026 09:43 IST, 4 min 58 s.
- Test-network wallets: shop `0x95013d8718d8814339a6c809E8FA69FB58E76634`, payer
  `0xE66F7F8aBEF94c22E02fDc075Fd5DA5a0c5bA225` (Agent_005 test wallet; key in `.secrets/`, not in git).
