# Speaker guide: Your Next Customer Won't Click

Devcon 8 · Agentic Hub · Wed 4 Nov 2026, 15:00 IST. 20 slides, about 20:30 by the timings below. Made from the speaker notes in `deck/src/slides/` (the same text as the presenter window, key **P**; rebuild this file with `python3 deck/make_guide.py`). "Press" means one click forward. Quoted lines are what to say; the rest is what happens on screen. "Careful" lines are things not to say.

Thesis to land twice (slide 2 and the last slide): *The agent's channel is getting wider. The human's is getting narrower. Design what crosses the narrow one.*

## At a glance

| # | Slide | Chapter | Time | Presses |
|---|---|---|---|---|
| 1 | Your next customer won't click | Opening | 0:30 (at 0:30) | 1 |
| 2 | The whole talk in one picture | Opening | 0:45 (at 1:15) | 1 |
| 3 | Then: one door, built for eyes | Then | 1:00 (at 2:15) | 3 |
| 4 | Same link, two doors (live) | Then | 1:15 (at 3:30) | 3 |
| 5 | My laptop | Now | 1:00 (at 4:30) | 4 |
| 6 | Agents come in through the docs | Now | 1:00 (at 5:30) | 4 |
| 7 | The format changes the result | Now | 1:00 (at 6:30) | 3 |
| 8 | What the agent should get | Now | 1:00 (at 7:30) | 5 |
| 9 | What the human should see | Now | 1:15 (at 8:45) | 5 |
| 10 | The card is made for the decision | Now | 1:00 (at 9:45) | 4 |
| 11 | Already here, on the side | Now | 0:45 (at 10:30) | 3 |
| 12 | A race | Now | 0:45 (at 11:15) | 2 |
| 13 | The race (live) | Now | 2:15 (at 13:30) | 1 |
| 14 | The race: result | Now | 0:45 (at 14:15) | 2 |
| 15 | Can use it, should not | Now | 1:00 (at 15:15) | 2 |
| 16 | The dial | Already starting | 1:45 (at 17:00) | 3 |
| 17 | Three things cross | Already starting | 1:00 (at 18:00) | 4 |
| 18 | When the agent gets it wrong | Already starting | 1:15 (at 19:15) | 4 |
| 19 | Leave knowing | Already starting | 0:45 (at 20:00) | 3 |
| 20 | Next: Harish Kotra | Already starting | 0:30 (at 20:30) | 1 |


---

## Opening

### 1. Your next customer won't click  ·  0:30  ·  1 press

- On screen: the title. A cursor drifts toward "click." and slows down. Let it drift while you start. "Hi, I'm Fortunato. I lead product at Kleros. This talk is about a customer that doesn't use your buttons."

- Press: a quiet request goes out at the bottom right, and the answer comes back: 200, Markdown, a few kilobytes. The cursor is still not there. "While the cursor is still on its way, that request already went out and came back. No click. That is a customer too. So today: how do you design for people and for agents at the same time?"

> Careful: don't say people stop clicking, or that the website is dead. The claim is smaller: some of your next customers arrive as agents, by text. The bytes on the line are the real size of this talk's Markdown door (measured live on the laptop, or at build time).

### 2. The whole talk in one picture  ·  0:45  ·  1 press

- On entry: the two lines, then the left side fills with what the agent takes in, and one card appears on the right. "Here is the whole talk in one picture. When an agent buys something for you, it takes in everything: every departure, every price rule, the docs, the terms, the refund rules. That side keeps getting wider. And what reaches you, the person? One card. Four ferry tickets, 12.80, yes or not now. That side keeps getting narrower, because the agent does more of the work."

- Press: the left side steps back, the card lights up, and the last line rises. "So the design job changes. Design what crosses the narrow one: what you asked for, the one yes, and the receipt after. Get those few things right, and give the agent its own door for everything else. That is this talk."

> Careful: this is my model, not a measurement. The only number is the demo's own price. Don't say people are leaving the loop: the narrow channel never closes.


---

## Then · You read the page

### 3. Then: one door, built for eyes  ·  1:00  ·  3 presses

- On screen: a ferry company's home page. It's Harbour Line, the made-up ferry company you'll see again in the race. "This is the web we built for the last twenty years. You read the page."

- Press: small tags point at the parts. "A menu. Sign in. A big picture. A button. And before anything else, a cookie banner. Every piece is made for eyes and a hand on a mouse."

- Press: the right side fills with code. "Now the same page, the way an agent gets it. This is the HTML of that home page: about 28 thousand bytes of tags, classes and drawing instructions."

- Press: the words light up, and the bar at the bottom shows how much of it they are. "The words a person actually reads are about a thousand bytes of it. The rest is there to draw the picture. One door, built for eyes."

> Careful: this is our own demo page, measured on this laptop this morning. It is not a study of the web, so don't generalise the ratio. Don't call it a real company.

### 4. Same link, two doors (live)  ·  1:15  ·  3 presses

- On screen: one link, /talk, served by this laptop. The tag at the top right says if it is live or recorded. "So what if the same link had two doors? This is the page for this talk, on the laptop in front of me."

- Press: the left door opens. The slide asks for /talk the way a browser does, Accept text/html, and shows the answer: status, type, size, and the page itself. "Ask it like a browser and you get the web page."

- Press: the right door. Same link, but the request says Accept text/markdown. The terminal prints the real reply: 200, text/markdown, the size, and a Link header pointing to llms.txt. Then the Markdown itself. "Ask it like an agent and you get the talk as text. Same address, no scraping, nothing to guess. And the Link header tells it where the instructions are."

- Press: the two sizes as bars, and Cloudflare's number underneath. "Here, the Markdown is a small fraction of the page. Cloudflare measured the same thing on its own launch post: 16,180 tokens as a web page, 3,150 as Markdown. About 80% less to read, for the same words."

> Careful: the bars are bytes, measured live on this laptop; Cloudflare's numbers are tokens, from their post. Don't put them on one scale or say "80%" about our page. If the tag says "Recorded", say "this is the reply I recorded when I built the deck", not "live".


---

## Now · Your agent reads the docs

### 5. My laptop  ·  1:00  ·  4 presses

- On entry: "That was then. Now: your agent reads the docs. Let me show you my own laptop. I counted it last night. Of the 34 projects on my laptop..."

- Press. "...32 started this year." The two grey dashed tiles are from 2025, one of them is Scout.

- Press. "21 have a way in for agents: a skill file, an llms.txt, a CLI, an MCP server or a paid API." The blue tiles have a screen too; the cyan ones are only for agents.

- Press. "13 have no screen at all." The lit tiles: twelve made only for agents, plus one code library.

- Press. "And 134 of my 142 commits from 17 October to yesterday were co-written with an agent. The other 8 are automatic syncs and merges. So I am not guessing about agent customers. I send them out every day."

- If there is time: "Since July, every project of mine that is only a screen is for people in a room: a booth game, a check-in, a screen loop, talk decks."

> Careful: say "34 projects", not 35. Tonight’s demo folder is not in the count; if you count it, the line becomes 35, 33, 22, 13, and you must not mix the two. "Which bucket a project falls in is my judgment call." "Co-written" is a floor: older commits made with an agent often have no trailer. Do not read out private repo names; only public ones carry a name on the tiles.

### 6. Agents come in through the docs  ·  1:00  ·  4 presses

- On entry: "So where do agents come in? Not where we expected."

- Press. "What I see at Kleros: most integrations come in through our docs, not our homepage. Builders point their coding agent at the docs and let it work it out."

- Press. "The public data points the same way, with a twist. Ahrefs looked at about 38,000 sites with an llms.txt file, the file that tells an AI what a site is. In May, 97% of those files got no requests at all."

- Press. "The ones that did get read: Claude Code was one of the top readers, ahead of every AI search and assistant bot."

- Press. "So today’s agent customers are builders’ agents. A coding agent reading docs, on behalf of a person who is building something. Design for that one first."

> Careful: no percentage for Kleros integrations (say no number), no company names. Say Claude Code was "one of the top" readers, not "number two" (Ahrefs’ own page is not consistent on its rank). The 97% is May 2026, about 38,000 sites.

### 7. The format changes the result  ·  1:00  ·  3 presses

- On entry: the quote. "Another thing I learned: for agents, the format changes the result. I said it on our live stream in September: if we are humans, we do not care if the text is in a PDF, a doc or a PNG. For agents the difference is huge."

- Press: the three files. "Same words, three files. Our shop's agent door as Markdown, a screenshot of exactly that text, and that screenshot saved as a PDF, like a scan. To you and me, they look the same."

- Press: what each one gives the agent. "Markdown gives the agent the text itself: the prices, the times, the commands it can run. The screenshot gives it pixels: it has to look and read, and the commands are only a picture. The PDF is the same picture in a wrapper."

- Press: the size bar. "I tested it this morning: same question, same words, three files. A strong model got all three right on one short page. But the picture is 74 times the size, the commands in it can't be copied, and the longer and messier the document, the more that costs."

> Careful: our test was one short page, three runs each; all three answered correctly (the Saturday return times and the upper-deck price), and times were noisy (Markdown 4 to 19 s, screenshot 5 to 80 s, scanned PDF 5 to 17 s). Do not claim a speed multiple like 5x. The 74x is file size, not tokens or time: the model's input was about the same, about 9,000 tokens, for all three. The PDF is 106,664 bytes, 58 times the Markdown. The quote is from a machine transcript of my own words, lightly edited.

### 8. What the agent should get  ·  1:00  ·  5 presses

- On entry: "So what should the agent get from your door? Four pieces, in the order it needs them."

- Press. "Discover. Ask for Markdown and you get Markdown: a short page and a skill file that teaches the steps. No cookie banner."

- Press. "Price. The price comes back in the reply, before anything is booked: 12.80 USDC, on a test network. No form."

- Press. "Permission. The agent does not pay yet. It gets a request its human can say yes to. We will see that card in a moment."

- Press. "Pay. Once the yes comes, the agent asks to pay and gets HTTP 402, Payment Required. x402 finally uses it. It signs the payment and gets a receipt it can show: a reference, the transaction, a link to check it."

- Press. "And one more: a CLI takes flags, not forms. Every field the website asks me to type is one flag here. Words are for the person. Flags are for the agent."

> Careful: no numbers on this slide except the demo’s own price. 402 is a status code, not a statistic. The receipt is real only on the test network; never say "paid" before settlement.

### 9. What the human should see  ·  1:15  ·  5 presses

- On entry: "Now the other side. The agent gets a whole door. The human gets one card, on the phone. What should be on it?"

- Press. "A picture, so you know what this is before you read a word. Then the total and who gets it: pay 12.80 USDC to Harbour Line. Then the order in four lines."

- Press. "What it matches: one line for every point of my request. A difference gets a quiet dot, not a red alarm."

- Press. "Two alternatives, side by side: cheaper, and later. Not only the agent’s pick."

- Press. "How to undo it, and what this yes covers: this order only, for ten minutes. A yes should never be a blank cheque."

- Press. "Why side by side? An old finding: shown side by side, people paid more for a bigger dictionary with a torn cover; one at a time, they paid more for a smaller one in new condition. Side by side changes the winner. And in Microsoft’s simulated market, agents took the first offer they got 60 to 100% of the time. So show the options, not only the pick."

> Careful: no dollar amounts for the dictionaries. Say "simulated market" for Microsoft, and 60 to 100% is from section 5.4 of the paper. The card on the slide is the demo’s; you will see the real one in the race.

### 10. The card is made for the decision  ·  1:00  ·  4 presses

- On entry: the title. "That card can't be a fixed form. The agent knows what this decision needs, so it should make the card for it. Three examples."

- Press: the ferry tickets. "Four ferry tickets. A trip, so the card shows the route and the times, the total, and two options side by side: cheaper, or later."

- Press: the T-shirts. "Forty team T-shirts. Here the card shows the sizes, and the one question that needs you: XL is out of stock in navy. Grey, or wait five days?"

- Press: the software plan. "Renewing a design tool. This card shows a chart, because the decision is about use: you pay for 20 seats and you use 6."

- Press: the closing line and the study. "Same agent. Same yes. A different card each time. In Google Research's test, people preferred a generated interface over a Markdown answer 82.8% of the time. Sites made by human experts still won."

> Careful: the three cases are made-up examples, with made-up prices and sizes. The 82.8% is Google Research's own test, not ours. Sites made by human experts still won, so do not say generated beats designed.

### 11. Already here, on the side  ·  0:45  ·  3 presses

- On entry: the title rises. "This is already starting."

- Press: the chat and the page appear, joined by a thin line. "When I work with Claude Code, it often answers with a page, not a paragraph: a set of options I can click, a chart, a questionnaire."

- Press: the page steps back and an outline appears inside the chat. "But look where it lives: a file next to the chat. You open it, you come back. The next step is that the page is the answer, right in the conversation."

- Press: the disclaimer, bottom right. "And yes, I know the cyberpunk version: a chip in the brain, and none of this matters. Until then, someone has to design the card."

> Careful: this is my own experience as a user, not a product announcement; do not say Anthropic plans to build it. Do not name any company’s brain chip. Keep the chip line a joke, one sentence. The chat and the page on the slide are a mock-up.

### 12. A race  ·  0:45  ·  2 presses

- On entry: "A race." and the mission. "Let's test this. One mission: four ferry tickets to Elephanta this Saturday, with a few rules. Upper deck only if it is under 4 USDC each, the step-free jetty, help for Sam, who uses a cane. And: ask me before you pay."

- Press: the three lanes. "Three ways in. Lane one: an agent, Claude Code, on the agent door: a Markdown page and a command line. Four steps. Lane two: an agent on the website, the door made for people. Recorded before the talk, real speed. Lane three: me, on the same website, typing live."

- Press: the hard parts of the website light up. "And the website works the way most real ones do: a cookie banner, a sign-up code by email, a hand-made calendar, every passenger by hand. A form nothing can autofill. Let's go."

> Careful: say once that Harbour Line and every name and ID in the race are made up. Lane 2 is a recording: do not call it live. The website is our own build, made slow on purpose to look like a real booking site; do not say it is a real operator's site.

### 13. The race (live)  ·  2:15  ·  1 press

- Time box: 2:15 from entry. In the rehearsal the yes card came up about 30 seconds after the start, and the receipt about 5 seconds after the yes (longer if the test network is slow). Once lane 1 has its receipt, give your own lane about 20 more seconds, then stop typing and press on, even if lane 3 is not done: the next slide shows it as "Still going", and that is the point.

- Before the talk: start the server, check the board shows three lanes saying "Ready" and lane 3 is on the cookie banner. Everything runs on this laptop: no phone, no terminal. On entry the slide clears a race left over from the rehearsal (finished more than six minutes ago, or started more than 20 minutes ago), so the board starts clean. A race you started in this talk is never cleared by going back and forth.

- On entry: the board fills the screen, three lanes, all at zero. "Three lanes, same mission. Watch the clocks."

- Press: the race starts. The deck tells the board, and the board tells the server. If the board does not start it within five seconds, the slide starts it on the server itself. Then click into lane 3 and fill in the website yourself. PageDown on the clicker still moves the deck while you type.

- While you type, narrate lane 1 in short lines: "It read the Markdown door. It got a price. Now it is asking me." When the yes card appears in the phone frame on lane 1: "There it is: it stopped and asked me before paying." Read it out loud, the total and the two alternatives. In this demo the yes comes by itself after 7 seconds, the time it takes me to read the card. "Yes. Paid. With a receipt it can show."

- Lane 2: "And this is an agent doing what I am doing, on the website made for me. Recorded before the talk, real speed." Keep typing; do not rush the form. The form being slow is the point.

- If lane 1 fails or the model call hangs: press L. The board replays the last recorded race at real speed and the corner says "Recorded". Say "This is the rehearsal, recorded at" and the time. If the board itself is blank, go to the backup slide fd-race-backup.

> Careful: the yes is simulated: the server says yes by itself 7 seconds after the agent asks. Say so if asked ("in a real shop that is my phone"). The website sign-in on my lane takes any name.

> Careful: lane 2 is a recording, say so. Lane 1 pays on a test network (or the local test ledger, if that is what the receipt says), never real money. Do not claim speed numbers here; the next slide shows them. Everything named in the race is made up.

### 14. The race: result  ·  0:45  ·  2 presses

- On entry: the headline and the three lanes, empty. The label top right says where the numbers come from: "Today's race" (live, from the laptop), "Recorded" with the date and time, or "Placeholder".

- Press: the bars grow on one time scale and the numbers come in. "Here is the race we just ran. Lane one, the agent on the agent door. Lane two, an agent on the website. Lane three, me." Read lane one's time from the screen. Lanes 2 and 3 will usually say "Still going": say so, that is the point. Lane 2's line also says how long its whole recorded run took.

- Press: lane one splits in two. "And look at lane one. This part is the agent working. This striped part is it waiting for my yes. It did not move until I said yes. That yes is the one thing I want to cross the narrow channel."

- If the slide says Placeholder: "We will fill this in with the rehearsal numbers. You just saw the race live." Do not quote numbers from memory.

> Careful: these are our own numbers from one race on one laptop, not a benchmark. Say "in our race" or "in our rehearsal, at" and the time on the label. Steps are counted differently per lane (commands and requests for the agent, clicks and fields for the website). If the agent's own work took more than a minute, the headline switches by itself to "The agent was done first"; say that instead of "in seconds".

### 15. Can use it, should not  ·  1:00  ·  2 presses

- On entry: the first line, and a robot draws itself into the driver's seat of a car made for people. "Here is what we just saw. Powerful models can use your website. They can click, scroll, type. Like a robot in the driver's seat: it works, the car was built for someone else."

- Press: the second line, and a car with no driver's seat draws in on the right. "That doesn't mean they should. The other way is a car built to drive itself: a door made for the agent, with a price, a permission and a receipt."

- Press: the numbers come in. "Reflex measured the same admin task both ways. Through the screen: 53 steps, 551 thousand tokens, about 17 minutes, and it only finished once someone wrote it a 14-step walkthrough. Through the API: 8 calls, 12 thousand tokens, 20 seconds." Pause. "If you are a builder, instead of a perfect UI you may want a CLI and an API."

> Careful: do not say the screen agent "failed" next to the 53 steps: in the runs with those numbers it finished, with a walkthrough. With the plain request it did not finish, and Reflex gives no numbers for that run. 551k and 12k are input tokens, means of 3 and 5 runs, one model, one task, from Reflex's own blog. Do not turn it into a cost or a "times cheaper" number. Our race is not a benchmark either.


---

## Already starting · The agent acts on its own

### 16. The dial  ·  1:45  ·  3 presses

- On entry, the dial sits on notch one, Ask. "And this is already starting: the agent acts on its own. Think of it as a dial with four notches. Notch one: Ask. The agent answers, and I still do every step myself. That whole column on the right is what reaches me."

- Press: the dial turns to Approve, and the pane shrinks to one card. "Notch two: Approve. The agent does the work, and only one thing reaches me: a yes before it pays. That one card has to be right. A story from my own testing: an AI juror wrote a full verdict headed 'Refund buyer'. Then it cast the vote that pays the seller. So the yes card shows the action, not the explanation."

- Press: Set rules, and the pane shrinks again to two lines. "Notch three: Set rules. I say once, up front, what it may do: upper deck if it's under four USDC a person, ask me before paying more. In my shop prototype, permission isn't yes or no, it has four settings: none, agent attestation, signed delegation, human confirmation. And my newest tool reads only, until you add --execute. Reading is free; acting is a choice."

- Press: On its own, the pane is down to one line, the receipt. "Notch four: on its own. Trust comes in steps: watch closely, check less, then let it act. A colleague runs an AI juror. About 30 cases in, they said on our public stream that they don't even check its votes anymore. Their advice: watch the first five or ten cases closely, then check less often. That's where this goes. Then the only thing that still reaches me is what happened: the receipt."

> Careful: the juror story is a test case on the test network, not a customer and not a real dispute; say "a test case of mine". Don't name the shop prototype's repo; it is a prototype, not a product. The trust steps are the public wording of the colleague's advice (watch the first five or ten cases closely). Their pronouns are not stated: say "they". Don't say the jurors are "Kleros's AI jurors": their owners run them.

### 17. Three things cross  ·  1:00  ·  4 presses

- On entry: the picture from the start again. Left, dimmed, everything my agent takes in. Then the funnel, and on the right, my side, with three empty places. "So if less and less reaches me, what still has to cross that narrow channel? Three things."

- Press: Before. The mission card goes from me into the funnel, and "Your mission" lights up on the agent's side. "Before: the mission and its fence. What to do, and how far it may go. Four ferry tickets for Saturday, under four USDC each, ask me before you pay. That one goes from me to the agent."

- Press: During. The yes card comes back out of the funnel to me. "During: a yes, but only where I want one. One card, one decision, for this order only. That's the yes card you saw in the race."

- Press: After. The receipt comes back the same way. "After: the receipt, and if something goes wrong, a ruling in plain words. A person reads it, not a log file. As a colleague put it on our stream, appeals go to people, and people don't read code."

- Press: the yes card fades to an empty outline, and the last line appears. "Turn the dial to 'on its own' and the yes goes away. The other two never do. You always say what you want first, and you always get to see what happened after."

> Careful: this is my model, not a standard; say "I think" if asked. Don't promise that the ruling exists for every purchase today: Kleros rules on disputes that are filed with it. The cards are from a recorded demo run on a test network, not a real purchase.

### 18. When the agent gets it wrong  ·  1:15  ·  4 presses

- On entry, only the headline. "The receipt always reaches me. So what happens when the receipt is wrong? My agent bought the wrong thing. Who decides what happens next?"

- Press: the card list. "With a Visa card today, you dispute a payment for a reason: fraud, not received, not as described, charged twice. Visa's dispute rules have no reason for 'my agent got it wrong'."

- Press: the Visa line. "And Visa's own rules say the cardholder answers for the agent's purchase 'as if the Cardholder initiated' it. So today, if your agent buys the wrong thing, you bought it."

- Press: the Kleros beat. "This is the part I work on. We took 88 real disputes and replayed them with AI jurors. The typical case went from 48.9 hours to 9.8 minutes. And 72 of the 88 rulings came out the same as the people's."

- Press: the last line. "That doesn't take people out. People stay as the expensive exit: an appeal will go to them. We're building that part now."

> Careful: the four reasons are examples of everyday dispute reasons, not Visa's official list. If someone mentions American Express: Forkast reports Amex announced an Agent Purchase Protection; I am talking about Visa's dispute rules. The Visa quote was read in Visa's rulebook on 22 Oct (the PDF was blocked to scripts today). "Typical" means the median, over 83 paired cases; say "replayed", these were not live rulings. Don't say "customer". The human appeal path is being built, not live: never say "humans have overturned AI jurors", and never "a final ruling in minutes" (it's a first-round ruling, then an appeal window). Don't say "Kleros's AI jurors": their owners run them.

### 19. Leave knowing  ·  0:45  ·  3 presses

- On entry, only the headline. "If you take three things home, take these."

- Press: one. "What the agent should get: a Markdown page and a skill file to find you, the price in the reply, a request its human can say yes to, and a receipt it can show. Flags, not forms."

- Press: two. "What the human should see: one card. A picture and the total, what it matches in the request, two options side by side, how to undo it and what the yes covers."

- Press: three. "And where trust is earned: after. The receipt every time, check what the agent did, not what it says, a ruling in plain words, and people as the exit on appeal."

> Careful: "people on appeal" is being built at Kleros, not live; say so if asked. HTTP 402 is the status code, not a number to explain.

### 20. Next: Harish Kotra  ·  0:30  ·  1 press

- On entry: the hand-off. "Next, right here at 15:40: Harish Kotra, 'Can an agent buy from you?' That talk: find, check, pay, get the result. And if you want to try what I showed: after the talk, find me and point your agent at this address. Your agent gets Markdown, you get a page."

- Press: the thesis, once more. "One line to take with you. The agent's channel is getting wider. The human's is getting narrower. Design what crosses the narrow one. Thank you."

> Careful: check the room schedule for Harish's slot before the talk (the public listing has it at 15:40). The booth is Ethernet only, so the address works on this laptop's network only, while my laptop runs the server; if the address on screen still reads "<laptop>", read the LAN address the server printed at start, or skip this line.


---

## Backup slides (after the last slide, or **O** for the overview)

### Sources

- Backup. Only show this if someone asks where a number comes from. "Every number in the talk is on this slide. The links are in the talk's Markdown, at /talk.md, under Sources. Point your agent at it."

> Careful: the laptop counts, the commit count, the page sizes and the race numbers are my own measurements, not studies. The Microsoft figure is from a simulated market. The Visa quote was read in the rulebook on 22 Oct (the PDF blocks downloads today). The human appeal path is being built, not live.

### The race, recorded (backup)

- Use this slide only if the live board fails (blank, frozen, or the model call never comes back). Everything is shown at once, no presses.

- "The live board is not playing along, so here is the race from our rehearsal." Read the label top right: it says when it was recorded. "Lane one, the agent on the agent door: done in this time, and most of it was waiting for my yes. Lane two, an agent on the website. Lane three, me." Then the line at the bottom: "It found the door, got the price, asked me, and paid within seconds of my yes."

- If it says Placeholder, there is no rehearsal recording on this laptop. Skip the numbers: "The point is the shape: the agent asks, then waits for a person." Go on to fd-race-result only if it shows numbers.

> Careful: say "in our rehearsal" and give the time on the label; these are not today's live numbers. One race, one laptop, not a benchmark. If the payment line says local test ledger, say that, not "on chain".


---

## If something breaks during the race

- Lane 1 does not start or stops: press **L** on the race slide (click the slide background first if you typed in lane 3). It replays the 10:08 rehearsal with a "Recorded …, real speed" tag. Say it was recorded this morning.
- The yes does not come by itself after 7 seconds: click "Yes, pay" in the phone frame on lane 1.
- No test network: the server falls back to the local test ledger by itself and says so. Same flow, no transaction link.
- Lost: **O** for the overview, click the slide. **B** blacks the screen.
