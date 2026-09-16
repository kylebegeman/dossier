package serve

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"dossier/internal/load"
	"dossier/internal/model"
)

type harness struct {
	t     *testing.T
	srv   *Server
	model string
}

func start(t *testing.T, fixture string) *harness {
	t.Helper()
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	return startWith(t, data)
}

func startWith(t *testing.T, data []byte, kindDirs ...string) *harness {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	srv, err := New(ctx, Config{Model: path, Addr: "127.0.0.1:0", KindDirs: kindDirs, Poll: 20 * time.Millisecond, Version: "test"})
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- srv.Run(ctx) }()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("run: %v", err)
			}
		case <-time.After(10 * time.Second):
			t.Error("shutdown did not finish")
		}
	})
	return &harness{t: t, srv: srv, model: path}
}

const brainstorm = "../../examples/winter-crossing.dossier.json"

func (h *harness) request(method, path, body string, headers map[string]string) (*http.Response, string) {
	h.t.Helper()
	req, err := http.NewRequest(method, strings.TrimSuffix(h.srv.URL(), "/")+path, strings.NewReader(body))
	if err != nil {
		h.t.Fatal(err)
	}
	for k, v := range headers {
		if k == "Host" {
			req.Host = v
			continue
		}
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		h.t.Fatal(err)
	}
	return res, string(data)
}

func (h *harness) api(method, path string, body any) (int, response) {
	h.t.Helper()
	payload := ""
	if s, ok := body.(string); ok {
		payload = s
	} else if body != nil {
		b, _ := json.Marshal(body)
		payload = string(b)
	}
	res, text := h.request(method, path, payload, map[string]string{"X-Dossier-Token": h.srv.token, "Content-Type": "application/json"})
	var out response
	if strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
		if err := json.Unmarshal([]byte(text), &out); err != nil {
			h.t.Fatalf("%s %s: %v\n%s", method, path, err, text)
		}
	}
	return res.StatusCode, out
}

func (h *harness) page() string {
	h.t.Helper()
	res, body := h.request("GET", "/", "", nil)
	if res.StatusCode != http.StatusOK {
		h.t.Fatalf("page: %d %s", res.StatusCode, body)
	}
	return body
}

func (h *harness) file() *model.Document {
	h.t.Helper()
	l, problems, err := load.File(h.model)
	if err != nil || len(problems) > 0 {
		h.t.Fatalf("model file: %v %v", err, problems)
	}
	return l.Doc
}

func TestPageInjectsTheStudioBeforeTheReader(t *testing.T) {
	h := start(t, brainstorm)
	res, body := h.request("GET", "/", "", nil)
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("X-Frame-Options") != "DENY" {
		t.Errorf("headers: %v", res.Header)
	}
	studio, reader := strings.Index(body, `id="dossier-studio"`), strings.LastIndex(body, "<script>\n(() => {")
	if studio < 0 || reader < 0 || studio > reader {
		t.Errorf("studio at %d, reader at %d", studio, reader)
	}
	for _, want := range []string{`<h1 data-edit="/meta/title">`, `"token":"` + h.srv.token + `"`, `"version":"test"`, `<style id="studio-accent"></style>`} {
		if !strings.Contains(body, want) {
			t.Errorf("page lacks %q", want)
		}
	}
	if _, err := os.Stat(StorePath(h.model)); err != nil {
		t.Errorf("store beside the model: %v", err)
	}
}

func TestGuardRefusesForeignRequests(t *testing.T) {
	h := start(t, brainstorm)
	body := `{"target":"/meta/title","value":"X"}`
	token := h.srv.token
	for name, headers := range map[string]map[string]string{
		"no token":               {},
		"wrong token":            {"X-Dossier-Token": "nope"},
		"foreign origin":         {"X-Dossier-Token": token, "Origin": "http://evil.example"},
		"cross-site":             {"X-Dossier-Token": token, "Sec-Fetch-Site": "cross-site"},
		"rebinding host":         {"X-Dossier-Token": token, "Host": "evil.example:4321"},
		"unknown localhost port": {"X-Dossier-Token": token, "Host": "localhost:1"},
	} {
		res, _ := h.request("PUT", "/_/drafts", body, headers)
		if res.StatusCode != http.StatusForbidden && res.StatusCode != http.StatusMisdirectedRequest {
			t.Errorf("%s: status %d", name, res.StatusCode)
		}
	}
	if res, _ := h.request("GET", "/", "", map[string]string{"Host": "evil.example"}); res.StatusCode != http.StatusMisdirectedRequest {
		t.Errorf("page on a foreign host: %d", res.StatusCode)
	}
	if doc := h.file(); doc.Meta.Title != "Ten moves for a calmer winter crossing" {
		t.Errorf("a refused request changed the file: %q", doc.Meta.Title)
	}
}

func TestDraftsPreviewCommitAndRevert(t *testing.T) {
	h := start(t, brainstorm)
	target := "/items/storm-rebook/summary"
	code, field := h.api("GET", "/_/field?target="+target, nil)
	if code != 200 || field.Value == nil || field.Draft {
		t.Fatalf("field: %d %+v", code, field)
	}
	original := *field.Value

	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: target, Value: "  A sharper   summary. "}); code != 200 || !res.OK {
		t.Fatalf("draft: %d %+v", code, res)
	}
	if !strings.Contains(h.page(), `data-edit="/items/storm-rebook/summary">A sharper summary.</p>`) {
		t.Error("the page does not preview the draft")
	}
	if h.file().Sections[2].Board.Items[0].Summary != original {
		t.Error("a draft must not touch the file")
	}
	if _, field = h.api("GET", "/_/field?target="+target, nil); !field.Draft || *field.Value != "A sharper summary." {
		t.Errorf("field with draft: %+v", field)
	}

	code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/items/storm-rebook/title", Value: "   "})
	if code != http.StatusUnprocessableEntity || len(res.Findings) == 0 {
		t.Errorf("an edit that breaks the model must be refused with findings: %d %+v", code, res)
	}
	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/items/nope/title", Value: "x"}); code != 400 {
		t.Errorf("unknown target: %d %+v", code, res)
	}
	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/kicker", Value: "Studio kicker"}); code != 200 {
		t.Fatalf("second draft: %d %+v", code, res)
	}
	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/kicker", Value: h.file().Meta.Kicker}); code != 200 || !res.Reverted {
		t.Errorf("an edit back to the file value removes the draft: %d %+v", code, res)
	}

	code, res = h.api("POST", "/_/drafts/commit", nil)
	if code != 200 || len(res.Applied) != 1 || res.Applied[0] != target || len(res.Conflicts) != 0 {
		t.Fatalf("commit: %d %+v", code, res)
	}
	if got := h.file().Sections[2].Board.Items[0].Summary; got != "A sharper summary." {
		t.Errorf("file after commit: %q", got)
	}
	if !strings.Contains(h.page(), `"drafts":[],"conflicts":[]`) {
		t.Error("committed drafts must be gone")
	}
}

func TestConflictingDraftsAreKept(t *testing.T) {
	h := start(t, brainstorm)
	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/title", Value: "Studio title"}); code != 200 {
		t.Fatalf("draft: %d %+v", code, res)
	}
	doc := h.file()
	doc.Meta.Title = "Changed by an agent"
	if err := load.WriteModel(h.model, doc); err != nil {
		t.Fatal(err)
	}
	code, res := h.api("POST", "/_/drafts/commit", nil)
	if code != 200 || len(res.Applied) != 0 || len(res.Conflicts) != 1 {
		t.Fatalf("commit with a conflict: %d %+v", code, res)
	}
	if got := h.file().Meta.Title; got != "Changed by an agent" {
		t.Errorf("a conflicting draft overwrote the file: %q", got)
	}
	waitFor(t, func() bool {
		return h.srv.current().loaded != nil && h.srv.current().loaded.Doc.Meta.Title == "Changed by an agent"
	})
	page := h.page()
	if !strings.Contains(page, `"conflicts":["/meta/title"]`) || !strings.Contains(page, ">Changed by an agent</h1>") {
		t.Error("the page must show the file and report the conflict")
	}
	if _, field := h.api("GET", "/_/field?target=/meta/title", nil); !field.Conflict {
		t.Errorf("field must report the conflict: %+v", field)
	}
	if code, _ := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/title", Value: "Studio title again"}); code != 200 {
		t.Fatal("re-editing a conflicted field")
	}
	if code, res := h.api("POST", "/_/drafts/commit", nil); code != 200 || len(res.Applied) != 1 {
		t.Errorf("a re-edited draft starts from the new file value and commits: %d %+v", code, res)
	}
}

func TestMoveDraftsAnOrder(t *testing.T) {
	h := start(t, brainstorm)
	before := boardIDs(h.file().Sections[2].Board)
	if code, res := h.api("POST", "/_/move", moveRequest{Item: before[1], Direction: "up"}); code != 200 || res.Reverted {
		t.Fatalf("move: %d %+v", code, res)
	}
	page := h.page()
	if strings.Index(page, `id="`+before[1]+`" data-item`) > strings.Index(page, `id="`+before[0]+`" data-item`) {
		t.Error("the page does not preview the new order")
	}
	if !strings.Contains(page, `"orders":["ideas"]`) {
		t.Error("the page must report the reordered board")
	}
	if code, _ := h.api("POST", "/_/move", moveRequest{Item: before[1], Direction: "up"}); code != 200 {
		t.Error("moving past the top is a no-op")
	}
	if code, res := h.api("POST", "/_/move", moveRequest{Item: "nope", Direction: "up"}); code != 404 {
		t.Errorf("unknown item: %d %+v", code, res)
	}
	if code, res := h.api("POST", "/_/drafts/commit", nil); code != 200 || len(res.Applied) != 1 {
		t.Fatalf("commit order: %d %+v", code, res)
	}
	after := boardIDs(h.file().Sections[2].Board)
	if after[0] != before[1] || after[1] != before[0] {
		t.Errorf("file order: %v", after[:3])
	}
}

func TestDecisionsSyncToTheStoreAndApply(t *testing.T) {
	h := start(t, brainstorm)
	first := h.file().Sections[2].Board.Items[0].ID
	code, res := h.api("PUT", "/_/decisions", decisionsRequest{Path: "storms", Picked: []string{first, "not-an-item"}, Notes: map[string]string{first: "keep it", "ghost": "x"}})
	if code != 200 || !res.OK {
		t.Fatalf("put decisions: %d %+v", code, res)
	}
	page := h.page()
	if !strings.Contains(page, `class="item picked" id="`+first+`"`) || !strings.Contains(page, `"picked":["`+first+`"]`) {
		t.Error("the page must render the stored decisions")
	}
	if h.file().Decisions != nil {
		t.Error("syncing decisions must not touch the file")
	}
	code, res = h.api("POST", "/_/decisions/apply", nil)
	if code != 200 || !strings.Contains(res.Reply, "storms, 1.") {
		t.Fatalf("apply: %d %+v", code, res)
	}
	d := h.file().Decisions
	if d == nil || d.Path != "storms" || strings.Join(d.Picked, ",") != first || d.Notes[first] != "keep it" || len(d.Notes) != 1 {
		t.Errorf("file decisions: %+v", d)
	}
}

func TestModelEditorValidatesBeforeWriting(t *testing.T) {
	h := start(t, brainstorm)
	res, text := h.request("GET", "/_/model", "", map[string]string{"X-Dossier-Token": h.srv.token})
	original, _ := os.ReadFile(h.model)
	if res.StatusCode != 200 || text != string(original) {
		t.Fatalf("get model: %d", res.StatusCode)
	}
	if code, out := h.api("PUT", "/_/model", "{not json"); code != 422 || out.Error == "" {
		t.Errorf("non-JSON: %d %+v", code, out)
	}
	broken := strings.Replace(text, `"kind": "brainstorm"`, `"kind": "nope"`, 1)
	if code, out := h.api("PUT", "/_/model", broken); code != 422 || len(out.Findings) == 0 {
		t.Errorf("findings: %d %+v", code, out)
	}
	if now, _ := os.ReadFile(h.model); string(now) != string(original) {
		t.Fatal("a refused model was written")
	}
	if code, out := h.api("POST", "/_/validate", broken); code != 200 || out.Outcome != "findings" {
		t.Errorf("validate: %d %+v", code, out)
	}
	fixed := strings.Replace(text, "Ten moves for a calmer winter crossing", "Eleven moves", 1)
	if code, out := h.api("PUT", "/_/model", fixed); code != 200 || out.Written == "" {
		t.Fatalf("save: %d %+v", code, out)
	}
	if !strings.Contains(h.page(), "<title>Eleven moves</title>") {
		t.Error("the page must show the saved model")
	}
}

func TestExternalEditsPublishReload(t *testing.T) {
	h := start(t, brainstorm)
	lines := h.stream()
	expect(t, lines, ": connected")
	doc := h.file()
	doc.Meta.Lede = "Changed outside the studio."
	if err := load.WriteModel(h.model, doc); err != nil {
		t.Fatal(err)
	}
	expect(t, lines, "event: reload")
	if !strings.Contains(h.page(), "Changed outside the studio.") {
		t.Error("the page must follow the file")
	}
}

func TestCustomKindsReloadWithTheirFiles(t *testing.T) {
	kindFile := filepath.Join(t.TempDir(), "retro.kind.json")
	original, err := os.ReadFile("../../examples/kinds/retro.kind.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(kindFile, original, 0o644); err != nil {
		t.Fatal(err)
	}
	retro := `{"dossier":"1.0","kind":"retro","meta":{"title":"Sprint 14 retro","slug":"sprint-14"},"sections":[
	{"id":"context","title":"Context","parts":[{"type":"prose","markdown":"Two weeks on the spring timetable."}]},
	{"id":"kept","title":"Worth keeping","board":{"layout":"rows","items":[{"id":"pairing","title":"Pairing on releases"}]}},
	{"id":"experiments","title":"Experiments","board":{"items":[{"id":"quiet-hours","title":"Quiet hours","summary":"Two meeting-free afternoons a week.","category":"people","owner":"Ines","effort":"S",
	"facets":[{"label":"What we saw","markdown":"Reviews waited on meetings."},{"label":"Try","markdown":"Block Tuesday and Thursday afternoons."}]}]}}]}`
	h := startWith(t, []byte(retro), filepath.Dir(kindFile))
	if page := h.page(); !strings.Contains(page, `id="dossier-model"`) || !strings.Contains(page, "What we saw") {
		t.Fatal("a custom kind renders in the studio")
	}
	lines := h.stream()
	expect(t, lines, ": connected")
	stricter := strings.Replace(string(original), `{"label": "We will know when", "hint"`, `{"label": "We will know when", "required": true, "hint"`, 1)
	if stricter == string(original) {
		t.Fatal("the fixture no longer has the facet this test tightens")
	}
	if err := os.WriteFile(kindFile, []byte(stricter), 0o644); err != nil {
		t.Fatal(err)
	}
	expect(t, lines, "event: reload")
	if page := h.page(); !strings.Contains(page, "The model does not validate") || !strings.Contains(page, `missing facet \"We will know when\"`) {
		t.Errorf("a stricter kind file reloads and the model gains findings:\n%s", page)
	}
	if err := os.WriteFile(kindFile, []byte("{"), 0o644); err != nil {
		t.Fatal(err)
	}
	expect(t, lines, "event: reload")
	if page := h.page(); !strings.Contains(page, "retro.kind.json") {
		t.Error("a broken kind file is a finding on the page")
	}
}

func TestLegacyDocumentsPreviewButDoNotEdit(t *testing.T) {
	h := start(t, "../../testdata/legacy/release-0-6-7.dossier.json")
	if !strings.Contains(h.page(), `"upgraded":true`) {
		t.Error("the page must say the document is 0.6")
	}
	original, _ := os.ReadFile(h.model)
	if code, res := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/title", Value: "x"}); code != 409 || !strings.Contains(res.Error, "dossier upgrade") {
		t.Errorf("draft on 0.6: %d %+v", code, res)
	}
	if code, _ := h.api("POST", "/_/decisions/apply", nil); code != 409 {
		t.Errorf("apply on 0.6: %d", code)
	}
	if code, _ := h.api("PUT", "/_/decisions", decisionsRequest{}); code != 200 {
		t.Errorf("syncing decisions on 0.6 is fine: %d", code)
	}
	if now, _ := os.ReadFile(h.model); string(now) != string(original) {
		t.Error("the 0.6 source changed")
	}
}

func TestFindingsPageKeepsTheStudioLive(t *testing.T) {
	h := startWith(t, []byte(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"t"},"sections":[]}`))
	page := h.page()
	if !strings.Contains(page, "The model does not validate") || !strings.Contains(page, `id="dossier-studio"`) || !strings.Contains(page, `"findings":[{`) {
		t.Error("findings page must list findings and keep the studio")
	}
	if code, _ := h.api("PUT", "/_/drafts", draftRequest{Target: "/meta/title", Value: "x"}); code != 409 {
		t.Errorf("drafts need a valid model: %d", code)
	}
	good, _ := os.ReadFile(brainstorm)
	if code, res := h.api("PUT", "/_/model", string(good)); code != 200 {
		t.Fatalf("fix through the editor: %d %+v", code, res)
	}
	if !strings.Contains(h.page(), `id="dossier-model"`) {
		t.Error("a fixed model renders the artifact")
	}
}

func TestSettingsPreviewTheAccent(t *testing.T) {
	h := start(t, brainstorm)
	accent := "#2563EB"
	if code, _ := h.api("PUT", "/_/settings", settingsRequest{Accent: &accent}); code != 200 {
		t.Fatal("put accent")
	}
	if page := h.page(); !strings.Contains(page, ":root { --accent: #2563eb;") || !strings.Contains(page, `:root[data-theme="dark"] { --accent: #`) {
		t.Error("the page must carry the previewed accent, derived for both themes")
	}
	bad := "red; } body { display:none"
	if code, _ := h.api("PUT", "/_/settings", settingsRequest{Accent: &bad}); code != 400 {
		t.Errorf("a bad accent must be refused: %d", code)
	}
	empty := ""
	if code, _ := h.api("PUT", "/_/settings", settingsRequest{Accent: &empty}); code != 200 || strings.Contains(h.page(), "--accent: #2563eb") {
		t.Error("reset must clear the accent")
	}
}

func TestShutdownReleasesStreams(t *testing.T) {
	data, _ := os.ReadFile(brainstorm)
	path := filepath.Join(t.TempDir(), "doc.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	srv, err := New(ctx, Config{Model: path, Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- srv.Run(ctx) }()
	h := &harness{t: t, srv: srv, model: path}
	lines := h.stream()
	expect(t, lines, ": connected")
	started := time.Now()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("run: %v", err)
		}
	case <-time.After(shutdownTimeout + 2*time.Second):
		t.Fatal("shutdown hung on an open stream")
	}
	if time.Since(started) > 2*time.Second {
		t.Errorf("shutdown took %v with an open stream", time.Since(started))
	}
	if srv.hub.count() != 0 {
		t.Error("streams remain subscribed")
	}
}

func TestNewRefusesNonLoopbackAndMissingModels(t *testing.T) {
	data, _ := os.ReadFile(brainstorm)
	path := filepath.Join(t.TempDir(), "doc.dossier.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	for _, addr := range []string{"0.0.0.0:0", "example.com:0", "192.168.1.2:0"} {
		if _, err := New(context.Background(), Config{Model: path, Addr: addr}); err == nil || !strings.Contains(err.Error(), "loopback") {
			t.Errorf("%s: %v", addr, err)
		}
	}
	if _, err := New(context.Background(), Config{Model: filepath.Join(t.TempDir(), "missing.json"), Addr: "127.0.0.1:0"}); err == nil {
		t.Error("a missing model must be refused")
	}
}

func TestStudioAssetsStayInBudget(t *testing.T) {
	if len(studioJS) > MaxStudioJSBytes || len(studioCSS) > MaxStudioCSSBytes {
		t.Errorf("studio is %d bytes of script and %d of style", len(studioJS), len(studioCSS))
	}
	if strings.Contains(studioJS, "</script") || strings.Contains(studioCSS, "</style") {
		t.Error("studio assets must not close their element")
	}
}

// stream opens the event stream and delivers its lines.
func (h *harness) stream() <-chan string {
	h.t.Helper()
	req, err := http.NewRequest("GET", strings.TrimSuffix(h.srv.URL(), "/")+"/_/events", nil)
	if err != nil {
		h.t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	h.t.Cleanup(cancel)
	res, err := http.DefaultClient.Do(req.WithContext(ctx))
	if err != nil {
		h.t.Fatal(err)
	}
	lines := make(chan string, 32)
	go func() {
		defer close(lines)
		defer func() { _ = res.Body.Close() }()
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
	}()
	return lines
}

func expect(t *testing.T, lines <-chan string, want string) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case line, open := <-lines:
			if !open {
				t.Fatalf("stream ended before %q", want)
			}
			if line == want {
				return
			}
		case <-deadline:
			t.Fatalf("no %q on the stream", want)
		}
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
