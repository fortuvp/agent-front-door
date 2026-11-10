// Builds the single-file deck from src/.
//   node build.mjs   →  index.html     full document, works offline (fonts inlined)
//                       artifact.html  same page as a fragment, for publishing
// Looks and running orders are switched inside the deck (A), so there is no separate gallery.
//
// Inputs
//   src/slides/order.txt      slide ids in DOM order; slides not listed follow, sorted
//   src/slides/<id>.html      one <section class="slide" data-id="<id>"> per file, plus an optional
//                             <style> and <script> (both lifted out and concatenated)
//   src/narratives/*.json     running orders: {id, name, pitch, ids, chapters, backup?}
//   src/inline.json           {key: "path relative to deck/"} read at build time into DATA.inline[key]
//                             (a missing file gives ""), or {key: {qr: "text"}} for a QR code as SVG.
//                             Slide hooks read them as api.inline[key] and api.inlineBytes[key].
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const HERE = dirname(fileURLToPath(import.meta.url));
// DECK_OUT=<dir> writes the build somewhere else (a private copy for checking one slide).
const OUT = process.env.DECK_OUT || HERE;
const SRC = join(HERE, "src");
const FONTS = JSON.parse(await readFile(join(SRC, "fonts.json"), "utf8"));
const TITLE = "Your Next Customer Won't Click";
const DESCRIPTION = "Fortunato Cinquepalmi, Product Lead at Kleros · Devcon 8 · Agentic Hub · 4 November 2026";
const warnings = [];
const warn = (text) => { warnings.push(text); console.warn(`WARNING ${text}`); };

const read = (name) => readFile(join(SRC, name), "utf8");
const exists = async (path) => { try { await readFile(path); return true; } catch { return false; } };
const escHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function fontFaces() {
  const rules = [];
  for (const face of FONTS) {
    const bytes = await readFile(face.path);
    const format = face.path.endsWith(".woff2") ? "woff2" : face.path.endsWith(".woff") ? "woff" : face.path.endsWith(".otf") ? "opentype" : "truetype";
    const mime = { woff2: "font/woff2", woff: "font/woff", opentype: "font/otf", truetype: "font/ttf" }[format];
    rules.push(`@font-face{font-family:"${face.family}";src:url(data:${mime};base64,${bytes.toString("base64")}) format("${format}");font-weight:${face.weight};font-style:${face.style ?? "normal"};font-display:block}`);
  }
  return rules.join("\n");
}

// Files read at build time, so a slide can show a recorded response or the latest race offline.
async function inlineData() {
  const inline = {};
  const inlineBytes = {};
  const missing = [];
  let map = {};
  if (await exists(join(SRC, "inline.json"))) {
    try { map = JSON.parse(await read("inline.json")); } catch (err) { warn(`src/inline.json is not valid JSON (${err.message}); no inline data`); }
  }
  for (const [key, source] of Object.entries(map)) {
    if (source && typeof source === "object" && typeof source.qr === "string") {
      inline[key] = await QRCode.toString(source.qr, { type: "svg", errorCorrectionLevel: source.level ?? "M", margin: 2, color: { dark: source.dark ?? "#02040b", light: source.light ?? "#f4f6fb" } });
      inlineBytes[key] = Buffer.byteLength(source.qr);
      continue;
    }
    if (typeof source !== "string") { warn(`src/inline.json: "${key}" is neither a path nor {qr}`); inline[key] = ""; inlineBytes[key] = 0; continue; }
    try {
      const bytes = await readFile(resolve(HERE, source));
      inline[key] = bytes.toString("utf8");
      inlineBytes[key] = bytes.length;
    } catch {
      inline[key] = "";
      inlineBytes[key] = 0;
      missing.push(key);
    }
  }
  return { inline, inlineBytes, missing };
}

async function narratives() {
  const stories = [];
  const dir = join(SRC, "narratives");
  for (const f of (await readdir(dir)).filter((name) => name.endsWith(".json")).sort()) {
    try {
      const s = JSON.parse(await readFile(join(dir, f), "utf8"));
      if (!s.id || !Array.isArray(s.ids)) { warn(`narratives/${f} needs "id" and "ids"; skipped`); continue; }
      stories.push(s);
    } catch (err) { warn(`narratives/${f} is not valid JSON (${err.message}); skipped`); }
  }
  // The running order this talk opens with comes first.
  stories.sort((a, b) => (a.id === "front-door" ? -1 : b.id === "front-door" ? 1 : 0));
  return stories;
}

// One file per slide (src/slides/<id>.html, DOM order in order.txt). A slide file holds its
// <section>, and may add a <style> (scoped to .slide[data-id="<id>"]) and a <script> that
// registers hooks in window.DECK_SLIDE_HOOKS. A slide that cannot be read or has no section
// with its data-id becomes a visible error slide, so one broken file never stops the build.
async function slideFiles() {
  const listed = (await read("slides/order.txt")).split(/\s+/).filter(Boolean);
  const files = (await readdir(join(SRC, "slides"))).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
  const extra = files.filter((id) => !listed.includes(id)).sort();
  const order = [...new Set([...listed, ...extra])];
  const parts = { html: [], css: [], js: [], ids: [] };
  for (const id of order) {
    let text;
    try { text = await read(`slides/${id}.html`); } catch { warn(`slides/${id}.html is listed in order.txt but missing`); text = null; }
    if (text !== null) {
      text = text.replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => { parts.css.push(`/* slide ${id} */\n${css}`); return ""; });
      text = text.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => { parts.js.push(`<script>\n/* slide ${id} */\ntry {\n${js}\n} catch (err) { console.error("slide ${id}", err); }\n</script>`); return ""; });
      if (!new RegExp(`data-id="${id}"`).test(text)) { warn(`slides/${id}.html has no section with data-id="${id}"`); text = null; }
    }
    if (text === null) text = `<section class="slide build-error" data-id="${escHtml(id)}" data-title="Build error: ${escHtml(id)}" data-chapter="Build error"><div class="label is-fail">Build error</div><h2 class="title">Slide ${escHtml(id)} did not build.</h2><p class="lead">See the warnings printed by node build.mjs.</p></section>`;
    parts.html.push(text.trim());
    parts.ids.push(id);
  }
  return { slides: parts.html.join("\n\n"), slideCss: parts.css.join("\n"), slideJs: parts.js.join("\n"), ids: parts.ids };
}

await mkdir(OUT, { recursive: true });
const [tokens, css, { slides, slideCss, slideJs, ids }, js, faces, stories, { inline, inlineBytes, missing }] = await Promise.all([read("tokens.css"), read("deck.css"), slideFiles(), read("deck.js"), fontFaces(), narratives(), inlineData()]);
for (const s of stories) {
  const absent = [...s.ids, ...(s.backup ?? [])].filter((id) => !ids.includes(id));
  if (absent.length) warn(`narrative "${s.id}" names slides with no file: ${absent.join(", ")}`);
}
// The old engine's demo data is gone; empty lists keep any old code path harmless.
const payload = { scenarios: [], replays: [], court: { id: 0, jurors: 0 }, stories, inline, inlineBytes };
const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// The empty icon stops browsers asking the server for /favicon.ico (a 404 in the console).
const head = `<title>${escHtml(TITLE)}</title>
<link rel="icon" href="data:,">
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="${escHtml(DESCRIPTION)}">
<style>
${faces}
${tokens}
${css}
${slideCss}
</style>`;

const worlds = `<div class="worlds" aria-hidden="true"><div class="world holo"><i></i><i></i><i></i><i></i></div><div class="world paper"><i></i></div><div class="world aurora"><i></i><i></i><i></i><i></i></div><div class="world dots"></div><div class="world grain"></div><div class="world vignette"></div></div>`;

const body = `<div class="stage" role="region" aria-roledescription="slide deck" aria-label="${escHtml(TITLE)}">
${worlds}
<canvas class="netcanvas" aria-hidden="true"></canvas>
${slides}
</div>
<div class="hud" aria-hidden="true">
  <span class="chapter-label"></span>
  <span class="slide-counter"></span>
  <span class="progress"><span class="progress-fill"></span></span>
</div>
<div class="notes-panel" hidden><div class="notes-title"></div><div class="notes-body"></div></div>
<button type="button" class="alt-toggle">Looks · running orders <kbd>A</kbd></button>
<div class="panel-overlay overview" hidden><div class="panel-inner"><div class="panel-top"><div><h2>All slides</h2><p class="sub overview-sub"></p></div><button type="button" class="panel-close">Close · Esc</button></div><div class="overview-grid"></div></div></div>
<div class="panel-overlay alternatives" hidden><div class="panel-inner"></div></div>
<script type="application/json" id="deck-data">${json}</script>
<script>window.DECK_SLIDE_HOOKS = {};</script>
${slideJs}
<script>
${js}
</script>`;

await writeFile(join(OUT, "index.html"), `<!doctype html>\n<html lang="en" data-look="curate">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
await writeFile(join(OUT, "artifact.html"), `${head}\n${body}\n`);
const size = (await readFile(join(OUT, "index.html"))).length;
const keys = Object.keys(inline);
console.log(`index.html ${(size / 1024).toFixed(0)} KB · ${ids.length} slides · running orders ${stories.map((s) => `${s.id} (${s.ids.length})`).join(", ") || "none"} · inline ${keys.length ? keys.map((k) => `${k} ${missing.includes(k) ? "missing" : `${inlineBytes[k]} B`}`).join(", ") : "none"}${warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`);
