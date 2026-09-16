package render

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/kinds"
	"dossier/internal/model"
)

func loadExample(t *testing.T, name string) (*model.Document, kinds.Kind) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", name))
	if err != nil {
		t.Fatal(err)
	}
	doc, err := model.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if problems := model.Check(doc); len(problems) > 0 {
		t.Fatalf("structure problems: %v", problems)
	}
	kind, err := kinds.Load(doc.Kind)
	if err != nil {
		t.Fatal(err)
	}
	if problems := kind.Check(doc); len(problems) > 0 {
		t.Fatalf("kind problems: %v", problems)
	}
	return doc, kind
}

func TestBudgets(t *testing.T) {
	css, js := AssetSizes()
	if css > MaxStyleBytes {
		t.Errorf("stylesheet is %d bytes, budget %d", css, MaxStyleBytes)
	}
	if js > MaxReaderBytes {
		t.Errorf("reader runtime is %d bytes, budget %d", js, MaxReaderBytes)
	}
}

func TestRenderFlagship(t *testing.T) {
	doc, kind := loadExample(t, "winter-crossing.dossier.json")
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	if !strings.HasPrefix(strings.ToLower(out), "<!doctype html>") {
		t.Errorf("artifact must start with a doctype")
	}
	for _, want := range []string{
		`<title>Ten moves for a calmer winter crossing</title>`,
		`<h1>Ten moves for a <em>calmer</em> winter crossing</h1>`,
		`id="dossier-model"`,
		`<li class="group">Minor</li>`,
		`<li class="group">Major</li>`,
		`data-item="storm-rebook" data-title="Rebook in one tap on storm days" data-decides data-num="1"`,
		`data-num="10"`,
		`class="facet risk"`,
		`<span class="chip t-teal" title="Size">minor</span>`,
		`<span class="chip t-violet" title="Size">major</span>`,
		`<span class="chip t-outline" title="Effort">Effort M</span>`,
		`aria-label="Impact 5 of 5"`,
		`<b>6</b> <span>minor</span>`,
		`<b>3</b> <span>also considered</span>`,
		`<p class="example">For example <code>storms, 2, 5, 7. Notes: 5: smaller first.</code></p>`,
		`<div class="pick" id="pick" data-mode="pick" data-verdicts="null">`,
		`<legend>What should winter build for first?</legend>`,
		`<input type="radio" name="dossier-choice" value="storms" data-choice data-label="Storm days">`,
		`<button type="button" class="clear" data-choice-clear hidden>Clear the choice</button>`,
		`<b data-live="choice">Open</b> <a href="#pick">choice</a>`,
		`<b data-live="count">0</b> <span>picked</span>`,
		`<div class="reply" data-reply>Nothing decided yet.</div>`,
		`data-hide aria-pressed="false">Hide decided</button>`,
		`<input type="search" placeholder="Search" autocomplete="off" spellcheck="false" data-search>`,
		`<span class="hits" data-hits aria-live="polite"></span>`,
		`<p class="no-hits" data-no-hits hidden>`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output lacks %q", want)
		}
	}
	for _, forbidden := range []string{`src="http`, `href="http`, "https://cdn", "<script src=", "@import", "url(http"} {
		if strings.Contains(out, forbidden) {
			t.Errorf("artifact must not reference external resources, found %q", forbidden)
		}
	}
	if strings.Count(out, `<details class="item"`) != 10 {
		t.Errorf("expected 10 item details, got %d", strings.Count(out, `<details class="item"`))
	}
	if strings.Count(out, `class="part rows"`) != 1 {
		t.Errorf("expected one rows board")
	}
	if len(html) > 120<<10 {
		t.Errorf("artifact is %d bytes, over the 120 KB typical budget", len(html))
	}
}

// TestKindsShapeTheBoard renders one small document per decision shape: a
// verdict kind has verdict controls instead of picks, a release lets only
// failed and pending gates take one, and an unnumbered kind has no numbers,
// decisions, or decision block.
func TestKindsShapeTheBoard(t *testing.T) {
	facets := func(labels ...string) []model.Facet {
		var out []model.Facet
		for _, l := range labels {
			out = append(out, model.Facet{Label: l, Markdown: "x"})
		}
		return out
	}
	var decided *model.Decisions
	render := func(kindID string, meta model.Meta, sections ...model.Section) string {
		t.Helper()
		kind, err := kinds.Load(kindID)
		if err != nil {
			t.Fatal(err)
		}
		doc := &model.Document{Dossier: "1.0", Kind: kindID, Meta: meta, Sections: sections, Decisions: decided}
		if p := model.Check(doc); len(p) > 0 {
			t.Fatalf("%s: %v", kindID, p)
		}
		if p := kind.Check(doc); len(p) > 0 {
			t.Fatalf("%s: %v", kindID, p)
		}
		html, err := Render(doc, kind)
		if err != nil {
			t.Fatal(err)
		}
		return markupOnly(string(html))
	}

	review := render("review", model.Meta{Title: "Review", Slug: "r", Facts: []model.Fact{{Label: "revision", Value: "a1b2c3"}, {Label: "risk", Value: "high", Tone: "risk"}}},
		model.Section{ID: "findings", Title: "Findings", Board: &model.Board{Summary: true, Items: []model.Item{
			{ID: "leak", Title: "Token in logs", Severity: "blocker", Effort: "S", Category: "security", Facets: facets("Where", "Why it matters")},
			{ID: "typo", Title: "Typo", Severity: "nit", Facets: facets("Where", "Why it matters")},
		}}})
	for _, want := range []string{
		`<b>a1b2c3</b> <span>revision</span>`,
		`<div class="t-risk"><b>high</b> <span>risk</span>`,
		`<div class="t-risk"><b>1</b> <span>blocker</span>`,
		`<li class="group">Blocker</li>`,
		`<span class="chip t-risk" title="Severity">blocker</span>`,
		`<span class="chip t-outline" title="Category">security</span>`,
		`<th>Finding</th>`,
		`<th>Severity</th>`,
		`data-num="2"`,
		`<span class="verdicts" role="radiogroup" aria-label="Verdict on 1"><button type="button" role="radio" class="t-teal" data-verdict="fix" aria-checked="false" tabindex="0">Fix</button><button type="button" role="radio" class="t-violet" data-verdict="later" aria-checked="false" tabindex="-1">Later</button>`,
		`<th class="vd">Verdict</th>`,
		`<select class="verdict" data-verdict-row="leak" aria-label="Verdict on 1, Token in logs"><option value="">Undecided</option> <option value="fix">Fix</option>`,
		`<div class="pick" id="pick" data-mode="verdict" data-verdicts="[{&#34;id&#34;:&#34;fix&#34;,&#34;label&#34;:&#34;Fix&#34;,&#34;tone&#34;:&#34;teal&#34;}`,
		`<legend>Approve or rework?</legend>`,
		`<b data-live="count">0</b> <span>decided</span>`,
	} {
		if !strings.Contains(review, want) {
			t.Errorf("review lacks %q", want)
		}
	}
	if strings.Contains(review, "data-pick") {
		t.Error("a verdict kind has no pick controls")
	}

	decided = &model.Decisions{Path: "rework", Verdicts: map[string]string{"typo": "later"}, Notes: map[string]string{"leak": "rotate the token"}}
	ruled := render("review", model.Meta{Title: "Review", Slug: "r"},
		model.Section{ID: "findings", Title: "Findings", Board: &model.Board{Summary: true, Items: []model.Item{
			{ID: "leak", Title: "Token in logs", Severity: "blocker", Facets: facets("Where", "Why it matters")},
			{ID: "typo", Title: "Typo", Severity: "nit", Facets: facets("Where", "Why it matters")},
		}}})
	for _, want := range []string{
		`data-item="typo" data-title="Typo" data-decides data-num="2" data-tone="violet"`,
		`data-verdict="later" aria-checked="true" tabindex="0">Later</button>`,
		`data-verdict="fix" aria-checked="false" tabindex="-1">Fix</button>`,
		`<tr data-item="typo" class="" data-tone="violet">`,
		`<option value="later" selected>Later</option>`,
		`<li data-item="typo" class="" data-tone="violet"><a href="#typo"><span class="n">2.</span>Typo<span class="sr">, Later</span>`,
		`<input type="radio" name="dossier-choice" value="rework" data-choice data-label="Rework" checked>`,
		`<b data-live="choice">Rework</b>`,
		`<b data-live="count">1</b> <span>decided</span>`,
		`<div class="reply" data-reply>rework, later 2. Notes: 1: rotate the token.</div>`,
	} {
		if !strings.Contains(ruled, want) {
			t.Errorf("decided review lacks %q", want)
		}
	}
	decided = nil

	release := render("release", model.Meta{Title: "Release", Slug: "rel"},
		model.Section{ID: "gates", Title: "Gates", Board: &model.Board{Summary: true, Items: []model.Item{
			{ID: "unit", Title: "Unit tests", Status: "passed", Required: true, Facets: facets("How checked", "Result")},
			{ID: "arm", Title: "arm64 build", Status: "failed", Required: true, Facets: facets("How checked", "Result")},
		}}})
	for _, want := range []string{
		`data-item="unit" data-title="Unit tests" data-num="1">`,
		`data-item="arm" data-title="arm64 build" data-decides data-num="2">`,
		`<td class="vd"><span class="none">No verdict needed</span></td>`,
		`aria-label="Verdict on 2"`,
		`<legend>Ship or hold?</legend>`,
	} {
		if !strings.Contains(release, want) {
			t.Errorf("release lacks %q", want)
		}
	}
	if strings.Contains(release, `aria-label="Verdict on 1"`) {
		t.Error("a passed gate takes no verdict")
	}

	brief := render("brief", model.Meta{Title: "Brief", Slug: "b"},
		model.Section{ID: "findings", Title: "Findings", Board: &model.Board{Summary: true, Items: []model.Item{
			{ID: "one", Title: "One", Status: "verified", Facets: facets("Detail")},
			{ID: "two", Title: "Two", Status: "open", Facets: facets("Detail", "So what")},
		}}})
	for _, want := range []string{`<span class="chip t-teal" title="Confidence">Confidence verified</span>`, `<th>Confidence</th>`, `<span class="n">–</span>One`, `Expand all`} {
		if !strings.Contains(brief, want) {
			t.Errorf("brief lacks %q", want)
		}
	}
	for _, forbidden := range []string{"data-num", `class="pick"`, "data-note", `class="num"`} {
		if strings.Contains(brief, forbidden) {
			t.Errorf("an unnumbered brief must not render %q", forbidden)
		}
	}

	plan := render("plan", model.Meta{Title: "Plan", Slug: "p"},
		model.Section{ID: "phase-one", Title: "Phase one", Board: &model.Board{Items: []model.Item{{ID: "a", Title: "A", Status: "doing", Owner: "Mira", Facets: facets("What changes", "Done when")}}}},
		model.Section{ID: "phase-two", Title: "Phase two", Board: &model.Board{Items: []model.Item{{ID: "b", Title: "B", Status: "blocked", DependsOn: []string{"a"}, Facets: facets("What changes", "Done when")}}}})
	for _, want := range []string{`<li class="group">Phase one</li>`, `<li class="group">Phase two</li>`, `data-item="b" data-title="B" data-decides data-num="2"`, `<span class="owner" title="Owner"><span class="sr">Owner: </span>Mira</span>`, `<span class="chip t-risk" title="Status">blocked</span>`, `<b>2</b> <span>steps</span>`} {
		if !strings.Contains(plan, want) {
			t.Errorf("plan lacks %q", want)
		}
	}
}

func TestRenderIsDeterministic(t *testing.T) {
	doc, kind := loadExample(t, "winter-crossing.dossier.json")
	a, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Error("two renders of the same model differ")
	}
}

func TestGolden(t *testing.T) {
	doc, kind := loadExample(t, "winter-crossing.dossier.json")
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	golden := filepath.Join("..", "..", "testdata", "winter-crossing.html")
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile(golden, html, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Skipf("no golden yet: %v (run with UPDATE_GOLDEN=1)", err)
	}
	if !bytes.Equal(html, want) {
		t.Errorf("output differs from golden; run with UPDATE_GOLDEN=1 after reviewing the change")
	}
}

func TestEmbedJSONEscapesScriptClose(t *testing.T) {
	doc := &model.Document{Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "x </script><b>", Slug: "x"}}
	s, err := embedJSON(doc)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(s, "</script") || strings.Contains(s, "<b>") {
		t.Errorf("embedded JSON must escape HTML: %s", s)
	}
}

func TestInlineStripsParagraph(t *testing.T) {
	h, err := inline("a **b** c")
	if err != nil {
		t.Fatal(err)
	}
	if h != "a <strong>b</strong> c" {
		t.Errorf("got %q", h)
	}
}

func mediaDoc() *model.Document {
	return &model.Document{Dossier: "1.0", Kind: "brainstorm", Meta: model.Meta{Title: "Media", Slug: "media"}, Sections: []model.Section{{ID: "m", Title: "Media", Parts: []model.Part{
		{Type: "code", Lang: "go", Title: "main.go", Code: "package main\n\nfunc main() { println(\"hi\") }\n"},
		{Type: "code", Lang: "nosuchlang", Code: "<b>plain</b>"},
		{Type: "prose", Markdown: "Text.\n\n```js\nconst x = 1;\n```\n"},
		{Type: "figure", Src: "images/pic.png", Alt: "A picture", Caption: "The *caption*."},
		{Type: "figure", Src: "data:image/svg+xml,%3Csvg%3E"},
		{Type: "figure", Src: "images/missing.png"},
		{Type: "diagram", Source: "flowchart LR\n  A --> B", Format: "mermaid", Title: "Loop"},
		{Type: "chart", Title: "Adoption", Data: []model.Point{{Label: "Q1", Value: 12}, {Label: "Q2", Value: 1500.5}}},
		{Type: "chart", Variant: "area", Data: []model.Point{{Label: "Jan", Value: 4}, {Label: "Feb", Value: -2}}},
	}}}}
}

func TestRenderMediaParts(t *testing.T) {
	doc := mediaDoc()
	kind, err := kinds.Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "images", "pic.png"), []byte("PNG!"), 0o644); err != nil {
		t.Fatal(err)
	}
	figures, warnings := InlineFigures(doc, dir)
	if len(warnings) != 1 || !strings.Contains(warnings[0].Message, "missing.png") {
		t.Errorf("expected one warning for the missing image, got %v", warnings)
	}
	html, err := RenderWith(doc, kind, Options{Figures: figures})
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	for _, want := range []string{
		`<span class="hl-kn">package</span>`,
		`<div class="block-label"><span>main.go</span></div>`,
		`&lt;b&gt;plain&lt;/b&gt;`,
		`<div class="part prose"><p>Text.</p>
<pre class="hl"><code><span class="hl-`,
		`>const</span>`,
		`<img src="data:image/png;base64,UE5HIQ==" alt="A picture" loading="lazy">`,
		`<figcaption class="legend">The <em>caption</em>.</figcaption>`,
		`<img src="data:image/svg+xml,%3Csvg%3E" alt="" loading="lazy">`,
		`<img src="images/missing.png"`,
		`data-format="mermaid"`,
		`<span>mermaid</span>`,
		`<span>Loop</span>`,
		`flowchart LR`,
		`role="img" aria-label="Adoption"`,
		`<title>Q2: 1,500.5</title>`,
		`aria-label="area chart"`,
		`<polygon points=`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output lacks %q", want)
		}
	}
	if strings.Contains(out, `src="images/pic.png"`) {
		t.Error("inlined figure must not keep the relative path on the img")
	}
	if !strings.Contains(out, `"src":"images/pic.png"`) {
		t.Error("model island must keep the original figure path")
	}
	again, err := RenderWith(doc, kind, Options{Figures: figures})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(html, again) {
		t.Error("media render is not deterministic")
	}
}

func TestFormatNumber(t *testing.T) {
	for in, want := range map[float64]string{0: "0", 12: "12", 1500.5: "1,500.5", -1234567: "-1,234,567", 999.99: "999.99"} {
		if got := formatNumber(in); got != want {
			t.Errorf("formatNumber(%v) = %q, want %q", in, got, want)
		}
	}
}

// TestGoldenShowcase renders the full-coverage 0.6 fixture through the alias
// pass and compares it to its golden.
func TestGoldenShowcase(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "legacy", "showcase.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	upgraded, _, ok, err := model.Normalize(data)
	if err != nil || !ok {
		t.Fatalf("normalize: %v %v", err, ok)
	}
	doc, err := model.Decode(bytes.NewReader(upgraded))
	if err != nil {
		t.Fatal(err)
	}
	kind, err := kinds.Load(doc.Kind)
	if err != nil {
		t.Fatal(err)
	}
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	for _, want := range []string{`<figure class="part figure">`, `data-format="mermaid"`, `data-format="dot"`, `<polygon points=`, `<rect x=`, `<span class="hl-`, `<details class="row" id=`, `class="part callout"`} {
		if !strings.Contains(out, want) {
			t.Errorf("showcase lacks %q", want)
		}
	}
	for _, forbidden := range []string{"https://cdn", "<script src="} {
		if strings.Contains(out, forbidden) {
			t.Errorf("showcase must not reference external resources, found %q", forbidden)
		}
	}
	golden := filepath.Join("..", "..", "testdata", "showcase.html")
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile(golden, html, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Skipf("no golden yet: %v (run with UPDATE_GOLDEN=1)", err)
	}
	if !bytes.Equal(html, want) {
		t.Errorf("showcase differs from golden; run with UPDATE_GOLDEN=1 after reviewing the change")
	}
}

func TestStudioMarksEditableFieldsAndInjectsFirst(t *testing.T) {
	doc, kind := loadExample(t, "winter-crossing.dossier.json")
	html, err := RenderWith(doc, kind, Options{Studio: &Studio{Inject: `<script id="studio-probe"></script>`}})
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	for _, want := range []string{
		`<h1 data-edit="/meta/title">`,
		`<p class="lede" data-edit="/meta/lede">`,
		`<h2 data-edit="/sections/thesis/title">`,
		`<div class="part prose" data-edit="/sections/thesis/parts/0/markdown">`,
		`<h3 data-edit="/items/storm-rebook/title">`,
		`<p class="one-line" data-edit="/items/storm-rebook/summary">`,
		`<dd data-edit="/items/storm-rebook/facets/0/markdown">`,
		`<b data-edit="/items/shelter-seats/title">`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("studio render lacks %q", want)
		}
	}
	probe, model, reader := strings.Index(out, `id="studio-probe"`), strings.Index(out, `id="dossier-model"`), strings.LastIndex(out, "<script>\n")
	if !(model < probe && probe < reader) {
		t.Errorf("studio must be injected after the model island and before the reader: model=%d studio=%d reader=%d", model, probe, reader)
	}
	plain, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(plain), "data-edit") || strings.Contains(string(plain), "studio-probe") {
		t.Error("an artifact must carry no studio hooks")
	}
}

// markupOnly drops the embedded model and scripts, so assertions about the
// page's markup are not fooled by selector strings in the reader runtime.
func markupOnly(html string) string {
	for {
		start := strings.Index(html, "<script")
		if start < 0 {
			return html
		}
		end := strings.Index(html[start:], "</script>")
		if end < 0 {
			return html[:start]
		}
		html = html[:start] + html[start+end+len("</script>"):]
	}
}

func TestExampleRepliesFollowTheDocumentsChoice(t *testing.T) {
	review, err := kinds.Load("review")
	if err != nil {
		t.Fatal(err)
	}
	brainstorm, err := kinds.Load("brainstorm")
	if err != nil {
		t.Fatal(err)
	}
	merge := &model.Choice{Question: "Merge?", Options: []model.Option{{ID: "merge", Label: "Merge"}, {ID: "block", Label: "Block"}}}
	doc := &model.Document{Kind: "review"}
	if got := exampleReply(review, review.Rules(doc)); got != "rework, fix 1, 2; later 4; skip 6. Notes: 4: after the release." {
		t.Errorf("the kind's own choice keeps its example: %q", got)
	}
	doc.Choice = merge
	if got := exampleReply(review, review.Rules(doc)); got != "merge, fix 1, 2; later 4; skip 6. Notes: 4: after the release." {
		t.Errorf("a replaced choice answers with the document's option: %q", got)
	}
	if got := exampleReply(brainstorm, brainstorm.Rules(&model.Document{Kind: "brainstorm"})); got != "2, 5, 7. Notes: 5: smaller first." {
		t.Errorf("no choice, no prefix: %q", got)
	}
	if got := exampleReply(brainstorm, brainstorm.Rules(&model.Document{Kind: "brainstorm", Choice: merge})); got != "merge, 2, 5, 7. Notes: 5: smaller first." {
		t.Errorf("a document question goes first: %q", got)
	}
	release, err := kinds.Load("release")
	if err != nil {
		t.Fatal(err)
	}
	release.Decision.Example = "Hold."
	if got := exampleReply(release, release.Rules(&model.Document{Kind: "release"})); got != "Hold." {
		t.Errorf("an example that is only the choice stays: %q", got)
	}
	if got := exampleReply(release, release.Rules(&model.Document{Kind: "release", Choice: merge})); got != "merge." {
		t.Errorf("an example that is only the kind's choice takes the document's: %q", got)
	}
}

func TestAccentAddsTheDerivedPalette(t *testing.T) {
	doc, kind := loadExample(t, "winter-crossing.dossier.json")
	plain, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(plain), "meta.theme.accent") {
		t.Error("no accent, no override")
	}
	doc.Meta.Theme = &model.Theme{Accent: "#2563eb"}
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	out := string(html)
	style := out[:strings.Index(out, "</style>")]
	for _, want := range []string{"/* accent from meta.theme.accent */", ":root { --accent: #2563eb; --accent-ink: #ffffff; --accent-soft: #e9f1ff; }", `:root[data-theme="dark"] { --accent: #73a2ff;`} {
		if !strings.Contains(style, want) {
			t.Errorf("the stylesheet lacks %q", want)
		}
	}
	if strings.Index(style, "/* accent from meta.theme.accent */") < strings.Index(style, "/* Dossier tokens.") {
		t.Error("the palette follows the tokens so it wins")
	}
}

func TestTimelineRendersTimesTonesAndMarkdown(t *testing.T) {
	kind, err := kinds.Load("incident")
	if err != nil {
		t.Fatal(err)
	}
	doc := &model.Document{Dossier: "1.0", Kind: "incident", Meta: model.Meta{Title: "Incident", Slug: "i"}, Sections: []model.Section{{ID: "timeline", Title: "Timeline", Parts: []model.Part{{Type: "timeline", Events: []model.Event{
		{At: "07:40", Title: "Two cars booked into one space", Markdown: "The **07:40** sailing sold space 14 twice.", Tone: "risk"},
		{At: "Day 2", Title: "Refunds sent"},
		{At: "2026-01-14 09:05", Title: "Fix deployed", Tone: "teal"},
	}}}}}}
	html, err := Render(doc, kind)
	if err != nil {
		t.Fatal(err)
	}
	out := markupOnly(string(html))
	for _, want := range []string{
		`<ol class="part timeline"><li data-tone="risk"><time class="at" datetime="07:40">07:40</time><div class="ev"><b>Two cars booked into one space</b> <div class="md"><p>The <strong>07:40</strong> sailing sold space 14 twice.</p></div></div></li>`,
		`<li><span class="at">Day 2</span><div class="ev"><b>Refunds sent</b> </div></li>`,
		`<time class="at" datetime="2026-01-14T09:05">2026-01-14 09:05</time>`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("timeline lacks %q", want)
		}
	}
	for at, want := range map[string]string{"07:40": "07:40", "7:40": "07:40", "2026-01-14": "2026-01-14", "2026-01-14T09:05": "2026-01-14T09:05", "2026-01-14T09:05:00Z": "2026-01-14T09:05:00Z", "Tuesday": ""} {
		if got := dateTime(at); got != want {
			t.Errorf("dateTime(%q) = %q, want %q", at, got, want)
		}
	}
}
