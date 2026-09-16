// Assemble the comprehensive design-lab model from the lab-model workflow output.
import fs from "node:fs";

const OUT = process.argv[2] ||
  "/private/tmp/claude-501/-Users-kyle-Developer-products-dossier/159c4cf9-b3a7-4316-ad9e-e02af057d860/tasks/w2t8fetbz.output";
const outer = JSON.parse(fs.readFileSync(OUT, "utf8"));
const data = typeof outer.result === "string" ? JSON.parse(outer.result) : outer.result;

const hero = {
  type: "hero",
  eyebrow: "Console Slate",
  title: "Every component, one artifact",
  lede: "A working catalog of every Dossier block and its variants, rendered from one `*.dossier.json` model. Use it to design against the real product surface, not a mockup.",
  pills: ["40+ block types", "All states", "Self-contained", "Light + dark"],
  sideCards: [
    { label: "Source", value: "one .dossier.json" },
    { label: "Output", value: "one .html" },
    { label: "Runtime deps", value: "0" },
    { label: "Theme", value: "Console Slate" },
  ],
};

const sections = (data.groups || [])
  .map((g) => g.result)
  .filter(Boolean)
  .map((r) => ({
    type: "section",
    title: r.sectionTitle,
    subtitle: r.sectionSubtitle,
    framed: false,
    blocks: r.blocks,
  }));

const model = {
  dossierVersion: "1.0",
  kind: "dossier",
  meta: {
    title: "Dossier Component Lab",
    slug: "design-lab",
    eyebrow: "Console Slate",
    crumbs: ["Dossier", "Component lab"],
    status: "review",
    owner: "Kyle",
    updated: "2026-06-29",
    tags: ["design", "lab", "console-slate"],
    lifecycle: { stage: "review", note: "Every block and variant, for design iteration." },
  },
  blocks: [hero, ...sections],
};

const dest = new URL("./design-lab.dossier.json", import.meta.url).pathname;
fs.writeFileSync(dest, JSON.stringify(model, null, 2));
const counts = {};
const walk = (b) => {
  if (Array.isArray(b)) return b.forEach(walk);
  if (b && typeof b === "object") {
    if (b.type) counts[b.type] = (counts[b.type] || 0) + 1;
    ["blocks", "left", "right"].forEach((k) => b[k] && walk(b[k]));
    (b.tabs || []).forEach((t) => walk(t.blocks || []));
  }
};
walk(model.blocks);
console.log("wrote", dest);
console.log("sections:", sections.length, "| top-level blocks:", model.blocks.length);
console.log("block type counts:", JSON.stringify(counts, null, 0));
