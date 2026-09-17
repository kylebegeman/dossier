# Dossier core agent guide

Dossier core turns one JSON model into one self-contained HTML artifact and
gives agents a catalog of doors (CLI, MCP, skill) over the same contracts.
The rebuild plan is `../docs/product/rebuild/dossier-0-7-rebuild-plan.md`.
Kore's `docs/conventions.md` (sibling repo `../../kore`) is the rulebook; this
module follows its toolchain, HTTP, and view rules and records divergences here.

## Layout map

- CLI entry, every subcommand is a door: `cmd/dossier`
- model types, strict decode, 0.6 aliases: `internal/model`
- JSON Schemas for models, kinds, and envelopes: `internal/schema`
- kind presets (embedded JSON), kind rules, and the registry that adds
  custom `*.kind.json` kinds: `internal/kinds`
- decision rules as values, the reply grammar, and decisions documents:
  `internal/decisions`
- the one read pipeline and atomic model writer: `internal/load`
- templ components, markdown, highlighting, charts, the Markdown rendition:
  `internal/render`
- embedded stylesheet and reader runtime: `internal/render/assets`
- the accent palette derived for both themes: `internal/theme`
- diagrams: Graphviz SVG and the Mermaid flowchart translator:
  `internal/diagram`, with go-graphviz vendored and patched in
  `third_party/go-graphviz` by `scripts/graphviz`
- doors, catalog, and the result envelope: `internal/doors`
- the serve studio (handlers, watcher, island): `internal/serve`, with the
  vendored CodeMirror bundle in `internal/serve/assets/vendor`, built by
  `scripts/codemirror`
- the studio store (goose migrations, sqlc queries): `internal/store`
- release builds, dry runs, and third-party notices: `internal/release`,
  `cmd/dossier-release`, licenses in `third_party/licenses`
- the showcase, one team's document for every kind, and a custom kind:
  `examples`, `examples/kinds`
- goldens: `testdata/examples` (full builds of the showcase),
  `testdata/legacy` (0.6 imports), `testdata/diagrams` (Mermaid to DOT),
  `testdata/replies.json` (reply lines and their plain words, cases the
  React package also runs)
- outside this module: `../packages/react` (the React wrapper, whose
  `src/model.ts` this module generates) and `../packages/dossier` (the npm
  launcher the release stamps)

A build flows door to load pipeline to templ render to one byte slice. The
studio flows handler to load pipeline, store, and render, and writes the model
only through `load.WriteModel`.

## Rules

- Tools are pinned in `go.mod` tool directives; use `go tool templ`, never an
  unpinned install. `make check` is the one verdict.
- Generated output is committed: `*_templ.go`, `internal/store/db`,
  `skill/SKILL.md`, and `../packages/react/src/model.ts`. Edit the source
  (templ, migrations and queries, the catalog, a preset, or a schema), then
  `make generate`; the drift script and tests fail when output is stale.
- The data layer follows kore's conventions by reference: WAL SQLite opened
  only in `store.Open`, one writer and a reader pool, forward-only goose
  migrations applied through a provider, sqlc for every query, STRICT tables,
  and every store method taking the document id first.
- `serve` binds loopback only. Every studio API call needs the per-process
  token in `X-Dossier-Token`, a loopback Host, and a same-origin request.
- `VERSION` is the one version. The binary's default is `VERSION-dev`; release
  builds stamp `doors.Version`, and a test keeps both npm packages on it.
- `make dist` and `make dist-check` never publish. Publishing is a deliberate
  step outside this module.
- Every door is one file in `internal/doors`, one catalog entry with a
  parameter schema and its positional names, and one test. The CLI, the MCP
  server, and the skill all project from that catalog; never describe a
  command in two places.
- The artifact ships zero external requests by default. Web fonts are opt-in.
- Budgets are tests: reader runtime at most 20 KB, stylesheet at most 30 KB,
  and each showcase page at most 120 KB built.
- The showcase in `examples` is a fixture set. Every document builds with no
  findings or warnings and matches its HTML and Markdown goldens in
  `testdata/examples`; after a deliberate change, review the output and run
  `UPDATE_GOLDEN=1 go test ./internal/doors -run TestExamples`.
- Replies have one grammar in two places: `internal/decisions` parses them
  and the reader writes them, and both say a reply in the same plain words
  (`ReplyWords`, `words`). `testdata/replies.json` is written from Go and
  run by `../packages/react`'s tests, so a grammar or wording change updates
  both sides and the cases together.
- Unknown JSON fields are errors. A 0.6 document (`dossierVersion`,
  `blocks`) is rewritten onto the model by `internal/model/alias.go` before
  validation, with a warning per aliased block, never silently. A clean
  rewrite is warnings and outcome `ok`, never findings. Each 0.6 family maps
  onto its kind's fields and facets, and `dossier upgrade` writes only models
  that pass the strict checks. `testdata/legacy` is the parity set; 0.8
  removes the aliases.
- Diagrams render at build time: DOT through Graphviz compiled to wasm, and
  Mermaid flowcharts translated to DOT first. The wasm module loads lazily and
  caches its compiled form in the user cache directory, so `validate`,
  `describe`, and `render` never load it. The SVG is rebuilt from an
  allowlist and styled by the tokens; other Mermaid types keep their source
  with a warning. Change the vendored library only through
  `scripts/graphviz/vendor.sh` and its patch.
- Islands policy: the artifact carries one small vanilla JS reader runtime
  (contents, search, theme, decisions, copy, and frame messages). Editing tools live
  only in `serve`, as one studio island injected before the reader. The
  island is deliberate because the page it edits is the artifact itself; it
  holds no authority, and every write is validated by the server.
- No Node dependencies in this module. The one exception is build tooling
  outside the Go build: `scripts/codemirror` pins CodeMirror in a lockfile
  and writes a committed bundle with its SHA-256, which a test checks.

## Content rules every kind enforces

- Effort is agent time, never calendar time. `S` is under an hour, `M` a few
  hours with review, `L` a day or more across sessions. No days-of-work or
  weeks-of-work language anywhere in presets, examples, docs, or the skill.
- Concise by default. A summary is one sentence. A facet is two or three
  sentences. Kinds carry character limits and `validate` and `build` warn
  past them without blocking.
- Detail belongs behind a fold: items start collapsed, and readers expand
  what they want to read.
