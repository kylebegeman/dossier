package model

// The 0.6 import onto the kind vocabularies. Each 0.7 kind has one block
// family whose items become its items, with the kind's fields and facets;
// every other board family stays a free-form rows board. The vocabularies
// are restated here because package model cannot read the kind presets;
// load's tests prove every legacy fixture upgrades strictly against them.

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// mainFamilies names, per kind, the 0.6 board families whose items become
// the kind's own items on an article board.
var mainFamilies = map[string]map[string]bool{
	"brainstorm": {"review-board": true},
	"plan":       {"process-board": true},
	"review":     {"finding-list": true},
	"release":    {"release-checklist": true, "verification-run": true},
	"incident":   {"process-board": true, "action-items": true},
	"brief":      {"trust-report": true},
}

// notStated fills a required facet the 0.6 item had nothing for.
const notStated = "Not stated in the 0.6 document."

// leadIn matches a paragraph that opens with a facet label, such as
// "**Why:** riders call" or "Risk: holds strand walk-ups".
var leadIn = regexp.MustCompile(`(?is)^\s*(?:\*\*|__)?([a-z][a-z ]{1,30}?)(?::\*\*|\*\*:|:)\s*(.+)$`)

// facetDraft collects an item's facets by label, keeping the kind's order.
type facetDraft struct {
	order []string
	text  map[string][]string
}

func newFacets(order ...string) *facetDraft {
	return &facetDraft{order: order, text: map[string][]string{}}
}

func (f *facetDraft) add(label, md string) {
	if md = strings.TrimSpace(md); md != "" {
		f.text[label] = append(f.text[label], md)
	}
}

func (f *facetDraft) has(label string) bool { return len(f.text[label]) > 0 }

// body splits paragraphs that open with one of the kind's facet labels into
// those facets, and returns the rest.
func (f *facetDraft) body(md string) string {
	var rest []string
	for _, para := range strings.Split(strings.TrimSpace(md), "\n\n") {
		if m := leadIn.FindStringSubmatch(para); m != nil {
			if label := f.label(m[1]); label != "" {
				f.add(label, m[2])
				continue
			}
		}
		rest = append(rest, para)
	}
	return strings.TrimSpace(strings.Join(rest, "\n\n"))
}

func (f *facetDraft) label(word string) string {
	for _, l := range f.order {
		if strings.EqualFold(strings.TrimSpace(word), l) {
			return l
		}
	}
	return ""
}

// require fills a required facet with a placeholder the reader can see, and
// warns so the upgrade never invents content silently.
func (f *facetDraft) require(c *converter, path, label string) {
	if !f.has(label) {
		f.add(label, notStated)
		c.warn(path, "the 0.6 item has nothing for the required facet %q; the upgrade says so in the facet", label)
	}
}

func (f *facetDraft) facets() []Facet {
	var out []Facet
	for _, l := range f.order {
		if md := f.text[l]; len(md) > 0 {
			out = append(out, Facet{Label: l, Markdown: strings.Join(md, "\n\n")})
		}
	}
	return out
}

// leftovers is what an item carries that no field or facet holds: its extra
// scalars, details, comments, and nested blocks, as Note paragraphs.
func (c *converter) leftovers(path string, m map[string]any, skip ...string) []string {
	skipped := map[string]bool{}
	for _, k := range skip {
		skipped[k] = true
	}
	var notes []string
	var status []string
	for _, f := range statusFields {
		if skipped[f.key] {
			continue
		}
		if v := text(m[f.key]); v != "" {
			if f.code {
				v = mdCode(v)
			} else {
				v = mdEscape(v)
			}
			status = append(status, "**"+f.label+"** "+v)
		}
	}
	if len(status) > 0 {
		notes = append(notes, strings.Join(status, " · "))
	}
	if !skipped["notes"] {
		if v := str(m, "notes"); v != "" {
			notes = append(notes, c.rich(path+"/notes", v))
		}
	}
	for i, cm := range objs(m, "comments") {
		head := mdEscape(str(cm, "author"))
		body := c.rich(fmt.Sprintf("%s/comments/%d/body", path, i), str(cm, "body"))
		if head != "" {
			body = "**" + head + "** " + body
		}
		notes = append(notes, body)
	}
	for i, nb := range objs(m, "blocks") {
		notes = append(notes, c.nestedMarkdown(fmt.Sprintf("%s/blocks/%d", path, i), nb)...)
	}
	if details := obj(m, "details"); len(details) > 0 {
		for _, k := range sortedMapKeys(details) {
			if v := text(details[k]); v != "" {
				notes = append(notes, "**"+mdEscape(k)+"** "+c.rich(path+"/details/"+k, v))
			}
		}
	}
	if url := str(m, "url"); url != "" && !skipped["url"] {
		notes = append(notes, mdLink(url, url))
	}
	return notes
}

// head reads an item's id, title, and summary. A title or summary too long
// for 0.7 is shortened, and the full text goes to the returned Note lines.
func (c *converter) head(path, family string, m map[string]any, titleKeys ...string) (Item, []string) {
	if len(titleKeys) == 0 {
		titleKeys = []string{"title", "decision", "claim", "subject", "label"}
	}
	title := firstStr(m, titleKeys...)
	if title == "" {
		title = "Untitled"
	}
	it := Item{ID: c.ids.claim(c, path+"/id", str(m, "id"), title, family)}
	var notes []string
	var clipped bool
	if it.Title, clipped = clamp(title, maxTitleRunes); clipped {
		c.warn(path+"/title", "is %d characters; shortened to %d, the full title opens the Note facet", len([]rune(title)), maxTitleRunes)
		notes = append(notes, "**"+mdEscape(title)+"**")
	}
	summary := str(m, "summary")
	if it.Summary, clipped = clamp(summary, maxSummaryRunes); clipped {
		c.warn(path+"/summary", "is %d characters; shortened to %d, the full summary opens the Note facet", len([]rune(summary)), maxSummaryRunes)
		notes = append(notes, c.rich(path+"/summary", summary))
	}
	if deps := strs(m, "dependencies"); len(deps) > 0 {
		c.pending = append(c.pending, pendingDeps{itemID: it.ID, path: path + "/dependencies", deps: deps})
	}
	return it, notes
}

// kindItem builds one item in the vocabulary of the document's kind.
func (c *converter) kindItem(path, family string, m map[string]any) Item {
	switch c.kind {
	case "brainstorm":
		return c.idea(path, family, m)
	case "plan":
		return c.step(path, family, m)
	case "review":
		return c.finding(path, family, m)
	case "release":
		return c.gate(path, family, m)
	case "incident":
		return c.followUp(path, family, m)
	}
	return c.claim(path, family, m)
}

// idea is a review-board candidate as a brainstorm idea.
func (c *converter) idea(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m)
	it.Effort = effortOf(str(m, "effort"))
	it.Impact = impactOf(text(m["impact"]))
	skip := []string{"effort", "impact", "verdict"}
	if size := strings.ToLower(str(m, "category")); size == "minor" || size == "major" {
		it.Size = size
		skip = append(skip, "category")
	}
	f := newFacets("How it works", "Why", "In use", "Unlocks", "Risk", "Note")
	if rest := f.body(str(m, "body")); rest != "" {
		f.add("How it works", c.rich(path+"/body", rest))
	}
	if !f.has("How it works") && it.Summary != "" {
		f.add("How it works", c.rich(path+"/summary", it.Summary))
	}
	f.require(c, path, "How it works")
	f.require(c, path, "Why")
	for _, r := range listText(m, "risks") {
		f.add("Risk", r)
	}
	for _, n := range append(notes, c.leftovers(path, m, skip...)...) {
		f.add("Note", n)
	}
	if v := str(m, "verdict"); v == "approve" || v == "approved" || v == "pick" || v == "picked" {
		c.picked = append(c.picked, it.ID)
	}
	it.Facets = f.facets()
	return it
}

// step is a process-board item as a plan step, and its 0.6 verdict as a
// plan verdict.
func (c *converter) step(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m)
	it.Effort = effortOf(str(m, "effort"))
	it.Owner = str(m, "owner")
	status, known := planStatus(str(m, "status"))
	it.Status = status
	skip := []string{"effort", "owner", "verdict", "risk"}
	if known {
		skip = append(skip, "status")
	}
	f := newFacets("What changes", "Why", "Touches", "Done when", "Diff", "Risk", "Note")
	if rest := f.body(str(m, "body")); rest != "" {
		f.add("What changes", c.rich(path+"/body", rest))
	}
	if !f.has("What changes") && it.Summary != "" {
		f.add("What changes", c.rich(path+"/summary", it.Summary))
	}
	f.require(c, path, "What changes")
	if files := strs(m, "files"); len(files) > 0 {
		f.add("Touches", codeList(files))
	}
	if checks := listText(m, "verification"); len(checks) > 0 {
		f.add("Done when", bulletList(checks))
	}
	f.require(c, path, "Done when")
	if d := str(m, "diff"); d != "" {
		f.add("Diff", fence("diff", d))
	}
	for _, r := range append(listText(m, "risks"), str(m, "risk")) {
		f.add("Risk", mdEscape(r))
	}
	for _, n := range append(notes, c.leftovers(path, m, skip...)...) {
		f.add("Note", n)
	}
	if v := planVerdict(str(m, "verdict")); v != "" {
		c.verdicts[it.ID] = v
	}
	it.Facets = f.facets()
	return it
}

// finding is a finding-list finding as a review finding.
func (c *converter) finding(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m)
	it.Effort = effortOf(str(m, "effort"))
	it.Severity = severityOf(str(m, "severity"))
	it.Category = str(m, "category")
	skip := []string{"effort", "severity", "category"}
	f := newFacets("Where", "Why it matters", "Fix", "Evidence", "Diff", "Note")
	var where []string
	for _, file := range strs(m, "files") {
		where = append(where, "- "+mdCode(file))
	}
	if line := text(m["line"]); line != "" && len(where) == 1 {
		where[0] += ", line " + mdEscape(line)
	}
	f.add("Where", strings.Join(where, "\n"))
	if rest := f.body(str(m, "body")); rest != "" {
		f.add("Why it matters", c.rich(path+"/body", rest))
	}
	if !f.has("Why it matters") && it.Summary != "" {
		f.add("Why it matters", c.rich(path+"/summary", it.Summary))
	}
	f.require(c, path, "Where")
	f.require(c, path, "Why it matters")
	f.add("Fix", c.rich(path+"/recommendation", str(m, "recommendation")))
	if ev := listText(m, "evidence"); len(ev) > 0 {
		f.add("Evidence", bulletList(ev))
	}
	if d := str(m, "diff"); d != "" {
		f.add("Diff", fence("diff", d))
	}
	for _, n := range append(notes, c.leftovers(path, m, skip...)...) {
		f.add("Note", n)
	}
	it.Facets = f.facets()
	return it
}

// gate is a release-checklist gate or a verification run as a release gate.
func (c *converter) gate(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m)
	status, known := gateStatus(str(m, "status"))
	it.Status = status
	it.Required = boolean(m["required"])
	skip := []string{"required", "command", "expected", "actual"}
	if known {
		skip = append(skip, "status")
	}
	f := newFacets("How checked", "Result", "Evidence", "Risk", "Note")
	word := strings.ToUpper(status[:1]) + status[1:]
	if cmd := str(m, "command"); cmd != "" {
		check := "Runs " + mdCode(cmd) + "."
		if exp := str(m, "expected"); exp != "" {
			check += " Expected: " + c.rich(path+"/expected", exp)
		}
		f.add("How checked", check)
		if actual := str(m, "actual"); actual != "" {
			f.add("Result", word+". "+c.rich(path+"/actual", actual))
		} else {
			f.add("Result", word+".")
		}
		if arts := strs(m, "artifacts"); len(arts) > 0 {
			f.add("Evidence", codeList(arts))
		}
	} else {
		f.add("How checked", "An item on the 0.6 release checklist.")
		if ev := str(m, "evidence"); ev != "" {
			f.add("Result", word+": "+evidenceText(ev))
			skip = append(skip, "evidence")
		} else {
			f.add("Result", word+".")
		}
	}
	for _, r := range listText(m, "risks") {
		f.add("Risk", mdEscape(r))
	}
	for _, n := range append(notes, c.leftovers(path, m, skip...)...) {
		f.add("Note", n)
	}
	it.Facets = f.facets()
	return it
}

// followUp is a process-board item or an action item as an incident
// follow-up.
func (c *converter) followUp(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m)
	it.Effort = effortOf(str(m, "effort"))
	it.Impact = impactOf(text(m["impact"]))
	it.Owner = str(m, "owner")
	skip := []string{"effort", "impact", "owner", "verdict"}
	if cat := strings.ToLower(str(m, "category")); cat == "detect" || cat == "mitigate" || cat == "prevent" {
		it.Category = cat
		skip = append(skip, "category")
	}
	switch strings.ToLower(str(m, "status")) {
	case "done", "complete", "completed", "shipped", "closed":
		it.Status = "done"
		skip = append(skip, "status")
	case "", "open", "todo", "proposed", "planned":
		it.Status = "open"
		skip = append(skip, "status")
	default:
		it.Status = "open"
	}
	f := newFacets("Addresses", "What changes", "Done when", "Note")
	if rest := f.body(str(m, "body")); rest != "" {
		f.add("What changes", c.rich(path+"/body", rest))
	}
	if !f.has("What changes") {
		f.add("What changes", c.rich(path+"/summary", firstStr(m, "summary", "note", "title")))
		skip = append(skip, "notes")
	}
	f.require(c, path, "Addresses")
	f.require(c, path, "What changes")
	if checks := listText(m, "verification"); len(checks) > 0 {
		f.add("Done when", bulletList(checks))
	}
	for _, n := range append(notes, c.leftovers(path, m, skip...)...) {
		f.add("Note", n)
	}
	if n := str(m, "note"); n != "" && f.has("What changes") && !strings.Contains(strings.Join(f.text["What changes"], ""), n) {
		f.add("Note", c.rich(path+"/note", n))
	}
	it.Facets = f.facets()
	return it
}

// claim is a trust-report claim as a brief finding, its trust status as
// Confidence.
func (c *converter) claim(path, family string, m map[string]any) Item {
	it, notes := c.head(path, family, m, "claim", "title")
	skip := []string{"status", "confidence", "sources", "evidence"}
	switch s := strings.ToLower(str(m, "status")); s {
	case "verified", "confirmed":
		it.Status = "verified"
	case "partial", "likely", "probable":
		it.Status = "likely"
	default:
		it.Status = "open"
		if s != "" && s != "open" && s != "unverified" {
			notes = append(notes, "**0.6 status** "+mdEscape(s))
		}
	}
	f := newFacets("Detail", "Evidence", "So what", "Note")
	f.add("Detail", strings.Join(notes, "\n\n"))
	var evidence []string
	for _, e := range listText(m, "evidence") {
		evidence = append(evidence, "- "+mdEscape(e))
	}
	if sources := strs(m, "sources"); len(sources) > 0 {
		evidence = append(evidence, "- Sources: "+mdEscape(strings.Join(sources, ", ")))
	}
	f.add("Evidence", strings.Join(evidence, "\n"))
	if conf := str(m, "confidence"); conf != "" {
		f.add("Note", "**0.6 confidence** "+mdEscape(conf))
	}
	for _, n := range c.leftovers(path, m, skip...) {
		f.add("Note", n)
	}
	it.Facets = f.facets()
	return it
}

func effortOf(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "s", "small", "xs":
		return "S"
	case "m", "medium":
		return "M"
	case "l", "large", "xl":
		return "L"
	}
	return ""
}

// impactOf turns impact words or numbers into the 1 to 5 scale.
func impactOf(s string) int {
	s = strings.ToLower(strings.TrimSpace(s))
	if n, err := strconv.Atoi(s); err == nil && n >= 1 && n <= 5 {
		return n
	}
	return map[string]int{"very low": 1, "low": 2, "medium": 3, "moderate": 3, "high": 4, "very high": 5, "critical": 5}[s]
}

func planStatus(s string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "proposed", "todo", "open", "planned", "backlog", "ready":
		return "planned", true
	case "partial", "doing", "in-progress", "in progress", "active", "started":
		return "doing", true
	case "done", "complete", "completed", "shipped", "merged", "applied":
		return "done", true
	case "blocked":
		return "blocked", true
	}
	return "planned", false
}

func planVerdict(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "approve", "approved", "go", "accept", "apply":
		return "go"
	case "revise", "retry", "split", "changes":
		return "revise"
	case "block", "blocked", "reject", "rejected", "skip", "defer":
		return "skip"
	}
	return ""
}

func severityOf(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical", "blocker", "p0":
		return "blocker"
	case "high", "major", "p1":
		return "major"
	case "medium", "moderate", "minor", "p2":
		return "minor"
	case "low", "info", "nit", "trivial", "p3":
		return "nit"
	}
	return ""
}

func gateStatus(s string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "passed", "pass", "done", "ok", "green":
		return "passed", true
	case "failed", "fail", "blocked", "red", "error":
		return "failed", true
	case "skipped", "skip", "n/a", "na":
		return "skipped", true
	case "pending", "todo", "planned", "running", "in-progress", "queued", "":
		return "pending", true
	}
	return "pending", false
}

// evidenceText sets a token such as a version or a commit in code, and
// keeps a sentence as prose.
func evidenceText(s string) string {
	if !strings.ContainsAny(strings.TrimSpace(s), " \n") {
		return mdCode(s)
	}
	return mdEscape(s)
}

func listText(m map[string]any, key string) []string {
	switch v := m[key].(type) {
	case string:
		if strings.TrimSpace(v) != "" {
			return []string{v}
		}
	case []any:
		var out []string
		for _, x := range v {
			if s := text(x); s != "" {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func bulletList(values []string) string {
	lines := make([]string, len(values))
	for i, v := range values {
		if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
			lines[i] = "- " + mdLink(v, v)
		} else {
			lines[i] = "- " + mdEscape(v)
		}
	}
	return strings.Join(lines, "\n")
}

func sortedMapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
