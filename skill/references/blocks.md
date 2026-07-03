# Dossier, block catalog

Every block is an object in `blocks[]` with a `type`. Text fields accept inline
markdown (`**bold**`, `` `code` ``, `[label](url)`, `[[slug]]`, `[[Term]]`). `prose`,
review bodies, and process bodies also render simple `-` bullet lists and numbered
lists as real lists. `id` is optional (auto-derived). `section`, `two-col`, and `tabs` nest other blocks.
Process packet collections require stable kebab-case ids on their nested items:
`candidates`, `items`, `patches`, `runs`, `findings`, `threads`, `cycles`, `gates`,
`decisions`, `sources`, and `claims`.

## document presentation
```json
{
  "meta": {
    "title": "Release packet",
    "skin": "console-slate",
    "theme": {
      "accent": "#2563eb"
    }
  }
}
```
Use `skin: "console-slate"` for the denser production skin. Use `theme` for final
CSS token overrides; theme values win after the base CSS and selected skin.
Build with `--embed` when a host app needs a chrome-stripped `<slug>.embed.html`
variant that keeps block interactivity and the embedded model islands.

## ecosystem manifests and process commands
Pack manifest:
```json
{
  "name": "engineering",
  "version": "0.1.0",
  "templates": [
    { "id": "security-review", "title": "Security review", "kind": "review", "path": "templates/security-review.dossier.json" }
  ],
  "plugins": [
    { "id": "signal-banner", "entry": "plugins/signal-banner.plugin.mjs", "permissions": ["render"] }
  ]
}
```

Workspace manifest:
```json
{
  "schema": "dossier.workspace/v1",
  "name": "Dossier Examples",
  "roots": ["."],
  "exclude": ["packs"],
  "packs": ["engineering"],
  "output": "site"
}
```

Useful commands:
```bash
dossier lint path/to/doc.dossier.json --strict
dossier export path/to/doc.dossier.json --format json
dossier export path/to/doc.dossier.json --format merged-json --state path/to/doc.state.json
dossier export path/to/doc.dossier.json --format handoff --state path/to/doc.state.json
dossier export path/to/doc.dossier.json --format state-diff --state path/to/doc.state.json
dossier export path/to/doc.dossier.json --format prompt --state path/to/doc.state.json
dossier prompt path/to/doc.dossier.json --state path/to/doc.state.json
dossier pack add <repo-or-path>
dossier init security-review --template engineering/security-review
dossier pack trust engineering
dossier build custom.dossier.json --pack engineering
dossier workspace status <manifest-or-dir> --json
dossier workspace query <manifest-or-dir> --needs release|process|trust|invalid
dossier workspace index <manifest-or-dir>
dossier release collect --version 0.6.0 --since v0.5.5 --checks "npm test,npm pack --dry-run --json"
```
Templates are data-only. Pack plugins execute JavaScript at build time and should be
loaded only after an explicit trust decision.

## export semantics

Generated HTML has an Export Center with explicit artifact types:

- Source JSON is the authored model embedded in `#dossier-model`.
- State packet (`dossier.state/v1`) is browser state: decisions, process verdicts,
  edits, release gates, patch/diff review, and attached evidence.
- Export Center can import a saved state packet and rehydrate the visible controls.
- Merged JSON applies the state packet back into the model for rebuilds and publishing.
- Agent handoff (`dossier.handoff/v1`) summarizes selected decisions, dirty edits,
  release gaps, evidence, and next-agent instructions.
- State diff summarizes structural model changes caused by a state packet.
- AI prompt is a model-update prompt seeded from the current handoff summary.

Per-block exports such as `dossier.process/v1`, `dossier.patch-review/v1`, and
`dossier.release/v1` remain useful for scoped review loops. Use Export Center when the
next agent needs the full browser state or a merged model.

## hero, page opener (use one, first)
```json
{ "type": "hero", "eyebrow": "Kicker", "title": "The headline",
  "lede": "One or two sentence summary.",
  "pills": ["Tag A", "Tag B"],
  "sideCards": [ { "label": "Status", "value": "Review" }, { "label": "Owner", "value": "Kyle" } ] }
```

## prose, rich text
```json
{ "type": "prose", "heading": "Optional H2",
  "markdown": "Paragraph one.\n\n- Bullet with **bold**\n- Bullet with `code`\n\n1. First step\n2. Second step" }
```

## section, titled container (nests blocks)
```json
{ "type": "section", "title": "Section title", "subtitle": "Optional lede.",
  "framed": true, "blocks": [ /* nested blocks */ ] }
```

## two-col, two columns (each nests blocks)
```json
{ "type": "two-col", "left": [ /* blocks */ ], "right": [ /* blocks */ ] }
```

## summary-cards, equal outlined cards (for key points)
```json
{ "type": "summary-cards", "cards": [
  { "title": "For humans", "body": "...", "tone": "accent" },
  { "title": "For agents", "body": "...", "tone": "highlight" } ] }
```
`tone`: `neutral | accent | highlight | success | warning | danger`.

## stat-strip, KPI figures
```json
{ "type": "stat-strip", "stats": [
  { "value": "43", "label": "Block types", "delta": { "value": "+1", "label": "citation block", "tone": "up" } },
  { "value": "0", "label": "Runtime deps", "delta": "view-time" } ] }
```
`delta` is optional. It can be a string or `{ "value": "...", "label": "...", "tone": "up|down|positive|negative|good|bad|warn|neutral" }`.

## flow, numbered steps
```json
{ "type": "flow", "title": "Optional", "steps": [ { "title": "Author", "body": "Write JSON." }, { "title": "Generate", "body": "Run the CLI." } ] }
```

## timeline, phases with status
```json
{ "type": "timeline", "title": "Roadmap", "phases": [
  { "label": "Phase 1", "body": "Foundation.", "status": "done", "date": "Q1" },
  { "label": "Phase 2", "body": "Catalog.", "status": "in-progress" } ] }
```
`status`: `done | in-progress | planned | blocked`.

## table, hairline table
```json
{ "type": "table", "title": "Optional", "columns": ["A", "B"], "rows": [ ["1", "2"], ["3", "4"] ] }
```

## callout, quiet left-rule aside
```json
{ "type": "callout", "tone": "tip", "title": "Note.", "body": "Body text." }
```
`tone`: `info | ok | warn | danger | tip`.

## code, syntax-highlighted (Shiki, build-time)
```json
{ "type": "code", "lang": "ts", "filename": "optional.ts", "code": "const x = 1" }
```

## code-editor, bounded editable code/text
Use for snippets, config, prompts, JSON, Markdown, or small files that should round-trip
as an edits packet. The static artifact renders a textarea fallback, persists local edits,
and exports:
`{ "schema": "dossier.edits/v1", "slug": "...", "edits": { "id": { "text": "...", "lang": "ts", "targetPath": "..." } } }`.
`dossier serve` enhances the same block with CodeMirror 6 while keeping the textarea
as the packet source of truth. Static artifacts keep the textarea fallback.
```json
{ "type": "code-editor", "title": "Editable target snippet",
  "summary": "Bounded source text that can be edited and exported.",
  "lang": "ts", "filename": "session.ts", "targetPath": "src/auth/session.ts",
  "workItems": ["extract-token-store"],
  "code": "export function readSession() {\n  return null;\n}\n" }
```

## patch-set, proposed edit packets
Use for implementation dossiers when an agent is proposing or recording concrete edits.
Each patch can link back to `process-board` item ids, list files and verification, and
carry an optional unified diff. Patch review controls export
`{ "schema": "dossier.patch-review/v1", "patches": { "patch-id": { "verdict": "approve", "notes": "..." } } }`.
Agents should read that packet with `dossier_read_patch_review` and can apply it to the
model with `dossier_apply_patch_review`.
```json
{ "type": "patch-set", "title": "Patch set",
  "patches": [
    { "id": "extract-token-store", "title": "Extract token store",
      "summary": "Move token persistence behind a narrow helper.",
      "operation": "modify", "status": "proposed", "risk": "medium",
      "files": ["src/auth/session.ts"], "workItems": ["extract-token-store"],
      "verification": ["npm test -- auth"],
      "diff": "diff --git a/src/auth/session.ts b/src/auth/session.ts\n--- a/src/auth/session.ts\n+++ b/src/auth/session.ts\n@@ -1,2 +1,2 @@\n-const token = localStorage.getItem(\"token\");\n+const token = tokenStore.read();" } ] }
```
`patch.id` must be kebab-case. `operation`: `add | modify | delete | rename | mixed`.
`status`: `proposed | accepted | needs-revision | applied | skipped`. `risk`: `low | medium | high`.

## diff-view, parsed unified diff
Use for a file-first patch review surface. The renderer parses files, hunks, additions,
and deletions from the unified diff and renders a static reviewable view. File and hunk
review controls export
`{ "schema": "dossier.diff-review/v1", "files": { "...": { "verdict": "approve", "comment": "..." } }, "hunks": { "...": { "verdict": "revise", "comment": "..." } } }`.
Agents should read that packet with `dossier_read_diff_review`.
```json
{ "type": "diff-view", "title": "Full diff",
  "summary": "Standalone diff for file-first review.",
  "diff": "diff --git a/src/auth/session.ts b/src/auth/session.ts\n--- a/src/auth/session.ts\n+++ b/src/auth/session.ts\n@@ -1,2 +1,2 @@\n-const token = localStorage.getItem(\"token\");\n+const token = tokenStore.read();" }
```

## tabs, tabbed panes (each nests blocks)
```json
{ "type": "tabs", "tabs": [ { "label": "One", "blocks": [ /* blocks */ ] }, { "label": "Two", "blocks": [ ... ] } ] }
```

## faq, accordion
```json
{ "type": "faq", "title": "Optional", "items": [ { "q": "Question?", "a": "Answer." } ] }
```

## references, source table
```json
{ "type": "references", "items": [ { "label": "Source", "url": "https://…", "signal": "Why it matters", "use": "How to use it" } ] }
```

## citations, numbered bibliography; `[@id]` in any text field links to them
```json
{ "type": "citations", "items": [
  { "id": "src", "title": "Source title", "authors": ["Author"], "year": "2026", "source": "Publisher", "url": "https://example.com", "accessed": "2026-07-03", "note": "Why this source matters." }
] }
```
Reference a citation inline with `[@src]`. Place the `citations` block near the end.

## decision-matrix, static options × criteria
```json
{ "type": "decision-matrix", "title": "Where it lives",
  "criteria": ["Cross-project", "Public later"],
  "options": [ { "name": "Standalone", "scores": ["Yes", "Easy"], "recommended": true },
               { "name": "Monorepo", "scores": ["No", "Hard"] } ] }
```

## risk-register, static risk table
```json
{ "type": "risk-register", "risks": [ { "risk": "Scope creep", "likelihood": "medium", "impact": "high", "mitigation": "Freeze schema first." } ] }
```
`likelihood`/`impact`: `low | medium | high`.

## action-items, interactive checklist (persists + exports)
```json
{ "type": "action-items", "title": "Next steps", "items": [ { "title": "Do X", "owner": "agent", "status": "todo" } ] }
```
`status`: `todo | doing | done | blocked`.

## assumptions, assumptions & open-questions register
```json
{ "type": "assumptions", "items": [ { "statement": "We can host these.", "kind": "open-question", "status": "unverified" } ] }
```
`kind`: `assumption | open-question`. `status`: `unverified | verified | rejected`.

## glossary, definitions (resolves `[[Term]]` tooltips elsewhere)
```json
{ "type": "glossary", "terms": [ { "term": "dossier-model", "definition": "The embedded source-of-truth JSON island." } ] }
```

## diagram, Graphviz DOT or Mermaid → inline SVG (build-time)
```json
{ "type": "diagram", "title": "Pipeline", "format": "dot",
  "spec": "digraph { rankdir=LR; a -> b; b -> c; }" }
```
`format: "dot"` renders browserless (default). `format: "mermaid"` renders to SVG when
Playwright is installed, otherwise falls back to showing the source.

## figure, image with caption (inlined as a data URI at build time)
```json
{ "type": "figure", "src": "./diagram.png", "alt": "...", "caption": "What it shows." }
```
Local paths are read and inlined (self-contained). `data:`/`https:` sources pass through.

## math, LaTeX → MathML (build-time, self-contained, no fonts/CSS)
```json
{ "type": "math", "tex": "E = mc^2", "display": true }
```

## footnotes, numbered notes; `[^id]` in any text field links to them
```json
{ "type": "footnotes", "items": [ { "id": "src", "text": "The source, **inline** formatted." } ] }
```
Reference a note inline with `[^src]`. Place the `footnotes` block near the end.

## chart, bar / line / area, rendered to inline SVG (build-time, no dependency)
```json
{ "type": "chart", "title": "Quarterly", "chartType": "bar",
  "data": [ { "label": "Q1", "value": 12 }, { "label": "Q2", "value": 18 } ] }
```
`chartType`: `bar | line | area`. Charts render static SVG with axes, gridlines,
point/bar value labels, and theme-aware color.

## receipt, provenance panel (trust for agent-authored docs)
```json
{ "type": "receipt", "generatedBy": "research agent", "model": "claude-opus-4-8",
  "date": "2026-06-26", "confidence": "medium", "tools": ["web search"],
  "sources": [ { "label": "Spec", "url": "https://…" } ],
  "notes": "What was assumed or what failed." }
```
Pair with footnote citations (`[^id]`) for grounded, auditable documents.

## review-board, interactive triage / decision surface
Each candidate is an expandable row: collapsed shows title/summary/chips/status/select;
expanded shows the full reference (`body` markdown and/or nested `blocks`) + a notes
field. Reader filters, searches, ticks decisions, writes notes, exports a decisions packet
(and can re-import). Rows also render stable `ITEM-###` scan anchors plus
`data-candidate` ids, so humans can link to a row and agents can target the same
nested item id. Load as much reference detail per candidate as you want.
```json
{ "type": "review-board", "title": "Features, triage and decide",
  "candidates": [
    { "id": "command-palette", "title": "Command palette",
      "summary": "Cmd-K to jump and run actions.",
      "category": "Navigation", "status": "shipped", "impact": "High", "effort": "Small",
      "body": "Full technical reference in **markdown**, as long as needed.\n\nMultiple paragraphs ok.",
      "blocks": [ { "type": "code", "lang": "ts", "code": "// nested reference blocks render when expanded" } ],
      "details": { "Shortcut": "Cmd/Ctrl-K" },
      "badges": ["nav"] } ] }
```
`candidate.id` must be kebab-case (it keys the exported decisions packet).

## process-board, interactive work / implementation surface
Each item is an expandable work row with owner, priority, status, files, verification,
risks, evidence, full reference detail, a verdict dropdown, and notes. Reader verdicts
persist locally and export as a process packet:
`{ "schema": "dossier.process/v1", "slug": "...", "process": { "id": { "verdict": "approve", "notes": "...", "title": "..." } } }`.
Rows render stable `ITEM-###` scan anchors plus `data-process-item` ids. Use stable
kebab-case ids because verdict, note, and process packets key off those ids. Agents
should read that packet with `dossier_read_process`.
```json
{ "type": "process-board", "title": "Implementation work",
  "items": [
    { "id": "extract-token-store", "title": "Extract token store",
      "summary": "Move token persistence behind a narrow helper.",
      "category": "Code", "status": "proposed", "owner": "agent", "priority": "P1",
      "impact": "Medium", "effort": "Small", "verdict": "undecided",
      "files": ["src/auth/session.ts"], "dependencies": ["audit-current-session-api"],
      "verification": ["npm test -- auth"],
      "body": "Full technical reference in **markdown**.",
      "blocks": [ { "type": "code", "lang": "diff", "code": "diff --git ..." } ],
      "details": { "Compatibility": "Keep the public session API stable." },
      "badges": ["auth"] } ] }
```
`item.id` must be kebab-case (it keys the exported process packet).

## verification-run, commands and outcomes
Use for tests, builds, smoke checks, repro commands, or CI evidence. Agents can append a
run with `dossier_record_run`.
```json
{ "type": "verification-run", "title": "Verification",
  "runs": [
    { "id": "unit-tests", "title": "Unit tests", "command": "npm test",
      "status": "passed", "expected": "All tests pass.", "actual": "17 passing." } ] }
```

## evidence-log, append-only source material
```json
{ "type": "evidence-log", "title": "Evidence",
  "items": [
    { "id": "build-log", "title": "Build log", "kind": "command",
      "source": "local", "trust": "high", "body": "`npm test` passed." } ] }
```

## trust-report, source-backed claims
Use for provenance that an agent or reviewer must be able to audit. Sources describe the
material used; claims link to source ids and evidence ids. Agents can read reports with
`dossier_read_trust` and append or update claims with `dossier_record_claim`.
```json
{ "type": "trust-report", "title": "Trust report",
  "summary": "Claims are tied to source and evidence ids.",
  "sources": [
    { "id": "npm-test", "label": "npm test", "kind": "command",
      "trust": "high", "summary": "Local verification command." },
    { "id": "release-notes", "label": "Release notes", "kind": "doc",
      "url": "docs/release.md", "trust": "medium" } ],
  "claims": [
    { "id": "tests-pass", "claim": "The test suite passes.",
      "status": "verified", "confidence": "high",
      "sources": ["npm-test"], "evidence": ["test-suite"],
      "notes": "Verified on the release branch." } ] }
```
`source.id` and `claim.id` must be kebab-case. Common claim statuses:
`verified | partial | unverified | disputed | rejected`.

## verdict-gate, focused approval packet
Renders one approval control plus notes. It exports
`{ "schema": "dossier.verdicts/v1", "verdicts": { "gate-id": { "verdict": "...", "notes": "...", "title": "..." } } }`.
Agents should read it with `dossier_read_verdicts`.
```json
{ "type": "verdict-gate", "title": "Apply patch?", "gateId": "apply-auth-patch",
  "prompt": "Approve, revise, skip, defer, split, retry, or block this change.",
  "verdict": "undecided" }
```

## process-receipt, closeout/provenance panel
```json
{ "type": "process-receipt", "title": "Closeout receipt",
  "outcome": "implemented", "owner": "Codex", "date": "2026-06-28",
  "changedFiles": ["src/auth/session.ts"], "commands": ["npm test -- auth"],
  "followUps": ["Run full CI before release."] }
```

## finding-list, review findings
```json
{ "type": "finding-list", "title": "Findings",
  "findings": [
    { "id": "null-guard", "title": "Missing null guard", "severity": "medium",
      "body": "The boundary should validate missing input.", "files": ["src/auth/session.ts"],
      "recommendation": "Return a typed validation error." } ] }
```

## comment-thread, review discussion
```json
{ "type": "comment-thread", "title": "Review threads",
  "threads": [
    { "id": "thread-1", "subject": "Session migration",
      "comments": [ { "author": "Kyle", "body": "Keep the public API stable." } ] } ] }
```

## cycle-board, integration / dogfood cycles
```json
{ "type": "cycle-board", "title": "Dogfood cycles",
  "cycles": [
    { "id": "producer-to-consumer", "title": "Producer to consumer",
      "status": "done", "summary": "Consumer passed against the local package." } ] }
```

## integration-report, producer/consumer closeout
```json
{ "type": "integration-report", "title": "Integration report",
  "producer": "dossier", "consumer": "lumen", "status": "accepted",
  "items": [ { "id": "api", "title": "API contract", "summary": "No breaking change." } ] }
```

## upstream-response, dependency or upstream handoff
```json
{ "type": "upstream-response", "title": "Upstream response",
  "upstream": "codemirror", "status": "opened",
  "request": "Accept the compatibility patch.", "response": "Pending maintainer review." }
```

## release-checklist, release readiness gates
Interactive release gates persist locally and export
`{ "schema": "dossier.release/v1", "release": { "gate-id": { "done": true, "notes": "...", "title": "...", "required": true } } }`.
Agents should read it with `dossier_read_release`.
```json
{ "type": "release-checklist", "title": "Release gates",
  "gates": [
    { "id": "tests", "title": "Tests pass", "status": "passed",
      "required": true, "evidence": "npm test" } ] }
```

## decision-log, durable operational decisions
```json
{ "type": "decision-log", "title": "Incident decisions",
  "decisions": [
    { "id": "rollback", "decision": "Rollback release",
      "owner": "incident commander", "rationale": "Error rate stayed elevated." } ] }
```
