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
