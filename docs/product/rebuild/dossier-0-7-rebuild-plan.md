---
title: "Dossier 0.7 rebuild plan"
slug: "dossier-0-7-rebuild-plan"
status: "accepted"
updated: "2026-09-16"
---

# Dossier 0.7 rebuild plan

Decided 2026-09-16. Dossier 0.7 is a from-scratch rebuild of the core in Go,
following the kore conventions and shaped like corbelo. All twelve moves from
the 0.7 brainstorm are in scope. The Node tree in `src/` keeps shipping,
untouched, until every example builds through the new core. Then it is deleted.

Companion documents: the brainstorm
(`docs/scratchpad/dossier-0-7-brainstorm.html`) states the moves and the five
concepts; kore's `docs/conventions.md` is the stack rulebook; corbelo's
`internal/doors` is the reference for the agent surface.

## Goals, in priority order

1. **Performance.** One CGO-free static binary. Building a document is a
   sub-second, in-memory operation. Artifact budgets are tests: reader
   runtime at most 20 KB, base stylesheet at most 30 KB, a typical document
   under 120 KB with zero external assets by default.
2. **Stability.** Strict decoding (unknown fields rejected), machine-validated
   JSON Schemas, typed kinds, golden tests over every example, `go test -race`,
   staticcheck and errcheck, generated output committed and drift-checked.
3. **Ergonomics for agents.** One command catalog projects to the CLI, the MCP
   server, and the skill, all answering one result envelope. The skill teaches
   six kinds and a facet vocabulary, not forty-three blocks.
4. **Ergonomics for readers.** The front door shell: four controls, a sticky
   left contents column, fixed facets, a generated summary table, a pick block
   that writes the reply.
5. **A path to self-hosting.** Serve mode uses the same stack a multi-user
   server would (stdlib router, SQLite, goose, sqlc), so the server is an
   extension, not a rewrite.

## Stack

- Go 1.26, module `dossier`, stdlib `flag` and `net/http`.
- `github.com/a-h/templ` for HTML, generated `*_templ.go` committed.
- `github.com/yuin/goldmark` for markdown in prose and facets.
- `github.com/alecthomas/chroma/v2` for build-time syntax highlighting.
- `github.com/santhosh-tekuri/jsonschema/v6` for schema validation.
- `modernc.org/sqlite`, `pressly/goose`, `sqlc` for serve and the future server.
- The official Go MCP SDK for the `mcp` door, stdio transport.
- Diagrams: Graphviz through a wasm binding when adopted; Mermaid stays a
  browser-side optional. Math is deferred (no mature pure-Go renderer).
- Tools pinned with `go.mod` `tool` directives. `make check` is the one verdict.

Not adopted from kore: the composer, registry, plugin machinery, and
hand-written contract validators. Dossier is a standalone module. Kore stays a
convention reference and, when self-hosting needs auth or teams, a source of
copy-in capabilities.

## Layout of `core/`

```
core/
  go.mod                      module dossier
  Makefile                    generate, check, build
  AGENTS.md                   layout map, rules by reference, islands policy
  cmd/dossier/main.go         CLI entry; every subcommand is a door
  internal/model/             types, strict decode, ids, old-type aliases
  internal/schema/            embedded JSON Schemas and validation
  internal/kinds/             kind presets as embedded JSON, plus loading
  internal/render/            templ components, markdown, highlighting
  internal/render/assets/     tokens.css, reader.js, embedded
  internal/decisions/         decisions document read, write, merge
  internal/doors/             catalog.json, envelope, one file per door
  internal/serve/             local studio: mux, watch, rebuild, SQLite
  skill/                      SKILL.md generated from the catalog
  docs/llm/                   START_HERE.md, playbooks, capability cards
  testdata/                   golden outputs for the examples
```

## The model: five concepts

```json
{
  "dossier": "1.0",
  "kind": "brainstorm",
  "meta": { "title": "…", "slug": "…", "updated": "2026-09-16", "status": "for-decision" },
  "sections": [
    { "id": "thesis", "type": "prose", "title": "…", "markdown": "…" },
    { "id": "moves", "type": "board", "title": "…", "summary": true,
      "items": [
        { "id": "shell-reset", "title": "Shell reset", "summary": "…",
          "size": "minor", "effort": "M", "impact": 5, "dependsOn": [],
          "facets": [ { "label": "How it works", "markdown": "…" } ] }
      ] }
  ],
  "decisions": { "path": null, "picked": [], "notes": {} }
}
```

- **Kind** names the section order, the facet labels, whether items are
  numbered, which fields feed the summary table, and what the pick block says.
- **Section** is content: prose, table, code, figure, diagram, chart, callout,
  or board. Sections hold no state.
- **Item** is a numbered thing in a board. Number comes from order. Size,
  effort, impact, and dependsOn are optional per kind.
- **Facet** is a labeled markdown body on an item, validated against the
  kind's fixed order. Risk and Note facets render with the risk color.
- **Decision** is the only state: path, picked ids, notes by id, verdicts by
  id where the kind allows them.

Old block type names from 0.6 (`review-board`, `process-board`,
`finding-list`, `cycle-board`, `evidence-log`, `verification-run`,
`trust-report`, `process-receipt`, `patch-set`, `diff-view`,
`release-checklist`, `verdict-gate`, and the rest) are accepted as aliases
with a deprecation warning and mapped onto the five concepts. 0.8 removes the
aliases.

## Kinds shipped

`brainstorm`, `plan`, `review`, `release`, `incident`, `brief`. Each is a
JSON preset under 40 lines: sections expected, item facets in order, numbered
or not, summary fields, verdict options, pick text. Custom kinds load from a
directory or a pack.

## The artifact

One HTML file: inlined tokens and component CSS, the reader runtime assembled
from only the modules the document needs, the model embedded as
`<script type="application/json" id="dossier-model">`, no external requests.
Web fonts are opt-in with `meta.fonts: "google"`. Print stylesheet included.
Light is the base theme, dark is tuned separately, and the toggle stamps
`data-theme` so an explicit choice wins over the system in both directions.

Reader runtime modules: contents and scroll spy, search, theme, collapse,
copy, decisions (picks, notes, verdicts), pick block, export of the decisions
document. Nothing that edits the document ships in the file.

## Doors

Catalog `dossier.doors/v1`, envelope `dossier.result/v1` with
`outcome: ok | findings | error`. Every door is one Go file, one catalog
entry, one test. Surfaces: `cli`, `mcp`, `skill`.

| Door | Purpose |
|---|---|
| `describe` | Print the catalog, kinds, and facet vocabularies. |
| `init` | Write a starter model for a kind. |
| `validate` | Strict decode, schema, kind rules, link and id checks. |
| `build` | Render one or more models to HTML, optional Markdown. |
| `decisions read` | Read the decisions document or the model's decisions. |
| `decisions apply` | Merge a decisions document into a model. |
| `serve` | Local studio with watch, rebuild, and editing tools. |
| `mcp` | Serve the catalog's mcp-surfaced doors over stdio. |

`SKILL.md` is generated from the catalog and a test fails on drift.

## Two output files

`slug.html` is the artifact. `slug.dossier.json` is the model with decisions
merged in. `slug.decisions.md` is the reader's decisions as Markdown with
JSON front matter. Source, state, merged, handoff, prompt, and digest exports
do not exist as separate names.

## Serve and the server

`dossier serve` starts a stdlib server on loopback, watches the model file,
rebuilds on change, and injects the studio bundle: in-place text editing, item
reorder, evidence attachment, accent preview, CodeMirror. Decisions and drafts
persist in a SQLite file beside the model, through goose migrations and sqlc
queries, so the same store serves a hosted deployment later. Sessions, auth,
and teams arrive as kore capabilities when self-hosting is real work, not
before.

## Parity and cutover

The eight examples plus the process scope and release dossiers are the
fixtures. Each is aliased into the new model, built through the new core, and
compared against a golden output committed under `testdata/`. Cutover
criteria: every fixture builds with zero warnings other than alias
deprecations, budgets pass, the React package wraps the new output, Homebrew
and npm ship the binary, and the README opens with one prompt and one
screenshot. Then `src/`, `mcp/server.mjs`, and the old schemas are deleted.

## Milestones

| M | Deliverable | Verification |
|---|---|---|
| M0 | This plan, `core/` skeleton, `AGENTS.md`, `Makefile`, `docs/llm`. | `make check` runs green on an empty module. |
| M1 | Model, strict decode, schemas, kinds, aliases, `validate` door. | Unit tests; every example validates through aliases. |
| M2 | Renderer for prose, table, callout, code, and board with facets; tokens and reader runtime; `build` door. The 0.7 brainstorm builds from JSON. | Golden test; budget tests; accessibility audit of output. |
| M3 | Decisions: pick block, reader export, `decisions read` and `apply`. | Round trip test: build, decide, apply, rebuild. |
| M4 | Remaining sections: figure, diagram, chart, and the alias mappings for every 0.6 block family. | All fixtures build; goldens committed. |
| M5 | Doors complete: `describe`, `init`, `mcp`, generated skill, envelope schema. | MCP conformance test over stdio; skill drift test. |
| M6 | Serve studio with SQLite store; React wrapper; distribution; cutover. | Manual QA guide; Homebrew and npm dry runs; delete `src/`. |

## Status, 2026-09-16

- M0 done: `core/` module, `AGENTS.md`, `Makefile`, `docs/llm/START_HERE.md`, `make check` green.
- M1 mostly done: model, strict decode, schema, kind rules with facet order, `validate` door with findings. Aliases for 0.6 block names are not started.
- M2 mostly done: prose, spec, table, callout, code, and boards with facets, summary table, contents groups, facts tile, theme toggle, pick block with local picks; `build` door. The 0.7 brainstorm builds from `core/examples/dossier-0-7-brainstorm.dossier.json` in about 2 ms to a 94 KB artifact with zero external requests. Syntax highlighting is not wired yet.
- M3 done: `internal/decisions` (dossier.decisions/v1 in Markdown and JSON, the reply line, a reply parser, apply with findings), `decisions read` and `decisions apply` doors, decided state rendered into the artifact, reader notes and copy-as-JSON. Round trip covered by a doors test: apply a reply, build, read back, apply the written document to a fresh model.
- M4 done: `figure`, `diagram`, and `chart` parts; chroma highlighting for code parts and fenced code in markdown with a hand-written token theme; relative figure paths inlined at build time; rows boards fold their facets. `internal/model/alias.go` rewrites any 0.6 document onto the model with a warning per aliased block, and the five remaining presets (`plan`, `review`, `release`, `incident`, `brief`) ship as permissive kinds so imported documents have a home. The seventeen fixtures under `core/testdata/legacy` build with outcome `ok`, warnings only; their upgraded models and the showcase HTML are goldens.
- Decided in M4: diagrams emit DOT or Mermaid source under a format label until a wasm Graphviz is adopted as its own decision; `math` imports as a latex code part; the permissive presets get their facet vocabularies in M5 with the skill.
- M5 done: `init` writes a validated starter for any kind; `dossier.result/v1` is an embedded schema checked on every envelope the door tests produce; catalog entries carry their positional parameters; `mcp` serves the mcp-surfaced commands as tools over stdio with the official Go SDK, tested in memory and against the built binary; `skill` generates `core/skill/SKILL.md` from the catalog and the presets, with a drift test and a `make generate` hook.
- M6 done except deleting the 0.6 tree and publishing, which wait for Kyle: `serve` with the studio island over a kore-style SQLite store (goose, sqlc); `upgrade`, `render`, and `types` doors; the React wrapper in `packages/react` with generated model types; reproducible release builds with npm, Homebrew, and archive dry runs in `make dist-check`; the README with one prompt and one screenshot; `manual-qa-0-7.md` and `cutover.md` beside this plan.
- Deferred in M6: CodeMirror in the studio (the Model JSON editor is a textarea with server validation, because CodeMirror would mean vendoring a bundle into the Go module), and evidence attachment (0.7 has no evidence concept; facets carry it and the studio edits them).
- Next: cutover per `cutover.md` when Kyle says go.

## Content rules

Effort is agent time, never calendar time: `S` is under an hour, `M` a few
hours with review, `L` a day or more across sessions. Documents are concise
by default: one-sentence summaries, two- or three-sentence facets, with
character limits carried by each kind and reported as warnings. Detail sits
behind a fold; items open collapsed.

## Non-goals for 0.7

Math rendering, DOCX export, hosted multi-user auth, Monaco, plugin runtime
JavaScript, and any block that does not map onto the five concepts.
