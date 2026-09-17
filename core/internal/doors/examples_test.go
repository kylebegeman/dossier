package doors

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"dossier/internal/decisions"
	"dossier/internal/model"
)

// maxArtifactBytes is the typical budget for one built page, figures and
// diagrams included.
const maxArtifactBytes = 120_000

// TestExamples builds the showcase in examples/ the way a reader gets it,
// with figures inlined and diagrams laid out, and holds every document to the
// same bar: no findings or warnings, under the artifact budget, and identical
// to its HTML and Markdown goldens in testdata/examples. Together the
// documents must cover every built-in kind.
func TestExamples(t *testing.T) {
	models, err := filepath.Glob(filepath.Join("..", "..", "examples", "*.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(models)
	out := t.TempDir()
	env, code := run(t, append(append([]string{"build"}, models...), "--md", "--out", out)...)
	if code != 0 || len(env.Warnings) > 0 {
		t.Fatalf("the showcase builds without findings or warnings: %d %+v", code, env)
	}
	raw, _ := json.Marshal(env.Result)
	var result BuildResult
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Outputs) != len(models) {
		t.Fatalf("outputs: %+v", result.Outputs)
	}
	kinds := map[string]bool{}
	for _, m := range models {
		doc := readModel(t, m)
		kinds[doc.Kind] = true
	}
	for _, want := range []string{"brainstorm", "plan", "review", "release", "incident", "brief"} {
		if !kinds[want] {
			t.Errorf("no showcase document is a %s", want)
		}
	}
	update := os.Getenv("UPDATE_GOLDEN") != ""
	goldens := filepath.Join("..", "..", "testdata", "examples")
	for _, o := range result.Outputs {
		if o.Bytes > maxArtifactBytes {
			t.Errorf("%s is %d bytes, over the %d byte budget", o.HTML, o.Bytes, maxArtifactBytes)
		}
		for _, path := range []string{o.HTML, o.Markdown} {
			got, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			golden := filepath.Join(goldens, filepath.Base(path))
			if update {
				if err := os.MkdirAll(goldens, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(golden, got, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatalf("no golden for %s: %v (review the output, then run with UPDATE_GOLDEN=1)", filepath.Base(path), err)
			}
			if !bytes.Equal(got, want) {
				t.Errorf("%s differs from its golden; review the change, then run with UPDATE_GOLDEN=1", filepath.Base(path))
			}
		}
	}
	if entries, _ := os.ReadDir(goldens); len(entries) != 2*len(models) {
		t.Errorf("testdata/examples holds %d files for %d documents; remove goldens of documents that are gone", len(entries), len(models))
	}
}

// TestExampleReplies pastes a reader's reply into a copy of each decision
// document and checks the reply reads back in canonical form and the decided
// model still validates without warnings.
func TestExampleReplies(t *testing.T) {
	for name, c := range map[string]struct{ reply, want string }{
		"booking-service":          {"safety, 10, 2, 3. Notes: 10: start with the payment screen.", "safety, 2, 3, 10. Notes: 10: start with the payment screen."},
		"spring-fixes":             {"5, 1, 2", "1, 2, 5."},
		"offline-boarding-passes":  {"go 1-4; revise 5; skip 7. Notes: 5: queue on the SD card.", "go 1, 2, 3, 4; revise 5; skip 7. Notes: 5: queue on the SD card."},
		"tide-aware-cancellations": {"rework, 1-3; later 4, 5; skip 6", "rework, fix 1, 2, 3; later 4, 5; skip 6."},
		"release-3-4-0":            {"ship, waive 1; rerun 2, 3. Notes: 1: the two Android 10 handhelds stay on online checks.", "ship, waive 1; rerun 2, 3. Notes: 1: the two Android 10 handhelds stay on online checks."},
		"car-deck-double-booking":  {"do 1, 3, 5, 6; later 4; skip 2", "do 1, 3, 5, 6; later 4; skip 2."},
	} {
		data, err := os.ReadFile(filepath.Join("..", "..", "examples", name+".dossier.json"))
		if err != nil {
			t.Fatal(err)
		}
		dir := t.TempDir()
		path := filepath.Join(dir, name+".dossier.json")
		if err := os.WriteFile(path, data, 0o644); err != nil {
			t.Fatal(err)
		}
		env, code := run(t, "decisions", "apply", path, "--reply", c.reply)
		if code != 0 || len(env.Warnings) > 0 {
			t.Errorf("%s: apply %q: %d %+v", name, c.reply, code, env)
			continue
		}
		env, _ = run(t, "decisions", "read", path)
		raw, _ := json.Marshal(env.Result)
		var result struct {
			Decisions decisions.Document `json:"decisions"`
		}
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
		if result.Decisions.Reply != c.want {
			t.Errorf("%s: reply reads back as %q, want %q", name, result.Decisions.Reply, c.want)
		}
		if env, code := run(t, "validate", path); code != 0 || len(env.Warnings) > 0 {
			t.Errorf("%s: the decided model validates cleanly: %+v", name, env)
		}
	}

	// Shipping over the failed required gate without waiving it is allowed
	// but warned about.
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "release-3-4-0.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "release.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	env, code := run(t, "decisions", "apply", path, "--reply", "ship, rerun 2, 3")
	if code != 0 || len(env.Warnings) != 1 || !strings.Contains(env.Warnings[0].Message, "Android end-to-end suite") {
		t.Errorf("shipping over an unwaived failed required gate warns and names it: %d %+v", code, env.Warnings)
	}
}

func readModel(t *testing.T, path string) *model.Document {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	doc, err := model.Decode(f)
	if err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	return doc
}
