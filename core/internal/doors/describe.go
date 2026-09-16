package doors

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strings"

	"dossier/internal/kinds"
)

func init() { register("describe", describeDoor) }

// DescribeResult is dossier.describe-result/v1: the catalog and the kinds.
type DescribeResult struct {
	SchemaVersion string          `json:"schema_version"`
	Version       string          `json:"version"`
	Commands      []Command       `json:"commands"`
	Kinds         []DescribedKind `json:"kinds"`
}

// DescribedKind is a kind with where it came from: built-in, or the path of
// its custom kind file.
type DescribedKind struct {
	kinds.Kind
	Source string `json:"source"`
}

func (r DescribeResult) human(w io.Writer) {
	say(w, "dossier %s\n\n", r.Version)
	sayln(w, "Commands")
	for _, c := range r.Commands {
		say(w, "  %-10s %s  [%s]\n", c.ID, c.Summary, strings.Join(c.Surfaces, ", "))
	}
	sayln(w, "\nKinds")
	for _, k := range r.Kinds {
		say(w, "  %-10s %s\n", k.ID, k.Summary)
		if k.Source != kinds.BuiltinSource {
			say(w, "             from %s\n", k.Source)
		}
		say(w, "             %s\n", itemLine(k.Kind))
		if fields := fieldList(k.Kind); fields != "" {
			say(w, "             fields: %s\n", fields)
		}
		say(w, "             facets: %s\n", facetList(k.Kind))
	}
}

func describeDoor(_ context.Context, in Input) Envelope {
	c, err := LoadCatalog()
	if err != nil {
		return errorEnvelope("describe", "catalog", err)
	}
	reg := in.kindRegistry()
	var described []DescribedKind
	for _, k := range reg.All() {
		described = append(described, DescribedKind{Kind: k, Source: reg.Source(k.ID)})
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: "describe", Outcome: OutcomeOK, Result: DescribeResult{SchemaVersion: "dossier.describe-result/v1", Version: Version, Commands: c.Commands, Kinds: described}}
}

// itemLine says what a kind's items are and how the reader decides.
func itemLine(k kinds.Kind) string {
	numbered := "unnumbered"
	if k.Item.Numbered {
		numbered = "numbered"
	}
	decide := "nothing to decide"
	switch k.Decision.Mode {
	case kinds.ModePick:
		decide = "pick by number"
	case kinds.ModeVerdict:
		var ids []string
		for _, v := range k.Decision.Verdicts {
			ids = append(ids, v.ID)
		}
		decide = "verdicts " + strings.Join(ids, ", ")
		if k.Decision.Default != "" {
			decide += " (bare numbers mean " + k.Decision.Default + ")"
		}
		fields := make([]string, 0, len(k.Decision.When))
		for field := range k.Decision.When {
			fields = append(fields, field)
		}
		sort.Strings(fields)
		for _, field := range fields {
			decide += ", only where " + field + " is " + strings.Join(k.Decision.When[field], " or ")
		}
	}
	if c := k.Decision.Choice; c != nil {
		var ids []string
		for _, o := range c.Options {
			ids = append(ids, o.ID)
		}
		decide += "; choice " + strings.Join(ids, " or ")
	}
	return k.Item.Plural + ", " + numbered + "; " + decide
}

// fieldList names a kind's fields with their vocabularies.
func fieldList(k kinds.Kind) string {
	var parts []string
	for _, name := range kinds.FieldNames {
		if !k.HasField(name) {
			continue
		}
		label := name
		if name != "impact" && k.Field(name) != nil && k.Field(name).Label != "" {
			label += " shown as " + k.Field(name).Label
		}
		switch {
		case name == "impact":
			label += fmt.Sprintf(" (%d-%d)", k.Fields.Impact.Min, k.Fields.Impact.Max)
		case k.Field(name) != nil && len(k.Field(name).Values) > 0:
			label += " (" + strings.Join(k.Field(name).Values, ", ") + ")"
		case k.Field(name) != nil && k.Field(name).Text:
			label += " (text)"
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, ", ")
}

// facetList names a kind's facets in order, marking required ones.
func facetList(k kinds.Kind) string {
	var parts []string
	for _, f := range k.Facets {
		label := f.Label
		if f.Required {
			label += "*"
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, ", ")
}
