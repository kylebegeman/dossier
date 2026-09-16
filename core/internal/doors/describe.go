package doors

import (
	"context"
	"io"
	"strings"

	"dossier/internal/kinds"
)

func init() { register("describe", describeDoor) }

// DescribeResult is dossier.describe-result/v1: the catalog and the kinds.
type DescribeResult struct {
	SchemaVersion string       `json:"schema_version"`
	Commands      []Command    `json:"commands"`
	Kinds         []kinds.Kind `json:"kinds"`
}

func (r DescribeResult) human(w io.Writer) {
	sayln(w, "Commands")
	for _, c := range r.Commands {
		say(w, "  %-10s %s  [%s]\n", c.ID, c.Summary, strings.Join(c.Surfaces, ", "))
	}
	sayln(w, "\nKinds")
	for _, k := range r.Kinds {
		say(w, "  %-10s %s\n", k.ID, k.Summary)
		if len(k.Items.Facets) > 0 {
			say(w, "             facets: %s", strings.Join(k.Items.Facets, ", "))
			if len(k.Items.Closers) > 0 {
				say(w, "; closers: %s", strings.Join(k.Items.Closers, ", "))
			}
			say(w, "\n")
		}
	}
}

func describeDoor(_ context.Context, _ []string, _ io.Reader) Envelope {
	c, err := LoadCatalog()
	if err != nil {
		return errorEnvelope("describe", "catalog", err)
	}
	all, err := kinds.All()
	if err != nil {
		return errorEnvelope("describe", "kinds", err)
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: "describe", Outcome: OutcomeOK, Result: DescribeResult{SchemaVersion: "dossier.describe-result/v1", Commands: c.Commands, Kinds: all}}
}
