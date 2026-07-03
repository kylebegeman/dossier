import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { enrich, assignIds, collectGlossary, collectFootnotes, collectCitations, buildToc, toMarkdown, agentDigest, renderShell, stripBuildFields } from "../../src/generate.mjs";
import { applyPresentationOptions } from "../../src/presentation.mjs";
import { Block, setCtx } from "./blocks";
import type { DossierModel } from "./types";

// Render a Dossier to a self-contained HTML artifact (+ Markdown + agent digest)
// via React SSR, reusing the core design system, runtime, enrichment, and the
// shared renderShell(), so the body is React-rendered and the shell is identical.
export async function renderDossier(model: DossierModel, opts: { baseDir?: string; theme?: string; skin?: string } = {}): Promise<{ html: string; embedHtml: string; md: string; digest: string }> {
  applyPresentationOptions(model, opts);
  stripBuildFields(model);
  await enrich(model, opts.baseDir);
  assignIds(model.blocks);

  const meta: any = model.meta || {};
  const glossary = new Map<string, string>();
  collectGlossary(model.blocks, glossary);
  const footnotes = new Map<string, { num: number; text: string }>();
  collectFootnotes(model.blocks, footnotes);
  const citations = new Map<string, any>();
  collectCitations(model.blocks, citations);
  setCtx({ glossary, footnotes, citations, baseUrl: meta.baseUrl || "" });

  const body = renderToStaticMarkup(
    <>{model.blocks.map((b, i) => <Block b={b} key={b.id || i} />)}</>
  );

  const md = toMarkdown(model);
  const digest = agentDigest(model);
  const toc = buildToc(model.blocks);

  const html = renderShell(model, {
    body,
    toc,
    md,
    digest,
    generator: "dossier-react",
    footer: "Generated with Dossier (React)",
  });
  const embedHtml = renderShell(model, {
    body,
    toc,
    md,
    digest,
    generator: "dossier-react",
    footer: "Generated with Dossier (React)",
    chrome: "embed",
  });

  return { html, embedHtml, md, digest };
}
