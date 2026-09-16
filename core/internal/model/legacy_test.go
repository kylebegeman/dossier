package model_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/load"
	"dossier/internal/model"
	"dossier/internal/schema"
)

// TestLegacyFixtures upgrades every 0.6 fixture, compares the result to its
// golden, and checks that the upgraded model passes structure and kind rules.
func TestLegacyFixtures(t *testing.T) {
	dir := filepath.Join("..", "..", "testdata", "legacy")
	sources, err := filepath.Glob(filepath.Join(dir, "*.dossier.json"))
	if err != nil || len(sources) == 0 {
		t.Fatalf("no legacy fixtures: %v", err)
	}
	for _, src := range sources {
		name := strings.TrimSuffix(filepath.Base(src), ".dossier.json")
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(src)
			if err != nil {
				t.Fatal(err)
			}
			out, warnings, upgraded, err := model.Normalize(data)
			if err != nil {
				t.Fatal(err)
			}
			if !upgraded {
				t.Fatal("fixture was not recognised as 0.6")
			}
			if problems, err := schema.CheckModel(out); err != nil || len(problems) > 0 {
				t.Fatalf("upgraded model fails the schema: %v %v", err, problems)
			}
			doc, err := model.Decode(bytes.NewReader(out))
			if err != nil {
				t.Fatalf("upgraded model does not decode: %v", err)
			}
			if p := model.Check(doc); len(p) > 0 {
				t.Errorf("structure problems: %v", p)
			}
			// Read as a 0.6 import, the document must build: problems with the
			// kind's vocabulary are warnings until the import maps onto it.
			if _, problems, err := load.Bytes(name, data); err != nil || len(problems) > 0 {
				t.Errorf("0.6 import must build: %v %v", err, problems)
			}
			for _, w := range warnings {
				if strings.Contains(w.Message, "unknown 0.6 block") || strings.Contains(w.Message, "block inside an item is dropped") || strings.Contains(w.Message, "has no content") {
					t.Errorf("unexpected drop: %s", w)
				}
			}
			golden := filepath.Join(dir, name+".upgraded.json")
			if os.Getenv("UPDATE_GOLDEN") != "" {
				if err := os.WriteFile(golden, out, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Skipf("no golden yet: %v (run with UPDATE_GOLDEN=1)", err)
			}
			if !bytes.Equal(out, want) {
				t.Errorf("upgraded model differs from golden; run with UPDATE_GOLDEN=1 after reviewing the change")
			}
		})
	}
}
