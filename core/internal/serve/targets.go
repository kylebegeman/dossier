package serve

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"dossier/internal/kinds"
	"dossier/internal/model"
	"dossier/internal/store"
)

// A target names one editable place in a document by stable ids, never by
// section or item position, so a draft survives edits elsewhere in the file:
//
//	/meta/title, /meta/kicker, /meta/lede
//	/meta/theme/accent                       the brand color
//	/sections/{section}/title
//	/sections/{section}/parts/{i}/markdown   prose and callout parts
//	/items/{item}/title, /items/{item}/summary
//	/items/{item}/facets/{slug}/markdown     a facet, by its label's slug
//	/items/{item}/facets                     the item's facet labels, in order
//	/boards/{section}/order                  the board's item ids, in order
//
// Values and bases are JSON text: a string for text fields, and an array for
// an order or a facet list. Orders and facet lists are structural: other
// drafts are read against a document they have already been applied to.

var errUnknownTarget = errors.New("unknown edit target")

type field struct {
	text      *string
	multiline bool
	board     *model.Board
	// facets is set for a facet list; kind supplies a new facet's hint.
	facets *model.Item
	kind   kinds.Kind
	// accent is set for the brand color, which lives in an optional theme.
	accent *model.Meta
}

// structural reports whether a target changes a document's shape rather
// than a text: an item order or a facet list.
func structural(target string) bool {
	p := strings.Split(strings.TrimPrefix(target, "/"), "/")
	return (len(p) == 3 && p[0] == "boards" && p[2] == "order") || (len(p) == 3 && p[0] == "items" && p[2] == "facets")
}

func resolve(doc *model.Document, kind kinds.Kind, target string) (field, error) {
	p := strings.Split(strings.TrimPrefix(target, "/"), "/")
	index := func(s string, n int) (int, bool) {
		i, err := strconv.Atoi(s)
		return i, err == nil && i >= 0 && i < n && strconv.Itoa(i) == s
	}
	switch {
	case len(p) == 2 && p[0] == "meta":
		switch p[1] {
		case "title":
			return field{text: &doc.Meta.Title}, nil
		case "kicker":
			return field{text: &doc.Meta.Kicker}, nil
		case "lede":
			return field{text: &doc.Meta.Lede}, nil
		}
	case len(p) == 3 && p[0] == "meta" && p[1] == "theme" && p[2] == "accent":
		return field{accent: &doc.Meta}, nil
	case len(p) == 3 && p[0] == "sections" && p[2] == "title":
		if s := findSection(doc, p[1]); s != nil {
			return field{text: &s.Title}, nil
		}
	case len(p) == 5 && p[0] == "sections" && p[2] == "parts" && p[4] == "markdown":
		if s := findSection(doc, p[1]); s != nil {
			if i, ok := index(p[3], len(s.Parts)); ok && (s.Parts[i].Type == "prose" || s.Parts[i].Type == "callout") {
				return field{text: &s.Parts[i].Markdown, multiline: true}, nil
			}
		}
	case len(p) == 3 && p[0] == "items" && (p[2] == "title" || p[2] == "summary"):
		if it := findItem(doc, p[1]); it != nil {
			if p[2] == "title" {
				return field{text: &it.Title}, nil
			}
			return field{text: &it.Summary}, nil
		}
	case len(p) == 5 && p[0] == "items" && p[2] == "facets" && p[4] == "markdown":
		if it := findItem(doc, p[1]); it != nil {
			for i := range it.Facets {
				if kinds.Slug(it.Facets[i].Label) == p[3] {
					return field{text: &it.Facets[i].Markdown, multiline: true}, nil
				}
			}
		}
	case len(p) == 3 && p[0] == "items" && p[2] == "facets":
		if it := findItem(doc, p[1]); it != nil {
			return field{facets: it, kind: kind}, nil
		}
	case len(p) == 3 && p[0] == "boards" && p[2] == "order":
		if s := findSection(doc, p[1]); s != nil && s.Board != nil {
			return field{board: s.Board}, nil
		}
	}
	return field{}, fmt.Errorf("%w %q", errUnknownTarget, target)
}

func findSection(doc *model.Document, id string) *model.Section {
	for i := range doc.Sections {
		if doc.Sections[i].ID == id {
			return &doc.Sections[i]
		}
	}
	return nil
}

func findItem(doc *model.Document, id string) *model.Item {
	for si := range doc.Sections {
		if b := doc.Sections[si].Board; b != nil {
			for ii := range b.Items {
				if b.Items[ii].ID == id {
					return &b.Items[ii]
				}
			}
		}
	}
	return nil
}

// sectionOf returns the section whose board holds the item.
func sectionOf(doc *model.Document, itemID string) *model.Section {
	for si := range doc.Sections {
		if b := doc.Sections[si].Board; b != nil {
			for _, it := range b.Items {
				if it.ID == itemID {
					return &doc.Sections[si]
				}
			}
		}
	}
	return nil
}

// value is the field's current value as JSON text.
func (f field) value() string {
	switch {
	case f.board != nil:
		return jsonText(boardIDs(f.board))
	case f.facets != nil:
		return jsonText(facetLabels(f.facets))
	case f.accent != nil:
		if f.accent.Theme == nil {
			return jsonText("")
		}
		return jsonText(f.accent.Theme.Accent)
	}
	return jsonText(*f.text)
}

func (f field) set(valueJSON string) error {
	switch {
	case f.facets != nil:
		return f.setFacets(valueJSON)
	case f.accent != nil:
		var hex string
		if err := json.Unmarshal([]byte(valueJSON), &hex); err != nil {
			return err
		}
		if hex == "" {
			f.accent.Theme = nil
		} else {
			f.accent.Theme = &model.Theme{Accent: strings.ToLower(hex)}
		}
		return nil
	case f.board == nil:
		var s string
		if err := json.Unmarshal([]byte(valueJSON), &s); err != nil {
			return err
		}
		*f.text = s
		return nil
	}
	var ids []string
	if err := json.Unmarshal([]byte(valueJSON), &ids); err != nil {
		return err
	}
	if len(ids) != len(f.board.Items) {
		return errors.New("an order lists every item exactly once")
	}
	byID := make(map[string]model.Item, len(f.board.Items))
	for _, it := range f.board.Items {
		byID[it.ID] = it
	}
	items := make([]model.Item, 0, len(ids))
	for _, id := range ids {
		it, ok := byID[id]
		if !ok {
			return fmt.Errorf("an order names unknown or repeated item %q", id)
		}
		delete(byID, id)
		items = append(items, it)
	}
	f.board.Items = items
	return nil
}

// setFacets rebuilds an item's facets from a list of labels: a facet that
// stays keeps its text, and a new one starts from the kind's hint.
func (f field) setFacets(valueJSON string) error {
	var labels []string
	if err := json.Unmarshal([]byte(valueJSON), &labels); err != nil {
		return err
	}
	have := map[string]model.Facet{}
	for _, fc := range f.facets.Facets {
		have[kinds.Slug(fc.Label)] = fc
	}
	facets := make([]model.Facet, 0, len(labels))
	seen := map[string]bool{}
	for _, label := range labels {
		slug := kinds.Slug(label)
		if slug == "" || seen[slug] {
			return fmt.Errorf("a facet list names %q twice or not at all", label)
		}
		seen[slug] = true
		if fc, ok := have[slug]; ok {
			facets = append(facets, fc)
			continue
		}
		rule, ok := f.kind.FacetRule(label)
		if !ok {
			return fmt.Errorf("%q is not a facet of the %s kind", label, f.kind.ID)
		}
		facets = append(facets, model.Facet{Label: rule.Label, Markdown: rule.Hint})
	}
	f.facets.Facets = facets
	return nil
}

func facetLabels(it *model.Item) []string {
	labels := make([]string, len(it.Facets))
	for i, fc := range it.Facets {
		labels[i] = fc.Label
	}
	return labels
}

// normalize cleans an edit the way the field is read: one line for titles,
// summaries, and ledes; markdown keeps its lines but loses trailing space.
func normalize(value string, multiline bool) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	if multiline {
		return strings.TrimRight(strings.TrimLeft(value, "\n"), " \t\n")
	}
	return strings.Join(strings.Fields(value), " ")
}

// applyDrafts applies every draft whose base still matches the document.
// The rest are conflicts and leave their field untouched. Structural drafts
// apply first, so a facet a list adds exists before its text is edited.
func applyDrafts(doc *model.Document, kind kinds.Kind, drafts []store.Draft) (applied, conflicts []string) {
	ordered := make([]store.Draft, 0, len(drafts))
	for _, pass := range []bool{true, false} {
		for _, d := range drafts {
			if structural(d.Target) == pass {
				ordered = append(ordered, d)
			}
		}
	}
	for _, d := range ordered {
		f, err := resolve(doc, kind, d.Target)
		if err != nil || f.value() != d.Base {
			conflicts = append(conflicts, d.Target)
			continue
		}
		if err := f.set(d.Value); err != nil {
			conflicts = append(conflicts, d.Target)
			continue
		}
		applied = append(applied, d.Target)
	}
	sort.Strings(applied)
	sort.Strings(conflicts)
	return applied, conflicts
}

// withStructure applies only the structural drafts, so a text draft can be
// read and based against the facets and orders the studio shows.
func withStructure(doc *model.Document, kind kinds.Kind, drafts []store.Draft) {
	var shape []store.Draft
	for _, d := range drafts {
		if structural(d.Target) {
			shape = append(shape, d)
		}
	}
	applyDrafts(doc, kind, shape)
}

func jsonText(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "null"
	}
	return string(b)
}

func boardIDs(b *model.Board) []string {
	ids := make([]string, len(b.Items))
	for i, it := range b.Items {
		ids[i] = it.ID
	}
	return ids
}
