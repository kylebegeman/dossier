// Package render turns a validated document and its kind into one
// self-contained HTML artifact.
package render

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"

	"dossier/internal/decisions"
	"dossier/internal/kinds"
	"dossier/internal/model"
)

//go:embed assets/tokens.css
var tokensCSS string

//go:embed assets/reader.js
var readerJS string

// Budgets are enforced by tests so the artifact stays lean.
const (
	MaxReaderBytes = 20 << 10
	MaxStyleBytes  = 30 << 10
)

// AssetSizes reports the embedded asset sizes for budget tests.
func AssetSizes() (css, js int) { return len(tokensCSS), len(readerJS) }

var md = goldmark.New(
	goldmark.WithExtensions(extension.Table, extension.Strikethrough, extension.Typographer),
	goldmark.WithRendererOptions(renderer.WithNodeRenderers(util.Prioritized(codeRenderer{}, 100))),
)

// Options tune one render without changing the document.
type Options struct {
	// Figures maps a figure src to the data URI to emit instead. Build it with
	// InlineFigures so relative image paths ship inside the artifact while the
	// model island keeps the original path.
	Figures map[string]string
	// Studio is set only by the serve studio. Artifacts never carry it.
	Studio *Studio
}

// Studio marks editable fields with data-edit targets and injects the
// studio's HTML before the reader runtime, so the studio runs first.
type Studio struct {
	Inject string
}

// Stylesheet returns the embedded design tokens and component styles, for
// pages the serve studio renders itself.
func Stylesheet() string { return tokensCSS }

// Page is the view model handed to the templ components.
type Page struct {
	Doc       *model.Document
	Kind      kinds.Kind
	TitleHTML string
	Sections  []SectionView
	Contents  []TocGroup
	Facts     []Fact
	Numbered  []ItemView
	ModelJSON string
	CSS       string
	JS        string
	// Inline element strings: templ cannot evaluate expressions inside
	// style and script elements, so they are assembled here.
	StyleHTML        string
	ModelScriptHTML  string
	ReaderScriptHTML string
	Fonts            bool
	// Decides is set when the kind decides and the document has numbered
	// items; Mode is the kind's decision mode.
	Decides      bool
	Mode         string
	HasArticles  bool
	PickHTML     string
	ReplyExample string
	// Reply is the reply line for the model's own decisions, which the
	// reader keeps current. VerdictsJSON tells the reader the kind's verdicts.
	Reply        string
	VerdictsJSON string
	Choice       *ChoiceView
	// Studio only: the injected studio and the edit targets of the masthead.
	StudioHTML string
	EditTitle  string
	EditKicker string
	EditLede   string
}

// SectionView is one section with its parts rendered.
type SectionView struct {
	ID        string
	Title     string
	Parts     []PartView
	Board     *BoardView
	EditTitle string
}

// PartView is one rendered content part.
type PartView struct {
	Type    string
	Title   string
	Tone    string
	Note    string
	Lang    string
	Code    string
	HTML    string
	Columns []string
	Rows    [][]string
	Spec    []model.SpecRow
	Src     string
	Alt     string
	Caption string
	Format  string
	SVG     string
	Edit    string
}

// BoardView is a board with numbered or row items.
type BoardView struct {
	Summary bool
	Rows    bool
	Columns []Column
	Legend  string
	Items   []ItemView
}

// ChoiceView is the document's question with its options.
type ChoiceView struct {
	Question string
	Options  []OptionView
	Chosen   bool
}

// OptionView is one answer to the choice.
type OptionView struct {
	ID      string
	Label   string
	Summary string
	Checked bool
}

// VerdictView is one verdict button in an item head.
type VerdictView struct {
	ID      string
	Label   string
	Tone    string
	Checked bool
	// Focus marks the one button in the group that takes the tab stop.
	Focus bool
}

// Column is one summary table column.
type Column struct {
	Name   string
	Header string
}

// Chip is one labeled value in an item's meta row. Tone is a palette tone or
// outline for plain facts such as effort.
type Chip struct {
	Text  string
	Tone  string
	Label string
}

// Cell is one summary table cell for a field.
type Cell struct {
	Text string
	Tone string
	Chip bool
}

// ItemView is one item with rendered facets.
type ItemView struct {
	ID       string
	Number   int
	Numbered bool
	Pickable bool
	Notes    bool
	// Decides marks an item the reader can decide on: every numbered item
	// of a pick kind, and the items a verdict kind lets take a verdict.
	Decides     bool
	Verdicts    []VerdictView
	Verdict     string
	Tone        string
	Title       string
	Summary     string
	Chips       []Chip
	Cells       map[string]Cell
	Impact      int
	ImpactMax   int
	ImpactLabel string
	DependsOn   []DepView
	Facets      []FacetView
	Picked      bool
	Note        string
	EditTitle   string
	EditSummary string
}

// DepView links a dependency by number.
type DepView struct {
	ID     string
	Number int
	Title  string
}

// FacetView is one rendered facet.
type FacetView struct {
	Label string
	HTML  string
	Risk  bool
	Edit  string
}

// TocGroup is one labeled group in the contents column.
type TocGroup struct {
	Label   string
	Entries []TocEntry
}

// TocEntry is one link in the contents column.
type TocEntry struct {
	ID     string
	Label  string
	Number int
	Item   bool
	Picked bool
	// Tone and Decided mark a verdict: the pip's color and its words for
	// screen readers.
	Tone    string
	Decided string
}

// Fact is one cell of the masthead facts strip. Live names what the reader
// keeps current: count for decisions made, choice for the option chosen.
type Fact struct {
	Value string
	Label string
	Tone  string
	Live  string
}

// Render produces the complete HTML document.
func Render(doc *model.Document, kind kinds.Kind) ([]byte, error) {
	return RenderWith(doc, kind, Options{})
}

// RenderWith produces the complete HTML document with render options.
func RenderWith(doc *model.Document, kind kinds.Kind, opts Options) ([]byte, error) {
	page, err := build(doc, kind, opts)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := document(page).Render(context.Background(), &buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func build(doc *model.Document, kind kinds.Kind, opts Options) (*Page, error) {
	modelJSON, err := embedJSON(doc)
	if err != nil {
		return nil, err
	}
	page := &Page{Doc: doc, Kind: kind, ModelJSON: modelJSON, CSS: tokensCSS, JS: readerJS, Fonts: doc.Meta.Fonts == "google"}
	if strings.Contains(tokensCSS, "</style") || strings.Contains(readerJS, "</script") {
		return nil, fmt.Errorf("embedded assets must not contain a closing style or script tag")
	}
	page.StyleHTML = "<style>\n" + tokensCSS + "</style>"
	page.ModelScriptHTML = "<script type=\"application/json\" id=\"dossier-model\">" + modelJSON + "</script>"
	page.ReaderScriptHTML = "<script>\n" + readerJS + "</script>"
	page.TitleHTML = titleHTML(doc.Meta.Title, doc.Meta.Emphasis)
	studio := opts.Studio != nil
	if studio {
		page.StudioHTML = opts.Studio.Inject
		page.EditTitle, page.EditKicker, page.EditLede = "/meta/title", "/meta/kicker", "/meta/lede"
	}

	// Number items across every article board, in document order, when the
	// kind numbers its items.
	numbers := map[string]int{}
	titles := map[string]string{}
	n := 0
	for _, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for _, it := range s.Board.Items {
			titles[it.ID] = it.Title
			if kind.Item.Numbered {
				n++
				numbers[it.ID] = n
			}
		}
	}
	impactMax := 5
	if kind.Fields.Impact != nil {
		impactMax = kind.Fields.Impact.Max
	}
	rules := kind.Rules(doc)
	page.Mode = rules.Mode
	pickedIDs := map[string]bool{}
	notes := map[string]string{}
	verdicts := map[string]string{}
	if doc.Decisions != nil {
		for _, id := range doc.Decisions.Picked {
			pickedIDs[id] = true
		}
		notes = doc.Decisions.Notes
		verdicts = doc.Decisions.Verdicts
	}
	var rows []rowCount
	for _, s := range doc.Sections {
		sv := SectionView{ID: s.ID, Title: s.Title}
		if studio {
			sv.EditTitle = "/sections/" + s.ID + "/title"
		}
		for pi, p := range s.Parts {
			pv, err := renderPart(p, opts)
			if err != nil {
				return nil, fmt.Errorf("section %s: %w", s.ID, err)
			}
			if studio && (p.Type == "prose" || p.Type == "callout") {
				pv.Edit = fmt.Sprintf("/sections/%s/parts/%d/markdown", s.ID, pi)
			}
			sv.Parts = append(sv.Parts, pv)
		}
		if s.Board != nil {
			bv := &BoardView{Summary: s.Board.Summary, Rows: s.Board.Layout == "rows", Columns: columns(kind), Legend: kind.Legend}
			for _, it := range s.Board.Items {
				article := !bv.Rows
				iv := ItemView{ID: it.ID, Number: numbers[it.ID], Numbered: article && kind.Item.Numbered, Title: it.Title, Summary: it.Summary, Impact: it.Impact, ImpactMax: impactMax, ImpactLabel: strings.ToLower(kind.FieldLabel("impact")), Picked: pickedIDs[it.ID], Note: notes[it.ID]}
				iv.Pickable = article && kind.Item.Numbered && rules.Mode == decisions.ModePick
				iv.Notes = article && kind.Decides()
				iv.Decides = iv.Notes && (iv.Pickable || rules.CanDecide(it.ID))
				if iv.Decides && rules.Mode == decisions.ModeVerdict {
					iv.Verdict = verdicts[it.ID]
					for i, v := range rules.Verdicts {
						checked := v.ID == iv.Verdict
						if checked {
							iv.Tone = v.Tone
						}
						iv.Verdicts = append(iv.Verdicts, VerdictView{ID: v.ID, Label: v.Label, Tone: v.Tone, Checked: checked, Focus: checked || (iv.Verdict == "" && i == 0)})
					}
				}
				iv.Chips, iv.Cells = fields(kind, it)
				if studio {
					iv.EditTitle, iv.EditSummary = "/items/"+it.ID+"/title", "/items/"+it.ID+"/summary"
				}
				for _, dep := range it.DependsOn {
					iv.DependsOn = append(iv.DependsOn, DepView{ID: dep, Number: numbers[dep], Title: titles[dep]})
				}
				for fi, f := range it.Facets {
					h, err := markdown(f.Markdown)
					if err != nil {
						return nil, fmt.Errorf("item %s facet %q: %w", it.ID, f.Label, err)
					}
					fv := FacetView{Label: f.Label, HTML: h, Risk: kind.IsRisk(f.Label)}
					if studio {
						fv.Edit = fmt.Sprintf("/items/%s/facets/%d/markdown", it.ID, fi)
					}
					iv.Facets = append(iv.Facets, fv)
				}
				bv.Items = append(bv.Items, iv)
				switch {
				case bv.Rows:
					rows = append(rows, rowCount{title: s.Title})
				case iv.Numbered:
					page.Numbered = append(page.Numbered, iv)
					page.HasArticles = true
				default:
					page.HasArticles = true
				}
			}
			sv.Board = bv
		}
		page.Sections = append(page.Sections, sv)
	}
	page.Decides = kind.Decides() && len(page.Numbered) > 0
	marks := map[string]TocEntry{}
	for _, it := range page.Numbered {
		switch {
		case it.Picked:
			marks[it.ID] = TocEntry{Picked: true, Decided: ", picked"}
		case it.Tone != "":
			marks[it.ID] = TocEntry{Tone: it.Tone, Decided: ", " + rules.VerdictLabel(it.Verdict)}
		}
	}
	page.Contents = contents(doc, kind, numbers, marks)
	if page.Decides {
		h, err := markdown(kind.Decision.Markdown)
		if err != nil {
			return nil, err
		}
		page.PickHTML = h
		page.ReplyExample = exampleReply(kind, rules)
		verdictsJSON, err := json.Marshal(rules.Verdicts)
		if err != nil {
			return nil, err
		}
		page.VerdictsJSON = string(verdictsJSON)
		d := decisions.FromModel(doc, rules)
		page.Reply = "Nothing decided yet."
		if d.Path != "" || len(d.Picked) > 0 || len(d.Verdicts) > 0 || len(d.Notes) > 0 {
			page.Reply = d.Reply
		}
		if c := rules.Choice; c != nil {
			cv := &ChoiceView{Question: c.Question}
			for _, o := range c.Options {
				checked := doc.Decisions != nil && doc.Decisions.Path == o.ID
				cv.Chosen = cv.Chosen || checked
				cv.Options = append(cv.Options, OptionView{ID: o.ID, Label: o.Label, Summary: o.Summary, Checked: checked})
			}
			page.Choice = cv
		}
	}
	page.Facts = facts(doc, page, kind, rows)
	return page, nil
}

// exampleReply is the kind's example reply, fitted to the document's choice:
// a kind's answer to its own question becomes the document's first option,
// and a document that asks a question the kind does not gets its first option
// in front.
func exampleReply(kind kinds.Kind, rules decisions.Rules) string {
	example := kind.Decision.Example
	if rules.Choice == nil || example == "" {
		return example
	}
	first := rules.Choice.Options[0].ID
	n := 0
	for n < len(example) && (example[n]|0x20) >= 'a' && (example[n]|0x20) <= 'z' {
		n++
	}
	word := strings.ToLower(example[:n])
	if _, ok := rules.Option(word); ok {
		return example
	}
	if c := kind.Decision.Choice; c != nil && word != "" {
		for _, o := range c.Options {
			if o.ID == word {
				return first + example[n:]
			}
		}
	}
	return first + ", " + example
}

// rowCount remembers each rows entry's section, so the facts strip can name
// what it counts.
type rowCount struct{ title string }

// columns resolves the kind's summary columns to headers. The decision
// column is a pick checkbox or a verdict menu, and only exists for kinds that
// decide.
func columns(kind kinds.Kind) []Column {
	var out []Column
	for _, name := range kind.Columns {
		switch name {
		case "number":
			out = append(out, Column{Name: name, Header: "#"})
		case "title":
			out = append(out, Column{Name: name, Header: kinds.Capitalize(kind.Item.Noun)})
		case "decision":
			switch {
			case !kind.Decides():
			case kind.Decision.Mode == kinds.ModePick:
				out = append(out, Column{Name: name, Header: "Pick"})
			default:
				out = append(out, Column{Name: name, Header: "Verdict"})
			}
		default:
			out = append(out, Column{Name: name, Header: kind.FieldLabel(name)})
		}
	}
	return out
}

// fields renders an item's fields as meta-row chips, in the kind's field
// order, and as summary cells.
func fields(kind kinds.Kind, it model.Item) ([]Chip, map[string]Cell) {
	var chips []Chip
	cells := map[string]Cell{}
	for _, name := range []string{"size", "category", "severity", "status"} {
		v := kinds.Value(it, name)
		f := kind.Field(name)
		if v == "" || f == nil {
			continue
		}
		label := kind.FieldLabel(name)
		text := kind.Canonical(name, v)
		if f.Text {
			chips = append(chips, Chip{Text: text, Tone: "outline", Label: label})
			cells[name] = Cell{Text: text}
			continue
		}
		if f.Label != "" {
			text = f.Label + " " + text
		}
		tone := kind.Tone(name, v)
		chips = append(chips, Chip{Text: text, Tone: tone, Label: label})
		cells[name] = Cell{Text: kind.Canonical(name, v), Tone: tone, Chip: true}
	}
	if it.Effort != "" && kind.HasField("effort") {
		chips = append(chips, Chip{Text: "Effort " + kind.Canonical("effort", it.Effort), Tone: "outline", Label: kind.FieldLabel("effort")})
		cells["effort"] = Cell{Text: kind.Canonical("effort", it.Effort)}
	}
	if it.Owner != "" && kind.HasField("owner") {
		chips = append(chips, Chip{Text: it.Owner, Tone: "owner", Label: kind.FieldLabel("owner")})
		cells["owner"] = Cell{Text: it.Owner}
	}
	if it.Required && kind.HasField("required") {
		chips = append(chips, Chip{Text: kind.FieldLabel("required"), Tone: "outline", Label: kind.FieldLabel("required")})
		cells["required"] = Cell{Text: "Yes"}
	}
	return chips, cells
}

func renderPart(p model.Part, opts Options) (PartView, error) {
	pv := PartView{Type: p.Type, Title: p.Title, Tone: p.Tone, Note: p.Note, Lang: p.Lang, Code: p.Code, Columns: p.Columns, Spec: p.Spec, Src: p.Src, Alt: p.Alt, Format: p.Format}
	switch p.Type {
	case "prose", "callout":
		h, err := markdown(p.Markdown)
		if err != nil {
			return pv, err
		}
		pv.HTML = h
	case "code":
		pv.HTML = codeInner(p.Lang, p.Code)
	case "figure":
		if inlined, ok := opts.Figures[p.Src]; ok {
			pv.Src = inlined
		}
		if p.Caption != "" {
			h, err := inline(p.Caption)
			if err != nil {
				return pv, err
			}
			pv.Caption = h
		}
	case "diagram":
		if pv.Format == "" {
			pv.Format = "dot"
		}
		pv.Code = p.Source
	case "chart":
		pv.SVG = chartSVG(p.Title, p.Variant, p.Data)
	case "table":
		for _, row := range p.Rows {
			var cells []string
			for _, c := range row {
				h, err := inline(c)
				if err != nil {
					return pv, err
				}
				cells = append(cells, h)
			}
			pv.Rows = append(pv.Rows, cells)
		}
	case "spec":
		var rows []model.SpecRow
		for _, r := range p.Spec {
			h, err := inline(r.Text)
			if err != nil {
				return pv, err
			}
			rows = append(rows, model.SpecRow{Label: r.Label, Text: h})
		}
		pv.Spec = rows
	}
	return pv, nil
}

// imageTypes maps the file extensions InlineFigures inlines to their MIME types.
var imageTypes = map[string]string{
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
	".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif",
}

// InlineFigures reads every figure whose src is a relative path, resolved
// against dir, and returns the data URIs to render in their place. A file that
// cannot be read or has an unknown image type is reported as a warning and its
// path is left as written.
func InlineFigures(doc *model.Document, dir string) (map[string]string, []model.Problem) {
	figures := map[string]string{}
	var warnings []model.Problem
	for si, s := range doc.Sections {
		for pi, p := range s.Parts {
			if p.Type != "figure" || strings.Contains(p.Src, ":") {
				continue
			}
			if _, done := figures[p.Src]; done {
				continue
			}
			path := fmt.Sprintf("/sections/%d/parts/%d/src", si, pi)
			mime, ok := imageTypes[strings.ToLower(filepath.Ext(p.Src))]
			if !ok {
				warnings = append(warnings, model.Problem{Path: path, Message: fmt.Sprintf("%q is not an image type the artifact can inline; the path is kept as written", p.Src)})
				continue
			}
			data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(p.Src)))
			if err != nil {
				warnings = append(warnings, model.Problem{Path: path, Message: fmt.Sprintf("cannot read %q; the path is kept as written", p.Src)})
				continue
			}
			figures[p.Src] = "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
		}
	}
	return figures, warnings
}

// markdown renders block markdown to HTML. Raw HTML in the source is escaped.
func markdown(src string) (string, error) {
	var buf bytes.Buffer
	if err := md.Convert([]byte(src), &buf); err != nil {
		return "", err
	}
	return strings.TrimSpace(buf.String()), nil
}

// inline renders one paragraph of markdown without the wrapping element.
func inline(src string) (string, error) {
	h, err := markdown(src)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(h, "<p>") && strings.HasSuffix(h, "</p>") && strings.Count(h, "<p>") == 1 {
		h = strings.TrimSuffix(strings.TrimPrefix(h, "<p>"), "</p>")
	}
	return h, nil
}

// titleHTML wraps the emphasis word of the title in the italic accent.
func titleHTML(title, emphasis string) string {
	escaped := escape(title)
	if emphasis == "" {
		return escaped
	}
	word := escape(emphasis)
	i := strings.Index(escaped, word)
	if i < 0 {
		return escaped
	}
	return escaped[:i] + "<em>" + word + "</em>" + escaped[i+len(word):]
}

func escape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func contents(doc *model.Document, kind kinds.Kind, numbers map[string]int, marks map[string]TocEntry) []TocGroup {
	var groups []TocGroup
	current := &TocGroup{Label: "Frame"}
	seenBoard := false
	entry := func(it model.Item) TocEntry {
		m := marks[it.ID]
		return TocEntry{ID: it.ID, Label: it.Title, Number: numbers[it.ID], Item: true, Picked: m.Picked, Tone: m.Tone, Decided: m.Decided}
	}
	for _, s := range doc.Sections {
		current.Entries = append(current.Entries, TocEntry{ID: s.ID, Label: s.Title})
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		groups = append(groups, *current)
		seenBoard = true
		if f := kind.Field(kind.Group); f != nil && len(f.Values) > 0 {
			placed := map[string]bool{}
			for _, value := range f.Values {
				g := TocGroup{Label: kinds.Capitalize(value)}
				for _, it := range s.Board.Items {
					if strings.EqualFold(kinds.Value(it, kind.Group), value) {
						g.Entries = append(g.Entries, entry(it))
						placed[it.ID] = true
					}
				}
				if len(g.Entries) > 0 {
					groups = append(groups, g)
				}
			}
			other := TocGroup{Label: "Other"}
			for _, it := range s.Board.Items {
				if !placed[it.ID] {
					other.Entries = append(other.Entries, entry(it))
				}
			}
			if len(other.Entries) > 0 {
				groups = append(groups, other)
			}
		} else {
			g := TocGroup{Label: s.Title}
			for _, it := range s.Board.Items {
				g.Entries = append(g.Entries, entry(it))
			}
			groups = append(groups, g)
		}
		current = &TocGroup{Label: "Rest"}
	}
	if len(current.Entries) > 0 || !seenBoard {
		groups = append(groups, *current)
	}
	return groups
}

// facts builds the masthead strip: the document's own facts, counts by the
// kind's group field or a total, the rows entries by section, and the live
// decision count.
func facts(doc *model.Document, page *Page, kind kinds.Kind, rows []rowCount) []Fact {
	var out []Fact
	for _, f := range doc.Meta.Facts {
		out = append(out, Fact{Value: f.Value, Label: f.Label, Tone: f.Tone})
	}
	var articles []model.Item
	for _, s := range doc.Sections {
		if s.Board != nil && s.Board.Layout != "rows" {
			articles = append(articles, s.Board.Items...)
		}
	}
	if f := kind.Field(kind.Group); f != nil && len(f.Values) > 0 {
		for _, value := range f.Values {
			c := 0
			for _, it := range articles {
				if strings.EqualFold(kinds.Value(it, kind.Group), value) {
					c++
				}
			}
			if c > 0 {
				tone := ""
				if kind.Tone(kind.Group, value) == "risk" {
					tone = "risk"
				}
				out = append(out, Fact{Value: fmt.Sprint(c), Label: value, Tone: tone})
			}
		}
	} else if len(articles) > 0 {
		label := kind.Item.Plural
		if len(articles) == 1 {
			label = kind.Item.Noun
		}
		out = append(out, Fact{Value: fmt.Sprint(len(articles)), Label: label})
	}
	counted := map[string]int{}
	var order []string
	for _, r := range rows {
		if counted[r.title] == 0 {
			order = append(order, r.title)
		}
		counted[r.title]++
	}
	for _, title := range order {
		out = append(out, Fact{Value: fmt.Sprint(counted[title]), Label: strings.ToLower(title)})
	}
	if !page.Decides {
		return out
	}
	if c := page.Choice; c != nil {
		chosen := Fact{Value: "Open", Label: "choice", Live: "choice"}
		for _, o := range c.Options {
			if o.Checked {
				chosen.Value = o.Label
			}
		}
		out = append(out, chosen)
	}
	c := 0
	for _, it := range page.Numbered {
		if it.Picked || it.Verdict != "" {
			c++
		}
	}
	label := "picked"
	if page.Mode == decisions.ModeVerdict {
		label = "decided"
	}
	return append(out, Fact{Value: fmt.Sprint(c), Label: label, Live: "count"})
}

// embedJSON encodes the model for the data island. HTML-significant
// characters are escaped so the script element cannot be closed early.
func embedJSON(doc *model.Document) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(doc); err != nil {
		return "", err
	}
	return strings.TrimSpace(buf.String()), nil
}
