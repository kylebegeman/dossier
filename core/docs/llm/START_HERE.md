# Start here

Dossier core is a Go module that turns one JSON model into one self-contained
HTML artifact and exposes a catalog of doors to agents. Read `../../AGENTS.md`
for the layout map and rules, and
`../../../docs/product/rebuild/dossier-0-7-rebuild-plan.md` for the milestones.

## Route by task

| Task | Read |
| --- | --- |
| Author or validate a document | `internal/schema/dossier.model.schema.json`, then `internal/kinds/presets/` for the kind's facets |
| Add or change a kind | `internal/kinds/kinds.go` and one preset JSON, checked by `internal/schema/dossier.kind.schema.json`; add a test in `kinds_test.go`, then `make generate` for the skill |
| Load custom kinds | `internal/kinds/registry.go` (`--kinds DIR`, `DOSSIER_KINDS`); an example kind is `examples/kinds/retro.kind.json` |
| Change how readers decide or reply | `internal/decisions` (rules, grammar, documents); the reader's `reply` and `words` functions in `internal/render/assets/reader.js`; shared cases for both in `testdata/replies.json`, run by `../packages/react` |
| Change how the page renders | `internal/render/document.templ` and `internal/render/render.go`; run `make generate` |
| Change the look | `internal/render/assets/tokens.css`; the budget test in `render_test.go` fails past 30 KB |
| Change reader behavior | `internal/render/assets/reader.js`; budget 20 KB |
| Add a part type | `internal/model/model.go` (struct, `PartTypes`, `checkPart`), the schema, `internal/render/render.go` and `document.templ`, styles in `tokens.css`, and the Markdown rendition in `internal/render/markdown.go` |
| Change how diagrams render | `internal/diagram` (Graphviz, SVG restyle, Mermaid translation, goldens in `testdata/diagrams`); the vendored library changes only through `scripts/graphviz` |
| Change the accent palette | `internal/theme`; the studio preview uses the same derivation |
| Change the showcase | `examples/*.dossier.json`; `TestExamples` in `internal/doors/examples_test.go` holds each to no warnings and its goldens in `testdata/examples` |
| Change how a 0.6 block imports | `internal/model/alias.go`; goldens in `testdata/legacy/*.upgraded.json` (`UPDATE_GOLDEN=1 go test ./internal/model/`) |
| Add a door (CLI, MCP, skill) | one file in `internal/doors/`, one entry in `catalog.json` (parameters schema, `positional`, `surfaces`), one test; then `make generate` for the skill |
| Change what the skill says | `internal/doors/skill.go`; `make generate` rewrites `skill/SKILL.md` |
| Serve tools to an agent | `dossier mcp` (stdio); conformance test in `internal/doors/mcp_test.go` |
| Change the studio | `internal/serve` (handlers in `api.go`, island in `assets/`); tests start a real server in `serve_test.go` |
| Change the studio's JSON editor | `scripts/codemirror` (lockfile, entry, build script) writes `internal/serve/assets/vendor/codemirror.js` and its hash |
| Change what the studio stores | a new migration in `internal/store/migrations`, queries in `internal/store/queries`, then `make generate` |
| Change the React wrapper | `../packages/react/src`; `npm test` there builds the binary and renders through it |
| Change what a release ships | `internal/release`; `make dist-check` dry-runs everything, third-party notices included |
| Release a version | "Releasing a version" in `../docs/product/rebuild/cutover.md`; a `v*` tag runs `../.github/workflows/release.yml` |
| Verify a change | `make check` |

## Commands

```sh
make generate        # templ, sqlc, skill/SKILL.md, and the React package's model types
make check           # generate, vet, staticcheck, errcheck, race tests, CGO-free build
go run ./cmd/dossier build examples/*.dossier.json --md --out /tmp/showcase   # the showcase, with Markdown
go run ./cmd/dossier validate FILE.dossier.json --json
go run ./cmd/dossier init brainstorm --title "My brainstorm"   # a starter model
go run ./cmd/dossier mcp                                      # MCP over stdio until the client closes
go run ./cmd/dossier serve examples/tide-aware-cancellations.dossier.json --port 0   # the studio on a verdict kind
go run ./cmd/dossier --kinds examples/kinds describe --json                          # built-in kinds plus a custom one
make dist-check                                                # cross-compile and dry-run npm, Homebrew, archives
go run ./cmd/dossier build testdata/legacy/showcase.dossier.json --out /tmp/out   # a 0.6 file, warnings only
UPDATE_GOLDEN=1 go test ./internal/render/ ./internal/model/ ./internal/diagram/   # after a deliberate render, import, or diagram change
UPDATE_GOLDEN=1 go test ./internal/doors/ -run TestExamples                       # after a deliberate change to the showcase output
```

## Source of truth

- model types and structure rules: `internal/model/model.go`
- schema: `internal/schema/dossier.model.schema.json`
- kinds: `internal/kinds/presets/*.json`, schema `internal/schema/dossier.kind.schema.json`
- replies and decisions documents: `internal/decisions`
- doors and envelope: `internal/doors/doors.go`, `internal/doors/catalog.json`; the envelope schema is `internal/schema/dossier.result.schema.json`
- the skill: generated `skill/SKILL.md` from `internal/doors/skill.go`
- fixtures: `examples/` (the showcase), goldens in `testdata/`
