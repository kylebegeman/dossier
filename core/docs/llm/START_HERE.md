# Start here

Dossier core is a Go module that turns one JSON model into one self-contained
HTML artifact and exposes a catalog of doors to agents. Read `../../AGENTS.md`
for the layout map and rules, and
`../../../docs/product/rebuild/dossier-0-7-rebuild-plan.md` for the milestones.

## Route by task

| Task | Read |
| --- | --- |
| Author or validate a document | `internal/schema/dossier.model.schema.json`, then `internal/kinds/presets/` for the kind's facets |
| Add or change a kind | `internal/kinds/kinds.go` and one preset JSON; add a test in `kinds_test.go` |
| Change how the page renders | `internal/render/document.templ` and `internal/render/render.go`; run `make generate` |
| Change the look | `internal/render/assets/tokens.css`; the budget test in `render_test.go` fails past 30 KB |
| Change reader behavior | `internal/render/assets/reader.js`; budget 20 KB |
| Add a door (CLI, MCP, skill) | one file in `internal/doors/`, one entry in `catalog.json`, one test |
| Verify a change | `make check` |

## Commands

```sh
make generate        # templ
make check           # generate, vet, staticcheck, errcheck, race tests, CGO-free build
go run ./cmd/dossier build examples/dossier-0-7-brainstorm.dossier.json --out examples
go run ./cmd/dossier validate FILE.dossier.json --json
```

## Source of truth

- model types and structure rules: `internal/model/model.go`
- schema: `internal/schema/dossier.model.schema.json`
- kinds: `internal/kinds/presets/*.json`
- doors and envelope: `internal/doors/doors.go`, `internal/doors/catalog.json`
- fixtures: `examples/`, goldens in `testdata/`
