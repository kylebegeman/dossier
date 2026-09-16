import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { generate, slugify } from "./generate.mjs";
import { validateModel } from "./validate.mjs";

export const RELEASE_DIR = "docs/releases";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: opts.cwd, encoding: "utf8" });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: String(res.stdout || "").trim(),
    stderr: String(res.stderr || "").trim(),
  };
}

function git(args, cwd) {
  const res = run("git", args, { cwd });
  return res.ok ? res.stdout : "";
}

function rel(cwd, path) {
  const r = relative(cwd, path);
  return r && !r.startsWith("..") && !isAbsolute(r) ? r : path;
}

function packageVersion(cwd) {
  const path = resolve(cwd, "package.json");
  if (!existsSync(path)) return "";
  try {
    return readJson(path).version || "";
  } catch {
    return "";
  }
}

function defaultSince(cwd) {
  return git(["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD^"], cwd) || "";
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeChecks(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw
    .map((entry) => (typeof entry === "string" ? { command: entry.trim() } : entry))
    .filter((entry) => entry && entry.command)
    .map((entry, index) => ({
      id: entry.id || slugify(entry.command || `check-${index + 1}`),
      title: entry.title || entry.command,
      command: entry.command,
      status: entry.status || "passed",
      expected: entry.expected || "Command completes before release evidence collection.",
      actual: entry.actual || "Completed before this release dossier was generated.",
      artifacts: entry.artifacts || [],
    }));
}

function commitRows(commits) {
  if (!commits.length) return [["-", "No commits found for this range."]];
  return commits.map((line) => {
    const [sha, ...rest] = line.split(" ");
    return [sha || "-", rest.join(" ") || line];
  });
}

function fileRows(files) {
  if (!files.length) return [["-", "No changed files found for this range."]];
  return files.map((file) => [file, "changed"]);
}

function releaseRange(since) {
  return since ? `${since}..HEAD` : "HEAD";
}

function changedFilesForRange(since, range, cwd) {
  if (since) return splitLines(git(["diff", "--name-only", range], cwd));
  return splitLines(git(["ls-files"], cwd));
}

export function collectReleaseEvidence(opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const version = String(opts.version || packageVersion(cwd) || "unversioned");
  const since = opts.since === undefined ? defaultSince(cwd) : String(opts.since || "");
  const range = releaseRange(since);
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const head = git(["rev-parse", "--short", "HEAD"], cwd);
  const fullHead = git(["rev-parse", "HEAD"], cwd);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const tagsAtHead = splitLines(git(["tag", "--points-at", "HEAD"], cwd));
  const status = splitLines(git(["status", "--short"], cwd));
  const commits = splitLines(git(["log", "--oneline", "--no-decorate", range], cwd));
  const changedFiles = changedFilesForRange(since, range, cwd);
  const checks = normalizeChecks(opts.checks || opts.runs);
  const clean = status.length === 0;
  const hasNpmPack = checks.some((check) => /npm\s+pack/.test(check.command));

  const gates = [
    { id: "version-resolved", title: "Package version resolved", status: version && version !== "unversioned" ? "passed" : "pending", required: true, evidence: version },
    { id: "git-head-resolved", title: "Git HEAD resolved", status: head ? "passed" : "pending", required: true, evidence: fullHead || "Not in a git checkout" },
    { id: "working-tree-clean", title: "Working tree clean before evidence write", status: clean ? "passed" : "pending", required: true, evidence: clean ? "No git status entries before writing release evidence." : status.join(", ") },
    { id: "commits-collected", title: "Release commits collected", status: commits.length ? "passed" : "pending", required: true, evidence: `${commits.length} commit(s) from ${range}` },
    { id: "verification-recorded", title: "Verification commands recorded", status: checks.length ? "passed" : "pending", required: true, evidence: checks.length ? checks.map((check) => check.command).join(", ") : "No --checks value supplied." },
    { id: "package-dry-run", title: "npm package dry run recorded", status: hasNpmPack ? "passed" : "pending", required: false, evidence: hasNpmPack ? "npm pack command listed in verification checks." : "Run npm pack --dry-run --json before publishing." },
  ];

  const blocks = [
    {
      type: "hero",
      eyebrow: "Release evidence",
      title: `Release ${version}`,
      lede: since ? `Evidence collected for changes from ${since} to ${head || "HEAD"}.` : `Evidence collected for ${head || "HEAD"}.`,
      pills: [branch || "detached", `${commits.length} commits`, `${changedFiles.length} files`, clean ? "clean tree" : "dirty tree"],
    },
    {
      type: "stat-strip",
      stats: [
        { value: version, label: "Version" },
        { value: String(commits.length), label: "Commits" },
        { value: String(changedFiles.length), label: "Changed files" },
        { value: String(checks.length), label: "Checks" },
        { value: clean ? "0" : String(status.length), label: "Dirty entries" },
      ],
    },
    { type: "release-checklist", title: "Release gates", gates },
    {
      type: "verification-run",
      title: "Verification evidence",
      summary: checks.length ? "Commands that completed before this evidence dossier was collected." : "Add --checks to record verification commands from CI or a local release run.",
      runs: checks.length
        ? checks
        : [
            {
              id: "verification-not-recorded",
              title: "Verification not recorded",
              command: "dossier release collect --checks \"npm test,npm pack --dry-run --json\"",
              status: "pending",
              expected: "Release checks are recorded before publishing.",
              actual: "No checks were supplied.",
            },
          ],
    },
    { type: "table", title: "Commits", columns: ["Commit", "Summary"], rows: commitRows(commits) },
    { type: "table", title: "Changed files", columns: ["File", "Status"], rows: fileRows(changedFiles) },
    {
      type: "evidence-log",
      title: "Collected provenance",
      items: [
        { id: "git-head", title: "Git HEAD", kind: "command", source: "git rev-parse HEAD", trust: head ? "high" : "low", body: fullHead || "Not available." },
        { id: "git-range", title: "Release range", kind: "command", source: "git", trust: since ? "high" : "medium", body: range },
        { id: "git-status", title: "Working tree status", kind: "command", source: "git status --short", trust: "high", body: status.length ? status.join("\n") : "Clean before evidence write." },
      ],
    },
    {
      type: "trust-report",
      title: "Release trust report",
      summary: "Claims downstream agents can consume before continuing a release.",
      sources: [
        { id: "source-git-head", label: "Git HEAD", kind: "command", trust: head ? "high" : "low", summary: fullHead || "Not available." },
        { id: "source-git-status", label: "Git status", kind: "command", trust: "high", summary: status.length ? status.join(", ") : "Clean" },
        { id: "source-verification", label: "Verification commands", kind: "command", trust: checks.length ? "high" : "pending", summary: checks.map((check) => check.command).join(", ") || "None recorded" },
      ],
      claims: [
        { id: "claim-head-collected", claim: `Release evidence was collected from ${head || "HEAD"}.`, status: head ? "verified" : "unverified", confidence: head ? "high" : "low", sources: ["source-git-head"], evidence: ["git-head"] },
        { id: "claim-tree-clean", claim: "The working tree was clean before writing release evidence.", status: clean ? "verified" : "unverified", confidence: clean ? "high" : "medium", sources: ["source-git-status"], evidence: ["git-status"] },
        { id: "claim-checks-passed", claim: "Verification commands completed before evidence collection.", status: checks.length ? "verified" : "unverified", confidence: checks.length ? "high" : "low", sources: ["source-verification"], evidence: checks.map((check) => check.id) },
      ],
    },
    {
      type: "process-receipt",
      title: "Release evidence receipt",
      outcome: gates.every((gate) => !gate.required || gate.status === "passed") ? "ready-for-publish" : "needs-attention",
      owner: "release automation",
      date: generatedAt,
      changedFiles,
      commands: checks.map((check) => check.command),
      risks: gates.filter((gate) => gate.required && gate.status !== "passed").map((gate) => gate.title),
      followUps: hasNpmPack ? [] : ["Run npm pack --dry-run --json before publishing."],
    },
  ];

  const model = {
    dossierVersion: "1.0",
    kind: "release",
    meta: {
      title: `Release ${version} Evidence`,
      slug: `release-${slugify(version)}`,
      eyebrow: "Release evidence",
      status: gates.every((gate) => !gate.required || gate.status === "passed") ? "ready" : "needs-attention",
      owner: "release automation",
      updated: generatedAt,
      tags: ["release", "evidence", "automation"],
    },
    blocks,
  };

  return {
    model,
    summary: {
      version,
      since,
      range,
      head,
      fullHead,
      branch,
      tagsAtHead,
      clean,
      commits: commits.length,
      changedFiles: changedFiles.length,
      checks: checks.length,
      status,
    },
    commits,
    changedFiles,
    checks,
  };
}

export async function writeReleaseEvidence(opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const result = collectReleaseEvidence(opts);
  const outPath = resolve(cwd, opts.out || join(RELEASE_DIR, `${result.summary.version}.dossier.json`));
  const validation = validateModel(result.model);
  if (!validation.ok) throw new Error("invalid release evidence dossier:\n  - " + validation.errors.join("\n  - "));
  writeJson(outPath, result.model);
  const { html, embedHtml, md } = await generate(result.model, { baseDir: dirname(outPath), theme: opts.theme, skin: opts.skin });
  const slug = result.model.meta.slug || basename(outPath).replace(/\.(dossier\.)?json$/i, "");
  const htmlPath = join(dirname(outPath), `${slug}.html`);
  const mdPath = join(dirname(outPath), `${slug}.md`);
  const embedPath = join(dirname(outPath), `${slug}.embed.html`);
  writeFileSync(htmlPath, html);
  writeFileSync(mdPath, md);
  if (opts.embed) writeFileSync(embedPath, embedHtml);
  return { ...result, outPath: rel(cwd, outPath), htmlPath: rel(cwd, htmlPath), mdPath: rel(cwd, mdPath), embedPath: opts.embed ? rel(cwd, embedPath) : null };
}
