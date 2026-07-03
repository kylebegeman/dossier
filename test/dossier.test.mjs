import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildHandoffPacket, esc, generate, generateFile, inlineMd, lintModel, mergeStateIntoModel, parseUnifiedDiff, promptForModel, registerBlock, slugify, validateModel } from "../src/index.mjs";
import { diffModels } from "../src/diff.mjs";
import { addPack, listPacks, loadTrustedPackPlugins, readPackManifest, resolveTemplateRef, trustPack } from "../src/packs.mjs";
import { collectReleaseEvidence, writeReleaseEvidence } from "../src/release.mjs";
import { WORKSPACE_MANIFEST, buildWorkspaceIndex, createWorkspaceManifest, publishWorkspace, queryWorkspace, scanWorkspace, writeWorkspaceIndex, writeWorkspaceManifest } from "../src/workspace.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDir = join(root, "examples");
const startersDir = join(root, "src", "starters");
const sample = JSON.parse(readFileSync(join(examplesDir, "sample.dossier.json"), "utf8"));

test("the sample validates", () => {
  assert.equal(validateModel(sample).ok, true);
});

test("all starters validate", () => {
  const files = readdirSync(startersDir).filter((file) => file.endsWith(".dossier.json"));
  assert.ok(files.length >= 1, "starters exist");
  for (const file of files) {
    const model = JSON.parse(readFileSync(join(startersDir, file), "utf8"));
    const result = validateModel(model);
    assert.deepEqual(result.errors, [], file);
  }
});

test("validation catches unknown types and missing fields", () => {
  const r = validateModel({ dossierVersion: "1.0", meta: {}, blocks: [{ type: "nope" }, { type: "code" }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown block type/.test(e)));
  assert.ok(r.errors.some((e) => /meta.title/.test(e)));
  assert.ok(r.errors.some((e) => /missing required "code"/.test(e)));
});

test("validation catches unknown presentation skins", () => {
  const r = validateModel({ dossierVersion: "1.0", meta: { title: "Bad skin", skin: "console-sltae" }, blocks: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /meta\.skin: unknown skin/.test(e)));
});

test("validation catches nested packet ids that agents depend on", () => {
  const r = validateModel({
    dossierVersion: "1.0",
    meta: { title: "Bad nested ids" },
    blocks: [
      { type: "prose", id: "UpperCase", markdown: "Bad block id." },
      { type: "process-board", title: "Work", items: [{ title: "No id" }] },
      { type: "finding-list", title: "Findings", findings: [{ id: "UpperCase", title: "Bad nested id" }] },
      { type: "release-checklist", title: "Release", gates: [{ id: "bad id", title: "Bad" }] },
      { type: "patch-set", title: "Patches", patches: [] },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /blocks\[0\]\.id/.test(e)), "block id must be lowercase kebab-case");
  assert.ok(r.errors.some((e) => /items\[0\]\.id/.test(e)), "process item id is required");
  assert.ok(r.errors.some((e) => /findings\[0\]\.id/.test(e)), "nested item id must be lowercase kebab-case");
  assert.ok(r.errors.some((e) => /gates\[0\]\.id/.test(e)), "release gate id must be a slug");
  assert.ok(r.errors.some((e) => /missing required "patches"/.test(e)), "empty patch set is rejected");
});

test("generate yields a self-contained, agent-readable artifact", async () => {
  const { html, embedHtml, md, digest } = await generate(structuredClone(sample), { baseDir: examplesDir });
  assert.ok(html.includes('id="dossier-model"'), "has the data island");
  assert.ok(!/<(link|script)[^>]+(src|href)="https?:/.test(html), "no external assets");
  const island = html.match(/id="dossier-model">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, "<");
  const model = JSON.parse(island);
  assert.equal(model.meta.title, sample.meta.title, "island round-trips");
  assert.ok(!/_hl|_svg/.test(island), "build fields stripped from island");
  assert.ok(md.length > 0 && digest.length > 0, "markdown + digest exported");
  assert.ok(embedHtml.includes('data-dossier-embed="true"'), "has an embed variant");
  assert.ok(embedHtml.includes('id="dossier-model"'), "embed keeps the source model island");
  assert.ok(!embedHtml.includes('<header class="ds-topbar"'), "embed strips topbar chrome");
  assert.ok(!embedHtml.includes('<aside class="ds-toc"'), "embed strips table-of-contents chrome");
  assert.ok(!embedHtml.includes('<footer class="ds-footer"'), "embed strips footer chrome");
});

test("generated runtime separates source, state, merged, and handoff exports", async () => {
  const diff = "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1 @@\n-old\n+new";
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Export Workflow", slug: "export-workflow" },
    blocks: [
      { type: "review-board", title: "Options", candidates: [{ id: "option-one", title: "Option one", summary: "Pick this." }] },
      { type: "process-board", title: "Work", items: [{ id: "work-one", title: "Work one" }] },
      { type: "code-editor", id: "config-editor", title: "Config", targetPath: "config.json", code: "{}\n" },
      { type: "patch-set", title: "Patches", patches: [{ id: "patch-one", title: "Patch one", diff }] },
      { type: "diff-view", title: "Diff", diff },
      { type: "release-checklist", title: "Release", gates: [{ id: "manual-qa", title: "Manual QA", required: true }] },
    ],
  };
  const { html } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-export-modal'), "renders the export center modal");
  assert.ok(html.includes('data-block-editor-open'), "renders static block editor entrypoint");
  assert.ok(html.includes('data-evidence-open'), "renders evidence attachment entrypoint");
  assert.ok(html.includes('data-revision-file'), "renders revision compare input");
  assert.ok(html.includes("dossier.state/v1"), "runtime can export state packets");
  assert.ok(html.includes("dossier.handoff/v1"), "runtime can export agent handoff packets");
  assert.ok(html.includes("Download source JSON"), "source model export is explicit");
  assert.ok(html.includes("Download state packet"), "state packet export is explicit");
  assert.ok(html.includes("Download merged JSON"), "merged model export is explicit");
  assert.ok(html.includes("Download agent handoff"), "handoff export is explicit");
  assert.ok(html.includes("Copy AI prompt"), "prompt export is exposed");
  assert.ok(html.includes("Export process packet"), "process block export is labelled as a packet");
  assert.ok(html.includes("Export patch review packet"), "patch review export is labelled as a packet");
  assert.ok(html.includes("Export diff review packet"), "diff review export is labelled as a packet");
  assert.ok(html.includes("Export release packet"), "release export is labelled as a packet");
  assert.ok(!html.includes(">Download JSON</button>"), "old ambiguous JSON label is gone");
});

test("generateFile can write a chrome-stripped embed artifact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dossier-embed-"));
  const file = join(dir, "embed.dossier.json");
  writeFileSync(file, JSON.stringify({ dossierVersion: "1.0", meta: { title: "Embed", slug: "embed" }, blocks: [{ type: "prose", markdown: "Host me." }] }, null, 2));
  const result = await generateFile(file, { embed: true });
  assert.ok(existsSync(result.htmlPath), "writes full html");
  assert.ok(existsSync(result.mdPath), "writes markdown");
  assert.ok(existsSync(result.embedPath), "writes embed html");
  const embed = readFileSync(result.embedPath, "utf8");
  assert.ok(embed.includes('data-dossier-embed="true"'), "embed file is marked");
  assert.ok(embed.includes("Host me."), "embed file contains content");
  assert.ok(!embed.includes('<header class="ds-topbar"'), "embed file excludes topbar");
});

test("every block in the sample renders (no 'unsupported')", async () => {
  const { html } = await generate(structuredClone(sample), { baseDir: examplesDir });
  assert.ok(!/Unsupported block type/.test(html));
});

test("process-board renders controls and nested reference blocks", async () => {
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Implementation", slug: "impl" },
    blocks: [
      {
        type: "process-board",
        title: "Work",
        items: [
          {
            id: "work-one",
            title: "Work one",
            summary: "Do the thing.",
            status: "proposed",
            owner: "agent",
            priority: "P1",
            verdict: "approve",
            files: ["src/file.ts"],
            verification: ["npm test"],
            blocks: [{ type: "code", lang: "ts", code: "const ok = true" }],
          },
        ],
      },
    ],
  };
  const result = validateModel(model);
  assert.deepEqual(result.errors, []);
  const { html, md } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-block="process-board"'), "renders the block");
  assert.ok(html.includes('data-process-verdict="work-one"'), "renders verdict control");
  assert.ok(html.includes("dossier.process/v1"), "runtime can export a process packet");
  assert.ok(html.includes("const ok"), "renders nested reference blocks");
  assert.ok(md.includes("### Work one ("), "exports process items to Markdown");
});

test("patch-set and diff-view render parsed unified diffs", async () => {
  const diff = "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,2 +1,2 @@\n-const oldValue = true;\n+const newValue = true;";
  const files = parseUnifiedDiff(diff, "preview.diff");
  assert.equal(files.length, 1);
  assert.equal(files[0].additions, 1);
  assert.equal(files[0].deletions, 1);
  assert.equal(files[0].newPath, "src/file.ts");
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Implementation", slug: "impl" },
    blocks: [
      {
        type: "patch-set",
        title: "Patches",
        patches: [
          {
            id: "patch-one",
            title: "Patch one",
            operation: "modify",
            status: "proposed",
            risk: "low",
            files: ["src/file.ts"],
            workItems: ["work-one"],
            verification: ["npm test"],
            diff,
          },
        ],
      },
      { type: "diff-view", title: "Diff", diff },
    ],
  };
  const result = validateModel(model);
  assert.deepEqual(result.errors, []);
  const { html, md } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-block="patch-set"'), "renders patch-set");
  assert.ok(html.includes('data-block="diff-view"'), "renders diff-view");
  assert.ok(html.includes('data-patch-verdict="patch-one"'), "renders patch review verdict control");
  assert.ok(html.includes('data-diff-file-verdict="diff-1:src/file.ts"'), "renders file review verdict control");
  assert.ok(html.includes("dossier.patch-review/v1"), "runtime can export patch review packets");
  assert.ok(html.includes("dossier.diff-review/v1"), "runtime can export diff review packets");
  assert.ok(html.includes("ds-diff-line add"), "renders additions");
  assert.ok(html.includes("ds-diff-line del"), "renders deletions");
  assert.ok(md.includes("```diff"), "exports diff markdown");
});

test("packet schemas are published for agent handoff contracts", () => {
  const packetDir = join(root, "schema", "packets");
  const names = ["process", "edits", "verdicts", "release", "patch-review", "diff-review", "trust", "closeout", "state", "handoff"];
  for (const name of names) {
    const schema = JSON.parse(readFileSync(join(packetDir, `${name}.schema.json`), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.ok(schema.title.includes("Dossier"), name);
  }
});

test("code-editor renders editable text hooks and edit packet export", async () => {
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Editor", slug: "editor" },
    blocks: [
      {
        type: "code-editor",
        title: "Editable config",
        summary: "A bounded edit surface.",
        lang: "json",
        filename: "config.json",
        targetPath: "config/config.json",
        workItems: ["config-update"],
        code: "{\n  \"enabled\": true\n}\n",
      },
    ],
  };
  const result = validateModel(model);
  assert.deepEqual(result.errors, []);
  const { html, md } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-block="code-editor"'), "renders code-editor");
  assert.ok(html.includes('data-code-editor="editable-config-0"'), "renders editor data hook");
  assert.ok(html.includes("dossier.edits/v1"), "runtime can export edits packet");
  assert.ok(md.includes("```json"), "exports editor content to Markdown");
});

test("process closeout blocks render and export agent-readable packet hooks", async () => {
  const model = {
    dossierVersion: "1.0",
    kind: "release",
    meta: { title: "Closeout", slug: "closeout" },
    blocks: [
      {
        type: "verification-run",
        title: "Verification",
        runs: [
          { id: "test-suite", title: "Test suite", command: "npm test", status: "passed", expected: "green", actual: "green" },
        ],
      },
      {
        type: "evidence-log",
        title: "Evidence",
        items: [
          { id: "log-one", title: "Build log", kind: "command", source: "local", trust: "high", body: "Build completed." },
        ],
      },
      {
        type: "trust-report",
        title: "Trust report",
        summary: "Claims are tied to source and evidence ids.",
        sources: [
          { id: "npm-test", label: "npm test", kind: "command", trust: "high", summary: "Local test command." },
        ],
        claims: [
          { id: "tests-pass", claim: "The test suite passes.", status: "verified", confidence: "high", sources: ["npm-test"], evidence: ["test-suite"] },
        ],
      },
      { type: "verdict-gate", title: "Ship gate", prompt: "Ready to ship?", gateId: "ship", verdict: "approve" },
      {
        type: "process-receipt",
        title: "Receipt",
        outcome: "shipped",
        owner: "agent",
        changedFiles: ["src/index.mjs"],
        commands: ["npm test"],
      },
      {
        type: "finding-list",
        title: "Findings",
        findings: [
          { id: "finding-one", title: "Null handling", severity: "medium", body: "Guard the boundary.", files: ["src/index.mjs"] },
        ],
      },
      {
        type: "comment-thread",
        title: "Threads",
        threads: [
          { id: "thread-one", subject: "Review note", comments: [{ author: "Kyle", body: "Prefer the direct path." }] },
        ],
      },
      {
        type: "cycle-board",
        title: "Cycles",
        cycles: [
          { id: "cycle-one", title: "Consumer dogfood", status: "done", summary: "Consumer passed." },
        ],
      },
      {
        type: "integration-report",
        title: "Integration report",
        producer: "dossier",
        consumer: "lumen",
        status: "accepted",
        items: [{ id: "api", title: "API contract", summary: "No breaking change." }],
      },
      {
        type: "upstream-response",
        title: "Upstream",
        upstream: "library",
        status: "opened",
        request: "Accept patch",
        response: "Pending",
      },
      {
        type: "release-checklist",
        title: "Release gates",
        gates: [{ id: "tests", title: "Tests pass", status: "passed", required: true, evidence: "npm test" }],
      },
      {
        type: "decision-log",
        title: "Decisions",
        decisions: [{ id: "ship", decision: "Ship", owner: "Kyle", rationale: "All gates passed." }],
      },
    ],
  };
  const result = validateModel(model);
  assert.deepEqual(result.errors, []);
  const { html, md } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-block="verification-run"'), "renders verification-run");
  assert.ok(html.includes('data-block="release-checklist"'), "renders release-checklist");
  assert.ok(html.includes('data-block="trust-report"'), "renders trust-report");
  assert.ok(html.includes('data-trust-claim="tests-pass"'), "renders trust claim hook");
  assert.ok(html.includes('data-verdict-gate="ship"'), "renders verdict gate hook");
  assert.ok(html.includes("dossier.verdicts/v1"), "runtime can export verdict packets");
  assert.ok(html.includes("dossier.release/v1"), "runtime can export release packets");
  assert.ok(html.includes("Integration report"), "new titled blocks are present");
  assert.ok(md.includes("## Verification"), "exports verification markdown");
  assert.ok(md.includes("## Trust report"), "exports trust markdown");
  assert.ok(md.includes("- [x] Tests pass"), "exports release checklist markdown");
});

test("process packet markup preserves current state for export and import", async () => {
  const model = {
    dossierVersion: "1.0",
    kind: "release",
    meta: { title: "Packets", slug: "packets" },
    blocks: [
      { type: "process-board", title: "Work", items: [{ id: "ship-work", title: "Ship work", verdict: "approve" }] },
      { type: "verdict-gate", title: "Ship gate", prompt: "Ship?", gateId: "ship-gate", verdict: "approve" },
      { type: "release-checklist", title: "Release", gates: [{ id: "tests", title: "Tests pass", status: "passed", required: true, evidence: "npm test" }] },
    ],
  };
  const { html } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-verdict-title="Ship gate"'), "verdict packet carries a title");
  assert.ok(html.includes('data-release-title="Tests pass"'), "release packet carries a gate title");
  assert.ok(html.includes('data-release-required="1"'), "release packet carries required state");
  assert.ok(html.includes("function collectProcess()"), "process export collects current DOM state");
  assert.ok(html.includes("function collectVerdicts()"), "verdict export collects current DOM state");
  assert.ok(html.includes("function collectRelease()"), "release export collects current DOM state");
  assert.ok(html.includes("function byAttr("), "imports avoid fragile selector string interpolation");
});

test("mcp helpers normalize packets and validate writes before touching disk", async () => {
  const { handleTool } = await import("../mcp/server.mjs");
  const rendered = await handleTool("dossier_render", {
    model: { dossierVersion: "1.0", meta: { title: "Rendered" }, blocks: [] },
    theme: "forest",
    skin: "console-slate",
    embed: true,
  });
  assert.ok(rendered.content[1].text.includes('data-skin="console-slate"'), "MCP render applies skin flag");
  assert.ok(rendered.content[1].text.includes("--ds-accent: #2f7d55"), "MCP render applies theme flag");
  assert.ok(rendered.content[2].text.includes('data-dossier-embed="true"'), "MCP render can return embed HTML");

  const release = await handleTool("dossier_read_release", {
    release: {
      schema: "dossier.release/v1",
      release: [{ id: "tests", done: true, notes: "green", title: "Tests pass", required: true }],
    },
  });
  const body = JSON.parse(release.content[0].text);
  assert.equal(body.gates[0].id, "tests");
  assert.equal(body.gates[0].title, "Tests pass");
  assert.equal(body.totals.done, 1);

  const dir = mkdtempSync(join(tmpdir(), "dossier-mcp-"));
  const file = join(dir, "mcp.dossier.json");
  writeFileSync(file, JSON.stringify({ dossierVersion: "1.0", meta: { title: "MCP" }, blocks: [] }, null, 2));
  const writeRender = await handleTool("dossier_render", { outPath: file, model: { dossierVersion: "1.0", meta: { title: "Written", slug: "written" }, blocks: [] }, embed: true });
  const writeBody = JSON.parse(writeRender.content[0].text);
  assert.ok(existsSync(writeBody.embedPath), "MCP render writes embed HTML when requested");
  await handleTool("dossier_record_run", { path: file, run: { command: "npm test", status: "passed" } });
  let model = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(model.blocks[0].type, "verification-run");
  assert.equal(model.blocks[0].runs[0].command, "npm test");
  await assert.rejects(
    () => handleTool("dossier_attach_patchset", { path: file, patchSet: { type: "patch-set", title: "Empty", patches: [] } }),
    /invalid dossier after update/
  );
  model = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(model.blocks.length, 1, "invalid write was not persisted");

  await handleTool("dossier_record_claim", {
    path: file,
    title: "Trust",
    sources: [{ id: "npm-test", label: "npm test", kind: "command", trust: "high" }],
    claim: { id: "tests-pass", claim: "Tests pass.", status: "verified", confidence: "high", sources: ["npm-test"] },
  });
  model = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(model.blocks[1].type, "trust-report");
  const trust = await handleTool("dossier_read_trust", { path: file });
  const trustBody = JSON.parse(trust.content[0].text);
  assert.equal(trustBody.totals.claims, 1);
  assert.equal(trustBody.reports[0].byStatus.verified, 1);
  const trustSchema = await handleTool("dossier_get_packet_schema", { name: "trust" });
  assert.ok(trustSchema.content[0].text.includes("dossier.trust/v1"));
});

test("mcp apply and closeout tools update models with packet state", async () => {
  const { handleTool } = await import("../mcp/server.mjs");
  const dir = mkdtempSync(join(tmpdir(), "dossier-mcp-apply-"));
  const file = join(dir, "apply.dossier.json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        dossierVersion: "1.0",
        meta: { title: "Apply", slug: "apply" },
        blocks: [
          { type: "code-editor", id: "config-editor", title: "Config", targetPath: "config.json", code: "{}\n" },
          { type: "process-board", title: "Work", items: [{ id: "config-work", title: "Config work" }] },
          { type: "patch-set", title: "Patches", patches: [{ id: "config-patch", title: "Config patch" }] },
        ],
      },
      null,
      2
    )
  );
  let res = await handleTool("dossier_apply_edits", {
    path: file,
    edits: { schema: "dossier.edits/v1", edits: { "config-editor": { text: "{\n  \"enabled\": true\n}\n" } } },
  });
  assert.equal(JSON.parse(res.content[0].text).applied, 1);
  res = await handleTool("dossier_apply_process", {
    path: file,
    process: { schema: "dossier.process/v1", process: { "config-work": { verdict: "approve", notes: "Ready." } } },
  });
  assert.equal(JSON.parse(res.content[0].text).applied, 1);
  res = await handleTool("dossier_apply_patch_review", {
    path: file,
    patches: { schema: "dossier.patch-review/v1", patches: { "config-patch": { verdict: "approve", notes: "Apply." } } },
  });
  assert.equal(JSON.parse(res.content[0].text).applied, 1);
  await handleTool("dossier_closeout_model", {
    path: file,
    packets: { edits: { edits: { "config-editor": { targetPath: "config.json", text: "x" } } } },
    summary: "Closed out.",
  });
  const model = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(model.blocks[0].code, "{\n  \"enabled\": true\n}\n");
  assert.equal(model.blocks[1].items[0].notes, "Ready.");
  assert.equal(model.blocks[2].patches[0].status, "accepted");
  assert.equal(model.blocks.at(-1).type, "process-receipt");
});

test("state packets merge into models and produce agent handoff prompts", () => {
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Stateful", slug: "stateful" },
    blocks: [
      { type: "review-board", title: "Options", candidates: [{ id: "ship-it", title: "Ship it", summary: "Ready." }] },
      { type: "process-board", title: "Work", items: [{ id: "fix-export", title: "Fix export", summary: "Make exports clear." }] },
      { type: "code-editor", id: "config-editor", title: "Config", targetPath: "config.json", code: "{\"enabled\":false}" },
      { type: "release-checklist", title: "Release", gates: [{ id: "manual-qa", title: "Manual QA", required: true, status: "todo" }] },
      { type: "patch-set", title: "Patches", patches: [{ id: "export-patch", title: "Export patch", status: "proposed" }] },
    ],
  };
  const state = {
    schema: "dossier.state/v1",
    updatedAt: "2026-07-03T00:00:00.000Z",
    packets: {
      decisions: { "ship-it": { selected: true, notes: "Do this first." } },
      process: { "fix-export": { verdict: "approve", notes: "Keep labels explicit." } },
      edits: { "config-editor": { text: "{\"enabled\":true}", targetPath: "config.json", dirty: true } },
      release: { "manual-qa": { done: true, notes: "Passed browser smoke." } },
      patchReview: { "export-patch": { verdict: "approve", notes: "Apply." } },
      evidence: { "browser-smoke": { title: "Browser smoke", kind: "manual", trust: "medium", body: "Export center inspected." } },
    },
  };
  const merged = mergeStateIntoModel(model, state);
  assert.equal(merged.blocks[0].candidates[0].selected, true);
  assert.equal(merged.blocks[1].items[0].verdict, "approve");
  assert.equal(merged.blocks[2].code, "{\"enabled\":true}");
  assert.equal(merged.blocks[3].gates[0].status, "done");
  assert.equal(merged.blocks[4].patches[0].status, "accepted");
  assert.equal(merged.blocks[5].type, "evidence-log");
  const handoff = buildHandoffPacket(model, state);
  assert.equal(handoff.schema, "dossier.handoff/v1");
  assert.equal(handoff.totals.selectedDecisions, 1);
  assert.equal(handoff.totals.dirtyEdits, 1);
  assert.match(promptForModel(model, state), /stable kebab-case ids/);
});

test("mcp state workflow tools read merge diff handoff and prompt packets", async () => {
  const { handleTool } = await import("../mcp/server.mjs");
  const dir = mkdtempSync(join(tmpdir(), "dossier-mcp-state-"));
  const modelPath = join(dir, "stateful.dossier.json");
  const statePath = join(dir, "stateful.state.json");
  const mergedPath = join(dir, "stateful.merged.json");
  const handoffPath = join(dir, "stateful.handoff.json");
  const model = {
    dossierVersion: "1.0",
    kind: "implementation",
    meta: { title: "Stateful MCP", slug: "stateful-mcp" },
    blocks: [
      { type: "review-board", title: "Options", candidates: [{ id: "ship-it", title: "Ship it", summary: "Ready." }] },
      { type: "process-board", title: "Work", items: [{ id: "fix-export", title: "Fix export", summary: "Make exports clear." }] },
      { type: "code-editor", id: "config-editor", title: "Config", targetPath: "config.json", code: "{\"enabled\":false}\n" },
      { type: "release-checklist", title: "Release", gates: [{ id: "manual-qa", title: "Manual QA", required: true, status: "todo" }] },
      { type: "patch-set", title: "Patches", patches: [{ id: "export-patch", title: "Export patch", status: "proposed" }] },
    ],
  };
  const state = {
    schema: "dossier.state/v1",
    slug: "stateful-mcp",
    updatedAt: "2026-07-03T00:00:00.000Z",
    packets: {
      decisions: { "ship-it": { selected: true, notes: "Do this first." } },
      process: { "fix-export": { verdict: "approve", notes: "Keep labels explicit." } },
      edits: { "config-editor": { text: "{\"enabled\":true}\n", targetPath: "config.json", dirty: true } },
      release: { "manual-qa": { done: false, required: true, notes: "Needs browser smoke." } },
      patchReview: { "export-patch": { verdict: "approve", notes: "Apply." } },
      evidence: { "browser-smoke": { title: "Browser smoke", kind: "manual", trust: "medium", body: "Export center inspected." } },
    },
  };
  writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

  let res = await handleTool("dossier_read_state", { path: statePath });
  let body = JSON.parse(res.content[0].text);
  assert.equal(body.schema, "dossier.state/v1");
  assert.equal(body.totals.selectedDecisions, 1);
  assert.equal(body.totals.dirtyEdits, 1);
  assert.equal(body.totals.unresolvedReleaseGates, 1);

  res = await handleTool("dossier_merge_state", { path: modelPath, statePath });
  body = JSON.parse(res.content[0].text);
  assert.equal(body.model.blocks[0].candidates[0].selected, true);
  assert.equal(body.model.blocks[2].code, "{\"enabled\":true}\n");
  assert.ok(body.diff.changed.some((entry) => entry.id === "config-editor"));
  assert.equal(JSON.parse(readFileSync(modelPath, "utf8")).blocks[2].code, "{\"enabled\":false}\n", "merge without outPath does not overwrite source");

  res = await handleTool("dossier_merge_state", { path: modelPath, statePath, outPath: mergedPath });
  body = JSON.parse(res.content[0].text);
  assert.equal(body.path, mergedPath);
  assert.equal(JSON.parse(readFileSync(mergedPath, "utf8")).blocks[2].code, "{\"enabled\":true}\n");

  res = await handleTool("dossier_diff_state", { path: modelPath, statePath });
  body = JSON.parse(res.content[0].text);
  assert.ok(body.changed.some((entry) => entry.id === "config-editor"));
  assert.ok(body.added.some((entry) => entry.type === "evidence-log"));

  res = await handleTool("dossier_read_handoff", { path: modelPath, statePath });
  body = JSON.parse(res.content[0].text);
  assert.equal(body.schema, "dossier.handoff/v1");
  assert.equal(body.totals.selectedDecisions, 1);
  assert.equal(body.unresolvedReleaseGates.length, 1);
  writeFileSync(handoffPath, JSON.stringify(body.handoff, null, 2) + "\n");
  res = await handleTool("dossier_read_handoff", { handoffPath });
  body = JSON.parse(res.content[0].text);
  assert.equal(body.handoff.schema, "dossier.handoff/v1");

  res = await handleTool("dossier_prompt", { path: modelPath, statePath });
  assert.match(res.content[0].text, /Keep export semantics clear/);
  const handoffSchema = await handleTool("dossier_get_packet_schema", { name: "handoff.schema.json" });
  assert.ok(handoffSchema.content[0].text.includes("dossier.handoff/v1"));
});

test("lint warns about agent handoff quality issues", () => {
  const result = lintModel({
    dossierVersion: "1.0",
    meta: { title: "Lint" },
    blocks: [
      { type: "code-editor", title: "Missing target", code: "x" },
      { type: "trust-report", title: "Trust", sources: [{ id: "source-one", label: "Source" }], claims: [{ id: "claim-one", claim: "Claim", sources: ["missing-source"], evidence: ["missing-evidence"] }] },
      { type: "release-checklist", title: "Release", gates: [{ id: "gate-one", title: "Gate", required: true, status: "done" }] },
      { type: "prose", markdown: "Missing footnote[^src]." },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((warning) => /targetPath/.test(warning.message)));
  assert.ok(result.warnings.some((warning) => /missing source/.test(warning.message)));
  assert.ok(result.warnings.some((warning) => /missing evidence/.test(warning.message)));
  assert.ok(result.warnings.some((warning) => /release gate/.test(warning.message)));
  assert.ok(result.warnings.some((warning) => /footnote reference/.test(warning.message)));
});

test("serve exposes validated save-back and patch import endpoints", async () => {
  const { serve } = await import("../src/serve.mjs");
  const dir = mkdtempSync(join(tmpdir(), "dossier-serve-"));
  const file = join(dir, "live.dossier.json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        dossierVersion: "1.0",
        kind: "implementation",
        meta: { title: "Live", slug: "live" },
        blocks: [{ type: "code-editor", title: "Untitled editor", lang: "js", code: "const a = 1;\n" }],
      },
      null,
      2
    )
  );
  const live = await serve(file, { port: 0, quiet: true, theme: "forest", skin: "console-slate" });
  try {
    let res = await fetch(live.url + "/__save-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled editor", text: "const a = 2;\n" }),
    });
    assert.equal(res.status, 403, "write endpoints reject missing save tokens");
    res = await fetch(live.url + "/__save-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dossier-Token": live.saveToken },
      body: JSON.stringify({ title: "Untitled editor", text: "const a = 2;\n" }),
    });
    assert.equal(res.ok, true, await res.text());
    let model = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(model.blocks[0].code, "const a = 2;\n");

    res = await fetch(live.url + "/__append-patchset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dossier-Token": live.saveToken },
      body: JSON.stringify({ type: "patch-set", title: "Empty", patches: [] }),
    });
    assert.equal(res.status, 400);
    model = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(model.blocks.length, 1, "invalid patch import was not persisted");

    res = await fetch(live.url + "/__append-patchset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dossier-Token": live.saveToken },
      body: JSON.stringify({ type: "patch-set", title: "Imported", patches: [{ id: "patch-one", title: "Patch one" }] }),
    });
    assert.equal(res.ok, true, await res.text());
    model = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(model.blocks[1].type, "patch-set");

    res = await fetch(live.url + "/__save-model", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dossier-Token": live.saveToken },
      body: JSON.stringify({
        model: {
          dossierVersion: "1.0",
          kind: "implementation",
          meta: { title: "Live saved", slug: "live" },
          blocks: [{ type: "prose", markdown: "Saved from model editor." }],
        },
      }),
    });
    assert.equal(res.ok, true, await res.text());
    model = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(model.meta.title, "Live saved");

    res = await fetch(live.url);
    const html = await res.text();
    assert.ok(html.includes("DossierEditorEnhancer"), "live runtime includes editor enhancer");
    assert.ok(html.includes("DossierCodeMirrorEnhancer"), "live runtime includes CodeMirror enhancer bootstrap");
    assert.ok(html.includes("__dossier-codemirror.mjs"), "live runtime loads the local CodeMirror module");
    assert.ok(html.includes("function $$(s,r)"), "live runtime keeps literal selector helper names when injected");
    assert.ok(html.includes("data-live-model-open"), "live runtime includes model editor control");
    assert.ok(html.includes('data-skin="console-slate"'), "serve applies skin flag");
    assert.ok(html.includes("--ds-accent: #2f7d55"), "serve applies theme flag");

    res = await fetch(live.url + "/__dossier-codemirror.mjs");
    const bootstrap = await res.text();
    assert.equal(res.ok, true, bootstrap);
    assert.ok(bootstrap.includes("EditorView.updateListener"), "CodeMirror bootstrap syncs editor changes");
    assert.ok(bootstrap.includes("dossier:codemirror-ready"), "CodeMirror bootstrap notifies the host adapter");

    res = await fetch(live.url + "/__cm/codemirror.mjs");
    const cmModule = await res.text();
    assert.equal(res.ok, true, cmModule);
    assert.ok(cmModule.includes("basicSetup"), "serve exposes local CodeMirror package modules");
  } finally {
    await live.close();
  }
});

test("plugins: a registered block validates and renders", async () => {
  const { registerBlock } = await import("../src/index.mjs");
  registerBlock("badge-test", (b) => `<section class="ds-block" data-block="badge-test">${b.label || ""}</section>`);
  const model = { dossierVersion: "1.0", meta: { title: "x" }, blocks: [{ type: "badge-test", label: "hi" }] };
  assert.equal(validateModel(model).ok, true, "registered type passes validation");
  const { html } = await generate(structuredClone(model), {});
  assert.ok(/data-block="badge-test"/.test(html), "registered block renders");
});

test("packs register templates and only load trusted render plugins", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dossier-pack-"));
  const packDir = join(dir, "engineering-pack");
  mkdirSync(join(packDir, "templates"), { recursive: true });
  mkdirSync(join(packDir, "plugins"), { recursive: true });
  writeFileSync(
    join(packDir, "dossier.pack.json"),
    JSON.stringify(
      {
        name: "Engineering Pack",
        version: "1.0.0",
        templates: [{ id: "security-review", title: "Security review", kind: "review", path: "templates/security-review.dossier.json" }],
        plugins: [{ id: "badge", description: "Badge block", entry: "plugins/badge.plugin.mjs", permissions: ["render"] }],
      },
      null,
      2
    )
  );
  writeFileSync(
    join(packDir, "templates/security-review.dossier.json"),
    JSON.stringify({ dossierVersion: "1.0", kind: "review", meta: { title: "Security review", slug: "replace-with-slug" }, blocks: [{ type: "prose", markdown: "Review scope." }] }, null, 2)
  );
  writeFileSync(
    join(packDir, "plugins/badge.plugin.mjs"),
    `export default function ({ registerBlock, esc }) {
  registerBlock("pack-badge-test", (b) => '<section class="ds-block" data-block="pack-badge-test">' + esc(b.label || "") + '</section>');
}
`
  );

  const entry = addPack(packDir, { cwd: dir });
  assert.equal(entry.name, "engineering-pack");
  assert.equal(entry.trusted, false);
  assert.equal(listPacks({ cwd: dir }).length, 1);

  const resolved = resolveTemplateRef("engineering-pack/security-review", { cwd: dir });
  assert.equal(resolved.template.kind, "review");
  assert.equal(resolved.model.meta.slug, "replace-with-slug");

  await assert.rejects(
    () => loadTrustedPackPlugins(["engineering-pack"], { registerBlock, esc, inlineMd, slugify }, { cwd: dir }),
    /not trusted/
  );

  trustPack("engineering-pack", { cwd: dir });
  const loaded = await loadTrustedPackPlugins(["engineering-pack"], { registerBlock, esc, inlineMd, slugify }, { cwd: dir });
  assert.deepEqual(
    loaded.map((plugin) => `${plugin.pack}/${plugin.id}`),
    ["engineering-pack/badge"]
  );
  const model = { dossierVersion: "1.0", meta: { title: "Pack plugin" }, blocks: [{ type: "pack-badge-test", label: "<ready>" }] };
  assert.equal(validateModel(model).ok, true);
  const { html } = await generate(structuredClone(model), {});
  assert.ok(html.includes('data-block="pack-badge-test"'));
  assert.ok(html.includes("&lt;ready&gt;"));
});

test("cli unknown subcommands exit nonzero", () => {
  const cli = join(root, "bin", "dossier.mjs");
  for (const args of [
    ["workspace", "nope"],
    ["release", "nope"],
    ["pack", "nope"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stdout + result.stderr, /Usage:/, args.join(" "));
  }
});

test("example pack templates validate", () => {
  const packDir = join(examplesDir, "packs", "engineering");
  const manifest = readPackManifest(packDir);
  assert.equal(manifest.name, "engineering");
  for (const template of manifest.templates) {
    const model = JSON.parse(readFileSync(join(packDir, template.path), "utf8"));
    assert.deepEqual(validateModel(model).errors, [], template.id);
  }
});

test("renderer sanitizes hostile input (href schemes, theme vars, ragged rows)", async () => {
  const { html } = await generate({
    dossierVersion: "1.0",
    meta: { title: "X", theme: { accent: "red;} body{display:none}", "ev<il": "x" } },
    blocks: [
      { type: "references", items: [{ label: "bad", url: "javascript:alert(1)" }, { label: "ok", url: "https://example.com" }] },
      { type: "table", columns: ["A"], rows: [["fine"], "notarow", null] },
    ],
  });
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const themeDecl = [...style.matchAll(/:root\{([^}]*)\}/g)].map((m) => m[1]).find((decl) => decl.includes("--ds-accent: red"));
  assert.ok(!/href="javascript:/.test(html), "javascript: href is neutralized");
  assert.ok(html.includes('href="https://example.com"'), "safe href passes through");
  assert.ok(themeDecl, "the sanitized document theme declaration is present");
  assert.ok(!themeDecl.includes("{") && !themeDecl.includes("<"), "theme value cannot break out of its CSS declaration");
  assert.ok(html.includes("<td>fine</td>"), "valid row renders; non-array rows do not crash");
});

test("presentation options layer base CSS, skin CSS, and document theme overrides", async () => {
  const model = {
    dossierVersion: "1.0",
    meta: { title: "Styled", slug: "styled", theme: { accent: "#123456" } },
    blocks: [{ type: "hero", title: "Styled", sideCards: [{ label: "Skin", value: "Console Slate" }] }],
  };
  const { html } = await generate(model, { theme: "amber", skin: "console-slate" });
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(html.includes('data-skin="console-slate"'), "HTML records the active skin");
  assert.ok(style.includes("skin:console-slate"), "skin CSS is present");
  assert.ok(
    style.indexOf("--ds-accent:#c81e4a") < style.indexOf("skin:console-slate") &&
      style.indexOf("skin:console-slate") < style.lastIndexOf("--ds-accent: #123456"),
    "cascade order is base CSS, then skin, then explicit meta.theme"
  );
  assert.ok(style.includes("--ds-accent-2: #a06409"), "theme pack tokens are merged when not overridden");
  const island = JSON.parse(html.match(/id="dossier-model">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, "<"));
  assert.equal(island.meta.skin, "console-slate");
  assert.equal(island.meta.theme.accent, "#123456");
});

test("author-supplied _svg/_math fields are dropped (no raw HTML injection)", async () => {
  const { html } = await generate({
    dossierVersion: "1.0",
    meta: { title: "X" },
    blocks: [{ type: "diagram", format: "dot", spec: "not valid dot", _svg: "<script>alert(1)</script>" }, { type: "math", tex: "x", _math: "<img src=x onerror=alert(1)>" }],
  });
  assert.ok(!/<script>alert\(1\)<\/script>/.test(html), "smuggled _svg is not injected");
  assert.ok(!/onerror=alert/.test(html), "smuggled _math is not injected");
});

test("markdown frontmatter survives titles with colons and newlines", async () => {
  const { md } = await generate({ dossierVersion: "1.0", meta: { title: "a: b\n---\nx: y" }, blocks: [] });
  assert.ok(md.includes('title: "a: b\\n---\\nx: y"'), "title is a single quoted YAML scalar (newlines/colons escaped)");
  assert.ok(md.startsWith("---\ntitle:"), "frontmatter opens cleanly");
});

test("export to docx produces a valid Word document", async () => {
  const { exportDocx } = await import("../src/export.mjs");
  const buf = await exportDocx({ meta: { title: "X" }, blocks: [{ type: "hero", title: "H" }, { type: "prose", markdown: "hi" }, { type: "table", columns: ["A"], rows: [["1"]] }] });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0, "returns a buffer");
  assert.equal(buf.slice(0, 2).toString(), "PK", "is a zip (docx) file");
});

test("docx export embeds chart and figure as images", async () => {
  const { exportDocx } = await import("../src/export.mjs");
  const buf = await exportDocx({
    meta: { title: "X" },
    blocks: [
      { type: "chart", chartType: "bar", data: [{ label: "a", value: 3 }, { label: "b", value: 5 }] },
      { type: "figure", src: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='10'%20height='10'%3E%3Crect%20width='10'%20height='10'/%3E%3C/svg%3E" },
    ],
  });
  const s = buf.toString("latin1");
  assert.ok((s.match(/word\/media\/[0-9a-f]+\.png/g) || []).length >= 2, "chart + figure both embed as PNG");
});

test("catalog indexes a folder and finds cross-links", async () => {
  const { buildCatalogModel } = await import("../src/catalog.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "dossier-cat-"));
  writeFileSync(join(d, "a.dossier.json"), JSON.stringify({ meta: { title: "A", slug: "a" }, blocks: [{ type: "prose", markdown: "see [[b]]" }] }));
  writeFileSync(join(d, "b.dossier.json"), JSON.stringify({ meta: { title: "B", slug: "b" }, blocks: [] }));
  const { docs, model } = buildCatalogModel(d, {});
  assert.equal(docs.length, 2);
  assert.ok(docs.find((x) => x.slug === "a").links.includes("b"), "cross-link found");
  assert.ok(model.blocks.some((b) => b.type === "table"), "catalog has a document table");
});

test("publish builds a static dossier site with catalog index", async () => {
  const { publishDir } = await import("../src/publish.mjs");
  const d = mkdtempSync(join(tmpdir(), "dossier-publish-"));
  const out = join(d, "public");
  writeFileSync(join(d, "a.dossier.json"), JSON.stringify({ dossierVersion: "1.0", meta: { title: "A", slug: "a" }, blocks: [{ type: "prose", markdown: "see [[b]]" }] }, null, 2));
  writeFileSync(join(d, "b.dossier.json"), JSON.stringify({ dossierVersion: "1.0", meta: { title: "B", slug: "b" }, blocks: [{ type: "callout", body: "B" }] }, null, 2));
  const result = await publishDir(d, { out, title: "Published", theme: "forest", skin: "console-slate", embed: true });
  assert.equal(result.docs.length, 2);
  assert.ok(existsSync(join(out, "a.html")), "published document html");
  assert.ok(existsSync(join(out, "a.embed.html")), "published document embed html");
  assert.ok(existsSync(join(out, "a.md")), "published document markdown");
  assert.ok(existsSync(join(out, "index.html")), "published catalog html");
  assert.ok(existsSync(join(out, "index.embed.html")), "published catalog embed html");
  assert.ok(existsSync(join(out, "index.dossier.json")), "published catalog source");
  const html = readFileSync(join(out, "a.html"), "utf8");
  assert.ok(html.includes('data-skin="console-slate"'), "publish applies skin flag");
  assert.ok(html.includes("--ds-accent: #2f7d55"), "publish applies theme flag");
  const embed = readFileSync(join(out, "a.embed.html"), "utf8");
  assert.ok(embed.includes('data-dossier-embed="true"'), "publish applies embed flag");
  assert.ok(embed.includes('data-skin="console-slate"'), "publish embed keeps skin flag");
});

test("workspace scans dossiers, builds an agent status index, queries, and publishes", async () => {
  const d = mkdtempSync(join(tmpdir(), "dossier-workspace-"));
  const docsDir = join(d, "docs");
  const ignoredDir = join(d, "packs");
  mkdirSync(docsDir, { recursive: true });
  mkdirSync(ignoredDir, { recursive: true });
  writeWorkspaceManifest(join(d, WORKSPACE_MANIFEST), createWorkspaceManifest({ name: "QA Workspace", roots: ["."], exclude: ["packs"], output: "public" }));
  writeFileSync(
    join(docsDir, "implementation.dossier.json"),
    JSON.stringify(
      {
        dossierVersion: "1.0",
        kind: "implementation",
        meta: { title: "Implementation plan", slug: "implementation-plan", status: "active", owner: "agent", tags: ["qa"], updated: "2026-01-01" },
        blocks: [
          { type: "prose", markdown: "Coordinates with [[release-notes]] and [[missing-note]]." },
          { type: "process-board", title: "Work", items: [{ id: "wire-cli", title: "Wire CLI", status: "doing", verdict: "undecided", owner: "agent" }] },
          { type: "release-checklist", title: "Release", gates: [{ id: "manual-qa", title: "Manual QA complete", status: "pending", required: true, evidence: "Run the demo." }] },
          {
            type: "trust-report",
            title: "Trust",
            sources: [{ id: "local-test", label: "Local test", kind: "command", trust: "medium" }],
            claims: [{ id: "tests-pass", claim: "Tests pass.", status: "pending", confidence: "medium", sources: ["local-test"] }],
          },
        ],
      },
      null,
      2
    )
  );
  writeFileSync(
    join(docsDir, "release.dossier.json"),
    JSON.stringify(
      {
        dossierVersion: "1.0",
        kind: "release",
        meta: { title: "Release notes", slug: "release-notes", status: "durable", tags: ["release"], updated: "2026-01-02" },
        blocks: [{ type: "release-checklist", title: "Release", gates: [{ id: "tests", title: "Tests pass", status: "passed", required: true }] }],
      },
      null,
      2
    )
  );
  writeFileSync(join(ignoredDir, "template.dossier.json"), JSON.stringify({ dossierVersion: "1.0", meta: { title: "Ignored", slug: "ignored" }, blocks: [] }, null, 2));

  const scan = scanWorkspace(join(d, WORKSPACE_MANIFEST));
  assert.equal(scan.docs.length, 2);
  assert.equal(scan.summary.openProcessItems, 1);
  assert.equal(scan.summary.openReleaseGates, 1);
  assert.equal(scan.summary.trustGaps, 1);
  assert.equal(scan.summary.brokenLinks, 1);

  const index = buildWorkspaceIndex(join(d, WORKSPACE_MANIFEST), { updated: "2026-01-03T00:00:00.000Z" });
  assert.deepEqual(validateModel(index.model).errors, []);
  assert.ok(index.model.blocks.some((block) => block.type === "process-board" && block.title === "Agent work queue"));
  assert.ok(index.model.blocks.some((block) => block.type === "trust-report"), "trust gaps are agent-readable");

  const releaseNeeds = queryWorkspace(scan, { needs: "release" });
  assert.deepEqual(
    releaseNeeds.map((doc) => doc.slug),
    ["implementation-plan"]
  );

  const written = await writeWorkspaceIndex(join(d, WORKSPACE_MANIFEST), { updated: "2026-01-03T00:00:00.000Z" });
  assert.ok(existsSync(written.outPath), "writes workspace index JSON");
  assert.ok(existsSync(join(d, "workspace-index.html")), "renders workspace index HTML");

  const published = await publishWorkspace(join(d, WORKSPACE_MANIFEST), { out: "public", updated: "2026-01-03T00:00:00.000Z" });
  assert.equal(published.rendered.length, 2);
  assert.ok(existsSync(join(d, "public", "implementation-plan.html")), "publishes workspace document");
  assert.ok(existsSync(join(d, "public", "workspace-index.html")), "publishes workspace index");
});

test("workspace surfaces invalid dossiers without crashing and blocks publish", async () => {
  const d = mkdtempSync(join(tmpdir(), "dossier-workspace-invalid-"));
  writeWorkspaceManifest(join(d, WORKSPACE_MANIFEST), createWorkspaceManifest({ name: "Invalid Workspace", roots: ["."], output: "public" }));
  writeFileSync(join(d, "valid.dossier.json"), JSON.stringify({ dossierVersion: "1.0", meta: { title: "Valid", slug: "valid" }, blocks: [] }, null, 2));
  writeFileSync(join(d, "broken.dossier.json"), "{ not json");

  const scan = scanWorkspace(join(d, WORKSPACE_MANIFEST));
  assert.equal(scan.docs.length, 2);
  assert.equal(scan.summary.invalidDocs, 1);
  const broken = scan.docs.find((doc) => doc.slug === "broken");
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.length > 0, "invalid docs keep parser or validation errors");

  const invalidNeeds = queryWorkspace(scan, { needs: "invalid" });
  assert.deepEqual(
    invalidNeeds.map((doc) => doc.slug),
    ["broken"]
  );

  const index = buildWorkspaceIndex(join(d, WORKSPACE_MANIFEST), { updated: "2026-01-03T00:00:00.000Z" });
  assert.deepEqual(validateModel(index.model).errors, []);
  const queue = index.model.blocks.find((block) => block.type === "process-board" && block.title === "Agent work queue");
  assert.ok(queue.items.some((item) => item.files.includes("broken.dossier.json")), "invalid document is added to the agent work queue");

  const written = await writeWorkspaceIndex(join(d, WORKSPACE_MANIFEST), { updated: "2026-01-03T00:00:00.000Z" });
  assert.ok(existsSync(written.outPath), "invalid workspace still writes a diagnostic index");
  assert.ok(existsSync(join(d, "workspace-index.html")), "invalid workspace still renders diagnostic HTML");

  await assert.rejects(() => publishWorkspace(join(d, WORKSPACE_MANIFEST), { out: "public" }), /workspace contains invalid dossier/);
});

test("release evidence collects git range, gates, trust claims, and rendered artifacts", async () => {
  const d = mkdtempSync(join(tmpdir(), "dossier-release-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: d, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "release-fixture", version: "0.2.0" }, null, 2));
  git("init");
  git("config", "user.email", "agent@example.com");
  git("config", "user.name", "Agent");
  git("add", "package.json");
  git("commit", "-m", "Initial release");
  git("tag", "v0.1.0");
  writeFileSync(join(d, "feature.txt"), "ship it\n");
  git("add", "feature.txt");
  git("commit", "-m", "Add release feature");

  const evidence = collectReleaseEvidence({
    cwd: d,
    version: "0.2.0",
    since: "v0.1.0",
    checks: "npm test,npm pack --dry-run --json",
    generatedAt: "2026-01-04T00:00:00.000Z",
  });
  assert.equal(evidence.summary.version, "0.2.0");
  assert.equal(evidence.summary.since, "v0.1.0");
  assert.equal(evidence.summary.commits, 1);
  assert.ok(evidence.changedFiles.includes("feature.txt"));
  assert.deepEqual(validateModel(evidence.model).errors, []);
  assert.ok(evidence.model.blocks.some((block) => block.type === "release-checklist"));
  assert.ok(evidence.model.blocks.some((block) => block.type === "trust-report"));

  const firstRelease = collectReleaseEvidence({
    cwd: d,
    version: "0.2.0",
    since: "",
    checks: "npm test",
    generatedAt: "2026-01-04T00:00:00.000Z",
  });
  assert.equal(firstRelease.summary.range, "HEAD");
  assert.ok(firstRelease.changedFiles.includes("package.json"), "first release evidence includes tracked files");
  assert.ok(firstRelease.changedFiles.includes("feature.txt"), "first release evidence includes later tracked files");

  const written = await writeReleaseEvidence({
    cwd: d,
    version: "0.2.0",
    since: "v0.1.0",
    checks: "npm test,npm pack --dry-run --json",
    generatedAt: "2026-01-04T00:00:00.000Z",
    out: "docs/releases/0.2.0.dossier.json",
  });
  assert.ok(existsSync(join(d, written.outPath)), "writes release dossier JSON");
  assert.ok(existsSync(join(d, written.htmlPath)), "renders release evidence HTML");
  assert.ok(existsSync(join(d, written.mdPath)), "renders release evidence Markdown");
});

test("diff detects added and changed blocks", () => {
  const a = { meta: { title: "A" }, blocks: [{ id: "x", type: "callout", body: "1" }] };
  const b = { meta: { title: "A" }, blocks: [{ id: "x", type: "callout", body: "2" }, { id: "y", type: "callout", body: "new" }] };
  const d = diffModels(a, b);
  assert.equal(d.added.length, 1);
  assert.equal(d.changed.length, 1);
  assert.equal(d.removed.length, 0);
});
