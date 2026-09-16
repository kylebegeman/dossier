(function () {
  "use strict";
  /* reply writes the one line a reader sends back. It must match the Go reply
     line exactly: testdata/replies.json holds both to the same cases. */
  function reply(c, s) {
    var num = {}, can = {}, total = 0, open = 0;
    c.items.forEach(function (it) { num[it.id] = it.n; can[it.id] = it.eligible; total++; if (it.eligible) open++; });
    var nums = function (ids) { var seen = {}; return ids.map(function (id) { return num[id]; }).filter(function (n) { return n && !seen[n] && (seen[n] = 1); }).sort(function (a, b) { return a - b; }); };
    var groups = [], v = s.verdicts || {};
    if (c.mode === "pick") {
      var p = nums(s.picked || []);
      if (p.length) groups.push(p.length === total ? "all" : p.join(", "));
    } else if (c.mode === "verdict") {
      c.verdicts.forEach(function (id) {
        var n = nums(Object.keys(v).filter(function (k) { return v[k] === id && can[k]; }));
        if (n.length) groups.push(id + " " + (n.length === open ? "all" : n.join(", ")));
      });
    }
    var body = groups.join("; "), line = (s.path && body ? s.path + ", " + body : s.path || body || "nothing") + ".";
    var notes = s.notes || {}, noted = Object.keys(notes).filter(function (id) { return num[id] && String(notes[id]).trim(); }).sort(function (a, b) { return num[a] - num[b]; });
    if (noted.length) line += " Notes: " + noted.map(function (id) { return num[id] + ": " + notes[id].trim().split(/\s+/).join(" "); }).join("; ") + ".";
    return line;
  }
  if (typeof document === "undefined") { if (typeof module === "object") module.exports = { reply: reply }; return; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var model = {};
  try { model = JSON.parse($("#dossier-model").textContent); } catch (e) {}
  var slug = (model.meta && model.meta.slug) || "dossier";
  function load(k) { try { return localStorage.getItem("dossier:" + slug + ":" + k); } catch (e) { return null; } }
  function keep(k, v) { try { localStorage.setItem("dossier:" + slug + ":" + k, v); } catch (e) {} }

  /* theme: auto, light, dark */
  var themeBtn = $("[data-theme-toggle]"), modes = ["auto", "light", "dark"];
  function applyTheme(m) {
    if (modes.indexOf(m) < 0) m = "auto";
    if (m === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", m);
    if (themeBtn) {
      themeBtn.setAttribute("data-mode", m);
      themeBtn.setAttribute("aria-label", "Theme: " + m + (m === "auto" ? ", follows your system" : ""));
      $(".th-label", themeBtn).textContent = m[0].toUpperCase() + m.slice(1);
      $$("svg", themeBtn).forEach(function (s) { s.hidden = !s.classList.contains("th-" + m); });
    }
    keep("theme", m);
  }
  applyTheme(load("theme") || "auto");
  if (themeBtn) themeBtn.addEventListener("click", function () { applyTheme(modes[(modes.indexOf(themeBtn.getAttribute("data-mode")) + 1) % 3]); });

  /* decisions: the embedded model is the baseline, this device may go further */
  var pickBlock = $("#pick"), mode = pickBlock ? pickBlock.getAttribute("data-mode") : "none";
  var defs = [];
  try { defs = JSON.parse(pickBlock.getAttribute("data-verdicts")) || []; } catch (e) {}
  var tone = {}, label = {};
  defs.forEach(function (d) { tone[d.id] = d.tone; label[d.id] = d.label; });
  var items = $$("[data-item][data-num]"), num = {}, can = {};
  var ctx = { mode: mode, verdicts: defs.map(function (d) { return d.id; }), items: [] };
  items.forEach(function (el) {
    var id = el.getAttribute("data-item");
    num[id] = +el.getAttribute("data-num");
    can[id] = el.hasAttribute("data-decides");
    ctx.items.push({ id: id, n: num[id], eligible: can[id] });
  });
  var choices = $$("input[data-choice]");
  function keys(o) { return Object.keys(o); }
  function clean(s) {
    var out = { path: "", picked: [], verdicts: {}, notes: {} };
    if (!s || typeof s !== "object") return out;
    if (choices.some(function (r) { return r.value === s.path; })) out.path = s.path;
    if (mode === "pick" && Array.isArray(s.picked)) out.picked = s.picked.filter(function (id, i, a) { return num[id] && a.indexOf(id) === i; });
    if (mode === "verdict" && s.verdicts && typeof s.verdicts === "object") keys(s.verdicts).forEach(function (id) { if (can[id] && label[s.verdicts[id]]) out.verdicts[id] = s.verdicts[id]; });
    if (s.notes && typeof s.notes === "object") keys(s.notes).forEach(function (id) { var v = s.notes[id]; if (num[id] && typeof v === "string" && v.trim()) out.notes[id] = v.trim(); });
    return out;
  }
  var state = clean(model.decisions);
  try { var saved = load("decisions"); if (saved) state = clean(JSON.parse(saved)); } catch (e) {}
  var framed = true;
  try { framed = window.parent !== window; } catch (e) {}
  function tell(msg) { if (framed) { msg.slug = slug; try { window.parent.postMessage(msg, "*"); } catch (e) {} } }
  function byNumber(ids) { return ids.slice().sort(function (a, b) { return num[a] - num[b]; }); }
  function detail() { return { path: state.path, picked: byNumber(state.picked), verdicts: state.verdicts, notes: state.notes, reply: reply(ctx, state) }; }
  function announce() {
    var d = detail();
    try { document.dispatchEvent(new CustomEvent("dossier:decisions", { detail: d })); } catch (e) {}
    tell({ type: "dossier:decisions", decisions: d });
  }
  function save() { keep("decisions", JSON.stringify(state)); announce(); render(); }
  function decided(id) { return mode === "pick" ? state.picked.indexOf(id) >= 0 : !!state.verdicts[id]; }
  function setPick(id, on) { if (on === decided(id)) return; state.picked = on ? state.picked.concat(id) : state.picked.filter(function (x) { return x !== id; }); save(); }
  function setVerdict(id, v) { if (!can[id] || (state.verdicts[id] || "") === v) return; if (v) state.verdicts[id] = v; else delete state.verdicts[id]; save(); }
  function setPath(p) { if (state.path !== p) { state.path = p; save(); } }
  function setNote(id, text) { var v = String(text || "").trim(); if ((state.notes[id] || "") === v) return; if (v) state.notes[id] = v; else delete state.notes[id]; save(); }
  function toneOf(el, v) { if (tone[v]) el.setAttribute("data-tone", tone[v]); else el.removeAttribute("data-tone"); }
  function render() {
    items.forEach(function (el) {
      var id = el.getAttribute("data-item"), v = state.verdicts[id] || "", on = decided(id);
      el.classList.toggle("picked", mode === "pick" && on);
      toneOf(el, v);
      $$("[data-verdict]", el).forEach(function (b, i) {
        var sel = b.getAttribute("data-verdict") === v;
        b.setAttribute("aria-checked", String(sel));
        b.tabIndex = (v ? sel : i === 0) ? 0 : -1;
      });
      var b = $("[data-pick]", el);
      if (b) { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Picked" : "Pick"; }
      var tr = $('tr[data-item="' + id + '"]');
      if (tr) {
        tr.classList.toggle("picked", mode === "pick" && on);
        toneOf(tr, v);
        var ctl = $("input,select", tr);
        if (ctl && ctl.type === "checkbox") ctl.checked = on; else if (ctl) ctl.value = v;
      }
      var li = $('.toc li[data-item="' + id + '"]');
      if (li) { li.classList.toggle("picked", mode === "pick" && on); toneOf(li, v); $(".sr", li).textContent = on ? ", " + (label[v] || "picked") : ""; }
      var note = $("[data-note-wrap]", el), ta = note && $("textarea", note), nb = $("[data-note-toggle]", el);
      if (ta && document.activeElement !== ta) ta.value = state.notes[id] || "";
      if (note && state.notes[id]) note.hidden = false;
      if (nb && note) nb.textContent = note.hidden ? (state.notes[id] ? "Edit note" : "Add a note") : "Hide note";
    });
    var chosen = "Open";
    choices.forEach(function (r) { r.checked = r.value === state.path; if (r.checked) chosen = r.getAttribute("data-label"); });
    $$("[data-choice-clear]").forEach(function (b) { b.hidden = !state.path; });
    $$('[data-live="choice"]').forEach(function (el) { el.textContent = chosen; });
    $$('[data-live="count"]').forEach(function (el) { el.textContent = String(mode === "pick" ? state.picked.length : keys(state.verdicts).length); });
    var empty = !state.path && !state.picked.length && !keys(state.verdicts).length && !keys(state.notes).length;
    $$("[data-reply]").forEach(function (el) { el.textContent = empty ? "Nothing decided yet." : reply(ctx, state); });
    applyHide();
  }
  function decisionsJSON() {
    var d = detail();
    return JSON.stringify({ schema: "dossier.decisions/v1", slug: slug, title: (model.meta && model.meta.title) || "", kind: model.kind, path: d.path || undefined, picked: d.picked, verdicts: keys(d.verdicts).length ? d.verdicts : undefined, notes: keys(d.notes).length ? d.notes : undefined, reply: d.reply }, null, 2);
  }
  var noteTimer;
  document.addEventListener("click", function (e) {
    var t = e.target, b = t.closest("[data-verdict]"), id;
    if (b) { e.preventDefault(); id = b.closest("[data-item]").getAttribute("data-item"); var v = b.getAttribute("data-verdict"); setVerdict(id, state.verdicts[id] === v && e.detail ? "" : v); return; }
    if ((b = t.closest("[data-pick]"))) { e.preventDefault(); id = b.closest("[data-item]").getAttribute("data-item"); setPick(id, !decided(id)); return; }
    if ((b = t.closest("[data-note-toggle]"))) {
      e.preventDefault();
      var d = b.closest("[data-item]"), wrap = $("[data-note-wrap]", d);
      if (wrap) { wrap.hidden = !wrap.hidden; if (!wrap.hidden) d.open = true; render(); if (!wrap.hidden) $("textarea", wrap).focus(); }
      return;
    }
    if (t.closest("[data-choice-clear]")) setPath("");
    else if (t.closest("[data-collapse-toggle]")) setAllOpen(!anyOpen());
    else if (t.closest("[data-copy-reply]")) copy(reply(ctx, state), "Reply copied");
    else if (t.closest("[data-copy-decisions]")) copy(decisionsJSON(), "Decisions copied as JSON");
    else if (t.closest("[data-hide]")) setHide(!hide);
    else if (t.closest("[data-show-all]")) setHide(false);
  });
  document.addEventListener("keydown", function (e) {
    var b = e.target.closest && e.target.closest("[data-verdict]");
    if (!b) return;
    var group = $$("[data-verdict]", b.parentNode), id = b.closest("[data-item]").getAttribute("data-item"), step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      var next = group[(group.indexOf(b) + step + group.length) % group.length];
      setVerdict(id, next.getAttribute("data-verdict"));
      next.focus();
    } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setVerdict(id, ""); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches("input[data-pick-row]")) setPick(t.getAttribute("data-pick-row"), t.checked);
    else if (t.matches("select[data-verdict-row]")) setVerdict(t.getAttribute("data-verdict-row"), t.value);
    else if (t.matches("input[data-choice]")) setPath(t.value);
  });
  document.addEventListener("input", function (e) { var t = e.target; if (t.matches("textarea[data-note]")) { clearTimeout(noteTimer); noteTimer = setTimeout(function () { setNote(t.getAttribute("data-note"), t.value); }, 300); } });
  document.addEventListener("focusout", function (e) { var t = e.target; if (t.matches && t.matches("textarea[data-note]")) { clearTimeout(noteTimer); setNote(t.getAttribute("data-note"), t.value); } });

  /* collapsing: remembered per item on this device */
  var details = $$("details.item[id]"), opened = {}, printing = false, beforePrint = null;
  try { (JSON.parse(load("open") || "[]") || []).forEach(function (id) { opened[id] = true; }); } catch (e) {}
  details.forEach(function (d) {
    if (opened[d.id]) d.open = true;
    d.addEventListener("toggle", function () {
      if (!printing) { if (d.open) opened[d.id] = true; else delete opened[d.id]; keep("open", JSON.stringify(keys(opened))); }
      renderCollapse();
    });
  });
  function anyOpen() { return details.some(function (d) { return d.open; }); }
  function setAllOpen(open) { details.forEach(function (d) { d.open = open; }); }
  function renderCollapse() { var b = $("[data-collapse-toggle]"); if (b) { var open = anyOpen(); b.textContent = open ? "Collapse all" : "Expand all"; b.setAttribute("aria-expanded", String(open)); } }
  window.addEventListener("beforeprint", function () { printing = true; beforePrint = details.map(function (d) { return d.open; }); setAllOpen(true); });
  window.addEventListener("afterprint", function () { if (beforePrint) details.forEach(function (d, i) { d.open = beforePrint[i]; }); beforePrint = null; setTimeout(function () { printing = false; }, 0); });
  function openHash() { var t = location.hash && document.getElementById(location.hash.slice(1)); if (t && t.tagName === "DETAILS") t.open = true; }
  openHash();
  window.addEventListener("hashchange", openHash);
  renderCollapse();

  /* hide decided: keep the list to what still needs a decision */
  var hide = load("hide") === "1";
  function applyHide() {
    details.forEach(function (d) { d.hidden = hide && d.hasAttribute("data-num") && (decided(d.id) || !can[d.id]); });
    $$("[data-hidden-row]").forEach(function (row) {
      var n = $$("details.item[hidden]", row.parentNode).length;
      row.hidden = !n;
      $("[data-hidden-count]", row).textContent = String(n);
    });
    var b = $("[data-hide]");
    if (b) { b.setAttribute("aria-pressed", String(hide)); b.textContent = hide ? "Showing undecided" : "Hide decided"; }
  }
  function setHide(on) { hide = !!on; keep("hide", hide ? "1" : "0"); applyHide(); }

  /* copy and toast */
  var toastTimer;
  function toast(msg) { var t = $("[data-toast]"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800); }
  function copy(text, msg) {
    var done = function () { toast(msg); };
    var fallback = function () { var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* contents: mark the section in view */
  var links = {}, active = null;
  $$(".toc a[href^='#']").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  function setActive(id) { if (id === active) return; if (links[active]) links[active].removeAttribute("aria-current"); active = id; if (links[id]) links[id].setAttribute("aria-current", "true"); }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); }); }, { rootMargin: "-10% 0px -75% 0px", threshold: 0 });
    $$(".section[id], .item[id]").forEach(function (t) { io.observe(t); });
  }

  render();
  announce();

  /* embedded: keep the parent's frame as tall as the page */
  if (framed) {
    var lastHeight = -1;
    var postHeight = function () { var h = Math.ceil(document.body.getBoundingClientRect().height); if (h !== lastHeight) { lastHeight = h; tell({ type: "dossier:height", height: h }); } };
    if ("ResizeObserver" in window) new ResizeObserver(postHeight).observe(document.body);
    window.addEventListener("load", postHeight);
    postHeight();
  }
})();
