package load

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/model"
)

func TestFileReportsFindingsWarningsAndUpgrades(t *testing.T) {
	doc, problems, err := File(filepath.Join("..", "..", "examples", "winter-crossing.dossier.json"))
	if err != nil || len(problems) > 0 {
		t.Fatalf("brainstorm: %v %v", err, problems)
	}
	if doc.Upgraded || doc.Kind.ID != "brainstorm" {
		t.Errorf("brainstorm: upgraded=%v kind=%s", doc.Upgraded, doc.Kind.ID)
	}

	legacy, problems, err := File(filepath.Join("..", "..", "testdata", "legacy", "sample.dossier.json"))
	if err != nil || len(problems) > 0 {
		t.Fatalf("legacy: %v %v", err, problems)
	}
	if !legacy.Upgraded || len(legacy.Warnings) == 0 {
		t.Errorf("legacy: upgraded=%v warnings=%d", legacy.Upgraded, len(legacy.Warnings))
	}
	for _, w := range legacy.Warnings {
		if strings.Contains(w.Message, "keep facets under") {
			t.Errorf("conciseness advice must not run on an upgraded document: %s", w)
		}
		if !strings.HasPrefix(w.Path, filepath.Join("..", "..", "testdata", "legacy", "sample.dossier.json")+"#/") {
			t.Errorf("warning path is not prefixed: %s", w.Path)
		}
	}

	_, problems, err = Bytes("bad.json", []byte(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"t"},"sections":[]}`))
	if err != nil || len(problems) == 0 || !strings.HasPrefix(problems[0].Path, "bad.json#/") {
		t.Errorf("findings: %v %v", err, problems)
	}
	if _, _, err := Bytes("x.json", []byte("not json")); err == nil {
		t.Error("non-JSON must be an error")
	}
	if _, _, err := File(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Error("a missing file must be an error")
	}
}

func TestWriteModelIsAtomicAndKeepsMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.dossier.json")
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	doc := &model.Document{Dossier: model.Version, Kind: "brief", Meta: model.Meta{Title: "T", Slug: "t"}, Sections: []model.Section{{ID: "a", Title: "A", Parts: []model.Part{{Type: "prose", Markdown: "x"}}}}}
	if _, problems, err := Check(path, doc); err != nil || len(problems) > 0 {
		t.Fatalf("check: %v %v", err, problems)
	}
	if err := WriteModel(path, doc); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("mode changed to %v", info.Mode().Perm())
	}
	back, problems, err := File(path)
	if err != nil || len(problems) > 0 || back.Doc.Meta.Title != "T" {
		t.Errorf("read back: %v %v", err, problems)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("temporary files left behind: %v", entries)
	}
}

func TestAccentTooLightForTextIsAWarning(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "winter-crossing.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	withAccent := func(accent string) []byte {
		return []byte(strings.Replace(string(data), `"status": "for-decision"`, `"status": "for-decision", "theme": {"accent": "`+accent+`"}`, 1))
	}
	doc, problems, err := Bytes("yellow.json", withAccent("#ffd400"))
	if err != nil || len(problems) > 0 {
		t.Fatalf("%v %v", err, problems)
	}
	found := false
	for _, w := range doc.Warnings {
		found = found || (w.Path == "yellow.json#/meta/theme/accent" && strings.Contains(w.Message, "too light to read"))
	}
	if !found {
		t.Errorf("warnings: %v", doc.Warnings)
	}
	if _, problems, _ := Bytes("bad.json", withAccent("yellow")); len(problems) == 0 {
		t.Error("an accent that is not #rrggbb is a finding")
	}
}
