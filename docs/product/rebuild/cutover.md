---
title: "Dossier 0.7 cutover"
slug: "cutover"
status: "done"
updated: "2026-09-16"
---

# Dossier 0.7 cutover

How the rebuilt core replaced the 0.6 tree on GitHub and shipped as 0.7.0, and
what a later release repeats. Kyle made the decisions below; Claude carried
out every step.

## Criteria

| Criterion from the plan | Status |
| --- | --- |
| Every fixture builds with zero warnings other than alias deprecations | Met. `core/testdata/legacy` holds the eight 0.6 examples, the process scope, and the eight release dossiers, and all 17 upgrade strictly onto their kinds. The seven showcase documents in `core/examples` build with no warnings at all. |
| Budgets pass | Met. Reader 19.2 KB of 20, stylesheet 29.2 KB of 30, largest showcase page under 100 KB of 120. |
| The React package wraps the new output | Met. `packages/react` is `@kylebegeman/dossier-react` 0.7.0. |
| Homebrew and npm ship the binary | Met through `.github/workflows/release.yml`, after `make dist-check` passed locally and in CI. |
| The README shows the product | Met. It leads with the page, a graphic of the loop, an animation of deciding, a strip per kind linked to the live site, and the studio. |

## Decisions

- **History.** This checkout began with `git init`, unrelated to GitHub's
  0.6 history. Its commits were replayed onto GitHub's `master` in one
  straight line: the first commit's tree was recommitted with `master` as
  its parent, and the rest were rebased onto it, so no force push was
  needed. The replay went to a `release/0.7.0` branch first so CI ran before
  `master` moved.
- **npm.** Seven of the eight packages had never been published, and npm's
  trusted publishing cannot make a first publish. A granular token in the
  `NPM_TOKEN` repository secret covers 0.7.0; afterwards the new packages
  move to trusted publishing and the token is revoked.
- **Pages.** The site is the showcase: `make site` builds an index, written
  as a Dossier brief in `docs/site`, and the seven examples.

## What changed

1. **The 0.6 tree left.** `src/`, `bin/`, `mcp/`, `schema/`, `test/`,
   `scripts/build-site.mjs`, the root `package.json` and lockfile, the old
   `react/` and `skill/`, the root `examples/` with its packs and plugins,
   the 0.6 design record, process dossiers scope, QA guide, and design lab.
   All of it stays at the `v0.6.7` tag. The root examples were removed
   rather than upgraded: their upgraded forms are the legacy fixtures, and
   `core/examples` is the showcase.
2. **Workflows.** `ci.yml` and `release-evidence.yml` are gone. `core.yml`
   is CI. `pages.yml` builds the showcase. `release.yml` publishes a version
   tag: checks, the distribution dry run, the GitHub release with archives,
   checksums, the formula, and the release page, then npm with provenance,
   and the Homebrew tap when a `HOMEBREW_TAP_TOKEN` secret exists.
3. **Docs.** `docs/product/README.md` and `docs/scratchpad/README.md` point
   at the 0.7 material, and `docs/releases/0.7.0.dossier.json` with
   `docs/releases/0.7.0.md` are the release document and notes.

## Releasing a version

1. Set `core/VERSION` and the versions in `packages/dossier/package.json`
   and `packages/react/package.json`, which a test keeps in step, and the
   tag in the launcher README's image link. Add
   `docs/releases/<version>.dossier.json` and `docs/releases/<version>.md`,
   and run `make check` and `make dist-check` in `core`.
2. Push to a branch, let CI pass, and fast-forward `master`.
3. Tag `v<version>` on `master` and push the tag. The release workflow does
   the rest, and a failed run can be rerun because every step skips what is
   already published.
4. Without a tap token, open a pull request on `kylebegeman/homebrew-tap`
   that replaces `Formula/dossier.rb` with the `dossier.rb` release asset;
   the tap's test-bot checks it before merge.
