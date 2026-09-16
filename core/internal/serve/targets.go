package serve

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"dossier/internal/model"
	"dossier/internal/store"
)

// A target names one editable place in a document by stable ids, never by
// section or item position, so a draft survives edits elsewhere in the file:
//
//	/meta/title, /meta/kicker, /meta/lede
//	/sections/{section}/title
//	/sections/{section}/parts/{i}/markdown   prose and callout parts
//	/items/{item}/title, /items/{item}/summary
//	/items/{item}/facets/{i}/markdown
//	/boards/{section}/order                  the board's item ids, in order
//
// Values and bases are JSON text: a string for text fields, an array of ids
// for an order.

var errUnknownTarget = errors.New("unknown edit target")

type field struct {
	text      *string
	multiline bool
	board     *model.Board
}

func resolve(doc *model.Document, target string) (field, error) {
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
			if i, ok := index(p[3], len(it.Facets)); ok {
				return field{text: &it.Facets[i].Markdown, multiline: true}, nil
			}
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
	if f.board != nil {
		return jsonText(boardIDs(f.board))
	}
	return jsonText(*f.text)
}

func (f field) set(valueJSON string) error {
	if f.board == nil {
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
// The rest are conflicts and leave their field untouched. Drafts come
// ordered by target, so a board's order applies before its items change.
func applyDrafts(doc *model.Document, drafts []store.Draft) (applied, conflicts []string) {
	for _, d := range drafts {
		f, err := resolve(doc, d.Target)
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
	return applied, conflicts
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
