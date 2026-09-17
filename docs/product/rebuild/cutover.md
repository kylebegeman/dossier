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
  `NPM_TOKEN` repository secret published those seven at 0.7.0, and the
  launcher, set up for trusted publishing since 0.6, published through it.
  After 0.7.1, which still published those seven with the token, Kyle
  added their trusted publishers as "Moving packages to trusted publishing"
  below says, and the token and its secret go.
- **Pages.** The site is the showcase: `make site` builds an index, written
  as a Dossier brief in `docs/site`, and the seven examples. The page 0.7.0
  led with, the winter crossing brainstorm, is now a test fixture and still
  builds, unlisted, so its links keep working.

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
4. **0.7.0 shipped** on 2026-09-17 (UTC): the GitHub release with six
   archives, checksums, the formula, and the release page; eight npm
   packages with provenance; and the Homebrew tap's first pull request,
   merged after its test-bot passed on macOS and Linux. An install from npm
   rendered a page.
5. **0.7.1 shipped** on 2026-09-17 (UTC) the same way, after Kyle called it:
   `release/0.7.1` passed CI, `master` moved to it, and the `v0.7.1` tag
   published the release, the eight npm packages, and the release page. The
   tap's second pull request brought the formula to 0.7.1.

## Releasing a version

1. Set the version everywhere `TestVersionsAgree` looks: `core/VERSION`,
   `Version` in `core/internal/doors/mcp.go` (as `<version>-dev`), and the
   versions in `packages/dossier/package.json` and
   `packages/react/package.json`. Keep the launcher's
   `optionalDependencies`, the React lockfile, and the tag and alt text of
   the launcher README's image in step too. Add
   `docs/releases/<version>.dossier.json` and `docs/releases/<version>.md`,
   build the release document to check it, and run `make check` and
   `make dist-check` in `core`.
2. Push to a branch, let CI pass, and fast-forward `master`.
3. Tag `v<version>` on `master` and push the tag. The release workflow does
   the rest, and a failed run can be rerun because every step skips what is
   already published.
4. Without a tap token, open a pull request on `kylebegeman/homebrew-tap`
   that replaces `Formula/dossier.rb` with the `dossier.rb` release asset;
   the tap's test-bot checks it before merge.
5. Once npm serves the new version, install the launcher and the React
   package from npm in an empty directory and render a page, and check the
   live site.

## Moving packages to trusted publishing

npm lets a package trust this repository's release workflow instead of a
token, and the npm CLI in `release.yml` uses trusted publishing first
wherever it is set up, so the steps can be taken before or between
releases. For each package still publishing with the token
(`@kylebegeman/dossier-react` and the six `@kylebegeman/dossier-<os>-<arch>`
platform packages), signed in to npmjs.com as the owner:

1. Open the package's **Settings** tab,
   `https://www.npmjs.com/package/<name>/access`.
2. Under **Trusted publishing**, choose **Select your publisher**, then
   **GitHub Actions**.
3. Enter **Organization or user** `kylebegeman`, **Repository** `dossier`,
   and **Workflow filename** `release.yml`, and leave **Environment name**
   empty. The values are case-sensitive, and `@kylebegeman/dossier` shows
   them already set.
4. Under **Allowed actions**, allow direct `npm publish`. Publishers created
   after 2026-09-03 allow only `npm stage publish` unless told otherwise,
   and the workflow runs `npm publish`.
5. Save, confirming with two-factor authentication if asked.

After the next release, `npm view <name>@<version> _npmUser.name` reads
`GitHub Actions` for every package. Then revoke the granular token under
**Access Tokens**, delete the `NPM_TOKEN` repository secret, and on each of
the eight packages choose **Settings → Publishing access → Require
two-factor authentication and disallow tokens**.
