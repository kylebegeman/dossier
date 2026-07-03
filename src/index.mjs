import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { generate } from "./generate.mjs";
import { validateModel } from "./validate.mjs";
import { applyPresentationOptions } from "./presentation.mjs";
import { lintModel } from "./lint.mjs";

export { generate, validateModel };
export { formatLintWarnings, lintModel } from "./lint.mjs";
export { HANDOFF_SCHEMA, STATE_SCHEMA, buildHandoffPacket, diffStateAgainstModel, mergeStateIntoModel, normalizeStatePacket, promptForModel } from "./state.mjs";
export { publishDir } from "./publish.mjs";
export {
  PACK_CACHE_DIR,
  PACK_LOCK,
  PACK_MANIFEST,
  addPack,
  listPacks,
  loadTrustedPackPlugins,
  readPackLock,
  resolveTemplateRef,
  trustPack,
  writePackLock,
} from "./packs.mjs";
export {
  WORKSPACE_MANIFEST,
  WORKSPACE_SCHEMA,
  buildWorkspaceIndex,
  createWorkspaceManifest,
  publishWorkspace,
  queryWorkspace,
  readWorkspaceManifest,
  scanWorkspace,
  writeWorkspaceIndex,
  writeWorkspaceManifest,
} from "./workspace.mjs";
export { RELEASE_DIR, collectReleaseEvidence, writeReleaseEvidence } from "./release.mjs";
export { THEMES } from "./themes.mjs";
export { SKINS, resolveSkin, skinNames } from "./skins.mjs";
export { exportConfluenceStorage, exportDocx, exportNotionMarkdown, exportPdf, exportSlidesHtml, pdfPrintOptions } from "./export.mjs";
// Plugin authoring surface.
export { registerBlock, esc, inlineMd, richTextHtml, slugify, chartSvg, knownBlockTypes, parseUnifiedDiff, collectCitations } from "./generate.mjs";

export async function generateFile(path, opts = {}) {
  const model = JSON.parse(readFileSync(path, "utf8"));
  applyPresentationOptions(model, opts);
  if (opts.validate !== false) {
    const { ok, errors } = validateModel(model);
    if (!ok) {
      const err = new Error("invalid dossier:\n  - " + errors.join("\n  - "));
      err.validation = errors;
      throw err;
    }
  }
  const dir = dirname(path);
  const lint = opts.lint === false ? { warnings: [] } : lintModel(model);
  if (opts.strict && lint.warnings.length) {
    const err = new Error("dossier lint warnings:\n  - " + lint.warnings.map((w) => `${w.path}: ${w.message}`).join("\n  - "));
    err.lint = lint.warnings;
    throw err;
  }
  const { html, embedHtml, md } = await generate(model, { baseDir: dir });
  const slug = (model.meta && model.meta.slug) || basename(path).replace(/\.(dossier\.)?json$/i, "");
  const htmlPath = join(dir, slug + ".html");
  const embedPath = join(dir, slug + ".embed.html");
  const mdPath = join(dir, slug + ".md");
  writeFileSync(htmlPath, html);
  if (opts.embed) writeFileSync(embedPath, embedHtml);
  writeFileSync(mdPath, md);
  return { htmlPath, embedPath: opts.embed ? embedPath : null, mdPath, slug, lint: lint.warnings };
}
