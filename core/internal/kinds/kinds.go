// Package kinds loads kind presets and applies their rules to a document. A
// kind names the facets an item carries, the ranges its fields allow, what the
// summary table shows, how the contents group items, and what the pick block
// says.
package kinds

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"dossier/internal/model"
)

//go:embed presets/*.json
var presets embed.FS

// Kind is one preset.
type Kind struct {
	ID           string       `json:"id"`
	Title        string       `json:"title"`
	Summary      string       `json:"summary"`
	Items        ItemRules    `json:"items"`
	SummaryTable SummaryTable `json:"summary_table"`
	Contents     Contents     `json:"contents"`
	Pick         Pick         `json:"pick"`
}

// ItemRules constrain items in a board.
type ItemRules struct {
	Numbered   bool     `json:"numbered"`
	Size       []string `json:"size,omitempty"`
	Effort     []string `json:"effort,omitempty"`
	Impact     *Range   `json:"impact,omitempty"`
	Facets     []string `json:"facets,omitempty"`
	Closers    []string `json:"closers,omitempty"`
	RiskFacets []string `json:"riskFacets,omitempty"`
}

// Range is an inclusive integer range.
type Range struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// SummaryTable says which item fields the generated table shows.
type SummaryTable struct {
	Columns []string `json:"columns,omitempty"`
	Legend  string   `json:"legend,omitempty"`
}

// Contents says how items group in the contents column.
type Contents struct {
	GroupBy string `json:"groupBy,omitempty"`
}

// Pick is the closing block that tells the reader how to reply.
type Pick struct {
	Title    string `json:"title"`
	Markdown string `json:"markdown"`
}

// All returns every embedded preset, sorted by id.
func All() ([]Kind, error) {
	entries, err := fs.ReadDir(presets, "presets")
	if err != nil {
		return nil, err
	}
	var out []Kind
	for _, e := range entries {
		k, err := load("presets/" + e.Name())
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Load returns the preset with the given id.
func Load(id string) (Kind, error) {
	k, err := load("presets/" + id + ".json")
	if err != nil {
		return Kind{}, fmt.Errorf("unknown kind %q", id)
	}
	return k, nil
}

func load(path string) (Kind, error) {
	data, err := presets.ReadFile(path)
	if err != nil {
		return Kind{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var k Kind
	if err := dec.Decode(&k); err != nil {
		return Kind{}, fmt.Errorf("%s: %w", path, err)
	}
	if k.ID == "" {
		return Kind{}, fmt.Errorf("%s: id is required", path)
	}
	return k, nil
}

// IsRisk reports whether a facet label renders with the risk color.
func (k Kind) IsRisk(label string) bool {
	for _, r := range k.Items.RiskFacets {
		if strings.EqualFold(r, label) {
			return true
		}
	}
	return false
}

// Check applies the kind's rules to every board item.
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
			if len(k.Items.Size) > 0 && it.Size != "" && !has(k.Items.Size, it.Size) {
				add(ip+"/size", "must be one of %s", strings.Join(k.Items.Size, ", "))
			}
			if len(k.Items.Effort) > 0 && it.Effort != "" && !has(k.Items.Effort, it.Effort) {
				add(ip+"/effort", "must be one of %s", strings.Join(k.Items.Effort, ", "))
			}
			if k.Items.Impact != nil && it.Impact != 0 && (it.Impact < k.Items.Impact.Min || it.Impact > k.Items.Impact.Max) {
				add(ip+"/impact", "must be between %d and %d", k.Items.Impact.Min, k.Items.Impact.Max)
			}
			if len(k.Items.Facets) > 0 {
				checkFacets(ip, k, it, add)
			}
		}
	}
	return out
}

// checkFacets enforces the fixed order: required facets first, in the kind's
// order, then any closers, then nothing else.
func checkFacets(path string, k Kind, it model.Item, add func(string, string, ...any)) {
	if len(it.Facets) == 0 {
		add(path+"/facets", "the %s kind requires facets %s", k.ID, strings.Join(k.Items.Facets, ", "))
		return
	}
	want := k.Items.Facets
	i := 0
	for fi, f := range it.Facets {
		fp := fmt.Sprintf("%s/facets/%d/label", path, fi)
		if i < len(want) {
			if !strings.EqualFold(f.Label, want[i]) {
				add(fp, "expected %q here; facets keep the order %s", want[i], strings.Join(want, ", "))
				return
			}
			i++
			continue
		}
		if !has(k.Items.Closers, f.Label) {
			add(fp, "%q is not a facet of the %s kind; closers are %s", f.Label, k.ID, strings.Join(k.Items.Closers, ", "))
		}
	}
	if i < len(want) {
		add(path+"/facets", "missing facet %q", want[i])
	}
}

func has(list []string, v string) bool {
	for _, x := range list {
		if strings.EqualFold(x, v) {
			return true
		}
	}
	return false
}
