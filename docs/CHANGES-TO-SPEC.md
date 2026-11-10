
## Deck engine (deck builder, 4 Nov 02:10) — additions only, nothing in SPEC.md changes

- Narrative files may carry `"backup": ["fd-sources", "fd-race-backup"]`: those slides follow the running order first. `front-door.json` has the 19 ids in `ids` and the two backups in `backup`; `order.txt` lists all 21.
- `deck/src/inline.json`: `{key: "path relative to deck/"}` → `api.inline[key]` (text, `""` when missing) and `api.inlineBytes[key]` (exact byte size, 0 when missing); `{key: {"qr": "text"}}` → a QR SVG string. `api.json(key)` parses an inline file or returns null. Starts with `talkMd`, `talkHtmlSize`, `raceLatest`.
- Hooks run only in the audience window, never in the presenter window (`?presenter=1`), so a hook may POST (for example `/race/start`). iframes in the presenter window are set to about:blank.
- `<iframe data-src="…">` loads when its slide is first shown. `{type:"deck.step", id, step}` is posted to every iframe of the active slide on each step and when the iframe loads.
- PageDown / PageUp (clicker) inside a same-origin iframe (and iframes inside it, e.g. the race board's lane 3) still move the deck. Other keys stay with the page.
- A hook object may add `key(key, slide, event, api)` and return true to take a key first.
- `data-hud="none"` on a section hides the HUD for that slide. `?hud=0` hides it everywhere. `?overview=1` opens the overview.
- `api` also has `probe(url, ms)`, `served`, `localhost`, `static`, `presenter`, `post(slide, msg)`, `next`, `prev`, `goId`, `step`. `window.DECK` exposes `go`, `goId`, `next`, `prev`, `state`, `slides` for checks.
- `deck/check.mjs` walks every slide and step in headless Chrome and exits 1 on console errors. `deck/shot.sh --all` and `--overview` exist; `SHOT_BASE=http://127.0.0.1:4900/deck/` screenshots the served deck.
- A slide file that is missing or has no `data-id` section builds as a visible "Build error" slide with a warning, so one broken file does not stop everyone's build.

## Human website `web/ferry/` (ferry builder, 4 Nov 07:05) — additions only, nothing in SPEC.md changes

- Recorder batches keep the spec shape `{lane, sessionId, events:[{t, type, step, field, label, value, valueLen}]}` and add: `replayOf` (the replayed file, when the page is a replay) and, on each `web.field`, `keys: [[t, valueSoFar], …]` (the typing timeline; keystrokes are not sent as separate events). replay.js uses `keys` to type at the recorded pace. sessionId looks like `l3-20261104-065444-jsvv` (`l2-replay-…` for a replay lane).
- Clicks are `web.click {field: <action>, value?}` (for example `trip.out` / `09:30`, `pax.idtype.pick` / `0:passport`, `review.alt` / `1`); text is `web.field {field, value}` (for example `pax.0.name`). `web.done` carries `value` = booking reference. These are the causes replay.js feeds back through `HL.app.apply(event)`.
- Each recorded event is also posted to the parent frame: `postMessage({type:"ferry.event", lane, sessionId, event})`, so a board can count steps without SSE.
- URL flags: `?lane=2|3`, `?replay=<file>&autoplay=1`, `&src=<lane>` (pick a lane from a whole-race file), `&speed=<n>`, `&from=first`; `?mock=1` (API answered in the page from `mock.js`), `?demo=<stop>` (pre-filled state for screenshots: cookie, home, auth-filled, auth-errors, code, trip-empty, route, calendar, trip, trip-errors, passengers-empty, idtype, passengers, errors, review, pay-empty, pay, declined, ticket), `?rec=0` (no recording). The recorder is off in `?demo=` mode.
- Every lane page (live or replay) reloads itself on `race.reset` (SSE or postMessage), so a reset gives a clean page. A replay page that loads while a race is running catches up from `/race/state`.
- The email code is a hash of the email address, so a replay that types the recorded code gets the same result.
- API calls send `X-Lane` and `X-Client: ferry-web`; `POST /ferry/api/orders` also sends `lane` in the body (the server may ignore it).

## Race board and yes card (board builder, 4 Nov 07:10): additions only, nothing in SPEC.md changes

- Board URL params: `?sim=1` (a made-up race fed through the same event handler, always badged "Simulation, not a real run"), `?simAt=<seconds>` (jump into the simulation or a replay), `?lane2=<file>` (lane-2 recording, default `lane2-ferry.json`), `?replay=<race file>&autoplay=1` (play a recorded race at once instead of waiting for S), `?embed=1`.
- Board postMessage in: `{type:"race.start"}`, `{type:"race.reset"}`, `{type:"results", show?:bool}` (show or hide the result strip, same as key D). Only the parent page can send these.
- Board postMessage out to the parent when every lane is done: `{type:"race.results", mode, t0, lanes:[{lane, ms, steps, tokens, waitMs?, paid?, errors?}]}`.
- Yes card URL params: `?order=<id>` (else the latest pending lane-1 order from `/race/state`), `?sim=1` (sample order, "Simulation" badge, no POST), `?frame=1` (inside the board's phone frame), `?state=pending` (show as waiting even if the stored order moved on; for replays).
- The yes card reads the order as `GET /ferry/api/orders/:id` returns it (`booking`, `lines`, `alternatives` with `kind` and `booking`, `cancellation.short`, `inrApprox`, `expiresAt`). An order may also carry a `quote` object with the same fields. "Choose" posts `{decision:"yes", alternativeId}`.

## Server, shop and CLI (server builder, 4 Nov 07:05) — additions only, every SPEC.md route and field is unchanged

- Orders now carry `quote`: the quote as it stands for that order (`quoteId, booking, lines, total, totalText, currency, inrApprox, alternatives, summary, checks, cancellation, network`). Its `expiresAt` is the **order's** expiry (the 10 minutes the yes is open); the quote's own 15-minute expiry is in `quoteExpiresAt`. The same `quote` is in `order.awaiting_approval` events and in `/race/state` `pending`. New `GET /ferry/api/quotes/:id` returns a stored quote.
- Extra fields, all optional to read: Quote and Order have `totalText` ("12.80"), `summary` (the order in four lines), `checks` (one line per mission point, `ok:false` = a deviation), `cancellation {freeUntil, text, short}`. Alternatives have `kind`, `booking`, `totalText`, `summary`, `checks`. Receipts have `amountText`, `modeLabel`, `confirmed`, `payer`, `payTo`, `amountAtomic`; a web order's receipt has `mode:"test-card"`.
- The agent cannot give the yes: `POST /ferry/api/orders/:id/approve` answers `403` when it carries `X-Lane: 1` or `User-Agent: ferry-cli/…` (lane 1's curl sends `X-Lane: 1` through its own `.curlrc`). The yes card, the board, the deck and a presenter's plain curl are not affected.
- `GET /ferry/api/orders/:id?wait=25` long-polls (up to 60 s) until the order leaves `awaiting_approval`; `ferry wait` uses it. `GET /ferry/api/orders?status=&limit=` lists orders. `GET /ferry/api/status` shows the payment mode and test-network balances. `GET /health`.
- `POST /race/finish` ends a race by hand (writes `race-latest.json`). `GET /race/recordings/` lists the files. `/race/state` also has `finished, replay, done, mission, pay {mode, modeLabel}`. `lane.done` for lane 1 also has `tools, requests`. `RACE_LANES=1,3` (env) makes a race finish when only those lanes are done.
- Env: `PUBLIC_URL` (the base used in `approveUrl`, default `http://<LAN IP>:<PORT>`), `STORE_FILE`. Orders are kept in `server/state/store.json` on port 4900 and `server/state/store-<PORT>.json` on any other port, so test servers never overwrite the stage server's orders. `PAY_FALLBACK=off` stops a test-network payment from falling back to the local ledger when the RPC fails mid-payment.
- A test-network payment is only refunded on the test network: if the server is in ledger mode, `refund` answers `502` and says to restart it in test-network mode.
- `race/lane1.mjs` adds `--append-system-prompt` with one plain line (the agent runs unattended; its human answers on the yes card), `LANE1_HINT=0` leaves it out. It also leaves out the calling Claude Code session's variables (`CLAUDECODE`, `CLAUDE_CODE_*`, `MCP_*`, a session `ANTHROPIC_BASE_URL`) so a server started from inside Claude Code still gives lane 1 a clean agent; `LANE1_KEEP_ENV=1` passes everything through. Other options: `--wait-start`, `--model`/`LANE1_MODEL`, `--timeout`/`LANE1_TIMEOUT` (240 s), `LANE1_SAFE_MODE=0`, `LANE1_EXTRA_ARGS`.

## Closing slides fd-dial, fd-crossings, fd-after, fd-leave, fd-next (slide builder, 4 Nov 07:15): additions only, nothing in SPEC.md changes

- `fd-next` fills the "Send your agent" address at run time: when the deck is served it reads `publicUrl` from `GET /ferry/api/status` and shows `<publicUrl>/talk` (a 127.0.0.1 or localhost address is ignored). Opened as a file or in `?static=1` it shows `http://<laptop>:4900/talk` as text.
- Optional QR, TODO for the deck builder: if `deck/src/inline.json` gets a key `"talkQr": {"qr": "<public base>/talk"}`, `fd-next` shows that QR above the address. Without the key nothing changes. Add it only once the address is fixed (a published door or a fixed `PUBLIC_URL`); a LAN address changes with the Wi-Fi.

## Integration pass (integrator, 4 Nov 08:30): fixes, all backwards compatible

- `POST /rec` re-broadcasts web events without `value` and without `keys` (both stay in the session file). `web.done` now also carries `ref` (the booking reference, from its `value`), which the board shows.
- `POST /ferry/api/orders` with `channel:"agent"` is idempotent per quote: booking a quote whose agent order still waits for a yes returns that same order (202, no new event), so a retried `ferry book` does not put a second yes card in front of the human.
- A yes given from a plain terminal (`POST /ferry/api/orders/:id/approve` without `X-Lane: 1`) is no longer counted as an outside agent's request (lane `x`) on the board.
- Lane 2 without its recording: if `race/recordings/<lane-2 file>` (race.start `replay`, default `lane2-ferry.json`) does not exist, the server finishes the race when lanes 1 and 3 are done (and writes `race-latest.json`), and the live board shows lane 2 as "No recording for this lane yet" with its timer at 0 and leaves it out of "all done".
- Board: the website's `auth` step now maps to "Account" on the seven-step track; "Opened opened the Harbour Line website" fixed.
- `race/lane1.mjs`: when the pinned Claude binary (2.1.309) is not installed any more, it uses the newest version under `~/Library/Application Support/Claude/claude-code/`. `CLAUDE_BIN` still wins.
- `ferry` CLI: a closed output pipe (`ferry wait <id> | head`) no longer crashes it half way through a payment.

## Integration pass, second part (integrator, 4 Nov 08:45): board only, no contract change

- Board: when lane 2's recording is missing (live or while replaying a race recorded without lane 2), the lane-2 tag reads "No recording yet" instead of "Recorded last night, real speed", its clock stays at 0, and the result strip shows "no recording" with an empty bar, left out of the time scale.
- Board: a `web.view` that arrives after a lane finished (the board was reloaded) no longer resets that lane's step track.
- Test results, open items and the commands to run the demo: `docs/INTEGRATION.md`.
