#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildHandoffPacket, diffStateAgainstModel, formatLintWarnings, generateFile, lintModel, mergeStateIntoModel, promptForModel, validateModel, registerBlock, esc, inlineMd, slugify } from "../src/index.mjs";
import { addPack, listPacks, loadTrustedPackPlugins, resolveTemplateRef, trustPack } from "../src/packs.mjs";
import {
  WORKSPACE_MANIFEST,
  createWorkspaceManifest,
  publishWorkspace,
  queryWorkspace,
  scanWorkspace,
  writeWorkspaceIndex,
  writeWorkspaceManifest,
} from "../src/workspace.mjs";
import { writeReleaseEvidence } from "../src/release.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
// pull out --flags; rest are positional
const VALUE_FLAGS = new Set([
  "kind",
  "out",
  "plugin",
  "pack",
  "template",
  "port",
  "title",
  "base-url",
  "format",
  "theme",
  "skin",
  "name",
  "ref",
  "roots",
  "exclude",
  "status",
  "tag",
  "owner",
  "needs",
  "text",
  "version",
  "since",
  "checks",
  "updated",
  "state",
]);
const flags = {};
const args = [];
const rest = argv.slice(1);
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq >= 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const name = a.slice(2);
      const next = rest[i + 1];
      if (VALUE_FLAGS.has(name) && next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else flags[name] = true;
    }
  } else args.push(a);
}

const STARTERS = [
  "dossier",
  "plan",
  "implementation",
  "review",
  "debug",
  "integration-loop",
  "release",
  "incident",
  "adr",
  "runbook",
  "postmortem",
  "review-board",
];

const USAGE = [
  "Dossier, self-contained, agent-readable HTML documents from one JSON file.",
  "",
  "Usage:",
  "  dossier init [name] [--kind <kind>]      scaffold <name>.dossier.json from a starter",
  "  dossier build <file.dossier.json> ...    validate + render to <slug>.html (+ .md)",
  "  dossier serve <file.dossier.json>        build + live-reload dev server (--open, --port)",
  "  dossier validate <file.dossier.json> ... check a model without rendering",
  "  dossier lint <file.dossier.json> ...     warn about authoring, trust, and packet quality issues",
  "  dossier diff <old.json> <new.json>      structural diff between two versions",
  "  dossier catalog <dir>                    index a folder of dossiers (+ link graph)",
  "  dossier publish <dir> [--out <dir>]      build a static dossier site with catalog index",
  "  dossier export <file> --format docx|md|pdf|json|merged-json|handoff|state-diff|prompt  export source, state-applied, or agent packets",
  "  dossier prompt <file.dossier.json>       print an AI authoring/update prompt for this dossier",
  "  dossier pack add <repo-or-path>          register a local or Git-backed template/plugin pack",
  "  dossier pack trust <name>                allow a registered pack to load render plugins",
  "  dossier pack list                        list registered packs from dossier.lock.json",
  "  dossier workspace init [dir]             create dossier.workspace.json",
  "  dossier workspace index [manifest|dir]   build workspace-index.dossier.json (+ HTML)",
  "  dossier workspace status [manifest|dir]  print agent-readable workspace status",
  "  dossier workspace query [manifest|dir]   filter workspace docs (--kind, --tag, --needs)",
  "  dossier workspace publish [manifest|dir] publish all workspace dossiers into a static site",
  "  dossier release collect                  collect release evidence into a dossier",
  "  dossier mcp                              run the MCP server (stdio) for agents",
  "",
  "Starters (--kind): " + STARTERS.join(", "),
  "Flags: --theme <pack>, --skin console-slate, --embed (write <slug>.embed.html), --no-validate (build without validating), --strict (fail on lint warnings), --state <packet.json>, --pack <name>, --template <pack/id>",
].join("\n");

async function loadPacksFromFlag() {
  if (flags.pack) {
    const packs = String(flags.pack)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await loadTrustedPackPlugins(packs, { registerBlock, esc, inlineMd, slugify });
  }
}

if (cmd === "build" && args.length) {
  try {
    await loadPacksFromFlag();
  } catch (e) {
    console.error("✗ pack plugin: " + e.message);
    process.exit(1);
  }
  if (flags.plugin) {
    for (const p of String(flags.plugin).split(",").map((s) => s.trim()).filter(Boolean)) {
      try {
        const mod = await import(pathToFileURL(resolve(p)).href);
        if (typeof mod.default === "function") mod.default({ registerBlock, esc, inlineMd, slugify });
      } catch (e) {
        console.error("✗ plugin " + p + ": " + e.message);
        process.exitCode = 1;
      }
    }
  }
  for (const f of args) {
    try {
      const r = await generateFile(f, { validate: flags["no-validate"] ? false : true, strict: !!flags.strict, theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
      console.log("✓ " + r.htmlPath);
      if (r.embedPath) console.log("  embed: " + r.embedPath);
      if (r.lint && r.lint.length) console.warn("  lint:\n  - " + r.lint.map((w) => `${w.path}: ${w.message}`).join("\n  - "));
    } catch (e) {
      console.error("✗ " + f + ":\n  " + e.message.replace(/\n/g, "\n  "));
      process.exitCode = 1;
    }
  }
  if (flags.watch) {
    const { watch } = await import("node:fs");
    console.log("watching " + args.join(", ") + ", Ctrl-C to stop");
    for (const f of args) {
      let t;
      watch(f, () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          try {
            const r = await generateFile(f, { validate: flags["no-validate"] ? false : true, strict: !!flags.strict, theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
            console.log("↻ " + r.htmlPath);
            if (r.embedPath) console.log("  embed: " + r.embedPath);
            if (r.lint && r.lint.length) console.warn("  lint:\n  - " + r.lint.map((w) => `${w.path}: ${w.message}`).join("\n  - "));
          } catch (e) {
            console.error("✗ " + e.message.replace(/\n/g, "\n  "));
          }
        }, 80);
      });
    }
  }
} else if (cmd === "serve" && args.length) {
  const { serve } = await import("../src/serve.mjs");
  await serve(args[0], { port: flags.port, open: !!flags.open, theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
} else if (cmd === "mcp") {
  const { main } = await import("../mcp/server.mjs");
  await main();
} else if (cmd === "validate" && args.length) {
  for (const f of args) {
    try {
      const model = JSON.parse(readFileSync(f, "utf8"));
      const { ok, errors } = validateModel(model);
      if (ok) console.log("✓ " + f + " is valid");
      else {
        console.error("✗ " + f + ":\n  - " + errors.join("\n  - "));
        process.exitCode = 1;
      }
    } catch (e) {
      console.error("✗ " + f + ": " + e.message);
      process.exitCode = 1;
    }
  }
} else if (cmd === "lint" && args.length) {
  for (const f of args) {
    try {
      const model = JSON.parse(readFileSync(f, "utf8"));
      const { warnings } = lintModel(model);
      if (!warnings.length) console.log("✓ " + f + " has no lint warnings");
      else {
        console.warn("⚠ " + f + ":\n  - " + formatLintWarnings(warnings).replace(/\n/g, "\n  - "));
        if (flags.strict) process.exitCode = 1;
      }
    } catch (e) {
      console.error("✗ " + f + ": " + e.message);
      process.exitCode = 1;
    }
  }
} else if (cmd === "diff" && args.length >= 2) {
  const { diffModels, formatDiff } = await import("../src/diff.mjs");
  try {
    const oldM = JSON.parse(readFileSync(args[0], "utf8"));
    const newM = JSON.parse(readFileSync(args[1], "utf8"));
    console.log(`diff ${args[0]} → ${args[1]}`);
    console.log(formatDiff(diffModels(oldM, newM)));
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "catalog" && args.length) {
  const { buildCatalogModel } = await import("../src/catalog.mjs");
  try {
    const dir = args[0];
    const { model, docs } = buildCatalogModel(dir, { title: flags.title, baseUrl: flags["base-url"] });
    const outPath = flags.out || join(dir, "index.dossier.json");
    writeFileSync(outPath, JSON.stringify(model, null, 2) + "\n");
    const r = await generateFile(outPath, { theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
    console.log(`✓ ${r.htmlPath}  (${docs.length} documents)`);
    if (r.embedPath) console.log("  embed: " + r.embedPath);
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "publish" && args.length) {
  const { publishDir } = await import("../src/publish.mjs");
  try {
    const r = await publishDir(args[0], { out: flags.out, title: flags.title, baseUrl: flags["base-url"], theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
    console.log(`✓ published ${r.docs.length} dossier${r.docs.length === 1 ? "" : "s"} to ${r.outDir}`);
    console.log(`  index: ${r.index.htmlPath}`);
    if (r.index.embedPath) console.log(`  embed index: ${r.index.embedPath}`);
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "workspace") {
  const sub = args[0];
  const input = args[1] || ".";
  try {
    if (sub === "init") {
      const dir = resolve(input);
      const outPath = join(dir, WORKSPACE_MANIFEST);
      if (existsSync(outPath)) {
        console.error("✗ " + outPath + " already exists");
        process.exit(1);
      }
      const manifest = createWorkspaceManifest({
        name: flags.name || basename(dir) || "Dossier Workspace",
        roots: flags.roots || ".",
        exclude: flags.exclude || [],
        packs: flags.pack || [],
        output: flags.out || "site",
      });
      writeWorkspaceManifest(outPath, manifest);
      console.log(`✓ wrote ${outPath}`);
      console.log("  next: dossier workspace index " + outPath);
    } else if (sub === "index") {
      await loadPacksFromFlag();
      const r = await writeWorkspaceIndex(input, { out: flags.out, title: flags.title, baseUrl: flags["base-url"], updated: flags.updated, theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
      console.log(`✓ ${r.outPath}  (${r.docs.length} dossiers)`);
      if (r.rendered) {
        console.log(`  html: ${r.rendered.htmlPath}`);
        if (r.rendered.embedPath) console.log(`  embed: ${r.rendered.embedPath}`);
      }
    } else if (sub === "status") {
      const r = scanWorkspace(input);
      if (flags.json) {
        console.log(JSON.stringify({ manifest: r.manifest, summary: r.summary, docs: r.docs.map(({ model, path, ...doc }) => doc) }, null, 2));
      } else {
        console.log(`${r.manifest.name}: ${r.summary.docs} dossiers`);
        console.log(`  open process: ${r.summary.openProcessItems}`);
        console.log(`  release gaps: ${r.summary.openReleaseGates}`);
        console.log(`  trust gaps: ${r.summary.trustGaps}`);
        console.log(`  missing links: ${r.summary.brokenLinks}`);
        console.log(`  invalid docs: ${r.summary.invalidDocs}`);
      }
    } else if (sub === "query") {
      const docs = queryWorkspace(input, { kind: flags.kind, status: flags.status, tag: flags.tag, owner: flags.owner, needs: flags.needs, text: flags.text });
      const rows = docs.map(({ model, path, processItems, releaseGates, trustClaims, verificationRuns, ...doc }) => ({
        ...doc,
        openProcessItems: doc.openProcessItems || 0,
        openReleaseGates: doc.openReleaseGates || 0,
        trustGaps: doc.trustGaps || 0,
        processItems: processItems.length,
        releaseGates: releaseGates.length,
        trustClaims: trustClaims.length,
        verificationRuns: verificationRuns.length,
      }));
      if (flags.json) console.log(JSON.stringify(rows, null, 2));
      else if (!rows.length) console.log("No matching dossiers.");
      else rows.forEach((doc) => console.log(`${doc.slug}  ${doc.kind}  ${doc.status || "-"}  ${doc.file}`));
    } else if (sub === "publish") {
      await loadPacksFromFlag();
      const r = await publishWorkspace(input, { out: flags.out, title: flags.title, baseUrl: flags["base-url"], updated: flags.updated, theme: flags.theme, skin: flags.skin, embed: !!flags.embed });
      console.log(`✓ published ${r.rendered.length} dossier${r.rendered.length === 1 ? "" : "s"} to ${r.outDir}`);
      console.log(`  index: ${r.index.rendered.htmlPath}`);
    } else {
      console.log("Usage: dossier workspace init [dir] [--name <name>] [--roots <a,b>] [--exclude <dir,dir>]\n       dossier workspace index [manifest|dir] [--out <file>]\n       dossier workspace status [manifest|dir] [--json]\n       dossier workspace query [manifest|dir] [--kind <kind>] [--tag <tag>] [--needs process|release|trust|invalid]\n       dossier workspace publish [manifest|dir] [--out <dir>]");
      process.exit(1);
    }
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "release") {
  const sub = args[0];
  try {
    if (sub === "collect") {
      const r = await writeReleaseEvidence({
        version: flags.version,
        since: flags.since,
        out: flags.out,
        checks: flags.checks,
        generatedAt: flags.updated,
        theme: flags.theme,
        skin: flags.skin,
        embed: !!flags.embed,
      });
      if (flags.json) {
        console.log(JSON.stringify({ summary: r.summary, outPath: r.outPath, htmlPath: r.htmlPath, mdPath: r.mdPath, embedPath: r.embedPath }, null, 2));
      } else {
        console.log(`✓ ${r.outPath}`);
        console.log(`  html: ${r.htmlPath}`);
        console.log(`  markdown: ${r.mdPath}`);
        if (r.embedPath) console.log(`  embed: ${r.embedPath}`);
        console.log(`  commits: ${r.summary.commits}, files: ${r.summary.changedFiles}, checks: ${r.summary.checks}`);
      }
    } else {
      console.log("Usage: dossier release collect [--version <version>] [--since <ref>] [--out <file>] [--checks <cmd,cmd>] [--json]");
      process.exit(1);
    }
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "export" && args.length) {
  const f = args[0];
  const fmt = String(flags.format || "docx").toLowerCase();
  try {
    const sourceModel = JSON.parse(readFileSync(f, "utf8"));
    const state = flags.state ? JSON.parse(readFileSync(flags.state, "utf8")) : null;
    const renderedModel = state ? mergeStateIntoModel(sourceModel, state) : sourceModel;
    const slug = (sourceModel.meta && sourceModel.meta.slug) || basename(f).replace(/\.(dossier\.)?json$/i, "");
    const requireState = () => {
      if (!state) throw new Error(`--state <packet.json> is required for ${fmt} export`);
      return state;
    };
    if (fmt === "docx") {
      const { exportDocx } = await import("../src/export.mjs");
      const out = flags.out || slug + ".docx";
      writeFileSync(out, await exportDocx(renderedModel, { baseDir: dirname(f) }));
      console.log("✓ " + out);
    } else if (fmt === "md") {
      const { generate } = await import("../src/index.mjs");
      const { md } = await generate(renderedModel, { baseDir: dirname(f) });
      const out = flags.out || slug + ".md";
      writeFileSync(out, md);
      console.log("✓ " + out);
    } else if (fmt === "pdf") {
      const { generate } = await import("../src/index.mjs");
      const { exportPdf } = await import("../src/export.mjs");
      const { html } = await generate(renderedModel, { baseDir: dirname(f) });
      const out = flags.out || slug + ".pdf";
      writeFileSync(out, await exportPdf(html));
      console.log("✓ " + out);
    } else if (fmt === "json") {
      const out = flags.out || slug + ".json";
      writeFileSync(out, JSON.stringify(sourceModel, null, 2) + "\n");
      console.log("✓ " + out);
    } else if (fmt === "merged-json") {
      const out = flags.out || slug + ".merged.dossier.json";
      writeFileSync(out, JSON.stringify(mergeStateIntoModel(sourceModel, requireState()), null, 2) + "\n");
      console.log("✓ " + out);
    } else if (fmt === "handoff") {
      const out = flags.out || slug + ".handoff.json";
      writeFileSync(out, JSON.stringify(buildHandoffPacket(sourceModel, requireState()), null, 2) + "\n");
      console.log("✓ " + out);
    } else if (fmt === "state-diff") {
      const out = flags.out || slug + ".state-diff.json";
      writeFileSync(out, JSON.stringify(diffStateAgainstModel(sourceModel, requireState()), null, 2) + "\n");
      console.log("✓ " + out);
    } else if (fmt === "prompt") {
      const out = flags.out || slug + ".prompt.txt";
      writeFileSync(out, promptForModel(sourceModel, state || {}) + "\n");
      console.log("✓ " + out);
    } else {
      console.error("✗ unknown format: " + fmt + " (supported: docx, md, pdf, json, merged-json, handoff, state-diff, prompt)");
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "prompt" && args.length) {
  try {
    const model = JSON.parse(readFileSync(args[0], "utf8"));
    const state = flags.state ? JSON.parse(readFileSync(flags.state, "utf8")) : {};
    console.log(promptForModel(model, state));
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "pack") {
  const sub = args[0];
  try {
    if (sub === "add" && args[1]) {
      const pack = addPack(args[1], { name: flags.name, ref: flags.ref });
      console.log(`✓ registered ${pack.name}`);
      console.log(`  source: ${pack.sourceType === "git" ? pack.source : pack.path}`);
      if (pack.manifest.templates.length) console.log(`  templates: ${pack.manifest.templates.map((t) => t.id).join(", ")}`);
      if (pack.manifest.plugins.length) console.log(`  plugins: ${pack.manifest.plugins.map((p) => p.id).join(", ")} (run dossier pack trust ${pack.name} to enable)`);
    } else if (sub === "trust" && args[1]) {
      const pack = trustPack(args[1]);
      console.log(`✓ trusted ${pack.name}`);
    } else if (sub === "untrust" && args[1]) {
      const pack = trustPack(args[1], { trusted: false });
      console.log(`✓ untrusted ${pack.name}`);
    } else if (sub === "list") {
      const packs = listPacks();
      if (flags.json) {
        console.log(JSON.stringify(packs, null, 2));
      } else if (!packs.length) {
        console.log("No packs registered. Run dossier pack add <repo-or-path>.");
      } else {
        for (const pack of packs) {
          const trust = pack.trusted ? "trusted" : "untrusted";
          const templates = pack.manifest.templates.length ? ` templates=${pack.manifest.templates.map((t) => t.id).join(",")}` : "";
          const plugins = pack.manifest.plugins.length ? ` plugins=${pack.manifest.plugins.map((p) => p.id).join(",")}` : "";
          console.log(`${pack.name}  ${trust}  ${pack.sourceType}${templates}${plugins}`);
        }
      }
    } else {
      console.log("Usage: dossier pack add <repo-or-path> [--name <name>] [--ref <ref>]\n       dossier pack trust <name>\n       dossier pack untrust <name>\n       dossier pack list [--json]");
      process.exit(1);
    }
  } catch (e) {
    console.error("✗ " + e.message);
    process.exitCode = 1;
  }
} else if (cmd === "init") {
  const name = (args[0] || "dossier").replace(/\.dossier\.json$/i, "").replace(/\.json$/i, "");
  const out = name + ".dossier.json";
  if (existsSync(out)) {
    console.error("✗ " + out + " already exists");
    process.exit(1);
  }
  if (flags.template) {
    try {
      const { model, template } = resolveTemplateRef(flags.template);
      const next = structuredClone(model);
      next.meta = next.meta || {};
      if (!next.meta.slug || next.meta.slug === "replace-with-slug") next.meta.slug = name;
      if (!next.meta.title) next.meta.title = template.title || name;
      writeFileSync(out, JSON.stringify(next, null, 2) + "\n");
      console.log(`✓ wrote ${out} (template: ${flags.template})\n  edit it, then: dossier build ${out}  (writes ${next.meta.slug || name}.html)`);
    } catch (e) {
      console.error("✗ " + e.message);
      process.exitCode = 1;
    }
  } else {
    const kind = STARTERS.includes(flags.kind) ? flags.kind : "dossier";
    const starter = new URL(`../src/starters/${kind}.dossier.json`, import.meta.url);
    const text = readFileSync(starter, "utf8").replace(/"slug": "replace-with-slug"/, `"slug": "${name}"`);
    writeFileSync(out, text);
    console.log(`✓ wrote ${out} (kind: ${kind})\n  edit it, then: dossier build ${out}  (writes ${name}.html)`);
  }
} else {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}
