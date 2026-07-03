<div align="center">

# Dossier

### A self-contained, interactive HTML artifact for planning, deciding, editing, verifying, releasing, and handing work back to AI agents.

[![License: MIT](https://img.shields.io/badge/license-MIT-c81e4a.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-c81e4a.svg)](#requirements)
[![Version](https://img.shields.io/badge/version-0.6.6-7048e8.svg)](#release-status)
[![Output](https://img.shields.io/badge/output-single%20HTML%20file-7048e8.svg)](#how-dossier-works)
[![Runtime](https://img.shields.io/badge/viewer%20runtime-zero%20external%20assets-c81e4a.svg)](#how-dossier-works)
[![Agent Ready](https://img.shields.io/badge/agent%20ready-MCP%20%2B%20packets-0f7a52.svg)](#agent-workflows)
[![Blocks](https://img.shields.io/badge/built--in%20blocks-43-9a5b00.svg)](#block-catalog)
[![Packs](https://img.shields.io/badge/packs-templates%20%2B%20trusted%20plugins-0f7a52.svg)](#packs-templates-and-plugins)
[![Workspaces](https://img.shields.io/badge/workspaces-multi--dossier%20status-7048e8.svg)](#workspaces)
[![Homebrew](https://img.shields.io/badge/homebrew-kylebegeman%2Ftap-0f7a52.svg)](https://github.com/kylebegeman/homebrew-tap)
[![Live demo](https://img.shields.io/badge/live%20demo-open-7048e8.svg)](https://kylebegeman.github.io/dossier/)

<a href="https://kylebegeman.github.io/dossier/"><img src="docs/assets/showcase.png" alt="A Dossier rendered from one JSON file" width="860"></a>

**[Open the live demo](https://kylebegeman.github.io/dossier/)** | **[Read the process scope](docs/product/process-dossiers/process-dossiers-scope.md)** | **[View the block cheatsheet](skill/references/blocks.md)** | **[Manual QA guide](docs/product/public-manual-qa.md)**

</div>

## What It Is

Dossier turns an AI response into a durable working artifact.

Instead of asking an agent for a Markdown plan that gets lost in a thread, ask it for a Dossier. It creates one `*.dossier.json` model, builds a polished HTML file, embeds the source model back into that file, and gives humans and agents a shared control surface.

```
AI produces structured model
        |
        v
*.dossier.json  ->  dossier build  ->  self-contained .html + .md (+ .embed.html with --embed)
        ^                                  |
        |                                  v
agent reads packets  <-  human decisions, edits, evidence, release gates

repo pack -> templates/plugins -> trusted local build
workspace manifest -> status/query/index/publish across many dossiers
release evidence -> gates, git range, checks, trust report, receipt
```

Use it for planning, specs, research, code implementation packets, patch review, QA checklists, release gates, incident response, integration loops, and any process where humans and agents need to pass structured state back and forth.

## Why It Exists

| Old flow | Dossier flow |
|---|---|
| AI writes a long Markdown dump. | AI builds an interactive artifact with a typed source model. |
| Human comments in the chat. | Human decides inside the artifact with verdicts, notes, gates, and edits. |
| Agent re-reads an ambiguous transcript. | Agent reads versioned packets through HTML export or MCP tools. |
| Evidence is scattered across logs, PRs, and messages. | Evidence, claims, sources, commands, diffs, and receipts live together. |

The core idea: **a dossier is not just a document. It is a portable human-agent process packet.**

## Quick Start

Install with Homebrew:

```bash
brew install kylebegeman/tap/dossier
dossier --help
```

Or tap first if you prefer the shorter package name:

```bash
brew tap kylebegeman/tap
brew install dossier
```

If your Homebrew setup requires explicit third-party trust, trust only this formula:

```bash
brew trust --formula kylebegeman/tap/dossier
```

The npm package target is `@kylebegeman/dossier`. Once the first npm registry publish is complete, install it with:

```bash
npm install -g @kylebegeman/dossier
```

Until the registry publish is available, install the tagged GitHub release through npm:

```bash
npm install -g github:kylebegeman/dossier#v0.6.6
```

Create and build a document:

```bash
dossier init my-plan --kind plan
dossier build my-plan.dossier.json
open my-plan.html
```

Or let an agent do it:

```text
Make me a Dossier for this refactor. Include work items, patch review, verification, risks, and a release gate.
```

The agent should write `my-refactor.dossier.json`, run `dossier build`, and give you `my-refactor.html` plus `my-refactor.md`.

## Choose A Workflow

| If you need... | Start with... | Main blocks |
|---|---|---|
| Strategy, options, tradeoffs | `dossier init roadmap --kind plan` | `review-board`, `decision-matrix`, `assumptions`, `action-items` |
| Actual code editing loop | `--kind implementation` | `process-board`, `code-editor`, `patch-set`, `diff-view`, `verification-run`, `process-receipt` |
| Review or bug bash | `--kind review` | `finding-list`, `diff-view`, `comment-thread`, `verdict-gate`, `trust-report` |
| Debugging | `--kind debug` | `evidence-log`, `patch-set`, `verification-run`, `decision-log` |
| Dependency dogfood | `--kind integration-loop` | `cycle-board`, `integration-report`, `upstream-response`, `process-receipt` |
| Release readiness | `--kind release` | `release-checklist`, `risk-register`, `verification-run`, `trust-report`, `process-receipt` |
| Incident response | `--kind incident` | `timeline`, `evidence-log`, `decision-log`, `verification-run`, `process-receipt` |
| A folder of docs | `dossier publish docs --out site` | catalog, cross-links, static site output |
| A reusable template library | `dossier pack add <repo-or-path>` | data-only templates, trusted render plugins, lockfile provenance |
| Multi-dossier operations | `dossier workspace index` | workspace readiness, agent work queue, release gaps, trust gaps |
| Release automation evidence | `dossier release collect` | git range, changed files, verification commands, release trust report |

## Example Gallery

The repo ships focused examples so people can see Dossier as more than a plan document. Build them all with:

```bash
node bin/dossier.mjs build examples/*.dossier.json
npm run site
```

| Example | Source | What it showcases | Use it when |
|---|---|---|---|
| [Block showcase](examples/showcase.html) | [`examples/showcase.dossier.json`](examples/showcase.dossier.json) | All 43 blocks, Console Slate skin, reader controls, export packets, process blocks, trust reports. | You want to inspect the full product surface. |
| [System overview](examples/dossier-overview.html) | [`examples/sample.dossier.json`](examples/sample.dossier.json) | Compact overview, hero, stats, flow, tables, and core export behavior. | You want the smallest useful starting point. |
| [Product launch](examples/product-launch.html) | [`examples/product-launch.dossier.json`](examples/product-launch.dossier.json) | Product microsite, hero media, FAQ, launch claims, and polished public copy. | You need a product page, feature brief, or launch note. |
| [Research brief](examples/research-brief.html) | [`examples/research-brief.dossier.json`](examples/research-brief.dossier.json) | Decision matrix, assumptions, references, and source-backed trust ledger. | You need research synthesis or competitive analysis. |
| [Engineering release](examples/engineering-release.html) | [`examples/engineering-release.dossier.json`](examples/engineering-release.dossier.json) | Release checklist, verification receipts, trust claims, and closeout. | You need public QA or release readiness. |
| [Incident response](examples/incident-response.html) | [`examples/incident-response.dossier.json`](examples/incident-response.dossier.json) | Timeline, evidence log, decision log, risk register, remediation board. | You need an incident or post-incident packet. |
| [Implementation packet](examples/implementation-packet.html) | [`examples/implementation-packet.dossier.json`](examples/implementation-packet.dossier.json) | Process board, editable code, patch set, diff review, and verification plan. | You need agentic code editing with human approval. |
| [Example workspace](examples/workspace-index.html) | [`examples/dossier.workspace.json`](examples/dossier.workspace.json) | Multi-dossier status, workspace query, generated readiness index, static publishing. | You want to manage a set of dossiers as one operational surface. |
| Engineering pack | [`examples/packs/engineering/dossier.pack.json`](examples/packs/engineering/dossier.pack.json) | Repo-backed templates plus a trusted render plugin example. | You want reusable templates or domain-specific blocks. |

The Pages build also emits a hosted gallery at `examples.html`, with every example cross-linked as a static Dossier site.

## Feature Map

| Area | What is included |
|---|---|
| Self-contained output | One full HTML file, optional chrome-stripped embed HTML, one Markdown export, embedded JSON model, no view-time network. |
| Reader UX | Sticky TOC, search, command palette, shortcuts modal, focus-trapped overlays, scroll progress, dark mode, section collapse, copy buttons, heading anchors, row anchors. |
| Agent usability | Embedded `#dossier-model`, agent digest, versioned packets, MCP read/write tools, starter templates. |
| Human control | Review boards, process verdicts, release gates, patch verdicts, diff file and hunk comments. |
| Editing | In-place text editing, `code-editor` blocks, edit packet export/import, `dossier serve` save-back. |
| Live authoring | Local dev server, reload, live model editor, patch import, JSON validation before write. |
| Code review | Unified diff parser, file summaries, hunk rendering, patch sets, review packets. |
| Evidence | Verification runs, evidence logs, process receipts, generation receipts, trust reports. |
| Trust | Structured source records, per-claim status and confidence, source/evidence links, MCP trust readback. |
| Publishing | `catalog` and `publish` commands for static dossier sites. |
| Workspaces | Manifest-driven multi-dossier scan, readiness index, query, and static workspace publish. |
| Export | Export Center for source JSON, state packets, merged JSON, agent handoff packets, Markdown, DOCX, PDF through Playwright, Confluence storage XHTML, Notion Markdown, slide decks, plus React SSR/components. |
| Presentation | Theme packs, per-document `meta.theme` tokens, and the opt-in `console-slate` skin. |
| Extensibility | Repo-backed packs with data-only templates, explicit-trust render plugins, and lockfile provenance. |
| Release automation | Release evidence dossiers from git ranges, checks, changed files, gates, trust claims, and CI artifacts. |

## How Dossier Works

Dossier has one source of truth: the JSON model.

```json
{
  "dossierVersion": "1.0",
  "kind": "implementation",
  "meta": {
    "title": "Session refactor",
    "slug": "session-refactor",
    "status": "review",
    "skin": "console-slate"
  },
  "blocks": [
    { "type": "hero", "title": "Session refactor", "lede": "A bounded implementation packet." },
    { "type": "process-board", "title": "Work", "items": [] },
    { "type": "verification-run", "title": "Verification", "runs": [] },
    {
      "type": "trust-report",
      "title": "Trust report",
      "sources": [
        { "id": "verification", "label": "Verification", "kind": "command", "trust": "pending" }
      ],
      "claims": [
        { "id": "ready", "claim": "Ready for review.", "status": "unverified", "confidence": "unknown", "sources": ["verification"] }
      ]
    }
  ]
}
```

Build-time enrichments are baked into the HTML:

| Enrichment | Where it runs | Viewer requirement |
|---|---|---|
| Shiki code highlighting | Build time | None |
| Graphviz DOT diagrams | Build time | None |
| KaTeX math | Build time | None |
| SVG charts with axes, gridlines, and value labels | Build time | None |
| Figures | Build time, local images inlined | None |
| Mermaid diagrams | Optional Playwright path | Browser only for build |
| PDF export | Optional Playwright path | Browser only for export |

The generated HTML includes:

- `#dossier-model`: the embedded JSON source model.
- `#dossier-markdown`: the Markdown export.
- `#dossier-digest`: a compact agent-readable digest.
- Inlined CSS and runtime JavaScript.
- No external assets or remote scripts.

### Stateful Exports

The browser Export Center separates four artifact types so humans and agents do not have to guess what "JSON" means:

| Export | Meaning | Use it for |
|---|---|---|
| Source JSON | The authored model embedded in `#dossier-model`. | Preserve or inspect the original input. |
| State packet | Human changes captured in the browser: decisions, process verdicts, edits, release gates, patch and diff review, and evidence. | Hand current review state to an agent without rewriting the whole model. |
| Merged JSON | Source JSON with the state packet applied back into the model. | Rebuild or publish a new canonical dossier that includes browser edits. |
| Agent handoff | A compact `dossier.handoff/v1` summary with selected decisions, dirty edits, release gaps, and next-agent guidance. | Resume work in another agent or thread. |

Export Center can also import a saved state packet, applying those browser changes back to
the visible review controls before you download merged JSON or a handoff packet.

The CLI mirrors the same model:

```bash
dossier export plan.dossier.json --format json
dossier export plan.dossier.json --format merged-json --state plan.state.json
dossier export plan.dossier.json --format handoff --state plan.state.json
dossier export plan.dossier.json --format state-diff --state plan.state.json
dossier export plan.dossier.json --format prompt --state plan.state.json
dossier export plan.dossier.json --format confluence --state plan.state.json
dossier export plan.dossier.json --format notion --state plan.state.json
dossier export plan.dossier.json --format slides --state plan.state.json
dossier prompt plan.dossier.json --state plan.state.json
```

### Embedding

Use the full HTML file when you want the Dossier toolbar, TOC, exports, search, and theme controls:

```html
<iframe src="my-doc.html" title="Project dossier"></iframe>
```

Use `--embed` when a host app or docs page already supplies navigation and chrome:

```bash
dossier build my-doc.dossier.json --embed
dossier publish docs --out site --embed
```

That writes `my-doc.embed.html`. The embed file removes the topbar, TOC, footer, source modal, command palette, and theme studio, but keeps block interactivity, packet exports, runtime state, and the same `#dossier-model`, `#dossier-markdown`, and `#dossier-digest` islands.

## Packs, Templates, And Plugins

Packs are the reusable ecosystem unit. A pack is a repository or local folder with a `dossier.pack.json` manifest, data-only templates, and optional render plugins.

```bash
dossier pack add examples/packs/engineering
dossier pack list
dossier init auth-review --template engineering/security-review
```

Templates are safe by default because they are JSON models. Render plugins are executable JavaScript, so they only load after explicit trust:

```bash
dossier pack trust engineering
dossier build custom.dossier.json --pack engineering
```

`dossier pack add` writes `dossier.lock.json` with the pack source, local path, Git ref, pinned commit when available, templates, plugins, and trust state. This keeps agent workflows reproducible and makes the executable-code boundary visible during review.

Pack manifest shape:

```json
{
  "name": "engineering",
  "version": "0.1.0",
  "templates": [
    { "id": "security-review", "title": "Security review", "kind": "review", "path": "templates/security-review.dossier.json" }
  ],
  "plugins": [
    { "id": "signal-banner", "entry": "plugins/signal-banner.plugin.mjs", "permissions": ["render"] }
  ]
}
```

## Workspaces

Use a workspace when one dossier is no longer enough. A workspace manifest scans multiple roots, extracts process items, release gates, trust claims, verification runs, invalid dossier diagnostics, and `[[slug]]` links, then builds an agent-readable status index.

```bash
dossier workspace init examples --name "Dossier Examples" --roots . --exclude packs
dossier workspace status examples
dossier workspace query examples --needs release
dossier workspace query examples --needs invalid
dossier workspace index examples --skin console-slate
dossier workspace publish examples --out site
```

Workspace manifest shape:

```json
{
  "schema": "dossier.workspace/v1",
  "name": "Dossier Examples",
  "roots": ["."],
  "exclude": ["packs"],
  "packs": ["engineering"],
  "output": "site"
}
```

The generated `workspace-index.dossier.json` includes:

| Surface | What it answers |
|---|---|
| Workspace readiness | Are docs valid, process queues clear, release gates passed, trust gaps closed, and links resolved? |
| Agent work queue | Which process items, release gates, trust claims, or links need attention? |
| Workspace dossiers table | What exists, what kind it is, and how many open gaps each doc has. |
| Trust report | Which claims still need evidence before agents should rely on them. |
| Link graph | How dossiers connect through `[[slug]]` references. |

## Release Evidence Automation

`dossier release collect` creates a release dossier from git state and verification commands. It records the range, HEAD, branch, changed files, commits, checks, release gates, trust claims, and closeout receipt.

```bash
dossier release collect \
  --version 0.6.0 \
  --since v0.5.5 \
  --checks "npm test,node bin/dossier.mjs build examples/*.dossier.json,npm pack --dry-run --json"
```

By default it writes `docs/releases/<version>.dossier.json`, `release-<version>.html`, and `release-<version>.md`. The GitHub Actions workflow in [`.github/workflows/release-evidence.yml`](.github/workflows/release-evidence.yml) runs tests, validates and builds examples, runs `npm pack --dry-run --json`, generates the release dossier, and uploads the evidence as an artifact. Publishing packages or creating GitHub Releases stays an explicit human-controlled step.

## Themes And Skins

Themes are token packs. Skins are fuller layout and component treatments.

```bash
dossier build my-doc.dossier.json --theme forest
dossier build my-doc.dossier.json --skin console-slate
dossier serve my-doc.dossier.json --theme forest --skin console-slate --open
dossier publish docs --out site --theme ocean --skin console-slate
```

You can also set presentation in the model:

```json
{
  "meta": {
    "title": "Release packet",
    "skin": "console-slate",
    "theme": {
      "accent": "#2563eb"
    }
  }
}
```

Cascade order is deliberate: base CSS, then the selected skin, then `meta.theme`. That means a skin can change density and component shape, while a project can still override final tokens such as `accent`, `bg`, or `frame`.

## Agent Workflows

Dossier is designed to be driven by agents, not only read by humans.

### Claude Code Skill

This repo ships a skill in [`skill/`](skill/). Link it into your skill directory:

```bash
ln -s "$(pwd)/skill" ~/.claude/skills/dossier
```

Then ask:

```text
Make me an implementation dossier for this change. Include source context, work items, proposed patch sets, diff review, test evidence, a trust report, and release gates.
```

The skill points the agent at:

- [`skill/SKILL.md`](skill/SKILL.md), the agent instructions.
- [`skill/references/blocks.md`](skill/references/blocks.md), copy-paste examples for every block.
- [`schema/dossier.schema.json`](schema/dossier.schema.json), the full contract.

### MCP Server

Run:

```bash
dossier mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "dossier": {
      "command": "dossier",
      "args": ["mcp"]
    }
  }
}
```

Core MCP tools:

| Tool family | Tools |
|---|---|
| Render and validate | `dossier_render`, `dossier_validate`, `dossier_get_schema`, `dossier_get_starter` |
| Read human state | `dossier_read_decisions`, `dossier_read_process`, `dossier_read_edits`, `dossier_read_verdicts`, `dossier_read_release` |
| Review packets | `dossier_read_patch_review`, `dossier_read_diff_review` |
| Trust and provenance | `dossier_read_trust`, `dossier_record_claim` |
| State workflow | `dossier_read_state`, `dossier_merge_state`, `dossier_diff_state`, `dossier_read_handoff`, `dossier_prompt` |
| Update models | `dossier_apply_edits`, `dossier_apply_process`, `dossier_apply_patch_review`, `dossier_record_run`, `dossier_attach_patchset` |
| Closeout | `dossier_resume_context`, `dossier_closeout_digest`, `dossier_closeout_model` |
| Packet schemas | `dossier_get_packet_schema` |

Packet contracts live in [`schema/packets/`](schema/packets/):

`process`, `edits`, `verdicts`, `release`, `patch-review`, `diff-review`, `trust`, `closeout`, `state`, and `handoff`.

## Process Dossiers

Planning is one process. Dossier now covers the rest of the AI-assisted work loop.

### Implementation Loop

1. Agent writes a context-rich implementation dossier.
2. Human reviews `process-board` items and `patch-set` proposals.
3. Human leaves notes, approves patches, or requests revision.
4. Agent reads packets through MCP or exported JSON.
5. Agent edits the real codebase in the host environment.
6. Verification runs, evidence, trust claims, release gates, and closeout receipts are appended.

### Release And Incident Flow

| Release | Incident |
|---|---|
| `release-checklist` tracks required gates. | `timeline` tracks events and mitigation. |
| `verification-run` records test and build evidence. | `evidence-log` records observations and links. |
| `trust-report` records which claims are grounded. | `decision-log` records operational decisions. |
| `process-receipt` closes out the release. | `process-receipt` closes out remediation. |

## Live Editing

Static artifacts work anywhere. For authoring, run:

```bash
dossier serve my-doc.dossier.json --open
```

`dossier serve` adds development-only live tools:

- Live reload when the source model changes.
- CodeMirror 6 enhancement for `code-editor` blocks, loaded only by the local serve runtime.
- Save-back for `code-editor` blocks.
- Language-aware editing for JavaScript, TypeScript, JSON, Markdown, HTML, CSS, Python, SQL, and YAML.
- Search, JSON formatting, wrapping, copy, and Cmd/Ctrl-S in editor blocks.
- A live model editor that can validate and save the full JSON model.
- Patch import that appends a validated `patch-set` block.

The saved model is validated before writing. Invalid saves return a 400 and do not touch disk.
The generated static HTML still keeps the dependency-free textarea fallback, so shared artifacts do not bundle CodeMirror. Monaco stays a host-only option for a future Studio or Lumen integration where bundle size and worker setup are acceptable.

## Block Catalog

43 built-in block types, plus plugins:

| Group | Blocks |
|---|---|
| Structure | `hero`, `section`, `two-col`, `tabs`, `prose` with paragraphs, bullets, and numbered lists |
| At a glance | `summary-cards`, `stat-strip` with deltas, `flow`, `timeline`, `callout` |
| Reference | `table`, `code`, `code-editor`, `patch-set`, `diff-view`, `diagram`, `references`, `citations`, `faq`, `glossary` |
| Media and data | `figure`, `math`, `chart` with static labels, `footnotes` |
| Decisions | `decision-matrix`, `risk-register`, `assumptions`, `action-items`, `review-board`, `verdict-gate`, `decision-log` |
| Process | `process-board` with row anchors, `verification-run`, `evidence-log`, `process-receipt`, `finding-list`, `comment-thread`, `cycle-board`, `integration-report`, `upstream-response`, `release-checklist` |
| Trust | `trust-report`, `receipt` |

Every block has a copy-paste example in [`skill/references/blocks.md`](skill/references/blocks.md).

## CLI Reference

| Command | What it does |
|---|---|
| `dossier init [name] --kind <kind>` | Scaffold from a starter. |
| `dossier init <name> --template <pack/id>` | Scaffold from a registered pack template. |
| `dossier build <file> [--watch] [--plugin a,b] [--pack name] [--theme <pack>] [--skin console-slate] [--embed]` | Validate and render to `<slug>.html` plus `<slug>.md`; `--pack` loads trusted pack plugins, `--embed` also writes `<slug>.embed.html`. |
| `dossier serve <file> [--open] [--port] [--theme <pack>] [--skin console-slate]` | Build, serve, live reload, and enable save-back tools with the same presentation flags as `build`. |
| `dossier validate <file>` | Validate a model without rendering. |
| `dossier lint <file> [--strict]` | Warn about authoring, trust, and packet quality issues; `--strict` exits nonzero on warnings. |
| `dossier diff <old> <new>` | Structural diff between two dossier models. |
| `dossier catalog <dir>` | Build an index model for a folder of dossiers. |
| `dossier publish <dir> --out site [--theme <pack>] [--skin console-slate] [--embed]` | Build every dossier plus an `index.html` catalog into a static site; `--embed` writes sibling embed files. |
| `dossier pack add <repo-or-path> [--name <name>] [--ref <ref>]` | Register a local or Git-backed pack in `dossier.lock.json`. |
| `dossier pack trust <name>` | Allow a registered pack to load executable render plugins. |
| `dossier pack list [--json]` | List registered packs, templates, plugins, source type, and trust state. |
| `dossier workspace init [dir] [--name <name>] [--roots <a,b>] [--exclude <dir,dir>]` | Create `dossier.workspace.json`. |
| `dossier workspace index [manifest\|dir]` | Generate and render `workspace-index.dossier.json`. |
| `dossier workspace status [manifest\|dir] [--json]` | Print workspace status for agents or humans. |
| `dossier workspace query [manifest\|dir] [--kind <kind>] [--tag <tag>] [--needs process\|release\|trust\|invalid]` | Filter workspace dossiers by metadata, open work, or invalid dossier diagnostics. |
| `dossier workspace publish [manifest\|dir] --out site` | Publish every workspace dossier plus the workspace index into one static site. |
| `dossier release collect [--version <v>] [--since <ref>] [--checks <cmd,cmd>]` | Generate release evidence JSON, HTML, and Markdown. |
| `dossier export <file> --format docx\|md\|pdf\|confluence\|notion\|slides\|json\|merged-json\|handoff\|state-diff\|prompt [--state packet.json]` | Export to Word, Markdown, PDF, Confluence storage XHTML, Notion Markdown, slide deck HTML, source JSON, state-applied JSON, agent handoff, state diff, or AI prompt. |
| `dossier prompt <file> [--state packet.json]` | Print an AI authoring or update prompt based on a dossier and optional state packet. |
| `dossier mcp` | Run the MCP server over stdio. |

## React

Dossier also ships a typed React port in [`react/`](react/):

```ts
import { renderDossier } from "@kylebegeman/dossier-react";

const { html, embedHtml, md } = await renderDossier(model);
```

```tsx
import { DossierDocument } from "@kylebegeman/dossier-react";

<DossierDocument model={model} animate />
```

The React dispatcher covers the built-in blocks, reuses the core design system, and falls back to registered Node renderers for plugin blocks.

## Plugins

Register custom blocks without forking. For one-off local development, load a plugin file directly:

```bash
dossier build my.dossier.json --plugin ./my-plugin.mjs
```

```js
export default function ({ registerBlock, esc }) {
  registerBlock("badge-row", (b) =>
    `<section class="ds-block" data-block="badge-row"><div class="ds-chips">` +
    (b.badges || []).map((x) => `<span class="ds-chip">${esc(x)}</span>`).join("") +
    `</div></section>`);
}
```

React plugins can call `registerComponent(type, Component)` for native component parity. See [`examples/plugins/badge-row.plugin.mjs`](examples/plugins/badge-row.plugin.mjs).

For reusable teams or public sharing, prefer a pack:

```bash
dossier pack add examples/packs/engineering
dossier pack trust engineering
dossier build my.dossier.json --pack engineering
```

The trust step is intentionally separate because pack plugins execute code at build time. Pack templates can be used without trusting the pack.

## Publishing And Embedding

Publish a dossier folder:

```bash
dossier publish docs --out site
```

Embed a generated artifact anywhere:

```html
<iframe src="my-doc.html" style="width:100%;height:80vh;border:0"></iframe>
```

Cross-link dossiers with `[[other-slug]]`. Use relative links when files sit together, or set `meta.baseUrl` for hosted sites.

## Optional Browser Features

Most features need no browser automation. Two features use Playwright:

```bash
npm i playwright mermaid
npx playwright install chromium
```

| Feature | Without Playwright | With Playwright |
|---|---|---|
| Mermaid diagrams | Render as source text with an install hint. | Render to static SVG at build time. |
| PDF export | Prints an install hint. | Exports a print-styled PDF with title headers, page numbers, and print-safe layout rules. |

## Release Status

Current patch train:

| Version | Focus |
|---|---|
| `0.6.6` | Canonical Kyle Begeman GitHub, Pages, Homebrew, npm, schema, and agent install metadata. |
| `0.6.5` | Correct package-manager URLs: Kyle Begeman npm scope with the existing GitHub repo and Homebrew tap owner. |
| `0.6.4` | Kyle Begeman brand migration for npm scopes, public copy, examples, and agent docs. |
| `0.6.3` | Conventional Homebrew tap naming. |
| `0.6.2` | Package-manager distribution readiness, npm CLI bin metadata, Homebrew tap publishing, install docs. |
| `0.6.1` | Workspace invalid-dossier diagnostics, stricter workspace publish behavior, no-tag release evidence changed files, CLI subcommand exit hardening. |
| `0.6.0` | Repo-backed packs, trusted plugin loading, pack templates, multi-dossier workspaces, workspace publish/query/status, release evidence automation, example engineering pack. |
| `0.5.5` | Live CodeMirror editor adapter for `dossier serve`, CodeMirror module serving, docs roadmap closeout, refreshed overview and release examples. |
| `0.5.4` | Chrome-stripped embed output, presentation flag parity, React render hardening, refreshed gallery docs. |
| `0.5.3` | Trust reports, provenance packet, MCP trust tools, README and public manual QA readiness. |
| `0.5.2` | Static publishing, catalog index, React parity for process blocks. |
| `0.5.1` | Live editor adapter, model editor, patch import, review packets, expanded MCP write tools. |

Manual QA entrypoint: [`docs/product/public-manual-qa.md`](docs/product/public-manual-qa.md).

## Development

```bash
git clone https://github.com/kylebegeman/dossier.git
cd dossier
npm install
npm test
node bin/dossier.mjs validate examples/*.dossier.json
node bin/dossier.mjs build examples/*.dossier.json
node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z
node bin/dossier.mjs release collect --version 0.0.0-dev --since v0.5.5 --out docs/releases/dev.dossier.json --updated 2026-06-29T00:00:00.000Z --checks "npm test"

cd react
npm install
npx tsc --noEmit
```

Project map:

| Path | Purpose |
|---|---|
| `src/` | Core Node generator, runtime, theme, validation, exports, serve mode. |
| `react/` | Typed React renderer and components. |
| `schema/` | Document schema and packet schemas. |
| `mcp/` | MCP server. |
| `skill/` | Agent skill and block references. |
| `examples/` | Gallery models, workspace manifest, plugins, and example packs. |
| `docs/product/` | Durable product scope and QA docs. |
| `docs/releases/` | Generated release evidence dossiers. |
| `.github/workflows/` | CI, Pages demo deployment, and release evidence artifact workflow. |

Before opening a PR or cutting a release:

```bash
npm test
node bin/dossier.mjs validate examples/*.dossier.json
node bin/dossier.mjs build examples/*.dossier.json
npm pack --dry-run --json
cd react && npx tsc --noEmit
```

## Requirements

Node.js 18 or newer to build from npm, GitHub, or source. The Homebrew formula installs its own `node` dependency. Generated pages need only a browser.

## Contributing

Issues and PRs are welcome. Keep generated output self-contained, keep agent-readable contracts explicit, and add tests for new blocks or packets.

When adding a block type, update:

| Surface | File |
|---|---|
| Node render and Markdown | `src/generate.mjs` |
| React render | `react/src/blocks.tsx` |
| Types | `react/src/types.ts` |
| Schema | `schema/dossier.schema.json` |
| Validator | `src/validate.mjs` |
| DOCX export, if applicable | `src/export.mjs` |
| Agent docs | `skill/references/blocks.md` |
| Showcase | `examples/showcase.dossier.json` |
| Tests | `test/dossier.test.mjs` |

CI runs tests on Node 18, 20, and 22. The Pages demo redeploys on pushes to `master`. Release evidence can be generated locally with `dossier release collect` or through the `Release Evidence` workflow.

## License

[MIT](LICENSE).
