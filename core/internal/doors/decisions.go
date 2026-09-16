package doors

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"dossier/internal/decisions"
	"dossier/internal/load"
	"dossier/internal/model"
)

func init() {
	register("decisions.read", decisionsReadDoor)
	register("decisions.apply", decisionsApplyDoor)
}

// DecisionsResult is dossier.decisions-result/v1.
type DecisionsResult struct {
	SchemaVersion string             `json:"schema_version"`
	Model         string             `json:"model"`
	Written       []string           `json:"written,omitempty"`
	Decisions     decisions.Document `json:"decisions"`
	markdown      []byte
}

func (r DecisionsResult) human(w io.Writer) {
	if len(r.markdown) > 0 {
		_, _ = w.Write(r.markdown)
	}
	for _, p := range r.Written {
		say(w, "wrote %s\n", p)
	}
}

func decisionsReadDoor(_ context.Context, in Input) Envelope {
	args := in.Args
	const id = "decisions.read"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	out := fs.String("out", "", "write the decisions document here (.md or .json)")
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(files) != 1 {
		return errorEnvelope(id, "usage", fmt.Errorf("decisions read needs exactly one model file"))
	}
	l, problems, err := load.File(files[0])
	if err != nil {
		return errorEnvelope(id, "read", err)
	}
	if len(problems) > 0 {
		return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeFindings, Findings: problems, Error: &ErrorBody{Code: "invalid", Message: "model did not validate"}}
	}
	d := decisions.FromModel(l.Doc)
	md, err := decisions.Markdown(d)
	if err != nil {
		return errorEnvelope(id, "render", err)
	}
	result := DecisionsResult{SchemaVersion: "dossier.decisions-result/v1", Model: files[0], Decisions: d, markdown: md}
	if *out != "" {
		data := md
		if strings.EqualFold(filepath.Ext(*out), ".json") {
			data, err = encodeDecisions(d)
			if err != nil {
				return errorEnvelope(id, "render", err)
			}
		}
		if err := os.WriteFile(*out, data, 0o644); err != nil {
			return errorEnvelope(id, "write", err)
		}
		result.Written = append(result.Written, *out)
		result.markdown = nil
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Result: result}
}

func decisionsApplyDoor(_ context.Context, in Input) Envelope {
	args, stdin := in.Args, in.Stdin
	const id = "decisions.apply"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	from := fs.String("from", "", "a decisions document (.md or .json); - reads stdin")
	reply := fs.String("reply", "", "a reply line such as \"rebuild, 1, 3. Notes: 3: keep blue.\"")
	out := fs.String("out", "", "write the updated model here instead of in place")
	decisionsOut := fs.String("decisions", "", "also write the decisions document here (.md or .json)")
	files, err := parseInterspersed(fs, args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(files) != 1 {
		return errorEnvelope(id, "usage", fmt.Errorf("decisions apply needs exactly one model file"))
	}
	if (*from == "") == (*reply == "") {
		return errorEnvelope(id, "usage", fmt.Errorf("give exactly one of --from FILE or --reply TEXT"))
	}
	l, problems, err := load.File(files[0])
	if err != nil {
		return errorEnvelope(id, "read", err)
	}
	if len(problems) > 0 {
		return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeFindings, Findings: problems, Error: &ErrorBody{Code: "invalid", Message: "model did not validate"}}
	}
	var d decisions.Document
	if *reply != "" {
		d, err = decisions.ParseReply(*reply, decisions.Items(l.Doc))
		if err != nil {
			return errorEnvelope(id, "reply", err)
		}
	} else {
		var data []byte
		if *from == "-" {
			data, err = io.ReadAll(io.LimitReader(stdin, model.MaxDocumentBytes))
		} else {
			data, err = os.ReadFile(*from)
		}
		if err != nil {
			return errorEnvelope(id, "read", err)
		}
		d, err = decisions.Parse(data)
		if err != nil {
			return errorEnvelope(id, "parse", err)
		}
	}
	if l.Upgraded && (*out == "" || sameFile(*out, files[0])) {
		return errorEnvelope(id, "legacy", fmt.Errorf("%s is a 0.6 document; run dossier upgrade on it first, or pass --out to write the upgraded model elsewhere", files[0]))
	}
	if problems := decisions.Apply(l.Doc, d); len(problems) > 0 {
		return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeFindings, Findings: load.Prefix("decisions", problems), Error: &ErrorBody{Code: "unknown-items", Message: "decisions name items the model does not have"}}
	}
	target := files[0]
	if *out != "" {
		target = *out
	}
	if err := load.WriteModel(target, l.Doc); err != nil {
		return errorEnvelope(id, "write", err)
	}
	applied := decisions.FromModel(l.Doc)
	result := DecisionsResult{SchemaVersion: "dossier.decisions-result/v1", Model: target, Written: []string{target}, Decisions: applied}
	if *decisionsOut != "" {
		data, err := decisions.Markdown(applied)
		if err != nil {
			return errorEnvelope(id, "render", err)
		}
		if strings.EqualFold(filepath.Ext(*decisionsOut), ".json") {
			data, err = encodeDecisions(applied)
			if err != nil {
				return errorEnvelope(id, "render", err)
			}
		}
		if err := os.WriteFile(*decisionsOut, data, 0o644); err != nil {
			return errorEnvelope(id, "write", err)
		}
		result.Written = append(result.Written, *decisionsOut)
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Result: result}
}

// sameFile reports whether two paths name the same file on disk.
func sameFile(a, b string) bool {
	ai, errA := os.Stat(a)
	bi, errB := os.Stat(b)
	if errA != nil || errB != nil {
		return filepath.Clean(a) == filepath.Clean(b)
	}
	return os.SameFile(ai, bi)
}
