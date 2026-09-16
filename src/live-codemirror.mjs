import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CODEMIRROR_BOOTSTRAP_PATH = "/__dossier-codemirror.mjs";

export const CODEMIRROR_MODULES = [
  "codemirror",
  "@codemirror/autocomplete",
  "@codemirror/commands",
  "@codemirror/lang-css",
  "@codemirror/lang-html",
  "@codemirror/lang-javascript",
  "@codemirror/lang-json",
  "@codemirror/lang-markdown",
  "@codemirror/lang-python",
  "@codemirror/lang-sql",
  "@codemirror/lang-yaml",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/css",
  "@lezer/highlight",
  "@lezer/html",
  "@lezer/javascript",
  "@lezer/json",
  "@lezer/lr",
  "@lezer/markdown",
  "@lezer/python",
  "@lezer/yaml",
  "@marijn/find-cluster-break",
  "crelt",
  "style-mod",
  "w3c-keyname",
];

const cmPath = (spec) => `/__cm/${encodeURIComponent(spec)}.mjs`;

export const CODEMIRROR_IMPORTS = Object.fromEntries(CODEMIRROR_MODULES.map((spec) => [spec, cmPath(spec)]));
export const CODEMIRROR_IMPORT_MAP = JSON.stringify({ imports: CODEMIRROR_IMPORTS }).replace(/</g, "\\u003c");

const PATH_TO_SPEC = new Map(CODEMIRROR_MODULES.map((spec) => [cmPath(spec), spec]));

export function codeMirrorSpecForPath(pathname) {
  return PATH_TO_SPEC.get(pathname) || null;
}

export function codeMirrorModuleSource(spec) {
  if (!CODEMIRROR_MODULES.includes(spec)) throw new Error(`unsupported CodeMirror module: ${spec}`);
  return readFileSync(fileURLToPath(import.meta.resolve(spec)), "utf8");
}

export const CODEMIRROR_BOOTSTRAP = `
import { basicSetup, EditorView } from "codemirror";
import { Compartment } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";

const mounted = new WeakSet();

function norm(value) {
  return String(value || "").toLowerCase();
}

function extensionFrom(ctx) {
  const lang = norm(ctx.language);
  const file = norm(ctx.filename || ctx.targetPath);
  if (lang === "ts" || lang === "tsx" || lang === "typescript" || file.endsWith(".ts") || file.endsWith(".tsx")) {
    return javascript({ typescript: true, jsx: lang === "tsx" || file.endsWith(".tsx") });
  }
  if (lang === "js" || lang === "jsx" || lang === "javascript" || lang === "mjs" || lang === "cjs" || /\\.[cm]?jsx?$/.test(file)) {
    return javascript({ jsx: lang === "jsx" || file.endsWith(".jsx") });
  }
  if (lang === "json" || file.endsWith(".json")) return json();
  if (lang === "md" || lang === "markdown" || file.endsWith(".md") || file.endsWith(".markdown")) return markdown();
  if (lang === "html" || lang === "xml" || file.endsWith(".html") || file.endsWith(".xml")) return html();
  if (lang === "css" || lang === "scss" || lang === "less" || /\\.(css|scss|less)$/.test(file)) return css();
  if (lang === "py" || lang === "python" || file.endsWith(".py")) return python();
  if (lang === "sql" || file.endsWith(".sql")) return sql();
  if (lang === "yaml" || lang === "yml" || /\\.ya?ml$/.test(file)) return yaml();
  return [];
}

function syncTextarea(textarea, text) {
  if (textarea.value === text) return;
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function replaceDoc(view, text) {
  const current = view.state.doc.toString();
  if (current === text) return;
  view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
}

function findInView(view, query) {
  if (!query) return;
  const lower = view.state.doc.toString().toLowerCase();
  const index = lower.indexOf(String(query).toLowerCase());
  if (index < 0) return;
  view.dispatch({
    selection: { anchor: index, head: index + String(query).length },
    effects: EditorView.scrollIntoView(index, { y: "center" }),
  });
  view.focus();
}

const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--ds-bg)",
    color: "var(--ds-ink)",
    fontSize: "12.5px",
    minHeight: "220px",
  },
  ".cm-scroller": {
    fontFamily: "var(--ds-mono)",
    lineHeight: "1.55",
  },
  ".cm-content": {
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--ds-bg-2)",
    color: "var(--ds-ink-3)",
    borderRight: "1px solid var(--ds-line)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--ds-accent-tint)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--ds-accent) 22%, transparent)",
  },
  "&.cm-focused": {
    outline: "2px solid color-mix(in srgb, var(--ds-accent) 35%, transparent)",
    outlineOffset: "-2px",
  },
});

export function mountCodeMirror(ctx) {
  const textarea = ctx && ctx.textarea;
  if (!textarea || mounted.has(textarea)) return null;
  const host = textarea.closest("[data-host-editor]");
  const row = host && host.querySelector(".ds-host-row");
  if (!host || !row) return null;

  mounted.add(textarea);
  host.classList.add("ds-host-codemirror");
  const engine = host.querySelector(".ds-host-engine");
  if (engine) engine.textContent = "CodeMirror 6 · " + (ctx.language || "text");

  const mount = document.createElement("div");
  mount.className = "ds-cm";
  row.appendChild(mount);

  const wrap = new Compartment();
  const view = new EditorView({
    doc: textarea.value,
    parent: mount,
    extensions: [
      basicSetup,
      theme,
      extensionFrom(ctx),
      wrap.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) syncTextarea(textarea, update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        keydown(event) {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (typeof host.__saveEditor === "function") host.__saveEditor();
            return true;
          }
          return false;
        },
      }),
    ],
  });

  textarea.addEventListener("input", () => replaceDoc(view, textarea.value));
  host.__editorGetText = () => view.state.doc.toString();
  host.__editorSetText = (text) => replaceDoc(view, String(text || ""));
  host.__editorFind = (query) => findInView(view, query);
  host.__editorSetWrap = (enabled) => view.dispatch({ effects: wrap.reconfigure(enabled ? EditorView.lineWrapping : []) });
  host.__editorFocus = () => view.focus();
  host.__editorDestroy = () => view.destroy();
  return view;
}

window.DossierCodeMirrorEnhancer = mountCodeMirror;
window.dispatchEvent(new Event("dossier:codemirror-ready"));
document.querySelectorAll("[data-code-editor]").forEach((textarea) => {
  if (typeof window.DossierEditorEnhancer === "function") {
    window.DossierEditorEnhancer({
      id: textarea.getAttribute("data-code-editor"),
      textarea,
      language: textarea.getAttribute("data-editor-lang") || "",
      filename: textarea.getAttribute("data-editor-filename") || "",
      targetPath: textarea.getAttribute("data-editor-target") || "",
      title: textarea.getAttribute("data-editor-title") || "",
    });
  }
});
`;
