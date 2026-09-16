package diagram

import (
	"fmt"
	"regexp"
	"strings"
)

// MermaidToDOT translates a Mermaid flowchart to DOT: its direction, node
// shapes and labels, links with their line style, ends, and labels, chains
// and & groups, nested subgraphs, and class or ::: tone words. Styling
// statements are ignored with a note, since the tokens color every diagram.
// Any other Mermaid diagram type is an error, so the part keeps its source.
func MermaidToDOT(src string) (string, []string, error) {
	lines := mermaidLines(src)
	if len(lines) == 0 {
		return "", nil, fmt.Errorf("the Mermaid source is empty")
	}
	header := strings.Fields(lines[0])
	if kind := strings.ToLower(header[0]); kind != "flowchart" && kind != "graph" {
		return "", nil, fmt.Errorf("only Mermaid flowcharts render, and this is a %s", header[0])
	}
	t := &translator{rankdir: "TB", nodes: map[string]*mNode{}}
	if len(header) > 1 {
		dir, ok := directions[strings.ToUpper(header[1])]
		if !ok {
			return "", nil, fmt.Errorf("flowchart direction %q is not TB, TD, BT, LR, or RL", header[1])
		}
		t.rankdir = dir
	}
	for n, line := range lines[1:] {
		if err := t.statement(line); err != nil {
			return "", nil, fmt.Errorf("line %d of the Mermaid source: %w", n+2, err)
		}
	}
	if len(t.stack) > 0 {
		return "", nil, fmt.Errorf("subgraph %q has no end", t.clusters[t.stack[len(t.stack)-1]].label)
	}
	return t.dot(), t.notes, nil
}

var directions = map[string]string{"TB": "TB", "TD": "TB", "BT": "BT", "LR": "LR", "RL": "RL"}

// mermaidLines splits statements on newlines and on semicolons outside
// quotes, dropping %% comments and blank lines.
func mermaidLines(src string) []string {
	var out []string
	for _, raw := range strings.Split(src, "\n") {
		if i := strings.Index(raw, "%%"); i >= 0 {
			raw = raw[:i]
		}
		start, quoted := 0, false
		for i := 0; i <= len(raw); i++ {
			switch {
			case i < len(raw) && raw[i] == '"':
				quoted = !quoted
			case i == len(raw) || (raw[i] == ';' && !quoted):
				if part := strings.TrimSpace(raw[start:i]); part != "" {
					out = append(out, part)
				}
				start = i + 1
			}
		}
	}
	return out
}

type mNode struct {
	id, label, shape string
	tones            []string
	cluster          int // the subgraph it was last mentioned in, or -1
}

type mEdge struct {
	from, to, label, style string
	head, tail             string
}

type mCluster struct {
	label  string
	parent int // index of the enclosing subgraph, or -1
}

type translator struct {
	rankdir  string
	nodes    map[string]*mNode
	order    []string
	edges    []mEdge
	clusters []mCluster
	stack    []int
	notes    []string
	ignored  map[string]bool
}

var (
	subgraphPattern = regexp.MustCompile(`^subgraph\s+(?:"([^"]*)"|([^\s\[]+))\s*(?:\[\s*"?([^"\]]*?)"?\s*\])?$`)
	classPattern    = regexp.MustCompile(`^class\s+(.+?)\s+([A-Za-z][\w-]*)$`)
	nodeID          = regexp.MustCompile(`^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*`)
)

func (t *translator) statement(line string) error {
	lower := strings.ToLower(line)
	first := strings.Fields(lower)[0]
	switch first {
	case "end":
		if len(t.stack) == 0 {
			return fmt.Errorf("end without a subgraph")
		}
		t.stack = t.stack[:len(t.stack)-1]
		return nil
	case "subgraph":
		m := subgraphPattern.FindStringSubmatch(line)
		if m == nil {
			return fmt.Errorf("subgraph needs an id, as in subgraph checkout [Checkout]")
		}
		label := m[3]
		switch {
		case m[1] != "":
			label = m[1]
		case label == "":
			label = m[2]
		}
		parent := -1
		if len(t.stack) > 0 {
			parent = t.stack[len(t.stack)-1]
		}
		t.clusters = append(t.clusters, mCluster{label: label, parent: parent})
		t.stack = append(t.stack, len(t.clusters)-1)
		return nil
	case "direction":
		return nil
	case "class":
		m := classPattern.FindStringSubmatch(line)
		if m == nil {
			return fmt.Errorf("class needs node ids and a class name, as in class a,b teal")
		}
		for _, id := range strings.Split(m[1], ",") {
			n := t.node(strings.TrimSpace(id))
			n.tones = append(n.tones, m[2])
		}
		return nil
	case "classdef", "style", "linkstyle", "click":
		if t.ignored == nil {
			t.ignored = map[string]bool{}
		}
		if !t.ignored[first] {
			t.ignored[first] = true
			t.notes = append(t.notes, fmt.Sprintf("Mermaid %s statements are ignored: diagrams take the page's colors, and the classes teal, violet, risk, and accent mark nodes", first))
		}
		return nil
	}
	return t.chain(line)
}

// chain reads a statement of nodes joined by links, such as
// "A[Start] --> B & C -- yes --> D".
func (t *translator) chain(line string) error {
	from, rest, err := t.group(line)
	if err != nil {
		return err
	}
	for rest != "" {
		link, after, err := readLink(rest)
		if err != nil {
			return err
		}
		to, remaining, err := t.group(after)
		if err != nil {
			return err
		}
		for _, a := range from {
			for _, b := range to {
				e := link
				e.from, e.to = a, b
				t.edges = append(t.edges, e)
			}
		}
		from, rest = to, remaining
	}
	return nil
}

// group reads "A[x] & B" and returns the node ids and what follows.
func (t *translator) group(s string) ([]string, string, error) {
	var ids []string
	for {
		id, rest, err := t.nodeRef(strings.TrimSpace(s))
		if err != nil {
			return nil, "", err
		}
		ids = append(ids, id)
		rest = strings.TrimSpace(rest)
		if !strings.HasPrefix(rest, "&") {
			return ids, rest, nil
		}
		s = rest[1:]
	}
}

// shapes pairs Mermaid's label brackets with DOT shapes, longest first.
var shapes = []struct{ open, close, dot string }{
	{"(((", ")))", `shape=doublecircle`},
	{"([", "])", `shape=box, style=rounded`},
	{"[[", "]]", `shape=box, peripheries=2`},
	{"[(", ")]", `shape=cylinder`},
	{"((", "))", `shape=circle`},
	{"{{", "}}", `shape=hexagon`},
	{"[/", "/]", `shape=parallelogram`},
	{"[\\", "\\]", `shape=parallelogram`},
	{"[/", "\\]", `shape=trapezium`},
	{"[\\", "/]", `shape=invtrapezium`},
	{">", "]", `shape=cds`},
	{"(", ")", `shape=box, style=rounded`},
	{"[", "]", `shape=box, style=""`},
	{"{", "}", `shape=diamond`},
}

// nodeRef reads one node: its id, an optional bracketed label, and optional
// :::class words.
func (t *translator) nodeRef(s string) (string, string, error) {
	id := nodeID.FindString(s)
	if id == "" {
		return "", "", fmt.Errorf("expected a node id at %q", clip(s))
	}
	rest := s[len(id):]
	n := t.node(id)
	// Brackets that share an opening, such as [/ ... /] and [/ ... \], are
	// told apart by whichever closing comes first.
	best, bestEnd := -1, -1
	for i, sh := range shapes {
		if !strings.HasPrefix(rest, sh.open) {
			continue
		}
		end := labelEnd(rest[len(sh.open):], sh.close)
		if end >= 0 && (best < 0 || len(sh.open)+end < len(shapes[best].open)+bestEnd || (len(sh.open)+end == len(shapes[best].open)+bestEnd && len(sh.open) > len(shapes[best].open))) {
			best, bestEnd = i, end
		}
	}
	if best >= 0 {
		sh := shapes[best]
		body := rest[len(sh.open):]
		n.label = strings.TrimSpace(body[:bestEnd])
		if len(n.label) >= 2 && n.label[0] == '"' && n.label[len(n.label)-1] == '"' {
			n.label = n.label[1 : len(n.label)-1]
		}
		n.shape = sh.dot
		rest = body[bestEnd+len(sh.close):]
	}
	for strings.HasPrefix(rest, ":::") {
		class := nodeID.FindString(rest[3:])
		if class == "" {
			return "", "", fmt.Errorf("::: needs a class name")
		}
		n.tones = append(n.tones, class)
		rest = rest[3+len(class):]
	}
	return id, rest, nil
}

// labelEnd finds the closing bracket of a label, past any quoted text.
func labelEnd(body, close string) int {
	start := 0
	if trimmed := strings.TrimLeft(body, " "); strings.HasPrefix(trimmed, `"`) {
		open := len(body) - len(trimmed)
		q := strings.Index(body[open+1:], `"`)
		if q < 0 {
			return -1
		}
		start = open + 1 + q + 1
	}
	if i := strings.Index(body[start:], close); i >= 0 {
		return start + i
	}
	return -1
}

// node returns a node, creating it on first mention. A mention inside a
// subgraph places the node there, as Mermaid does; a later mention outside
// every subgraph leaves it where it is.
func (t *translator) node(id string) *mNode {
	n, ok := t.nodes[id]
	if !ok {
		n = &mNode{id: id, label: id, shape: `shape=box, style=rounded`, cluster: -1}
		t.nodes[id] = n
		t.order = append(t.order, id)
	}
	if len(t.stack) > 0 {
		n.cluster = t.stack[len(t.stack)-1]
	}
	return n
}

var (
	// A complete link: "-->", "---", "-.->", "==>", "<-->", "--o", "--x".
	link = regexp.MustCompile(`^(<|x|o)?(-{3,}|={3,}|-\.+-|-{2}(?:>|x|o)|={2}(?:>|x|o))(>|x|o)?`)
	// The opening half of a labeled link: "-- ", "== ", "-. ".
	opener = regexp.MustCompile(`^(<)?(--|==|-\.)\s`)
	// The closing halves that end those labels.
	closers = map[string]*regexp.Regexp{
		"--": regexp.MustCompile(`\s(-{2,})(>|x|o)?`),
		"==": regexp.MustCompile(`\s(={2,})(>|x|o)?`),
		"-.": regexp.MustCompile(`\s(\.-+)(>|x|o)?`),
	}
)

// readLink reads one link with its label, in either form: "-->|label|" or
// "-- label -->".
func readLink(s string) (mEdge, string, error) {
	e := mEdge{style: "solid"}
	styleOf := func(body string) {
		switch {
		case strings.HasPrefix(body, "="):
			e.style = "bold"
		case strings.Contains(body, "."):
			e.style = "dashed"
		}
	}
	if m := opener.FindStringSubmatch(s); m != nil {
		rest := s[len(m[0]):]
		loc := closers[m[2]].FindStringSubmatchIndex(rest)
		if loc == nil {
			return e, "", fmt.Errorf("the link label after %q needs a closing link, as in -- label -->", m[2])
		}
		e.label = strings.TrimSpace(rest[:loc[0]])
		styleOf(m[2])
		head := ""
		if loc[4] >= 0 {
			head = rest[loc[4]:loc[5]]
		}
		e.head, e.tail = end(head, true), end(m[1], false)
		return e, strings.TrimSpace(rest[loc[1]:]), nil
	}
	m := link.FindStringSubmatch(s)
	if m == nil {
		return e, "", fmt.Errorf("expected a link such as --> at %q", clip(s))
	}
	body, head := m[2], m[3]
	if strings.HasSuffix(body, ">") || strings.HasSuffix(body, "x") || strings.HasSuffix(body, "o") {
		head, body = body[len(body)-1:], body[:len(body)-1]
	}
	styleOf(body)
	e.head, e.tail = end(head, true), end(m[1], false)
	rest := strings.TrimSpace(s[len(m[0]):])
	if strings.HasPrefix(rest, "|") {
		close := strings.Index(rest[1:], "|")
		if close < 0 {
			return e, "", fmt.Errorf("a link label opened with | needs a closing |")
		}
		e.label = strings.Trim(strings.TrimSpace(rest[1:close+1]), `"`)
		rest = strings.TrimSpace(rest[close+2:])
	}
	return e, rest, nil
}

// end maps a Mermaid link end to a DOT arrow: none for an open line.
func end(mark string, head bool) string {
	switch mark {
	case ">", "<":
		return "normal"
	case "x":
		return "tee"
	case "o":
		return "odot"
	}
	if head {
		return "none"
	}
	return ""
}

func clip(s string) string {
	if len(s) > 24 {
		return s[:24] + "..."
	}
	return s
}

func (t *translator) dot() string {
	var b strings.Builder
	b.WriteString("digraph {\n  rankdir=" + t.rankdir + ";\n")
	placed := map[string]bool{}
	var cluster func(i int, indent string)
	cluster = func(i int, indent string) {
		c := t.clusters[i]
		fmt.Fprintf(&b, "%ssubgraph cluster_%d {\n%s  label=%s;\n", indent, i, indent, dotQuote(c.label))
		for _, id := range t.order {
			if t.nodes[id].cluster == i {
				placed[id] = true
				b.WriteString(indent + "  " + t.nodeDOT(id) + ";\n")
			}
		}
		for j := range t.clusters {
			if t.clusters[j].parent == i {
				cluster(j, indent+"  ")
			}
		}
		b.WriteString(indent + "}\n")
	}
	for i := range t.clusters {
		if t.clusters[i].parent == -1 {
			cluster(i, "  ")
		}
	}
	for _, id := range t.order {
		if !placed[id] {
			b.WriteString("  " + t.nodeDOT(id) + ";\n")
		}
	}
	for _, e := range t.edges {
		var attrs []string
		if e.label != "" {
			attrs = append(attrs, "label="+dotQuote(e.label))
		}
		if e.style != "solid" {
			attrs = append(attrs, "style="+e.style)
		}
		if e.head != "normal" {
			attrs = append(attrs, "arrowhead="+e.head)
		}
		if e.tail != "" {
			attrs = append(attrs, "dir=both", "arrowtail="+e.tail)
		}
		b.WriteString("  " + dotQuote(e.from) + " -> " + dotQuote(e.to))
		if len(attrs) > 0 {
			b.WriteString(" [" + strings.Join(attrs, ", ") + "]")
		}
		b.WriteString(";\n")
	}
	b.WriteString("}\n")
	return b.String()
}

func (t *translator) nodeDOT(id string) string {
	n := t.nodes[id]
	attrs := "label=" + dotQuote(n.label) + ", " + n.shape
	var classes []string
	for _, c := range n.tones {
		if tones[c] {
			classes = append(classes, c)
		}
	}
	if len(classes) > 0 {
		attrs += ", class=" + dotQuote(strings.Join(classes, " "))
	}
	return dotQuote(id) + " [" + attrs + "]"
}

var breaks = regexp.MustCompile(`(?i)<br\s*/?>`)

// dotQuote writes a DOT string: backslashes and quotes escaped, and Mermaid
// line breaks as DOT's centered \n.
func dotQuote(s string) string {
	s = strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s)
	return `"` + breaks.ReplaceAllString(s, `\n`) + `"`
}
