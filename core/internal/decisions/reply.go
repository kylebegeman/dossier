package decisions

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ParseReply reads a reply line under the rules:
//
//	[choice ","] group {";" group} "." ["Notes:" n ":" text {";" n ":" text} ["."]]
//
// A group is an optional verdict followed by targets: numbers, ranges such
// as 2-4, or all (rest means the same): every item that takes a verdict and
// is not named elsewhere. Bare numbers take the kind's default verdict; in a
// pick kind they are picks. Words match without case, and "and" joins
// numbers like a comma. A period after the last note is the line's, not the
// note's, so it is dropped.
func ParseReply(text string, items []Item, rules Rules) (Document, error) {
	if rules.Mode == ModeNone {
		return Document{}, fmt.Errorf("the %s kind has nothing to decide", rules.Kind)
	}
	d := Document{Schema: Schema, Kind: rules.Kind, Picked: []string{}}
	byN := make(map[int]Item, len(items))
	for _, it := range items {
		byN[it.N] = it
	}
	head, notes := text, ""
	if i := strings.Index(strings.ToLower(text), "notes:"); i >= 0 {
		head, notes = text[:i], text[i+len("notes:"):]
	}
	tokens, err := scan(head)
	if err != nil {
		return Document{}, err
	}
	p := replyParser{rules: rules, items: items, byN: byN, assigned: map[string]string{}, picked: map[string]bool{}}
	for i, tok := range tokens {
		if err := p.take(tok, i == 0); err != nil {
			return Document{}, err
		}
	}
	if p.pending != "" {
		return Document{}, needsNumbers(p.pending)
	}
	p.finish()
	d.Path = p.path
	for _, it := range items {
		if p.picked[it.ID] {
			d.Picked = append(d.Picked, it.ID)
		}
	}
	if len(p.assigned) > 0 {
		d.Verdicts = p.assigned
	}
	if err := parseNotes(notes, byN, rules, &d); err != nil {
		return Document{}, err
	}
	return d, nil
}

type tokenKind int

const (
	tokWord tokenKind = iota
	tokNumbers
	tokGroupEnd
)

type token struct {
	kind   tokenKind
	word   string
	lo, hi int
}

// scan splits the head of a reply into words, numbers or ranges, and group
// ends. Commas, periods, "and", and a leading # on a number are separators.
func scan(s string) ([]token, error) {
	var out []token
	rs := []rune(s)
	for i := 0; i < len(rs); {
		r := rs[i]
		switch {
		case unicode.IsSpace(r) || r == ',' || r == '.' || r == '#':
			i++
		case r == ';':
			out = append(out, token{kind: tokGroupEnd})
			i++
		case unicode.IsDigit(r):
			lo, next := readInt(rs, i)
			hi := lo
			j := skipSpace(rs, next)
			if j < len(rs) && (rs[j] == '-' || rs[j] == '–') {
				k := skipSpace(rs, j+1)
				if k >= len(rs) || !unicode.IsDigit(rs[k]) {
					return nil, fmt.Errorf("the range starting at %d needs an end, such as %d-%d", lo, lo, lo+1)
				}
				hi, next = readInt(rs, k)
				if hi < lo {
					return nil, fmt.Errorf("the range %d-%d runs backwards; write %d-%d", lo, hi, hi, lo)
				}
			}
			out = append(out, token{kind: tokNumbers, lo: lo, hi: hi})
			i = next
		case unicode.IsLetter(r):
			j := i
			for j < len(rs) && (unicode.IsLetter(rs[j]) || rs[j] == '-') {
				j++
			}
			word := strings.ToLower(string(rs[i:j]))
			if word != "and" {
				out = append(out, token{kind: tokWord, word: word})
			}
			i = j
		default:
			return nil, fmt.Errorf("reply has an unexpected %q; before its notes a reply holds only words, numbers, commas, and semicolons", string(r))
		}
	}
	return out, nil
}

func readInt(rs []rune, i int) (int, int) {
	j := i
	for j < len(rs) && unicode.IsDigit(rs[j]) {
		j++
	}
	n, err := strconv.Atoi(string(rs[i:j]))
	if err != nil {
		n = 1 << 30 // out of range for any document; reported as such
	}
	return n, j
}

func skipSpace(rs []rune, i int) int {
	for i < len(rs) && rs[i] == ' ' {
		i++
	}
	return i
}

type replyParser struct {
	rules    Rules
	items    []Item
	byN      map[int]Item
	path     string
	current  string // the group's verdict; empty means the default
	pending  string // a verdict still waiting for its numbers
	rest     bool
	restWith string
	assigned map[string]string
	picked   map[string]bool
}

func (p *replyParser) take(tok token, first bool) error {
	r := p.rules
	switch tok.kind {
	case tokGroupEnd:
		if p.pending != "" {
			return needsNumbers(p.pending)
		}
		p.current = ""
	case tokWord:
		w := tok.word
		if _, ok := r.Option(w); ok {
			if !first {
				return fmt.Errorf("%q answers the choice, so it comes first, as in %q", w, w+", ...")
			}
			p.path = w
			return nil
		}
		switch {
		case r.Mode == ModeVerdict && r.IsVerdict(w):
			if p.pending != "" {
				return needsNumbers(p.pending)
			}
			p.current, p.pending = w, w
		case w == "all" || w == "rest":
			if p.rest {
				return fmt.Errorf("%q appears twice; name the other %s by number", w, r.Plural)
			}
			v, err := p.verdict(w)
			if err != nil {
				return err
			}
			p.rest, p.restWith, p.pending = true, v, ""
		case w == "nothing" || w == "none":
		default:
			return p.unexpected(w)
		}
	case tokNumbers:
		for n := tok.lo; n <= tok.hi; n++ {
			if err := p.number(n); err != nil {
				return err
			}
		}
		p.pending = ""
	}
	return nil
}

func (p *replyParser) verdict(target string) (string, error) {
	r := p.rules
	if r.Mode != ModeVerdict {
		return "", nil
	}
	switch {
	case p.current != "":
		return p.current, nil
	case r.Default != "":
		return r.Default, nil
	}
	return "", fmt.Errorf("%s needs a verdict before it: write %s %s", target, orList(r.verdictIDs()), target)
}

func (p *replyParser) number(n int) error {
	r := p.rules
	it, ok := p.byN[n]
	if !ok {
		return fmt.Errorf("reply names %s %d, but there are %d %s", r.Noun, n, len(p.items), r.Plural)
	}
	if r.Mode == ModePick {
		p.picked[it.ID] = true
		return nil
	}
	v, err := p.verdict(strconv.Itoa(n))
	if err != nil {
		return err
	}
	if !r.CanDecide(it.ID) {
		return fmt.Errorf("%s %d takes no verdict; only %s do", r.Noun, n, r.EligibleText)
	}
	if prev, ok := p.assigned[it.ID]; ok && prev != v {
		return fmt.Errorf("%s %d has two verdicts, %s and %s", r.Noun, n, prev, v)
	}
	p.assigned[it.ID] = v
	return nil
}

// finish gives all or rest to every item not named by number.
func (p *replyParser) finish() {
	if !p.rest {
		return
	}
	for _, it := range p.items {
		switch {
		case p.rules.Mode == ModePick:
			p.picked[it.ID] = true
		case p.rules.CanDecide(it.ID):
			if _, named := p.assigned[it.ID]; !named {
				p.assigned[it.ID] = p.restWith
			}
		}
	}
}

func (p *replyParser) unexpected(w string) error {
	r := p.rules
	var steps []string
	if ids := r.optionIDs(); len(ids) > 0 {
		steps = append(steps, "the choice ("+orList(ids)+")")
	}
	if r.Mode == ModeVerdict {
		steps = append(steps, orList(r.verdictIDs())+" before numbers")
	} else {
		steps = append(steps, "numbers to pick")
	}
	return fmt.Errorf("reply has an unexpected word %q; write %s, then Notes: if any", w, strings.Join(steps, ", then "))
}

func needsNumbers(verdict string) error {
	return fmt.Errorf("%q needs numbers after it, such as %s 1, 2", verdict, verdict)
}

var noteStart = regexp.MustCompile(`(?:^|;)\s*(\d+)\s*:`)

// parseNotes reads "3: text; 5: text." into notes by item id. A semicolon
// starts a new note only when a number and a colon follow it.
func parseNotes(notes string, byN map[int]Item, rules Rules, d *Document) error {
	s := strings.TrimSpace(notes)
	if s == "" {
		return nil
	}
	locs := noteStart.FindAllStringSubmatchIndex(s, -1)
	if len(locs) == 0 || locs[0][0] != 0 {
		return fmt.Errorf("notes must look like %q", "3: text; 5: text")
	}
	for i, loc := range locs {
		end := len(s)
		if i+1 < len(locs) {
			end = locs[i+1][0]
		}
		n, err := strconv.Atoi(s[loc[2]:loc[3]])
		it, ok := byN[n]
		if err != nil || !ok {
			return fmt.Errorf("a note names %s %s, but there are %d %s", rules.Noun, s[loc[2]:loc[3]], len(byN), rules.Plural)
		}
		text := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(s[loc[1]:end]), "."))
		if text == "" {
			return fmt.Errorf("the note on %s %d is empty", rules.Noun, n)
		}
		if d.Notes == nil {
			d.Notes = map[string]string{}
		}
		d.Notes[it.ID] = text
	}
	return nil
}
