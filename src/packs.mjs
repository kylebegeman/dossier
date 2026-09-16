import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PACK_MANIFEST = "dossier.pack.json";
export const PACK_LOCK = "dossier.lock.json";
export const PACK_CACHE_DIR = ".dossier/packs";

function cwdPath(cwd = process.cwd(), path = PACK_LOCK) {
  return resolve(cwd, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rel(cwd, path) {
  const r = relative(cwd, path);
  return r && !r.startsWith("..") && !isAbsolute(r) ? r : path;
}

function isInside(basePath, candidatePath) {
  const r = relative(resolve(basePath), resolve(candidatePath));
  return r === "" || (!!r && !r.startsWith("..") && !isAbsolute(r));
}

function runGit(args, opts = {}) {
  const res = spawnSync("git", args, { cwd: opts.cwd, encoding: "utf8" });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || `git ${args.join(" ")} failed`).trim());
  return String(res.stdout || "").trim();
}

function splitSourceRef(source, explicitRef) {
  const raw = String(source || "");
  const hash = raw.lastIndexOf("#");
  if (hash > 0 && !raw.slice(hash + 1).includes("/")) {
    return { source: raw.slice(0, hash), ref: explicitRef || raw.slice(hash + 1) };
  }
  return { source: raw, ref: explicitRef || "" };
}

function isLocalSource(source, cwd = process.cwd()) {
  return existsSync(resolve(cwd, source)) || source.startsWith(".") || source.startsWith("/");
}

function validateManifest(manifest, sourceLabel = PACK_MANIFEST) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) errors.push("manifest must be an object");
  if (!manifest.name || !slug(manifest.name)) errors.push("name is required and must contain a slug");
  for (const [field, nested] of [["templates", "id"], ["plugins", "id"]]) {
    if (manifest[field] === undefined) continue;
    if (!Array.isArray(manifest[field])) {
      errors.push(`${field} must be an array`);
      continue;
    }
    const seen = new Set();
    manifest[field].forEach((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${field}[${i}] must be an object`);
        return;
      }
      if (!entry[nested] || !slug(entry[nested])) errors.push(`${field}[${i}].${nested} is required and must contain a slug`);
      else if (seen.has(entry[nested])) errors.push(`${field}[${i}].${nested} duplicates ${entry[nested]}`);
      else seen.add(entry[nested]);
      if (field === "templates" && !entry.path) errors.push(`${field}[${i}].path is required`);
      if (field === "plugins" && !entry.entry) errors.push(`${field}[${i}].entry is required`);
    });
  }
  if (errors.length) throw new Error(`${sourceLabel} is invalid:\n- ${errors.join("\n- ")}`);
  return manifest;
}

export function readPackLock(cwd = process.cwd()) {
  const path = cwdPath(cwd);
  if (!existsSync(path)) return { schema: "dossier.lock/v1", packs: {} };
  const lock = readJson(path);
  lock.schema = lock.schema || "dossier.lock/v1";
  lock.packs = lock.packs && typeof lock.packs === "object" ? lock.packs : {};
  return lock;
}

export function writePackLock(lock, cwd = process.cwd()) {
  writeJson(cwdPath(cwd), { schema: "dossier.lock/v1", packs: lock.packs || {} });
}

export function packManifestPath(packPath) {
  return join(packPath, PACK_MANIFEST);
}

export function readPackManifest(packPath) {
  return validateManifest(readJson(packManifestPath(packPath)), packManifestPath(packPath));
}

export function resolvePackEntry(entry, cwd = process.cwd()) {
  if (!entry) throw new Error("pack entry is missing");
  const path = entry.path || entry.localPath;
  if (!path) throw new Error(`pack ${entry.name || ""} has no local path`);
  return isAbsolute(path) ? path : resolve(cwd, path);
}

export function addPack(sourceValue, opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const { source, ref } = splitSourceRef(sourceValue, opts.ref);
  const lock = readPackLock(cwd);
  let packPath;
  let commit = "";
  let sourceType = "local";

  if (isLocalSource(source, cwd)) {
    packPath = resolve(cwd, source);
    if (!existsSync(packManifestPath(packPath))) throw new Error(`missing ${PACK_MANIFEST} in ${packPath}`);
    try {
      commit = runGit(["rev-parse", "HEAD"], { cwd: packPath });
    } catch {
      commit = "";
    }
  } else {
    sourceType = "git";
    const tempName = slug(opts.name || source.split(/[/:]/).pop().replace(/\.git$/i, "")) || "pack";
    packPath = resolve(cwd, PACK_CACHE_DIR, tempName);
    rmSync(packPath, { recursive: true, force: true });
    mkdirSync(dirname(packPath), { recursive: true });
    runGit(["clone", "--depth", "1", ...(ref ? ["--branch", ref] : []), source, packPath], { cwd });
    commit = runGit(["rev-parse", "HEAD"], { cwd: packPath });
  }

  const manifest = readPackManifest(packPath);
  const name = slug(opts.name || manifest.name);
  if (!name) throw new Error("pack name could not be resolved");
  if (sourceType === "git") {
    const target = resolve(cwd, PACK_CACHE_DIR, name);
    if (target !== packPath) {
      rmSync(target, { recursive: true, force: true });
      mkdirSync(dirname(target), { recursive: true });
      runGit(["clone", "--depth", "1", ...(ref ? ["--branch", ref] : []), source, target], { cwd });
      packPath = target;
      commit = runGit(["rev-parse", "HEAD"], { cwd: packPath });
    }
  }

  const prior = lock.packs[name] || {};
  lock.packs[name] = {
    name,
    source,
    sourceType,
    ref,
    commit,
    path: rel(cwd, packPath),
    trusted: !!prior.trusted,
    manifest: {
      version: manifest.version || "",
      templates: (manifest.templates || []).map((t) => ({ id: t.id, title: t.title || t.id, kind: t.kind || "", path: t.path })),
      plugins: (manifest.plugins || []).map((p) => ({ id: p.id, description: p.description || "", entry: p.entry, permissions: p.permissions || ["render"] })),
    },
  };
  writePackLock(lock, cwd);
  return lock.packs[name];
}

export function trustPack(name, opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const lock = readPackLock(cwd);
  const key = slug(name);
  if (!lock.packs[key]) throw new Error(`unknown pack: ${name}`);
  lock.packs[key].trusted = opts.trusted === false ? false : true;
  writePackLock(lock, cwd);
  return lock.packs[key];
}

export function listPacks(opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const lock = readPackLock(cwd);
  return Object.values(lock.packs || {}).sort((a, b) => a.name.localeCompare(b.name));
}

function splitRef(value) {
  const [pack, id] = String(value || "").split("/", 2);
  return { pack: slug(pack), id };
}

export function resolveTemplateRef(templateRef, opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const { pack, id } = splitRef(templateRef);
  if (!pack || !id) throw new Error(`template must be <pack>/<template>, got ${templateRef}`);
  const lock = readPackLock(cwd);
  const entry = lock.packs[pack];
  if (!entry) throw new Error(`unknown pack: ${pack}`);
  const template = (entry.manifest?.templates || []).find((t) => t.id === id);
  if (!template) throw new Error(`unknown template ${id} in pack ${pack}`);
  const base = resolvePackEntry(entry, cwd);
  const path = resolve(base, template.path);
  if (!isInside(base, path)) throw new Error(`template ${templateRef} escapes its pack root`);
  return { pack: entry, template, path, model: readJson(path) };
}

export async function loadTrustedPackPlugins(packNames, api, opts = {}) {
  const cwd = resolve(opts.cwd || process.cwd());
  const lock = readPackLock(cwd);
  const loaded = [];
  for (const rawName of packNames || []) {
    const name = slug(rawName);
    if (!name) continue;
    const entry = lock.packs[name];
    if (!entry) throw new Error(`unknown pack: ${rawName}`);
    if (!entry.trusted) throw new Error(`pack ${name} is not trusted; run dossier pack trust ${name}`);
    const base = resolvePackEntry(entry, cwd);
    for (const plugin of entry.manifest?.plugins || []) {
      if (!(plugin.permissions || ["render"]).includes("render")) continue;
      const path = resolve(base, plugin.entry);
      if (!isInside(base, path)) throw new Error(`plugin ${name}/${plugin.id} escapes its pack root`);
      const mod = await import(pathToFileURL(path).href);
      if (typeof mod.default === "function") mod.default(api);
      loaded.push({ pack: name, id: plugin.id, path });
    }
  }
  return loaded;
}
