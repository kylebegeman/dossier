package model

import (
	"strings"
	"testing"
)

const minimal = `{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"t"},"sections":[{"id":"a","title":"A","parts":[{"type":"prose","markdown":"hi"}]}]}`

func TestDecodeStrict(t *testing.T) {
	if _, err := Decode(strings.NewReader(minimal)); err != nil {
		t.Fatal(err)
	}
	if _, err := Decode(strings.NewReader(`{"dossier":"1.0","kind":"x","meta":{"title":"T","slug":"t","bogus":1},"sections":[]}`)); err == nil || !strings.Contains(err.Error(), "bogus") {
		t.Errorf("unknown field must be rejected, got %v", err)
	}
	if _, err := Decode(strings.NewReader(minimal + " {}")); err == nil {
		t.Error("trailing data must be rejected")
	}
}

func TestCheck(t *testing.T) {
	doc, err := Decode(strings.NewReader(minimal))
	if err != nil {
		t.Fatal(err)
	}
	if p := Check(doc); len(p) > 0 {
		t.Errorf("minimal document has problems: %v", p)
	}
	doc.Sections = append(doc.Sections, Section{ID: "a", Title: "Dup", Board: &Board{Items: []Item{{ID: "i", Title: "I", DependsOn: []string{"missing", "i"}}}}})
	p := Check(doc)
	var msgs []string
	for _, x := range p {
		msgs = append(msgs, x.String())
	}
	joined := strings.Join(msgs, "\n")
	for _, want := range []string{"duplicates", "unknown item", "refers to itself"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected a problem containing %q, got:\n%s", want, joined)
		}
	}
}

func TestCheckParts(t *testing.T) {
	doc := &Document{Dossier: "1.0", Kind: "k", Meta: Meta{Title: "T", Slug: "t"}, Sections: []Section{{ID: "s", Title: "S", Parts: []Part{
		{Type: "table", Columns: []string{"a", "b"}, Rows: [][]string{{"1"}}},
		{Type: "callout", Markdown: "x", Tone: "loud"},
		{Type: "mystery"},
	}}}}
	p := Check(doc)
	if len(p) != 3 {
		t.Errorf("expected 3 part problems, got %v", p)
	}
}
