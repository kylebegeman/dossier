// Lightweight, friendly validation for a Dossier model. Catches the mistakes that
// actually happen (unknown block types, missing required fields, bad slugs, duplicate
// ids, broken structure) with path-pointed messages. No dependencies.

import { knownBlockTypes } from "./generate.mjs";
import { SKINS, skinNames } from "./skins.mjs";

// Required fields per built-in block type (plugins are allowed without required-field checks).
const REQUIRED = {
  hero: ["title"],
  prose: ["markdown"],
  section: ["title"],
  "two-col": ["left", "right"],
  "summary-cards": ["cards"],
  "stat-strip": ["stats"],
  flow: ["steps"],
  timeline: ["phases"],
  table: ["columns", "rows"],
  callout: ["body"],
  code: ["code"],
  "code-editor": ["code"],
  "patch-set": ["patches"],
  "diff-view": ["diff"],
  tabs: ["tabs"],
  faq: ["items"],
  references: ["items"],
  "decision-matrix": ["options", "criteria"],
  "risk-register": ["risks"],
  "action-items": ["items"],
  assumptions: ["items"],
  glossary: ["terms"],
  diagram: ["spec"],
  "review-board": ["candidates"],
  "process-board": ["items"],
  "verification-run": ["runs"],
  "evidence-log": ["items"],
  "trust-report": ["claims"],
  "verdict-gate": ["prompt"],
  "process-receipt": [],
  "finding-list": ["findings"],
  "comment-thread": ["threads"],
  "cycle-board": ["cycles"],
  "integration-report": [],
  "upstream-response": [],
  "release-checklist": ["gates"],
  "decision-log": ["decisions"],
  figure: ["src"],
  math: ["tex"],
  footnotes: ["items"],
  citations: ["items"],
  chart: ["data"],
  receipt: [],
};

const isEmpty = (v) =>
  v === undefined || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && !v.trim());

const ID_COLLECTIONS = {
  "review-board": ["candidates"],
  "process-board": ["items"],
  "patch-set": ["patches"],
  "verification-run": ["runs"],
  "evidence-log": ["items"],
  "trust-report": ["sources", "claims"],
  "finding-list": ["findings"],
  "comment-thread": ["threads"],
  "cycle-board": ["cycles"],
  "integration-report": ["items"],
  "release-checklist": ["gates"],
  "decision-log": ["decisions"],
  footnotes: ["items"],
  citations: ["items"],
};

function validateNestedIds(b, p, errors) {
  for (const field of ID_COLLECTIONS[b.type] || []) {
    if (b[field] === undefined) continue;
    if (!Array.isArray(b[field])) {
      errors.push(`${p}.${field}: must be an array`);
      continue;
    }
    const seen = new Set();
    b[field].forEach((item, i) => {
      const ip = `${p}.${field}[${i}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${ip}: must be an object`);
        return;
      }
      if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id)) {
        errors.push(`${ip}.id: required slug ([a-z0-9-]) is missing or invalid`);
      } else if (seen.has(item.id)) {
        errors.push(`${ip}.id: duplicate id "${item.id}" in ${field}`);
      } else {
        seen.add(item.id);
      }
    });
  }
}

function walk(blocks, path, errors, known, seen) {
  if (!Array.isArray(blocks)) {
    errors.push(`${path}: must be an array of blocks`);
    return;
  }
  blocks.forEach((b, i) => {
    const p = `${path}[${i}]`;
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      errors.push(`${p}: must be a block object`);
      return;
    }
    if (typeof b.type !== "string") {
      errors.push(`${p}.type: required (string) is missing`);
      return;
    }
    if (!known.has(b.type)) {
      errors.push(`${p}.type: unknown block type "${b.type}" (did you register a plugin?)`);
    }
    if (b.id !== undefined) {
      if (typeof b.id !== "string" || !/^[a-z0-9-]+$/.test(b.id)) errors.push(`${p}.id: must be a slug ([a-z0-9-])`);
      else if (seen.has(b.id)) errors.push(`${p}.id: duplicate id "${b.id}"`);
      else seen.add(b.id);
    }
    for (const f of REQUIRED[b.type] || []) {
      if (isEmpty(b[f])) errors.push(`${p} (${b.type}): missing required "${f}"`);
    }
    validateNestedIds(b, p, errors);
    if (b.blocks) walk(b.blocks, `${p}.blocks`, errors, known, seen);
    if (b.left) walk(b.left, `${p}.left`, errors, known, seen);
    if (b.right) walk(b.right, `${p}.right`, errors, known, seen);
    if (Array.isArray(b.tabs)) b.tabs.forEach((t, j) => t && t.blocks && walk(t.blocks, `${p}.tabs[${j}].blocks`, errors, known, seen));
    if (Array.isArray(b.candidates))
      b.candidates.forEach((c, j) => c && c.blocks && walk(c.blocks, `${p}.candidates[${j}].blocks`, errors, known, seen));
    if (Array.isArray(b.items))
      b.items.forEach((it, j) => it && it.blocks && walk(it.blocks, `${p}.items[${j}].blocks`, errors, known, seen));
  });
}

export function validateModel(model) {
  const errors = [];
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return { ok: false, errors: ["document must be a JSON object"] };
  }
  if (model.dossierVersion !== undefined && model.dossierVersion !== "1.0") {
    errors.push(`dossierVersion: expected "1.0", got ${JSON.stringify(model.dossierVersion)}`);
  }
  const meta = model.meta;
  if (!meta || typeof meta !== "object") {
    errors.push("meta: required object is missing");
  } else {
    if (typeof meta.title !== "string" || !meta.title.trim()) errors.push("meta.title: required non-empty string");
    if (meta.slug !== undefined && !/^[a-z0-9-]+$/.test(meta.slug)) errors.push(`meta.slug: must be kebab-case ([a-z0-9-]); got ${JSON.stringify(meta.slug)}`);
    if (meta.skin !== undefined && (typeof meta.skin !== "string" || !SKINS[meta.skin])) {
      errors.push(`meta.skin: unknown skin ${JSON.stringify(meta.skin)} (supported: ${skinNames().join(", ")})`);
    }
  }
  walk(model.blocks, "blocks", errors, new Set(knownBlockTypes()), new Set());
  return { ok: errors.length === 0, errors };
}
