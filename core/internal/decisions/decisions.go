// Package decisions is the reader's side of the loop: what was picked, the
// path chosen, and notes by item, as one document that people and agents can
// both read, plus the one-line reply a person types into a thread.
package decisions

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"dossier/internal/model"
)

// Schema names the decisions document contract.
const Schema = "dossier.decisions/v1"

// Document is dossier.decisions/v1.
type Document struct {
	Schema string            `json:"schema"`
	Slug   string            `json:"slug"`
	Title  string            `json:"title,omitempty"`
	Path   string            `json:"path,omitempty"`
	Picked []string          `json:"picked"`
	Notes  map[string]string `json:"notes,omitempty"`
	Reply  string            `json:"reply,omitempty"`
	Items  []Item            `json:"items,omitempty"`
}

// Item is one numbered item as the decisions document lists it.
type Item struct {
	ID     string `json:"id"`
	N      int    `json:"n"`
	Title  string `json:"title"`
	Picked bool   `json:"picked"`
	Note   string `json:"note,omitempty"`
}

// Items lists the numbered items of a document in order, with the current
// decisions applied.
func Items(doc *model.Document) []Item {
	var out []Item
	picked := map[string]bool{}
	notes := map[string]string{}
	if doc.Decisions != nil {
		for _, id := range doc.Decisions.Picked {
			picked[id] = true
		}
		notes = doc.Decisions.Notes
	}
	n := 0
	for _, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for _, it := range s.Board.Items {
			n++
			out = append(out, Item{ID: it.ID, N: n, Title: it.Title, Picked: picked[it.ID], Note: notes[it.ID]})
		}
	}
	return out
}

// FromModel builds the decisions document from a model's own decisions.
func FromModel(doc *model.Document) Document {
	items := Items(doc)
	d := Document{Schema: Schema, Slug: doc.Meta.Slug, Title: doc.Meta.Title, Picked: []string{}, Items: items}
	if doc.Decisions != nil {
		d.Path = doc.Decisions.Path
		if len(doc.Decisions.Notes) > 0 {
			d.Notes = map[string]string{}
			for k, v := range doc.Decisions.Notes {
				d.Notes[k] = v
			}
		}
	}
	for _, it := range items {
		if it.Picked {
			d.Picked = append(d.Picked, it.ID)
		}
	}
	d.Reply = ReplyLine(d, items)
	return d
}

// ReplyLine renders the one line a person replies with:
// "rebuild, 1, 3. Notes: 3: keep the blue accent."
func ReplyLine(d Document, items []Item) string {
	byID := map[string]Item{}
	for _, it := range items {
		byID[it.ID] = it
	}
	var nums []int
	for _, id := range d.Picked {
		if it, ok := byID[id]; ok {
			nums = append(nums, it.N)
		}
	}
	sort.Ints(nums)
	var b strings.Builder
	if d.Path != "" {
		b.WriteString(d.Path)
		b.WriteString(", ")
	}
	switch {
	case len(nums) == 0:
		b.WriteString("nothing")
	case len(nums) == len(items) && len(items) > 0:
		b.WriteString("all")
	default:
		for i, n := range nums {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(strconv.Itoa(n))
		}
	}
	b.WriteString(".")
	var noteNums []int
	noteByN := map[int]string{}
	for id, text := range d.Notes {
		if it, ok := byID[id]; ok && strings.TrimSpace(text) != "" {
			noteNums = append(noteNums, it.N)
			noteByN[it.N] = strings.Join(strings.Fields(text), " ")
		}
	}
	if len(noteNums) > 0 {
		sort.Ints(noteNums)
		b.WriteString(" Notes: ")
		for i, n := range noteNums {
			if i > 0 {
				b.WriteString("; ")
			}
			fmt.Fprintf(&b, "%d: %s", n, noteByN[n])
		}
		b.WriteString(".")
	}
	return b.String()
}

// Markdown renders the decisions document: a heading, the reply line, the
// picked and unpicked lists, and the JSON as a fenced block agents parse.
func Markdown(d Document) ([]byte, error) {
	var b bytes.Buffer
	title := d.Title
	if title == "" {
		title = d.Slug
	}
	fmt.Fprintf(&b, "# Decisions for %s\n\n", title)
	fmt.Fprintf(&b, "Reply: %s\n\n", d.Reply)
	if d.Path != "" {
		fmt.Fprintf(&b, "Path: %s\n\n", d.Path)
	}
	b.WriteString("## Picked\n\n")
	any := false
	for _, it := range d.Items {
		if it.Picked {
			any = true
			writeItem(&b, it)
		}
	}
	if !any {
		b.WriteString("Nothing yet.\n")
	}
	b.WriteString("\n## Not picked\n\n")
	for _, it := range d.Items {
		if !it.Picked {
			writeItem(&b, it)
		}
	}
	b.WriteString("\n```json\n")
	enc := json.NewEncoder(&b)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(d); err != nil {
		return nil, err
	}
	b.WriteString("```\n")
	return b.Bytes(), nil
}

func writeItem(b *bytes.Buffer, it Item) {
	fmt.Fprintf(b, "- %d. %s", it.N, it.Title)
	if it.Note != "" {
		fmt.Fprintf(b, " (note: %s)", it.Note)
	}
	b.WriteString("\n")
}

var fence = regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")

// Parse reads a decisions document from JSON or from the fenced JSON block
// inside the Markdown form.
func Parse(data []byte) (Document, error) {
	trimmed := bytes.TrimSpace(data)
	if !bytes.HasPrefix(trimmed, []byte("{")) {
		m := fence.FindSubmatch(trimmed)
		if m == nil {
			return Document{}, errors.New("decisions document has no JSON object and no ```json block")
		}
		trimmed = m[1]
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.DisallowUnknownFields()
	var d Document
	if err := dec.Decode(&d); err != nil {
		return Document{}, fmt.Errorf("decode decisions: %w", err)
	}
	if d.Schema != Schema {
		return Document{}, fmt.Errorf("decisions schema must be %q, got %q", Schema, d.Schema)
	}
	if d.Picked == nil {
		d.Picked = []string{}
	}
	return d, nil
}

var (
	tokenPattern = regexp.MustCompile(`[A-Za-z-]+|\d+`)
	notePattern  = regexp.MustCompile(`^\s*(\d+)\s*:\s*(.+?)\s*$`)
)

// ParseReply turns a reply line back into decisions. Accepted shapes:
// "1, 3, 7", "rebuild, all", "reshape, 2 4 6. Notes: 4: keep blue; 6: later."
func ParseReply(text string, items []Item) (Document, error) {
	d := Document{Schema: Schema, Picked: []string{}}
	byN := map[int]Item{}
	for _, it := range items {
		byN[it.N] = it
	}
	head, notes := text, ""
	if i := strings.Index(strings.ToLower(text), "notes:"); i >= 0 {
		head, notes = text[:i], text[i+len("notes:"):]
	}
	seen := map[string]bool{}
	for i, tok := range tokenPattern.FindAllString(head, -1) {
		lower := strings.ToLower(tok)
		if n, err := strconv.Atoi(tok); err == nil {
			it, ok := byN[n]
			if !ok {
				return Document{}, fmt.Errorf("reply names item %d, but there are %d items", n, len(items))
			}
			if !seen[it.ID] {
				seen[it.ID] = true
				d.Picked = append(d.Picked, it.ID)
			}
			continue
		}
		switch {
		case lower == "all":
			for _, it := range items {
				if !seen[it.ID] {
					seen[it.ID] = true
					d.Picked = append(d.Picked, it.ID)
				}
			}
		case lower == "nothing" || lower == "none":
		case i == 0:
			d.Path = lower
		default:
			return Document{}, fmt.Errorf("reply has an unexpected word %q; write a path first, then numbers, then the notes", tok)
		}
	}
	for _, entry := range strings.Split(strings.TrimSpace(notes), ";") {
		entry = strings.TrimSuffix(strings.TrimSpace(entry), ".")
		if entry == "" {
			continue
		}
		m := notePattern.FindStringSubmatch(entry)
		if m == nil {
			return Document{}, fmt.Errorf("note %q must look like \"3: text\"", entry)
		}
		n, _ := strconv.Atoi(m[1])
		it, ok := byN[n]
		if !ok {
			return Document{}, fmt.Errorf("note names item %d, but there are %d items", n, len(items))
		}
		if d.Notes == nil {
			d.Notes = map[string]string{}
		}
		d.Notes[it.ID] = m[2]
	}
	sortByNumber(&d, byN)
	return d, nil
}

func sortByNumber(d *Document, byN map[int]Item) {
	nOf := map[string]int{}
	for n, it := range byN {
		nOf[it.ID] = n
	}
	sort.Slice(d.Picked, func(i, j int) bool { return nOf[d.Picked[i]] < nOf[d.Picked[j]] })
}

// Apply writes the decisions into the model. Unknown ids are findings and
// leave the model untouched.
func Apply(doc *model.Document, d Document) []model.Problem {
	known := map[string]bool{}
	for _, it := range Items(doc) {
		known[it.ID] = true
	}
	var problems []model.Problem
	for i, id := range d.Picked {
		if !known[id] {
			problems = append(problems, model.Problem{Path: fmt.Sprintf("/picked/%d", i), Message: fmt.Sprintf("unknown item %q", id)})
		}
	}
	for id := range d.Notes {
		if !known[id] {
			problems = append(problems, model.Problem{Path: "/notes/" + id, Message: "unknown item"})
		}
	}
	if d.Slug != "" && d.Slug != doc.Meta.Slug {
		problems = append(problems, model.Problem{Path: "/slug", Message: fmt.Sprintf("decisions are for %q, model is %q", d.Slug, doc.Meta.Slug)})
	}
	if len(problems) > 0 {
		return problems
	}
	next := &model.Decisions{Path: d.Path, Picked: append([]string{}, d.Picked...)}
	if len(d.Notes) > 0 {
		next.Notes = map[string]string{}
		for k, v := range d.Notes {
			if strings.TrimSpace(v) != "" {
				next.Notes[k] = strings.TrimSpace(v)
			}
		}
	}
	if next.Path == "" && len(next.Picked) == 0 && len(next.Notes) == 0 {
		doc.Decisions = nil
		return nil
	}
	doc.Decisions = next
	return nil
}
