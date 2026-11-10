// Your Next Customer Won't Click — deck engine (ported from the Chiang Mai deck, How AI Agents Act).
// Slides are <section class="slide" data-id>. Elements with data-step="n" appear on the n-th press
// (.is-shown), and the slide carries .b1 … .bN for the steps reached so far. Slides register hooks in
// window.DECK_SLIDE_HOOKS[<id>]; hooks run on enter and on every step. A running order (narrative)
// picks which slides play and in which order; the rest follow as backup. A look swaps the visual world.
//
// URL parameters
//   ?slide=<id>&step=<n|last>   open that slide at that build step
//   ?static=1                   no transitions or animations (for screenshots); hooks see api.static
//   ?hud=0                      hide the chapter label, counter and progress bar
//   ?look=<id>  ?story=<id>     pick a look or running order
//   ?presenter=1                the presenter window (P opens it): notes, timer, next slide
//   ?overview=1                 open with the overview of every slide (O)
//
// On every step the engine posts {type: "deck.step", id, step} to each iframe inside the active slide
// (audience window only). Hooks do not run in the presenter window, so a hook may have side effects.

(() => {
  "use strict";

  const DATA = JSON.parse(document.getElementById("deck-data").textContent);
  const stage = document.querySelector(".stage");
  const ALL = [...document.querySelectorAll(".slide:not([hidden])")]; // a hidden section only carries styles
  const byId = new Map(ALL.map((slide) => [slide.dataset.id, slide]));
  const PREFIX = "ync:";
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(`${PREFIX}${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value)); } catch { /* storage blocked */ } },
  };
  const params = new URLSearchParams(location.search);
  const PRESENTER = params.has("presenter");
  const STATIC = params.get("static") === "1";
  const reduceMotion = STATIC || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (STATIC) document.documentElement.classList.add("is-static");
  if (params.get("hud") === "0") document.documentElement.classList.add("no-hud");
  // Served by the talk's server (not a file or a published copy): no "Looks" pill on the TV. A still opens the panel.
  const SERVED = /^https?:$/.test(location.protocol) && !/(^|\.)claude\.ai$|(^|\.)claudeusercontent\.com$/.test(location.hostname);
  if (SERVED) document.documentElement.classList.add("is-served");

  const state = { index: 0, step: 0, notes: false, overview: false, black: false };
  const maxStep = (slide) => Math.max(0, ...[...slide.querySelectorAll("[data-step]")].map((el) => Number(el.dataset.step) || 0));

  // In the presenter window the stage is hidden: live pages inside slides never load there.
  if (PRESENTER) stage.querySelectorAll("iframe").forEach((frame) => { if (frame.getAttribute("src")) frame.dataset.src ||= frame.getAttribute("src"); frame.src = "about:blank"; });

  // ------------------------------------------------- looks and stories ----
  const LOOKS = [
    { id: "curate", name: "Luminous Data · dark", note: "The talk's look: dark blue aurora at the top, Urbanist and Geist, lit accent words, data as the hero.", swatch: ["#02040b", "#3d7bff", "#45d4ff"] },
    { id: "kleros", name: "Kleros purple", note: "The production Kleros palette on a purple aurora.", swatch: ["#07001a", "#7e1bd4", "#6cc5ff"] },
    { id: "daylight", name: "Daylight", note: "Light, for a bright room or a weak screen.", swatch: ["#f5f7fc", "#2a63f0", "#c9b8ff"] },
    { id: "record", name: "Editorial record", note: "Black field, oversized type, one red.", swatch: ["#050505", "#f4f2ee", "#ff3b3b"] },
    { id: "glass", name: "Iridescent glass", note: "Holographic field, frosted cards.", swatch: ["#0b1d1a", "#d8ff72", "#6c9cff"] },
  ];
  // Running orders live in src/narratives/*.json (each: id, name, pitch, ids in order, chapters, backup).
  const STORIES = DATA.stories?.length ? DATA.stories : [{ id: "all", name: "All slides", pitch: "Every slide in order.txt order.", ids: ALL.map((slide) => slide.dataset.id), chapters: {} }];
  // A slide may carry notes for one running order (<aside class="notes" data-story="id">) beside its default notes.
  const notesFor = (slide, storyId) => {
    const own = STORIES.find((s) => s.id === storyId)?.notes?.[slide?.dataset.id];
    if (own) { const box = document.createElement("aside"); box.innerHTML = own; return box; }
    return slide?.querySelector(`.notes[data-story="${storyId}"]`) ?? slide?.querySelector(".notes:not([data-story])");
  };
  const seconds = (slide, storyId) => { const m = notesFor(slide, storyId)?.querySelector("b")?.textContent.match(/\[(\d+):(\d{2})\]/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
  const storyTime = (s) => s.ids.reduce((t, id) => t + seconds(byId.get(id), s.id), 0);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  let channel = null;
  try { if ("BroadcastChannel" in window) channel = new BroadcastChannel("your-next-customer"); } catch { /* opaque origin */ }

  let slides = ALL;
  let mainCount = ALL.length;
  let story = STORIES[0];
  function applyStory(id, silent = false) {
    story = STORIES.find((s) => s.id === id) ?? STORIES[0];
    const main = story.ids.map((key) => byId.get(key)).filter(Boolean);
    const rest = ALL.filter((slide) => !main.includes(slide));
    // Backup: the running order's own backup list first, then every other slide in DOM order.
    const backup = (story.backup ?? []).map((key) => byId.get(key)).filter((slide) => slide && !main.includes(slide));
    const tail = [...backup, ...rest.filter((slide) => !backup.includes(slide))];
    slides = [...main, ...tail];
    slides.forEach((slide) => stage.append(slide));
    mainCount = main.length || slides.length;
    if (!PRESENTER) store.set("story", story.id);
    if (!silent) channel?.postMessage({ type: "story", id: story.id });
    overviewBuilt = false;
  }
  function applyLook(id, silent = false) {
    const look = LOOKS.find((one) => one.id === id) ?? LOOKS[0];
    document.documentElement.dataset.look = look.id;
    if (!PRESENTER) store.set("look", look.id);
    if (!silent) channel?.postMessage({ type: "look", id: look.id });
    Net.colors();
    Alt.paint();
  }

  // ------------------------------------------------------------ scaling ----
  function fit() {
    const gutter = innerWidth < 700 ? 16 : 0;
    const scale = Math.min((innerWidth - 2 * gutter) / 1920, (innerHeight - 2 * gutter) / 1080);
    stage.style.setProperty("--scale", String(scale));
    Net.size();
    Alt.scale();
  }
  // Focusing a button inside the scaled stage must never scroll it.
  stage.addEventListener("scroll", () => { stage.scrollTop = 0; stage.scrollLeft = 0; });
  document.addEventListener("focusin", () => { stage.scrollTop = 0; stage.scrollLeft = 0; slides.forEach((one) => { one.scrollTop = 0; }); });

  // ---------------------------------------------------------- rendering ----
  const progress = document.querySelector(".progress-fill");
  const chapterLabel = document.querySelector(".chapter-label");
  const counter = document.querySelector(".slide-counter");
  const notesPanel = document.querySelector(".notes-panel");
  let current = null;

  // Tell the live pages inside a slide where the talk is.
  function postFrames(slide, message) {
    if (PRESENTER || !slide) return;
    slide.querySelectorAll("iframe").forEach((frame) => { try { frame.contentWindow?.postMessage(message, "*"); } catch { /* not ready */ } });
  }
  const stepMessage = (slide) => ({ type: "deck.step", id: slide.dataset.id, step: state.step });
  // iframes written as data-src load when their slide is first shown (never in the presenter window).
  function wakeFrames(slide) {
    if (PRESENTER) return;
    slide.querySelectorAll("iframe[data-src]").forEach((frame) => { if (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank") frame.src = frame.dataset.src; });
  }
  stage.querySelectorAll(".slide iframe").forEach((frame) => frame.addEventListener("load", () => {
    const slide = frame.closest(".slide");
    if (slide && slide === slides[state.index]) { try { frame.contentWindow?.postMessage(stepMessage(slide), "*"); } catch { /* cross-origin quirk */ } }
    bindFrameKeys(frame, 0);
  }));
  // A clicker sends PageDown / PageUp. When the presenter has typed inside a live page (the race lane),
  // focus stays in that page; same-origin pages (and the pages inside them) pass those two keys back.
  const boundDocs = new WeakSet();
  function bindFrameKeys(frame, depth) {
    if (PRESENTER || depth > 3) return;
    let win = null, doc = null;
    try { win = frame.contentWindow; doc = win?.document; void doc?.body; } catch { return; } // cross-origin: nothing to do
    if (!win || !doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    win.addEventListener("keydown", (event) => {
      if (event.key === "PageDown" || event.key === "PageUp" || event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "PageDown") next(); else if (event.key === "PageUp") prev();
        return;
      }
      // Any other key goes to the active slide's hook first (fd-race's L), as in the deck's own handler,
      // but never from a text field inside the page: there the key is typed, as it should be.
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || state.overview || Alt.open) return;
      if (event.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      const slide = slides[state.index];
      const hook = hookOf(slide);
      if (!hook || typeof hook.key !== "function") return;
      let used = false;
      try { used = hook.key(event.key, slide, event, API) === true; } catch (err) { console.error(`slide ${slide.dataset.id} key`, err); }
      if (used) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    const bindChildren = () => doc.querySelectorAll("iframe").forEach((child) => {
      if (child.dataset.deckKeys) { bindFrameKeys(child, depth + 1); return; }
      child.dataset.deckKeys = "1";
      child.addEventListener("load", () => bindFrameKeys(child, depth + 1));
      bindFrameKeys(child, depth + 1);
    });
    bindChildren();
    let queued = false;
    const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; try { bindChildren(); } catch { /* page gone */ } }, 600); };
    try { new MutationObserver(later).observe(doc.documentElement, { childList: true, subtree: true }); } catch { /* no observer */ }
  }

  function render(fromRemote = false) {
    const slide = slides[state.index];
    const entering = slide !== current;
    if (entering && current) {
      current.classList.remove("is-in");
      current._token = null;
      if (!PRESENTER) { try { hookOf(current)?.leave?.(current, API); } catch (err) { console.error(`slide ${current.dataset.id} leave`, err); } }
    }
    slides.forEach((one, i) => {
      const active = i === state.index;
      one.classList.toggle("is-active", active);
      one.classList.toggle("is-past", i < state.index);
      one.setAttribute("aria-hidden", active ? "false" : "true");
    });
    if (entering) {
      current = slide;
      wakeFrames(slide);
      // Flush the at-rest styles first so the entrance transitions run.
      slide.classList.remove("is-in");
      void slide.offsetWidth;
      slide.classList.add("is-in");
    }
    const max = maxStep(slide);
    for (let k = 1; k <= max; k++) slide.classList.toggle(`b${k}`, k <= state.step);
    slide.querySelectorAll("[data-step]").forEach((el) => el.classList.toggle("is-shown", Number(el.dataset.step) <= state.step));
    slide.querySelectorAll("[data-flip-step]").forEach((el) => el.classList.toggle("is-flipped", state.step >= Number(el.dataset.flipStep)));
    slide.dataset.currentStep = String(state.step);
    stage.classList.toggle("has-net", slide.hasAttribute("data-net"));
    stage.classList.toggle("has-art", slide.hasAttribute("data-art"));
    stage.classList.toggle("is-void", slide.hasAttribute("data-void"));
    stage.dataset.story = story.id;
    if (slide.hasAttribute("data-net")) Net.start(); else Net.stop();
    const chapter = story.chapters?.[slide.dataset.id] ?? slide.dataset.chapter ?? "";
    chapterLabel.textContent = chapter;
    chapterLabel.hidden = !chapter || slide.classList.contains("chapter-card");
    document.body.classList.toggle("hud-off", slide.dataset.hud === "none");
    const inMain = state.index < mainCount;
    counter.textContent = inMain ? (story.counter === "current" ? `${state.index + 1}` : `${state.index + 1} / ${mainCount}`) : `backup ${state.index - mainCount + 1}`;
    progress.style.transform = `scaleX(${Math.min(1, (state.index + 1) / mainCount)})`;
    const notes = notesFor(slide, story.id);
    notesPanel.querySelector(".notes-body").innerHTML = notes ? notes.innerHTML : "<p>No notes for this slide.</p>";
    notesPanel.querySelector(".notes-title").textContent = `${state.index + 1}. ${slide.dataset.title ?? ""}`;
    if (!PRESENTER) {
      const hook = hookOf(slide);
      try {
        if (typeof hook === "function") hook(slide, state.step, entering, API);
        else if (hook) { if (entering) hook.enter?.(slide, API); hook.step?.(slide, state.step, API); }
      } catch (err) { console.error(`slide ${slide.dataset.id} hook`, err); }
      postFrames(slide, stepMessage(slide));
      try { history.replaceState(null, "", `#s${state.index + 1}`); } catch { /* sandboxed */ }
      store.set("index", state.index);
    }
    if (!fromRemote && channel) channel.postMessage({ type: "nav", index: state.index, step: state.step });
    if (PRESENTER) renderPresenter();
    document.body.classList.toggle("is-black", state.black);
  }

  function go(index, step = 0) {
    state.index = Math.max(0, Math.min(slides.length - 1, index));
    state.step = step === "last" ? maxStep(slides[state.index]) : Math.max(0, Math.min(Number(step) || 0, maxStep(slides[state.index])));
    render();
  }
  function goId(id, step = 0) { const i = slides.findIndex((s) => s.dataset.id === id); if (i >= 0) go(i, step); }
  function next() {
    const slide = slides[state.index];
    if (state.step < maxStep(slide)) { state.step += 1; render(); }
    else go(state.index + 1);
  }
  function prev() {
    if (state.step > 0) { state.step -= 1; render(); }
    else go(state.index - 1, "last");
  }
  function setBlack(on, fromRemote = false) {
    state.black = on;
    document.body.classList.toggle("is-black", on);
    if (!fromRemote) channel?.postMessage({ type: "black", on });
  }
  if (channel) channel.onmessage = ({ data }) => {
    if (!data || typeof data !== "object") return;
    if (data.type === "story") { applyStory(data.id, true); render(true); return; }
    if (data.type === "look") { applyLook(data.id, true); return; }
    if (data.type === "black") { setBlack(Boolean(data.on), true); return; }
    if (data.type === "nav" && Number.isInteger(data.index)) { state.index = Math.max(0, Math.min(slides.length - 1, data.index)); state.step = Math.max(0, Number(data.step) || 0); render(true); }
  };

  // ------------------------------------------------------- thumbnails ----
  // A thumbnail is a clone of a slide, fully built and at rest, in a 1920×1080
  // box scaled to its frame. Frames may carry their own data-look. Live pages
  // (iframes, video) are never cloned: a quiet box stands in for them.
  function cloneSlide(slide) {
    const node = slide.cloneNode(true);
    node.classList.add("is-active", "is-in");
    node.classList.remove("is-past");
    for (let k = 1; k <= maxStep(slide); k++) node.classList.add(`b${k}`);
    node.querySelectorAll("[data-step]").forEach((el) => el.classList.add("is-shown"));
    node.querySelectorAll(".notes").forEach((el) => el.remove());
    node.querySelectorAll("[data-flip-step]").forEach((el) => el.classList.add("is-flipped"));
    node.querySelectorAll("iframe, video, audio").forEach((el) => {
      const box = document.createElement("span");
      box.className = `thumb-live ${el.className || ""}`.trim();
      box.setAttribute("style", el.getAttribute("style") ?? "");
      box.textContent = el.getAttribute("title") || "Live page";
      el.replaceWith(box);
    });
    node.removeAttribute("aria-hidden");
    return node.outerHTML;
  }
  function thumbHtml(slide, look, withWorld) {
    const world = withWorld ? stage.querySelector(".worlds").outerHTML : "";
    const art = slide.hasAttribute("data-art") ? " has-art" : "";
    return `<span class="thumb-frame"${look ? ` data-look="${look}"` : ""}><span class="mini${art}">${world}${cloneSlide(slide)}</span></span>`;
  }
  function scaleThumbs(root) {
    root.querySelectorAll(".thumb-frame").forEach((frame) => {
      const mini = frame.firstElementChild;
      if (mini && frame.clientWidth) mini.style.transform = `scale(${frame.clientWidth / 1920})`;
    });
  }

  // ---------------------------------------------------------- overview ----
  const overview = document.querySelector(".overview");
  let overviewBuilt = false;
  function buildOverview() {
    const list = overview.querySelector(".overview-grid");
    list.innerHTML = "";
    slides.forEach((slide, i) => {
      if (i === mainCount) list.insertAdjacentHTML("beforeend", `<div class="overview-split">Backup, and slides outside "${esc(story.name)}"</div>`);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thumb";
      button.innerHTML = `${thumbHtml(slide, null, false)}<span class="thumb-name"><b>${i < mainCount ? i + 1 : "+"}</b><span></span></span>`;
      button.querySelector(".thumb-name span").textContent = slide.dataset.title ?? `Slide ${i + 1}`;
      button.addEventListener("click", () => { toggleOverview(false); go(i); });
      list.append(button);
    });
    overview.querySelector(".overview-sub").textContent = `Running order "${story.name}": ${mainCount} slides, about ${mmss(storyTime(story))} by the timings in the notes. Esc closes. A switches looks and running orders.`;
    overviewBuilt = true;
  }
  function toggleOverview(force) {
    state.overview = force ?? !state.overview;
    if (state.overview) { Alt.toggle(false); if (!overviewBuilt) buildOverview(); }
    overview.hidden = !state.overview;
    if (state.overview) {
      scaleThumbs(overview);
      overview.querySelectorAll(".thumb").forEach((el, i) => el.classList.toggle("is-current", i === state.index));
      overview.querySelectorAll(".thumb")[state.index]?.focus();
    }
  }
  overview.querySelector(".panel-close").addEventListener("click", () => toggleOverview(false));

  // ------------------------------------------------------ alternatives ----
  const Alt = {
    el: document.querySelector(".alternatives"),
    open: false,
    built: false,
    toggle(force) {
      this.open = force ?? !this.open;
      if (this.open) { if (state.overview) toggleOverview(false); if (!this.built) this.build(); }
      this.el.hidden = !this.open;
      if (this.open) { this.paint(); this.scale(); this.el.querySelector(".look-row.is-on")?.focus(); }
    },
    build() {
      const wanted = ["title", "fd-thesis", "fd-agent-gets"].map((id) => byId.get(id)).filter(Boolean);
      const shots = [...wanted, ...ALL.filter((slide) => !wanted.includes(slide))].slice(0, 3);
      const looks = LOOKS.map((look) => `<div class="look-row" role="button" tabindex="0" data-look-id="${look.id}">
        <span class="look-meta"><span class="swatch">${look.swatch.map((c) => `<i style="background:${c}"></i>`).join("")}</span><b>${esc(look.name)}</b><span>${esc(look.note)}</span><span class="on">Showing now</span></span>
        ${shots.map((slide) => `<span class="thumb">${thumbHtml(slide, look.id, true)}</span>`).join("")}</div>`).join("");
      const stories = STORIES.map((s) => `<div class="story" role="button" tabindex="0" data-story-id="${esc(s.id)}">
        <span class="s-head"><b>${esc(s.name)}</b><span class="mins">${mmss(storyTime(s))} · ${s.ids.length} slides</span></span>
        <p>${esc(s.pitch)}</p><ol>${s.ids.map((id) => `<li>${esc(byId.get(id)?.dataset.title ?? id)}</li>`).join("")}</ol></div>`).join("");
      this.el.querySelector(".panel-inner").innerHTML = `
        <div class="panel-top"><div><h2>Alternatives</h2><p class="sub">Looks and running orders for the same deck. Click one and it applies right away; this browser remembers the choice. Every slide not in a running order stays reachable as backup.</p></div><button type="button" class="panel-close">Close · A</button></div>
        <section><h3>Look</h3><div class="look-rows">${looks}</div></section>
        <section><h3>Running order</h3><div class="story-grid">${stories}</div></section>`;
      const activate = (el) => {
        if (el.dataset.lookId) applyLook(el.dataset.lookId);
        if (el.dataset.storyId) { applyStory(el.dataset.storyId); go(0); this.paint(); }
      };
      this.el.querySelectorAll("[data-look-id], [data-story-id]").forEach((el) => {
        el.addEventListener("click", () => activate(el));
        el.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(el); } });
      });
      this.el.querySelector(".panel-close").addEventListener("click", () => this.toggle(false));
      this.built = true;
    },
    paint() {
      if (!this.built) return;
      const look = document.documentElement.dataset.look;
      this.el.querySelectorAll(".look-row").forEach((el) => el.classList.toggle("is-on", el.dataset.lookId === look));
      this.el.querySelectorAll(".story").forEach((el) => el.classList.toggle("is-on", el.dataset.storyId === story.id));
    },
    scale() { if (this.open) scaleThumbs(this.el); },
  };
  document.querySelector(".alt-toggle")?.addEventListener("click", () => Alt.toggle());

  // ---------------------------------------------------------- keyboard ----
  addEventListener("keydown", (event) => {
    const key = event.key;
    if (key === "F5") { event.preventDefault(); return; } // clickers send F5 for "slideshow"; never reload mid-talk
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable]")) return; // typing in a slide's own field
    if (state.overview) { if (key === "Escape" || key === "o" || key === "O") toggleOverview(false); return; } // its buttons take Enter and Tab
    if (Alt.open) { if (key === "Escape" || key === "a" || key === "A") Alt.toggle(false); return; }
    if (event.repeat && (key === "Enter" || /^[0-9]$/.test(key))) { event.preventDefault(); return; }
    const slide = slides[state.index];
    // A slide hook may take a key first: {key(key, slide, event, api) → true when it used it}.
    const hook = hookOf(slide);
    if (!PRESENTER && hook && typeof hook.key === "function") {
      let used = false;
      try { used = hook.key(key, slide, event, API) === true; } catch (err) { console.error(`slide ${slide.dataset.id} key`, err); }
      if (used) { event.preventDefault(); return; }
    }
    switch (key) {
      case "ArrowRight": case "PageDown": case " ": case "ArrowDown": event.preventDefault(); next(); break;
      case "ArrowLeft": case "PageUp": case "Backspace": case "ArrowUp": event.preventDefault(); prev(); break;
      case "Home": go(0); break;
      case "End": go(mainCount - 1); break;
      case "n": case "N": state.notes = !state.notes; notesPanel.hidden = !state.notes; break;
      case "o": case "O": toggleOverview(); break;
      case "a": case "A": Alt.toggle(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "p": case "P": openPresenter(); break;
      case "b": case "B": case ".": setBlack(!state.black); break;
      case "t": case "T": timer.reset(); break;
      default: return;
    }
  });
  // A click that only brings focus back (from a live page inside a slide, or from another window) never moves the deck.
  let refocusAt = 0;
  addEventListener("focus", () => { refocusAt = performance.now(); });
  stage.addEventListener("click", (event) => {
    if (performance.now() - refocusAt < 400) return;
    if (event.target.closest("button, a, input, textarea, select, label, iframe, [data-click]")) return;
    const x = event.clientX / innerWidth;
    if (x < 0.25) prev(); else next();
  });
  let touchX = null;
  addEventListener("touchstart", (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  addEventListener("touchend", (event) => {
    if (touchX === null || state.overview || Alt.open) { touchX = null; return; }
    const dx = event.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
    touchX = null;
  });

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* not allowed here */ }
  }
  let wakeLock = null;
  async function keepAwake() {
    try { if (!wakeLock && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch { /* refused */ }
  }
  addEventListener("pointerdown", keepAwake, { once: true });
  addEventListener("keydown", keepAwake, { once: true });

  // --------------------------------------------------------- presenter ----
  const timer = {
    start: Date.now(),
    reset() { this.start = Date.now(); },
    text() { const s = Math.floor((Date.now() - this.start) / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; },
  };
  function openPresenter() {
    if (PRESENTER) return;
    const url = new URL(location.href);
    for (const key of ["presenter", "slide", "step", "static", "hud"]) url.searchParams.delete(key);
    url.searchParams.set("presenter", "1");
    url.hash = "";
    try { window.open(url.toString(), "ync-presenter", "width=1100,height=760"); } catch { /* blocked */ }
  }
  function renderPresenter() {
    const panel = document.querySelector(".presenter");
    if (!panel) return;
    const slide = slides[state.index];
    const after = slides[state.index + 1];
    panel.querySelector(".p-now").textContent = `${state.index + 1}. ${slide.dataset.title ?? ""}  ·  step ${state.step}/${maxStep(slide)}`;
    panel.querySelector(".p-next").textContent = after ? `Next: ${after.dataset.title ?? ""}` : "End of deck";
    panel.querySelector(".p-notes").innerHTML = notesFor(slide, story.id)?.innerHTML ?? "";
    panel.querySelector(".p-chapter").textContent = `${story.name} · ${story.chapters?.[slide.dataset.id] ?? slide.dataset.chapter ?? ""}`;
  }
  if (PRESENTER) {
    document.body.classList.add("is-presenter");
    const panel = document.createElement("div");
    panel.className = "presenter";
    panel.innerHTML = `<div class="p-head"><span class="p-chapter"></span><span class="p-clock"></span><button type="button" class="p-reset">Reset timer</button></div><div class="p-now"></div><div class="p-notes"></div><div class="p-next"></div><div class="p-keys">→ next · ← back · B black screen · O all slides · T reset timer · keys here move the audience screen</div>`;
    document.body.append(panel);
    panel.querySelector(".p-reset").addEventListener("click", () => timer.reset());
    setInterval(() => { panel.querySelector(".p-clock").textContent = `${timer.text()} elapsed · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; }, 1000);
  }

  // ---------------------------------------------------------- helpers -----
  const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const restart = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  // True when the URL answers 2xx within ms (for live parts that need the local server).
  async function probe(url, ms = 1500) {
    if (!/^https?:$/.test(location.protocol) && !/^https?:/.test(url)) return false;
    try { const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) }); return res.ok; } catch { return false; }
  }
  // An inline file parsed as JSON, or null.
  const inlineJson = (key) => { try { const text = DATA.inline?.[key]; return text ? JSON.parse(text) : null; } catch { return null; } };

  // Counts el from one number to another; log scale for big jumps.
  function countTo(el, from, to, duration = 2600, log = false) {
    if (!el) return;
    if (el._raf) cancelAnimationFrame(el._raf);
    const show = (v) => { el.textContent = Math.round(v).toLocaleString("en-US"); };
    if (reduceMotion || from === to) { show(to); return; }
    const start = performance.now();
    const a = log ? Math.log10(Math.max(1, from)) : from, b = log ? Math.log10(to) : to;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (b - a) * (1 - Math.pow(1 - t, 3));
      show(log ? Math.pow(10, v) : v);
      if (t < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------- network canvas ----
  // Drifting nodes and pulses along the links, behind slides with data-net.
  const Net = {
    canvas: document.querySelector(".netcanvas"),
    ctx: null, nodes: [], pulses: [], rings: [], running: false, last: 0, spawn: 0, ratio: 1,
    rgb: "122, 167, 255", hot: "255, 107, 122",
    init() {
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext("2d");
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 72; i++) this.nodes.push({ x: rnd() * 1920, y: rnd() * 1080, vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5, r: rnd() < 0.16 ? 4.5 : 2.2 });
      this.colors();
    },
    size() {
      if (!this.canvas) return;
      const scale = parseFloat(stage.style.getPropertyValue("--scale")) || 1;
      const ratio = Math.min(2, Math.max(0.5, (devicePixelRatio || 1) * scale));
      if (Math.abs(ratio - this.ratio) < 0.01 && this.canvas.width) return;
      this.ratio = ratio;
      this.canvas.width = Math.round(1920 * ratio);
      this.canvas.height = Math.round(1080 * ratio);
      if (!this.running && this.ctx) this.draw(performance.now(), 0);
    },
    colors() {
      const cs = getComputedStyle(document.documentElement);
      this.rgb = cs.getPropertyValue("--net-node").trim() || this.rgb;
      this.hot = cs.getPropertyValue("--net-hot").trim() || this.hot;
      if (!this.running && this.ctx) this.draw(performance.now(), 0);
    },
    start() {
      if (!this.ctx || PRESENTER) return;
      if (reduceMotion) { this.draw(performance.now(), 0); return; }
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(Net.loop);
    },
    stop() { this.running = false; },
    loop(t) {
      if (!Net.running) return;
      const dt = Math.min(50, t - Net.last);
      Net.last = t;
      Net.draw(t, dt);
      requestAnimationFrame(Net.loop);
    },
    draw(t, dt) {
      const { ctx, nodes } = this;
      const R = 250;
      ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
      ctx.clearRect(0, 0, 1920, 1080);
      for (const n of nodes) {
        n.x += n.vx * dt * 0.06; n.y += n.vy * dt * 0.06;
        if (n.x < -20 || n.x > 1940) n.vx *= -1;
        if (n.y < -20 || n.y > 1100) n.vy *= -1;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.hypot(dx, dy);
        if (d > R) continue;
        ctx.strokeStyle = `rgba(${this.rgb}, ${(1 - d / R) * 0.2})`;
        ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
      }
      this.spawn -= dt;
      if (dt && this.spawn <= 0) {
        this.spawn = 150;
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const near = nodes.filter((n) => n !== a && Math.hypot(n.x - a.x, n.y - a.y) < R);
        if (near.length) this.pulses.push({ a, b: near[Math.floor(Math.random() * near.length)], t0: t, dur: 900 + Math.random() * 700, bad: false });
      }
      this.pulses = this.pulses.filter((p) => {
        const k = (t - p.t0) / p.dur;
        if (k >= 1) return false;
        const x = p.a.x + (p.b.x - p.a.x) * k, y = p.a.y + (p.b.y - p.a.y) * k;
        ctx.fillStyle = `rgba(${this.rgb}, 0.95)`;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        return true;
      });
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${this.rgb}, ${n.r > 3 ? 0.9 : 0.55})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        if (n.r > 3) { ctx.strokeStyle = `rgba(${this.rgb}, 0.25)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n.x, n.y, 12, 0, Math.PI * 2); ctx.stroke(); }
      }
    },
  };

  // ------------------------------------------------------------ hooks -----
  // Slide files register hooks in window.DECK_SLIDE_HOOKS, by slide id (or by data-hook name): a function
  // (slide, step, entering, api) or {enter(slide, api), step(slide, step, api), leave(slide, api), key(key, slide, event, api)}.
  const SLIDE_HOOKS = window.DECK_SLIDE_HOOKS || {};
  const hookOf = (slide) => (slide && ((slide.dataset.hook && SLIDE_HOOKS[slide.dataset.hook]) || SLIDE_HOOKS[slide.dataset.id])) || null;
  const API = {
    countTo, sleep, reduceMotion, esc, restart, probe,
    $: (root, sel) => root.querySelector(sel),
    $$: (root, sel) => [...root.querySelectorAll(sel)],
    static: STATIC,
    presenter: PRESENTER,
    // Served by the talk's server (http on this laptop or the LAN), not opened as a file or a published artifact.
    served: SERVED,
    localhost: /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname),
    inline: DATA.inline ?? {},
    inlineBytes: DATA.inlineBytes ?? {},
    json: inlineJson,
    post: postFrames,
    next, prev, go, goId,
    get step() { return state.step; },
    get story() { return story.id; },
  };

  // ------------------------------------------------------------ start -----
  stage.querySelectorAll(".slide iframe").forEach((frame) => bindFrameKeys(frame, 0));
  Net.init();
  applyStory(params.get("story") ?? store.get("story", STORIES[0].id), true);
  applyLook(params.get("look") ?? store.get("look", LOOKS[0].id), true);
  addEventListener("resize", fit);
  fit();
  const fromHash = Number((location.hash.match(/^#s(\d+)$/) ?? [])[1]);
  state.index = Math.max(0, Math.min(slides.length - 1, (fromHash || Number(store.get("index", 0)) + 1) - 1)) || 0;
  if (PRESENTER) state.index = Math.max(0, Math.min(slides.length - 1, Number(store.get("index", 0)) || 0));
  // For screenshots and checks: ?slide=<id> opens that slide, ?step=<n|last> a build step.
  if (params.get("slide")) { const i = slides.findIndex((s) => s.dataset.id === params.get("slide")); if (i >= 0) state.index = i; else console.warn(`deck: no slide "${params.get("slide")}"`); }
  if (params.get("step")) state.step = params.get("step") === "last" ? maxStep(slides[state.index]) : Math.max(0, Math.min(Number(params.get("step")) || 0, maxStep(slides[state.index])));
  render();
  if (params.get("overview") === "1") toggleOverview(true); // a contact sheet of every slide (shot.sh --overview)
  window.DECK = { go, goId, next, prev, applyLook, applyStory, LOOKS, STORIES, state, get slides() { return slides; }, api: API };
})();
