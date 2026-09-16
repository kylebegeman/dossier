export const meta = {
  name: 'dossier-design-brainstorm',
  description: 'Critique the Dossier HTML design across lenses, synthesize a direction, and produce 3 comparable visual prototypes',
  phases: [
    { title: 'Critique', detail: '7 parallel design lenses on the rendered output' },
    { title: 'Synthesize', detail: 'Unified evaluation + 3 distinct visual directions' },
    { title: 'Prototype', detail: 'One self-contained HTML prototype per direction' },
  ],
}

const SHARED = `
PROJECT: "Dossier" generates a single self-contained interactive HTML artifact (plus Markdown)
from one JSON model. Humans read/decide/edit inside it; agents read structured packets back out.
It has 42 block types (structure, at-a-glance, reference, media/data, decisions, process, trust).
The visual design lives entirely in hand-authored CSS at src/theme/tokens.css.mjs (one CSS string).

CURRENT DESIGN DNA (read the real CSS at /Users/kyle/Developer/products/dossier/src/theme/tokens.css.mjs
and the block catalog at /Users/kyle/Developer/products/dossier/skill/references/blocks.md):
- Editorial/SaaS hybrid. Charter serif for hero headlines, Inter for body, Geist Mono for code.
- Near-monochrome "plum" neutrals + ONE berry/crimson accent (#c81e4a light, #ff6b88 dark).
- Semantic colors: ok=green #0f7a52, warn=amber #9a5b00, danger=red #c0263b. Used sparingly.
- Hairline 1px borders; rounded cards (11-13px radius); sticky topbar; right-rail TOC; "§ 01" section numbers.
- Light + dark both tuned. Print/PDF styles exist. Responsive down to 480px / iOS safe areas.
- Frame width 1180px; content column ~620-680px; TOC rail 212px.

HARD CONSTRAINTS (must not break):
- Output stays ONE self-contained .html file. ZERO external assets/fonts/scripts/network at view time.
  Fonts must be system / web-safe stacks only (no Google Fonts, no @font-face web downloads).
- Must work in BOTH light and dark, stay print/PDF friendly, accessible (focus states, contrast), and
  responsive to mobile + iOS. Keep it agent-readable (don't bury content in non-semantic markup).
- Evolve the existing class system (ds-*) rather than inventing a parallel one; don't gratuitously
  rename classes or break JS runtime hooks.

OBSERVED PROBLEMS (from a real screenshot survey of examples/showcase.html and examples/product-launch.html at 1440px,
light + dark). The user's words: "professional but plain and bland", "strange whitespace", wants better
coverage of the area, less full-text where applicable, better color + typography, smoother reading:
1. Hero fills only the left ~60%; the right ~40% under the TOC is dead space. Very stark on public/marketing pages.
2. Content measure (~620px) is narrow inside an 1180px frame -> wide empty side gutters; "strange whitespace".
3. Tables waste horizontal space: columns clump left with large gaps before right-hand columns; tall row padding.
4. flow + timeline are very airy: big vertical gaps, each step isolated by a hairline; low information density.
5. stat cards are tall and mostly empty (big number, lots of void below).
6. Near-monochrome: the accent appears only in tiny chips / section pills / links. Body is all ink-on-bg -> bland.
7. decision-matrix and risk-register render as plain tables; "recommended" + severity are not visually emphasized
   (no fill, no heat, no badges) so the most important signal is the least visible.
8. charts lack axis labels, gridlines, and value labels; large empty plot area.
9. callouts are only a thin left rule; no tonal fill or icon; easy to miss.
10. status chips are low-contrast gray; semantic colors barely used in chips.
11. key/value detail grids (patch files, receipts, integration report) leave big horizontal gaps (120px label col, then value).
12. process/review board rows have a large empty right area; the chip row is sparse.
13. BUG: release-checklist gate title overlaps its "required" sublabel and status chip (real layout collision).
14. Section rhythm is uniform; little typographic hierarchy variation; sections feel same-y.

GOAL: keep the credible, editorial, professional feel but make it richer, more colorful (tastefully),
denser where it helps scanning, with better coverage of the horizontal area and far less dead whitespace.
`;

const CRITIQUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'verdict', 'strengths', 'problems', 'proposals'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', description: 'One-paragraph overall assessment for this lens.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'What is already good and must be preserved.' },
    problems: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'severity', 'detail'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          detail: { type: 'string', description: 'Where it shows and why it hurts.' },
        },
      },
    },
    proposals: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'change', 'impact', 'effort'],
        properties: {
          title: { type: 'string' },
          change: { type: 'string', description: 'Specific, concrete change. Reference exact tokens/values/CSS where possible.' },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    tokenIdeas: { type: 'array', items: { type: 'string' }, description: 'Concrete token / scale / palette suggestions (values).' },
  },
};

const LENSES = [
  { key: 'typography', title: 'Typography & hierarchy', brief:
    'Type system: font stacks (serif/sans/mono), the type scale (h1-h4, body, small), weights, letter-spacing, ' +
    'line-height, measure/line-length, tabular numerals, and the contrast between editorial serif and UI sans. ' +
    'How to create clearer hierarchy and rhythm between sections, headings, ledes, and body without web fonts.' },
  { key: 'color', title: 'Color & semantic system', brief:
    'Palette and color usage: the plum neutrals + single berry accent, semantic ok/warn/danger, tints, chips, ' +
    'status. The page is too monochrome/bland. Propose how to introduce more (tasteful) color and make semantic ' +
    'state legible at a glance, in BOTH light and dark, without looking like a toy. Consider accent surfaces, ' +
    'tinted section/zebra backgrounds, category color-coding, and a richer chip system.' },
  { key: 'space', title: 'Whitespace, density & grid', brief:
    'Layout grid, frame/measure widths, the empty right 40% of the hero, dead side gutters, vertical rhythm, ' +
    'card padding, table row height, and overall information density. Propose how to cover the horizontal area, ' +
    'kill strange whitespace, and tighten airy components (flow, timeline, stats, tables) while staying readable.' },
  { key: 'atglance', title: 'At-a-glance blocks', brief:
    'hero, summary-cards, stat-strip, flow, timeline, callout. These set first impressions and are the airiest. ' +
    'Redesign each for density + visual interest: a hero that fills the width, richer stat/summary cards, a ' +
    'compact connected flow/timeline, and callouts with tonal fill + icon. Be concrete about layout + CSS.' },
  { key: 'data', title: 'Data & decision blocks', brief:
    'table, decision-matrix, risk-register, chart, references, glossary, faq, math, figure. The most important ' +
    'signal (recommended option, risk severity) is currently the least visible. Propose visual emphasis ' +
    '(heat, fills, badges, winner highlighting), tighter tables, and charts with axes/gridlines/value labels.' },
  { key: 'process', title: 'Interactive & process surfaces', brief:
    'review-board, process-board, patch-set, diff-view, code-editor, verification-run, evidence-log, ' +
    'trust-report, verdict-gate, release-checklist, finding-list, comment-thread, decision-log, cycle-board, ' +
    'integration-report, upstream-response, process-receipt. These are the app-like surfaces with big empty ' +
    'right areas and a real overlap bug in release-checklist (gate title vs required/status chips). Redesign ' +
    'rows/toolbars/detail-grids for density and clarity; specify a fix for the release-checklist collision.' },
  { key: 'firstimpression', title: 'Public polish & first impression', brief:
    'The topbar, the hero on public/marketing examples (product-launch), the overall "wow on load" and ' +
    'cohesion. How to make the very first screen feel crafted and full, the toolbar feel intentional, and the ' +
    'whole artifact read as a premium product without adding network assets. Consider a hero side-panel / ' +
    'meta card, subtle texture/gradients done with CSS only, and a stronger masthead.' },
];

phase('Critique');
const critiques = await parallel(LENSES.map((l) => () =>
  agent(
    SHARED +
    '\n\nYOUR LENS: ' + l.title + '\n' + l.brief +
    '\n\nFirst Read the two files named above to ground yourself in the real tokens and block list. ' +
    'Then return a rigorous, SPECIFIC critique for THIS lens only. Concrete values and CSS over vague advice. ' +
    'Preserve the editorial credibility; do not propose a cartoonish or generic Bootstrap look. ' +
    'Every proposal must be implementable in the single-file, no-external-assets, light+dark constraints.',
    { label: 'critique:' + l.key, phase: 'Critique', schema: CRITIQUE_SCHEMA, effort: 'high' }
  )
));
const goodCritiques = critiques.filter(Boolean);
log('Collected ' + goodCritiques.length + '/' + LENSES.length + ' critiques');

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['northStar', 'principles', 'proposedTokens', 'priorityChanges', 'directions'],
  properties: {
    northStar: { type: 'string', description: 'The unifying visual concept in 2-4 sentences.' },
    principles: { type: 'array', items: { type: 'string' }, description: '5-8 design principles to apply everywhere.' },
    proposedTokens: { type: 'string', description: 'A concrete proposed CSS :root token block (palette, type scale, spacing, radius) as a CSS snippet.' },
    priorityChanges: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'rationale', 'blocks', 'effort'],
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          blocks: { type: 'string', description: 'Which block(s)/areas this touches.' },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
      description: 'Priority-ranked, highest impact first.',
    },
    directions: {
      type: 'array',
      minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'tagline', 'description', 'signatureMoves', 'palette', 'type'],
        properties: {
          name: { type: 'string', description: 'Short evocative name.' },
          tagline: { type: 'string' },
          description: { type: 'string', description: 'How this direction looks and feels, and how it differs from the others.' },
          signatureMoves: { type: 'array', items: { type: 'string' }, description: 'The 4-6 distinctive visual moves.' },
          palette: { type: 'string', description: 'Concrete hex values for bg/surface/ink/accent(s)/semantic in light (and dark notes).' },
          type: { type: 'string', description: 'Concrete font stacks + scale choices (system/web-safe only).' },
        },
      },
      description: 'Three DISTINCT, internally-coherent visual directions that all satisfy the constraints. Make them genuinely different bets, not three shades of the same thing.',
    },
  },
};

phase('Synthesize');
const synthesis = await agent(
  SHARED +
  '\n\nYou are the design director. Here are ' + goodCritiques.length + ' lens critiques as JSON:\n' +
  JSON.stringify(goodCritiques) +
  '\n\nSynthesize ONE coherent evaluation and design system proposal, then define THREE genuinely distinct ' +
  'visual directions the redesign could take (e.g. a refined-but-richer editorial take, a denser "engineering ' +
  'console" take, and a warmer "magazine/report" take — but choose what the critiques actually support). ' +
  'Each direction must be internally coherent, satisfy ALL hard constraints (single file, no external fonts/assets, ' +
  'light+dark, accessible, responsive), and keep the artifact credible and professional. Provide concrete hex ' +
  'palettes and font stacks per direction so a prototyper can build them verbatim.',
  { label: 'synthesis', phase: 'Synthesize', schema: SYNTH_SCHEMA, effort: 'high' }
);
log('Synthesis complete: ' + (synthesis ? synthesis.directions.map((d) => d.name).join(' | ') : 'FAILED'));

const PROTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'html', 'notes'],
  properties: {
    name: { type: 'string' },
    notes: { type: 'string', description: 'What is distinctive about this prototype and what to look at.' },
    html: { type: 'string', description: 'A COMPLETE, self-contained <!doctype html> document. Inline <style> only. No external assets/fonts/scripts.' },
  },
};

// Shared sample content so the three prototypes are directly comparable.
const SAMPLE = `
Build a SINGLE self-contained HTML page (inline <style> only, no external anything, system/web-safe fonts only)
that is a COMPONENT PROTOTYPE for this direction. Use this exact sample content so the three directions are
directly comparable, and render these components TOP TO BOTTOM in one column ~1180px wide centered:

1. A masthead/topbar: a small accent mark, crumb "Dossier / Showcase", a fake search field, Edit, a theme dot, an Export button.
2. A HERO that FILLS THE WIDTH (do not leave the right 40% empty): eyebrow "Live demo", a large headline
   "One JSON file becomes this", a lede sentence, a row of meta pills (42 block types, Self-contained, Agent-readable, Light + dark),
   and a right-side panel/visual or meta cards (Source: one .dossier.json / Output: one .html / Runtime deps: 0).
3. A stat-strip of 4 KPIs: 42 Block types, 0 Runtime deps, 2 Renderers, 100% Self-contained.
4. summary-cards: 3 cards "For humans", "For agents", "For your wiki" each with a sentence.
5. A callout (tip tone) with a short note and a code span, visibly tonal (not just a thin rule).
6. A table titled "Exports": columns Format / Use, rows (HTML / The page humans open), (Markdown / Plain-text copy), (JSON digest / What agents read).
7. A decision-matrix titled "Where it lives": criteria [Cross-project, Public later]; options "Standalone repo" (recommended, scores Yes / One-line flip) and "Inside a monorepo" (scores No / Hard). Make the recommended option visually win.
8. A risk-register row: risk "Scope creep", likelihood Medium, impact High, mitigation "Freeze the schema first." Make severity visible (heat/badges).
9. A bar chart titled "Adoption" with 4 bars Q1=6 Q2=10 Q3=14 Q4=20, WITH axis baseline, gridlines, and value labels.
10. A review-board row (collapsed): checkbox, title "Command palette", summary "Cmd-K to jump and run actions.",
    chips [Navigation, Impact High, Effort Small], a status pill "Shipped", a chevron.
11. A trust-report claim: "The test suite passes." status verified, confidence high, chips [npm test, test-suite].

Requirements:
- Make this direction's palette, type, density, and "signature moves" unmistakable and cohesive.
- Light theme is fine for the prototype, but pick colors that have an obvious dark counterpart.
- Real CSS quality: spacing scale, hierarchy, semantic color, tasteful use of the accent. No lorem, no external images
  (use CSS shapes / inline SVG if you want a hero visual). Keep it accessible (contrast, focus) and responsive-friendly.
- Return ONLY via the structured output. The html field must be a complete standalone document that renders on its own.
`;

phase('Prototype');
let prototypes = [];
if (synthesis && synthesis.directions) {
  prototypes = await parallel(synthesis.directions.map((d, i) => () =>
    agent(
      SHARED +
      '\n\nDIRECTION TO BUILD: "' + d.name + '" — ' + d.tagline +
      '\nDescription: ' + d.description +
      '\nSignature moves: ' + (d.signatureMoves || []).join('; ') +
      '\nPalette: ' + d.palette +
      '\nType: ' + d.type +
      '\n\n' + SAMPLE,
      { label: 'proto:' + (d.name || ('dir' + i)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24), phase: 'Prototype', schema: PROTO_SCHEMA, effort: 'high' }
    )
  ));
}
const goodProtos = prototypes.filter(Boolean);
log('Built ' + goodProtos.length + ' prototypes');

return {
  critiques: goodCritiques,
  synthesis,
  prototypes: goodProtos.map((p) => ({ name: p.name, notes: p.notes, html: p.html })),
};
