// Dossier MCP server, lets any MCP-capable agent author, validate, render, read,
// and update process packets. Run via `dossier mcp` (stdio transport).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  buildHandoffPacket,
  diffStateAgainstModel,
  generate,
  mergeStateIntoModel,
  normalizeStatePacket,
  promptForModel,
  validateModel,
  slugify,
} from "../src/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const STARTERS = [
  "dossier",
  "plan",
  "implementation",
  "review",
  "debug",
  "integration-loop",
  "release",
  "incident",
  "adr",
  "runbook",
  "postmortem",
  "review-board",
];

const TOOLS = [
  {
    name: "dossier_render",
    description:
      "Validate and render a Dossier model into a self-contained HTML page (+ Markdown). The page embeds the model as a #dossier-model island so it stays agent-readable. Provide `outPath` to write files, otherwise the HTML is returned inline. Set `embed` to also produce a chrome-stripped <slug>.embed.html variant.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "object", description: "A Dossier document model: { dossierVersion, kind, meta, blocks[] }." },
        outPath: { type: "string", description: "Optional path to write <slug>.html and <slug>.md next to." },
        theme: { type: "string", description: "Optional built-in theme pack to merge before rendering." },
        skin: { type: "string", enum: ["console-slate"], description: "Optional presentation skin to apply before rendering." },
        embed: { type: "boolean", description: "Also write or return the chrome-stripped embed HTML variant." },
      },
      required: ["model"],
    },
  },
  {
    name: "dossier_validate",
    description: "Validate a Dossier model and return precise, path-pointed errors. Use before rendering to self-correct.",
    inputSchema: { type: "object", properties: { model: { type: "object" } }, required: ["model"] },
  },
  {
    name: "dossier_read_decisions",
    description:
      "Read a decisions packet exported from a review-board ({ slug, decisions: { id: { selected, notes } } }) and return the selected items with notes, the human's choices to implement.",
    inputSchema: {
      type: "object",
      properties: {
        decisions: { type: "object", description: "The exported decisions JSON, or its `decisions` map." },
        path: { type: "string", description: "Alternatively, a path to a .decisions.json file." },
      },
    },
  },
  {
    name: "dossier_read_process",
    description:
      "Read a process packet exported from a process-board ({ schema: 'dossier.process/v1', slug, process: { id: { verdict, notes } } }) and return verdict-grouped work items for an agent to act on.",
    inputSchema: {
      type: "object",
      properties: {
        process: { type: "object", description: "The exported process JSON, or its `process` map." },
        path: { type: "string", description: "Alternatively, a path to a .process.json file." },
      },
    },
  },
  {
    name: "dossier_read_edits",
    description:
      "Read an edits packet exported from code-editor blocks ({ schema: 'dossier.edits/v1', slug, edits: { id: { text, lang, filename, targetPath, dirty } } }) and return edited text grouped by target path.",
    inputSchema: {
      type: "object",
      properties: {
        edits: { type: "object", description: "The exported edits JSON, or its `edits` map." },
        path: { type: "string", description: "Alternatively, a path to a .edits.json file." },
      },
    },
  },
  {
    name: "dossier_read_verdicts",
    description: "Read a verdict packet exported from verdict-gate blocks ({ schema: 'dossier.verdicts/v1', verdicts: { id: { verdict, notes } } }).",
    inputSchema: { type: "object", properties: { verdicts: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_read_release",
    description: "Read a release packet exported from release-checklist blocks ({ schema: 'dossier.release/v1', release: { id: { done, notes } } }).",
    inputSchema: { type: "object", properties: { release: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_read_patch_review",
    description: "Read a patch review packet exported from patch-set blocks ({ schema: 'dossier.patch-review/v1', patches: { id: { verdict, notes } } }).",
    inputSchema: { type: "object", properties: { patches: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_read_diff_review",
    description: "Read a diff review packet exported from diff-view blocks ({ schema: 'dossier.diff-review/v1', files, hunks }).",
    inputSchema: { type: "object", properties: { review: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_read_trust",
    description: "Read trust-report blocks from a model or a dossier.trust/v1 packet, returning source and claim provenance for agent handoff.",
    inputSchema: { type: "object", properties: { model: { type: "object" }, trust: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_read_state",
    description: "Normalize and summarize a dossier.state/v1 packet exported from the artifact Export Center.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "object", description: "The exported dossier.state/v1 packet." },
        path: { type: "string", description: "Alternatively, a path to a .state.json file." },
      },
    },
  },
  {
    name: "dossier_merge_state",
    description: "Apply a dossier.state/v1 packet to a model. Returns the merged model inline unless `outPath` is provided.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "object" },
        path: { type: "string", description: "Path to the source .dossier.json model." },
        state: { type: "object" },
        statePath: { type: "string", description: "Path to a .state.json packet." },
        outPath: { type: "string", description: "Optional path to write the merged JSON model." },
      },
    },
  },
  {
    name: "dossier_diff_state",
    description: "Return the structural diff that would result from applying a dossier.state/v1 packet to a model.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "object" },
        path: { type: "string", description: "Path to the source .dossier.json model." },
        state: { type: "object" },
        statePath: { type: "string", description: "Path to a .state.json packet." },
      },
    },
  },
  {
    name: "dossier_read_handoff",
    description: "Build or summarize a dossier.handoff/v1 packet for an agent continuing from exported state.",
    inputSchema: {
      type: "object",
      properties: {
        handoff: { type: "object", description: "Existing dossier.handoff/v1 packet to summarize." },
        handoffPath: { type: "string", description: "Path to an existing .handoff.json packet." },
        model: { type: "object" },
        path: { type: "string", description: "Path to the source .dossier.json model when building a handoff." },
        state: { type: "object" },
        statePath: { type: "string", description: "Path to a .state.json packet when building a handoff." },
      },
    },
  },
  {
    name: "dossier_prompt",
    description: "Generate an AI authoring/update prompt from a model and optional dossier.state/v1 packet.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "object" },
        path: { type: "string", description: "Path to the source .dossier.json model." },
        state: { type: "object" },
        statePath: { type: "string", description: "Path to a .state.json packet." },
      },
    },
  },
  {
    name: "dossier_resume_context",
    description: "Summarize a dossier model into agent-resumable context: block counts, process items, editors, patches, release gates, and receipts.",
    inputSchema: { type: "object", properties: { model: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_apply_edits",
    description: "Apply a dossier.edits/v1 packet to matching code-editor blocks by id, targetPath, filename, or title. Provide path to persist.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, model: { type: "object" }, edits: { type: "object" } }, required: ["edits"] },
  },
  {
    name: "dossier_apply_process",
    description: "Apply a dossier.process/v1 packet to process-board items, updating verdict and notes. Provide path to persist.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, model: { type: "object" }, process: { type: "object" } }, required: ["process"] },
  },
  {
    name: "dossier_apply_patch_review",
    description: "Apply a dossier.patch-review/v1 packet to patch-set patches, updating review and status. Provide path to persist.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, model: { type: "object" }, patches: { type: "object" } }, required: ["patches"] },
  },
  {
    name: "dossier_closeout_model",
    description: "Append a process-receipt block from packets and summary fields. Provide path to persist, otherwise returns the updated model.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        model: { type: "object" },
        packets: { type: "object" },
        title: { type: "string" },
        summary: { type: "string" },
        outcome: { type: "string" },
      },
    },
  },
  {
    name: "dossier_record_run",
    description: "Create or append a verification-run block for command/test evidence. Provide `path` to update a .dossier.json file, otherwise the block is returned.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        model: { type: "object" },
        title: { type: "string" },
        run: { type: "object", description: "{ id, title, command, status, expected, actual, duration, artifacts, notes }" },
      },
      required: ["run"],
    },
  },
  {
    name: "dossier_record_claim",
    description: "Create or append a trust-report claim and optional source records. Provide `path` to update a .dossier.json file, otherwise the block is returned.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        model: { type: "object" },
        title: { type: "string" },
        summary: { type: "string" },
        claim: { type: "object", description: "{ id, claim, title, status, confidence, sources, evidence, notes }." },
        sources: { type: "array", items: { type: "object" }, description: "Optional source records: { id, label, kind, url, trust, license, summary }." },
      },
      required: ["claim"],
    },
  },
  {
    name: "dossier_attach_patchset",
    description: "Create or append a patch-set block. Provide `path` to update a .dossier.json file, otherwise the block is returned.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        model: { type: "object" },
        title: { type: "string" },
        patchSet: { type: "object", description: "A full patch-set block or { patches: [...] }." },
      },
      required: ["patchSet"],
    },
  },
  {
    name: "dossier_closeout_digest",
    description: "Summarize decisions, process verdicts, edits, release gates, runs, and receipts into a closeout digest for handoff.",
    inputSchema: { type: "object", properties: { packets: { type: "object" }, model: { type: "object" }, path: { type: "string" } } },
  },
  {
    name: "dossier_get_schema",
    description: "Return the Dossier JSON Schema so you can author a valid model.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "dossier_get_packet_schema",
    description: "Return a packet JSON Schema by name: process, edits, verdicts, release, patch-review, diff-review, trust, closeout, state, handoff.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "dossier_get_starter",
    description: "Return a starter Dossier model for a given kind.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: STARTERS } } },
  },
];

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

function readPacket(args, keys) {
  for (const key of keys) if (args[key]) return args[key];
  if (args.path) return JSON.parse(readFileSync(args.path, "utf8"));
  return null;
}

function packetMap(packet, keys = []) {
  let src = packet;
  if (packet && typeof packet === "object") {
    for (const key of keys) {
      if (packet[key] !== undefined) {
        src = packet[key];
        break;
      }
    }
  }
  if (Array.isArray(src)) {
    return Object.fromEntries(
      src
        .filter((entry) => entry && typeof entry === "object")
        .map((entry, index) => [entry.id || String(index), entry])
    );
  }
  return src && typeof src === "object" ? src : {};
}

function loadModel(args) {
  if (args.model) return { model: args.model, path: null };
  if (args.path) return { model: JSON.parse(readFileSync(args.path, "utf8")), path: args.path };
  return { model: null, path: null };
}

function assertValidModel(model) {
  const v = validateModel(model);
  if (!v.ok) throw new Error("invalid dossier after update:\n- " + v.errors.join("\n- "));
}

function writeModel(path, model) {
  if (path) writeFileSync(path, JSON.stringify(model, null, 2) + "\n");
}

function appendOrCreateBlock(model, type, title, collectionKey, item) {
  model.blocks = Array.isArray(model.blocks) ? model.blocks : [];
  let block = model.blocks.find((b) => b && b.type === type && (!title || b.title === title));
  if (!block) {
    block = { type, title: title || type, [collectionKey]: [] };
    model.blocks.push(block);
  }
  block[collectionKey] = Array.isArray(block[collectionKey]) ? block[collectionKey] : [];
  block[collectionKey].push(item);
  return block;
}

function appendOrCreateTrustReport(model, title, summary) {
  model.blocks = Array.isArray(model.blocks) ? model.blocks : [];
  let block = model.blocks.find((b) => b && b.type === "trust-report" && (!title || b.title === title));
  if (!block) {
    block = { type: "trust-report", title: title || "Trust report", summary: summary || "", sources: [], claims: [] };
    model.blocks.push(block);
  }
  block.sources = Array.isArray(block.sources) ? block.sources : [];
  block.claims = Array.isArray(block.claims) ? block.claims : [];
  if (summary && !block.summary) block.summary = summary;
  return block;
}

function walkBlocks(blocks, fn) {
  (blocks || []).forEach((b) => {
    if (!b || typeof b !== "object") return;
    fn(b);
    if (b.blocks) walkBlocks(b.blocks, fn);
    if (b.left) walkBlocks(b.left, fn);
    if (b.right) walkBlocks(b.right, fn);
    if (b.tabs) b.tabs.forEach((t) => walkBlocks(t && t.blocks, fn));
    if (b.candidates) b.candidates.forEach((c) => walkBlocks(c && c.blocks, fn));
    if (b.items) b.items.forEach((it) => walkBlocks(it && it.blocks, fn));
  });
}

function blockId(modelBlock) {
  return modelBlock.id || modelBlock.targetPath || modelBlock.filename || modelBlock.title || "";
}

function updateAndWrite(args, updater) {
  const { model, path } = loadModel(args);
  if (!model) throw new Error("provide `model` or `path`");
  const result = updater(model);
  assertValidModel(model);
  writeModel(path, model);
  return { model, path, result };
}

function summarizeModel(model) {
  const counts = {};
  const editors = [];
  const processItems = [];
  const patches = [];
  const releaseGates = [];
  const receipts = [];
  const trustReports = [];
  walkBlocks(model.blocks, (b) => {
    counts[b.type] = (counts[b.type] || 0) + 1;
    if (b.type === "code-editor") editors.push({ id: blockId(b), title: b.title || "", targetPath: b.targetPath || "", filename: b.filename || "" });
    if (b.type === "process-board") (b.items || []).forEach((it) => processItems.push({ id: it.id, title: it.title, verdict: it.verdict || "undecided", status: it.status || "" }));
    if (b.type === "patch-set") (b.patches || []).forEach((p) => patches.push({ id: p.id, title: p.title, status: p.status || "", review: p.review || "" }));
    if (b.type === "release-checklist") (b.gates || []).forEach((g) => releaseGates.push({ id: g.id, title: g.title, status: g.status || "", required: !!g.required }));
    if (b.type === "process-receipt" || b.type === "receipt") receipts.push({ id: b.id || "", title: b.title || b.type, outcome: b.outcome || "" });
    if (b.type === "trust-report") trustReports.push({ id: b.id || "", title: b.title || "Trust report", sources: (b.sources || []).length, claims: (b.claims || []).length });
  });
  return {
    title: model.meta && model.meta.title,
    slug: model.meta && model.meta.slug,
    kind: model.kind || "dossier",
    counts,
    editors,
    processItems,
    patches,
    releaseGates,
    receipts,
    trustReports,
  };
}

function objectCount(map) {
  return Object.keys(map || {}).length;
}

function loadStatePacket(args, { allowPath = false } = {}) {
  if (args.state) return args.state;
  if (args.statePath) return JSON.parse(readFileSync(args.statePath, "utf8"));
  if (allowPath && args.path) return JSON.parse(readFileSync(args.path, "utf8"));
  return null;
}

function summarizeStatePacket(packet) {
  const state = normalizeStatePacket(packet || {});
  const packets = state.packets;
  const releaseGates = Object.values(packets.release || {});
  const edits = Object.values(packets.edits || {});
  return {
    schema: state.schema,
    slug: state.slug,
    updatedAt: state.updatedAt,
    totals: {
      actions: objectCount(packets.actions),
      completedActions: Object.values(packets.actions || {}).filter(Boolean).length,
      decisions: objectCount(packets.decisions),
      selectedDecisions: Object.values(packets.decisions || {}).filter((entry) => entry && entry.selected).length,
      processItems: objectCount(packets.process),
      edits: objectCount(packets.edits),
      dirtyEdits: edits.filter((entry) => entry && entry.dirty !== false).length,
      verdicts: objectCount(packets.verdicts),
      releaseGates: releaseGates.length,
      unresolvedReleaseGates: releaseGates.filter((gate) => gate && gate.required && !gate.done).length,
      patchReviews: objectCount(packets.patchReview),
      diffFileReviews: objectCount(packets.diffReview && packets.diffReview.files),
      diffHunkReviews: objectCount(packets.diffReview && packets.diffReview.hunks),
      evidence: objectCount(packets.evidence),
    },
    packets,
  };
}

function summarizeHandoffPacket(packet) {
  const handoff = packet && typeof packet === "object" ? packet : {};
  return {
    schema: handoff.schema || "dossier.handoff/v1",
    slug: handoff.slug || "",
    title: handoff.title || "",
    kind: handoff.kind || "dossier",
    generatedAt: handoff.generatedAt || "",
    totals: handoff.totals || {},
    nextAgentInstruction: handoff.nextAgentInstruction || "",
    dirtyEdits: Array.isArray(handoff.edits) ? handoff.edits.filter((entry) => entry && entry.dirty !== false) : [],
    unresolvedReleaseGates: handoff.release && Array.isArray(handoff.release.unresolved) ? handoff.release.unresolved : [],
    trustGaps: Array.isArray(handoff.trustGaps) ? handoff.trustGaps : [],
    handoff,
  };
}

function trustReportsFromModel(model) {
  const reports = [];
  walkBlocks(model.blocks, (b) => {
    if (b.type !== "trust-report") return;
    reports.push({
      id: b.id || "",
      title: b.title || "Trust report",
      summary: b.summary || "",
      sources: Array.isArray(b.sources) ? b.sources : [],
      claims: Array.isArray(b.claims) ? b.claims : [],
    });
  });
  return reports;
}

function normalizeTrustPacket(packet) {
  if (!packet || typeof packet !== "object") return [];
  if (Array.isArray(packet.reports)) return packet.reports;
  return [{
    id: packet.id || "",
    title: packet.title || "Trust report",
    summary: packet.summary || "",
    sources: Array.isArray(packet.sources) ? packet.sources : [],
    claims: Array.isArray(packet.claims) ? packet.claims : [],
  }];
}

function summarizeTrustReports(reports, slug) {
  const normalized = (reports || []).map((report) => {
    const sources = Array.isArray(report.sources) ? report.sources : [];
    const claims = Array.isArray(report.claims) ? report.claims : [];
    const sourceIds = new Set(sources.map((s) => s && s.id).filter(Boolean));
    const missingSources = [];
    const byStatus = {};
    const byConfidence = {};
    for (const claim of claims) {
      const status = claim.status || "unverified";
      const confidence = claim.confidence || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;
      byConfidence[confidence] = (byConfidence[confidence] || 0) + 1;
      for (const sid of claim.sources || []) if (!sourceIds.has(sid)) missingSources.push({ claim: claim.id || "", source: sid });
    }
    return {
      id: report.id || "",
      title: report.title || "Trust report",
      summary: report.summary || "",
      sources,
      claims,
      totals: { sources: sources.length, claims: claims.length },
      byStatus,
      byConfidence,
      missingSources,
    };
  });
  return {
    schema: "dossier.trust/v1",
    slug,
    reports: normalized,
    totals: {
      reports: normalized.length,
      sources: normalized.reduce((sum, r) => sum + r.totals.sources, 0),
      claims: normalized.reduce((sum, r) => sum + r.totals.claims, 0),
      missingSources: normalized.reduce((sum, r) => sum + r.missingSources.length, 0),
    },
  };
}

function closeoutFromPackets(model, packets = {}, args = {}) {
  const edits = packetMap(packets.edits || {}, ["edits", "items"]);
  const process = packetMap(packets.process || {}, ["process", "items"]);
  const release = packetMap(packets.release || {}, ["release", "gates"]);
  const changedFiles = [...new Set(Object.values(edits).map((e) => e && (e.targetPath || e.filename)).filter(Boolean))];
  const blocked = Object.entries(process).filter(([, e]) => e && ["block", "revise", "retry"].includes(e.verdict)).map(([id]) => id);
  const openGates = Object.entries(release).filter(([, e]) => e && e.required && !e.done).map(([id]) => id);
  return {
    type: "process-receipt",
    title: args.title || "Process closeout",
    summary: args.summary || "Closeout generated from Dossier process packets.",
    outcome: args.outcome || (blocked.length || openGates.length ? "needs-follow-up" : "ready"),
    owner: args.owner || "agent",
    date: new Date().toISOString(),
    model: model.meta && model.meta.slug,
    changedFiles,
    commands: Object.values(packets.runs || {}).map((r) => r && r.command).filter(Boolean),
    risks: [...blocked.map((id) => `Blocked or revision-needed process item: ${id}`), ...openGates.map((id) => `Required release gate still open: ${id}`)],
    followUps: [...blocked, ...openGates],
  };
}

async function handle(name, args) {
  if (name === "dossier_validate") {
    return text(validateModel(args.model || {}));
  }

  if (name === "dossier_render") {
    const model = args.model || {};
    const v = validateModel(model);
    if (!v.ok) return fail("invalid dossier:\n- " + v.errors.join("\n- "));
    const baseDir = args.outPath ? dirname(args.outPath) : undefined;
    const { html, embedHtml, md, digest } = await generate(model, { baseDir, theme: args.theme, skin: args.skin });
    if (args.outPath) {
      const slug = (model.meta && model.meta.slug) || basename(args.outPath).replace(/\.(dossier\.)?(json|html)$/i, "");
      const htmlPath = join(dirname(args.outPath), slug + ".html");
      const embedPath = join(dirname(args.outPath), slug + ".embed.html");
      const mdPath = join(dirname(args.outPath), slug + ".md");
      writeFileSync(htmlPath, html);
      if (args.embed) writeFileSync(embedPath, embedHtml);
      writeFileSync(mdPath, md);
      return text({ ok: true, slug, htmlPath, embedPath: args.embed ? embedPath : null, mdPath, bytes: html.length });
    }
    const content = [{ type: "text", text: `Rendered (${html.length} bytes). Digest:\n\n${digest}` }, { type: "text", text: html }];
    if (args.embed) content.push({ type: "text", text: embedHtml });
    return { content };
  }

  if (name === "dossier_read_decisions") {
    let packet = readPacket(args, ["decisions"]);
    if (!packet) return fail("provide `decisions` or `path`");
    const map = packetMap(packet, ["decisions"]);
    const selected = [];
    const noted = [];
    for (const [id, d] of Object.entries(map)) {
      if (d && d.selected) selected.push({ id, notes: d.notes || "" });
      else if (d && d.notes) noted.push({ id, notes: d.notes });
    }
    return text({ slug: packet.slug, selected, notedButNotSelected: noted, totals: { selected: selected.length, considered: Object.keys(map).length } });
  }

  if (name === "dossier_read_process") {
    let packet = readPacket(args, ["process"]);
    if (!packet) return fail("provide `process` or `path`");
    const map = packetMap(packet, ["process", "items"]);
    const byVerdict = {};
    const noted = [];
    for (const [id, entry] of Object.entries(map)) {
      if (!entry || typeof entry !== "object") continue;
      const verdict = entry.verdict || "undecided";
      const row = { id, verdict, notes: entry.notes || "" };
      if (verdict && verdict !== "undecided") {
        byVerdict[verdict] = byVerdict[verdict] || [];
        byVerdict[verdict].push(row);
      } else if (entry.notes) noted.push(row);
    }
    const totals = Object.fromEntries(Object.entries(byVerdict).map(([k, v]) => [k, v.length]));
    return text({ schema: packet.schema || "dossier.process/v1", slug: packet.slug, byVerdict, notedButUndecided: noted, totals: { ...totals, considered: Object.keys(map).length } });
  }

  if (name === "dossier_read_edits") {
    let packet = readPacket(args, ["edits"]);
    if (!packet) return fail("provide `edits` or `path`");
    const map = packetMap(packet, ["edits", "items"]);
    const edits = [];
    const byTargetPath = {};
    for (const [id, entry] of Object.entries(map)) {
      if (!entry || typeof entry !== "object") continue;
      const row = {
        id,
        text: entry.text || "",
        lang: entry.lang || "",
        filename: entry.filename || "",
        targetPath: entry.targetPath || "",
        title: entry.title || "",
        dirty: !!entry.dirty,
      };
      edits.push(row);
      const key = row.targetPath || row.filename || "(untargeted)";
      byTargetPath[key] = byTargetPath[key] || [];
      byTargetPath[key].push(row);
    }
    return text({ schema: packet.schema || "dossier.edits/v1", slug: packet.slug, edits, byTargetPath, totals: { edits: edits.length, dirty: edits.filter((x) => x.dirty).length } });
  }

  if (name === "dossier_read_verdicts") {
    const packet = readPacket(args, ["verdicts"]);
    if (!packet) return fail("provide `verdicts` or `path`");
    const map = packetMap(packet, ["verdicts", "items"]);
    const byVerdict = {};
    for (const [id, entry] of Object.entries(map)) {
      if (!entry || typeof entry !== "object") continue;
      const verdict = entry.verdict || "undecided";
      byVerdict[verdict] = byVerdict[verdict] || [];
      byVerdict[verdict].push({ id, verdict, notes: entry.notes || "" });
    }
    return text({ schema: packet.schema || "dossier.verdicts/v1", slug: packet.slug, byVerdict, totals: Object.fromEntries(Object.entries(byVerdict).map(([k, v]) => [k, v.length])) });
  }

  if (name === "dossier_read_release") {
    const packet = readPacket(args, ["release"]);
    if (!packet) return fail("provide `release` or `path`");
    const map = packetMap(packet, ["release", "gates"]);
    const gates = Object.entries(map).map(([id, entry]) => ({
      id,
      done: !!(entry && entry.done),
      notes: (entry && entry.notes) || "",
      title: (entry && entry.title) || "",
      required: !!(entry && entry.required),
    }));
    return text({ schema: packet.schema || "dossier.release/v1", slug: packet.slug, gates, totals: { gates: gates.length, done: gates.filter((g) => g.done).length } });
  }

  if (name === "dossier_read_patch_review") {
    const packet = readPacket(args, ["patches"]);
    if (!packet) return fail("provide `patches` or `path`");
    const map = packetMap(packet, ["patches", "items"]);
    const byVerdict = {};
    for (const [id, entry] of Object.entries(map)) {
      if (!entry || typeof entry !== "object") continue;
      const verdict = entry.verdict || "undecided";
      byVerdict[verdict] = byVerdict[verdict] || [];
      byVerdict[verdict].push({ id, verdict, notes: entry.notes || "", title: entry.title || "" });
    }
    return text({ schema: packet.schema || "dossier.patch-review/v1", slug: packet.slug, byVerdict, totals: Object.fromEntries(Object.entries(byVerdict).map(([k, v]) => [k, v.length])) });
  }

  if (name === "dossier_read_diff_review") {
    const packet = readPacket(args, ["review"]);
    if (!packet) return fail("provide `review` or `path`");
    const files = packetMap(packet, ["files"]);
    const hunks = packetMap(packet, ["hunks"]);
    const summarize = (map) => {
      const byVerdict = {};
      for (const [id, entry] of Object.entries(map)) {
        if (!entry || typeof entry !== "object") continue;
        const verdict = entry.verdict || "undecided";
        byVerdict[verdict] = byVerdict[verdict] || [];
        byVerdict[verdict].push({ id, verdict, comment: entry.comment || "" });
      }
      return byVerdict;
    };
    return text({ schema: packet.schema || "dossier.diff-review/v1", slug: packet.slug, files: summarize(files), hunks: summarize(hunks), totals: { files: Object.keys(files).length, hunks: Object.keys(hunks).length } });
  }

  if (name === "dossier_read_trust") {
    if (args.model) {
      return text(summarizeTrustReports(trustReportsFromModel(args.model), args.model.meta && args.model.meta.slug));
    }
    const packet = args.trust || (args.path ? JSON.parse(readFileSync(args.path, "utf8")) : null);
    if (!packet) return fail("provide `model`, `trust`, or `path`");
    if (packet.blocks) return text(summarizeTrustReports(trustReportsFromModel(packet), packet.meta && packet.meta.slug));
    return text(summarizeTrustReports(normalizeTrustPacket(packet), packet.slug));
  }

  if (name === "dossier_read_state") {
    const packet = loadStatePacket(args, { allowPath: true });
    if (!packet) return fail("provide `state` or `path`");
    return text(summarizeStatePacket(packet));
  }

  if (name === "dossier_merge_state") {
    const { model } = loadModel(args);
    if (!model) return fail("provide `model` or `path`");
    const state = loadStatePacket(args);
    if (!state) return fail("provide `state` or `statePath`");
    const merged = mergeStateIntoModel(model, state);
    assertValidModel(merged);
    const diff = diffStateAgainstModel(model, state);
    if (args.outPath) writeFileSync(args.outPath, JSON.stringify(merged, null, 2) + "\n");
    return text({ ok: true, path: args.outPath || null, diff, model: args.outPath ? undefined : merged });
  }

  if (name === "dossier_diff_state") {
    const { model } = loadModel(args);
    if (!model) return fail("provide `model` or `path`");
    const state = loadStatePacket(args);
    if (!state) return fail("provide `state` or `statePath`");
    return text(diffStateAgainstModel(model, state));
  }

  if (name === "dossier_read_handoff") {
    const handoff = args.handoff || (args.handoffPath ? JSON.parse(readFileSync(args.handoffPath, "utf8")) : null);
    if (handoff) return text(summarizeHandoffPacket(handoff));
    const { model } = loadModel(args);
    if (!model) return fail("provide `handoff`, `handoffPath`, `model`, or `path`");
    return text(summarizeHandoffPacket(buildHandoffPacket(model, loadStatePacket(args) || {})));
  }

  if (name === "dossier_prompt") {
    const { model } = loadModel(args);
    if (!model) return fail("provide `model` or `path`");
    return text(promptForModel(model, loadStatePacket(args) || {}));
  }

  if (name === "dossier_resume_context") {
    const { model } = loadModel(args);
    if (!model) return fail("provide `model` or `path`");
    return text(summarizeModel(model));
  }

  if (name === "dossier_apply_edits") {
    const edits = packetMap(args.edits, ["edits", "items"]);
    const { path, result } = updateAndWrite(args, (model) => {
      let applied = 0;
      const misses = [];
      for (const [id, entry] of Object.entries(edits)) {
        if (!entry || typeof entry !== "object" || entry.text == null) continue;
        let found = false;
        walkBlocks(model.blocks, (b) => {
          if (found || b.type !== "code-editor") return;
          if (b.id === id || b.targetPath === entry.targetPath || b.filename === entry.filename || b.title === entry.title) {
            b.code = String(entry.text);
            found = true;
            applied += 1;
          }
        });
        if (!found) misses.push(id);
      }
      return { applied, misses };
    });
    return text({ ok: true, path, ...result });
  }

  if (name === "dossier_apply_process") {
    const process = packetMap(args.process, ["process", "items"]);
    const { path, result } = updateAndWrite(args, (model) => {
      let applied = 0;
      const misses = [];
      for (const [id, entry] of Object.entries(process)) {
        let found = false;
        walkBlocks(model.blocks, (b) => {
          if (found || b.type !== "process-board") return;
          const item = (b.items || []).find((it) => it && it.id === id);
          if (item) {
            if (entry.verdict) item.verdict = entry.verdict;
            if (entry.notes != null) item.notes = entry.notes;
            found = true;
            applied += 1;
          }
        });
        if (!found) misses.push(id);
      }
      return { applied, misses };
    });
    return text({ ok: true, path, ...result });
  }

  if (name === "dossier_apply_patch_review") {
    const patches = packetMap(args.patches, ["patches", "items"]);
    const { path, result } = updateAndWrite(args, (model) => {
      let applied = 0;
      const misses = [];
      for (const [id, entry] of Object.entries(patches)) {
        let found = false;
        walkBlocks(model.blocks, (b) => {
          if (found || b.type !== "patch-set") return;
          const patch = (b.patches || []).find((p) => p && p.id === id);
          if (patch) {
            if (entry.verdict) {
              patch.review = entry.verdict;
              if (entry.verdict === "approve") patch.status = "accepted";
              else if (entry.verdict === "revise") patch.status = "needs-revision";
              else if (entry.verdict === "skip") patch.status = "skipped";
            }
            if (entry.notes != null) patch.notes = entry.notes;
            found = true;
            applied += 1;
          }
        });
        if (!found) misses.push(id);
      }
      return { applied, misses };
    });
    return text({ ok: true, path, ...result });
  }

  if (name === "dossier_record_run") {
    const run = { id: args.run.id || "run-" + Date.now(), title: args.run.title || args.run.command || "Verification run", ...args.run };
    const { model, path } = loadModel(args);
    if (!model) return text({ type: "verification-run", title: args.title || "Verification runs", runs: [run] });
    const block = appendOrCreateBlock(model, "verification-run", args.title || "Verification runs", "runs", run);
    assertValidModel(model);
    writeModel(path, model);
    return text({ ok: true, path, block });
  }

  if (name === "dossier_record_claim") {
    const stamp = Date.now();
    const sources = (Array.isArray(args.sources) ? args.sources : [])
      .filter((s) => s && typeof s === "object")
      .map((s, index) => ({ ...s, id: s.id || slugify(s.label || s.url || "source") + "-" + stamp + "-" + index }));
    const claim = {
      id: args.claim.id || slugify(args.claim.claim || args.claim.title || "claim") + "-" + stamp,
      status: "unverified",
      confidence: "unknown",
      ...args.claim,
    };
    const sourceIds = sources.map((s) => s && s.id).filter(Boolean);
    if (!claim.sources && sourceIds.length) claim.sources = sourceIds;
    const blockPayload = { type: "trust-report", title: args.title || "Trust report", summary: args.summary || "", sources, claims: [claim] };
    const { model, path } = loadModel(args);
    if (!model) return text(blockPayload);
    const block = appendOrCreateTrustReport(model, args.title || "Trust report", args.summary || "");
    for (const source of sources) {
      const existing = block.sources.find((s) => s && s.id === source.id);
      if (existing) Object.assign(existing, source);
      else block.sources.push(source);
    }
    const existingClaim = block.claims.find((c) => c && c.id === claim.id);
    if (existingClaim) Object.assign(existingClaim, claim);
    else block.claims.push(claim);
    assertValidModel(model);
    writeModel(path, model);
    return text({ ok: true, path, block });
  }

  if (name === "dossier_attach_patchset") {
    const patchSet = args.patchSet.type === "patch-set" ? args.patchSet : { type: "patch-set", title: args.title || "Patch set", patches: args.patchSet.patches || [] };
    const { model, path } = loadModel(args);
    if (!model) return text(patchSet);
    model.blocks = Array.isArray(model.blocks) ? model.blocks : [];
    model.blocks.push(patchSet);
    assertValidModel(model);
    writeModel(path, model);
    return text({ ok: true, path, block: patchSet });
  }

  if (name === "dossier_closeout_digest") {
    const model = args.model || (args.path ? JSON.parse(readFileSync(args.path, "utf8")) : null);
    const packets = args.packets || {};
    const digest = {
      title: model && model.meta && model.meta.title,
      slug: (model && model.meta && model.meta.slug) || packets.slug,
      decisions: packets.decisions ? Object.keys(packetMap(packets.decisions, ["decisions"])).length : 0,
      processItems: packets.process ? Object.keys(packetMap(packets.process, ["process", "items"])).length : 0,
      edits: packets.edits ? Object.keys(packetMap(packets.edits, ["edits", "items"])).length : 0,
      verdicts: packets.verdicts ? Object.keys(packetMap(packets.verdicts, ["verdicts", "items"])).length : 0,
      releaseGates: packets.release ? Object.keys(packetMap(packets.release, ["release", "gates"])).length : 0,
      summary: "Closeout packet ready for handoff. Review non-approved verdicts, dirty edits, failed runs, and unresolved release gates before marking durable.",
    };
    return text(digest);
  }

  if (name === "dossier_closeout_model") {
    const { model, path } = loadModel(args);
    if (!model) return fail("provide `model` or `path`");
    model.blocks = Array.isArray(model.blocks) ? model.blocks : [];
    const receipt = closeoutFromPackets(model, args.packets || {}, args);
    model.blocks.push(receipt);
    assertValidModel(model);
    writeModel(path, model);
    return text({ ok: true, path, block: receipt, model: path ? undefined : model });
  }

  if (name === "dossier_get_schema") {
    return text(readFileSync(join(root, "schema/dossier.schema.json"), "utf8"));
  }

  if (name === "dossier_get_packet_schema") {
    const allowed = new Set(["process", "edits", "verdicts", "release", "patch-review", "diff-review", "trust", "closeout", "state", "handoff"]);
    const schemaName = String(args.name || "").replace(/\.schema\.json$/, "");
    if (!allowed.has(schemaName)) return fail("unknown packet schema: " + args.name);
    return text(readFileSync(join(root, `schema/packets/${schemaName}.schema.json`), "utf8"));
  }

  if (name === "dossier_get_starter") {
    const kind = STARTERS.includes(args.kind) ? args.kind : "dossier";
    return text(readFileSync(join(root, `src/starters/${kind}.dossier.json`), "utf8"));
  }

  return fail("unknown tool: " + name);
}

export const handleTool = handle;

export function createServer() {
  const server = new Server({ name: "dossier", version: "0.6.6" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await handle(req.params.name, req.params.arguments || {});
    } catch (e) {
      return fail(String(e && e.message ? e.message : e));
    }
  });
  return server;
}

export async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stderr is safe for logs (stdout is the JSON-RPC channel)
  console.error("dossier mcp server ready (stdio)");
}
