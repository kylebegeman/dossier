# Dossier core agent guide

Dossier core turns one JSON model into one self-contained HTML artifact and
gives agents a catalog of doors (CLI, MCP, skill) over the same contracts.
The rebuild plan is `../docs/product/rebuild/dossier-0-7-rebuild-plan.md`.
Kore's `docs/conventions.md` (sibling repo `../../kore`) is the rulebook; this
module follows its toolchain, HTTP, and view rules and records divergences here.

## Layout map

- CLI entry, every subcommand is a door: `cmd/dossier`
- model types, strict decode, aliases: `internal/model`
- JSON Schemas and validation: `internal/schema`
- kind presets (embedded JSON) and kind rules: `internal/kinds`
- templ components, markdown, highlighting: `internal/render`
- embedded stylesheet and reader runtime: `internal/render/assets`
- doors, catalog, and the result envelope: `internal/doors`
- fixtures and goldens: `examples`, `testdata`

The flow is door to model to kind rules to templ render to one byte slice.

## Rules

- Tools are pinned in `go.mod` tool directives; use `go tool templ`, never an
  unpinned install. `make check` is the one verdict.
- Generated `*_templ.go` is committed. Edit the `.templ` source and regenerate.
- The artifact ships zero external requests by default. Web fonts are opt-in.
- Budgets are tests: reader runtime at most 20 KB, stylesheet at most 30 KB.
- Unknown JSON fields are errors. Old 0.6 block names are aliases with a
  deprecation warning, never silent.
- Islands policy: the artifact carries one small vanilla JS reader runtime
  (contents, theme, decisions, copy). Editing tools live only in `serve`.
- No Node dependencies in this module.

## Content rules every kind enforces

- Effort is agent time, never calendar time. `S` is under an hour, `M` a few
  hours with review, `L` a day or more across sessions. No days-of-work or
  weeks-of-work language anywhere in presets, examples, docs, or the skill.
- Concise by default. A summary is one sentence. A facet is two or three
  sentences. Kinds carry character limits and `validate` and `build` warn
  past them without blocking.
- Detail belongs behind a fold: items start collapsed, and readers expand
  what they want to read.
