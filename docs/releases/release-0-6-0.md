---
title: "Release 0.6.0 Evidence"
slug: "release-0-6-0"
status: "ready"
updated: "2026-06-29T00:00:00.000Z"
---
# Release 0.6.0

Evidence collected for changes from v0.5.5 to e5ed2f7.

**0.6.0** Version · **6** Commits · **21** Changed files · **5** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.0
- [x] Git HEAD resolved (required), e5ed2f704edf3411eb6c293146639d6a2d0bf319
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 6 commit(s) from v0.5.5..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs workspace index examples, npm pack --dry-run --json
- [x] npm package dry run recorded, npm pack command listed in verification checks.

## Verification evidence

Commands that completed before this evidence dossier was collected.

### npm test (passed)

```sh
npm test
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json (passed)

```sh
node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json (passed)

```sh
node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs workspace index examples (passed)

```sh
node bin/dossier.mjs workspace index examples
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
| e5ed2f7 | Bump version to 0.6.0 |
| 0614116 | Compact workspace status summaries |
| 4f13cde | Document packs workspaces and release automation |
| 24405d1 | Add release evidence automation |
| 1386f3f | Add multi-dossier workspace support |
| fdb164d | Add trusted dossier pack registry |

### Changed files

| File | Status |
| --- | --- |
| .github/workflows/ci.yml | changed |
| .github/workflows/release-evidence.yml | changed |
| README.md | changed |
| bin/dossier.mjs | changed |
| examples/dossier.workspace.json | changed |
| examples/packs/engineering/dossier.pack.json | changed |
| examples/packs/engineering/plugins/signal-banner.plugin.mjs | changed |
| examples/packs/engineering/templates/implementation-closeout.dossier.json | changed |
| examples/packs/engineering/templates/security-review.dossier.json | changed |
| examples/workspace-index.dossier.json | changed |
| examples/workspace-index.html | changed |
| examples/workspace-index.md | changed |
| package-lock.json | changed |
| package.json | changed |
| skill/SKILL.md | changed |
| skill/references/blocks.md | changed |
| src/index.mjs | changed |
| src/packs.mjs | changed |
| src/release.mjs | changed |
| src/workspace.mjs | changed |
| test/dossier.test.mjs | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

e5ed2f704edf3411eb6c293146639d6a2d0bf319

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.5.5..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  e5ed2f704edf3411eb6c293146639d6a2d0bf319
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs workspace index examples, npm pack --dry-run --json

### Claims

- **Release evidence was collected from e5ed2f7.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, node-bin-dossier-mjs-build-examples-dossier-json-docs-product-pr, node-bin-dossier-mjs-workspace-index-examples, npm-pack-dry-run-json

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-29T00:00:00.000Z
- **Changed files:** .github/workflows/ci.yml, .github/workflows/release-evidence.yml, README.md, bin/dossier.mjs, examples/dossier.workspace.json, examples/packs/engineering/dossier.pack.json, examples/packs/engineering/plugins/signal-banner.plugin.mjs, examples/packs/engineering/templates/implementation-closeout.dossier.json, examples/packs/engineering/templates/security-review.dossier.json, examples/workspace-index.dossier.json, examples/workspace-index.html, examples/workspace-index.md, package-lock.json, package.json, skill/SKILL.md, skill/references/blocks.md, src/index.mjs, src/packs.mjs, src/release.mjs, src/workspace.mjs, test/dossier.test.mjs
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json, node bin/dossier.mjs workspace index examples, npm pack --dry-run --json
