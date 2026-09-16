package kinds

import (
	"strings"
	"testing"

	"dossier/internal/model"
)

func brainstormDoc(facets ...model.Facet) *model.Document {
	return &model.Document{
		Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "t", Slug: "t"},
		Sections: []model.Section{{ID: "s", Title: "S", Board: &model.Board{Items: []model.Item{{ID: "a", Title: "A", Size: "minor", Effort: "S", Impact: 3, Facets: facets}}}}},
	}
}

func TestLoadAll(t *testing.T) {
	all, err := All()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) == 0 {
		t.Fatal("no presets embedded")
	}
	for _, k := range all {
		if k.Pick.Title == "" || len(k.Items.Facets) == 0 {
			t.Errorf("%s: preset is incomplete", k.ID)
		}
	}
	if _, err := Load("nope"); err == nil {
		t.Error("unknown kind must fail")
	}
}

func TestFacetOrder(t *testing.T) {
	k, err := Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	good := brainstormDoc(model.Facet{Label: "How it works", Markdown: "x"}, model.Facet{Label: "Reader", Markdown: "x"}, model.Facet{Label: "Agent", Markdown: "x"}, model.Facet{Label: "Unlocks", Markdown: "x"}, model.Facet{Label: "Risk", Markdown: "x"})
	if p := k.Check(good); len(p) > 0 {
		t.Errorf("valid facets rejected: %v", p)
	}
	swapped := brainstormDoc(model.Facet{Label: "Reader", Markdown: "x"}, model.Facet{Label: "How it works", Markdown: "x"})
	p := k.Check(swapped)
	if len(p) == 0 || !strings.Contains(p[0].Message, `expected "How it works"`) {
		t.Errorf("swapped facets accepted: %v", p)
	}
	missing := brainstormDoc(model.Facet{Label: "How it works", Markdown: "x"})
	if p := k.Check(missing); len(p) == 0 || !strings.Contains(p[0].Message, "missing facet") {
		t.Errorf("missing facet accepted: %v", p)
	}
	stray := brainstormDoc(model.Facet{Label: "How it works", Markdown: "x"}, model.Facet{Label: "Reader", Markdown: "x"}, model.Facet{Label: "Agent", Markdown: "x"}, model.Facet{Label: "Unlocks", Markdown: "x"}, model.Facet{Label: "Budget", Markdown: "x"})
	if p := k.Check(stray); len(p) == 0 || !strings.Contains(p[0].Message, "not a facet") {
		t.Errorf("stray facet accepted: %v", p)
	}
}

func TestFieldRanges(t *testing.T) {
	k, err := Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	doc := brainstormDoc(model.Facet{Label: "How it works", Markdown: "x"}, model.Facet{Label: "Reader", Markdown: "x"}, model.Facet{Label: "Agent", Markdown: "x"}, model.Facet{Label: "Unlocks", Markdown: "x"})
	doc.Sections[0].Board.Items[0].Size = "huge"
	doc.Sections[0].Board.Items[0].Impact = 9
	p := k.Check(doc)
	if len(p) != 2 {
		t.Errorf("expected size and impact problems, got %v", p)
	}
}
