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
	HasPick          bool
	PickHTML         string
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
	Columns []string
	Legend  string
	Items   []ItemView
}

// ItemView is one item with rendered facets.
type ItemView struct {
	ID        string
	Number    int
	Title     string
	Summary   string
	Size      string
	Effort    string
	Impact    int
	ImpactMax int
	DependsOn []DepView
	Facets    []FacetView
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
}

// Fact is one cell of the masthead facts tile.
type Fact struct {
	Value string
	Label string
	Live  bool
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

	// Number items across every article board, in document order.
	numbers := map[string]int{}
	titles := map[string]string{}
	n := 0
	for _, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for _, it := range s.Board.Items {
			n++
			numbers[it.ID] = n
			titles[it.ID] = it.Title
		}
	}
	impactMax := 5
	if kind.Items.Impact != nil {
		impactMax = kind.Items.Impact.Max
	}
	pickedIDs := map[string]bool{}
	notes := map[string]string{}
	if doc.Decisions != nil {
		for _, id := range doc.Decisions.Picked {
			pickedIDs[id] = true
		}
		notes = doc.Decisions.Notes
	}
	var rowsCount int
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
			bv := &BoardView{Summary: s.Board.Summary, Rows: s.Board.Layout == "rows", Columns: kind.SummaryTable.Columns, Legend: kind.SummaryTable.Legend}
			for _, it := range s.Board.Items {
				iv := ItemView{ID: it.ID, Number: numbers[it.ID], Title: it.Title, Summary: it.Summary, Size: it.Size, Effort: it.Effort, Impact: it.Impact, ImpactMax: impactMax, Picked: pickedIDs[it.ID], Note: notes[it.ID]}
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
				if bv.Rows {
					rowsCount++
				} else {
					page.Numbered = append(page.Numbered, iv)
				}
			}
			sv.Board = bv
		}
		page.Sections = append(page.Sections, sv)
	}
	page.Contents = contents(doc, kind, numbers, pickedIDs)
	page.HasPick = len(page.Numbered) > 0 && kind.Pick.Title != ""
	if page.HasPick {
		h, err := markdown(kind.Pick.Markdown)
		if err != nil {
			return nil, err
		}
		page.PickHTML = h
	}
	page.Facts = facts(page, kind, rowsCount)
	return page, nil
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

func contents(doc *model.Document, kind kinds.Kind, numbers map[string]int, pickedIDs map[string]bool) []TocGroup {
	var groups []TocGroup
	current := &TocGroup{Label: "Frame"}
	seenBoard := false
	for _, s := range doc.Sections {
		current.Entries = append(current.Entries, TocEntry{ID: s.ID, Label: s.Title})
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		groups = append(groups, *current)
		seenBoard = true
		if kind.Contents.GroupBy == "size" && len(kind.Items.Size) > 0 {
			for _, size := range kind.Items.Size {
				g := TocGroup{Label: capitalize(size)}
				for _, it := range s.Board.Items {
					if strings.EqualFold(it.Size, size) {
						g.Entries = append(g.Entries, TocEntry{ID: it.ID, Label: it.Title, Number: numbers[it.ID], Item: true, Picked: pickedIDs[it.ID]})
					}
				}
				if len(g.Entries) > 0 {
					groups = append(groups, g)
				}
			}
		} else {
			g := TocGroup{Label: s.Title}
			for _, it := range s.Board.Items {
				g.Entries = append(g.Entries, TocEntry{ID: it.ID, Label: it.Title, Number: numbers[it.ID], Item: true, Picked: pickedIDs[it.ID]})
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

func facts(page *Page, kind kinds.Kind, rowsCount int) []Fact {
	var out []Fact
	if len(kind.Items.Size) > 0 {
		for _, size := range kind.Items.Size {
			c := 0
			for _, it := range page.Numbered {
				if strings.EqualFold(it.Size, size) {
					c++
				}
			}
			if c > 0 {
				out = append(out, Fact{Value: fmt.Sprint(c), Label: size})
			}
		}
	} else if len(page.Numbered) > 0 {
		out = append(out, Fact{Value: fmt.Sprint(len(page.Numbered)), Label: "items"})
	}
	if rowsCount > 0 {
		label := "entries"
		if page.HasPick {
			label = "also considered"
		}
		out = append(out, Fact{Value: fmt.Sprint(rowsCount), Label: label})
	}
	if page.HasPick {
		c := 0
		for _, it := range page.Numbered {
			if it.Picked {
				c++
			}
		}
		out = append(out, Fact{Value: fmt.Sprint(c), Label: "picked", Live: true})
	}
	return out
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
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
