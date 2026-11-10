# Deck: Your Next Customer Won't Click

The Chiang Mai engine, ported. `node build.mjs` writes `index.html` (one offline file, fonts inlined; the server serves it at `/deck/`).
`node make_offline.mjs` then writes `offline.html`, the copy for sharing: it never calls the server, shows the recordings, and points to the code on GitHub.
Check: `node check.mjs` walks every slide and step and reports console errors (`--base http://127.0.0.1:4900/deck/` for live slides).
Look: `./shot.sh <id> [step|last]` → `shots/<id>-<step>.png` at 1920×1080, static. `./shot.sh --all`, `./shot.sh --overview` (contact sheet).
Keys: → / ← (clicker PageDown / PageUp, also from inside same-origin iframes), P presenter window, N notes, F full screen, O overview, B black, A looks and running orders, T reset timer.

## Slide conventions

1. One file per slide, `src/slides/<id>.html`: `<section class="slide" data-id="<id>" data-title="Short name" data-chapter="…">`. The order is `src/slides/order.txt`; the running order is `src/narratives/front-door.json` (`ids`, `backup`, `chapters`).
2. Stage is 1920×1080; lay out in px, absolute where it helps. Use the tokens in `src/tokens.css` (`var(--accent)`, `var(--ink-2)`, `var(--font-display)` …) and shared classes in `src/deck.css` (`label`, `title`, `display`, `hero`, `lead`, `glass`, `chip`, `footnote`). No new palettes.
3. `<em>` is the lit blue accent word. Headlines can rise on entry: `<span class="ln"><span>Text</span></span>`; `.fade-in` (with `style="--d:1"` for delay) fades in after.
4. One optional `<style>` per file, every rule scoped to `.slide[data-id="<id>"]`. One optional plain `<script>` (no attributes); both are lifted out at build time.
5. Build steps: `<i data-step="1" hidden></i>` markers (or `data-step="n"` on a visible element, which then rises in). On step n the slide has `.b1 … .bn` and every `[data-step]` ≤ n has `.is-shown`; `.is-in` while the slide is entering or shown.
6. Style steps with the classes, e.g. `.slide[data-id="x"].b2 .card { opacity: 1 }`. Moves of 1–2 s, on a press; nothing important auto-plays fast.
7. Hooks: `window.DECK_SLIDE_HOOKS["<id>"] = (slide, step, entering, api) => {}` or `{ enter(slide, api), step(slide, step, api), leave(slide, api), key(key, slide, event, api) }` (`key` returns true when it used the key).
8. `api`: `inline`, `inlineBytes`, `json(key)`, `probe(url, ms)` → true when the server answers, `served`, `localhost`, `static`, `post(slide, message)`, `next`, `prev`, `goId(id, step)`, `step`, `countTo`, `sleep`, `esc`, `$`, `$$`.
9. Hooks run only in the audience window (never in the presenter window), so a hook may POST. They must render a correct state for any step when entered directly (deep link, going back).
10. Live pages: `<iframe data-src="/board/?embed=1" title="Race board">` loads when the slide is first shown. On every step the engine posts `{type: "deck.step", id, step}` to each iframe in the active slide (and again when one loads).
11. Fallbacks: if `!api.served` or `await api.probe(url)` fails, show recorded data. `src/inline.json` maps keys to files read at build time (missing → `""`), or `{"qr": "text"}` to a QR SVG.
12. `?static=1` (screenshots) removes transitions and animations and sets `api.static`: show the final state for the step, skip live fetches.
13. Notes: `<aside class="notes"><p><b>[m:ss]</b></p><p>What to say, press by press.</p><p>Careful: …</p></aside>`. The overview adds up the `[m:ss]` timings.
14. `data-hud="none"` on the section hides the chapter label and counter (title, full-bleed live slides). `data-net` shows the drifting network behind the slide.
15. Every number on a slide comes from `docs/CLAIMS.md`, with its source shown small (`<p class="footnote">`). Plain English, no exclamation marks, no emoji.
