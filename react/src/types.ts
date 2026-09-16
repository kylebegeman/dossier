// Types for the Dossier document model (React port).
// The dispatcher accepts a loose Block; named variant interfaces are exported for consumers.

export interface SideCard { label: string; value: string; note?: string }
export interface Lifecycle { stage?: "scratchpad" | "review" | "durable"; note?: string; promoteTo?: string }
export interface ChangelogEntry { version: string; date?: string; summary?: string; changes?: string[] }

export interface DossierMeta {
  title: string;
  slug?: string;
  eyebrow?: string;
  lede?: string;
  crumbs?: string[];
  status?: string;
  owner?: string;
  project?: string;
  created?: string;
  updated?: string;
  version?: string;
  tags?: string[];
  baseUrl?: string;
  theme?: Record<string, string>;
  skin?: "console-slate";
  features?: Record<string, boolean>;
  lifecycle?: Lifecycle;
  changelog?: ChangelogEntry[];
}

export type BlockType =
  | "hero" | "prose" | "section" | "two-col" | "summary-cards" | "stat-strip"
  | "flow" | "timeline" | "table" | "callout" | "code" | "tabs" | "faq"
  | "references" | "decision-matrix" | "risk-register" | "action-items"
  | "assumptions" | "glossary" | "diagram" | "review-board" | "process-board"
  | "code-editor" | "patch-set" | "diff-view" | "verification-run" | "evidence-log"
  | "trust-report" | "verdict-gate" | "process-receipt" | "finding-list" | "comment-thread"
  | "cycle-board" | "integration-report" | "upstream-response" | "release-checklist"
  | "decision-log" | "figure" | "math" | "chart" | "footnotes" | "citations" | "receipt";

// A block is discriminated by `type`; variant fields are loosely typed for the dispatcher.
// `_hl` / `_svg` are populated by the build-time enrichment pass.
export interface Block {
  id?: string;
  type: BlockType | string;
  _hl?: string;
  _svg?: string;
  [k: string]: any;
}

export interface ReviewCandidate {
  id: string;
  title: string;
  summary: string;
  scope?: string;
  category?: string;
  status?: string;
  impact?: string;
  effort?: string;
  body?: string;
  blocks?: Block[];
  details?: Record<string, string>;
  badges?: string[];
}

export interface ProcessItem {
  id: string;
  title: string;
  summary?: string;
  category?: string;
  status?: string;
  owner?: string;
  priority?: string;
  impact?: string;
  effort?: string;
  verdict?: string;
  files?: string[];
  dependencies?: string[];
  verification?: string[];
  risks?: string[];
  evidence?: string[];
  body?: string;
  blocks?: Block[];
  details?: Record<string, string>;
  badges?: string[];
}

export interface PatchItem {
  id: string;
  title: string;
  summary?: string;
  operation?: "add" | "modify" | "delete" | "rename" | "mixed";
  status?: "proposed" | "accepted" | "needs-revision" | "applied" | "skipped";
  risk?: "low" | "medium" | "high";
  files?: string[];
  workItems?: string[];
  verification?: string[];
  details?: Record<string, string>;
  diff?: string;
}

export interface CodeEditorBlock {
  id?: string;
  type: "code-editor";
  title?: string;
  summary?: string;
  lang?: string;
  filename?: string;
  targetPath?: string;
  workItems?: string[];
  readonly?: boolean;
  code: string;
}

export interface DossierModel {
  dossierVersion?: string;
  schema?: string;
  kind?: string;
  meta: DossierMeta;
  blocks: Block[];
}
