// Structural diff between two Dossier models, at top-level block granularity.
// Blocks are matched by id (ids are assigned if missing). No dependencies.

import { assignIds } from "./generate.mjs";

const stripUnderscore = (k, v) => (typeof k === "string" && k.charAt(0) === "_" ? undefined : v);
const stable = (b) => JSON.stringify(b, stripUnderscore);

function summarize(b) {
  return b.title || b.heading || (b.meta && b.meta.title) || b.type || "block";
}

export function diffModels(oldModel, newModel) {
  const a = JSON.parse(JSON.stringify(oldModel || {}));
  const z = JSON.parse(JSON.stringify(newModel || {}));
  assignIds(a.blocks || []);
  assignIds(z.blocks || []);

  const aById = new Map((a.blocks || []).map((b) => [b.id, b]));
  const zById = new Map((z.blocks || []).map((b) => [b.id, b]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, b] of zById) {
    if (!aById.has(id)) added.push({ id, type: b.type, label: summarize(b) });
    else if (stable(b) !== stable(aById.get(id))) changed.push({ id, type: b.type, label: summarize(b) });
  }
  for (const [id, b] of aById) {
    if (!zById.has(id)) removed.push({ id, type: b.type, label: summarize(b) });
  }

  const metaChanged = stable(a.meta || {}) !== stable(z.meta || {});
  return { added, removed, changed, metaChanged, unchanged: zById.size - added.length - changed.length };
}

export function formatDiff(d) {
  const lines = [];
  const tag = (arr, mark) => arr.forEach((x) => lines.push(`  ${mark} ${x.type}: ${x.label}  (${x.id})`));
  if (d.metaChanged) lines.push("  ~ meta changed");
  if (d.added.length) {
    lines.push(`+ ${d.added.length} added`);
    tag(d.added, "+");
  }
  if (d.removed.length) {
    lines.push(`- ${d.removed.length} removed`);
    tag(d.removed, "-");
  }
  if (d.changed.length) {
    lines.push(`~ ${d.changed.length} changed`);
    tag(d.changed, "~");
  }
  if (!d.added.length && !d.removed.length && !d.changed.length && !d.metaChanged) lines.push("  no changes");
  lines.push(`  (${d.unchanged} unchanged)`);
  return lines.join("\n");
}
