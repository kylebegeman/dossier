---
title: "Release 0.6.6 Evidence"
slug: "release-0-6-6"
status: "ready"
updated: "2026-06-30T16:04:29.422Z"
---
# Release 0.6.6

Evidence collected for changes from v0.6.5 to 7e59b95.

**0.6.6** Version · **1** Commits · **43** Changed files · **8** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.6
- [x] Git HEAD resolved (required), 7e59b9543ce5513c83c6b5ac9800b7c7fa9fb531
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 1 commit(s) from v0.6.5..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z --skin console-slate, npm run site, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public
- [x] npm package dry run recorded, npm pack command listed in verification checks.

## Verification evidence

Commands that completed before this evidence dossier was collected.

### npm test (passed)

```sh
npm test
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json (passed)

```sh
node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json (passed)

```sh
node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z --skin console-slate (passed)

```sh
node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z --skin console-slate
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### npm run site (passed)

```sh
npm run site
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
| 7e59b95 | Canonicalize Kyle Begeman package identity |

### Changed files

| File | Status |
| --- | --- |
| README.md | changed |
| docs/product/process-dossiers/process-dossiers-scope.dossier.json | changed |
| docs/product/process-dossiers/process-dossiers-scope.html | changed |
| docs/releases/0.6.2.dossier.json | changed |
| docs/releases/release-0-6-2.html | changed |
| docs/releases/release-0-6-2.md | changed |
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
| mcp/server.mjs | changed |
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

7e59b9543ce5513c83c6b5ac9800b7c7fa9fb531

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.5..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  7e59b9543ce5513c83c6b5ac9800b7c7fa9fb531
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z --skin console-slate, npm run site, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public

### Claims

- **Release evidence was collected from 7e59b95.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, node-bin-dossier-mjs-build-examples-dossier-json-docs-product-pr, node-bin-dossier-mjs-workspace-index-examples-updated-2026-06-29, npm-run-site, cd-react-npx-tsc-noemit, npm-pack-dry-run-json, npm-publish-dry-run-access-public

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-06-30T16:04:29.422Z
- **Changed files:** README.md, docs/product/process-dossiers/process-dossiers-scope.dossier.json, docs/product/process-dossiers/process-dossiers-scope.html, docs/releases/0.6.2.dossier.json, docs/releases/release-0-6-2.html, docs/releases/release-0-6-2.md, examples/engineering-release.dossier.json, examples/engineering-release.html, examples/implementation-packet.dossier.json, examples/implementation-packet.html, examples/incident-response.dossier.json, examples/incident-response.html, examples/product-launch.dossier.json, examples/product-launch.html, examples/research-brief.dossier.json, examples/research-brief.html, examples/showcase.dossier.json, examples/showcase.html, examples/showcase.md, mcp/server.mjs, package-lock.json, package.json, schema/dossier.schema.json, schema/packets/closeout.schema.json, schema/packets/diff-review.schema.json, schema/packets/edits.schema.json, schema/packets/patch-review.schema.json, schema/packets/process.schema.json, schema/packets/release.schema.json, schema/packets/verdicts.schema.json, skill/SKILL.md, src/starters/adr.dossier.json, src/starters/debug.dossier.json, src/starters/dossier.dossier.json, src/starters/implementation.dossier.json, src/starters/incident.dossier.json, src/starters/integration-loop.dossier.json, src/starters/plan.dossier.json, src/starters/postmortem.dossier.json, src/starters/release.dossier.json, src/starters/review-board.dossier.json, src/starters/review.dossier.json, src/starters/runbook.dossier.json
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs workspace index examples --updated 2026-06-29T00:00:00.000Z --skin console-slate, npm run site, cd react && npx tsc --noEmit, npm pack --dry-run --json, npm publish --dry-run --access public
