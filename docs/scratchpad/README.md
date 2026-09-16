# Design lab — Console Slate

Scratch workspace for the generated-HTML redesign. Direction is locked to **Console Slate**
(cool slate neutrals, indigo accent, semantic-ramp-forward, denser). **Hard rule: no left-edge
accent stroke/spine on any card or cell** — status is carried by tints, filled badges, icons, or
full borders.

## The point
We design against the **real product markup**: build a comprehensive variant-covering model with the
actual generator, then skin it with an override CSS layer. The CSS we converge on ports back into
`src/theme/tokens.css.mjs` near-verbatim.

## Files
- `design-lab.dossier.json` — comprehensive model: ~40 block types and their variants/states.
- `design-lab.html` — built by the real generator (current theme).
- `design-lab.slate.html` — `design-lab.html` with the Console Slate override layer injected. **View this.**
- `slate-theme.css.mjs` — the Console Slate override CSS (`SLATE_OVERRIDES`). This is the design diff.
- `skin-lab.mjs` — injects `slate-theme` into a generated HTML file.
- `assemble-lab.mjs` — rebuilds `design-lab.dossier.json` from the lab-model workflow output.
- `proto/` — the three original direction prototypes (Editorial Ledger / Console Slate / Brief & Broadsheet).
- `*.workflow.mjs` — the brainstorm + model-authoring workflows.

## Iterate loop (fast — no rebuild)
1. Edit `slate-theme.css.mjs`.
2. `node docs/scratchpad/skin-lab.mjs docs/scratchpad/design-lab.html docs/scratchpad/design-lab.slate.html`
3. Refresh `http://localhost:8799/docs/scratchpad/design-lab.slate.html` (serve repo root: `python3 -m http.server 8799`).

If the model changes: `node docs/scratchpad/assemble-lab.mjs && node bin/dossier.mjs build docs/scratchpad/design-lab.dossier.json` then re-skin.

## Done in the CSS pass (all without a left spine)
Slate palette (light+dark) · serif section titles + mono `§` numbers · two-zone hero with right meta
panel · fused KPI strip (gap-divider, wraps for any count) · tonal callouts with icon chips · framed
zebra tables with mono headers · decision-matrix winner (tint + filled ★ badge) · risk severity heat
pills · full status-chip color map · summary-card tonal grounds · process verdict states (full-border
tint) · trust-claim status tints · tighter mono detail grids · **release-checklist collision bug fixed** ·
TOC active pill (replaces left-rail indicator).

## Landed after the CSS pass (generator markup changes)
All of the items deferred from the CSS pass shipped in later 0.6.x releases: chart axes,
gridlines, and value labels in the SVG chart renderer; mono row-ID anchors on review and process
rows; `stat.delta` KPI delta lines; and real `-` bullet lists in `prose`. The one optional idea
still open is a continuous connector rail for `timeline` (`flow` already draws one).

## Status
This lab produced the Console Slate skin that ships as `--skin console-slate`. It is kept as a
reference for how the skin was derived. The 0.7 visual direction is being planned separately in
`dossier-0-7-brainstorm.html` in this folder.
