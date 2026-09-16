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
)

func init() { register("upgrade", upgradeDoor) }

// UpgradeResult is dossier.upgrade-result/v1.
type UpgradeResult struct {
	SchemaVersion string         `json:"schema_version"`
	Files         []UpgradedFile `json:"files"`
}

// UpgradedFile is one model the door looked at.
type UpgradedFile struct {
	Source   string `json:"source"`
	Model    string `json:"model,omitempty"`
	Upgraded bool   `json:"upgraded"`
}

func (r UpgradeResult) human(w io.Writer) {
	for _, f := range r.Files {
		if f.Upgraded {
			say(w, "upgraded  %s  ->  %s\n", f.Source, f.Model)
		} else {
			say(w, "already 0.7  %s\n", f.Source)
		}
	}
}

// upgradeDoor writes 0.6 documents as 0.7 models: the alias pass made
// permanent. Files already on 0.7 are left alone.
func upgradeDoor(_ context.Context, in Input) Envelope {
	args := in.Args
	const id = "upgrade"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	out := fs.String("out", "", "directory for the upgraded models; default replaces each source")
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(files) == 0 {
		return errorEnvelope(id, "usage", fmt.Errorf("upgrade needs at least one model file"))
	}
	result := UpgradeResult{SchemaVersion: "dossier.upgrade-result/v1"}
	var findings, warnings []model.Problem
	for _, path := range files {
		l, problems, err := load.File(path)
		if err != nil {
			return errorEnvelope(id, "read", err)
		}
		if len(problems) > 0 {
			findings = append(findings, problems...)
			continue
		}
		if !l.Upgraded {
			result.Files = append(result.Files, UpgradedFile{Source: path})
			continue
		}
		// Written, the model is read as 0.7, strictly. A document that does not
		// fit its kind yet is reported instead of written.
		if _, problems, err := load.Check(path, l.Doc); err != nil || len(problems) > 0 {
			if err != nil {
				return errorEnvelope(id, "verify", err)
			}
			findings = append(findings, problems...)
			continue
		}
		warnings = append(warnings, l.Warnings...)
		target := path
		if *out != "" {
			if err := os.MkdirAll(*out, 0o755); err != nil {
				return errorEnvelope(id, "write", err)
			}
			target = filepath.Join(*out, filepath.Base(path))
		}
		if err := load.WriteModel(target, l.Doc); err != nil {
			return errorEnvelope(id, "write", err)
		}
		if _, problems, err := load.File(target); err != nil || len(problems) > 0 {
			return errorEnvelope(id, "verify", fmt.Errorf("%s does not read back cleanly: %v %v", target, err, problems))
		}
		result.Files = append(result.Files, UpgradedFile{Source: path, Model: target, Upgraded: true})
	}
	env := Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Result: result, Warnings: warnings}
	if len(findings) > 0 {
		env.Outcome = OutcomeFindings
		env.Findings = findings
		env.Error = &ErrorBody{Code: "invalid", Message: fmt.Sprintf("%d model(s) did not validate", countSources(findings))}
	}
	return env
}
