package doors

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	// The developer's own kind directories must not leak into the tests.
	_ = os.Unsetenv(KindsEnv)
	os.Exit(m.Run())
}

// kindsDir copies the retro example kind into a fresh directory.
func kindsDir(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "kinds", "retro.kind.json"))
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(t.TempDir(), "kinds")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "retro.kind.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestCustomKindsWorkThroughEveryDoor(t *testing.T) {
	dir := kindsDir(t)
	out := t.TempDir()

	env, _ := run(t, "describe", "--kinds", dir)
	result, _ := env.Result.(map[string]any)
	sources := map[string]string{}
	for _, k := range result["kinds"].([]any) {
		k := k.(map[string]any)
		sources[k["id"].(string)] = k["source"].(string)
	}
	if sources["retro"] != filepath.Join(dir, "retro.kind.json") || sources["brief"] != "built-in" {
		t.Errorf("describe sources: %v", sources)
	}

	if env, code := run(t, "init", "retro", "--title", "Sprint 14 retro", "--out", out, "--kinds="+dir); code != 0 {
		t.Fatalf("init with a custom kind: %+v", env)
	}
	model := filepath.Join(out, "sprint-14-retro.dossier.json")
	if env, code := run(t, "validate", model, "--kinds", dir); code != 0 {
		t.Errorf("validate: %+v", env)
	}
	if env, code := run(t, "build", model, "--kinds", dir); code != 0 {
		t.Errorf("build: %+v", env)
	}
	html, err := os.ReadFile(filepath.Join(out, "sprint-14-retro.html"))
	if err != nil || !strings.Contains(string(html), "What we saw") {
		t.Errorf("the artifact uses the custom vocabulary: %v", err)
	}

	env, code := run(t, "validate", model)
	if code != 2 || len(env.Findings) == 0 || !strings.Contains(env.Findings[0].Message, `unknown kind "retro"`) {
		t.Errorf("without the directory the kind is unknown: %d %+v", code, env.Findings)
	}
	t.Setenv(KindsEnv, dir)
	if env, code := run(t, "validate", model); code != 0 {
		t.Errorf("%s names the directory too: %+v", KindsEnv, env)
	}
	t.Setenv(KindsEnv, "")

	if err := os.WriteFile(filepath.Join(dir, "brief.kind.json"), []byte(`{"id":"brief"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	env, code = run(t, "validate", model, "--kinds", dir)
	if code != 2 || !strings.Contains(findingText(env), "brief.kind.json#") {
		t.Errorf("a broken kind file is a finding before anything else: %d %s", code, findingText(env))
	}
	if env, code := run(t, "describe", "--kinds", filepath.Join(dir, "missing")); code != 1 || env.Error == nil || env.Error.Code != "kinds" {
		t.Errorf("a missing directory is an error: %+v", env)
	}
	if env, code := run(t, "describe", "--kinds"); code != 1 || env.Error == nil || env.Error.Code != "usage" {
		t.Errorf("--kinds needs a directory: %+v", env)
	}
}

func findingText(env Envelope) string {
	var b strings.Builder
	for _, f := range env.Findings {
		b.WriteString(f.Path + ": " + f.Message + "\n")
	}
	return b.String()
}
