---
title: "Dossier 0.7 cutover"
slug: "cutover"
status: "current"
updated: "2026-09-16"
---

# Dossier 0.7 cutover

What stands between the rebuilt core and deleting the 0.6 tree, and the exact
steps when Kyle says go. Deleting and publishing are deliberately not done.

## Criteria

| Criterion from the plan | Status |
| --- | --- |
| Every fixture builds with zero warnings other than alias deprecations | Met. `core/testdata/legacy` holds the eight examples, the process scope, and the eight release dossiers; conciseness advice skips upgraded documents. |
| Budgets pass | Met. Reader 12 KB of 20, stylesheet 20 KB of 30, reference artifact 95 KB of 120. |
| The React package wraps the new output | Met. `packages/react` is `@kylebegeman/dossier-react` 0.7.0. |
| Homebrew and npm ship the binary | Packaged and dry-run with `make dist-check`. Not published. |
| The README opens with one prompt and one screenshot | Met. |

## Steps at cutover

1. **Delete the 0.6 tree.** `src/`, `bin/`, `mcp/`, `schema/`, `test/`,
   `scripts/build-site.mjs`, the root `package.json` and `package-lock.json`,
   the old `react/`, the root `skill/` (replaced by `core/skill/SKILL.md`),
   `examples/plugins/`, `examples/packs/`, and `docs/assets/showcase.png`.
2. **Retire the 0.6 workflows.** `.github/workflows/ci.yml`, `pages.yml`, and
   `release-evidence.yml` run the Node tree. `core.yml` replaces the first;
   the Pages site and release evidence need a decision, below.
3. **Upgrade the examples.** Run `dossier upgrade examples/*.dossier.json` and
   delete the generated 0.6 `.html` and `.md` beside them. Leave
   `docs/releases/*.dossier.json` as history; they build through the aliases
   until 0.8.
4. **Point docs at the new tree.** `docs/product/public-manual-qa.md` and
   `docs/product/process-dossiers/` describe 0.6; replace the first with
   `manual-qa-0-7.md` and archive the second. `docs/scratchpad/` scripts that
   import `src/` go with it.
5. **Publish.** Tag `v0.7.0` and push. Create the GitHub release with every
   archive and `checksums.txt` from `make dist`. Publish the six platform npm
   packages, then `@kylebegeman/dossier`, then `@kylebegeman/dossier-react`.
   Copy `dist/homebrew/dossier.rb` into the `kylebegeman/homebrew-tap`
   repository.

## Decisions still open

- **Pages site.** The live demo builds from `src/`. Rebuild it from
  `dossier build`, or drop it and let the README screenshot carry the page.
- **Git remote.** None is configured; nothing has been pushed.
- **Facet vocabularies.** `plan`, `review`, `release`, `incident`, and `brief`
  accept any labels until their vocabularies are designed.
- **Diagrams.** DOT and Mermaid render as source. Graphviz through wasm is a
  separate adoption.
- **Studio editor.** The Model JSON editor is a textarea with server
  validation. CodeMirror would mean vendoring a JavaScript bundle into the Go
  module, which the no-Node rule forbids today.
