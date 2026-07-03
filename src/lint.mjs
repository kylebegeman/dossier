import { eachBlock } from "./state.mjs";

const push = (warnings, path, message) => warnings.push({ path, message });

function stringFields(value, path = "$", out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, index) => stringFields(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("_")) continue;
      stringFields(child, `${path}.${key}`, out);
    }
  }
  return out;
}

function collectEvidenceIds(model) {
  const ids = new Set();
  eachBlock(model.blocks || [], (block) => {
    if (block.type === "evidence-log") (block.items || []).forEach((item) => item.id && ids.add(item.id));
    if (block.type === "verification-run") (block.runs || []).forEach((run) => run.id && ids.add(run.id));
  });
  return ids;
}

export function lintModel(model, opts = {}) {
  const warnings = [];
  if (!model || typeof model !== "object") return { ok: false, warnings: [{ path: "$", message: "document must be an object" }] };

  const blockIds = new Set();
  const footnoteDefs = new Set();
  const citationDefs = new Set();
  const trustEvidence = collectEvidenceIds(model);
  const knownSlugs = new Set(opts.knownSlugs || []);
  if (model.meta && model.meta.slug) knownSlugs.add(model.meta.slug);

  const visit = (blocks, base = "blocks") => {
    (blocks || []).forEach((block, index) => {
      const path = `${base}[${index}]`;
      if (!block || typeof block !== "object") return;
      if (block.id) blockIds.add(block.id);
      if (block.type === "footnotes") (block.items || []).forEach((item) => item.id && footnoteDefs.add(item.id));
      if (block.type === "citations") (block.items || []).forEach((item) => item.id && citationDefs.add(item.id));
      if (block.type === "code-editor" && !block.targetPath && !block.filename) {
        push(warnings, path, "code-editor should include targetPath or filename so edits can be applied safely");
      }
      if (block.type === "figure" && /^https?:/i.test(block.src || "")) {
        push(warnings, path, "remote figure sources are not self-contained; prefer a local file or data URI");
      }
      if (block.type === "trust-report") {
        const sources = new Set((block.sources || []).map((source) => source.id).filter(Boolean));
        (block.claims || []).forEach((claim, claimIndex) => {
          const claimPath = `${path}.claims[${claimIndex}]`;
          if (!claim.sources || !claim.sources.length) push(warnings, claimPath, "trust claim has no sources");
          (claim.sources || []).forEach((sourceId) => {
            if (!sources.has(sourceId)) push(warnings, claimPath, `trust claim references missing source "${sourceId}"`);
          });
          (claim.evidence || []).forEach((evidenceId) => {
            if (!trustEvidence.has(evidenceId)) push(warnings, claimPath, `trust claim references missing evidence "${evidenceId}"`);
          });
        });
      }
      if (block.type === "release-checklist") {
        (block.gates || []).forEach((gate, gateIndex) => {
          if (gate.required && (gate.status === "done" || gate.status === "passed") && !gate.evidence) {
            push(warnings, `${path}.gates[${gateIndex}]`, "required completed release gate should include evidence");
          }
        });
      }
      if (block.blocks) visit(block.blocks, `${path}.blocks`);
      if (block.left) visit(block.left, `${path}.left`);
      if (block.right) visit(block.right, `${path}.right`);
      if (block.tabs) block.tabs.forEach((tab, tabIndex) => visit(tab.blocks, `${path}.tabs[${tabIndex}].blocks`));
      if (block.candidates) block.candidates.forEach((candidate, candidateIndex) => visit(candidate.blocks, `${path}.candidates[${candidateIndex}].blocks`));
      if (block.items) block.items.forEach((item, itemIndex) => visit(item.blocks, `${path}.items[${itemIndex}].blocks`));
    });
  };
  visit(model.blocks || []);

  for (const [path, text] of stringFields(model)) {
    for (const match of text.matchAll(/\[\^([a-z0-9-]+)\]/g)) {
      if (!footnoteDefs.has(match[1])) push(warnings, path, `footnote reference "${match[1]}" has no footnotes item`);
    }
    for (const match of text.matchAll(/\[@([a-z0-9-]+)\]/g)) {
      if (!citationDefs.has(match[1])) push(warnings, path, `citation reference "${match[1]}" has no citations item`);
    }
    for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const ref = match[1].trim();
      const slug = ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (slug && !blockIds.has(slug) && !knownSlugs.has(slug) && opts.checkCrossLinks) {
        push(warnings, path, `cross-link "${ref}" does not match a known slug in this lint context`);
      }
    }
  }

  return { ok: warnings.length === 0, warnings };
}

export function formatLintWarnings(warnings) {
  return (warnings || []).map((warning) => `${warning.path}: ${warning.message}`).join("\n");
}
