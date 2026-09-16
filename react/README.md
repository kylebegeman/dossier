# @kylebegeman/dossier-react

Typed React/TSX components for [Dossier](../). Render the same self-contained design via
SSR, or use the block components live inside a React/Next app.

## SSR a self-contained artifact

```ts
import { renderDossier } from "@kylebegeman/dossier-react";

const { html, embedHtml, md, digest } = await renderDossier(model); // model: DossierModel
```

Reuses the core design system, client runtime, and build-time enrichment (Shiki +
Graphviz), so the output matches the Node generator. `model.meta.skin` and
`model.meta.theme` are honored by the shared shell. CLI:

```bash
npx tsx src/cli.tsx ../examples/sample.dossier.json --theme forest --skin console-slate --embed
# -> *.react.html + *.react.embed.html
```

## Use it live in a React app

```tsx
import { DossierDocument, setCtx } from "@kylebegeman/dossier-react";

setCtx({ glossary: new Map(), baseUrl: "" });   // resolves [[Term]] / [[slug]] in text
<DossierDocument model={model} animate />        // whole document; Motion entrance on scroll when hydrated
```

Or render a single block with `<Block b={model.blocks[0]} />`. Import the core stylesheet
(`src/theme/tokens.css.mjs` exports the `CSS` string) once at your app root for the
`ds-` classes.

`DossierDocument animate` uses [Motion](https://motion.dev) and is meant for **hydrated**
usage; it honors `prefers-reduced-motion`. For a static, no-JS file, use `renderDossier()`
or the Node generator.

## Extending with live interactivity (Base UI / Motion)

The static artifact needs no client framework, its interactivity is a small vanilla
runtime, so the generated HTML works with zero JS dependencies. When you mount these
components **live (hydrated)** in a React app, that's the right place to layer richer
interaction libraries:

- **[Motion](https://motion.dev)**, wrap blocks in `motion.*` with `initial={false}` so
  SSR output stays correct and hydration adds entrance/gesture animation.
- **[Base UI](https://base-ui.com)**, swap the native `<details>`/dialog affordances for
  fully accessible overlays when you need them.

These are intentionally **not** baked into the static generator, where they would add no
runtime benefit (there is no client React at view time).

## API

| Export | Description |
|---|---|
| `renderDossier(model, { theme, skin })` | SSR -> `{ html, embedHtml, md, digest }` (self-contained full and embed files). |
| `DossierDocument` | Live document component; `animate` adds a Motion scroll entrance (hydrated). |
| `Block` | Component dispatcher over all built-in block types. |
| `registerComponent(type, Comp)` | Register a React component for a custom block type, plugin parity with the Node generator's `registerBlock`. Unregistered-but-known types fall back to the Node string renderer. |
| `setCtx({ glossary, baseUrl })` | Inline-markdown resolution context (call before rendering). |
| `DossierModel`, `BlockModel`, `ReviewCandidate`, … | Types. |
