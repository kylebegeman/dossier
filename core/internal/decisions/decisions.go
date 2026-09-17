// Package decisions is the reader's side of the loop: the choice made, picks
// or verdicts on numbered items, and notes, as one document that people and
// agents both read, plus the one-line reply a person types into a thread.
// A document's kind sets the rules; this package takes them as a value and
// never reads the kind presets itself.
package decisions

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"dossier/internal/model"
)

// Schema names the decisions document contract.
const Schema = "dossier.decisions/v1"

// Decision modes.
const (
	ModePick    = "pick"
	ModeVerdict = "verdict"
	ModeNone    = "none"
)

// Reserved words cannot be verdict or choice ids, because replies use them.
var Reserved = []string{"all", "and", "rest", "nothing", "none", "notes"}

// Verdict is one ruling a reader can give an item.
type Verdict struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Tone  string `json:"tone"`
}

// Guard warns when a choice is made while watched items lack a verdict, such
// as shipping a release over a failed required gate that nobody waived.
type Guard struct {
	Choice string
	Unless string
	// Watch holds the ids of the items the guard applies to.
	Watch map[string]bool
	// Describe says what the watched items have in common: "failed and required".
	Describe string
}

// Rules are what a document's kind says about deciding it.
type Rules struct {
	Kind   string
	Noun   string
	Plural string
	Mode   string
	// Verdicts are in the kind's order, which is also the reply's order.
	Verdicts []Verdict
	// Default is the verdict bare numbers take; empty means numbers need one.
	Default string
	// Eligible holds the ids of the numbered items that take a verdict. Nil
	// means every numbered item does.
	Eligible map[string]bool
	// EligibleText finishes "only ... take a verdict".
	EligibleText string
	// Choice is the document's question, or the kind's default one.
	Choice *model.Choice
	Guard  *Guard
}

// CanDecide reports whether an item takes a verdict under the rules.
func (r Rules) CanDecide(id string) bool { return r.Eligible == nil || r.Eligible[id] }

// IsVerdict reports whether id is one of the rules' verdicts.
func (r Rules) IsVerdict(id string) bool {
	for _, v := range r.Verdicts {
		if v.ID == id {
			return true
		}
	}
	return false
}

// VerdictLabel is the display label of a verdict id.
func (r Rules) VerdictLabel(id string) string {
	for _, v := range r.Verdicts {
		if v.ID == id {
			return v.Label
		}
	}
	return id
}

// Option returns the choice option with the given id.
func (r Rules) Option(id string) (model.Option, bool) {
	if r.Choice == nil {
		return model.Option{}, false
	}
	for _, o := range r.Choice.Options {
		if o.ID == id {
			return o, true
		}
	}
	return model.Option{}, false
}

func (r Rules) optionIDs() []string {
	if r.Choice == nil {
		return nil
	}
	ids := make([]string, len(r.Choice.Options))
	for i, o := range r.Choice.Options {
		ids[i] = o.ID
	}
	return ids
}

func (r Rules) verdictIDs() []string {
	ids := make([]string, len(r.Verdicts))
	for i, v := range r.Verdicts {
		ids[i] = v.ID
	}
	return ids
}

// Document is dossier.decisions/v1.
type Document struct {
	Schema   string            `json:"schema"`
	Slug     string            `json:"slug"`
	Title    string            `json:"title,omitempty"`
	Kind     string            `json:"kind,omitempty"`
	Path     string            `json:"path,omitempty"`
	Picked   []string          `json:"picked"`
	Verdicts map[string]string `json:"verdicts,omitempty"`
	Notes    map[string]string `json:"notes,omitempty"`
	Reply    string            `json:"reply,omitempty"`
	Items    []Item            `json:"items,omitempty"`
}

// Item is one numbered item as the decisions document lists it.
type Item struct {
	ID      string `json:"id"`
	N       int    `json:"n"`
	Title   string `json:"title"`
	Picked  bool   `json:"picked"`
	Verdict string `json:"verdict,omitempty"`
	Note    string `json:"note,omitempty"`
}

// Items lists the numbered items of a document in order, with the model's
// decisions applied. A kind without decisions numbers nothing.
func Items(doc *model.Document, rules Rules) []Item {
	if rules.Mode == ModeNone {
		return nil
	}
	var picked map[string]bool
	var verdicts, notes map[string]string
	if doc.Decisions != nil {
		picked = map[string]bool{}
		for _, id := range doc.Decisions.Picked {
			picked[id] = true
		}
		verdicts, notes = doc.Decisions.Verdicts, doc.Decisions.Notes
	}
	var out []Item
	n := 0
	for _, s := range doc.Sections {
		if s.Board == nil || s.Board.Layout == "rows" {
			continue
		}
		for _, it := range s.Board.Items {
			n++
			out = append(out, Item{ID: it.ID, N: n, Title: it.Title, Picked: picked[it.ID], Verdict: verdicts[it.ID], Note: notes[it.ID]})
		}
	}
	return out
}

// FromModel builds the decisions document from a model's own decisions.
func FromModel(doc *model.Document, rules Rules) Document {
	items := Items(doc, rules)
	d := Document{Schema: Schema, Slug: doc.Meta.Slug, Title: doc.Meta.Title, Kind: rules.Kind, Picked: []string{}, Items: items}
	if doc.Decisions != nil {
		d.Path = doc.Decisions.Path
		d.Verdicts = copyMap(doc.Decisions.Verdicts)
		d.Notes = copyMap(doc.Decisions.Notes)
	}
	for _, it := range items {
		if it.Picked {
			d.Picked = append(d.Picked, it.ID)
		}
	}
	d.Reply = ReplyLine(d, items, rules)
	return d
}

func copyMap(m map[string]string) map[string]string {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// ReplyLine renders the canonical reply: the choice, then picks or verdict
// groups in the kind's verdict order with ascending numbers, then notes.
//
//	storms, 1, 3. Notes: 3: keep the blue accent.
//	rework, fix 1, 2; later 4. Notes: 4: after the release.
//
// The reader writes exactly the same line; a shared test holds them together.
func ReplyLine(d Document, items []Item, rules Rules) string {
	groups, notes := replyParts(d, items, rules)
	body := make([]string, len(groups))
	for i, g := range groups {
		targets := joinInts(g.nums)
		if g.all {
			targets = "all"
		}
		if g.verdict != "" {
			targets = g.verdict + " " + targets
		}
		body[i] = targets
	}
	var b strings.Builder
	switch {
	case d.Path != "" && len(body) > 0:
		b.WriteString(d.Path + ", " + strings.Join(body, "; "))
	case d.Path != "":
		b.WriteString(d.Path)
	case len(body) > 0:
		b.WriteString(strings.Join(body, "; "))
	default:
		b.WriteString("nothing")
	}
	b.WriteString(".")
	if len(notes) > 0 {
		b.WriteString(" Notes: ")
		for i, n := range notes {
			if i > 0 {
				b.WriteString("; ")
			}
			fmt.Fprintf(&b, "%d: %s", n.n, n.text)
		}
		b.WriteString(".")
	}
	return b.String()
}

// ReplyWords says a reply in plain words, one short sentence for each part
// of the line and in the same order, so a reader can check what they send:
//
//	rework, fix 1, 2; later 4. Notes: 4: after the release.
//	Choice: Rework. Fix: findings 1 and 2. Later: finding 4. Note on finding 4: after the release.
//
// The reader says the same words; the shared cases hold them together.
func ReplyWords(d Document, items []Item, rules Rules) string {
	groups, notes := replyParts(d, items, rules)
	var said []string
	if d.Path != "" {
		label := d.Path
		if o, ok := rules.Option(d.Path); ok {
			label = o.Label
		}
		said = append(said, "Choice: "+label)
	}
	for _, g := range groups {
		label := "Pick"
		if g.verdict != "" {
			label = rules.VerdictLabel(g.verdict)
		}
		targets := "all " + rules.Plural
		switch {
		case g.all:
		case len(g.nums) == 1:
			targets = rules.Noun + " " + andInts(g.nums)
		default:
			targets = rules.Plural + " " + andInts(g.nums)
		}
		said = append(said, label+": "+targets)
	}
	for _, n := range notes {
		said = append(said, fmt.Sprintf("Note on %s %d: %s", rules.Noun, n.n, n.text))
	}
	if len(said) == 0 {
		return "Nothing decided yet."
	}
	for i, s := range said {
		if !strings.HasSuffix(s, ".") && !strings.HasSuffix(s, "!") && !strings.HasSuffix(s, "?") {
			said[i] = s + "."
		}
	}
	return strings.Join(said, " ")
}

// Undecided reports whether decisions carry nothing a reply would say: no
// choice among the options, no picks or verdicts the rules accept, and no
// notes on known items. The reader marks its reply block the same way.
func Undecided(d Document, items []Item, rules Rules) bool {
	groups, notes := replyParts(d, items, rules)
	_, chosen := rules.Option(d.Path)
	return !chosen && len(groups) == 0 && len(notes) == 0
}

// replyGroup is one group of a reply: picks when verdict is empty, with the
// numbers in order and whether they are every item the group can name.
type replyGroup struct {
	verdict string
	nums    []int
	all     bool
}

type replyNote struct {
	n    int
	text string
}

// replyParts splits decisions into what a reply says, in the reply's order:
// picks or verdict groups in the kind's verdict order, then notes by number
// with their whitespace collapsed.
func replyParts(d Document, items []Item, rules Rules) ([]replyGroup, []replyNote) {
	number := make(map[string]int, len(items))
	eligible := 0
	for _, it := range items {
		number[it.ID] = it.N
		if rules.CanDecide(it.ID) {
			eligible++
		}
	}
	var groups []replyGroup
	switch rules.Mode {
	case ModePick:
		if nums := numbersOf(d.Picked, number); len(nums) > 0 {
			groups = append(groups, replyGroup{nums: nums, all: len(nums) == len(items)})
		}
	case ModeVerdict:
		for _, v := range rules.Verdicts {
			var ids []string
			for id, verdict := range d.Verdicts {
				if verdict == v.ID && rules.CanDecide(id) {
					ids = append(ids, id)
				}
			}
			if nums := numbersOf(ids, number); len(nums) > 0 {
				groups = append(groups, replyGroup{verdict: v.ID, nums: nums, all: len(nums) == eligible})
			}
		}
	}
	var notes []replyNote
	for id, text := range d.Notes {
		if n := number[id]; n > 0 && strings.TrimSpace(text) != "" {
			notes = append(notes, replyNote{n: n, text: strings.Join(strings.Fields(text), " ")})
		}
	}
	sort.Slice(notes, func(i, j int) bool { return notes[i].n < notes[j].n })
	return groups, notes
}

func numbersOf(ids []string, number map[string]int) []int {
	seen := map[int]bool{}
	var nums []int
	for _, id := range ids {
		if n := number[id]; n > 0 && !seen[n] {
			seen[n] = true
			nums = append(nums, n)
		}
	}
	sort.Ints(nums)
	return nums
}

func joinInts(nums []int) string {
	parts := make([]string, len(nums))
	for i, n := range nums {
		parts[i] = strconv.Itoa(n)
	}
	return strings.Join(parts, ", ")
}

// andInts joins numbers for words: "1", "1 and 2", "1, 2, and 3".
func andInts(nums []int) string {
	s := strings.Split(joinInts(nums), ", ")
	if len(s) < 3 {
		return strings.Join(s, " and ")
	}
	return strings.Join(s[:len(s)-1], ", ") + ", and " + s[len(s)-1]
}

// Markdown renders the decisions document for people: the reply line, the
// choice, the items grouped by what was decided, and the JSON as a fenced
// block agents parse.
func Markdown(d Document, rules Rules) ([]byte, error) {
	var b bytes.Buffer
	title := d.Title
	if title == "" {
		title = d.Slug
	}
	fmt.Fprintf(&b, "# Decisions for %s\n\n", title)
	fmt.Fprintf(&b, "Reply: %s\n\n", d.Reply)
	if d.Path != "" {
		if o, ok := rules.Option(d.Path); ok {
			fmt.Fprintf(&b, "%s %s (`%s`)\n\n", rules.Choice.Question, o.Label, o.ID)
		} else {
			fmt.Fprintf(&b, "Path: %s\n\n", d.Path)
		}
	}
	switch rules.Mode {
	case ModeVerdict:
		writeVerdicts(&b, d, rules)
	default:
		b.WriteString("## Picked\n\n")
		picked := false
		for _, it := range d.Items {
			if it.Picked {
				picked = true
				writeItem(&b, it)
			}
		}
		if !picked {
			b.WriteString("Nothing yet.\n")
		}
		b.WriteString("\n## Not picked\n\n")
		for _, it := range d.Items {
			if !it.Picked {
				writeItem(&b, it)
			}
		}
	}
	b.WriteString("\n```json\n")
	enc := json.NewEncoder(&b)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(d); err != nil {
		return nil, err
	}
	b.WriteString("```\n")
	return b.Bytes(), nil
}

// writeVerdicts lists items under one heading per verdict given, then the
// undecided items, then notes on items that take no verdict.
func writeVerdicts(b *bytes.Buffer, d Document, rules Rules) {
	decided := false
	for _, v := range rules.Verdicts {
		var group []Item
		for _, it := range d.Items {
			if d.Verdicts[it.ID] == v.ID && rules.CanDecide(it.ID) {
				group = append(group, it)
			}
		}
		if len(group) == 0 {
			continue
		}
		decided = true
		fmt.Fprintf(b, "## %s\n\n", v.Label)
		for _, it := range group {
			writeItem(b, withNote(it, d))
		}
		b.WriteString("\n")
	}
	if !decided {
		b.WriteString("Nothing decided yet.\n\n")
	}
	var undecided, other []Item
	for _, it := range d.Items {
		switch {
		case !rules.CanDecide(it.ID):
			if d.Notes[it.ID] != "" {
				other = append(other, it)
			}
		case !rules.IsVerdict(d.Verdicts[it.ID]):
			undecided = append(undecided, it)
		}
	}
	if len(undecided) > 0 {
		b.WriteString("## Undecided\n\n")
		for _, it := range undecided {
			writeItem(b, withNote(it, d))
		}
		b.WriteString("\n")
	}
	if len(other) > 0 {
		fmt.Fprintf(b, "## Notes on other %s\n\n", rules.Plural)
		for _, it := range other {
			writeItem(b, withNote(it, d))
		}
		b.WriteString("\n")
	}
}

func withNote(it Item, d Document) Item {
	if note := d.Notes[it.ID]; note != "" {
		it.Note = note
	}
	return it
}

func writeItem(b *bytes.Buffer, it Item) {
	fmt.Fprintf(b, "- %d. %s", it.N, it.Title)
	if it.Note != "" {
		fmt.Fprintf(b, " (note: %s)", it.Note)
	}
	b.WriteString("\n")
}

var fence = regexp.MustCompile("(?s)```json\\s*\n(.*?)\n```")

// Parse reads a decisions document from JSON or from the fenced JSON block
// inside the Markdown form.
func Parse(data []byte) (Document, error) {
	trimmed := bytes.TrimSpace(data)
	if !bytes.HasPrefix(trimmed, []byte("{")) {
		m := fence.FindSubmatch(trimmed)
		if m == nil {
			return Document{}, errors.New("decisions document has no JSON object and no ```json block")
		}
		trimmed = m[1]
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.DisallowUnknownFields()
	var d Document
	if err := dec.Decode(&d); err != nil {
		return Document{}, fmt.Errorf("decode decisions: %w", err)
	}
	if d.Schema != Schema {
		return Document{}, fmt.Errorf("decisions schema must be %q, got %q", Schema, d.Schema)
	}
	if d.Picked == nil {
		d.Picked = []string{}
	}
	return d, nil
}

// Check applies the rules to a model's own decisions: picks only in pick
// kinds, verdicts only in verdict kinds and only on items that take one, and
// a path only among the choice's options. Ids the model does not have are
// model.Check's to report.
func Check(doc *model.Document, rules Rules) []model.Problem {
	if doc.Decisions == nil {
		return nil
	}
	dec := doc.Decisions
	return check(dec.Path, dec.Picked, dec.Verdicts, dec.Notes, Items(doc, rules), rules, "/decisions", false)
}

// Warnings are advice about a model's decisions that never blocks a build: a
// path with no choice to hold it, and a guard the choice runs over.
func Warnings(doc *model.Document, rules Rules) []model.Problem {
	dec := doc.Decisions
	if dec == nil || rules.Mode == ModeNone {
		return nil
	}
	var out []model.Problem
	if dec.Path != "" && rules.Choice == nil {
		out = append(out, model.Problem{Path: "/decisions/path", Message: fmt.Sprintf("the document has no choice, so readers never see the path %q; add a choice or remove the path", dec.Path)})
	}
	if g := rules.Guard; g != nil && dec.Path == g.Choice {
		for _, it := range Items(doc, rules) {
			if g.Watch[it.ID] && dec.Verdicts[it.ID] != g.Unless {
				out = append(out, model.Problem{Path: "/decisions/path", Message: fmt.Sprintf("%s goes ahead over %s %d, %s, which is %s and has no %s verdict", g.Choice, rules.Noun, it.N, it.Title, g.Describe, g.Unless)})
			}
		}
	}
	return out
}

func check(path string, picked []string, verdicts, notes map[string]string, items []Item, rules Rules, prefix string, unknownIDs bool) []model.Problem {
	var out []model.Problem
	add := func(p, format string, args ...any) {
		out = append(out, model.Problem{Path: prefix + p, Message: fmt.Sprintf(format, args...)})
	}
	if rules.Mode == ModeNone {
		if path != "" || len(picked) > 0 || len(verdicts) > 0 || len(notes) > 0 {
			add("", "the %s kind has nothing to decide", rules.Kind)
		}
		return out
	}
	number := make(map[string]int, len(items))
	for _, it := range items {
		number[it.ID] = it.N
	}
	switch {
	case path == "":
	case rules.Choice == nil:
		if unknownIDs {
			add("/path", "the document has no choice to make")
		}
	default:
		if _, ok := rules.Option(path); !ok {
			add("/path", "must be %s", orList(rules.optionIDs()))
		}
	}
	if rules.Mode == ModeVerdict && len(picked) > 0 {
		add("/picked", "the %s kind decides by verdict (%s), not by picks", rules.Kind, strings.Join(rules.verdictIDs(), ", "))
	}
	if rules.Mode == ModePick && len(verdicts) > 0 {
		add("/verdicts", "the %s kind picks by number and has no verdicts", rules.Kind)
	}
	for i, id := range picked {
		if unknownIDs && number[id] == 0 {
			add(fmt.Sprintf("/picked/%d", i), "unknown item %q", id)
		}
	}
	ids := make([]string, 0, len(verdicts))
	for id := range verdicts {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		switch v := verdicts[id]; {
		case number[id] == 0:
			if unknownIDs {
				add("/verdicts/"+id, "unknown item")
			}
		case rules.Mode != ModeVerdict:
		case !rules.IsVerdict(v):
			add("/verdicts/"+id, "must be %s", orList(rules.verdictIDs()))
		case !rules.CanDecide(id):
			add("/verdicts/"+id, "%s %d takes no verdict; only %s do", rules.Noun, number[id], rules.EligibleText)
		}
	}
	if unknownIDs {
		for _, id := range sortedKeys(notes) {
			if number[id] == 0 {
				add("/notes/"+id, "unknown item")
			}
		}
	}
	return out
}

// Apply writes the decisions into the model when they fit the rules.
// Problems leave the model untouched.
func Apply(doc *model.Document, d Document, rules Rules) []model.Problem {
	items := Items(doc, rules)
	problems := check(d.Path, d.Picked, d.Verdicts, d.Notes, items, rules, "", true)
	if d.Slug != "" && d.Slug != doc.Meta.Slug {
		problems = append(problems, model.Problem{Path: "/slug", Message: fmt.Sprintf("decisions are for %q, model is %q", d.Slug, doc.Meta.Slug)})
	}
	if d.Kind != "" && d.Kind != rules.Kind {
		problems = append(problems, model.Problem{Path: "/kind", Message: fmt.Sprintf("decisions are for a %s, model is a %s", d.Kind, rules.Kind)})
	}
	if len(problems) > 0 {
		return problems
	}
	number := make(map[string]int, len(items))
	for _, it := range items {
		number[it.ID] = it.N
	}
	next := &model.Decisions{Path: d.Path}
	seen := map[string]bool{}
	for _, id := range d.Picked {
		if !seen[id] {
			seen[id] = true
			next.Picked = append(next.Picked, id)
		}
	}
	sort.Slice(next.Picked, func(i, j int) bool { return number[next.Picked[i]] < number[next.Picked[j]] })
	next.Verdicts = copyMap(d.Verdicts)
	for id, v := range d.Notes {
		if v = strings.TrimSpace(v); v != "" {
			if next.Notes == nil {
				next.Notes = map[string]string{}
			}
			next.Notes[id] = v
		}
	}
	if next.Path == "" && len(next.Picked) == 0 && len(next.Verdicts) == 0 && len(next.Notes) == 0 {
		doc.Decisions = nil
		return nil
	}
	doc.Decisions = next
	return nil
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// orList joins words for a message: "a", "a or b", "a, b, or c".
func orList(words []string) string {
	switch len(words) {
	case 0:
		return ""
	case 1:
		return words[0]
	case 2:
		return words[0] + " or " + words[1]
	}
	return strings.Join(words[:len(words)-1], ", ") + ", or " + words[len(words)-1]
}
