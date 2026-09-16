package store

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
)

func open(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "studio.db")
	s, err := Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, path
}

func TestOpenMigratesOnceAndIsStrict(t *testing.T) {
	ctx := context.Background()
	s, path := open(t)
	var n int
	if err := s.read.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND sql LIKE '%STRICT'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 6 {
		t.Errorf("expected six STRICT tables, got %d", n)
	}
	var mode string
	if err := s.write.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Errorf("journal mode %q %v", mode, err)
	}
	id, err := s.Document(ctx, "doc")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	again, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen must not re-apply migrations: %v", err)
	}
	defer func() { _ = again.Close() }()
	same, err := again.Document(ctx, "doc")
	if err != nil || same != id {
		t.Errorf("document id changed across opens: %s %s %v", id, same, err)
	}
	if _, err := Open(ctx, "bad?path"); err == nil {
		t.Error("a path with a query must be refused")
	}
}

func TestDocumentsAreStableAndSeparate(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	a, err := s.Document(ctx, "a")
	if err != nil {
		t.Fatal(err)
	}
	a2, _ := s.Document(ctx, "a")
	b, _ := s.Document(ctx, "b")
	if a != a2 || a == b {
		t.Errorf("ids: %s %s %s", a, a2, b)
	}
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(a) {
		t.Errorf("not a UUIDv7: %s", a)
	}
	if err := s.ReplaceDecisions(ctx, a, Decisions{Picked: []string{"x"}}); err != nil {
		t.Fatal(err)
	}
	if d, _ := s.Decisions(ctx, b); len(d.Picked) != 0 {
		t.Errorf("decisions leaked across documents: %+v", d)
	}
}

func TestDecisionsReplaceWholeState(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	doc, _ := s.Document(ctx, "doc")
	if err := s.ReplaceDecisions(ctx, doc, Decisions{Path: "rebuild", Picked: []string{"b", "a"}, Notes: map[string]string{"a": " keep blue ", "b": "  "}}); err != nil {
		t.Fatal(err)
	}
	d, err := s.Decisions(ctx, doc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Path != "rebuild" || strings.Join(d.Picked, ",") != "a,b" || len(d.Notes) != 1 || d.Notes["a"] != "keep blue" {
		t.Errorf("decisions: %+v", d)
	}
	if err := s.ReplaceDecisions(ctx, doc, Decisions{Picked: []string{"c"}}); err != nil {
		t.Fatal(err)
	}
	d, _ = s.Decisions(ctx, doc)
	if d.Path != "" || strings.Join(d.Picked, ",") != "c" || len(d.Notes) != 0 {
		t.Errorf("replace must drop the old state: %+v", d)
	}
	if err := s.ReplaceDecisions(ctx, doc, Decisions{Path: "rework", Verdicts: map[string]string{"b": "later", "a": "fix", "c": " "}}); err != nil {
		t.Fatal(err)
	}
	d, _ = s.Decisions(ctx, doc)
	if d.Path != "rework" || len(d.Picked) != 0 || len(d.Verdicts) != 2 || d.Verdicts["a"] != "fix" || d.Verdicts["b"] != "later" {
		t.Errorf("verdicts are part of the whole state: %+v", d)
	}
	if err := s.ReplaceDecisions(ctx, doc, Decisions{}); err != nil {
		t.Fatal(err)
	}
	if d, _ = s.Decisions(ctx, doc); len(d.Verdicts) != 0 {
		t.Errorf("replace drops old verdicts: %+v", d)
	}
}

func TestRetargetDraftKeepsBaseAndValue(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	doc, _ := s.Document(ctx, "doc")
	if err := s.PutDraft(ctx, doc, "/items/a/facets/0/markdown", `"old"`, `"new"`); err != nil {
		t.Fatal(err)
	}
	if err := s.RetargetDraft(ctx, doc, "/items/a/facets/0/markdown", "/items/a/facets/why/markdown"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.Draft(ctx, doc, "/items/a/facets/0/markdown"); ok {
		t.Error("the old target is gone")
	}
	if d, ok, _ := s.Draft(ctx, doc, "/items/a/facets/why/markdown"); !ok || d.Base != `"old"` || d.Value != `"new"` {
		t.Errorf("moved draft: %+v %v", d, ok)
	}
}

func TestDraftsKeepTheirBase(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	doc, _ := s.Document(ctx, "doc")
	if _, ok, err := s.Draft(ctx, doc, "/meta/title"); ok || err != nil {
		t.Errorf("no draft yet: %v %v", ok, err)
	}
	if err := s.PutDraft(ctx, doc, "/meta/title", `"Old"`, `"New"`); err != nil {
		t.Fatal(err)
	}
	if err := s.PutDraft(ctx, doc, "/meta/title", `"Newer base ignored"`, `"Newest"`); err != nil {
		t.Fatal(err)
	}
	if err := s.PutDraft(ctx, doc, "/items/a/title", `"A"`, `"A2"`); err != nil {
		t.Fatal(err)
	}
	d, ok, err := s.Draft(ctx, doc, "/meta/title")
	if !ok || err != nil || d.Base != `"Old"` || d.Value != `"Newest"` || d.UpdatedAt.IsZero() {
		t.Errorf("draft: %+v %v %v", d, ok, err)
	}
	all, _ := s.Drafts(ctx, doc)
	if len(all) != 2 || all[0].Target != "/items/a/title" {
		t.Errorf("drafts are listed by target: %+v", all)
	}
	if err := s.DeleteDraft(ctx, doc, "/items/a/title"); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.Drafts(ctx, doc); len(all) != 1 {
		t.Errorf("delete one: %+v", all)
	}
	if err := s.DeleteDrafts(ctx, doc); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.Drafts(ctx, doc); len(all) != 0 {
		t.Errorf("delete all: %+v", all)
	}
}

func TestSettings(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	doc, _ := s.Document(ctx, "doc")
	if _, ok, _ := s.Setting(ctx, doc, "accent"); ok {
		t.Error("unset setting reported as set")
	}
	_ = s.PutSetting(ctx, doc, "accent", "#1f6feb")
	_ = s.PutSetting(ctx, doc, "accent", "#c81e4a")
	if v, ok, err := s.Setting(ctx, doc, "accent"); !ok || err != nil || v != "#c81e4a" {
		t.Errorf("setting: %q %v %v", v, ok, err)
	}
	_ = s.DeleteSetting(ctx, doc, "accent")
	if _, ok, _ := s.Setting(ctx, doc, "accent"); ok {
		t.Error("deleted setting still set")
	}
}

func TestConcurrentReadsAndWrites(t *testing.T) {
	ctx := context.Background()
	s, _ := open(t)
	doc, _ := s.Document(ctx, "doc")
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			if err := s.ReplaceDecisions(ctx, doc, Decisions{Picked: []string{"a", "b"}}); err != nil {
				t.Error(err)
			}
		}()
		go func() {
			defer wg.Done()
			if _, err := s.Decisions(ctx, doc); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if d, _ := s.Decisions(ctx, doc); strings.Join(d.Picked, ",") != "a,b" {
		t.Errorf("final state: %+v", d)
	}
}
