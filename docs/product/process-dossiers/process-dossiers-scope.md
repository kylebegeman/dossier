---
title: "Process Dossiers Product Scope"
slug: "process-dossiers-scope"
status: "draft"
updated: "2026-07-03"
---
# Process Dossiers: structured human-agent workflows for real work

Dossier should evolve from an artifact for planning and review into a general process workbench: a self-contained, agent-readable control surface for implementation, code review, verification, integration loops, releases, incidents, and any other structured AI-assisted process.

### Thesis

The durable unit is not a plan. It is a **process packet**: goal, context, work items, edits, evidence, decisions, receipts, and handoff in one round-trippable model.

### Product

A Dossier can become a review board, implementation console, patch review surface, verification runbook, incident room, release board, or cross-project integration loop without losing the single-file artifact promise.

### Execution boundary

The artifact does not need to become an IDE or agent runtime. It coordinates humans and agents, records structured state, and hands precise packets to tools that do the actual filesystem, Git, execution, or external-service work.


### Generalized dossier loop

1. **Author**, An agent emits a structured process model with context, proposed work, risks, and evidence requirements.
2. **Inspect**, The human reads, searches, expands, edits, compares, and annotates the process surface.
3. **Decide**, The human applies verdicts: approve, revise, skip, defer, split, retry, or request evidence.
4. **Execute**, An agent or host tool reads the exported packet and performs bounded work against the real system.
5. **Verify**, Tests, diffs, commands, logs, screenshots, and receipts flow back into the model.
6. **Handoff**, The artifact becomes the durable record and the next agent-readable input.

## Why This Is Bigger Than Planning

The current product already contains the primitives, but the vocabulary is too narrow.

Today Dossier is excellent at producing structured planning and decision artifacts. The existing `review-board` proves the deeper idea: a dossier can be a human-agent protocol, not just a document. The next step is to name that protocol and add blocks for work execution.

The important reframing is: **planning is one process kind**. Implementation, review, debugging, dependency dogfooding, release prep, incident response, research synthesis, and operations changes are also process kinds. They need the same pattern: structured context, human markup, machine-readable decisions, executable follow-up, and durable receipts.

### Current capability versus target capability

| Current Dossier surface | What it proves | Process Dossier expansion |
| --- | --- | --- |
| `review-board` | Humans can select and annotate agent-proposed candidates. | `process-board` with per-item verdicts, dependencies, evidence, risks, and execution state. |
| `action-items` | Checklist state can persist and export. | `work-items` with owners, branch/worktree refs, verification, and handoff status. |
| `code` | Code can be highlighted in static artifacts. | `code-editor` and `diff-view` blocks for reviewing and editing snippets or proposed patches. |
| `receipt` | Provenance can be represented in the artifact. | `run-receipt`, `verification-receipt`, and `decision-receipt` packets. |
| MCP `read_decisions` | Agents can consume human decisions without scraping. | MCP `read_process`, `read_verdicts`, `read_release`, `record_run`, and `attach_patchset` tools. |


## Lumen Inspiration To Lift

Lumen already documents the broader agent-work vocabulary Dossier needs.

### Reusable product primitives

| Lumen concept | Dossier adaptation | Why it matters |
| --- | --- | --- |
| Decision Layer, approvals, receipts | Every process dossier can export and import versioned verdict and receipt packets. | Human control becomes explicit and replayable. |
| Execution envelopes | Dossier records execution intent and evidence, while host tools run commands in bounded environments. | The artifact stays portable while execution stays safe. |
| Agent Work run packets | A process dossier is the portable packet format for run objective, constraints, budget, state, evidence, and closeout. | Agents can resume or hand off work without transcript archaeology. |
| Git/Forge Workspace Engine | Implementation dossiers model lanes, branches, patchsets, PRs, checks, review comments, and CI repairs. | Code editing becomes a first-class process, not an afterthought. |
| Dependency Dogfood Pair Sessions | Dossier can represent producer/consumer integration cycles as bounded packet exchange. | Reusable dependencies get real adoption feedback loops. |
| API Studio concept | Dossier can embed executable request specs and response diffs as process evidence. | Implementation and verification can include API calls, not only files. |
| CodeMirror and existing diff rendering in Lumen | Use CodeMirror for embeddable editor blocks and a diff parser/renderer for static patch review. | The interaction model aligns with tools Kyle already uses. |
| OSS intake packets | Each external project gets source posture, license posture, consumption mode, and milestone placement. | We can farm OSS aggressively without losing provenance. |

> **Product boundary.** Dossier should not duplicate Lumen's runtime. Lumen can execute, coordinate live sessions, and manage approvals. Dossier should define portable workflow artifacts that Lumen, CLI tools, MCP servers, and standalone HTML can all understand.


## Final Product Shape

The all-in scope is a process artifact system with static, editable, and host-integrated modes.

### Static Artifact

A self-contained HTML file with source model, readable process state, diff rendering, readonly code views, decisions export, receipts export, and agent digest.

### Editable Artifact

The same file can enter edit mode for text, verdicts, notes, process item status, lightweight code snippets, and theme/model exports.

### Live Studio

A hosted or local `dossier serve` mode adds richer CodeMirror editing, save-back to disk, patch import/export, live validation, and host tool hooks.

### MCP Protocol

Agents can render, validate, read verdict packets, record run evidence, attach patchsets, and generate closeout packets without scraping HTML.


### Process kinds

| Kind | Purpose | Core blocks |
| --- | --- | --- |
| `plan` | Strategy, option selection, feature planning. | `review-board`, `decision-matrix`, `assumptions`, `action-items` |
| `implementation` | Actual code edit loop. | `process-board`, `code-editor`, `patch-set`, `diff-view`, `verification-run`, `trust-report`, `process-receipt` |
| `review` | Code review, design review, security review. | `review-board`, `finding-list`, `diff-view`, `comment-thread`, `verdict-gate`, `trust-report` |
| `debug` | Bug reproduction, hypotheses, traces, fixes. | `evidence-log`, `process-board`, `patch-set`, `verification-run`, `trust-report` |
| `integration-loop` | Producer/consumer dependency dogfooding. | `cycle-board`, `integration-report`, `upstream-response`, `process-receipt` |
| `release` | Release prep, checks, approvals, changelog. | `release-checklist`, `risk-register`, `verification-run`, `trust-report`, `process-receipt` |
| `incident` | Timeline, impact, mitigation, follow-ups. | `timeline`, `evidence-log`, `decision-log`, `verification-run`, `trust-report`, `process-receipt` |


## New Block Families

These are the product primitives to add beyond the current planning catalog.

| Block | What it renders | Exported state |
| --- | --- | --- |
| `process-board` | Expandable work items with status, owner, lane, dependencies, risks, evidence links, and human verdict controls. | Verdicts, notes, priority, assigned agent, blocked reason, selected verification. |
| `patch-set` | Patch summary grouped by file, operation, risk, and relation to work items. | Patch ids, target files, apply strategy, accepted/skipped/revise state. |
| `diff-view` | Unified diff with file tree, hunks, additions/deletions, copy, collapse, and comments. | Per-file and per-hunk verdicts, comments, requested changes. |
| `code-editor` | Embeddable editor block for snippets, config, prompts, JSON, markdown, and small patches. Static artifacts use a textarea fallback; `dossier serve` enhances it with CodeMirror 6. | Edited text, language, dirty state, optional target path. |
| `verification-run` | Commands, expected results, actual results, logs, artifacts, and rerun guidance. | Pass/fail/blocked state, command receipt refs, selected rerun requests. |
| `evidence-log` | Append-only observations: screenshots, logs, links, command outputs, API responses, source refs. | Evidence ids, trust level, source, created time, linked work items. |
| `trust-report` | Source-backed claims with status, confidence, source ids, and evidence ids. | Versioned `dossier.trust/v1` claim/source packet for MCP readback. |
| `verdict-gate` | A focused approval surface for apply/revise/skip/defer/split/retry decisions. | Structured verdict packet for agents and MCP tools. |
| `process-receipt` | Closeout/provenance summary covering model, tools, commands, files, tests, risks, and failures. | Receipt packet plus digest text. |
| `finding-list` | Review findings with severity, affected files, recommendations, and evidence. | Finding ids, severity, files, recommendation state. |
| `comment-thread` | Structured review discussions grouped by subject or file. | Thread ids and comments that agents can turn into follow-up work. |
| `cycle-board` | Producer/consumer integration cycles with status and outcome. | Cycle ids, status, evidence, and next-step ownership. |
| `integration-report` | Integration closeout across producer, consumer, version, status, and issues. | Acceptance state, compatibility notes, and remaining work. |
| `upstream-response` | Upstream request/response handoff for dependency work. | Request, response, URL, status, and next step. |
| `release-checklist` | Interactive release readiness gates with required markers and evidence notes. | Versioned `dossier.release/v1` gate packet. |
| `decision-log` | Durable decisions for incidents, releases, integrations, and reviews. | Decision ids, owner, rationale, and follow-up context. |

```json
{
  "schema": "dossier.process/v1",
  "slug": "auth-session-refactor",
  "processKind": "implementation",
  "workItems": {
    "extract-token-store": {
      "status": "ready-for-review",
      "verdict": "apply",
      "targetFiles": ["src/auth/session.ts"],
      "patchIds": ["patch-token-store"],
      "verification": ["npm test -- auth"],
      "notes": "Keep the public session API stable."
    }
  },
  "patchSets": {
    "patch-token-store": {
      "format": "unified-diff",
      "risk": "medium",
      "summary": "Extract token persistence behind a narrow helper."
    }
  },
  "receipts": {
    "verify-auth-tests": {
      "kind": "verification-run",
      "status": "passed",
      "command": "npm test -- auth"
    }
  }
}
```


## Open Source Farm

Aggressive reuse is encouraged, with provenance and license-aware consumption modes.

### Editor, diff, and workflow source posture

| Source | Role | License posture | Consumption mode |
| --- | --- | --- | --- |
| CodeMirror 6 | Embeddable editor, small language packages, merge/diff editing surface. | MIT, good fit. | Primary editor for live `dossier serve` blocks. Static artifacts keep the textarea fallback. |
| Monaco Editor | Full IDE-grade editor and diff editor. | MIT, but large. | Optional live Studio mode, not default self-contained artifact runtime. |
| Shiki | Build-time syntax highlighting already used by Dossier. | MIT, already aligned. | Keep for static code/diff highlighting and no-client-JS output. |
| Diff2Html / react-diff-view / gitdiff-parser | Unified diff parse/render references. | Permissive options exist; verify before vendoring. | Prefer a tiny local parser first, then adopt a library if hunk/comment complexity grows. |
| @pierre/diffs | Lumen already uses this for diff rendering. | Use Lumen as local reference; verify package license before copying. | Strong inspiration if the package API and license are suitable for Dossier. |
| GitButler | Virtual branches, lanes, commit timeline, conflict-first UX. | Private-use source posture in Lumen; public Dossier needs license review. | Mine product vocabulary and UX patterns first, not code. |
| Hoppscotch | API Studio pattern and packet discipline. | MIT. | Use as an example for headless model plus native UI separation. |
| opengist | Git-backed, revisioned snippets. | AGPL-3.0. | Pattern only or sidecar. Do not copy source into public Dossier. |
| Continue, Aider, OpenHands | Agent coding workflow references. | Mixed licenses, verify per component. | Farm workflow patterns: patch loops, context packets, approval gates, and transcript-to-artifact conversion. |

### Source references to verify before vendoring

| Source | Signal | Use |
| --- | --- | --- |
| CodeMirror | Modular editor foundation. | Primary embeddable editor candidate. |
| CodeMirror merge package | Merge and diff-oriented package. | Candidate for diff/edit blocks. |
| Monaco Editor | IDE-grade web editor. | Optional live Studio editor. |
| Shiki | Build-time highlighting. | Keep static artifact path lightweight. |
| GitButler | Virtual lanes and Git workflow UX. | Product inspiration for implementation dossiers. |
| Hoppscotch | Headless model plus native surface strategy in Lumen docs. | Pattern for Dossier live surfaces. |
| OpenHands | Open-source software development agents. | Workflow and process inspiration. |
| Aider | Patch-oriented AI coding loop. | Patch packet and edit loop inspiration. |
| Continue | Open-source AI code assistant. | Context and IDE-agent interaction inspiration. |


## Milestone Commit Plan

Commit boundaries should map to user-visible product increments and keep rollback simple.

### Milestones

- **M0** (done), Product scope packet, OSS source posture, and implementation milestones.
- **M1** (done), Schema and starter foundation: add process-oriented kinds, starters, validation coverage, README positioning, and MCP starter discovery.
- **M2** (done), Process-board foundation: render work items, verdict controls, notes, local persistence, import/export, and MCP readback.
- **M3** (done), Patch and diff foundation: add patch-set and diff-view blocks, unified diff parsing, Markdown export, print-safe styling, and sample implementation dossier.
- **M4** (done), Embeddable editor foundation: add code-editor blocks, static fallback, host enhancement hooks for CodeMirror, edited-text export/import, validation, docs, and examples.
- **M5** (done), Process MCP protocol: render, validate, read process verdicts, read release gates, record run receipts, attach patchsets, and return closeout digest.
- **M6** (done), Live Studio hooks: save-back model editing, patch import, watcher integration, editor hooks, and source model writeback in `dossier serve`.
- **M7** (done), Integration-loop dossiers: producer/consumer packet templates, cycle control, upstream response, integration report, and closeout examples.
- **M8** (done), Polish and platform: catalog facets for process artifacts, docs, examples, release readiness, and incident closeout blocks.
- **M9** (done), Unified state workflow and accessibility closeout: full state packet import, state merge/diff/handoff tools, AI prompt export, shortcuts modal, focus-trapped overlays, and manual QA alignment.

### Completed milestone commits

- [x] Commit M0 product scope packet. (@Codex)
- [x] Commit M1 process kinds, starters, README and skill positioning. (@Codex)
- [x] Commit M2 process-board render and verdict export loop. (@Codex)
- [x] Commit M3 diff-view and patch-set static rendering. (@Codex)
- [x] Commit M4 code-editor block and edit packet export. (@Codex)
- [x] Commit M5 process protocol blocks and MCP helpers. (@Codex)
- [x] Commit M6 live serve save-back and patch import. (@Codex)
- [x] Commit M7 integration-loop packet blocks and starters. (@Codex)
- [x] Commit M8 release, incident, docs, and catalog closeout. (@Codex)
- [x] Commit M9 state workflow and accessibility closeout. (@Codex)


## Data Model Direction

Keep the existing document model, but add process contracts that can round-trip independently.

| Contract | Purpose | Notes |
| --- | --- | --- |
| `ProcessStatePacket` | All local human state that should leave the artifact. | Superset of today's decisions map. Version it separately from the document schema. |
| `WorkItem` | Atomic unit of process work. | Has id, title, goal, status, owner, dependencies, files, risks, evidence, and verdict. |
| `PatchSet` | One proposed or applied edit set. | Can store inline unified diff, file summaries, external artifact refs, or both. |
| `VerificationRun` | Commands and evidence. | Expected versus actual result, logs, artifacts, pass/fail/blocked, rerun request. |
| `Verdict` | Human decision over item, file, hunk, patch, or run. | Values: approve, revise, skip, defer, split, retry, block. |
| `TrustClaim` | Auditable assertion tied to source ids and evidence ids. | Carries status, confidence, notes, and missing-source checks for agents. |
| `Receipt` | Durable trace of generated, applied, verified, or rejected work. | Keep provenance even when output is later copied into another tool. |
| `SourceRef` | Pointer to files, docs, repos, issues, PRs, command outputs, browser captures, or source material. | This is how Dossier avoids bloating packets while preserving evidence links. |

> **Versioning rule.** Do not overload the existing `decisions` packet indefinitely. Add a versioned `dossier.process/v1` packet so agents can distinguish planning selections from implementation verdicts, patch review, verification evidence, and closeout state.


## Product Guardrails

Going all in still needs crisp boundaries.

### Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Static artifact bloat from bundling a full editor into every output. | medium | high | Load CodeMirror only in `dossier serve`; keep generated artifacts dependency-free. |
| Dossier accidentally becomes a half-built IDE. | medium | high | Keep execution, filesystem writes, Git operations, and sandboxing in host tools. Dossier coordinates and records. |
| Process state grows incompatible with current decisions export. | high | medium | Introduce a versioned process packet and keep decision export as a compatibility layer. |
| OSS license leakage from farming AGPL/GPL projects. | medium | high | Record license posture per source. Copy permissive code only; use AGPL/GPL as pattern or sidecar only unless deliberately accepted. |
| Too many block types before one loop is excellent. | medium | medium | Build implementation dossier first end to end, then generalize to integration loops and release/incident kinds. |

### Settled direction

- (decision/verified) Use CodeMirror 6 as the default live editor enhancer in `dossier serve`, while static artifacts keep the textarea fallback.
- (decision/verified) Reserve Monaco for a future hosted Studio or Lumen integration where bundle size and worker setup are acceptable.
- (decision/verified) The first-party unified diff parser and renderer is enough for the current patch and diff review surface.
- (assumption/verified) Dossier should remain useful without Lumen, but become more powerful when Lumen or another host consumes the same MCP/process contracts.


