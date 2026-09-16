---
title: "Release 0.6.3 Evidence"
slug: "release-0-6-3"
status: "ready"
updated: "2026-06-30T15:21:19.000Z"
---
# Release 0.6.3

Evidence collected for changes from v0.6.2 to bc9a9df.

**0.6.3** Version · **1** Commits · **3** Changed files · **3** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.3
- [x] Git HEAD resolved (required), bc9a9dfb0207232d68952fa650bf9337a3866936
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 1 commit(s) from v0.6.2..HEAD
- [x] Verification commands recorded (required), npm test, npm pack --dry-run --json, npm publish --dry-run --access public
- [x] npm package dry run recorded, npm pack command listed in verification checks.

## Verification evidence

Commands that completed before this evidence dossier was collected.

### npm test (passed)

```sh
npm test
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


### Commits

| Commit | Summary |
| --- | --- |
| bc9a9df | Use conventional Homebrew tap naming |

### Changed files

| File | Status |
| --- | --- |
| README.md | changed |
| package-lock.json | changed |
| package.json | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

bc9a9dfb0207232d68952fa650bf9337a3866936

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.2..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  bc9a9dfb0207232d68952fa650bf9337a3866936
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, npm pack --dry-run --json, npm publish --dry-run --access public

### Claims

- **Release evidence was collected from bc9a9df.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, npm-pack-dry-run-json, npm-publish-dry-run-access-public

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-30T15:21:19.000Z
- **Changed files:** README.md, package-lock.json, package.json
- **Commands:** npm test, npm pack --dry-run --json, npm publish --dry-run --access public
