import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { slugify } from "./generate.mjs";
import { generate } from "./generate.mjs";
import { validateModel } from "./validate.mjs";

export const WORKSPACE_MANIFEST = "dossier.workspace.json";
export const WORKSPACE_SCHEMA = "dossier.workspace/v1";

const SKIP_DIRS = new Set([".git", ".dossier", "node_modules", "site", "dist", "build", "coverage"]);
const PROCESS_KINDS = new Set(["plan", "implementation", "review", "debug", "integration-loop", "release", "incident"]);
const CLOSED_STATUSES = new Set(["done", "passed", "accepted", "approved", "complete", "completed", "resolved", "shipped"]);
const OPEN_VERDICTS = new Set(["undecided", "revise", "defer", "split", "retry", "block"]);
const CLOSED_VERDICTS = new Set(["approve", "skip"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function rel(baseDir, path) {
  const r = relative(baseDir, path);
  return r && !r.startsWith("..") && !isAbsolute(r) ? r : path;
}

function normalizeList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return fallback;
}

function uniqueId(value, fallback = "item") {
  return slugify(value || fallback).replace(/^-+|-+$/g, "") || fallback;
}

function normalizeManifest(manifest = {}) {
  return {
    schema: manifest.schema || WORKSPACE_SCHEMA,
    name: manifest.name || "Dossier Workspace",
    roots: normalizeList(manifest.roots, ["."]),
    exclude: normalizeList(manifest.exclude, []),
    packs: normalizeList(manifest.packs, []),
    output: manifest.output || "site",
    description: manifest.description || "",
  };
}

function workspacePath(input, cwd = process.cwd()) {
  if (!input) return resolve(cwd, WORKSPACE_MANIFEST);
  const path = resolve(cwd, input);
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, WORKSPACE_MANIFEST);
  if (input.endsWith(".json")) return path;
  return join(path, WORKSPACE_MANIFEST);
}

function resolveWorkspace(input, opts = {}) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const baseDir = resolve(opts.baseDir || opts.cwd || process.cwd());
    return { manifest: normalizeManifest(input), path: opts.path ? resolve(baseDir, opts.path) : join(baseDir, WORKSPACE_MANIFEST), baseDir };
  }
  const path = workspacePath(input, opts.cwd || process.cwd());
  if (!existsSync(path)) throw new Error(`workspace manifest not found: ${path}`);
  return { manifest: normalizeManifest(readJson(path)), path, baseDir: dirname(path) };
}

function collectDossierFiles(rootDir, files = [], skipDirs = SKIP_DIRS) {
  if (!existsSync(rootDir)) return files;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) collectDossierFiles(join(rootDir, entry.name), files, skipDirs);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".dossier.json") && entry.name !== "index.dossier.json" && entry.name !== "workspace-index.dossier.json") {
      files.push(join(rootDir, entry.name));
    }
  }
  return files;
}

function flattenBlocks(blocks, out = []) {
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    out.push(block);
    flattenBlocks(block.blocks, out);
    flattenBlocks(block.left, out);
    flattenBlocks(block.right, out);
    if (Array.isArray(block.tabs)) for (const tab of block.tabs) flattenBlocks(tab?.blocks, out);
    if (Array.isArray(block.candidates)) for (const candidate of block.candidates) flattenBlocks(candidate?.blocks, out);
    if (Array.isArray(block.items)) for (const item of block.items) flattenBlocks(item?.blocks, out);
  }
  return out;
}

function collectLinks(blocks) {
  const found = new Set();
  const text = JSON.stringify(blocks || []);
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) found.add(slugify(m[1]));
  return [...found].sort();
}

function isOpenProcessItem(item) {
  const status = String(item.status || "").toLowerCase();
  const verdict = String(item.verdict || "undecided").toLowerCase();
  if (status && CLOSED_STATUSES.has(status) && (!verdict || CLOSED_VERDICTS.has(verdict))) return false;
  return !CLOSED_VERDICTS.has(verdict) || OPEN_VERDICTS.has(verdict) || !status || !CLOSED_STATUSES.has(status);
}

function isOpenReleaseGate(gate) {
  const status = String(gate.status || "pending").toLowerCase();
  return !CLOSED_STATUSES.has(status);
}

function isTrustGap(claim) {
  const status = String(claim.status || "pending").toLowerCase();
  return !["verified", "accepted"].includes(status);
}

function docRef(doc) {
  return {
    file: doc.file,
    slug: doc.slug,
    title: doc.title,
    kind: doc.kind,
    status: doc.status,
    owner: doc.owner,
    tags: doc.tags,
    updated: doc.updated,
    valid: doc.valid,
    errors: doc.errors || [],
    openProcessItems: doc.openProcessItems || 0,
    openReleaseGates: doc.openReleaseGates || 0,
    trustGaps: doc.trustGaps || 0,
  };
}

function docSlug(model, file) {
  return (model.meta && model.meta.slug) || basename(file).replace(/\.(dossier\.)?json$/i, "");
}

function docCounts(doc) {
  const processItems = Array.isArray(doc.processItems) ? doc.processItems : [];
  const releaseGates = Array.isArray(doc.releaseGates) ? doc.releaseGates : [];
  const trustClaims = Array.isArray(doc.trustClaims) ? doc.trustClaims : [];
  return {
    openProcessItems: processItems.filter(isOpenProcessItem).length,
    openReleaseGates: releaseGates.filter((gate) => gate.required && isOpenReleaseGate(gate)).length,
    trustGaps: trustClaims.filter(isTrustGap).length,
  };
}

function withDocCounts(doc) {
  return { ...doc, ...docCounts(doc) };
}

function invalidDoc(file, baseDir, error) {
  const slug = basename(file).replace(/\.(dossier\.)?json$/i, "");
  const message = error && error.message ? error.message : String(error || "Unable to load dossier.");
  return withDocCounts({
    file: rel(baseDir, file),
    path: file,
    slug,
    title: slug,
    kind: "invalid",
    status: "invalid",
    owner: "",
    tags: [],
    updated: "",
    links: [],
    processItems: [],
    releaseGates: [],
    trustClaims: [],
    verificationRuns: [],
    valid: false,
    errors: [message],
    model: null,
  });
}

function loadDoc(file, baseDir) {
  const model = readJson(file);
  const meta = model.meta || {};
  const slug = docSlug(model, file);
  const blocks = flattenBlocks(model.blocks);
  const processItems = [];
  const releaseGates = [];
  const trustClaims = [];
  const verificationRuns = [];

  for (const block of blocks) {
    if (block.type === "process-board" && Array.isArray(block.items)) {
      for (const item of block.items) {
        if (!item || typeof item !== "object") continue;
        processItems.push({
          id: item.id || uniqueId(item.title, "process-item"),
          title: item.title || item.id || "Untitled item",
          status: item.status || "",
          verdict: item.verdict || "undecided",
          owner: item.owner || "",
          priority: item.priority || "",
          summary: item.summary || item.notes || "",
          block: block.title || block.id || "Process board",
        });
      }
    }
    if (block.type === "release-checklist" && Array.isArray(block.gates)) {
      for (const gate of block.gates) {
        if (!gate || typeof gate !== "object") continue;
        releaseGates.push({
          id: gate.id || uniqueId(gate.title, "gate"),
          title: gate.title || gate.id || "Untitled gate",
          status: gate.status || "pending",
          required: gate.required !== false,
          evidence: gate.evidence || "",
          block: block.title || block.id || "Release checklist",
        });
      }
    }
    if (block.type === "trust-report" && Array.isArray(block.claims)) {
      for (const claim of block.claims) {
        if (!claim || typeof claim !== "object") continue;
        trustClaims.push({
          id: claim.id || uniqueId(claim.claim, "claim"),
          claim: claim.claim || claim.title || claim.id || "Untitled claim",
          status: claim.status || "pending",
          confidence: claim.confidence || "",
          sources: claim.sources || [],
          block: block.title || block.id || "Trust report",
        });
      }
    }
    if (block.type === "verification-run" && Array.isArray(block.runs)) {
      for (const run of block.runs) {
        if (!run || typeof run !== "object") continue;
        verificationRuns.push({
          id: run.id || uniqueId(run.command || run.title, "run"),
          title: run.title || run.command || run.id || "Verification run",
          command: run.command || "",
          status: run.status || "unknown",
          actual: run.actual || "",
        });
      }
    }
  }

  const validation = validateModel(model);
  return withDocCounts({
    file: rel(baseDir, file),
    path: file,
    slug,
    title: meta.title || slug,
    kind: model.kind || "dossier",
    status: meta.status || "",
    owner: meta.owner || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    updated: meta.updated || "",
    links: collectLinks(model.blocks),
    processItems,
    releaseGates,
    trustClaims,
    verificationRuns,
    valid: validation.ok,
    errors: validation.errors,
    model,
  });
}

function buildGraphDot(docs) {
  const slugs = new Set(docs.map((doc) => doc.slug));
  const nodes = docs.map((doc) => `"${doc.slug.replace(/"/g, '\\"')}" [label="${String(doc.title).replace(/"/g, '\\"')}"]`).join("; ");
  const edges = docs
    .flatMap((doc) => doc.links.filter((link) => slugs.has(link) && link !== doc.slug).map((link) => `"${doc.slug.replace(/"/g, '\\"')}" -> "${link.replace(/"/g, '\\"')}"`))
    .join("; ");
  if (!nodes || !edges) return null;
  return `digraph { rankdir=LR; bgcolor="transparent"; node [shape=box style=rounded fontname="Inter" fontsize=11 color="#c81e4a" fontcolor="#1a1822"]; edge [color="#8b8698"]; ${nodes}; ${edges}; }`;
}

function summarize(docs, manifest) {
  const slugs = new Set(docs.map((doc) => doc.slug));
  const openProcessItems = docs.flatMap((doc) => doc.processItems.filter(isOpenProcessItem).map((item) => ({ ...item, doc: docRef(doc) })));
  const openReleaseGates = docs.flatMap((doc) => doc.releaseGates.filter((gate) => gate.required && isOpenReleaseGate(gate)).map((gate) => ({ ...gate, doc: docRef(doc) })));
  const trustGaps = docs.flatMap((doc) => doc.trustClaims.filter(isTrustGap).map((claim) => ({ ...claim, doc: docRef(doc) })));
  const brokenLinks = docs.flatMap((doc) => doc.links.filter((link) => !slugs.has(link)).map((link) => ({ doc: docRef(doc), link })));
  const invalidDocs = docs.filter((doc) => !doc.valid).map((doc) => ({ doc: docRef(doc), errors: doc.errors || [] }));
  return {
    docs: docs.length,
    processDocs: docs.filter((doc) => PROCESS_KINDS.has(doc.kind)).length,
    openProcessItems: openProcessItems.length,
    openReleaseGates: openReleaseGates.length,
    trustGaps: trustGaps.length,
    brokenLinks: brokenLinks.length,
    invalidDocs: invalidDocs.length,
    packs: manifest.packs.length,
    openProcessItemsList: openProcessItems,
    openReleaseGatesList: openReleaseGates,
    trustGapsList: trustGaps,
    brokenLinksList: brokenLinks,
    invalidDocsList: invalidDocs,
  };
}

export function createWorkspaceManifest(opts = {}) {
  return normalizeManifest({
    name: opts.name || "Dossier Workspace",
    roots: normalizeList(opts.roots, ["."]),
    exclude: normalizeList(opts.exclude, []),
    packs: normalizeList(opts.packs, []),
    output: opts.output || "site",
    description: opts.description || "",
  });
}

export function writeWorkspaceManifest(outPath, manifest) {
  writeJson(outPath, normalizeManifest(manifest));
  return outPath;
}

export function readWorkspaceManifest(input, opts = {}) {
  return resolveWorkspace(input, opts).manifest;
}

export function scanWorkspace(input, opts = {}) {
  const workspace = resolveWorkspace(input, opts);
  const files = [];
  const skipDirs = new Set([...SKIP_DIRS, ...workspace.manifest.exclude]);
  for (const root of workspace.manifest.roots) {
    collectDossierFiles(resolve(workspace.baseDir, root), files, skipDirs);
  }
  const uniqueFiles = [...new Set(files)].sort();
  const docs = uniqueFiles
    .map((file) => {
      try {
        return loadDoc(file, workspace.baseDir);
      } catch (error) {
        return invalidDoc(file, workspace.baseDir, error);
      }
    })
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || "") || a.title.localeCompare(b.title));
  const summary = summarize(docs, workspace.manifest);
  return { ...workspace, docs, summary, graph: buildGraphDot(docs) };
}

function queueItems(summary) {
  const invalid = summary.invalidDocsList.slice(0, 24).map(({ doc, errors }) => ({
    id: uniqueId(`invalid-${doc.slug}`),
    title: `${doc.title}: invalid dossier`,
    summary: errors.join("; ") || "Dossier could not be parsed or validated.",
    status: "blocked",
    owner: doc.owner || "agent",
    priority: "P1",
    verdict: "revise",
    files: [doc.file],
  }));
  const process = summary.openProcessItemsList.slice(0, 24).map((item) => ({
    id: uniqueId(`process-${item.doc.slug}-${item.id}`),
    title: `${item.doc.title}: ${item.title}`,
    summary: item.summary || item.block,
    status: item.status || "open",
    owner: item.owner || item.doc.owner || "agent",
    priority: item.priority || "",
    verdict: item.verdict || "undecided",
    files: [item.doc.file],
  }));
  const release = summary.openReleaseGatesList.slice(0, 24).map((gate) => ({
    id: uniqueId(`release-${gate.doc.slug}-${gate.id}`),
    title: `${gate.doc.title}: ${gate.title}`,
    summary: gate.evidence || gate.block,
    status: gate.status || "pending",
    owner: gate.doc.owner || "agent",
    priority: gate.required ? "P1" : "P2",
    verdict: "block",
    files: [gate.doc.file],
  }));
  const trust = summary.trustGapsList.slice(0, 24).map((claim) => ({
    id: uniqueId(`trust-${claim.doc.slug}-${claim.id}`),
    title: `${claim.doc.title}: ${claim.claim}`,
    summary: claim.block,
    status: claim.status || "pending",
    owner: claim.doc.owner || "agent",
    priority: claim.confidence === "low" ? "P1" : "P2",
    verdict: "revise",
    files: [claim.doc.file],
  }));
  const links = summary.brokenLinksList.slice(0, 24).map(({ doc, link }) => ({
    id: uniqueId(`link-${doc.slug}-${link}`),
    title: `${doc.title}: missing [[${link}]]`,
    summary: "Cross-document link does not resolve in this workspace.",
    status: "open",
    owner: doc.owner || "agent",
    priority: "P2",
    verdict: "revise",
    files: [doc.file],
  }));
  const items = [...invalid, ...process, ...release, ...trust, ...links];
  if (items.length) return items;
  return [{ id: "workspace-clean", title: "Workspace has no open scan items", status: "done", owner: "agent", verdict: "approve", summary: "No open process, release, trust, or link gaps were found." }];
}

function readinessGates(summary) {
  return [
    { id: "valid-docs", title: "All workspace dossiers validate", status: summary.invalidDocs ? "failed" : "passed", required: true, evidence: `${summary.invalidDocs} invalid dossier(s)` },
    { id: "process-queue-clear", title: "No open process items", status: summary.openProcessItems ? "pending" : "passed", required: true, evidence: `${summary.openProcessItems} open item(s)` },
    { id: "release-gates-clear", title: "Required release gates passed", status: summary.openReleaseGates ? "pending" : "passed", required: true, evidence: `${summary.openReleaseGates} open gate(s)` },
    { id: "trust-gaps-clear", title: "Trust claims verified", status: summary.trustGaps ? "pending" : "passed", required: true, evidence: `${summary.trustGaps} trust gap(s)` },
    { id: "links-resolve", title: "Cross-document links resolve", status: summary.brokenLinks ? "pending" : "passed", required: false, evidence: `${summary.brokenLinks} missing link(s)` },
  ];
}

function docsTableRows(docs) {
  return docs.map((doc) => [
    `[[${doc.slug}]]`,
    doc.kind,
    doc.status || "-",
    doc.tags.join(", ") || "-",
    doc.updated || "-",
    String(doc.openProcessItems || 0),
    String(doc.openReleaseGates || 0),
    String(doc.trustGaps || 0),
  ]);
}

export function buildWorkspaceIndex(input, opts = {}) {
  const scan = scanWorkspace(input, opts);
  const { manifest, docs, summary } = scan;
  const title = opts.title || `${manifest.name} Workspace`;
  const blocks = [
    {
      type: "hero",
      eyebrow: "Workspace",
      title,
      lede: manifest.description || `${summary.docs} dossier${summary.docs === 1 ? "" : "s"} across ${manifest.roots.length} root${manifest.roots.length === 1 ? "" : "s"}.`,
    },
    {
      type: "stat-strip",
      stats: [
        { value: String(summary.docs), label: "Dossiers" },
        { value: String(summary.openProcessItems), label: "Open process" },
        { value: String(summary.openReleaseGates), label: "Release gaps" },
        { value: String(summary.trustGaps), label: "Trust gaps" },
        { value: String(summary.brokenLinks), label: "Missing links" },
        { value: String(summary.invalidDocs), label: "Invalid docs" },
      ],
    },
    { type: "release-checklist", title: "Workspace readiness", gates: readinessGates(summary) },
    { type: "process-board", title: "Agent work queue", items: queueItems(summary) },
    { type: "table", title: "Workspace dossiers", columns: ["Title", "Kind", "Status", "Tags", "Updated", "Open process", "Release gaps", "Trust gaps"], rows: docsTableRows(docs) },
  ];

  if (summary.openReleaseGatesList.length) {
    blocks.push({
      type: "release-checklist",
      title: "Required release gaps",
      gates: summary.openReleaseGatesList.map((gate) => ({
        id: uniqueId(`${gate.doc.slug}-${gate.id}`),
        title: `${gate.doc.title}: ${gate.title}`,
        status: gate.status || "pending",
        required: gate.required !== false,
        evidence: gate.evidence || gate.doc.file,
      })),
    });
  }

  if (summary.trustGapsList.length) {
    blocks.push({
      type: "trust-report",
      title: "Trust gaps",
      summary: "Claims that still need verification before downstream agents should rely on them.",
      sources: docs.map((doc) => ({ id: uniqueId(`doc-${doc.slug}`), label: doc.title, kind: "dossier", trust: doc.valid ? "medium" : "low", summary: doc.file })),
      claims: summary.trustGapsList.map((claim) => ({
        id: uniqueId(`${claim.doc.slug}-${claim.id}`),
        claim: `${claim.doc.title}: ${claim.claim}`,
        status: claim.status || "pending",
        confidence: claim.confidence || "medium",
        sources: [uniqueId(`doc-${claim.doc.slug}`)],
      })),
    });
  }

  if (summary.brokenLinksList.length) {
    blocks.push({
      type: "table",
      title: "Missing cross-links",
      columns: ["Document", "Missing slug"],
      rows: summary.brokenLinksList.map(({ doc, link }) => [`[[${doc.slug}]]`, link]),
    });
  }

  if (scan.graph) {
    blocks.push({ type: "section", title: "Link graph", subtitle: "Cross-document [[links]] inside this workspace.", blocks: [{ type: "diagram", format: "dot", spec: scan.graph }] });
  }

  blocks.push({
    type: "process-receipt",
    title: "Workspace scan receipt",
    outcome: summary.openProcessItems || summary.openReleaseGates || summary.trustGaps || summary.brokenLinks || summary.invalidDocs ? "needs-attention" : "ready",
    owner: "dossier workspace",
    changedFiles: docs.map((doc) => doc.file),
    commands: ["dossier workspace index"],
  });

  const model = {
    dossierVersion: "1.0",
    kind: "dossier",
    meta: {
      title,
      slug: opts.slug || "workspace-index",
      eyebrow: "Workspace",
      status: "generated",
      updated: opts.updated || new Date().toISOString(),
      tags: ["workspace", "agent-status"],
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.skin ? { skin: opts.skin } : {}),
    },
    blocks,
  };
  return { ...scan, model };
}

export function queryWorkspace(input, filters = {}, opts = {}) {
  const scan = Array.isArray(input) ? { docs: input } : input && input.docs ? input : scanWorkspace(input, opts);
  const tags = normalizeList(filters.tag || filters.tags, []);
  const text = String(filters.text || "").toLowerCase();
  return scan.docs.filter((doc) => {
    if (filters.kind && doc.kind !== filters.kind) return false;
    if (filters.status && doc.status !== filters.status) return false;
    if (filters.owner && doc.owner !== filters.owner) return false;
    if (tags.length && !tags.every((tag) => doc.tags.includes(tag))) return false;
    if (filters.needs === "process" && !doc.openProcessItems) return false;
    if (filters.needs === "release" && !doc.openReleaseGates) return false;
    if (filters.needs === "trust" && !doc.trustGaps) return false;
    if (filters.needs === "invalid" && doc.valid) return false;
    if (text && !`${doc.title} ${doc.slug} ${doc.kind} ${doc.tags.join(" ")}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

async function writeRendered(model, sourceFile, outDir, opts = {}) {
  const slug = (model.meta && model.meta.slug) || basename(sourceFile).replace(/\.(dossier\.)?json$/i, "");
  const renderModel = structuredClone(model);
  renderModel.meta = renderModel.meta || { title: slug };
  if (opts.baseUrl) renderModel.meta.baseUrl = opts.baseUrl;
  const { html, embedHtml, md } = await generate(renderModel, { baseDir: dirname(sourceFile), theme: opts.theme, skin: opts.skin });
  const htmlPath = join(outDir, `${slug}.html`);
  const embedPath = join(outDir, `${slug}.embed.html`);
  const mdPath = join(outDir, `${slug}.md`);
  writeFileSync(htmlPath, html);
  if (opts.embed) writeFileSync(embedPath, embedHtml);
  writeFileSync(mdPath, md);
  return { slug, htmlPath, embedPath: opts.embed ? embedPath : null, mdPath };
}

export async function writeWorkspaceIndex(input, opts = {}) {
  const result = buildWorkspaceIndex(input, opts);
  const outPath = resolve(result.baseDir, opts.out || "workspace-index.dossier.json");
  const validation = validateModel(result.model);
  if (!validation.ok) throw new Error("invalid workspace index:\n  - " + validation.errors.join("\n  - "));
  writeJson(outPath, result.model);
  if (opts.render === false) return { ...result, outPath, rendered: null };
  const rendered = await writeRendered(result.model, outPath, dirname(outPath), opts);
  return { ...result, outPath, rendered };
}

export async function publishWorkspace(input, opts = {}) {
  const scan = scanWorkspace(input, opts);
  const invalidDocs = scan.docs.filter((doc) => !doc.valid);
  if (invalidDocs.length) {
    const details = invalidDocs.map((doc) => `${doc.file}${doc.errors?.length ? `: ${doc.errors.join("; ")}` : ""}`);
    throw new Error("workspace contains invalid dossier(s):\n  - " + details.join("\n  - "));
  }
  const outDir = resolve(scan.baseDir, opts.out || scan.manifest.output || "site");
  mkdirSync(outDir, { recursive: true });
  const rendered = [];
  const used = new Map();
  for (const doc of scan.docs) {
    const model = structuredClone(doc.model);
    model.meta = model.meta || { title: doc.title };
    const baseSlug = doc.slug || uniqueId(doc.title, "dossier");
    const seen = used.get(baseSlug) || 0;
    used.set(baseSlug, seen + 1);
    model.meta.slug = seen ? `${baseSlug}-${seen + 1}` : baseSlug;
    rendered.push(await writeRendered(model, doc.path, outDir, opts));
  }
  const index = await writeWorkspaceIndex(input, { ...opts, out: join(outDir, "workspace-index.dossier.json") });
  return { ...scan, outDir, rendered, index };
}
