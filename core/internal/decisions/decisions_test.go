package decisions

import (
	"strings"
	"testing"

	"dossier/internal/model"
)

func sample() *model.Document {
	return &model.Document{
		Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "Twelve moves", Slug: "moves"},
		Sections: []model.Section{
			{ID: "frame", Title: "Frame", Parts: []model.Part{{Type: "prose", Markdown: "x"}}},
			{ID: "board", Title: "Board", Board: &model.Board{Items: []model.Item{{ID: "a", Title: "Alpha"}, {ID: "b", Title: "Beta"}, {ID: "c", Title: "Gamma"}}}},
			{ID: "also", Title: "Also", Board: &model.Board{Layout: "rows", Items: []model.Item{{ID: "z", Title: "Zed"}}}},
		},
	}
}

func TestItemsSkipRows(t *testing.T) {
	items := Items(sample())
	if len(items) != 3 || items[2].N != 3 || items[2].ID != "c" {
		t.Fatalf("unexpected items %+v", items)
	}
}

func TestReplyRoundTrip(t *testing.T) {
	doc := sample()
	items := Items(doc)
	d, err := ParseReply("Rebuild, 3, 1. Notes: 1: keep blue; 3: after two.", items)
	if err != nil {
		t.Fatal(err)
	}
	if d.Path != "rebuild" || strings.Join(d.Picked, ",") != "a,c" || d.Notes["a"] != "keep blue" || d.Notes["c"] != "after two" {
		t.Fatalf("parsed %+v", d)
	}
	if p := Apply(doc, d); len(p) > 0 {
		t.Fatal(p)
	}
	back := FromModel(doc)
	if back.Reply != "rebuild, 1, 3. Notes: 1: keep blue; 3: after two." {
		t.Errorf("reply line %q", back.Reply)
	}
	all, err := ParseReply("all", items)
	if err != nil || len(all.Picked) != 3 {
		t.Errorf("all: %v %+v", err, all)
	}
	if _, err := ParseReply("1, 9", items); err == nil {
		t.Error("out of range number must fail")
	}
	if _, err := ParseReply("1 maybe 2", items); err == nil {
		t.Error("stray word must fail")
	}
	if _, err := ParseReply("1. Notes: nonsense", items); err == nil {
		t.Error("malformed note must fail")
	}
}

func TestMarkdownParse(t *testing.T) {
	doc := sample()
	doc.Decisions = &model.Decisions{Picked: []string{"b"}, Notes: map[string]string{"b": "soon"}}
	d := FromModel(doc)
	md, err := Markdown(d)
	if err != nil {
		t.Fatal(err)
	}
	text := string(md)
	for _, want := range []string{"# Decisions for Twelve moves", "Reply: 2. Notes: 2: soon.", "- 2. Beta (note: soon)", "## Not picked", "```json"} {
		if !strings.Contains(text, want) {
			t.Errorf("markdown lacks %q:\n%s", want, text)
		}
	}
	parsed, err := Parse(md)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(parsed.Picked, ",") != "b" || parsed.Notes["b"] != "soon" || parsed.Slug != "moves" {
		t.Errorf("parsed %+v", parsed)
	}
	if _, err := Parse([]byte(`{"schema":"other/v1","slug":"moves","picked":[]}`)); err == nil {
		t.Error("wrong schema must fail")
	}
}

func TestApplyRejectsUnknown(t *testing.T) {
	doc := sample()
	p := Apply(doc, Document{Schema: Schema, Slug: "moves", Picked: []string{"nope"}, Notes: map[string]string{"z": "rows are not items"}})
	if len(p) != 2 || doc.Decisions != nil {
		t.Errorf("expected two problems and no change, got %v %+v", p, doc.Decisions)
	}
	if p := Apply(doc, Document{Schema: Schema, Slug: "other", Picked: []string{"a"}}); len(p) != 1 {
		t.Errorf("slug mismatch must be a problem, got %v", p)
	}
	if p := Apply(doc, Document{Schema: Schema, Picked: []string{}}); len(p) != 0 || doc.Decisions != nil {
		t.Errorf("empty decisions clear the model, got %v %+v", p, doc.Decisions)
	}
}
