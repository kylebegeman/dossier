---
name: dossier
description: Generate a polished, self-contained, agent-readable HTML dossier (plus Markdown) from structured content, research reports, plans, specs, implementation packets, reviews, debugging notes, integration loops, architecture/decision (ADR) docs, runbooks, releases, incidents, postmortems, or an interactive review/triage surface. Use when the user wants a doc, plan, report, brief, spec, implementation workflow, code review, process packet, or structured decision surface they can mark up and hand back to an agent.
metadata:
  short-description: Render JSON document models into self-contained, agent-readable HTML dossiers
---

# Dossier

Dossier turns **one JSON document model** into a polished, **self-contained** HTML
artifact (plus a Markdown export). The visible HTML is a projection of an embedded
`#dossier-model` JSON island, so humans get a themed, interactive page and agents read
one block instead of scraping. It is a companion to a docs/wiki, link or `<iframe>` it
anywhere. No server, no external assets, works offline.

This skill bundles a block cheatsheet (`references/blocks.md`) and a starter template
(`references/starter.dossier.json`). The full JSON Schema lives in the Dossier repo at
`schema/dossier.schema.json`.

## When to use this

- A research report, plan, spec, brief, architecture doc, ADR, runbook, release, incident,
  implementation dossier, debug packet, review packet, integration loop, or postmortem
  that should be a clean, shareable, durable artifact (not just chat text).
- An **interactive review/triage surface**: a list of candidate items (features, ideas,
  risks), each with deep reference detail, that a human selects + annotates and exports
  back as JSON for an agent to implement. Use the `review-board` block for this.
- A structured **process surface** for actual work: code edits, debugging, review findings,
  release readiness, incident response, or producer/consumer dependency dogfooding.
- Any time the user says "make a doc/plan/report/brief/review/page/dossier for this."

Prefer this over dumping long Markdown when the content benefits from structure,
navigation, or a decision loop.

## Setup (once)

Install the `dossier` CLI, one line, any platform (needs Node 18+):
```
npm install -g github:kylebegeman/dossier
```
Or run without installing: `npx github:kylebegeman/dossier build <file>`. To scaffold a new
document: `dossier init <name>` writes `<name>.dossier.json` from the starter.

## Workflow

1. **Write the model.** Author a `<slug>.dossier.json` conforming to the schema. Start
   from `references/starter.dossier.json` and consult `references/blocks.md` for every
   block type. Keep `meta.slug` kebab-case (it names the output files and cross-links).
2. **Generate.**
   ```
   dossier build path/to/<slug>.dossier.json
   ```
   Writes `<slug>.html` and `<slug>.md` next to the JSON. Add `--embed` when the
   host app needs a chrome-stripped `<slug>.embed.html` variant.
3. **Show it.** `open <slug>.html` so the user can view it. For durable docs, save the
   `.dossier.json` + outputs under the project's `docs/`.

The generator validates and lints; malformed JSON fails loudly. Re-run after edits, the
HTML stays in sync with the JSON (round-trip).

Other commands: `dossier validate <file>` (check without rendering), `dossier lint <file>
[--strict]` (authoring, trust, and packet warnings), `dossier serve <file>
--open` (live-reload preview while iterating, with the same `--theme` and `--skin`
presentation flags as build), `dossier diff <old> <new>` (what changed),
`dossier export <file> --format json|merged-json --state <packet.json>` (source or
state-applied JSON), `dossier prompt <file> --state <packet.json>` (AI authoring prompt),
`dossier publish <dir> --out <dir>` (build a static folder with a catalog index),
`dossier pack add <repo-or-path>` (register reusable templates and plugins),
`dossier init <name> --template <pack/id>` (scaffold from a pack template),
`dossier workspace index <manifest-or-dir>` (build an agent-readable multi-dossier
status index), `dossier workspace query <manifest-or-dir> --needs release|process|trust|invalid`
(find open work), `dossier workspace publish <manifest-or-dir> --out <dir>` (publish a
workspace site), `dossier release collect --checks "npm test,npm pack --dry-run --json"`
(write release evidence),
`dossier init <name> --kind plan|implementation|review|debug|integration-loop|release|incident|adr|runbook|postmortem|review-board`,
`--theme <pack>`, `--skin console-slate`, `--embed`, `--plugin <file>` for one-off custom block
types, and `--pack <name>` to load trusted pack plugins. Pack templates are data-only.
Pack plugins execute JavaScript at build time, so require `dossier pack trust <name>`.
For programmatic / multi-agent use, `dossier mcp` exposes
`dossier_render`, `dossier_validate`, `dossier_read_decisions`, `dossier_read_process`,
`dossier_read_edits`, `dossier_read_verdicts`, `dossier_read_release`,
`dossier_read_patch_review`, `dossier_read_diff_review`, `dossier_read_trust`,
`dossier_resume_context`,
`dossier_apply_edits`, `dossier_apply_process`, `dossier_apply_patch_review`,
`dossier_record_run`, `dossier_record_claim`, `dossier_attach_patchset`,
`dossier_closeout_digest`, `dossier_closeout_model`, `dossier_get_schema`,
`dossier_get_packet_schema`, and `dossier_get_starter`.
Block types beyond the basics, `figure`,
`math`, `chart`, `footnotes` (with inline `[^id]`), `trust-report`, and `receipt`
(provenance), are in
`references/blocks.md`.

### React variant (optional)

For React/Next codebases, the same design renders via typed TSX components:
```
cd react && npm install && npx tsx src/cli.tsx <file>   # -> <slug>.react.html
```
Identical output; reuses the same design system. Importable: `import { renderDossier } from "@kylebegeman/dossier-react"`.

## Authoring essentials

Top-level shape:
```json
{
  "dossierVersion": "1.0",
  "kind": "dossier",
  "meta": { "title": "...", "slug": "kebab-case", "status": "review", "updated": "2026-06-26" },
  "blocks": [ { "type": "hero", "...": "..." }, { "type": "section", "blocks": [ ... ] } ]
}
```

- **`kind`**: `reader | plan | review-board | dossier | adr | runbook | research |
  comparison | implementation | review | debug | integration-loop | release | incident`.
- **`meta`**: `title` (required), `slug`, `eyebrow`, `lede`, `crumbs[]`, `status`,
  `owner`, `updated`, `version`, `tags[]`, `baseUrl` (for hosted cross-links),
  `theme` (per-project token overrides), `skin` (`console-slate` for a denser
  production skin), `lifecycle` (banner), `changelog`.
- **`blocks[]`**: ordered. `section`, `two-col`, and `tabs` nest other blocks. Lead with
  a `hero`. See `references/blocks.md` for all 42 types.
- **Inline markdown** in text fields: `**bold**`, `` `code` ``, `[label](url)`,
  `[[other-slug]]` (cross-artifact link), `[[Term]]` (glossary tooltip).
- **Code**: `{ "type": "code", "lang": "ts", "code": "..." }`, highlighted at build
  (Shiki, light/dark). **Diagrams**: `{ "type": "diagram", "format": "dot", "spec": "digraph {...}" }`
  → inline SVG (Graphviz). Use Graphviz DOT.

## The review/triage surface (key pattern)

For "here are N options, decide which to implement," use one `review-board` block. Each
candidate is an expandable row: scannable collapsed (title, summary, chips, status,
select checkbox), expanding to its full reference (`body` markdown and/or nested
`blocks`, load as much technical detail as you want) plus a notes field. The reader
filters/searches, ticks decisions, writes notes, and **exports a decisions packet** (and
can re-import). Use Export Center when an agent needs the whole browser state, merged
JSON, or handoff packet. Pair the rich reference in the model with the exported packet
to implement. See `references/blocks.md` -> `review-board`.

## Process dossier starters

Use process starters when the user wants to steer the actual work, not only read a plan:

- `implementation`: code-editing context, work items, patch preview, verification, and handoff.
- `review`: findings, evidence, severity, accepted fixes, and follow-up work.
- `debug`: reproduction, hypotheses, fix candidates, and verification.
- `integration-loop`: producer/consumer dependency dogfood cycle packets.
- `release`: release readiness, checks, risks, approvals, and closeout.
- `incident`: timeline, mitigation decisions, evidence, and follow-ups.

These starters use `process-board` for work items, `code-editor` for bounded editable
snippets, `patch-set` for proposed edit packets, `diff-view` for unified diff review,
`verification-run` for commands and outcomes, `evidence-log` for source material,
`trust-report` for source-backed claims, `verdict-gate` for approvals, and closeout blocks
for release, incident, review, and integration loops. `dossier serve` enhances
`code-editor` with CodeMirror 6, can save editor changes back to the source model,
and can import patches into a new `patch-set` block. MCP
tools can read human state and append run, claim, or patch evidence without scraping the
HTML.

## Export semantics

Be explicit when handing work back to an agent:

- Source JSON is the authored model embedded in `#dossier-model`.
- State packet (`dossier.state/v1`) contains browser changes: decisions, process verdicts,
  edits, release gates, patch/diff review, and evidence.
- Merged JSON applies a state packet back into the source model and is the right artifact
  to rebuild or publish after browser edits.
- Agent handoff (`dossier.handoff/v1`) is a compact summary for resuming work in another
  agent or thread.
- AI prompt export gives a model-update prompt with the current handoff summary.

## Packs, workspaces, and release evidence

- Use a pack when the user wants reusable templates or domain-specific block renderers.
  Register it with `dossier pack add`, scaffold data-only templates with
  `dossier init --template <pack/id>`, and only load executable plugins after
  `dossier pack trust <name>`.
- Use a workspace when several dossiers should act as one operational surface. Run
  `dossier workspace status` for a compact summary, `dossier workspace query --needs ...`
  to find open work, and `dossier workspace index` to generate a `workspace-index`
  dossier with readiness gates, agent work queue, trust gaps, and link graph.
- Use release evidence before publishing. `dossier release collect` should run after
  verification commands. It creates a release dossier with git range, changed files,
  checks, release gates, trust report, and closeout receipt.

## What the reader gets (built in)

Sticky TOC with scroll-spy, in-page search, command palette (Cmd/Ctrl-K), light/dark
theme, reading progress + time, per-block copy, heading anchor links, collapsible
sections, back-to-top, glossary tooltips, lifecycle banner, and one-click export to
Markdown, source JSON, state packet, merged JSON, agent handoff, AI prompt, and
agent-digest, all inlined, all offline, fully responsive.

## Conventions

- One `hero` first; group with `section`s; reserve outlined cards (`summary-cards`,
  `stat-strip`) for collections, not prose.
- Set `meta.slug`; co-locate related dossiers so `[[slug]]` links resolve, or set
  `meta.baseUrl` when hosting.
- Embed in a wiki with `<iframe src="<slug>.html">`, it's style-isolated. Use
  `dossier build <file> --embed` for host apps that already provide navigation or page
  chrome and should load `<slug>.embed.html`.
- Do not hand-write HTML/CSS; only author the JSON model.
