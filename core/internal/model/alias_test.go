package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func normalize(t *testing.T, src string) (*Document, []Problem) {
	t.Helper()
	out, warnings, upgraded, err := Normalize([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	if !upgraded {
		t.Fatal("expected a 0.6 document to be upgraded")
	}
	doc, err := Decode(strings.NewReader(string(out)))
	if err != nil {
		t.Fatalf("upgraded document does not decode: %v\n%s", err, out)
	}
	if p := Check(doc); len(p) > 0 {
		t.Fatalf("upgraded document has problems: %v\n%s", p, out)
	}
	return doc, warnings
}

func joined(problems []Problem) string {
	var s []string
	for _, p := range problems {
		s = append(s, p.String())
	}
	return strings.Join(s, "\n")
}

func TestNormalizePassesThrough(t *testing.T) {
	out, warnings, upgraded, err := Normalize([]byte(minimal))
	if err != nil || upgraded || len(warnings) != 0 || string(out) != minimal {
		t.Errorf("a 0.7 document must pass through untouched: %v %v %v", err, upgraded, warnings)
	}
	out, _, upgraded, err = Normalize([]byte("not json"))
	if err != nil || upgraded || string(out) != "not json" {
		t.Error("non-JSON must pass through for the schema to report")
	}
}

func TestNormalizeHeroMetaAndKind(t *testing.T) {
	doc, warnings := normalize(t, `{"dossierVersion":"1.0","kind":"release","meta":{"title":"Release 0.6.7 Evidence","slug":"release-0-6-7","eyebrow":"Meta eyebrow","owner":"bot","tags":["a","b"],"crumbs":["x"],"status":"ready","updated":"2026-07-04"},
	"blocks":[{"type":"hero","eyebrow":"Release evidence","title":"Release 0.6.7","lede":"Evidence collected.","pills":["master","17 commits"],"sideCards":[{"label":"Audience","value":"Teams","note":"beta"}]},
	{"type":"stat-strip","stats":[{"value":"0.6.7","label":"Version"},{"value":12,"label":"Checks","delta":{"value":"+2","label":"vs last"}}]}]}`)
	if doc.Kind != "release" || doc.Meta.Title != "Release 0.6.7 Evidence" || doc.Meta.Kicker != "Release evidence" || doc.Meta.Lede != "Evidence collected." || doc.Meta.Status != "ready" {
		t.Errorf("meta: %+v kind %s", doc.Meta, doc.Kind)
	}
	if len(doc.Sections) != 1 || doc.Sections[0].ID != "overview" {
		t.Fatalf("expected one Overview section, got %+v", doc.Sections)
	}
	parts := doc.Sections[0].Parts
	if len(parts) != 4 || parts[0].Markdown != "**Release 0.6.7**" || parts[1].Type != "spec" || parts[2].Type != "spec" || parts[3].Type != "spec" {
		t.Fatalf("overview parts: %+v", parts)
	}
	if parts[1].Spec[0].Label != "Highlights" || parts[1].Spec[0].Text != "master · 17 commits" || parts[1].Spec[1].Text != "Teams (beta)" {
		t.Errorf("hero spec: %+v", parts[1].Spec)
	}
	if parts[2].Spec[0].Label != "Owner" || parts[2].Spec[1].Text != "a, b" {
		t.Errorf("meta spec: %+v", parts[2].Spec)
	}
	if parts[3].Spec[1].Text != "12 (+2 vs last)" {
		t.Errorf("stat delta: %+v", parts[3].Spec)
	}
	w := joined(warnings)
	for _, want := range []string{"/dossierVersion", `/kind: 0.6 kind "release" mapped to "release"`, "/meta/crumbs: has no 0.7 field", `/blocks/0: "hero" is a 0.6 block`, `/blocks/1: "stat-strip" is a 0.6 block, mapped to a spec part`} {
		if !strings.Contains(w, want) {
			t.Errorf("warnings lack %q:\n%s", want, w)
		}
	}
	if strings.Contains(w, "/meta/eyebrow") || strings.Contains(w, "/meta/owner:") {
		t.Errorf("kept meta keys must not warn as dropped:\n%s", w)
	}
}

func TestNormalizeSectionsAndBoards(t *testing.T) {
	doc, warnings := normalize(t, `{"dossierVersion":"1.0","kind":"dossier","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"section","title":"Closeout","subtitle":"Sub *title*","blocks":[
		{"type":"callout","title":"Heads up","tone":"warn","body":"Careful."},
		{"type":"finding-list","title":"Findings","findings":[{"id":"f1","title":"First","severity":"high","body":"Body **bold**","files":["a.go","b.go"],"recommendation":"Fix it"}]},
		{"type":"code","lang":"go","filename":"x.go","code":"package x"},
		{"type":"process-board","items":[{"id":"w1","title":"Work","effort":"Medium","impact":"High","verdict":"block","details":{"zeta":"1","alpha":"2"},"blocks":[{"type":"table","columns":["a","b"],"rows":[["1","2|3"]]},{"type":"code","lang":"sh","code":"ls"}]}]}
	]},
	{"type":"table","title":"Commits","columns":["Commit","Summary"],"rows":[["abc","Did *things*"]]},
	{"type":"chart","title":"Adoption","chartType":"area","data":[{"label":"Q1","value":1}]},
	{"type":"math","tex":"x^2"}]}`)
	var titles []string
	for _, s := range doc.Sections {
		titles = append(titles, s.ID+":"+s.Title)
	}
	got := strings.Join(titles, " | ")
	want := "closeout:Closeout | closeout-continued:Closeout, continued | commits:Commits"
	if got != want {
		t.Errorf("sections\n got %s\nwant %s", got, want)
	}
	first := doc.Sections[0]
	if first.Parts[0].Markdown != "Sub *title*" || first.Parts[1].Type != "callout" || first.Parts[1].Tone != "risk" || first.Parts[1].Title != "Heads up" || first.Parts[2].Markdown != "### Findings" {
		t.Errorf("closeout parts: %+v", first.Parts)
	}
	if first.Board == nil || first.Board.Layout != "rows" || first.Board.Items[0].ID != "f1" {
		t.Fatalf("closeout board: %+v", first.Board)
	}
	f := first.Board.Items[0]
	if len(f.Facets) != 4 || f.Facets[0].Label != "Status" || f.Facets[0].Markdown != "**Severity** high" || f.Facets[1].Markdown != "Body **bold**" || f.Facets[2].Label != "Recommendation" || f.Facets[3].Markdown != "- `a.go`\n- `b.go`" {
		t.Errorf("finding facets: %+v", f.Facets)
	}
	cont := doc.Sections[1]
	if cont.Parts[0].Type != "code" || cont.Parts[0].Title != "x.go" || cont.Parts[1].Markdown != "### Work items" || cont.Board == nil {
		t.Fatalf("continuation holds the code part and the next board: %+v", cont)
	}
	w := cont.Board.Items[0]
	if w.Effort != "M" || w.Impact != 0 || cont.Board.Layout != "articles" {
		t.Errorf("work item: %+v", w)
	}
	if w.Facets[0].Markdown != "**Impact** High" {
		t.Errorf("impact stays a chip: %q", w.Facets[0].Markdown)
	}
	if !strings.Contains(w.Facets[1].Markdown, "| a | b |\n| --- | --- |\n| 1 | 2\\|3 |") || !strings.Contains(w.Facets[1].Markdown, "```sh\nls\n```") {
		t.Errorf("nested blocks in notes: %q", w.Facets[1].Markdown)
	}
	if w.Facets[2].Markdown != "**alpha** 2\n\n**zeta** 1" {
		t.Errorf("details sorted: %q", w.Facets[2].Markdown)
	}
	commits := doc.Sections[2].Parts
	if len(commits) != 3 || commits[0].Type != "table" || commits[0].Title != "" || commits[1].Type != "chart" || commits[1].Title != "Adoption" || commits[1].Variant != "area" {
		t.Errorf("commits section: %+v", commits)
	}
	if commits[2].Type != "code" || commits[2].Lang != "latex" {
		t.Errorf("math becomes latex code: %+v", commits[2])
	}
	ws := joined(warnings)
	for _, want := range []string{`verdict "block" is 0.6 reader state`, `"math" is a 0.6 block`, `"finding-list" is a 0.6 block, mapped to a board (rows)`} {
		if !strings.Contains(ws, want) {
			t.Errorf("warnings lack %q:\n%s", want, ws)
		}
	}
	if strings.Contains(ws, `"table" is`) || strings.Contains(ws, `"section" is`) {
		t.Errorf("native blocks must not warn:\n%s", ws)
	}
}

func TestNormalizeIdsAndReferences(t *testing.T) {
	long := strings.Repeat("a", 64)
	doc, warnings := normalize(t, `{"dossierVersion":"1.0","kind":"plan","meta":{"title":"T","slug":"Bad Slug"},"blocks":[
	{"type":"evidence-log","title":"Evidence","items":[{"id":"`+long+`","title":"Long"},{"id":"`+long+`","title":"Long again"},{"id":"Has Spaces","title":"Spaced"}]},
	{"type":"evidence-log","title":"Evidence","items":[{"title":"No id [[Term]]","body":"See [^note] and [@cite] and [[Term]]"}]},
	{"type":"verification-run","runs":[{"id":"r","title":"run","command":"ls examples/*.json","expected":"ok","dependencies":["r","Has Spaces","nope"]}]}]}`)
	if doc.Meta.Slug != "bad-slug" {
		t.Errorf("slug: %q", doc.Meta.Slug)
	}
	items := doc.Sections[0].Board.Items
	if items[0].ID != long || items[1].ID != long[:61]+"-2" || items[2].ID != "has-spaces" {
		t.Errorf("ids: %s %s %s", items[0].ID, items[1].ID, items[2].ID)
	}
	if doc.Sections[1].ID != "evidence-2" || doc.Sections[1].Board.Items[0].ID != "no-id-term" {
		t.Errorf("derived ids: %s %s", doc.Sections[1].ID, doc.Sections[1].Board.Items[0].ID)
	}
	run := doc.Sections[2].Board.Items[0]
	if strings.Join(run.DependsOn, ",") != "has-spaces" {
		t.Errorf("dependsOn: %v", run.DependsOn)
	}
	if !strings.Contains(run.Facets[0].Markdown, "**Command** `ls examples/*.json`") {
		t.Errorf("command in backticks: %q", run.Facets[0].Markdown)
	}
	w := joined(warnings)
	for _, want := range []string{`"Bad Slug" rewritten to "bad-slug"`, "duplicates an earlier id", `"Has Spaces" rewritten to "has-spaces"`, "footnote [^id] references render as literal text", "citation [@id] references", "glossary [[Term]] references", `dependency "nope" does not name an item`, `dependency "r" does not name an item`} {
		if !strings.Contains(w, want) {
			t.Errorf("warnings lack %q:\n%s", want, w)
		}
	}
	if strings.Count(w, "glossary [[Term]]") != 1 {
		t.Errorf("reference warnings must fire once per family:\n%s", w)
	}
	out, _, _, _ := Normalize([]byte(`{"dossierVersion":"1.0","meta":{"title":"T","slug":"t"},"blocks":[]}`))
	var raw map[string]any
	if err := json.Unmarshal(out, &raw); err != nil || raw["kind"] != "brief" {
		t.Errorf("unknown kind and no blocks must still produce a brief: %s", out)
	}
}

func TestMarkdownHelpers(t *testing.T) {
	if got := plainText("lives in **one file** with a [link](http://x) and `code`\nnext"); got != "lives in one file with a link and code next" {
		t.Errorf("plainText: %q", got)
	}
	if got := mdEscape("a *b* [c] `d` <e>"); got != `a \*b\* \[c\] \`+"`d\\` \\<e>" {
		t.Errorf("mdEscape: %q", got)
	}
	if got := mdCode("a `b`"); got != "`` a `b` ``" {
		t.Errorf("mdCode: %q", got)
	}
	if got := fence("go", "x\n```\n"); got != "````go\nx\n```\n````" {
		t.Errorf("fence: %q", got)
	}
	if got := slug("  Hello, World!! The Sequel  "); got != "hello-world-the-sequel" {
		t.Errorf("slug: %q", got)
	}
}
