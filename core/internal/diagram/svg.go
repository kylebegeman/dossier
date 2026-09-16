package diagram

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// Restyle rebuilds Graphviz SVG from an allowlist. Shapes, paths, and text
// keep their geometry; fills, strokes, fonts, links, titles, and anything
// else are dropped, so the tokens style the diagram. Classes survive only as
// graph, node, edge, and cluster, plus the tone words teal, violet, risk,
// and accent. Element ids gain prefix, so several diagrams share a page.
func Restyle(raw []byte, label, prefix string) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	dec.Strict = true
	dec.Entity = xml.HTMLEntity
	var b strings.Builder
	var stack []frame
	skip := 0
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			name := t.Name.Local
			parent := frame{}
			if len(stack) > 0 {
				parent = stack[len(stack)-1]
			}
			switch {
			case skip > 0 || !allowed[name] || (name == "polygon" && parent.graph):
				// Skipped whole: disallowed elements, and the rectangle
				// Graphviz paints behind the graph.
				skip++
				stack = append(stack, frame{name: name})
				continue
			case name == "a":
				// Links are unwrapped: their contents stay, the link goes.
				stack = append(stack, frame{name: name})
				continue
			}
			b.WriteString("<" + name)
			if name == "svg" {
				fmt.Fprintf(&b, ` class="dg" role="img" aria-label="%s"`, attr(label))
			}
			graph := false
			for _, a := range t.Attr {
				writeAttr(&b, name, a, prefix)
				graph = graph || (a.Name.Local == "class" && strings.Contains(" "+a.Value+" ", " graph "))
			}
			b.WriteString(">")
			stack = append(stack, frame{name: name, written: true, graph: name == "g" && graph})
		case xml.EndElement:
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			switch {
			case skip > 0:
				skip--
			case top.written:
				b.WriteString("</" + top.name + ">")
			}
		case xml.CharData:
			if skip == 0 && len(stack) > 0 && (stack[len(stack)-1].name == "text" || stack[len(stack)-1].name == "tspan") {
				_ = xml.EscapeText(&b, t)
			}
		}
	}
	if !strings.HasPrefix(b.String(), "<svg") {
		return "", fmt.Errorf("no svg element")
	}
	return b.String(), nil
}

var allowed = map[string]bool{
	"svg": true, "g": true, "a": true, "polygon": true, "polyline": true, "path": true,
	"ellipse": true, "circle": true, "rect": true, "line": true, "text": true, "tspan": true,
}

var (
	numeric   = regexp.MustCompile(`^[-+0-9.,eE ]+(pt|px)?$`)
	transform = regexp.MustCompile(`^[a-z]+\([-0-9., ]*\)( [a-z]+\([-0-9., ]*\))*$`)
	pathData  = regexp.MustCompile(`^[MmLlHhVvCcSsQqTtAaZz0-9.,eE +-]+$`)
	idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	tones     = map[string]bool{"teal": true, "violet": true, "risk": true, "accent": true}
	kinds     = map[string]bool{"graph": true, "node": true, "edge": true, "cluster": true}
)

// frame is one open element: whether it was written, and whether it is the
// graph's own group, whose direct polygon is the background.
type frame struct {
	name    string
	written bool
	graph   bool
}

func writeAttr(b *strings.Builder, element string, a xml.Attr, prefix string) {
	if a.Name.Space != "" {
		return
	}
	v := strings.TrimSpace(a.Value)
	ok := false
	switch a.Name.Local {
	case "viewBox", "width", "height":
		ok = (element == "svg" || element == "rect") && numeric.MatchString(v)
	case "points", "cx", "cy", "rx", "ry", "r", "x", "y", "x1", "y1", "x2", "y2", "stroke-width", "stroke-dasharray", "dx", "dy":
		ok = element != "svg" && numeric.MatchString(v)
	case "d":
		ok = element == "path" && pathData.MatchString(v)
	case "transform":
		ok = transform.MatchString(v)
	case "text-anchor":
		ok = v == "start" || v == "middle" || v == "end"
	case "font-weight":
		ok = v == "bold" || v == "normal"
	case "font-style":
		ok = v == "italic" || v == "normal"
	case "id":
		if idPattern.MatchString(v) {
			fmt.Fprintf(b, ` id="%s-%s"`, prefix, v)
		}
		return
	case "class":
		var keep []string
		for _, c := range strings.Fields(v) {
			if kinds[c] || tones[c] {
				keep = append(keep, c)
			}
		}
		if len(keep) > 0 {
			fmt.Fprintf(b, ` class="%s"`, strings.Join(keep, " "))
		}
		return
	case "fill":
		// An unfilled mark on an edge, such as an open arrowhead, stays open.
		if v == "none" && element != "path" && element != "text" {
			b.WriteString(` class="hollow"`)
		}
		return
	}
	if ok {
		fmt.Fprintf(b, ` %s="%s"`, a.Name.Local, attr(v))
	}
}

func attr(s string) string {
	var buf bytes.Buffer
	_ = xml.EscapeText(&buf, []byte(s))
	return buf.String()
}
