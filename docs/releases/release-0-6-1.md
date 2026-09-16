---
title: "Release 0.6.1 Evidence"
slug: "release-0-6-1"
status: "ready"
updated: "2026-06-29T00:00:00.000Z"
---
# Release 0.6.1

Evidence collected for changes from v0.6.0 to 6cf6631.

**0.6.1** Version · **5** Commits · **16** Changed files · **6** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.1
- [x] Git HEAD resolved (required), 6cf66318ed4dee4a9c37d257d3ce1139bb9e98bb
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 5 commit(s) from v0.6.0..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, node bin/dossier.mjs workspace index examples, cd react && npx tsc --noEmit, npm pack --dry-run --json
- [x] npm package dry run recorded, npm pack command listed in verification checks.

## Verification evidence

Commands that completed before this evidence dossier was collected.

### npm test (passed)

```sh
npm test
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json (passed)

```sh
node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json (passed)

```sh
node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs workspace index examples (passed)

```sh
node bin/dossier.mjs workspace index examples
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### cd react && npx tsc --noEmit (passed)

```sh
cd react && npx tsc --noEmit
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### npm pack --dry-run --json (passed)

```sh
npm pack --dry-run --json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.


### Commits

| Commit | Summary |
| --- | --- |
| 6cf6631 | Use master as release branch |
| 9bd4c52 | Add 0.6.1 release evidence |
| 04f7969 | Bump version to 0.6.1 |
| bf1870b | Fix unknown pack subcommand exit |
| 9342d50 | Harden workspace and release diagnostics |

### Changed files

| File | Status |
| --- | --- |
| .github/workflows/pages.yml | changed |
| README.md | changed |
| bin/dossier.mjs | changed |
| docs/releases/0.6.1.dossier.json | changed |
| docs/releases/release-0-6-1.html | changed |
| docs/releases/release-0-6-1.md | changed |
| examples/workspace-index.dossier.json | changed |
| examples/workspace-index.html | changed |
| examples/workspace-index.md | changed |
| package-lock.json | changed |
| package.json | changed |
| skill/SKILL.md | changed |
| skill/references/blocks.md | changed |
| src/release.mjs | changed |
| src/workspace.mjs | changed |
| test/dossier.test.mjs | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

6cf66318ed4dee4a9c37d257d3ce1139bb9e98bb

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.0..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  6cf66318ed4dee4a9c37d257d3ce1139bb9e98bb
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, node bin/dossier.mjs workspace index examples, cd react && npx tsc --noEmit, npm pack --dry-run --json

### Claims

- **Release evidence was collected from 6cf6631.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, node-bin-dossier-mjs-build-examples-dossier-json-docs-product-pr, node-bin-dossier-mjs-workspace-index-examples, cd-react-npx-tsc-noemit, npm-pack-dry-run-json

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-29T00:00:00.000Z
- **Changed files:** .github/workflows/pages.yml, README.md, bin/dossier.mjs, docs/releases/0.6.1.dossier.json, docs/releases/release-0-6-1.html, docs/releases/release-0-6-1.md, examples/workspace-index.dossier.json, examples/workspace-index.html, examples/workspace-index.md, package-lock.json, package.json, skill/SKILL.md, skill/references/blocks.md, src/release.mjs, src/workspace.mjs, test/dossier.test.mjs
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, node bin/dossier.mjs workspace index examples, cd react && npx tsc --noEmit, npm pack --dry-run --json
