package doors

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"dossier/internal/load"
	"dossier/internal/model"
	"dossier/internal/render"
)

func init() {
	register("build", buildDoor)
	register("validate", validateDoor)
}

// BuildResult is dossier.build-result/v1.
type BuildResult struct {
	SchemaVersion string        `json:"schema_version"`
	Outputs       []BuildOutput `json:"outputs"`
}

// BuildOutput describes one written artifact.
type BuildOutput struct {
	Source string `json:"source"`
	HTML   string `json:"html"`
	Bytes  int    `json:"bytes"`
	Millis int64  `json:"millis"`
}

func (r BuildResult) human(w io.Writer) {
	for _, o := range r.Outputs {
		say(w, "%s  %s  %d bytes  %d ms\n", o.Source, o.HTML, o.Bytes, o.Millis)
	}
}

func buildDoor(_ context.Context, in Input) Envelope {
	args := in.Args
	fs := flag.NewFlagSet("build", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	out := fs.String("out", "", "directory for the HTML output; default is beside each source")
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope("build", "usage", err)
	}
	if len(files) == 0 {
		return errorEnvelope("build", "usage", fmt.Errorf("build needs at least one model file"))
	}
	var result BuildResult
	result.SchemaVersion = "dossier.build-result/v1"
	var findings, warnings []model.Problem
	for _, path := range files {
		started := time.Now()
		l, problems, err := in.loader().File(path)
		if err != nil {
			return errorEnvelope("build", "read", err)
		}
		if len(problems) > 0 {
			findings = append(findings, problems...)
			continue
		}
		warnings = append(warnings, l.Warnings...)
		figures, figureWarnings := render.InlineFigures(l.Doc, filepath.Dir(path))
		warnings = append(warnings, load.Prefix(path, figureWarnings)...)
		html, err := render.RenderWith(l.Doc, l.Kind, render.Options{Figures: figures})
		if err != nil {
			return errorEnvelope("build", "render", fmt.Errorf("%s: %w", path, err))
		}
		target := outputPath(path, *out, l.Doc.Meta.Slug)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return errorEnvelope("build", "write", err)
		}
		if err := os.WriteFile(target, html, 0o644); err != nil {
			return errorEnvelope("build", "write", err)
		}
		result.Outputs = append(result.Outputs, BuildOutput{Source: path, HTML: target, Bytes: len(html), Millis: time.Since(started).Milliseconds()})
	}
	env := Envelope{SchemaVersion: SchemaVersion, Command: "build", Outcome: OutcomeOK, Result: result, Warnings: warnings}
	if len(findings) > 0 {
		env.Outcome = OutcomeFindings
		env.Findings = findings
		env.Error = &ErrorBody{Code: "invalid", Message: fmt.Sprintf("%d model(s) did not validate", countSources(findings))}
	}
	return env
}

func outputPath(source, outDir, slug string) string {
	dir := filepath.Dir(source)
	if outDir != "" {
		dir = outDir
	}
	return filepath.Join(dir, slug+".html")
}

func countSources(problems []model.Problem) int {
	seen := map[string]bool{}
	for _, p := range problems {
		for i, c := range p.Path {
			if c == '#' {
				seen[p.Path[:i]] = true
				break
			}
		}
	}
	return len(seen)
}

// ValidateResult is dossier.validate-result/v1.
type ValidateResult struct {
	SchemaVersion string          `json:"schema_version"`
	Files         []ValidatedFile `json:"files"`
}

// ValidatedFile is one checked model.
type ValidatedFile struct {
	Path string `json:"path"`
	Kind string `json:"kind,omitempty"`
	OK   bool   `json:"ok"`
}

func (r ValidateResult) human(w io.Writer) {
	for _, f := range r.Files {
		say(w, "ok  %s  (%s)\n", f.Path, f.Kind)
	}
}

func validateDoor(_ context.Context, in Input) Envelope {
	args := in.Args
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope("validate", "usage", err)
	}
	if len(files) == 0 {
		return errorEnvelope("validate", "usage", fmt.Errorf("validate needs at least one model file"))
	}
	result := ValidateResult{SchemaVersion: "dossier.validate-result/v1"}
	var findings, warnings []model.Problem
	for _, path := range files {
		l, problems, err := in.loader().File(path)
		if err != nil {
			return errorEnvelope("validate", "read", err)
		}
		if len(problems) > 0 {
			findings = append(findings, problems...)
			result.Files = append(result.Files, ValidatedFile{Path: path, OK: false})
			continue
		}
		warnings = append(warnings, l.Warnings...)
		result.Files = append(result.Files, ValidatedFile{Path: path, Kind: l.Kind.ID, OK: true})
	}
	env := Envelope{SchemaVersion: SchemaVersion, Command: "validate", Outcome: OutcomeOK, Result: result, Warnings: warnings}
	if len(findings) > 0 {
		env.Outcome = OutcomeFindings
		env.Findings = findings
		env.Error = &ErrorBody{Code: "invalid", Message: fmt.Sprintf("%d model(s) did not validate", countSources(findings))}
	}
	return env
}
