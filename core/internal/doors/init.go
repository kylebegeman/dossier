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
	kind, err := in.kindRegistry().Load(positional[0])
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

// Starter builds the model an agent starts from for a kind: every expected
// section in order, prose sections holding their hint, the board holding two
// items with plausible field values and the facets to fill, and rows holding
// one entry. It validates against the kind by construction.
func Starter(kind kinds.Kind, title, slug, updated string) *model.Document {
	if title == "" {
		title = kind.Title + " title"
	}
	if slug == "" {
		slug = slugify(title)
	}
	doc := &model.Document{
		Dossier: model.Version,
		Kind:    kind.ID,
		Meta:    model.Meta{Title: title, Slug: slug, Lede: "One sentence on what this " + strings.ToLower(kind.Title) + " is for.", Updated: updated, Status: "draft"},
	}
	for _, rule := range kind.Sections {
		section := model.Section{ID: rule.ID, Title: rule.Title}
		switch {
		case rule.Board:
			first := starterItem(kind, rule, 1, "")
			second := starterItem(kind, rule, 2, first.ID)
			section.Board = &model.Board{Summary: kind.Item.Numbered, Items: []model.Item{first, second}}
		case rule.Layout == "rows":
			section.Board = &model.Board{Layout: "rows", Items: []model.Item{{ID: rule.ID + "-first", Title: "First entry", Summary: rule.Hint}}}
		default:
			section.Parts = []model.Part{{Type: "prose", Markdown: rule.Hint}}
		}
		doc.Sections = append(doc.Sections, section)
	}
	return doc
}

// starterDefaults are field values a starter item takes when the kind has
// them: calm, undecided values rather than the first of each list.
var starterDefaults = []string{"minor", "planned", "pending", "open", "detect", "S"}

func starterItem(kind kinds.Kind, rule kinds.SectionRule, n int, previous string) model.Item {
	ordinal := map[int]string{1: "First", 2: "Second"}[n]
	it := model.Item{
		ID:      fmt.Sprintf("%s-%s", slugify(kind.Item.Noun), strings.ToLower(ordinal)),
		Title:   ordinal + " " + kind.Item.Noun,
		Summary: "One sentence on what this " + kind.Item.Noun + " is.",
	}
	value := func(name string) string {
		f := kind.Field(name)
		if f == nil || len(f.Values) == 0 {
			return ""
		}
		for _, preferred := range starterDefaults {
			for _, v := range f.Values {
				if v == preferred {
					return v
				}
			}
		}
		return f.Values[0]
	}
	it.Size, it.Category, it.Severity, it.Status, it.Effort = value("size"), value("category"), value("severity"), value("status"), value("effort")
	if kind.Fields.Impact != nil {
		it.Impact = kind.Fields.Impact.Min
	}
	if kind.Fields.Required != nil {
		it.Required = true
	}
	if f := kind.Field("owner"); f != nil {
		it.Owner = "Owner name"
	}
	if kind.Fields.DependsOn != nil && previous != "" {
		it.DependsOn = []string{previous}
	}
	required := false
	for _, f := range kind.Facets {
		if f.Required {
			required = true
			it.Facets = append(it.Facets, model.Facet{Label: f.Label, Markdown: f.Hint})
		}
	}
	if !required && len(kind.Facets) > 0 {
		it.Facets = append(it.Facets, model.Facet{Label: kind.Facets[0].Label, Markdown: kind.Facets[0].Hint})
	}
	return it
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
