---
title: "Release 0.6.5 Evidence"
slug: "release-0-6-5"
status: "ready"
updated: "2026-06-30T15:37:48.000Z"
---
# Release 0.6.5

Evidence collected for changes from v0.6.4 to f495026.

**0.6.5** Version · **1** Commits · **39** Changed files · **5** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.5
- [x] Git HEAD resolved (required), f4950261bfb8b916d5bb88662cca3efc0a0658ec
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 1 commit(s) from v0.6.4..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json docs/releases/0.6.2.dossier.json docs/releases/0.6.3.dossier.json docs/releases/0.6.4.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public
- [x] npm package dry run recorded, npm pack command listed in verification checks.

## Verification evidence

Commands that completed before this evidence dossier was collected.

### npm test (passed)

```sh
npm test
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json docs/releases/0.6.2.dossier.json docs/releases/0.6.3.dossier.json docs/releases/0.6.4.dossier.json (passed)

```sh
node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json docs/releases/0.6.2.dossier.json docs/releases/0.6.3.dossier.json docs/releases/0.6.4.dossier.json
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


### Commits

| Commit | Summary |
| --- | --- |
| f495026 | Correct package manager URL ownership split |

### Changed files

| File | Status |
| --- | --- |
| README.md | changed |
| docs/product/process-dossiers/process-dossiers-scope.dossier.json | changed |
| docs/product/process-dossiers/process-dossiers-scope.html | changed |
| examples/engineering-release.dossier.json | changed |
| examples/engineering-release.html | changed |
| examples/implementation-packet.dossier.json | changed |
| examples/implementation-packet.html | changed |
| examples/incident-response.dossier.json | changed |
| examples/incident-response.html | changed |
| examples/product-launch.dossier.json | changed |
| examples/product-launch.html | changed |
| examples/research-brief.dossier.json | changed |
| examples/research-brief.html | changed |
| examples/showcase.dossier.json | changed |
| examples/showcase.html | changed |
| examples/showcase.md | changed |
| package-lock.json | changed |
| package.json | changed |
| schema/dossier.schema.json | changed |
| schema/packets/closeout.schema.json | changed |
| schema/packets/diff-review.schema.json | changed |
| schema/packets/edits.schema.json | changed |
| schema/packets/patch-review.schema.json | changed |
| schema/packets/process.schema.json | changed |
| schema/packets/release.schema.json | changed |
| schema/packets/verdicts.schema.json | changed |
| skill/SKILL.md | changed |
| src/starters/adr.dossier.json | changed |
| src/starters/debug.dossier.json | changed |
| src/starters/dossier.dossier.json | changed |
| src/starters/implementation.dossier.json | changed |
| src/starters/incident.dossier.json | changed |
| src/starters/integration-loop.dossier.json | changed |
| src/starters/plan.dossier.json | changed |
| src/starters/postmortem.dossier.json | changed |
| src/starters/release.dossier.json | changed |
| src/starters/review-board.dossier.json | changed |
| src/starters/review.dossier.json | changed |
| src/starters/runbook.dossier.json | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

f4950261bfb8b916d5bb88662cca3efc0a0658ec

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.4..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  f4950261bfb8b916d5bb88662cca3efc0a0658ec
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json docs/releases/0.6.2.dossier.json docs/releases/0.6.3.dossier.json docs/releases/0.6.4.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public

### Claims

- **Release evidence was collected from f495026.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, cd-react-npx-tsc-noemit, npm-pack-dry-run-json, npm-publish-dry-run-access-public

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-30T15:37:48.000Z
- **Changed files:** README.md, docs/product/process-dossiers/process-dossiers-scope.dossier.json, docs/product/process-dossiers/process-dossiers-scope.html, examples/engineering-release.dossier.json, examples/engineering-release.html, examples/implementation-packet.dossier.json, examples/implementation-packet.html, examples/incident-response.dossier.json, examples/incident-response.html, examples/product-launch.dossier.json, examples/product-launch.html, examples/research-brief.dossier.json, examples/research-brief.html, examples/showcase.dossier.json, examples/showcase.html, examples/showcase.md, package-lock.json, package.json, schema/dossier.schema.json, schema/packets/closeout.schema.json, schema/packets/diff-review.schema.json, schema/packets/edits.schema.json, schema/packets/patch-review.schema.json, schema/packets/process.schema.json, schema/packets/release.schema.json, schema/packets/verdicts.schema.json, skill/SKILL.md, src/starters/adr.dossier.json, src/starters/debug.dossier.json, src/starters/dossier.dossier.json, src/starters/implementation.dossier.json, src/starters/incident.dossier.json, src/starters/integration-loop.dossier.json, src/starters/plan.dossier.json, src/starters/postmortem.dossier.json, src/starters/release.dossier.json, src/starters/review-board.dossier.json, src/starters/review.dossier.json, src/starters/runbook.dossier.json
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/0.6.0.dossier.json docs/releases/0.6.1.dossier.json docs/releases/0.6.2.dossier.json docs/releases/0.6.3.dossier.json docs/releases/0.6.4.dossier.json, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public
