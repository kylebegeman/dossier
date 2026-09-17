/* Dossier studio. Injected by dossier serve before the reader runtime; never
   part of an artifact. The server is the authority: this island sends edits
   and the reader's decisions, and reloads when the server says the page
   changed. */
(() => {
  "use strict";
  const cfgNode = document.getElementById("dossier-studio");
  if (!cfgNode) return;
  let cfg;
  try { cfg = JSON.parse(cfgNode.textContent); } catch (e) { return; }
  const root = document.documentElement;
  const client = Math.random().toString(36).slice(2, 12);
  const findings = (cfg.findings || []).length > 0 || !!cfg.error;
  const recall = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const remember = (k, v) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} };

  // The store is the authority for decisions: the reader starts from the
  // model the server rendered, not from this browser's saved copy.
  try {
    const island = document.getElementById("dossier-model");
    const slug = island ? (JSON.parse(island.textContent).meta || {}).slug : "";
    if (slug) localStorage.removeItem("dossier:" + slug + ":decisions");
  } catch (e) {}

  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids) if (kid != null && kid !== false) n.append(kid);
    return n;
  };
  const drafts = (n) => n + (n === 1 ? " draft" : " drafts");
  const button = (label, onclick, attrs) => h("button", Object.assign({ class: "btn", type: "button", onclick }, attrs), label);

  async function api(method, path, body, text) {
    const headers = { "X-Dossier-Token": cfg.token, "X-Dossier-Client": client };
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = text ? "text/plain; charset=utf-8" : "application/json";
      init.body = text ? body : JSON.stringify(body);
    }
    try {
      const res = await fetch(path, init);
      const raw = await res.text();
      let data = raw;
      if ((res.headers.get("Content-Type") || "").startsWith("application/json")) {
        try { data = JSON.parse(raw); } catch (e) { data = { error: raw }; }
      } else if (!res.ok) data = { error: raw.trim() };
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: "The studio server is not reachable." } };
    }
  }

  let toastNode = document.querySelector("[data-toast]");
  function toast(message) {
    if (!toastNode) { toastNode = h("div", { class: "toast", role: "status", "aria-live": "polite", "data-toast": true }); document.body.append(toastNode); }
    toastNode.textContent = message;
    toastNode.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastNode.classList.remove("show"), 2600);
  }

  function problemsList(data) {
    const list = h("ol", { class: "studio-problems" });
    for (const p of (data && data.findings) || []) list.append(h("li", null, h("code", null, String(p.path).replace(/^.*#/, "")), " ", p.message));
    return list.childElementCount ? list : null;
  }

  /* reloads keep the reader's place, and wait while something is being edited */
  let busy = false, pending = false;
  function reload() {
    if (busy) { pending = true; setStatus("changed", "Changed on disk; reloads when you finish"); return; }
    remember("dossier-studio:scroll", String(window.scrollY));
    location.reload();
  }
  function settle() { busy = false; if (pending) reload(); }
  document.addEventListener("DOMContentLoaded", () => {
    const y = recall("dossier-studio:scroll");
    if (y !== null) { remember("dossier-studio:scroll", null); window.scrollTo({ top: +y, behavior: "instant" }); }
  });

  /* the toolbar */
  const status = h("span", { class: "studio-status", "data-state": "connecting" }, h("i"), h("span", null, "Connecting"));
  function setStatus(state, text) { status.setAttribute("data-state", state); status.lastChild.textContent = text; }
  const draftCount = (cfg.drafts || []).length + (cfg.conflicts || []).length;
  const bar = h("div", { class: "studio-bar", role: "toolbar", "aria-label": "Dossier studio" }, status, h("span", { class: "sep" }));
  let editBtn = null;
  if (findings) {
    bar.append(h("span", { class: "studio-note" }, "Model does not validate"), button("Model JSON", openModel));
  } else {
    editBtn = button("Edit", () => setEditing(!editing), { "aria-pressed": "false", disabled: cfg.upgraded, title: cfg.upgraded ? "A 0.6 document: run dossier upgrade to edit it" : "Click any outlined text to edit it" });
    const noun = draftCount === 1 ? "draft" : "drafts";
    bar.append(
      editBtn,
      button(draftCount ? "Save " + draftCount + " " + noun : "No drafts", commit, { disabled: !draftCount, title: "Write the drafts into the model file" }),
      button("Discard", discard, { disabled: !draftCount }),
      h("span", { class: "sep" }),
      cfg.decides && button("Write decisions", applyDecisions, { disabled: cfg.upgraded, title: "Write the stored decisions into the model file" }),
      cfg.decides && button("Import reply", openImport, { title: "Paste a reply line or a decisions document" }),
      button("Model JSON", openModel),
      accentControl()
    );
    const warned = (cfg.warnings || []).length;
    if (warned) bar.append(button(warned + (warned === 1 ? " warning" : " warnings"), () => report("Warnings", { findings: cfg.warnings }), { class: "btn studio-warned" }));
    if (cfg.upgraded) bar.append(h("span", { class: "studio-note", title: "dossier upgrade " + cfg.model }, "0.6 document: upgrade to edit"));
    if ((cfg.conflicts || []).length) bar.append(h("span", { class: "studio-note" }, drafts(cfg.conflicts.length) + (cfg.conflicts.length === 1 ? " conflicts" : " conflict") + " with the file"));
  }
  document.body.append(bar);

  /* live reload: the server says when to look again */
  let lost = false;
  const events = new EventSource("/_/events");
  events.onopen = () => { if (lost) { reload(); return; } setStatus("live", "Live"); };
  events.onerror = () => { lost = true; setStatus("reconnecting", "Reconnecting"); };
  events.addEventListener("reload", reload);
  events.addEventListener("decisions", (e) => { if (e.data !== client) reload(); });
  events.addEventListener("settings", (e) => { if (e.data !== client) reload(); });

  /* decisions: the reader announces every change; the store keeps it */
  let lastSent = null, sendTimer = 0;
  document.addEventListener("dossier:decisions", (e) => {
    const d = e.detail || {};
    const state = { path: d.path || "", picked: d.picked || [], verdicts: d.verdicts || {}, notes: d.notes || {} };
    const json = JSON.stringify(state);
    if (lastSent === null) { lastSent = json; return; }
    if (json === lastSent) return;
    clearTimeout(sendTimer);
    sendTimer = setTimeout(async () => {
      const res = await api("PUT", "/_/decisions", state);
      if (res.ok) { lastSent = json; setStatus("live", "Decisions saved"); }
      else setStatus("error", (res.data && res.data.error) || "Decisions not saved");
    }, 300);
  });

  async function applyDecisions() {
    const res = await api("POST", "/_/decisions/apply");
    if (res.ok) toast("Decisions written: " + (res.data.reply || "nothing decided"));
    else report("Decisions not written", res.data);
  }

  /* import: a reply line or decisions document someone sent back */
  function openImport() {
    const area = h("textarea", { class: "studio-input", rows: 4, spellcheck: "false", "aria-label": "Reply or decisions document", placeholder: "speed, 1, 3. Notes: 3: keep it small." });
    const foot = h("footer", { role: "status", "aria-live": "polite" }, "Paste the line the reader sent, or a decisions document. It replaces the stored decisions.");
    const dialog = h("dialog", { class: "studio-dialog studio-small", "aria-label": "Import a reply" },
      h("div", null,
        h("header", null, h("b", null, "Import a reply"), button("Import", submit), button("Close", () => close())),
        h("div", { class: "studio-pad" }, area), foot));
    async function submit() {
      const r = await api("POST", "/_/decisions/import", area.value, true);
      if (r.ok) { close(); toast("Imported: " + (r.data.reply || "")); return; }
      foot.replaceChildren(h("span", null, (r.data && r.data.error) || "Not imported"), problemsList(r.data) || "");
    }
    area.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
    const close = modal(dialog);
    area.focus();
  }

  // modal shows a dialog and holds reloads until it closes. Closing from the
  // studio settles at once rather than waiting for the close event, which a
  // browser may hold back while the tab is in the background; Esc still
  // closes through the event.
  function modal(dialog, cleanup) {
    let done = false;
    const finish = () => { if (done) return; done = true; if (cleanup) cleanup(); dialog.remove(); settle(); };
    dialog.addEventListener("close", finish);
    document.body.append(dialog);
    busy = true;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); finish(); };
  }

  /* drafts */
  for (const t of cfg.drafts || []) document.querySelectorAll('[data-edit="' + CSS.escape(t) + '"]').forEach((n) => n.classList.add("studio-drafted"));
  for (const t of cfg.conflicts || []) document.querySelectorAll('[data-edit="' + CSS.escape(t) + '"]').forEach((n) => n.classList.add("studio-conflict"));
  for (const id of cfg.orders || []) { const s = document.getElementById(id); if (s) s.classList.add("studio-reordered"); }
  for (const id of cfg.reshaped || []) { const s = document.getElementById(id); if (s) s.classList.add("studio-reshaped"); }

  async function commit() {
    const res = await api("POST", "/_/drafts/commit");
    if (!res.ok) { report("Drafts not saved", res.data); return; }
    const c = (res.data.conflicts || []).length;
    toast(c ? "Saved; " + drafts(c) + (c === 1 ? " conflicts with the file and was kept" : " conflict with the file and were kept") : "Drafts written to the model");
  }
  async function discard() {
    if (!window.confirm("Discard " + drafts(draftCount) + "? The model file is not touched.")) return;
    const res = await api("POST", "/_/drafts/discard");
    if (!res.ok) report("Drafts not discarded", res.data);
  }

  /* edit mode: click outlined text to edit it in place */
  let editing = false;
  function setEditing(on) {
    editing = !!on && !cfg.upgraded && !findings;
    root.classList.toggle("studio-editing", editing);
    if (editBtn) { editBtn.setAttribute("aria-pressed", String(editing)); editBtn.textContent = editing ? "Done editing" : "Edit"; }
    remember("dossier-studio:editing", editing ? "1" : null);
    decorate();
  }
  document.addEventListener("click", (e) => {
    if (!editing) return;
    const node = e.target.closest("[data-edit]");
    if (!node || e.target.closest(".studio-editor, .studio-bar, .studio-move, a[href], button, input, textarea, select")) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(node);
  }, true);

  let closeOpen = null;
  async function openEditor(node) {
    if (closeOpen) closeOpen();
    const target = node.getAttribute("data-edit");
    const res = await api("GET", "/_/field?target=" + encodeURIComponent(target));
    if (!res.ok) { toast((res.data && res.data.error) || "This field cannot be edited"); return; }
    const multiline = !!res.data.multiline;
    const input = multiline ? h("textarea", { class: "studio-input", spellcheck: "true" }) : h("input", { class: "studio-input", type: "text" });
    input.value = res.data.value || "";
    if (multiline) input.rows = Math.min(18, Math.max(5, input.value.split("\n").length + 1));
    const out = h("div");
    const save = button("Save draft", submit);
    const box = h("div", { class: "studio-editor" }, input, h("div", { class: "studio-row" }, save, button("Cancel", close),
      h("span", { class: "studio-hint" }, (multiline ? "Markdown. Cmd or Ctrl+Enter saves" : "Enter saves") + ", Esc cancels")), out);
    // Headings and summaries sit inside an item's summary element; the editor
    // goes below it so typing never toggles the item.
    const head = node.closest("summary");
    const anchor = head || node;
    if (head && head.parentElement.tagName === "DETAILS") head.parentElement.open = true;
    if (!head) node.hidden = true;
    anchor.after(box);
    box.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      else if (multiline && e.key === "Tab") { e.preventDefault(); input.setRangeText("  ", input.selectionStart, input.selectionEnd, "end"); }
    });
    busy = true;
    input.focus();
    closeOpen = close;
    function close() { box.remove(); node.hidden = false; closeOpen = null; settle(); }
    async function submit() {
      save.disabled = true;
      const r = await api("PUT", "/_/drafts", { target, value: input.value });
      if (r.ok) { close(); setStatus("live", r.data.reverted ? "Draft removed" : "Draft saved"); return; }
      save.disabled = false;
      out.replaceChildren(h("p", { class: "studio-note" }, (r.data && r.data.error) || "Not saved"), problemsList(r.data) || "");
    }
  }

  /* reorder: move buttons on every item while editing */
  function decorate() {
    document.querySelectorAll(".studio-move").forEach((n) => n.remove());
    if (!editing) return;
    const place = (item, host) => {
      const id = item.id;
      host.append(h("span", { class: "studio-move" },
        button("↑", (e) => { e.preventDefault(); move(id, "up"); }, { "aria-label": "Move up", title: "Move up" }),
        button("↓", (e) => { e.preventDefault(); move(id, "down"); }, { "aria-label": "Move down", title: "Move down" })));
    };
    document.querySelectorAll("details.item[id]").forEach((d) => { const meta = d.querySelector(".item-meta"); if (meta) place(d, meta); facetControls(d); });
    document.querySelectorAll(".rows > details.row[id]").forEach((d) => place(d, d.querySelector("summary")));
    document.querySelectorAll(".rows > div[id]").forEach((d) => place(d, d));
  }

  /* facets: remove an optional one, or add one the kind has, as drafts */
  const vocabulary = cfg.vocabulary || [];
  function facetControls(item) {
    const list = item.querySelector(".item-body > dl.facets");
    if (!list || !vocabulary.length) return;
    const present = new Set();
    list.querySelectorAll(":scope > .facet > dd[data-edit]").forEach((dd) => {
      const slug = dd.getAttribute("data-edit").split("/")[4];
      present.add(slug);
      const word = vocabulary.find((w) => w.slug === slug);
      if (word && !word.required) {
        dd.previousElementSibling.append(h("span", { class: "studio-move" }, button("Remove", () => editFacet(item.id, word.label, true), { class: "link-btn", title: "Remove " + word.label + " as a draft" })));
      }
    });
    const missing = vocabulary.filter((w) => !present.has(w.slug));
    if (!missing.length) return;
    const select = h("select", { class: "studio-add", "aria-label": "Add a facet" }, h("option", { value: "" }, "Add a facet"),
      ...missing.map((w) => h("option", { value: w.label, title: w.hint }, w.label + (w.required ? " (required)" : ""))));
    select.addEventListener("change", () => { if (select.value) editFacet(item.id, select.value, false); });
    list.after(h("div", { class: "studio-move studio-facets" }, select, h("span", { class: "studio-hint" }, "New facets start from the kind's hint")));
  }
  async function editFacet(item, label, remove) {
    const res = await api("POST", "/_/facets", { item, label, remove });
    if (!res.ok) { report(remove ? "Facet not removed" : "Facet not added", res.data); return; }
    if (!remove) remember("dossier-studio:open", res.data.target);
    setStatus("live", remove ? "Facet removed as a draft" : "Facet added as a draft");
  }
  window.addEventListener("load", () => {
    const target = recall("dossier-studio:open");
    if (!target) return;
    remember("dossier-studio:open", null);
    const node = document.querySelector('[data-edit="' + CSS.escape(target) + '"]');
    if (node) { const d = node.closest("details"); if (d) d.open = true; node.scrollIntoView({ block: "center" }); openEditor(node); }
  });
  async function move(item, direction) {
    const res = await api("POST", "/_/move", { item, direction });
    if (!res.ok) toast((res.data && res.data.error) || "Not moved");
  }
  if (recall("dossier-studio:editing") === "1") setEditing(true);

  /* the model as JSON, validated by the server before it is written. The
     CodeMirror editor loads on first use; a plain textarea stands in when it
     cannot. */
  let editorLoad = null;
  function loadEditor() {
    if (window.DossierEditor) return Promise.resolve(window.DossierEditor);
    if (!editorLoad) {
      editorLoad = new Promise((resolve) => {
        const script = h("script", { src: "/_/vendor/codemirror.js?v=" + cfg.editor });
        script.onload = () => resolve(window.DossierEditor || null);
        script.onerror = () => { editorLoad = null; resolve(null); };
        document.head.append(script);
      });
    }
    return editorLoad;
  }
  async function openModel() {
    const res = await api("GET", "/_/model");
    if (!res.ok) { report("Cannot read the model", res.data); return; }
    const text = typeof res.data === "string" ? res.data : "";
    const host = h("div", { class: "studio-code" });
    const foot = h("footer", { role: "status", "aria-live": "polite" }, "Validate checks the text; Save writes the file only when it validates. Cmd or Ctrl+S saves.");
    const dialog = h("dialog", { class: "studio-dialog", "aria-label": "Model JSON" },
      h("div", null,
        h("header", null, h("b", { title: cfg.model }, cfg.model.split(/[\\/]/).pop()), button("Validate", validate), button("Save", save), button("Close", () => close())),
        host, foot));
    let editor = null;
    const area = h("textarea", { spellcheck: "false", "aria-label": "Model JSON" });
    const value = () => (editor ? editor.value : area.value);
    function show(title, data, good) {
      foot.className = good ? "ok" : "";
      const warnings = ((data && data.warnings) || []).length;
      foot.replaceChildren(h("span", null, title + (warnings ? " (" + warnings + " warning" + (warnings === 1 ? "" : "s") + ")" : "")), problemsList(data) || "");
      if (editor) editor.showFindings((data && data.findings) || []);
    }
    async function validate() {
      const r = await api("POST", "/_/validate", value(), true);
      if (r.data && r.data.outcome === "ok") show("Valid", r.data, true);
      else show((r.data && r.data.error) || "The model has findings", r.data, false);
    }
    async function save() {
      const r = await api("PUT", "/_/model", value(), true);
      if (r.ok) { close(); toast("Model saved"); }
      else show((r.data && r.data.error) || "Not saved", r.data, false);
    }
    const close = modal(dialog, () => { if (editor) editor.destroy(); });
    const lib = await loadEditor();
    if (lib && dialog.open) {
      editor = lib.create(host, text, { onSave: save });
      editor.focus();
      return;
    }
    area.value = text;
    area.addEventListener("keydown", (e) => {
      if (e.key === "Tab") { e.preventDefault(); area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end"); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    });
    host.append(area);
    area.focus();
  }

  function report(title, data) {
    const dialog = h("dialog", { class: "studio-dialog", style: "height:auto;max-height:70vh", "aria-label": title },
      h("div", { style: "grid-template-rows:auto auto" },
        h("header", null, h("b", null, title), button("Close", () => close())),
        h("footer", null, h("span", null, (data && data.error) || ""), problemsList(data) || "")));
    const close = modal(dialog);
  }

  /* accent: preview a brand color with the palette an artifact would derive
     from it, then keep it in the model as a draft */
  function accentControl() {
    const style = document.getElementById("studio-accent");
    const current = () => { const v = getComputedStyle(root).getPropertyValue("--accent").trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : "#c81e4a"; };
    const input = h("input", { type: "color", "aria-label": "Preview an accent color", value: cfg.accent || cfg.modelAccent || current() });
    const reset = h("button", { class: "link-btn", type: "button", hidden: !cfg.accent }, "Reset");
    const keep = h("button", { class: "link-btn", type: "button", hidden: !cfg.accent, title: "Draft this accent into meta.theme.accent" }, "Keep in model");
    let timer = 0;
    // Paint the accent at once, then the derived palette when the server sends it.
    const paint = (hex) => { if (style) style.textContent = hex ? ":root:root{--accent:" + hex + "}" : ""; };
    const send = (hex) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const r = await api("PUT", "/_/settings", { accent: hex });
        if (!r.ok) { toast((r.data && r.data.error) || "Accent not saved"); return; }
        if (style && hex === input.value) style.textContent = r.data.css || "";
        if ((r.data.warnings || []).length) setStatus("changed", r.data.warnings[0]);
      }, 200);
    };
    input.addEventListener("input", () => { paint(input.value); reset.hidden = keep.hidden = false; send(input.value); });
    reset.addEventListener("click", () => { paint(""); reset.hidden = keep.hidden = true; send(""); input.value = cfg.modelAccent || current(); });
    keep.addEventListener("click", async () => {
      const r = await api("PUT", "/_/drafts", { target: "/meta/theme/accent", value: input.value });
      if (!r.ok) { report("Accent not kept", r.data); return; }
      await api("PUT", "/_/settings", { accent: "" });
      toast("Accent drafted into the model; Save writes it");
    });
    return h("label", { class: "studio-accent", title: "Preview an accent in both themes" }, "Accent", input, keep, reset);
  }
})();
