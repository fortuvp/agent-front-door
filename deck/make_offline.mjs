// Builds the offline copy for sharing: deck/offline.html.
//   node build.mjs && node make_offline.mjs
// Starts from index.html and changes three things:
//   1. the deck never treats itself as served, so it never calls the talk's server (even from a web host)
//      and every live slide shows its recorded fallback;
//   2. its saved state uses its own storage prefix, so it never changes the talk copy's state;
//   3. a start card and a small tag on every slide say that the live parts need the local server,
//      with a link to the code on GitHub.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/fortuvp/agent-front-door";
const REPO_SHORT = "github.com/fortuvp/agent-front-door";
// Slides whose live part ran on the laptop; their tag is stronger.
const LIVE = ["title", "fd-twodoors", "fd-race-intro", "fd-race", "fd-race-result", "fd-race-backup", "fd-next"];

let html = await readFile(join(HERE, "index.html"), "utf8");

const replaceOnce = (from, to, what) => {
  const at = html.indexOf(from);
  if (at < 0 || html.indexOf(from, at + from.length) >= 0) throw new Error(`make_offline: expected exactly one ${what}`);
  html = html.slice(0, at) + to + html.slice(at + from.length);
};

replaceOnce(
  'const SERVED = /^https?:$/.test(location.protocol) && !/(^|\\.)claude\\.ai$|(^|\\.)claudeusercontent\\.com$/.test(location.hostname);',
  "const SERVED = false; // offline copy: never call the talk's server",
  "SERVED line",
);
replaceOnce('const PREFIX = "ync:";', 'const PREFIX = "ync-offline:";', "storage prefix");
replaceOnce("<title>Your Next Customer Won't Click</title>", "<title>Your Next Customer Won't Click (offline copy)</title>", "title");

const css = `
<style id="offline-notice-css">
.oc-tag{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:900;display:flex;align-items:center;gap:8px;
  padding:6px 12px;border-radius:999px;background:rgba(6,10,22,.78);border:1px solid rgba(140,160,210,.28);
  font:500 12px/1.2 "Geist Mono","IBM Plex Mono",ui-monospace,monospace;color:#c3cad8;text-decoration:none;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);white-space:nowrap;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis}
.oc-tag::before{content:"";width:7px;height:7px;border-radius:50%;background:#f2b34a;flex:none}
.oc-tag b{font-weight:500;color:#e8ecf8}
.oc-tag:hover,.oc-tag:focus-visible{border-color:#7aa2ff;color:#e8ecf8;outline:none}
.oc-tag.is-live{background:rgba(32,22,4,.86);border-color:rgba(242,179,74,.6);color:#f6deb0}
.oc-tag.is-live b{color:#fff3da}
body.is-presenter .oc-tag{display:none}
.oc-card{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(2,4,11,.84);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.oc-card[hidden]{display:none}
.oc-box{max-width:640px;width:100%;background:#0a0f1d;border:1px solid rgba(140,160,210,.25);border-radius:16px;padding:32px 34px;
  color:#c3cad8;font:16px/1.55 "Geist",ui-sans-serif,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.oc-kicker{font:500 12px/1 "Geist Mono","IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#f2b34a;margin:0 0 14px}
.oc-box h2{font:600 30px/1.15 "Urbanist","Geist",ui-sans-serif,sans-serif;color:#f4f6fb;margin:0 0 12px}
.oc-box p{margin:0 0 12px}
.oc-box ul{margin:0 0 16px;padding-left:20px}
.oc-box li{margin:4px 0}
.oc-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.oc-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:10px;font:600 15px/1 "Geist",sans-serif;
  text-decoration:none;cursor:pointer;border:1px solid transparent}
.oc-btn.primary{background:#7aa2ff;color:#04081a}
.oc-btn.ghost{background:transparent;color:#e8ecf8;border-color:rgba(140,160,210,.35)}
.oc-btn:focus-visible{outline:2px solid #f2b34a;outline-offset:2px}
.oc-url{font:13px "Geist Mono",ui-monospace,monospace;color:#8d97b3;margin-top:14px;overflow-wrap:anywhere}
</style>
`;

const script = `
<div class="oc-card" id="oc-card" role="dialog" aria-modal="true" aria-labelledby="oc-title">
  <div class="oc-box">
    <p class="oc-kicker">Offline copy</p>
    <h2 id="oc-title">The live parts of this talk need the local server</h2>
    <p>This is a recorded copy of <b>Your Next Customer Won't Click</b> (Devcon 8, Agentic Hub, 4 Nov 2026). On stage, some slides ran live on the speaker's laptop:</p>
    <ul>
      <li>the three-lane race to book the ferry (an agent on the command line, an agent on the website, and a person typing),</li>
      <li>the <code>/talk</code> page with two doors, HTML for people and Markdown for agents,</li>
      <li>the payment and the yes card, on a test network.</li>
    </ul>
    <p>Here those slides show the rehearsal recording. To run them yourself, get the code on GitHub.</p>
    <div class="oc-actions">
      <a class="oc-btn primary" href="${REPO}" target="_blank" rel="noopener">Open the code on GitHub</a>
      <button class="oc-btn ghost" id="oc-go" type="button">View the slides</button>
    </div>
    <p class="oc-url">${REPO_SHORT}</p>
  </div>
</div>
<a class="oc-tag" id="oc-tag" href="${REPO}" target="_blank" rel="noopener"><span>Offline copy</span><b>Live demo: ${REPO_SHORT}</b></a>
<script id="offline-notice-js">
(() => {
  const LIVE = new Set(${JSON.stringify(LIVE)});
  const card = document.getElementById("oc-card");
  const tag = document.getElementById("oc-tag");
  const go = document.getElementById("oc-go");
  const presenter = new URLSearchParams(location.search).has("presenter");
  const still = new URLSearchParams(location.search).get("static") === "1";
  if (presenter || still) card.hidden = true; else go.focus();
  const close = () => { card.hidden = true; };
  go.addEventListener("click", close);
  card.addEventListener("click", (e) => { if (e.target === card) close(); });
  // While the card is open, the keys that move the deck close it instead.
  window.addEventListener("keydown", (e) => {
    if (card.hidden) return;
    if (["Enter", " ", "Escape", "ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) {
      if (e.key === "Enter" && document.activeElement && document.activeElement.tagName === "A") return;
      e.preventDefault(); e.stopImmediatePropagation(); close();
    }
  }, true);
  const update = () => {
    const active = document.querySelector(".slide.is-active");
    const live = !!active && LIVE.has(active.dataset.id);
    tag.classList.toggle("is-live", live);
    tag.querySelector("span").textContent = live ? "Ran live on the laptop" : "Offline copy";
    tag.querySelector("b").textContent = live ? "Run it yourself: ${REPO_SHORT}" : "Live demo: ${REPO_SHORT}";
  };
  new MutationObserver(update).observe(document.querySelector(".stage") || document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  update();
})();
</script>
`;

replaceOnce("</head>\n", `${css}</head>\n`, "first </head> followed by a newline");
const end = html.lastIndexOf("</body>");
if (end < 0) throw new Error("make_offline: no </body>");
html = html.slice(0, end) + script + html.slice(end);

await writeFile(join(HERE, "offline.html"), html);
console.log(`offline.html written (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
