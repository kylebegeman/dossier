// Catalog a folder of dossiers into a browsable index (itself a dossier), with a
// cross-document link graph built from [[slug]] references. No dependencies.

import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { slugify } from "./generate.mjs";

function collectLinks(blocks) {
  const found = new Set();
  const text = JSON.stringify(blocks || []);
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) found.add(slugify(m[1]));
  return [...found];
}

function dotEscape(s) {
  return String(s).replace(/[\\"]/g, "\\$&");
}

function buildGraphDot(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  let edges = "";
  for (const d of docs) {
    for (const l of d.links) {
      if (slugs.has(l) && l !== d.slug) edges += `"${dotEscape(d.slug)}" -> "${dotEscape(l)}"; `;
    }
  }
  if (!edges) return null;
  const nodes = docs.map((d) => `"${dotEscape(d.slug)}" [label="${dotEscape(d.title)}"]`).join("; ");
  return `digraph { rankdir=LR; bgcolor="transparent"; node [shape=box style=rounded fontname="Inter" fontsize=11 color="#c81e4a" fontcolor="#1a1822"]; edge [color="#8b8698"]; ${nodes}; ${edges} }`;
}

export function buildCatalogModel(dir, opts = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".dossier.json") && f !== "index.dossier.json");
  const docs = [];
  for (const f of files) {
    try {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const meta = m.meta || {};
      const slug = meta.slug || basename(f).replace(/\.(dossier\.)?json$/i, "");
      docs.push({
        file: f,
        slug,
        title: meta.title || slug,
        kind: m.kind || "dossier",
        status: meta.status || "",
        tags: meta.tags || [],
        updated: meta.updated || "",
        links: collectLinks(m.blocks),
      });
    } catch (e) {
      console.error(`  ! skipped ${f}: ${e.message}`);
    }
  }
  docs.sort((a, b) => (b.updated || "").localeCompare(a.updated || "") || a.title.localeCompare(b.title));

  const allTags = [...new Set(docs.flatMap((d) => d.tags))];
  const processKinds = new Set(["plan", "implementation", "review", "debug", "integration-loop", "release", "incident"]);
  const processDocs = docs.filter((d) => processKinds.has(d.kind));
  const kindCounts = [...processKinds].map((kind) => [kind, String(docs.filter((d) => d.kind === kind).length)]).filter(([, n]) => n !== "0");
  const rows = docs.map((d) => [`[[${d.slug}]]`, d.kind, d.status || "-", (d.tags || []).join(", ") || "-", d.updated || "-"]);
  const processRows = processDocs.map((d) => [`[[${d.slug}]]`, d.kind, d.status || "-", d.updated || "-", (d.tags || []).join(", ") || "-"]);
  const dot = buildGraphDot(docs);

  const blocks = [
    { type: "hero", eyebrow: "Catalog", title: opts.title || "Documents", lede: `${docs.length} document${docs.length === 1 ? "" : "s"} in this collection.` },
    {
      type: "stat-strip",
      stats: [
        { value: String(docs.length), label: "Documents" },
        { value: String(processDocs.length), label: "Process docs" },
        { value: String(allTags.length), label: "Tags" },
        { value: String(docs.filter((d) => d.status === "durable").length), label: "Durable" },
      ],
    },
    ...(kindCounts.length ? [{ type: "table", title: "Process facets", columns: ["Kind", "Count"], rows: kindCounts }] : []),
    ...(processRows.length ? [{ type: "table", title: "Process documents", columns: ["Title", "Kind", "Status", "Updated", "Tags"], rows: processRows }] : []),
    { type: "table", title: "All documents", columns: ["Title", "Kind", "Status", "Tags", "Updated"], rows },
  ];
  if (dot) blocks.push({ type: "section", title: "Link graph", subtitle: "Cross-document [[links]].", blocks: [{ type: "diagram", format: "dot", spec: dot }] });

  const model = {
    dossierVersion: "1.0",
    kind: "dossier",
    meta: {
      title: opts.title || "Catalog",
      slug: "index",
      eyebrow: "Catalog",
      status: "durable",
      updated: opts.updated || "",
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    },
    blocks,
  };
  return { model, docs };
}
