package doors

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"dossier/internal/kinds"
	"dossier/internal/model"
)

func init() { register("init", initDoor) }

// InitResult is dossier.init-result/v1.
type InitResult struct {
	SchemaVersion string `json:"schema_version"`
	Kind          string `json:"kind"`
	Slug          string `json:"slug"`
	Model         string `json:"model"`
}

func (r InitResult) human(w io.Writer) {
	say(w, "wrote %s  (%s)\n", r.Model, r.Kind)
}

func initDoor(_ context.Context, in Input) Envelope {
	args := in.Args
	const id = "init"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	title := fs.String("title", "", "document title; default names the kind")
	slug := fs.String("slug", "", "file and anchor slug; default derives from the title")
	out := fs.String("out", "", "directory for the model file; default is the working directory")
	force := fs.Bool("force", false, "overwrite an existing file")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(positional) != 1 {
		return errorEnvelope(id, "usage", fmt.Errorf("init needs exactly one kind; see describe for the list"))
	}
	kind, err := kinds.Load(positional[0])
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	doc := Starter(kind, *title, *slug, time.Now().Format("2006-01-02"))
	if problems := model.Check(doc); len(problems) > 0 {
		return errorEnvelope(id, "starter", fmt.Errorf("starter does not validate: %v", problems))
	}
	target := filepath.Join(*out, doc.Meta.Slug+".dossier.json")
	if _, statErr := os.Stat(target); statErr == nil && !*force {
		return errorEnvelope(id, "exists", fmt.Errorf("%s exists; pass --force to overwrite", target))
	}
	data, err := model.Encode(doc)
	if err != nil {
		return errorEnvelope(id, "encode", err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return errorEnvelope(id, "write", err)
	}
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return errorEnvelope(id, "write", err)
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Result: InitResult{SchemaVersion: "dossier.init-result/v1", Kind: kind.ID, Slug: doc.Meta.Slug, Model: target}}
}

// Starter builds the model an agent starts from for a kind: a masthead, one
// prose section, and a board with one item carrying the kind's facets in
// order. It validates against the kind's rules by construction.
func Starter(kind kinds.Kind, title, slug, updated string) *model.Document {
	if title == "" {
		title = kind.Title + " title"
	}
	if slug == "" {
		slug = slugify(title)
	}
	item := model.Item{ID: "first-item", Title: "First item", Summary: "One sentence on what this item is."}
	if len(kind.Items.Size) > 0 {
		item.Size = kind.Items.Size[0]
	}
	if len(kind.Items.Effort) > 0 {
		item.Effort = kind.Items.Effort[0]
	}
	if kind.Items.Impact != nil {
		item.Impact = kind.Items.Impact.Min
	}
	facets := kind.Items.Facets
	if len(facets) == 0 {
		facets = []string{"Notes"}
	}
	for _, label := range facets {
		item.Facets = append(item.Facets, model.Facet{Label: label, Markdown: "Two or three sentences for " + strings.ToLower(label) + "."})
	}
	sections := []model.Section{
		{ID: "summary", Title: "Summary", Parts: []model.Part{{Type: "prose", Markdown: "One paragraph that says what this document decides and why now."}}},
		{ID: "items", Title: "Items", Board: &model.Board{Summary: kind.Items.Numbered, Items: []model.Item{item}}},
	}
	return &model.Document{
		Dossier:  model.Version,
		Kind:     kind.ID,
		Meta:     model.Meta{Title: title, Slug: slug, Lede: "One sentence for the masthead.", Updated: updated, Status: "draft"},
		Sections: sections,
	}
}

func slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) > 64 {
		out = strings.TrimRight(out[:64], "-")
	}
	if out == "" {
		out = "document"
	}
	return out
}
