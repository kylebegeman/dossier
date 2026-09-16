package kinds

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/model"
	"dossier/internal/schema"
)

func load(t *testing.T, id string) Kind {
	t.Helper()
	k, err := Load(id)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func doc(kind string, items ...model.Item) *model.Document {
	return &model.Document{
		Dossier: "1.0", Kind: kind, Meta: model.Meta{Title: "t", Slug: "t"},
		Sections: []model.Section{{ID: "s", Title: "S", Board: &model.Board{Items: items}}},
	}
}

func facets(labels ...string) []model.Facet {
	var out []model.Facet
	for _, l := range labels {
		out = append(out, model.Facet{Label: l, Markdown: "x"})
	}
	return out
}

func joined(problems []model.Problem) string {
	var s []string
	for _, p := range problems {
		s = append(s, p.String())
	}
	return strings.Join(s, "\n")
}

func TestSixPresetsLoadAndValidate(t *testing.T) {
	all, err := All()
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, k := range all {
		ids = append(ids, k.ID)
		if p := k.Validate(); len(p) > 0 {
			t.Errorf("%s: %s", k.ID, joined(p))
		}
		if len(k.Facets) == 0 || len(k.Sections) == 0 || len(k.Columns) == 0 {
			t.Errorf("%s: a designed kind has facets, sections, and columns", k.ID)
		}
		if k.Limits == nil {
			t.Errorf("%s: limits are required", k.ID)
		}
	}
	if got := strings.Join(ids, ","); got != "brainstorm,brief,incident,plan,release,review" {
		t.Errorf("presets: %s", got)
	}
	if _, err := Load("nope"); err == nil {
		t.Error("an unknown kind must fail")
	}
}

func TestValidateRejectsBadPresets(t *testing.T) {
	good := load(t, "review")
	for name, mutate := range map[string]func(k *Kind){
		"reserved verdict":         func(k *Kind) { k.Decision.Verdicts[0].ID = "all" },
		"two-word verdict":         func(k *Kind) { k.Decision.Verdicts[0].ID = "fix it" },
		"verdict equals option":    func(k *Kind) { k.Decision.Choice.Options[0].ID = "fix" },
		"unknown default":          func(k *Kind) { k.Decision.Default = "merge" },
		"unknown column":           func(k *Kind) { k.Columns = append(k.Columns, "priority") },
		"column without field":     func(k *Kind) { k.Columns = append(k.Columns, "owner") },
		"group on free text":       func(k *Kind) { k.Group = "category" },
		"duplicate facet":          func(k *Kind) { k.Facets = append(k.Facets, FacetRule{Label: "where", Hint: "x"}) },
		"tone on a non-risk facet": func(k *Kind) { k.Facets[0].Tone = "violet" },
		"unnumbered with verdicts": func(k *Kind) { k.Item.Numbered = false },
		"tone outside the palette": func(k *Kind) { k.Fields.Severity.Tones["nit"] = "red" },
		"one-option choice":        func(k *Kind) { k.Decision.Choice.Options = k.Decision.Choice.Options[:1] },
		"no example reply":         func(k *Kind) { k.Decision.Example = "" },
	} {
		k := good
		k.Decision.Verdicts = append([]Verdict(nil), good.Decision.Verdicts...)
		k.Columns = append([]string(nil), good.Columns...)
		k.Facets = append([]FacetRule(nil), good.Facets...)
		choice := *good.Decision.Choice
		choice.Options = append([]model.Option(nil), good.Decision.Choice.Options...)
		k.Decision.Choice = &choice
		severity := *good.Fields.Severity
		severity.Tones = map[string]string{}
		for v, tone := range good.Fields.Severity.Tones {
			severity.Tones[v] = tone
		}
		k.Fields.Severity = &severity
		mutate(&k)
		if len(k.Validate()) == 0 {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestFacetVocabulary(t *testing.T) {
	k := load(t, "brainstorm")
	item := func(labels ...string) model.Item {
		return model.Item{ID: "a", Title: "A", Size: "minor", Effort: "S", Impact: 3, Facets: facets(labels...)}
	}
	if p := k.Check(doc("brainstorm", item("How it works", "Why", "Unlocks", "Risk"))); len(p) > 0 {
		t.Errorf("optional facets may be skipped: %s", joined(p))
	}
	for name, c := range map[string]struct {
		labels []string
		want   string
	}{
		"missing required": {[]string{"How it works", "Unlocks"}, `missing facet "Why"`},
		"out of order":     {[]string{"Why", "How it works"}, "out of order"},
		"unknown":          {[]string{"How it works", "Why", "Budget"}, "not a facet"},
		"repeated":         {[]string{"How it works", "Why", "Why"}, "appears twice"},
	} {
		if got := joined(k.Check(doc("brainstorm", item(c.labels...)))); !strings.Contains(got, c.want) {
			t.Errorf("%s: want %q in %q", name, c.want, got)
		}
	}
	if p := k.Check(doc("brainstorm", item("how it works", "WHY"))); len(p) > 0 {
		t.Errorf("labels match by slug: %s", joined(p))
	}
}

func TestFieldVocabulary(t *testing.T) {
	review := load(t, "review")
	ok := model.Item{ID: "a", Title: "A", Severity: "Blocker", Effort: "M", Category: "security", Facets: facets("Where", "Why it matters")}
	if p := review.Check(doc("review", ok)); len(p) > 0 {
		t.Errorf("valid finding: %s", joined(p))
	}
	bad := ok
	bad.Severity, bad.Size, bad.Impact, bad.Owner, bad.Required, bad.DependsOn = "critical", "minor", 3, "kyle", true, []string{"b"}
	got := joined(review.Check(doc("review", bad)))
	for _, want := range []string{"severity: must be one of blocker, major, minor, nit", "no size field", "no impact field", "no owner field", "no required field", "no dependsOn field"} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in:\n%s", want, got)
		}
	}
	incident := load(t, "incident")
	item := model.Item{ID: "a", Title: "A", Category: "prevent", Impact: 9, Facets: facets("Addresses", "What changes")}
	if got := joined(incident.Check(doc("incident", item))); !strings.Contains(got, "between 1 and 5") {
		t.Errorf("impact range: %s", got)
	}
	if review.Canonical("severity", "BLOCKER") != "blocker" || review.Tone("severity", "Blocker") != "risk" || review.Tone("severity", "nit") != "neutral" {
		t.Error("canonical values and tones match without case")
	}
	brief := load(t, "brief")
	if brief.FieldLabel("status") != "Confidence" || brief.Decides() {
		t.Error("brief labels status as Confidence and decides nothing")
	}
}

func TestRowsBoardsAreFreeForm(t *testing.T) {
	k := load(t, "brainstorm")
	d := doc("brainstorm")
	d.Sections[0].Board = &model.Board{Layout: "rows", Items: []model.Item{{ID: "r", Title: "R", Effort: "S", Facets: facets("Anything")}}}
	if p := k.Check(d); len(p) > 0 {
		t.Errorf("rows boards are not checked: %s", joined(p))
	}
}

func TestAdviseExpectedSectionsAndLimits(t *testing.T) {
	k := load(t, "brainstorm")
	d := doc("brainstorm", model.Item{ID: "a", Title: "A", Summary: strings.Repeat("s", 200), Facets: []model.Facet{{Label: "How it works", Markdown: strings.Repeat("word ", 120)}, {Label: "Why", Markdown: "x"}}})
	got := joined(k.Advise(d))
	for _, want := range []string{`expects a "Thesis" section`, "summary is 200 characters", `"How it works" is 600 characters`} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in:\n%s", want, got)
		}
	}
	if strings.Contains(got, "Also considered") {
		t.Error("optional sections are not expected")
	}
	if p := k.Check(d); len(p) != 0 {
		t.Errorf("advice is never a finding: %s", joined(p))
	}
	plan := load(t, "plan")
	phases := &model.Document{Dossier: "1.0", Kind: "plan", Meta: model.Meta{Title: "t", Slug: "t"}, Sections: []model.Section{
		{ID: "goal", Title: "Goal", Parts: []model.Part{{Type: "prose", Markdown: "x"}}},
		{ID: "phase-one", Title: "Phase one", Board: &model.Board{Items: []model.Item{{ID: "a", Title: "A"}}}},
		{ID: "phase-two", Title: "Phase two", Board: &model.Board{Items: []model.Item{{ID: "b", Title: "B"}}}},
		{ID: "verify", Title: "Verification", Parts: []model.Part{{Type: "prose", Markdown: "x"}}},
	}}
	if got := joined(plan.Advise(phases)); strings.Contains(got, "expects") {
		t.Errorf("repeated boards satisfy a repeating board section: %s", got)
	}
}

func TestSlug(t *testing.T) {
	for in, want := range map[string]string{"How it works": "how-it-works", "  Why it matters! ": "why-it-matters", "In use": "in-use"} {
		if got := Slug(in); got != want {
			t.Errorf("Slug(%q) = %q", in, got)
		}
	}
}

func TestBuiltInKindsPassTheKindSchema(t *testing.T) {
	for _, k := range Builtin().All() {
		data, err := PresetJSON(k.ID)
		if err != nil {
			t.Fatal(err)
		}
		problems, err := schema.CheckKind(data)
		if err != nil || len(problems) > 0 {
			t.Errorf("%s: %v %v", k.ID, err, problems)
		}
	}
}

func TestOpenLoadsCustomKindsFromDirectories(t *testing.T) {
	dir := t.TempDir()
	write := func(name string, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	retro, err := PresetJSON("brief")
	if err != nil {
		t.Fatal(err)
	}
	write("retro.kind.json", strings.Replace(string(retro), `"id": "brief"`, `"id": "retro"`, 1))
	write("shadow.kind.json", string(retro))
	write("broken.kind.json", `{"id":"broken","title":"B"}`)
	write("ignored.json", `{"not":"a kind"}`)
	r, problems, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := joined(problems)
	for _, want := range []string{"shadow.kind.json#/id: kind \"brief\" is built in", "broken.kind.json#"} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in:\n%s", want, got)
		}
	}
	if strings.Contains(got, "ignored.json") {
		t.Error("only *.kind.json files are kinds")
	}
	k, err := r.Load("retro")
	if err != nil || k.ID != "retro" || r.Source("retro") != filepath.Join(dir, "retro.kind.json") || r.Source("brief") != BuiltinSource {
		t.Errorf("custom kind: %+v %v %s", k.ID, err, r.Source("retro"))
	}
	if len(r.All()) != 7 {
		t.Errorf("six built-ins plus one custom kind, got %d", len(r.All()))
	}
	if Builtin().Stamp() != "" || r.Stamp() == "" {
		t.Error("stamps cover custom kind files only")
	}
	if _, _, err := Open(filepath.Join(dir, "missing")); err == nil {
		t.Error("a missing directory is an error")
	}
	if _, err := Builtin().Load("retro"); err == nil {
		t.Error("custom kinds never leak into the built-in registry")
	}
	if got := SplitDirs("a" + string(os.PathListSeparator) + " " + string(os.PathListSeparator) + "b"); strings.Join(got, ",") != "a,b" {
		t.Errorf("SplitDirs: %v", got)
	}
}
