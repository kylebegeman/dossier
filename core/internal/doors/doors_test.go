package doors

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"dossier/internal/decisions"
	"dossier/internal/schema"
)

// copyExample copies the flagship model and its figure into a fresh
// directory, so builds there are clean.
func copyExample(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "winter-crossing.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "moves.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	figure, err := os.ReadFile(filepath.Join("..", "..", "examples", "assets", "wenlow-routes.svg"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "wenlow-routes.svg"), figure, 0o644); err != nil {
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
	if problems, err := schema.CheckEnvelope(stdout.Bytes()); err != nil || len(problems) > 0 {
		t.Errorf("%v: envelope violates dossier.result/v1: %v %v", args, err, problems)
	}
	if code != env.ExitCode() {
		t.Errorf("%v: exit code %d does not match outcome %s", args, code, env.Outcome)
	}
	return env, code
}

func TestDecisionsRoundTrip(t *testing.T) {
	model := copyExample(t)
	dir := filepath.Dir(model)

	// Apply a reply line: the model gains decisions and a decisions document is written.
	env, code := run(t, "decisions", "apply", model, "--reply", "storms, 1, 3. Notes: 3: keep the blue accent.", "--decisions", filepath.Join(dir, "moves.decisions.md"))
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("apply failed: %d %+v", code, env)
	}
	md, err := os.ReadFile(filepath.Join(dir, "moves.decisions.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(md), "Reply: storms, 1, 3. Notes: 3: keep the blue accent.") {
		t.Errorf("decisions document lacks the reply line:\n%s", md)
	}

	// Build the decided model: the artifact starts with the picks applied.
	env, code = run(t, "build", model, "--out", dir)
	if code != 0 {
		t.Fatalf("build failed: %+v", env)
	}
	html, err := os.ReadFile(filepath.Join(dir, "winter-crossing.html"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`class="item picked" id="storm-rebook"`, `class="item picked" id="car-waitlist"`, `keep the blue accent`} {
		if !strings.Contains(string(html), want) {
			t.Errorf("built artifact lacks %q", want)
		}
	}
	if tag := inputTag(string(html), `data-pick-row="storm-rebook"`); !strings.Contains(tag, " checked") {
		t.Errorf("summary checkbox for a picked item is not checked: %s", tag)
	}
	if tag := inputTag(string(html), `data-pick-row="plain-notices"`); strings.Contains(tag, " checked") {
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
	if result.Decisions.Path != "storms" || strings.Join(result.Decisions.Picked, ",") != "storm-rebook,car-waitlist" || result.Decisions.Notes["car-waitlist"] != "keep the blue accent" {
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
	if result.Decisions.Reply != "storms, 1, 3. Notes: 3: keep the blue accent." {
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
	for _, want := range []string{`<title>Release 0.6.7 Evidence</title>`, `id="release-gates"`, `<details class="item" id="npm-test" data-item="npm-test"`, `<dt>How checked</dt>`, `<b>0.6.7</b> <span>version</span>`} {
		if !strings.Contains(string(html), want) {
			t.Errorf("legacy artifact lacks %q", want)
		}
	}
	env, code = run(t, "validate", src)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Errorf("legacy validate: %d %+v", code, env)
	}
}

func TestInitWritesAValidStarterForEveryKind(t *testing.T) {
	dir := t.TempDir()
	for _, kind := range []string{"brainstorm", "plan", "review", "release", "incident", "brief"} {
		env, code := run(t, "init", kind, "--out", dir, "--title", "Test "+kind)
		if code != 0 || env.Outcome != OutcomeOK {
			t.Fatalf("init %s: %d %+v", kind, code, env)
		}
		raw, _ := json.Marshal(env.Result)
		var result InitResult
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
		if result.Kind != kind || result.Slug != "test-"+kind || result.Model != filepath.Join(dir, "test-"+kind+".dossier.json") {
			t.Errorf("init result: %+v", result)
		}
		env, code = run(t, "validate", result.Model)
		if code != 0 || len(env.Warnings) != 0 {
			t.Errorf("starter for %s does not validate cleanly: %d %+v", kind, code, env)
		}
		env, code = run(t, "build", result.Model, "--out", dir)
		if code != 0 {
			t.Errorf("starter for %s does not build: %+v", kind, env)
		}
		if data, _ := os.ReadFile(result.Model); kind == "incident" && !strings.Contains(string(data), `"type": "timeline"`) {
			t.Error("the incident starter's timeline section holds a timeline part")
		}
	}
	env, code := run(t, "init", "brainstorm", "--out", dir, "--title", "Test brainstorm")
	if code != 1 || env.Error == nil || env.Error.Code != "exists" {
		t.Errorf("init must refuse to overwrite without --force: %d %+v", code, env)
	}
	if _, code := run(t, "init", "brainstorm", "--out", dir, "--title", "Test brainstorm", "--force"); code != 0 {
		t.Error("init --force must overwrite")
	}
	if env, code := run(t, "init", "nope"); code != 1 || env.Error == nil || !strings.Contains(env.Error.Message, "unknown kind") {
		t.Errorf("unknown kind: %d %+v", code, env)
	}
	if _, code := run(t, "init"); code != 1 {
		t.Error("init without a kind is a usage error")
	}
}

func TestCatalogPositionalsMatchParameters(t *testing.T) {
	c, err := LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	for _, cmd := range c.Commands {
		if _, ok := registry[cmd.ID]; !ok {
			t.Errorf("%s is in the catalog but has no door", cmd.ID)
		}
		var params struct {
			Properties map[string]json.RawMessage `json:"properties"`
		}
		if err := json.Unmarshal(cmd.Parameters, &params); err != nil {
			t.Fatal(err)
		}
		for _, p := range cmd.Positional {
			if _, ok := params.Properties[p]; !ok {
				t.Errorf("%s: positional %q is not a parameter", cmd.ID, p)
			}
		}
	}
	for id := range registry {
		found := false
		for _, cmd := range c.Commands {
			found = found || cmd.ID == id
		}
		if !found {
			t.Errorf("door %s is not in the catalog", id)
		}
	}
}

func TestDecisionsApplyRefusesToOverwriteALegacyFile(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "legacy", "implementation-packet.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	src := filepath.Join(dir, "packet.dossier.json")
	if err := os.WriteFile(src, data, 0o644); err != nil {
		t.Fatal(err)
	}
	env, code := run(t, "decisions", "apply", src, "--reply", "1")
	if code != 1 || env.Error == nil || env.Error.Code != "legacy" {
		t.Fatalf("in-place apply on a 0.6 file must be refused: %d %+v", code, env)
	}
	after, err := os.ReadFile(src)
	if err != nil || string(after) != string(data) {
		t.Error("the 0.6 source changed")
	}
	out := filepath.Join(dir, "packet-upgraded.dossier.json")
	env, code = run(t, "decisions", "apply", src, "--reply", "1", "--out", out)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("apply with --out: %d %+v", code, env)
	}
	if _, err := os.Stat(out); err != nil {
		t.Error(err)
	}
}

func TestUpgradeWritesOnlyStrictModels(t *testing.T) {
	dir := t.TempDir()
	copyLegacy := func(name string) string {
		data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "legacy", name))
		if err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	release := copyLegacy("release-0-6-7.dossier.json")
	showcase := copyLegacy("showcase.dossier.json")
	// A verdict gate whose option is also a release verdict cannot become the
	// document's choice, so this 0.6 document does not fit its kind.
	clash := filepath.Join(dir, "clash.dossier.json")
	clashDoc := `{"dossierVersion":"1.0","kind":"release","meta":{"title":"Clash","slug":"clash"},"blocks":[{"type":"verdict-gate","prompt":"Ship?","options":["waive","hold"]},{"type":"prose","markdown":"x"}]}`
	if err := os.WriteFile(clash, []byte(clashDoc), 0o644); err != nil {
		t.Fatal(err)
	}
	modern := copyExample(t)
	before, err := os.ReadFile(modern)
	if err != nil {
		t.Fatal(err)
	}

	env, code := run(t, "upgrade", release, modern)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("upgrade: %d %+v", code, env)
	}
	var result UpgradeResult
	if err := json.Unmarshal(mustJSON(env.Result), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 2 || !result.Files[0].Upgraded || result.Files[1].Upgraded {
		t.Errorf("result: %+v", result.Files)
	}
	if env, code := run(t, "validate", release); code != 0 {
		t.Errorf("the upgraded release must validate strictly: %+v", env)
	}
	if after, _ := os.ReadFile(modern); string(after) != string(before) {
		t.Error("a 0.7 model must be left untouched")
	}

	// The showcase uses every 0.6 block and still lands strictly on brief.
	if env, code := run(t, "upgrade", showcase); code != 0 {
		t.Errorf("the showcase upgrades strictly: %d %+v", code, env.Findings)
	}
	if env, code := run(t, "validate", showcase); code != 0 || len(env.Warnings) > 0 && strings.Contains(env.Warnings[0].Message, "0.6") {
		t.Errorf("the upgraded showcase is a 0.7 model: %+v", env)
	}

	// A 0.6 document that does not fit its kind is reported, not written.
	env, code = run(t, "upgrade", clash)
	if code != 2 || env.Outcome != OutcomeFindings || !strings.Contains(findingText(env), `"waive" is also a verdict of the release kind`) {
		t.Errorf("an upgrade that would not validate must be findings: %d %+v", code, env)
	}
	if after, _ := os.ReadFile(clash); string(after) != clashDoc {
		t.Error("a refused upgrade must not touch the source")
	}
}

func TestRenderAnswersWithHTML(t *testing.T) {
	model := copyExample(t)
	env, code := run(t, "render", model)
	if code != 0 {
		t.Fatalf("render: %+v", env)
	}
	var result RenderResult
	if err := json.Unmarshal(mustJSON(env.Result), &result); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(strings.ToLower(result.HTML), "<!doctype html>") || result.Bytes != len(result.HTML) || result.Slug != "winter-crossing" {
		t.Errorf("render result: slug=%s bytes=%d", result.Slug, result.Bytes)
	}
	data, err := os.ReadFile(model)
	if err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	code = Run(context.Background(), []string{"render", "-", "--base", filepath.Dir(model), "--json"}, bytes.NewReader(data), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("render from stdin: %d %s", code, stderr.String())
	}
	var fromStdin Envelope
	if err := json.Unmarshal(stdout.Bytes(), &fromStdin); err != nil {
		t.Fatal(err)
	}
	var stdinResult RenderResult
	if err := json.Unmarshal(mustJSON(fromStdin.Result), &stdinResult); err != nil {
		t.Fatal(err)
	}
	if stdinResult.Source != "stdin" || stdinResult.HTML != result.HTML {
		t.Error("stdin and file renders differ")
	}
	stdout.Reset()
	code = Run(context.Background(), []string{"render", "-"}, strings.NewReader(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"t"},"sections":[]}`), &stdout, &stderr)
	if code != 2 || stdout.Len() != 0 {
		t.Errorf("an invalid model must be findings with nothing on stdout: %d %q", code, stdout.String())
	}
}

// syncBuffer is a bytes.Buffer safe for a writer and a reader goroutine.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestServeDoorRunsUntilCanceled(t *testing.T) {
	model := copyExample(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var stdout bytes.Buffer
	stderr := &syncBuffer{}
	done := make(chan int, 1)
	go func() {
		done <- Run(ctx, []string{"serve", model, "--port", "0", "--json"}, strings.NewReader(""), &stdout, stderr)
	}()
	url := ""
	for deadline := time.Now().Add(10 * time.Second); url == "" && time.Now().Before(deadline); time.Sleep(20 * time.Millisecond) {
		if m := regexp.MustCompile(`http://127\.0\.0\.1:\d+/`).FindString(stderr.String()); m != "" {
			url = m
		}
	}
	if url == "" {
		cancel()
		t.Fatalf("serve printed no URL: %s", stderr.String())
	}
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != 200 {
		t.Errorf("studio page: %d", res.StatusCode)
	}
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("serve exit %d: %s", code, stderr.String())
		}
	case <-time.After(15 * time.Second):
		t.Fatal("serve did not stop")
	}
	var env Envelope
	if err := json.Unmarshal(stdout.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	var result ServeResult
	if err := json.Unmarshal(mustJSON(env.Result), &result); err != nil || result.URL != url || !strings.HasSuffix(result.Store, "moves.dossier.db") {
		t.Errorf("serve result: %+v %v", result, err)
	}
	if env, code := run(t, "serve", model, "--host", "0.0.0.0", "--port", "0"); code != 1 || env.Error == nil || !strings.Contains(env.Error.Message, "loopback") {
		t.Errorf("non-loopback host: %d %+v", code, env)
	}
	if _, code := run(t, "serve"); code != 1 {
		t.Error("serve without a model is a usage error")
	}
}

// TestTypesMatchTheReactPackage fails when the React package's generated model
// types drift from the schemas. Regenerate with make generate.
func TestTypesMatchTheReactPackage(t *testing.T) {
	want, err := TypeScript()
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join("..", "..", "..", "packages", "react", "src", "model.ts"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Error("packages/react/src/model.ts is stale; run make generate")
	}
	for _, must := range []string{"export interface DossierModel {", "export interface Part {", `outcome: "ok" | "findings" | "error";`, "[key: string]: unknown;"} {
		if !strings.Contains(string(want), must) {
			t.Errorf("types lack %q", must)
		}
	}
	path := filepath.Join(t.TempDir(), "model.ts")
	if env, code := run(t, "types", "--write", path); code != 0 || env.Outcome != OutcomeOK {
		t.Errorf("types --write: %d %+v", code, env)
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != string(want) {
		t.Errorf("written types differ: %v", err)
	}
}

func TestVerdictDecisionsForEveryVerdictKind(t *testing.T) {
	for kind, c := range map[string]struct{ reply, want string }{
		"plan":     {"go 1; revise 2. Notes: 2: split it.", "go 1; revise 2. Notes: 2: split it."},
		"review":   {"rework, 1; later 2", "rework, fix 1; later 2."},
		"incident": {"do all", "do all."},
		"release":  {"hold, rerun 1-2", "hold, rerun all."},
	} {
		dir := t.TempDir()
		if env, code := run(t, "init", kind, "--out", dir, "--title", "Starter"); code != 0 {
			t.Fatalf("%s init: %+v", kind, env)
		}
		model := filepath.Join(dir, "starter.dossier.json")
		env, code := run(t, "decisions", "apply", model, "--reply", c.reply, "--decisions", filepath.Join(dir, "starter.decisions.md"))
		if code != 0 {
			t.Errorf("%s apply: %+v %+v", kind, env, env.Error)
			continue
		}
		env, _ = run(t, "decisions", "read", model)
		raw, _ := json.Marshal(env.Result)
		var result struct {
			Decisions decisions.Document `json:"decisions"`
		}
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
		if result.Decisions.Reply != c.want || result.Decisions.Kind != kind || len(result.Decisions.Verdicts) == 0 || len(result.Decisions.Picked) != 0 {
			t.Errorf("%s read back %+v", kind, result.Decisions)
		}
		if env, code := run(t, "validate", model); code != 0 {
			t.Errorf("%s: the decided model validates: %+v", kind, env)
		}
		md, _ := os.ReadFile(filepath.Join(dir, "starter.decisions.md"))
		if !strings.Contains(string(md), "Reply: "+c.want) {
			t.Errorf("%s decisions document:\n%s", kind, md)
		}
	}
	dir := t.TempDir()
	run(t, "init", "brief", "--out", dir, "--title", "Starter")
	if env, code := run(t, "decisions", "read", filepath.Join(dir, "starter.dossier.json")); code != 1 || env.Error == nil || env.Error.Code != "nothing-to-decide" {
		t.Errorf("a brief has nothing to decide: %+v", env)
	}
	model := copyExample(t)
	env, code := run(t, "decisions", "apply", model, "--reply", "fix 1")
	if code != 1 || env.Error == nil || !strings.Contains(env.Error.Message, `unexpected word "fix"; write the choice (storms or midweeks), then numbers to pick`) {
		t.Errorf("a pick kind refuses verdicts and names the way forward: %+v", env.Error)
	}
}

func TestBuildAndRenderWriteMarkdown(t *testing.T) {
	model := copyExample(t)
	dir := t.TempDir()
	env, code := run(t, "build", model, "--md", "--out", dir)
	if code != 0 {
		t.Fatalf("build --md: %+v", env)
	}
	raw, _ := json.Marshal(env.Result)
	var result BuildResult
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, "winter-crossing.md")
	if len(result.Outputs) != 1 || result.Outputs[0].Markdown != want {
		t.Fatalf("outputs: %+v", result.Outputs)
	}
	md, err := os.ReadFile(want)
	if err != nil || !strings.HasPrefix(string(md), "# Ten moves for a calmer winter crossing\n") {
		t.Errorf("markdown file: %v", err)
	}
	env, code = run(t, "render", model, "--md")
	raw, _ = json.Marshal(env.Result)
	var rendered RenderResult
	if err := json.Unmarshal(raw, &rendered); err != nil {
		t.Fatal(err)
	}
	if code != 0 || rendered.HTML != "" || rendered.Markdown != string(md) {
		t.Errorf("render --md answers with the same Markdown and no HTML: %d", code)
	}
	env, _ = run(t, "build", model, "--out", dir)
	raw, _ = json.Marshal(env.Result)
	if strings.Contains(string(raw), `"markdown"`) {
		t.Error("without --md there is no Markdown output")
	}
}
