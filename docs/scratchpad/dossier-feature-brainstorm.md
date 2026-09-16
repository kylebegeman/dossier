---
title: "Dossier, feature & improvement brainstorm"
slug: "dossier-feature-brainstorm"
status: "closed"
updated: "2026-09-15"
---
# Where Dossier goes next

A focused set of opportunities across ergonomics, capabilities, the agent loop, distribution, and long-term direction. Expand any item for detail, tick the ones worth pursuing, leave notes, then export your decisions.

> **Meta.** This brainstorm is itself a Dossier review board, the exact surface several of the ideas below would deepen.

## Minor features & improvements

### Watch mode + local preview server

`dossier serve` / `--watch --open` rebuilds and live-reloads as you (or an agent) edit.

**How it works:** a tiny static server watches the `.dossier.json`, rebuilds on change, and pushes a reload over an injected dev socket (dev-only; never in the artifact).

**Experience:** edit JSON, see the page update instantly, no manual rebuild/refresh loop.

**Why:** tightens the authoring and agent iteration loop, the single biggest day-to-day friction today.

- **Unlocks:** Faster agent round-trips; foundation for an in-browser editor (J4)

### Build-time schema validation + friendly errors

Validate the model against the schema before rendering, with precise, human-readable errors.

**How it works:** validate against `dossier.schema.json` (build-time dep) and print path-pointed errors (e.g. `blocks[3].type: unknown`).

**Experience:** malformed JSON fails loudly with a fix, instead of rendering something subtly broken.

**Why:** correctness and trust; agents get actionable feedback to self-correct.

- **Unlocks:** Self-correcting agent authoring; lint (M3)

### Authoring lint & warnings

Flag broken `[[links]]`, undefined glossary terms, duplicate ids, empty/oversized blocks.

**How it works:** a non-fatal pass that emits warnings during build (and a `--strict` to fail).

**Experience:** catch dead cross-links and silent mistakes before sharing.

**Why:** quality polish that compounds across a folder of documents.

- **Unlocks:** Catalog integrity (J1)

### Print / PDF stylesheet

A real `@page` print path: page breaks, headers/footers, print-optimized layout.

**How it works:** a print media block in the inlined CSS controlling breaks, hiding chrome, and tuning type.

**Experience:** Cmd-P produces a clean PDF, no garbled reader UI.

**Why:** PDF is still the lingua franca for sharing plans and reports outside the browser.

- **Unlocks:** Step toward multi-format export (J9)

### Figure / image block

Images with caption and optional lightbox, inlined as data-URIs to stay self-contained.

**How it works:** a `figure` block takes a path or URL; build-time inlines it as a data-URI (with a size guard) plus a caption.

**Experience:** screenshots, mockups, and diagrams-as-images live in the document and travel with the single file.

**Why:** closes a real capability gap, today there is no first-class image support.

- **Unlocks:** Visual reports, design reviews

### Copy-for-LLM controls

One-click "copy as Markdown" per section and a whole-document "copy agent digest" in the header.

**How it works:** reuse the existing MD/digest exports behind copy buttons on sections and the toolbar.

**Experience:** grab exactly the slice you want to paste into another agent or thread.

**Why:** the agent loop is the product; make handing context back frictionless.

- **Unlocks:** Smoother multi-agent workflows

### Kind-specific starters

`dossier init --kind adr|runbook|postmortem|prd|rfc` scaffolds a tailored template.

**How it works:** ship a small library of starter models keyed by `kind`.

**Experience:** start from a real ADR/postmortem skeleton instead of a blank doc.

**Why:** discoverability and onboarding, shows the range of what Dossier is for.

- **Unlocks:** Template library (J-templates)

### Editor autocomplete via $schema

Associate the JSON Schema so editors give field/enum autocomplete and inline validation while authoring.

**How it works:** publish the schema at a stable URL and add a `$schema` pointer + a VS Code settings snippet.

**Experience:** authoring `.dossier.json` by hand gets autocomplete and red squiggles.

**Why:** big DX win for humans (and a hint for agents) at near-zero cost.

- **Unlocks:** Easier manual authoring; fewer invalid docs

### Footnotes & lightweight citations

Numbered footnotes and a references registry with hover previews and back-links.

**How it works:** a citation syntax in text fields resolving to a numbered, linked references list.

**Experience:** research and analysis docs get proper sourcing without clutter.

**Why:** raises trust for agent-authored content; a stepping stone to a full provenance layer.

- **Unlocks:** Provenance / trust layer (J8)

### Math rendering (KaTeX, build-time)

Render LaTeX math to static markup at build time, zero client JS.

**How it works:** detect `$...$`/`$$...$$` (or a `math` block) and render with KaTeX during build.

**Experience:** technical and scientific documents read correctly.

**Why:** unlocks a whole class of research/eng content while keeping the artifact self-contained.

- **Unlocks:** Research/ML documents

### Accessibility & shortcuts polish

Keyboard-shortcuts help overlay (`?`), skip-to-content, focus-trapped palette/modals, reduced-contrast support.

**How it works:** add a shortcuts overlay, a skip link, focus management in overlays, and `prefers-contrast` tokens.

**Experience:** fully keyboard-navigable and screen-reader friendly.

**Why:** correctness, inclusivity, and credibility for a public tool.

- **Unlocks:** WCAG AA path

### Tests + CI

Renderer unit tests, a sample-build smoke test with output invariants, and GitHub Actions.

**How it works:** snapshot/invariant tests (island round-trips, no external assets, all blocks render) plus a CI matrix on push/PR.

**Experience:** contributors and agents get a green/red signal; regressions caught early.

**Why:** essential maintainability for a public OSS project and safe iteration.

- **Unlocks:** Confident refactors; release automation


## Major features, systems & refactors

### MCP server + decisions round-trip protocol

Expose create/render/read-decisions as MCP tools so any agent can drive Dossier, with a formal decisions packet.

**How it works:** an MCP server wrapping the generator: `create_dossier`, `render`, `read_decisions`, `apply_decisions`. The exported decisions JSON becomes a versioned contract.

**Experience:** any MCP-capable agent (not just the Claude Code skill) plans, renders, reads your selections, and acts, programmatically.

**Why:** doubles down on the agent-first thesis; turns Dossier from a generator into a human-and-agent decision protocol.

- **Unlocks:** Cross-agent reach; automated implementation from decisions
- **Depends on:** Decisions schema, validation (M2)

### Catalog + cross-document knowledge graph

Scan a folder of dossiers into a master index, resolving `[[links]]` into a navigable graph.

**How it works:** read each document's embedded model + front-matter, build an index dossier and a link graph.

**Experience:** a folder of dossiers becomes a browsable, searchable knowledge base for free.

**Why:** scales Dossier from single documents to an organizational memory.

- **Unlocks:** Hosting (J2); related-doc surfacing
- **Depends on:** Lint (M3) for link integrity

### Publish / hosting command

`dossier publish` deploys a folder (+ index + search) to GitHub Pages or any static host.

**How it works:** build all dossiers + the catalog, wire `meta.baseUrl` cross-links, and push to a static target.

**Experience:** one command turns your dossiers into a shareable mini-site.

**Why:** distribution, get documents in front of teams without attaching files.

- **Unlocks:** Public/internal knowledge sites; analytics
- **Depends on:** Catalog (J1)

### In-browser block editor

Edit the document in the page over the block model and save the JSON back.

**How it works:** a structured editor over blocks (reorder, edit fields, add/remove) that writes the model back to disk (with watch mode) or downloads it.

**Experience:** non-JSON authors edit visually; humans tweak what the agent produced without touching JSON.

**Why:** removes the last authoring barrier and makes human-and-agent co-editing real.

- **Unlocks:** Co-editing; WYSIWYG adoption
- **Depends on:** Watch/serve (M1)

### Plugin / custom block system

Register custom block types + renderers for both the Node and React paths.

**How it works:** a registry where a block type maps to a renderer (string for Node, component for React) plus optional schema and styles.

**Experience:** teams add domain blocks (e.g. a metrics widget, an API table) without forking.

**Why:** turns Dossier into a platform; community/ecosystem leverage.

- **Unlocks:** Ecosystem; charts (J6) as first plugin
- **Depends on:** Stable block contract

### Data-visualization blocks

Charts (bar/line/area) rendered to static SVG at build time via an SSR chart lib.

**How it works:** a `chart` block with data + spec, rendered to inline SVG (visx/Nivo SSR), no client JS.

**Experience:** metrics-heavy plans, postmortems, and reports show real charts inline.

**Why:** a frequent gap for status/analysis documents; stays self-contained.

- **Unlocks:** KPI/metrics reporting
- **Depends on:** Plugin system (J5) ideally

### Versioning + structural diff

Compute a block-level diff between two versions and render a changelog/diff view.

**How it works:** diff two embedded models structurally (added/removed/changed blocks) and render a diff overlay; promote the `changelog` block to computed.

**Experience:** see exactly what changed between revisions of a plan or spec.

**Why:** documents become tracked artifacts, not one-shot dumps, key for living plans.

- **Unlocks:** Review-of-changes workflows
- **Depends on:** Stable ids (have)

### Provenance / trust layer

Structured citations, source provenance, per-claim confidence, and a generation receipt.

**How it works:** claims carry sources + confidence; a receipt records which model/tools produced the doc and what failed; optional verification badges.

**Experience:** readers see what's grounded vs asserted; agent-authored content becomes auditable.

**Why:** trust is the bottleneck for acting on AI-written documents, this directly addresses it.

- **Unlocks:** Verified research; compliance use
- **Depends on:** Footnotes/citations (M9)

### Multi-format export pipeline

Real PDF, plus DOCX / Confluence / Notion / slides export from the same model.

**How it works:** map the block model to additional targets (PDF via the print path or headless; DOCX/Confluence/Notion via their formats).

**Experience:** publish where your team already works, from one source.

**Why:** meets organizations where they are; broadens reach beyond a single HTML file.

- **Unlocks:** Enterprise adoption
- **Depends on:** Print stylesheet (M4)

### Theme Studio + brand packs

A visual editor for the design tokens with exportable, shareable brand presets.

**How it works:** a UI over `meta.theme` tokens (color, type, radius, density) that previews live and exports a token config / named pack.

**Experience:** match a document to a team's brand without touching CSS.

**Why:** makes the design system feel owned and reusable; supports many brands from one engine.

- **Unlocks:** Branded org templates
- **Depends on:** Token system (have)


## Synthesis

If you only chase a few, chase these.

> **Highest ROI (impact ÷ effort).** Schema validation (M2), watch/serve (M1), print/PDF (M4), the figure/image block (M5), and tests + CI (M12). All small-to-medium, all remove real friction or close obvious gaps.

> **Most strategically valuable (long-term).** The MCP server + decisions protocol (J-mcp) is the keystone for the agent-first thesis. Then the catalog/graph (J-catalog) and publish/hosting (J-publish) turn single documents into organizational memory, and the plugin system (J-plugins) turns Dossier into a platform.

> **Quick wins (low effort, noticeable).** Copy-for-LLM controls (M6), kind-specific starters (M7), $schema editor autocomplete (M8), accessibility + shortcuts polish (M11), and authoring lint (M3). Each is a day or less and immediately felt.


> **Closed.** This board was never triaged in place because the work went straight into releases. As of 0.6.7 every minor and major item here has shipped: serve and watch, schema validation, lint, print and PDF, figure and math blocks, copy-for-agent controls, kind starters, $schema autocomplete, footnotes and citations, accessibility polish, tests and CI, the MCP server, catalog and publish, the block editor, plugins, chart blocks, structural diff, the trust layer, multi-format export, and Theme Studio. Kept as a record of the 0.5 to 0.6 arc.
