// Package kinds loads kind presets and applies their rules to a document. A
// kind is dossier.kind/v1: what its items are called and whether they are
// numbered, which item fields they carry and their vocabularies, the facets in
// fixed order, the sections a document is expected to have, the summary
// columns and grouping, and how the reader decides.
package kinds

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"

	"dossier/internal/model"
)

//go:embed presets/*.json
var presets embed.FS

// Kind is one preset.
type Kind struct {
	Schema   string        `json:"$schema,omitempty"`
	ID       string        `json:"id"`
	Title    string        `json:"title"`
	Summary  string        `json:"summary"`
	Item     ItemRule      `json:"item"`
	Fields   Fields        `json:"fields"`
	Facets   []FacetRule   `json:"facets"`
	Sections []SectionRule `json:"sections"`
	Columns  []string      `json:"columns"`
	Legend   string        `json:"legend,omitempty"`
	Group    string        `json:"group,omitempty"`
	Decision Decision      `json:"decision"`
	Limits   *Limits       `json:"limits,omitempty"`
}

// ItemRule names the kind's items and says whether they are numbered.
type ItemRule struct {
	Noun     string `json:"noun"`
	Plural   string `json:"plural"`
	Numbered bool   `json:"numbered"`
}

// Fields lists the item fields a kind's items may carry. A nil field is not
// part of the kind; an item that sets it is a finding.
type Fields struct {
	Size      *Field  `json:"size,omitempty"`
	Category  *Field  `json:"category,omitempty"`
	Severity  *Field  `json:"severity,omitempty"`
	Status    *Field  `json:"status,omitempty"`
	Effort    *Field  `json:"effort,omitempty"`
	Impact    *Range  `json:"impact,omitempty"`
	Owner     *Field  `json:"owner,omitempty"`
	Required  *Toggle `json:"required,omitempty"`
	DependsOn *Toggle `json:"dependsOn,omitempty"`
}

// Field is an enumerated field with ordered values, or free text.
type Field struct {
	Label  string            `json:"label,omitempty"`
	Values []string          `json:"values,omitempty"`
	Tones  map[string]string `json:"tones,omitempty"`
	Text   bool              `json:"text,omitempty"`
}

// Range is an inclusive integer range.
type Range struct {
	Label string `json:"label,omitempty"`
	Min   int    `json:"min"`
	Max   int    `json:"max"`
}

// Toggle is a field that is either part of the kind or not.
type Toggle struct {
	Label string `json:"label,omitempty"`
}

// FacetRule is one facet in the kind's fixed order.
type FacetRule struct {
	Label    string `json:"label"`
	Required bool   `json:"required,omitempty"`
	Tone     string `json:"tone,omitempty"`
	Hint     string `json:"hint"`
}

// SectionRule is a section a document of this kind is expected to have.
type SectionRule struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Hint     string `json:"hint"`
	Board    bool   `json:"board,omitempty"`
	Repeat   bool   `json:"repeat,omitempty"`
	Layout   string `json:"layout,omitempty"`
	Optional bool   `json:"optional,omitempty"`
}

// Decision says how the reader decides.
type Decision struct {
	Mode     string              `json:"mode"`
	Verdicts []Verdict           `json:"verdicts,omitempty"`
	Default  string              `json:"default,omitempty"`
	When     map[string][]string `json:"when,omitempty"`
	Choice   *model.Choice       `json:"choice,omitempty"`
	Title    string              `json:"title,omitempty"`
	Markdown string              `json:"markdown,omitempty"`
	Example  string              `json:"example,omitempty"`
}

// Verdict is one ruling a reader can give an item.
type Verdict struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Tone  string `json:"tone"`
}

// Limits are conciseness advice in characters. Exceeding them is a warning,
// never an error: a document still builds, but the agent is told to tighten.
type Limits struct {
	Summary int `json:"summary,omitempty"`
	Facet   int `json:"facet,omitempty"`
	Event   int `json:"event,omitempty"`
}

// Decision modes.
const (
	ModePick    = "pick"
	ModeVerdict = "verdict"
	ModeNone    = "none"
)

// FieldNames are the item fields a kind can declare, in display order.
var FieldNames = []string{"size", "category", "severity", "status", "effort", "impact", "owner", "required", "dependsOn"}

// ColumnNames are the summary table columns a kind can list.
var ColumnNames = []string{"number", "title", "size", "category", "severity", "status", "effort", "impact", "owner", "required", "dependsOn", "decision"}

// Reserved words cannot be verdict or choice ids, because replies use them.
var Reserved = []string{"all", "rest", "nothing", "none", "notes"}

var (
	idPattern   = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
	wordPattern = regexp.MustCompile(`^[a-z]{1,24}$`)
)

// All returns every embedded preset, sorted by id.
func All() ([]Kind, error) {
	entries, err := fs.ReadDir(presets, "presets")
	if err != nil {
		return nil, err
	}
	var out []Kind
	for _, e := range entries {
		data, err := presets.ReadFile("presets/" + e.Name())
		if err != nil {
			return nil, err
		}
		k, err := Parse(data)
		if err != nil {
			return nil, fmt.Errorf("presets/%s: %w", e.Name(), err)
		}
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Load returns the built-in preset with the given id.
func Load(id string) (Kind, error) {
	data, err := presets.ReadFile("presets/" + id + ".json")
	if err != nil {
		return Kind{}, fmt.Errorf("unknown kind %q", id)
	}
	k, err := Parse(data)
	if err != nil {
		return Kind{}, fmt.Errorf("presets/%s.json: %w", id, err)
	}
	return k, nil
}

// PresetJSON returns a built-in preset's source, for schema tests.
func PresetJSON(id string) ([]byte, error) { return presets.ReadFile("presets/" + id + ".json") }

// Parse decodes a preset strictly and checks it.
func Parse(data []byte) (Kind, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var k Kind
	if err := dec.Decode(&k); err != nil {
		return Kind{}, err
	}
	if problems := k.Validate(); len(problems) > 0 {
		return Kind{}, &InvalidError{Problems: problems}
	}
	return k, nil
}

// InvalidError reports a preset that decoded but broke the preset rules.
type InvalidError struct {
	Problems []model.Problem
}

func (e *InvalidError) Error() string {
	var msgs []string
	for _, p := range e.Problems {
		msgs = append(msgs, p.String())
	}
	return "invalid kind: " + strings.Join(msgs, "; ")
}

// Validate checks a preset against the rules the JSON Schema cannot state.
func (k Kind) Validate() []model.Problem {
	var out []model.Problem
	add := func(path, format string, args ...any) {
		out = append(out, model.Problem{Path: path, Message: fmt.Sprintf(format, args...)})
	}
	if !idPattern.MatchString(k.ID) {
		add("/id", "must be lowercase letters, digits, and hyphens")
	}
	if strings.TrimSpace(k.Title) == "" || strings.TrimSpace(k.Summary) == "" {
		add("", "title and summary are required")
	}
	if strings.TrimSpace(k.Item.Noun) == "" || strings.TrimSpace(k.Item.Plural) == "" {
		add("/item", "noun and plural are required")
	}
	for _, name := range []string{"size", "category", "severity", "status", "effort", "owner"} {
		f := k.field(name)
		if f == nil {
			continue
		}
		fp := "/fields/" + name
		switch {
		case f.Text && len(f.Values) > 0:
			add(fp, "is either free text or a list of values, not both")
		case !f.Text && len(f.Values) == 0:
			add(fp, "needs values or text")
		}
		if name == "owner" && !f.Text {
			add(fp, "owner is free text")
		}
		seen := map[string]bool{}
		for _, v := range f.Values {
			if strings.TrimSpace(v) == "" || seen[strings.ToLower(v)] {
				add(fp+"/values", "values must be non-empty and unique")
			}
			seen[strings.ToLower(v)] = true
		}
		for v, tone := range f.Tones {
			if !seen[strings.ToLower(v)] {
				add(fp+"/tones", "%q is not one of the values", v)
			}
			if !contains(model.Tones, tone) {
				add(fp+"/tones/"+v, "must be one of %s", strings.Join(model.Tones, ", "))
			}
		}
	}
	if r := k.Fields.Impact; r != nil && r.Min >= r.Max {
		add("/fields/impact", "min must be below max")
	}
	slugs := map[string]bool{}
	for i, f := range k.Facets {
		fp := fmt.Sprintf("/facets/%d", i)
		if strings.TrimSpace(f.Label) == "" || strings.TrimSpace(f.Hint) == "" {
			add(fp, "label and hint are required")
		}
		if s := Slug(f.Label); slugs[s] {
			add(fp+"/label", "%q repeats another facet", f.Label)
		} else {
			slugs[s] = true
		}
		if f.Tone != "" && f.Tone != "risk" {
			add(fp+"/tone", "only risk facets carry a tone")
		}
	}
	sectionIDs := map[string]bool{}
	boards := 0
	for i, s := range k.Sections {
		sp := fmt.Sprintf("/sections/%d", i)
		if !idPattern.MatchString(s.ID) || sectionIDs[s.ID] {
			add(sp+"/id", "must be a unique id")
		}
		sectionIDs[s.ID] = true
		if strings.TrimSpace(s.Title) == "" || strings.TrimSpace(s.Hint) == "" {
			add(sp, "title and hint are required")
		}
		if s.Layout != "" && s.Layout != "rows" {
			add(sp+"/layout", "must be rows or omitted")
		}
		if s.Board && s.Layout == "rows" {
			add(sp, "a section is a board or rows, not both")
		}
		if s.Repeat && !s.Board {
			add(sp+"/repeat", "only boards repeat")
		}
		if s.Board {
			boards++
		}
	}
	if boards > 1 {
		add("/sections", "one board section at most; use repeat for phases")
	}
	for i, c := range k.Columns {
		cp := fmt.Sprintf("/columns/%d", i)
		switch {
		case !contains(ColumnNames, c):
			add(cp, "must be one of %s", strings.Join(ColumnNames, ", "))
		case c == "number" && !k.Item.Numbered:
			add(cp, "unnumbered items have no number column")
		case c == "decision" && k.Decision.Mode == ModeNone:
			add(cp, "a kind without decisions has no decision column")
		case contains(FieldNames, c) && !k.HasField(c):
			add(cp, "%q is not one of the kind's fields", c)
		}
	}
	switch g := k.Group; {
	case g == "" || g == "section":
	case !contains([]string{"size", "category", "severity", "status"}, g):
		add("/group", "must be section or an enumerated field")
	case k.field(g) == nil || len(k.field(g).Values) == 0:
		add("/group", "%q is not an enumerated field of the kind", g)
	}
	k.validateDecision(add)
	return out
}

func (k Kind) validateDecision(add func(string, string, ...any)) {
	d := k.Decision
	dp := "/decision"
	switch d.Mode {
	case ModePick, ModeVerdict:
		if !k.Item.Numbered {
			add(dp+"/mode", "unnumbered items cannot be decided by number")
		}
		if strings.TrimSpace(d.Title) == "" || strings.TrimSpace(d.Markdown) == "" || strings.TrimSpace(d.Example) == "" {
			add(dp, "title, markdown, and an example reply are required")
		}
	case ModeNone:
		if len(d.Verdicts) > 0 || d.Default != "" || len(d.When) > 0 || d.Choice != nil || d.Title != "" || d.Markdown != "" || d.Example != "" {
			add(dp, "a kind without decisions declares nothing else about them")
		}
		return
	default:
		add(dp+"/mode", "must be pick, verdict, or none")
		return
	}
	if d.Mode == ModePick && (len(d.Verdicts) > 0 || d.Default != "" || len(d.When) > 0) {
		add(dp, "pick kinds have no verdicts")
	}
	if d.Mode == ModeVerdict && len(d.Verdicts) == 0 {
		add(dp+"/verdicts", "verdict kinds need at least one verdict")
	}
	words := map[string]string{}
	claim := func(path, id string) {
		switch {
		case !wordPattern.MatchString(id):
			add(path, "%q must be one lowercase word", id)
		case contains(Reserved, id):
			add(path, "%q is reserved in replies", id)
		case words[id] != "":
			add(path, "%q is already used at %s", id, words[id])
		default:
			words[id] = path
		}
	}
	for i, v := range d.Verdicts {
		vp := fmt.Sprintf("%s/verdicts/%d", dp, i)
		claim(vp+"/id", v.ID)
		if strings.TrimSpace(v.Label) == "" {
			add(vp+"/label", "is required")
		}
		if !contains(model.Tones, v.Tone) {
			add(vp+"/tone", "must be one of %s", strings.Join(model.Tones, ", "))
		}
	}
	if d.Default != "" && !k.IsVerdict(d.Default) {
		add(dp+"/default", "%q is not one of the verdicts", d.Default)
	}
	for field, values := range d.When {
		f := k.field(field)
		if f == nil || len(f.Values) == 0 {
			add(dp+"/when/"+field, "is not an enumerated field of the kind")
			continue
		}
		for _, v := range values {
			if !containsFold(f.Values, v) {
				add(dp+"/when/"+field, "%q is not one of its values", v)
			}
		}
	}
	if d.Choice != nil {
		for _, p := range CheckChoice(d.Choice) {
			add(dp+"/choice"+p.Path, "%s", p.Message)
		}
		for i, o := range d.Choice.Options {
			claim(fmt.Sprintf("%s/choice/options/%d/id", dp, i), o.ID)
		}
	}
}

// CheckChoice validates a choice's shape: a question and two to six options
// with one-word ids.
func CheckChoice(c *model.Choice) []model.Problem {
	var out []model.Problem
	if strings.TrimSpace(c.Question) == "" {
		out = append(out, model.Problem{Path: "/question", Message: "is required"})
	}
	if len(c.Options) < 2 || len(c.Options) > 6 {
		out = append(out, model.Problem{Path: "/options", Message: "a choice has two to six options"})
	}
	seen := map[string]bool{}
	for i, o := range c.Options {
		op := fmt.Sprintf("/options/%d", i)
		if !wordPattern.MatchString(o.ID) || contains(Reserved, o.ID) || seen[o.ID] {
			out = append(out, model.Problem{Path: op + "/id", Message: fmt.Sprintf("%q must be a unique lowercase word that is not reserved", o.ID)})
		}
		seen[o.ID] = true
		if strings.TrimSpace(o.Label) == "" {
			out = append(out, model.Problem{Path: op + "/label", Message: "is required"})
		}
	}
	return out
}

func (k Kind) field(name string) *Field {
	switch name {
	case "size":
		return k.Fields.Size
	case "category":
		return k.Fields.Category
	case "severity":
		return k.Fields.Severity
	case "status":
		return k.Fields.Status
	case "effort":
		return k.Fields.Effort
	case "owner":
		return k.Fields.Owner
	}
	return nil
}

// Field returns an enumerated or free-text field of the kind, or nil.
func (k Kind) Field(name string) *Field { return k.field(name) }

// HasField reports whether the kind declares the named item field.
func (k Kind) HasField(name string) bool {
	switch name {
	case "impact":
		return k.Fields.Impact != nil
	case "required":
		return k.Fields.Required != nil
	case "dependsOn":
		return k.Fields.DependsOn != nil
	}
	return k.field(name) != nil
}

// FieldLabel is the display name of a field.
func (k Kind) FieldLabel(name string) string {
	switch name {
	case "impact":
		if k.Fields.Impact != nil && k.Fields.Impact.Label != "" {
			return k.Fields.Impact.Label
		}
		return "Impact"
	case "required":
		if k.Fields.Required != nil && k.Fields.Required.Label != "" {
			return k.Fields.Required.Label
		}
		return "Required"
	case "dependsOn":
		if k.Fields.DependsOn != nil && k.Fields.DependsOn.Label != "" {
			return k.Fields.DependsOn.Label
		}
		return "Depends on"
	}
	if f := k.field(name); f != nil && f.Label != "" {
		return f.Label
	}
	return Capitalize(name)
}

// Canonical returns the vocabulary's spelling of a value, or the value as
// written when the field is free text or the value is unknown.
func (k Kind) Canonical(name, value string) string {
	if f := k.field(name); f != nil {
		for _, v := range f.Values {
			if strings.EqualFold(v, value) {
				return v
			}
		}
	}
	return value
}

// Tone is the palette tone of a field value: teal, violet, risk, or neutral.
func (k Kind) Tone(name, value string) string {
	f := k.field(name)
	if f == nil {
		return "neutral"
	}
	for v, tone := range f.Tones {
		if strings.EqualFold(v, value) {
			return tone
		}
	}
	return "neutral"
}

// Value reads a named field from an item as text.
func Value(it model.Item, name string) string {
	switch name {
	case "size":
		return it.Size
	case "category":
		return it.Category
	case "severity":
		return it.Severity
	case "status":
		return it.Status
	case "effort":
		return it.Effort
	case "owner":
		return it.Owner
	}
	return ""
}

// FacetRule returns the rule for a facet label, matched by slug.
func (k Kind) FacetRule(label string) (FacetRule, bool) {
	s := Slug(label)
	for _, f := range k.Facets {
		if Slug(f.Label) == s {
			return f, true
		}
	}
	return FacetRule{}, false
}

// IsRisk reports whether a facet label renders with the risk color.
func (k Kind) IsRisk(label string) bool {
	f, ok := k.FacetRule(label)
	return ok && f.Tone == "risk"
}

// IsVerdict reports whether id is one of the kind's verdicts.
func (k Kind) IsVerdict(id string) bool {
	for _, v := range k.Decision.Verdicts {
		if v.ID == id {
			return true
		}
	}
	return false
}

// Decides reports whether readers decide on this kind's items.
func (k Kind) Decides() bool { return k.Decision.Mode != ModeNone && k.Item.Numbered }

// Check applies the kind's rules to every article board item: fields must be
// the kind's and within its vocabularies, and facets must follow its order.
// Rows boards are free-form.
func (k Kind) Check(doc *model.Document) []model.Problem {
	var out []model.Problem
	add := func(path, format string, args ...any) {
		out = append(out, model.Problem{Path: path, Message: fmt.Sprintf(format, args...)})
	}
	for si, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for ii, it := range s.Board.Items {
			ip := fmt.Sprintf("/sections/%d/board/items/%d", si, ii)
			k.checkFields(ip, it, add)
			k.checkFacets(ip, it, add)
		}
	}
	return out
}

func (k Kind) checkFields(path string, it model.Item, add func(string, string, ...any)) {
	for _, name := range []string{"size", "category", "severity", "status", "effort", "owner"} {
		v := Value(it, name)
		if v == "" {
			continue
		}
		f := k.field(name)
		switch {
		case f == nil:
			add(path+"/"+name, "the %s kind has no %s field", k.ID, name)
		case len(f.Values) > 0 && !containsFold(f.Values, v):
			add(path+"/"+name, "must be one of %s", strings.Join(f.Values, ", "))
		}
	}
	if it.Impact != 0 {
		switch r := k.Fields.Impact; {
		case r == nil:
			add(path+"/impact", "the %s kind has no impact field", k.ID)
		case it.Impact < r.Min || it.Impact > r.Max:
			add(path+"/impact", "must be between %d and %d", r.Min, r.Max)
		}
	}
	if it.Required && k.Fields.Required == nil {
		add(path+"/required", "the %s kind has no required field", k.ID)
	}
	if len(it.DependsOn) > 0 && k.Fields.DependsOn == nil {
		add(path+"/dependsOn", "the %s kind has no dependsOn field", k.ID)
	}
}

// checkFacets enforces the vocabulary: known labels only, each at most once,
// in the kind's order, with every required facet present.
func (k Kind) checkFacets(path string, it model.Item, add func(string, string, ...any)) {
	var labels []string
	for _, f := range k.Facets {
		labels = append(labels, f.Label)
	}
	last := -1
	present := map[string]bool{}
	for fi, f := range it.Facets {
		fp := fmt.Sprintf("%s/facets/%d/label", path, fi)
		idx := -1
		for i, rule := range k.Facets {
			if Slug(rule.Label) == Slug(f.Label) {
				idx = i
			}
		}
		switch {
		case idx < 0:
			add(fp, "%q is not a facet of the %s kind; facets are %s", f.Label, k.ID, strings.Join(labels, ", "))
			return
		case present[Slug(f.Label)]:
			add(fp, "%q appears twice", f.Label)
			return
		case idx < last:
			add(fp, "%q is out of order; facets keep the order %s", f.Label, strings.Join(labels, ", "))
			return
		}
		present[Slug(f.Label)] = true
		last = idx
	}
	for _, rule := range k.Facets {
		if rule.Required && !present[Slug(rule.Label)] {
			add(path+"/facets", "missing facet %q", rule.Label)
		}
	}
}

// Advise returns warnings that never block a build: expected sections that are
// missing, and summaries and facets longer than the kind's limits.
func (k Kind) Advise(doc *model.Document) []model.Problem {
	var out []model.Problem
	ids := map[string]bool{}
	boards, rows := 0, 0
	for _, s := range doc.Sections {
		ids[s.ID] = true
		if s.Board != nil && s.Board.Layout != "rows" {
			boards++
		}
		if s.Board != nil && s.Board.Layout == "rows" {
			rows++
		}
	}
	for _, rule := range k.Sections {
		if rule.Optional {
			continue
		}
		switch {
		case rule.Board && rule.Repeat && boards > 0:
		case rule.Board && boards > 0 && ids[rule.ID]:
		case !rule.Board && ids[rule.ID]:
		default:
			out = append(out, model.Problem{Path: "/sections", Message: fmt.Sprintf("the %s kind expects a %q section: %s", k.ID, rule.Title, rule.Hint)})
		}
	}
	if k.Limits == nil {
		return out
	}
	for si, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for ii, it := range s.Board.Items {
			ip := fmt.Sprintf("/sections/%d/board/items/%d", si, ii)
			if k.Limits.Summary > 0 && len([]rune(it.Summary)) > k.Limits.Summary {
				out = append(out, model.Problem{Path: ip + "/summary", Message: fmt.Sprintf("summary is %d characters; keep it under %d", len([]rune(it.Summary)), k.Limits.Summary)})
			}
			for fi, f := range it.Facets {
				if k.Limits.Facet > 0 && len([]rune(f.Markdown)) > k.Limits.Facet {
					out = append(out, model.Problem{Path: fmt.Sprintf("%s/facets/%d/markdown", ip, fi), Message: fmt.Sprintf("%q is %d characters; keep facets under %d, two or three sentences", f.Label, len([]rune(f.Markdown)), k.Limits.Facet)})
				}
			}
		}
	}
	return out
}

// Slug is the stable key of a facet label: lowercase words joined by hyphens.
func Slug(label string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(label) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimRight(b.String(), "-")
}

// Capitalize upper-cases the first letter.
func Capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func containsFold(list []string, v string) bool {
	for _, x := range list {
		if strings.EqualFold(x, v) {
			return true
		}
	}
	return false
}
