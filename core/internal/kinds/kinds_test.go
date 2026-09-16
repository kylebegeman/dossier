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
	var ids []string
	for _, k := range all {
		ids = append(ids, k.ID)
		if k.Title == "" || k.Summary == "" || k.Items.Limits == nil {
			t.Errorf("%s: preset is incomplete", k.ID)
		}
		if k.Items.Numbered && len(k.SummaryTable.Columns) == 0 {
			t.Errorf("%s: a numbered kind needs summary table columns", k.ID)
		}
	}
	if got := strings.Join(ids, ","); got != "brainstorm,brief,incident,plan,release,review" {
		t.Errorf("unexpected preset set %s", got)
	}
	b, err := Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	if b.Pick.Title == "" || len(b.Items.Facets) == 0 {
		t.Error("brainstorm must carry a facet vocabulary and a pick block")
	}
	if _, err := Load("nope"); err == nil {
		t.Error("unknown kind must fail")
	}
}

func TestPermissiveKindsAcceptAnyFacets(t *testing.T) {
	for _, id := range []string{"plan", "review", "release", "incident", "brief"} {
		k, err := Load(id)
		if err != nil {
			t.Fatal(err)
		}
		if len(k.Items.Facets) != 0 || len(k.Items.Size) != 0 {
			t.Errorf("%s: expected no facet vocabulary or size list yet", id)
		}
		doc := brainstormDoc(model.Facet{Label: "Status", Markdown: "x"}, model.Facet{Label: "Anything", Markdown: "y"})
		doc.Kind = id
		doc.Sections[0].Board.Items[0].Size = ""
		if p := k.Check(doc); len(p) != 0 {
			t.Errorf("%s: permissive kind rejected facets: %v", id, p)
		}
		doc.Sections[0].Board.Items[0].Effort = "XL"
		if p := k.Check(doc); len(p) != 1 {
			t.Errorf("%s: effort outside S, M, L should be one problem, got %v", id, p)
		}
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

func TestAdviseWarnsPastLimits(t *testing.T) {
	k, err := Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	long := strings.Repeat("word ", 120)
	doc := brainstormDoc(model.Facet{Label: "How it works", Markdown: long}, model.Facet{Label: "Reader", Markdown: "x"}, model.Facet{Label: "Agent", Markdown: "x"}, model.Facet{Label: "Unlocks", Markdown: "x"})
	doc.Sections[0].Board.Items[0].Summary = strings.Repeat("s", 200)
	w := k.Advise(doc)
	if len(w) != 2 {
		t.Errorf("expected a summary and a facet warning, got %v", w)
	}
	if p := k.Check(doc); len(p) != 0 {
		t.Errorf("length is advice, not a finding: %v", p)
	}
}
