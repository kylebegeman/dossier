// The editor the Dossier studio loads for Model JSON. It exposes one small
// API on window.DossierEditor, so studio.js never depends on CodeMirror's.
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { forceLinting, lintGutter, linter } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Colors come from the page's design tokens, so the editor follows the
// studio's theme, light or dark.
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--paper)", color: "var(--ink)", fontSize: "12.5px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--ink)", padding: "10px 0" },
  ".cm-gutters": { backgroundColor: "var(--paper)", color: "var(--muted)", border: "none", borderRight: "1px solid var(--line-soft)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ink) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
  ".cm-matchingBracket": { backgroundColor: "var(--teal-soft)", color: "var(--teal)", outline: "none" },
  ".cm-searchMatch": { backgroundColor: "var(--violet-soft)" },
  ".cm-panels": { backgroundColor: "var(--paper-2)", color: "var(--ink)", borderColor: "var(--line)" },
  ".cm-tooltip": { backgroundColor: "var(--bg)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: "8px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--coral)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--coral)", textUnderlineOffset: "3px" },
  "&.cm-focused": { outline: "none" },
});

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--violet)" },
  { tag: tags.string, color: "var(--teal)" },
  { tag: tags.number, color: "var(--coral)" },
  { tag: [tags.bool, tags.null], color: "var(--accent)" },
  { tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: "var(--muted)" },
]);

// pointerRange finds where a JSON pointer such as /sections/2/title points
// in the text. It stops at the deepest part of the pointer that exists, so a
// finding about a missing field marks the object that should hold it.
function pointerRange(state, pointer) {
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = syntaxTree(state).topNode.firstChild;
  let mark = node ? { from: node.from, to: node.from + 1 } : { from: 0, to: 0 };
  for (const part of parts) {
    if (!node) break;
    let next = null;
    if (node.name === "Object") {
      for (let prop = node.firstChild; prop; prop = prop.nextSibling) {
        if (prop.name !== "Property") continue;
        const key = prop.getChild("PropertyName");
        if (key && JSON.parse(state.sliceDoc(key.from, key.to)) === part) {
          next = prop.lastChild;
          mark = { from: key.from, to: key.to };
          break;
        }
      }
    } else if (node.name === "Array") {
      let index = 0;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (["[", "]", ","].includes(child.name) || child.type.isError) continue;
        if (String(index++) === part) {
          next = child;
          mark = { from: child.from, to: child.name === "Object" || child.name === "Array" ? child.from + 1 : child.to };
          break;
        }
      }
    }
    if (!next) break;
    node = next;
    if (node.name !== "Object" && node.name !== "Array") mark = { from: node.from, to: node.to };
  }
  return mark;
}

export function create(parent, text, options = {}) {
  // The server's findings join the JSON syntax check in one lint source, so
  // neither replaces the other. They clear when the text changes.
  let findings = [];
  const parseJSON = jsonParseLinter();
  const source = (view) => {
    const syntax = parseJSON(view);
    if (syntax.length) return syntax;
    return findings.map((f) => {
      const range = pointerRange(view.state, String(f.path || "").replace(/^[^#]*#/, ""));
      return { from: range.from, to: Math.max(range.to, range.from + 1), severity: "error", message: f.message };
    });
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), foldGutter(), lintGutter(), history(), drawSelection(),
        indentOnInput(), bracketMatching(), closeBrackets(), autocompletion(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }),
        json(), linter(source, { delay: 300 }), syntaxHighlighting(highlight), theme, EditorState.tabSize.of(2),
        EditorView.updateListener.of((u) => { if (u.docChanged) findings = []; }),
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { if (options.onSave) options.onSave(); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab,
        ]),
        EditorView.contentAttributes.of({ "aria-label": "Model JSON" }),
      ],
    }),
  });
  return {
    get value() { return view.state.doc.toString(); },
    focus() { view.focus(); },
    // showFindings marks each finding at the place its path points to, and
    // moves the cursor to the first.
    showFindings(list) {
      findings = list || [];
      forceLinting(view);
      if (findings.length) {
        const first = pointerRange(view.state, String(findings[0].path || "").replace(/^[^#]*#/, ""));
        view.dispatch({ selection: { anchor: first.from }, scrollIntoView: true });
      }
    },
    destroy() { view.destroy(); },
  };
}
