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

func TestCheckMediaParts(t *testing.T) {
	good := &Document{Dossier: "1.0", Kind: "k", Meta: Meta{Title: "T", Slug: "t"}, Sections: []Section{{ID: "s", Title: "S", Parts: []Part{
		{Type: "figure", Src: "images/flow.png", Alt: "Flow", Caption: "The flow."},
		{Type: "figure", Src: "data:image/svg+xml,%3Csvg%3E"},
		{Type: "figure", Src: "https://example.test/a.png"},
		{Type: "diagram", Source: "digraph { a -> b }"},
		{Type: "diagram", Source: "flowchart LR", Format: "mermaid"},
		{Type: "chart", Data: []Point{{Label: "Q1", Value: 1}}},
		{Type: "chart", Variant: "area", Data: []Point{{Label: "Q1", Value: 1}, {Label: "Q2", Value: -2.5}}},
	}}}}
	if p := Check(good); len(p) > 0 {
		t.Errorf("media parts have problems: %v", p)
	}
	bad := &Document{Dossier: "1.0", Kind: "k", Meta: Meta{Title: "T", Slug: "t"}, Sections: []Section{{ID: "s", Title: "S", Parts: []Part{
		{Type: "figure"},
		{Type: "figure", Src: "javascript:alert(1)"},
		{Type: "figure", Src: "data:text/html,hi"},
		{Type: "diagram", Format: "dot"},
		{Type: "diagram", Source: "x", Format: "plantuml"},
		{Type: "chart"},
		{Type: "chart", Variant: "pie", Data: []Point{{Label: "", Value: 1}}},
	}}}}
	p := Check(bad)
	if len(p) != 8 {
		t.Errorf("expected 8 media part problems, got %d: %v", len(p), p)
	}
}

func TestCheckTimeline(t *testing.T) {
	doc := func(p Part) *Document {
		return &Document{Dossier: "1.0", Kind: "incident", Meta: Meta{Title: "T", Slug: "t"}, Sections: []Section{{ID: "s", Title: "S", Parts: []Part{p}}}}
	}
	if p := Check(doc(Part{Type: "timeline", Events: []Event{{At: "07:40", Title: "Doors close", Tone: "risk"}}})); len(p) > 0 {
		t.Errorf("a valid timeline: %v", p)
	}
	got := Check(doc(Part{Type: "timeline", Events: []Event{{At: "", Title: "No time"}, {At: "08:00", Title: "Loud", Tone: "red"}}}))
	var lines []string
	for _, p := range got {
		lines = append(lines, p.String())
	}
	want := "/sections/0/parts/0/events/0: at and title are required\n/sections/0/parts/0/events/1/tone: must be one of teal, violet, risk, neutral"
	if strings.Join(lines, "\n") != want {
		t.Errorf("got:\n%s", strings.Join(lines, "\n"))
	}
	if p := Check(doc(Part{Type: "timeline"})); len(p) != 1 {
		t.Errorf("a timeline needs events: %v", p)
	}
}
