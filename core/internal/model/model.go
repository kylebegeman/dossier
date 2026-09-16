// Package model defines the Dossier document model: kind, meta, sections,
// items, facets, and decisions. Decoding is strict; unknown fields are errors.
package model

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// Version is the model version every document must declare.
const Version = "1.0"

// MaxDocumentBytes bounds a decoded document.
const MaxDocumentBytes = 4 << 20

// Document is one dossier: a kind, metadata, ordered sections, and the
// reader's decisions.
type Document struct {
	Dossier   string     `json:"dossier"`
	Kind      string     `json:"kind"`
	Meta      Meta       `json:"meta"`
	Sections  []Section  `json:"sections"`
	Decisions *Decisions `json:"decisions,omitempty"`
}

// Meta is the masthead and identity of a document.
type Meta struct {
	Title    string `json:"title"`
	Slug     string `json:"slug"`
	Kicker   string `json:"kicker,omitempty"`
	Emphasis string `json:"emphasis,omitempty"`
	Lede     string `json:"lede,omitempty"`
	Updated  string `json:"updated,omitempty"`
	Status   string `json:"status,omitempty"`
	Fonts    string `json:"fonts,omitempty"`
}

// Section is a titled unit in the contents. It holds content parts and may
// carry a board of items.
type Section struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Parts []Part `json:"parts,omitempty"`
	Board *Board `json:"board,omitempty"`
}

// Part is one content block inside a section. Type selects which fields apply.
type Part struct {
	Type     string     `json:"type"`
	Title    string     `json:"title,omitempty"`
	Tone     string     `json:"tone,omitempty"`
	Markdown string     `json:"markdown,omitempty"`
	Columns  []string   `json:"columns,omitempty"`
	Rows     [][]string `json:"rows,omitempty"`
	Spec     []SpecRow  `json:"spec,omitempty"`
	Note     string     `json:"note,omitempty"`
	Lang     string     `json:"lang,omitempty"`
	Code     string     `json:"code,omitempty"`
}

// SpecRow is one label and text pair in a spec part.
type SpecRow struct {
	Label string `json:"label"`
	Text  string `json:"text"`
}

// Board holds the items a reader decides about.
type Board struct {
	Summary bool   `json:"summary,omitempty"`
	Layout  string `json:"layout,omitempty"`
	Items   []Item `json:"items"`
}

// Item is one numbered thing in a board.
type Item struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary,omitempty"`
	Size      string   `json:"size,omitempty"`
	Effort    string   `json:"effort,omitempty"`
	Impact    int      `json:"impact,omitempty"`
	DependsOn []string `json:"dependsOn,omitempty"`
	Facets    []Facet  `json:"facets,omitempty"`
}

// Facet is a labeled markdown body on an item.
type Facet struct {
	Label    string `json:"label"`
	Markdown string `json:"markdown"`
}

// Decisions is the only state a document carries.
type Decisions struct {
	Path   string            `json:"path,omitempty"`
	Picked []string          `json:"picked,omitempty"`
	Notes  map[string]string `json:"notes,omitempty"`
}

// Problem is one validation finding with a JSON-pointer style path.
type Problem struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

func (p Problem) String() string { return p.Path + ": " + p.Message }

// PartTypes lists the content part types the renderer understands.
var PartTypes = []string{"prose", "spec", "table", "callout", "code"}

// BoardLayouts lists the board layouts the renderer understands.
var BoardLayouts = []string{"articles", "rows"}

var idPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// Decode reads a document strictly: bounded size, no unknown fields, no
// trailing data.
func Decode(r io.Reader) (*Document, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxDocumentBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxDocumentBytes {
		return nil, fmt.Errorf("document exceeds %d bytes", MaxDocumentBytes)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc Document
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("decode document: %w", err)
	}
	if dec.More() {
		return nil, errors.New("decode document: trailing data after the JSON object")
	}
	return &doc, nil
}

// Encode writes a document as indented JSON with a trailing newline.
func Encode(doc *Document) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(doc); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Check validates structure the schema cannot: identity, references, and
// per-type part fields. Kind rules live in package kinds.
func Check(doc *Document) []Problem {
	var out []Problem
	add := func(path, format string, args ...any) {
		out = append(out, Problem{Path: path, Message: fmt.Sprintf(format, args...)})
	}
	if doc.Dossier != Version {
		add("/dossier", "must be %q", Version)
	}
	if doc.Kind == "" {
		add("/kind", "is required")
	}
	if strings.TrimSpace(doc.Meta.Title) == "" {
		add("/meta/title", "is required")
	}
	if !idPattern.MatchString(doc.Meta.Slug) {
		add("/meta/slug", "must be lowercase letters, digits, and hyphens")
	}
	if doc.Meta.Fonts != "" && doc.Meta.Fonts != "google" {
		add("/meta/fonts", "must be omitted or %q", "google")
	}
	if len(doc.Sections) == 0 {
		add("/sections", "at least one section is required")
	}
	ids := map[string]string{}
	itemIDs := map[string]bool{}
	for si, s := range doc.Sections {
		sp := fmt.Sprintf("/sections/%d", si)
		if !idPattern.MatchString(s.ID) {
			add(sp+"/id", "must be lowercase letters, digits, and hyphens")
		} else if prev, dup := ids[s.ID]; dup {
			add(sp+"/id", "duplicates %s", prev)
		} else {
			ids[s.ID] = sp
		}
		if strings.TrimSpace(s.Title) == "" {
			add(sp+"/title", "is required")
		}
		if len(s.Parts) == 0 && s.Board == nil {
			add(sp, "needs parts or a board")
		}
		for pi, p := range s.Parts {
			checkPart(sp+fmt.Sprintf("/parts/%d", pi), p, add)
		}
		if s.Board == nil {
			continue
		}
		bp := sp + "/board"
		if s.Board.Layout != "" && !contains(BoardLayouts, s.Board.Layout) {
			add(bp+"/layout", "must be one of %s", strings.Join(BoardLayouts, ", "))
		}
		if len(s.Board.Items) == 0 {
			add(bp+"/items", "at least one item is required")
		}
		for ii, it := range s.Board.Items {
			ip := bp + fmt.Sprintf("/items/%d", ii)
			if !idPattern.MatchString(it.ID) {
				add(ip+"/id", "must be lowercase letters, digits, and hyphens")
			} else if prev, dup := ids[it.ID]; dup {
				add(ip+"/id", "duplicates %s", prev)
			} else {
				ids[it.ID] = ip
				itemIDs[it.ID] = true
			}
			if strings.TrimSpace(it.Title) == "" {
				add(ip+"/title", "is required")
			}
			for fi, f := range it.Facets {
				if strings.TrimSpace(f.Label) == "" {
					add(ip+fmt.Sprintf("/facets/%d/label", fi), "is required")
				}
				if strings.TrimSpace(f.Markdown) == "" {
					add(ip+fmt.Sprintf("/facets/%d/markdown", fi), "is required")
				}
			}
		}
	}
	for si, s := range doc.Sections {
		if s.Board == nil {
			continue
		}
		for ii, it := range s.Board.Items {
			for di, dep := range it.DependsOn {
				if !itemIDs[dep] {
					add(fmt.Sprintf("/sections/%d/board/items/%d/dependsOn/%d", si, ii, di), "refers to unknown item %q", dep)
				}
				if dep == it.ID {
					add(fmt.Sprintf("/sections/%d/board/items/%d/dependsOn/%d", si, ii, di), "refers to itself")
				}
			}
		}
	}
	if doc.Decisions != nil {
		for pi, id := range doc.Decisions.Picked {
			if !itemIDs[id] {
				add(fmt.Sprintf("/decisions/picked/%d", pi), "refers to unknown item %q", id)
			}
		}
		for id := range doc.Decisions.Notes {
			if !itemIDs[id] {
				add("/decisions/notes/"+id, "refers to unknown item")
			}
		}
	}
	return out
}

func checkPart(path string, p Part, add func(string, string, ...any)) {
	if !contains(PartTypes, p.Type) {
		add(path+"/type", "must be one of %s", strings.Join(PartTypes, ", "))
		return
	}
	switch p.Type {
	case "prose":
		if strings.TrimSpace(p.Markdown) == "" {
			add(path+"/markdown", "is required for prose")
		}
	case "callout":
		if strings.TrimSpace(p.Markdown) == "" {
			add(path+"/markdown", "is required for callout")
		}
		if p.Tone != "" && p.Tone != "note" && p.Tone != "risk" {
			add(path+"/tone", "must be note or risk")
		}
	case "spec":
		if len(p.Spec) == 0 {
			add(path+"/spec", "at least one row is required")
		}
		for i, r := range p.Spec {
			if strings.TrimSpace(r.Label) == "" || strings.TrimSpace(r.Text) == "" {
				add(fmt.Sprintf("%s/spec/%d", path, i), "label and text are required")
			}
		}
	case "table":
		if len(p.Columns) == 0 {
			add(path+"/columns", "at least one column is required")
		}
		for i, row := range p.Rows {
			if len(row) != len(p.Columns) {
				add(fmt.Sprintf("%s/rows/%d", path, i), "has %d cells, expected %d", len(row), len(p.Columns))
			}
		}
	case "code":
		if p.Code == "" {
			add(path+"/code", "is required for code")
		}
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
