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

  /* decisions: picks and notes, kept on this device */
  var items = $$("[data-item]");
  var numbers = {};
  items.forEach(function (el) { numbers[el.getAttribute("data-item")] = +el.getAttribute("data-num"); });
  var state = { path: null, picked: [], notes: {} };
  try { var raw = localStorage.getItem(key + ":decisions"); if (raw) { var s = JSON.parse(raw); if (s && Array.isArray(s.picked)) state = { path: s.path || null, picked: s.picked.filter(function (id) { return numbers[id]; }), notes: s.notes || {} }; } } catch (e) {}
  function save() { try { localStorage.setItem(key + ":decisions", JSON.stringify(state)); } catch (e) {} }
  function picked(id) { return state.picked.indexOf(id) >= 0; }
  function reply() {
    if (!state.picked.length) return "Nothing picked yet.";
    var nums = state.picked.map(function (id) { return numbers[id]; }).sort(function (a, b) { return a - b; });
    return (nums.length === items.length ? "all" : nums.join(", ")) + ".";
  }
  function render() {
    items.forEach(function (el) {
      var id = el.getAttribute("data-item"), on = picked(id);
      el.classList.toggle("picked", on);
      var b = $("[data-pick]", el); if (b) { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Picked" : "Pick"; }
      var cb = $('input[data-pick-row="' + id + '"]'); if (cb) { cb.checked = on; var tr = cb.closest("tr"); if (tr) tr.classList.toggle("picked", on); }
      var li = $('.toc li[data-item="' + id + '"]'); if (li) li.classList.toggle("picked", on);
    });
    var t = reply();
    $$("[data-reply]").forEach(function (el) { el.textContent = t; });
    $$("[data-pick-count]").forEach(function (el) { el.textContent = String(state.picked.length); });
  }
  function toggle(id, on) { var has = picked(id); if (on === has) return; if (on) state.picked.push(id); else state.picked = state.picked.filter(function (x) { return x !== id; }); save(); render(); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick]");
    if (b) { var id = b.closest("[data-item]").getAttribute("data-item"); toggle(id, !picked(id)); return; }
    var c = e.target.closest("[data-copy-reply]");
    if (c) copy(reply(), "Reply copied");
  });
  document.addEventListener("change", function (e) { var t = e.target; if (t.matches && t.matches("input[data-pick-row]")) toggle(t.getAttribute("data-pick-row"), t.checked); });

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
