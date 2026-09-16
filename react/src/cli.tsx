import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderDossier } from "./render";
import { registerComponent } from "./blocks";
import { registerBlock, esc, inlineMd, slugify } from "../../src/generate.mjs";

const argv = process.argv.slice(2);
const files: string[] = [];
const plugins: string[] = [];
let embed = false;
let theme: string | undefined;
let skin: string | undefined;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--plugin") plugins.push(...String(argv[++i] || "").split(","));
  else if (a.startsWith("--plugin=")) plugins.push(...a.slice(9).split(","));
  else if (a === "--theme") theme = String(argv[++i] || "");
  else if (a.startsWith("--theme=")) theme = a.slice(8);
  else if (a === "--skin") skin = String(argv[++i] || "");
  else if (a.startsWith("--skin=")) skin = a.slice(7);
  else if (a === "--embed") embed = true;
  else files.push(a);
}

const path = files[0];
if (!path) {
  console.error("Usage: tsx src/cli.tsx <file.dossier.json> [--plugin a.mjs,b.mjs] [--theme <pack>] [--skin console-slate] [--embed]");
  process.exit(1);
}

// Load plugins. They receive both registries, registerBlock (Node/static string renderer)
// and registerComponent (native React), so a single plugin reaches full parity.
for (const p of plugins.map((s) => s.trim()).filter(Boolean)) {
  const mod = await import(pathToFileURL(resolve(p)).href);
  if (typeof mod.default === "function") mod.default({ registerBlock, registerComponent, esc, inlineMd, slugify, React });
}

const model = JSON.parse(readFileSync(path, "utf8"));
const { html, embedHtml } = await renderDossier(model, { baseDir: dirname(path), theme, skin });
const slug = (model.meta && model.meta.slug) || basename(path).replace(/\.(dossier\.)?json$/i, "");
const out = join(dirname(path), slug + ".react.html");
writeFileSync(out, html);
console.log("✓ " + out);
if (embed) {
  const embedOut = join(dirname(path), slug + ".react.embed.html");
  writeFileSync(embedOut, embedHtml);
  console.log("  embed: " + embedOut);
}
