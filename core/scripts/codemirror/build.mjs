// Bundles entry.js into internal/serve/assets/vendor/codemirror.js, writes its
// SHA-256 beside it for the Go test that pins it, and copies the license of
// every bundled package into third_party/licenses/codemirror for the notices.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = join(here, "..", "..");
const vendor = join(core, "internal", "serve", "assets", "vendor");
const licenses = join(core, "third_party", "licenses", "codemirror");

const result = await build({
  entryPoints: [join(here, "entry.js")],
  bundle: true,
  format: "iife",
  globalName: "DossierEditor",
  minify: true,
  target: "es2020",
  legalComments: "none",
  metafile: true,
  write: false,
  banner: { js: "/* CodeMirror 6 and Lezer for the Dossier studio, MIT licensed; see core/third_party/licenses/codemirror. Built by core/scripts/codemirror. */" },
});
const code = result.outputFiles[0].contents;
mkdirSync(vendor, { recursive: true });
writeFileSync(join(vendor, "codemirror.js"), code);
const sum = createHash("sha256").update(code).digest("hex");
writeFileSync(join(vendor, "codemirror.js.sha256"), sum + "  codemirror.js\n");

const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (!m) continue;
  const dir = join(here, "node_modules", m[1]);
  packages.set(m[1], JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version);
}
rmSync(licenses, { recursive: true, force: true });
mkdirSync(licenses, { recursive: true });
const rows = [];
for (const [name, version] of [...packages].sort()) {
  const dir = join(here, "node_modules", name);
  const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  if (!file) throw new Error(name + " has no license file");
  const dest = join(licenses, name.replace("/", "__"));
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(dir, file), join(dest, "LICENSE"));
  rows.push(`| ${name} | ${version} |`);
}
writeFileSync(join(licenses, "README.md"), [
  "# Licenses of the studio's CodeMirror bundle",
  "",
  "The studio's Model JSON editor is a bundle of these packages, built by",
  "`core/scripts/codemirror` into `internal/serve/assets/vendor/codemirror.js`",
  "and embedded in the binary. Artifacts never include it.",
  "",
  "| Package | Version |",
  "| --- | --- |",
  ...rows,
  "",
].join("\n"));
console.log(`wrote codemirror.js (${code.length} bytes, sha256 ${sum.slice(0, 12)}) and ${packages.size} licenses`);
