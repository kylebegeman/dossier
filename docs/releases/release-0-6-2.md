---
title: "Release 0.6.2 Evidence"
slug: "release-0-6-2"
status: "ready"
updated: "2026-06-30T15:07:49.000Z"
---
# Release 0.6.2

Evidence collected for changes from v0.6.1 to f530f1e.

**0.6.2** Version · **2** Commits · **7** Changed files · **9** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.2
- [x] Git HEAD resolved (required), f530f1e4e14233f6c6963c1e667dd5ae4ecc4646
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 2 commit(s) from v0.6.1..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public, brew install --build-from-source kylebegeman/tap/dossier, brew test kylebegeman/tap/dossier, brew audit --strict --formula kylebegeman/tap/dossier
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

### npm publish --dry-run --access public (passed)

```sh
npm publish --dry-run --access public
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### brew install --build-from-source kylebegeman/tap/dossier (passed)

```sh
brew install --build-from-source kylebegeman/tap/dossier
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### brew test kylebegeman/tap/dossier (passed)

```sh
brew test kylebegeman/tap/dossier
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### brew audit --strict --formula kylebegeman/tap/dossier (passed)

```sh
brew audit --strict --formula kylebegeman/tap/dossier
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.


### Commits

| Commit | Summary |
| --- | --- |
| f530f1e | Add 0.6.2 release evidence |
| cb4c99c | Prepare package manager distribution |

### Changed files

| File | Status |
| --- | --- |
| README.md | changed |
| docs/releases/0.6.2.dossier.json | changed |
| docs/releases/release-0-6-2.html | changed |
| docs/releases/release-0-6-2.md | changed |
| examples/showcase.html | changed |
| package-lock.json | changed |
| package.json | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

f530f1e4e14233f6c6963c1e667dd5ae4ecc4646

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.1..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  f530f1e4e14233f6c6963c1e667dd5ae4ecc4646
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public, brew install --build-from-source kylebegeman/tap/dossier, brew test kylebegeman/tap/dossier, brew audit --strict --formula kylebegeman/tap/dossier

### Claims

- **Release evidence was collected from f530f1e.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, node-bin-dossier-mjs-build-examples-dossier-json-docs-product-pr, cd-react-npx-tsc-noemit, npm-pack-dry-run-json, npm-publish-dry-run-access-public, brew-install-build-from-source-kylebegeman-dossier-dossier, brew-test-kylebegeman-dossier-dossier, brew-audit-strict-formula-kylebegeman-dossier-dossier

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-30T15:07:49.000Z
- **Changed files:** README.md, docs/releases/0.6.2.dossier.json, docs/releases/release-0-6-2.html, docs/releases/release-0-6-2.md, examples/showcase.html, package-lock.json, package.json
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public, brew install --build-from-source kylebegeman/tap/dossier, brew test kylebegeman/tap/dossier, brew audit --strict --formula kylebegeman/tap/dossier
