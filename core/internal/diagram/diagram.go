// Package diagram renders a document's diagram parts to SVG with Graphviz
// compiled to WebAssembly. DOT renders directly and Mermaid flowcharts are
// translated to DOT first. The SVG is rebuilt from an allowlist and restyled
// to the design tokens, so a diagram follows the page's theme and carries no
// script, link, or color of its own.
//
// Graphviz loads on the first diagram, never for a document without one, and
// one mutex serializes every call into it. Results are cached by format and
// source for the life of the process, so the studio re-renders a page without
// laying out unchanged diagrams again.
package diagram

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/goccy/go-graphviz"

	"dossier/internal/model"
)

// defaults set the look every diagram starts from. They go first in the
// graph body, so a statement in the source still overrides them.
const defaults = `graph [fontname="Helvetica", fontsize=11, bgcolor="transparent", pad=0.12, nodesep=0.35, ranksep=0.45];
node [fontname="Helvetica", fontsize=11, shape=box, style=rounded, height=0.36, margin="0.14,0.06"];
edge [fontname="Helvetica", fontsize=10, arrowsize=0.7];
`

// Renderer lays out diagrams and keeps the results.
type Renderer struct {
	mu    sync.Mutex
	gv    *graphviz.Graphviz
	cache map[string]result
}

type result struct {
	svg      string
	warnings []string
}

// Default is the process-wide renderer the doors and the studio share.
var Default = &Renderer{}

// Loaded reports whether Graphviz has been loaded in this process.
func Loaded() bool { return graphviz.Loaded() }

// Document renders every diagram part of doc. It returns SVG by
// model.DiagramKey for render.Options, and warnings for diagrams that stay
// as source, with paths to their parts.
func (r *Renderer) Document(ctx context.Context, doc *model.Document) (map[string]string, []model.Problem) {
	out := map[string]string{}
	var warnings []model.Problem
	for si, s := range doc.Sections {
		for pi, p := range s.Parts {
			if p.Type != "diagram" || strings.TrimSpace(p.Source) == "" {
				continue
			}
			format := p.Format
			if format == "" {
				format = "dot"
			}
			key := model.DiagramKey(format, p.Source)
			if _, done := out[key]; done {
				continue
			}
			svg, notes := r.Render(ctx, format, p.Source, p.Title, key)
			for _, n := range notes {
				warnings = append(warnings, model.Problem{Path: fmt.Sprintf("/sections/%d/parts/%d/source", si, pi), Message: n})
			}
			if svg != "" {
				out[key] = svg
			}
		}
	}
	return out, warnings
}

// Render lays out one diagram and returns restyled SVG, or no SVG and the
// reasons it stays as source.
func (r *Renderer) Render(ctx context.Context, format, source, title, key string) (string, []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if hit, ok := r.cache[key]; ok {
		return hit.svg, hit.warnings
	}
	svg, warnings := r.render(ctx, format, source, title, key)
	if r.cache == nil {
		r.cache = map[string]result{}
	}
	r.cache[key] = result{svg: svg, warnings: warnings}
	return svg, warnings
}

func (r *Renderer) render(ctx context.Context, format, source, title, key string) (string, []string) {
	dot := source
	var notes []string
	switch format {
	case "dot":
	case "mermaid":
		translated, warnings, err := MermaidToDOT(source)
		if err != nil {
			return "", []string{err.Error() + "; the diagram shows as source"}
		}
		dot, notes = translated, warnings
	default:
		return "", []string{fmt.Sprintf("diagram format %q does not render; it shows as source", format)}
	}
	body, err := withDefaults(dot)
	if err != nil {
		return "", append(notes, err.Error()+"; the diagram shows as source")
	}
	raw, err := r.layout(ctx, body)
	if err != nil {
		return "", append(notes, err.Error()+"; the diagram shows as source")
	}
	svg, err := Restyle(raw, title, "d"+key[:8])
	if err != nil {
		return "", append(notes, "the rendered diagram could not be restyled: "+err.Error())
	}
	return svg, notes
}

// layout runs Graphviz. The caller holds the mutex.
func (r *Renderer) layout(ctx context.Context, dot string) ([]byte, error) {
	if r.gv == nil {
		gv, err := graphviz.New(ctx)
		if err != nil {
			return nil, fmt.Errorf("graphviz did not start: %w", err)
		}
		r.gv = gv
	}
	graph, err := graphviz.ParseBytes([]byte(dot))
	if err != nil {
		return nil, fmt.Errorf("the DOT source does not parse: %s", strings.TrimSpace(err.Error()))
	}
	defer func() { _ = graph.Close() }()
	var buf bytes.Buffer
	if err := r.gv.Render(ctx, graph, graphviz.SVG, &buf); err != nil {
		return nil, fmt.Errorf("graphviz could not lay out the diagram: %w", err)
	}
	return buf.Bytes(), nil
}

// withDefaults puts the default statements first in the graph body: right
// after the first brace outside strings and comments.
func withDefaults(dot string) (string, error) {
	i := openingBrace(dot)
	if i < 0 {
		return "", fmt.Errorf("the DOT source has no graph body; write digraph { ... }")
	}
	return dot[:i+1] + "\n" + defaults + dot[i+1:], nil
}

func openingBrace(s string) int {
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '"':
			for i++; i < len(s) && s[i] != '"'; i++ {
				if s[i] == '\\' {
					i++
				}
			}
		case strings.HasPrefix(s[i:], "//") || (s[i] == '#' && (i == 0 || s[i-1] == '\n')):
			for i < len(s) && s[i] != '\n' {
				i++
			}
		case strings.HasPrefix(s[i:], "/*"):
			end := strings.Index(s[i+2:], "*/")
			if end < 0 {
				return -1
			}
			i += end + 3
		case s[i] == '{':
			return i
		}
	}
	return -1
}
