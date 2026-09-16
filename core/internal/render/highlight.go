package render

import (
	"bytes"
	"strings"

	"github.com/alecthomas/chroma/v2"
	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"
)

// langAliases folds the short language names 0.6 accepted onto chroma names.
var langAliases = map[string]string{
	"js": "javascript", "ts": "typescript", "sh": "bash", "shell": "bash", "zsh": "bash",
	"yml": "yaml", "md": "markdown", "py": "python",
}

// formatter emits classed spans only. The stylesheet in tokens.css is the
// whole theme, so both light and dark come from the design tokens.
var formatter = chromahtml.New(
	chromahtml.WithClasses(true),
	chromahtml.WithAllClasses(true),
	chromahtml.ClassPrefix("hl-"),
	chromahtml.PreventSurroundingPre(true),
	chromahtml.TabWidth(4),
)

// highlight returns code as classed spans when a lexer exists for lang. The
// second result is false when the code should be emitted as escaped text.
func highlight(lang, code string) (string, bool) {
	name := strings.ToLower(strings.TrimSpace(lang))
	if alias, ok := langAliases[name]; ok {
		name = alias
	}
	if name == "" || name == "text" || name == "plain" || name == "plaintext" {
		return "", false
	}
	lexer := lexers.Get(name)
	if lexer == nil {
		return "", false
	}
	it, err := chroma.Coalesce(lexer).Tokenise(nil, code)
	if err != nil {
		return "", false
	}
	var buf bytes.Buffer
	if err := formatter.Format(&buf, styles.Fallback, it); err != nil {
		return "", false
	}
	return buf.String(), true
}

// codeInner renders the inside of a code element: highlighted spans when the
// language is known, escaped text otherwise.
func codeInner(lang, code string) string {
	if h, ok := highlight(lang, code); ok {
		return h
	}
	return escape(code)
}

// codeRenderer routes fenced code blocks in markdown through the same
// highlighter as code parts.
type codeRenderer struct{}

func (codeRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(ast.KindFencedCodeBlock, renderFenced)
}

func renderFenced(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.FencedCodeBlock)
	var code bytes.Buffer
	lines := n.Lines()
	for i := 0; i < lines.Len(); i++ {
		line := lines.At(i)
		code.Write(line.Value(source))
	}
	lang := string(n.Language(source))
	if _, err := w.WriteString("<pre class=\"hl\"><code>" + codeInner(lang, code.String()) + "</code></pre>\n"); err != nil {
		return ast.WalkStop, err
	}
	return ast.WalkContinue, nil
}
