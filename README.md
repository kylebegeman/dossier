# Dossier

One JSON model in, one self-contained HTML page out. An agent writes the
model, a person reads the page once and picks by number, and the agent reads
the picks back.

> Brainstorm twelve moves toward a leaner Dossier, minor and major, as a dossier I can pick from by number.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dossier-0-7-dark.png">
  <img src="docs/assets/dossier-0-7-light.png" alt="The page that prompt produced: twelve moves in a numbered contents rail grouped as minor and major, with counts in the masthead and the first sections of the brainstorm." width="960">
</picture>

## Install

```sh
brew install kylebegeman/tap/dossier
```

```sh
npm install --save-dev @kylebegeman/dossier
```

Or build it from this repository with Go: `cd core && make build` writes
`core/bin/dossier`, one static binary with no runtime dependencies.

## Hand it to your agent

The binary carries its own skill and its own MCP server, both generated from
one command catalog, so they always match the version you run.

```sh
dossier skill --write ~/.claude/skills/dossier/SKILL.md
```

```sh
claude mcp add dossier -- dossier mcp
```

Any other MCP client runs `dossier mcp` over stdio.

## The loop

1. `dossier init brainstorm --title "Onboarding ideas"` writes a starter model
   with the kind's facets in place.
2. The agent fills it in and runs `dossier validate`. Findings block the
   build. Warnings, such as a summary past its length, are advice.
3. `dossier build onboarding-ideas.dossier.json` writes one HTML file beside
   the model.
4. The reader skims, opens what matters, picks, and copies a reply such as
   `1, 3, 4. Notes: 3: keep blue.`
5. `dossier decisions apply onboarding-ideas.dossier.json --reply "1, 3, 4"`
   writes the picks into the model for the next step.

`dossier describe` lists every command, and the generated
[skill](core/skill/SKILL.md) documents each one with its parameters.

## What a model holds

- **Kind** is a preset: the facets an item carries, the field vocabularies,
  the summary columns, and the pick text. Kinds are `brainstorm`, `plan`,
  `review`, `release`, `incident`, and `brief`.
- **Section** has a title and either content parts or a board. Parts are
  prose, spec, table, callout, code, figure, diagram, and chart.
- **Item** is a numbered thing on a board, with a one-sentence summary, size,
  effort, impact, and dependencies.
- **Facet** is a labeled Markdown body on an item, in the kind's order.
- **Decision** is the only state: a path, picked ids, and notes.

Effort is agent time, never calendar time: `S` is under an hour, `M` a few
hours with review, `L` a day or more across sessions.

## The page

- One file that makes no external requests. Web fonts are opt-in.
- A reader runtime under 20 KB and a stylesheet under 30 KB, held there by
  tests.
- Light and dark themes, a contents rail, collapsed items, a summary table, a
  pick block that writes the reply, and print styles.
- The model rides along as a JSON island, so an agent reads one element
  instead of scraping the page.

## The studio

```sh
dossier serve onboarding-ideas.dossier.json --open
```

A local studio for the same page: live reload when the file changes, click to
edit any text as a draft, reorder items, keep picks and notes in a SQLite
store beside the model, edit the model as JSON with validation before every
write, and preview an accent color. None of it ships in the built file.

## React

[`@kylebegeman/dossier-react`](packages/react) renders a model on the server
and shows the page in a sandboxed frame that sizes itself and reports the
reader's picks. Its model types are generated from the same JSON Schema the
binary validates with.

## Coming from 0.6

0.6 model files still validate and build, with a deprecation warning for each
old block. `dossier upgrade FILE` writes them as 0.7 models. 0.8 removes the
aliases.

## Develop

```sh
cd core
make check
```

`make check` regenerates and drift-checks the generated code, then runs gofmt,
vet, staticcheck, errcheck, the race-enabled tests, and a CGO-free build.
`make dist-check` cross-compiles every target and dry-runs the archives, the
npm packages, and the Homebrew formula without publishing anything. Agents
start at [core/AGENTS.md](core/AGENTS.md).

## License

[MIT](LICENSE)
