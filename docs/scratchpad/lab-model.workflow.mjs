export const meta = {
  name: 'dossier-lab-model',
  description: 'Author a comprehensive variant-covering dossier model (all blocks + states) for the design lab',
  phases: [{ title: 'Author', detail: 'one agent per block family, all variants' }],
}

const SCHEMA_NOTE = `
You are authoring part of a Dossier JSON document model used as a DESIGN LAB: it must exercise the
widest possible variety of blocks and their VARIANTS/STATES so a designer can see every component.

GROUND TRUTH (Read these first, do not guess field names):
- /Users/kyle/Developer/products/dossier/skill/references/blocks.md  (copy-paste examples + every field + allowed enum values)
- /Users/kyle/Developer/products/dossier/schema/dossier.schema.json   (the authoritative contract)

HARD RULES:
- Use ONLY documented fields and enum values from blocks.md / the schema. Do NOT invent fields
  (e.g. there is no stat "delta" field). If a variant needs a field that does not exist, skip it.
- Every block is an object with a "type". Process/collection items that require ids must use stable,
  UNIQUE, kebab-case ids (candidates, items, patches, runs, findings, threads, cycles, gates,
  decisions, sources, claims, etc.). Ids must be unique across the WHOLE document, so PREFIX every id
  with your family key (e.g. "g6-risk-scope-creep") to avoid collisions with other families.
- Text fields may use inline markdown (**bold**, \`code\`, [label](url)). Keep copy realistic and
  varied (this is a real-looking product doc, not lorem). Short, scannable copy. No em dashes in prose.
- Cover EVERY tone/status/severity/operation/kind the block supports — one instance per enum value at least.
- Do NOT include a "hero" block (the lab provides its own hero).
- Output is consumed programmatically. Return EXACTLY the structured object: { sectionTitle, sectionSubtitle, blocks }.
  "blocks" is a JSON array of block objects that will be placed inside a top-level section container.
`;

const GROUPS = [
  { key: 'g1', title: 'Structure & prose', subtitle: 'Containers and long-form text: prose, nested sections, two-col, tabbed panes.',
    brief: 'Cover: prose (with a heading and multiple paragraphs incl. a bullet list, bold, inline code, a link); ' +
      'a nested section (type:section, framed:true, with 2-3 nested blocks inside it incl. a callout and a table); ' +
      'an unframed section (framed:false) with nested blocks; a two-col block (left/right each nesting a couple of blocks); ' +
      'a tabs block with 3 tabs, each tab nesting different blocks (e.g. code, table, prose). Show real nesting depth.' },
  { key: 'g2', title: 'At a glance', subtitle: 'Scannable summaries: summary cards, KPI stats, flow, timeline, callouts.',
    brief: 'Cover: summary-cards with cards in ALL tones (neutral, accent, highlight, success, warning, danger) ' +
      '(one cards block containing 6 cards, one per tone); a stat-strip with 4-5 stats; a flow with 4 numbered steps; ' +
      'a timeline whose phases cover ALL statuses (done, in-progress, planned, blocked) with dates; ' +
      'callout blocks in ALL tones (info, ok, warn, danger, tip) — emit 5 separate callout blocks, one per tone, each with title+body.' },
  { key: 'g3', title: 'Reference', subtitle: 'Tables, code, editable code, FAQ, sources, glossary.',
    brief: 'Cover: a plain table (text columns); a numeric table (mostly numbers, to show tabular alignment); ' +
      'a code block with a filename and a real TypeScript snippet; a second code block in a different language (e.g. bash or json); ' +
      'a code-editor block (lang, filename, targetPath, code, summary); an faq with 3-4 items; ' +
      'a references block with 3 items (label, url, signal, use); a glossary with 3-4 terms.' },
  { key: 'g4', title: 'Code review', subtitle: 'Proposed patches and unified-diff review surfaces.',
    brief: 'Cover: a patch-set with several patches that span ALL operations (add, modify, delete, rename, mixed), ' +
      'a range of statuses (proposed, accepted, needs-revision, applied, skipped) and risks (low, medium, high); ' +
      'at least two patches should include a realistic unified "diff" string (with @@ hunks, + and - lines), files, ' +
      'workItems, and verification. Then a standalone diff-view block with a multi-file unified diff (adds, deletes, and a hunk).' },
  { key: 'g5', title: 'Media & data', subtitle: 'Figures, math, charts, diagrams, footnotes.',
    brief: 'Cover: a figure (use an inline SVG data: URI for src, e.g. "data:image/svg+xml,..." so it is self-contained, with alt + caption); ' +
      'a math block with display:true (a real LaTeX formula) and a second math example; a chart of chartType "bar", ' +
      'one of chartType "line", and one of chartType "area" (each with 4-6 data points label/value); ' +
      'a diagram with format "dot" (a small Graphviz digraph, rankdir=LR); a footnotes block with 2-3 items. ' +
      'Also include a short prose block above that references a footnote with [^id] so the link target is exercised.' },
  { key: 'g6', title: 'Decisions', subtitle: 'Matrices, risks, assumptions, actions, triage, gates, decision log.',
    brief: 'Cover: a decision-matrix (2-3 criteria, 2-3 options, one marked recommended:true, with scores); ' +
      'a risk-register with risks spanning ALL likelihood/impact levels (low, medium, high) incl. a high/high; ' +
      'an assumptions block covering kinds (assumption, open-question) and statuses (unverified, verified, rejected); ' +
      'an action-items block covering statuses (todo, doing, done, blocked) with owners; ' +
      'a review-board with 3-4 candidates covering statuses, with category/impact/effort, badges, details, body markdown, ' +
      'and at least one candidate carrying nested reference blocks; a verdict-gate; a decision-log with 2 decisions.' },
  { key: 'g7', title: 'Process & trust', subtitle: 'Implementation, verification, evidence, findings, integration, release, trust.',
    brief: 'Cover: a process-board with 3-4 items covering verdict states (undecided, approve, revise, block, retry) ' +
      'and varied status/owner/priority/files/verification, at least one with nested blocks; ' +
      'a verification-run with runs covering passed AND failed (and a pending/skipped if allowed) incl. command/expected/actual; ' +
      'an evidence-log (2-3 items, varied kind/trust); a finding-list covering severities (low, medium, high, and critical if allowed); ' +
      'a comment-thread with a thread of 2-3 comments; a cycle-board (2 cycles, varied status); an integration-report (producer/consumer/items); ' +
      'an upstream-response; a release-checklist with gates covering states (passed, failed, pending) and required true/false; ' +
      'a trust-report with multiple sources (varied kind/trust) and claims covering ALL statuses (verified, partial, unverified, disputed, rejected) ' +
      'linking source+evidence ids; and a process-receipt plus a receipt (provenance) block.' },
];

const OUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['sectionTitle', 'sectionSubtitle', 'blocks'],
  properties: {
    sectionTitle: { type: 'string' },
    sectionSubtitle: { type: 'string' },
    blocks: {
      type: 'array', minItems: 1,
      items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } }, additionalProperties: true },
    },
  },
};

phase('Author');
const results = await parallel(GROUPS.map((g) => () =>
  agent(
    SCHEMA_NOTE +
    '\n\nYOUR FAMILY: "' + g.title + '" (key "' + g.key + '").\n' +
    'Section subtitle to use: ' + g.subtitle + '\n' +
    'Blocks + variants to author:\n' + g.brief +
    '\n\nReturn { sectionTitle: "' + g.title + '", sectionSubtitle: "' + g.subtitle + '", blocks: [ ... ] } ' +
    'with every id prefixed "' + g.key + '-". Be exhaustive about variants but keep each block realistic and compact.',
    { label: 'model:' + g.key, phase: 'Author', schema: OUT_SCHEMA, effort: 'high' }
  )
));

return { groups: GROUPS.map((g, i) => ({ key: g.key, result: results[i] })) };
