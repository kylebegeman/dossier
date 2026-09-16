// Build the demo site (deployed to GitHub Pages by .github/workflows/pages.yml).
// The showcase is the landing page, so it always reflects the current capabilities -
// add new block types to examples/showcase.dossier.json and the live demo updates.

import { generate, generateFile } from "../src/index.mjs";
import { buildCatalogModel } from "../src/catalog.mjs";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(root, "site");
mkdirSync(site, { recursive: true });

const pages = [
  ["examples/showcase.dossier.json", "index.html"],
  ["examples/showcase.dossier.json", "showcase.html"],
  ["examples/sample.dossier.json", "overview.html"],
  ["examples/sample.dossier.json", "dossier-overview.html"],
  ["examples/product-launch.dossier.json", "product-launch.html"],
  ["examples/research-brief.dossier.json", "research-brief.html"],
  ["examples/engineering-release.dossier.json", "engineering-release.html"],
  ["examples/incident-response.dossier.json", "incident-response.html"],
  ["examples/implementation-packet.dossier.json", "implementation-packet.html"],
];

for (const [src, out] of pages) {
  const { htmlPath } = await generateFile(join(root, src));
  copyFileSync(htmlPath, join(site, out));
  console.log("site/" + out);
}

const { model: catalog } = buildCatalogModel(join(root, "examples"), {
  title: "Dossier Example Gallery",
  baseUrl: "",
  updated: "2026-06-29",
});
catalog.meta.slug = "examples";
catalog.meta.crumbs = ["Dossier", "Examples"];
catalog.meta.skin = "console-slate";
catalog.meta.lifecycle = {
  stage: "durable",
  note: "A browsable set of focused Dossier examples.",
};
catalog.blocks.splice(1, 0, {
  type: "table",
  title: "How to use these examples",
  columns: ["Example", "What it showcases", "Use it when"],
  rows: [
    ["[[showcase]]", "Every built-in block, reader controls, export packets, and process blocks.", "You want to inspect the full surface area."],
    ["[[dossier-overview]]", "A compact overview document with core layout and digest features.", "You want the smallest starting point."],
    ["[[product-launch]]", "A public product page with hero media, FAQ, launch claims, and polished copy.", "You need a microsite, feature brief, or launch note."],
    ["[[research-brief]]", "Decision matrix, assumptions, references, and trust report.", "You need source-backed synthesis or competitive research."],
    ["[[engineering-release]]", "Release gates, verification receipts, trust claims, and closeout.", "You need public QA or release readiness."],
    ["[[incident-response]]", "Timeline, evidence log, decision log, risks, and remediation board.", "You need an incident or post-incident packet."],
    ["[[implementation-packet]]", "Process board, editable code, patch set, diff review, and verification plan.", "You need agentic code editing and human approval."]
  ]
});
const { html: galleryHtml } = await generate(catalog, { baseDir: join(root, "examples") });
writeFileSync(join(site, "examples.html"), galleryHtml);
console.log("site/examples.html");
