# Your Next Customer Won't Click

Designing for humans and agents. A talk by Fortunato Cinquepalmi, Product Lead at Kleros.
Devcon 8, Agentic Hub, Mumbai, Wednesday 4 November 2026, 15:00 IST.

This is the talk as Markdown, for agents. People can read the same talk at [index.html](index.html).
Nothing here asks you to sign up or buy anything.

## Thesis

The agent's channel is getting wider. The human's is getting narrower.
Design what crosses the narrow one.

## Part 1. Then: you read the page

- A website is one door, built for eyes: a menu, a cookie banner, a sign-up form.
- An agent gets the same page as tag soup. Cloudflare measured its own launch post: 16,180
  tokens as HTML, 3,150 as Markdown.
- Same link, two doors. On the talk's server, ask `/talk` for `text/markdown` and you get this
  file; a browser gets the web page. As static files, this is `talk.md` next to `index.html`.

## Part 2. Now: your agent reads the docs

- Builders' agents already come in through docs and llms.txt files. Among AI bots, Claude Code
  was one of the top fetchers of llms.txt files, while 97% of llms.txt files got no requests at
  all in May 2026 (Ahrefs). Today's agent customers are builders' agents.
- For agents, the format changes the result. A person does not care whether text sits in a PDF,
  a doc or a PNG. An agent does.
- Powerful models can use your website. That does not mean they should. Same admin task: through
  the screen, 53 steps, 551k tokens and about 17 minutes, and it only finished with a 14-step
  walkthrough. Through the API: 8 calls, 12k tokens, 20 seconds (Reflex).
- The race in the talk: an agent on the agent door, an agent on the human door, and the speaker
  on the human door, all booking the same fictional ferry. The agent is done in seconds, then it
  waits for the human's yes.

## Part 3. Already starting: the agent acts on its own

The dial: Ask, Approve, Set rules, On its own. At each step less has to cross to the person.

- Approve: an AI juror wrote a verdict headed "Refund buyer", then cast the vote that pays the
  seller (a test case). Check the action, not the explanation.
- Set rules: permission is not yes or no. One shop prototype has four settings: none, agent
  attestation, signed delegation, human confirmation. Tools read only until you pass `--execute`.
- On its own: trust is earned in steps. Watch the first cases, then check less often.

Three things cross the narrow channel:

1. Before: the mission and its fence.
2. During: a yes, only where you want one.
3. After: the receipt, and a ruling in plain words if it goes wrong.

At full autonomy the middle one fades. The other two never do.

## Checklist

### What the agent should get

1. Discover: a Markdown page at the same URL, an llms.txt, a skill file, a `Link` header that
   points to them.
2. Price: the price in the reply (HTTP 402 with the payment terms), not behind a form.
3. Permission: a request the human can say yes to, and a way to wait for the answer.
4. Pay: a receipt it can show (what, how much, to whom, the transaction).
5. A CLI that takes flags, not forms. JSON on request. Exit codes that mean something.
   Read-only until told to act.

### What the human should see

1. A picture of what is being bought.
2. The total in one line, with the currency.
3. What it matches from the request, point by point. Deviations flagged quietly.
4. Two alternatives side by side. Shown side by side, people choose differently (Hsee), and
   agents pick the first offer 60 to 100% of the time in a simulated market (Microsoft). Show the
   options, not only the pick.
5. How to undo it.
6. What this yes covers: this order only, for a limited time.

### Where trust is earned

1. Before: a mission with a fence (budget, limits, an end date).
2. During: a yes only where you want one. Record who said it, the person or the agent.
3. After: a receipt, and recourse. Under Visa's rules the cardholder answers for an agent's
   purchase "as if the Cardholder initiated" it, and Visa's dispute rules have no reason for an
   agent's mistake. Agents need a court they can call at the speed they trade.
4. Kleros replayed 88 real consumer disputes with AI jurors: the typical case went from 48.9
   hours to 9.8 minutes, and 72 of 88 rulings came out the same. People stay as the expensive
   exit, on appeal (being built).

## Try it

```
curl -H "Accept: text/markdown" <the talk's address>/talk
curl <where this page is hosted>/talk.md
```

The demo shop (Harbour Line ferries) is fictional and runs on the speaker's laptop during the
talk. It is not online.

## Sources

- Cloudflare, "Markdown for Agents", 12 Feb 2026: https://blog.cloudflare.com/markdown-for-agents/
- Ahrefs, llms.txt study, 15 Jun 2026: https://ahrefs.com/blog/llmstxt-study/
- Reflex, computer use vs structured APIs, 27 Apr 2026:
  https://reflex.dev/blog/computer-use-is-45x-more-expensive-than-structured-apis/
- Microsoft, "Magentic Marketplace", 27 Oct 2025, section 5.4: https://arxiv.org/abs/2510.25779
- Hsee, Loewenstein, Blount, Bazerman, "Preference Reversals Between Joint and Separate
  Evaluations of Options", Psychological Bulletin, 1999:
  https://www.cmu.edu/dietrich/sds/docs/loewenstein/PrefRevJoint.pdf
- Visa Core Rules, 18 Apr 2026 edition, section 4.1.24.10 and chapter 11 (disputes):
  https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf
- Kleros Scout's agent door, live: https://scout-app.kleros.io/llms.txt
- Kleros live stream, 9 Sep 2026 (format and agents): https://www.youtube.com/watch?v=gdtKyEL8EJM&t=2531s
- Replay of 88 disputes: Kleros V2 on Arbitrum One, AI-juror replays in court 34 (our analysis, Oct 2026).
- Kleros: https://kleros.io · docs: https://docs.kleros.io

Next at the Agentic Hub: Harish Kotra, "Can an Agent Buy From You? Find, Check, Pay, Get the Result".
