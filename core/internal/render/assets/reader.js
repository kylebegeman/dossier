(() => {
  "use strict";
  /* the reply line, its words, and whether it says anything, exactly as Go has them: testdata/replies.json holds both to the same cases */
  const parts = (c, s) => {
    const num = {}, can = {}, v = s.verdicts || {}, notes = s.notes || {}, groups = [];
    let open = 0;
    c.items.forEach((it) => { num[it.id] = it.n; can[it.id] = it.eligible; if (it.eligible) open++; });
    const nums = (ids) => { const seen = {}; return ids.map((id) => num[id]).filter((n) => n && !seen[n] && (seen[n] = 1)).sort((a, b) => a - b); };
    if (c.mode === "pick") { const p = nums(s.picked || []); if (p.length) groups.push(["", p, p.length === c.items.length]); }
    else if (c.mode === "verdict") c.verdicts.forEach((id) => { const n = nums(Object.keys(v).filter((k) => v[k] === id && can[k])); if (n.length) groups.push([id, n, n.length === open]); });
    const note = (id) => String(notes[id]).trim().split(/\s+/).join(" ").replace(/[ .]+$/, "");
    return [groups, Object.keys(notes).map((id) => [num[id], note(id)]).filter(([n, t]) => n && t).sort((a, b) => a[0] - b[0])];
  };
  const reply = (c, s) => {
    const [groups, noted] = parts(c, s), body = groups.map(([id, n, all]) => (id ? id + " " : "") + (all ? "all" : n.join(", "))).join("; ");
    return (s.path && body ? s.path + ", " + body : s.path || body || "nothing") + "." + (noted.length ? " Notes: " + noted.map((x) => x.join(": ")).join("; ") + (/[!?]$/.test(noted[noted.length - 1][1]) ? "" : ".") : "");
  };
  const empty = (c, s) => { const [groups, noted] = parts(c, s); return !s.path && !groups.length && !noted.length; };
  const words = (c, s) => {
    const [groups, noted] = parts(c, s), and = (n) => (n.length < 3 ? n.join(" and ") : n.slice(0, -1).join(", ") + ", and " + n[n.length - 1]);
    const said = (s.path ? ["Choice: " + (c.options[s.path] || s.path)] : []).concat(
      groups.map(([id, n, all]) => (id ? c.labels[id] : "Pick") + ": " + (all ? "all " + c.plural : (n.length > 1 ? c.plural : c.noun) + " " + and(n))),
      noted.map(([n, t]) => "Note on " + c.noun + " " + n + ": " + t));
    return said.map((x) => (/[.!?]$/.test(x) ? x : x + ".")).join(" ") || "Nothing decided yet.";
  };
  if (typeof document === "undefined") { if (typeof module === "object") module.exports = { reply, words, empty }; return; }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const at = (el, name) => el.getAttribute(name);
  const idOf = (el) => at(el.closest("[data-item]"), "data-item");
  const on = (type, fn, target) => (target || document).addEventListener(type, fn);
  const say = (sel, text) => $$(sel).forEach((el) => { el.textContent = text; });
  const keys = Object.keys;
  let model = {};
  try { model = JSON.parse($("#dossier-model").textContent); } catch (e) {}
  const slug = (model.meta && model.meta.slug) || "dossier";
  const load = (k) => { try { return localStorage.getItem("dossier:" + slug + ":" + k); } catch (e) { return null; } };
  const keep = (k, v) => { try { localStorage.setItem("dossier:" + slug + ":" + k, v); } catch (e) {} };

  /* theme: auto, light, dark */
  const themeBtn = $("[data-theme-toggle]"), modes = ["auto", "light", "dark"];
  const applyTheme = (m) => {
    if (!modes.includes(m)) m = "auto";
    if (m === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", m);
    if (themeBtn) {
      themeBtn.setAttribute("data-mode", m);
      themeBtn.setAttribute("aria-label", "Theme: " + m + (m === "auto" ? ", follows your system" : ""));
      $(".th-label", themeBtn).textContent = m[0].toUpperCase() + m.slice(1);
      $$("svg", themeBtn).forEach((svg) => { svg.hidden = !svg.classList.contains("th-" + m); });
    }
    keep("theme", m);
  };
  applyTheme(load("theme"));
  if (themeBtn) on("click", () => applyTheme(modes[(modes.indexOf(at(themeBtn, "data-mode")) + 1) % 3]), themeBtn);

  /* decisions: the embedded model is the baseline, this device may go further */
  const pickBlock = $("#pick"), mode = pickBlock ? at(pickBlock, "data-mode") : "none", tone = {}, label = {}, num = {}, can = {};
  let defs = [];
  try { defs = JSON.parse(at(pickBlock, "data-verdicts")) || []; } catch (e) {}
  defs.forEach((d) => { tone[d.id] = d.tone; label[d.id] = d.label; });
  const items = $$("[data-item][data-num]"), choices = $$("input[data-choice]");
  const ctx = { mode, verdicts: defs.map((d) => d.id), labels: label, options: {}, items: [], noun: pickBlock && at(pickBlock, "data-noun"), plural: pickBlock && at(pickBlock, "data-plural") };
  choices.forEach((r) => { ctx.options[r.value] = at(r, "data-label"); });
  items.forEach((el) => {
    const id = at(el, "data-item");
    num[id] = +at(el, "data-num");
    can[id] = el.hasAttribute("data-decides");
    ctx.items.push({ id, n: num[id], eligible: can[id] });
  });
  const clean = (s) => {
    const out = { path: "", picked: [], verdicts: {}, notes: {} };
    if (!s || typeof s !== "object") return out;
    if (choices.some((r) => r.value === s.path)) out.path = s.path;
    if (mode === "pick" && Array.isArray(s.picked)) out.picked = s.picked.filter((id, i, a) => num[id] && a.indexOf(id) === i);
    if (mode === "verdict" && s.verdicts && typeof s.verdicts === "object") keys(s.verdicts).forEach((id) => { if (can[id] && label[s.verdicts[id]]) out.verdicts[id] = s.verdicts[id]; });
    if (s.notes && typeof s.notes === "object") keys(s.notes).forEach((id) => { const v = s.notes[id]; if (num[id] && typeof v === "string" && v.trim()) out.notes[id] = v.trim(); });
    return out;
  };
  let state = clean(model.decisions), framed = true;
  try { const saved = load("decisions"); if (saved) state = clean(JSON.parse(saved)); } catch (e) {}
  try { framed = window.parent !== window; } catch (e) {}
  const tell = (msg) => { if (framed) { msg.slug = slug; try { window.parent.postMessage(msg, "*"); } catch (e) {} } };
  const detail = () => ({ path: state.path, picked: state.picked.slice().sort((a, b) => num[a] - num[b]), verdicts: state.verdicts, notes: state.notes, reply: reply(ctx, state) });
  const announce = () => {
    const d = detail();
    try { document.dispatchEvent(new CustomEvent("dossier:decisions", { detail: d })); } catch (e) {}
    tell({ type: "dossier:decisions", decisions: d });
  };
  const save = () => { keep("decisions", JSON.stringify(state)); announce(); render(); };
  const decided = (id) => (mode === "pick" ? state.picked.includes(id) : !!state.verdicts[id]);
  const setPick = (id, yes) => { if (yes !== decided(id)) { state.picked = yes ? state.picked.concat(id) : state.picked.filter((x) => x !== id); save(); } };
  const setVerdict = (id, v) => { if (can[id] && (state.verdicts[id] || "") !== v) { if (v) state.verdicts[id] = v; else delete state.verdicts[id]; save(); } };
  const setPath = (p) => { if (state.path !== p) { state.path = p; save(); } };
  const setNote = (id, text) => { const v = String(text || "").trim(); if ((state.notes[id] || "") !== v) { if (v) state.notes[id] = v; else delete state.notes[id]; save(); } };
  const toneOf = (el, v) => { if (tone[v]) el.setAttribute("data-tone", tone[v]); else el.removeAttribute("data-tone"); };
  const render = () => {
    items.forEach((el) => {
      const id = at(el, "data-item"), v = state.verdicts[id] || "", yes = decided(id), picked = mode === "pick" && yes;
      el.classList.toggle("picked", picked);
      toneOf(el, v);
      $$("[data-verdict]", el).forEach((b, i) => {
        const sel = at(b, "data-verdict") === v;
        b.setAttribute("aria-checked", sel);
        b.tabIndex = (v ? sel : i === 0) ? 0 : -1;
      });
      const b = $("[data-pick]", el), tr = $('tr[data-item="' + id + '"]'), li = $('.toc li[data-item="' + id + '"]');
      if (b) { b.setAttribute("aria-pressed", yes); b.textContent = yes ? "Picked" : "Pick"; }
      if (tr) {
        tr.classList.toggle("picked", picked);
        toneOf(tr, v);
        const ctl = $("input,select", tr);
        if (ctl && ctl.type === "checkbox") ctl.checked = yes; else if (ctl) ctl.value = v;
      }
      if (li) { li.classList.toggle("picked", picked); toneOf(li, v); $(".sr", li).textContent = yes ? ", " + (label[v] || "picked") : ""; }
      const note = $("[data-note-wrap]", el), ta = note && $("textarea", note), nb = $("[data-note-toggle]", el);
      if (ta && document.activeElement !== ta) ta.value = state.notes[id] || "";
      if (note && state.notes[id]) note.hidden = false;
      if (nb && note) nb.textContent = note.hidden ? (state.notes[id] ? "Edit note" : "Add a note") : "Hide note";
    });
    let chosen = "Open";
    choices.forEach((r) => { r.checked = r.value === state.path; if (r.checked) chosen = at(r, "data-label"); });
    $$("[data-choice-clear]").forEach((b) => { b.hidden = !state.path; });
    say('[data-live="choice"]', chosen);
    $$("[data-guard]").forEach((g) => { const n = state.path === at(g, "data-guard") ? at(g, "data-watch").split(" ").filter((id) => state.verdicts[id] !== at(g, "data-unless")).map((id) => num[id]) : []; g.hidden = !n.length; g.textContent = n.length ? at(g, n.length > 1 ? "data-many" : "data-one").replace("{n}", n.join(", ")) : ""; });
    say('[data-live="count"]', mode === "pick" ? state.picked.length : keys(state.verdicts).length);
    if (pickBlock) pickBlock.toggleAttribute("data-empty", empty(ctx, state));
    say("[data-reply]", reply(ctx, state));
    say("[data-words]", words(ctx, state));
    applyView();
  };
  const decisionsJSON = () => {
    const d = detail(), some = (o) => (keys(o).length ? o : undefined);
    return JSON.stringify({ schema: "dossier.decisions/v1", slug, title: (model.meta && model.meta.title) || "", kind: model.kind, path: d.path || undefined, picked: d.picked, verdicts: some(d.verdicts), notes: some(d.notes), reply: d.reply }, null, 2);
  };
  let noteTimer;
  on("click", (e) => {
    const t = e.target;
    let b = t.closest("[data-verdict]");
    if (b) { e.preventDefault(); const id = idOf(b), v = at(b, "data-verdict"); setVerdict(id, state.verdicts[id] === v && e.detail ? "" : v); return; }
    if ((b = t.closest("[data-pick]"))) { e.preventDefault(); setPick(idOf(b), !decided(idOf(b))); return; }
    if ((b = t.closest("[data-note-toggle]"))) {
      e.preventDefault();
      const d = b.closest("[data-item]"), wrap = $("[data-note-wrap]", d);
      if (wrap) { wrap.hidden = !wrap.hidden; if (!wrap.hidden) d.open = true; render(); if (!wrap.hidden) $("textarea", wrap).focus(); }
      return;
    }
    if (t.closest("[data-choice-clear]")) setPath("");
    else if (t.closest("[data-collapse-toggle]")) setAllOpen(!anyOpen());
    else if (t.closest("[data-copy-reply]")) copy(reply(ctx, state), "Reply copied");
    else if (t.closest("[data-copy-decisions]")) copy(decisionsJSON(), "Copied as JSON");
    else if (t.closest("[data-hide]")) setHide(!hide);
    else if (t.closest("[data-show-all]")) { search(""); setHide(false); }
    else if (t.closest("[data-search-clear]")) { search(""); box.focus(); }
  });
  on("keydown", (e) => {
    const t = e.target, b = t.closest && t.closest("[data-verdict]");
    if (e.key === "/" && box && !(t.closest && t.closest("input,textarea,select,[contenteditable]"))) { e.preventDefault(); box.focus(); return; }
    if (!b) return;
    const group = $$("[data-verdict]", b.parentNode), dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (dir) {
      e.preventDefault();
      const next = group[(group.indexOf(b) + dir + group.length) % group.length];
      setVerdict(idOf(b), at(next, "data-verdict"));
      next.focus();
    } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setVerdict(idOf(b), ""); }
  });
  on("change", (e) => {
    const t = e.target;
    if (t.matches("input[data-pick-row]")) setPick(at(t, "data-pick-row"), t.checked);
    else if (t.matches("select[data-verdict-row]")) setVerdict(at(t, "data-verdict-row"), t.value);
    else if (t.matches("input[data-choice]")) setPath(t.value);
  });
  on("input", (e) => { const t = e.target; if (t.matches("textarea[data-note]")) { clearTimeout(noteTimer); noteTimer = setTimeout(() => setNote(at(t, "data-note"), t.value), 300); } });
  on("focusout", (e) => { const t = e.target; if (t.matches && t.matches("textarea[data-note]")) { clearTimeout(noteTimer); setNote(at(t, "data-note"), t.value); } });

  /* collapsing: remembered per item on this device */
  const details = $$("details.item[id]"), opened = {};
  let printing = false, beforePrint = null;
  try { JSON.parse(load("open") || "[]").forEach((id) => { opened[id] = true; }); } catch (e) {}
  const anyOpen = () => details.some((d) => d.open);
  const setAllOpen = (open) => details.forEach((d) => { d.open = open; });
  const renderCollapse = () => { const b = $("[data-collapse-toggle]"); if (b) { b.textContent = anyOpen() ? "Collapse all" : "Expand all"; b.setAttribute("aria-expanded", anyOpen()); } };
  details.forEach((d) => {
    if (opened[d.id]) d.open = true;
    on("toggle", () => {
      if (!printing && !auto[d.id]) { if (d.open) opened[d.id] = true; else delete opened[d.id]; keep("open", JSON.stringify(keys(opened))); }
      renderCollapse();
    }, d);
  });
  on("beforeprint", () => { printing = true; beforePrint = details.map((d) => d.open); setAllOpen(true); applyView(); }, window);
  on("afterprint", () => { if (beforePrint) details.forEach((d, i) => { d.open = beforePrint[i]; }); beforePrint = null; setTimeout(() => { printing = false; applyView(); }, 0); }, window);
  const openHash = () => { const t = location.hash && document.getElementById(location.hash.slice(1)); if (t && t.tagName === "DETAILS") t.open = true; };
  openHash();
  on("hashchange", openHash, window);
  renderCollapse();

  /* view: Hide decided and search together decide what shows; printing shows everything */
  const box = $("[data-search]"), hl = window.CSS && CSS.highlights;
  const fold = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const units = $$("details.item, .rows > *").map((el) => { const body = $(".item-body, .facets", el); return { el, text: fold(el.textContent), body: body ? fold(body.textContent) : "", n: +at(el, "data-num") }; });
  const sections = $$(".section").map((el) => ({ el, text: fold($$(":scope > :not(details.item, .rows, .hidden-row)", el).map((c) => c.textContent).join(" ")) }));
  const matches = (u, terms) => terms.every((t) => u.text.includes(t) || (u.n > 0 && +t === u.n));
  let hide = load("hide") === "1", query = "", auto = {}, hits = [], now = -1;
  const mark = (name, ranges) => { if (hl) hl.set(name, new Highlight(...ranges)); };
  const count = (active) => say("[data-hits]", !active ? "" : !hits.length ? "No matches" : now >= 0 ? now + 1 + " of " + hits.length : hits.length + (hits.length === 1 ? " match" : " matches"));
  const applyView = () => {
    const terms = printing ? [] : fold(query).split(/\s+/).filter(Boolean);
    let shown = 0;
    units.forEach((u) => {
      const id = u.el.id, h = (!printing && hide && u.n > 0 && (decided(id) || !can[id])) || (terms.length > 0 && !matches(u, terms));
      u.el.hidden = h;
      if (!h && terms.length && !u.el.open && terms.some((t) => u.body.includes(t))) { auto[id] = 1; u.el.open = true; }
      [$('tr[data-item="' + id + '"]'), $('.toc li[data-item="' + id + '"]')].forEach((x) => { if (x) x.hidden = h; });
    });
    if (!terms.length && !printing && keys(auto).length) { keys(auto).forEach((id) => { document.getElementById(id).open = false; }); setTimeout(() => { auto = {}; }, 0); }
    sections.forEach((sec) => {
      const h = terms.length > 0 && !matches(sec, terms) && !$$("details.item:not([hidden]), .rows > :not([hidden])", sec.el).length, a = $('.toc a[href="#' + sec.el.id + '"]');
      sec.el.hidden = h;
      if (!h) shown++;
      if (a) a.parentNode.hidden = h;
    });
    $$(".toc li.group").forEach((g) => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains("group")) { any = any || !n.hidden; n = n.nextElementSibling; } g.hidden = !any && (!$("a", g) || g.hidden); });
    $$("[data-hidden-row]").forEach((row) => { const n = $$("details.item[hidden]", row.parentNode).length; row.hidden = !n || terms.length > 0; $("[data-hidden-count]", row).textContent = n; });
    const none = $("[data-no-hits]"), b = $("[data-hide]");
    if (none) { none.hidden = !terms.length || shown > 0; $("[data-no-hits-query]", none).textContent = query.trim(); }
    if (b) { b.setAttribute("aria-pressed", hide); b.textContent = hide ? "Showing undecided" : "Hide decided"; }
    hits = [];
    now = -1;
    const walk = document.createTreeWalker($("#main") || document.body, NodeFilter.SHOW_TEXT);
    for (let node; terms.length && (node = walk.nextNode());) {
      const el = node.parentElement, closed = el.closest("details:not([open])");
      if (el.closest("[hidden],button,select,textarea,[data-no-hits],.pick") || (closed && !el.closest("summary"))) continue;
      let f = "";
      const map = [], x = node.data;
      for (let i = 0; i < x.length; i++) { const c = fold(x[i]); for (let j = 0; j < c.length; j++) { f += c[j]; map.push(i); } }
      terms.forEach((t) => { for (let k = f.indexOf(t); k >= 0; k = f.indexOf(t, k + t.length)) { const r = new Range(); r.setStart(node, map[k]); r.setEnd(node, map[k + t.length - 1] + 1); hits.push(r); } });
    }
    hits.sort((a, z) => a.compareBoundaryPoints(Range.START_TO_START, z));
    mark("dossier-hit", hits);
    mark("dossier-now", []);
    count(terms.length);
  };
  const step = (dir) => {
    if (!hits.length) return;
    now = (now + dir + hits.length) % hits.length;
    mark("dossier-now", [hits[now]]);
    hits[now].startContainer.parentElement.scrollIntoView({ block: "center" });
    count(true);
  };
  const search = (q) => { if (box) box.value = q; query = q; applyView(); };
  const setHide = (yes) => { hide = yes; keep("hide", hide ? "1" : "0"); applyView(); };
  if (box) {
    on("input", () => { query = box.value; applyView(); }, box);
    on("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); if (box.value) search(""); else box.blur(); }
    }, box);
  }

  /* copy and toast */
  let toastTimer;
  const toast = (msg) => { const t = $("[data-toast]"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800); };
  const copy = (text, msg) => {
    const fallback = () => { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), fallback); else fallback();
  };

  /* contents: mark the section in view */
  const links = {};
  let active = null;
  $$(".toc a[href^='#']").forEach((a) => { links[at(a, "href").slice(1)] = a; });
  const setActive = (id) => { if (id === active) return; if (links[active]) links[active].removeAttribute("aria-current"); active = id; if (links[id]) links[id].setAttribute("aria-current", "true"); };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); }), { rootMargin: "-10% 0px -75% 0px", threshold: 0 });
    $$(".section[id], .item[id]").forEach((t) => io.observe(t));
  }

  render();
  announce();

  /* embedded: keep the parent's frame as tall as the page */
  if (framed) {
    let lastHeight = -1;
    const postHeight = () => { const h = Math.ceil(document.body.getBoundingClientRect().height); if (h !== lastHeight) { lastHeight = h; tell({ type: "dossier:height", height: h }); } };
    if ("ResizeObserver" in window) new ResizeObserver(postHeight).observe(document.body);
    on("load", postHeight, window);
    postHeight();
  }
})();
