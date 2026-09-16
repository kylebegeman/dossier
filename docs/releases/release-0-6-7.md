---
title: "Release 0.6.7 Evidence"
slug: "release-0-6-7"
status: "ready"
updated: "2026-07-04T00:56:11.000Z"
---
# Release 0.6.7

Evidence collected for changes from v0.6.6 to 0c5919b.

**0.6.7** Version · **17** Commits · **50** Changed files · **7** Checks · **0** Dirty entries

## Release gates

- [x] Package version resolved (required), 0.6.7
- [x] Git HEAD resolved (required), 0c5919bb1d329fdbb576880003a49fd1ce49e44c
- [x] Working tree clean before evidence write (required), No git status entries before writing release evidence.
- [x] Release commits collected (required), 17 commit(s) from v0.6.6..HEAD
- [x] Verification commands recorded (required), npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json docs/scratchpad/design-lab.dossier.json docs/scratchpad/feature-brainstorm.dossier.json, npm run site, cd react && npm run typecheck, npm pack --dry-run --json, npm publish --dry-run --access public
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

### node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json docs/scratchpad/design-lab.dossier.json docs/scratchpad/feature-brainstorm.dossier.json (passed)

```sh
node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json docs/scratchpad/design-lab.dossier.json docs/scratchpad/feature-brainstorm.dossier.json
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### npm run site (passed)

```sh
npm run site
```

- **Expected:** Command completes before release evidence collection.
- **Actual:** Completed before this release dossier was generated.

### cd react && npm run typecheck (passed)

```sh
cd react && npm run typecheck
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
| 0c5919b | Prepare 0.6.7 release |
| c575247 | Deepen Theme Studio presets |
| c077308 | Polish print and PDF output |
| 9c15e04 | Add first-class citation blocks |
| dc143e1 | Add workspace-friendly export formats |
| 688b6ac | Refresh example artifacts for state workflow |
| 8333506 | Declare live editor module dependencies |
| 5c5566e | Align docs with state workflow |
| 4535316 | Improve overlay accessibility |
| 652fc61 | Add full state packet import |
| 62cd829 | Add CLI state workflow exports |
| 71ea6df | Add MCP state workflow tools |
| 56aafa2 | Publish state handoff schemas |
| 4300961 | Polish export center controls |
| 1694944 | Document stateful export workflow |
| b22bc1c | Add artifact export center |
| eec6047 | Add state contracts and linting |

### Changed files

| File | Status |
| --- | --- |
| README.md | changed |
| bin/dossier.mjs | changed |
| docs/product/process-dossiers/process-dossiers-scope.dossier.json | changed |
| docs/product/process-dossiers/process-dossiers-scope.html | changed |
| docs/product/process-dossiers/process-dossiers-scope.md | changed |
| docs/product/public-manual-qa.md | changed |
| docs/releases/release-0-6-0.html | changed |
| docs/releases/release-0-6-1.html | changed |
| docs/releases/release-0-6-2.html | changed |
| docs/releases/release-0-6-3.html | changed |
| docs/releases/release-0-6-4.html | changed |
| docs/releases/release-0-6-5.html | changed |
| docs/releases/release-0-6-6.html | changed |
| docs/scratchpad/design-lab.html | changed |
| docs/scratchpad/design-lab.slate.html | changed |
| docs/scratchpad/dossier-feature-brainstorm.html | changed |
| docs/scratchpad/dossier-feature-brainstorm.md | changed |
| examples/dossier-overview.html | changed |
| examples/engineering-release.html | changed |
| examples/implementation-packet.html | changed |
| examples/incident-response.html | changed |
| examples/product-launch.html | changed |
| examples/research-brief.html | changed |
| examples/showcase.dossier.json | changed |
| examples/showcase.html | changed |
| examples/showcase.md | changed |
| examples/workspace-index.html | changed |
| mcp/server.mjs | changed |
| package-lock.json | changed |
| package.json | changed |
| react/src/blocks.tsx | changed |
| react/src/core.d.ts | changed |
| react/src/render.tsx | changed |
| react/src/types.ts | changed |
| schema/dossier.schema.json | changed |
| schema/packets/handoff.schema.json | changed |
| schema/packets/state.schema.json | changed |
| skill/SKILL.md | changed |
| skill/references/blocks.md | changed |
| src/export.mjs | changed |
| src/generate.mjs | changed |
| src/index.mjs | changed |
| src/lint.mjs | changed |
| src/live-runtime.mjs | changed |
| src/runtime/runtime.mjs | changed |
| src/serve.mjs | changed |
| src/state.mjs | changed |
| src/theme/tokens.css.mjs | changed |
| src/validate.mjs | changed |
| test/dossier.test.mjs | changed |

## Collected provenance

### Git HEAD

- **kind:** command
- **source:** git rev-parse HEAD
- **trust:** high

0c5919bb1d329fdbb576880003a49fd1ce49e44c

### Release range

- **kind:** command
- **source:** git
- **trust:** high

v0.6.6..HEAD

### Working tree status

- **kind:** command
- **source:** git status --short
- **trust:** high

Clean before evidence write.


## Release trust report

Claims downstream agents can consume before continuing a release.

### Sources

- **source-git-head:** Git HEAD (high)
  0c5919bb1d329fdbb576880003a49fd1ce49e44c
- **source-git-status:** Git status (high)
  Clean
- **source-verification:** Verification commands (high)
  npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json docs/scratchpad/design-lab.dossier.json docs/scratchpad/feature-brainstorm.dossier.json, npm run site, cd react && npm run typecheck, npm pack --dry-run --json, npm publish --dry-run --access public

### Claims

- **Release evidence was collected from 0c5919b.** (verified), confidence: high
  - Sources: source-git-head
  - Evidence: git-head
- **The working tree was clean before writing release evidence.** (verified), confidence: high
  - Sources: source-git-status
  - Evidence: git-status
- **Verification commands completed before evidence collection.** (verified), confidence: high
  - Sources: source-verification
  - Evidence: npm-test, node-bin-dossier-mjs-validate-examples-dossier-json-docs-product, node-bin-dossier-mjs-build-examples-dossier-json-docs-product-pr, npm-run-site, cd-react-npm-run-typecheck, npm-pack-dry-run-json, npm-publish-dry-run-access-public

## Release evidence receipt

- **outcome:** ready-for-publish
- **owner:** release automation
- **date:** 2026-07-04T00:56:11.000Z
- **Changed files:** README.md, bin/dossier.mjs, docs/product/process-dossiers/process-dossiers-scope.dossier.json, docs/product/process-dossiers/process-dossiers-scope.html, docs/product/process-dossiers/process-dossiers-scope.md, docs/product/public-manual-qa.md, docs/releases/release-0-6-0.html, docs/releases/release-0-6-1.html, docs/releases/release-0-6-2.html, docs/releases/release-0-6-3.html, docs/releases/release-0-6-4.html, docs/releases/release-0-6-5.html, docs/releases/release-0-6-6.html, docs/scratchpad/design-lab.html, docs/scratchpad/design-lab.slate.html, docs/scratchpad/dossier-feature-brainstorm.html, docs/scratchpad/dossier-feature-brainstorm.md, examples/dossier-overview.html, examples/engineering-release.html, examples/implementation-packet.html, examples/incident-response.html, examples/product-launch.html, examples/research-brief.html, examples/showcase.dossier.json, examples/showcase.html, examples/showcase.md, examples/workspace-index.html, mcp/server.mjs, package-lock.json, package.json, react/src/blocks.tsx, react/src/core.d.ts, react/src/render.tsx, react/src/types.ts, schema/dossier.schema.json, schema/packets/handoff.schema.json, schema/packets/state.schema.json, skill/SKILL.md, skill/references/blocks.md, src/export.mjs, src/generate.mjs, src/index.mjs, src/lint.mjs, src/live-runtime.mjs, src/runtime/runtime.mjs, src/serve.mjs, src/state.mjs, src/theme/tokens.css.mjs, src/validate.mjs, test/dossier.test.mjs
- **Commands:** npm test, node bin/dossier.mjs validate examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json, node bin/dossier.mjs build examples/*.dossier.json docs/product/process-dossiers/process-dossiers-scope.dossier.json docs/releases/*.dossier.json docs/scratchpad/design-lab.dossier.json docs/scratchpad/feature-brainstorm.dossier.json, npm run site, cd react && npm run typecheck, npm pack --dry-run --json, npm publish --dry-run --access public
