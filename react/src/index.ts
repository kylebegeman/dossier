// Public entry for @kylebegeman/dossier-react.
//
// renderDossier(model) -> { html, embedHtml, md, digest }, SSR self-contained artifacts.
// <Block b={...}/>                               , render an individual block (live or SSR).
// setCtx({ glossary, baseUrl })                  , set inline-markdown resolution context.

export { renderDossier } from "./render";
export { Block, setCtx, registerComponent } from "./blocks";
export { DossierDocument } from "./document";

export type {
  DossierModel,
  DossierMeta,
  Block as BlockModel,
  BlockType,
  CodeEditorBlock,
  PatchItem,
  ProcessItem,
  ReviewCandidate,
  SideCard,
  Lifecycle,
  ChangelogEntry,
} from "./types";
