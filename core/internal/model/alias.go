package model

// A 0.6 document (dossierVersion, blocks, forty-three block types) is
// accepted and rewritten onto the 0.7 model before strict decoding. Every
// aliased block is reported as a warning so the rewrite is never silent.
// 0.8 removes this file.

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// legacyKinds maps every 0.6 kind onto a 0.7 preset.
var legacyKinds = map[string]string{
	"dossier": "brief", "reader": "brief", "research": "brief", "comparison": "brief", "adr": "brief", "runbook": "brief",
	"plan": "plan", "implementation": "plan", "integration-loop": "plan", "debug": "plan",
	"review": "review", "review-board": "review",
	"release": "release", "incident": "incident",
}

// keptMeta lists the 0.6 meta keys that have a 0.7 home or an Overview row.
var keptMeta = map[string]bool{"title": true, "slug": true, "eyebrow": true, "status": true, "updated": true, "owner": true, "version": true, "tags": true, "changelog": true}

// boardFamilies maps a 0.6 board block onto the field holding its items and
// the 0.7 board layout.
var boardFamilies = map[string]struct {
	field  string
	layout string
	title  string
}{
	"review-board":      {"candidates", "articles", "Candidates"},
	"process-board":     {"items", "articles", "Work items"},
	"finding-list":      {"findings", "rows", "Findings"},
	"cycle-board":       {"cycles", "rows", "Cycles"},
	"evidence-log":      {"items", "rows", "Evidence"},
	"decision-log":      {"decisions", "rows", "Decisions"},
	"verification-run":  {"runs", "rows", "Verification"},
	"release-checklist": {"gates", "rows", "Release gates"},
	"comment-thread":    {"threads", "rows", "Discussion"},
	"patch-set":         {"patches", "rows", "Patches"},
}

// defaultTitles gives untitled blocks that deserve their own section a title.
var defaultTitles = map[string]string{
	"glossary": "Glossary", "footnotes": "Notes", "assumptions": "Assumptions and open questions", "citations": "Citations",
	"references": "References", "faq": "FAQ", "decision-matrix": "Options", "risk-register": "Risks", "action-items": "Action items",
	"receipt": "Receipt", "process-receipt": "Receipt", "upstream-response": "Upstream response", "integration-report": "Integration report",
	"verdict-gate": "Gate", "trust-report": "Trust report",
}

// lightTypes never open a section on their own; their title, if any, stays on the part.
var lightTypes = map[string]bool{"callout": true, "code": true, "chart": true, "diagram": true, "figure": true, "prose": true, "stat-strip": true, "summary-cards": true, "math": true}

var (
	slugStrip   = regexp.MustCompile(`[^a-z0-9]+`)
	refPatterns = map[string]*regexp.Regexp{
		"footnote [^id]":    regexp.MustCompile(`\[\^[^\]\s]+\]`),
		"citation [@id]":    regexp.MustCompile(`\[@[^\]\s]+\]`),
		"glossary [[Term]]": regexp.MustCompile(`\[\[[^\]]+\]\]`),
	}
)

// IsLegacy reports whether a decoded JSON object is a 0.6 document.
func IsLegacy(raw map[string]any) bool {
	if _, ok := raw["dossier"]; ok {
		return false
	}
	_, hasVersion := raw["dossierVersion"]
	_, hasBlocks := raw["blocks"]
	return hasVersion || hasBlocks
}

// Normalize accepts either a 0.7 model or a 0.6 document. A 0.7 model, or
// anything that is not a JSON object, is returned untouched. A 0.6 document is
// rewritten onto the 0.7 model with one warning per aliased block; upgraded
// reports that this happened.
func Normalize(data []byte) (out []byte, warnings []Problem, upgraded bool, err error) {
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil || !IsLegacy(raw) {
		return data, nil, false, nil
	}
	c := &converter{ids: idRegistry{used: map[string]bool{}, renamed: map[string]string{}}, refSeen: map[string]bool{}}
	doc := c.convert(raw)
	out, err = Encode(doc)
	if err != nil {
		return nil, nil, true, err
	}
	return out, c.warnings, true, nil
}

type converter struct {
	warnings []Problem
	ids      idRegistry
	sections []Section
	closed   bool // the open section carries a board; the next content opens another
	pending  []pendingDeps
	refSeen  map[string]bool
}

type pendingDeps struct {
	itemID string
	path   string
	deps   []string
}

func (c *converter) warn(path, format string, args ...any) {
	c.warnings = append(c.warnings, Problem{Path: path, Message: fmt.Sprintf(format, args...)})
}

func (c *converter) alias(path, typ, what string) {
	c.warn(path, "%q is a 0.6 block, mapped to %s; 0.8 removes this alias", typ, what)
}

func (c *converter) convert(raw map[string]any) *Document {
	doc := &Document{Dossier: Version}
	c.warn("/dossierVersion", "0.6 document rewritten onto the 0.7 model at build time; 0.8 removes this alias")
	oldKind := str(raw, "kind")
	if k, ok := legacyKinds[oldKind]; ok {
		doc.Kind = k
		c.warn("/kind", "0.6 kind %q mapped to %q", oldKind, k)
	} else {
		doc.Kind = "brief"
		c.warn("/kind", "unknown 0.6 kind %q mapped to \"brief\"", oldKind)
	}
	blocks := objs(raw, "blocks")
	heroIndex := -1
	for i, b := range blocks {
		if str(b, "type") == "hero" {
			heroIndex = i
			break
		}
	}
	var hero map[string]any
	if heroIndex >= 0 {
		hero = blocks[heroIndex]
	}
	doc.Meta = c.meta(obj(raw, "meta"), hero)
	if hero != nil {
		c.hero(fmt.Sprintf("/blocks/%d", heroIndex), hero, doc.Meta.Title)
	}
	c.metaOverview(obj(raw, "meta"))
	for i, b := range blocks {
		if i == heroIndex {
			continue
		}
		c.block(fmt.Sprintf("/blocks/%d", i), b, "")
	}
	c.finish(doc)
	return doc
}

func (c *converter) meta(m, hero map[string]any) Meta {
	title := str(m, "title")
	if title == "" {
		title = str(hero, "title")
	}
	if title == "" {
		title = "Untitled"
	}
	slugValue := str(m, "slug")
	if slug(slugValue) != slugValue || slugValue == "" {
		if slugValue != "" {
			c.warn("/meta/slug", "%q rewritten to %q", slugValue, slug(slugValue))
		}
		slugValue = slug(slugValue)
		if slugValue == "" {
			slugValue = slug(title)
		}
	}
	kicker := str(hero, "eyebrow")
	if kicker == "" {
		kicker = str(m, "eyebrow")
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if !keptMeta[k] {
			c.warn("/meta/"+k, "has no 0.7 field and is dropped")
		}
	}
	return Meta{Title: title, Slug: slugValue, Kicker: kicker, Lede: plainText(str(hero, "lede")), Updated: str(m, "updated"), Status: str(m, "status")}
}

// hero folds the masthead block into meta and keeps its tagline and cards in
// the Overview section.
func (c *converter) hero(path string, hero map[string]any, metaTitle string) {
	c.alias(path, "hero", "meta and the Overview section")
	if t := str(hero, "title"); t != "" && t != metaTitle {
		c.add(Part{Type: "prose", Markdown: "**" + mdEscape(t) + "**"})
	}
	var rows []SpecRow
	if pills := strs(hero, "pills"); len(pills) > 0 {
		rows = append(rows, SpecRow{Label: "Highlights", Text: mdEscape(strings.Join(pills, " · "))})
	}
	for _, card := range objs(hero, "sideCards") {
		text := mdEscape(str(card, "value"))
		if note := str(card, "note"); note != "" {
			text += " (" + mdEscape(note) + ")"
		}
		if label := str(card, "label"); label != "" && text != "" {
			rows = append(rows, SpecRow{Label: label, Text: text})
		}
	}
	if len(rows) > 0 {
		c.add(Part{Type: "spec", Spec: rows})
	}
}

// metaOverview keeps the 0.6 meta fields that have no 0.7 field but carry
// information a reader wants: owner, version, tags, and the changelog.
func (c *converter) metaOverview(m map[string]any) {
	var rows []SpecRow
	if v := str(m, "owner"); v != "" {
		rows = append(rows, SpecRow{Label: "Owner", Text: mdEscape(v)})
	}
	if v := str(m, "version"); v != "" {
		rows = append(rows, SpecRow{Label: "Version", Text: mdEscape(v)})
	}
	if tags := strs(m, "tags"); len(tags) > 0 {
		rows = append(rows, SpecRow{Label: "Tags", Text: mdEscape(strings.Join(tags, ", "))})
	}
	if len(rows) > 0 {
		c.warn("/meta", "owner, version, and tags have no 0.7 field; kept as Overview rows")
		c.add(Part{Type: "spec", Spec: rows})
	}
	if log := objs(m, "changelog"); len(log) > 0 {
		c.warn("/meta/changelog", "has no 0.7 field; kept as an Overview table")
		t := Part{Type: "table", Columns: []string{"Version", "Date", "Summary"}}
		for _, e := range log {
			t.Rows = append(t.Rows, []string{mdEscape(str(e, "version")), mdEscape(str(e, "date")), mdEscape(str(e, "summary"))})
		}
		c.add(t)
	}
}

// open starts a new section and makes it current.
func (c *converter) open(path, title, wantID string) {
	if strings.TrimSpace(title) == "" {
		title = "Section"
	}
	title, _ = clamp(title, maxTitleRunes)
	id := c.ids.claim(c, path+"/id", wantID, title, "section")
	c.sections = append(c.sections, Section{ID: id, Title: title})
	c.closed = false
}

// ensureOpen guarantees a section that can still take parts: the Overview at
// the top, or a continuation after a board.
func (c *converter) ensureOpen(path string) {
	if len(c.sections) == 0 {
		c.open(path, "Overview", "overview")
		return
	}
	if c.closed {
		c.open(path, c.sections[len(c.sections)-1].Title+", continued", "")
	}
}

func (c *converter) add(parts ...Part) {
	if len(parts) == 0 {
		return
	}
	c.ensureOpen("/blocks")
	s := &c.sections[len(c.sections)-1]
	s.Parts = append(s.Parts, parts...)
}

func (c *converter) attach(b *Board) {
	s := &c.sections[len(c.sections)-1]
	s.Board = b
	c.closed = true
}

func heading(title string) Part {
	return Part{Type: "prose", Markdown: "### " + mdEscape(title)}
}

// block places one 0.6 block. parent is the enclosing section title when
// nested, empty at the top level.
func (c *converter) block(path string, b map[string]any, parent string) {
	typ := str(b, "type")
	nested := parent != ""
	switch typ {
	case "hero":
		c.alias(path, "hero", "the Overview section")
		c.hero(path, b, "")
		return
	case "section":
		title := str(b, "title")
		if nested {
			c.ensureOpen(path)
			if title != "" {
				c.add(heading(title))
			}
		} else {
			c.open(path, title, str(b, "id"))
		}
		if sub := str(b, "subtitle"); sub != "" {
			c.add(Part{Type: "prose", Markdown: c.rich(path+"/subtitle", sub)})
		}
		if title == "" {
			title = "Section"
		}
		c.children(path+"/blocks", objs(b, "blocks"), title)
		return
	case "two-col":
		c.alias(path, typ, "its left then right blocks in order")
		c.children(path+"/left", objs(b, "left"), parentOr(parent, "Section"))
		c.children(path+"/right", objs(b, "right"), parentOr(parent, "Section"))
		return
	case "tabs":
		c.alias(path, typ, "a heading per tab followed by its blocks")
		for i, tab := range objs(b, "tabs") {
			if label := str(tab, "label"); label != "" {
				c.ensureOpen(path)
				c.add(heading(label))
			}
			c.children(fmt.Sprintf("%s/tabs/%d/blocks", path, i), objs(tab, "blocks"), parentOr(parent, "Section"))
		}
		return
	}
	parts, board := c.convertBlock(path, b)
	title := str(b, "title")
	if lightTypes[typ] {
		title = ""
	}
	if board != nil {
		if title == "" {
			title = defaultTitles[typ]
			if f, ok := boardFamilies[typ]; ok && title == "" {
				title = f.title
			}
		}
		if nested && len(c.sections) > 0 && !c.closed {
			c.add(heading(title))
			c.add(parts...)
		} else {
			c.open(path, title, str(b, "id"))
			c.add(parts...)
		}
		c.attach(board)
		return
	}
	if title == "" {
		title = defaultTitles[typ]
	}
	if title != "" {
		if nested {
			c.ensureOpen(path)
			c.add(heading(title))
		} else {
			c.open(path, title, str(b, "id"))
		}
		for i := range parts {
			if parts[i].Type != "callout" && parts[i].Type != "code" {
				parts[i].Title = ""
			}
		}
		c.add(parts...)
		return
	}
	c.ensureOpen(path)
	c.add(parts...)
}

func parentOr(parent, fallback string) string {
	if parent == "" {
		return fallback
	}
	return parent
}

func (c *converter) children(path string, blocks []map[string]any, parent string) {
	for i, b := range blocks {
		c.block(fmt.Sprintf("%s/%d", path, i), b, parent)
	}
}

// convertBlock maps one non-structural block onto parts and an optional board.
func (c *converter) convertBlock(path string, b map[string]any) ([]Part, *Board) {
	typ := str(b, "type")
	title := str(b, "title")
	if f, ok := boardFamilies[typ]; ok {
		c.alias(path, typ, "a board ("+f.layout+")")
		var parts []Part
		if s := str(b, "summary"); s != "" {
			parts = append(parts, Part{Type: "prose", Markdown: c.rich(path+"/summary", s)})
		}
		if scopes := strs(b, "scopes"); len(scopes) > 0 {
			parts = append(parts, Part{Type: "prose", Markdown: "Scopes: " + mdEscape(strings.Join(scopes, ", "))})
		}
		return parts, c.board(path, typ, f.field, f.layout, objs(b, f.field))
	}
	switch typ {
	case "prose":
		md := str(b, "markdown")
		if h := str(b, "heading"); h != "" {
			md = "### " + mdEscape(h) + "\n\n" + md
		}
		return []Part{{Type: "prose", Markdown: c.rich(path+"/markdown", md)}}, nil
	case "callout":
		tone := "note"
		switch str(b, "tone") {
		case "warn", "danger":
			tone = "risk"
		}
		return []Part{{Type: "callout", Title: title, Tone: tone, Markdown: c.rich(path+"/body", str(b, "body"))}}, nil
	case "table":
		t := Part{Type: "table", Title: title, Columns: strs(b, "columns")}
		for i, row := range list(b, "rows") {
			var cells []string
			for _, cell := range toList(row) {
				cells = append(cells, c.rich(fmt.Sprintf("%s/rows/%d", path, i), text(cell)))
			}
			t.Rows = append(t.Rows, cells)
		}
		return []Part{t}, nil
	case "code":
		return []Part{{Type: "code", Title: str(b, "filename"), Lang: str(b, "lang"), Code: str(b, "code")}}, nil
	case "figure":
		return []Part{{Type: "figure", Src: str(b, "src"), Alt: str(b, "alt"), Caption: c.rich(path+"/caption", str(b, "caption"))}}, nil
	case "diagram":
		return []Part{{Type: "diagram", Title: title, Source: str(b, "spec"), Format: str(b, "format")}}, nil
	case "chart":
		p := Part{Type: "chart", Title: title, Variant: str(b, "chartType")}
		for _, d := range objs(b, "data") {
			p.Data = append(p.Data, Point{Label: text(d["label"]), Value: num(d["value"])})
		}
		return []Part{p}, nil
	case "code-editor":
		c.alias(path, typ, "a code part; edits do not round-trip in 0.7")
		parts := []Part{{Type: "code", Title: str(b, "filename"), Lang: str(b, "lang"), Code: str(b, "code")}}
		var lines []string
		if s := str(b, "summary"); s != "" {
			lines = append(lines, c.rich(path+"/summary", s))
		}
		if p := str(b, "targetPath"); p != "" {
			lines = append(lines, "Target: "+mdCode(p))
		}
		if items := strs(b, "workItems"); len(items) > 0 {
			lines = append(lines, "Work items: "+mdEscape(strings.Join(items, ", ")))
		}
		if len(lines) > 0 {
			parts = append([]Part{{Type: "callout", Title: "Editor", Markdown: strings.Join(lines, "\n\n")}}, parts...)
		}
		return parts, nil
	case "diff-view":
		c.alias(path, typ, "a diff code part")
		var parts []Part
		if s := str(b, "summary"); s != "" {
			parts = append(parts, Part{Type: "prose", Markdown: c.rich(path+"/summary", s)})
		}
		return append(parts, Part{Type: "code", Title: str(b, "filename"), Lang: "diff", Code: str(b, "diff")}), nil
	case "math":
		c.alias(path, typ, "a latex code part; math is not rendered in 0.7")
		return []Part{{Type: "code", Lang: "latex", Code: str(b, "tex")}}, nil
	case "summary-cards":
		c.alias(path, typ, "a spec part")
		var rows []SpecRow
		for i, card := range objs(b, "cards") {
			label := str(card, "title")
			if label == "" {
				label = fmt.Sprintf("Card %d", i+1)
			}
			if body := c.rich(fmt.Sprintf("%s/cards/%d/body", path, i), str(card, "body")); body != "" {
				rows = append(rows, SpecRow{Label: label, Text: body})
			}
		}
		return specParts(rows), nil
	case "stat-strip":
		c.alias(path, typ, "a spec part")
		var rows []SpecRow
		for _, s := range objs(b, "stats") {
			value := mdEscape(text(s["value"]))
			switch d := s["delta"].(type) {
			case string:
				if d != "" {
					value += " (" + mdEscape(d) + ")"
				}
			case map[string]any:
				if dv := text(d["value"]); dv != "" {
					value += " (" + mdEscape(strings.TrimSpace(dv+" "+str(d, "label"))) + ")"
				}
			}
			if label := str(s, "label"); label != "" && value != "" {
				rows = append(rows, SpecRow{Label: label, Text: value})
			}
		}
		return specParts(rows), nil
	case "glossary":
		c.alias(path, typ, "a spec part")
		var rows []SpecRow
		for i, t := range objs(b, "terms") {
			if term, def := str(t, "term"), c.rich(fmt.Sprintf("%s/terms/%d", path, i), str(t, "definition")); term != "" && def != "" {
				rows = append(rows, SpecRow{Label: term, Text: def})
			}
		}
		return specParts(rows), nil
	case "receipt":
		c.alias(path, typ, "a spec part")
		rows := specRows(b, [][2]string{{"generatedBy", "Generated by"}, {"model", "Model"}, {"date", "Date"}, {"confidence", "Confidence"}, {"tools", "Tools"}})
		var sources []string
		for _, s := range objs(b, "sources") {
			sources = append(sources, mdLink(str(s, "label"), str(s, "url")))
		}
		if len(sources) > 0 {
			rows = append(rows, SpecRow{Label: "Sources", Text: strings.Join(sources, ", ")})
		}
		if n := str(b, "notes"); n != "" {
			rows = append(rows, SpecRow{Label: "Notes", Text: c.rich(path+"/notes", n)})
		}
		return specParts(rows), nil
	case "process-receipt":
		c.alias(path, typ, "a spec part")
		var parts []Part
		if s := str(b, "summary"); s != "" {
			parts = append(parts, Part{Type: "prose", Markdown: c.rich(path+"/summary", s)})
		}
		rows := specRows(b, [][2]string{{"outcome", "Outcome"}, {"owner", "Owner"}, {"date", "Date"}, {"model", "Model"}})
		if files := strs(b, "changedFiles"); len(files) > 0 {
			rows = append(rows, SpecRow{Label: "Changed files", Text: codeList(files)})
		}
		if cmds := strs(b, "commands"); len(cmds) > 0 {
			rows = append(rows, SpecRow{Label: "Commands", Text: codeList(cmds)})
		}
		if risks := strs(b, "risks"); len(risks) > 0 {
			rows = append(rows, SpecRow{Label: "Risks", Text: mdEscape(strings.Join(risks, "; "))})
		}
		if ups := strs(b, "followUps"); len(ups) > 0 {
			rows = append(rows, SpecRow{Label: "Follow-ups", Text: mdEscape(strings.Join(ups, "; "))})
		}
		return append(parts, specParts(rows)...), nil
	case "upstream-response":
		c.alias(path, typ, "a spec part")
		return specParts(specRows(b, [][2]string{{"upstream", "Upstream"}, {"status", "Status"}, {"request", "Request"}, {"response", "Response"}, {"nextStep", "Next step"}})), nil
	case "integration-report":
		c.alias(path, typ, "a spec part and a board (rows)")
		var parts []Part
		if s := str(b, "summary"); s != "" {
			parts = append(parts, Part{Type: "prose", Markdown: c.rich(path+"/summary", s)})
		}
		parts = append(parts, specParts(specRows(b, [][2]string{{"producer", "Producer"}, {"consumer", "Consumer"}, {"status", "Status"}, {"version", "Version"}, {"nextStep", "Next step"}}))...)
		if items := objs(b, "items"); len(items) > 0 {
			return parts, c.board(path, typ, "items", "rows", items)
		}
		return parts, nil
	case "verdict-gate":
		c.alias(path, typ, "a callout")
		if v := str(b, "verdict"); v != "" && v != "undecided" {
			c.warn(path+"/verdict", "verdict %q is 0.6 reader state and is dropped; 0.7 state is picks and notes", v)
		}
		md := c.rich(path+"/prompt", str(b, "prompt"))
		if opts := strs(b, "options"); len(opts) > 0 {
			md += "\n\nOptions: " + mdEscape(strings.Join(opts, ", "))
		}
		if md == "" {
			md = "Decide on this packet."
		}
		return []Part{{Type: "callout", Title: title, Markdown: md}}, nil
	case "flow":
		c.alias(path, typ, "a numbered list")
		var lines []string
		for i, s := range objs(b, "steps") {
			line := fmt.Sprintf("%d. ", i+1)
			if t := str(s, "title"); t != "" {
				line += "**" + mdEscape(t) + "**"
			}
			if body := c.rich(fmt.Sprintf("%s/steps/%d/body", path, i), str(s, "body")); body != "" {
				line += " " + strings.ReplaceAll(body, "\n", " ")
			}
			lines = append(lines, line)
		}
		return proseParts(strings.Join(lines, "\n")), nil
	case "faq":
		c.alias(path, typ, "prose")
		var blocks []string
		for i, it := range objs(b, "items") {
			q, a := str(it, "q"), c.rich(fmt.Sprintf("%s/items/%d/a", path, i), str(it, "a"))
			if q != "" {
				blocks = append(blocks, "**"+mdEscape(q)+"**\n\n"+a)
			}
		}
		return proseParts(strings.Join(blocks, "\n\n")), nil
	case "footnotes":
		c.alias(path, typ, "a numbered list")
		var lines []string
		for i, it := range objs(b, "items") {
			lines = append(lines, fmt.Sprintf("%d. %s", i+1, strings.ReplaceAll(c.rich(fmt.Sprintf("%s/items/%d/text", path, i), str(it, "text")), "\n", " ")))
		}
		return proseParts(strings.Join(lines, "\n")), nil
	case "timeline":
		c.alias(path, typ, "a table")
		phases := objs(b, "phases")
		dated := false
		for _, p := range phases {
			if str(p, "date") != "" {
				dated = true
			}
		}
		t := Part{Type: "table", Title: title, Columns: []string{"Phase", "Status"}}
		if dated {
			t.Columns = append(t.Columns, "Date")
		}
		t.Columns = append(t.Columns, "Notes")
		for i, p := range phases {
			row := []string{mdEscape(str(p, "label")), mdEscape(str(p, "status"))}
			if dated {
				row = append(row, mdEscape(str(p, "date")))
			}
			row = append(row, c.rich(fmt.Sprintf("%s/phases/%d/body", path, i), str(p, "body")))
			t.Rows = append(t.Rows, row)
		}
		return []Part{t}, nil
	case "references":
		c.alias(path, typ, "a table")
		t := Part{Type: "table", Title: title, Columns: []string{"Source", "Signal", "Use"}}
		for i, r := range objs(b, "items") {
			t.Rows = append(t.Rows, []string{mdLink(str(r, "label"), str(r, "url")), c.rich(fmt.Sprintf("%s/items/%d/signal", path, i), str(r, "signal")), c.rich(fmt.Sprintf("%s/items/%d/use", path, i), str(r, "use"))})
		}
		return []Part{t}, nil
	case "decision-matrix":
		c.alias(path, typ, "a table")
		criteria := strs(b, "criteria")
		t := Part{Type: "table", Title: title, Columns: append([]string{"Option"}, criteria...)}
		for _, o := range objs(b, "options") {
			name := mdEscape(str(o, "name"))
			if boolean(o["recommended"]) {
				name += " (recommended)"
			}
			row := []string{name}
			scores := list(o, "scores")
			for i := range criteria {
				if i < len(scores) {
					row = append(row, mdEscape(text(scores[i])))
				} else {
					row = append(row, "")
				}
			}
			t.Rows = append(t.Rows, row)
		}
		return []Part{t}, nil
	case "risk-register":
		c.alias(path, typ, "a table")
		t := Part{Type: "table", Title: title, Columns: []string{"Risk", "Likelihood", "Impact", "Mitigation"}}
		for i, r := range objs(b, "risks") {
			t.Rows = append(t.Rows, []string{c.rich(fmt.Sprintf("%s/risks/%d/risk", path, i), str(r, "risk")), mdEscape(str(r, "likelihood")), mdEscape(str(r, "impact")), c.rich(fmt.Sprintf("%s/risks/%d/mitigation", path, i), str(r, "mitigation"))})
		}
		return []Part{t}, nil
	case "action-items":
		c.alias(path, typ, "a table; done state is not reader state in 0.7")
		t := Part{Type: "table", Title: title, Columns: []string{"Item", "Owner", "Status", "Note"}}
		for i, it := range objs(b, "items") {
			t.Rows = append(t.Rows, []string{c.rich(fmt.Sprintf("%s/items/%d/title", path, i), str(it, "title")), mdEscape(str(it, "owner")), mdEscape(str(it, "status")), c.rich(fmt.Sprintf("%s/items/%d/note", path, i), str(it, "note"))})
		}
		return []Part{t}, nil
	case "assumptions":
		c.alias(path, typ, "a table")
		t := Part{Type: "table", Title: title, Columns: []string{"Statement", "Kind", "Status"}}
		for i, it := range objs(b, "items") {
			t.Rows = append(t.Rows, []string{c.rich(fmt.Sprintf("%s/items/%d/statement", path, i), str(it, "statement")), mdEscape(str(it, "kind")), mdEscape(str(it, "status"))})
		}
		return []Part{t}, nil
	case "citations":
		c.alias(path, typ, "a table")
		t := Part{Type: "table", Title: title, Columns: []string{"Citation", "Authors", "Source", "Year", "Note"}}
		for i, it := range objs(b, "items") {
			label := str(it, "title")
			if label == "" {
				label = str(it, "label")
			}
			if label == "" {
				label = str(it, "id")
			}
			authors := strs(it, "authors")
			if a := str(it, "author"); a != "" {
				authors = append(authors, a)
			}
			source := firstStr(it, "source", "publisher", "journal", "site")
			year := firstStr(it, "year", "date")
			t.Rows = append(t.Rows, []string{mdLink(label, str(it, "url")), mdEscape(strings.Join(authors, ", ")), mdEscape(source), mdEscape(year), c.rich(fmt.Sprintf("%s/items/%d/note", path, i), firstStr(it, "note", "notes"))})
		}
		return []Part{t}, nil
	case "trust-report":
		c.alias(path, typ, "a sources table and a claims board")
		var parts []Part
		if s := str(b, "summary"); s != "" {
			parts = append(parts, Part{Type: "prose", Markdown: c.rich(path+"/summary", s)})
		}
		if sources := objs(b, "sources"); len(sources) > 0 {
			t := Part{Type: "table", Columns: []string{"Source", "Kind", "Trust", "Summary"}}
			for i, s := range sources {
				label := mdLink(firstStr(s, "label", "id"), str(s, "url"))
				if lic := str(s, "license"); lic != "" {
					label += " (" + mdEscape(lic) + ")"
				}
				t.Rows = append(t.Rows, []string{label, mdEscape(str(s, "kind")), mdEscape(str(s, "trust")), c.rich(fmt.Sprintf("%s/sources/%d/summary", path, i), str(s, "summary"))})
			}
			parts = append(parts, heading("Sources"), t)
		}
		if claims := objs(b, "claims"); len(claims) > 0 {
			return parts, c.board(path, typ, "claims", "rows", claims)
		}
		return parts, nil
	}
	c.warn(path, "unknown 0.6 block %q is dropped", typ)
	return nil, nil
}

func specParts(rows []SpecRow) []Part {
	if len(rows) == 0 {
		return nil
	}
	return []Part{{Type: "spec", Spec: rows}}
}

func proseParts(md string) []Part {
	if strings.TrimSpace(md) == "" {
		return nil
	}
	return []Part{{Type: "prose", Markdown: md}}
}

// specRows turns scalar fields into spec rows, in the given order.
func specRows(m map[string]any, fields [][2]string) []SpecRow {
	var rows []SpecRow
	for _, f := range fields {
		if v := text(m[f[0]]); v != "" {
			rows = append(rows, SpecRow{Label: f[1], Text: mdEscape(v)})
		}
	}
	return rows
}

// statusFields are the scalar chips and receipts an item may carry, in the
// order they read best. Code-like values are set in backticks.
var statusFields = []struct {
	key, label string
	code       bool
}{
	{"status", "Status", false}, {"category", "Category", false}, {"severity", "Severity", false}, {"kind", "Kind", false},
	{"trust", "Trust", false}, {"confidence", "Confidence", false}, {"owner", "Owner", false}, {"priority", "Priority", false},
	{"impact", "Impact", false}, {"effort", "Effort", false}, {"required", "Required", false}, {"operation", "Operation", false},
	{"review", "Review", false}, {"risk", "Risk", false}, {"source", "Source", true}, {"created", "Created", false},
	{"command", "Command", true}, {"expected", "Expected", false}, {"actual", "Actual", false}, {"license", "License", false},
}

var listFacets = []struct{ key, label string }{
	{"files", "Files"}, {"verification", "Verification"}, {"risks", "Risks"}, {"evidence", "Evidence"},
	{"artifacts", "Artifacts"}, {"links", "Links"}, {"badges", "Badges"}, {"workItems", "Work items"}, {"sources", "Sources"},
}

func (c *converter) board(path, family, field, layout string, raw []map[string]any) *Board {
	b := &Board{Layout: layout}
	for i, m := range raw {
		b.Items = append(b.Items, c.item(fmt.Sprintf("%s/%s/%d", path, field, i), family, m))
	}
	if len(b.Items) == 0 {
		b.Items = []Item{{ID: c.ids.claim(c, path, "", family+"-empty"), Title: "No entries"}}
	}
	return b
}

func (c *converter) item(path, family string, m map[string]any) Item {
	title := firstStr(m, "title", "decision", "claim", "subject", "label")
	if title == "" {
		title = "Untitled"
	}
	it := Item{ID: c.ids.claim(c, path+"/id", str(m, "id"), title, family)}
	var notes []string
	var clipped bool
	if it.Title, clipped = clamp(title, maxTitleRunes); clipped {
		c.warn(path+"/title", "is %d characters; shortened to %d, the full title opens the Notes facet", len([]rune(title)), maxTitleRunes)
		notes = append(notes, "**"+mdEscape(title)+"**")
	}
	summary := str(m, "summary")
	if summary == "" && family == "decision-log" {
		summary = str(m, "rationale")
	}
	if it.Summary, clipped = clamp(summary, maxSummaryRunes); clipped {
		c.warn(path+"/summary", "is %d characters; shortened to %d, the full summary opens the Notes facet", len([]rune(summary)), maxSummaryRunes)
		notes = append(notes, c.rich(path+"/summary", summary))
	}
	effortInStatus := false
	switch e := strings.ToLower(str(m, "effort")); e {
	case "s", "small":
		it.Effort = "S"
	case "m", "medium":
		it.Effort = "M"
	case "l", "large":
		it.Effort = "L"
	case "", "-":
	default:
		effortInStatus = true
	}
	if v := str(m, "verdict"); v != "" && v != "undecided" {
		c.warn(path+"/verdict", "verdict %q is 0.6 reader state and is dropped; 0.7 state is picks and notes", v)
	}
	var status []string
	for _, f := range statusFields {
		if f.key == "effort" && !effortInStatus {
			continue
		}
		v := text(m[f.key])
		if v == "" {
			continue
		}
		if f.code {
			v = mdCode(v)
		} else {
			v = mdEscape(v)
		}
		status = append(status, "**"+f.label+"** "+v)
	}
	if url := str(m, "url"); url != "" {
		status = append(status, "**Link** "+mdLink(url, url))
	}
	if len(status) > 0 {
		it.Facets = append(it.Facets, Facet{Label: "Status", Markdown: strings.Join(status, "\n\n")})
	}
	for _, key := range []string{"body", "notes", "response"} {
		if v := str(m, key); v != "" {
			notes = append(notes, c.rich(path+"/"+key, v))
		}
	}
	if family == "decision-log" && it.Summary != str(m, "rationale") {
		if r := str(m, "rationale"); r != "" {
			notes = append(notes, c.rich(path+"/rationale", r))
		}
	}
	for i, cm := range objs(m, "comments") {
		head := mdEscape(str(cm, "author"))
		if created := str(cm, "created"); created != "" {
			head += ", " + mdEscape(created)
		}
		body := c.rich(fmt.Sprintf("%s/comments/%d/body", path, i), str(cm, "body"))
		if head != "" {
			body = "**" + head + "** " + body
		}
		notes = append(notes, body)
	}
	for i, nb := range objs(m, "blocks") {
		notes = append(notes, c.nestedMarkdown(fmt.Sprintf("%s/blocks/%d", path, i), nb)...)
	}
	if len(notes) > 0 {
		it.Facets = append(it.Facets, Facet{Label: "Notes", Markdown: strings.Join(notes, "\n\n")})
	}
	if details := obj(m, "details"); len(details) > 0 {
		keys := make([]string, 0, len(details))
		for k := range details {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var lines []string
		for _, k := range keys {
			if v := text(details[k]); v != "" {
				lines = append(lines, "**"+mdEscape(k)+"** "+c.rich(path+"/details/"+k, v))
			}
		}
		if len(lines) > 0 {
			it.Facets = append(it.Facets, Facet{Label: "Details", Markdown: strings.Join(lines, "\n\n")})
		}
	}
	if r := str(m, "recommendation"); r != "" {
		it.Facets = append(it.Facets, Facet{Label: "Recommendation", Markdown: c.rich(path+"/recommendation", r)})
	}
	for _, f := range listFacets {
		var values []string
		switch v := m[f.key].(type) {
		case string:
			if v != "" {
				values = []string{v}
			}
		case []any:
			for _, x := range v {
				if s := text(x); s != "" {
					values = append(values, s)
				}
			}
		}
		if len(values) == 0 {
			continue
		}
		var lines []string
		for _, v := range values {
			if f.key == "files" || f.key == "artifacts" || f.key == "workItems" {
				lines = append(lines, "- "+mdCode(v))
			} else if f.key == "links" || strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
				lines = append(lines, "- "+mdLink(v, v))
			} else {
				lines = append(lines, "- "+mdEscape(v))
			}
		}
		it.Facets = append(it.Facets, Facet{Label: f.label, Markdown: strings.Join(lines, "\n")})
	}
	if d := str(m, "diff"); d != "" {
		it.Facets = append(it.Facets, Facet{Label: "Diff", Markdown: fence("diff", d)})
	}
	if deps := strs(m, "dependencies"); len(deps) > 0 {
		c.pending = append(c.pending, pendingDeps{itemID: it.ID, path: path + "/dependencies", deps: deps})
	}
	return it
}

// nestedMarkdown turns a block nested inside an item into markdown lines.
func (c *converter) nestedMarkdown(path string, b map[string]any) []string {
	typ := str(b, "type")
	switch typ {
	case "prose":
		return []string{c.rich(path+"/markdown", str(b, "markdown"))}
	case "code":
		return []string{fence(str(b, "lang"), str(b, "code"))}
	case "callout":
		body := c.rich(path+"/body", str(b, "body"))
		if t := str(b, "title"); t != "" {
			body = "**" + mdEscape(t) + "** " + body
		}
		return []string{"> " + strings.ReplaceAll(body, "\n", "\n> ")}
	case "table":
		cols := strs(b, "columns")
		if len(cols) == 0 {
			return nil
		}
		lines := []string{"| " + strings.Join(pipeCells(cols), " | ") + " |", "|" + strings.Repeat(" --- |", len(cols))}
		for _, row := range list(b, "rows") {
			var cells []string
			for _, cell := range toList(row) {
				cells = append(cells, text(cell))
			}
			for len(cells) < len(cols) {
				cells = append(cells, "")
			}
			lines = append(lines, "| "+strings.Join(pipeCells(cells[:len(cols)]), " | ")+" |")
		}
		return []string{strings.Join(lines, "\n")}
	}
	c.warn(path, "nested %q block inside an item is dropped", typ)
	return nil
}

func pipeCells(cells []string) []string {
	out := make([]string, len(cells))
	for i, c := range cells {
		out[i] = strings.ReplaceAll(strings.ReplaceAll(c, "\n", " "), "|", "\\|")
	}
	return out
}

// finish drops empty sections and resolves dependencies.
func (c *converter) finish(doc *Document) {
	items := map[string]*Item{}
	for si := range c.sections {
		if c.sections[si].Board != nil {
			for ii := range c.sections[si].Board.Items {
				items[c.sections[si].Board.Items[ii].ID] = &c.sections[si].Board.Items[ii]
			}
		}
	}
	for _, p := range c.pending {
		it := items[p.itemID]
		if it == nil {
			continue
		}
		for _, dep := range p.deps {
			id := dep
			if renamed, ok := c.ids.renamed[dep]; ok {
				id = renamed
			}
			if items[id] != nil && id != it.ID {
				it.DependsOn = append(it.DependsOn, id)
			} else {
				c.warn(p.path, "dependency %q does not name an item and is dropped", dep)
			}
		}
	}
	for _, s := range c.sections {
		if len(s.Parts) == 0 && s.Board == nil {
			c.warn("/blocks", "section %q has no content and is dropped", s.Title)
			continue
		}
		doc.Sections = append(doc.Sections, s)
	}
	if len(doc.Sections) == 0 {
		doc.Sections = []Section{{ID: "overview", Title: "Overview", Parts: []Part{{Type: "prose", Markdown: "This document had no content."}}}}
	}
}

// rich passes markdown through and warns once per reference syntax family
// that 0.7 renders as literal text.
func (c *converter) rich(path, s string) string {
	for _, name := range []string{"footnote [^id]", "citation [@id]", "glossary [[Term]]"} {
		if !c.refSeen[name] && refPatterns[name].MatchString(s) {
			c.refSeen[name] = true
			c.warn(path, "%s references render as literal text in 0.7", name)
		}
	}
	return s
}

// idRegistry keeps ids unique across sections and items and remembers
// rewrites so references can follow.
type idRegistry struct {
	used    map[string]bool
	renamed map[string]string
}

func (r *idRegistry) claim(c *converter, path, want string, fallbacks ...string) string {
	id := slug(want)
	for _, f := range fallbacks {
		if id != "" {
			break
		}
		id = slug(f)
	}
	if id == "" {
		id = "x"
	}
	if want != "" && id != want {
		c.warn(path, "id %q rewritten to %q", want, id)
	}
	if r.used[id] {
		base := id
		if len(base) > 61 {
			base = strings.TrimRight(base[:61], "-")
		}
		for n := 2; ; n++ {
			try := base + "-" + strconv.Itoa(n)
			if !r.used[try] {
				if want != "" {
					c.warn(path, "id %q duplicates an earlier id; renamed to %q", want, try)
				}
				id = try
				break
			}
		}
	}
	r.used[id] = true
	if want != "" {
		r.renamed[want] = id
	}
	return id
}

// Schema limits the rewrite must respect.
const (
	maxTitleRunes   = 200
	maxSummaryRunes = 400
)

// clamp shortens s to max runes with an ellipsis and reports whether it did.
func clamp(s string, max int) (string, bool) {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return string(r), false
	}
	return strings.TrimSpace(string(r[:max-1])) + "…", true
}

// slug lowercases, collapses runs of other characters to hyphens, and
// truncates to the id length.
func slug(s string) string {
	s = strings.Trim(slugStrip.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(s) > 64 {
		s = strings.TrimRight(s[:64], "-")
	}
	return s
}

var (
	mdLinkPattern = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	mdMarkPattern = regexp.MustCompile("[*_`]+")
)

// plainText reduces inline markdown to text for fields the masthead renders
// verbatim, such as the lede.
func plainText(md string) string {
	s := mdLinkPattern.ReplaceAllString(md, "$1")
	s = mdMarkPattern.ReplaceAllString(s, "")
	return strings.Join(strings.Fields(s), " ")
}

var mdEscaper = strings.NewReplacer(`\`, `\\`, "*", `\*`, "_", `\_`, "[", `\[`, "]", `\]`, "`", "\\`", "<", `\<`)

// mdEscape makes a plain 0.6 value safe inside markdown.
func mdEscape(s string) string {
	return mdEscaper.Replace(strings.TrimSpace(s))
}

// mdCode sets a value in backticks.
func mdCode(s string) string {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "`") {
		return "`` " + s + " ``"
	}
	return "`" + s + "`"
}

func mdLink(label, url string) string {
	if url == "" {
		return mdEscape(label)
	}
	if label == "" {
		label = url
	}
	return "[" + mdEscape(label) + "](" + strings.ReplaceAll(url, ")", "%29") + ")"
}

func codeList(values []string) string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = mdCode(v)
	}
	return strings.Join(out, ", ")
}

func fence(lang, code string) string {
	lang = strings.TrimSpace(lang)
	if !strings.HasSuffix(code, "\n") {
		code += "\n"
	}
	marker := "```"
	for strings.Contains(code, marker) {
		marker += "`"
	}
	return marker + lang + "\n" + code + marker
}

// Loose accessors over decoded JSON.

func str(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

func firstStr(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s := str(m, k); s != "" {
			return s
		}
	}
	return ""
}

func obj(m map[string]any, key string) map[string]any {
	if m == nil {
		return nil
	}
	o, _ := m[key].(map[string]any)
	return o
}

func list(m map[string]any, key string) []any {
	if m == nil {
		return nil
	}
	l, _ := m[key].([]any)
	return l
}

func toList(v any) []any {
	l, _ := v.([]any)
	return l
}

func objs(m map[string]any, key string) []map[string]any {
	var out []map[string]any
	for _, v := range list(m, key) {
		if o, ok := v.(map[string]any); ok {
			out = append(out, o)
		}
	}
	return out
}

func strs(m map[string]any, key string) []string {
	var out []string
	for _, v := range list(m, key) {
		if s := text(v); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func boolean(v any) bool {
	b, _ := v.(bool)
	return b
}

func num(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f
	}
	return 0
}

// text stringifies a JSON value for a cell or a chip.
func text(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "yes"
		}
		return "no"
	case []any:
		var parts []string
		for _, e := range x {
			if s := text(e); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	case map[string]any:
		if s := firstStr(x, "label", "title", "value", "name"); s != "" {
			return s
		}
		b, _ := json.Marshal(x)
		return string(b)
	}
	return fmt.Sprint(v)
}
