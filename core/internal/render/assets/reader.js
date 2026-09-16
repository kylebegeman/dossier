(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var modelNode = $("#dossier-model");
  var model = {};
  try { model = JSON.parse(modelNode ? modelNode.textContent : "{}"); } catch (e) {}
  var slug = (model.meta && model.meta.slug) || "dossier";
  var key = "dossier:" + slug;

  /* theme: auto, light, dark */
  var themeBtn = $("[data-theme-toggle]");
  var modes = ["auto", "light", "dark"], labels = { auto: "Auto", light: "Light", dark: "Dark" };
  function applyTheme(m) {
    if (modes.indexOf(m) < 0) m = "auto";
    if (m === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", m);
    if (themeBtn) {
      themeBtn.setAttribute("data-mode", m);
      themeBtn.setAttribute("aria-label", "Theme: " + m + (m === "auto" ? ", follows your system" : ""));
      var lbl = $(".th-label", themeBtn); if (lbl) lbl.textContent = labels[m];
      $$("svg", themeBtn).forEach(function (s) { s.hidden = !s.classList.contains("th-" + m); });
    }
    try { localStorage.setItem(key + ":theme", m); } catch (e) {}
  }
  var savedTheme = "auto";
  try { savedTheme = localStorage.getItem(key + ":theme") || "auto"; } catch (e) {}
  applyTheme(savedTheme);
  if (themeBtn) themeBtn.addEventListener("click", function () { applyTheme(modes[(modes.indexOf(themeBtn.getAttribute("data-mode")) + 1) % modes.length]); });

  /* decisions: the embedded model is the baseline, this device may go further */
  var items = $$("[data-item][data-num]");
  var numbers = {}, titles = {};
  items.forEach(function (el) { numbers[el.getAttribute("data-item")] = +el.getAttribute("data-num"); titles[el.getAttribute("data-item")] = el.getAttribute("data-title") || ""; });
  var TOTAL = items.length;
  function clean(s) {
    var out = { path: "", picked: [], notes: {} };
    if (!s || typeof s !== "object") return out;
    if (typeof s.path === "string") out.path = s.path;
    if (Array.isArray(s.picked)) out.picked = s.picked.filter(function (id, i, a) { return numbers[id] && a.indexOf(id) === i; });
    if (s.notes && typeof s.notes === "object") Object.keys(s.notes).forEach(function (id) { var v = s.notes[id]; if (numbers[id] && typeof v === "string" && v.trim()) out.notes[id] = v.trim(); });
    return out;
  }
  var state = clean(model.decisions);
  try { var raw = localStorage.getItem(key + ":decisions"); if (raw) state = clean(JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem(key + ":decisions", JSON.stringify(state)); } catch (e) {} }
  function picked(id) { return state.picked.indexOf(id) >= 0; }
  function byNumber(ids) { return ids.slice().sort(function (a, b) { return numbers[a] - numbers[b]; }); }
  function replyLine() {
    var nums = byNumber(state.picked).map(function (id) { return numbers[id]; });
    var line = (state.path ? state.path + ", " : "") + (nums.length === 0 ? "nothing" : (nums.length === TOTAL ? "all" : nums.join(", "))) + ".";
    var noted = byNumber(Object.keys(state.notes));
    if (noted.length) line += " Notes: " + noted.map(function (id) { return numbers[id] + ": " + state.notes[id].replace(/\s+/g, " "); }).join("; ") + ".";
    return line;
  }
  function decisionsJSON() {
    return JSON.stringify({ schema: "dossier.decisions/v1", slug: slug, title: (model.meta && model.meta.title) || "", path: state.path || undefined, picked: byNumber(state.picked), notes: Object.keys(state.notes).length ? state.notes : undefined, reply: replyLine() }, null, 2);
  }
  function render() {
    items.forEach(function (el) {
      var id = el.getAttribute("data-item"), on = picked(id);
      el.classList.toggle("picked", on);
      var b = $("[data-pick]", el); if (b) { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Picked" : "Pick"; }
      var cb = $('input[data-pick-row="' + id + '"]'); if (cb) { cb.checked = on; var tr = cb.closest("tr"); if (tr) tr.classList.toggle("picked", on); }
      var li = $('.toc li[data-item="' + id + '"]'); if (li) li.classList.toggle("picked", on);
      var note = $("[data-note-wrap]", el), ta = note && $("textarea", note), nb = $("[data-note-toggle]", el);
      if (ta && document.activeElement !== ta) ta.value = state.notes[id] || "";
      if (note && state.notes[id]) note.hidden = false;
      if (nb && note) nb.textContent = note.hidden ? (state.notes[id] ? "Edit note" : "Add a note") : "Hide note";
    });
    var empty = !state.picked.length && !state.path && !Object.keys(state.notes).length;
    var t = empty ? "Nothing picked yet." : replyLine();
    $$("[data-reply]").forEach(function (el) { el.textContent = t; });
    $$("[data-pick-count]").forEach(function (el) { el.textContent = String(state.picked.length); });
  }
  function toggle(id, on) { if (on === picked(id)) return; if (on) state.picked.push(id); else state.picked = state.picked.filter(function (x) { return x !== id; }); state.picked = byNumber(state.picked); save(); render(); }
  function setNote(id, text) { var v = String(text || "").trim(); if ((state.notes[id] || "") === v) return; if (v) state.notes[id] = v; else delete state.notes[id]; save(); render(); }
  var noteTimer;
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick]");
    if (b) { e.preventDefault(); var id = b.closest("[data-item]").getAttribute("data-item"); toggle(id, !picked(id)); return; }
    var n = e.target.closest("[data-note-toggle]");
    if (n) { e.preventDefault(); var d = n.closest("[data-item]"); var wrap = $("[data-note-wrap]", d); if (wrap) { wrap.hidden = !wrap.hidden; if (!wrap.hidden && d.tagName === "DETAILS") d.open = true; render(); if (!wrap.hidden) $("textarea", wrap).focus(); } return; }
    var c = e.target.closest("[data-collapse-toggle]");
    if (c) { setAllOpen(!anyOpen()); return; }
    if (e.target.closest("[data-copy-reply]")) { copy(replyLine(), "Reply copied"); return; }
    if (e.target.closest("[data-copy-decisions]")) copy(decisionsJSON(), "Decisions copied as JSON");
  });
  document.addEventListener("change", function (e) { var t = e.target; if (t.matches && t.matches("input[data-pick-row]")) toggle(t.getAttribute("data-pick-row"), t.checked); });
  document.addEventListener("input", function (e) { var t = e.target; if (t.matches && t.matches("textarea[data-note]")) { clearTimeout(noteTimer); noteTimer = setTimeout(function () { setNote(t.getAttribute("data-note"), t.value); }, 300); } });
  document.addEventListener("focusout", function (e) { var t = e.target; if (t.matches && t.matches("textarea[data-note]")) { clearTimeout(noteTimer); setNote(t.getAttribute("data-note"), t.value); } });

  /* collapsing: remembered per item on this device */
  var details = $$("details.item[id]");
  var closed = {};
  try { (JSON.parse(localStorage.getItem(key + ":closed") || "[]") || []).forEach(function (id) { closed[id] = true; }); } catch (e) {}
  var printing = false, beforePrint = null;
  details.forEach(function (d) {
    if (closed[d.id]) d.open = false;
    d.addEventListener("toggle", function () { if (!printing) { if (d.open) delete closed[d.id]; else closed[d.id] = true; try { localStorage.setItem(key + ":closed", JSON.stringify(Object.keys(closed))); } catch (e) {} } renderCollapse(); });
  });
  function anyOpen() { return details.some(function (d) { return d.open; }); }
  function setAllOpen(open) { details.forEach(function (d) { d.open = open; }); }
  function renderCollapse() { var b = $("[data-collapse-toggle]"); if (!b) return; var open = anyOpen(); b.textContent = open ? "Collapse all" : "Expand all"; b.setAttribute("aria-expanded", String(open)); }
  window.addEventListener("beforeprint", function () { printing = true; beforePrint = details.map(function (d) { return d.open; }); details.forEach(function (d) { d.open = true; }); });
  window.addEventListener("afterprint", function () { if (beforePrint) details.forEach(function (d, i) { d.open = beforePrint[i]; }); beforePrint = null; setTimeout(function () { printing = false; }, 0); });
  if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target && target.tagName === "DETAILS") target.open = true; }
  window.addEventListener("hashchange", function () { var t = document.getElementById(location.hash.slice(1)); if (t && t.tagName === "DETAILS") t.open = true; });
  renderCollapse();

  /* copy and toast */
  var toastTimer;
  function toast(msg) { var t = $("[data-toast]"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800); }
  function copy(text, msg) {
    var done = function () { toast(msg || "Copied"); };
    var fallback = function () { var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* contents: mark the section in view */
  var links = {};
  $$(".toc a[href^='#']").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var active = null;
  function setActive(id) { if (id === active) return; if (active && links[active]) links[active].removeAttribute("aria-current"); active = id; if (links[id]) links[id].setAttribute("aria-current", "true"); }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); }); }, { rootMargin: "-10% 0px -75% 0px", threshold: 0 });
    $$(".section[id], .item[id]").forEach(function (t) { io.observe(t); });
  }

  render();
})();
