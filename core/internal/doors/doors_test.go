package doors

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/decisions"
)

func copyExample(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "dossier-0-7-brainstorm.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "moves.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func run(t *testing.T, args ...string) (Envelope, int) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := Run(context.Background(), append(args, "--json"), strings.NewReader(""), &stdout, &stderr)
	var env Envelope
	if err := json.Unmarshal(stdout.Bytes(), &env); err != nil {
		t.Fatalf("envelope is not JSON: %v\nstdout: %s\nstderr: %s", err, stdout.String(), stderr.String())
	}
	return env, code
}

func TestDecisionsRoundTrip(t *testing.T) {
	model := copyExample(t)
	dir := filepath.Dir(model)

	// Apply a reply line: the model gains decisions and a decisions document is written.
	env, code := run(t, "decisions", "apply", model, "--reply", "rebuild, 1, 3. Notes: 3: keep the blue accent.", "--decisions", filepath.Join(dir, "moves.decisions.md"))
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("apply failed: %d %+v", code, env)
	}
	md, err := os.ReadFile(filepath.Join(dir, "moves.decisions.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(md), "Reply: rebuild, 1, 3. Notes: 3: keep the blue accent.") {
		t.Errorf("decisions document lacks the reply line:\n%s", md)
	}

	// Build the decided model: the artifact starts with the picks applied.
	env, code = run(t, "build", model, "--out", dir)
	if code != 0 {
		t.Fatalf("build failed: %+v", env)
	}
	html, err := os.ReadFile(filepath.Join(dir, "dossier-0-7-brainstorm.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`class="item picked" id="shell-reset"`, `class="item picked" id="type-tokens"`, `keep the blue accent`} {
		if !strings.Contains(string(html), want) {
			t.Errorf("built artifact lacks %q", want)
		}
	}
	if tag := inputTag(string(html), `data-pick-row="shell-reset"`); !strings.Contains(tag, " checked") {
		t.Errorf("summary checkbox for a picked item is not checked: %s", tag)
	}
	if tag := inputTag(string(html), `data-pick-row="left-contents"`); strings.Contains(tag, " checked") {
		t.Errorf("summary checkbox for an unpicked item is checked: %s", tag)
	}

	// Read the decisions back from the model.
	env, code = run(t, "decisions", "read", model)
	if code != 0 {
		t.Fatalf("read failed: %+v", env)
	}
	raw, _ := json.Marshal(env.Result)
	var result struct {
		Decisions decisions.Document `json:"decisions"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if result.Decisions.Path != "rebuild" || strings.Join(result.Decisions.Picked, ",") != "shell-reset,type-tokens" || result.Decisions.Notes["type-tokens"] != "keep the blue accent" {
		t.Errorf("read back %+v", result.Decisions)
	}

	// Apply the written document to a fresh copy: same result.
	fresh := copyExample(t)
	env, code = run(t, "decisions", "apply", fresh, "--from", filepath.Join(dir, "moves.decisions.md"))
	if code != 0 {
		t.Fatalf("apply from file failed: %+v", env)
	}
	env, _ = run(t, "decisions", "read", fresh)
	raw, _ = json.Marshal(env.Result)
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if result.Decisions.Reply != "rebuild, 1, 3. Notes: 3: keep the blue accent." {
		t.Errorf("reply after file apply: %q", result.Decisions.Reply)
	}
}

func TestDecisionsApplyRejectsBadReply(t *testing.T) {
	model := copyExample(t)
	env, code := run(t, "decisions", "apply", model, "--reply", "1, 40")
	if code != 1 || env.Outcome != OutcomeError {
		t.Errorf("expected an error for an out of range item, got %d %+v", code, env)
	}
	env, code = run(t, "decisions", "apply", model, "--from", filepath.Join(t.TempDir(), "missing.md"), "--reply", "1")
	if code != 1 || env.Error == nil || env.Error.Code != "usage" {
		t.Errorf("expected a usage error for both flags, got %d %+v", code, env)
	}
}

func TestValidateAndDescribe(t *testing.T) {
	env, code := run(t, "validate", copyExample(t))
	if code != 0 || env.Outcome != OutcomeOK {
		t.Errorf("validate: %d %+v", code, env)
	}
	env, code = run(t, "describe")
	if code != 0 || env.Outcome != OutcomeOK {
		t.Errorf("describe: %d %+v", code, env)
	}
	if _, code := run(t, "validate"); code != 1 {
		t.Errorf("validate without files should be a usage error, got %d", code)
	}
}

// inputTag returns the element containing marker, up to its closing bracket.
func inputTag(html, marker string) string {
	i := strings.Index(html, marker)
	if i < 0 {
		return ""
	}
	start := strings.LastIndex(html[:i], "<")
	end := strings.Index(html[i:], ">")
	if start < 0 || end < 0 {
		return ""
	}
	return html[start : i+end+1]
}

func TestBuildLegacyDocument(t *testing.T) {
	src := filepath.Join("..", "..", "testdata", "legacy", "release-0-6-7.dossier.json")
	dir := t.TempDir()
	env, code := run(t, "build", src, "--out", dir)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("legacy build: %d %+v", code, env)
	}
	if len(env.Warnings) == 0 || !strings.Contains(env.Warnings[0].Path, "#/dossierVersion") {
		t.Errorf("expected the upgrade warning first, got %+v", env.Warnings)
	}
	html, err := os.ReadFile(filepath.Join(dir, "release-0-6-7.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`<title>Release 0.6.7 Evidence</title>`, `id="release-gates"`, `<details class="row" id="npm-test">`, `<dt>Status</dt>`} {
		if !strings.Contains(string(html), want) {
			t.Errorf("legacy artifact lacks %q", want)
		}
	}
	env, code = run(t, "validate", src)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Errorf("legacy validate: %d %+v", code, env)
	}
}
