package schema

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExampleValidates(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "dossier-0-7-brainstorm.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	problems, err := CheckModel(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Errorf("example has schema problems: %v", problems)
	}
}

func TestRejectsUnknownAndBadValues(t *testing.T) {
	problems, err := CheckModel([]byte(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"Bad Slug","extra":1},"sections":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, p := range problems {
		joined += p.String() + "\n"
	}
	for _, want := range []string{"/meta/slug", "/meta", "/sections"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected a problem at %s, got:\n%s", want, joined)
		}
	}
	if _, err := CheckModel([]byte(`not json`)); err == nil {
		t.Error("non-JSON must be an error")
	}
}

func TestMediaPartsValidate(t *testing.T) {
	doc := `{"dossier":"1.0","kind":"brief","meta":{"title":"T","slug":"t"},"sections":[{"id":"s","title":"S","parts":[
		{"type":"figure","src":"a.png","alt":"A","caption":"Cap"},
		{"type":"diagram","source":"digraph {}","format":"dot"},
		{"type":"chart","variant":"bar","data":[{"label":"Q1","value":1.5}]},
		{"type":"code","lang":"go","code":"package x","title":"x.go"}]}]}`
	problems, err := CheckModel([]byte(doc))
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Errorf("media parts have schema problems: %v", problems)
	}
	problems, err = CheckModel([]byte(`{"dossier":"1.0","kind":"brief","meta":{"title":"T","slug":"t"},"sections":[{"id":"s","title":"S","parts":[{"type":"chart","variant":"pie","data":[{"label":"a","value":"1"}]}]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) < 2 {
		t.Errorf("expected variant and value problems, got %v", problems)
	}
}
