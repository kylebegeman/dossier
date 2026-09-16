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
	if len(parts[3].Spec) != 1 || parts[3].Spec[0].Text != "12 (+2 vs last)" {
		t.Errorf("a stat with a delta stays a spec row: %+v", parts[3].Spec)
	}
	if len(doc.Meta.Facts) != 1 || doc.Meta.Facts[0] != (Fact{Label: "version", Value: "0.6.7"}) {
		t.Errorf("a plain stat becomes a masthead fact, and a card with a note does not: %+v", doc.Meta.Facts)
	}
	w := joined(warnings)
	for _, want := range []string{"/dossierVersion", `/kind: 0.6 kind "release" mapped to "release"`, "/meta/crumbs: has no 0.7 field", `/blocks/0: "hero" is a 0.6 block`, `/blocks/1: "stat-strip" is a 0.6 block, mapped to the masthead facts, and a spec part for the stats that do not fit`} {
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
	if first.Parts[0].Markdown != `Sub \*title\*` || first.Parts[1].Type != "callout" || first.Parts[1].Tone != "risk" || first.Parts[1].Title != "Heads up" || first.Parts[2].Markdown != "### Findings" {
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
	if w.Effort != "M" || w.Impact != 0 || cont.Board.Layout != "rows" {
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
	for _, want := range []string{`verdict "block" is 0.6 reader state`, `"math" is a 0.6 block`, `"finding-list" is a 0.6 block, mapped to a board of rows`} {
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
	if got := mdEscape("npm pack --dry-run ---"); got != `npm pack -\-dry-run -\-\-` {
		t.Errorf("mdEscape hyphens: %q", got)
	}
	// 0.6 printed globs, flags, tags, and backslashes as typed and knew only
	// lists, bold, code, and links.
	for in, want := range map[string]string{
		"validate examples/*.dossier.json --json":          `validate examples/\*.dossier.json -\-json`,
		"- **Keep** `--dry-run` and [docs](https://x.dev)": "- **Keep** `--dry-run` and [docs](https://x.dev)",
		"* one\n2. two <details> a < b":                    `* one` + "\n" + `2. two \<details> a < b`,
		"```sh\nnpm pack --dry-run *\n```\nafter --x":      "```sh\nnpm pack --dry-run *\n```\nafter -\\-x",
		`C:\dir\*.json and ` + "``a*b``" + ` done`:         `C:\dir\\\*.json and ` + "``a*b``" + ` done`,
		"unclosed ` --x": "unclosed ` -\\-x",
	} {
		if got := legacyMarkdown(in); got != want {
			t.Errorf("legacyMarkdown(%q) = %q, want %q", in, got, want)
		}
	}
	if got := joinClauses([]string{"Approve the board.", "Attach evidence", " ", "Rerun"}); got != "Approve the board. Attach evidence; Rerun" {
		t.Errorf("joinClauses: %q", got)
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

func facetMap(it Item) map[string]string {
	out := map[string]string{}
	for _, f := range it.Facets {
		out[f.Label] = f.Markdown
	}
	return out
}

func labels(it Item) string {
	var out []string
	for _, f := range it.Facets {
		out = append(out, f.Label)
	}
	return strings.Join(out, ",")
}

func TestNormalizeMapsEachKindsFamilyOntoItsVocabulary(t *testing.T) {
	board := func(doc *Document) *Board {
		for _, s := range doc.Sections {
			if s.Board != nil && s.Board.Layout == "" {
				return s.Board
			}
		}
		t.Fatalf("no article board in %+v", doc.Sections)
		return nil
	}

	plan, warnings := normalize(t, `{"dossierVersion":"1.0","kind":"implementation","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"process-board","items":[
		{"id":"filter","title":"Persist filter","summary":"Keep it in the URL.","status":"partial","owner":"agent","effort":"Small","priority":"P1","files":["a.ts"],"verification":["npm test"],"verdict":"revise"},
		{"id":"empty","title":"Empty state","status":"guardrail","verdict":"block","body":"**Why:** riders lose context.\n\nShow a hint."}]},
	{"type":"verdict-gate","prompt":"Apply the plan?","options":["approve","hold"]}]}`)
	steps := board(plan).Items
	if plan.Kind != "plan" || steps[0].Status != "doing" || steps[0].Owner != "agent" || steps[0].Effort != "S" || labels(steps[0]) != "What changes,Touches,Done when,Note" {
		t.Errorf("plan step: %+v", steps[0])
	}
	if fm := facetMap(steps[1]); steps[1].Status != "planned" || fm["Why"] != "riders lose context." || fm["What changes"] != "Show a hint." || fm["Done when"] != notStated || !strings.Contains(fm["Note"], "**Status** guardrail") {
		t.Errorf("lead-ins, placeholders, and unknown statuses: %+v", steps[1])
	}
	if plan.Decisions == nil || plan.Decisions.Verdicts["filter"] != "revise" || plan.Decisions.Verdicts["empty"] != "skip" {
		t.Errorf("0.6 verdicts become plan verdicts: %+v", plan.Decisions)
	}
	if plan.Choice == nil || plan.Choice.Options[1].ID != "hold" || plan.Choice.Question != "Apply the plan?" {
		t.Errorf("a verdict gate with options becomes the document's choice: %+v", plan.Choice)
	}
	if !strings.Contains(joined(warnings), `the 0.6 item has nothing for the required facet "Done when"`) {
		t.Error("a placeholder always warns")
	}

	review, _ := normalize(t, `{"dossierVersion":"1.0","kind":"integration-loop","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"finding-list","findings":[{"id":"f1","title":"Token leak","severity":"high","category":"security","body":"Logs hold tokens.","files":["api.go"],"line":42,"recommendation":"Redact."}]}]}`)
	f := board(review).Items[0]
	if fm := facetMap(f); review.Kind != "review" || f.Severity != "major" || f.Category != "security" || fm["Where"] != "- `api.go`, line 42" || fm["Why it matters"] != "Logs hold tokens." || fm["Fix"] != "Redact." {
		t.Errorf("review finding: %+v", f)
	}

	release, _ := normalize(t, `{"dossierVersion":"1.0","kind":"release","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"release-checklist","gates":[{"id":"version","title":"Version resolved","status":"passed","required":true,"evidence":"0.6.7"},{"id":"arm","title":"arm64 build","status":"blocked","required":true,"evidence":"Runner out of disk."}]},
	{"type":"verification-run","runs":[{"id":"tests","title":"npm test","command":"npm test","status":"planned","expected":"All pass.","artifacts":["report.xml"]}]}]}`)
	var gates []Item
	for _, s := range release.Sections {
		if s.Board != nil {
			gates = append(gates, s.Board.Items...)
		}
	}
	if fm := facetMap(gates[0]); gates[0].Status != "passed" || !gates[0].Required || fm["Result"] != "Passed: `0.6.7`" {
		t.Errorf("checklist gate: %+v", gates[0])
	}
	if fm := facetMap(gates[1]); gates[1].Status != "failed" || fm["Result"] != "Failed: Runner out of disk." {
		t.Errorf("blocked gate: %+v", gates[1])
	}
	if fm := facetMap(gates[2]); gates[2].Status != "pending" || fm["How checked"] != "Runs `npm test`. Expected: All pass." || fm["Result"] != "Pending." || fm["Evidence"] != "`report.xml`" {
		t.Errorf("verification run: %+v", gates[2])
	}

	incident, _ := normalize(t, `{"dossierVersion":"1.0","kind":"dossier","meta":{"title":"T","slug":"t","tags":["Postmortem"]},"blocks":[
	{"type":"hero","title":"T","sideCards":[{"label":"Severity","value":"SEV-2"}]},
	{"type":"timeline","phases":[{"label":"09:12","body":"Alert fired. Pager went off.","status":"done"},{"label":"Detection","date":"2026-01-14","body":"Found.","status":"blocked"}]},
	{"type":"action-items","items":[{"title":"Add backpressure","owner":"API team","status":"done"}]}]}`)
	if incident.Kind != "incident" || len(incident.Meta.Facts) != 1 || incident.Meta.Facts[0].Value != "SEV-2" {
		t.Errorf("a postmortem tag maps to incident, and hero cards to facts: %s %+v", incident.Kind, incident.Meta.Facts)
	}
	var events []Event
	for _, s := range incident.Sections {
		for _, p := range s.Parts {
			events = append(events, p.Events...)
		}
	}
	if len(events) != 2 || events[0] != (Event{At: "09:12", Title: "Alert fired", Markdown: "Pager went off.", Tone: "teal"}) || events[1] != (Event{At: "2026-01-14", Title: "Detection", Markdown: "Found.", Tone: "risk"}) {
		t.Errorf("timeline events: %+v", events)
	}
	up := board(incident).Items[0]
	if fm := facetMap(up); up.Status != "done" || up.Owner != "API team" || fm["Addresses"] != notStated || fm["What changes"] != "Add backpressure" {
		t.Errorf("follow-up: %+v", up)
	}

	brief, _ := normalize(t, `{"dossierVersion":"1.0","kind":"research","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"trust-report","claims":[{"id":"c1","claim":"Portable.","status":"verified","confidence":"high","sources":["repo"]},{"id":"c2","claim":"Pricing holds.","status":"policy","confidence":"medium","evidence":"Checked in May."}]}]}`)
	claims := board(brief).Items
	if claims[0].Status != "verified" || claims[1].Status != "open" || facetMap(claims[1])["Detail"] != "**0.6 status** policy" || facetMap(claims[1])["Evidence"] != "- Checked in May." {
		t.Errorf("claims as brief findings: %+v", claims)
	}

	ideas, _ := normalize(t, `{"dossierVersion":"1.0","kind":"review-board","meta":{"title":"T","slug":"t"},"blocks":[
	{"type":"review-board","candidates":[{"id":"cmdk","title":"Command palette","summary":"Jump anywhere.","category":"Minor","impact":"High","effort":"Medium","body":"Opens with Cmd-K.\n\nWhy: readers get lost."}]}]}`)
	idea := board(ideas).Items[0]
	if fm := facetMap(idea); ideas.Kind != "brainstorm" || idea.Size != "minor" || idea.Impact != 4 || idea.Effort != "M" || fm["How it works"] != "Opens with Cmd-K." || fm["Why"] != "readers get lost." {
		t.Errorf("idea: %+v", idea)
	}
}
