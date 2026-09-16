import { diffModels } from "./diff.mjs";
import { slugify } from "./generate.mjs";

export const STATE_SCHEMA = "dossier.state/v1";
export const HANDOFF_SCHEMA = "dossier.handoff/v1";

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

export function packetMap(packet, keys = []) {
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

export function normalizeStatePacket(packet = {}) {
  const packets = packet.packets && typeof packet.packets === "object" ? packet.packets : packet;
  return {
    schema: STATE_SCHEMA,
    slug: packet.slug || "",
    updatedAt: packet.updatedAt || packet.exportedAt || "",
    packets: {
      actions: packetMap(packets.actions || packet.actionItems || {}, ["actions", "items"]),
      decisions: packetMap(packets.decisions || {}, ["decisions", "items"]),
      process: packetMap(packets.process || {}, ["process", "items"]),
      edits: packetMap(packets.edits || packets.editors || {}, ["edits", "items"]),
      verdicts: packetMap(packets.verdicts || {}, ["verdicts", "items"]),
      release: packetMap(packets.release || {}, ["release", "gates"]),
      patchReview: packetMap(packets.patchReview || packets.patches || {}, ["patches", "items"]),
      diffReview: {
        files: packetMap((packets.diffReview && packets.diffReview.files) || packets.files || {}, ["files"]),
        hunks: packetMap((packets.diffReview && packets.diffReview.hunks) || packets.hunks || {}, ["hunks"]),
      },
      evidence: packetMap(packets.evidence || {}, ["evidence", "items"]),
    },
  };
}

export function eachBlock(blocks, fn) {
  (blocks || []).forEach((block) => {
    if (!block || typeof block !== "object") return;
    fn(block);
    if (block.blocks) eachBlock(block.blocks, fn);
    if (block.left) eachBlock(block.left, fn);
    if (block.right) eachBlock(block.right, fn);
    if (block.tabs) block.tabs.forEach((tab) => eachBlock(tab.blocks, fn));
    if (block.candidates) block.candidates.forEach((candidate) => eachBlock(candidate.blocks, fn));
    if (block.items) block.items.forEach((item) => eachBlock(item.blocks, fn));
  });
}

function applyByNestedId(items, map, apply) {
  (items || []).forEach((item, index) => {
    const id = item.id || String(index);
    const update = map[id];
    if (update) apply(item, update);
  });
}

function statusForDone(done, current = "todo") {
  return done ? "done" : current === "done" || current === "passed" ? "todo" : current;
}

export function mergeStateIntoModel(model, statePacket = {}) {
  const next = clone(model);
  const state = normalizeStatePacket(statePacket);
  const packets = state.packets;

  eachBlock(next.blocks || [], (block) => {
    if (block.type === "action-items") {
      (block.items || []).forEach((item, index) => {
        const id = `${block.id}:${index}`;
        if (packets.actions[id] !== undefined) item.status = packets.actions[id] ? "done" : statusForDone(false, item.status);
      });
    }
    if (block.type === "review-board") {
      applyByNestedId(block.candidates, packets.decisions, (candidate, update) => {
        if (update.selected !== undefined) candidate.selected = !!update.selected;
        if (update.notes !== undefined) candidate.notes = String(update.notes || "");
      });
    }
    if (block.type === "process-board") {
      applyByNestedId(block.items, packets.process, (item, update) => {
        if (update.verdict !== undefined) item.verdict = update.verdict;
        if (update.notes !== undefined) item.notes = String(update.notes || "");
      });
    }
    if (block.type === "code-editor") {
      const id = block.id || slugify(block.title || block.filename || block.targetPath || "code-editor");
      const update =
        packets.edits[id] ||
        Object.values(packets.edits).find((entry) =>
          entry &&
          ((entry.targetPath && entry.targetPath === block.targetPath) ||
            (entry.filename && entry.filename === block.filename) ||
            (entry.title && entry.title === block.title))
        );
      if (update && update.text !== undefined) block.code = String(update.text);
    }
    if (block.type === "verdict-gate") {
      const id = block.gateId || block.id || slugify(block.title || "verdict-gate");
      const update = packets.verdicts[id];
      if (update) {
        if (update.verdict !== undefined) block.verdict = update.verdict;
        if (update.notes !== undefined) block.notes = String(update.notes || "");
      }
    }
    if (block.type === "release-checklist") {
      applyByNestedId(block.gates, packets.release, (gate, update) => {
        if (update.done !== undefined) gate.status = update.done ? "done" : statusForDone(false, gate.status);
        if (update.notes !== undefined) gate.evidence = String(update.notes || "");
      });
    }
    if (block.type === "patch-set") {
      applyByNestedId(block.patches, packets.patchReview, (patch, update) => {
        if (update.verdict !== undefined) {
          patch.review = update.verdict;
          if (update.verdict === "approve") patch.status = patch.status === "applied" ? "applied" : "accepted";
          else if (update.verdict === "revise") patch.status = "needs-revision";
          else if (update.verdict === "skip") patch.status = "skipped";
        }
        if (update.notes !== undefined) patch.notes = String(update.notes || "");
      });
    }
    if (block.type === "diff-view" && (Object.keys(packets.diffReview.files).length || Object.keys(packets.diffReview.hunks).length)) {
      block.review = { files: packets.diffReview.files, hunks: packets.diffReview.hunks };
    }
  });

  const evidenceItems = Object.entries(packets.evidence).map(([id, item]) => ({ id, ...item }));
  if (evidenceItems.length) {
    let log = (next.blocks || []).find((block) => block && block.type === "evidence-log");
    if (!log) {
      log = { type: "evidence-log", id: "state-evidence", title: "Attached evidence", items: [] };
      next.blocks = Array.isArray(next.blocks) ? next.blocks : [];
      next.blocks.push(log);
    }
    const seen = new Set((log.items || []).map((item) => item.id));
    log.items = [...(log.items || []), ...evidenceItems.filter((item) => !seen.has(item.id))];
  }

  next.meta = next.meta || {};
  if (state.updatedAt) next.meta.stateExportedAt = state.updatedAt;
  return next;
}

function countMap(map) {
  return Object.keys(map || {}).length;
}

function groupByValue(map, field) {
  const grouped = {};
  for (const [id, entry] of Object.entries(map || {})) {
    const key = (entry && entry[field]) || "undecided";
    grouped[key] = grouped[key] || [];
    grouped[key].push({ id, ...entry });
  }
  return grouped;
}

function trustGaps(model) {
  const gaps = [];
  eachBlock(model.blocks || [], (block) => {
    if (block.type !== "trust-report") return;
    const sources = new Set((block.sources || []).map((source) => source.id).filter(Boolean));
    (block.claims || []).forEach((claim) => {
      if ((claim.status || "unverified") !== "verified") gaps.push({ id: claim.id || slugify(claim.claim || "claim"), claim: claim.claim || claim.title || "", status: claim.status || "unverified" });
      (claim.sources || []).forEach((sourceId) => {
        if (!sources.has(sourceId)) gaps.push({ id: claim.id || slugify(claim.claim || "claim"), claim: claim.claim || claim.title || "", missingSource: sourceId });
      });
    });
  });
  return gaps;
}

export function buildHandoffPacket(model, statePacket = {}) {
  const state = normalizeStatePacket(statePacket);
  const packets = state.packets;
  const dirtyEdits = Object.entries(packets.edits)
    .filter(([, entry]) => entry && entry.dirty !== false)
    .map(([id, entry]) => ({ id, targetPath: entry.targetPath || entry.filename || "", title: entry.title || "", dirty: entry.dirty !== false }));
  const releaseGates = Object.entries(packets.release).map(([id, gate]) => ({ id, ...gate }));
  const unresolvedRelease = releaseGates.filter((gate) => gate.required && !gate.done);
  return {
    schema: HANDOFF_SCHEMA,
    slug: (model.meta && model.meta.slug) || state.slug || "dossier",
    title: (model.meta && model.meta.title) || "Dossier",
    kind: model.kind || "dossier",
    generatedAt: state.updatedAt || new Date().toISOString(),
    totals: {
      decisions: countMap(packets.decisions),
      selectedDecisions: Object.values(packets.decisions).filter((entry) => entry && entry.selected).length,
      processItems: countMap(packets.process),
      edits: countMap(packets.edits),
      dirtyEdits: dirtyEdits.length,
      releaseGates: releaseGates.length,
      unresolvedReleaseGates: unresolvedRelease.length,
      patchReviews: countMap(packets.patchReview),
      diffFileReviews: countMap(packets.diffReview.files),
      diffHunkReviews: countMap(packets.diffReview.hunks),
      evidence: countMap(packets.evidence),
    },
    decisions: {
      selected: Object.entries(packets.decisions).filter(([, entry]) => entry && entry.selected).map(([id, entry]) => ({ id, ...entry })),
      noted: Object.entries(packets.decisions).filter(([, entry]) => entry && entry.notes).map(([id, entry]) => ({ id, ...entry })),
    },
    process: groupByValue(packets.process, "verdict"),
    patchReview: groupByValue(packets.patchReview, "verdict"),
    diffReview: packets.diffReview,
    edits: dirtyEdits,
    release: { gates: releaseGates, unresolved: unresolvedRelease },
    evidence: Object.entries(packets.evidence).map(([id, entry]) => ({ id, ...entry })),
    trustGaps: trustGaps(model),
    nextAgentInstruction:
      "Use approved or selected items first. Preserve notes as constraints. Apply dirty edits only when their targetPath or surrounding context is unambiguous. Resolve unresolved release gates and trust gaps before marking durable.",
  };
}

export function diffStateAgainstModel(model, statePacket = {}) {
  return diffModels(model, mergeStateIntoModel(model, statePacket));
}

export function promptForModel(model, statePacket = {}) {
  const state = normalizeStatePacket(statePacket);
  const handoff = buildHandoffPacket(model, state);
  return [
    `Create or update a Dossier JSON model for "${handoff.title}".`,
    "",
    "Requirements:",
    "- Use dossierVersion \"1.0\" and stable kebab-case ids for every block and nested packet item.",
    `- Kind should be "${handoff.kind}". Use process blocks when work must round-trip to an agent.`,
    "- Include a hero first, then sectioned blocks with concise titles and source-backed claims.",
    "- For implementation or review work, include process-board, patch-set or diff-view, verification-run, trust-report, and process-receipt blocks when relevant.",
    "- For user choices, use review-board for planning selections and process-board or verdict-gate for executable work decisions.",
    "- Add targetPath on every code-editor that should be applied back to files.",
    "- Add trust-report sources and claims for any important assertion.",
    "- Keep export semantics clear: source JSON is the authored model; state packets are human changes; merged JSON applies state back into the model.",
    "",
    `Current handoff summary: ${JSON.stringify(handoff.totals)}`,
  ].join("\n");
}
