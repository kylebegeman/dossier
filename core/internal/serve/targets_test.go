package serve

import (
	"encoding/json"
	"strings"
	"testing"

	"dossier/internal/kinds"
	"dossier/internal/model"
	"dossier/internal/store"
)

func brief(t *testing.T) kinds.Kind {
	t.Helper()
	k, err := kinds.Load("brief")
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func targetDoc() *model.Document {
	return &model.Document{Dossier: "1.0", Kind: "brief", Meta: model.Meta{Title: "T", Slug: "t", Lede: "L"}, Sections: []model.Section{
		{ID: "intro", Title: "Intro", Parts: []model.Part{{Type: "prose", Markdown: "hello"}, {Type: "table", Columns: []string{"a"}}}},
		{ID: "board", Title: "Board", Board: &model.Board{Items: []model.Item{
			{ID: "a", Title: "A", Summary: "sa", Facets: []model.Facet{{Label: "Detail", Markdown: "da"}, {Label: "So what", Markdown: "sw"}}},
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
		"/items/a/facets/so-what/markdown": `"sw"`,
		"/items/a/facets":                  `["Detail","So what"]`,
		"/meta/theme/accent":               `""`,
		"/boards/board/order":              `["a","b","c"]`,
	} {
		f, err := resolve(doc, brief(t), target)
		if err != nil {
			t.Errorf("%s: %v", target, err)
			continue
		}
		if got := f.value(); got != want {
			t.Errorf("%s = %s, want %s", target, got, want)
		}
	}
	for _, bad := range []string{"", "/meta/slug", "/meta/theme", "/sections/intro/parts/1/markdown", "/sections/intro/parts/01/markdown", "/sections/nope/title", "/items/a/facets/0/markdown", "/items/a/facets/evidence/markdown", "/items/zz/facets", "/items/zz/title", "/boards/intro/order", "/items/a"} {
		if _, err := resolve(doc, brief(t), bad); err == nil {
			t.Errorf("%q must not resolve", bad)
		}
	}
}

func TestSetAndApplyDrafts(t *testing.T) {
	doc := targetDoc()
	k := brief(t)
	f, _ := resolve(doc, k, "/boards/board/order")
	for _, bad := range []string{`["a","b"]`, `["a","a","b"]`, `["a","b","z"]`, `"x"`} {
		if err := f.set(bad); err == nil {
			t.Errorf("order %s must be refused", bad)
		}
	}
	facets, _ := resolve(doc, k, "/items/a/facets")
	for _, bad := range []string{`["Detail","detail"]`, `["Budget"]`, `[""]`, `"Detail"`} {
		if err := facets.set(bad); err == nil {
			t.Errorf("facet list %s must be refused", bad)
		}
	}
	evidence, _ := k.FacetRule("Evidence")
	drafts := []store.Draft{
		{Target: "/boards/board/order", Base: `["a","b","c"]`, Value: `["c","a","b"]`},
		{Target: "/items/a/facets", Base: `["Detail","So what"]`, Value: `["Detail","Evidence"]`},
		{Target: "/items/a/facets/evidence/markdown", Base: jsonText(evidence.Hint), Value: `"Bench logs, 14 runs."`},
		{Target: "/items/a/title", Base: `"A"`, Value: `"A2"`},
		{Target: "/items/b/title", Base: `"stale"`, Value: `"B2"`},
		{Target: "/items/gone/title", Base: `"G"`, Value: `"G2"`},
		{Target: "/meta/theme/accent", Base: `""`, Value: `"#2563EB"`},
	}
	applied, conflicts := applyDrafts(doc, k, drafts)
	if strings.Join(applied, ",") != "/boards/board/order,/items/a/facets,/items/a/facets/evidence/markdown,/items/a/title,/meta/theme/accent" || strings.Join(conflicts, ",") != "/items/b/title,/items/gone/title" {
		t.Errorf("applied %v conflicts %v", applied, conflicts)
	}
	items := doc.Sections[1].Board.Items
	if items[0].ID != "c" || items[1].Title != "A2" || items[2].Title != "B" {
		t.Errorf("board after drafts: %+v", items)
	}
	got, _ := json.Marshal(items[1].Facets)
	if string(got) != `[{"label":"Detail","markdown":"da"},{"label":"Evidence","markdown":"Bench logs, 14 runs."}]` {
		t.Errorf("a facet list keeps kept facets' text and adds new ones, which drafts then fill: %s", got)
	}
	if doc.Meta.Theme == nil || doc.Meta.Theme.Accent != "#2563eb" {
		t.Errorf("accent: %+v", doc.Meta.Theme)
	}
	clear, _ := resolve(doc, k, "/meta/theme/accent")
	if err := clear.set(`""`); err != nil || doc.Meta.Theme != nil {
		t.Errorf("an empty accent removes the theme: %v %+v", err, doc.Meta.Theme)
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
