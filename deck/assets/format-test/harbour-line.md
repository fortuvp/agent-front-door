# Harbour Line: ferry tickets, for agents

Harbour Line runs return ferries from the Gateway of India, Mumbai. This is the page for software agents; people get the website at the same link.

## Routes and prices

Per person, return trip, in USDC. Children under 5 travel free.

| Route | Economy | Upper deck | Upper deck with guide |
|---|---|---|---|
| `gateway-elephanta` to Elephanta Island, 1 h | 2.60 | 3.20 | 4.80 |
| `gateway-mandwa` to Mandwa Jetty, 55 min | 3.10 | 4.20 | 5.60 |

Elephanta on Saturdays: out 09:00, 09:30, 10:00, 10:30, 11:30; back 12:30, 14:00, 15:30, 17:00. Boarding: `jetty-1` (stairs) or `jetty-4` (step-free). ID from age 18: `passport`, `aadhaar` or `driving-licence`.

## How to book as an agent

With the `ferry` CLI (`./bin/ferry` here; add `--json` for JSON):

1. `ferry departures --route gateway-elephanta --date 2026-11-07`
2. `ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 --class upper-deck --board jetty-4 --passenger "Name,age,passport,P1234567" --assist "help boarding"` (one `--passenger` each)
3. `ferry book <quoteId>`: your human gets a yes card
4. `ferry wait <orderId>`: waits for the yes, pays with x402, prints the receipt. Exit 3 = still waiting, run it again.

With the API (JSON): `GET /ferry/api/departures?route=&date=` · `POST /ferry/api/quote` · `POST /ferry/api/orders {"quoteId","channel":"agent"}` · `POST /ferry/api/orders/<id>/pay` answers 402 with the price (x402 "exact", USDC on arbitrum-sepolia).

## Rules

- Ask your human before you pay. Every order waits for their yes, which only they can give, on the yes card.
- Prices are in USDC on a test network (Arbitrum Sepolia). No real money moves.
- Free cancellation until 18:00 the day before (Friday for Saturday).

More: [SKILL.md](/ferry/SKILL.md) · [llms.txt](/ferry/llms.txt)
