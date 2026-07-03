// Dossier generator: JSON document model -> self-contained HTML (+ Markdown).
// Zero dependencies. The visible HTML is a projection of the embedded #dossier-model island.

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";

// Neutralize dangerous href schemes (javascript:, data:, vbscript:) before they
// reach an anchor; http(s)/mailto/relative links pass through unchanged.
const safeUrl = (u) => {
  const s = String(u == null ? "" : u).trim();
  return /^(javascript|data|vbscript):/i.test(s.replace(/[\s\x00-\x1f]+/g, "")) ? "#" : s;
};

// Minimal inline Markdown: **bold**, `code`, [text](url), [[slug]] cross-links,
// and [[Term]] glossary tooltips (resolved against the collected glossary map).
function inlineMd(s, ctx) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[\^([a-z0-9-]+)\]/g, (m, id) => {
    const fn = ctx.footnotes && ctx.footnotes.get(id);
    return fn ? `<sup class="ds-fnref"><a id="fnref-${esc(id)}" href="#fn-${esc(id)}">${fn.num}</a></sup>` : m;
  });
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, ref) => {
    const key = ref.trim().toLowerCase();
    if (ctx.glossary && ctx.glossary.has(key)) {
      return `<span class="ds-term" tabindex="0" title="${esc(ctx.glossary.get(key))}">${esc(ref)}</span>`;
    }
    const slug = slugify(ref);
    const href = ctx.baseUrl ? ctx.baseUrl.replace(/\/$/, "") + "/" + slug + ".html" : slug + ".html";
    return `<a class="ds-xlink" data-slug="${esc(slug)}" href="${esc(href)}">${esc(ref)}</a>`;
  });
  return t;
}

function richTextHtml(s, ctx) {
  const lines = String(s || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMd(paragraph.join(" "), ctx)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type} class="ds-prose-list">${list.items.map((item) => `<li>${inlineMd(item, ctx)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return out.join("");
}

function statDeltaHtml(stat, ctx) {
  const delta = stat && stat.delta;
  if (!delta) return "";
  const value = typeof delta === "object" ? delta.value || delta.label || "" : delta;
  const label = typeof delta === "object" && delta.label && delta.label !== value ? ` <span>${inlineMd(delta.label, ctx)}</span>` : "";
  const tone = typeof delta === "object" && delta.tone ? slugify(delta.tone) : "";
  return value ? `<small class="ds-stat-delta${tone ? ` tone-${esc(tone)}` : ""}">${inlineMd(value, ctx)}${label}</small>` : "";
}

const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHEVRON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`;
const PROCESS_VERDICTS = ["undecided", "approve", "revise", "skip", "defer", "split", "retry", "block"];
const REVIEW_VERDICTS = ["undecided", "approve", "revise", "skip", "defer", "block"];

const wrap = (type, id, inner, extra = "") =>
  `<section class="ds-block" data-block="${esc(type)}" data-id="${esc(id)}"${extra}>` +
  `<button class="ds-copy" type="button" data-copy aria-label="Copy block" title="Copy">${COPY_ICON}</button>${inner}</section>`;

const verdictOptions = (current) =>
  PROCESS_VERDICTS.map((v) => `<option value="${esc(v)}"${(current || "undecided") === v ? " selected" : ""}>${esc(v)}</option>`).join("");

const reviewOptions = (current) =>
  REVIEW_VERDICTS.map((v) => `<option value="${esc(v)}"${(current || "undecided") === v ? " selected" : ""}>${esc(v)}</option>`).join("");

const rowCode = (i) => `ITEM-${String(i + 1).padStart(3, "0")}`;
const rowDomId = (blockId, itemId) => slugify(`${blockId || "block"}-${itemId || "item"}`);

function stripDiffPath(s) {
  const raw = String(s || "").trim().replace(/^"(.*)"$/, "$1");
  if (!raw || raw === "/dev/null") return raw;
  return raw.replace(/^[ab]\//, "");
}

function parseHunkHeader(header) {
  const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(header);
  return { oldLine: m ? Number(m[1]) : 0, newLine: m ? Number(m[2]) : 0 };
}

function createDiffFile(label = "diff") {
  return { oldPath: label, newPath: label, hunks: [], meta: [], additions: 0, deletions: 0 };
}

function parseDiffGit(line) {
  const m = /^diff --git\s+(.+?)\s+(.+)$/.exec(line);
  return m ? [stripDiffPath(m[1]), stripDiffPath(m[2])] : null;
}

function diffFileLabel(file) {
  return file.newPath && file.newPath !== "/dev/null" ? file.newPath : file.oldPath || "diff";
}

export function parseUnifiedDiff(diff, label = "diff") {
  const files = [];
  let current = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  const startFile = (next = createDiffFile(label)) => {
    if (current) files.push(current);
    current = next;
    hunk = null;
  };
  for (const line of String(diff || "").split(/\r?\n/)) {
    const gitPaths = parseDiffGit(line);
    if (gitPaths) {
      startFile({ ...createDiffFile(label), oldPath: gitPaths[0], newPath: gitPaths[1] });
      current.meta.push(line);
      continue;
    }
    if (!current) startFile();
    if (line.startsWith("--- ")) {
      current.oldPath = stripDiffPath(line.slice(4));
      current.meta.push(line);
      continue;
    }
    if (line.startsWith("+++ ")) {
      current.newPath = stripDiffPath(line.slice(4));
      current.meta.push(line);
      continue;
    }
    if (line.startsWith("@@")) {
      const pos = parseHunkHeader(line);
      oldLine = pos.oldLine;
      newLine = pos.newLine;
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      if (line.trim()) current.meta.push(line);
      continue;
    }
    const mark = line.charAt(0);
    const text = line.slice(1);
    if (mark === "+") {
      hunk.lines.push({ type: "add", oldNumber: "", newNumber: newLine || "", mark, text });
      if (newLine) newLine += 1;
      current.additions += 1;
    } else if (mark === "-") {
      hunk.lines.push({ type: "del", oldNumber: oldLine || "", newNumber: "", mark, text });
      if (oldLine) oldLine += 1;
      current.deletions += 1;
    } else if (mark === " ") {
      hunk.lines.push({ type: "ctx", oldNumber: oldLine || "", newNumber: newLine || "", mark: " ", text });
      if (oldLine) oldLine += 1;
      if (newLine) newLine += 1;
    } else {
      hunk.lines.push({ type: "meta", oldNumber: "", newNumber: "", mark: "", text: line });
    }
  }
  if (current) files.push(current);
  return files.filter((file) => file.hunks.length || file.meta.length);
}

function renderDiffView(b, ctx, nested = false) {
  const files = parseUnifiedDiff(b.diff || "", b.filename || b.title || "diff");
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const fileTabs = files
    .map((file) => `<a href="#${esc(b.id)}-${slugify(diffFileLabel(file))}" class="ds-diff-filelink"><span>${esc(diffFileLabel(file))}</span><b>+${file.additions} -${file.deletions}</b></a>`)
    .join("");
  const renderedFiles = files
    .map((file) => {
      const fileLabel = diffFileLabel(file);
      const fileKey = `${b.id}:${fileLabel}`;
      const meta = file.meta.length ? `<div class="ds-diff-meta-lines">${file.meta.map((line) => `<code>${esc(line)}</code>`).join("")}</div>` : "";
      const hunks = file.hunks
        .map((hk, hunkIndex) => {
          const hunkKey = `${fileKey}:h${hunkIndex + 1}`;
          const lines = hk.lines
            .map(
              (line) =>
                `<span class="ds-diff-line ${line.type}"><span class="ds-diff-num">${esc(line.oldNumber)}</span><span class="ds-diff-num">${esc(line.newNumber)}</span><span class="ds-diff-mark">${esc(line.mark)}</span><span class="ds-diff-code">${esc(line.text)}</span></span>`
            )
            .join("");
          return (
            `<div class="ds-hunk" data-diff-hunk="${esc(hunkKey)}"><div class="ds-hunk-head"><span>${esc(hk.header)}</span>` +
            `<label><span>Hunk verdict</span><select data-diff-hunk-verdict="${esc(hunkKey)}">${reviewOptions()}</select></label></div>` +
            `<textarea class="ds-diff-comment" data-diff-hunk-comment="${esc(hunkKey)}" placeholder="Hunk comment or requested change"></textarea>` +
            `<pre class="ds-diff-lines"><code>${lines}</code></pre></div>`
          );
        })
        .join("");
      return (
        `<details class="ds-diff-file" id="${esc(b.id)}-${esc(slugify(fileLabel))}" data-diff-file="${esc(fileKey)}" open>` +
        `<summary><span class="ds-diff-path">${esc(fileLabel)}</span><span class="ds-diff-stat">+${file.additions} -${file.deletions}</span></summary>` +
        `<div class="ds-diff-review"><label><span>File verdict</span><select data-diff-file-verdict="${esc(fileKey)}">${reviewOptions()}</select></label>` +
        `<label><span>File comment</span><textarea data-diff-file-comment="${esc(fileKey)}" placeholder="File-level review note"></textarea></label></div>` +
        `${meta}${hunks}</details>`
      );
    })
    .join("");
  const summary = b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "";
  const title = b.title && !nested ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : b.title ? `<h4>${esc(b.title)}</h4>` : "";
  return (
    `<section class="${nested ? "ds-diffview nested" : "ds-block ds-diffview"}" data-block="diff-view" data-id="${esc(b.id)}">` +
    (nested ? "" : `<button class="ds-copy" type="button" data-copy aria-label="Copy block" title="Copy">${COPY_ICON}</button>`) +
    `${title}${summary}` +
    `<div class="ds-diff-summary"><span>${files.length} file${files.length === 1 ? "" : "s"}</span><span class="add">+${additions}</span><span class="del">-${deletions}</span></div>` +
    (fileTabs ? `<nav class="ds-diff-files">${fileTabs}</nav>` : "") +
    `<div class="ds-diff-body">${renderedFiles || `<pre class="ds-diff-empty"><code>${esc(b.diff || "")}</code></pre>`}</div>` +
    `<div class="ds-codeedit-actions"><button class="ds-btn ds-btn-line" type="button" data-export-diff-review>Export diff review packet</button><button class="ds-btn ds-btn-line" type="button" data-import-diff-review>Import</button></div>` +
    `</section>`
  );
}

function renderDetails(rows, ctx) {
  const html = rows
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim())
    .map(([k, v]) => `<div class="ds-detail"><dt>${esc(k)}</dt><dd>${inlineMd(Array.isArray(v) ? v.join(", ") : v, ctx)}</dd></div>`)
    .join("");
  return html ? `<dl class="ds-detailgrid">${html}</dl>` : "";
}

function renderSimpleList(items, cls, ctx) {
  return (items || [])
    .map((it) => {
      const chips = [];
      ["status", "severity", "kind", "trust", "owner", "producer", "consumer"].forEach((k) => {
        if (it[k]) chips.push(`<span class="ds-chip">${esc(k)} · ${esc(it[k])}</span>`);
      });
      const title = it.title || it.label || it.id || "Item";
      const body = it.body || it.summary || it.response || it.rationale || it.notes || "";
      const rows = [];
      ["source", "created", "command", "expected", "actual", "decision", "recommendation", "request", "nextStep"].forEach((k) => {
        if (it[k]) rows.push([k.replace(/[A-Z]/g, (m) => " " + m.toLowerCase()), it[k]]);
      });
      if (it.files && it.files.length) rows.push(["files", it.files.join(", ")]);
      if (it.artifacts && it.artifacts.length) rows.push(["artifacts", it.artifacts.join(", ")]);
      if (it.links && it.links.length) rows.push(["links", it.links.join(", ")]);
      return (
        `<article class="${esc(cls)}">` +
        `<div class="ds-process-card-head"><div><h4>${esc(title)}</h4>${body ? `<p class="ds-muted">${inlineMd(body, ctx)}</p>` : ""}</div>` +
        (chips.length ? `<div class="ds-chips">${chips.join("")}</div>` : "") +
        `</div>${renderDetails(rows, ctx)}</article>`
      );
    })
    .join("");
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function renderTrustReport(b, ctx) {
  const sources = asArray(b.sources);
  const claims = asArray(b.claims);
  const sourceMap = new Map(sources.filter((s) => s && s.id).map((s) => [s.id, s]));
  const sourceRows = sources
    .map((s) => {
      const id = s.id || slugify(s.label || s.url || "source");
      const label = s.url ? `<a href="${esc(safeUrl(s.url))}">${esc(s.label || s.url)}</a>` : esc(s.label || id);
      const cells = [
        `<td>${label}</td>`,
        `<td>${inlineMd(s.kind || "", ctx)}</td>`,
        `<td>${inlineMd(s.trust || "", ctx)}</td>`,
        `<td>${inlineMd(s.license || "", ctx)}</td>`,
        `<td>${inlineMd(s.summary || "", ctx)}</td>`,
      ].join("");
      return `<tr id="${esc(b.id)}-${esc(id)}" data-trust-source="${esc(id)}">${cells}</tr>`;
    })
    .join("");
  const sourceTable = sourceRows
    ? `<div class="ds-trust-sources"><h4>Sources</h4><div class="ds-tablewrap"><table><thead><tr><th>Source</th><th>Kind</th><th>Trust</th><th>License</th><th>Summary</th></tr></thead><tbody>${sourceRows}</tbody></table></div></div>`
    : "";
  const claimCards = claims
    .map((c) => {
      const id = c.id || slugify(c.claim || c.title || "claim");
      const title = c.claim || c.title || id;
      const chips = [];
      if (c.status) chips.push(`<span class="ds-chip">status · ${esc(c.status)}</span>`);
      if (c.confidence) chips.push(`<span class="ds-chip">confidence · ${esc(c.confidence)}</span>`);
      if (c.owner) chips.push(`<span class="ds-chip">owner · ${esc(c.owner)}</span>`);
      const sourceLinks = asArray(c.sources)
        .map((sid) => {
          const src = sourceMap.get(sid);
          const label = src ? src.label || src.id : sid;
          return src
            ? `<a class="ds-chip ds-trust-link" href="#${esc(b.id)}-${esc(src.id)}">${esc(label)}</a>`
            : `<span class="ds-chip ds-trust-missing">missing · ${esc(sid)}</span>`;
        })
        .join("");
      const evidence = asArray(c.evidence).map((e) => `<span class="ds-chip">${esc(e)}</span>`).join("");
      const rows = [
        ["notes", c.notes],
        ["updated", c.updated],
      ];
      return (
        `<article class="ds-process-card ds-trust-claim status-${esc(slugify(c.status || "unverified"))}" data-trust-claim="${esc(id)}">` +
        `<div class="ds-process-card-head"><div><h4>${esc(title)}</h4>${c.summary ? `<p class="ds-muted">${inlineMd(c.summary, ctx)}</p>` : ""}</div>` +
        (chips.length ? `<div class="ds-chips">${chips.join("")}</div>` : "") +
        `</div>${renderDetails(rows, ctx)}` +
        (sourceLinks || evidence ? `<div class="ds-trust-refs">${sourceLinks}${evidence}</div>` : "") +
        `</article>`
      );
    })
    .join("");
  return wrap(
    "trust-report",
    b.id,
    (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") +
      (b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "") +
      sourceTable +
      `<div class="ds-process-list ds-trust-claims">${claimCards}</div>`
  );
}

// ---- block renderers -------------------------------------------------------

const renderers = {
  hero(b, ctx) {
    const pills = (b.pills || []).map((p) => `<span class="ds-pill">${esc(p)}</span>`).join("");
    const meta = (b.sideCards || [])
      .map((c) => `<div class="ds-meta-item"><span class="ds-label">${esc(c.label)}</span><span class="ds-val">${esc(c.value)}</span></div>`)
      .join("");
    return (
      `<section class="ds-hero ds-block" data-block="hero" data-id="${esc(b.id)}">` +
      (b.eyebrow ? `<p class="ds-eyebrow">${esc(b.eyebrow)}</p>` : "") +
      `<h1 id="${esc(b.id)}" data-edit="${esc(b.id)}:title">${esc(b.title)}</h1>` +
      (b.lede ? `<p class="ds-lede" data-edit="${esc(b.id)}:lede">${inlineMd(b.lede, ctx)}</p>` : "") +
      (pills ? `<div class="ds-pillrow">${pills}</div>` : "") +
      (meta ? `<div class="ds-meta">${meta}</div>` : "") +
      `</section>`
    );
  },
  prose(b, ctx) {
    const h = b.heading ? `<h2 id="${esc(b.id)}" data-edit="${esc(b.id)}:heading">${esc(b.heading)}</h2>` : "";
    return wrap("prose", b.id, h + `<div class="ds-prose" data-edit="${esc(b.id)}:markdown">${richTextHtml(b.markdown, ctx)}</div>`);
  },
  section(b, ctx) {
    const titles =
      `<div class="ds-section-titles"><h2 id="${esc(b.id)}" data-edit="${esc(b.id)}:title">${esc(b.title)}</h2>` +
      (b.subtitle ? `<p class="ds-muted" data-edit="${esc(b.id)}:subtitle">${inlineMd(b.subtitle, ctx)}</p>` : "") +
      `</div>`;
    const inner =
      `<div class="ds-section-head">${titles}` +
      `<button class="ds-toggle" type="button" data-toggle aria-label="Toggle section">${CHEVRON_ICON}</button></div>` +
      `<div class="ds-section-body">${(b.blocks || []).map((c) => renderBlock(c, ctx)).join("")}</div>`;
    const cls = b.framed === false ? "ds-section unframed" : "ds-section";
    return `<section class="${cls} ds-block" data-block="section" data-id="${esc(b.id)}"${b.collapsed ? ' data-collapsed="1"' : ""}>${inner}</section>`;
  },
  "two-col"(b, ctx) {
    const col = (arr) => (arr || []).map((c) => renderBlock(c, ctx)).join("");
    return wrap("two-col", b.id, `<div class="ds-twocol"><div>${col(b.left)}</div><div>${col(b.right)}</div></div>`);
  },
  "summary-cards"(b, ctx) {
    const cards = (b.cards || [])
      .map(
        (c) =>
          `<article class="ds-card ${c.tone ? "tone-" + esc(c.tone) : ""}"><h3>${esc(c.title)}</h3>` +
          `<p>${inlineMd(c.body, ctx)}</p></article>`
      )
      .join("");
    return wrap("summary-cards", b.id, `<div class="ds-cardgrid">${cards}</div>`);
  },
  "stat-strip"(b, ctx) {
    const stats = (b.stats || [])
      .map((s) => `<div class="ds-stat"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span>${statDeltaHtml(s, ctx)}</div>`)
      .join("");
    return wrap("stat-strip", b.id, `<div class="ds-statgrid">${stats}</div>`);
  },
  flow(b, ctx) {
    const steps = (b.steps || [])
      .map((s) => `<div class="ds-flowstep"><div class="ds-flowstep-body"><strong>${esc(s.title)}</strong><span>${inlineMd(s.body, ctx)}</span></div></div>`)
      .join("");
    return wrap("flow", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-flow">${steps}</div>`);
  },
  timeline(b, ctx) {
    const ph = (b.phases || [])
      .map(
        (p) =>
          `<div class="ds-phase"><div class="ds-phase-id">${esc(p.label)}${p.status ? `<span class="ds-status s-${esc(p.status)}">${esc(p.status)}</span>` : ""}${p.date ? `<span class="ds-date">${esc(p.date)}</span>` : ""}</div>` +
          `<div>${inlineMd(p.body, ctx)}</div></div>`
      )
      .join("");
    return wrap("timeline", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-timeline">${ph}</div>`);
  },
  table(b, ctx) {
    const head = `<tr>${(b.columns || []).map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
    const body = (b.rows || []).map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td>${inlineMd(c, ctx)}</td>`).join("")}</tr>`).join("");
    return wrap("table", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-tablewrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
  },
  callout(b, ctx) {
    return wrap(
      "callout",
      b.id,
      `<div class="ds-callout tone-${esc(b.tone || "info")}">${b.title ? `<strong data-edit="${esc(b.id)}:title">${esc(b.title)}</strong> ` : ""}<span data-edit="${esc(b.id)}:body">${inlineMd(b.body, ctx)}</span></div>`
    );
  },
  code(b) {
    const label = b.filename || b.lang || "code";
    const body = b._hl || `<pre><code>${esc(b.code)}</code></pre>`;
    return wrap(
      "code",
      b.id,
      `<div class="ds-code"><div class="ds-code-bar"><span class="ds-lang">${esc(label)}</span>` +
        `<button class="ds-code-copy" type="button" data-code-copy>Copy</button></div>${body}</div>`
    );
  },
  "code-editor"(b, ctx) {
    const id = b.id || slugify(b.title || b.filename || b.targetPath || "code-editor");
    const label = b.filename || b.targetPath || b.lang || "code";
    const codeText = String(b.code || "");
    const rows = Math.min(28, Math.max(10, codeText.split(/\r?\n/).length + 1));
    const meta = [];
    if (b.lang) meta.push(`<span>${esc(b.lang)}</span>`);
    if (b.targetPath) meta.push(`<span>${esc(b.targetPath)}</span>`);
    if (b.workItems && b.workItems.length) meta.push(`<span>Work · ${esc(b.workItems.join(", "))}</span>`);
    const attrs = [
      `data-code-editor="${esc(id)}"`,
      `data-editor-lang="${esc(b.lang || "")}"`,
      `data-editor-filename="${esc(b.filename || "")}"`,
      `data-editor-target="${esc(b.targetPath || "")}"`,
      `data-editor-title="${esc(b.title || "")}"`,
      `spellcheck="false"`,
      `rows="${rows}"`,
    ];
    if (b.readonly) attrs.push("readonly");
    return wrap(
      "code-editor",
      id,
      (b.title ? `<h3 id="${esc(id)}">${esc(b.title)}</h3>` : "") +
        (b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "") +
        `<div class="ds-codeedit" data-editor-shell="${esc(id)}">` +
        `<div class="ds-codeedit-bar"><span class="ds-lang">${esc(label)}</span><div class="ds-codeedit-meta">${meta.join("")}</div></div>` +
        `<textarea class="ds-codeedit-area" ${attrs.join(" ")}>${esc(codeText)}</textarea>` +
        `<div class="ds-codeedit-actions"><span class="ds-codeedit-state" data-editor-state="${esc(id)}">clean</span>` +
        `<button class="ds-btn ds-btn-line" type="button" data-editor-reset="${esc(id)}">Reset</button>` +
        `<button class="ds-btn ds-btn-line" type="button" data-export-editors>Export edits packet</button>` +
        `<button class="ds-btn ds-btn-line" type="button" data-import-editors>Import</button></div>` +
        `</div>`
    );
  },
  "patch-set"(b, ctx) {
    const patches = (b.patches || [])
      .map((p) => {
        const chips = [];
        if (p.operation) chips.push(`<span class="ds-chip">${esc(p.operation)}</span>`);
        if (p.status) chips.push(`<span class="ds-chip">${esc(p.status)}</span>`);
        if (p.risk) chips.push(`<span class="ds-chip risk-${esc(slugify(p.risk))}">Risk · ${esc(p.risk)}</span>`);
        const patchId = p.id || slugify(p.title || "patch");
        const rows = [];
        if (p.files && p.files.length) rows.push(["Files", p.files.join(", ")]);
        if (p.workItems && p.workItems.length) rows.push(["Work items", p.workItems.join(", ")]);
        if (p.verification && p.verification.length) rows.push(["Verification", p.verification.join(", ")]);
        Object.entries(p.details || {}).forEach(([k, v]) => rows.push([k, v]));
        const details = rows.map(([k, v]) => `<div class="ds-detail"><dt>${esc(k)}</dt><dd>${inlineMd(v, ctx)}</dd></div>`).join("");
        const diff = p.diff ? renderDiffView({ type: "diff-view", id: `${patchId}-diff`, title: "Diff", diff: p.diff }, ctx, true) : "";
        return (
          `<article class="ds-patch" data-patch="${esc(patchId)}">` +
          `<div class="ds-patch-head"><div><h4>${esc(p.title || p.id || "Patch")}</h4>${p.summary ? `<p class="ds-muted">${inlineMd(p.summary, ctx)}</p>` : ""}</div>` +
          (chips.length ? `<div class="ds-chips">${chips.join("")}</div>` : "") +
          `</div>` +
          `<div class="ds-patch-review"><label><span>Patch verdict</span><select data-patch-verdict="${esc(patchId)}">${reviewOptions(p.review || p.status)}</select></label>` +
          `<label><span>Review notes</span><textarea data-patch-notes="${esc(patchId)}" placeholder="Apply, revise, skip, or follow-up notes">${esc(p.notes || "")}</textarea></label></div>` +
          (details ? `<dl class="ds-detailgrid">${details}</dl>` : "") +
          diff +
          `</article>`
        );
      })
      .join("");
    return wrap(
      "patch-set",
      b.id,
      (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") +
        (b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "") +
        `<div class="ds-patchlist">${patches}</div>` +
        `<div class="ds-codeedit-actions"><button class="ds-btn ds-btn-line" type="button" data-export-patch-review>Export patch review packet</button><button class="ds-btn ds-btn-line" type="button" data-import-patch-review>Import</button></div>`
    );
  },
  "diff-view"(b, ctx) {
    return renderDiffView(b, ctx);
  },
  "verification-run"(b, ctx) {
    const runs = renderSimpleList(
      (b.runs || []).map((r) => ({ ...r, body: r.notes || r.summary, kind: r.status })),
      "ds-process-card ds-vrun",
      ctx
    );
    return wrap("verification-run", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + (b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "") + `<div class="ds-process-list">${runs}</div>`);
  },
  "evidence-log"(b, ctx) {
    return wrap("evidence-log", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-process-list">${renderSimpleList(b.items || [], "ds-process-card ds-evidence", ctx)}</div>`);
  },
  "trust-report"(b, ctx) {
    return renderTrustReport(b, ctx);
  },
  "verdict-gate"(b, ctx) {
    const id = b.gateId || b.id || slugify(b.title || "verdict-gate");
    const opts = (b.options || PROCESS_VERDICTS).map((v) => `<option value="${esc(v)}"${(b.verdict || "undecided") === v ? " selected" : ""}>${esc(v)}</option>`).join("");
    return wrap(
      "verdict-gate",
      b.id,
      (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") +
        (b.prompt ? `<p class="ds-muted">${inlineMd(b.prompt, ctx)}</p>` : "") +
        `<div class="ds-gate" data-gate="${esc(id)}"><label class="ds-process-verdict-wrap"><span>Verdict</span><select class="ds-process-verdict" data-verdict-gate="${esc(id)}" data-verdict-title="${esc(b.title || id)}">${opts}</select></label>` +
        `<label class="ds-notes"><span>Notes</span><textarea data-verdict-notes="${esc(id)}" placeholder="Decision rationale, constraints, follow-up"></textarea></label>` +
        `<div class="ds-codeedit-actions"><button class="ds-btn ds-btn-line" type="button" data-export-verdicts>Export verdicts packet</button><button class="ds-btn ds-btn-line" type="button" data-import-verdicts>Import</button></div></div>`
    );
  },
  "process-receipt"(b, ctx) {
    const rows = [
      ["outcome", b.outcome],
      ["owner", b.owner],
      ["date", b.date],
      ["model", b.model],
      ["changed files", b.changedFiles && b.changedFiles.join(", ")],
      ["commands", b.commands && b.commands.join(", ")],
      ["risks", b.risks && b.risks.join(", ")],
      ["follow ups", b.followUps && b.followUps.join(", ")],
    ];
    return wrap("process-receipt", b.id, `<aside class="ds-receipt ds-process-receipt"><div class="ds-receipt-head">${esc(b.title || "Process receipt")}</div>${b.summary ? `<p>${inlineMd(b.summary, ctx)}</p>` : ""}${renderDetails(rows, ctx)}</aside>`);
  },
  "finding-list"(b, ctx) {
    return wrap("finding-list", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-process-list">${renderSimpleList(b.findings || [], "ds-process-card ds-finding", ctx)}</div>`);
  },
  "comment-thread"(b, ctx) {
    const threads = (b.threads || [])
      .map((t) => {
        const comments = (t.comments || []).map((c) => `<li><strong>${esc(c.author || "comment")}</strong>${c.created ? ` <span class="ds-muted">${esc(c.created)}</span>` : ""}<p>${inlineMd(c.body || "", ctx)}</p></li>`).join("");
        return `<article class="ds-process-card"><div class="ds-process-card-head"><div><h4>${esc(t.subject || t.id || "Thread")}</h4>${t.status ? `<p class="ds-muted">${esc(t.status)}</p>` : ""}</div></div><ul class="ds-comments">${comments}</ul></article>`;
      })
      .join("");
    return wrap("comment-thread", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-process-list">${threads}</div>`);
  },
  "cycle-board"(b, ctx) {
    return wrap("cycle-board", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-process-list">${renderSimpleList(b.cycles || [], "ds-process-card ds-cycle", ctx)}</div>`);
  },
  "integration-report"(b, ctx) {
    const rows = [["producer", b.producer], ["consumer", b.consumer], ["status", b.status], ["version", b.version], ["next step", b.nextStep]];
    return wrap("integration-report", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + (b.summary ? `<p class="ds-muted">${inlineMd(b.summary, ctx)}</p>` : "") + renderDetails(rows, ctx) + `<div class="ds-process-list">${renderSimpleList(b.items || [], "ds-process-card ds-integration", ctx)}</div>`);
  },
  "upstream-response"(b, ctx) {
    const rows = [["upstream", b.upstream], ["status", b.status], ["url", b.url], ["request", b.request], ["response", b.response], ["next step", b.nextStep]];
    return wrap("upstream-response", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + renderDetails(rows, ctx));
  },
  "release-checklist"(b, ctx) {
    const gates = (b.gates || [])
      .map((g) => {
        const id = g.id || slugify(g.title || "gate");
        const title = g.title || id;
        const checked = g.status === "done" || g.status === "passed";
        return `<li class="ds-action ds-release-gate" data-release-row="${esc(id)}"><label><input type="checkbox" data-release-gate="${esc(id)}" data-release-title="${esc(title)}" data-release-required="${g.required ? "1" : "0"}" ${checked ? "checked" : ""}><span class="ds-action-title">${inlineMd(title, ctx)}</span></label><span class="ds-action-meta">${g.required ? `<span class="ds-chip">required</span>` : ""}<span class="ds-status s-${esc(slugify(g.status || "todo"))}">${esc(g.status || "todo")}</span></span><textarea data-release-notes="${esc(id)}" placeholder="Evidence, approver, blocker">${esc(g.evidence || "")}</textarea></li>`;
      })
      .join("");
    return wrap("release-checklist", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<ul class="ds-actions ds-release-list">${gates}</ul><div class="ds-codeedit-actions"><button class="ds-btn ds-btn-line" type="button" data-export-release>Export release packet</button><button class="ds-btn ds-btn-line" type="button" data-import-release>Import</button></div>`);
  },
  "decision-log"(b, ctx) {
    return wrap("decision-log", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-process-list">${renderSimpleList(b.decisions || [], "ds-process-card ds-decision", ctx)}</div>`);
  },
  tabs(b, ctx) {
    const tabs = b.tabs || [];
    const heads = tabs
      .map((t, i) => `<button class="ds-tab${i === 0 ? " active" : ""}" type="button" data-tab="${i}">${esc(t.label)}</button>`)
      .join("");
    const panes = tabs
      .map((t, i) => `<div class="ds-pane${i === 0 ? " active" : ""}" data-pane="${i}">${(t.blocks || []).map((c) => renderBlock(c, ctx)).join("")}</div>`)
      .join("");
    return wrap("tabs", b.id, `<div class="ds-tabs"><div class="ds-tabbar">${heads}</div>${panes}</div>`);
  },
  faq(b, ctx) {
    const items = (b.items || [])
      .map((it) => `<details class="ds-faq"><summary>${esc(it.q)}</summary><p>${inlineMd(it.a, ctx)}</p></details>`)
      .join("");
    return wrap("faq", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + items);
  },
  references(b, ctx) {
    const rows = (b.items || [])
      .map(
        (r) =>
          `<tr><td>${r.url ? `<a href="${esc(safeUrl(r.url))}">${esc(r.label)}</a>` : esc(r.label)}</td>` +
          `<td>${r.signal ? inlineMd(r.signal, ctx) : ""}</td><td>${r.use ? inlineMd(r.use, ctx) : ""}</td></tr>`
      )
      .join("");
    return wrap(
      "references",
      b.id,
      (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") +
        `<div class="ds-tablewrap"><table><thead><tr><th>Source</th><th>Signal</th><th>Use</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
  },
  "decision-matrix"(b, ctx) {
    const head = `<tr><th>Option</th>${(b.criteria || []).map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
    const body = (b.options || [])
      .map(
        (o) =>
          `<tr class="${o.recommended ? "ds-rec" : ""}"><td><strong>${esc(o.name)}</strong>${o.recommended ? ' <span class="ds-pill">recommended</span>' : ""}</td>` +
          (o.scores || []).map((s) => `<td>${inlineMd(s, ctx)}</td>`).join("") +
          `</tr>`
      )
      .join("");
    return wrap("decision-matrix", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-tablewrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
  },
  "risk-register"(b, ctx) {
    const rows = (b.risks || [])
      .map(
        (r) =>
          `<tr><td>${inlineMd(r.risk, ctx)}</td><td><span class="ds-lvl l-${esc(r.likelihood || "")}">${esc(r.likelihood || "")}</span></td>` +
          `<td><span class="ds-lvl l-${esc(r.impact || "")}">${esc(r.impact || "")}</span></td><td>${r.mitigation ? inlineMd(r.mitigation, ctx) : ""}</td></tr>`
      )
      .join("");
    return wrap(
      "risk-register",
      b.id,
      (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") +
        `<div class="ds-tablewrap"><table><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
  },
  "action-items"(b, ctx) {
    const items = (b.items || [])
      .map(
        (it, i) =>
          `<li class="ds-action" data-action="${esc(b.id)}:${i}"><label><input type="checkbox" data-action-check ${it.status === "done" ? "checked" : ""}>` +
          `<span class="ds-action-title">${inlineMd(it.title, ctx)}</span></label>` +
          `<span class="ds-action-meta">${it.owner ? `<span class="ds-owner">${esc(it.owner)}</span>` : ""}<span class="ds-status s-${esc(it.status || "todo")}">${esc(it.status || "todo")}</span></span></li>`
      )
      .join("");
    return wrap("action-items", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<ul class="ds-actions">${items}</ul>`);
  },
  assumptions(b, ctx) {
    const items = (b.items || [])
      .map(
        (it) =>
          `<li class="ds-assumption a-${esc(it.status || "unverified")}"><span class="ds-akind">${esc(it.kind || "assumption")}</span>` +
          `<span>${inlineMd(it.statement, ctx)}</span><span class="ds-astatus">${esc(it.status || "unverified")}</span></li>`
      )
      .join("");
    return wrap("assumptions", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : `<h3 id="${esc(b.id)}">Assumptions &amp; open questions</h3>`) + `<ul class="ds-assumptions">${items}</ul>`);
  },
  glossary(b, ctx) {
    const items = (b.terms || [])
      .map((t) => `<div class="ds-gterm" id="term-${slugify(t.term)}"><dt>${esc(t.term)}</dt><dd>${inlineMd(t.definition, ctx)}</dd></div>`)
      .join("");
    return wrap("glossary", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : `<h3 id="${esc(b.id)}">Glossary</h3>`) + `<dl class="ds-glossary">${items}</dl>`);
  },
  diagram(b) {
    const head = b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "";
    if (b._svg) {
      return wrap("diagram", b.id, head + `<div class="ds-diagram ds-diagram-svg">${b._svg}</div>`);
    }
    // Fallback: render the source (e.g. mermaid, which needs a headless browser to rasterize).
    return wrap(
      "diagram",
      b.id,
      head +
        `<div class="ds-diagram"><div class="ds-code-bar"><span>diagram · ${esc(b.format || "dot")}</span></div><pre><code>${esc(b.spec)}</code></pre></div>`
    );
  },
  "review-board"(b, ctx) {
    const items = (b.candidates || [])
      .map((c, i) => {
        const itemId = c.id || rowCode(i).toLowerCase();
        const domId = rowDomId(b.id, itemId);
        const anchor = `<a class="ds-row-anchor" href="#${esc(domId)}">${esc(rowCode(i))}</a>`;
        const chips = [];
        if (c.category) chips.push(`<span class="ds-chip">${esc(c.category)}</span>`);
        if (c.impact) chips.push(`<span class="ds-chip">Impact · ${esc(c.impact)}</span>`);
        if (c.effort) chips.push(`<span class="ds-chip">Effort · ${esc(c.effort)}</span>`);
        (c.badges || []).forEach((x) => chips.push(`<span class="ds-chip">${esc(x)}</span>`));
        const chipsHtml = chips.length ? `<div class="ds-chips">${chips.join("")}</div>` : "";
        const details = Object.entries(c.details || {})
          .map(([k, v]) => `<div class="ds-detail"><dt>${esc(k)}</dt><dd>${inlineMd(v, ctx)}</dd></div>`)
          .join("");
        const bodyMd = c.body ? richTextHtml(c.body, ctx) : "";
        const bodyBlocks = (c.blocks || []).map((x) => renderBlock(x, ctx)).join("");
        const refInner = bodyMd + bodyBlocks + (details ? `<dl class="ds-detailgrid">${details}</dl>` : "");
        const ref = refInner ? `<div class="ds-ref">${refInner}</div>` : "";
        const statusChip = c.status ? `<span class="ds-status s-${esc(slugify(c.status))}">${esc(c.status)}</span>` : "";
        const searchText = esc([c.title, c.summary, c.category, c.body].filter(Boolean).join(" ").toLowerCase());
        return (
          `<article id="${esc(domId)}" class="ds-ritem" data-candidate="${esc(itemId)}"${c.scope ? ` data-scope="${esc(c.scope)}"` : ""} data-text="${searchText}">` +
          `<div class="ds-ritem-head" data-rtoggle>` +
          `<span class="ds-ritem-check" data-stop><input type="checkbox" data-select="${esc(itemId)}" aria-label="Select ${esc(c.title)}"></span>` +
          `<div class="ds-ritem-titles">${anchor}<h4>${esc(c.title)}</h4><p class="ds-muted">${inlineMd(c.summary, ctx)}</p>${chipsHtml}</div>` +
          `<div class="ds-ritem-aside">${statusChip}<span class="ds-chev" aria-hidden="true">▾</span></div>` +
          `</div>` +
          `<div class="ds-ritem-wrap"><div class="ds-ritem-body">${ref}` +
          `<label class="ds-notes"><span>Notes</span><textarea data-notes="${esc(itemId)}" placeholder="Decision notes, priority, constraints"></textarea></label>` +
          `</div></div></article>`
        );
      })
      .join("");
    return (
      `<section class="ds-block ds-reviewboard" data-block="review-board" data-id="${esc(b.id)}">` +
      (b.title ? `<h2 id="${esc(b.id)}">${esc(b.title)}</h2>` : "") +
      `<div class="ds-review-bar">` +
      `<input class="ds-review-search" type="search" placeholder="Filter…" data-review-search aria-label="Filter items">` +
      `<label class="ds-review-only"><input type="checkbox" data-review-only> Selected only</label>` +
      `<button class="ds-btn ds-btn-line" type="button" data-review-expand>Expand all</button>` +
      `<span class="ds-review-count" data-review-count>0 selected</span>` +
      `<button class="ds-btn ds-btn-line" type="button" data-export-decisions>Export decisions packet</button>` +
      `<button class="ds-btn ds-btn-line" type="button" data-import-decisions>Import</button>` +
      `</div>` +
      `<div class="ds-rlist">${items}</div></section>`
    );
  },
  "process-board"(b, ctx) {
    const items = (b.items || [])
      .map((it, i) => {
        const itemId = it.id || rowCode(i).toLowerCase();
        const domId = rowDomId(b.id, itemId);
        const anchor = `<a class="ds-row-anchor" href="#${esc(domId)}">${esc(rowCode(i))}</a>`;
        const chips = [];
        if (it.category) chips.push(`<span class="ds-chip">${esc(it.category)}</span>`);
        if (it.priority) chips.push(`<span class="ds-chip">Priority · ${esc(it.priority)}</span>`);
        if (it.owner) chips.push(`<span class="ds-chip">Owner · ${esc(it.owner)}</span>`);
        if (it.impact) chips.push(`<span class="ds-chip">Impact · ${esc(it.impact)}</span>`);
        if (it.effort) chips.push(`<span class="ds-chip">Effort · ${esc(it.effort)}</span>`);
        (it.badges || []).forEach((x) => chips.push(`<span class="ds-chip">${esc(x)}</span>`));
        const chipsHtml = chips.length ? `<div class="ds-chips">${chips.join("")}</div>` : "";
        const rows = [];
        if (it.files && it.files.length) rows.push(["Files", it.files.join(", ")]);
        if (it.dependencies && it.dependencies.length) rows.push(["Depends on", it.dependencies.join(", ")]);
        if (it.verification && it.verification.length) rows.push(["Verification", it.verification.join(", ")]);
        if (it.risks && it.risks.length) rows.push(["Risks", it.risks.join(", ")]);
        if (it.evidence && it.evidence.length) rows.push(["Evidence", it.evidence.join(", ")]);
        Object.entries(it.details || {}).forEach(([k, v]) => rows.push([k, v]));
        const details = rows.map(([k, v]) => `<div class="ds-detail"><dt>${esc(k)}</dt><dd>${inlineMd(v, ctx)}</dd></div>`).join("");
        const bodyMd = it.body ? richTextHtml(it.body, ctx) : "";
        const bodyBlocks = (it.blocks || []).map((x) => renderBlock(x, ctx)).join("");
        const refInner = bodyMd + bodyBlocks + (details ? `<dl class="ds-detailgrid">${details}</dl>` : "");
        const ref = refInner ? `<div class="ds-ref">${refInner}</div>` : "";
        const statusChip = it.status ? `<span class="ds-status s-${esc(slugify(it.status))}">${esc(it.status)}</span>` : "";
        const searchText = esc([it.title, it.summary, it.category, it.owner, it.body, ...(it.files || []), ...(it.verification || [])].filter(Boolean).join(" ").toLowerCase());
        const verdict = PROCESS_VERDICTS.includes(it.verdict) ? it.verdict : "undecided";
        return (
          `<article id="${esc(domId)}" class="ds-ritem ds-pitem verdict-${esc(verdict)}" data-process-item="${esc(itemId)}" data-text="${searchText}">` +
          `<div class="ds-ritem-head" data-ptoggle>` +
          `<div class="ds-ritem-titles">${anchor}<h4>${esc(it.title)}</h4><p class="ds-muted">${inlineMd(it.summary || "", ctx)}</p>${chipsHtml}</div>` +
          `<div class="ds-ritem-aside">${statusChip}<label class="ds-process-verdict-wrap" data-stop><span>Verdict</span><select class="ds-process-verdict" data-process-verdict="${esc(itemId)}">${verdictOptions(verdict)}</select></label><span class="ds-chev" aria-hidden="true">▾</span></div>` +
          `</div>` +
          `<div class="ds-ritem-wrap"><div class="ds-ritem-body">${ref}` +
          `<label class="ds-notes"><span>Notes</span><textarea data-process-notes="${esc(itemId)}" placeholder="Verdict notes, constraints, follow-up instructions">${esc(it.notes || "")}</textarea></label>` +
          `</div></div></article>`
        );
      })
      .join("");
    return (
      `<section class="ds-block ds-reviewboard ds-processboard" data-block="process-board" data-id="${esc(b.id)}">` +
      (b.title ? `<h2 id="${esc(b.id)}">${esc(b.title)}</h2>` : "") +
      `<div class="ds-review-bar">` +
      `<input class="ds-review-search" type="search" placeholder="Filter…" data-process-search aria-label="Filter process items">` +
      `<label class="ds-review-only"><input type="checkbox" data-process-only> With verdict only</label>` +
      `<button class="ds-btn ds-btn-line" type="button" data-process-expand>Expand all</button>` +
      `<span class="ds-review-count" data-process-count>0 verdicts</span>` +
      `<button class="ds-btn ds-btn-line" type="button" data-export-process>Export process packet</button>` +
      `<button class="ds-btn ds-btn-line" type="button" data-import-process>Import</button>` +
      `</div>` +
      `<div class="ds-rlist">${items}</div></section>`
    );
  },
  figure(b, ctx) {
    const src = b._src || b.src || "";
    const img = src ? `<img src="${esc(src)}" alt="${esc(b.alt || b.caption || "")}" loading="lazy">` : "";
    const cap = b.caption ? `<figcaption>${inlineMd(b.caption, ctx)}</figcaption>` : "";
    return wrap("figure", b.id, `<figure class="ds-figure">${img}${cap}</figure>`);
  },
  math(b) {
    return wrap("math", b.id, `<div class="ds-math${b.display === false ? " inline" : ""}">${b._math || `<code>${esc(b.tex)}</code>`}</div>`);
  },
  footnotes(b, ctx) {
    const items = (b.items || [])
      .map((it) => `<li id="fn-${esc(it.id)}"><span>${inlineMd(it.text, ctx)}</span> <a class="ds-fnback" href="#fnref-${esc(it.id)}" aria-label="Back to reference">↩</a></li>`)
      .join("");
    return wrap("footnotes", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : `<h3 id="${esc(b.id)}">Notes</h3>`) + `<ol class="ds-footnotes">${items}</ol>`);
  },
  chart(b) {
    return wrap("chart", b.id, (b.title ? `<h3 id="${esc(b.id)}">${esc(b.title)}</h3>` : "") + `<div class="ds-chart">${chartSvg(b)}</div>`);
  },
  receipt(b, ctx) {
    const rows = [];
    if (b.generatedBy) rows.push(["Generated by", esc(b.generatedBy)]);
    if (b.model) rows.push(["Model", esc(b.model)]);
    if (b.date) rows.push(["Date", esc(b.date)]);
    if (b.confidence) rows.push(["Confidence", esc(b.confidence)]);
    if (b.tools && b.tools.length) rows.push(["Tools", b.tools.map(esc).join(", ")]);
    const dl = rows.map(([k, v]) => `<div class="ds-detail"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    const sources = (b.sources || [])
      .map((s) => `<li>${s.url ? `<a href="${esc(safeUrl(s.url))}">${esc(s.label || s.url)}</a>` : esc(s.label || "")}</li>`)
      .join("");
    const notes = b.notes ? `<p class="ds-muted">${inlineMd(b.notes, ctx)}</p>` : "";
    return wrap(
      "receipt",
      b.id,
      `<aside class="ds-receipt"><div class="ds-receipt-head">${esc(b.title || "Generation receipt")}</div>` +
        (dl ? `<dl class="ds-detailgrid">${dl}</dl>` : "") +
        (sources ? `<div class="ds-receipt-sources"><span class="ds-label">Sources</span><ul>${sources}</ul></div>` : "") +
        `${notes}</aside>`
    );
  },
};

function renderBlock(b, ctx) {
  if (!b || !b.type) return "";
  if (!b.id) b.id = slugify(b.title || b.heading || b.type) + "-" + (ctx.seq++).toString(36);
  const fn = renderers[b.type];
  if (fn) return fn(b, ctx);
  return wrap(b.type, b.id, `<div class="ds-callout tone-warn">Unsupported block type: <code>${esc(b.type)}</code></div>`);
}

// ---- Markdown export -------------------------------------------------------

function blockMd(b) {
  const lines = [];
  const t = b.type;
  if (t === "hero") {
    lines.push(`# ${b.title}`, "", b.lede || "");
  } else if (t === "section") {
    lines.push(`## ${b.title}`, "");
    if (b.subtitle) lines.push(b.subtitle, "");
    (b.blocks || []).forEach((c) => lines.push(blockMd(c)));
  } else if (t === "prose") {
    if (b.heading) lines.push(`## ${b.heading}`, "");
    lines.push(b.markdown);
  } else if (t === "two-col") {
    [...(b.left || []), ...(b.right || [])].forEach((c) => lines.push(blockMd(c)));
  } else if (t === "summary-cards") {
    (b.cards || []).forEach((c) => lines.push(`### ${c.title}`, "", c.body, ""));
  } else if (t === "stat-strip") {
    lines.push(
      (b.stats || [])
        .map((s) => {
          const delta = typeof s.delta === "object" ? [s.delta.value, s.delta.label].filter(Boolean).join(" ") : s.delta;
          return `**${s.value}** ${s.label}${delta ? ` (${delta})` : ""}`;
        })
        .join(" · ")
    );
  } else if (t === "flow") {
    if (b.title) lines.push(`### ${b.title}`, "");
    (b.steps || []).forEach((s, i) => lines.push(`${i + 1}. **${s.title}**, ${s.body}`));
  } else if (t === "timeline") {
    if (b.title) lines.push(`### ${b.title}`, "");
    (b.phases || []).forEach((p) => lines.push(`- **${p.label}** ${p.status ? `(${p.status})` : ""}, ${p.body}`));
  } else if (t === "table" || t === "references" || t === "decision-matrix" || t === "risk-register") {
    let cols, rows;
    if (t === "table") { cols = b.columns; rows = b.rows; }
    else if (t === "references") { cols = ["Source", "Signal", "Use"]; rows = (b.items || []).map((r) => [r.label, r.signal || "", r.use || ""]); }
    else if (t === "decision-matrix") { cols = ["Option", ...(b.criteria || [])]; rows = (b.options || []).map((o) => [o.name, ...(o.scores || [])]); }
    else { cols = ["Risk", "Likelihood", "Impact", "Mitigation"]; rows = (b.risks || []).map((r) => [r.risk, r.likelihood || "", r.impact || "", r.mitigation || ""]); }
    if (b.title) lines.push(`### ${b.title}`, "");
    cols = cols || [];
    lines.push(`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`);
    (rows || []).forEach((r) => lines.push(`| ${(Array.isArray(r) ? r : []).join(" | ")} |`));
  } else if (t === "callout") {
    lines.push(`> ${b.title ? "**" + b.title + "** " : ""}${b.body}`);
  } else if (t === "code") {
    lines.push("```" + (b.lang || ""), b.code, "```");
  } else if (t === "tabs") {
    (b.tabs || []).forEach((tab) => { lines.push(`### ${tab.label}`, ""); (tab.blocks || []).forEach((c) => lines.push(blockMd(c))); });
  } else if (t === "faq") {
    if (b.title) lines.push(`### ${b.title}`, "");
    (b.items || []).forEach((it) => lines.push(`**${it.q}**`, "", it.a, ""));
  } else if (t === "action-items") {
    if (b.title) lines.push(`### ${b.title}`, "");
    (b.items || []).forEach((it) => lines.push(`- [${it.status === "done" ? "x" : " "}] ${it.title}${it.owner ? ` (@${it.owner})` : ""}`));
  } else if (t === "assumptions") {
    lines.push(`### ${b.title || "Assumptions & open questions"}`, "");
    (b.items || []).forEach((it) => lines.push(`- (${it.kind || "assumption"}/${it.status || "unverified"}) ${it.statement}`));
  } else if (t === "glossary") {
    lines.push(`### ${b.title || "Glossary"}`, "");
    (b.terms || []).forEach((tt) => lines.push(`- **${tt.term}**: ${tt.definition}`));
  } else if (t === "diagram") {
    if (b.title) lines.push(`### ${b.title}`, "");
    lines.push("```" + (b.format || "dot"), b.spec, "```");
  } else if (t === "review-board") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.candidates || []).forEach((c) => {
      lines.push(`### ${c.title}${c.status ? ` (${c.status})` : ""}`, "");
      if (c.summary) lines.push(c.summary, "");
      if (c.body) lines.push(c.body, "");
      (c.blocks || []).forEach((x) => lines.push(blockMd(x)));
      Object.entries(c.details || {}).forEach(([k, v]) => lines.push(`- **${k}:** ${v}`));
      lines.push("");
    });
  } else if (t === "patch-set") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    (b.patches || []).forEach((p) => {
      lines.push(`### ${p.title || p.id || "Patch"}`, "");
      if (p.summary) lines.push(p.summary, "");
      if (p.operation) lines.push(`- **Operation:** ${p.operation}`);
      if (p.status) lines.push(`- **Status:** ${p.status}`);
      if (p.risk) lines.push(`- **Risk:** ${p.risk}`);
      if (p.files && p.files.length) lines.push(`- **Files:** ${p.files.join(", ")}`);
      if (p.workItems && p.workItems.length) lines.push(`- **Work items:** ${p.workItems.join(", ")}`);
      if (p.verification && p.verification.length) lines.push(`- **Verification:** ${p.verification.join(", ")}`);
      Object.entries(p.details || {}).forEach(([k, v]) => lines.push(`- **${k}:** ${v}`));
      if (p.diff) lines.push("", "```diff", p.diff, "```", "");
      lines.push("");
    });
  } else if (t === "diff-view") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    const files = parseUnifiedDiff(b.diff || "", b.filename || b.title || "diff");
    if (files.length) {
      lines.push(files.map((file) => `${diffFileLabel(file)} (+${file.additions}/-${file.deletions})`).join(", "), "");
    }
    lines.push("```diff", b.diff || "", "```", "");
  } else if (t === "code-editor") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    lines.push("```" + (b.lang || ""), b.code || "", "```", "");
  } else if (t === "verification-run") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    (b.runs || []).forEach((r) => {
      lines.push(`### ${r.title || r.id || "Run"}${r.status ? ` (${r.status})` : ""}`, "");
      if (r.command) lines.push("```sh", r.command, "```", "");
      if (r.expected) lines.push(`- **Expected:** ${r.expected}`);
      if (r.actual) lines.push(`- **Actual:** ${r.actual}`);
      if (r.notes) lines.push("", r.notes);
      lines.push("");
    });
  } else if (t === "evidence-log") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.items || []).forEach((it) => {
      lines.push(`### ${it.title || it.id || "Evidence"}`, "");
      ["kind", "source", "trust", "created", "url"].forEach((k) => { if (it[k]) lines.push(`- **${k}:** ${it[k]}`); });
      if (it.body) lines.push("", it.body);
      lines.push("");
    });
  } else if (t === "trust-report") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    if (b.sources?.length) {
      lines.push("### Sources", "");
      (b.sources || []).forEach((s) => {
        lines.push(`- **${s.id || s.label || "source"}:** ${s.label || s.url || ""}${s.trust ? ` (${s.trust})` : ""}`);
        if (s.summary) lines.push(`  ${s.summary}`);
      });
      lines.push("");
    }
    if (b.claims?.length) {
      lines.push("### Claims", "");
      (b.claims || []).forEach((c) => {
        lines.push(`- **${c.claim || c.title || c.id || "Claim"}**${c.status ? ` (${c.status})` : ""}${c.confidence ? `, confidence: ${c.confidence}` : ""}`);
        if (c.sources?.length) lines.push(`  - Sources: ${c.sources.join(", ")}`);
        if (c.evidence?.length) lines.push(`  - Evidence: ${c.evidence.join(", ")}`);
        if (c.notes) lines.push(`  - Notes: ${c.notes}`);
      });
    }
  } else if (t === "verdict-gate") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.prompt) lines.push(b.prompt, "");
    if (b.verdict) lines.push(`- **Verdict:** ${b.verdict}`);
  } else if (t === "process-receipt") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    ["outcome", "owner", "date", "model"].forEach((k) => { if (b[k]) lines.push(`- **${k}:** ${b[k]}`); });
    if (b.changedFiles?.length) lines.push(`- **Changed files:** ${b.changedFiles.join(", ")}`);
    if (b.commands?.length) lines.push(`- **Commands:** ${b.commands.join(", ")}`);
    if (b.followUps?.length) lines.push(`- **Follow-ups:** ${b.followUps.join(", ")}`);
  } else if (t === "finding-list") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.findings || []).forEach((it) => {
      lines.push(`### ${it.title || it.id || "Finding"}${it.severity ? ` (${it.severity})` : ""}`, "");
      if (it.body) lines.push(it.body, "");
      if (it.recommendation) lines.push(`- **Recommendation:** ${it.recommendation}`);
      if (it.files?.length) lines.push(`- **Files:** ${it.files.join(", ")}`);
      lines.push("");
    });
  } else if (t === "comment-thread") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.threads || []).forEach((thread) => {
      lines.push(`### ${thread.subject || thread.id || "Thread"}`, "");
      (thread.comments || []).forEach((c) => lines.push(`- **${c.author || "comment"}:** ${c.body || ""}`));
      lines.push("");
    });
  } else if (t === "cycle-board") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.cycles || []).forEach((c) => lines.push(`- **${c.title || c.id || "Cycle"}**${c.status ? ` (${c.status})` : ""}: ${c.summary || c.body || ""}`));
  } else if (t === "integration-report") {
    if (b.title) lines.push(`## ${b.title}`, "");
    if (b.summary) lines.push(b.summary, "");
    ["producer", "consumer", "status", "version", "nextStep"].forEach((k) => { if (b[k]) lines.push(`- **${k}:** ${b[k]}`); });
    (b.items || []).forEach((it) => lines.push(`- **${it.title || it.id || "Item"}:** ${it.summary || it.body || ""}`));
  } else if (t === "upstream-response") {
    if (b.title) lines.push(`## ${b.title}`, "");
    ["upstream", "status", "url", "request", "response", "nextStep"].forEach((k) => { if (b[k]) lines.push(`- **${k}:** ${b[k]}`); });
  } else if (t === "release-checklist") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.gates || []).forEach((g) => lines.push(`- ${g.status === "done" || g.status === "passed" ? "[x]" : "[ ]"} ${g.title}${g.required ? " (required)" : ""}${g.evidence ? `, ${g.evidence}` : ""}`));
  } else if (t === "decision-log") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.decisions || []).forEach((d) => lines.push(`- **${d.decision || d.title || d.id || "Decision"}**${d.owner ? ` (${d.owner})` : ""}: ${d.rationale || d.body || ""}`));
  } else if (t === "process-board") {
    if (b.title) lines.push(`## ${b.title}`, "");
    (b.items || []).forEach((it) => {
      lines.push(`### ${it.title}${it.status ? ` (${it.status})` : ""}`, "");
      if (it.summary) lines.push(it.summary, "");
      if (it.owner) lines.push(`- **Owner:** ${it.owner}`);
      if (it.priority) lines.push(`- **Priority:** ${it.priority}`);
      if (it.verdict) lines.push(`- **Verdict:** ${it.verdict}`);
      if (it.files && it.files.length) lines.push(`- **Files:** ${it.files.join(", ")}`);
      if (it.dependencies && it.dependencies.length) lines.push(`- **Depends on:** ${it.dependencies.join(", ")}`);
      if (it.verification && it.verification.length) lines.push(`- **Verification:** ${it.verification.join(", ")}`);
      if (it.body) lines.push("", it.body, "");
      (it.blocks || []).forEach((x) => lines.push(blockMd(x)));
      Object.entries(it.details || {}).forEach(([k, v]) => lines.push(`- **${k}:** ${v}`));
      lines.push("");
    });
  }
  lines.push("");
  return lines.join("\n");
}

function toMarkdown(model) {
  const m = model.meta || {};
  // Double-quoted JSON scalars are valid YAML and safe against newlines / colons / quotes.
  const y = (v) => JSON.stringify(String(v));
  const fm = ["---", `title: ${y(m.title || "")}`, m.slug ? `slug: ${y(m.slug)}` : "", m.status ? `status: ${y(m.status)}` : "", m.updated ? `updated: ${y(m.updated)}` : "", "---", ""].filter(Boolean);
  return fm.join("\n") + "\n" + (model.blocks || []).map(blockMd).join("\n");
}

function agentDigest(model) {
  const m = model.meta || {};
  const out = [`# ${m.title || "Brief"} [${m.status || "draft"}]`];
  const walk = (blocks) =>
    (blocks || []).forEach((b) => {
      if (b.type === "hero" && b.lede) out.push(`SUMMARY: ${b.lede}`);
      else if (b.type === "section") { out.push(`## ${b.title}`); walk(b.blocks); }
      else if (b.title || b.heading) out.push(`- ${b.type}: ${b.title || b.heading}`);
      else out.push(`- ${b.type}`);
    });
  walk(model.blocks);
  return out.join("\n");
}

// ---- glossary collection ---------------------------------------------------

function collectGlossary(blocks, map) {
  (blocks || []).forEach((b) => {
    if (b.type === "glossary") (b.terms || []).forEach((t) => map.set(t.term.toLowerCase(), t.definition));
    if (b.blocks) collectGlossary(b.blocks, map);
    if (b.left) collectGlossary(b.left, map);
    if (b.right) collectGlossary(b.right, map);
    if (b.tabs) b.tabs.forEach((t) => collectGlossary(t.blocks, map));
    if (b.candidates) b.candidates.forEach((c) => c.blocks && collectGlossary(c.blocks, map));
    if (b.items) b.items.forEach((it) => it.blocks && collectGlossary(it.blocks, map));
  });
}

// ---- footnotes -------------------------------------------------------------

function collectFootnotes(blocks, map) {
  let n = map.size;
  const visit = (arr) =>
    (arr || []).forEach((b) => {
      if (b.type === "footnotes")
        (b.items || []).forEach((it) => {
          if (it.id && !map.has(it.id)) map.set(it.id, { num: ++n, text: it.text });
        });
      if (b.blocks) visit(b.blocks);
      if (b.left) visit(b.left);
      if (b.right) visit(b.right);
      if (b.tabs) b.tabs.forEach((t) => visit(t.blocks));
      if (b.candidates) b.candidates.forEach((c) => c.blocks && visit(c.blocks));
      if (b.items) b.items.forEach((it) => it.blocks && visit(it.blocks));
    });
  visit(blocks);
}

// ---- charts: data -> inline SVG (hand-rolled, no dependency) ----------------

const fmtNum = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(v));

function chartSvg(b) {
  const data = (b.data || []).map((d) => ({ label: String(d.label ?? ""), value: Number(d.value) || 0 }));
  if (!data.length) return "";
  const type = b.chartType || "bar";
  const W = 640, H = 300, padL = 52, padB = 46, padT = 24, padR = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value), 0);
  const top = max || 1, bottom = Math.min(0, min);
  const span = top - bottom || 1;
  const y = (v) => padT + ih - ((v - bottom) / span) * ih;
  const n = data.length;
  const y0 = y(0);
  const tickCount = 4;
  let inner = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" class="ds-chart-axis" stroke="var(--ds-line-2)"/>`;
  inner += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="ds-chart-axis" stroke="var(--ds-line-2)"/>`;
  for (let i = 0; i <= tickCount; i++) {
    const value = bottom + (span * i) / tickCount;
    const ty = y(value);
    inner += `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${W - padR}" y2="${ty.toFixed(1)}" class="ds-chart-grid" stroke="var(--ds-line)"/>`;
    inner += `<text x="${padL - 9}" y="${(ty + 4).toFixed(1)}" text-anchor="end" class="ds-chart-tick" fill="var(--ds-ink-3)">${esc(fmtNum(Math.round(value * 100) / 100))}</text>`;
  }
  inner += `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${W - padR}" y2="${y0.toFixed(1)}" class="ds-chart-zero" stroke="var(--ds-line-strong)"/>`;
  if (type === "bar") {
    const gap = iw / n;
    const bw = Math.min(gap * 0.62, 56);
    data.forEach((d, i) => {
      const cx = padL + gap * i + gap / 2;
      const yy = y(d.value);
      inner += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${Math.min(yy, y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(y0 - yy).toFixed(1)}" rx="3" fill="var(--ds-accent)"><title>${esc(d.label)}: ${esc(fmtNum(d.value))}</title></rect>`;
      inner += `<text x="${cx.toFixed(1)}" y="${(d.value >= 0 ? Math.min(yy, y0) - 7 : Math.max(yy, y0) + 15).toFixed(1)}" text-anchor="middle" class="ds-chart-value" fill="var(--ds-ink-2)">${esc(fmtNum(d.value))}</text>`;
      inner += `<text x="${cx.toFixed(1)}" y="${H - padB + 21}" text-anchor="middle" class="ds-chart-label" fill="var(--ds-ink-3)">${esc(d.label)}</text>`;
    });
  } else {
    const step = n > 1 ? iw / (n - 1) : 0;
    const pts = data.map((d, i) => `${(padL + step * i).toFixed(1)},${y(d.value).toFixed(1)}`);
    if (type === "area")
      inner += `<polygon points="${padL},${y0.toFixed(1)} ${pts.join(" ")} ${(padL + step * (n - 1)).toFixed(1)},${y0.toFixed(1)}" fill="var(--ds-accent)" fill-opacity="0.12"/>`;
    inner += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--ds-accent)" stroke-width="2"/>`;
    data.forEach((d, i) => {
      const cx = padL + step * i;
      const cy = y(d.value);
      inner += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="var(--ds-accent)"><title>${esc(d.label)}: ${esc(fmtNum(d.value))}</title></circle>`;
      inner += `<text x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" text-anchor="middle" class="ds-chart-value" fill="var(--ds-ink-2)">${esc(fmtNum(d.value))}</text>`;
      inner += `<text x="${cx.toFixed(1)}" y="${H - padB + 21}" text-anchor="middle" class="ds-chart-label" fill="var(--ds-ink-3)">${esc(d.label)}</text>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ds-chart-svg" role="img" aria-label="${esc(b.title || type + " chart")}">${inner}</svg>`;
}

function buildToc(blocks) {
  const toc = [];
  const titledProcessBlocks = new Set([
    "patch-set",
    "diff-view",
    "code-editor",
    "verification-run",
    "evidence-log",
    "trust-report",
    "verdict-gate",
    "process-receipt",
    "finding-list",
    "comment-thread",
    "cycle-board",
    "integration-report",
    "upstream-response",
    "release-checklist",
    "decision-log",
  ]);
  (blocks || []).forEach((b) => {
    if (b.type === "hero") toc.push({ id: b.id, label: b.title, level: 1 });
    else if (b.type === "section") toc.push({ id: b.id, label: b.title, level: 2 });
    else if (b.type === "review-board" && b.title) toc.push({ id: b.id, label: b.title, level: 2 });
    else if (b.type === "process-board" && b.title) toc.push({ id: b.id, label: b.title, level: 2 });
    else if (titledProcessBlocks.has(b.type) && b.title) toc.push({ id: b.id, label: b.title, level: 2 });
  });
  return toc;
}

import { CSS } from "./theme/tokens.css.mjs";
import { RUNTIME } from "./runtime/runtime.mjs";
import { THEMES } from "./themes.mjs";
import { applyPresentationOptions } from "./presentation.mjs";
import { resolveSkin, skinNames } from "./skins.mjs";

// Visit every block in the tree, including nested ones.
function eachBlock(blocks, fn) {
  (blocks || []).forEach((b) => {
    fn(b);
    if (b.blocks) eachBlock(b.blocks, fn);
    if (b.left) eachBlock(b.left, fn);
    if (b.right) eachBlock(b.right, fn);
    if (b.tabs) b.tabs.forEach((t) => eachBlock(t.blocks, fn));
    if (b.candidates) b.candidates.forEach((c) => c.blocks && eachBlock(c.blocks, fn));
    if (b.items) b.items.forEach((it) => it.blocks && eachBlock(it.blocks, fn));
  });
}

function stripBuildFields(model) {
  eachBlock(model.blocks || [], (b) => {
    for (const k in b) if (k.charAt(0) === "_") delete b[k];
  });
  return model;
}

// Assign stable ids to every block (so a React render and the JS render agree).
function assignIds(blocks) {
  let s = 0;
  const go = (arr) =>
    (arr || []).forEach((b) => {
      if (!b.id) b.id = slugify(b.title || b.heading || b.type) + "-" + (s++).toString(36);
      if (b.blocks) go(b.blocks);
      if (b.left) go(b.left);
      if (b.right) go(b.right);
      if (b.tabs) b.tabs.forEach((t) => go(t.blocks));
      if (b.candidates) b.candidates.forEach((c) => c.blocks && go(c.blocks));
      if (b.items) b.items.forEach((it) => it.blocks && go(it.blocks));
    });
  go(blocks);
}

const LANG_ALIAS = { js: "javascript", ts: "typescript", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", md: "markdown", py: "python" };
const normLang = (l) => (l ? (LANG_ALIAS[String(l).toLowerCase()] || String(l).toLowerCase()) : "");

// Build-time enrichment: Shiki syntax highlighting + Graphviz DOT -> inline SVG.
// Results are stashed on `_hl` / `_svg` (stripped from the embedded JSON island).
async function enrich(model, baseDir) {
  const codeBlocks = [];
  const dotBlocks = [];
  const mermaidBlocks = [];
  const figureBlocks = [];
  const mathBlocks = [];
  eachBlock(model.blocks || [], (b) => {
    if (b.type === "code") codeBlocks.push(b);
    else if (b.type === "diagram") {
      const fmt = String(b.format || "dot").toLowerCase();
      if (fmt === "mermaid") mermaidBlocks.push(b);
      else dotBlocks.push(b);
    } else if (b.type === "figure") figureBlocks.push(b);
    else if (b.type === "math") mathBlocks.push(b);
  });

  if (codeBlocks.length) {
    try {
      const shiki = await import("shiki");
      const wanted = [...new Set(codeBlocks.map((b) => normLang(b.lang)).filter(Boolean))].filter((l) => l in shiki.bundledLanguages);
      const hl = await shiki.createHighlighter({ themes: ["github-light", "github-dark"], langs: wanted });
      const loaded = new Set(hl.getLoadedLanguages());
      for (const b of codeBlocks) {
        const want = normLang(b.lang);
        const lang = want && loaded.has(want) ? want : "text";
        try {
          b._hl = hl.codeToHtml(String(b.code || ""), { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
        } catch {
          b._hl = null;
        }
      }
    } catch {
      /* highlighting unavailable, fall back to plain code */
    }
  }

  if (dotBlocks.length) {
    try {
      const { Graphviz } = await import("@hpcc-js/wasm-graphviz");
      const graphviz = await Graphviz.load();
      for (const b of dotBlocks) {
        try {
          b._svg = graphviz.dot(String(b.spec || ""));
        } catch {
          b._svg = null;
        }
      }
    } catch {
      /* graphviz unavailable, fall back to source */
    }
  }

  if (mermaidBlocks.length) {
    let rendered = false;
    try {
      const { withBrowser } = await import("./headless.mjs");
      await withBrowser(async (browser) => {
        if (!browser) return; // playwright unavailable, fall back to source
        const { createRequire } = await import("node:module");
        const { dirname, join } = await import("node:path");
        const { readFileSync } = await import("node:fs");
        const require = createRequire(import.meta.url);
        const mjs = readFileSync(join(dirname(require.resolve("mermaid/package.json")), "dist/mermaid.min.js"), "utf8");
        const page = await browser.newPage();
        await page.setContent("<!doctype html><html><body></body></html>");
        await page.addScriptTag({ content: mjs });
        await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict" }));
        rendered = true; // toolchain present; individual diagrams may still error
        for (let i = 0; i < mermaidBlocks.length; i++) {
          const b = mermaidBlocks[i];
          try {
            b._svg = await page.evaluate(async (a) => (await window.mermaid.render(a[1], a[0])).svg, [String(b.spec || ""), "m" + i]);
          } catch {
            b._svg = null;
          }
        }
        await page.close();
      });
    } catch {
      /* mermaid/playwright unavailable, fall back to source */
    }
    if (!rendered) {
      console.warn("dossier: Mermaid diagrams render as their source. Enable rendering with: npm i playwright mermaid && npx playwright install chromium");
    }
  }

  if (figureBlocks.length) {
    const { readFileSync } = await import("node:fs");
    const { resolve, extname } = await import("node:path");
    const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif" };
    for (const b of figureBlocks) {
      const src = String(b.src || "");
      if (!src || /^(data:|https?:)/i.test(src)) {
        b._src = src; // pass through data URIs and remote URLs as-is
        continue;
      }
      try {
        const file = baseDir ? resolve(baseDir, src) : src;
        const mime = MIME[extname(file).toLowerCase()] || "application/octet-stream";
        b._src = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
      } catch {
        b._src = src; // unreadable, leave the path
      }
    }
  }

  if (mathBlocks.length) {
    try {
      const katex = (await import("katex")).default;
      for (const b of mathBlocks) {
        try {
          b._math = katex.renderToString(String(b.tex || ""), { output: "mathml", displayMode: b.display !== false, throwOnError: false });
        } catch {
          b._math = null;
        }
      }
    } catch {
      /* katex unavailable, fall back to source */
    }
  }
}

export async function generate(model, opts = {}) {
  applyPresentationOptions(model, opts);
  // Underscore fields (_svg/_math/_hl/_src) are injected into HTML unescaped and must
  // only ever come from build-time enrichment of trusted libraries. Drop any that an
  // author smuggled in via the input model so they cannot inject raw markup.
  stripBuildFields(model);
  await enrich(model, opts.baseDir);
  const meta = model.meta || {};
  const ctx = { seq: 0, glossary: new Map(), footnotes: new Map(), baseUrl: meta.baseUrl || "" };
  collectGlossary(model.blocks, ctx.glossary);
  collectFootnotes(model.blocks, ctx.footnotes);
  // assign ids up front so TOC + render agree
  assignIds(model.blocks);

  const toc = buildToc(model.blocks);
  const body = (model.blocks || []).map((b) => renderBlock(b, ctx)).join("\n");
  const md = toMarkdown(model);
  const digest = agentDigest(model);
  const html = renderShell(model, { body, toc, md, digest });
  const embedHtml = renderShell(model, { body, toc, md, digest, chrome: "embed" });
  return { html, embedHtml, md, digest };
}

// Shared HTML shell, used by the JS generator and the React SSR port so both
// produce byte-identical scaffolding (single source of truth).
export function renderShell(model, { body, toc, md, digest, generator = "dossier", footer = "Generated with Dossier", chrome = "full" }) {
  const meta = model.meta || {};
  const skin = resolveSkin(meta.skin);
  if (meta.skin && !skin) {
    throw new Error(`unknown skin: ${meta.skin} (supported: ${skinNames().join(", ")})`);
  }
  const isEmbed = chrome === "embed";
  const wordCount = (md.match(/\S+/g) || []).length;
  const readMin = Math.max(1, Math.round(wordCount / 220));

  // Sanitize so a theme value cannot break out of the declaration or the <style> block.
  const themeVars = Object.entries(meta.theme || {})
    .map(([k, v]) => `--ds-${String(k).replace(/[^a-z0-9-]/gi, "")}: ${String(v).replace(/[<>{};]/g, "")};`)
    .join("");
  const themeCss = themeVars ? `:root{${themeVars}}[data-theme="dark"]{${themeVars}}` : "";
  const skinCss = skin ? `\n/* skin:${String(meta.skin).replace(/[^a-z0-9-]/gi, "")} */\n${skin.css}` : "";
  const embedCss = isEmbed
    ? `
html[data-dossier-embed="true"]{scroll-padding-top:0}
body.ds-embed-body{background:transparent}
body.ds-embed-body::before{display:none!important}
.ds-embed-shell{width:min(var(--ds-frame),calc(100% - 32px));margin:0 auto;padding:24px 0 32px}
.ds-embed-shell .ds-lifecycle{margin:0 0 18px}
.ds-embed-content>.ds-block:first-child{margin-top:0}
@media (max-width:720px){.ds-embed-shell{width:calc(100% - 24px);padding:18px 0 26px}}
`
    : "";
  const skinScript = skin && skin.script ? `<script id="ds-skin-runtime">${skin.script}</script>` : "";

  const tocHtml = toc
    .map((t) => `<a class="ds-toc-link lvl-${t.level}" href="#${esc(t.id)}" data-toc="${esc(t.id)}">${esc(t.label)}</a>`)
    .join("");

  const lifecycle =
    meta.lifecycle && meta.features?.lifecycleBanner !== false
      ? `<div class="ds-lifecycle stage-${esc(meta.lifecycle.stage || "")}"><b>${esc(meta.lifecycle.stage || "")}</b> ${esc(meta.lifecycle.note || "")}${meta.lifecycle.promoteTo ? ` → ${esc(meta.lifecycle.promoteTo)}` : ""}</div>`
      : "";

  const crumbs = (meta.crumbs || []).join(" / ");
  const modelJson = JSON.stringify(model, (k, v) => (k.charAt(0) === "_" ? undefined : v)).replace(/</g, "\\u003c");
  const htmlAttrs = `lang="en" data-theme="light"${skin ? ` data-skin="${esc(meta.skin)}"` : ""}${isEmbed ? ' data-dossier-embed="true"' : ""}`;
  const dataIslands = `<script type="application/json" id="ds-themes">${JSON.stringify(THEMES).replace(/</g, "\\u003c")}</script>

<script type="application/json" id="dossier-model">${modelJson}</script>
<script type="text/markdown" id="dossier-markdown">${esc(md)}</script>
<script type="text/plain" id="dossier-digest">${esc(digest)}</script>
<script>${RUNTIME}</script>
${skinScript}`;

  if (isEmbed) {
    return `<!doctype html>
<html ${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${esc(generator)}/${esc(model.dossierVersion || "1.0")}">
<title>${esc(meta.title || "Dossier")} embed</title>
<style>${CSS}${skinCss}${embedCss}${themeCss}</style>
</head>
<body class="ds-embed-body">
<div class="ds-embed-shell">
${lifecycle}
<main class="ds-content ds-embed-content" id="main" tabindex="-1">
${body}
</main>
</div>
<div class="ds-toast" data-toast role="status" aria-live="polite"></div>
${dataIslands}
</body>
</html>`;
  }

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${esc(generator)}/${esc(model.dossierVersion || "1.0")}">
<title>${esc(meta.title || "Dossier")}</title>
<style>${CSS}${skinCss}${themeCss}</style>
</head>
<body>
<a class="ds-skip" href="#main">Skip to content</a>
<div class="ds-progress"><div class="ds-progress-bar"></div></div>
<div class="ds-shell">
<header class="ds-topbar">
<div class="ds-brand"><span class="ds-mark"></span><span class="ds-crumbs">${esc(crumbs || meta.title || "")}</span></div>
<div class="ds-tools">
<button class="ds-btn ds-search-btn" type="button" data-palette-open><span class="ds-i"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.4-3.4"></path></svg></span><span class="ds-search-label">Search</span><kbd>⌘K</kbd></button>
<span class="ds-dirty-status" data-dirty-status hidden>state</span>
<button class="ds-btn" type="button" data-edit-toggle title="Edit text in place">Edit</button>
<button class="ds-btn" type="button" data-block-editor-open title="Edit block structure">Blocks</button>
<button class="ds-btn" type="button" data-evidence-open title="Attach evidence">Evidence</button>
<button class="ds-btn ds-swatch" type="button" data-studio-open title="Theme studio"><span></span></button>
<button class="ds-btn" type="button" data-theme-toggle aria-label="Toggle theme">◐</button>
<details class="ds-menu"><summary>Export</summary><div class="ds-menu-list">
<button class="ds-btn" type="button" data-action="open-export-center">Open Export Center</button>
<button class="ds-btn" type="button" data-action="copy-md">Copy Markdown</button>
<button class="ds-btn" type="button" data-action="copy-digest">Copy for AI (digest)</button>
<button class="ds-btn" type="button" data-action="download-md">Download Markdown</button>
<button class="ds-btn" type="button" data-action="download-json">Download source JSON</button>
<button class="ds-btn" type="button" data-action="download-state-json">Download state packet</button>
<button class="ds-btn" type="button" data-action="download-merged-json">Download merged JSON</button>
<button class="ds-btn" type="button" data-action="download-handoff-json">Download agent handoff</button>
<button class="ds-btn" type="button" data-action="copy-prompt">Copy AI prompt</button>
<button class="ds-btn" type="button" data-action="print-pdf">Print / save PDF</button>
<button class="ds-btn" type="button" data-action="view-source">View source</button>
</div></details>
</div>
</header>
${lifecycle}
<div class="ds-layout${toc.length ? "" : " no-toc"}">
<main class="ds-content" id="main" tabindex="-1">
${body}
</main>
${toc.length ? `<aside class="ds-toc"><div class="ds-search"><input type="search" placeholder="Search…" data-search></div><div class="ds-toc-head">On this page</div>${tocHtml}</aside>` : ""}
</div>
<footer class="ds-footer">${readMin} min read · ${wordCount.toLocaleString("en-US")} words · ${esc(footer)}${meta.updated ? " · " + esc(meta.updated) : ""}</footer>
</div>
<button class="ds-totop" type="button" data-totop aria-label="Back to top">↑</button>

<div class="ds-palette" data-palette hidden><div class="ds-palette-box"><input type="text" placeholder="Jump to or run an action…" data-palette-input><div class="ds-palette-list" data-palette-list></div></div></div>
<div class="ds-modal" data-source-modal hidden><div class="ds-modal-box"><div class="ds-modal-head"><strong>Markdown source</strong><button class="ds-btn" type="button" data-source-close>Close</button></div><textarea readonly data-source-text></textarea></div></div>
<div class="ds-tool-modal" data-export-modal hidden><div class="ds-tool-card ds-tool-wide"><div class="ds-tool-head"><div><strong>Export Center</strong><p data-export-summary>Choose exactly what should leave this artifact.</p></div><button class="ds-btn ds-btn-line" type="button" data-tool-close>Close</button></div><div class="ds-export-grid"><button class="ds-btn ds-btn-line" type="button" data-export-kind="source">Preview source JSON</button><button class="ds-btn ds-btn-line" type="button" data-export-kind="state">Preview state packet</button><button class="ds-btn ds-btn-line" type="button" data-export-kind="merged">Preview merged JSON</button><button class="ds-btn ds-btn-line" type="button" data-export-kind="handoff">Preview agent handoff</button><button class="ds-btn ds-btn-line" type="button" data-export-kind="prompt">Preview AI prompt</button><label class="ds-file-btn">Import state packet<input type="file" accept="application/json" data-state-file></label><label class="ds-file-btn">Compare revision<input type="file" accept="application/json" data-revision-file></label></div><div class="ds-export-grid"><button class="ds-btn" type="button" data-export-download="source">Download source JSON</button><button class="ds-btn" type="button" data-export-download="state">Download state packet</button><button class="ds-btn" type="button" data-export-download="merged">Download merged JSON</button><button class="ds-btn" type="button" data-export-download="handoff">Download handoff</button><button class="ds-btn" type="button" data-export-download="prompt">Download prompt</button><button class="ds-btn ds-btn-line" type="button" data-action="print-pdf">Print / save PDF</button><button class="ds-btn ds-btn-line" type="button" data-export-copy>Copy preview</button></div><div class="ds-export-preview-head"><strong data-export-preview-title>Current state packet</strong></div><textarea class="ds-export-preview" readonly data-export-preview></textarea><textarea class="ds-export-preview ds-revision-result" readonly data-revision-result placeholder="Revision diff appears here after comparing another dossier JSON."></textarea></div></div>
<div class="ds-tool-modal" data-block-editor-modal hidden><div class="ds-tool-card"><div class="ds-tool-head"><div><strong>Block editor</strong><p>Reorder, delete, or add top-level blocks, then download merged JSON and rebuild.</p></div><button class="ds-btn ds-btn-line" type="button" data-tool-close>Close</button></div><div class="ds-blockedit-list" data-block-editor-list></div><div class="ds-tool-row"><select data-block-editor-type><option>prose</option><option>section</option><option>callout</option><option>table</option><option>code-editor</option><option>process-board</option><option>patch-set</option><option>verification-run</option><option>release-checklist</option></select><input type="text" data-block-editor-title placeholder="New block title"><button class="ds-btn" type="button" data-block-editor-add>Add block</button></div><p class="ds-tool-note" data-block-editor-status></p></div></div>
<div class="ds-tool-modal" data-evidence-modal hidden><div class="ds-tool-card"><div class="ds-tool-head"><div><strong>Attach evidence</strong><p>Add source material to the state packet and merged dossier.</p></div><button class="ds-btn ds-btn-line" type="button" data-tool-close>Close</button></div><div class="ds-field-grid"><label>Id<input type="text" data-evidence-id placeholder="auto-from-title"></label><label>Title<input type="text" data-evidence-title placeholder="Browser smoke"></label><label>Kind<input type="text" data-evidence-kind placeholder="manual"></label><label>Trust<select data-evidence-trust><option>medium</option><option>high</option><option>low</option></select></label><label class="wide">Source<input type="text" data-evidence-source placeholder="command, URL, person, file"></label><label class="wide">Body<textarea data-evidence-body placeholder="What was observed?"></textarea></label></div><div class="ds-tool-actions"><button class="ds-btn" type="button" data-evidence-add>Add evidence</button></div></div></div>
<div class="ds-toast" data-toast role="status" aria-live="polite"></div>
<div class="ds-studio" data-studio hidden>
<div class="ds-studio-head"><strong>Theme studio</strong><button class="ds-btn" type="button" data-studio-close>Close</button></div>
<label class="ds-studio-row">Accent <input type="color" data-studio-accent></label>
<div class="ds-studio-presets">${Object.entries(THEMES).filter(([, v]) => v.accent).map(([k, v]) => `<button class="ds-studio-sw" type="button" data-studio-preset="${esc(k)}" title="${esc(k)}" style="background:${esc(v.accent)}"></button>`).join("")}</div>
<div class="ds-studio-actions"><button class="ds-btn ds-btn-line" type="button" data-studio-copy>Copy theme JSON</button><button class="ds-btn ds-btn-line" type="button" data-studio-reset>Reset</button></div>
</div>
${dataIslands}
</body>
</html>`;
}

// Plugin system: register a custom block renderer `(block, ctx) => htmlString`.
// Registered types become known to the renderer and the validator automatically.
function registerBlock(type, fn) {
  renderers[type] = fn;
}
function knownBlockTypes() {
  return Object.keys(renderers);
}

// Helpers reused by the React port (single source of truth).
export { esc, slugify, inlineMd, richTextHtml, toMarkdown, agentDigest, collectGlossary, collectFootnotes, buildToc, assignIds, enrich, stripBuildFields, renderBlock, registerBlock, knownBlockTypes, chartSvg };
// renderShell is exported at its definition (above).
