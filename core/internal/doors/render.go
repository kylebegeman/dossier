package doors

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"dossier/internal/load"
	"dossier/internal/model"
	"dossier/internal/render"
)

func init() { register("render", renderDoor) }

// RenderResult is dossier.render-result/v1: the artifact without a file.
type RenderResult struct {
	SchemaVersion string `json:"schema_version"`
	Source        string `json:"source"`
	Slug          string `json:"slug"`
	Bytes         int    `json:"bytes"`
	HTML          string `json:"html"`
}

func (r RenderResult) human(w io.Writer) { say(w, "%s", r.HTML) }

// renderDoor renders one model, from a file or from stdin, and answers with
// the HTML instead of writing it. Integrations such as the React wrapper
// call it with --json.
func renderDoor(_ context.Context, args []string, stdin io.Reader) Envelope {
	const id = "render"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	base := fs.String("base", "", "directory that relative figure paths resolve against; default is the model's directory, or the working directory for stdin")
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(files) != 1 {
		return errorEnvelope(id, "usage", fmt.Errorf("render needs exactly one model file, or - for stdin"))
	}
	source := files[0]
	var data []byte
	dir := filepath.Dir(source)
	if source == "-" {
		data, err = io.ReadAll(io.LimitReader(stdin, model.MaxDocumentBytes+1))
		if err == nil && len(data) > model.MaxDocumentBytes {
			err = fmt.Errorf("model exceeds %d bytes", model.MaxDocumentBytes)
		}
		source, dir = "stdin", "."
	} else {
		data, err = os.ReadFile(source)
	}
	if err != nil {
		return errorEnvelope(id, "read", err)
	}
	if *base != "" {
		dir = *base
	}
	l, problems, err := load.Bytes(source, data)
	if err != nil {
		return errorEnvelope(id, "read", err)
	}
	if len(problems) > 0 {
		return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeFindings, Findings: problems, Error: &ErrorBody{Code: "invalid", Message: "model did not validate"}}
	}
	figures, figureWarnings := render.InlineFigures(l.Doc, dir)
	html, err := render.RenderWith(l.Doc, l.Kind, render.Options{Figures: figures})
	if err != nil {
		return errorEnvelope(id, "render", err)
	}
	warnings := append(l.Warnings, load.Prefix(source, figureWarnings)...)
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Warnings: warnings,
		Result: RenderResult{SchemaVersion: "dossier.render-result/v1", Source: source, Slug: l.Doc.Meta.Slug, Bytes: len(html), HTML: string(html)}}
}
