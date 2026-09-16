// Ambient declarations for the zero-dep core modules imported from the React port.
declare module "*/generate.mjs" {
  export const esc: (s: any) => string;
  export const slugify: (s: string) => string;
  export const inlineMd: (s: string, ctx: any) => string;
  export const richTextHtml: (s: string, ctx: any) => string;
  export const toMarkdown: (model: any) => string;
  export const agentDigest: (model: any) => string;
  export const collectGlossary: (blocks: any[], map: Map<string, string>) => void;
  export const collectFootnotes: (blocks: any[], map: Map<string, { num: number; text: string }>) => void;
  export const collectCitations: (blocks: any[], map: Map<string, any>) => void;
  export const buildToc: (blocks: any[]) => { id: string; label: string; level: number }[];
  export const assignIds: (blocks: any[]) => void;
  export const enrich: (model: any, baseDir?: string) => Promise<void>;
  export const stripBuildFields: (model: any) => any;
  export const renderBlock: (b: any, ctx: any) => string;
  export const chartSvg: (b: any) => string;
  export const safeImageSrc: (s: any) => string;
  export const parseUnifiedDiff: (diff: string, label?: string) => any[];
  export const registerBlock: (type: string, fn: (b: any, ctx: any) => string) => void;
  export const knownBlockTypes: () => string[];
  export const generate: (model: any) => Promise<{ html: string; embedHtml: string; md: string; digest: string }>;
  export const renderShell: (
    model: any,
    opts: { body: string; toc: any[]; md: string; digest: string; generator?: string; footer?: string; chrome?: "full" | "embed" }
  ) => string;
}
declare module "*/presentation.mjs" {
  export const applyPresentationOptions: (model: any, opts?: { theme?: string; skin?: string }) => any;
}
declare module "*/tokens.css.mjs" {
  export const CSS: string;
}
declare module "*/runtime.mjs" {
  export const RUNTIME: string;
}
