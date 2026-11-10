---
name: harbour-line-ferry
description: Book Harbour Line ferry tickets from the Gateway of India (Mumbai) to Elephanta Island or Mandwa with the ferry CLI. Use when a person asks you to find, book or pay for these ferries. Gets a quote, asks the person for a yes on their phone, then pays with x402 (USDC on a test network) and returns the receipt.
---

# Book a Harbour Line ferry

Use the `ferry` CLI (in this project: `./bin/ferry`). Every command takes `--json` for JSON output.
The shop address comes from `--shop <url>` or `FERRY_SHOP` (default `http://127.0.0.1:4900/ferry`).

## 1. Find departures

```
ferry departures --route gateway-elephanta --date 2026-11-07
```

Shows each departure and return time with seats left and the price per class. Classes:
`economy`, `upper-deck`, `upper-deck-guide`. Boarding points: `jetty-1` (stairs), `jetty-4` (step-free).

## 2. Get a quote

```
ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 \
  --class upper-deck --board jetty-4 \
  --passenger "Asha Rao,31,passport,P4417702" --passenger "Leo Marin,34,passport,X9024416" \
  --assist "Sam uses a cane: help boarding"
```

- One `--passenger "Full name,age,idType,idNumber"` per person. ID types: `passport` (a letter and
  7 digits), `aadhaar` (12 digits), `driving-licence` (2 letters and 8 to 13 digits). ID is needed
  from age 18. Under 5 travels free and needs no ID: `"Name,3"`.
- `--assist` is free text for help at boarding.
- The quote shows the total, the lines, two alternatives (one cheaper, one later) and a `quoteId`.
- If a choice is sold out or invalid, the error says what to change.

## 3. Book, then wait for the yes

```
ferry book <quoteId>
ferry wait <orderId> --timeout 100
```

- `book` creates the order and prints the approve link. Your human sees a yes card with the total,
  what it matches and the two alternatives. Nothing is paid yet.
- `wait` returns when the human answers. On a yes it pays with x402 (the shop answers 402 with the
  price, the CLI signs a USDC authorization from the wallet and retries) and prints the receipt
  with the transaction link. The human may choose an alternative; the receipt shows what was paid.
- Exit codes: `0` paid, `2` declined (nothing paid), `3` still waiting (run `wait` again), `1` error.

## 4. Report back

Tell your human the booking reference, the times, the seats, the total and the transaction link.

## Undo

`ferry refund <orderId>` returns the USDC to the same wallet. Free cancellation until 18:00 the day
before the trip. `ferry status <orderId>` shows where an order is.

## Rules

- Never pay without your human's yes. `ferry wait` only pays after it.
- Do not change dates, times or the class without saying so to your human.
- Prices are in USDC on a test network. No real money moves.
