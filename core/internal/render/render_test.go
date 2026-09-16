package render

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/kinds"
	"dossier/internal/model"
)

func loadExample(t *testing.T, name string) (*model.Document, kinds.Kind) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", name))
	if err != nil {
		t.Fatal(err)
	}
	doc, err := model.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if problems := model.Check(doc); len(problems) > 0 {
		t.Fatalf("structure problems: %v", problems)
	}
	kind, err := kinds.Load(doc.Kind)
	if err != nil {
		t.Fatal(err)
	}
	if problems := kind.Check(doc); len(problems) > 0 {
		t.Fatalf("kind problems: %v", problems)
	}
	return doc, kind
}

func TestBudgets(t *testing.T) {
	css, js := AssetSizes()
	if css > MaxStyleBytes {
		t.Errorf("stylesheet is %d bytes, budget %d", css, MaxStyleBytes)
	}
	if js > MaxReaderBytes {
		t.Errorf("reader runtime is %d bytes, budget %d", js, MaxReaderBytes)
	}
}

func TestRenderBrainstorm(t *testing.T) {
	doc, kind := loadExample(t, "dossier-0-7-brainstorm.dossier.json")
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	if !strings.HasPrefix(strings.ToLower(out), "<!doctype html>") {
		t.Errorf("artifact must start with a doctype")
	}
	for _, want := range []string{
		`<title>Twelve moves toward a leaner Dossier</title>`,
		`<h1>Twelve moves toward a <em>leaner</em> Dossier</h1>`,
		`id="dossier-model"`,
		`<li class="group">Minor</li>`,
		`<li class="group">Major</li>`,
		`data-item="shell-reset" data-num="1"`,
		`data-item="skill-rewrite" data-num="12"`,
		`class="facet risk"`,
		`<span class="chip minor">minor</span>`,
		`aria-label="Impact 5 of 5"`,
		`class="pick"`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output lacks %q", want)
		}
	}
	for _, forbidden := range []string{"http://", "https://cdn", "<script src="} {
		if strings.Contains(out, forbidden) {
			t.Errorf("artifact must not reference external resources, found %q", forbidden)
		}
	}
	if strings.Count(out, `<article class="item"`) != 12 {
		t.Errorf("expected 12 item articles, got %d", strings.Count(out, `<article class="item"`))
	}
	if strings.Count(out, `class="part rows"`) != 1 {
		t.Errorf("expected one rows board")
	}
	if len(html) > 120<<10 {
		t.Errorf("artifact is %d bytes, over the 120 KB typical budget", len(html))
	}
}

func TestRenderIsDeterministic(t *testing.T) {
	doc, kind := loadExample(t, "dossier-0-7-brainstorm.dossier.json")
	a, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Error("two renders of the same model differ")
	}
}

func TestGolden(t *testing.T) {
	doc, kind := loadExample(t, "dossier-0-7-brainstorm.dossier.json")
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	golden := filepath.Join("..", "..", "testdata", "dossier-0-7-brainstorm.html")
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile(golden, html, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Skipf("no golden yet: %v (run with UPDATE_GOLDEN=1)", err)
	}
	if !bytes.Equal(html, want) {
		t.Errorf("output differs from golden; run with UPDATE_GOLDEN=1 after reviewing the change")
	}
}

func TestEmbedJSONEscapesScriptClose(t *testing.T) {
	doc := &model.Document{Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "x </script><b>", Slug: "x"}}
	s, err := embedJSON(doc)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(s, "</script") || strings.Contains(s, "<b>") {
		t.Errorf("embedded JSON must escape HTML: %s", s)
	}
}

func TestInlineStripsParagraph(t *testing.T) {
	h, err := inline("a **b** c")
	if err != nil {
		t.Fatal(err)
	}
	if h != "a <strong>b</strong> c" {
		t.Errorf("got %q", h)
	}
}
