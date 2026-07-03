// Export a Dossier to other formats: DOCX (Word, mapping the common block types,
// inline markdown flattened to plain text) and PDF (the self-contained HTML printed
// through a headless browser).

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } from "docx";
import { chartSvg, enrich, parseUnifiedDiff } from "./generate.mjs";

// Print the already-rendered, self-contained HTML to a PDF buffer via Playwright.
export async function exportPdf(html, opts = {}) {
  const { withBrowser } = await import("./headless.mjs");
  return withBrowser(async (browser) => {
    if (!browser) throw new Error("PDF export needs Playwright. Install it: npm i playwright && npx playwright install chromium");
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      return await page.pdf({
        format: opts.size || "A4",
        printBackground: true,
        margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      });
    } finally {
      await page.close();
    }
  });
}

const plain = (s) =>
  String(s == null ? "" : s)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[\^[a-z0-9-]+\]/g, "")
    .replace(/\[@[a-z0-9-]+\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1");

const html = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const safeHref = (s) => (/^(javascript|data|vbscript):/i.test(String(s || "").trim().replace(/[\s\x00-\x1f]+/g, "")) ? "#" : String(s || ""));

function portableInlineHtml(s) {
  return html(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\^([a-z0-9-]+)\]/g, (_, id) => `<sup>[${html(id)}]</sup>`)
    .replace(/\[@([a-z0-9-]+)\]/g, (_, id) => `<sup>[@${html(id)}]</sup>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, label, href) => `<a href="${html(safeHref(href))}">${label}</a>`)
    .replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function paragraphHtml(markdown) {
  return String(markdown || "")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((part) => `<p>${portableInlineHtml(part.replace(/\n/g, " "))}</p>`)
    .join("\n");
}

function tableHtml(columns = [], rows = []) {
  if (!columns.length) return "";
  const head = `<tr>${columns.map((c) => `<th>${portableInlineHtml(c)}</th>`).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${portableInlineHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function codeMacro(code, language = "") {
  const lang = language ? `<ac:parameter ac:name="language">${html(language)}</ac:parameter>` : "";
  return `<ac:structured-macro ac:name="code">${lang}<ac:plain-text-body><![CDATA[${String(code || "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></ac:plain-text-body></ac:structured-macro>`;
}

const mdCell = (s) => String(plain(s)).replace(/\|/g, "\\|").replace(/\n/g, " ");
function mdTable(columns = [], rows = []) {
  if (!columns.length) return "";
  return [
    `| ${columns.map(mdCell).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...(rows || []).map((row) => `| ${(Array.isArray(row) ? row : []).map(mdCell).join(" | ")} |`),
  ].join("\n");
}

function portableMarkdown(s) {
  return String(s || "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\^([a-z0-9-]+)\]/g, "[^$1]")
    .replace(/\[@([a-z0-9-]+)\]/g, "[@$1]");
}

function childBlocks(block) {
  const out = [];
  if (block.blocks) out.push(...block.blocks);
  if (block.left) out.push(...block.left);
  if (block.right) out.push(...block.right);
  if (block.tabs) block.tabs.forEach((tab) => out.push(...(tab.blocks || [])));
  if (block.candidates) block.candidates.forEach((item) => out.push(...(item.blocks || [])));
  if (block.items) block.items.forEach((item) => out.push(...(item.blocks || [])));
  return out;
}

const citationAuthors = (item) => {
  const authors = item.authors || item.author;
  return Array.isArray(authors) ? authors.filter(Boolean).join(", ") : String(authors || "");
};

const citationSource = (item) => item.source || item.publisher || item.journal || item.site || "";
const citationParts = (item) =>
  [citationAuthors(item), item.year || item.date || "", citationSource(item), item.accessed ? `accessed ${item.accessed}` : ""].filter(Boolean);

function blockToConfluence(block, depth = 1) {
  const titleTag = "h" + Math.min(Math.max(depth, 1), 6);
  const out = [];
  switch (block.type) {
    case "hero":
      out.push(`<h1>${html(block.title || "Dossier")}</h1>`);
      if (block.lede) out.push(paragraphHtml(block.lede));
      break;
    case "section":
      out.push(`<${titleTag}>${html(block.title || "Section")}</${titleTag}>`);
      if (block.subtitle) out.push(paragraphHtml(block.subtitle));
      (block.blocks || []).forEach((child) => out.push(blockToConfluence(child, depth + 1)));
      break;
    case "prose":
      if (block.heading) out.push(`<${titleTag}>${html(block.heading)}</${titleTag}>`);
      out.push(paragraphHtml(block.markdown));
      break;
    case "callout":
      out.push(`<ac:structured-macro ac:name="info"><ac:rich-text-body>${block.title ? `<p><strong>${html(block.title)}</strong></p>` : ""}${paragraphHtml(block.body)}</ac:rich-text-body></ac:structured-macro>`);
      break;
    case "code":
    case "code-editor":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(codeMacro(block.code, block.lang));
      break;
    case "table":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(tableHtml(block.columns, block.rows));
      break;
    case "references":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(tableHtml(["Source", "Signal", "Use"], (block.items || []).map((r) => [r.url ? `[${r.label}](${r.url})` : r.label, r.signal || "", r.use || ""])));
      break;
    case "decision-matrix":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(tableHtml(["Option", ...(block.criteria || [])], (block.options || []).map((o) => [o.name, ...(o.scores || [])])));
      break;
    case "risk-register":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(tableHtml(["Risk", "Likelihood", "Impact", "Mitigation"], (block.risks || []).map((r) => [r.risk, r.likelihood || "", r.impact || "", r.mitigation || ""])));
      break;
    case "summary-cards":
      (block.cards || []).forEach((card) => out.push(`<${titleTag}>${html(card.title)}</${titleTag}>${paragraphHtml(card.body)}`));
      break;
    case "stat-strip":
      out.push(`<ul>${(block.stats || []).map((s) => `<li><strong>${html(s.value)}</strong> ${html(s.label)}</li>`).join("")}</ul>`);
      break;
    case "flow":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(`<ol>${(block.steps || []).map((step) => `<li><strong>${html(step.title)}</strong>: ${portableInlineHtml(step.body)}</li>`).join("")}</ol>`);
      break;
    case "timeline":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(`<ul>${(block.phases || []).map((phase) => `<li><strong>${html(phase.label)}</strong>${phase.status ? ` (${html(phase.status)})` : ""}: ${portableInlineHtml(phase.body)}</li>`).join("")}</ul>`);
      break;
    case "action-items":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(`<ul>${(block.items || []).map((item) => `<li>${item.status === "done" ? "[x]" : "[ ]"} ${portableInlineHtml(item.title)}${item.owner ? ` (@${html(item.owner)})` : ""}</li>`).join("")}</ul>`);
      break;
    case "review-board":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      (block.candidates || []).forEach((item) => {
        out.push(`<h${Math.min(depth + 1, 6)}>${html(item.title || item.id || "Item")}${item.status ? ` (${html(item.status)})` : ""}</h${Math.min(depth + 1, 6)}>`);
        if (item.summary) out.push(paragraphHtml(item.summary));
        if (item.body) out.push(paragraphHtml(item.body));
        (item.blocks || []).forEach((child) => out.push(blockToConfluence(child, depth + 2)));
      });
      break;
    case "process-board":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      (block.items || []).forEach((item) => {
        out.push(`<h${Math.min(depth + 1, 6)}>${html(item.title || item.id || "Work item")}${item.status ? ` (${html(item.status)})` : ""}</h${Math.min(depth + 1, 6)}>`);
        if (item.summary) out.push(paragraphHtml(item.summary));
        out.push(tableHtml(["Field", "Value"], [["Owner", item.owner || ""], ["Priority", item.priority || ""], ["Verdict", item.verdict || ""], ["Files", (item.files || []).join(", ")], ["Verification", (item.verification || []).join(", ")]]));
        if (item.body) out.push(paragraphHtml(item.body));
        (item.blocks || []).forEach((child) => out.push(blockToConfluence(child, depth + 2)));
      });
      break;
    case "patch-set":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      (block.patches || []).forEach((patch) => {
        out.push(`<h${Math.min(depth + 1, 6)}>${html(patch.title || patch.id || "Patch")}</h${Math.min(depth + 1, 6)}>`);
        if (patch.summary) out.push(paragraphHtml(patch.summary));
        if (patch.diff) out.push(codeMacro(patch.diff, "diff"));
      });
      break;
    case "diff-view":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(codeMacro(block.diff, "diff"));
      break;
    case "verification-run":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      (block.runs || []).forEach((run) => out.push(`<p><strong>${html(run.title || run.id || "Run")}</strong>${run.status ? ` (${html(run.status)})` : ""}</p>${run.command ? codeMacro(run.command, "bash") : ""}${run.actual ? paragraphHtml("Actual: " + run.actual) : ""}`));
      break;
    case "trust-report":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      if (block.summary) out.push(paragraphHtml(block.summary));
      if (block.sources?.length) out.push(tableHtml(["Source", "Kind", "Trust", "Summary"], block.sources.map((s) => [s.label || s.id || "", s.kind || "", s.trust || "", s.summary || s.url || ""])));
      if (block.claims?.length) out.push(tableHtml(["Claim", "Status", "Confidence", "Sources", "Evidence"], block.claims.map((c) => [c.claim || c.title || c.id || "", c.status || "", c.confidence || "", (c.sources || []).join(", "), (c.evidence || []).join(", ")])));
      break;
    case "figure":
      if (block.src) out.push(`<p><img src="${html(safeHref(block._src || block.src))}" alt="${html(block.alt || block.caption || "")}" /></p>`);
      if (block.caption) out.push(`<p><em>${portableInlineHtml(block.caption)}</em></p>`);
      break;
    case "chart":
      if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
      out.push(chartSvg(block));
      break;
    case "footnotes":
      out.push(`<${titleTag}>${html(block.title || "Notes")}</${titleTag}><ol>${(block.items || []).map((item) => `<li id="fn-${html(item.id)}">${portableInlineHtml(item.text)}</li>`).join("")}</ol>`);
      break;
    case "citations":
      out.push(`<${titleTag}>${html(block.title || "Citations")}</${titleTag}><ol>${(block.items || [])
        .map((item) => {
          const title = item.url ? `<a href="${html(safeHref(item.url))}">${html(item.title || item.label || item.id || "Untitled source")}</a>` : html(item.title || item.label || item.id || "Untitled source");
          const meta = citationParts(item).map(html).join(" · ");
          const note = item.note || item.notes ? `<p>${portableInlineHtml(item.note || item.notes)}</p>` : "";
          const quote = item.quote ? `<blockquote>${portableInlineHtml(item.quote)}</blockquote>` : "";
          return `<li id="cite-${html(item.id || "")}"><p>${title}${meta ? `<br /><em>${meta}</em>` : ""}</p>${quote}${note}</li>`;
        })
        .join("")}</ol>`);
      break;
    case "glossary":
      out.push(`<${titleTag}>${html(block.title || "Glossary")}</${titleTag}><ul>${(block.terms || []).map((term) => `<li><strong>${html(term.term)}</strong>: ${portableInlineHtml(term.definition)}</li>`).join("")}</ul>`);
      break;
    default:
      childBlocks(block).forEach((child) => out.push(blockToConfluence(child, depth)));
      if (!childBlocks(block).length && (block.title || block.summary || block.body)) {
        if (block.title) out.push(`<${titleTag}>${html(block.title)}</${titleTag}>`);
        if (block.summary || block.body) out.push(paragraphHtml(block.summary || block.body));
      }
  }
  return out.filter(Boolean).join("\n");
}

function blockToNotion(block, depth = 1) {
  const h = "#".repeat(Math.min(Math.max(depth, 1), 3));
  const out = [];
  switch (block.type) {
    case "hero":
      out.push(`# ${plain(block.title || "Dossier")}`);
      if (block.lede) out.push("", portableMarkdown(block.lede));
      break;
    case "section":
      out.push(`${h} ${plain(block.title || "Section")}`);
      if (block.subtitle) out.push("", portableMarkdown(block.subtitle));
      (block.blocks || []).forEach((child) => out.push("", blockToNotion(child, depth + 1)));
      break;
    case "prose":
      if (block.heading) out.push(`${h} ${plain(block.heading)}`, "");
      out.push(portableMarkdown(block.markdown));
      break;
    case "callout":
      out.push(`> ${block.title ? `**${plain(block.title)}** ` : ""}${portableMarkdown(block.body)}`);
      break;
    case "code":
    case "code-editor":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push("```" + (block.lang || ""), block.code || "", "```");
      break;
    case "table":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push(mdTable(block.columns, block.rows));
      break;
    case "references":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push(mdTable(["Source", "Signal", "Use"], (block.items || []).map((r) => [r.url ? `[${r.label}](${r.url})` : r.label, r.signal || "", r.use || ""])));
      break;
    case "decision-matrix":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push(mdTable(["Option", ...(block.criteria || [])], (block.options || []).map((o) => [o.name, ...(o.scores || [])])));
      break;
    case "risk-register":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push(mdTable(["Risk", "Likelihood", "Impact", "Mitigation"], (block.risks || []).map((r) => [r.risk, r.likelihood || "", r.impact || "", r.mitigation || ""])));
      break;
    case "summary-cards":
      (block.cards || []).forEach((card) => out.push(`### ${plain(card.title)}`, "", portableMarkdown(card.body)));
      break;
    case "flow":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.steps || []).forEach((step, index) => out.push(`${index + 1}. **${plain(step.title)}:** ${portableMarkdown(step.body)}`));
      break;
    case "timeline":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.phases || []).forEach((phase) => out.push(`- **${plain(phase.label)}**${phase.status ? ` (${phase.status})` : ""}: ${portableMarkdown(phase.body)}`));
      break;
    case "action-items":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.items || []).forEach((item) => out.push(`- [${item.status === "done" ? "x" : " "}] ${portableMarkdown(item.title)}${item.owner ? ` (@${item.owner})` : ""}`));
      break;
    case "review-board":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.candidates || []).forEach((item) => {
        out.push(`### ${plain(item.title || item.id || "Item")}${item.status ? ` (${item.status})` : ""}`, "");
        if (item.summary) out.push(portableMarkdown(item.summary), "");
        if (item.body) out.push(portableMarkdown(item.body), "");
        (item.blocks || []).forEach((child) => out.push(blockToNotion(child, depth + 1), ""));
      });
      break;
    case "process-board":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.items || []).forEach((item) => {
        out.push(`### ${plain(item.title || item.id || "Work item")}${item.status ? ` (${item.status})` : ""}`, "");
        if (item.summary) out.push(portableMarkdown(item.summary), "");
        if (item.owner) out.push(`- **Owner:** ${item.owner}`);
        if (item.priority) out.push(`- **Priority:** ${item.priority}`);
        if (item.verdict) out.push(`- **Verdict:** ${item.verdict}`);
        if (item.files?.length) out.push(`- **Files:** ${item.files.join(", ")}`);
        if (item.verification?.length) out.push(`- **Verification:** ${item.verification.join(", ")}`);
        if (item.body) out.push("", portableMarkdown(item.body));
        (item.blocks || []).forEach((child) => out.push("", blockToNotion(child, depth + 1)));
      });
      break;
    case "patch-set":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.patches || []).forEach((patch) => {
        out.push(`### ${plain(patch.title || patch.id || "Patch")}`, "");
        if (patch.summary) out.push(portableMarkdown(patch.summary), "");
        if (patch.diff) out.push("```diff", patch.diff, "```", "");
      });
      break;
    case "diff-view":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push("```diff", block.diff || "", "```");
      break;
    case "verification-run":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.runs || []).forEach((run) => {
        out.push(`### ${plain(run.title || run.id || "Run")}${run.status ? ` (${run.status})` : ""}`, "");
        if (run.command) out.push("```sh", run.command, "```");
        if (run.expected) out.push(`- **Expected:** ${portableMarkdown(run.expected)}`);
        if (run.actual) out.push(`- **Actual:** ${portableMarkdown(run.actual)}`);
      });
      break;
    case "trust-report":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      if (block.summary) out.push(portableMarkdown(block.summary), "");
      if (block.sources?.length) out.push("### Sources", "", mdTable(["Source", "Kind", "Trust", "Summary"], block.sources.map((s) => [s.label || s.id || "", s.kind || "", s.trust || "", s.summary || s.url || ""])), "");
      if (block.claims?.length) out.push("### Claims", "", mdTable(["Claim", "Status", "Confidence", "Sources", "Evidence"], block.claims.map((c) => [c.claim || c.title || c.id || "", c.status || "", c.confidence || "", (c.sources || []).join(", "), (c.evidence || []).join(", ")])));
      break;
    case "figure":
      if (block.src) out.push(`![${plain(block.alt || block.caption || "figure")}](${block.src})`);
      if (block.caption) out.push("", `_${portableMarkdown(block.caption)}_`);
      break;
    case "chart":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      out.push(mdTable(["Label", "Value"], (block.data || []).map((item) => [item.label, item.value])));
      break;
    case "footnotes":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.items || []).forEach((item) => out.push(`[^${item.id}]: ${portableMarkdown(item.text)}`));
      break;
    case "citations":
      if (block.title) out.push(`${h} ${plain(block.title)}`, "");
      (block.items || []).forEach((item, index) => {
        const title = item.url ? `[${plain(item.title || item.label || item.id || "Untitled source")}](${item.url})` : plain(item.title || item.label || item.id || "Untitled source");
        const meta = citationParts(item).join("; ");
        out.push(`${index + 1}. ${title}${meta ? `. ${meta}` : ""}`);
        if (item.quote) out.push(`   > ${portableMarkdown(item.quote)}`);
        if (item.note || item.notes) out.push(`   ${portableMarkdown(item.note || item.notes)}`);
      });
      break;
    case "glossary":
      out.push(`${h} ${plain(block.title || "Glossary")}`, "");
      (block.terms || []).forEach((term) => out.push(`- **${plain(term.term)}:** ${portableMarkdown(term.definition)}`));
      break;
    default:
      if (block.title) out.push(`${h} ${plain(block.title)}`);
      if (block.summary || block.body) out.push("", portableMarkdown(block.summary || block.body));
      childBlocks(block).forEach((child) => out.push("", blockToNotion(child, depth + 1)));
  }
  return out.filter((line) => line !== undefined && line !== null).join("\n");
}

function slideCodeMacrosToHtml(body) {
  const open = /<ac:structured-macro\b(?=[^>]*\bac:name="code")[^>]*>/g;
  const plainOpen = "<ac:plain-text-body><![CDATA[";
  const plainClose = "]]></ac:plain-text-body>";
  const macroClose = "</ac:structured-macro>";
  let out = "";
  let cursor = 0;
  let match;
  while ((match = open.exec(body))) {
    const macroEnd = body.indexOf(macroClose, open.lastIndex);
    if (macroEnd < 0) break;
    const macro = body.slice(match.index, macroEnd + macroClose.length);
    const textStart = macro.indexOf(plainOpen);
    const textEnd = macro.lastIndexOf(plainClose);
    if (textStart < 0 || textEnd < textStart) {
      open.lastIndex = macroEnd + macroClose.length;
      continue;
    }
    const code = macro.slice(textStart + plainOpen.length, textEnd).replace(/\]\]\]\]><!\[CDATA\[>/g, "]]>");
    out += body.slice(cursor, match.index) + `<pre><code>${html(code)}</code></pre>`;
    cursor = macroEnd + macroClose.length;
    open.lastIndex = cursor;
  }
  return out + body.slice(cursor);
}

function slideBody(block) {
  const body = slideCodeMacrosToHtml(blockToConfluence(block, 2))
    .replace(/<ac:[^>]+>/g, "")
    .replace(/<\/ac:[^>]+>/g, "");
  return body || paragraphHtml(block.summary || block.body || "");
}

export async function exportConfluenceStorage(model, opts = {}) {
  await enrich(model, opts.baseDir);
  const title = model.meta?.title || "Dossier";
  const body = (model.blocks || []).map((block) => blockToConfluence(block, block.type === "hero" ? 1 : 2)).join("\n");
  return [`<!-- Dossier Confluence storage export: ${html(title)} -->`, body].join("\n").trim() + "\n";
}

export async function exportNotionMarkdown(model, opts = {}) {
  await enrich(model, opts.baseDir);
  const meta = model.meta || {};
  const lines = [`# ${plain(meta.title || "Dossier")}`];
  if (meta.status || meta.updated || meta.owner) {
    lines.push("", [meta.status && `Status: ${meta.status}`, meta.updated && `Updated: ${meta.updated}`, meta.owner && `Owner: ${meta.owner}`].filter(Boolean).join(" | "));
  }
  (model.blocks || []).forEach((block) => lines.push("", blockToNotion(block, block.type === "hero" ? 1 : 2)));
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}

export async function exportSlidesHtml(model, opts = {}) {
  await enrich(model, opts.baseDir);
  const meta = model.meta || {};
  const title = meta.title || "Dossier";
  const blocks = model.blocks || [];
  const slides = blocks.length ? blocks : [{ type: "hero", title, lede: "" }];
  const slideHtml = slides
    .map((block, index) => {
      const heading = block.title || block.heading || (block.type === "hero" ? title : block.type || "Slide");
      return `<section class="slide" data-slide="${index}"><div class="slide-kicker">${html(block.type || "dossier")}</div><h1>${html(heading)}</h1><div class="slide-body">${slideBody(block)}</div><footer>${index + 1} / ${slides.length}</footer></section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(title)} slides</title>
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#111217;color:#f7f4ee}
body{margin:0;background:#111217;color:#f7f4ee}
.deck{min-height:100vh}
.slide{box-sizing:border-box;min-height:100vh;padding:7vh 8vw;display:none;grid-template-rows:auto auto 1fr auto;gap:22px;background:radial-gradient(circle at 86% 12%,rgba(112,72,232,.22),transparent 32%),#111217}
.slide.active{display:grid}
.slide-kicker{text-transform:uppercase;letter-spacing:.12em;color:#f0b6c4;font-size:13px;font-weight:750}
h1{font-size:clamp(42px,7vw,96px);line-height:.94;margin:0;letter-spacing:0}
.slide-body{font-size:clamp(18px,2.2vw,29px);line-height:1.42;max-width:1100px;color:#e8e2ef}
.slide-body h1,.slide-body h2,.slide-body h3{font-size:1.25em;margin:.7em 0 .35em}
.slide-body table{border-collapse:collapse;width:100%;font-size:.72em}
.slide-body th,.slide-body td{border:1px solid rgba(255,255,255,.2);padding:.45em .6em;text-align:left}
.slide-body pre{white-space:pre-wrap;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:18px;font-size:.62em;overflow:auto}
.slide-body img,.slide-body svg{max-width:100%;max-height:48vh}
footer{color:#a9a1b8;font-size:14px}
.controls{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}
.controls button{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:8px 11px;font:inherit}
@media print{body{background:#fff;color:#111}.slide{display:grid;min-height:100vh;break-after:page;background:#fff;color:#111}.slide-body{color:#222}.controls{display:none}}
</style>
</head>
<body>
<main class="deck">${slideHtml}</main>
<nav class="controls" aria-label="Slide controls"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button></nav>
<script>
(function(){var slides=[].slice.call(document.querySelectorAll(".slide")),i=0;function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,x){s.classList.toggle("active",x===i);});}document.querySelector("[data-prev]").onclick=function(){show(i-1)};document.querySelector("[data-next]").onclick=function(){show(i+1)};document.addEventListener("keydown",function(e){if(e.key==="ArrowRight"||e.key===" "){show(i+1);e.preventDefault();}else if(e.key==="ArrowLeft"){show(i-1);e.preventDefault();}});show(0);})();
</script>
</body>
</html>
`;
}

const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text: plain(text), ...(opts.run || {}) })], ...(opts.para || {}) });
const H = (text, heading) => new Paragraph({ text: plain(text), heading });

function addTable(out, columns, rows) {
  if (!columns || !columns.length) return;
  const header = new TableRow({ children: columns.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: plain(c), bold: true })] })] })) });
  const body = (rows || []).map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [P(c)] })) }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }));
  out.push(new Paragraph({ text: "" }));
}

// ---- images ----------------------------------------------------------------

const MIME_TYPE = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/bmp": "bmp" };
const EXT_TYPE = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif", ".bmp": "bmp" };

// Rasterize an SVG string to a PNG buffer via resvg (no browser needed).
async function svgToPng(svg) {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const img = new Resvg(String(svg), { fitTo: { mode: "width", value: 900 } }).render();
    return { data: img.asPng(), width: img.width, height: img.height };
  } catch {
    return null;
  }
}

// A paragraph holding one image, scaled to fit the page width (96dpi pixels).
function imageRun(data, type, w, h) {
  const maxW = 540;
  let width = w || maxW;
  let height = h || Math.round(width * 0.6);
  if (width > maxW) {
    height = Math.round(height * (maxW / width));
    width = maxW;
  }
  return new Paragraph({ children: [new ImageRun({ data, type, transformation: { width, height } })] });
}

// Resolve a figure to an image paragraph: data-URI, local file, raster or SVG.
async function figureImage(b, baseDir) {
  let buf = null, type = null, svg = null;
  const src = b._src || b.src || "";
  const m = /^data:(image\/[a-z.+-]+)(;base64)?,(.*)$/i.exec(src);
  if (m) {
    const mime = m[1].toLowerCase(), isB64 = !!m[2], raw = m[3];
    if (/svg/i.test(mime)) {
      try { svg = isB64 ? Buffer.from(raw, "base64").toString("utf8") : decodeURIComponent(raw); } catch { svg = raw; }
    } else if (MIME_TYPE[mime] && isB64) { buf = Buffer.from(raw, "base64"); type = MIME_TYPE[mime]; }
  } else if (src && !/^https?:/i.test(src) && baseDir) {
    try {
      const { readFileSync } = await import("node:fs");
      const { resolve, extname } = await import("node:path");
      const file = resolve(baseDir, src);
      if (/\.svg$/i.test(file)) svg = readFileSync(file, "utf8");
      else if (EXT_TYPE[extname(file).toLowerCase()]) { buf = readFileSync(file); type = EXT_TYPE[extname(file).toLowerCase()]; }
    } catch {
      /* unreadable, no image */
    }
  }
  if (svg) {
    const png = await svgToPng(svg);
    return png ? imageRun(png.data, "png", png.width, png.height) : null;
  }
  if (buf && type) {
    let dim = null;
    try { const { imageSize } = await import("image-size"); dim = imageSize(buf); } catch { /* dims unknown */ }
    return imageRun(buf, type, dim && dim.width, dim && dim.height);
  }
  return null; // unsupported (e.g. webp/avif) or remote URL
}

// Chart SVG uses CSS variables for color; bind them to concrete values for raster.
function chartPngSvg(b, accent) {
  return chartSvg(b)
    .replace(/var\(--ds-accent\)/g, accent)
    .replace(/var\(--ds-line-strong\)/g, "#c7c2d3")
    .replace(/var\(--ds-line-2\)/g, "#dcd9e4")
    .replace(/var\(--ds-line\)/g, "#e8e6ee")
    .replace(/var\(--ds-ink-2\)/g, "#56525f")
    .replace(/var\(--ds-ink-3\)/g, "#8b8698");
}

async function block(b, out, ctx) {
  switch (b.type) {
    case "hero":
      out.push(H(b.title, HeadingLevel.TITLE));
      if (b.lede) out.push(P(b.lede));
      break;
    case "section":
      out.push(H(b.title, HeadingLevel.HEADING_1));
      if (b.subtitle) out.push(P(b.subtitle, { run: { italics: true, color: "666666" } }));
      for (const c of b.blocks || []) await block(c, out, ctx);
      break;
    case "prose":
      if (b.heading) out.push(H(b.heading, HeadingLevel.HEADING_2));
      String(b.markdown || "").split(/\n{2,}/).forEach((p) => out.push(P(p)));
      break;
    case "callout":
      out.push(new Paragraph({ children: [...(b.title ? [new TextRun({ text: plain(b.title) + " ", bold: true })] : []), new TextRun({ text: plain(b.body) })], indent: { left: 360 } }));
      break;
    case "code":
      String(b.code || "").split("\n").forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })] })));
      out.push(new Paragraph({ text: "" }));
      break;
    case "code-editor":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      if (b.targetPath || b.filename || b.lang) out.push(P([b.targetPath || b.filename, b.lang].filter(Boolean).join(" · ")));
      String(b.code || "").split("\n").forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })] })));
      out.push(new Paragraph({ text: "" }));
      break;
    case "patch-set":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      for (const p of b.patches || []) {
        out.push(H(plain(p.title || p.id || "Patch"), HeadingLevel.HEADING_3));
        if (p.summary) out.push(P(p.summary));
        if (p.operation) out.push(P("Operation: " + plain(p.operation)));
        if (p.status) out.push(P("Status: " + plain(p.status)));
        if (p.risk) out.push(P("Risk: " + plain(p.risk)));
        if (p.files && p.files.length) out.push(P("Files: " + p.files.map(plain).join(", ")));
        if (p.workItems && p.workItems.length) out.push(P("Work items: " + p.workItems.map(plain).join(", ")));
        if (p.verification && p.verification.length) out.push(P("Verification: " + p.verification.map(plain).join(", ")));
        if (p.diff) String(p.diff).split("\n").forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })] })));
      }
      break;
    case "diff-view": {
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      const files = parseUnifiedDiff(b.diff || "", b.filename || b.title || "diff");
      if (files.length) out.push(P("Files: " + files.map((file) => (file.newPath || file.oldPath || "diff") + " (+" + file.additions + "/-" + file.deletions + ")").join(", ")));
      String(b.diff || "").split("\n").forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })] })));
      out.push(new Paragraph({ text: "" }));
      break;
    }
    case "table":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      addTable(out, b.columns, b.rows);
      break;
    case "references":
      addTable(out, ["Source", "Signal", "Use"], (b.items || []).map((r) => [r.label, r.signal || "", r.use || ""]));
      break;
    case "decision-matrix":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      addTable(out, ["Option", ...(b.criteria || [])], (b.options || []).map((o) => [o.name, ...(b.criteria || []).map((_, i) => (o.scores || [])[i] || "")]));
      break;
    case "risk-register":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      addTable(out, ["Risk", "Likelihood", "Impact", "Mitigation"], (b.risks || []).map((r) => [r.risk, r.likelihood || "", r.impact || "", r.mitigation || ""]));
      break;
    case "summary-cards":
      (b.cards || []).forEach((c) => { out.push(H(c.title, HeadingLevel.HEADING_3)); out.push(P(c.body)); });
      break;
    case "stat-strip":
      out.push(P((b.stats || []).map((s) => {
        const delta = typeof s.delta === "object" ? [s.delta.value, s.delta.label].filter(Boolean).join(" ") : s.delta;
        return plain(s.value) + " " + plain(s.label) + (delta ? " (" + plain(delta) + ")" : "");
      }).join("   ")));
      break;
    case "flow":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      (b.steps || []).forEach((s, i) => out.push(P((i + 1) + ". " + plain(s.title) + ": " + plain(s.body))));
      break;
    case "timeline":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      (b.phases || []).forEach((p) => out.push(new Paragraph({ text: plain(p.label) + (p.status ? " (" + p.status + ")" : "") + ": " + plain(p.body), bullet: { level: 0 } })));
      break;
    case "action-items":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      (b.items || []).forEach((it) => out.push(new Paragraph({ text: (it.status === "done" ? "[x] " : "[ ] ") + plain(it.title) + (it.owner ? " (@" + it.owner + ")" : ""), bullet: { level: 0 } })));
      break;
    case "assumptions":
      out.push(H(b.title || "Assumptions and open questions", HeadingLevel.HEADING_3));
      (b.items || []).forEach((it) => out.push(new Paragraph({ text: plain(it.statement) + " (" + (it.kind || "assumption") + "/" + (it.status || "unverified") + ")", bullet: { level: 0 } })));
      break;
    case "glossary":
      out.push(H(b.title || "Glossary", HeadingLevel.HEADING_3));
      (b.terms || []).forEach((t) => out.push(new Paragraph({ children: [new TextRun({ text: plain(t.term) + ": ", bold: true }), new TextRun({ text: plain(t.definition) })] })));
      break;
    case "faq":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      (b.items || []).forEach((it) => { out.push(new Paragraph({ children: [new TextRun({ text: plain(it.q), bold: true })] })); out.push(P(it.a)); });
      break;
    case "two-col":
      for (const c of [...(b.left || []), ...(b.right || [])]) await block(c, out, ctx);
      break;
    case "tabs":
      for (const t of b.tabs || []) {
        out.push(H(t.label, HeadingLevel.HEADING_3));
        for (const c of t.blocks || []) await block(c, out, ctx);
      }
      break;
    case "review-board":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      for (const c of b.candidates || []) {
        out.push(H(plain(c.title) + (c.status ? " (" + c.status + ")" : ""), HeadingLevel.HEADING_3));
        if (c.summary) out.push(P(c.summary));
        if (c.body) String(c.body).split(/\n{2,}/).forEach((p) => out.push(P(p)));
        for (const x of c.blocks || []) await block(x, out, ctx);
        Object.entries(c.details || {}).forEach(([k, v]) => out.push(P(k + ": " + plain(v))));
      }
      break;
    case "process-board":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      for (const it of b.items || []) {
        out.push(H(plain(it.title) + (it.status ? " (" + it.status + ")" : ""), HeadingLevel.HEADING_3));
        if (it.summary) out.push(P(it.summary));
        if (it.owner) out.push(P("Owner: " + plain(it.owner)));
        if (it.priority) out.push(P("Priority: " + plain(it.priority)));
        if (it.verdict) out.push(P("Verdict: " + plain(it.verdict)));
        if (it.files && it.files.length) out.push(P("Files: " + it.files.map(plain).join(", ")));
        if (it.dependencies && it.dependencies.length) out.push(P("Depends on: " + it.dependencies.map(plain).join(", ")));
        if (it.verification && it.verification.length) out.push(P("Verification: " + it.verification.map(plain).join(", ")));
        if (it.body) String(it.body).split(/\n{2,}/).forEach((p) => out.push(P(p)));
        for (const x of it.blocks || []) await block(x, out, ctx);
        Object.entries(it.details || {}).forEach(([k, v]) => out.push(P(k + ": " + plain(v))));
      }
      break;
    case "verification-run":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      for (const r of b.runs || []) {
        out.push(H(plain(r.title || r.id || "Run") + (r.status ? " (" + r.status + ")" : ""), HeadingLevel.HEADING_3));
        if (r.command) out.push(P("Command: " + r.command));
        if (r.expected) out.push(P("Expected: " + r.expected));
        if (r.actual) out.push(P("Actual: " + r.actual));
        if (r.notes) out.push(P(r.notes));
      }
      break;
    case "evidence-log":
    case "finding-list":
    case "cycle-board":
    case "decision-log": {
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      const items = b.items || b.findings || b.cycles || b.decisions || [];
      for (const it of items) {
        out.push(H(plain(it.title || it.decision || it.id || "Item"), HeadingLevel.HEADING_3));
        if (it.body || it.summary || it.rationale) out.push(P(it.body || it.summary || it.rationale));
        ["status", "severity", "owner", "source", "recommendation"].forEach((k) => { if (it[k]) out.push(P(k + ": " + plain(it[k]))); });
      }
      break;
    }
    case "trust-report":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      if (b.sources && b.sources.length) {
        out.push(H("Sources", HeadingLevel.HEADING_3));
        addTable(out, ["Source", "Kind", "Trust", "License", "Summary"], (b.sources || []).map((s) => [s.label || s.id || "", s.kind || "", s.trust || "", s.license || "", s.summary || s.url || ""]));
      }
      if (b.claims && b.claims.length) {
        out.push(H("Claims", HeadingLevel.HEADING_3));
        for (const c of b.claims || []) {
          out.push(H(plain(c.claim || c.title || c.id || "Claim"), HeadingLevel.HEADING_4));
          ["status", "confidence", "owner", "updated"].forEach((k) => { if (c[k]) out.push(P(k + ": " + plain(c[k]))); });
          if (c.sources && c.sources.length) out.push(P("Sources: " + c.sources.map(plain).join(", ")));
          if (c.evidence && c.evidence.length) out.push(P("Evidence: " + c.evidence.map(plain).join(", ")));
          if (c.notes) out.push(P(c.notes));
        }
      }
      break;
    case "verdict-gate":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.prompt) out.push(P(b.prompt));
      if (b.verdict) out.push(P("Verdict: " + b.verdict));
      break;
    case "process-receipt":
      out.push(H(b.title || "Process receipt", HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      ["outcome", "owner", "date", "model"].forEach((k) => { if (b[k]) out.push(P(k + ": " + plain(b[k]))); });
      if (b.commands && b.commands.length) out.push(P("Commands: " + b.commands.map(plain).join(", ")));
      if (b.followUps && b.followUps.length) out.push(P("Follow-ups: " + b.followUps.map(plain).join(", ")));
      break;
    case "comment-thread":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      for (const t of b.threads || []) {
        out.push(H(t.subject || t.id || "Thread", HeadingLevel.HEADING_3));
        for (const c of t.comments || []) out.push(P((c.author || "comment") + ": " + (c.body || "")));
      }
      break;
    case "integration-report":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      if (b.summary) out.push(P(b.summary));
      ["producer", "consumer", "status", "version", "nextStep"].forEach((k) => { if (b[k]) out.push(P(k + ": " + plain(b[k]))); });
      break;
    case "upstream-response":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      ["upstream", "status", "url", "request", "response", "nextStep"].forEach((k) => { if (b[k]) out.push(P(k + ": " + plain(b[k]))); });
      break;
    case "release-checklist":
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_2));
      for (const g of b.gates || []) out.push(new Paragraph({ text: (g.status === "done" || g.status === "passed" ? "[x] " : "[ ] ") + plain(g.title || g.id || "Gate") + (g.required ? " (required)" : ""), bullet: { level: 0 } }));
      break;
    case "footnotes":
      out.push(H(b.title || "Notes", HeadingLevel.HEADING_3));
      (b.items || []).forEach((it, i) => out.push(P((i + 1) + ". " + plain(it.text))));
      break;
    case "citations":
      out.push(H(b.title || "Citations", HeadingLevel.HEADING_3));
      (b.items || []).forEach((it, i) => {
        const label = [plain(it.title || it.label || it.id || "Untitled source"), ...citationParts(it).map(plain), it.url || ""].filter(Boolean).join(". ");
        out.push(P((i + 1) + ". " + label));
        if (it.quote) out.push(P("Quote: " + plain(it.quote), { run: { italics: true } }));
        if (it.note || it.notes) out.push(P(plain(it.note || it.notes)));
      });
      break;
    case "receipt":
      out.push(H(b.title || "Generation receipt", HeadingLevel.HEADING_3));
      ["generatedBy", "model", "date", "confidence"].forEach((k) => { if (b[k]) out.push(P(k + ": " + b[k])); });
      if (b.tools && b.tools.length) out.push(P("tools: " + b.tools.join(", ")));
      if (b.notes) out.push(P(b.notes));
      break;
    case "figure": {
      const im = await figureImage(b, ctx.baseDir);
      if (im) out.push(im);
      if (b.caption) out.push(P(b.caption, { run: { italics: true, color: "666666" } }));
      break;
    }
    case "chart": {
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      const png = await svgToPng(chartPngSvg(b, ctx.accent));
      if (png) out.push(imageRun(png.data, "png", png.width, png.height));
      break;
    }
    case "diagram": {
      if (b.title) out.push(H(b.title, HeadingLevel.HEADING_3));
      const png = b._svg ? await svgToPng(b._svg) : null;
      if (png) out.push(imageRun(png.data, "png", png.width, png.height));
      else out.push(P("[" + (b.format || "dot") + " diagram]"));
      break;
    }
    case "math":
      if (b.tex) out.push(new Paragraph({ children: [new TextRun({ text: String(b.tex), font: "Consolas", italics: true })] }));
      break;
    default:
      break; // unknown / plugin blocks: nothing to emit
  }
}

export async function exportDocx(model, opts = {}) {
  await enrich(model, opts.baseDir); // populates figure _src and diagram _svg
  const ctx = { baseDir: opts.baseDir, accent: (model.meta && model.meta.theme && model.meta.theme.accent) || "#c81e4a" };
  const out = [];
  for (const b of model.blocks || []) await block(b, out, ctx);
  if (!out.length) out.push(new Paragraph({ text: (model.meta && model.meta.title) || "" }));
  const doc = new Document({ sections: [{ children: out }] });
  return Packer.toBuffer(doc);
}
