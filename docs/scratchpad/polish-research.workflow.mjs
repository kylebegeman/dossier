export const meta = {
  name: 'dossier-polish-research',
  description: 'Research modern design references, synthesize a concrete Console Slate polish spec',
  phases: [
    { title: 'Research', detail: 'parallel inspiration lenses (web search + fetch)' },
    { title: 'Spec', detail: 'prioritized, CSS-level polish spec for Console Slate' },
  ],
}

const CONTEXT = `
We are polishing "Dossier", a tool that generates ONE self-contained interactive HTML artifact from a JSON
model. The redesign is locked to "Console Slate": cool blue-slate neutrals, indigo accent (#3a5ccc light /
#7d9bff dark), semantic ok/warn/danger ramp as the dominant color story, Charter serif on section titles +
hero only, Inter for UI/body, Geist Mono for code/IDs/§ numbers. It already has a clean base (framed zebra
tables, fused KPI strip, tonal callouts, decision-matrix winner, risk heat, status chips, hero meta panel).

GOAL: crank the design level up a lot — modern, professional, with real visual flair and polish — WITHOUT
being gaudy or overwhelming. Think the craft of the best product/docs sites.

HARD CONSTRAINTS (every technique must obey):
- ONE self-contained .html file. ZERO external assets/fonts/scripts/network. System/web-safe fonts only.
  Any texture/gradient/icon must be pure CSS or inline SVG (no images, no @font-face downloads).
- Works in BOTH light and dark, stays print/PDF friendly, accessible (contrast, visible focus), responsive.
- Honor prefers-reduced-motion. Keep it agent-readable (semantic markup).
- HARD RULE: never use a left leading-edge vertical accent stroke/spine on any card or cell. Status/emphasis
  is carried by tints, filled badges, icons, top rules, or full borders — never a left bar.
- Not gaudy: restrained, earned color; subtle depth; nothing that screams. Credible and editorial.
`;

const AREAS = [
  { key: 'sites', title: 'Modern docs & product sites', brief:
    'Survey the design language of the best current docs/product/dashboard sites (e.g. Stripe, Vercel/Geist, ' +
    'Linear, Mintlify, Railway, Resend, Supabase, GitHub Primer, Retool, Vercel docs). Identify concrete, ' +
    'reusable signature moves: layout grids, spacing rhythm, section dividers, masthead/topbar treatment, ' +
    'on-this-page nav, density, and the small details that make them feel premium.' },
  { key: 'depth', title: 'Elevation, depth & surface', brief:
    'Modern elevation systems: layered soft shadow recipes (multi-stop), hairline top-highlight borders, ' +
    'subtle surface gradients, tasteful glass/backdrop-blur, faint CSS grain/noise, ring/outline systems. ' +
    'Give concrete CSS recipes (exact shadow values, gradient stops) that read as refined, not heavy, and ' +
    'that adapt to dark mode. Note how to avoid muddiness in dark.' },
  { key: 'type', title: 'Typography & layout craft', brief:
    'Premium type systems with SYSTEM fonts only: type scales, optical letter-spacing, heading treatments, ' +
    'eyebrow/kicker patterns, standfirst ledes, tabular numerals, measure, and editorial serif+sans pairing. ' +
    'Also section header craft and how top sites make a long text page feel structured and inviting.' },
  { key: 'color', title: 'Color, semantic & data-viz', brief:
    'Refined color usage: accent restraint, tinted surfaces, status/badge systems with icons, semantic ramps, ' +
    'category color, and data-viz palettes (bar/line/area) that look modern. How leading systems (Radix Colors, ' +
    'Tailwind, Geist) structure tints/steps for light+dark. Concrete hex/alpha guidance.' },
  { key: 'motion', title: 'Micro-interactions & motion', brief:
    'Tasteful micro-interactions: hover elevation/transitions, focus-ring craft, sticky-header scroll elevation, ' +
    'reveal-on-scroll, animated accent underlines, button press feedback, copy-to-clipboard affordances. All ' +
    'must be cheap, smooth, and reduced-motion-safe. Give exact transition/timing/easing recipes.' },
  { key: 'codedata', title: 'Code, diff & data presentation', brief:
    'How modern tools present code and data beautifully: code window chrome (filename tab, traffic lights, copy), ' +
    'line numbers, diff add/del styling, unified-diff review surfaces, table craft (sticky headers, zebra, ' +
    'alignment), KPI/stat cards, and charts with axes/gridlines/value labels. Concrete, implementable patterns.' },
];

const FIND_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'summary', 'techniques'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string' },
    techniques: {
      type: 'array', minItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'what', 'howTo', 'flair', 'sources'],
        properties: {
          name: { type: 'string' },
          what: { type: 'string', description: 'What it is and why it elevates the design.' },
          howTo: { type: 'string', description: 'Concrete implementation: exact CSS values/recipe, single-file + no-external-asset safe.' },
          flair: { type: 'string', enum: ['subtle', 'medium', 'bold'], description: 'How much visual flair; prefer subtle/medium.' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Sites/docs that inspired it.' },
        },
      },
    },
    pitfalls: { type: 'array', items: { type: 'string' }, description: 'Gaudiness / accessibility / dark-mode traps to avoid.' },
  },
};

phase('Research');
const research = await parallel(AREAS.map((a) => () =>
  agent(
    CONTEXT +
    '\n\nYOUR AREA: ' + a.title + '\n' + a.brief +
    '\n\nUse web search and fetch real references (load WebSearch / WebFetch via ToolSearch with ' +
    '"select:WebSearch,WebFetch"). Pull CURRENT (2025-2026) examples and concrete values, not vague advice. ' +
    'Every technique must be implementable under the hard constraints (single file, no external assets, ' +
    'light+dark, no left spine, reduced-motion-safe). Favor subtle/medium flair over bold. Return the schema.',
    { label: 'research:' + a.key, phase: 'Research', schema: FIND_SCHEMA, effort: 'high' }
  )
));
const good = research.filter(Boolean);
log('Research done: ' + good.length + '/' + AREAS.length + ' areas');

const SPEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['vision', 'tokens', 'enhancements'],
  properties: {
    vision: { type: 'string', description: 'The elevated direction in 2-4 sentences. What "cranked up but not gaudy" means here.' },
    tokens: { type: 'string', description: 'Concrete new/updated CSS tokens to add (shadows, gradients, radii, spacing, easing) as a CSS snippet, light + dark.' },
    enhancements: {
      type: 'array', minItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'area', 'recipe', 'priority', 'flair'],
        properties: {
          title: { type: 'string' },
          area: { type: 'string', description: 'Which block(s)/region: topbar, hero, sections, cards, tables, chart, code, diff, process, callouts, TOC, buttons, global, etc.' },
          recipe: { type: 'string', description: 'Exact, implementable CSS (selectors + values) against the real ds-* classes where known. Single-file, no external assets, light+dark, no left spine, reduced-motion-safe.' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          flair: { type: 'string', enum: ['subtle', 'medium', 'bold'] },
        },
      },
      description: 'Prioritized polish enhancements, highest impact first. Include a couple of signature "wow" moves plus many small refinements.',
    },
    gaudinessGuards: { type: 'array', items: { type: 'string' }, description: 'Rules to keep it tasteful.' },
  },
};

phase('Spec');
const spec = await agent(
  CONTEXT +
  '\n\nHere are ' + good.length + ' research dossiers as JSON:\n' + JSON.stringify(good) +
  '\n\nSynthesize ONE prioritized "Console Slate Polish Spec": a cohesive set of enhancements that crank the ' +
  'design up a lot while staying tasteful. Provide concrete CSS recipes against the real ds-* class system ' +
  '(hero=[data-block="hero"]/.ds-meta, sections=.ds-section/.ds-section-titles, cards=.ds-card/.ds-cardgrid, ' +
  'stats=.ds-statgrid/.ds-stat, callouts=.ds-callout.tone-*, tables=.ds-tablewrap/table, matrix tr.ds-rec, ' +
  'risk .ds-lvl, chips .ds-chip/.ds-status.s-*, process .ds-pitem.verdict-*, trust .ds-trust-claim, code ' +
  '.ds-code*/.ds-codeedit*, diff .ds-diff*/.ds-hunk*, topbar .ds-topbar/.ds-btn/.ds-menu, toc .ds-toc-link, ' +
  'copy .ds-copy). Every recipe must satisfy ALL hard constraints. Order by impact. Include 2-3 signature moves.',
  { label: 'polish-spec', phase: 'Spec', schema: SPEC_SCHEMA, effort: 'high' }
);
log('Spec ready: ' + (spec ? spec.enhancements.length + ' enhancements' : 'FAILED'));

return { research: good, spec };
