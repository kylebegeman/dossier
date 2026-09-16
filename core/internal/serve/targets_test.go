package serve

import (
	"strings"
	"testing"

	"dossier/internal/model"
	"dossier/internal/store"
)

func targetDoc() *model.Document {
	return &model.Document{Dossier: "1.0", Kind: "brief", Meta: model.Meta{Title: "T", Slug: "t", Lede: "L"}, Sections: []model.Section{
		{ID: "intro", Title: "Intro", Parts: []model.Part{{Type: "prose", Markdown: "hello"}, {Type: "table", Columns: []string{"a"}}}},
		{ID: "board", Title: "Board", Board: &model.Board{Items: []model.Item{
			{ID: "a", Title: "A", Summary: "sa", Facets: []model.Facet{{Label: "Notes", Markdown: "na"}}},
			{ID: "b", Title: "B"},
			{ID: "c", Title: "C"},
		}}},
	}}
}

func TestResolveTargets(t *testing.T) {
	doc := targetDoc()
	for target, want := range map[string]string{
		"/meta/title":                      `"T"`,
		"/meta/lede":                       `"L"`,
		"/meta/kicker":                     `""`,
		"/sections/intro/title":            `"Intro"`,
		"/sections/intro/parts/0/markdown": `"hello"`,
		"/items/a/title":                   `"A"`,
		"/items/a/summary":                 `"sa"`,
		"/items/a/facets/0/markdown":       `"na"`,
		"/boards/board/order":              `["a","b","c"]`,
	} {
		f, err := resolve(doc, target)
		if err != nil {
			t.Errorf("%s: %v", target, err)
			continue
		}
		if got := f.value(); got != want {
			t.Errorf("%s = %s, want %s", target, got, want)
		}
	}
	for _, bad := range []string{"", "/meta/slug", "/sections/intro/parts/1/markdown", "/sections/intro/parts/01/markdown", "/sections/nope/title", "/items/a/facets/1/markdown", "/items/zz/title", "/boards/intro/order", "/items/a"} {
		if _, err := resolve(doc, bad); err == nil {
			t.Errorf("%q must not resolve", bad)
		}
	}
}

func TestSetAndApplyDrafts(t *testing.T) {
	doc := targetDoc()
	f, _ := resolve(doc, "/boards/board/order")
	for _, bad := range []string{`["a","b"]`, `["a","a","b"]`, `["a","b","z"]`, `"x"`} {
		if err := f.set(bad); err == nil {
			t.Errorf("order %s must be refused", bad)
		}
	}
	drafts := []store.Draft{
		{Target: "/boards/board/order", Base: `["a","b","c"]`, Value: `["c","a","b"]`},
		{Target: "/items/a/title", Base: `"A"`, Value: `"A2"`},
		{Target: "/items/b/title", Base: `"stale"`, Value: `"B2"`},
		{Target: "/items/gone/title", Base: `"G"`, Value: `"G2"`},
	}
	applied, conflicts := applyDrafts(doc, drafts)
	if strings.Join(applied, ",") != "/boards/board/order,/items/a/title" || strings.Join(conflicts, ",") != "/items/b/title,/items/gone/title" {
		t.Errorf("applied %v conflicts %v", applied, conflicts)
	}
	items := doc.Sections[1].Board.Items
	if items[0].ID != "c" || items[1].Title != "A2" || items[2].Title != "B" {
		t.Errorf("board after drafts: %+v", items)
	}
}

func TestNormalize(t *testing.T) {
	if got := normalize("  a \n b\t c  ", false); got != "a b c" {
		t.Errorf("one line: %q", got)
	}
	if got := normalize("\n\n  code\r\n  more  \n\n", true); got != "  code\n  more" {
		t.Errorf("markdown: %q", got)
	}
}
