package decisions

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"dossier/internal/model"
)

func sample() *model.Document {
	return &model.Document{
		Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "Twelve moves", Slug: "moves"},
		Sections: []model.Section{
			{ID: "frame", Title: "Frame", Parts: []model.Part{{Type: "prose", Markdown: "x"}}},
			{ID: "board", Title: "Board", Board: &model.Board{Items: []model.Item{{ID: "a", Title: "Alpha"}, {ID: "b", Title: "Beta"}, {ID: "c", Title: "Gamma"}}}},
			{ID: "also", Title: "Also", Board: &model.Board{Layout: "rows", Items: []model.Item{{ID: "z", Title: "Zed"}}}},
			{ID: "more", Title: "More", Board: &model.Board{Items: []model.Item{{ID: "d", Title: "Delta"}, {ID: "e", Title: "Epsilon"}, {ID: "f", Title: "Zeta"}}}},
		},
	}
}

var storms = &model.Choice{Question: "Where should winter effort go first?", Options: []model.Option{{ID: "storms", Label: "Storm days"}, {ID: "midweeks", Label: "Quiet midweeks"}}}

func pickRules() Rules {
	return Rules{Kind: "brainstorm", Noun: "idea", Plural: "ideas", Mode: ModePick, Choice: storms}
}

func reviewRules() Rules {
	return Rules{Kind: "review", Noun: "finding", Plural: "findings", Mode: ModeVerdict, Default: "fix",
		Verdicts: []Verdict{{ID: "fix", Label: "Fix", Tone: "teal"}, {ID: "later", Label: "Later", Tone: "violet"}, {ID: "skip", Label: "Skip", Tone: "neutral"}},
		Choice:   &model.Choice{Question: "Approve or rework?", Options: []model.Option{{ID: "approve", Label: "Approve"}, {ID: "rework", Label: "Rework"}}}}
}

// releaseRules decide only items b, c, and e, with no default verdict.
func releaseRules() Rules {
	return Rules{Kind: "release", Noun: "gate", Plural: "gates", Mode: ModeVerdict,
		Verdicts:     []Verdict{{ID: "waive", Label: "Waive", Tone: "risk"}, {ID: "rerun", Label: "Rerun", Tone: "violet"}},
		Eligible:     map[string]bool{"b": true, "c": true, "e": true},
		EligibleText: "gates with status failed or pending",
		Choice:       &model.Choice{Question: "Ship or hold?", Options: []model.Option{{ID: "ship", Label: "Ship"}, {ID: "hold", Label: "Hold"}}},
		Guard:        &Guard{Choice: "ship", Unless: "waive", Watch: map[string]bool{"c": true}, Describe: "failed and required"}}
}

func TestItemsSkipRowsAndNumberAcrossBoards(t *testing.T) {
	items := Items(sample(), pickRules())
	if len(items) != 6 || items[2].ID != "c" || items[3].N != 4 || items[3].ID != "d" {
		t.Fatalf("unexpected items %+v", items)
	}
	if Items(sample(), Rules{Kind: "brief", Mode: ModeNone}) != nil {
		t.Error("a kind without decisions numbers nothing")
	}
}

func TestPickReplyRoundTrip(t *testing.T) {
	doc := sample()
	rules := pickRules()
	items := Items(doc, rules)
	d, err := ParseReply("Storms, 3, 1 and 5-6. Notes: 1: keep blue; 3: after two, then; 5: done.", items, rules)
	if err != nil {
		t.Fatal(err)
	}
	if d.Path != "storms" || strings.Join(d.Picked, ",") != "a,c,e,f" || d.Notes["a"] != "keep blue" || d.Notes["c"] != "after two, then" || d.Notes["e"] != "done" {
		t.Fatalf("parsed %+v", d)
	}
	if p := Apply(doc, d, rules); len(p) > 0 {
		t.Fatal(p)
	}
	back := FromModel(doc, rules)
	if want := "storms, 1, 3, 5, 6. Notes: 1: keep blue; 3: after two, then; 5: done."; back.Reply != want {
		t.Errorf("reply line %q, want %q", back.Reply, want)
	}
	all, err := ParseReply("all", items, rules)
	if err != nil || len(all.Picked) != 6 || ReplyLine(all, items, rules) != "all." {
		t.Errorf("all: %v %+v", err, all)
	}
	nothing, err := ParseReply("midweeks, nothing.", items, rules)
	if err != nil || nothing.Path != "midweeks" || len(nothing.Picked) != 0 || ReplyLine(nothing, items, rules) != "midweeks." {
		t.Errorf("a choice alone: %v %+v", err, nothing)
	}
}

func TestVerdictReplies(t *testing.T) {
	doc := sample()
	for _, c := range []struct {
		rules    Rules
		reply    string
		path     string
		verdicts map[string]string
		canon    string
	}{
		{reviewRules(), "rework, fix 1, 2; later 4; skip 6. Notes: 4: after the release.", "rework", map[string]string{"a": "fix", "b": "fix", "d": "later", "f": "skip"}, "rework, fix 1, 2; later 4; skip 6. Notes: 4: after the release."},
		{reviewRules(), "1-3; later 4", "", map[string]string{"a": "fix", "b": "fix", "c": "fix", "d": "later"}, "fix 1, 2, 3; later 4."},
		{reviewRules(), "later all; fix 2", "", map[string]string{"a": "later", "b": "fix", "c": "later", "d": "later", "e": "later", "f": "later"}, "fix 2; later 1, 3, 4, 5, 6."},
		{reviewRules(), "skip rest; 1", "", map[string]string{"a": "fix", "b": "skip", "c": "skip", "d": "skip", "e": "skip", "f": "skip"}, "fix 1; skip 2, 3, 4, 5, 6."},
		{reviewRules(), "APPROVE, all", "approve", map[string]string{"a": "fix", "b": "fix", "c": "fix", "d": "fix", "e": "fix", "f": "fix"}, "approve, fix all."},
		{reviewRules(), "later 2 skip 3 5", "", map[string]string{"b": "later", "c": "skip", "e": "skip"}, "later 2; skip 3, 5."},
		{releaseRules(), "ship, waive 3; rerun 2", "ship", map[string]string{"c": "waive", "b": "rerun"}, "ship, waive 3; rerun 2."},
		{releaseRules(), "hold, rerun all", "hold", map[string]string{"b": "rerun", "c": "rerun", "e": "rerun"}, "hold, rerun all."},
		{releaseRules(), "ship.", "ship", nil, "ship."},
	} {
		items := Items(doc, c.rules)
		d, err := ParseReply(c.reply, items, c.rules)
		if err != nil {
			t.Errorf("%q: %v", c.reply, err)
			continue
		}
		if d.Path != c.path || !reflect.DeepEqual(d.Verdicts, c.verdicts) || len(d.Picked) != 0 {
			t.Errorf("%q: parsed %+v", c.reply, d)
		}
		if got := ReplyLine(d, items, c.rules); got != c.canon {
			t.Errorf("%q: canonical %q, want %q", c.reply, got, c.canon)
		}
		again, err := ParseReply(c.canon, items, c.rules)
		if err != nil || again.Path != d.Path || !reflect.DeepEqual(again.Verdicts, d.Verdicts) || !reflect.DeepEqual(again.Notes, d.Notes) {
			t.Errorf("%q: the canonical line does not parse back: %v %+v", c.canon, err, again)
		}
	}
}

func TestReplyErrorsNameTheWayForward(t *testing.T) {
	doc := sample()
	for _, c := range []struct {
		rules Rules
		reply string
		want  string
	}{
		{pickRules(), "1, 9", "reply names idea 9, but there are 6 ideas"},
		{pickRules(), "1 maybe 2", `unexpected word "maybe"; write the choice (storms or midweeks), then numbers to pick`},
		{pickRules(), "1, storms", `"storms" answers the choice, so it comes first`},
		{pickRules(), "1. Notes: nonsense", `notes must look like "3: text; 5: text"`},
		{pickRules(), "1. Notes: 9: far", "a note names idea 9"},
		{pickRules(), "1. Notes: 1: .", "the note on idea 1 is empty"},
		{pickRules(), "1 @ 2", `unexpected "@"`},
		{pickRules(), "4-2", "the range 4-2 runs backwards"},
		{reviewRules(), "fix 1; later 1", "finding 1 has two verdicts, fix and later"},
		{reviewRules(), "fix; later 2", `"fix" needs numbers after it`},
		{reviewRules(), "ship 1", `unexpected word "ship"; write the choice (approve or rework), then fix, later, or skip before numbers`},
		{reviewRules(), "all, later rest", `"rest" appears twice; name the other findings by number`},
		{releaseRules(), "2", "2 needs a verdict before it: write waive or rerun 2"},
		{releaseRules(), "waive 1", "gate 1 takes no verdict; only gates with status failed or pending do"},
		{Rules{Kind: "brief", Mode: ModeNone}, "1", "the brief kind has nothing to decide"},
	} {
		_, err := ParseReply(c.reply, Items(doc, c.rules), c.rules)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%q: got %v, want %q", c.reply, err, c.want)
		}
	}
}

func TestApplyChecksTheRules(t *testing.T) {
	for _, c := range []struct {
		rules Rules
		d     Document
		want  []string
	}{
		{pickRules(), Document{Picked: []string{"nope"}, Notes: map[string]string{"z": "rows are not items"}}, []string{`/picked/0: unknown item "nope"`, "/notes/z: unknown item"}},
		{pickRules(), Document{Slug: "other", Picked: []string{"a"}}, []string{`/slug: decisions are for "other", model is "moves"`}},
		{pickRules(), Document{Path: "rebuild"}, []string{"/path: must be storms or midweeks"}},
		{pickRules(), Document{Verdicts: map[string]string{"a": "fix"}}, []string{"/verdicts: the brainstorm kind picks by number and has no verdicts"}},
		{Rules{Kind: "brainstorm", Mode: ModePick}, Document{Path: "storms"}, []string{"/path: the document has no choice to make"}},
		{reviewRules(), Document{Picked: []string{"a"}}, []string{"/picked: the review kind decides by verdict (fix, later, skip), not by picks"}},
		{reviewRules(), Document{Verdicts: map[string]string{"a": "merge", "q": "fix"}}, []string{"/verdicts/a: must be fix, later, or skip", "/verdicts/q: unknown item"}},
		{reviewRules(), Document{Kind: "plan", Verdicts: map[string]string{"a": "fix"}}, []string{"/kind: decisions are for a plan, model is a review"}},
		{releaseRules(), Document{Verdicts: map[string]string{"a": "waive"}}, []string{"/verdicts/a: gate 1 takes no verdict; only gates with status failed or pending do"}},
		{Rules{Kind: "brief", Mode: ModeNone}, Document{Notes: map[string]string{"a": "x"}}, []string{": the brief kind has nothing to decide"}},
	} {
		doc := sample()
		c.d.Schema = Schema
		got := Apply(doc, c.d, c.rules)
		var lines []string
		for _, p := range got {
			lines = append(lines, p.String())
		}
		if !reflect.DeepEqual(lines, c.want) || doc.Decisions != nil {
			t.Errorf("%+v:\n got %q\nwant %q", c.d, lines, c.want)
		}
	}
	doc := sample()
	doc.Decisions = &model.Decisions{Picked: []string{"a"}}
	if p := Apply(doc, Document{Schema: Schema, Picked: []string{}}, pickRules()); len(p) != 0 || doc.Decisions != nil {
		t.Errorf("empty decisions clear the model, got %v %+v", p, doc.Decisions)
	}
}

func TestModelChecksAndWarnings(t *testing.T) {
	doc := sample()
	doc.Decisions = &model.Decisions{Path: "ship", Verdicts: map[string]string{"a": "waive", "b": "rerun"}}
	if got := Check(doc, releaseRules()); len(got) != 1 || got[0].String() != "/decisions/verdicts/a: gate 1 takes no verdict; only gates with status failed or pending do" {
		t.Errorf("check: %v", got)
	}
	doc.Decisions.Verdicts = map[string]string{"b": "rerun"}
	warnings := Warnings(doc, releaseRules())
	if len(warnings) != 1 || !strings.Contains(warnings[0].Message, "ship goes ahead over gate 3, Gamma, which is failed and required and has no waive verdict") {
		t.Errorf("guard: %v", warnings)
	}
	doc.Decisions.Verdicts["c"] = "waive"
	if w := Warnings(doc, releaseRules()); len(w) != 0 {
		t.Errorf("a waived gate satisfies the guard: %v", w)
	}
	doc.Decisions = &model.Decisions{Path: "storms", Picked: []string{"a"}}
	if w := Warnings(doc, Rules{Kind: "brainstorm", Mode: ModePick}); len(w) != 1 || !strings.Contains(w[0].Message, `readers never see the path "storms"`) {
		t.Errorf("a path without a choice is advice: %v", w)
	}
}

func TestMarkdownParse(t *testing.T) {
	doc := sample()
	doc.Decisions = &model.Decisions{Path: "storms", Picked: []string{"b"}, Notes: map[string]string{"b": "soon"}}
	d := FromModel(doc, pickRules())
	md, err := Markdown(d, pickRules())
	if err != nil {
		t.Fatal(err)
	}
	text := string(md)
	for _, want := range []string{"# Decisions for Twelve moves", "Reply: storms, 2. Notes: 2: soon.", "Where should winter effort go first? Storm days (`storms`)", "- 2. Beta (note: soon)", "## Not picked", "```json"} {
		if !strings.Contains(text, want) {
			t.Errorf("markdown lacks %q:\n%s", want, text)
		}
	}
	parsed, err := Parse(md)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(parsed.Picked, ",") != "b" || parsed.Notes["b"] != "soon" || parsed.Slug != "moves" || parsed.Kind != "brainstorm" {
		t.Errorf("parsed %+v", parsed)
	}
	if _, err := Parse([]byte(`{"schema":"other/v1","slug":"moves","picked":[]}`)); err == nil {
		t.Error("wrong schema must fail")
	}
	if old, err := Parse([]byte(`{"schema":"dossier.decisions/v1","slug":"moves","path":"storms","picked":["a"]}`)); err != nil || old.Verdicts != nil {
		t.Errorf("documents from before verdicts still parse: %v", err)
	}

	doc.Decisions = &model.Decisions{Path: "hold", Verdicts: map[string]string{"c": "waive"}, Notes: map[string]string{"a": "passed on retry", "e": "flaky"}}
	release := FromModel(doc, releaseRules())
	md, err = Markdown(release, releaseRules())
	if err != nil {
		t.Fatal(err)
	}
	text = string(md)
	for _, want := range []string{"Reply: hold, waive 3. Notes: 1: passed on retry; 5: flaky.", "## Waive\n\n- 3. Gamma\n", "## Undecided\n\n- 2. Beta\n- 5. Epsilon (note: flaky)\n", "## Notes on other gates\n\n- 1. Alpha (note: passed on retry)\n"} {
		if !strings.Contains(text, want) {
			t.Errorf("verdict markdown lacks %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "## Rerun") {
		t.Error("verdicts nobody gave have no heading")
	}
	parsed, err = Parse(md)
	if err != nil || !reflect.DeepEqual(parsed.Verdicts, map[string]string{"c": "waive"}) {
		t.Errorf("verdicts parse back: %v %+v", err, parsed)
	}
}

// replyCases is the shared contract between this package and the reader:
// the same decisions must produce the same reply line, and the same words
// for it, in Go and in the page. The reader's test runs every case in
// testdata/replies.json.
type replyCases struct {
	Schema string      `json:"schema"`
	Note   string      `json:"note"`
	Cases  []replyCase `json:"cases"`
}

type replyCase struct {
	Name     string            `json:"name"`
	Mode     string            `json:"mode"`
	Verdicts []string          `json:"verdicts"`
	Labels   map[string]string `json:"labels"`
	Options  map[string]string `json:"options"`
	Noun     string            `json:"noun"`
	Plural   string            `json:"plural"`
	Items    []caseItem        `json:"items"`
	State    caseState         `json:"state"`
	Reply    string            `json:"reply"`
	Words    string            `json:"words"`
}

type caseItem struct {
	ID       string `json:"id"`
	N        int    `json:"n"`
	Eligible bool   `json:"eligible"`
}

type caseState struct {
	Path     string            `json:"path"`
	Picked   []string          `json:"picked"`
	Verdicts map[string]string `json:"verdicts"`
	Notes    map[string]string `json:"notes"`
}

func TestSharedReplyCases(t *testing.T) {
	doc := sample()
	type input struct {
		name  string
		rules Rules
		state caseState
	}
	inputs := []input{
		{"pick: nothing", pickRules(), caseState{}},
		{"pick: a choice alone", pickRules(), caseState{Path: "midweeks"}},
		{"pick: numbers in item order", pickRules(), caseState{Picked: []string{"e", "a", "c"}}},
		{"pick: every item is all", pickRules(), caseState{Picked: []string{"a", "b", "c", "d", "e", "f"}}},
		{"pick: choice, picks, and notes with loose whitespace", pickRules(), caseState{Path: "storms", Picked: []string{"c", "a"}, Notes: map[string]string{"c": "  keep\n the blue  accent ", "b": "not picked, still noted"}}},
		{"pick: notes on unknown items are dropped", pickRules(), caseState{Picked: []string{"a"}, Notes: map[string]string{"gone": "x", "a": " "}}},
		{"pick: one item, and a note that ends its own sentence", pickRules(), caseState{Picked: []string{"d"}, Notes: map[string]string{"d": "Smaller first!"}}},
		{"verdict: groups in kind order", reviewRules(), caseState{Verdicts: map[string]string{"f": "skip", "a": "later", "b": "fix", "c": "fix"}}},
		{"verdict: one verdict on every item is all", reviewRules(), caseState{Path: "approve", Verdicts: map[string]string{"a": "fix", "b": "fix", "c": "fix", "d": "fix", "e": "fix", "f": "fix"}}},
		{"verdict: unknown verdicts are dropped", reviewRules(), caseState{Verdicts: map[string]string{"a": "merge", "b": "later"}}},
		{"eligible: only failed or pending gates count toward all", releaseRules(), caseState{Path: "hold", Verdicts: map[string]string{"b": "rerun", "c": "rerun", "e": "rerun"}}},
		{"eligible: verdicts on other items are dropped", releaseRules(), caseState{Path: "ship", Verdicts: map[string]string{"a": "waive", "c": "waive"}, Notes: map[string]string{"a": "passed on retry"}}},
		{"verdict: notes alone", reviewRules(), caseState{Notes: map[string]string{"e": "ask the owner", "b": "fine as is"}}},
	}
	out := replyCases{Schema: "dossier.reply-cases/v1", Note: "Generated by the decisions tests (UPDATE_GOLDEN=1). The reader must write the same reply, and say it in the same words, for every case."}
	for _, in := range inputs {
		items := Items(doc, in.rules)
		d := Document{Path: in.state.Path, Picked: in.state.Picked, Verdicts: in.state.Verdicts, Notes: in.state.Notes}
		c := replyCase{Name: in.name, Mode: in.rules.Mode, Verdicts: []string{}, Labels: map[string]string{}, Options: map[string]string{},
			Noun: in.rules.Noun, Plural: in.rules.Plural, State: in.state, Reply: ReplyLine(d, items, in.rules), Words: ReplyWords(d, items, in.rules)}
		for _, v := range in.rules.Verdicts {
			c.Verdicts = append(c.Verdicts, v.ID)
			c.Labels[v.ID] = v.Label
		}
		if in.rules.Choice != nil {
			for _, o := range in.rules.Choice.Options {
				c.Options[o.ID] = o.Label
			}
		}
		for _, it := range items {
			c.Items = append(c.Items, caseItem{ID: it.ID, N: it.N, Eligible: in.rules.CanDecide(it.ID)})
		}
		if c.State.Picked == nil {
			c.State.Picked = []string{}
		}
		if c.State.Verdicts == nil {
			c.State.Verdicts = map[string]string{}
		}
		if c.State.Notes == nil {
			c.State.Notes = map[string]string{}
		}
		// Every canonical line parses back to the decisions that fit the rules.
		parsed, err := ParseReply(c.Reply, items, in.rules)
		if err != nil {
			t.Errorf("%s: %q does not parse: %v", in.name, c.Reply, err)
		} else if got := ReplyLine(parsed, items, in.rules); got != c.Reply {
			t.Errorf("%s: %q parses and writes back as %q", in.name, c.Reply, got)
		}
		out.Cases = append(out.Cases, c)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		t.Fatal(err)
	}
	golden := filepath.Join("..", "..", "testdata", "replies.json")
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile(golden, buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("no reply cases yet: %v (run with UPDATE_GOLDEN=1)", err)
	}
	if !bytes.Equal(want, buf.Bytes()) {
		t.Errorf("reply cases changed; review, then run with UPDATE_GOLDEN=1 so the reader's test sees them")
	}
}
