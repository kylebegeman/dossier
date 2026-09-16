// Publish a folder of .dossier.json files into a static folder with an index catalog.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildCatalogModel } from "./catalog.mjs";
import { generate } from "./index.mjs";

function dossierFiles(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".dossier.json") && file !== "index.dossier.json")
    .sort();
}

function outputName(model, file) {
  return (model.meta && model.meta.slug) || basename(file).replace(/\.(dossier\.)?json$/i, "");
}

async function writeRendered(model, sourceFile, outDir, opts = {}) {
  const slug = outputName(model, sourceFile);
  const renderModel = structuredClone(model);
  renderModel.meta = renderModel.meta || { title: slug };
  if (opts.baseUrl) renderModel.meta.baseUrl = opts.baseUrl;
  const { html, embedHtml, md } = await generate(renderModel, { baseDir: dirname(sourceFile), theme: opts.theme, skin: opts.skin });
  const htmlPath = join(outDir, `${slug}.html`);
  const embedPath = join(outDir, `${slug}.embed.html`);
  const mdPath = join(outDir, `${slug}.md`);
  writeFileSync(htmlPath, html);
  if (opts.embed) writeFileSync(embedPath, embedHtml);
  writeFileSync(mdPath, md);
  return { slug, htmlPath, embedPath: opts.embed ? embedPath : null, mdPath };
}

export async function publishDir(dir, opts = {}) {
  const sourceDir = resolve(dir);
  const outDir = resolve(opts.out || join(sourceDir, "site"));
  mkdirSync(outDir, { recursive: true });

  const rendered = [];
  for (const file of dossierFiles(sourceDir)) {
    const sourceFile = join(sourceDir, file);
    const model = JSON.parse(readFileSync(sourceFile, "utf8"));
    rendered.push(await writeRendered(model, sourceFile, outDir, opts));
  }

  const { model: catalog, docs } = buildCatalogModel(sourceDir, {
    title: opts.title || "Dossier Catalog",
    baseUrl: opts.baseUrl,
    updated: opts.updated,
  });
  writeFileSync(join(outDir, "index.dossier.json"), JSON.stringify(catalog, null, 2) + "\n");
  const index = await writeRendered(catalog, join(outDir, "index.dossier.json"), outDir, opts);

  return { outDir, docs, rendered, index };
}
